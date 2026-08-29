import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import {
  createMediaSourceAudioArtifactAssetMongoPortsV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from './media-source-audio-artifact-asset-owner-v1';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import { classifyMediaSourceTimestampManagementV1 } from './media-source-timestamp-management-v1';
import type { ProjectRevisionV1 } from './project-service';
import { resolveVerifiedVideoSourceEpochTimeBindingV3 } from './video-source-time-transform-v1';

export const NATIVE_MEDIA_FINAL_RENDER_ADMISSION_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ADMISSION_V1' as const;

const MAX_VIDEO_OVERLAYS_V1 = 100_000;

export type NativeMediaFinalRenderAdmissionBlockReasonV1 =
  | 'INPUT_INVALID'
  | 'VIDEO_ASSET_ID_REQUIRED'
  | 'VIDEO_OVERLAY_ID_DUPLICATE'
  | 'ASSET_UNAVAILABLE'
  | 'ASSET_SCOPE_INVALID'
  | 'ASSET_CHANGED_DURING_ADMISSION'
  | 'LEGACY_TIMESTAMP_MIGRATION_REQUIRED'
  | 'TIMESTAMP_GENERATIONS_CONFLICT'
  | 'V3_TIMESTAMP_STATE_INVALID'
  | 'EXACT_TIMESTAMP_RENDER_SOURCE_REQUIRED'
  | 'RUNTIME_UNAVAILABLE';

export type NativeMediaFinalRenderAdmissionReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_ADMISSION_KIND_V1;
  projectId: string;
  sequenceId: string;
  projectRevision: ProjectRevisionV1;
  videoOverlays: readonly Readonly<{
    overlayId: string;
    assetId: string;
    overlayTimingSha256: string;
    assetTimingStateSha256: string;
    decision: 'ORDINARY_FRAME_RATE_RENDER_PATH';
  }>[];
  receiptSha256: string;
}>;

export type NativeMediaFinalRenderAdmissionResultV1 = Readonly<
  | {
      disposition: 'ADMITTED_ORDINARY_MEDIA';
      receipt: NativeMediaFinalRenderAdmissionReceiptV1;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason: NativeMediaFinalRenderAdmissionBlockReasonV1;
      overlayId: string | null;
      assetId: string | null;
      diagnostic: string | null;
    }
>;

