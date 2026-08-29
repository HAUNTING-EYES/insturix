import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import {
  createNativeMediaTimestampPreviewWindowV2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_MAX_FRAMES_V2,
  type NativeMediaTimestampPreviewWindowV2,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';
import {
  assertNativeMediaTimestampPreviewClassificationLeaseV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_LEASE_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_MAX_TTL_MS_V1,
  type NativeMediaTimestampPreviewClassificationLeaseV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-contract-v1';

import { readCanonicalFrameRateV1 } from '../contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type { MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 } from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceEpochWindowResourcePolicyV3 } from './media-source-pts-cadence-epoch-window-reader-v3';
import {
  createMediaSourcePtsCadenceMapAssetMongoPortsV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  createNativeMediaTimestampFfmpegPreviewDecoderV1,
  createVerifiedAssetNativeMediaTimestampPreviewSourceLeasePortV1,
  type NativeMediaTimestampPreviewDecoderPolicyV1,
} from './native-media-timestamp-ffmpeg-preview-decoder-v1';
import {
  consumeNativeMediaTimestampTransformV1,
  projectServiceNativeMediaProjectRevisionReaderV1,
  type NativeMediaProjectRevisionReaderPortV1,
  type NativeMediaTimestampDecoderResourcePolicyV1,
  type NativeMediaTimestampMaterializingDecoderV1,
} from './native-media-timestamp-consumer-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_DEFAULT_POLICY_V1,
  type NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
  type NativeMediaTimestampPreviewSurfacePolicyV1,
} from './native-media-timestamp-r2-preview-surface-v1';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import type { Project, ProjectRevisionV1 } from './project-service';
import {
  createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3,
  resolveVerifiedVideoSourceEpochTimeBindingV3,
  type VideoSourceTimestampConformResourcePolicyV2,
} from './video-source-time-transform-v1';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_V1' as const;

export type NativeMediaTimestampPreviewMaterializerPolicyV1 = Readonly<{
  policyVersion: string;
  maxWindowFrames: number;
  minimumRemainingLeaseMs: number;
  renewBeforeExpiryMs: number;
  maximumSurfaceLeaseTtlMs: number;
  classificationLeaseTtlMs: number;
  classificationRenewBeforeExpiryMs: number;
  epochWindow: MediaSourcePtsCadenceEpochWindowResourcePolicyV3;
  conform: VideoSourceTimestampConformResourcePolicyV2;
  decoderResource: NativeMediaTimestampDecoderResourcePolicyV1;
  decoder: NativeMediaTimestampPreviewDecoderPolicyV1;
  surface: NativeMediaTimestampPreviewSurfacePolicyV1;
}>;

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1:
NativeMediaTimestampPreviewMaterializerPolicyV1 = Object.freeze({
  policyVersion: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_VERSION_V1,
  maxWindowFrames: 120,
  minimumRemainingLeaseMs: 15 * 60 * 1_000,
  renewBeforeExpiryMs: 5 * 60 * 1_000,
  maximumSurfaceLeaseTtlMs: 60 * 60 * 1_000,
  classificationLeaseTtlMs: 30_000,
  classificationRenewBeforeExpiryMs: 10_000,
  epochWindow: Object.freeze({
    policyVersion: 'EDITRON_NATIVE_PREVIEW_EPOCH_WINDOW_V1',
    maxFrameRecords: 100_000,
    maxBatchReads: 10_000,
    maxTotalReadBytes: 2 * 1024 * 1024 * 1024,
  }),
  conform: Object.freeze({
    policyVersion: 'EDITRON_NATIVE_PREVIEW_CONFORM_V1',
    maxSourceFrames: 100_000,
    maxFrameQueries: 120,
  }),
  decoderResource: Object.freeze({
    policyVersion: 'EDITRON_NATIVE_PREVIEW_DECODE_RESOURCE_V1',
    maxUniquePictures: 120,
    maxDecodedBytes: 2 * 1024 * 1024 * 1024,
    maxCodedDimension: 8_192,
    maxDisplayDimension: 8_192,
  }),
  decoder: Object.freeze({
    policyVersion: 'EDITRON_NATIVE_PREVIEW_FFMPEG_V1',
    maxSourceBytes: 8 * 1024 * 1024 * 1024,
    maxPictures: 120,
    maxEncodedPreviewBytes: 512 * 1024 * 1024,
    timeoutMs: 10 * 60 * 1_000,
  }),
  surface: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_DEFAULT_POLICY_V1,
});

export type NativeMediaTimestampPreviewMaterializerReasonV1 =
  | 'INPUT_INVALID'
  | 'PROJECT_UNAVAILABLE'
  | 'PROJECT_SCOPE_INVALID'
  | 'PROJECT_REVISION_STALE'
  | 'PROJECT_RATE_AMBIGUOUS'
  | 'OVERLAY_NOT_FOUND'
  | 'OVERLAY_INVALID'
  | 'OVERLAY_RETIME_UNSUPPORTED'
  | 'ASSET_UNAVAILABLE'
  | 'ASSET_SCOPE_INVALID'
  | 'LEGACY_TIME_MAP_MIGRATION_REQUIRED'
  | 'EXACT_AUDIO_MAPPING_REQUIRED'
  | 'SOURCE_WINDOW_REQUIRES_EXPLICIT_END'
  | 'SOURCE_WINDOW_RESOURCE_LIMIT'
  | 'CONFORM_UNVERIFIABLE'
  | 'CONFORM_FAILED'
  | 'DECODER_FACTORY_FAILED'
  | 'CONSUMPTION_UNVERIFIABLE'
  | 'ASSET_CHANGED_DURING_MATERIALIZATION'
  | 'PROJECT_CHANGED_DURING_MATERIALIZATION'
  | 'LEASE_UNUSABLE'
  | 'WINDOW_BUILD_FAILED'
  | 'CLEANUP_FAILED'
  | 'RUNTIME_UNAVAILABLE';

export type NativeMediaTimestampPreviewMaterializerResultV1 = Readonly<
  | {
      disposition: 'NOT_APPLICABLE';
      reason: 'ASSET_NOT_TIMESTAMP_MANAGED';
      classificationLease: NativeMediaTimestampPreviewClassificationLeaseV1;
    }
  | {
      disposition: 'WINDOW_MATERIALIZED';
      window: NativeMediaTimestampPreviewWindowV2;
      sourcePtsCadenceMapStateSha256V3: string;
      transformSha256: string;
      materializedPictureCount: number;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason: NativeMediaTimestampPreviewMaterializerReasonV1;
      diagnostic: string | null;
    }
>;

export type NativeMediaTimestampPreviewMaterializerInputV1 = Readonly<{
  userId: string;
  projectId: string;
  sequenceId: string;
  overlayId: string | number;
  expectedProjectRevision?: ProjectRevisionV1;
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
}>;

export type NativeMediaTimestampPreviewMaterializerPortsV1 = Readonly<{
  projectSnapshotReader: Readonly<{
    loadProjectForMutation(userId: string, projectId: string): Promise<{
      project: Project;
      revision: ProjectRevisionV1;
    }>;
  }>;
  projectRevisionReader: NativeMediaProjectRevisionReaderPortV1;
  assetReader: Readonly<{
    load(assetId: string, userId: string): Promise<MediaSourcePtsCadenceMapAssetStateInputV3 | null>;
  }>;
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  createDecoder(input: Readonly<{
    asset: MediaSourcePtsCadenceMapAssetStateInputV3;
    leaseScope: NativeMediaTimestampPreviewSurfaceLeaseScopeV1;
    materializationStartedAtEpochMs: number;
  }>): Readonly<{
    decoder: NativeMediaTimestampMaterializingDecoderV1;
    surfaceExpiresAtEpochMs: number;
  }>;
  policy: NativeMediaTimestampPreviewMaterializerPolicyV1;
  now?: () => number;
}>;

export async function materializeNativeMediaTimestampPreviewWindowV1(
  input: NativeMediaTimestampPreviewMaterializerInputV1,
  ports: NativeMediaTimestampPreviewMaterializerPortsV1,
): Promise<NativeMediaTimestampPreviewMaterializerResultV1> {
  let scope: ReturnType<typeof normalizeInput>;
  let policy: NativeMediaTimestampPreviewMaterializerPolicyV1;
  try {
    scope = normalizeInput(input);
    policy = normalizePolicy(ports.policy);
  } catch (error) {
    return unverifiable('INPUT_INVALID', diagnostic(error));
  }
  const now = ports.now ?? Date.now;
  let snapshot: Awaited<ReturnType<typeof ports.projectSnapshotReader.loadProjectForMutation>>;
  try {
    snapshot = await ports.projectSnapshotReader.loadProjectForMutation(scope.userId, scope.projectId);
  } catch {
    return unverifiable('PROJECT_UNAVAILABLE', null);
  }
  if (snapshot.project.projectId !== scope.projectId || scope.sequenceId !== 'main') {
    return unverifiable('PROJECT_SCOPE_INVALID', null);
  }
  if (scope.expectedProjectRevision
    && !sameRevision(snapshot.revision, scope.expectedProjectRevision)) {
    return unverifiable('PROJECT_REVISION_STALE', null);
  }
  const projectRateRead = readCanonicalFrameRateV1(snapshot.project.fps);
  if (projectRateRead.provenance === 'LEGACY_NUMERIC_DECIMAL_V1'
    && !Number.isSafeInteger(snapshot.project.fps)) {
    return unverifiable('PROJECT_RATE_AMBIGUOUS', null);
  }
  const candidate = snapshot.project.overlays.find(
    (overlay) => String(overlay.id) === scope.overlayId,
  );
  if (!candidate) return unverifiable('OVERLAY_NOT_FOUND', null);
  let overlay: ReturnType<typeof normalizeVideoOverlay>;
  try {
    overlay = normalizeVideoOverlay(candidate);
  } catch (error) {
    return unverifiable('OVERLAY_INVALID', diagnostic(error));
  }
  if (overlay.retimed) return unverifiable('OVERLAY_RETIME_UNSUPPORTED', null);
  if (scope.windowLocalStartFrame + scope.windowDurationInFrames > overlay.durationInFrames
    || scope.windowDurationInFrames > policy.maxWindowFrames) {
    return unverifiable('INPUT_INVALID', 'NATIVE_MEDIA_PREVIEW_WINDOW_RANGE_INVALID');
  }
  let asset: MediaSourcePtsCadenceMapAssetStateInputV3 | null;
  try {
    asset = await ports.assetReader.load(overlay.assetId, scope.userId);
  } catch {
    return unverifiable('ASSET_UNAVAILABLE', null);
  }
  if (asset) {
    if (asset.assetId !== overlay.assetId || asset.type !== 'video') {
      return unverifiable('ASSET_SCOPE_INVALID', null);
    }
    const management = timestampManagement(asset);
    if (management === 'NONE') {
      let classificationLease: NativeMediaTimestampPreviewClassificationLeaseV1;
      try {
        const issuedAtEpochMs = epochMs(now());
        const expiresAtEpochMs = epochMs(
          issuedAtEpochMs + policy.classificationLeaseTtlMs,
        );
        classificationLease = assertNativeMediaTimestampPreviewClassificationLeaseV1({
          schemaVersion: 1,
          kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_LEASE_KIND_V1,
          decision: 'ASSET_NOT_TIMESTAMP_MANAGED',
          projectId: scope.projectId,
          sequenceId: scope.sequenceId,
          overlayId: scope.overlayId,
          assetId: overlay.assetId,
          projectRevision: snapshot.revision,
          decisionStateSha256: hashEditronCanonicalJsonV1({
            schemaVersion: 1,
            decision: 'ASSET_NOT_TIMESTAMP_MANAGED',
            projectId: scope.projectId,
            sequenceId: scope.sequenceId,
            overlayId: scope.overlayId,
            assetId: overlay.assetId,
            projectRevision: snapshot.revision,
            cadenceStatePresent: {
              v1Map: false, v1Hash: false, v2Map: false, v2Hash: false,
              v3Map: false, v3Hash: false,
            },
          }),
          issuedAtEpochMs,
          refreshAfterEpochMs:
            expiresAtEpochMs - policy.classificationRenewBeforeExpiryMs,
          expiresAtEpochMs,
        });
      } catch (error) {
        return unverifiable('INPUT_INVALID', diagnostic(error));
      }
      return Object.freeze({
        disposition: 'NOT_APPLICABLE' as const,
        reason: 'ASSET_NOT_TIMESTAMP_MANAGED' as const,
        classificationLease,
      });
    }
    if (management === 'EARLIER') {
      return unverifiable('LEGACY_TIME_MAP_MIGRATION_REQUIRED', null);
    }
  }
  let binding: ReturnType<typeof resolveVerifiedVideoSourceEpochTimeBindingV3>;
  try {
    binding = asset === null ? null : resolveVerifiedVideoSourceEpochTimeBindingV3(asset);
  } catch (error) {
    return unverifiable('ASSET_SCOPE_INVALID', diagnostic(error));
  }
  if (!asset || !binding || binding.assetId !== overlay.assetId) {
    return unverifiable('ASSET_SCOPE_INVALID', null);
  }
  const hasAudio = sourceHasAudio(asset);
  if (hasAudio === null) return unverifiable('ASSET_SCOPE_INVALID', null);
  if (hasAudio) return unverifiable('EXACT_AUDIO_MAPPING_REQUIRED', null);

  const sourceStart = BigInt(overlay.sourceStartFrame);
  const totalSourceFrames = BigInt(binding.totalSourceFrameCount);
  const sourceEnd = overlay.sourceEndFrame === null
    ? totalSourceFrames
    : BigInt(overlay.sourceEndFrame);
  if (sourceStart >= sourceEnd || sourceEnd > totalSourceFrames) {
    return unverifiable('ASSET_SCOPE_INVALID', 'NATIVE_MEDIA_PREVIEW_SOURCE_RANGE_INVALID');
  }
  const sourceWindowFrames = sourceEnd - sourceStart;
  if (sourceWindowFrames > BigInt(policy.epochWindow.maxFrameRecords)) {
    return unverifiable(
      overlay.sourceEndFrame === null
        ? 'SOURCE_WINDOW_REQUIRES_EXPLICIT_END'
        : 'SOURCE_WINDOW_RESOURCE_LIMIT',
      null,
    );
  }
  const timelineQueries = Array.from(
    { length: scope.windowDurationInFrames },
    (_, index) => String(overlay.from + scope.windowLocalStartFrame + index),
  );
  let conform: Awaited<ReturnType<
    typeof createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3
  >>;
  try {
    conform = await createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3({
      asset,
      storedObjectReader: ports.storedObjectReader,
      firstFrameOrdinal: sourceStart.toString(),
      endExclusiveFrameOrdinal: sourceEnd.toString(),
      windowResourcePolicy: policy.epochWindow,
      projectRate: projectRateRead.rate,
      timelineStartFrame: String(overlay.from),
      timelineFrameQueries: timelineQueries,
      sourceAnchorFrameOrdinal: sourceStart.toString(),
      resourcePolicy: policy.conform,
    });
  } catch (error) {
    return unverifiable('CONFORM_FAILED', diagnostic(error));
  }
  if (conform.disposition === 'UNVERIFIABLE') {
    return unverifiable('CONFORM_UNVERIFIABLE', conform.reason);
  }

  const startedAt = epochMs(now());
  let created: ReturnType<NativeMediaTimestampPreviewMaterializerPortsV1['createDecoder']>;
  try {
    created = ports.createDecoder({
      asset,
      leaseScope: {
        userId: scope.userId,
        projectId: scope.projectId,
        sequenceId: scope.sequenceId,
        overlayId: scope.overlayId,
        projectRevision: snapshot.revision,
      },
      materializationStartedAtEpochMs: startedAt,
    });
  } catch (error) {
    return unverifiable('DECODER_FACTORY_FAILED', diagnostic(error));
  }
  if (!Number.isSafeInteger(created.surfaceExpiresAtEpochMs)
    || created.surfaceExpiresAtEpochMs <= startedAt
    || created.surfaceExpiresAtEpochMs - startedAt > policy.maximumSurfaceLeaseTtlMs) {
    return unverifiable('LEASE_UNUSABLE', null);
  }
  const consumed = await consumeNativeMediaTimestampTransformV1({
    userId: scope.userId,
    projectId: scope.projectId,
    sequenceId: scope.sequenceId,
    overlayId: scope.overlayId,
    projectRevision: snapshot.revision,
    asset,
    transform: conform.transform,
    decoder: created.decoder,
    decoderRelease: created.decoder,
    resourcePolicy: policy.decoderResource,
    projectRevisionReader: ports.projectRevisionReader,
  });
  if (consumed.disposition === 'UNVERIFIABLE') {
    return unverifiable('CONSUMPTION_UNVERIFIABLE', consumed.reason);
  }

  let freshAsset: MediaSourcePtsCadenceMapAssetStateInputV3 | null;
  try {
    freshAsset = await ports.assetReader.load(overlay.assetId, scope.userId);
  } catch {
    freshAsset = null;
  }
  let freshBinding: ReturnType<typeof resolveVerifiedVideoSourceEpochTimeBindingV3>;
  try {
    freshBinding = freshAsset === null
      ? null
      : resolveVerifiedVideoSourceEpochTimeBindingV3(freshAsset);
  } catch (error) {
    return releaseThen(
      created.decoder,
      consumed.receipt.decoderRequestSha256,
      'ASSET_CHANGED_DURING_MATERIALIZATION',
      diagnostic(error),
    );
  }
  if (!freshBinding || freshBinding.bindingSha256 !== binding.bindingSha256) {
    return releaseThen(created.decoder, consumed.receipt.decoderRequestSha256,
      'ASSET_CHANGED_DURING_MATERIALIZATION');
  }
  const issuedAtEpochMs = epochMs(now());
  const remainingLeaseMs = created.surfaceExpiresAtEpochMs - issuedAtEpochMs;
  const renewAfterEpochMs = created.surfaceExpiresAtEpochMs - policy.renewBeforeExpiryMs;
  if (remainingLeaseMs < policy.minimumRemainingLeaseMs
    || renewAfterEpochMs <= issuedAtEpochMs) {
    return releaseThen(created.decoder, consumed.receipt.decoderRequestSha256, 'LEASE_UNUSABLE');
  }
  let window: NativeMediaTimestampPreviewWindowV2;
  try {
    window = createNativeMediaTimestampPreviewWindowV2({
      receipt: consumed.receipt,
      overlayFromFrame: overlay.from,
      overlayDurationInFrames: overlay.durationInFrames,
      windowLocalStartFrame: scope.windowLocalStartFrame,
      windowDurationInFrames: scope.windowDurationInFrames,
      lease: {
        leaseId: `nmpwl2_${hashEditronCanonicalJsonV1({
          receiptSha256: consumed.receipt.receiptSha256,
          issuedAtEpochMs,
          renewAfterEpochMs,
          expiresAtEpochMs: created.surfaceExpiresAtEpochMs,
        })}`,
        issuedAtEpochMs,
        renewAfterEpochMs,
        expiresAtEpochMs: created.surfaceExpiresAtEpochMs,
      },
    });
  } catch (error) {
    return releaseThen(created.decoder, consumed.receipt.decoderRequestSha256,
      'WINDOW_BUILD_FAILED', diagnostic(error));
  }
  let finalRevision: ProjectRevisionV1;
  try {
    finalRevision = await ports.projectRevisionReader.getProjectRevision(
      scope.userId,
      scope.projectId,
    );
  } catch {
    return releaseThen(created.decoder, consumed.receipt.decoderRequestSha256,
      'PROJECT_CHANGED_DURING_MATERIALIZATION');
  }
  if (!sameRevision(finalRevision, snapshot.revision)) {
    return releaseThen(created.decoder, consumed.receipt.decoderRequestSha256,
      'PROJECT_CHANGED_DURING_MATERIALIZATION');
  }
  return Object.freeze({
    disposition: 'WINDOW_MATERIALIZED' as const,
    window,
    sourcePtsCadenceMapStateSha256V3: binding.sourcePtsCadenceMapStateSha256V3,
    transformSha256: conform.transform.transformSha256,
    materializedPictureCount: consumed.receipt.decodedPictures.length,
  });
}

export async function materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(
  input: NativeMediaTimestampPreviewMaterializerInputV1,
  options: Readonly<{
    environment?: MediaSourcePtsCadenceR2RuntimeEnvironmentV1;
    policy?: NativeMediaTimestampPreviewMaterializerPolicyV1;
    ffmpegPath?: string;
    now?: () => number;
  }> = {},
): Promise<NativeMediaTimestampPreviewMaterializerResultV1> {
  try {
    const policy = normalizePolicy(
      options.policy ?? NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
    );
    const runtime = createMediaSourcePtsCadenceR2RuntimePortsV1(options.environment);
    const assetPorts = await createMediaSourcePtsCadenceMapAssetMongoPortsV3();
    return materializeNativeMediaTimestampPreviewWindowV1(input, {
      projectSnapshotReader: {
        async loadProjectForMutation(userId, projectId) {
          const { projectService } = await import('./project-service');
          return projectService.loadProjectForMutation(userId, projectId);
        },
      },
      projectRevisionReader: projectServiceNativeMediaProjectRevisionReaderV1,
      assetReader: assetPorts,
      storedObjectReader: runtime.epochArtifactReader,
      createDecoder({ asset, leaseScope, materializationStartedAtEpochMs }) {
        const surfaceStore = runtime.previewSurface.createStore(leaseScope, {
          policy: policy.surface,
          now: () => materializationStartedAtEpochMs,
        });
        return {
          decoder: createNativeMediaTimestampFfmpegPreviewDecoderV1({
            sourceLease: createVerifiedAssetNativeMediaTimestampPreviewSourceLeasePortV1(asset),
            surfaceStore,
            policy: policy.decoder,
            ffmpegPath: options.ffmpegPath,
          }),
          surfaceExpiresAtEpochMs:
            materializationStartedAtEpochMs + policy.surface.leaseTtlMs,
        };
      },
      policy,
      now: options.now,
    });
  } catch (error) {
    return unverifiable('RUNTIME_UNAVAILABLE', diagnostic(error));
  }
}

function normalizeInput(input: NativeMediaTimestampPreviewMaterializerInputV1) {
  return Object.freeze({
    userId: identifier(input.userId, 'NATIVE_MEDIA_PREVIEW_USER_INVALID'),
    projectId: identifier(input.projectId, 'NATIVE_MEDIA_PREVIEW_PROJECT_INVALID'),
    sequenceId: identifier(input.sequenceId, 'NATIVE_MEDIA_PREVIEW_SEQUENCE_INVALID'),
    overlayId: identifier(String(input.overlayId), 'NATIVE_MEDIA_PREVIEW_OVERLAY_INVALID'),
    expectedProjectRevision: input.expectedProjectRevision
      ? normalizeProjectRevision(input.expectedProjectRevision)
      : null,
    windowLocalStartFrame: nonNegativeSafeInteger(input.windowLocalStartFrame),
    windowDurationInFrames: positiveSafeInteger(input.windowDurationInFrames),
  });
}

function normalizeProjectRevision(value: ProjectRevisionV1): ProjectRevisionV1 {
  if (!value || value.schemaVersion !== 1
    || !Number.isSafeInteger(value.value) || value.value < 0
    || typeof value.compatibilityUpdatedAt !== 'string'
    || value.compatibilityUpdatedAt.length > 128
    || Number.isNaN(Date.parse(value.compatibilityUpdatedAt))) {
    throw new Error('NATIVE_MEDIA_PREVIEW_REVISION_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    value: value.value,
    compatibilityUpdatedAt: value.compatibilityUpdatedAt,
  });
}

function normalizeVideoOverlay(overlay: Overlay) {
  if (overlay.type !== 'video' || !overlay.assetId) throw new Error('NATIVE_MEDIA_PREVIEW_OVERLAY_INVALID');
  const sourceStart = overlay.sourceStartFrame ?? overlay.videoStartTime ?? 0;
  if (overlay.sourceStartFrame !== undefined && overlay.videoStartTime !== undefined
    && overlay.sourceStartFrame !== overlay.videoStartTime) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SOURCE_START_CONFLICT');
  }
  const sourceEnd = overlay.sourceEndFrame ?? null;
  const retimed = (overlay.speed !== undefined && overlay.speed !== 1)
    || Boolean(overlay.speedCurve?.length)
    || Boolean(overlay.keyframeTracks?.some((track) => track.property === 'speed'));
  return Object.freeze({
    from: nonNegativeSafeInteger(overlay.from),
    durationInFrames: positiveSafeInteger(overlay.durationInFrames),
    assetId: identifier(overlay.assetId, 'NATIVE_MEDIA_PREVIEW_ASSET_INVALID'),
    sourceStartFrame: nonNegativeSafeInteger(sourceStart),
    sourceEndFrame: sourceEnd === null ? null : positiveSafeInteger(sourceEnd),
    retimed,
  });
}

