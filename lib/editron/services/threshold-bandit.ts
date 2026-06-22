/**
 * Threshold Bandit — Thompson Sampling on editing thresholds.
 *
 * Extends the TRIBE architecture to calibrate the 35 adaptive thresholds
 * from the threshold registry. Same Normal-Normal conjugate algorithm as
 * genre-parameter-bandit.ts, but with:
 *   - Decision-level feedback (kept/modified/removed) not project-level
 *   - Informed priors from threshold-registry.ts (CRG-grounded = tight, INVENTED = wide)
 *   - Per-(threshold, context) arms
 *
 * Flow:
 *   Director → snapshotDecisions → user edits → diffOutcomes → updateThresholdBandit
 *   → next project: sampleThresholdAdjustments → adjusted routing/prompt thresholds
 *
 * Falls back to registry values (zero adjustment) when < 10 decision outcomes.
 */

import {
  THRESHOLD_REGISTRY,
  getAdaptiveThresholds,
  type ThresholdEntry,
} from '../data/threshold-registry';
import type { DecisionOutcome } from './decision-tracker';
import {
  averageSignalValue,
  buildContextKey,
  buildDurationBucket,
  buildSignalBucket,
  buildSpeechCoverageBucket,
  type BanditContext,
} from './genre-parameter-bandit';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ThresholdArm {
  thresholdId: string;
  mu: number;
  precision: number;
  observations: number;
}

export interface ThresholdBanditState {
  userId: string;
  arms: Map<string, ThresholdArm>;
  totalOutcomes: number;
  lastUpdated: number;
}