export async function admitNativeMediaFinalRenderV1(input: Readonly<{
  userId: string;
  projectId: string;
  sequenceId: string;
  projectRevision: ProjectRevisionV1;
  overlays: readonly Overlay[];
  assetReader: Pick<MediaSourceAudioArtifactAssetStorePortsV1, 'load'>;
}>): Promise<NativeMediaFinalRenderAdmissionResultV1> {
  let userId: string;
  let projectId: string;
  let sequenceId: string;
  let projectRevision: ProjectRevisionV1;
  let videos: readonly NormalizedVideoOverlayV1[];
  try {
    userId = identifier(input.userId, 'NATIVE_MEDIA_RENDER_USER_INVALID');
    projectId = identifier(input.projectId, 'NATIVE_MEDIA_RENDER_PROJECT_INVALID');
    sequenceId = identifier(input.sequenceId, 'NATIVE_MEDIA_RENDER_SEQUENCE_INVALID');
    projectRevision = normalizeRevision(input.projectRevision);
    videos = normalizeVideoOverlays(input.overlays);
  } catch (error) {
    const code = diagnostic(error);
    return blocked(
      code === 'NATIVE_MEDIA_RENDER_VIDEO_ASSET_REQUIRED'
        ? 'VIDEO_ASSET_ID_REQUIRED'
        : code === 'NATIVE_MEDIA_RENDER_OVERLAY_DUPLICATE'
          ? 'VIDEO_OVERLAY_ID_DUPLICATE'
          : 'INPUT_INVALID',
      null,
      null,
      code,
    );
  }

  const admitted: NativeMediaFinalRenderAdmissionReceiptV1['videoOverlays'][number][] = [];
  const firstReads = new Map<string, Readonly<{
    asset: MediaSourceAudioArtifactAssetStateInputV1;
    timingStateSha256: string;
  }>>();

  for (const overlay of videos) {
    let assetRead = firstReads.get(overlay.assetId);
    if (!assetRead) {
      let asset: MediaSourceAudioArtifactAssetStateInputV1 | null;
      try {
        asset = await input.assetReader.load(overlay.assetId, userId);
      } catch {
        return blocked('ASSET_UNAVAILABLE', overlay.overlayId, overlay.assetId, null);
      }
      if (!asset) {
        return blocked('ASSET_UNAVAILABLE', overlay.overlayId, overlay.assetId, null);
      }
      if (asset.assetId !== overlay.assetId || asset.type !== 'video') {
        return blocked('ASSET_SCOPE_INVALID', overlay.overlayId, overlay.assetId, null);
      }
      assetRead = Object.freeze({
        asset,
        timingStateSha256: assetTimingStateSha256(asset),
      });
      firstReads.set(overlay.assetId, assetRead);
    }

    const management = classifyMediaSourceTimestampManagementV1(assetRead.asset);
    if (management === 'EARLIER') {
      return blocked(
        'LEGACY_TIMESTAMP_MIGRATION_REQUIRED',
        overlay.overlayId,
        overlay.assetId,
        null,
      );
    }
    if (management === 'CONFLICTING') {
      return blocked(
        'TIMESTAMP_GENERATIONS_CONFLICT',
        overlay.overlayId,
        overlay.assetId,
        null,
      );
    }
    if (management === 'V3') {
      try {
        const binding = resolveVerifiedVideoSourceEpochTimeBindingV3(assetRead.asset);
        if (!binding || binding.assetId !== overlay.assetId) {
          throw new Error('NATIVE_MEDIA_RENDER_V3_BINDING_INVALID');
        }
      } catch (error) {
        return blocked(
          'V3_TIMESTAMP_STATE_INVALID',
          overlay.overlayId,
          overlay.assetId,
          diagnostic(error),
        );
      }
      return blocked(
        'EXACT_TIMESTAMP_RENDER_SOURCE_REQUIRED',
        overlay.overlayId,
        overlay.assetId,
        null,
      );
    }

    admitted.push(Object.freeze({
      overlayId: overlay.overlayId,
      assetId: overlay.assetId,
      overlayTimingSha256: overlay.overlayTimingSha256,
      assetTimingStateSha256: assetRead.timingStateSha256,
      decision: 'ORDINARY_FRAME_RATE_RENDER_PATH' as const,
    }));
  }

  for (const [assetId, first] of firstReads) {
    let fresh: MediaSourceAudioArtifactAssetStateInputV1 | null;
    try {
      fresh = await input.assetReader.load(assetId, userId);
    } catch {
      return blocked('ASSET_CHANGED_DURING_ADMISSION', null, assetId, null);
    }
    if (!fresh || fresh.assetId !== assetId || fresh.type !== 'video'
      || assetTimingStateSha256(fresh) !== first.timingStateSha256) {
      return blocked('ASSET_CHANGED_DURING_ADMISSION', null, assetId, null);
    }
  }

  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_ADMISSION_KIND_V1,
    projectId,
    sequenceId,
    projectRevision,
    videoOverlays: admitted,
  };
  return Object.freeze({
    disposition: 'ADMITTED_ORDINARY_MEDIA' as const,
    receipt: Object.freeze({
      ...material,
      receiptSha256: hashEditronCanonicalJsonV1(material),
    }),
  });
}

export async function admitNativeMediaFinalRenderUsingRuntimeV1(input: Readonly<{
  userId: string;
  projectId: string;
  sequenceId: string;
  projectRevision: ProjectRevisionV1;
  overlays: readonly Overlay[];
}>): Promise<NativeMediaFinalRenderAdmissionResultV1> {
  let userId: string;
  try {
    userId = identifier(input.userId, 'NATIVE_MEDIA_RENDER_USER_INVALID');
    const ports = await createMediaSourceAudioArtifactAssetMongoPortsV1();
    return admitNativeMediaFinalRenderV1({
      ...input,
      userId,
      assetReader: ports,
    });
  } catch (error) {
    return blocked('RUNTIME_UNAVAILABLE', null, null, diagnostic(error));
  }
}

type NormalizedVideoOverlayV1 = Readonly<{
  overlayId: string;
  assetId: string;
  overlayTimingSha256: string;
}>;

