/**
 * Humanize Pass — Organic Imperfection Injection (FLAG 8)
 *
 * Runs AFTER signal executor, BEFORE constraint enforcer.
 * Detects machine precision patterns and injects controlled variation
 * to prevent the "AI-edited" uncanny feel.
 *
 * From creative doc v3 mapping: organic_imperfection_injection (Part 2, §2.7)
 *   "Professional editors have micro-variations ±2-3 frames. The editing
 *    equivalent of a musician's 'feel.' Perfect precision is detectable."
 *
 * Rules:
 *   - Seeded by projectId (deterministic — same input = same "humanized" output)
 *   - Never push cuts into mid-word positions (word boundary is sacred)
 *   - Exempt montage_mode sections (metric montage SHOULD be precise)
 *   - Max jitter: ±3 frames for cuts, ±15% for durations, ±3% for zoom targets
 *
 * Consumers: director-agent.ts (Path D, between signal-executor and constraint-enforcer)
 */

import type { EditDecision, EditDecisionList } from './signal-executor';
import type { RawFootageAnalysis } from './signal-registry';

// ─── Constants ──────────────────────────────────────────────────────────────

const CONSECUTIVE_BEAT_THRESHOLD = 4;  // humanize after 4+ consecutive beat-aligned cuts
const DURATION_VARIANCE_THRESHOLD = 0.1;  // 10% variance = monotonous
const IDENTICAL_ZOOM_THRESHOLD = 3;  // 3+ identical zoom targets = robotic
const IDENTICAL_TRANSITION_THRESHOLD = 3;  // 3+ same-duration transitions

const MAX_CUT_JITTER_FRAMES = 3;
const MAX_DURATION_JITTER_PERCENT = 0.15;
const MAX_ZOOM_JITTER_PERCENT = 0.03;
const MAX_TRANSITION_JITTER_PERCENT = 0.10;

// ─── Seeded PRNG (Mulberry32) ───────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// ─── Main Humanize Function ─────────────────────────────────────────────────

/**
 * Apply organic imperfection to a decision list.
 * Deterministic per projectId (seeded PRNG).
 */
export function humanizeEdl(
  edl: EditDecisionList,
  projectId: string,
  rawFootage: RawFootageAnalysis | null,
  fps: number = 30
): EditDecisionList {
  const seed = hashString(projectId);
  const rng = mulberry32(seed);
  const decisions = [...edl.decisions]; // shallow copy

  // Detect which sections are in montage_mode (exempt from humanization)
  const montageSections = detectMontageSections(decisions);

  // Check 1: Consecutive beat-aligned cuts → add jitter to cuts 5+
  humanizeBeatAlignment(decisions, rng, montageSections, rawFootage, fps);

  // Check 2: Identical shot durations → vary ±10-15%
  humanizeDurationMonotony(decisions, rng, montageSections);

  // Check 3: Identical zoom targets → vary ±2-3%
  humanizeZoomTargets(decisions, rng, montageSections);

  // Check 4: Identical transition durations → vary ±10%
  humanizeTransitionDurations(decisions, rng, montageSections);

  return {
    decisions,
    metadata: {
      ...edl.metadata,
      // Preserve original counts, add humanize flag
      totalDecisionsGenerated: decisions.length,
    },
  };
}

// ─── Humanization Passes ────────────────────────────────────────────────────

function humanizeBeatAlignment(
  decisions: EditDecision[],
  rng: () => number,
  montageSections: Set<number>,
  rawFootage: RawFootageAnalysis | null,
  fps: number
): void {
  // Find consecutive beat-aligned cuts (cuts where source includes "beat" or "downbeat")
  const cutDecisions = decisions.filter(d => d.type === 'cut' || d.type === 'transition');
  let consecutiveBeatCuts = 0;

  for (let i = 0; i < cutDecisions.length; i++) {
    const d = cutDecisions[i];
    const isBeatAligned = d.source?.includes('beat') || d.source?.includes('downbeat') ||
                          d.source?.includes('audio.');

    if (isBeatAligned) {
      consecutiveBeatCuts++;
    } else {
      consecutiveBeatCuts = 0;
    }

    // After threshold, start jittering
    if (consecutiveBeatCuts > CONSECUTIVE_BEAT_THRESHOLD) {
      if (montageSections.has(d.frame)) continue; // exempt montage

      const jitter = Math.round((rng() - 0.5) * 2 * MAX_CUT_JITTER_FRAMES);
      const newFrame = d.frame + jitter;

      // Verify jitter doesn't push into mid-word
      if (!fallsMidWord(newFrame, rawFootage, fps)) {
        d.frame = newFrame;
      }
    }
  }
}