export interface ThresholdAdjustments {
  values: Map<string, number>;
  usedBandit: boolean;
  observationCount: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// ⚠️ INVENTED — genre bandit uses 5 projects; decisions are finer-grained, need more data.
const MIN_DECISIONS_FOR_ACTIVATION = 10;

// Same as genre bandit (validated constant)
const OBSERVATION_PRECISION = 0.5;

const OUTCOME_REWARD: Record<string, number> = {
  kept: 1.0,
  modified: 0.5,
  removed: 0.0,
};

// ─── State Management ───────────────────────────────────────────────────────

export function createThresholdBanditState(userId: string): ThresholdBanditState {
  return {
    userId,
    arms: new Map(),
    totalOutcomes: 0,
    lastUpdated: Date.now(),
  };
}

function getArmKey(thresholdId: string, contextKey: string): string {
  return `t:${thresholdId}:${contextKey}`;
}

function getOrCreateArm(
  state: ThresholdBanditState,
  thresholdId: string,
  contextKey: string,
): ThresholdArm {
  const key = getArmKey(thresholdId, contextKey);
  let arm = state.arms.get(key);
  if (!arm) {
    const entry = THRESHOLD_REGISTRY.find(t => t.id === thresholdId);
    const priorPrecision = entry ? 1 / (entry.prior.sigma * entry.prior.sigma) : 1.0;
    arm = { thresholdId, mu: 0, precision: priorPrecision, observations: 0 };
    state.arms.set(key, arm);
  }
  return arm;
}

// ─── Sampling ───────────────────────────────────────────────────────────────

function sampleNormal(mu: number, precision: number): number {
  const sigma = 1 / Math.sqrt(precision);
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

/**
 * Sample threshold adjustments for a given context.
 *
 * Returns a Map<thresholdId, effectiveValue> where effectiveValue =
 * registry_value + sampled_adjustment. CRG-grounded thresholds get
 * tiny adjustments (tight prior). INVENTED get large explorations.
 *
 * Returns registry defaults when < MIN_DECISIONS_FOR_ACTIVATION outcomes.
 */
export function sampleThresholdAdjustments(
  state: ThresholdBanditState,
  context: BanditContext,
): ThresholdAdjustments {
  const adaptive = getAdaptiveThresholds();
  const values = new Map<string, number>();

  if (state.totalOutcomes < MIN_DECISIONS_FOR_ACTIVATION) {
    for (const entry of adaptive) {
      values.set(entry.id, entry.value);
    }
    return { values, usedBandit: false, observationCount: 0 };
  }

  const contextKey = buildContextKey(context);
  let totalObs = 0;

  for (const entry of adaptive) {
    const arm = getOrCreateArm(state, entry.id, contextKey);
    const adjustment = sampleNormal(arm.mu, arm.precision);
    const clamped = clampAdjustment(adjustment, entry);
    values.set(entry.id, entry.value + clamped);
    totalObs += arm.observations;
  }

  return {
    values,
    usedBandit: true,
    observationCount: Math.round(totalObs / Math.max(adaptive.length, 1)),
  };
}

function clampAdjustment(adjustment: number, entry: ThresholdEntry): number {
  const maxAdj = entry.prior.sigma * 2;
  return Math.max(-maxAdj, Math.min(maxAdj, adjustment));
}

/**
 * Get effective threshold value. Convenience for single lookups.
 */
export function getEffectiveThreshold(
  thresholds: ThresholdAdjustments,
  id: string,
): number {
  const value = thresholds.values.get(id);
  if (value !== undefined) return value;
  const entry = THRESHOLD_REGISTRY.find(t => t.id === id);
  return entry?.value ?? 0;
}

// ─── Update ─────────────────────────────────────────────────────────────────

/**
 * Update bandit state from decision outcomes.
 *
 * For each outcome, identifies which thresholds were involved (via the
 * decision's reason/technique) and updates those arms.
 *
 * Normal-Normal conjugate update:
 *   - Reward centered at 0.5: positive reinforces current threshold, negative penalizes
 *   - Posterior: precision_new = precision_old + obs_precision
 *               mu_new = (precision_old * mu_old + obs_precision * observation) / precision_new
 */
export function updateThresholdBandit(
  state: ThresholdBanditState,
  outcomes: DecisionOutcome[],
  context: BanditContext,
): void {
  const contextKey = buildContextKey(context);

  for (const outcome of outcomes) {
    const reward = OUTCOME_REWARD[outcome.outcome] ?? 0.5;
    const rewardSign = (reward - 0.5) * 2;

    const relatedThresholds = findRelatedThresholds(outcome);

    for (const thresholdId of relatedThresholds) {
      const arm = getOrCreateArm(state, thresholdId, contextKey);
      // ⚠️ INVENTED — 0.1 dampening factor. Intentional: unlike genre bandit which observes
      // actual adjustment magnitudes, threshold bandit has binary signal (kept/removed).
      // Without dampening, single observations shift mu too aggressively for ratio thresholds
      // (0.3-0.7 range). Many observations needed before threshold meaningfully shifts.
      // Needs calibration: too high = overfits to early decisions, too low = never learns.
      const effectiveObservation = rewardSign * 0.1;
      const newPrecision = arm.precision + OBSERVATION_PRECISION;
      const newMu = (arm.precision * arm.mu + OBSERVATION_PRECISION * effectiveObservation) / newPrecision;

      arm.mu = newMu;
      arm.precision = newPrecision;
      arm.observations += 1;
    }

    state.totalOutcomes += 1;
  }

  state.lastUpdated = Date.now();
}

// ─── Threshold-Decision Mapping ─────────────────────────────────────────────

// Maps decision reasons to the thresholds that GATE them.
// Logic: if threshold X controls whether mode Y activates, and reason Z only
// appears in mode Y's decisions, then outcome feedback for reason Z should
// update threshold X's bandit arm.
//
// CRG chain verification:
//   music_beat/drop/section → CRG signal:audio.music_beat/music_section → music mode
//     → gated by music-presence-threshold (0.6, CRG montage_mode) + min-beat-density-bpm
//   visual_peak/motion_peak → CRG signal:visual.motion_intensity → visual mode
//     → gated by visual-change-threshold (0.3) + motion-intensity-density-threshold (0.7, CRG)
//   energy_peak/vocal_* → CRG signal:speech.energy → speech mode
//     → gated by speech-coverage-threshold (0.6)
//   beat_accent → INVENTED signal from music_beat downbeats → music mode
//   visual_monotony → anti-monotony in visual mode → gated by visual-change-threshold
const REASON_TO_THRESHOLDS: Record<string, string[]> = {
  music_beat: ['music-presence-threshold', 'min-beat-density-bpm'],
  music_drop: ['music-presence-threshold'],
  music_section_change: ['music-presence-threshold'],
  beat_accent: ['music-presence-threshold', 'min-beat-density-bpm'],
  visual_peak: ['visual-change-threshold', 'low-motion-visual-threshold'],
  motion_peak: ['visual-change-threshold', 'motion-intensity-density-threshold'],
  energy_peak: ['speech-coverage-threshold'],
  vocal_build: ['speech-coverage-threshold'],
  vocal_emphasis: ['speech-coverage-threshold'],
  visual_monotony: ['visual-change-threshold'],
};

function findRelatedThresholds(outcome: DecisionOutcome): string[] {
  return REASON_TO_THRESHOLDS[outcome.reason] ?? [];
}

// ─── Serialization ──────────────────────────────────────────────────────────

export function serializeThresholdBanditState(state: ThresholdBanditState): string {
  return JSON.stringify({
    userId: state.userId,
    arms: Array.from(state.arms.entries()),
    totalOutcomes: state.totalOutcomes,
    lastUpdated: state.lastUpdated,
  });
}

export function deserializeThresholdBanditState(json: string): ThresholdBanditState {
  const data = JSON.parse(json);
  return {
    userId: data.userId,
    arms: new Map(data.arms),
    totalOutcomes: data.totalOutcomes,
    lastUpdated: data.lastUpdated,
  };
}

// ─── MongoDB Persistence ────────────────────────────────────────────────────

const COLLECTION = 'threshold_bandit_states';

export async function loadThresholdBanditState(userId: string): Promise<ThresholdBanditState | null> {
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const doc = await db.collection(COLLECTION).findOne({ userId });
    if (!doc) return null;
    return {
      userId: doc.userId,
      arms: new Map(doc.arms || []),
      totalOutcomes: doc.totalOutcomes || 0,
      lastUpdated: doc.lastUpdated || 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ThresholdBandit] Failed to load state for ${userId}: ${msg}`);
    return null;
  }
}

export async function saveThresholdBanditState(state: ThresholdBanditState): Promise<void> {
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    await db.collection(COLLECTION).updateOne(
      { userId: state.userId },
      {
        $set: {
          arms: Array.from(state.arms.entries()),
          totalOutcomes: state.totalOutcomes,
          lastUpdated: state.lastUpdated,
          updatedAt: new Date(),
        },
        $setOnInsert: { userId: state.userId, createdAt: new Date() },
      },
      { upsert: true },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ThresholdBandit] Failed to save state for ${state.userId}: ${msg}`);
  }
}

