/**
 * Assist lane (Director Mode) — analyze-only / chat-first projects.
 *
 * The lane's contract (CEO plan 2026-07-22, REV 5):
 *   upload → full scans → ZERO AI edits → chronological lay-down → user directs via chat.
 *
 * This module is the single source of truth for lane decisions. The three
 * director-invocation sites (from-batch compose, video-analysis worker,
 * from-asset route) consult ONE guard here instead of branching locally:
 *
 *   editMode 'auto'  ──► storyline + executeDirectorPlan (unchanged)
 *   editMode 'assist'──► chronological lay-down + analysis hydration
 *                        └─► autoEditStatus: 'ready_for_chat' (never 'directing')
 *
 * Zero-edit invariant: at ready_for_chat the timeline holds ALL usable assets,
 * full duration, untrimmed, uploadedAt order, nothing added. Videos without a
 * positive probed duration are NEVER silently clamped to the image hold — they
 * are partitioned out as degraded (per-asset retry re-admits them).
 */
import { positiveDurationSec, type MaterializableAsset } from '@/lib/editron/services/timeline-materializer';

export const EDIT_MODES = ['auto', 'assist'] as const;
export type EditMode = (typeof EDIT_MODES)[number];

/** New autoEditStatus values owned by the assist lane (additive; auto values untouched). */
export const ASSIST_STATUS_READY = 'ready_for_chat' as const;
export const ASSIST_STATUS_SCAN_FAILED = 'scan_failed' as const;

export function parseEditMode(value: unknown): EditMode | undefined {
  return value === 'auto' || value === 'assist' ? value : undefined;
}

/** Server-side feature gate. UI hiding alone is not "dark" — both intake routes check this. */
export function isAssistIntakeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.DIRECTOR_MODE_ENABLED;
  return v === 'true' || v === '1';
}

/**
 * The ONE divergence guard. True → skip storyline/director entirely.
 * Consulted at: from-batch compose, video-analysis worker (:executeDirectorPlan site),
 * from-asset route inline director path.
 */
export function isAssistProject(project: { editMode?: unknown } | null | undefined): boolean {
  return parseEditMode(project?.editMode) === 'assist';
}

export type AssistAssetPartition = {
  /** Safe to materialize: images, and videos with a positive probed duration. */
  usableAssets: MaterializableAsset[];
  /** Videos with no positive duration — degraded, awaiting probe/retry; NEVER trimmed onto the timeline. */
  excludedNoDurationAssetIds: string[];
};

/**
 * Pre-materializer guard (REV 5 #2 / REV 4 #4). The shared materializer clamps
 * duration-less videos to DEFAULT_IMAGE_HOLD_SEC — correct for auto's fallback,
 * an invariant violation for assist. Partition BEFORE materializing; the
 * materializer itself stays behavior-identical for both lanes.
 */
export function partitionAssistAssets(
  assets: readonly MaterializableAsset[],
): AssistAssetPartition {
  const usableAssets: MaterializableAsset[] = [];
  const excludedNoDurationAssetIds: string[] = [];
  for (const asset of assets) {
    if (asset.type === 'video' && positiveDurationSec(asset) === undefined) {
      excludedNoDurationAssetIds.push(asset.assetId);
      continue;
    }
    usableAssets.push(asset);
  }
  return { usableAssets, excludedNoDurationAssetIds };
}
