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

// Pure lane predicates live in a dependency-free module so client components can
// import them without pulling this file's heavy hydration chain into the bundle.
// Re-exported here so existing server importers keep their import path.
export {
  EDIT_MODES,
  ASSIST_STATUS_READY,
  ASSIST_STATUS_SCAN_FAILED,
  parseEditMode,
  isAssistProject,
  isRefundedAssistProject,
  canRescueToDirectorMode,
} from '@/lib/editron/services/assist-lane-predicates';
export type { EditMode } from '@/lib/editron/services/assist-lane-predicates';

import {
  ASSIST_STATUS_READY,
  ASSIST_STATUS_SCAN_FAILED,
  isAssistProject,
} from '@/lib/editron/services/assist-lane-predicates';
import { parseAssistFlag } from '@/lib/editron/services/assist-lane-flag';

/**
 * Server-side feature gate. UI hiding alone is not "dark" — both intake routes
 * check this. NEXT_PUBLIC_DIRECTOR_MODE_ENABLED is accepted as a fallback so a
 * single deploy variable can drive both the client toggle and the server gate;
 * DIRECTOR_MODE_ENABLED takes precedence so the lane can be killed server-side
 * without rebuilding the client bundle.
 *
 * The accepted-values rule itself lives in assist-lane-flag, so this gate and
 * the client toggle can never drift into parsing the same flag differently.
 */
export function isAssistIntakeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseAssistFlag(env.DIRECTOR_MODE_ENABLED ?? env.NEXT_PUBLIC_DIRECTOR_MODE_ENABLED);
}

export interface AssistScanChargeRegistrationInput {
  projectId: string;
  userId: string;
  creditTransactionId: string;
  chargedCredits: number;
}

export type AssistScanChargeRegistrationResult =
  | { disposition: 'registered' | 'already-registered'; terminal: boolean }
  | { disposition: 'invalid' | 'not-assist' | 'conflict' };

export type AssistScanChargeAdmissionResult =
  | { disposition: 'admitted' | 'already-admitted' }
  | { disposition: 'invalid' | 'not-assist' | 'conflict' };

type NormalizedAssistScanCharge = {
  projectId: string;
  userId: string;
  creditTransactionId: string;
  chargedCredits: number;
};

function normalizeAssistScanCharge(
  input: AssistScanChargeRegistrationInput,
): NormalizedAssistScanCharge | null {
  const projectId = input.projectId.trim();
  const userId = input.userId.trim();
  const creditTransactionId = input.creditTransactionId.trim();
  const chargedCredits = input.chargedCredits;
  if (
    !projectId
    || !userId
    || !creditTransactionId
    || !Number.isFinite(chargedCredits)
    || chargedCredits < 0
  ) {
    return null;
  }
  return { projectId, userId, creditTransactionId, chargedCredits };
}

/**
 * Atomically turns one newly-created project into an Assist scan and binds its
 * completed deduction. Single-asset intake calls this before writing a queue
 * status, so no worker-visible Assist project can exist without its exact money
 * identity and no pre-existing project can be repurposed by this command.
 */
export async function admitAssistScanCharge(
  db: { collection: (name: string) => any },
  input: AssistScanChargeRegistrationInput,
): Promise<AssistScanChargeAdmissionResult> {
  const normalized = normalizeAssistScanCharge(input);
  if (!normalized) return { disposition: 'invalid' };
  const { projectId, userId, creditTransactionId, chargedCredits } = normalized;
  const projects = db.collection('projects');
  const absent = (field: string) => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }] });
  const admitted = await projects.updateOne(
    {
      projectId,
      userId,
      $and: [
        absent('editMode'),
        absent('autoEditStatus'),
        absent('assistCreditTransactionId'),
        absent('assistChargedCredits'),
      ],
    },
    {
      $set: {
        editMode: 'assist',
        assistCreditTransactionId: creditTransactionId,
        assistChargedCredits: chargedCredits,
      },
    },
  );
  if (admitted.modifiedCount === 1) return { disposition: 'admitted' };

  const current = await projects.findOne(
    { projectId, userId },
    {
      projection: {
        editMode: 1,
        autoEditStatus: 1,
        assistCreditTransactionId: 1,
        assistChargedCredits: 1,
      },
    },
  );
  if (!current) return { disposition: 'conflict' };
  if (!isAssistProject(current)) return { disposition: 'not-assist' };
  if (
    current.autoEditStatus == null
    && current.assistCreditTransactionId === creditTransactionId
    && current.assistChargedCredits === chargedCredits
  ) {
    return { disposition: 'already-admitted' };
  }
  return { disposition: 'conflict' };
}

/**
 * Durably binds one completed deduction to the Assist scan that must either
 * consume it or refund it. The second CAS is deliberate: cancellation may win
 * between deduction and registration, in which case the new charge is attached
 * only as a terminal pending refund.
 */
