import { readCanonicalFrameRateV1 } from '../contracts/canonical-media-time-v1';
import {
  nativeMediaFinalRenderAssetTimingStateSha256V1,
  readNativeMediaFinalRenderVideoOverlayV1,
} from './native-media-final-render-admission-v1';
import {
  resolveNativeMediaExactAudioEvidenceV1,
  type NativeMediaExactAudioEvidenceV1,
} from './native-media-exact-audio-evidence-v1';
import {
  readMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
} from './media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 } from './media-source-audio-private-artifact-port-v1';
import type { MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 } from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceEpochWindowResourcePolicyV3 } from './media-source-pts-cadence-epoch-window-reader-v3';
import { classifyMediaSourceTimestampManagementV1 } from './media-source-timestamp-management-v1';
import {
  createNativeMediaFinalRenderArtifactV1,
  createNativeMediaFinalRenderSourceLeaseV1,
  type NativeMediaFinalRenderArtifactAudioV1,
  type NativeMediaFinalRenderArtifactV1,
  type NativeMediaFinalRenderSourceLeaseV1,
  type NativeMediaFinalRenderSourceMaterializerPortV1,
} from './native-media-final-render-source-preparation-v1';
import type { Project, ProjectRevisionV1 } from './project-service';
import {
  assertVideoSourceTimestampConformV3,
  createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3,
  resolveVerifiedVideoSourceEpochTimeBindingV3,
  type VideoSourceTimestampConformResourcePolicyV2,
  type VideoSourceTimestampConformV3,
} from './video-source-time-transform-v1';

export const NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_V1' as const;

type NativeMediaFinalRenderMaterializerPolicyV1 = Readonly<{
  policyVersion: typeof NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1;
  maxTimelineFrames: number;
  maxArtifactBytes: string;
  epochWindow: MediaSourcePtsCadenceEpochWindowResourcePolicyV3;
  conform: VideoSourceTimestampConformResourcePolicyV2;
}>;

const NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_DEFAULT_POLICY_V1:
NativeMediaFinalRenderMaterializerPolicyV1 = Object.freeze({
  policyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
  maxTimelineFrames: 10_000,
  maxArtifactBytes: String(512 * 1024 * 1024 * 1024),
  epochWindow: Object.freeze({
    policyVersion: 'EDITRON_NATIVE_FINAL_RENDER_EPOCH_WINDOW_V1',
    maxFrameRecords: 100_000,
    maxBatchReads: 10_000,
    maxTotalReadBytes: 2 * 1024 * 1024 * 1024,
  }),
  conform: Object.freeze({
    policyVersion: 'EDITRON_NATIVE_FINAL_RENDER_CONFORM_V1',
    maxSourceFrames: 100_000,
    maxFrameQueries: 10_000,
  }),
});

export type NativeMediaFinalRenderEncodedArtifactV1 = Readonly<{
  publishHandle: string;
  artifactHandle: string;
  container: string;
  videoCodec: string;
  pixelFormat: string;
  videoFrameCount: string;
  decodedFrameSequenceSha256: string;
  remotionCompatibilityReceiptSha256: string;
  audio: NativeMediaFinalRenderArtifactAudioV1;
  contentType: string;
  artifactContentSha256: string;
  artifactByteLength: string;
}>;

export interface NativeMediaFinalRenderEncoderPortV1 {
  encode(input: Readonly<{
    asset: MediaSourceAudioArtifactAssetStateInputV1;
    transform: VideoSourceTimestampConformV3;
    audioEvidence: NativeMediaExactAudioEvidenceV1 | null;
  }>): Promise<Readonly<
    | { disposition: 'ARTIFACT_ENCODED'; encoded: NativeMediaFinalRenderEncodedArtifactV1 }
    | { disposition: 'UNVERIFIABLE'; diagnostic: string | null }
  >>;
}

export interface NativeMediaFinalRenderPublisherPortV1 {
  publish(input: Readonly<{
    artifact: NativeMediaFinalRenderArtifactV1;
    publishHandle: string;
    minimumExpiresAtEpochMs: number;
  }>): Promise<Readonly<
    | { disposition: 'SOURCE_PUBLISHED'; lease: NativeMediaFinalRenderSourceLeaseV1 }
    | { disposition: 'UNVERIFIABLE'; diagnostic: string | null }
  >>;
}

