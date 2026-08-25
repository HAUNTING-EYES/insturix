import type {
  Keyframe,
  KeyframeTrack,
} from '@/components/editron/editor/version-7.0.0/types';
import { computeSpeedSegments } from '@/lib/editron/utils/keyframe-math';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  readMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetStateInputV2,
} from './media-source-pts-cadence-map-asset-state-v2';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';
import type { ProjectRevisionV1 } from './project-service';

export const VIDEO_SOURCE_TIME_BINDING_KIND_V1 =
  'EDITRON_VERIFIED_VIDEO_SOURCE_TIME_BINDING_V1' as const;
export const PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_KIND_V1 =
  'EDITRON_PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_V1' as const;
export const PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1 =
  'PROJECT_SERVICE_VIDEO_RETIME_WRITER_V1' as const;
export const VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1 =
  'EDITRON_STEP_SPEED_SEGMENTS_V1' as const;

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
  rendererMappingVersion: typeof VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1;
  projectId: string;
  overlayId: string;
  assetId: string;
  beforeProjectRevision: ProjectRevisionV1;
  afterProjectRevision: ProjectRevisionV1;
  projectTimebase: Readonly<{ kind: 'LEGACY_NUMERIC_FPS_V1'; fps: number }>;
  sourceBinding: VerifiedVideoSourceTimeBindingV1;
  timelineStartFrame: number;
  sourceStartFrame: number;
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
        | 'SOURCE_FRAME_NOT_PRESENT_AFTER_RETIME' | 'SUBFRAME_PROJECT_POSITION';
    }
>;

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

export function createProjectVideoSourceTimeTransformV1(input: Readonly<{
  projectId: string;
  overlayId: string | number;
  beforeProjectRevision: ProjectRevisionV1;
  afterProjectRevision: ProjectRevisionV1;
  projectFps: number;
  timelineStartFrame: number;
  sourceStartFrame: number;
  durationInFrames: number;
  speedCurve: readonly Keyframe[];
  sourceBinding: VerifiedVideoSourceTimeBindingV1;
}>): ProjectVideoSourceTimeTransformV1 {
  const sourceBinding = assertBinding(input.sourceBinding);
  const projectId = boundedText(input.projectId, 'VIDEO_SOURCE_TIME_TRANSFORM_PROJECT_INVALID');
  const overlayId = boundedText(String(input.overlayId), 'VIDEO_SOURCE_TIME_TRANSFORM_OVERLAY_INVALID');
  const timelineStartFrame = nonNegativeInteger(input.timelineStartFrame, 'VIDEO_SOURCE_TIME_TRANSFORM_TIMELINE_START_INVALID');
  const sourceStartFrame = nonNegativeInteger(input.sourceStartFrame, 'VIDEO_SOURCE_TIME_TRANSFORM_SOURCE_START_INVALID');
  const durationInFrames = positiveInteger(input.durationInFrames, 'VIDEO_SOURCE_TIME_TRANSFORM_DURATION_INVALID');
  const projectFps = positiveFinite(input.projectFps, 'VIDEO_SOURCE_TIME_TRANSFORM_PROJECT_FPS_INVALID');
  assertRevisionPair(input.beforeProjectRevision, input.afterProjectRevision);
  const speedCurve = assertSpeedCurve(input.speedCurve, durationInFrames);
  const segments = computeSpeedSegments(speedCurve, durationInFrames).map((segment) => {
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
    rendererMappingVersion: VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1,
    projectId,
    overlayId,
    assetId: sourceBinding.assetId,
    beforeProjectRevision: input.beforeProjectRevision,
    afterProjectRevision: input.afterProjectRevision,
    projectTimebase: { kind: 'LEGACY_NUMERIC_FPS_V1' as const, fps: projectFps },
    sourceBinding,
    timelineStartFrame,
    sourceStartFrame,
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
  if (binding.sourceCadence.kind === 'VFR') {
    return frozen({ disposition: 'UNVERIFIABLE' as const, reason: 'VFR_INDEX_REQUIRED' as const });
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
    || value.rendererMappingVersion !== VIDEO_RETIME_RENDERER_MAPPING_VERSION_V1
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