function normalizeVideoOverlays(overlays: readonly Overlay[]): readonly NormalizedVideoOverlayV1[] {
  if (!Array.isArray(overlays)) throw new Error('NATIVE_MEDIA_RENDER_OVERLAYS_INVALID');
  const videos = overlays.filter((overlay) => overlay?.type === 'video');
  if (videos.length > MAX_VIDEO_OVERLAYS_V1) {
    throw new Error('NATIVE_MEDIA_RENDER_OVERLAY_LIMIT_EXCEEDED');
  }
  const seen = new Set<string>();
  return videos.map((overlay) => {
    const overlayId = identifier(String(overlay.id), 'NATIVE_MEDIA_RENDER_OVERLAY_INVALID');
    if (seen.has(overlayId)) throw new Error('NATIVE_MEDIA_RENDER_OVERLAY_DUPLICATE');
    seen.add(overlayId);
    if (typeof overlay.assetId !== 'string' || !overlay.assetId.trim()) {
      throw new Error('NATIVE_MEDIA_RENDER_VIDEO_ASSET_REQUIRED');
    }
    const assetId = identifier(overlay.assetId, 'NATIVE_MEDIA_RENDER_ASSET_INVALID');
    const sourceStartFrame = overlay.sourceStartFrame ?? overlay.videoStartTime ?? 0;
    if (overlay.sourceStartFrame !== undefined && overlay.videoStartTime !== undefined
      && overlay.sourceStartFrame !== overlay.videoStartTime) {
      throw new Error('NATIVE_MEDIA_RENDER_SOURCE_START_CONFLICT');
    }
    const timing = {
      overlayId,
      assetId,
      from: nonNegativeInteger(overlay.from),
      durationInFrames: positiveInteger(overlay.durationInFrames),
      sourceStartFrame: nonNegativeInteger(sourceStartFrame),
      sourceEndFrame: overlay.sourceEndFrame === undefined || overlay.sourceEndFrame === null
        ? null
        : positiveInteger(overlay.sourceEndFrame),
      speed: overlay.speed ?? 1,
      speedCurve: overlay.speedCurve ?? null,
      speedKeyframes: overlay.keyframeTracks?.filter(
        (track: { property?: string }) => track.property === 'speed',
      ) ?? [],
    };
    return Object.freeze({
      overlayId,
      assetId,
      overlayTimingSha256: hashEditronCanonicalJsonV1(timing),
    });
  });
}

function assetTimingStateSha256(asset: MediaSourceAudioArtifactAssetStateInputV1): string {
  const state = asset as Record<string, unknown>;
  const source = record(state.sourceVersionV1);
  const storage = record(source?.storageVersion);
  return hashEditronCanonicalJsonV1({
    assetId: state.assetId,
    type: state.type,
    sourceVersionSha256: source?.sourceVersionSha256 ?? null,
    storageVersionSha256: storage?.storageVersionSha256 ?? null,
    sourcePtsCadenceMapStateSha256V1: state.sourcePtsCadenceMapStateSha256V1 ?? null,
    sourcePtsCadenceMapStateSha256V2: state.sourcePtsCadenceMapStateSha256V2 ?? null,
    sourcePtsCadenceMapStateSha256V3: state.sourcePtsCadenceMapStateSha256V3 ?? null,
  });
}

function normalizeRevision(value: ProjectRevisionV1): ProjectRevisionV1 {
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.value) || value.value < 0
    || typeof value.compatibilityUpdatedAt !== 'string'
    || value.compatibilityUpdatedAt.length > 128
    || Number.isNaN(Date.parse(value.compatibilityUpdatedAt))) {
    throw new Error('NATIVE_MEDIA_RENDER_REVISION_INVALID');
  }
  return Object.freeze({ ...value });
}

function blocked(
  reason: NativeMediaFinalRenderAdmissionBlockReasonV1,
  overlayId: string | null,
  assetId: string | null,
  detail: string | null,
): NativeMediaFinalRenderAdmissionResultV1 {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    overlayId,
    assetId,
    diagnostic: detail,
  });
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 256
    || /[\u0000-\u001F\u007F]/.test(value)) throw new Error(code);
  return value.trim();
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('NATIVE_MEDIA_RENDER_INTEGER_INVALID');
  }
  return Number(value);
}

function positiveInteger(value: unknown): number {
  const normalized = nonNegativeInteger(value);
  if (normalized < 1) throw new Error('NATIVE_MEDIA_RENDER_INTEGER_INVALID');
  return normalized;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,160}$/.test(error.message)
    ? error.message
    : null;
}