type NativeMediaFinalRenderMaterializerPortsV1 = Readonly<{
  projectSnapshotReader: Readonly<{
    loadProjectForMutation(userId: string, projectId: string): Promise<{
      project: Project;
      revision: ProjectRevisionV1;
    }>;
  }>;
  projectRevisionReader: Readonly<{
    getProjectRevision(userId: string, projectId: string): Promise<ProjectRevisionV1>;
  }>;
  assetReader: Readonly<{
    load(assetId: string, userId: string): Promise<MediaSourceAudioArtifactAssetStateInputV1 | null>;
  }>;
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  audioArtifactReader?: MediaSourceAudioPrivateArtifactReaderV1;
  encoder: NativeMediaFinalRenderEncoderPortV1;
  publisher: NativeMediaFinalRenderPublisherPortV1;
}>;

export function createNativeMediaFinalRenderSourceMaterializerV1(
  ports: NativeMediaFinalRenderMaterializerPortsV1,
  policyInput: NativeMediaFinalRenderMaterializerPolicyV1 =
    NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_DEFAULT_POLICY_V1,
): NativeMediaFinalRenderSourceMaterializerPortV1 {
  const policy = normalizePolicy(policyInput);
  assertPorts(ports);
  return {
    async materialize(input) {
      let scope: ReturnType<typeof normalizeScope>;
      try {
        scope = normalizeScope(input);
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_INPUT_INVALID');
      }
      let snapshot: Awaited<ReturnType<
        typeof ports.projectSnapshotReader.loadProjectForMutation
      >>;
      try {
        snapshot = await ports.projectSnapshotReader.loadProjectForMutation(
          scope.userId,
          scope.projectId,
        );
      } catch {
        return fail('NATIVE_MEDIA_FINAL_RENDER_PROJECT_UNAVAILABLE');
      }
      if (snapshot.project.projectId !== scope.projectId
        || scope.sequenceId !== 'main'
        || !sameRevision(snapshot.revision, scope.projectRevision)) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_PROJECT_SCOPE_STALE');
      }
      const candidate = snapshot.project.overlays.find(
        (overlay) => String(overlay.id) === scope.request.overlayId,
      );
      if (!candidate) return fail('NATIVE_MEDIA_FINAL_RENDER_OVERLAY_UNAVAILABLE');
      let overlay: ReturnType<typeof readNativeMediaFinalRenderVideoOverlayV1>;
      try {
        overlay = readNativeMediaFinalRenderVideoOverlayV1(candidate);
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_OVERLAY_INVALID');
      }
      if (overlay.assetId !== scope.request.assetId
        || overlay.overlayTimingSha256 !== scope.request.overlayTimingSha256
        || overlay.renderNativeAudio !== scope.request.renderNativeAudio) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_OVERLAY_SCOPE_STALE');
      }
      if (overlay.retimed) return fail('NATIVE_MEDIA_FINAL_RENDER_RETIME_UNSUPPORTED');
      if (overlay.durationInFrames > policy.maxTimelineFrames) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_TIMELINE_RESOURCE_LIMIT');
      }

      let asset: MediaSourceAudioArtifactAssetStateInputV1 | null;
      try {
        asset = await ports.assetReader.load(scope.request.assetId, scope.userId);
      } catch {
        return fail('NATIVE_MEDIA_FINAL_RENDER_ASSET_UNAVAILABLE');
      }
      if (!asset || asset.assetId !== scope.request.assetId || asset.type !== 'video'
        || nativeMediaFinalRenderAssetTimingStateSha256V1(asset)
          !== scope.request.assetTimingStateSha256
        || classifyMediaSourceTimestampManagementV1(asset) !== 'V3') {
        return fail('NATIVE_MEDIA_FINAL_RENDER_ASSET_SCOPE_STALE');
      }
      let binding: NonNullable<ReturnType<typeof resolveVerifiedVideoSourceEpochTimeBindingV3>>;
      try {
        binding = resolveVerifiedVideoSourceEpochTimeBindingV3(asset)!;
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_V3_BINDING_INVALID');
      }
      if (!binding || binding.assetId !== scope.request.assetId
        || binding.sourceVersionSha256 !== scope.request.sourceVersionSha256
        || binding.storageVersionSha256 !== scope.request.storageVersionSha256
        || binding.sourceBindingSha256 !== scope.request.sourceBindingSha256
        || binding.sourcePtsCadenceMapStateSha256V3
          !== scope.request.sourcePtsCadenceMapStateSha256V3) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_V3_BINDING_STALE');
      }

      let projectRate: ReturnType<typeof readCanonicalFrameRateV1>;
      try {
        projectRate = readCanonicalFrameRateV1(snapshot.project.fps);
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_PROJECT_RATE_INVALID');
      }
      if (projectRate.provenance === 'LEGACY_NUMERIC_DECIMAL_V1'
        && !Number.isSafeInteger(snapshot.project.fps)) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_PROJECT_RATE_AMBIGUOUS');
      }

      const sourceStart = BigInt(overlay.sourceStartFrame);
      const sourceEnd = overlay.sourceEndFrame === null
        ? BigInt(binding.totalSourceFrameCount)
        : BigInt(overlay.sourceEndFrame);
      if (sourceStart >= sourceEnd || sourceEnd > BigInt(binding.totalSourceFrameCount)) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_SOURCE_RANGE_INVALID');
      }
      if (sourceEnd - sourceStart > BigInt(policy.epochWindow.maxFrameRecords)) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_SOURCE_RESOURCE_LIMIT');
      }

      const audio = await resolveNativeMediaExactAudioEvidenceV1({
        asset,
        required: scope.request.renderNativeAudio,
        reader: ports.audioArtifactReader,
      });
      if (audio.disposition === 'UNVERIFIABLE') {
        return fail(`NATIVE_MEDIA_FINAL_RENDER_${audio.reason}`);
      }
      const audioEvidence = audio.disposition === 'EXACT_AUDIO_EVIDENCE_READY'
        ? audio.selected
        : null;
      const timelineStart = BigInt(overlay.from);
      const timelineQueries = Array.from(
        { length: overlay.durationInFrames },
        (_, index) => String(timelineStart + BigInt(index)),
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
          projectRate: projectRate.rate,
          timelineStartFrame: String(overlay.from),
          timelineFrameQueries: timelineQueries,
          sourceAnchorFrameOrdinal: sourceStart.toString(),
          resourcePolicy: policy.conform,
          ...(audioEvidence === null ? {} : {
            audio: {
              evidence: audioEvidence.evidence,
              endExclusiveTimelineFrame: String(overlay.from + overlay.durationInFrames),
            },
          }),
        });
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_CONFORM_FAILED');
      }
      if (conform.disposition !== 'CONFORM_CREATED') {
        return fail(`NATIVE_MEDIA_FINAL_RENDER_CONFORM_${conform.reason}`);
      }
      let transform: VideoSourceTimestampConformV3;
      try {
        transform = assertVideoSourceTimestampConformV3(conform.transform);
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_TRANSFORM_INVALID');
      }
      if (transform.sourceBinding.bindingSha256 !== binding.bindingSha256
        || transform.timelineStartFrame !== String(overlay.from)
        || transform.queryCount !== String(overlay.durationInFrames)
        || transform.frameSelections.length !== overlay.durationInFrames
        || (scope.request.renderNativeAudio ? transform.audioMapping === null
          : transform.audioMapping !== null)) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_TRANSFORM_SCOPE_MISMATCH');
      }

      let encodedResult: Awaited<ReturnType<typeof ports.encoder.encode>>;
      try {
        encodedResult = await ports.encoder.encode({ asset, transform, audioEvidence });
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_ENCODER_FAILED');
      }
      if (!encodedResult || encodedResult.disposition !== 'ARTIFACT_ENCODED') {
        return fail(encodedResult?.disposition === 'UNVERIFIABLE'
          ? safeDiagnostic(encodedResult.diagnostic)
            ?? 'NATIVE_MEDIA_FINAL_RENDER_ENCODER_FAILED'
          : 'NATIVE_MEDIA_FINAL_RENDER_ENCODER_FAILED');
      }
      const encoded = encodedResult.encoded;
      const artifactByteLength = readPositiveIntegerText(encoded?.artifactByteLength);
      if (encoded.videoFrameCount !== String(overlay.durationInFrames)
        || artifactByteLength === null
        || artifactByteLength > BigInt(policy.maxArtifactBytes)
        || !encodedAudioMatches(encoded.audio, transform.audioMapping)) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_ENCODED_ARTIFACT_SCOPE_MISMATCH');
      }
      let artifact: NativeMediaFinalRenderArtifactV1;
      try {
        artifact = createNativeMediaFinalRenderArtifactV1({
          schemaVersion: 1,
          kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1',
          artifactHandle: encoded.artifactHandle,
          projectId: scope.projectId,
          sequenceId: scope.sequenceId,
          projectRevision: scope.projectRevision,
          overlayId: scope.request.overlayId,
          assetId: scope.request.assetId,
          overlayTimingSha256: scope.request.overlayTimingSha256,
          assetTimingStateSha256: scope.request.assetTimingStateSha256,
          sourceVersionSha256: scope.request.sourceVersionSha256,
          storageVersionSha256: scope.request.storageVersionSha256,
          sourceBindingSha256: scope.request.sourceBindingSha256,
          sourcePtsCadenceMapStateSha256V3:
            scope.request.sourcePtsCadenceMapStateSha256V3,
          transformSha256: transform.transformSha256,
          projectRate: transform.projectRate,
          timelineStartFrame: String(overlay.from),
          timelineFrameCount: String(overlay.durationInFrames),
          artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
          container: encoded.container,
          videoCodec: encoded.videoCodec,
          pixelFormat: encoded.pixelFormat,
          videoFrameCount: encoded.videoFrameCount,
          decodedFrameSequenceSha256: encoded.decodedFrameSequenceSha256,
          remotionCompatibilityReceiptSha256: encoded.remotionCompatibilityReceiptSha256,
          audio: encoded.audio,
          contentType: encoded.contentType,
          artifactContentSha256: encoded.artifactContentSha256,
          artifactByteLength: encoded.artifactByteLength,
        });
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_INVALID');
      }

      let published: Awaited<ReturnType<typeof ports.publisher.publish>>;
      try {
        published = await ports.publisher.publish({
          artifact,
          publishHandle: encoded.publishHandle,
          minimumExpiresAtEpochMs: scope.minimumExpiresAtEpochMs,
        });
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_PUBLISH_FAILED');
      }
      if (!published || published.disposition !== 'SOURCE_PUBLISHED') {
        return fail(published?.disposition === 'UNVERIFIABLE'
          ? safeDiagnostic(published.diagnostic)
            ?? 'NATIVE_MEDIA_FINAL_RENDER_PUBLISH_FAILED'
          : 'NATIVE_MEDIA_FINAL_RENDER_PUBLISH_FAILED');
      }
      let lease: NativeMediaFinalRenderSourceLeaseV1;
      try {
        lease = createNativeMediaFinalRenderSourceLeaseV1({
          leaseId: published.lease.leaseId,
          artifact: published.lease.artifact,
          sourceUrl: published.lease.sourceUrl,
          issuedAtEpochMs: published.lease.issuedAtEpochMs,
          expiresAtEpochMs: published.lease.expiresAtEpochMs,
        });
      } catch (error) {
        return fail(diagnostic(error) ?? 'NATIVE_MEDIA_FINAL_RENDER_LEASE_INVALID');
      }
      if (lease.leaseBindingSha256 !== published.lease.leaseBindingSha256
        || lease.sourceUrlSha256 !== published.lease.sourceUrlSha256
        || lease.artifact.artifactBindingSha256 !== artifact.artifactBindingSha256
        || lease.expiresAtEpochMs < scope.minimumExpiresAtEpochMs) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_LEASE_SCOPE_MISMATCH');
      }

      let freshAsset: MediaSourceAudioArtifactAssetStateInputV1 | null;
      try {
        freshAsset = await ports.assetReader.load(scope.request.assetId, scope.userId);
      } catch {
        freshAsset = null;
      }
      if (!freshAsset
        || nativeMediaFinalRenderAssetTimingStateSha256V1(freshAsset)
          !== scope.request.assetTimingStateSha256
        || !freshAudioStateMatches(freshAsset, audioEvidence)) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_ASSET_CHANGED_DURING_MATERIALIZATION');
      }
      let freshRevision: ProjectRevisionV1;
      try {
        freshRevision = await ports.projectRevisionReader.getProjectRevision(
          scope.userId,
          scope.projectId,
        );
      } catch {
        return fail('NATIVE_MEDIA_FINAL_RENDER_PROJECT_CHANGED_DURING_MATERIALIZATION');
      }
      if (!sameRevision(freshRevision, scope.projectRevision)) {
        return fail('NATIVE_MEDIA_FINAL_RENDER_PROJECT_CHANGED_DURING_MATERIALIZATION');
      }
      return Object.freeze({ disposition: 'SOURCE_MATERIALIZED' as const, lease });
    },
  };
}

