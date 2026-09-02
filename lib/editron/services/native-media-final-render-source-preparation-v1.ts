import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type { ProjectRevisionV1 } from './project-service';

export const NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_SOURCE_LEASE_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_SOURCE_LEASE_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_OVERLAY_BINDING_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_OVERLAY_BINDING_V1' as const;

const MAX_EXACT_OVERLAYS = 100_000;
const MAX_LEASE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export type NativeMediaFinalRenderExactSourceRequestV1 = Readonly<{
  overlayId: string;
  assetId: string;
  overlayTimingSha256: string;
  assetTimingStateSha256: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  sourcePtsCadenceMapStateSha256V3: string;
  renderNativeAudio: boolean;
}>;

export type NativeMediaFinalRenderArtifactAudioV1 = Readonly<
  | {
      disposition: 'NO_AUDIO_MAPPING_REQUESTED';
      audioCodec: null;
      audioMappingSha256: null;
      sourceDecodedPcmSha256: null;
      artifactDecodedPcmSha256: null;
      decodedPcmEquivalenceReceiptSha256: null;
      sampleRate: null;
      channelCount: null;
      decodedSampleFrameCount: null;
    }
  | {
      disposition: 'EMBEDDED_EXACT_NATIVE_PCM';
      audioCodec: string;
      audioMappingSha256: string;
      sourceDecodedPcmSha256: string;
      artifactDecodedPcmSha256: string;
      decodedPcmEquivalenceReceiptSha256: string;
      sampleRate: string;
      channelCount: number;
      decodedSampleFrameCount: string;
    }
>;

export type NativeMediaFinalRenderArtifactV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_KIND_V1;
  artifactHandle: string;
  projectId: string;
  sequenceId: string;
  projectRevision: ProjectRevisionV1;
  overlayId: string;
  assetId: string;
  overlayTimingSha256: string;
  assetTimingStateSha256: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  sourcePtsCadenceMapStateSha256V3: string;
  transformSha256: string;
  projectRate: Readonly<{ numerator: string; denominator: string }>;
  timelineStartFrame: string;
  timelineFrameCount: string;
  artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1';
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
  artifactBindingSha256: string;
}>;

export type NativeMediaFinalRenderSourceLeaseV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_SOURCE_LEASE_KIND_V1;
  leaseId: string;
  artifact: NativeMediaFinalRenderArtifactV1;
  sourceUrl: string;
  sourceUrlSha256: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
  leaseBindingSha256: string;
}>;

export type NativeMediaFinalRenderOverlayBindingV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_OVERLAY_BINDING_KIND_V1;
  artifactBindingSha256: string;
  leaseId: string;
  leaseBindingSha256: string;
  expiresAtEpochMs: number;
  visualMapping: 'ONE_ARTIFACT_FRAME_PER_PROJECT_FRAME';
  audioDisposition: NativeMediaFinalRenderArtifactAudioV1['disposition'];
}>;

export interface NativeMediaFinalRenderSourceMaterializerPortV1 {
  materialize(input: Readonly<{
    userId: string;
    projectId: string;
    sequenceId: string;
    projectRevision: ProjectRevisionV1;
    request: NativeMediaFinalRenderExactSourceRequestV1;
    minimumExpiresAtEpochMs: number;
  }>): Promise<Readonly<
    | { disposition: 'SOURCE_MATERIALIZED'; lease: NativeMediaFinalRenderSourceLeaseV1 }
    | { disposition: 'UNVERIFIABLE'; diagnostic: string | null }
  >>;
}

