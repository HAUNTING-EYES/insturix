/**
 * Genre Parameter Bandit — Thompson Sampling for Signal-Driven Editing (TRIBE §1C adapted)
 *
 * Learns ADJUSTMENTS to the 9 genre parameter dials per user/brand/context.
 * Does NOT replace signal computation — augments it with learned preferences.
 *
 * Architecture: signal-driven, NOT profile-driven.
 *   - genre-parameter-computer.ts computes 9 dials from signals (content-driven)
 *   - This service learns per-context adjustments from project outcomes
 *   - Adjustment = what the user actually preferred vs what signals computed
 *
 * Algorithm: Gaussian Thompson Sampling per (dial, context) pair.
 *   - Each arm maintains N(mu, 1/precision) for the adjustment value
 *   - mu = learned mean adjustment (starts at 0 = trust signal computation)
 *   - precision = confidence (starts low = high uncertainty)
 *   - Sample adjustment from N(mu, 1/precision), clamp to dial range
 *   - Update via Normal-Normal conjugate posterior after observing reward
 *
 * Context vector: signal bucket, speech coverage bucket, duration bucket, platform.
 * Reward: 0.7 * quality_normalized + 0.2 * rendered + 0.1 * published.
 *
 * Falls back to zero adjustment (pure signal computation) when < 5 projects.
 * ← TRIBE §1C (adapted from profile-based to signal-based per Mode 2 architecture)
 */

import type { GenreParameters } from './graph-query';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DialName = keyof GenreParameters;

export type BanditSignalBucket =
  | 'quiet'
  | 'speech-led'
  | 'visual-led'
  | 'audio-rhythm'
  | 'mixed';

export interface BanditSignalBucketInput {
  speechCoverage?: unknown;
  speechEnergy?: unknown;
  motionIntensity?: unknown;
  visualSignificance?: unknown;
  musicEnergy?: unknown;
  beatStrength?: unknown;
}

export interface BanditContext {
  signalBucket: BanditSignalBucket;
  speechCoverageBucket: 'silent' | 'low' | 'medium' | 'high';
  durationBucket: 'short' | 'medium' | 'long';
  platform: string;
}

export interface DialArm {
  dial: DialName;
  mu: number;          // mean adjustment (0 = no change from signal-computed)
  precision: number;   // 1/variance — higher = more confident
  observations: number;
}

export interface BanditState {
  userId: string;
  arms: Map<string, DialArm>;  // key = dial:contextKey
  totalProjects: number;
  lastUpdated: number;
}

export interface ProjectOutcome {
  genreParamsUsed: GenreParameters;
  genreParamsSignalComputed: GenreParameters;
  context: BanditContext;
  qualityScore: number;
  userRendered: boolean;
  userPublished: boolean;
}

export type BanditOutcomeEvidenceSource =
  | 'rendered-aesthetic'
  | 'rendered-artifact'
  | 'manual-review'
  | 'user-published'
  | 'metadata-only'
  | 'unknown';

export interface BanditOutcomeWriteOptions {
  evidenceSource?: unknown;
  renderedAestheticStatus?: unknown;
}

export interface BanditOutcomeWritePolicyInput extends BanditOutcomeWriteOptions {
  userRendered?: boolean;
  userPublished?: boolean;
}

export interface BanditOutcomeWritePolicyDecision {
  allowed: boolean;
  reason: 'rendered_evidence_passed' | 'user_published' | 'missing_rendered_quality_evidence' | 'rendered_evidence_not_pass';
  evidenceSource: BanditOutcomeEvidenceSource;
  renderedAestheticStatus: string | null;
}

export interface BanditOutcomeRecordResult {
  recorded: boolean;
  reason?: BanditOutcomeWritePolicyDecision['reason'] | 'missing_genre_parameters' | 'error';
  reward?: number;
}