function normalizePolicy(
  policy: NativeMediaTimestampPreviewMaterializerPolicyV1,
): NativeMediaTimestampPreviewMaterializerPolicyV1 {
  if (!policy || !policy.policyVersion?.trim()
    || !positivePolicyInteger(policy.maxWindowFrames)
    || policy.maxWindowFrames > NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_MAX_FRAMES_V2
    || !positivePolicyInteger(policy.epochWindow?.maxFrameRecords)
    || !positivePolicyInteger(policy.epochWindow?.maxBatchReads)
    || !positivePolicyInteger(policy.epochWindow?.maxTotalReadBytes)
    || !positivePolicyInteger(policy.conform?.maxSourceFrames)
    || !positivePolicyInteger(policy.conform?.maxFrameQueries)
    || !positivePolicyInteger(policy.decoderResource?.maxUniquePictures)
    || !positivePolicyInteger(policy.decoderResource?.maxDecodedBytes)
    || !positivePolicyInteger(policy.decoderResource?.maxCodedDimension)
    || !positivePolicyInteger(policy.decoderResource?.maxDisplayDimension)
    || !positivePolicyInteger(policy.decoder?.maxSourceBytes)
    || !positivePolicyInteger(policy.decoder?.maxPictures)
    || !positivePolicyInteger(policy.decoder?.maxEncodedPreviewBytes)
    || !positivePolicyInteger(policy.decoder?.timeoutMs)
    || !positivePolicyInteger(policy.surface?.leaseTtlMs)
    || !positivePolicyInteger(policy.surface?.maxPngBytes)
    || policy.maxWindowFrames > policy.conform.maxFrameQueries
    || policy.maxWindowFrames > policy.decoderResource.maxUniquePictures
    || policy.maxWindowFrames > policy.decoder.maxPictures
    || !Number.isSafeInteger(policy.minimumRemainingLeaseMs)
    || !Number.isSafeInteger(policy.renewBeforeExpiryMs)
    || !Number.isSafeInteger(policy.maximumSurfaceLeaseTtlMs)
    || !positivePolicyInteger(policy.classificationLeaseTtlMs)
    || !positivePolicyInteger(policy.classificationRenewBeforeExpiryMs)
    || policy.classificationLeaseTtlMs
      > NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_MAX_TTL_MS_V1
    || policy.classificationRenewBeforeExpiryMs >= policy.classificationLeaseTtlMs
    || policy.renewBeforeExpiryMs < 1
    || policy.minimumRemainingLeaseMs <= policy.renewBeforeExpiryMs
    || policy.maximumSurfaceLeaseTtlMs < policy.minimumRemainingLeaseMs
    || policy.surface.leaseTtlMs > policy.maximumSurfaceLeaseTtlMs) {
    throw new Error('NATIVE_MEDIA_PREVIEW_MATERIALIZER_POLICY_INVALID');
  }
  return policy;
}

function positivePolicyInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function sourceHasAudio(asset: MediaSourcePtsCadenceMapAssetStateInputV3): boolean | null {
  const qualification = asset.sourceQualificationV1 as {
    observation?: { audioStreams?: unknown };
  } | undefined;
  const streams = qualification?.observation?.audioStreams;
  return Array.isArray(streams) ? streams.length > 0 : null;
}

function timestampManagement(
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
): 'NONE' | 'EARLIER' | 'V3' {
  const state = asset as Record<string, unknown>;
  const present = (key: string) => state[key] !== undefined && state[key] !== null;
  if (present('sourcePtsCadenceMapV3') || present('sourcePtsCadenceMapStateSha256V3')) {
    return 'V3';
  }
  if (present('sourcePtsCadenceMapV1') || present('sourcePtsCadenceMapStateSha256V1')
    || present('sourcePtsCadenceMapV2') || present('sourcePtsCadenceMapStateSha256V2')) {
    return 'EARLIER';
  }
  return 'NONE';
}

async function releaseThen(
  decoder: NativeMediaTimestampMaterializingDecoderV1,
  decoderRequestSha256: string,
  reason: NativeMediaTimestampPreviewMaterializerReasonV1,
  detail: string | null = null,
): Promise<NativeMediaTimestampPreviewMaterializerResultV1> {
  try {
    await decoder.releaseDecodedBatch(decoderRequestSha256);
  } catch {
    return unverifiable('CLEANUP_FAILED', reason);
  }
  return unverifiable(reason, detail);
}

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left?.schemaVersion === 1 && right?.schemaVersion === 1
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function unverifiable(
  reason: NativeMediaTimestampPreviewMaterializerReasonV1,
  detail: string | null,
): NativeMediaTimestampPreviewMaterializerResultV1 {
  return Object.freeze({ disposition: 'UNVERIFIABLE' as const, reason, diagnostic: detail });
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,160}$/.test(error.message)
    ? error.message
    : null;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 256
    || /[\u0000-\u001F\u007F]/.test(value)) throw new Error(code);
  return value.trim();
}

function nonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_INTEGER_INVALID');
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown): number {
  const normalized = nonNegativeSafeInteger(value);
  if (normalized < 1) throw new Error('NATIVE_MEDIA_PREVIEW_INTEGER_INVALID');
  return normalized;
}

function epochMs(value: unknown): number {
  return nonNegativeSafeInteger(value);
}
