import type {
  Keyframe,
  KeyframeTrack,
} from '@/components/editron/editor/version-7.0.0/types';
import { computeSpeedSegments } from '@/lib/editron/utils/keyframe-math';

import {
  parseAudioSampleRangeV1,
  parseCanonicalMediaTimeV1,
  parseExactRationalRateV1,
  parsePresentationEpochV1,
  parseSourcePositionV1,
  type AudioSampleRangeV1,
  type CanonicalMediaTimeV1,
  type ExactRationalRateV1,
  type PresentationEpochV1,
  type SourcePositionV1,
} from '../contracts/canonical-media-time-v1';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceAudioSampleEpochMapV1,
  type MediaSourceAudioSampleEpochMapV1,
} from './media-source-audio-sample-epoch-map-v1';
import {
  readMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetStateInputV2,
} from './media-source-pts-cadence-map-asset-state-v2';
import type {
  MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  readMediaSourcePtsCadenceEpochPresentationWindowV3,
  type MediaSourcePtsCadenceEpochPresentationWindowResultV3,
  type MediaSourcePtsCadenceEpochPresentationWindowV3,
  type MediaSourcePtsCadenceEpochWindowResourcePolicyV3,
} from './media-source-pts-cadence-epoch-window-reader-v3';
import {
  readMediaSourcePtsCadencePresentationWindowV2,
  type MediaSourcePtsCadenceFrameBatchReaderV2,
  type MediaSourcePtsCadencePresentationWindowResourcePolicyV2,
  type MediaSourcePtsCadencePresentationWindowResultV2,
  type MediaSourcePtsCadencePresentationWindowV2,
} from './media-source-pts-cadence-index-verifier-v2';
import type {
  MediaSourcePtsCadenceManifestIndexSerializationV2,
} from './media-source-pts-cadence-manifest-index-v2';
import {
  readMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  assertMediaProxyMasterRelationV1,
  assertMediaSourceVersionV1,
} from './media-source-version-v1';
import type { ProjectRevisionV1 } from './project-service';

export const VIDEO_SOURCE_TIME_BINDING_KIND_V1 =
  'EDITRON_VERIFIED_VIDEO_SOURCE_TIME_BINDING_V1' as const;
const PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_KIND_V1 =
  'EDITRON_PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_V1' as const;
export const PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1 =
  'PROJECT_SERVICE_VIDEO_RETIME_WRITER_V1' as const;
const VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1 =
  'EDITRON_STEP_SPEED_SEGMENTS_V1' as const;
export const VIDEO_RETIME_RENDERER_MAPPING_VERSION_V2 =
  'EDITRON_STEP_SPEED_SEGMENTS_SOURCE_SPAN_V2' as const;
const VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V2 =
  'EDITRON_VIDEO_SOURCE_TIMESTAMP_CONFORM_V2' as const;
const VIDEO_SOURCE_EPOCH_TIME_BINDING_KIND_V3 =
  'EDITRON_VERIFIED_VIDEO_SOURCE_EPOCH_TIME_BINDING_V3' as const;
const VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V3 =
  'EDITRON_VIDEO_SOURCE_TIMESTAMP_CONFORM_V3' as const;
const VIDEO_SOURCE_TIMESTAMP_AUDIO_MAPPING_KIND_V3 =
  'EDITRON_VERIFIED_AUDIO_SAMPLE_TIME_MAPPING_V3' as const;
const VIDEO_SOURCE_TIMESTAMP_CONFORM_POLICY_V2 =
  'PRESERVE_REAL_TIME_NEAREST' as const;
const VIDEO_SOURCE_TIMESTAMP_CONFORM_ABSOLUTE_MAX_WINDOW_FRAMES_V2 = 100_000;
const VIDEO_SOURCE_TIMESTAMP_CONFORM_ABSOLUTE_MAX_QUERIES_V2 = 10_000;

export type VideoSourceTimestampConformFrameV2 = Readonly<{
  sourceFrameOrdinal: string;
  epochId: string;
  presentationTimestampTicks: string;
  durationTicks: string;
}>;

export type VideoSourceTimestampConformResourcePolicyV2 = Readonly<{
  policyVersion: string;
  maxSourceFrames: number;
  maxFrameQueries: number;
}>;

type ExactAudioSamplePositionV2 = Readonly<{
  numerator: string;
  denominator: string;
  disposition: 'INTEGER_SAMPLE_FRAME' | 'BETWEEN_SAMPLE_FRAMES';
}>;

type VideoSourceTimestampConformAudioSegmentV3 = Readonly<
  | {
      kind: 'PCM';
      audioEpochId: string;
      canonicalStartSamplePosition: ExactAudioSamplePositionV2;
      canonicalEndExclusiveSamplePosition: ExactAudioSamplePositionV2;
      decodedStartSamplePosition: ExactAudioSamplePositionV2;
      decodedEndExclusiveSamplePosition: ExactAudioSamplePositionV2;
    }
  | {
      kind: 'SILENCE';
      reason: 'LEADING_STREAM_OFFSET' | 'DECLARED_SOURCE_GAP';
      precedingAudioEpochId: string | null;
      nextAudioEpochId: string;
      canonicalStartSamplePosition: ExactAudioSamplePositionV2;
      canonicalEndExclusiveSamplePosition: ExactAudioSamplePositionV2;
    }
>;

type VideoSourceTimestampConformAudioMappingV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof VIDEO_SOURCE_TIMESTAMP_AUDIO_MAPPING_KIND_V3;
  assetId: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  audioSampleEpochMapSha256: string;
  audioStreamBindingSha256: string;
  decodedPcmSha256: string;
  streamId: string;
  audioStreamIndex: number;
  sampleRate: string;
  channelCount: number;
  decodedSampleFrameCount: string;
  timelineStartFrame: string;
  endExclusiveTimelineFrame: string;
  canonicalTimelineStartSamplePosition: ExactAudioSamplePositionV2;
  canonicalTimelineEndExclusiveSamplePosition: ExactAudioSamplePositionV2;
  policy: Readonly<{
    epochAlignment: 'PAIRED_VERIFIED_VIDEO_AUDIO_EPOCH_ORDINAL_V1';
    samplePhase: 'PRESERVE_EXACT_RATIONAL_NO_ROUNDING';
    gaps: 'EXPLICIT_SILENCE_SEGMENTS';
    overlapsAndResets: 'VERIFIED_CANONICAL_EPOCH_HANDOFF';
    resampling: 'FORBIDDEN';
    channelRemix: 'FORBIDDEN';
  }>;
  segments: readonly VideoSourceTimestampConformAudioSegmentV3[];
  audioMappingSha256: string;
}>;

const VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3 = deepFreezeEditronJsonV1({
  epochAlignment: 'PAIRED_VERIFIED_VIDEO_AUDIO_EPOCH_ORDINAL_V1' as const,
  samplePhase: 'PRESERVE_EXACT_RATIONAL_NO_ROUNDING' as const,
  gaps: 'EXPLICIT_SILENCE_SEGMENTS' as const,
  overlapsAndResets: 'VERIFIED_CANONICAL_EPOCH_HANDOFF' as const,
  resampling: 'FORBIDDEN' as const,
  channelRemix: 'FORBIDDEN' as const,
});

export type VideoSourceTimestampConformV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V2;
  writerAuthority: typeof PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1;
  policy: typeof VIDEO_SOURCE_TIMESTAMP_CONFORM_POLICY_V2;
  evidenceStatus:
    | 'PURE_PRE_RESOLVED_WINDOW_CONTRACT_NOT_RUNTIME_WIRED'
    | 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW_CONSUMED_NOT_RENDERER_WIRED';
  sourceBindingSha256: string;
  sourceVersionSha256: string;
  mapBindingSha256: string;
  sourceWindowSha256: string;
  presentationWindowEvidenceSha256: string;
  streamId: string;
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  queryCount: string;
  sourceAnchor: SourcePositionV1;
  resourcePolicy: VideoSourceTimestampConformResourcePolicyV2;
  frameSelections: readonly Readonly<{
    timelineFrame: string;
    timelineTime: CanonicalMediaTimeV1;
    sourceCanonicalTime: CanonicalMediaTimeV1;
    sourceFrameOrdinal: string;
    epochId: string;
    presentationTimestampTicks: string;
    selection: 'COVERING_PRESENTATION' | 'NEAREST_PREVIOUS' | 'NEAREST_NEXT';
  }>[];
  audioMapping: Readonly<{
    sourceRange: AudioSampleRangeV1;
    sourceAnchorSampleFrame: string;
    endExclusiveTimelineFrame: string;
    startSamplePosition: ExactAudioSamplePositionV2;
    endExclusiveSamplePosition: ExactAudioSamplePositionV2;
  }> | null;
  transformSha256: string;
}>;

type VideoSourceTimestampConformFromIndexResultV2 = Readonly<
  | {
      disposition: 'CONFORM_CREATED';
      presentationWindow: MediaSourcePtsCadencePresentationWindowV2;
      transform: VideoSourceTimestampConformV2;
    }
  | Extract<MediaSourcePtsCadencePresentationWindowResultV2, { disposition: 'UNVERIFIABLE' }>
>;

type VerifiedVideoSourceEpochTimeBindingV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof VIDEO_SOURCE_EPOCH_TIME_BINDING_KIND_V3;
  assetId: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  sourcePtsCadenceMapStateSha256V3: string;
  mapBindingSha256: string;
  terminalReceiptSha256: string;
  verificationSha256: string;
  epochIndexContentSha256: string;
  streamId: string;
  videoStreamIndex: number;
  sourceTimebase: ExactRationalRateV1;
  sourceCadence: Readonly<
    | { kind: 'CFR'; durationTicks: string }
    | { kind: 'VFR' }
  >;
  totalSourceFrameCount: string;
  bindingSha256: string;
}>;

export type VideoSourceTimestampConformV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V3;
  writerAuthority: typeof PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1;
  policy: typeof VIDEO_SOURCE_TIMESTAMP_CONFORM_POLICY_V2;
  evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW_CONSUMED';
  sourceBinding: VerifiedVideoSourceEpochTimeBindingV3;
  sourceWindowSha256: string;
  presentationWindowEvidenceSha256: string;
  streamId: string;
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  queryCount: string;
  sourceAnchor: SourcePositionV1;
  resourcePolicy: VideoSourceTimestampConformResourcePolicyV2;
  frameSelections: VideoSourceTimestampConformV2['frameSelections'];
  audioMapping: VideoSourceTimestampConformAudioMappingV3 | null;
  transformSha256: string;
}>;

type VideoSourceTimestampConformFromEpochIndexResultV3 = Readonly<
  | {
      disposition: 'CONFORM_CREATED';
      presentationWindow: MediaSourcePtsCadenceEpochPresentationWindowV3;
      transform: VideoSourceTimestampConformV3;
    }
  | Extract<
      MediaSourcePtsCadenceEpochPresentationWindowResultV3,
      { disposition: 'UNVERIFIABLE' }
  >
>;

type VideoSourceTimestampConformEpochBaseInputV3 = Readonly<{
  asset: MediaSourcePtsCadenceMapAssetStateInputV3;
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  windowResourcePolicy: MediaSourcePtsCadenceEpochWindowResourcePolicyV3;
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  timelineFrameQueries: readonly string[];
  resourcePolicy: VideoSourceTimestampConformResourcePolicyV2;
  audio?: Readonly<{
    evidence: MediaSourceAudioSampleEpochMapV1;
    endExclusiveTimelineFrame: string;
  }>;
  proxyMasterMapping?: Readonly<{
    disposition: 'UNQUALIFIED';
    relationSha256: string;
  }>;
}>;

type VideoSourceTimestampConformEpochUnverifiableV3 = Extract<
  VideoSourceTimestampConformFromEpochIndexResultV3,
  { disposition: 'UNVERIFIABLE' }
>;

type PreparedVideoSourceTimestampConformEpochV3 = Readonly<{
  disposition: 'READY';
  sourceBinding: VerifiedVideoSourceEpochTimeBindingV3;
  presentationWindow: MediaSourcePtsCadenceEpochPresentationWindowV3;
}>;

type VideoSourceTimestampConformInputV2 = Readonly<{
  sourceBinding: VerifiedVideoSourceTimeBindingV1;
  presentationWindowEvidenceSha256: string;
  presentationWindowEvidenceStatus:
    | 'PRE_RESOLVED_FIXTURE_ONLY'
    | 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW';
  streamId: string;
  epochs: readonly PresentationEpochV1[];
  sourceFrames: readonly VideoSourceTimestampConformFrameV2[];
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  timelineFrameQueries: readonly string[];
  sourceAnchor: SourcePositionV1;
  resourcePolicy: VideoSourceTimestampConformResourcePolicyV2;
  audio?: Readonly<{
    sourceRange: AudioSampleRangeV1;
    sourceAnchorSampleFrame: string;
    endExclusiveTimelineFrame: string;
  }>;
  proxyMasterMapping?: Readonly<{
    disposition: 'UNQUALIFIED';
    relationSha256: string;
  }>;
}>;

type PreResolvedVideoSourceTimestampConformInputV2 = Readonly<
  Omit<VideoSourceTimestampConformInputV2, 'presentationWindowEvidenceStatus'>
  & { presentationWindowEvidenceStatus: 'PRE_RESOLVED_FIXTURE_ONLY' }
>;

