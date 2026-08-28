import type {
  Keyframe,
  KeyframeTrack,
} from '@/components/editron/editor/version-7.0.0/types';
import { computeSpeedSegments } from '@/lib/editron/utils/keyframe-math';

import {
  parseAudioSampleRangeV1,
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
  readMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetStateInputV2,
} from './media-source-pts-cadence-map-asset-state-v2';
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
  assertMediaSourceVersionV1,
} from './media-source-version-v1';
import type { ProjectRevisionV1 } from './project-service';

export const VIDEO_SOURCE_TIME_BINDING_KIND_V1 =
  'EDITRON_VERIFIED_VIDEO_SOURCE_TIME_BINDING_V1' as const;
export const PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_KIND_V1 =
  'EDITRON_PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_V1' as const;
export const PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1 =
  'PROJECT_SERVICE_VIDEO_RETIME_WRITER_V1' as const;
export const VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1 =
  'EDITRON_STEP_SPEED_SEGMENTS_V1' as const;
export const VIDEO_RETIME_RENDERER_MAPPING_VERSION_V2 =
  'EDITRON_STEP_SPEED_SEGMENTS_SOURCE_SPAN_V2' as const;
export const VIDEO_SOURCE_TIMESTAMP_CONFORM_KIND_V2 =
  'EDITRON_VIDEO_SOURCE_TIMESTAMP_CONFORM_V2' as const;
export const VIDEO_SOURCE_TIMESTAMP_CONFORM_POLICY_V2 =
  'PRESERVE_REAL_TIME_NEAREST' as const;
export const VIDEO_SOURCE_TIMESTAMP_CONFORM_ABSOLUTE_MAX_WINDOW_FRAMES_V2 = 100_000;
export const VIDEO_SOURCE_TIMESTAMP_CONFORM_ABSOLUTE_MAX_QUERIES_V2 = 10_000;

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

export type ExactAudioSamplePositionV2 = Readonly<{
  numerator: string;
  denominator: string;
  disposition: 'INTEGER_SAMPLE_FRAME' | 'BETWEEN_SAMPLE_FRAMES';
}>;

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

export type VideoSourceTimestampConformFromIndexResultV2 = Readonly<
  | {
      disposition: 'CONFORM_CREATED';
      presentationWindow: MediaSourcePtsCadencePresentationWindowV2;
      transform: VideoSourceTimestampConformV2;
    }
  | Extract<MediaSourcePtsCadencePresentationWindowResultV2, { disposition: 'UNVERIFIABLE' }>
>;

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

export type VerifiedVideoSourceRateCompatibilityV1 = Readonly<
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
  const sourceTimebase = parseExactRationalRateV1(sourceBinding.sourceTimebase);
  const epochs = normalizeTimestampConformEpochsV2(input.epochs, streamId, sourceTimebase);
  const sourceFrames = normalizeTimestampConformFramesV2(
    input.sourceFrames,
    sourceBinding,
    epochs,
    resourcePolicy.maxSourceFrames,
  );
  const sourceAnchor = parseSourcePositionV1(input.sourceAnchor);
  if (sourceAnchor.sourceVersionSha256 !== sourceBinding.sourceVersionSha256
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
  const sourceWindowMaterial = {
    sourceBindingSha256: sourceBinding.bindingSha256,
    presentationWindowEvidenceSha256,
    presentationWindowEvidenceStatus: input.presentationWindowEvidenceStatus,
    streamId,
    epochs,
    sourceFrames,
    resourcePolicy,
  };
  const audioMapping = input.audio === undefined
    ? null
    : createTimestampConformAudioMappingV2(
        input.audio,
        projectRate,
        timelineStartFrame,
      );
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
    streamId,
    projectRate,
    timelineStartFrame,
    queryCount: String(timelineFrameQueries.length),
    sourceAnchor,
    resourcePolicy,
    frameSelections,
    audioMapping,
  };
  return frozen({ ...material, transformSha256: hashEditronCanonicalJsonV1(material) });
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
  sourceBinding: VerifiedVideoSourceTimeBindingV1,
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