export interface BanditAdjustments {
  adjustments: Partial<GenreParameters>;
  confidence: 'high' | 'medium' | 'low';
  usedBandit: boolean;
  observationCount: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// ← TRIBE §1C line 73: "falls back to keyword detection when <5 projects"
const MIN_PROJECTS_FOR_BANDIT = 5;

// ← Standard uninformative Normal prior: N(0, 1/precision)
// Low precision = high variance = explore widely at first
const PRIOR_MU = 0;
const PRIOR_PRECISION = 1.0;

// ← Moderate learning rate. Higher = adjust faster but risk overfitting.
// 0.5 means each observation contributes ~1/3 as much as the prior initially,
// growing influence as observations accumulate.
const OBSERVATION_PRECISION = 0.5;

// ← Same reward weights as quality-review alignment
const REWARD_WEIGHT_QUALITY = 0.7;
const REWARD_WEIGHT_RENDERED = 0.2;
const REWARD_WEIGHT_PUBLISHED = 0.1;

// ← Dial ranges from genre-parameter-computer.ts clamp() calls
const DIAL_RANGES: Record<DialName, { min: number; max: number; maxAdj: number }> = {
  pacing_tolerance:    { min: 2,    max: 15,   maxAdj: 3 },
  energy_baseline:     { min: 0.2,  max: 0.8,  maxAdj: 0.15 },
  transition_density:  { min: 2,    max: 25,   maxAdj: 5 },
  graphic_density:     { min: 0,    max: 8,    maxAdj: 2 },
  silence_tolerance:   { min: 0.3,  max: 5.0,  maxAdj: 1.0 },
  zoom_budget:         { min: 1,    max: 15,   maxAdj: 3 },
  sfx_density:         { min: 0,    max: 1,    maxAdj: 0.2 },
  color_temperature:   { min: 3000, max: 8000, maxAdj: 1000 },
  formality:           { min: 0,    max: 1,    maxAdj: 0.2 },
};

const ALL_DIALS: DialName[] = Object.keys(DIAL_RANGES) as DialName[];

// ─── Context Key ────────────────────────────────────────────────────────────

export function buildContextKey(ctx: BanditContext): string {
  return `${ctx.signalBucket}:${ctx.speechCoverageBucket}:${ctx.durationBucket}:${ctx.platform || 'any'}`;
}

export function buildDurationBucket(durationSec: number): BanditContext['durationBucket'] {
  if (durationSec < 60) return 'short';
  if (durationSec <= 300) return 'medium';
  return 'long';
}

export function buildSpeechCoverageBucket(coverage: number): BanditContext['speechCoverageBucket'] {
  if (coverage < 0.05) return 'silent';
  if (coverage < 0.3) return 'low';
  if (coverage < 0.7) return 'medium';
  return 'high';
}

export function buildSignalBucket(input: BanditSignalBucketInput): BanditSignalBucket {
  const speech = maxSignal(input.speechCoverage, input.speechEnergy);
  const visual = maxSignal(input.motionIntensity, input.visualSignificance);
  const audio = maxSignal(input.musicEnergy, input.beatStrength);

  if (speech < 0.05 && visual < 0.2 && audio < 0.2) return 'quiet';
  if (audio >= 0.62 && audio >= speech && audio >= visual) return 'audio-rhythm';
  if (visual >= 0.55 && visual > speech + 0.1) return 'visual-led';
  if (speech >= 0.55 && speech >= visual && speech >= audio - 0.1) return 'speech-led';
  return 'mixed';
}

export function averageSignalValue(items: unknown, key: string): number | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined;

  let total = 0;
  let count = 0;
  for (const item of items) {
    const value = readNumericProperty(item, key);
    if (value === undefined) continue;
    total += value;
    count += 1;
  }

  return count > 0 ? total / count : undefined;
}

function maxSignal(...values: unknown[]): number {
  return Math.max(0, ...values.map(clampSignal));
}