export type NativeMediaFinalRenderSourcePreparationResultV1 = Readonly<
  | {
      disposition: 'SOURCES_PREPARED';
      overlays: readonly Overlay[];
      leases: readonly NativeMediaFinalRenderSourceLeaseV1[];
      receipt: Readonly<{
        schemaVersion: 1;
        kind: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_KIND_V1;
        projectId: string;
        sequenceId: string;
        projectRevision: ProjectRevisionV1;
        exactOverlays: readonly Readonly<{
          overlayId: string;
          assetId: string;
          overlayTimingSha256: string;
          assetTimingStateSha256: string;
          artifactBindingSha256: string;
          leaseId: string;
          leaseBindingSha256: string;
          leaseExpiresAtEpochMs: number;
          audioDisposition: NativeMediaFinalRenderArtifactAudioV1['disposition'];
        }>[];
        receiptSha256: string;
      }>;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'INPUT_INVALID'
        | 'EXACT_REQUEST_SCOPE_INVALID'
        | 'SOURCE_MATERIALIZATION_FAILED'
        | 'SOURCE_LEASE_INVALID'
        | 'ASSET_CHANGED_DURING_PREPARATION'
        | 'PROJECT_CHANGED_DURING_PREPARATION';
      overlayId: string | null;
      assetId: string | null;
      diagnostic: string | null;
    }
>;

export async function prepareNativeMediaFinalRenderSourcesV1(input: Readonly<{
  userId: string;
  projectId: string;
  sequenceId: string;
  projectRevision: ProjectRevisionV1;
  overlays: readonly Overlay[];
  exactRequests: readonly NativeMediaFinalRenderExactSourceRequestV1[];
  minimumRemainingLeaseMs: number;
  materializer: NativeMediaFinalRenderSourceMaterializerPortV1;
  assetStateReader: Readonly<{
    readTimingStateSha256(userId: string, assetId: string): Promise<string | null>;
  }>;
  projectRevisionReader: Readonly<{
    getProjectRevision(userId: string, projectId: string): Promise<ProjectRevisionV1>;
  }>;
  now?: () => number;
}>): Promise<NativeMediaFinalRenderSourcePreparationResultV1> {
  let normalized: ReturnType<typeof normalizeInput>;
  try {
    normalized = normalizeInput(input);
  } catch (error) {
    return blocked('INPUT_INVALID', null, null, diagnostic(error));
  }
  if (normalized.requests.length === 0) {
    return prepared(normalized, normalized.overlays, []);
  }

  const now = normalized.now();
  const minimumExpiresAtEpochMs = now + normalized.minimumRemainingLeaseMs;
  if (!Number.isSafeInteger(minimumExpiresAtEpochMs)) {
    return blocked('INPUT_INVALID', null, null, 'NATIVE_MEDIA_RENDER_LEASE_RANGE_INVALID');
  }

  const overlayById = new Map(normalized.overlays.map((overlay) => [String(overlay.id), overlay]));
  const leases: NativeMediaFinalRenderSourceLeaseV1[] = [];
  const leaseByOverlayId = new Map<string, NativeMediaFinalRenderSourceLeaseV1>();

  for (const request of normalized.requests) {
    const overlay = overlayById.get(request.overlayId);
    if (!overlay || overlay.type !== 'video' || overlay.assetId !== request.assetId) {
      return blocked(
        'EXACT_REQUEST_SCOPE_INVALID', request.overlayId, request.assetId, null,
      );
    }
    let result: Awaited<ReturnType<typeof normalized.materializer.materialize>>;
    try {
      result = await normalized.materializer.materialize({
        userId: normalized.userId,
        projectId: normalized.projectId,
        sequenceId: normalized.sequenceId,
        projectRevision: normalized.projectRevision,
        request,
        minimumExpiresAtEpochMs,
      });
    } catch (error) {
      return blocked(
        'SOURCE_MATERIALIZATION_FAILED', request.overlayId, request.assetId, diagnostic(error),
      );
    }
    if (!result || result.disposition !== 'SOURCE_MATERIALIZED') {
      return blocked(
        'SOURCE_MATERIALIZATION_FAILED', request.overlayId, request.assetId,
        result?.disposition === 'UNVERIFIABLE' ? result.diagnostic : null,
      );
    }
    let lease: NativeMediaFinalRenderSourceLeaseV1;
    try {
      lease = assertNativeMediaFinalRenderSourceLeaseV1(result.lease, {
        projectId: normalized.projectId,
        sequenceId: normalized.sequenceId,
        projectRevision: normalized.projectRevision,
        request,
        minimumExpiresAtEpochMs,
        maximumExpiresAtEpochMs: now + MAX_LEASE_TTL_MS,
        overlayFrom: overlay.from,
        overlayDurationInFrames: overlay.durationInFrames,
      });
    } catch (error) {
      return blocked(
        'SOURCE_LEASE_INVALID', request.overlayId, request.assetId, diagnostic(error),
      );
    }
    leases.push(lease);
    leaseByOverlayId.set(request.overlayId, lease);
  }

  for (const request of normalized.requests) {
    let currentState: string | null;
    try {
      currentState = await normalized.assetStateReader.readTimingStateSha256(
        normalized.userId,
        request.assetId,
      );
    } catch {
      currentState = null;
    }
    if (currentState !== request.assetTimingStateSha256) {
      return blocked(
        'ASSET_CHANGED_DURING_PREPARATION', request.overlayId, request.assetId, null,
      );
    }
  }

  let currentRevision: ProjectRevisionV1;
  try {
    currentRevision = normalizeRevision(await normalized.projectRevisionReader.getProjectRevision(
      normalized.userId,
      normalized.projectId,
    ));
  } catch {
    return blocked('PROJECT_CHANGED_DURING_PREPARATION', null, null, null);
  }
  if (!sameRevision(currentRevision, normalized.projectRevision)) {
    return blocked('PROJECT_CHANGED_DURING_PREPARATION', null, null, null);
  }

  const rewritten = normalized.overlays.map((overlay) => {
    const lease = leaseByOverlayId.get(String(overlay.id));
    if (!lease || overlay.type !== 'video') return overlay;
    const withoutSpeedTracks = overlay.keyframeTracks?.filter(
      (track: { property?: string }) => track.property !== 'speed',
    );
    const binding: NativeMediaFinalRenderOverlayBindingV1 = Object.freeze({
      schemaVersion: 1,
      kind: NATIVE_MEDIA_FINAL_RENDER_OVERLAY_BINDING_KIND_V1,
      artifactBindingSha256: lease.artifact.artifactBindingSha256,
      leaseId: lease.leaseId,
      leaseBindingSha256: lease.leaseBindingSha256,
      expiresAtEpochMs: lease.expiresAtEpochMs,
      visualMapping: 'ONE_ARTIFACT_FRAME_PER_PROJECT_FRAME',
      audioDisposition: lease.artifact.audio.disposition,
    });
    return Object.freeze({
      ...overlay,
      src: lease.sourceUrl,
      content: lease.sourceUrl,
      sourceStartFrame: 0,
      sourceEndFrame: overlay.durationInFrames,
      videoStartTime: 0,
      speed: 1,
      speedCurve: undefined,
      keyframeTracks: withoutSpeedTracks,
      hasNativeAudio: lease.artifact.audio.disposition === 'EMBEDDED_EXACT_NATIVE_PCM',
      nativeMediaFinalRenderSourceV1: binding,
    });
  });
  return prepared(normalized, rewritten, leases);
}