function humanizeDurationMonotony(
  decisions: EditDecision[],
  rng: () => number,
  montageSections: Set<number>
): void {
  // Check zoom/graphic decisions for identical durations
  const durationDecisions = decisions.filter(d =>
    (d.type === 'zoom' || d.type === 'graphic') && typeof d.params['duration_s'] === 'number'
  );

  if (durationDecisions.length < 5) return;

  // Compute variance in a sliding window of 5
  for (let i = 4; i < durationDecisions.length; i++) {
    const window = durationDecisions.slice(i - 4, i + 1);
    const durations = window.map(d => d.params['duration_s'] as number);
    const avg = durations.reduce((s, v) => s + v, 0) / durations.length;
    const variance = durations.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / durations.length;
    const relativeVariance = Math.sqrt(variance) / avg;

    if (relativeVariance < DURATION_VARIANCE_THRESHOLD) {
      // Too monotonous — vary the last 3 in the window
      for (let j = i - 2; j <= i; j++) {
        if (montageSections.has(durationDecisions[j].frame)) continue;
        const original = durationDecisions[j].params['duration_s'] as number;
        const jitter = 1 + (rng() - 0.5) * 2 * MAX_DURATION_JITTER_PERCENT;
        durationDecisions[j].params['duration_s'] = Math.round(original * jitter * 100) / 100;
      }
    }
  }
}

function humanizeZoomTargets(
  decisions: EditDecision[],
  rng: () => number,
  montageSections: Set<number>
): void {
  const zoomDecisions = decisions.filter(d =>
    d.type === 'zoom' && typeof d.params['end_scale'] === 'number'
  );

  if (zoomDecisions.length < IDENTICAL_ZOOM_THRESHOLD) return;

  // Check for identical zoom targets
  for (let i = IDENTICAL_ZOOM_THRESHOLD - 1; i < zoomDecisions.length; i++) {
    const window = zoomDecisions.slice(i - (IDENTICAL_ZOOM_THRESHOLD - 1), i + 1);
    const scales = window.map(d => d.params['end_scale'] as number);
    const allSame = scales.every(s => Math.abs(s - scales[0]) < 0.01);

    if (allSame) {
      // Vary the last 2 in the window
      for (let j = i - 1; j <= i; j++) {
        if (montageSections.has(zoomDecisions[j].frame)) continue;
        const original = zoomDecisions[j].params['end_scale'] as number;
        const jitter = 1 + (rng() - 0.5) * 2 * MAX_ZOOM_JITTER_PERCENT;
        zoomDecisions[j].params['end_scale'] = Math.round(original * jitter * 1000) / 1000;
      }
    }
  }
}

function humanizeTransitionDurations(
  decisions: EditDecision[],
  rng: () => number,
  montageSections: Set<number>
): void {
  const transDecisions = decisions.filter(d =>
    d.type === 'transition' && typeof d.params['duration_frames'] === 'number'
  );

  if (transDecisions.length < IDENTICAL_TRANSITION_THRESHOLD) return;

  for (let i = IDENTICAL_TRANSITION_THRESHOLD - 1; i < transDecisions.length; i++) {
    const window = transDecisions.slice(i - (IDENTICAL_TRANSITION_THRESHOLD - 1), i + 1);
    const durations = window.map(d => d.params['duration_frames'] as number);
    const allSame = durations.every(d => d === durations[0]);

    if (allSame && durations[0] > 0) {
      for (let j = i - 1; j <= i; j++) {
        if (montageSections.has(transDecisions[j].frame)) continue;
        const original = transDecisions[j].params['duration_frames'] as number;
        const jitter = 1 + (rng() - 0.5) * 2 * MAX_TRANSITION_JITTER_PERCENT;
        transDecisions[j].params['duration_frames'] = Math.round(original * jitter);
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Detect which frames are in montage_mode sections (exempt from humanization).
 */
function detectMontageSections(decisions: EditDecision[]): Set<number> {
  const montageFrames = new Set<number>();

  // Montage sections: rapid consecutive cuts (<2s apart) with beat-alignment
  const cuts = decisions.filter(d => d.type === 'cut' || d.type === 'transition')
    .sort((a, b) => a.frame - b.frame);

  let consecutiveShortCuts = 0;
  for (let i = 1; i < cuts.length; i++) {
    const gap = cuts[i].frame - cuts[i - 1].frame;
    if (gap < 60) { // <2s at 30fps
      consecutiveShortCuts++;
      if (consecutiveShortCuts >= 3) {
        // Mark this region as montage
        for (let f = cuts[i - 3].frame; f <= cuts[i].frame; f++) {
          montageFrames.add(f);
        }
      }
    } else {
      consecutiveShortCuts = 0;
    }
  }

  return montageFrames;
}

/**
 * Check if a frame falls mid-word in the transcript.
 * Word boundaries are sacred — jitter must not violate them.
 */
function fallsMidWord(
  frame: number,
  rawFootage: RawFootageAnalysis | null,
  fps: number
): boolean {
  if (!rawFootage?.transcription?.words?.length) return false;

  const timestampMs = (frame / fps) * 1000;

  // Check if this timestamp falls inside any word's time range
  return rawFootage.transcription.words.some(w =>
    timestampMs > w.startMs + 50 && timestampMs < w.endMs - 50  // 50ms buffer inside word
  );
}