export type VerifiedVideoSourceTimeBindingV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof VIDEO_SOURCE_TIME_BINDING_KIND_V1;
  assetId: string;
  sourceVersionSha256: string;
  sourcePtsMapStateSha256: string;
  mapBindingSha256: string;
  terminalReceiptSha256: string;
  sourceTimebase: Readonly<{ numerator: string; denominator: string }>;
  sourceCadence: Readonly<{ kind: 'CFR'; durationTicks: string } | { kind: 'VFR' }>;
  sourceStartPresentationTimestampTicks: string;
  sourceEndExclusivePresentationTimestampTicks: string;
  totalSourceFrameCount: string;
  bindingSha256: string;
}>;

export type ProjectVideoSourceTimeTransformV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_KIND_V1;
  writerAuthority: typeof PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1;
  rendererMappingVersion:
    | typeof VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1
    | typeof VIDEO_RETIME_RENDERER_MAPPING_VERSION_V2;
  projectId: string;
  overlayId: string;
  assetId: string;
  beforeProjectRevision: ProjectRevisionV1;
  afterProjectRevision: ProjectRevisionV1;
  projectTimebase: Readonly<{ kind: 'LEGACY_NUMERIC_FPS_V1'; fps: number }>;
  sourceBinding: VerifiedVideoSourceTimeBindingV1;
  timelineStartFrame: number;
  sourceStartFrame: number;
  sourceEndFrameExclusive?: number;
  durationInFrames: number;
  speedCurveSha256: string;
  segments: readonly Readonly<{
    timelineStartFrame: number;
    timelineEndFrameExclusive: number;
    playbackRate: number;
    sourceStartFrame: number;
    sourceEndFrameExclusive: number;
  }>[];
  transformSha256: string;
}>;

export type SourcePresentationTimestampRebindV1 = Readonly<
  | {
      disposition: 'REBOUND';
      sourcePresentationTimestampTicks: string;
      sourceFrameOrdinal: number;
      projectFrame: number;
      transformSha256: string;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason: 'SOURCE_BINDING_STALE' | 'VFR_INDEX_REQUIRED' | 'PTS_OUTSIDE_SOURCE' | 'PTS_NOT_FRAME_ALIGNED'
        | 'SOURCE_FRAME_NOT_PRESENT_AFTER_RETIME' | 'SUBFRAME_PROJECT_POSITION'
        | 'PROJECT_RATIONAL_TIMEBASE_REQUIRED' | 'SOURCE_PROJECT_RATE_MISMATCH';
    }
>;

type VerifiedVideoSourceRateCompatibilityV1 = Readonly<
  | { disposition: 'COMPATIBLE_SAME_RATE_CFR' }
  | {
      disposition: 'UNSUPPORTED';
      reason:
        | 'VFR_INDEX_REQUIRED'
        | 'PROJECT_RATIONAL_TIMEBASE_REQUIRED'
        | 'SOURCE_PROJECT_RATE_MISMATCH';
    }
>;

/**
 * The legacy renderer addresses source media in project-frame units. It can
 * therefore consume only CFR media whose exact source cadence equals the
 * integer project rate. Mixed/VFR media needs the later rational PTS/proxy
 * consumer; treating its frame ordinal as a project frame would accumulate
 * timing drift while looking superficially valid.
 */
export function classifyVerifiedVideoSourceRateCompatibilityV1(
  binding: VerifiedVideoSourceTimeBindingV1,
  projectFps: number,
): VerifiedVideoSourceRateCompatibilityV1 {
  const sourceBinding = assertBinding(binding);
  if (sourceBinding.sourceCadence.kind === 'VFR') {
    return frozen({ disposition: 'UNSUPPORTED' as const, reason: 'VFR_INDEX_REQUIRED' as const });
  }
  if (!Number.isSafeInteger(projectFps) || projectFps <= 0) {
    return frozen({
      disposition: 'UNSUPPORTED' as const,
      reason: 'PROJECT_RATIONAL_TIMEBASE_REQUIRED' as const,
    });
  }
  const positive = (value: string): bigint | null => {
    if (!/^[1-9][0-9]*$/.test(value)) return null;
    return BigInt(value);
  };
  const timebaseNumerator = positive(sourceBinding.sourceTimebase.numerator);
  const timebaseDenominator = positive(sourceBinding.sourceTimebase.denominator);
  const frameDurationTicks = positive(sourceBinding.sourceCadence.durationTicks);
  if (!timebaseNumerator || !timebaseDenominator || !frameDurationTicks) {
    throw new Error('VIDEO_SOURCE_TIME_BINDING_INVALID');
  }
  return timebaseDenominator
    === timebaseNumerator * frameDurationTicks * BigInt(projectFps)
    ? frozen({ disposition: 'COMPATIBLE_SAME_RATE_CFR' as const })
    : frozen({
        disposition: 'UNSUPPORTED' as const,
        reason: 'SOURCE_PROJECT_RATE_MISMATCH' as const,
      });
}