export function createNativeMediaFinalRenderArtifactV1(
  material: Omit<NativeMediaFinalRenderArtifactV1, 'artifactBindingSha256'>,
): NativeMediaFinalRenderArtifactV1 {
  const candidate = {
    ...material,
    artifactBindingSha256: hashEditronCanonicalJsonV1(material),
  };
  return assertArtifact(candidate);
}

export function createNativeMediaFinalRenderSourceLeaseV1(input: Readonly<{
  leaseId: string;
  artifact: NativeMediaFinalRenderArtifactV1;
  sourceUrl: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}>): NativeMediaFinalRenderSourceLeaseV1 {
  const artifact = assertArtifact(input.artifact);
  const sourceUrl = httpsUrl(input.sourceUrl);
  const sourceUrlSha256 = hashEditronCanonicalJsonV1(sourceUrl);
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_SOURCE_LEASE_KIND_V1,
    leaseId: identifier(input.leaseId, 'NATIVE_MEDIA_RENDER_LEASE_ID_INVALID'),
    artifact,
    sourceUrl,
    sourceUrlSha256,
    issuedAtEpochMs: epochMs(input.issuedAtEpochMs),
    expiresAtEpochMs: epochMs(input.expiresAtEpochMs),
  };
  if (material.expiresAtEpochMs <= material.issuedAtEpochMs) {
    throw new Error('NATIVE_MEDIA_RENDER_LEASE_RANGE_INVALID');
  }
  return Object.freeze({
    ...material,
    leaseBindingSha256: hashEditronCanonicalJsonV1({
      schemaVersion: material.schemaVersion,
      kind: material.kind,
      leaseId: material.leaseId,
      artifact: material.artifact,
      sourceUrlSha256: material.sourceUrlSha256,
      issuedAtEpochMs: material.issuedAtEpochMs,
      expiresAtEpochMs: material.expiresAtEpochMs,
    }),
  });
}

