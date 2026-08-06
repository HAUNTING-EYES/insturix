/**
 * Adaptive cut post-processing (R0).
 *
 * The fixed-threshold ffmpeg detector double/triple-counts a single transition
 * when it happens through a whip-pan or fast-motion blur (confirmed on the real
 * corpus: KOLD 212.212/212.295/212.421 fired on one drum->blade shot change).
 * The frame review (Qwen, 2026-08-04) confirmed whip-pan blur is the ONE
 * false-positive class on the fast-cut corpus; the rest of the high density is
 * genuine cutting (e.g. The Egg's rapid illustration montage).
 *
 * Time alone cannot separate the two: KOLD's phantom cluster spans ~209ms while
 * The Egg's REAL rapid montage cuts land 60-160ms apart. Measured on the corpus
 * the discriminator is the cluster's STRONGEST scene score:
 *   - KOLD phantom clusters: max 0.35-0.44 (all weak -> a blur burst)
 *   - Egg real montage cluster: max 0.86 (a strong boundary exists -> real cuts)
 * So a cluster is merged only when max(sceneScore) < strongCutFloor; otherwise
 * every member is a real cut and all are kept. Pure + deterministic.
 */

export const ADAPTIVE_POSTPROCESS_VERSION = 'editron-r0-adaptive-cut-postprocess-v2' as const;

/** Default merge window. ⚠️ calibration knob — derived from the observed whip-pan
 *  cluster span (~200ms) on KOLD; tune against the real annotated corpus. */
export const DEFAULT_MERGE_WINDOW_MS = 200;

/** Default strong-cut floor. ⚠️ calibration knob — sits between the measured
 *  phantom-cluster max (0.44) and the real-montage-cluster max (0.86). */
export const DEFAULT_STRONG_CUT_FLOOR = 0.5;

export interface PostProcessOptions {
  /** Detections closer than this many ms are one candidate cluster. */
  mergeWindowMs?: number;
  /** A cluster whose strongest member has sceneScore >= this is treated as REAL
   *  rapid cutting (all members kept); otherwise it is a blur burst (collapsed). */
  strongCutFloor?: number;
}

export interface MergeResult {
  cuts: Array<{ tMs: number; sceneScore?: number }>;
  /** Number of clusters collapsed (2+ weak detections -> one cut). */
  merges: number;
  /** Number of clusters that were kept intact because they had a strong cut. */
  keptStrong: number;
  /** Total detections before processing. */
  before: number;
  /** Total detections after processing. */
  after: number;
}

/**
 * Cluster detections within `mergeWindowMs` of each other. A cluster with a
 * strong member (max sceneScore >= strongCutFloor) is genuine rapid cutting and
 * keeps every member; a weak cluster is a blur/whip burst and collapses to its
 * strongest member. Input may be unsorted; deterministic + pure.
 */
export function mergeCloseCuts(
  cuts: ReadonlyArray<{ tMs: number; sceneScore?: number }>,
  options: PostProcessOptions = {},
): MergeResult {
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  const strongCutFloor = options.strongCutFloor ?? DEFAULT_STRONG_CUT_FLOOR;
  if (mergeWindowMs < 0 || !Number.isFinite(mergeWindowMs)) {
    throw new Error('mergeWindowMs must be a non-negative finite number');
  }
  if (strongCutFloor < 0 || strongCutFloor > 1 || !Number.isFinite(strongCutFloor)) {
    throw new Error('strongCutFloor must be a finite number in [0, 1]');
  }
  if (!cuts.every(cut => Number.isFinite(cut.tMs))) {
    throw new Error('All cuts must have a finite tMs');
  }
  if (cuts.length <= 1) {
    return {
      cuts: [...cuts],
      merges: 0,
      keptStrong: 0,
      before: cuts.length,
      after: cuts.length,
    };
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

  const out: Array<{ tMs: number; sceneScore?: number }> = [];
  let merges = 0;
  let keptStrong = 0;
  for (const group of groups) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const maxScore = Math.max(...group.map(c => c.sceneScore ?? -1));
    if (maxScore >= strongCutFloor) {
      // Real rapid montage: every member is a legitimate cut, keep them all.
      keptStrong += 1;
      out.push(...group);
    } else {
      // Blur/whip burst: collapse to the strongest boundary evidence.
      merges += 1;
      out.push([...group].sort((a, b) => (b.sceneScore ?? -1) - (a.sceneScore ?? -1))[0]);
    }
  }

  return {
    cuts: out,
    merges,
    keptStrong,
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

