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
import {
  buildMultiAssetDirectorContext,
  isCanonicalAnalysisComplete,
  type MultiAssetTimelineOverlay,
} from '@/lib/editron/services/multi-asset-director-context';
import type { ProjectAssetAnalysisDoc } from '@/lib/editron/storyline/asset-analysis-reader';

export const EDIT_MODES = ['auto', 'assist'] as const;
export type EditMode = (typeof EDIT_MODES)[number];

/** New autoEditStatus values owned by the assist lane (additive; auto values untouched). */
export const ASSIST_STATUS_READY = 'ready_for_chat' as const;
export const ASSIST_STATUS_SCAN_FAILED = 'scan_failed' as const;

export function parseEditMode(value: unknown): EditMode | undefined {
  return value === 'auto' || value === 'assist' ? value : undefined;
}

/**
 * Server-side feature gate. UI hiding alone is not "dark" — both intake routes
 * check this. NEXT_PUBLIC_DIRECTOR_MODE_ENABLED is accepted as a fallback so a
 * single deploy variable can drive both the client toggle and the server gate.
 */
export function isAssistIntakeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.DIRECTOR_MODE_ENABLED ?? env.NEXT_PUBLIC_DIRECTOR_MODE_ENABLED;
  return v === 'true' || v === '1';
}

/**
 * The ONE divergence guard. True → skip storyline/director entirely.
 * Consulted at: from-batch compose, video-analysis worker (:executeDirectorPlan site),
 * from-asset route inline director path.
 */
export function isAssistProject(project: unknown): boolean {
  const editMode = project && typeof project === 'object'
    ? (project as { editMode?: unknown }).editMode
    : undefined;
  return parseEditMode(editMode) === 'assist';
}

/**
 * A refunded assist project (scan_failed) must be inert to EVERY mutation and
 * open surface — the user was refunded because they never received a product.
 * Battle-lane finding: the 403 lived only on chat/stream; sibling mutation
 * routes (chat/tool-call, …) must consult this too.
 */
export function isRefundedAssistProject(project: unknown): boolean {
  if (!isAssistProject(project)) return false;
  const status = project && typeof project === 'object'
    ? (project as { autoEditStatus?: unknown }).autoEditStatus
    : undefined;
  return status === ASSIST_STATUS_SCAN_FAILED;
}

/**
 * Settle a failed assist scan: atomic terminal transition + refund-where-deducted.
 * ONE implementation for all three workers (video-analysis, tribe-analysis,
 * director) — battle-lane finding: stage-2/3 failures previously kept the charge.
 *
 * Money rules enforced here:
 * - Refund fires ONLY when THIS call performs the scanning→scan_failed transition
 *   (QStash redelivery / cancel races refund exactly once).
 * - The transaction is consumed ($unset) ONLY on a confirmed successful refund —
 *   refundCredits reports failure by return value, not only by throwing.
 * - Every non-refunded outcome that should have refunded flags assistRefundPending.
 *
 * `db` is passed in and CreditsService is imported lazily so this module stays
 * import-safe for env-less consumers.
 */