function assertNativeMediaFinalRenderSourceLeaseV1(
  value: NativeMediaFinalRenderSourceLeaseV1,
  expected: Readonly<{
    projectId: string;
    sequenceId: string;
    projectRevision: ProjectRevisionV1;
    request: NativeMediaFinalRenderExactSourceRequestV1;
    minimumExpiresAtEpochMs: number;
    maximumExpiresAtEpochMs: number;
    overlayFrom: number;
    overlayDurationInFrames: number;
  }>,
): NativeMediaFinalRenderSourceLeaseV1 {
  if (!value || value.schemaVersion !== 1
    || value.kind !== NATIVE_MEDIA_FINAL_RENDER_SOURCE_LEASE_KIND_V1) {
    throw new Error('NATIVE_MEDIA_RENDER_LEASE_INVALID');
  }
  const recreated = createNativeMediaFinalRenderSourceLeaseV1({
    leaseId: value.leaseId,
    artifact: value.artifact,
    sourceUrl: value.sourceUrl,
    issuedAtEpochMs: value.issuedAtEpochMs,
    expiresAtEpochMs: value.expiresAtEpochMs,
  });
  if (recreated.sourceUrlSha256 !== value.sourceUrlSha256
    || recreated.leaseBindingSha256 !== value.leaseBindingSha256
    || recreated.expiresAtEpochMs < expected.minimumExpiresAtEpochMs
    || recreated.expiresAtEpochMs > expected.maximumExpiresAtEpochMs) {
    throw new Error('NATIVE_MEDIA_RENDER_LEASE_BINDING_INVALID');
  }
  const artifact = recreated.artifact;
  const request = expected.request;
  if (artifact.projectId !== expected.projectId
    || artifact.sequenceId !== expected.sequenceId
    || !sameRevision(artifact.projectRevision, expected.projectRevision)
    || artifact.overlayId !== request.overlayId
    || artifact.assetId !== request.assetId
    || artifact.overlayTimingSha256 !== request.overlayTimingSha256
    || artifact.assetTimingStateSha256 !== request.assetTimingStateSha256
    || artifact.sourceVersionSha256 !== request.sourceVersionSha256
    || artifact.storageVersionSha256 !== request.storageVersionSha256
    || artifact.sourceBindingSha256 !== request.sourceBindingSha256
    || artifact.sourcePtsCadenceMapStateSha256V3
      !== request.sourcePtsCadenceMapStateSha256V3
    || artifact.timelineStartFrame !== String(expected.overlayFrom)
    || artifact.timelineFrameCount !== String(expected.overlayDurationInFrames)
    || artifact.videoFrameCount !== artifact.timelineFrameCount
    || (request.renderNativeAudio
      ? artifact.audio.disposition !== 'EMBEDDED_EXACT_NATIVE_PCM'
      : artifact.audio.disposition !== 'NO_AUDIO_MAPPING_REQUESTED')) {
    throw new Error('NATIVE_MEDIA_RENDER_ARTIFACT_SCOPE_MISMATCH');
  }
  return recreated;
}