function encodedAudioMatches(
  encoded: NativeMediaFinalRenderArtifactAudioV1,
  mapping: VideoSourceTimestampConformV3['audioMapping'],
): boolean {
  if (mapping === null) return encoded.disposition === 'NO_AUDIO_MAPPING_REQUESTED';
  return encoded.disposition === 'EMBEDDED_EXACT_NATIVE_PCM'
    && encoded.audioMappingSha256 === mapping.audioMappingSha256
    && encoded.sourceDecodedPcmSha256 === mapping.decodedPcmSha256
    && encoded.sampleRate === mapping.sampleRate
    && encoded.channelCount === mapping.channelCount;
}

function freshAudioStateMatches(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
  selected: NativeMediaExactAudioEvidenceV1 | null,
): boolean {
  if (selected === null) return true;
  try {
    return readMediaSourceAudioArtifactAssetStateV1(asset)
      ?.sourceAudioArtifactsStateSha256V1 === selected.assetStateSha256;
  } catch {
    return false;
  }
}

function normalizeScope(
  input: Parameters<NativeMediaFinalRenderSourceMaterializerPortV1['materialize']>[0],
) {
  if (!input || !input.request || !Number.isSafeInteger(input.minimumExpiresAtEpochMs)
    || input.minimumExpiresAtEpochMs < 0) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_INPUT_INVALID');
  }
  return Object.freeze({
    userId: identifier(input.userId),
    projectId: identifier(input.projectId),
    sequenceId: identifier(input.sequenceId),
    projectRevision: normalizeRevision(input.projectRevision),
    request: input.request,
    minimumExpiresAtEpochMs: input.minimumExpiresAtEpochMs,
  });
}

