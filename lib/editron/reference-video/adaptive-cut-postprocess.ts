/**
 * Adaptive cut post-processing (R0).
 *
 * The fixed-threshold ffmpeg detector double/triple-counts a single transition
 * when it happens through a whip-pan or fast-motion blur (confirmed on the real
 * corpus: KOLD 212.212/212.295/212.421 fired on one drum->blade shot change).
 * The frame review (Qwen, 2026-08-04) confirmed this is the ONE false-positive
 * class on the fast-cut corpus; the rest of the high density is genuine cutting.
 *
 * The adaptive pass merges detections that fall within a short time window of
 * each other into a single transition, keeping the strongest boundary evidence
 * (highest sceneScore). Pure + deterministic; shared by the CLI and the scorer.
 */

export const ADAPTIVE_POSTPROCESS_VERSION = 'editron-r0-adaptive-cut-postprocess-v1' as const;

/** Default merge window. ⚠️ calibration knob — derived from the observed whip-pan
 *  cluster span (~200ms) on KOLD; tune against the real annotated corpus. */
export const DEFAULT_MERGE_WINDOW_MS = 200;

export interface PostProcessOptions {
  /** Detections closer than this many ms are one transition; keep the strongest. */
  mergeWindowMs?: number;
}

export interface MergeResult {
  cuts: Array<{ tMs: number; sceneScore?: number }>;
  /** Number of merge groups that collapsed 2+ detections into one. */
  merges: number;
  /** Total detections before merging. */
  before: number;
  /** Total detections after merging. */
  after: number;
}

/**
 * Merge detections within `mergeWindowMs` of each other into a single cut,
 * keeping the member with the highest sceneScore (best boundary evidence).
 * Input must already be sorted ascending by tMs. Deterministic + pure.
 */
export function mergeCloseCuts(
  cuts: ReadonlyArray<{ tMs: number; sceneScore?: number }>,
  options: PostProcessOptions = {},
): MergeResult {
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  if (mergeWindowMs < 0 || !Number.isFinite(mergeWindowMs)) {
    throw new Error('mergeWindowMs must be a non-negative finite number');
  }
  if (!cuts.every(cut => Number.isFinite(cut.tMs))) {
    throw new Error('All cuts must have a finite tMs');
  }
  if (cuts.length <= 1) {
    return { cuts: [...cuts], merges: 0, before: cuts.length, after: cuts.length };
  }

  const sorted = [...cuts].sort((a, b) => a.tMs - b.tMs);
  const groups: Array<Array<{ tMs: number; sceneScore?: number }>> = [];
  let current: Array<{ tMs: number; sceneScore?: number }> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    if (sorted[i].tMs - prev.tMs <= mergeWindowMs) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);

  const merges = groups.filter(group => group.length > 1).length;
  const out = groups.map(group => {
    if (group.length === 1) return group[0];
    return [...group].sort((a, b) => (b.sceneScore ?? -1) - (a.sceneScore ?? -1))[0];
  });

  return {
    cuts: out,
    merges,
    before: sorted.length,
    after: out.length,
  };
}

/** Convenience: run the full adaptive pipeline (merge only, for now). */
export function postProcessCuts(
  cuts: ReadonlyArray<{ tMs: number; sceneScore?: number }>,
  options: PostProcessOptions = {},
): { tMs: number; sceneScore?: number }[] {
  return mergeCloseCuts(cuts, options).cuts;
}