function assertArtifact(value: NativeMediaFinalRenderArtifactV1): NativeMediaFinalRenderArtifactV1 {
  if (!value || value.schemaVersion !== 1
    || value.kind !== NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_KIND_V1
    || value.artifactProfile !== 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1') {
    throw new Error('NATIVE_MEDIA_RENDER_ARTIFACT_INVALID');
  }
  const audio = assertAudio(value.audio);
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_KIND_V1,
    artifactHandle: identifier(value.artifactHandle, 'NATIVE_MEDIA_RENDER_ARTIFACT_INVALID'),
    projectId: identifier(value.projectId, 'NATIVE_MEDIA_RENDER_ARTIFACT_INVALID'),
    sequenceId: identifier(value.sequenceId, 'NATIVE_MEDIA_RENDER_ARTIFACT_INVALID'),
    projectRevision: normalizeRevision(value.projectRevision),
    overlayId: identifier(value.overlayId, 'NATIVE_MEDIA_RENDER_ARTIFACT_INVALID'),
    assetId: identifier(value.assetId, 'NATIVE_MEDIA_RENDER_ARTIFACT_INVALID'),
    overlayTimingSha256: sha256(value.overlayTimingSha256),
    assetTimingStateSha256: sha256(value.assetTimingStateSha256),
    sourceVersionSha256: sha256(value.sourceVersionSha256),
    storageVersionSha256: sha256(value.storageVersionSha256),
    sourceBindingSha256: sha256(value.sourceBindingSha256),
    sourcePtsCadenceMapStateSha256V3: sha256(value.sourcePtsCadenceMapStateSha256V3),
    transformSha256: sha256(value.transformSha256),
    projectRate: rational(value.projectRate),
    timelineStartFrame: nonNegativeIntegerText(value.timelineStartFrame),
    timelineFrameCount: positiveIntegerText(value.timelineFrameCount),
    artifactProfile: value.artifactProfile,
    container: identifier(value.container, 'NATIVE_MEDIA_RENDER_ARTIFACT_INVALID'),
    videoCodec: identifier(value.videoCodec, 'NATIVE_MEDIA_RENDER_ARTIFACT_INVALID'),
    pixelFormat: identifier(value.pixelFormat, 'NATIVE_MEDIA_RENDER_ARTIFACT_INVALID'),
    videoFrameCount: positiveIntegerText(value.videoFrameCount),
    decodedFrameSequenceSha256: sha256(value.decodedFrameSequenceSha256),
    remotionCompatibilityReceiptSha256: sha256(value.remotionCompatibilityReceiptSha256),
    audio,
    contentType: videoContentType(value.contentType),
    artifactContentSha256: sha256(value.artifactContentSha256),
    artifactByteLength: positiveIntegerText(value.artifactByteLength),
  };
  if (value.artifactBindingSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('NATIVE_MEDIA_RENDER_ARTIFACT_HASH_INVALID');
  }
  return Object.freeze({ ...material, artifactBindingSha256: value.artifactBindingSha256 });
}

function assertAudio(value: NativeMediaFinalRenderArtifactAudioV1): NativeMediaFinalRenderArtifactAudioV1 {
  if (!value || value.disposition === 'NO_AUDIO_MAPPING_REQUESTED') {
    if (!value || value.audioCodec !== null || value.audioMappingSha256 !== null
      || value.sourceDecodedPcmSha256 !== null || value.artifactDecodedPcmSha256 !== null
      || value.decodedPcmEquivalenceReceiptSha256 !== null || value.sampleRate !== null
      || value.channelCount !== null || value.decodedSampleFrameCount !== null) {
      throw new Error('NATIVE_MEDIA_RENDER_ARTIFACT_AUDIO_INVALID');
    }
    return Object.freeze({ ...value });
  }
  if (value.disposition !== 'EMBEDDED_EXACT_NATIVE_PCM'
    || !Number.isSafeInteger(value.channelCount) || value.channelCount < 1) {
    throw new Error('NATIVE_MEDIA_RENDER_ARTIFACT_AUDIO_INVALID');
  }
  return Object.freeze({
    ...value,
    audioCodec: identifier(value.audioCodec, 'NATIVE_MEDIA_RENDER_ARTIFACT_AUDIO_INVALID'),
    audioMappingSha256: sha256(value.audioMappingSha256),
    sourceDecodedPcmSha256: sha256(value.sourceDecodedPcmSha256),
    artifactDecodedPcmSha256: sha256(value.artifactDecodedPcmSha256),
    decodedPcmEquivalenceReceiptSha256: sha256(value.decodedPcmEquivalenceReceiptSha256),
    sampleRate: positiveIntegerText(value.sampleRate),
    decodedSampleFrameCount: positiveIntegerText(value.decodedSampleFrameCount),
  });
}