export function resolveVerifiedVideoSourceTimeBindingV1(
  asset: MediaSourcePtsCadenceMapAssetStateInputV2,
): VerifiedVideoSourceTimeBindingV1 | null {
  const state = readMediaSourcePtsCadenceMapAssetStateV2(asset);
  if (!state) return null;
  const terminal = state.sourcePtsCadenceMapV2.terminalReceipt;
  if (!terminal || state.sourcePtsCadenceMapV2.lifecycleV1.status !== 'COMPLETE') return null;
  const sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
  const lifecycle = state.sourcePtsCadenceMapV2.lifecycleV1;
  const material = {
    schemaVersion: 1 as const,
    kind: VIDEO_SOURCE_TIME_BINDING_KIND_V1,
    assetId: sourceVersion.assetId,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    sourcePtsMapStateSha256: state.sourcePtsCadenceMapStateSha256V2,
    mapBindingSha256: terminal.mapBindingSha256,
    terminalReceiptSha256: terminal.terminalReceiptSha256,
    sourceTimebase: lifecycle.sourceTimebase,
    sourceCadence: terminal.sourceCadence,
    sourceStartPresentationTimestampTicks: terminal.sourceStartPresentationTimestampTicks,
    sourceEndExclusivePresentationTimestampTicks: terminal.sourceEndExclusivePresentationTimestampTicks,
    totalSourceFrameCount: terminal.manifestIndex.nextFrameOrdinal,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

/**
 * Builds a bounded, exact timestamp map for ordinary real-time conformance.
 * It selects pictures only; audio remains an independent exact sample domain.
 * No live caller consumes this V2 map yet, and a V1 proxy/master relation is
 * deliberately rejected because that owner still declares its PTS mapping
 * unqualified.
 */
export function createVideoSourceTimestampConformV2(
  input: PreResolvedVideoSourceTimestampConformInputV2,
): VideoSourceTimestampConformV2 {
  if (!input || typeof input !== 'object'
    || input.presentationWindowEvidenceStatus !== 'PRE_RESOLVED_FIXTURE_ONLY') {
    throw new Error('VIDEO_SOURCE_CONFORM_PRE_RESOLVED_EVIDENCE_STATUS_INVALID');
  }
  return createVideoSourceTimestampConformWithEvidenceV2(input);
}

function createVideoSourceTimestampConformWithEvidenceV2(
  input: VideoSourceTimestampConformInputV2,
): VideoSourceTimestampConformV2 {
  const sourceBinding = assertBinding(input.sourceBinding);
  if (input.proxyMasterMapping !== undefined) {
    sha256Text(
      input.proxyMasterMapping.relationSha256,
      'VIDEO_SOURCE_CONFORM_PROXY_MASTER_RELATION_INVALID',
    );
    throw new Error('VIDEO_SOURCE_CONFORM_PROXY_MASTER_MAPPING_REQUIRED');
  }
  const evidenceStatus = timestampConformOutputEvidenceStatusV2(
    input.presentationWindowEvidenceStatus,
  );
  const presentationWindowEvidenceSha256 = sha256Text(
    input.presentationWindowEvidenceSha256,
    'VIDEO_SOURCE_CONFORM_WINDOW_EVIDENCE_INVALID',
  );
  const core = createTimestampConformSelectionCoreV2({
    sourceScope: sourceScopeForBindingV1(sourceBinding),
    streamId: input.streamId,
    epochs: input.epochs,
    sourceFrames: input.sourceFrames,
    projectRate: input.projectRate,
    timelineStartFrame: input.timelineStartFrame,
    timelineFrameQueries: input.timelineFrameQueries,
    sourceAnchor: input.sourceAnchor,
    resourcePolicy: input.resourcePolicy,
    ...(input.audio === undefined ? {} : { audio: input.audio }),
  });
  const sourceWindowMaterial = {
    sourceBindingSha256: sourceBinding.bindingSha256,
    presentationWindowEvidenceSha256,
    presentationWindowEvidenceStatus: input.presentationWindowEvidenceStatus,
    streamId: core.streamId,
    epochs: core.epochs,
    sourceFrames: core.sourceFrames,
    resourcePolicy: core.resourcePolicy,
  };
  const material = {
    schemaVersion: 2 as const,
    kind: VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V2,
    writerAuthority: PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1,
    policy: VIDEO_SOURCE_TIMESTAMP_CONFORM_POLICY_V2,
    evidenceStatus,
    sourceBindingSha256: sourceBinding.bindingSha256,
    sourceVersionSha256: sourceBinding.sourceVersionSha256,
    mapBindingSha256: sourceBinding.mapBindingSha256,
    sourceWindowSha256: hashEditronCanonicalJsonV1(sourceWindowMaterial),
    presentationWindowEvidenceSha256,
    streamId: core.streamId,
    projectRate: core.projectRate,
    timelineStartFrame: core.timelineStartFrame,
    queryCount: String(core.timelineFrameQueries.length),
    sourceAnchor: core.sourceAnchor,
    resourcePolicy: core.resourcePolicy,
    frameSelections: core.frameSelections,
    audioMapping: core.audioMapping,
  };
  return frozen({ ...material, transformSha256: hashEditronCanonicalJsonV1(material) });
}

type TimestampConformSourceScopeV2 = Readonly<{
  bindingSha256: string;
  sourceVersionSha256: string;
  mapBindingSha256: string;
  sourceTimebase: ExactRationalRateV1;
  sourceCadence: Readonly<{ kind: 'CFR'; durationTicks: string } | { kind: 'VFR' }>;
  totalSourceFrameCount: string;
}>;

type TimestampConformSelectionCoreInputV2 = Readonly<{
  sourceScope: TimestampConformSourceScopeV2;
  streamId: string;
  epochs: readonly PresentationEpochV1[];
  sourceFrames: readonly VideoSourceTimestampConformFrameV2[];
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  timelineFrameQueries: readonly string[];
  sourceAnchor: SourcePositionV1;
  resourcePolicy: VideoSourceTimestampConformResourcePolicyV2;
  audio?: Readonly<{
    sourceRange: AudioSampleRangeV1;
    sourceAnchorSampleFrame: string;
    endExclusiveTimelineFrame: string;
  }>;
}>;

function createTimestampConformSelectionCoreV2(
  input: TimestampConformSelectionCoreInputV2,
): Readonly<{
  streamId: string;
  epochs: readonly PresentationEpochV1[];
  sourceFrames: readonly VideoSourceTimestampConformFrameV2[];
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  timelineFrameQueries: readonly string[];
  sourceAnchor: SourcePositionV1;
  resourcePolicy: VideoSourceTimestampConformResourcePolicyV2;
  frameSelections: VideoSourceTimestampConformV2['frameSelections'];
  audioMapping: VideoSourceTimestampConformV2['audioMapping'];
}> {
  const sourceScope = normalizeTimestampConformSourceScopeV2(input.sourceScope);
  const streamId = boundedText(input.streamId, 'VIDEO_SOURCE_CONFORM_STREAM_INVALID');
  const projectRate = parseExactRationalRateV1(input.projectRate);
  const timelineStartFrame = nonNegativeIntegerText(
    input.timelineStartFrame,
    'VIDEO_SOURCE_CONFORM_TIMELINE_START_INVALID',
  );
  const resourcePolicy = normalizeTimestampConformResourcePolicyV2(input.resourcePolicy);
  const timelineFrameQueries = normalizeTimestampConformQueriesV2(
    input.timelineFrameQueries,
    timelineStartFrame,
    resourcePolicy.maxFrameQueries,
  );
  const epochs = normalizeTimestampConformEpochsV2(
    input.epochs,
    streamId,
    sourceScope.sourceTimebase,
  );
  const sourceFrames = normalizeTimestampConformFramesV2(
    input.sourceFrames,
    sourceScope,
    epochs,
    resourcePolicy.maxSourceFrames,
  );
  const sourceAnchor = parseSourcePositionV1(input.sourceAnchor);
  if (sourceAnchor.sourceVersionSha256 !== sourceScope.sourceVersionSha256
    || sourceAnchor.streamId !== streamId) {
    throw new Error('VIDEO_SOURCE_CONFORM_ANCHOR_SCOPE_MISMATCH');
  }
  const epochById = new Map(epochs.map((epoch) => [epoch.epochId, epoch]));
  const anchorEpoch = epochById.get(sourceAnchor.epochId);
  if (!anchorEpoch
    || !sameRateV2(anchorEpoch.secondsPerSourceTick, sourceAnchor.secondsPerSourceTick)) {
    throw new Error('VIDEO_SOURCE_CONFORM_ANCHOR_EPOCH_MISMATCH');
  }
  const intervals = sourceFrames.map((frame) => timestampConformIntervalV2(
    frame,
    epochById.get(frame.epochId)!,
  ));
  for (let index = 1; index < intervals.length; index += 1) {
    if (compareFractionV2(intervals[index - 1]!.end, intervals[index]!.start) > 0) {
      throw new Error('VIDEO_SOURCE_CONFORM_CANONICAL_INTERVAL_OVERLAP');
    }
  }
  const anchorPts = BigInt(sourceAnchor.presentationTimestampTicks);
  const anchorFrame = intervals.find(({ frame }) => frame.epochId === sourceAnchor.epochId
    && anchorPts >= BigInt(frame.presentationTimestampTicks)
    && anchorPts < BigInt(frame.presentationTimestampTicks) + BigInt(frame.durationTicks));
  if (!anchorFrame) throw new Error('VIDEO_SOURCE_CONFORM_ANCHOR_NOT_IN_WINDOW');
  const anchorTime = canonicalTimeForSourcePtsV2(anchorEpoch, anchorPts);
  const frameSelections = timelineFrameQueries.map((timelineFrameText) => {
    const timelineFrame = BigInt(timelineFrameText);
    const offset = timelineFrame - BigInt(timelineStartFrame);
    const relativeTime = fractionV2(
      offset * BigInt(projectRate.denominator),
      BigInt(projectRate.numerator),
    );
    const sourceTime = addFractionV2(anchorTime, relativeTime);
    const selected = selectTimestampConformIntervalV2(intervals, sourceTime);
    return {
      timelineFrame: timelineFrame.toString(),
      timelineTime: canonicalTimeFromFractionV2(fractionV2(
        timelineFrame * BigInt(projectRate.denominator),
        BigInt(projectRate.numerator),
      )),
      sourceCanonicalTime: canonicalTimeFromFractionV2(sourceTime),
      sourceFrameOrdinal: selected.interval.frame.sourceFrameOrdinal,
      epochId: selected.interval.frame.epochId,
      presentationTimestampTicks: selected.interval.frame.presentationTimestampTicks,
      selection: selected.selection,
    };
  });
  const audioMapping = input.audio === undefined
    ? null
    : createTimestampConformAudioMappingV2(input.audio, projectRate, timelineStartFrame);
  return frozen({
    streamId,
    epochs,
    sourceFrames,
    projectRate,
    timelineStartFrame,
    timelineFrameQueries,
    sourceAnchor,
    resourcePolicy,
    frameSelections,
    audioMapping,
  });
}

function sourceScopeForBindingV1(
  binding: VerifiedVideoSourceTimeBindingV1,
): TimestampConformSourceScopeV2 {
  return normalizeTimestampConformSourceScopeV2({
    bindingSha256: binding.bindingSha256,
    sourceVersionSha256: binding.sourceVersionSha256,
    mapBindingSha256: binding.mapBindingSha256,
    sourceTimebase: parseExactRationalRateV1(binding.sourceTimebase),
    sourceCadence: binding.sourceCadence,
    totalSourceFrameCount: binding.totalSourceFrameCount,
  });
}

function sourceScopeForEpochBindingV3(
  binding: VerifiedVideoSourceEpochTimeBindingV3,
): TimestampConformSourceScopeV2 {
  return normalizeTimestampConformSourceScopeV2({
    bindingSha256: binding.bindingSha256,
    sourceVersionSha256: binding.sourceVersionSha256,
    mapBindingSha256: binding.mapBindingSha256,
    sourceTimebase: binding.sourceTimebase,
    sourceCadence: binding.sourceCadence,
    totalSourceFrameCount: binding.totalSourceFrameCount,
  });
}

function normalizeTimestampConformSourceScopeV2(
  value: TimestampConformSourceScopeV2,
): TimestampConformSourceScopeV2 {
  if (!value || typeof value !== 'object') {
    throw new Error('VIDEO_SOURCE_CONFORM_SOURCE_SCOPE_INVALID');
  }
  const cadence = value.sourceCadence?.kind === 'VFR'
    ? { kind: 'VFR' as const }
    : value.sourceCadence?.kind === 'CFR'
      ? {
          kind: 'CFR' as const,
          durationTicks: positiveIntegerText(
            value.sourceCadence.durationTicks,
            'VIDEO_SOURCE_CONFORM_SOURCE_CADENCE_INVALID',
          ),
        }
      : (() => {
          throw new Error('VIDEO_SOURCE_CONFORM_SOURCE_CADENCE_INVALID');
        })();
  return frozen({
    bindingSha256: sha256Text(
      value.bindingSha256,
      'VIDEO_SOURCE_CONFORM_SOURCE_BINDING_INVALID',
    ),
    sourceVersionSha256: sha256Text(
      value.sourceVersionSha256,
      'VIDEO_SOURCE_CONFORM_SOURCE_VERSION_INVALID',
    ),
    mapBindingSha256: sha256Text(
      value.mapBindingSha256,
      'VIDEO_SOURCE_CONFORM_MAP_BINDING_INVALID',
    ),
    sourceTimebase: parseExactRationalRateV1(value.sourceTimebase),
    sourceCadence: cadence,
    totalSourceFrameCount: positiveIntegerText(
      value.totalSourceFrameCount,
      'VIDEO_SOURCE_CONFORM_SOURCE_FRAME_COUNT_INVALID',
    ),
  });
}

function epochBindingMatchesWindowV3(
  binding: VerifiedVideoSourceEpochTimeBindingV3,
  window: MediaSourcePtsCadenceEpochPresentationWindowV3,
): boolean {
  return binding.assetId === window.assetId
    && binding.sourceVersionSha256 === window.sourceVersionSha256
    && binding.storageVersionSha256 === window.storageVersionSha256
    && binding.sourceBindingSha256 === window.sourceBindingSha256
    && binding.technicalObservationSha256 === window.technicalObservationSha256
    && binding.sourcePtsCadenceMapStateSha256V3 === window.sourcePtsCadenceMapStateSha256V3
    && binding.mapBindingSha256 === window.mapBindingSha256
    && binding.terminalReceiptSha256 === window.terminalReceiptSha256
    && binding.verificationSha256 === window.verificationSha256
    && binding.epochIndexContentSha256 === window.epochIndexContentSha256
    && binding.streamId === window.streamId
    && binding.videoStreamIndex === window.videoStreamIndex
    && sameRateV2(binding.sourceTimebase, window.sourceTimebase)
    && BigInt(window.endExclusiveFrameOrdinal) <= BigInt(binding.totalSourceFrameCount);
}

/**
 * Binds an exact conform transform to bytes verified through the immutable V2
 * manifest/sidecar owner. V2 persistence represents one contiguous PTS epoch,
 * so this wrapper accepts exactly one explicit epoch and remains unwired from
 * ProjectService, preview, and final render.
 */
export async function createVideoSourceTimestampConformFromManifestIndexV2(
  input: Readonly<{
    sourceBinding: VerifiedVideoSourceTimeBindingV1;
    manifestIndex: MediaSourcePtsCadenceManifestIndexSerializationV2;
    frameBatchReader: MediaSourcePtsCadenceFrameBatchReaderV2;
    videoStreamIndex: number;
    firstFrameOrdinal: string;
    endExclusiveFrameOrdinal: string;
    presentationWindowResourcePolicy: MediaSourcePtsCadencePresentationWindowResourcePolicyV2;
    streamId: string;
    epoch: PresentationEpochV1;
    projectRate: ExactRationalRateV1;
    timelineStartFrame: string;
    timelineFrameQueries: readonly string[];
    sourceAnchor: SourcePositionV1;
    resourcePolicy: VideoSourceTimestampConformResourcePolicyV2;
    audio?: Readonly<{
      sourceRange: AudioSampleRangeV1;
      sourceAnchorSampleFrame: string;
      endExclusiveTimelineFrame: string;
    }>;
    proxyMasterMapping?: Readonly<{
      disposition: 'UNQUALIFIED';
      relationSha256: string;
    }>;
  }>,
): Promise<VideoSourceTimestampConformFromIndexResultV2> {
  const sourceBinding = assertBinding(input.sourceBinding);
  if (input.proxyMasterMapping !== undefined) {
    sha256Text(
      input.proxyMasterMapping.relationSha256,
      'VIDEO_SOURCE_CONFORM_PROXY_MASTER_RELATION_INVALID',
    );
    throw new Error('VIDEO_SOURCE_CONFORM_PROXY_MASTER_MAPPING_REQUIRED');
  }
  const presentationWindow = await readMediaSourcePtsCadencePresentationWindowV2({
    manifestIndex: input.manifestIndex,
    reader: input.frameBatchReader,
    expectedSource: {
      mapBindingSha256: sourceBinding.mapBindingSha256,
      sourceVersionSha256: sourceBinding.sourceVersionSha256,
      videoStreamIndex: input.videoStreamIndex,
      sourceTimebase: parseExactRationalRateV1(sourceBinding.sourceTimebase),
    },
    firstFrameOrdinal: input.firstFrameOrdinal,
    endExclusiveFrameOrdinal: input.endExclusiveFrameOrdinal,
    resourcePolicy: input.presentationWindowResourcePolicy,
  });
  if (presentationWindow.disposition === 'UNVERIFIABLE') return presentationWindow;

  const transform = createVideoSourceTimestampConformWithEvidenceV2({
    sourceBinding,
    presentationWindowEvidenceSha256: presentationWindow.presentationWindowEvidenceSha256,
    presentationWindowEvidenceStatus: 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW',
    streamId: input.streamId,
    epochs: [input.epoch],
    sourceFrames: presentationWindow.frames.map((frame) => ({
      ...frame,
      epochId: input.epoch.epochId,
    })),
    projectRate: input.projectRate,
    timelineStartFrame: input.timelineStartFrame,
    timelineFrameQueries: input.timelineFrameQueries,
    sourceAnchor: input.sourceAnchor,
    resourcePolicy: input.resourcePolicy,
    ...(input.audio === undefined ? {} : { audio: input.audio }),
  });
  return frozen({ disposition: 'CONFORM_CREATED' as const, presentationWindow, transform });
}

/**
 * Derives the only V3 timestamp binding accepted by the native-media consumer
 * from a current, source-bound, terminal MEDIA_ASSETS record. A caller cannot
 * promote an index sidecar or verification hash into this binding by itself.
 */
export function resolveVerifiedVideoSourceEpochTimeBindingV3(
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
): VerifiedVideoSourceEpochTimeBindingV3 | null {
  const state = readMediaSourcePtsCadenceMapAssetStateV3(asset);
  if (!state) return null;
  const record = state.sourcePtsCadenceMapV3;
  const terminal = record.terminalReceipt;
  const verification = record.verificationReceipt;
  if (record.status !== 'COMPLETE' || terminal === null || verification === null
    || terminal.disposition !== 'PUBLISHED'
    || terminal.verificationSha256 !== verification.verificationSha256) {
    return null;
  }
  const sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
  if (asset.proxyMasterRelationV1 !== undefined && asset.proxyMasterRelationV1 !== null) {
    const relation = assertMediaProxyMasterRelationV1(asset.proxyMasterRelationV1);
    const ownerMatches = relation.owner.kind === sourceVersion.owner.kind
      && (relation.owner.kind === 'USER'
        ? sourceVersion.owner.kind === 'USER'
          && relation.owner.userId === sourceVersion.owner.userId
        : sourceVersion.owner.kind === 'ORG'
          && relation.owner.orgId === sourceVersion.owner.orgId);
    if (!ownerMatches
      || relation.assetId !== sourceVersion.assetId
      || relation.mediaKind !== sourceVersion.mediaKind
      || relation.master.sourceVersionSha256 !== sourceVersion.sourceVersionSha256
      || relation.master.contentSha256 !== sourceVersion.contentSha256
      || relation.master.storageVersionSha256
        !== sourceVersion.storageVersion.storageVersionSha256) {
      throw new Error('VIDEO_SOURCE_CONFORM_PROXY_MASTER_RELATION_SCOPE_MISMATCH');
    }
    throw new Error('VIDEO_SOURCE_CONFORM_PROXY_MASTER_MAPPING_REQUIRED');
  }
  const sourceCadence = verification.verifiedEpochCount === 1
    && verification.observedCadence.kind === 'UNIFORM_FRAME_DURATIONS'
    ? {
        kind: 'CFR' as const,
        durationTicks: verification.observedCadence.durationTicks,
      }
    : { kind: 'VFR' as const };
  const material = {
    schemaVersion: 3 as const,
    kind: VIDEO_SOURCE_EPOCH_TIME_BINDING_KIND_V3,
    assetId: sourceVersion.assetId,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: record.source.sourceBindingSha256,
    technicalObservationSha256: record.source.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3: state.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: record.source.mapBindingSha256,
    terminalReceiptSha256: terminal.terminalReceiptSha256,
    verificationSha256: verification.verificationSha256,
    epochIndexContentSha256: record.epochIndexSidecar.contentSha256,
    streamId: `video-${String(record.source.videoStreamIndex)}`,
    videoStreamIndex: record.source.videoStreamIndex,
    sourceTimebase: parseExactRationalRateV1(record.source.sourceTimebase),
    sourceCadence,
    totalSourceFrameCount: verification.verifiedFrameCount,
  };
  return frozen({ ...material, bindingSha256: hashEditronCanonicalJsonV1(material) });
}

/**
 * Converts a bounded V3 epoch window into exact preserve-real-time selections.
 * The function reads no media bytes until the current asset state and any
 * unqualified proxy/master relation have been rejected.
 */
export async function createVideoSourceTimestampConformFromVerifiedEpochIndexV3(
  input: VideoSourceTimestampConformEpochBaseInputV3
    & Readonly<{ sourceAnchor: SourcePositionV1 }>,
): Promise<VideoSourceTimestampConformFromEpochIndexResultV3> {
  const prepared = await prepareVideoSourceTimestampConformEpochV3(input);
  if (prepared.disposition === 'UNVERIFIABLE') return prepared;
  return createVideoSourceTimestampConformFromPreparedEpochV3(
    input,
    prepared,
    input.sourceAnchor,
  );
}

/**
 * Resolves a legacy project's source-frame anchor through the verified V3
 * epoch window. The ordinal never becomes a timestamp by rate arithmetic.
 */
export async function createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3(
  input: VideoSourceTimestampConformEpochBaseInputV3
    & Readonly<{ sourceAnchorFrameOrdinal: string }>,
): Promise<VideoSourceTimestampConformFromEpochIndexResultV3> {
  const sourceAnchorFrameOrdinal = nonNegativeIntegerText(
    input.sourceAnchorFrameOrdinal,
    'VIDEO_SOURCE_CONFORM_ANCHOR_ORDINAL_INVALID',
  );
  const prepared = await prepareVideoSourceTimestampConformEpochV3(input);
  if (prepared.disposition === 'UNVERIFIABLE') return prepared;
  const anchorFrame = prepared.presentationWindow.frames.find(
    (frame) => frame.sourceFrameOrdinal === sourceAnchorFrameOrdinal,
  );
  const anchorEpoch = anchorFrame === undefined
    ? undefined
    : prepared.presentationWindow.epochs.find(
        (epoch) => epoch.epochId === anchorFrame.epochId,
      );
  if (!anchorFrame || !anchorEpoch) {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'WINDOW_COVERAGE_INCOMPLETE' as const,
      failedObjectKey: null,
      failedBatchSequence: null,
      diagnostic: 'VIDEO_SOURCE_CONFORM_ANCHOR_ORDINAL_NOT_IN_WINDOW',
    });
  }
  const sourceAnchor = parseSourcePositionV1({
    sourceVersionSha256: prepared.sourceBinding.sourceVersionSha256,
    streamId: prepared.presentationWindow.streamId,
    epochId: anchorFrame.epochId,
    presentationTimestampTicks: anchorFrame.presentationTimestampTicks,
    secondsPerSourceTick: anchorEpoch.secondsPerSourceTick,
  });
  return createVideoSourceTimestampConformFromPreparedEpochV3(
    input,
    prepared,
    sourceAnchor,
  );
}

