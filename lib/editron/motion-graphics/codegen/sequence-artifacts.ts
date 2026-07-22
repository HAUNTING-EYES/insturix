/**
 * MG sequence artifacts — shared post-render persistence (async-MG Phase 1, 2026-07-22).
 *
 * Extracted VERBATIM from applyGraphic's inline post-render block (edl-executor) so BOTH executors of a
 * completed MG render persist IDENTICAL artifacts:
 *   - the director's inline path (today), and
 *   - the async mg-render worker (Phase 2), which completes the job after the director has already returned.
 *
 * Two functions, deliberately split, so each caller keeps its own failure semantics:
 *   - upsertMgSequenceAsset: mediaAssets upsert + storage accounting. Throws on persistence failure — the
 *     director maps that to its 'fallback' outcome (sequence retained for retry); the worker maps it to a
 *     job failure so the durable-job lease/retry machinery re-runs persistence.
 *   - buildMgSequenceOverlay: the MG_SEQUENCE overlay object. Pure. The caller owns attachment
 *     (director: overlays.push; worker: $push onto project.overlays — the audio-worker pattern,
 *     _workerAdded so saveProject preserves it).
 *
 * Every field is copied byte-for-byte from the original block — no new values, no new thresholds.
 */

import { OverlayType, type MgSequenceOverlay } from '@/components/editron/editor/version-7.0.0/types';
import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import type { MgSequenceOutput } from '@/lib/editron/motion-graphics/codegen/render/render-moment';
import type { MgReceipt } from '@/lib/editron/motion-graphics/codegen/types';
import { ROW } from '@/lib/pipeline/scene-to-editron';

export function mgSequenceAssetId(sequence: Pick<MgSequenceOutput, 'address'>): string {
  return `mgseq_${sequence.address.sequenceId}`;
}

export interface UpsertMgSequenceAssetInput {
  sequence: MgSequenceOutput;
  receipt: MgReceipt;
  candidate: { id: string; factKind: string };
  userId: string;
  projectId: string;
  orgId?: string | null;
  /** The moment's codegen provenance stamped on the asset doc (momentInput.window/expressiveness/placement). */
  codegenContext: { window: unknown; expressiveness: unknown; placement: unknown };
  now?: Date;
}

export interface UpsertMgSequenceAssetResult {
  assetId: string;
  inserted: boolean;
}

/** mediaAssets upsert + storage accounting for a rendered MG sequence. Throws on persistence failure. */
export async function upsertMgSequenceAsset(input: UpsertMgSequenceAssetInput): Promise<UpsertMgSequenceAssetResult> {
  const { sequence, receipt, candidate, userId, projectId, orgId } = input;
  const assetId = mgSequenceAssetId(sequence);
  const now = input.now ?? new Date();
  const db = await getDatabase();
  const assets = db.collection(COLLECTIONS.MEDIA_ASSETS);

  const write = await assets.updateOne(
    { assetId, userId },
    {
      $set: { lastUsedAt: now },
      $setOnInsert: {
        assetId,
        userId,
        ...(orgId ? { orgId } : {}),
        projectId,
        type: 'sequence',
        source: 'generated',
        filename: `${candidate.id}.mg-sequence`,
        gcsPath: null,
        cachedUrl: sequence.address.cdnBaseUrl,
        publicUrl: sequence.address.cdnBaseUrl,
        urlExpiresAt: new Date('2100-01-01T00:00:00.000Z'),
        size: sequence.sizeBytes,
        dimensions: { width: sequence.width, height: sequence.height },
        uploadedAt: now,
        pinned: false,
        sequenceId: sequence.address.sequenceId,
        frameCount: sequence.address.frameCount,
        fps: sequence.fps,
        frameFormat: sequence.frameFormat,
        transparent: sequence.transparent,
        status: 'ready',
        r2Prefix: sequence.r2Prefix,
        cdnBaseUrl: sequence.address.cdnBaseUrl,
        address: sequence.address,
        codegen: {
          candidateId: candidate.id,
          factKind: candidate.factKind,
          receipt,
          window: input.codegenContext.window,
          expressiveness: input.codegenContext.expressiveness,
          placement: input.codegenContext.placement,
          renderMs: sequence.renderMs,
        },
      },
    },
    { upsert: true },
  );
  const inserted = write.upsertedCount > 0;
  if (inserted) {
    const { recordStorageUsage, resolveStorageOwner } = await import('@/lib/services/storage-quota-service');
    await recordStorageUsage(resolveStorageOwner(userId, orgId ?? undefined), sequence.sizeBytes);
  }
  return { assetId, inserted };
}

export interface BuildMgSequenceOverlayInput {
  sequence: MgSequenceOutput;
  receipt: MgReceipt;
  candidate: { id: string; factKind: string };
  assetId: string;
  /** Computed by the DIRECTOR at decision time (deterministicOverlayId over loop state) and carried to the worker. */
  overlayId: number;
  snappedFrame: number;
  canvas: { width: number; height: number };
  metadata: {
    atomicPlacement: unknown;
    mgExpressionAuthority: unknown;
    edlSource?: string;
    edlReason?: string;
  };
}

/** The MG_SEQUENCE overlay object, byte-identical to the director's original inline construction. */
export function buildMgSequenceOverlay(
  input: BuildMgSequenceOverlayInput,
): MgSequenceOverlay & { metadata: Record<string, unknown> } {
  const { sequence, candidate } = input;
  return {
    id: input.overlayId,
    type: OverlayType.MG_SEQUENCE,
    assetId: input.assetId,
    from: input.snappedFrame,
    durationInFrames: sequence.address.frameCount,
    row: ROW.MOTION_GRAPHICS,
    left: 0,
    top: 0,
    width: input.canvas.width,
    height: input.canvas.height,
    isDragging: false,
    rotation: 0,
    _workerAdded: true,
    styles: { opacity: 1 },
    sequence: {
      sequenceId: sequence.address.sequenceId,
      frameCount: sequence.address.frameCount,
      fps: sequence.fps,
      width: sequence.width,
      height: sequence.height,
      transparent: true,
      frameFormat: 'webp',
      cdnBaseUrl: sequence.address.cdnBaseUrl,
    },
    metadata: {
      sourceType: 'edl-mg-codegen',
      candidateId: candidate.id,
      factKind: candidate.factKind,
      atomicPlacement: input.metadata.atomicPlacement,
      mgExpressionAuthority: input.metadata.mgExpressionAuthority,
      receipt: input.receipt,
      edlSource: input.metadata.edlSource,
      edlReason: input.metadata.edlReason,
    },
  };
}
