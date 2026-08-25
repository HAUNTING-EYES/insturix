import type {
  Keyframe,
  KeyframeTrack,
  Overlay,
} from '@/components/editron/editor/version-7.0.0/types';

export const VIDEO_SOURCE_RANGE_RETIME_KIND_V1 =
  'EDITRON_VIDEO_SOURCE_RANGE_RETIME_V1' as const;

export type VideoSourceRangeRetimeSafeStopReasonV1 =
  | 'TARGET_VIDEO_NOT_FOUND'
  | 'SOURCE_RANGE_MISMATCH'
  | 'EXISTING_RETIME_STATE'
  | 'EXISTING_LOCAL_KEYFRAMES'
  | 'NON_INTEGRAL_OUTPUT_DURATION'
  | 'OVERLAPPING_DEPENDENT_OVERLAY';

export interface VideoSourceRangeRetimeEffectV1 {
  schemaVersion: 1;
  kind: typeof VIDEO_SOURCE_RANGE_RETIME_KIND_V1;
  overlayId: number;
  sourceStartFrame: number;
  sourceEndFrameExclusive: number;
  beforeTimelineRange: Readonly<{ startFrame: number; endFrame: number }>;
  afterTimelineRange: Readonly<{ startFrame: number; endFrame: number }>;
  shiftedBeforeRange: Readonly<{ startFrame: number; endFrame: number }> | null;
  shiftedAfterRange: Readonly<{ startFrame: number; endFrame: number }> | null;
  beforeProjectDurationInFrames: number;
  afterProjectDurationInFrames: number;
  playbackRate: number;
  deltaFrames: number;
  affectedOverlayIds: readonly number[];
}

export type VideoSourceRangeRetimeResultV1 =
  | Readonly<{
      disposition: 'APPLIED';
      overlays: Overlay[];
      speedCurve: Keyframe[];
      keyframeTracks: KeyframeTrack[];
      effect: VideoSourceRangeRetimeEffectV1;
    }>
  | Readonly<{
      disposition: 'SAFE_STOP';
      reason: VideoSourceRangeRetimeSafeStopReasonV1;
    }>;

/**
 * Pure, bounded source-preserving retime for one isolated whole video overlay.
 * ProjectService owns the later CAS, source binding, receipt and conflict
 * checks. This owner never guesses how to reconform overlapping tracks.
 */
