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
import {
  assertNativeMediaTimestampPreviewSessionWindowV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
  type NativeMediaTimestampPreviewSessionWindowV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-window-v1';

import { readCanonicalFrameRateV1 } from '../contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  createMediaSourceAudioArtifactAssetMongoPortsV1,
  readMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetRecordV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
} from './media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 } from './media-source-audio-private-artifact-port-v1';
import type { MediaSourceAudioPrivateArtifactStoreV1 } from './media-source-audio-r2-private-artifact-v1';
import {
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  verifyMediaSourceAudioPrivateArtifactSetV1,
} from './media-source-audio-private-artifact-v1';
import type { MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 } from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceEpochWindowResourcePolicyV3 } from './media-source-pts-cadence-epoch-window-reader-v3';
import { classifyMediaSourceTimestampManagementV1 } from './media-source-timestamp-management-v1';
import {
  assertMediaSourceVersionEvidenceRecordV1,
  mediaSourceVersionEvidenceAssetViewV1,
  type MediaSourceVersionEvidenceScopeV1,
} from './media-source-version-evidence-owner-v1';
import type { NativeMediaTimestampAnalysisEnginePortV1 } from './native-media-timestamp-analysis-contract-v1';
import {
  analyzeNativeMediaTimestampReceiptV1,
  type NativeMediaTimestampAnalysisConsumerPolicyV1,
  type NativeMediaTimestampAnalysisReceiptV1,
} from './native-media-timestamp-analysis-consumer-v1';
import {
  createNativeMediaTimestampAnalysisSamplePlanV1,
  type NativeMediaTimestampAnalysisSamplePlanV1,
  type NativeMediaTimestampAnalysisSamplePolicyV1,
} from './native-media-timestamp-analysis-sample-plan-v1';
import { createNativeMediaTimestampLegacyVideoAnalysisEngineV1 } from './native-media-timestamp-analysis-video-engine-v1';
import {
  materializeNativeMediaTimestampPreviewAudioWindowV1,
} from './native-media-timestamp-preview-audio-materializer-v1';
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
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1,
  type NativeMediaTimestampPreviewAudioSurfaceStorePortV1,
} from './native-media-timestamp-r2-preview-audio-surface-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_DEFAULT_POLICY_V1,
  type NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
  type NativeMediaTimestampPreviewSurfacePolicyV1,
  type NativeMediaTimestampPreviewSurfaceReaderPortV1,
} from './native-media-timestamp-r2-preview-surface-v1';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import type { Project, ProjectRevisionV1 } from './project-service';
import {
  resolveProjectSelectedVideoSourceTimeBindingV1,
  type ProjectSelectedVideoSourceTimeBindingPortsV1,
  type ProjectSelectedVideoSourceTimeBindingResultV1,
} from './project-selected-video-source-time-binding-v1';
import {
  createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3,
  resolveVerifiedVideoSourceEpochTimeBindingV3,
  type VerifiedVideoSourceEpochTimeBindingV3,
  type VideoSourceTimestampConformResourcePolicyV2,
} from './video-source-time-transform-v1';

const NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_V1' as const;

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

export type NativeMediaTimestampAnalysisMaterializerPolicyV1 = Readonly<{
  sample: NativeMediaTimestampAnalysisSamplePolicyV1;
  consumer: NativeMediaTimestampAnalysisConsumerPolicyV1;
}>;