function normalizeInput(input: Parameters<typeof prepareNativeMediaFinalRenderSourcesV1>[0]) {
  if (!input || !Array.isArray(input.overlays) || !Array.isArray(input.exactRequests)
    || input.exactRequests.length > MAX_EXACT_OVERLAYS
    || typeof input.materializer?.materialize !== 'function'
    || typeof input.assetStateReader?.readTimingStateSha256 !== 'function'
    || typeof input.projectRevisionReader?.getProjectRevision !== 'function'
    || !Number.isSafeInteger(input.minimumRemainingLeaseMs)
    || input.minimumRemainingLeaseMs < 60_000
    || input.minimumRemainingLeaseMs > MAX_LEASE_TTL_MS) {
    throw new Error('NATIVE_MEDIA_RENDER_PREPARATION_INPUT_INVALID');
  }
  const requests = input.exactRequests.map(normalizeRequest);
  const requestIds = new Set<string>();
  for (const request of requests) {
    if (requestIds.has(request.overlayId)) {
      throw new Error('NATIVE_MEDIA_RENDER_PREPARATION_REQUEST_DUPLICATE');
    }
    requestIds.add(request.overlayId);
  }
  return Object.freeze({
    userId: identifier(input.userId, 'NATIVE_MEDIA_RENDER_PREPARATION_INPUT_INVALID'),
    projectId: identifier(input.projectId, 'NATIVE_MEDIA_RENDER_PREPARATION_INPUT_INVALID'),
    sequenceId: identifier(input.sequenceId, 'NATIVE_MEDIA_RENDER_PREPARATION_INPUT_INVALID'),
    projectRevision: normalizeRevision(input.projectRevision),
    overlays: Object.freeze([...input.overlays]),
    requests: Object.freeze(requests),
    minimumRemainingLeaseMs: input.minimumRemainingLeaseMs,
    materializer: input.materializer,
    assetStateReader: input.assetStateReader,
    projectRevisionReader: input.projectRevisionReader,
    now: input.now ?? Date.now,
  });
}

function normalizeRequest(
  value: NativeMediaFinalRenderExactSourceRequestV1,
): NativeMediaFinalRenderExactSourceRequestV1 {
  if (!value || typeof value.renderNativeAudio !== 'boolean') {
    throw new Error('NATIVE_MEDIA_RENDER_PREPARATION_REQUEST_INVALID');
  }
  return Object.freeze({
    overlayId: identifier(value.overlayId, 'NATIVE_MEDIA_RENDER_PREPARATION_REQUEST_INVALID'),
    assetId: identifier(value.assetId, 'NATIVE_MEDIA_RENDER_PREPARATION_REQUEST_INVALID'),
    overlayTimingSha256: sha256(value.overlayTimingSha256),
    assetTimingStateSha256: sha256(value.assetTimingStateSha256),
    sourceVersionSha256: sha256(value.sourceVersionSha256),
    storageVersionSha256: sha256(value.storageVersionSha256),
    sourceBindingSha256: sha256(value.sourceBindingSha256),
    sourcePtsCadenceMapStateSha256V3: sha256(value.sourcePtsCadenceMapStateSha256V3),
    renderNativeAudio: value.renderNativeAudio,
  });
}