async function prepareVideoSourceTimestampConformEpochV3(
  input: VideoSourceTimestampConformEpochBaseInputV3,
): Promise<
  PreparedVideoSourceTimestampConformEpochV3
  | VideoSourceTimestampConformEpochUnverifiableV3
> {
  if (input.proxyMasterMapping !== undefined) {
    sha256Text(
      input.proxyMasterMapping.relationSha256,
      'VIDEO_SOURCE_CONFORM_PROXY_MASTER_RELATION_INVALID',
    );
    throw new Error('VIDEO_SOURCE_CONFORM_PROXY_MASTER_MAPPING_REQUIRED');
  }
  const sourceBinding = resolveVerifiedVideoSourceEpochTimeBindingV3(input.asset);
  if (sourceBinding === null) {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'WINDOW_ASSET_NOT_VERIFIED' as const,
      failedObjectKey: null,
      failedBatchSequence: null,
      diagnostic: null,
    });
  }
  const presentationWindow = await readMediaSourcePtsCadenceEpochPresentationWindowV3({
    asset: input.asset,
    storedObjectReader: input.storedObjectReader,
    firstFrameOrdinal: input.firstFrameOrdinal,
    endExclusiveFrameOrdinal: input.endExclusiveFrameOrdinal,
    resourcePolicy: input.windowResourcePolicy,
  });
  if (presentationWindow.disposition === 'UNVERIFIABLE') return presentationWindow;
  if (!epochBindingMatchesWindowV3(sourceBinding, presentationWindow)) {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'WINDOW_INDEX_SCOPE_MISMATCH' as const,
      failedObjectKey: null,
      failedBatchSequence: null,
      diagnostic: 'VERIFIED_EPOCH_BINDING_WINDOW_MISMATCH',
    });
  }
  return frozen({
    disposition: 'READY' as const,
    sourceBinding,
    presentationWindow,
  });
}

function createVideoSourceTimestampConformFromPreparedEpochV3(
  input: VideoSourceTimestampConformEpochBaseInputV3,
  prepared: PreparedVideoSourceTimestampConformEpochV3,
  sourceAnchor: SourcePositionV1,
): VideoSourceTimestampConformFromEpochIndexResultV3 {
  const { presentationWindow, sourceBinding } = prepared;
  const core = createTimestampConformSelectionCoreV2({
    sourceScope: sourceScopeForEpochBindingV3(sourceBinding),
    streamId: presentationWindow.streamId,
    epochs: presentationWindow.epochs,
    sourceFrames: presentationWindow.frames,
    projectRate: input.projectRate,
    timelineStartFrame: input.timelineStartFrame,
    timelineFrameQueries: input.timelineFrameQueries,
    sourceAnchor,
    resourcePolicy: input.resourcePolicy,
  });
  const audioMapping = input.audio === undefined
    ? null
    : createTimestampConformAudioMappingV3({
        evidence: input.audio.evidence,
        sourceBinding,
        videoEpochs: core.epochs,
        sourceAnchor: core.sourceAnchor,
        projectRate: core.projectRate,
        timelineStartFrame: core.timelineStartFrame,
        endExclusiveTimelineFrame: input.audio.endExclusiveTimelineFrame,
      });
  const sourceWindowMaterial = {
    sourceBindingSha256: sourceBinding.bindingSha256,
    presentationWindowEvidenceSha256:
      presentationWindow.presentationWindowEvidenceSha256,
    evidenceStatus: presentationWindow.evidenceStatus,
    streamId: core.streamId,
    epochs: core.epochs,
    sourceFrames: core.sourceFrames,
    resourcePolicy: core.resourcePolicy,
  };
  const material = {
    schemaVersion: 3 as const,
    kind: VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V3,
    writerAuthority: PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1,
    policy: VIDEO_SOURCE_TIMESTAMP_CONFORM_POLICY_V2,
    evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW_CONSUMED' as const,
    sourceBinding,
    sourceWindowSha256: hashEditronCanonicalJsonV1(sourceWindowMaterial),
    presentationWindowEvidenceSha256:
      presentationWindow.presentationWindowEvidenceSha256,
    streamId: core.streamId,
    projectRate: core.projectRate,
    timelineStartFrame: core.timelineStartFrame,
    queryCount: String(core.timelineFrameQueries.length),
    sourceAnchor: core.sourceAnchor,
    resourcePolicy: core.resourcePolicy,
    frameSelections: core.frameSelections,
    audioMapping,
  };
  const transform = assertVideoSourceTimestampConformV3({
    ...material,
    transformSha256: hashEditronCanonicalJsonV1(material),
  });
  return frozen({ disposition: 'CONFORM_CREATED' as const, presentationWindow, transform });
}