export const NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZER_DEFAULT_POLICY_V1:
NativeMediaTimestampAnalysisMaterializerPolicyV1 = Object.freeze({
  sample: Object.freeze({
    policyVersion: 'EDITRON_NATIVE_ANALYSIS_ONE_SECOND_120_V1',
    sampleIntervalSeconds: Object.freeze({ numerator: '1', denominator: '1' }),
    maxWindowDurationSeconds: '120',
    maxSampleFrames: 120,
  }),
  consumer: Object.freeze({
    policyVersion: 'EDITRON_NATIVE_ANALYSIS_CONSUMER_V1',
    maxSampleFrames: 120,
    maxSinglePngBytes: 64 * 1024 * 1024,
    maxTotalPngBytes: 512 * 1024 * 1024,
  }),
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
  | 'SELECTED_SOURCE_UNVERIFIABLE'
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
  | 'AUDIO_WINDOW_MATERIALIZATION_FAILED'
  | 'SESSION_WINDOW_BUILD_FAILED'
  | 'ANALYSIS_RUNTIME_REQUIRED'
  | 'ANALYSIS_SAMPLE_PLAN_FAILED'
  | 'ANALYSIS_UNVERIFIABLE'
  | 'ASSET_CHANGED_DURING_ANALYSIS'
  | 'CLEANUP_FAILED'
  | 'RUNTIME_UNAVAILABLE';

type NativeMediaTimestampPreviewMaterializerSharedResultV1 = Readonly<
  | {
      disposition: 'NOT_APPLICABLE';
      reason: 'ASSET_NOT_TIMESTAMP_MANAGED';
      classificationLease: NativeMediaTimestampPreviewClassificationLeaseV1;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason: NativeMediaTimestampPreviewMaterializerReasonV1;
      diagnostic: string | null;
    }
>;

type NativeMediaTimestampPreviewPictureMaterializerResultV1 =
  NativeMediaTimestampPreviewMaterializerSharedResultV1 | Readonly<
  | {
      disposition: 'WINDOW_MATERIALIZED';
      window: NativeMediaTimestampPreviewWindowV2;
      sourcePtsCadenceMapStateSha256V3: string;
      transformSha256: string;
      materializedPictureCount: number;
    }
>;

type NativeMediaTimestampPreviewSessionMaterializerResultV1 =
  NativeMediaTimestampPreviewMaterializerSharedResultV1 | Readonly<
  | {
      disposition: 'SESSION_WINDOW_MATERIALIZED';
      sessionWindow: NativeMediaTimestampPreviewSessionWindowV1;
      sourcePtsCadenceMapStateSha256V3: string;
      transformSha256: string;
      materializedPictureCount: number;
      materializedAudioSegmentCount: number;
    }
>;

type NativeMediaTimestampAnalysisMaterializerResultV1 =
  NativeMediaTimestampPreviewMaterializerSharedResultV1 | Readonly<
  | {
      disposition: 'ANALYSIS_MATERIALIZED';
      schemaVersion: 1;
      kind: typeof NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1;
      samplePlan: NativeMediaTimestampAnalysisSamplePlanV1;
      analysisReceipt: NativeMediaTimestampAnalysisReceiptV1;
      samplePlanSha256: string;
      analysisReceiptSha256: string;
      sourcePtsCadenceMapStateSha256V3: string;
      transformSha256: string;
      materializedPictureCount: number;
      materializationSha256: string;
    }
>;

type NativeMediaTimestampPreviewMaterializerResultV1 =
  | NativeMediaTimestampPreviewPictureMaterializerResultV1
  | NativeMediaTimestampPreviewSessionMaterializerResultV1
  | NativeMediaTimestampAnalysisMaterializerResultV1;

export type NativeMediaTimestampPreviewMaterializerInputV1 = Readonly<{
  userId: string;
  projectId: string;
  sequenceId: string;
  overlayId: string | number;
  expectedProjectRevision?: ProjectRevisionV1;
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
  /** Optional caller binding; the materializer re-resolves the project pin. */
  selectedSource?: NativeMediaTimestampPreviewSelectedSourceBindingV1;
}>;

export type NativeMediaTimestampPreviewSelectedSourceBindingV1 = Readonly<Pick<
  VerifiedVideoSourceEpochTimeBindingV3,
  | 'sourceVersionSha256'
  | 'storageVersionSha256'
  | 'sourcePtsCadenceMapStateSha256V3'
>> & Readonly<Partial<Pick<
  VerifiedVideoSourceEpochTimeBindingV3,
  'bindingSha256'
>>>;

export type NativeMediaTimestampPreviewSessionMaterializerInputV1 =
  NativeMediaTimestampPreviewMaterializerInputV1 & Readonly<{
    deliveryContract: 'PAIRED_SESSION_V3';
  }>;

export type NativeMediaTimestampAnalysisMaterializerInputV1 =
  NativeMediaTimestampPreviewMaterializerInputV1 & Readonly<{
    deliveryContract: 'ANALYSIS_RECEIPT_V1';
  }>;

export type NativeMediaTimestampAnalysisMaterializerPortsV1 = Readonly<{
  pictureReader: NativeMediaTimestampPreviewSurfaceReaderPortV1;
  engine: NativeMediaTimestampAnalysisEnginePortV1;
  policy: NativeMediaTimestampAnalysisMaterializerPolicyV1;
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
    load(
      assetId: string,
      userId: string,
    ): Promise<MediaSourceAudioArtifactAssetStateInputV1 | null>;
  }>;
  selectedSource?: ProjectSelectedVideoSourceTimeBindingPortsV1;
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  audioArtifactReader?: MediaSourceAudioPrivateArtifactReaderV1;
  audioPreview?: Readonly<{
    pcmReader: Pick<MediaSourceAudioPrivateArtifactStoreV1, 'readPcmSampleRange'>;
    createSurfaceStore(input: Readonly<{
      leaseScope: NativeMediaTimestampPreviewSurfaceLeaseScopeV1;
      lease: NativeMediaTimestampPreviewWindowV2['lease'];
    }>): NativeMediaTimestampPreviewAudioSurfaceStorePortV1;
  }>;
  createDecoder(input: Readonly<{
    asset: MediaSourceAudioArtifactAssetStateInputV1;
    leaseScope: NativeMediaTimestampPreviewSurfaceLeaseScopeV1;
    materializationStartedAtEpochMs: number;
  }>): Readonly<{
    decoder: NativeMediaTimestampMaterializingDecoderV1;
    surfaceExpiresAtEpochMs: number;
  }>;
  analysis?: NativeMediaTimestampAnalysisMaterializerPortsV1;
  policy: NativeMediaTimestampPreviewMaterializerPolicyV1;
  now?: () => number;
}>;

export function materializeNativeMediaTimestampPreviewWindowV1(
  input: NativeMediaTimestampAnalysisMaterializerInputV1,
  ports: NativeMediaTimestampPreviewMaterializerPortsV1,
): Promise<NativeMediaTimestampAnalysisMaterializerResultV1>;
export function materializeNativeMediaTimestampPreviewWindowV1(
  input: NativeMediaTimestampPreviewSessionMaterializerInputV1,
  ports: NativeMediaTimestampPreviewMaterializerPortsV1,
): Promise<NativeMediaTimestampPreviewSessionMaterializerResultV1>;
export function materializeNativeMediaTimestampPreviewWindowV1(
  input: NativeMediaTimestampPreviewMaterializerInputV1,
  ports: NativeMediaTimestampPreviewMaterializerPortsV1,
): Promise<NativeMediaTimestampPreviewPictureMaterializerResultV1>;
export function materializeNativeMediaTimestampPreviewWindowV1(
  input:
    | NativeMediaTimestampPreviewMaterializerInputV1
    | NativeMediaTimestampPreviewSessionMaterializerInputV1
    | NativeMediaTimestampAnalysisMaterializerInputV1,
  ports: NativeMediaTimestampPreviewMaterializerPortsV1,
): Promise<NativeMediaTimestampPreviewMaterializerResultV1>;
export async function materializeNativeMediaTimestampPreviewWindowV1(
  input:
    | NativeMediaTimestampPreviewMaterializerInputV1
    | NativeMediaTimestampPreviewSessionMaterializerInputV1
    | NativeMediaTimestampAnalysisMaterializerInputV1,
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
  const analysisPorts = scope.deliveryContract === 'ANALYSIS_RECEIPT_V1'
    ? ports.analysis ?? null
    : null;
  if (scope.deliveryContract === 'ANALYSIS_RECEIPT_V1'
    && (!analysisPorts || !analysisPorts.policy
      || typeof analysisPorts.pictureReader?.readPicture !== 'function'
      || typeof analysisPorts.engine?.analyze !== 'function')) {
    return unverifiable('ANALYSIS_RUNTIME_REQUIRED', null);
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
  if (BigInt(scope.windowLocalStartFrame) + BigInt(scope.windowDurationInFrames)
      > BigInt(overlay.durationInFrames)
    || (scope.deliveryContract !== 'ANALYSIS_RECEIPT_V1'
      && scope.windowDurationInFrames > policy.maxWindowFrames)) {
    return unverifiable('INPUT_INVALID', 'NATIVE_MEDIA_PREVIEW_WINDOW_RANGE_INVALID');
  }
  let asset: MediaSourceAudioArtifactAssetStateInputV1 | null;
  try {
    asset = await ports.assetReader.load(overlay.assetId, scope.userId);
  } catch {
    return unverifiable('ASSET_UNAVAILABLE', null);
  }
  if (!asset || asset.assetId !== overlay.assetId || asset.type !== 'video') {
    return unverifiable('ASSET_SCOPE_INVALID', null);
  }
  const currentManagement = classifyMediaSourceTimestampManagementV1(asset);
  const hasSelectedSourcePin = overlay.sourceVersionPinV1 != null;
  if (!hasSelectedSourcePin && currentManagement === 'NONE') {
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
  if (!hasSelectedSourcePin) {
    if (currentManagement === 'EARLIER') {
      return unverifiable('LEGACY_TIME_MAP_MIGRATION_REQUIRED', null);
    }
    if (currentManagement === 'CONFLICTING') {
      return unverifiable(
        'ASSET_SCOPE_INVALID',
        'NATIVE_MEDIA_PREVIEW_TIMESTAMP_GENERATIONS_CONFLICT',
      );
    }
    return unverifiable(
      'SELECTED_SOURCE_UNVERIFIABLE',
      'SELECTED_SOURCE_PIN_REQUIRED',
    );
  }
  const selectedAssetResult = await resolveSelectedAssetForPreview({
    projectId: scope.projectId,
    overlayId: overlay.overlayId,
    assetId: overlay.assetId,
    sourcePin: overlay.sourceVersionPinV1,
    asset,
    ports,
  });
  if (selectedAssetResult.disposition === 'UNVERIFIABLE') {
    return unverifiable(
      'SELECTED_SOURCE_UNVERIFIABLE',
      selectedAssetResult.diagnostic,
    );
  }
  asset = selectedAssetResult.asset;
  const selectedManagement = classifyMediaSourceTimestampManagementV1(asset);
  if (selectedManagement === 'NONE') {
    return unverifiable('SELECTED_SOURCE_UNVERIFIABLE', 'SELECTED_SOURCE_V3_REQUIRED');
  }
  if (selectedManagement === 'EARLIER') {
    return unverifiable('LEGACY_TIME_MAP_MIGRATION_REQUIRED', null);
  }
  if (selectedManagement === 'CONFLICTING') {
    return unverifiable(
      'SELECTED_SOURCE_UNVERIFIABLE',
      'NATIVE_MEDIA_PREVIEW_TIMESTAMP_GENERATIONS_CONFLICT',
    );
  }
  const binding = selectedAssetResult.selectedSource.binding;
  if (!selectedSourceBindingMatches(binding, scope.selectedSource)) {
    return unverifiable('SELECTED_SOURCE_UNVERIFIABLE', 'SELECTED_SOURCE_SCOPE_MISMATCH');
  }
  if (binding.assetId !== overlay.assetId) {
    return unverifiable('ASSET_SCOPE_INVALID', null);
  }
  const audioStreamIndexes = sourceAudioStreamIndexes(asset);
  if (audioStreamIndexes === null) return unverifiable('ASSET_SCOPE_INVALID', null);
  let audioArtifactState: ReturnType<typeof readMediaSourceAudioArtifactAssetStateV1>;
  try {
    audioArtifactState = readMediaSourceAudioArtifactAssetStateV1(asset);
  } catch (error) {
    return unverifiable('ASSET_SCOPE_INVALID', diagnostic(error));
  }

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
  let selectedAudioArtifact: Readonly<{
    record: MediaSourceAudioArtifactAssetRecordV1;
    evidence: ReturnType<typeof verifyMediaSourceAudioPrivateArtifactSetV1>;
  }> | null = null;
  if (audioStreamIndexes.length > 0
    && scope.deliveryContract !== 'ANALYSIS_RECEIPT_V1') {
    if (audioStreamIndexes.length !== 1) {
      return unverifiable(
        'EXACT_AUDIO_MAPPING_REQUIRED',
        'NATIVE_MEDIA_PREVIEW_AUDIO_STREAM_SELECTION_REQUIRED',
      );
    }
    const audioStreamIndex = audioStreamIndexes[0]!;
    const audioRecord = audioArtifactState?.sourceAudioArtifactsV1.records.find(
      (record) => record.audioStreamIndex === audioStreamIndex,
    );
    if (!audioRecord || !ports.audioArtifactReader) {
      return unverifiable(
        'EXACT_AUDIO_MAPPING_REQUIRED',
        audioRecord
          ? 'NATIVE_MEDIA_PREVIEW_AUDIO_ARTIFACT_READER_REQUIRED'
          : 'NATIVE_MEDIA_PREVIEW_AUDIO_ARTIFACT_STATE_REQUIRED',
      );
    }
    try {
      const artifactSet = await ports.audioArtifactReader.readArtifactSet(
        audioRecord.manifestReference,
      );
      const audioEvidence = verifyMediaSourceAudioPrivateArtifactSetV1({
        manifest: artifactSet.manifest,
        mapCanonicalJson: artifactSet.mapCanonicalJson,
      });
      assertAudioArtifactMatchesAssetRecord(audioRecord, artifactSet.manifest, audioEvidence);
      selectedAudioArtifact = Object.freeze({ record: audioRecord, evidence: audioEvidence });
    } catch (error) {
      return unverifiable('EXACT_AUDIO_MAPPING_REQUIRED', diagnostic(error));
    }
  }
  const timelineStartFrame = BigInt(overlay.from) + BigInt(scope.windowLocalStartFrame);
  const timelineEndExclusiveFrame = timelineStartFrame + BigInt(scope.windowDurationInFrames);
  let analysisSamplePlan: NativeMediaTimestampAnalysisSamplePlanV1 | null = null;
  let timelineQueries: readonly string[];
  if (scope.deliveryContract === 'ANALYSIS_RECEIPT_V1') {
    try {
      analysisSamplePlan = createNativeMediaTimestampAnalysisSamplePlanV1({
        projectRate: projectRateRead.rate,
        timelineStartFrame: timelineStartFrame.toString(),
        timelineEndExclusiveFrame: timelineEndExclusiveFrame.toString(),
        policy: analysisPorts!.policy.sample,
      });
      if (analysisSamplePlan.policy.sampleIntervalSeconds.numerator !== '1'
        || analysisSamplePlan.policy.sampleIntervalSeconds.denominator !== '1') {
        throw new Error('NATIVE_MEDIA_ANALYSIS_SAMPLE_INTERVAL_UNSUPPORTED');
      }
      timelineQueries = analysisSamplePlan.samples.map(({ timelineFrame }) => timelineFrame);
    } catch (error) {
      return unverifiable('ANALYSIS_SAMPLE_PLAN_FAILED', diagnostic(error));
    }
  } else {
    timelineQueries = Array.from(
      { length: scope.windowDurationInFrames },
      (_, index) => (timelineStartFrame + BigInt(index)).toString(),
    );
  }
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
      ...(selectedAudioArtifact === null ? {} : {
        audio: {
          evidence: selectedAudioArtifact.evidence,
          endExclusiveTimelineFrame: (
            BigInt(overlay.from) + BigInt(overlay.durationInFrames)
          ).toString(),
        },
      }),
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

  let freshAsset: MediaSourceAudioArtifactAssetStateInputV1 | null;
  try {
    freshAsset = await ports.assetReader.load(overlay.assetId, scope.userId);
  } catch {
    freshAsset = null;
  }
  if (!freshAsset || freshAsset.assetId !== overlay.assetId || freshAsset.type !== 'video') {
    return releaseThen(
      created.decoder,
      consumed.receipt.decoderRequestSha256,
      'ASSET_CHANGED_DURING_MATERIALIZATION',
    );
  }
  const freshSelectedAssetResult = await resolveSelectedAssetForPreview({
    projectId: scope.projectId,
    overlayId: overlay.overlayId,
    assetId: overlay.assetId,
    sourcePin: overlay.sourceVersionPinV1,
    asset: freshAsset,
    ports,
  });
  if (freshSelectedAssetResult.disposition === 'UNVERIFIABLE') {
    return releaseThen(
      created.decoder,
      consumed.receipt.decoderRequestSha256,
      'ASSET_CHANGED_DURING_MATERIALIZATION',
      freshSelectedAssetResult.diagnostic,
    );
  }
  if (!selectedSourceBindingMatches(
      freshSelectedAssetResult.selectedSource.binding,
      scope.selectedSource,
    )
    || freshSelectedAssetResult.selectedSource.binding.bindingSha256
      !== binding.bindingSha256
    || sourceAudioArtifactStateHash(freshSelectedAssetResult.asset)
      !== sourceAudioArtifactStateHash(asset)) {
    return releaseThen(created.decoder, consumed.receipt.decoderRequestSha256,
      'ASSET_CHANGED_DURING_MATERIALIZATION');
  }
  if (scope.deliveryContract === 'ANALYSIS_RECEIPT_V1') {
    if (!analysisPorts || !analysisSamplePlan) {
      return releaseThen(
        created.decoder,
        consumed.receipt.decoderRequestSha256,
        'ANALYSIS_RUNTIME_REQUIRED',
      );
    }
    const analyzed = await analyzeNativeMediaTimestampReceiptV1({
      userId: scope.userId,
      receipt: consumed.receipt,
      timelineEndExclusiveFrame: timelineEndExclusiveFrame.toString(),
      policy: analysisPorts.policy.consumer,
      pictureReader: analysisPorts.pictureReader,
      engine: analysisPorts.engine,
      decoderRelease: created.decoder,
      projectRevisionReader: ports.projectRevisionReader,
    });
    if (analyzed.disposition === 'UNVERIFIABLE') {
      return unverifiable(
        analyzed.reason === 'CLEANUP_FAILED' ? 'CLEANUP_FAILED' : 'ANALYSIS_UNVERIFIABLE',
        `NATIVE_MEDIA_ANALYSIS_${analyzed.reason}`,
      );
    }
    if (!await assetStillMatches({
      assetReader: ports.assetReader,
      projectId: scope.projectId,
      overlayId: overlay.overlayId,
      assetId: overlay.assetId,
      userId: scope.userId,
      sourcePin: overlay.sourceVersionPinV1,
      ports,
      bindingSha256: binding.bindingSha256,
      audioArtifactStateSha256:
        audioArtifactState?.sourceAudioArtifactsStateSha256V1 ?? null,
    })) {
      return unverifiable('ASSET_CHANGED_DURING_ANALYSIS', null);
    }
    const material = {
      schemaVersion: 1 as const,
      kind: NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_KIND_V1,
      samplePlanSha256: analysisSamplePlan.samplePlanSha256,
      analysisReceiptSha256: analyzed.receipt.receiptSha256,
      sourcePtsCadenceMapStateSha256V3: binding.sourcePtsCadenceMapStateSha256V3,
      transformSha256: conform.transform.transformSha256,
      materializedPictureCount: consumed.receipt.decodedPictures.length,
    };
    return Object.freeze({
      disposition: 'ANALYSIS_MATERIALIZED' as const,
      ...material,
      samplePlan: analysisSamplePlan,
      analysisReceipt: analyzed.receipt,
      materializationSha256: hashEditronCanonicalJsonV1(material),
    });
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
  if (scope.deliveryContract === 'PAIRED_SESSION_V3') {
    let audioWindow: NativeMediaTimestampPreviewSessionWindowV1['audioWindow'] = null;
    let audioSurfaceStore: NativeMediaTimestampPreviewAudioSurfaceStorePortV1 | null = null;
    if (window.audioOwnership.disposition === 'EXACT_SAMPLE_MAPPING_BOUND') {
      if (!selectedAudioArtifact || !conform.transform.audioMapping
        || !ports.audioPreview
        || typeof ports.audioPreview.pcmReader?.readPcmSampleRange !== 'function'
        || typeof ports.audioPreview.createSurfaceStore !== 'function') {
        return releaseThen(
          created.decoder,
          consumed.receipt.decoderRequestSha256,
          'AUDIO_WINDOW_MATERIALIZATION_FAILED',
          'NATIVE_MEDIA_PREVIEW_AUDIO_RUNTIME_REQUIRED',
        );
      }
      const leaseScope = {
        userId: scope.userId,
        projectId: scope.projectId,
        sequenceId: scope.sequenceId,
        overlayId: scope.overlayId,
        projectRevision: snapshot.revision,
      };
      try {
        audioSurfaceStore = ports.audioPreview.createSurfaceStore({
          leaseScope,
          lease: window.lease,
        });
      } catch (error) {
        return releaseThen(
          created.decoder,
          consumed.receipt.decoderRequestSha256,
          'AUDIO_WINDOW_MATERIALIZATION_FAILED',
          diagnostic(error),
        );
      }
      const audioResult = await materializeNativeMediaTimestampPreviewAudioWindowV1({
        leaseScope,
        lease: window.lease,
        mapping: conform.transform.audioMapping,
        projectRate: conform.transform.projectRate,
        overlayFromFrame: overlay.from,
        windowLocalStartFrame: scope.windowLocalStartFrame,
        windowDurationInFrames: scope.windowDurationInFrames,
        expectedAssetId: overlay.assetId,
        manifestSha256: selectedAudioArtifact.record.manifestSha256,
        manifestReference: selectedAudioArtifact.record.manifestReference,
      }, {
        pcmReader: ports.audioPreview.pcmReader,
        surfaceStore: audioSurfaceStore,
      });
      if (audioResult.disposition === 'UNVERIFIABLE') {
        return releaseThen(
          created.decoder,
          consumed.receipt.decoderRequestSha256,
          audioResult.reason === 'CLEANUP_FAILED'
            ? 'CLEANUP_FAILED'
            : 'AUDIO_WINDOW_MATERIALIZATION_FAILED',
          `NATIVE_MEDIA_PREVIEW_AUDIO_${audioResult.reason}`,
        );
      }
      audioWindow = audioResult.window;
    }

    let sessionWindow: NativeMediaTimestampPreviewSessionWindowV1;
    try {
      sessionWindow = assertNativeMediaTimestampPreviewSessionWindowV1({
        schemaVersion: 1,
        kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_SESSION_WINDOW_KIND_V1,
        pictureWindow: window,
        audioWindow,
      });
    } catch (error) {
      return releasePairedThen(
        created.decoder,
        consumed.receipt.decoderRequestSha256,
        audioSurfaceStore,
        audioWindow,
        'SESSION_WINDOW_BUILD_FAILED',
        diagnostic(error),
      );
    }
    if (!await assetStillMatches({
      assetReader: ports.assetReader,
      projectId: scope.projectId,
      overlayId: overlay.overlayId,
      assetId: overlay.assetId,
      userId: scope.userId,
      sourcePin: overlay.sourceVersionPinV1,
      ports,
      bindingSha256: binding.bindingSha256,
      audioArtifactStateSha256:
        audioArtifactState?.sourceAudioArtifactsStateSha256V1 ?? null,
    })) {
      return releasePairedThen(
        created.decoder,
        consumed.receipt.decoderRequestSha256,
        audioSurfaceStore,
        audioWindow,
        'ASSET_CHANGED_DURING_MATERIALIZATION',
      );
    }
    try {
      finalRevision = await ports.projectRevisionReader.getProjectRevision(
        scope.userId,
        scope.projectId,
      );
    } catch {
      return releasePairedThen(
        created.decoder,
        consumed.receipt.decoderRequestSha256,
        audioSurfaceStore,
        audioWindow,
        'PROJECT_CHANGED_DURING_MATERIALIZATION',
      );
    }
    if (!sameRevision(finalRevision, snapshot.revision)) {
      return releasePairedThen(
        created.decoder,
        consumed.receipt.decoderRequestSha256,
        audioSurfaceStore,
        audioWindow,
        'PROJECT_CHANGED_DURING_MATERIALIZATION',
      );
    }
    return Object.freeze({
      disposition: 'SESSION_WINDOW_MATERIALIZED' as const,
      sessionWindow,
      sourcePtsCadenceMapStateSha256V3: binding.sourcePtsCadenceMapStateSha256V3,
      transformSha256: conform.transform.transformSha256,
      materializedPictureCount: consumed.receipt.decodedPictures.length,
      materializedAudioSegmentCount: audioWindow?.segments.filter(
        (segment) => segment.kind === 'PCM',
      ).length ?? 0,
    });
  }
  return Object.freeze({
    disposition: 'WINDOW_MATERIALIZED' as const,
    window,
    sourcePtsCadenceMapStateSha256V3: binding.sourcePtsCadenceMapStateSha256V3,
    transformSha256: conform.transform.transformSha256,
    materializedPictureCount: consumed.receipt.decodedPictures.length,
  });
}

type NativeMediaTimestampPreviewMaterializerRuntimeOptionsV1 = Readonly<{
  environment?: MediaSourcePtsCadenceR2RuntimeEnvironmentV1;
  policy?: NativeMediaTimestampPreviewMaterializerPolicyV1;
  ffmpegPath?: string;
  now?: () => number;
  audioArtifactReader?: MediaSourceAudioPrivateArtifactReaderV1;
  analysisEngine?: NativeMediaTimestampAnalysisEnginePortV1;
  analysisPolicy?: NativeMediaTimestampAnalysisMaterializerPolicyV1;
}>;

export function materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(
  input: NativeMediaTimestampAnalysisMaterializerInputV1,
  options?: NativeMediaTimestampPreviewMaterializerRuntimeOptionsV1,
): Promise<NativeMediaTimestampAnalysisMaterializerResultV1>;
export function materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(
  input: NativeMediaTimestampPreviewSessionMaterializerInputV1,
  options?: NativeMediaTimestampPreviewMaterializerRuntimeOptionsV1,
): Promise<NativeMediaTimestampPreviewSessionMaterializerResultV1>;
export function materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(
  input: NativeMediaTimestampPreviewMaterializerInputV1,
  options?: NativeMediaTimestampPreviewMaterializerRuntimeOptionsV1,
): Promise<NativeMediaTimestampPreviewPictureMaterializerResultV1>;
export function materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(
  input:
    | NativeMediaTimestampPreviewMaterializerInputV1
    | NativeMediaTimestampPreviewSessionMaterializerInputV1
    | NativeMediaTimestampAnalysisMaterializerInputV1,
  options?: NativeMediaTimestampPreviewMaterializerRuntimeOptionsV1,
): Promise<NativeMediaTimestampPreviewMaterializerResultV1>;
export async function materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1(
  input:
    | NativeMediaTimestampPreviewMaterializerInputV1
    | NativeMediaTimestampPreviewSessionMaterializerInputV1
    | NativeMediaTimestampAnalysisMaterializerInputV1,
  options: NativeMediaTimestampPreviewMaterializerRuntimeOptionsV1 = {},
): Promise<NativeMediaTimestampPreviewMaterializerResultV1> {
  try {
    const policy = normalizePolicy(
      options.policy ?? NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
    );
    type RuntimePortsV1 = ReturnType<typeof createMediaSourcePtsCadenceR2RuntimePortsV1>;
    let runtime: RuntimePortsV1 | null = null;
    let analysisPictureReader: NativeMediaTimestampPreviewSurfaceReaderPortV1 | null = null;
    const getRuntime = (): RuntimePortsV1 => {
      runtime ??= createMediaSourcePtsCadenceR2RuntimePortsV1(options.environment);
      return runtime;
    };
    const getAnalysisPictureReader = (): NativeMediaTimestampPreviewSurfaceReaderPortV1 => {
      analysisPictureReader ??= getRuntime().previewSurface.createReader({ now: options.now });
      return analysisPictureReader;
    };
    const assetPorts = await createMediaSourceAudioArtifactAssetMongoPortsV1();
    const analysisRequested = 'deliveryContract' in input
      && input.deliveryContract === 'ANALYSIS_RECEIPT_V1';
    return materializeNativeMediaTimestampPreviewWindowV1(input, {
      projectSnapshotReader: {
        async loadProjectForMutation(userId, projectId) {
          const { projectService } = await import('./project-service');
          return projectService.loadProjectForMutation(userId, projectId);
        },
      },
      projectRevisionReader: projectServiceNativeMediaProjectRevisionReaderV1,
      assetReader: assetPorts,
      storedObjectReader: {
        read(sidecar) {
          return getRuntime().epochArtifactReader.read(sidecar);
        },
      },
      audioArtifactReader: options.audioArtifactReader ?? {
        readArtifactSet(reference) {
          return getRuntime().audioArtifact.readArtifactSet(reference);
        },
      },
      audioPreview: {
        pcmReader: {
          readPcmSampleRange(range) {
            return getRuntime().audioArtifact.readPcmSampleRange(range);
          },
        },
        createSurfaceStore({ leaseScope, lease }) {
          const leaseTtlMs = lease.expiresAtEpochMs - lease.issuedAtEpochMs;
          return getRuntime().audioPreviewSurface.createStore(leaseScope, {
            policy: {
              ...NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1,
              leaseTtlMs,
            },
            now: () => lease.issuedAtEpochMs,
          });
        },
      },
      createDecoder({ asset, leaseScope, materializationStartedAtEpochMs }) {
        const surfaceStore = getRuntime().previewSurface.createStore(leaseScope, {
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
      ...(analysisRequested ? {
        analysis: {
          pictureReader: {
            readPicture(pictureHandle) {
              return getAnalysisPictureReader().readPicture(pictureHandle);
            },
          },
          engine: options.analysisEngine
            ?? createNativeMediaTimestampLegacyVideoAnalysisEngineV1({
              ffmpegPath: options.ffmpegPath,
            }),
          policy: options.analysisPolicy
            ?? NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZER_DEFAULT_POLICY_V1,
        },
      } : {}),
      policy,
      now: options.now,
    });
  } catch (error) {
    return unverifiable('RUNTIME_UNAVAILABLE', diagnostic(error));
  }
}

function normalizeInput(
  input:
    | NativeMediaTimestampPreviewMaterializerInputV1
    | NativeMediaTimestampPreviewSessionMaterializerInputV1
    | NativeMediaTimestampAnalysisMaterializerInputV1,
) {
  const deliveryContract = 'deliveryContract' in input
    ? input.deliveryContract
    : 'PICTURE_ONLY_V2' as const;
  if (deliveryContract !== 'PICTURE_ONLY_V2'
    && deliveryContract !== 'PAIRED_SESSION_V3'
    && deliveryContract !== 'ANALYSIS_RECEIPT_V1') {
    throw new Error('NATIVE_MEDIA_PREVIEW_DELIVERY_CONTRACT_INVALID');
  }
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
    selectedSource: input.selectedSource
      ? normalizeSelectedSourceBinding(input.selectedSource)
      : null,
    deliveryContract,
  });
}

function normalizeSelectedSourceBinding(
  value: NativeMediaTimestampPreviewSelectedSourceBindingV1,
): NativeMediaTimestampPreviewSelectedSourceBindingV1 {
  return Object.freeze({
    sourceVersionSha256: sha256(
      value?.sourceVersionSha256,
      'NATIVE_MEDIA_PREVIEW_SELECTED_SOURCE_INVALID',
    ),
    storageVersionSha256: sha256(
      value?.storageVersionSha256,
      'NATIVE_MEDIA_PREVIEW_SELECTED_SOURCE_INVALID',
    ),
    sourcePtsCadenceMapStateSha256V3: sha256(
      value?.sourcePtsCadenceMapStateSha256V3,
      'NATIVE_MEDIA_PREVIEW_SELECTED_SOURCE_INVALID',
    ),
    ...(value?.bindingSha256 === undefined
      ? {}
      : {
          bindingSha256: sha256(
            value.bindingSha256,
            'NATIVE_MEDIA_PREVIEW_SELECTED_SOURCE_INVALID',
          ),
        }),
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
    overlayId: nonNegativeSafeInteger(overlay.id),
    from: nonNegativeSafeInteger(overlay.from),
    durationInFrames: positiveSafeInteger(overlay.durationInFrames),
    assetId: identifier(overlay.assetId, 'NATIVE_MEDIA_PREVIEW_ASSET_INVALID'),
    sourceStartFrame: nonNegativeSafeInteger(sourceStart),
    sourceEndFrame: sourceEnd === null ? null : positiveSafeInteger(sourceEnd),
    sourceVersionPinV1: overlay.sourceVersionPinV1,
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

function sourceAudioStreamIndexes(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): readonly number[] | null {
  const qualification = asset.sourceQualificationV1 as {
    observation?: { audioStreams?: unknown };
  } | undefined;
  const streams = qualification?.observation?.audioStreams;
  if (!Array.isArray(streams)) return null;
  const indexes: number[] = [];
  for (const stream of streams) {
    if (!stream || typeof stream !== 'object') return null;
    const streamIndex = (stream as { streamIndex?: unknown }).streamIndex;
    if (!Number.isSafeInteger(streamIndex) || Number(streamIndex) < 0
      || indexes.includes(Number(streamIndex))) return null;
    indexes.push(Number(streamIndex));
  }
  return Object.freeze(indexes.sort((left, right) => left - right));
}

function assertAudioArtifactMatchesAssetRecord(
  record: MediaSourceAudioArtifactAssetRecordV1,
  manifest: Parameters<typeof verifyMediaSourceAudioPrivateArtifactSetV1>[0]['manifest'],
  evidence: ReturnType<typeof verifyMediaSourceAudioPrivateArtifactSetV1>,
): void {
  const manifestSerialization = serializeMediaSourceAudioPrivateArtifactManifestV1(manifest);
  if (!sameAudioArtifactReference(
    manifestSerialization.reference,
    record.manifestReference,
  )
    || manifest.manifestSha256 !== record.manifestSha256
    || manifest.audioSampleEpochMapSha256 !== record.audioSampleEpochMapSha256
    || manifest.decodedPcmSha256 !== record.decodedPcmSha256
    || manifest.decodedSampleFrameCount !== record.decodedSampleFrameCount
    || evidence.audioSampleEpochMapSha256 !== record.audioSampleEpochMapSha256
    || evidence.pcm.decodedPcmSha256 !== record.decodedPcmSha256
    || evidence.pcm.decodedSampleFrameCount !== record.decodedSampleFrameCount
    || evidence.binding.audioStreamIndex !== record.audioStreamIndex
    || evidence.binding.streamId !== record.streamId
    || evidence.binding.sampleRate !== record.sampleRate
    || evidence.binding.channelCount !== record.channelCount) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ARTIFACT_STATE_MISMATCH');
  }
}

function sameAudioArtifactReference(
  left: MediaSourceAudioArtifactAssetRecordV1['manifestReference'],
  right: MediaSourceAudioArtifactAssetRecordV1['manifestReference'],
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.storage === right.storage
    && left.artifactKind === right.artifactKind
    && left.objectKey === right.objectKey
    && left.byteLength === right.byteLength
    && left.contentSha256 === right.contentSha256;
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

async function releasePairedThen(
  decoder: NativeMediaTimestampMaterializingDecoderV1,
  decoderRequestSha256: string,
  audioSurfaceStore: NativeMediaTimestampPreviewAudioSurfaceStorePortV1 | null,
  audioWindow: NativeMediaTimestampPreviewSessionWindowV1['audioWindow'],
  reason: NativeMediaTimestampPreviewMaterializerReasonV1,
  detail: string | null = null,
): Promise<NativeMediaTimestampPreviewMaterializerResultV1> {
  let cleanupFailed = false;
  if (audioWindow) {
    if (!audioSurfaceStore) {
      cleanupFailed = true;
    } else {
      for (const segment of audioWindow.segments) {
        if (segment.kind !== 'PCM') continue;
        try {
          await audioSurfaceStore.deleteAudioSegment(segment.audioHandle);
        } catch {
          cleanupFailed = true;
        }
      }
    }
  }
  try {
    await decoder.releaseDecodedBatch(decoderRequestSha256);
  } catch {
    cleanupFailed = true;
  }
  return cleanupFailed ? unverifiable('CLEANUP_FAILED', reason) : unverifiable(reason, detail);
}

type ResolvedProjectSelectedSourceV1 = Extract<
  ProjectSelectedVideoSourceTimeBindingResultV1,
  { disposition: 'RESOLVED' }
>;

type SelectedAssetForPreviewResultV1 = Readonly<
  | {
      disposition: 'RESOLVED';
      asset: MediaSourceAudioArtifactAssetStateInputV1;
      selectedSource: ResolvedProjectSelectedSourceV1;
    }
  | {
      disposition: 'UNVERIFIABLE';
      diagnostic: string | null;
    }
>;

async function resolveSelectedAssetForPreview(input: Readonly<{
  projectId: string;
  overlayId: number;
  assetId: string;
  sourcePin: unknown;
  asset: MediaSourceAudioArtifactAssetStateInputV1;
  ports: NativeMediaTimestampPreviewMaterializerPortsV1;
}>): Promise<SelectedAssetForPreviewResultV1> {
  let evidenceLoaded = false;
  let evidenceValue: unknown | null = null;
  const loadEvidence = input.ports.selectedSource?.loadSourceVersionEvidence
    ?? loadDefaultSourceVersionEvidence;
  let selectedSource: ProjectSelectedVideoSourceTimeBindingResultV1;
  try {
    selectedSource = await resolveProjectSelectedVideoSourceTimeBindingV1({
      projectId: input.projectId,
      overlayId: input.overlayId,
      assetId: input.assetId,
      sourcePin: input.sourcePin,
      asset: input.asset,
      ports: {
        loadSourceVersionEvidence: async (scope) => {
          evidenceLoaded = true;
          evidenceValue = await loadEvidence(scope);
          return evidenceValue;
        },
      },
    });
  } catch (error) {
    return Object.freeze({
      disposition: 'UNVERIFIABLE' as const,
      diagnostic: diagnostic(error) ?? 'SELECTED_SOURCE_RESOLUTION_FAILED',
    });
  }
  if (selectedSource.disposition === 'UNVERIFIABLE') {
    return Object.freeze({
      disposition: 'UNVERIFIABLE' as const,
      diagnostic: selectedSource.reason,
    });
  }

  let selectedAsset = input.asset;
  if (selectedSource.sourceVersionEvidenceSha256 !== null) {
    if (!evidenceLoaded || evidenceValue === null) {
      return Object.freeze({
        disposition: 'UNVERIFIABLE' as const,
        diagnostic: 'SOURCE_VERSION_EVIDENCE_REQUIRED',
      });
    }
    try {
      const evidence = assertMediaSourceVersionEvidenceRecordV1(evidenceValue);
      if (evidence.evidenceSha256 !== selectedSource.sourceVersionEvidenceSha256) {
        throw new Error('SOURCE_VERSION_EVIDENCE_HASH_MISMATCH');
      }
      selectedAsset = mediaSourceVersionEvidenceAssetViewV1(evidence);
    } catch (error) {
      return Object.freeze({
        disposition: 'UNVERIFIABLE' as const,
        diagnostic: diagnostic(error) ?? 'SOURCE_VERSION_EVIDENCE_INVALID',
      });
    }
  }

  let selectedBinding: VerifiedVideoSourceEpochTimeBindingV3 | null;
  try {
    selectedBinding = resolveVerifiedVideoSourceEpochTimeBindingV3(selectedAsset);
  } catch (error) {
    return Object.freeze({
      disposition: 'UNVERIFIABLE' as const,
      diagnostic: diagnostic(error) ?? 'SELECTED_SOURCE_V3_REQUIRED',
    });
  }
  if (!selectedBinding
    || selectedAsset.assetId !== input.assetId
    || selectedAsset.type !== 'video'
    || !sameSelectedSourceBinding(selectedBinding, selectedSource.binding)) {
    return Object.freeze({
      disposition: 'UNVERIFIABLE' as const,
      diagnostic: 'SELECTED_SOURCE_SCOPE_MISMATCH',
    });
  }
  return Object.freeze({
    disposition: 'RESOLVED' as const,
    asset: selectedAsset,
    selectedSource,
  });
}

async function loadDefaultSourceVersionEvidence(
  scope: MediaSourceVersionEvidenceScopeV1,
): Promise<unknown | null> {
  const { createMediaSourceVersionEvidenceMongoStorePortsV1 } =
    await import('./media-source-version-evidence-mongo-store-v1');
  return createMediaSourceVersionEvidenceMongoStorePortsV1().load(scope);
}

function sameSelectedSourceBinding(
  left: VerifiedVideoSourceEpochTimeBindingV3,
  right: VerifiedVideoSourceEpochTimeBindingV3,
): boolean {
  return left.assetId === right.assetId
    && left.sourceVersionSha256 === right.sourceVersionSha256
    && left.storageVersionSha256 === right.storageVersionSha256
    && left.sourcePtsCadenceMapStateSha256V3
      === right.sourcePtsCadenceMapStateSha256V3
    && left.bindingSha256 === right.bindingSha256;
}

function selectedSourceBindingMatches(
  binding: VerifiedVideoSourceEpochTimeBindingV3,
  expected: NativeMediaTimestampPreviewSelectedSourceBindingV1 | null,
): boolean {
  return expected === null
    || (binding.sourceVersionSha256 === expected.sourceVersionSha256
      && binding.storageVersionSha256 === expected.storageVersionSha256
      && binding.sourcePtsCadenceMapStateSha256V3
        === expected.sourcePtsCadenceMapStateSha256V3
      && (expected.bindingSha256 === undefined
        || binding.bindingSha256 === expected.bindingSha256));
}

function sourceAudioArtifactStateHash(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): string | null | 'INVALID' {
  try {
    return readMediaSourceAudioArtifactAssetStateV1(asset)
      ?.sourceAudioArtifactsStateSha256V1 ?? null;
  } catch {
    return 'INVALID';
  }
}

async function assetStillMatches(input: Readonly<{
  assetReader: NativeMediaTimestampPreviewMaterializerPortsV1['assetReader'];
  projectId: string;
  overlayId: number;
  assetId: string;
  userId: string;
  sourcePin: unknown;
  ports: NativeMediaTimestampPreviewMaterializerPortsV1;
  bindingSha256: string;
  audioArtifactStateSha256: string | null;
}>): Promise<boolean> {
  try {
    const asset = await input.assetReader.load(input.assetId, input.userId);
    if (!asset) return false;
    const selected = await resolveSelectedAssetForPreview({
      projectId: input.projectId,
      overlayId: input.overlayId,
      assetId: input.assetId,
      sourcePin: input.sourcePin,
      asset,
      ports: input.ports,
    });
    return selected.disposition === 'RESOLVED'
      && selected.selectedSource.binding.bindingSha256 === input.bindingSha256
      && sourceAudioArtifactStateHash(selected.asset)
        === input.audioArtifactStateSha256;
  } catch {
    return false;
  }
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

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(code);
  }
  return value;
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