function normalizePolicy(
  value: NativeMediaFinalRenderMaterializerPolicyV1,
): NativeMediaFinalRenderMaterializerPolicyV1 {
  if (!value || value.policyVersion !== NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1
    || !positiveInteger(value.maxTimelineFrames) || value.maxTimelineFrames > 10_000
    || !/^[1-9]\d{0,127}$/.test(value.maxArtifactBytes)
    || !positiveInteger(value.epochWindow?.maxFrameRecords)
    || !positiveInteger(value.epochWindow?.maxBatchReads)
    || !positiveInteger(value.epochWindow?.maxTotalReadBytes)
    || !positiveInteger(value.conform?.maxSourceFrames)
    || !positiveInteger(value.conform?.maxFrameQueries)
    || value.maxTimelineFrames > value.conform.maxFrameQueries) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_POLICY_INVALID');
  }
  return value;
}

function assertPorts(value: NativeMediaFinalRenderMaterializerPortsV1): void {
  if (!value || typeof value.projectSnapshotReader?.loadProjectForMutation !== 'function'
    || typeof value.projectRevisionReader?.getProjectRevision !== 'function'
    || typeof value.assetReader?.load !== 'function'
    || typeof value.storedObjectReader?.read !== 'function'
    || typeof value.encoder?.encode !== 'function'
    || typeof value.publisher?.publish !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PORTS_INVALID');
  }
}

function normalizeRevision(value: ProjectRevisionV1): ProjectRevisionV1 {
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.value) || value.value < 0
    || typeof value.compatibilityUpdatedAt !== 'string'
    || Number.isNaN(Date.parse(value.compatibilityUpdatedAt))) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_REVISION_INVALID');
  }
  return Object.freeze({ ...value });
}

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left?.schemaVersion === 1 && right?.schemaVersion === 1
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 256
    || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_IDENTIFIER_INVALID');
  }
  return value.trim();
}

function positiveInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function readPositiveIntegerText(value: unknown): bigint | null {
  return typeof value === 'string' && /^[1-9]\d{0,127}$/.test(value)
    ? BigInt(value)
    : null;
}

function fail(diagnosticCode: string | null) {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    diagnostic: safeDiagnostic(diagnosticCode),
  });
}

function safeDiagnostic(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9_]{1,200}$/.test(value)
    ? value
    : null;
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,200}$/.test(error.message)
    ? error.message
    : null;
}