// ─── Outcome Processing (called from render route) ──────────────────────────

/**
 * Process decision outcomes for a project: load snapshot, diff against
 * current overlays, update bandit, save state.
 *
 * Called asynchronously from the render route — never blocks rendering.
 * Entirely non-fatal: if anything fails, logs and returns.
 */
export async function processDecisionOutcomes(
  projectId: string,
  userId: string,
  currentOverlays: { id: string; from: number; durationInFrames: number; type?: string }[],
): Promise<void> {
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const { diffOutcomes, aggregateOutcomes } = await import('./decision-tracker');

    const db = await getDatabase();
    const projectDoc = await db.collection('projects').findOne({ projectId });

    const decisionLog = projectDoc?.intelligence?.decisionLog;
    if (!decisionLog?.snapshots?.length) {
      return;
    }

    const outcomes = diffOutcomes(decisionLog, currentOverlays);
    if (outcomes.length === 0) return;

    const stats = aggregateOutcomes(outcomes);
    console.log(
      `[ThresholdBandit] ${projectId}: ${stats.kept} kept, ${stats.modified} modified, ` +
      `${stats.removed} removed (keepRate=${stats.keepRate.toFixed(2)})`,
    );

    let state = await loadThresholdBanditState(userId);
    if (!state) state = createThresholdBanditState(userId);

    const durationSec = (decisionLog.totalDurationMs || 60000) / 1000;
    const speechCoverage = projectDoc?.rawFootageAnalysis?.speechCoverage ?? 0;
    const context: BanditContext = {
      signalBucket: buildSignalBucket({
        speechCoverage,
        speechEnergy: averageSignalValue(projectDoc?.wav2vecAnalysis?.segments, 'energy'),
        motionIntensity: averageSignalValue(projectDoc?.vjepaAnalysis?.segments, 'motionIntensity'),
        visualSignificance: averageSignalValue(projectDoc?.vjepaAnalysis?.segments, 'visualSignificance'),
        musicEnergy: averageSignalValue(projectDoc?.musicAnalysis?.energyCurve, 'energy'),
        beatStrength: projectDoc?.musicAnalysis?.musicPresence,
      }),
      speechCoverageBucket: buildSpeechCoverageBucket(speechCoverage),
      durationBucket: buildDurationBucket(durationSec),
      platform: projectDoc?.syntheticStoryboard?.platform || 'youtube',
    };

    updateThresholdBandit(state, outcomes, context);
    await saveThresholdBanditState(state);

    console.log(
      `[ThresholdBandit] Updated bandit for ${userId}: ${state.totalOutcomes} total outcomes, ` +
      `${state.arms.size} arms`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ThresholdBandit] processDecisionOutcomes failed for ${projectId}: ${msg}`);
  }
}