export async function registerAssistScanCharge(
  db: { collection: (name: string) => any },
  input: AssistScanChargeRegistrationInput,
): Promise<AssistScanChargeRegistrationResult> {
  const normalized = normalizeAssistScanCharge(input);
  if (!normalized) return { disposition: 'invalid' };
  const { projectId, userId, creditTransactionId, chargedCredits } = normalized;

  const projects = db.collection('projects');
  const current = await projects.findOne(
    { projectId, userId },
    {
      projection: {
        editMode: 1,
        autoEditStatus: 1,
        assistCreditTransactionId: 1,
        assistChargedCredits: 1,
        assistRefundPending: 1,
      },
    },
  );
  if (!current) return { disposition: 'conflict' };
  if (!isAssistProject(current)) return { disposition: 'not-assist' };

  const currentTransactionId = typeof current.assistCreditTransactionId === 'string'
    ? current.assistCreditTransactionId
    : null;
  const currentCharge = typeof current.assistChargedCredits === 'number'
    ? current.assistChargedCredits
    : null;
  if (currentTransactionId !== null || currentCharge !== null) {
    if (currentTransactionId !== creditTransactionId || currentCharge !== chargedCredits) {
      return { disposition: 'conflict' };
    }
    const terminal = current.autoEditStatus === ASSIST_STATUS_SCAN_FAILED;
    if (terminal && current.assistRefundPending !== true) {
      const marked = await projects.updateOne(
        {
          projectId,
          userId,
          editMode: 'assist',
          autoEditStatus: ASSIST_STATUS_SCAN_FAILED,
          assistCreditTransactionId: creditTransactionId,
          assistChargedCredits: chargedCredits,
        },
        { $set: { assistRefundPending: true } },
      );
      if (marked.modifiedCount !== 1) return { disposition: 'conflict' };
    }
    return { disposition: 'already-registered', terminal };
  }

  if (current.autoEditStatus === ASSIST_STATUS_READY || current.autoEditStatus === 'complete') {
    return { disposition: 'conflict' };
  }

  const noChargePredicate = {
    $and: [
      { $or: [{ assistCreditTransactionId: { $exists: false } }, { assistCreditTransactionId: null }] },
      { $or: [{ assistChargedCredits: { $exists: false } }, { assistChargedCredits: null }] },
    ],
  };
  const active = current.autoEditStatus === ASSIST_STATUS_SCAN_FAILED
    ? { modifiedCount: 0 }
    : await projects.updateOne(
        {
          projectId,
          userId,
          editMode: 'assist',
          autoEditStatus: { $nin: [ASSIST_STATUS_SCAN_FAILED, ASSIST_STATUS_READY, 'complete'] },
          ...noChargePredicate,
        },
        {
          $set: {
            assistCreditTransactionId: creditTransactionId,
            assistChargedCredits: chargedCredits,
          },
        },
      );
  if (active.modifiedCount === 1) return { disposition: 'registered', terminal: false };

  const terminal = await projects.updateOne(
    {
      projectId,
      userId,
      editMode: 'assist',
      autoEditStatus: ASSIST_STATUS_SCAN_FAILED,
      ...noChargePredicate,
    },
    {
      $set: {
        assistCreditTransactionId: creditTransactionId,
        assistChargedCredits: chargedCredits,
        assistRefundPending: true,
      },
    },
  );
  if (terminal.modifiedCount === 1) return { disposition: 'registered', terminal: true };

  const latest = await projects.findOne(
    { projectId, userId },
    {
      projection: {
        editMode: 1,
        autoEditStatus: 1,
        assistCreditTransactionId: 1,
        assistChargedCredits: 1,
      },
    },
  );
  if (!latest || !isAssistProject(latest)) return { disposition: 'conflict' };
  if (
    latest.assistCreditTransactionId === creditTransactionId
    && latest.assistChargedCredits === chargedCredits
  ) {
    return {
      disposition: 'already-registered',
      terminal: latest.autoEditStatus === ASSIST_STATUS_SCAN_FAILED,
    };
  }
  return { disposition: 'conflict' };
}

export interface AssistScanFailureSettlementInput {
  projectId: string;
  userId: string;
  reason: string;
  /** The exact durable deduction identity carried by this worker chain. */
  creditTransactionId?: string;
}

export type AssistScanFailureSettlementDisposition =
  | 'refunded'
  | 'transition-lost'
  | 'refund-pending'
  | 'unverifiable-run'
  | 'not-assist';

/**
 * Settle a failed assist scan: atomic terminal transition + refund-where-deducted.
 * ONE implementation for all three workers (video-analysis, tribe-analysis,
 * director) — battle-lane finding: stage-2/3 failures previously kept the charge.
 *
 * Money rules enforced here:
 * - A worker may fail/refund only the exact deduction identity it received at
 *   intake. A stale or legacy message without that identity fails closed.
 * - `assistRefundPending` is committed before the external wallet call, so a
 *   crash between project terminalization and refund is recoverable.
 * - The transaction is consumed ($unset) ONLY on a confirmed successful refund —
 *   refundCredits reports failure by return value, not only by throwing.
 * - A redelivery may resume the same pending refund; CreditsService makes the
 *   external refund idempotent on the original transaction.
 *
 * `db` is passed in and CreditsService is imported lazily so this module stays
 * import-safe for env-less consumers.
 */