function prepared(
  input: ReturnType<typeof normalizeInput>,
  overlays: readonly Overlay[],
  leases: readonly NativeMediaFinalRenderSourceLeaseV1[],
): NativeMediaFinalRenderSourcePreparationResultV1 {
  const exactOverlays = leases.map((lease) => ({
    overlayId: lease.artifact.overlayId,
    assetId: lease.artifact.assetId,
    overlayTimingSha256: lease.artifact.overlayTimingSha256,
    assetTimingStateSha256: lease.artifact.assetTimingStateSha256,
    artifactBindingSha256: lease.artifact.artifactBindingSha256,
    leaseId: lease.leaseId,
    leaseBindingSha256: lease.leaseBindingSha256,
    leaseExpiresAtEpochMs: lease.expiresAtEpochMs,
    audioDisposition: lease.artifact.audio.disposition,
  }));
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_KIND_V1,
    projectId: input.projectId,
    sequenceId: input.sequenceId,
    projectRevision: input.projectRevision,
    exactOverlays,
  };
  return Object.freeze({
    disposition: 'SOURCES_PREPARED' as const,
    overlays: Object.freeze([...overlays]),
    leases: Object.freeze([...leases]),
    receipt: Object.freeze({
      ...material,
      receiptSha256: hashEditronCanonicalJsonV1(material),
    }),
  });
}

function blocked(
  reason: Extract<NativeMediaFinalRenderSourcePreparationResultV1, { disposition: 'UNVERIFIABLE' }>['reason'],
  overlayId: string | null,
  assetId: string | null,
  detail: string | null,
): NativeMediaFinalRenderSourcePreparationResultV1 {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    overlayId,
    assetId,
    diagnostic: detail,
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

function sameRevision(left: ProjectRevisionV1, right: ProjectRevisionV1): boolean {
  return left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function rational(value: Readonly<{ numerator: string; denominator: string }>) {
  const numerator = positiveIntegerText(value?.numerator);
  const denominator = positiveIntegerText(value?.denominator);
  if (greatestCommonDivisor(BigInt(numerator), BigInt(denominator)) !== BigInt(1)) {
    throw new Error('NATIVE_MEDIA_RENDER_ARTIFACT_RATE_INVALID');
  }
  return Object.freeze({ numerator, denominator });
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 512
    || /[\u0000-\u001F\u007F]/.test(value)) throw new Error(code);
  return value.trim();
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('NATIVE_MEDIA_RENDER_SHA256_INVALID');
  }
  return value;
}

function nonNegativeIntegerText(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value)) {
    throw new Error('NATIVE_MEDIA_RENDER_INTEGER_INVALID');
  }
  return value;
}

function positiveIntegerText(value: unknown): string {
  const normalized = nonNegativeIntegerText(value);
  if (normalized === '0') throw new Error('NATIVE_MEDIA_RENDER_INTEGER_INVALID');
  return normalized;
}

function epochMs(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('NATIVE_MEDIA_RENDER_LEASE_TIME_INVALID');
  }
  return Number(value);
}

function httpsUrl(value: unknown): string {
  const normalized = identifier(value, 'NATIVE_MEDIA_RENDER_LEASE_URL_INVALID');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('NATIVE_MEDIA_RENDER_LEASE_URL_INVALID');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error('NATIVE_MEDIA_RENDER_LEASE_URL_INVALID');
  }
  return parsed.toString();
}

function videoContentType(value: unknown): string {
  const normalized = identifier(value, 'NATIVE_MEDIA_RENDER_ARTIFACT_CONTENT_TYPE_INVALID');
  if (!/^video\/[a-z0-9.+-]+$/i.test(normalized)) {
    throw new Error('NATIVE_MEDIA_RENDER_ARTIFACT_CONTENT_TYPE_INVALID');
  }
  return normalized.toLowerCase();
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,180}$/.test(error.message)
    ? error.message
    : null;
}