export async function settleAssistScanFailure(
  db: { collection: (name: string) => any },
  projectId: string,
  reason: string,
): Promise<'refunded' | 'transition-lost' | 'refund-pending' | 'not-assist'> {
  const laneDoc = await db.collection('projects').findOne(
    { projectId },
    { projection: { editMode: 1, assistCreditTransactionId: 1, assistChargedCredits: 1, userId: 1 } },
  );
  if (!isAssistProject(laneDoc)) return 'not-assist';

  const transition = await db.collection('projects').updateOne(
    { projectId, autoEditStatus: { $nin: [ASSIST_STATUS_SCAN_FAILED, ASSIST_STATUS_READY, 'complete'] } },
    { $set: { autoEditStatus: ASSIST_STATUS_SCAN_FAILED, autoEditError: reason } },
  );
  if (transition.modifiedCount !== 1) {
    console.log(`[DirectorMode] Assist failure after a terminal status — settlement already owned elsewhere (project ${projectId}).`);
    return 'transition-lost';
  }

  const txId = typeof laneDoc?.assistCreditTransactionId === 'string' ? laneDoc.assistCreditTransactionId : null;
  const charged = typeof laneDoc?.assistChargedCredits === 'number' ? laneDoc.assistChargedCredits : null;
  const flagForSupport = async () => {
    await db.collection('projects').updateOne(
      { projectId },
      { $set: { assistRefundPending: true } },
    ).catch(() => {});
  };

  if (!txId || charged === null) {
    console.error('[DirectorMode][REFUND-SKIPPED][MONEY] assist scan failed but no persisted transaction/charge — refund did NOT run:', { projectId, txId, charged });
    await flagForSupport();
    return 'refund-pending';
  }
  try {
    const { CreditsService } = await import('@/lib/services/creditsService');
    const result = await CreditsService.refundCredits(
      String(laneDoc?.userId ?? ''),
      charged,
      reason,
      { service: 'editron', action: 'auto_edit_analysis', originalTransactionId: txId },
    );
    if (result && result.success === false) {
      console.error('[DirectorMode][REFUND-FAILED][MONEY] refundCredits returned failure — flagging for support:', { projectId, error: (result as { error?: unknown }).error });
      await flagForSupport();
      return 'refund-pending';
    }
    // Consume the transaction ONLY after a confirmed refund.
    await db.collection('projects').updateOne(
      { projectId },
      { $set: { assistRefundedAt: new Date() }, $unset: { assistCreditTransactionId: '', assistChargedCredits: '' } },
    ).catch(() => {});
    console.log(`[DirectorMode] Refunded ${charged} credits for failed assist scan (project ${projectId}).`);
    return 'refunded';
  } catch (refundErr: unknown) {
    console.error('[DirectorMode][REFUND-FAILED][MONEY] assist scan refund threw — flagging for support:', refundErr instanceof Error ? refundErr.message : refundErr);
    await flagForSupport();
    return 'refund-pending';
  }
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

/** The seven project-level analysis fields chat evidence grounds in (tools.ts reads these). */
const HYDRATION_FIELDS = [
  'rawFootageAnalysis',
  'segmentAnalysis',
  'multiAssetDirectorContext',
  'vjepaAnalysis',
  'wav2vecAnalysis',
  'momentWeightMap',
  'musicAnalysis',
] as const;

export type AssistHydrationPlan = {
  /** $set payload for the project doc. */
  set: Record<string, unknown>;
  /** $unset payload for the project doc (fields with no evidence — never left stale). */
  unset: Record<string, ''>;
  /** Video assets whose canonical analysis backs the hydrated map. */
  hydratedVideoAssetIds: string[];
  /** Video assets ON the timeline but OUT of the canonical map (degraded; retry re-hydrates). */
  degradedVideoAssetIds: string[];
};

/**
 * Assist hydration (CEO plan REV 5 #1-2). Chat chips/moment resolvers read
 * PROJECT-level analysis fields that only auto's compose step used to write.
 * The assist lay-down ends with this: build the same canonical context and
 * return the exact $set/$unset the route applies — but pre-filtered to
 * canonical-complete assets so degraded clips stay on the timeline without
 * tripping the builder's all-or-nothing throw. Analysis writes are NOT edits;
 * the zero-edit invariant is untouched.
 */
export function buildAssistHydration(args: {
  analyses: readonly ProjectAssetAnalysisDoc[];
  overlays: readonly MultiAssetTimelineOverlay[];
  fps: number;
  durationInFrames: number;
}): AssistHydrationPlan {
  const analysisByAsset = new Map(args.analyses.map((doc) => [doc.assetId, doc]));
  const hydrated = new Set<string>();
  const degraded = new Set<string>();
  const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  // Mirrors selectedVideoClips' validity rule (multi-asset-director-context.ts) —
  // a video overlay the builder would THROW on is degraded instead. Battle-lane
  // finding: rescue/edited timelines can carry malformed overlays; hydration must
  // never detonate the whole lane on one bad clip.
  const isContextReadyVideoOverlay = (overlay: MultiAssetTimelineOverlay): boolean => {
    const assetId = typeof overlay.assetId === 'string' && overlay.assetId.trim() ? overlay.assetId : null;
    const shape = overlay as { from?: unknown; durationInFrames?: unknown; sourceStartFrame?: unknown; videoStartTime?: unknown };
    return Boolean(
      assetId
      && isCanonicalAnalysisComplete(analysisByAsset.get(assetId))
      && isFiniteNumber(shape.from)
      && isFiniteNumber(shape.durationInFrames) && (shape.durationInFrames as number) > 0
      && (isFiniteNumber(shape.sourceStartFrame) || isFiniteNumber(shape.videoStartTime)),
    );
  };
  for (const overlay of args.overlays) {
    if (overlay.type !== 'video') continue;
    const assetId = typeof overlay.assetId === 'string' ? overlay.assetId : undefined;
    if (isContextReadyVideoOverlay(overlay)) hydrated.add(assetId as string);
    else degraded.add(assetId ?? 'unknown-asset');
  }
  // An asset with at least one context-ready overlay is hydrated; don't double-report it.
  for (const id of hydrated) degraded.delete(id);

  const plan: AssistHydrationPlan = {
    set: {},
    unset: {},
    hydratedVideoAssetIds: Array.from(hydrated).sort(),
    degradedVideoAssetIds: Array.from(degraded).sort(),
  };

  if (hydrated.size === 0) {
    // Image-only or fully-degraded lay-down: no canonical map. Explicitly clear
    // every hydration field so nothing stale can masquerade as evidence.
    for (const field of HYDRATION_FIELDS) plan.unset[field] = '';
    return plan;
  }

  const contextOverlays = args.overlays.filter(
    (overlay) => overlay.type !== 'video' || isContextReadyVideoOverlay(overlay),
  );
  const context = buildMultiAssetDirectorContext({
    analyses: args.analyses,
    overlays: contextOverlays,
    fps: args.fps,
    durationInFrames: args.durationInFrames,
  });

  plan.set.rawFootageAnalysis = context.rawFootageAnalysis;
  plan.set.segmentAnalysis = context.segmentAnalysis;
  plan.set.multiAssetDirectorContext = context.provenance;
  const optional: Record<string, unknown> = {
    vjepaAnalysis: context.vjepaAnalysis,
    wav2vecAnalysis: context.wav2vecAnalysis,
    momentWeightMap: context.momentWeightMap,
    musicAnalysis: context.musicAnalysis,
  };
  for (const [field, value] of Object.entries(optional)) {
    if (value != null) plan.set[field] = value;
    else plan.unset[field] = '';
  }
  return plan;
}