export async function settleAssistScanFailure(
  db: { collection: (name: string) => any },
  input: AssistScanFailureSettlementInput,
): Promise<AssistScanFailureSettlementDisposition> {
  const projectId = input.projectId.trim();
  const userId = input.userId.trim();
  const reason = input.reason.trim();
  const expectedTransactionId = input.creditTransactionId?.trim();
  if (!projectId || !userId || !reason) return 'unverifiable-run';

  const laneDoc = await db.collection('projects').findOne(
    { projectId, userId },
    {
      projection: {
        editMode: 1,
        autoEditStatus: 1,
        assistCreditTransactionId: 1,
        assistChargedCredits: 1,
        assistRefundPending: 1,
        assistRefundedAt: 1,
        userId: 1,
        orgId: 1,
        visibility: 1,
      },
    },
  );
  if (!laneDoc) return 'transition-lost';
  if (!isAssistProject(laneDoc)) return 'not-assist';

  const txId = typeof laneDoc?.assistCreditTransactionId === 'string' ? laneDoc.assistCreditTransactionId : null;
  const charged = typeof laneDoc?.assistChargedCredits === 'number' ? laneDoc.assistChargedCredits : null;
  if (!expectedTransactionId || txId !== expectedTransactionId) {
    console.warn('[DirectorMode] Assist failure ignored because its deduction identity is absent or stale:', {
      projectId,
      hasExpectedTransactionId: Boolean(expectedTransactionId),
    });
    return 'unverifiable-run';
  }
  const alreadyPending = laneDoc.autoEditStatus === ASSIST_STATUS_SCAN_FAILED
    && laneDoc.assistRefundPending === true;
  if (!alreadyPending) {
    const transition = await db.collection('projects').updateOne(
      {
        projectId,
        userId,
        editMode: 'assist',
        assistCreditTransactionId: txId,
        autoEditStatus: { $nin: [ASSIST_STATUS_SCAN_FAILED, ASSIST_STATUS_READY, 'complete'] },
      },
      {
        $set: {
          autoEditStatus: ASSIST_STATUS_SCAN_FAILED,
          autoEditError: reason,
          assistRefundPending: true,
        },
      },
    );
    if (transition.modifiedCount !== 1) {
      return 'transition-lost';
    }
  }

  if (charged === null || !Number.isFinite(charged) || charged < 0) {
    console.error('[DirectorMode][REFUND-SKIPPED][MONEY] assist scan has an invalid persisted charge:', {
      projectId,
      charged,
    });
    return 'refund-pending';
  }

  try {
    const { CreditsService } = await import('@/lib/services/creditsService');
    const { resolveBillingOwner } = await import('./project-ownership');
    const { isOrgWalletBillingEnabled } = await import('@/lib/services/org-wallet-flag');
    // Refund the SAME wallet the assist scan was billed to (P2/D5). laneDoc carries the project's
    // persisted ownership, so an org-billed Director Mode scan refunds the org — never the actor's
    // personal wallet. Flag off / personal project => the member's wallet, exactly as before.
    const wallet = resolveBillingOwner(
      userId,
      { projectId, orgId: laneDoc?.orgId, visibility: laneDoc?.visibility },
      isOrgWalletBillingEnabled(),
    );
    const result = await CreditsService.refundForWallet(
      wallet,
      charged,
      reason,
      { service: 'editron', action: 'auto_edit_analysis', originalTransactionId: txId, projectId },
    );
    if (result && result.success === false) {
      console.error('[DirectorMode][REFUND-FAILED][MONEY] refundCredits returned failure — flagging for support:', { projectId, error: (result as { error?: unknown }).error });
      return 'refund-pending';
    }
    // Consume the transaction ONLY after a confirmed refund.
    const finalized = await db.collection('projects').updateOne(
      {
        projectId,
        userId,
        editMode: 'assist',
        autoEditStatus: ASSIST_STATUS_SCAN_FAILED,
        assistRefundPending: true,
        assistCreditTransactionId: txId,
        assistChargedCredits: charged,
      },
      {
        $set: { assistRefundedAt: new Date() },
        $unset: {
          assistCreditTransactionId: '',
          assistChargedCredits: '',
          assistRefundPending: '',
        },
      },
    );
    if (finalized.modifiedCount !== 1) {
      console.error('[DirectorMode][REFUND-RECORD-STALE][MONEY] wallet refund succeeded but exact project finalization was lost:', { projectId });
      return 'refund-pending';
    }
    return 'refunded';
  } catch (refundErr: unknown) {
    console.error('[DirectorMode][REFUND-FAILED][MONEY] assist scan refund threw — flagging for support:', refundErr instanceof Error ? refundErr.message : refundErr);
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