function assertVerifiedVideoSourceEpochTimeBindingV3(
  value: unknown,
): VerifiedVideoSourceEpochTimeBindingV3 {
  const record = objectRecord(value, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_INVALID');
  exactObjectKeys(record, [
    'assetId', 'bindingSha256', 'epochIndexContentSha256', 'kind', 'mapBindingSha256',
    'schemaVersion', 'sourceBindingSha256', 'sourceCadence',
    'sourcePtsCadenceMapStateSha256V3', 'sourceTimebase', 'sourceVersionSha256',
    'storageVersionSha256', 'streamId', 'technicalObservationSha256',
    'terminalReceiptSha256', 'totalSourceFrameCount', 'verificationSha256',
    'videoStreamIndex',
  ], 'VIDEO_SOURCE_EPOCH_TIME_BINDING_FIELDS_INVALID');
  if (record.schemaVersion !== 3 || record.kind !== VIDEO_SOURCE_EPOCH_TIME_BINDING_KIND_V3) {
    throw new Error('VIDEO_SOURCE_EPOCH_TIME_BINDING_INVALID');
  }
  const sourceCadenceRecord = objectRecord(
    record.sourceCadence,
    'VIDEO_SOURCE_EPOCH_TIME_BINDING_CADENCE_INVALID',
  );
  const sourceCadence = sourceCadenceRecord.kind === 'VFR'
    ? (() => {
        exactObjectKeys(
          sourceCadenceRecord,
          ['kind'],
          'VIDEO_SOURCE_EPOCH_TIME_BINDING_CADENCE_FIELDS_INVALID',
        );
        return { kind: 'VFR' as const };
      })()
    : (() => {
        exactObjectKeys(
          sourceCadenceRecord,
          ['durationTicks', 'kind'],
          'VIDEO_SOURCE_EPOCH_TIME_BINDING_CADENCE_FIELDS_INVALID',
        );
        if (sourceCadenceRecord.kind !== 'CFR') {
          throw new Error('VIDEO_SOURCE_EPOCH_TIME_BINDING_CADENCE_INVALID');
        }
        return {
          kind: 'CFR' as const,
          durationTicks: positiveIntegerText(
            sourceCadenceRecord.durationTicks,
            'VIDEO_SOURCE_EPOCH_TIME_BINDING_DURATION_INVALID',
          ),
        };
      })();
  const videoStreamIndex = nonNegativeSafeInteger(
    record.videoStreamIndex,
    'VIDEO_SOURCE_EPOCH_TIME_BINDING_STREAM_INDEX_INVALID',
  );
  const material = {
    schemaVersion: 3 as const,
    kind: VIDEO_SOURCE_EPOCH_TIME_BINDING_KIND_V3,
    assetId: boundedText(record.assetId, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_ASSET_INVALID'),
    sourceVersionSha256: sha256Text(record.sourceVersionSha256, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_SOURCE_INVALID'),
    storageVersionSha256: sha256Text(record.storageVersionSha256, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_STORAGE_INVALID'),
    sourceBindingSha256: sha256Text(record.sourceBindingSha256, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_QUALIFICATION_INVALID'),
    technicalObservationSha256: sha256Text(record.technicalObservationSha256, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_OBSERVATION_INVALID'),
    sourcePtsCadenceMapStateSha256V3: sha256Text(record.sourcePtsCadenceMapStateSha256V3, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_STATE_INVALID'),
    mapBindingSha256: sha256Text(record.mapBindingSha256, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_MAP_INVALID'),
    terminalReceiptSha256: sha256Text(record.terminalReceiptSha256, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_TERMINAL_INVALID'),
    verificationSha256: sha256Text(record.verificationSha256, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_VERIFICATION_INVALID'),
    epochIndexContentSha256: sha256Text(record.epochIndexContentSha256, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_INDEX_INVALID'),
    streamId: boundedText(record.streamId, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_STREAM_INVALID'),
    videoStreamIndex,
    sourceTimebase: parseExactRationalRateV1(record.sourceTimebase),
    sourceCadence,
    totalSourceFrameCount: positiveIntegerText(record.totalSourceFrameCount, 'VIDEO_SOURCE_EPOCH_TIME_BINDING_FRAME_COUNT_INVALID'),
  };
  if (material.streamId !== `video-${String(videoStreamIndex)}`
    || record.bindingSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('VIDEO_SOURCE_EPOCH_TIME_BINDING_HASH_OR_STREAM_MISMATCH');
  }
  return frozen({ ...material, bindingSha256: record.bindingSha256 as string });
}

export function assertVideoSourceTimestampConformV3(
  value: unknown,
): VideoSourceTimestampConformV3 {
  const record = objectRecord(value, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_INVALID');
  exactObjectKeys(record, [
    'audioMapping', 'evidenceStatus', 'frameSelections', 'kind', 'policy',
    'presentationWindowEvidenceSha256', 'projectRate', 'queryCount',
    'resourcePolicy', 'schemaVersion', 'sourceAnchor', 'sourceBinding',
    'sourceWindowSha256', 'streamId', 'timelineStartFrame', 'transformSha256',
    'writerAuthority',
  ], 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_FIELDS_INVALID');
  if (record.schemaVersion !== 3
    || record.kind !== VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V3
    || record.writerAuthority !== PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1
    || record.policy !== VIDEO_SOURCE_TIMESTAMP_CONFORM_POLICY_V2
    || record.evidenceStatus !== 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW_CONSUMED') {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_INVALID');
  }
  const sourceBinding = assertVerifiedVideoSourceEpochTimeBindingV3(record.sourceBinding);
  const projectRate = parseExactRationalRateV1(record.projectRate);
  const timelineStartFrame = nonNegativeIntegerText(
    record.timelineStartFrame,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_TIMELINE_START_INVALID',
  );
  const resourcePolicy = normalizeTimestampConformResourcePolicyV2(
    record.resourcePolicy as VideoSourceTimestampConformResourcePolicyV2,
  );
  const frameSelections = normalizePersistedFrameSelectionsV3(
    record.frameSelections,
    timelineStartFrame,
    resourcePolicy.maxFrameQueries,
    projectRate,
  );
  const queryCount = positiveIntegerText(
    record.queryCount,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_QUERY_COUNT_INVALID',
  );
  if (BigInt(queryCount) !== BigInt(frameSelections.length)) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_QUERY_COUNT_MISMATCH');
  }
  const sourceAnchor = parseSourcePositionV1(record.sourceAnchor);
  if (sourceAnchor.sourceVersionSha256 !== sourceBinding.sourceVersionSha256
    || sourceAnchor.streamId !== sourceBinding.streamId) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_ANCHOR_SCOPE_MISMATCH');
  }
  const audioMapping = normalizePersistedAudioMappingV3(
    record.audioMapping,
    projectRate,
    timelineStartFrame,
    sourceBinding,
  );
  const material = {
    schemaVersion: 3 as const,
    kind: VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V3,
    writerAuthority: PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1,
    policy: VIDEO_SOURCE_TIMESTAMP_CONFORM_POLICY_V2,
    evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW_CONSUMED' as const,
    sourceBinding,
    sourceWindowSha256: sha256Text(record.sourceWindowSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_WINDOW_INVALID'),
    presentationWindowEvidenceSha256: sha256Text(record.presentationWindowEvidenceSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_EVIDENCE_INVALID'),
    streamId: boundedText(record.streamId, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_STREAM_INVALID'),
    projectRate,
    timelineStartFrame,
    queryCount,
    sourceAnchor,
    resourcePolicy,
    frameSelections,
    audioMapping,
  };
  if (material.streamId !== sourceBinding.streamId
    || record.transformSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_HASH_OR_STREAM_MISMATCH');
  }
  return frozen({ ...material, transformSha256: record.transformSha256 as string });
}

export function createProjectVideoSourceTimeTransformV1(input: Readonly<{
  projectId: string;
  overlayId: string | number;
  beforeProjectRevision: ProjectRevisionV1;
  afterProjectRevision: ProjectRevisionV1;
  projectFps: number;
  timelineStartFrame: number;
  sourceStartFrame: number;
  sourceEndFrameExclusive?: number;
  durationInFrames: number;
  speedCurve: readonly Keyframe[];
  sourceBinding: VerifiedVideoSourceTimeBindingV1;
}>): ProjectVideoSourceTimeTransformV1 {
  const sourceBinding = assertBinding(input.sourceBinding);
  const projectId = boundedText(input.projectId, 'VIDEO_SOURCE_TIME_TRANSFORM_PROJECT_INVALID');
  const overlayId = boundedText(String(input.overlayId), 'VIDEO_SOURCE_TIME_TRANSFORM_OVERLAY_INVALID');
  const timelineStartFrame = nonNegativeInteger(input.timelineStartFrame, 'VIDEO_SOURCE_TIME_TRANSFORM_TIMELINE_START_INVALID');
  const sourceStartFrame = nonNegativeInteger(input.sourceStartFrame, 'VIDEO_SOURCE_TIME_TRANSFORM_SOURCE_START_INVALID');
  const sourceEndFrameExclusive = input.sourceEndFrameExclusive === undefined
    ? undefined
    : positiveInteger(input.sourceEndFrameExclusive, 'VIDEO_SOURCE_TIME_TRANSFORM_SOURCE_END_INVALID');
  if (sourceEndFrameExclusive !== undefined && sourceEndFrameExclusive <= sourceStartFrame) {
    throw new Error('VIDEO_SOURCE_TIME_TRANSFORM_SOURCE_RANGE_INVALID');
  }
  const durationInFrames = positiveInteger(input.durationInFrames, 'VIDEO_SOURCE_TIME_TRANSFORM_DURATION_INVALID');
  const projectFps = positiveFinite(input.projectFps, 'VIDEO_SOURCE_TIME_TRANSFORM_PROJECT_FPS_INVALID');
  const rateCompatibility = classifyVerifiedVideoSourceRateCompatibilityV1(
    sourceBinding,
    projectFps,
  );
  if (rateCompatibility.disposition === 'UNSUPPORTED') {
    throw new Error(`VIDEO_SOURCE_TIME_TRANSFORM_${rateCompatibility.reason}`);
  }
  assertRevisionPair(input.beforeProjectRevision, input.afterProjectRevision);
  const speedCurve = assertSpeedCurve(input.speedCurve, durationInFrames);
  const availableSourceFrames = sourceEndFrameExclusive === undefined
    ? durationInFrames
    : sourceEndFrameExclusive - sourceStartFrame;
  const segments = computeSpeedSegments(
    speedCurve,
    durationInFrames,
    availableSourceFrames,
  ).map((segment) => {
    const sourceSegmentStart = sourceStartFrame + segment.sourceStartFrame;
    const sourceSegmentEnd = sourceSegmentStart
      + ((segment.compositionEndFrame - segment.compositionStartFrame) * segment.playbackRate);
    if (!Number.isFinite(sourceSegmentEnd) || segment.playbackRate <= 0) {
      throw new Error('VIDEO_SOURCE_TIME_TRANSFORM_SEGMENT_INVALID');
    }
    return {
      timelineStartFrame: timelineStartFrame + segment.compositionStartFrame,
      timelineEndFrameExclusive: timelineStartFrame + segment.compositionEndFrame,
      playbackRate: segment.playbackRate,
      sourceStartFrame: sourceSegmentStart,
      sourceEndFrameExclusive: sourceSegmentEnd,
    };
  });
  const totalSourceFrameCount = Number(BigInt(sourceBinding.totalSourceFrameCount));
  if (!Number.isSafeInteger(totalSourceFrameCount)
    || segments.some(({ sourceEndFrameExclusive }) => sourceEndFrameExclusive > totalSourceFrameCount)) {
    throw new Error('VIDEO_SOURCE_TIME_TRANSFORM_SOURCE_HANDLES_INSUFFICIENT');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_KIND_V1,
    writerAuthority: PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1,
    rendererMappingVersion: sourceEndFrameExclusive === undefined
      ? VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1
      : VIDEO_RETIME_RENDERER_MAPPING_VERSION_V2,
    projectId,
    overlayId,
    assetId: sourceBinding.assetId,
    beforeProjectRevision: input.beforeProjectRevision,
    afterProjectRevision: input.afterProjectRevision,
    projectTimebase: { kind: 'LEGACY_NUMERIC_FPS_V1' as const, fps: projectFps },
    sourceBinding,
    timelineStartFrame,
    sourceStartFrame,
    ...(sourceEndFrameExclusive === undefined ? {} : { sourceEndFrameExclusive }),
    durationInFrames,
    speedCurveSha256: hashEditronCanonicalJsonV1(speedCurve),
    segments,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    transformSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function rebindSourcePresentationTimestampV1(
  transform: ProjectVideoSourceTimeTransformV1,
  currentSourceBinding: VerifiedVideoSourceTimeBindingV1,
  sourcePresentationTimestampTicks: string,
): SourcePresentationTimestampRebindV1 {
  assertTransform(transform);
  const currentBinding = assertBinding(currentSourceBinding);
  const binding = transform.sourceBinding;
  if (currentBinding.bindingSha256 !== binding.bindingSha256) {
    return frozen({ disposition: 'UNVERIFIABLE' as const, reason: 'SOURCE_BINDING_STALE' as const });
  }
  const rateCompatibility = classifyVerifiedVideoSourceRateCompatibilityV1(
    binding,
    transform.projectTimebase.fps,
  );
  if (rateCompatibility.disposition === 'UNSUPPORTED') {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: rateCompatibility.reason,
    });
  }
  if (binding.sourceCadence.kind !== 'CFR') {
    throw new Error('VIDEO_SOURCE_TIME_TRANSFORM_INVALID');
  }
  const pts = integerText(sourcePresentationTimestampTicks, 'VIDEO_SOURCE_TIME_REBIND_PTS_INVALID');
  const start = BigInt(binding.sourceStartPresentationTimestampTicks);
  const end = BigInt(binding.sourceEndExclusivePresentationTimestampTicks);
  if (pts < start || pts >= end) return frozen({ disposition: 'UNVERIFIABLE' as const, reason: 'PTS_OUTSIDE_SOURCE' as const });
  const duration = BigInt(binding.sourceCadence.durationTicks);
  const offset = pts - start;
  if (offset % duration !== BigInt(0)) {
    return frozen({ disposition: 'UNVERIFIABLE' as const, reason: 'PTS_NOT_FRAME_ALIGNED' as const });
  }
  const sourceFrameOrdinal = Number(offset / duration);
  if (!Number.isSafeInteger(sourceFrameOrdinal)) {
    return frozen({ disposition: 'UNVERIFIABLE' as const, reason: 'PTS_OUTSIDE_SOURCE' as const });
  }
  const segment = transform.segments.find(({ sourceStartFrame, sourceEndFrameExclusive }) =>
    sourceFrameOrdinal >= sourceStartFrame && sourceFrameOrdinal < sourceEndFrameExclusive);
  if (!segment) {
    return frozen({ disposition: 'UNVERIFIABLE' as const, reason: 'SOURCE_FRAME_NOT_PRESENT_AFTER_RETIME' as const });
  }
  const projectFrame = segment.timelineStartFrame
    + ((sourceFrameOrdinal - segment.sourceStartFrame) / segment.playbackRate);
  if (!Number.isSafeInteger(projectFrame)) {
    return frozen({ disposition: 'UNVERIFIABLE' as const, reason: 'SUBFRAME_PROJECT_POSITION' as const });
  }
  return frozen({
    disposition: 'REBOUND' as const, sourcePresentationTimestampTicks: pts.toString(),
    sourceFrameOrdinal, projectFrame, transformSha256: transform.transformSha256,
  });
}

/**
 * Validates the persisted renderer state selected by the speed-ramp form
 * owner. This function does not choose curve points, easing, or duration; it
 * only prevents the writer from storing a speed track that contradicts the
 * renderer's `speedCurve` input.
 */
export function assertProjectVideoSpeedRampStateV1(input: Readonly<{
  durationInFrames: number;
  speedCurve: readonly Keyframe[];
  keyframeTracks: readonly KeyframeTrack[];
}>): Readonly<{ speedCurve: Keyframe[]; keyframeTracks: KeyframeTrack[] }> {
  const durationInFrames = positiveInteger(
    input.durationInFrames,
    'VIDEO_SOURCE_TIME_TRANSFORM_DURATION_INVALID',
  );
  const speedCurve = assertSpeedCurve(input.speedCurve, durationInFrames);
  if (!Array.isArray(input.keyframeTracks)) {
    throw new Error('VIDEO_SPEED_RAMP_KEYFRAME_TRACKS_INVALID');
  }
  const allowedProperties = new Set<KeyframeTrack['property']>([
    'x', 'y', 'scale', 'opacity', 'rotation', 'speed', 'objectPositionX', 'objectPositionY',
  ]);
  const allowedEasings = new Set<Keyframe['easing']>([
    'linear', 'ease-in', 'ease-out', 'ease-in-out', 'snap-out',
  ]);
  const keyframeTracks = input.keyframeTracks.map((track) => {
    if (!track || !allowedProperties.has(track.property) || !Array.isArray(track.keyframes)) {
      throw new Error('VIDEO_SPEED_RAMP_KEYFRAME_TRACKS_INVALID');
    }
    const trackKeyframes: readonly Keyframe[] = track.keyframes;
    const keyframes = trackKeyframes.map((point: Keyframe, index: number) => {
      if (!Number.isSafeInteger(point?.frame) || point.frame < 0
        || point.frame >= durationInFrames || !Number.isFinite(point.value)
        || !allowedEasings.has(point.easing)
        || (index > 0 && point.frame <= trackKeyframes[index - 1]!.frame)) {
        throw new Error('VIDEO_SPEED_RAMP_KEYFRAME_TRACKS_INVALID');
      }
      return { ...point };
    });
    return { property: track.property, keyframes };
  });
  const speedTracks = keyframeTracks.filter((track) => track.property === 'speed');
  if (speedTracks.length !== 1
    || hashEditronCanonicalJsonV1(speedTracks[0]!.keyframes)
      !== hashEditronCanonicalJsonV1(speedCurve)) {
    throw new Error('VIDEO_SPEED_RAMP_KEYFRAME_PARITY_INVALID');
  }
  return { speedCurve, keyframeTracks };
}

function assertBinding(value: VerifiedVideoSourceTimeBindingV1): VerifiedVideoSourceTimeBindingV1 {
  // `bindingSha256` is an integrity hash, not a caller credential. Production
  // safety depends on ProjectService deriving this value from the current
  // MEDIA_ASSETS record rather than accepting a model-supplied binding.
  const unsigned = { ...value } as Record<string, unknown>;
  delete unsigned.bindingSha256;
  if (value.schemaVersion !== 1 || value.kind !== VIDEO_SOURCE_TIME_BINDING_KIND_V1
    || value.bindingSha256 !== hashEditronCanonicalJsonV1(unsigned)
    || !/^[a-f0-9]{64}$/.test(value.sourceVersionSha256)
    || !/^[a-f0-9]{64}$/.test(value.sourcePtsMapStateSha256)
    || !/^[a-f0-9]{64}$/.test(value.terminalReceiptSha256)) {
    throw new Error('VIDEO_SOURCE_TIME_BINDING_INVALID');
  }
  return value;
}

function assertTransform(value: ProjectVideoSourceTimeTransformV1): void {
  const unsigned = { ...value } as Record<string, unknown>;
  delete unsigned.transformSha256;
  if (value.kind !== PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_KIND_V1
    || value.writerAuthority !== PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1
    || (value.rendererMappingVersion !== VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1
      && value.rendererMappingVersion !== VIDEO_RETIME_RENDERER_MAPPING_VERSION_V2)
    || (value.rendererMappingVersion === VIDEO_RETIME_RENDERER_MAPPING_VERSION_V2
      && (!Number.isSafeInteger(value.sourceEndFrameExclusive)
        || value.sourceEndFrameExclusive! <= value.sourceStartFrame))
    || value.transformSha256 !== hashEditronCanonicalJsonV1(unsigned)) {
    throw new Error('VIDEO_SOURCE_TIME_TRANSFORM_INVALID');
  }
  assertBinding(value.sourceBinding);
}

function assertRevisionPair(before: ProjectRevisionV1, after: ProjectRevisionV1): void {
  if (before?.schemaVersion !== 1 || after?.schemaVersion !== 1
    || !Number.isSafeInteger(before.value) || after.value !== before.value + 1
    || !boundedText(before.compatibilityUpdatedAt, 'VIDEO_SOURCE_TIME_TRANSFORM_REVISION_INVALID')
    || !boundedText(after.compatibilityUpdatedAt, 'VIDEO_SOURCE_TIME_TRANSFORM_REVISION_INVALID')) {
    throw new Error('VIDEO_SOURCE_TIME_TRANSFORM_REVISION_INVALID');
  }
}

function assertSpeedCurve(value: readonly Keyframe[], durationInFrames: number): Keyframe[] {
  if (!Array.isArray(value) || value.length < 2) throw new Error('VIDEO_SOURCE_TIME_TRANSFORM_CURVE_INVALID');
  const curve = value.map((point) => ({ ...point }));
  if (curve.some((point, index) => !Number.isSafeInteger(point.frame) || point.frame < 0
    || point.frame >= durationInFrames || !Number.isFinite(point.value)
    || point.value < 0.1 || point.value > 4
    || (index > 0 && point.frame <= curve[index - 1]!.frame))) {
    throw new Error('VIDEO_SOURCE_TIME_TRANSFORM_CURVE_INVALID');
  }
  return curve;
}

type ExactFractionV2 = Readonly<{ numerator: bigint; denominator: bigint }>;
type TimestampConformIntervalV2 = Readonly<{
  frame: VideoSourceTimestampConformFrameV2;
  start: ExactFractionV2;
  end: ExactFractionV2;
}>;

function normalizeTimestampConformResourcePolicyV2(
  value: VideoSourceTimestampConformResourcePolicyV2,
): VideoSourceTimestampConformResourcePolicyV2 {
  if (!value || typeof value !== 'object') {
    throw new Error('VIDEO_SOURCE_CONFORM_RESOURCE_POLICY_INVALID');
  }
  return {
    policyVersion: boundedText(value.policyVersion, 'VIDEO_SOURCE_CONFORM_RESOURCE_POLICY_INVALID'),
    maxSourceFrames: positiveIntegerInRange(
      value.maxSourceFrames,
      VIDEO_SOURCE_TIMESTAMP_CONFORM_ABSOLUTE_MAX_WINDOW_FRAMES_V2,
      'VIDEO_SOURCE_CONFORM_SOURCE_FRAME_LIMIT_INVALID',
    ),
    maxFrameQueries: positiveIntegerInRange(
      value.maxFrameQueries,
      VIDEO_SOURCE_TIMESTAMP_CONFORM_ABSOLUTE_MAX_QUERIES_V2,
      'VIDEO_SOURCE_CONFORM_QUERY_LIMIT_INVALID',
    ),
  };
}

function timestampConformOutputEvidenceStatusV2(
  value: unknown,
): VideoSourceTimestampConformV2['evidenceStatus'] {
  if (value === 'PRE_RESOLVED_FIXTURE_ONLY') {
    return 'PURE_PRE_RESOLVED_WINDOW_CONTRACT_NOT_RUNTIME_WIRED';
  }
  if (value === 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW') {
    return 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW_CONSUMED_NOT_RENDERER_WIRED';
  }
  throw new Error('VIDEO_SOURCE_CONFORM_WINDOW_EVIDENCE_STATUS_INVALID');
}

function normalizeTimestampConformEpochsV2(
  value: readonly PresentationEpochV1[],
  streamId: string,
  sourceTimebase: ExactRationalRateV1,
): readonly PresentationEpochV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4096) {
    throw new Error('VIDEO_SOURCE_CONFORM_EPOCHS_INVALID');
  }
  const epochs = value.map((epoch) => parsePresentationEpochV1(epoch));
  const seen = new Set<string>();
  for (const epoch of epochs) {
    if (seen.has(epoch.epochId) || epoch.streamId !== streamId
      || !sameRateV2(epoch.secondsPerSourceTick, sourceTimebase)) {
      throw new Error('VIDEO_SOURCE_CONFORM_EPOCH_SCOPE_INVALID');
    }
    seen.add(epoch.epochId);
  }
  return epochs;
}

function normalizeTimestampConformFramesV2(
  value: readonly VideoSourceTimestampConformFrameV2[],
  sourceBinding: TimestampConformSourceScopeV2,
  epochs: readonly PresentationEpochV1[],
  maximum: number,
): readonly VideoSourceTimestampConformFrameV2[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new Error('VIDEO_SOURCE_CONFORM_SOURCE_FRAMES_INVALID');
  }
  const epochById = new Map(epochs.map((epoch) => [epoch.epochId, epoch]));
  const totalSourceFrameCount = BigInt(nonNegativeIntegerText(
    sourceBinding.totalSourceFrameCount,
    'VIDEO_SOURCE_TIME_BINDING_INVALID',
  ));
  const frames = value.map((frame) => {
    if (!frame || typeof frame !== 'object') {
      throw new Error('VIDEO_SOURCE_CONFORM_SOURCE_FRAME_INVALID');
    }
    const normalized = {
      sourceFrameOrdinal: nonNegativeIntegerText(
        frame.sourceFrameOrdinal,
        'VIDEO_SOURCE_CONFORM_FRAME_ORDINAL_INVALID',
      ),
      epochId: boundedText(frame.epochId, 'VIDEO_SOURCE_CONFORM_FRAME_EPOCH_INVALID'),
      presentationTimestampTicks: integerText(
        frame.presentationTimestampTicks,
        'VIDEO_SOURCE_CONFORM_FRAME_PTS_INVALID',
      ).toString(),
      durationTicks: positiveIntegerText(
        frame.durationTicks,
        'VIDEO_SOURCE_CONFORM_FRAME_DURATION_INVALID',
      ),
    };
    const epoch = epochById.get(normalized.epochId);
    const start = BigInt(normalized.presentationTimestampTicks);
    const end = start + BigInt(normalized.durationTicks);
    if (!epoch || start < BigInt(epoch.sourceStartPresentationTimestampTicks)
      || end > BigInt(epoch.sourceEndExclusivePresentationTimestampTicks)
      || BigInt(normalized.sourceFrameOrdinal) >= totalSourceFrameCount) {
      throw new Error('VIDEO_SOURCE_CONFORM_FRAME_OUTSIDE_EVIDENCE');
    }
    if (sourceBinding.sourceCadence.kind === 'CFR'
      && normalized.durationTicks !== sourceBinding.sourceCadence.durationTicks) {
      throw new Error('VIDEO_SOURCE_CONFORM_CFR_DURATION_MISMATCH');
    }
    return normalized;
  });
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    const current = frames[index]!;
    if (BigInt(current.sourceFrameOrdinal) !== BigInt(previous.sourceFrameOrdinal) + BigInt(1)) {
      throw new Error('VIDEO_SOURCE_CONFORM_FRAME_ORDINAL_GAP');
    }
    if (current.epochId === previous.epochId
      && BigInt(current.presentationTimestampTicks)
        !== BigInt(previous.presentationTimestampTicks) + BigInt(previous.durationTicks)) {
      throw new Error('VIDEO_SOURCE_CONFORM_UNDECLARED_DISCONTINUITY');
    }
  }
  return frames;
}

function normalizePersistedFrameSelectionsV3(
  value: unknown,
  timelineStartFrame: string,
  maximum: number,
  projectRate: ExactRationalRateV1,
): VideoSourceTimestampConformV3['frameSelections'] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTIONS_INVALID');
  }
  const start = BigInt(timelineStartFrame);
  return value.map((candidate, index) => {
    const record = objectRecord(
      candidate,
      'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_INVALID',
    );
    exactObjectKeys(record, [
      'epochId', 'presentationTimestampTicks', 'selection', 'sourceCanonicalTime',
      'sourceFrameOrdinal', 'timelineFrame', 'timelineTime',
    ], 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_FIELDS_INVALID');
    const timelineFrame = nonNegativeIntegerText(
      record.timelineFrame,
      'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_TIMELINE_INVALID',
    );
    if (BigInt(timelineFrame) < start
      || (index > 0
        && BigInt(timelineFrame)
          <= BigInt((value[index - 1] as Record<string, unknown>).timelineFrame as string))) {
      throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_ORDER_INVALID');
    }
    const timelineTime = parseCanonicalMediaTimeV1(record.timelineTime);
    const expectedTimelineTime = canonicalTimeFromFractionV2(fractionV2(
      BigInt(timelineFrame) * BigInt(projectRate.denominator),
      BigInt(projectRate.numerator),
    ));
    if (timelineTime.ticks !== expectedTimelineTime.ticks
      || timelineTime.timescale !== expectedTimelineTime.timescale) {
      throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_TIME_MISMATCH');
    }
    const selection = record.selection;
    if (selection !== 'COVERING_PRESENTATION'
      && selection !== 'NEAREST_PREVIOUS'
      && selection !== 'NEAREST_NEXT') {
      throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_POLICY_INVALID');
    }
    return {
      timelineFrame,
      timelineTime,
      sourceCanonicalTime: parseCanonicalMediaTimeV1(record.sourceCanonicalTime),
      sourceFrameOrdinal: nonNegativeIntegerText(
        record.sourceFrameOrdinal,
        'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_ORDINAL_INVALID',
      ),
      epochId: boundedText(
        record.epochId,
        'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_EPOCH_INVALID',
      ),
      presentationTimestampTicks: integerText(
        record.presentationTimestampTicks,
        'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_SELECTION_PTS_INVALID',
      ).toString(),
      selection,
    };
  });
}

type TimestampConformAudioEpochIntervalV3 = Readonly<{
  audioEpochId: string;
  canonicalStart: ExactFractionV2;
  canonicalEnd: ExactFractionV2;
  decodedStart: ExactFractionV2;
  decodedEnd: ExactFractionV2;
}>;

function createTimestampConformAudioMappingV3(input: Readonly<{
  evidence: MediaSourceAudioSampleEpochMapV1;
  sourceBinding: VerifiedVideoSourceEpochTimeBindingV3;
  videoEpochs: readonly PresentationEpochV1[];
  sourceAnchor: SourcePositionV1;
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  endExclusiveTimelineFrame: string;
}>): VideoSourceTimestampConformAudioMappingV3 {
  const evidence = assertMediaSourceAudioSampleEpochMapV1(input.evidence);
  const { binding } = evidence;
  if (binding.mediaKind !== 'video'
    || binding.assetId !== input.sourceBinding.assetId
    || binding.sourceVersionSha256 !== input.sourceBinding.sourceVersionSha256
    || binding.storageVersionSha256 !== input.sourceBinding.storageVersionSha256
    || binding.sourceBindingSha256 !== input.sourceBinding.sourceBindingSha256
    || binding.technicalObservationSha256
      !== input.sourceBinding.technicalObservationSha256) {
    throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_SCOPE_MISMATCH');
  }
  const endExclusiveTimelineFrame = nonNegativeIntegerText(
    input.endExclusiveTimelineFrame,
    'VIDEO_SOURCE_CONFORM_AUDIO_TIMELINE_END_INVALID',
  );
  const timelineFrameCount = BigInt(endExclusiveTimelineFrame)
    - BigInt(input.timelineStartFrame);
  if (timelineFrameCount <= BigInt(0)) {
    throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_TIMELINE_RANGE_INVALID');
  }
  const sampleRate = BigInt(binding.sampleRate);
  const anchorEpoch = input.videoEpochs.find(
    (epoch) => epoch.epochId === input.sourceAnchor.epochId,
  );
  if (!anchorEpoch) throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_ANCHOR_EPOCH_MISSING');
  const anchorCanonicalTime = canonicalTimeForSourcePtsV2(
    anchorEpoch,
    BigInt(input.sourceAnchor.presentationTimestampTicks),
  );
  const mappingStart = fractionV2(
    anchorCanonicalTime.numerator * sampleRate,
    anchorCanonicalTime.denominator,
  );
  const mappingEnd = addFractionV2(mappingStart, fractionV2(
    timelineFrameCount * BigInt(input.projectRate.denominator) * sampleRate,
    BigInt(input.projectRate.numerator),
  ));
  const intervals = createPairedAudioEpochIntervalsV3(
    evidence,
    input.videoEpochs,
  );
  const lastInterval = intervals[intervals.length - 1]!;
  if (compareFractionV2(mappingEnd, lastInterval.canonicalEnd) > 0) {
    throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_EVIDENCE_COVERAGE_INSUFFICIENT');
  }
  const segments = clipAudioEpochIntervalsV3(intervals, mappingStart, mappingEnd);
  const material = {
    schemaVersion: 3 as const,
    kind: VIDEO_SOURCE_TIMESTAMP_AUDIO_MAPPING_KIND_V3,
    assetId: binding.assetId,
    sourceVersionSha256: binding.sourceVersionSha256,
    storageVersionSha256: binding.storageVersionSha256,
    sourceBindingSha256: binding.sourceBindingSha256,
    technicalObservationSha256: binding.technicalObservationSha256,
    audioSampleEpochMapSha256: evidence.audioSampleEpochMapSha256,
    audioStreamBindingSha256: binding.audioStreamBindingSha256,
    decodedPcmSha256: evidence.pcm.decodedPcmSha256,
    streamId: binding.streamId,
    audioStreamIndex: binding.audioStreamIndex,
    sampleRate: binding.sampleRate,
    channelCount: binding.channelCount,
    decodedSampleFrameCount: evidence.pcm.decodedSampleFrameCount,
    timelineStartFrame: input.timelineStartFrame,
    endExclusiveTimelineFrame,
    canonicalTimelineStartSamplePosition: exactAudioSamplePositionV2(mappingStart),
    canonicalTimelineEndExclusiveSamplePosition: exactAudioSamplePositionV2(mappingEnd),
    policy: VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3,
    segments,
  };
  return frozen({
    ...material,
    audioMappingSha256: hashEditronCanonicalJsonV1(material),
  });
}

function createPairedAudioEpochIntervalsV3(
  evidence: MediaSourceAudioSampleEpochMapV1,
  videoEpochs: readonly PresentationEpochV1[],
): readonly TimestampConformAudioEpochIntervalV3[] {
  if (videoEpochs.length !== evidence.epochs.length) {
    throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_EPOCH_PAIRING_REQUIRED');
  }
  const sampleRate = BigInt(evidence.binding.sampleRate);
  const intervals: TimestampConformAudioEpochIntervalV3[] = [];
  evidence.epochs.forEach((audioEpoch, index) => {
    const videoEpoch = videoEpochs[index]!;
    assertPairedAudioBoundaryKindV3(videoEpoch.boundaryKind, audioEpoch.boundaryKind);
    const videoCanonicalStart = fractionV2(
      BigInt(videoEpoch.canonicalStartTime.ticks) * sampleRate,
      BigInt(videoEpoch.canonicalStartTime.timescale),
    );
    const videoSourceStart = fractionV2(
      BigInt(videoEpoch.sourceStartPresentationTimestampTicks)
        * BigInt(videoEpoch.secondsPerSourceTick.numerator) * sampleRate,
      BigInt(videoEpoch.secondsPerSourceTick.denominator),
    );
    const audioSourceStart = fractionV2(
      BigInt(audioEpoch.sourceStartSamplePosition.numerator),
      BigInt(audioEpoch.sourceStartSamplePosition.denominator),
    );
    const canonicalStart = addFractionV2(
      videoCanonicalStart,
      subtractFractionV2(audioSourceStart, videoSourceStart),
    );
    const decodedStart = fractionV2(BigInt(audioEpoch.decodedStartSampleFrame), BigInt(1));
    const decodedEnd = fractionV2(
      BigInt(audioEpoch.decodedEndExclusiveSampleFrame),
      BigInt(1),
    );
    const canonicalEnd = addFractionV2(
      canonicalStart,
      subtractFractionV2(decodedEnd, decodedStart),
    );
    const previous = intervals[intervals.length - 1] ?? null;
    if (previous !== null) {
      const handoff = compareFractionV2(canonicalStart, previous.canonicalEnd);
      if ((videoEpoch.boundaryKind === 'GAP' && handoff <= 0)
        || (videoEpoch.boundaryKind !== 'GAP' && handoff !== 0)) {
        throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_EPOCH_HANDOFF_MISMATCH');
      }
    }
    intervals.push({
      audioEpochId: audioEpoch.epochId,
      canonicalStart,
      canonicalEnd,
      decodedStart,
      decodedEnd,
    });
  });
  return frozen(intervals);
}

function assertPairedAudioBoundaryKindV3(
  video: PresentationEpochV1['boundaryKind'],
  audio: MediaSourceAudioSampleEpochMapV1['epochs'][number]['boundaryKind'],
): void {
  if ((video === 'INITIAL' && audio === 'INITIAL')
    || (video === 'GAP' && audio === 'GAP')
    || (video === 'OVERLAP' && audio === 'OVERLAP')
    || (video === 'TIMESTAMP_RESET' && audio === 'TIMESTAMP_RESET')) return;
  throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_EPOCH_BOUNDARY_MISMATCH');
}

function clipAudioEpochIntervalsV3(
  intervals: readonly TimestampConformAudioEpochIntervalV3[],
  mappingStart: ExactFractionV2,
  mappingEnd: ExactFractionV2,
): readonly VideoSourceTimestampConformAudioSegmentV3[] {
  const fullSegments: VideoSourceTimestampConformAudioSegmentV3[] = [];
  const first = intervals[0]!;
  if (compareFractionV2(mappingStart, first.canonicalStart) < 0) {
    fullSegments.push({
      kind: 'SILENCE',
      reason: 'LEADING_STREAM_OFFSET',
      precedingAudioEpochId: null,
      nextAudioEpochId: first.audioEpochId,
      canonicalStartSamplePosition: exactAudioSamplePositionV2(mappingStart),
      canonicalEndExclusiveSamplePosition: exactAudioSamplePositionV2(first.canonicalStart),
    });
  }
  intervals.forEach((interval, index) => {
    const previous = index === 0 ? null : intervals[index - 1]!;
    if (previous !== null
      && compareFractionV2(previous.canonicalEnd, interval.canonicalStart) < 0) {
      fullSegments.push({
        kind: 'SILENCE',
        reason: 'DECLARED_SOURCE_GAP',
        precedingAudioEpochId: previous.audioEpochId,
        nextAudioEpochId: interval.audioEpochId,
        canonicalStartSamplePosition: exactAudioSamplePositionV2(previous.canonicalEnd),
        canonicalEndExclusiveSamplePosition: exactAudioSamplePositionV2(
          interval.canonicalStart,
        ),
      });
    }
    fullSegments.push({
      kind: 'PCM',
      audioEpochId: interval.audioEpochId,
      canonicalStartSamplePosition: exactAudioSamplePositionV2(interval.canonicalStart),
      canonicalEndExclusiveSamplePosition: exactAudioSamplePositionV2(interval.canonicalEnd),
      decodedStartSamplePosition: exactAudioSamplePositionV2(interval.decodedStart),
      decodedEndExclusiveSamplePosition: exactAudioSamplePositionV2(interval.decodedEnd),
    });
  });
  const clipped: VideoSourceTimestampConformAudioSegmentV3[] = [];
  fullSegments.forEach((segment) => {
    const segmentStart = fractionFromAudioSamplePositionV3(
      segment.canonicalStartSamplePosition,
    );
    const segmentEnd = fractionFromAudioSamplePositionV3(
      segment.canonicalEndExclusiveSamplePosition,
    );
    const start = maximumFractionV3(mappingStart, segmentStart);
    const end = minimumFractionV3(mappingEnd, segmentEnd);
    if (compareFractionV2(start, end) >= 0) return;
    if (segment.kind === 'SILENCE') {
      clipped.push({
        ...segment,
        canonicalStartSamplePosition: exactAudioSamplePositionV2(start),
        canonicalEndExclusiveSamplePosition: exactAudioSamplePositionV2(end),
      });
      return;
    }
    const decodedStart = addFractionV2(
      fractionFromAudioSamplePositionV3(segment.decodedStartSamplePosition),
      subtractFractionV2(start, segmentStart),
    );
    const decodedEnd = addFractionV2(decodedStart, subtractFractionV2(end, start));
    clipped.push({
      ...segment,
      canonicalStartSamplePosition: exactAudioSamplePositionV2(start),
      canonicalEndExclusiveSamplePosition: exactAudioSamplePositionV2(end),
      decodedStartSamplePosition: exactAudioSamplePositionV2(decodedStart),
      decodedEndExclusiveSamplePosition: exactAudioSamplePositionV2(decodedEnd),
    });
  });
  if (clipped.length === 0) {
    throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_EVIDENCE_COVERAGE_INSUFFICIENT');
  }
  return frozen(clipped);
}

function normalizePersistedAudioMappingV3(
  value: unknown,
  projectRate: ExactRationalRateV1,
  timelineStartFrame: string,
  sourceBinding: VerifiedVideoSourceEpochTimeBindingV3,
): VideoSourceTimestampConformV3['audioMapping'] {
  if (value === null) return null;
  const record = objectRecord(value, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_INVALID');
  exactObjectKeys(record, [
    'assetId', 'audioMappingSha256', 'audioSampleEpochMapSha256',
    'audioStreamBindingSha256', 'audioStreamIndex', 'canonicalTimelineEndExclusiveSamplePosition',
    'canonicalTimelineStartSamplePosition', 'channelCount', 'decodedPcmSha256',
    'decodedSampleFrameCount', 'endExclusiveTimelineFrame', 'kind', 'policy',
    'sampleRate', 'schemaVersion', 'segments', 'sourceBindingSha256',
    'sourceVersionSha256', 'storageVersionSha256', 'streamId',
    'technicalObservationSha256', 'timelineStartFrame',
  ], 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_FIELDS_INVALID');
  if (record.schemaVersion !== 3
    || record.kind !== VIDEO_SOURCE_TIMESTAMP_AUDIO_MAPPING_KIND_V3) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_INVALID');
  }
  const audioStreamIndex = nonNegativeSafeInteger(
    record.audioStreamIndex,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_STREAM_INDEX_INVALID',
  );
  if (typeof record.channelCount !== 'number') {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_CHANNEL_COUNT_INVALID');
  }
  const channelCount = positiveInteger(
    record.channelCount,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_CHANNEL_COUNT_INVALID',
  );
  const normalizedTimelineStartFrame = nonNegativeIntegerText(
    record.timelineStartFrame,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_TIMELINE_START_INVALID',
  );
  const endExclusiveTimelineFrame = nonNegativeIntegerText(
    record.endExclusiveTimelineFrame,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_END_INVALID',
  );
  if (normalizedTimelineStartFrame !== timelineStartFrame
    || BigInt(endExclusiveTimelineFrame) <= BigInt(timelineStartFrame)) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_TIMELINE_RANGE_INVALID');
  }
  const sampleRate = positiveIntegerText(
    record.sampleRate,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SAMPLE_RATE_INVALID',
  );
  const decodedSampleFrameCount = positiveIntegerText(
    record.decodedSampleFrameCount,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SAMPLE_COUNT_INVALID',
  );
  const canonicalTimelineStartSamplePosition = normalizeExactAudioSamplePositionV3(
    record.canonicalTimelineStartSamplePosition,
  );
  const canonicalTimelineEndExclusiveSamplePosition = normalizeExactAudioSamplePositionV3(
    record.canonicalTimelineEndExclusiveSamplePosition,
  );
  const start = fractionFromAudioSamplePositionV3(canonicalTimelineStartSamplePosition);
  const expectedEnd = addFractionV2(start, fractionV2(
    (BigInt(endExclusiveTimelineFrame) - BigInt(timelineStartFrame))
      * BigInt(projectRate.denominator) * BigInt(sampleRate),
    BigInt(projectRate.numerator),
  ));
  if (compareFractionV2(
    expectedEnd,
    fractionFromAudioSamplePositionV3(canonicalTimelineEndExclusiveSamplePosition),
  ) !== 0) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_DURATION_MISMATCH');
  }
  const segments = normalizePersistedAudioSegmentsV3(
    record.segments,
    start,
    expectedEnd,
    BigInt(decodedSampleFrameCount),
  );
  const material = {
    schemaVersion: 3 as const,
    kind: VIDEO_SOURCE_TIMESTAMP_AUDIO_MAPPING_KIND_V3,
    assetId: boundedText(record.assetId, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_ASSET_INVALID'),
    sourceVersionSha256: sha256Text(record.sourceVersionSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SOURCE_INVALID'),
    storageVersionSha256: sha256Text(record.storageVersionSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_STORAGE_INVALID'),
    sourceBindingSha256: sha256Text(record.sourceBindingSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SCOPE_INVALID'),
    technicalObservationSha256: sha256Text(record.technicalObservationSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_OBSERVATION_INVALID'),
    audioSampleEpochMapSha256: sha256Text(record.audioSampleEpochMapSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_MAP_INVALID'),
    audioStreamBindingSha256: sha256Text(record.audioStreamBindingSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_STREAM_BINDING_INVALID'),
    decodedPcmSha256: sha256Text(record.decodedPcmSha256, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_PCM_INVALID'),
    streamId: boundedText(record.streamId, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_STREAM_INVALID'),
    audioStreamIndex,
    sampleRate,
    channelCount,
    decodedSampleFrameCount,
    timelineStartFrame: normalizedTimelineStartFrame,
    endExclusiveTimelineFrame,
    canonicalTimelineStartSamplePosition,
    canonicalTimelineEndExclusiveSamplePosition,
    policy: normalizeTimestampConformAudioPolicyV3(record.policy),
    segments,
  };
  if (material.assetId !== sourceBinding.assetId
    || material.sourceVersionSha256 !== sourceBinding.sourceVersionSha256
    || material.storageVersionSha256 !== sourceBinding.storageVersionSha256
    || material.sourceBindingSha256 !== sourceBinding.sourceBindingSha256
    || material.technicalObservationSha256 !== sourceBinding.technicalObservationSha256
    || material.streamId !== `audio-${String(audioStreamIndex)}`
    || record.audioMappingSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_HASH_OR_SCOPE_MISMATCH');
  }
  return frozen({
    ...material,
    audioMappingSha256: record.audioMappingSha256 as string,
  });
}

function normalizePersistedAudioSegmentsV3(
  value: unknown,
  mappingStart: ExactFractionV2,
  mappingEnd: ExactFractionV2,
  decodedSampleFrameCount: bigint,
): readonly VideoSourceTimestampConformAudioSegmentV3[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200_001) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SEGMENTS_INVALID');
  }
  let cursor = mappingStart;
  let previousDecodedEnd: ExactFractionV2 | null = null;
  const segments = value.map((candidate): VideoSourceTimestampConformAudioSegmentV3 => {
    const record = objectRecord(
      candidate,
      'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SEGMENT_INVALID',
    );
    const commonKeys = [
      'canonicalEndExclusiveSamplePosition', 'canonicalStartSamplePosition', 'kind',
    ];
    const canonicalStartSamplePosition = normalizeExactAudioSamplePositionV3(
      record.canonicalStartSamplePosition,
    );
    const canonicalEndExclusiveSamplePosition = normalizeExactAudioSamplePositionV3(
      record.canonicalEndExclusiveSamplePosition,
    );
    const canonicalStart = fractionFromAudioSamplePositionV3(
      canonicalStartSamplePosition,
    );
    const canonicalEnd = fractionFromAudioSamplePositionV3(
      canonicalEndExclusiveSamplePosition,
    );
    if (compareFractionV2(canonicalStart, cursor) !== 0
      || compareFractionV2(canonicalStart, canonicalEnd) >= 0
      || compareFractionV2(canonicalEnd, mappingEnd) > 0) {
      throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SEGMENT_COVERAGE_INVALID');
    }
    cursor = canonicalEnd;
    if (record.kind === 'PCM') {
      exactObjectKeys(record, [
        ...commonKeys, 'audioEpochId', 'decodedEndExclusiveSamplePosition',
        'decodedStartSamplePosition',
      ], 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_PCM_SEGMENT_FIELDS_INVALID');
      const decodedStartSamplePosition = normalizeExactAudioSamplePositionV3(
        record.decodedStartSamplePosition,
      );
      const decodedEndExclusiveSamplePosition = normalizeExactAudioSamplePositionV3(
        record.decodedEndExclusiveSamplePosition,
      );
      const decodedStart = fractionFromAudioSamplePositionV3(decodedStartSamplePosition);
      const decodedEnd = fractionFromAudioSamplePositionV3(
        decodedEndExclusiveSamplePosition,
      );
      if (compareFractionV2(decodedStart, fractionV2(BigInt(0), BigInt(1))) < 0
        || compareFractionV2(decodedStart, decodedEnd) >= 0
        || compareFractionV2(
          decodedEnd,
          fractionV2(decodedSampleFrameCount, BigInt(1)),
        ) > 0
        || compareFractionV2(
          subtractFractionV2(decodedEnd, decodedStart),
          subtractFractionV2(canonicalEnd, canonicalStart),
        ) !== 0
        || (previousDecodedEnd !== null
          && compareFractionV2(decodedStart, previousDecodedEnd) !== 0)) {
        throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_PCM_SEGMENT_INVALID');
      }
      previousDecodedEnd = decodedEnd;
      return {
        kind: 'PCM' as const,
        audioEpochId: boundedText(
          record.audioEpochId,
          'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_EPOCH_INVALID',
        ),
        canonicalStartSamplePosition,
        canonicalEndExclusiveSamplePosition,
        decodedStartSamplePosition,
        decodedEndExclusiveSamplePosition,
      };
    }
    exactObjectKeys(record, [
      ...commonKeys, 'nextAudioEpochId', 'precedingAudioEpochId', 'reason',
    ], 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SILENCE_SEGMENT_FIELDS_INVALID');
    const reason = record.reason;
    if (record.kind !== 'SILENCE'
      || (reason !== 'LEADING_STREAM_OFFSET'
        && reason !== 'DECLARED_SOURCE_GAP')) {
      throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SILENCE_SEGMENT_INVALID');
    }
    return {
      kind: 'SILENCE' as const,
      reason,
      precedingAudioEpochId: record.precedingAudioEpochId === null
        ? null
        : boundedText(
            record.precedingAudioEpochId,
            'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_PRECEDING_EPOCH_INVALID',
          ),
      nextAudioEpochId: boundedText(
        record.nextAudioEpochId,
        'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_NEXT_EPOCH_INVALID',
      ),
      canonicalStartSamplePosition,
      canonicalEndExclusiveSamplePosition,
    };
  });
  if (compareFractionV2(cursor, mappingEnd) !== 0) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SEGMENT_COVERAGE_INVALID');
  }
  return frozen(segments);
}

function normalizeTimestampConformAudioPolicyV3(
  value: unknown,
): typeof VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3 {
  const record = objectRecord(value, 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POLICY_INVALID');
  exactObjectKeys(record, [
    'channelRemix', 'epochAlignment', 'gaps', 'overlapsAndResets',
    'resampling', 'samplePhase',
  ], 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POLICY_FIELDS_INVALID');
  if (record.epochAlignment !== VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3.epochAlignment
    || record.samplePhase !== VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3.samplePhase
    || record.gaps !== VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3.gaps
    || record.overlapsAndResets !== VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3.overlapsAndResets
    || record.resampling !== VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3.resampling
    || record.channelRemix !== VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3.channelRemix) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POLICY_INVALID');
  }
  return VIDEO_SOURCE_TIMESTAMP_AUDIO_POLICY_V3;
}

function normalizeExactAudioSamplePositionV3(value: unknown): ExactAudioSamplePositionV2 {
  const record = objectRecord(
    value,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POSITION_INVALID',
  );
  exactObjectKeys(record, [
    'denominator', 'disposition', 'numerator',
  ], 'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POSITION_FIELDS_INVALID');
  const numerator = integerText(
    record.numerator,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POSITION_NUMERATOR_INVALID',
  ).toString();
  const denominator = positiveIntegerText(
    record.denominator,
    'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POSITION_DENOMINATOR_INVALID',
  );
  const expectedDisposition = denominator === '1'
    ? 'INTEGER_SAMPLE_FRAME' as const
    : 'BETWEEN_SAMPLE_FRAMES' as const;
  if (record.disposition !== expectedDisposition) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POSITION_DISPOSITION_INVALID');
  }
  const reduced = fractionV2(BigInt(numerator), BigInt(denominator));
  if (reduced.numerator.toString() !== numerator
    || reduced.denominator.toString() !== denominator) {
    throw new Error('VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_POSITION_NOT_REDUCED');
  }
  return { numerator, denominator, disposition: expectedDisposition };
}

function fractionFromAudioSamplePositionV3(
  value: ExactAudioSamplePositionV2,
): ExactFractionV2 {
  return fractionV2(BigInt(value.numerator), BigInt(value.denominator));
}

function maximumFractionV3(left: ExactFractionV2, right: ExactFractionV2): ExactFractionV2 {
  return compareFractionV2(left, right) >= 0 ? left : right;
}

function minimumFractionV3(left: ExactFractionV2, right: ExactFractionV2): ExactFractionV2 {
  return compareFractionV2(left, right) <= 0 ? left : right;
}

function normalizeTimestampConformQueriesV2(
  value: readonly string[],
  timelineStartFrame: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new Error('VIDEO_SOURCE_CONFORM_QUERIES_INVALID');
  }
  const start = BigInt(timelineStartFrame);
  const queries = value.map((query) => nonNegativeIntegerText(
    query,
    'VIDEO_SOURCE_CONFORM_QUERY_INVALID',
  ));
  if (queries.some((query, index) => BigInt(query) < start
    || (index > 0 && BigInt(query) <= BigInt(queries[index - 1]!)))) {
    throw new Error('VIDEO_SOURCE_CONFORM_QUERY_ORDER_INVALID');
  }
  return queries;
}

function timestampConformIntervalV2(
  frame: VideoSourceTimestampConformFrameV2,
  epoch: PresentationEpochV1,
): TimestampConformIntervalV2 {
  const startPts = BigInt(frame.presentationTimestampTicks);
  const start = canonicalTimeForSourcePtsV2(epoch, startPts);
  const end = canonicalTimeForSourcePtsV2(epoch, startPts + BigInt(frame.durationTicks));
  if (compareFractionV2(start, end) >= 0) {
    throw new Error('VIDEO_SOURCE_CONFORM_FRAME_INTERVAL_INVALID');
  }
  return { frame, start, end };
}

function selectTimestampConformIntervalV2(
  intervals: readonly TimestampConformIntervalV2[],
  target: ExactFractionV2,
): Readonly<{
  interval: TimestampConformIntervalV2;
  selection: 'COVERING_PRESENTATION' | 'NEAREST_PREVIOUS' | 'NEAREST_NEXT';
}> {
  if (compareFractionV2(target, intervals[0]!.start) < 0
    || compareFractionV2(target, intervals[intervals.length - 1]!.end) >= 0) {
    throw new Error('VIDEO_SOURCE_CONFORM_QUERY_OUTSIDE_WINDOW');
  }
  const covering = intervals.find((interval) => compareFractionV2(target, interval.start) >= 0
    && compareFractionV2(target, interval.end) < 0);
  if (covering) return { interval: covering, selection: 'COVERING_PRESENTATION' };
  const nextIndex = intervals.findIndex((interval) => compareFractionV2(interval.start, target) > 0);
  const previous = intervals[nextIndex - 1];
  const next = intervals[nextIndex];
  if (!previous || !next) throw new Error('VIDEO_SOURCE_CONFORM_GAP_UNRESOLVED');
  const previousDistance = subtractFractionV2(target, previous.end);
  const nextDistance = subtractFractionV2(next.start, target);
  return compareFractionV2(previousDistance, nextDistance) <= 0
    ? { interval: previous, selection: 'NEAREST_PREVIOUS' }
    : { interval: next, selection: 'NEAREST_NEXT' };
}

function createTimestampConformAudioMappingV2(
  input: Readonly<{
    sourceRange: AudioSampleRangeV1;
    sourceAnchorSampleFrame: string;
    endExclusiveTimelineFrame: string;
  }>,
  projectRate: ExactRationalRateV1,
  timelineStartFrame: string,
): NonNullable<VideoSourceTimestampConformV2['audioMapping']> {
  const sourceRange = parseAudioSampleRangeV1(input.sourceRange);
  const sourceAnchorSampleFrame = nonNegativeIntegerText(
    input.sourceAnchorSampleFrame,
    'VIDEO_SOURCE_CONFORM_AUDIO_ANCHOR_INVALID',
  );
  const endExclusiveTimelineFrame = nonNegativeIntegerText(
    input.endExclusiveTimelineFrame,
    'VIDEO_SOURCE_CONFORM_AUDIO_TIMELINE_END_INVALID',
  );
  const timelineFrameCount = BigInt(endExclusiveTimelineFrame) - BigInt(timelineStartFrame);
  if (timelineFrameCount <= BigInt(0)) {
    throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_TIMELINE_RANGE_INVALID');
  }
  const start = fractionV2(BigInt(sourceAnchorSampleFrame), BigInt(1));
  const duration = fractionV2(
    timelineFrameCount * BigInt(projectRate.denominator) * BigInt(sourceRange.sampleRate),
    BigInt(projectRate.numerator),
  );
  const end = addFractionV2(start, duration);
  if (BigInt(sourceAnchorSampleFrame) < BigInt(sourceRange.startSampleFrame)
    || compareFractionV2(end, fractionV2(BigInt(sourceRange.endExclusiveSampleFrame), BigInt(1))) > 0) {
    throw new Error('VIDEO_SOURCE_CONFORM_AUDIO_RANGE_INSUFFICIENT');
  }
  return {
    sourceRange,
    sourceAnchorSampleFrame,
    endExclusiveTimelineFrame,
    startSamplePosition: exactAudioSamplePositionV2(start),
    endExclusiveSamplePosition: exactAudioSamplePositionV2(end),
  };
}

function canonicalTimeForSourcePtsV2(
  epoch: PresentationEpochV1,
  presentationTimestampTicks: bigint,
): ExactFractionV2 {
  const canonicalStart = fractionV2(
    BigInt(epoch.canonicalStartTime.ticks),
    BigInt(epoch.canonicalStartTime.timescale),
  );
  const delta = fractionV2(
    (presentationTimestampTicks - BigInt(epoch.sourceStartPresentationTimestampTicks))
      * BigInt(epoch.secondsPerSourceTick.numerator),
    BigInt(epoch.secondsPerSourceTick.denominator),
  );
  return addFractionV2(canonicalStart, delta);
}

function exactAudioSamplePositionV2(value: ExactFractionV2): ExactAudioSamplePositionV2 {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
    disposition: value.denominator === BigInt(1)
      ? 'INTEGER_SAMPLE_FRAME'
      : 'BETWEEN_SAMPLE_FRAMES',
  };
}

function canonicalTimeFromFractionV2(value: ExactFractionV2): CanonicalMediaTimeV1 {
  return { ticks: value.numerator.toString(), timescale: value.denominator.toString() };
}

function fractionV2(numerator: bigint, denominator: bigint): ExactFractionV2 {
  if (denominator <= BigInt(0)) throw new Error('VIDEO_SOURCE_CONFORM_FRACTION_INVALID');
  const divisor = greatestCommonDivisorV2(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function addFractionV2(left: ExactFractionV2, right: ExactFractionV2): ExactFractionV2 {
  return fractionV2(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtractFractionV2(left: ExactFractionV2, right: ExactFractionV2): ExactFractionV2 {
  return fractionV2(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function compareFractionV2(left: ExactFractionV2, right: ExactFractionV2): -1 | 0 | 1 {
  const leftCross = left.numerator * right.denominator;
  const rightCross = right.numerator * left.denominator;
  return leftCross < rightCross ? -1 : leftCross > rightCross ? 1 : 0;
}

function greatestCommonDivisorV2(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a === BigInt(0) ? BigInt(1) : a;
}

function sameRateV2(left: ExactRationalRateV1, right: ExactRationalRateV1): boolean {
  const normalizedLeft = parseExactRationalRateV1(left);
  const normalizedRight = parseExactRationalRateV1(right);
  return normalizedLeft.numerator === normalizedRight.numerator
    && normalizedLeft.denominator === normalizedRight.denominator;
}

function sha256Text(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactObjectKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(code);
  }
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,127})$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,127}$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function positiveIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 240) throw new Error(code);
  return value.trim();
}
function integerText(value: unknown, code: string): bigint {
  if (typeof value !== 'string' || !/^-?(0|[1-9][0-9]*)$/.test(value)) throw new Error(code);
  return BigInt(value);
}
function nonNegativeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}
function positiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
}
function positiveFinite(value: number, code: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(code);
  return value;
}
function frozen<T extends object>(value: T): Readonly<T> { return deepFreezeEditronJsonV1(value); }