function clampSignal(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function readNumericProperty(item: unknown, key: string): number | undefined {
  if (typeof item === 'number' && Number.isFinite(item)) return item;
  if (!item || typeof item !== 'object') return undefined;
  const value = (item as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// ─── Gaussian Sampling ─────────────────────────────────────────────────────

function sampleNormal(mu: number, precision: number): number {
  const sigma = 1 / Math.sqrt(precision);
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

// ─── Reward Computation ─────────────────────────────────────────────────────

export function computeReward(outcome: ProjectOutcome): number {
  const qualityNorm = Math.min(1, Math.max(0, outcome.qualityScore / 100));
  const rendered = outcome.userRendered ? 1 : 0;
  const published = outcome.userPublished ? 1 : 0;

  return (
    REWARD_WEIGHT_QUALITY * qualityNorm +
    REWARD_WEIGHT_RENDERED * rendered +
    REWARD_WEIGHT_PUBLISHED * published
  );
}

// Live learning write policy: bandit writes require rendered evidence or explicit publish acceptance.

export function resolveBanditOutcomeWritePolicy(
  input: BanditOutcomeWritePolicyInput,
): BanditOutcomeWritePolicyDecision {
  const evidenceSource = normalizeBanditOutcomeEvidenceSource(input.evidenceSource);
  const renderedAestheticStatus = normalizeRenderedAestheticStatus(input.renderedAestheticStatus);

  if (input.userPublished === true) {
    return {
      allowed: true,
      reason: 'user_published',
      evidenceSource: 'user-published',
      renderedAestheticStatus,
    };
  }

  if (isRenderedEvidenceSource(evidenceSource) && renderedAestheticStatus === 'pass') {
    return {
      allowed: true,
      reason: 'rendered_evidence_passed',
      evidenceSource,
      renderedAestheticStatus,
    };
  }

  if (isRenderedEvidenceSource(evidenceSource)) {
    return {
      allowed: false,
      reason: 'rendered_evidence_not_pass',
      evidenceSource,
      renderedAestheticStatus,
    };
  }

  return {
    allowed: false,
    reason: 'missing_rendered_quality_evidence',
    evidenceSource,
    renderedAestheticStatus,
  };
}

function normalizeBanditOutcomeEvidenceSource(value: unknown): BanditOutcomeEvidenceSource {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (
    normalized === 'rendered-aesthetic' ||
    normalized === 'phase0-rendered-aesthetic' ||
    normalized === 'rendered-quality' ||
    normalized === 'rendered-quality-review' ||
    normalized === 'visual-quality-review'
  ) {
    return 'rendered-aesthetic';
  }
  if (normalized === 'rendered-artifact' || normalized === 'render-artifact') return 'rendered-artifact';
  if (normalized === 'manual-review' || normalized === 'human-review') return 'manual-review';
  if (normalized === 'user-published' || normalized === 'published') return 'user-published';
  if (normalized === 'metadata-only' || normalized === 'metadata') return 'metadata-only';
  return 'unknown';
}

function normalizeRenderedAestheticStatus(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().toLowerCase()
    : null;
}

function isRenderedEvidenceSource(source: BanditOutcomeEvidenceSource): boolean {
  return source === 'rendered-aesthetic' || source === 'rendered-artifact' || source === 'manual-review';
}

// Bandit state management.
export function createBanditState(userId: string): BanditState {
  return {
    userId,
    arms: new Map(),
    totalProjects: 0,
    lastUpdated: Date.now(),
  };
}

function getArmKey(dial: DialName, contextKey: string): string {
  return `${dial}:${contextKey}`;
}

function getOrCreateArm(state: BanditState, dial: DialName, contextKey: string): DialArm {
  const key = getArmKey(dial, contextKey);
  let arm = state.arms.get(key);
  if (!arm) {
    arm = { dial, mu: PRIOR_MU, precision: PRIOR_PRECISION, observations: 0 };
    state.arms.set(key, arm);
  }
  return arm;
}

// ─── Thompson Sampling: Compute Adjustments ─────────────────────────────────

/**
 * Sample genre parameter adjustments via Thompson Sampling.
 *
 * For each of the 9 dials, samples from the learned Normal distribution
 * for the given context. Returns adjustments to ADD to signal-computed values.
 *
 * Returns zero adjustments (usedBandit: false) when < 5 total projects.
 */
export function sampleAdjustments(
  state: BanditState,
  context: BanditContext,
): BanditAdjustments {
  if (state.totalProjects < MIN_PROJECTS_FOR_BANDIT) {
    return { adjustments: {}, confidence: 'low', usedBandit: false, observationCount: 0 };
  }

  const contextKey = buildContextKey(context);
  const adjustments: Partial<GenreParameters> = {};
  let totalObs = 0;

  for (const dial of ALL_DIALS) {
    const arm = getOrCreateArm(state, dial, contextKey);
    const range = DIAL_RANGES[dial];

    // Sample adjustment from N(mu, 1/precision)
    const rawAdj = sampleNormal(arm.mu, arm.precision);

    // Clamp to max adjustment range for this dial
    const clampedAdj = Math.max(-range.maxAdj, Math.min(range.maxAdj, rawAdj));

    // Only include non-trivial adjustments
    if (Math.abs(clampedAdj) > range.maxAdj * 0.05) {
      adjustments[dial] = clampedAdj;
    }

    totalObs += arm.observations;
  }

  const avgObs = totalObs / ALL_DIALS.length;
  const confidence: BanditAdjustments['confidence'] =
    avgObs >= 20 ? 'high' :
    avgObs >= 8 ? 'medium' : 'low';

  return {
    adjustments,
    confidence,
    usedBandit: true,
    observationCount: Math.round(avgObs),
  };
}

/**
 * Apply bandit adjustments to signal-computed genre parameters.
 * Clamps each dial to its valid range after adjustment.
 */
export function applyAdjustments(
  signalComputed: GenreParameters,
  adjustments: Partial<GenreParameters>,
): GenreParameters {
  const result = { ...signalComputed };

  for (const dial of ALL_DIALS) {
    const adj = adjustments[dial];
    if (adj === undefined) continue;

    const range = DIAL_RANGES[dial];
    result[dial] = Math.max(range.min, Math.min(range.max, result[dial] + adj));
  }

  return result;
}

// ─── State Update ──────────────────────────────────────────────────────────

/**
 * Update bandit state with a project outcome.
 *
 * Normal-Normal conjugate update per dial:
 *   - Computes the adjustment that was actually applied (used - signalComputed)
 *   - Weights the update by the reward (good outcome → reinforce, bad → penalize)
 *   - Posterior: precision_new = precision_old + obs_precision
 *               mu_new = (precision_old * mu_old + obs_precision * observed) / precision_new
 */
export function updateBanditState(state: BanditState, outcome: ProjectOutcome): void {
  const contextKey = buildContextKey(outcome.context);
  const reward = computeReward(outcome);

  // Reward centered at 0.5: positive reward reinforces, negative penalizes
  const rewardSign = (reward - 0.5) * 2; // maps [0,1] → [-1,1]

  for (const dial of ALL_DIALS) {
    const arm = getOrCreateArm(state, dial, contextKey);

    // What adjustment was actually applied?
    const appliedAdj = outcome.genreParamsUsed[dial] - outcome.genreParamsSignalComputed[dial];

    // Reward-weighted observation: if reward was high, this adjustment was good
    // If reward was low, the opposite adjustment would be better
    const effectiveObservation = appliedAdj * rewardSign;

    // Normal-Normal conjugate update
    const newPrecision = arm.precision + OBSERVATION_PRECISION;
    const newMu = (arm.precision * arm.mu + OBSERVATION_PRECISION * effectiveObservation) / newPrecision;

    arm.mu = newMu;
    arm.precision = newPrecision;
    arm.observations += 1;
  }

  state.totalProjects += 1;
  state.lastUpdated = Date.now();
}

// ─── Moment Weight Adjustments ──────────────────────────────────────────────

/**
 * Generate per-segment Thompson Sampling adjustments for moment weights.
 *
 * Uses the bandit's learned energy_baseline preference to modulate segment weights.
 * Opening/closing segments get position-based adjustment scaled by confidence.
 *
 * Returns a Map<segmentId, adjustment> where adjustment is in [-0.3, +0.3].
 */
export function computeMomentAdjustments(
  state: BanditState,
  context: BanditContext,
  segmentPositions: Array<{ id: string; normalizedPosition: number }>,
): Map<string, number> {
  const adjustments = new Map<string, number>();

  if (state.totalProjects < MIN_PROJECTS_FOR_BANDIT) {
    return adjustments;
  }

  const contextKey = buildContextKey(context);

  // Use energy_baseline arm confidence as overall editing intensity signal
  const energyArm = getOrCreateArm(state, 'energy_baseline', contextKey);
  const confidenceScale = Math.min(1, energyArm.observations / 50);

  for (const seg of segmentPositions) {
    // Position-based prior: hooks and endings get slight positive adjustment
    let positionBias = 0;
    if (seg.normalizedPosition < 0.1) positionBias = 0.05;
    else if (seg.normalizedPosition > 0.85) positionBias = 0.03;

    const adjustment = positionBias * confidenceScale;
    if (Math.abs(adjustment) > 0.01) {
      adjustments.set(seg.id, Math.max(-0.3, Math.min(0.3, adjustment)));
    }
  }

  return adjustments;
}

// ─── Serialization ──────────────────────────────────────────────────────────

export function serializeBanditState(state: BanditState): string {
  return JSON.stringify({
    userId: state.userId,
    arms: Array.from(state.arms.entries()),
    totalProjects: state.totalProjects,
    lastUpdated: state.lastUpdated,
  });
}

export function deserializeBanditState(json: string): BanditState {
  const data = JSON.parse(json);
  return {
    userId: data.userId,
    arms: new Map(data.arms),
    totalProjects: data.totalProjects,
    lastUpdated: data.lastUpdated,
  };
}

// ─── MongoDB Persistence ──────────────────────────────────────────────────

const BANDIT_COLLECTION = 'bandit_states';

/**
 * Load bandit state from MongoDB for a specific user.
 * Returns null if no state exists (new user / first project).
 *
 * Uses dynamic import to avoid pulling MongoDB into pure algorithmic callers.
 */
export async function loadBanditState(userId: string): Promise<BanditState | null> {
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();

    const doc = await db.collection(BANDIT_COLLECTION).findOne({ userId });
    if (!doc) return null;

    return {
      userId: doc.userId,
      arms: new Map(doc.arms || []),
      totalProjects: doc.totalProjects || 0,
      lastUpdated: doc.lastUpdated || 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Bandit] Failed to load state for ${userId}: ${msg}`);
    return null;
  }
}

/**
 * Save bandit state to MongoDB. Upserts — creates on first save, updates after.
 *
 * Arms Map is stored as array of entries (MongoDB doesn't support ES6 Map natively).
 * Uses $setOnInsert for createdAt so it's never overwritten on updates.
 */
export async function saveBanditState(state: BanditState): Promise<void> {
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();

    await db.collection(BANDIT_COLLECTION).updateOne(
      { userId: state.userId },
      {
        $set: {
          arms: Array.from(state.arms.entries()),
          totalProjects: state.totalProjects,
          lastUpdated: state.lastUpdated,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: state.userId,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Bandit] Failed to save state for ${state.userId}: ${msg}`);
    // Non-fatal — bandit is an enhancement, not critical path
  }
}

// ─── Reward Feedback Loop ─────────────────────────────────────────────────

/**
 * Record a project outcome for bandit learning.
 *
 * Called after Director completes (immediate reward from quality score)
 * and optionally again when user renders/publishes (deferred reward update).
 *
 * Flow:
 *   1. Load project doc → extract genre params + context
 *   2. Load or create bandit state for user
 *   3. Build ProjectOutcome → call updateBanditState
 *   4. Save updated state to MongoDB
 *
 * Non-fatal: if anything fails, logs and returns. Pipeline is never blocked.
 */
export async function recordProjectOutcome(
  userId: string,
  projectId: string,
  qualityScore: number,
  userRendered: boolean = false,
  userPublished: boolean = false,
  options: BanditOutcomeWriteOptions = {},
): Promise<BanditOutcomeRecordResult> {
  const writePolicy = resolveBanditOutcomeWritePolicy({
    ...options,
    userRendered,
    userPublished,
  });

  if (!writePolicy.allowed) {
    console.log(
      `[Bandit] Skipping outcome for ${projectId}: ${writePolicy.reason} ` +
      `(source=${writePolicy.evidenceSource}, renderedStatus=${writePolicy.renderedAestheticStatus ?? 'none'}, userRendered=${userRendered}, userPublished=${userPublished})`,
    );
    return { recorded: false, reason: writePolicy.reason };
  }
  try {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();

    // Load project doc for genre parameters + context signals
    const projectDoc = await db.collection('projects').findOne({ projectId });
    if (!projectDoc?.genreParameters) {
      console.warn(`[Bandit] No genreParameters on project ${projectId} — skipping outcome recording`);
      return { recorded: false, reason: 'missing_genre_parameters' };
    }

    // Load or create bandit state
    let state = await loadBanditState(userId);
    if (!state) state = createBanditState(userId);

    // Build context from rawFootageAnalysis
    const rawFootage = projectDoc.rawFootageAnalysis;
    const durationSec = (projectDoc.durationInFrames || 900) / (projectDoc.fps || 30);

    // Speech coverage = ratio of time with speech to total duration
    const totalSpeechMs = rawFootage?.segments?.reduce(
      (sum: number, s: any) => sum + (s.endMs - s.startMs), 0
    ) ?? 0;
    const speechCoverage = rawFootage?.originalDurationMs
      ? totalSpeechMs / rawFootage.originalDurationMs
      : 0;

    const context: BanditContext = {
      signalBucket: buildSignalBucket({
        speechCoverage,
        speechEnergy: averageSignalValue(projectDoc.wav2vecAnalysis?.segments, 'energy'),
        motionIntensity: averageSignalValue(projectDoc.vjepaAnalysis?.segments, 'motionIntensity'),
        visualSignificance: averageSignalValue(projectDoc.vjepaAnalysis?.segments, 'visualSignificance'),
        musicEnergy: averageSignalValue(projectDoc.musicAnalysis?.energyCurve, 'energy'),
        beatStrength: projectDoc.musicAnalysis?.musicPresence,
      }),
      speechCoverageBucket: buildSpeechCoverageBucket(speechCoverage),
      durationBucket: buildDurationBucket(durationSec),
      platform: projectDoc.syntheticStoryboard?.platform || 'youtube',
    };

    // Build outcome — genreParametersSignalComputed is the pre-bandit value
    // stored separately by the worker. If not available (pre-bandit projects),
    // use genreParameters as both (adjustment was 0).
    const outcome: ProjectOutcome = {
      genreParamsUsed: projectDoc.genreParameters,
      genreParamsSignalComputed: projectDoc.genreParametersSignalComputed || projectDoc.genreParameters,
      context,
      qualityScore,
      userRendered,
      userPublished,
    };

    // Update bandit with this outcome
    updateBanditState(state, outcome);

    // Save updated state
    await saveBanditState(state);

    const reward = computeReward(outcome);
    console.log(
      `[Bandit] Recorded outcome for ${projectId}: quality=${qualityScore}, ` +
      `reward=${reward.toFixed(2)}, totalProjects=${state.totalProjects}, ` +
      `active=${state.totalProjects >= MIN_PROJECTS_FOR_BANDIT}`,
    );
    return { recorded: true, reward };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Bandit] recordProjectOutcome failed for ${projectId}: ${msg}`);
    // Non-fatal — never blocks pipeline
    return { recorded: false, reason: 'error' };
  }
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

export function getBanditDiagnostics(state: BanditState, context: BanditContext): {
  contextKey: string;
  dialStates: Array<{
    dial: DialName;
    mu: number;
    precision: number;
    sigma: number;
    observations: number;
  }>;
  totalProjects: number;
  banditActive: boolean;
} {
  const contextKey = buildContextKey(context);
  const dialStates = ALL_DIALS.map(dial => {
    const arm = getOrCreateArm(state, dial, contextKey);
    return {
      dial,
      mu: arm.mu,
      precision: arm.precision,
      sigma: 1 / Math.sqrt(arm.precision),
      observations: arm.observations,
    };
  }).sort((a, b) => b.observations - a.observations);

  return {
    contextKey,
    dialStates,
    totalProjects: state.totalProjects,
    banditActive: state.totalProjects >= MIN_PROJECTS_FOR_BANDIT,
  };
}