export function retimeIsolatedVideoSourceRangeV1(input: Readonly<{
  overlays: readonly Overlay[];
  projectDurationInFrames: number;
  overlayId: number;
  verifiedSourceStartFrame: number;
  verifiedSourceEndFrameExclusive: number;
  playbackRate: number;
}>): VideoSourceRangeRetimeResultV1 {
  const projectDuration = positiveInteger(
    input.projectDurationInFrames,
    'VIDEO_SOURCE_RANGE_RETIME_PROJECT_DURATION_INVALID',
  );
  const overlayId = nonNegativeInteger(
    input.overlayId,
    'VIDEO_SOURCE_RANGE_RETIME_OVERLAY_ID_INVALID',
  );
  const sourceStartFrame = nonNegativeInteger(
    input.verifiedSourceStartFrame,
    'VIDEO_SOURCE_RANGE_RETIME_SOURCE_START_INVALID',
  );
  const sourceEndFrameExclusive = positiveInteger(
    input.verifiedSourceEndFrameExclusive,
    'VIDEO_SOURCE_RANGE_RETIME_SOURCE_END_INVALID',
  );
  const playbackRate = finitePlaybackRate(input.playbackRate);
  if (sourceEndFrameExclusive <= sourceStartFrame) {
    throw new RangeError('VIDEO_SOURCE_RANGE_RETIME_SOURCE_RANGE_INVALID');
  }

  const target = input.overlays.find((overlay) => overlay.id === overlayId);
  if (!target || target.type !== 'video') {
    return { disposition: 'SAFE_STOP', reason: 'TARGET_VIDEO_NOT_FOUND' };
  }
  const targetStart = nonNegativeInteger(
    target.from,
    'VIDEO_SOURCE_RANGE_RETIME_TARGET_START_INVALID',
  );
  const targetDuration = positiveInteger(
    target.durationInFrames,
    'VIDEO_SOURCE_RANGE_RETIME_TARGET_DURATION_INVALID',
  );
  const targetEnd = targetStart + targetDuration;
  if (!Number.isSafeInteger(targetEnd) || targetEnd > projectDuration) {
    throw new RangeError('VIDEO_SOURCE_RANGE_RETIME_TARGET_RANGE_INVALID');
  }

  const overlaySourceStart = exactOptionalSourceStart(target);
  const overlaySourceEnd = exactOptionalSourceEnd(target);
  if ((overlaySourceStart !== null && overlaySourceStart !== sourceStartFrame)
    || (overlaySourceEnd !== null && overlaySourceEnd !== sourceEndFrameExclusive)
    || sourceEndFrameExclusive - sourceStartFrame !== targetDuration) {
    return { disposition: 'SAFE_STOP', reason: 'SOURCE_RANGE_MISMATCH' };
  }
  if ((target.speed ?? 1) !== 1
    || (Array.isArray(target.speedCurve) && target.speedCurve.length > 0)) {
    return { disposition: 'SAFE_STOP', reason: 'EXISTING_RETIME_STATE' };
  }
  if (Array.isArray(target.keyframeTracks) && target.keyframeTracks.length > 0) {
    return { disposition: 'SAFE_STOP', reason: 'EXISTING_LOCAL_KEYFRAMES' };
  }

  const exactOutputDuration = targetDuration / playbackRate;
  if (!Number.isSafeInteger(exactOutputDuration) || exactOutputDuration < 2) {
    return { disposition: 'SAFE_STOP', reason: 'NON_INTEGRAL_OUTPUT_DURATION' };
  }
  const outputDuration = exactOutputDuration;
  const deltaFrames = outputDuration - targetDuration;
  const afterTargetEnd = targetStart + outputDuration;
  const afterProjectDuration = projectDuration + deltaFrames;
  if (afterProjectDuration <= 0 || !Number.isSafeInteger(afterProjectDuration)) {
    throw new RangeError('VIDEO_SOURCE_RANGE_RETIME_OUTPUT_DURATION_INVALID');
  }

  const overlappingDependency = input.overlays.some((overlay) => {
    if (overlay.id === overlayId) return false;
    const start = finiteIntegerOrNull(overlay.from);
    const duration = finiteIntegerOrNull(overlay.durationInFrames);
    if (start === null || duration === null || duration <= 0) return true;
    return start < targetEnd && targetStart < start + duration;
  });
  if (overlappingDependency) {
    return { disposition: 'SAFE_STOP', reason: 'OVERLAPPING_DEPENDENT_OVERLAY' };
  }

  const speedCurve: Keyframe[] = [
    { frame: 0, value: playbackRate, easing: 'linear' },
    { frame: outputDuration - 1, value: playbackRate, easing: 'linear' },
  ];
  const keyframeTracks: KeyframeTrack[] = [{
    property: 'speed',
    keyframes: speedCurve.map((point) => ({ ...point })),
  }];
  const affectedOverlayIds: number[] = [];
  const overlays = input.overlays.map((overlay) => {
    if (overlay.id === overlayId) {
      affectedOverlayIds.push(overlay.id);
      const updated = structuredClone(target);
      updated.durationInFrames = outputDuration;
      updated.sourceStartFrame = sourceStartFrame;
      updated.videoStartTime = sourceStartFrame;
      updated.sourceEndFrame = sourceEndFrameExclusive;
      updated.speedCurve = speedCurve.map((point) => ({ ...point }));
      updated.keyframeTracks = keyframeTracks.map((track) => ({
        ...track,
        keyframes: track.keyframes.map((point) => ({ ...point })),
      }));
      delete updated.speed;
      return updated;
    }
    if (overlay.from >= targetEnd) {
      affectedOverlayIds.push(overlay.id);
      return shiftOverlay(overlay, deltaFrames);
    }
    return structuredClone(overlay);
  });

  return {
    disposition: 'APPLIED',
    overlays,
    speedCurve,
    keyframeTracks,
    effect: {
      schemaVersion: 1,
      kind: VIDEO_SOURCE_RANGE_RETIME_KIND_V1,
      overlayId,
      sourceStartFrame,
      sourceEndFrameExclusive,
      beforeTimelineRange: { startFrame: targetStart, endFrame: targetEnd },
      afterTimelineRange: { startFrame: targetStart, endFrame: afterTargetEnd },
      shiftedBeforeRange: targetEnd < projectDuration
        ? { startFrame: targetEnd, endFrame: projectDuration }
        : null,
      shiftedAfterRange: afterTargetEnd < afterProjectDuration
        ? { startFrame: afterTargetEnd, endFrame: afterProjectDuration }
        : null,
      beforeProjectDurationInFrames: projectDuration,
      afterProjectDurationInFrames: afterProjectDuration,
      playbackRate,
      deltaFrames,
      affectedOverlayIds,
    },
  };
}

function shiftOverlay(overlay: Overlay, deltaFrames: number): Overlay {
  const shifted = structuredClone(overlay) as Overlay & {
    audioStartFrame?: number;
    audioEndFrame?: number;
  };
  shifted.from += deltaFrames;
  if (typeof shifted.audioStartFrame === 'number') shifted.audioStartFrame += deltaFrames;
  if (typeof shifted.audioEndFrame === 'number') shifted.audioEndFrame += deltaFrames;
  return shifted;
}

function exactOptionalSourceStart(overlay: Overlay & {
  sourceStartFrame?: number;
  videoStartTime?: number;
}): number | null {
  const values = [overlay.sourceStartFrame, overlay.videoStartTime]
    .filter((value): value is number => value !== undefined);
  if (values.length === 0) return null;
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)
    || values.some((value) => value !== values[0])) {
    return Number.NaN;
  }
  return values[0]!;
}

function exactOptionalSourceEnd(overlay: Overlay & { sourceEndFrame?: number }): number | null {
  if (overlay.sourceEndFrame === undefined) return null;
  return Number.isSafeInteger(overlay.sourceEndFrame) && overlay.sourceEndFrame > 0
    ? overlay.sourceEndFrame
    : Number.NaN;
}

function finiteIntegerOrNull(value: unknown): number | null {
  return Number.isSafeInteger(value) ? value as number : null;
}

function nonNegativeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(code);
  return value;
}

function positiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(code);
  return value;
}

function finitePlaybackRate(value: number): number {
  if (!Number.isFinite(value) || value <= 1 || value > 4) {
    throw new RangeError('VIDEO_SOURCE_RANGE_RETIME_PLAYBACK_RATE_INVALID');
  }
  return value;
}
