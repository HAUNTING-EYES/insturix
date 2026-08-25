import {
  computeSpeedSegments,
  evaluateKeyframeTrack,
} from '@/lib/editron/utils/keyframe-math';
import type {
  Keyframe,
  KeyframeTrack,
} from '@/components/editron/editor/version-7.0.0/types';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import {
  countCaptionReadabilityViolations,
  normalizeCaptionGroupsForReadability,
  parseCaptionReadabilityTimingPolicy,
} from './caption-readability-contract';

type OverlayRecord = Record<string, any>;

export interface TimelineFrameRangeV1 {
  startFrame: number;
  endFrame: number;
}

export interface TimelineRangeCutCoordinateTransformV1 {
  schemaVersion: 'EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1';
  beforeDurationInFrames: number;
  afterDurationInFrames: number;
  removedRange: TimelineFrameRangeV1;
  shiftAfterRemovedRangeFrames: number;
  mapRule: 'HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1';
}

export interface TimelineRangeCutSplitChildV1 {
  beforeOverlayId: number;
  leftOverlayId: number;
  rightOverlayId: number;
  overlayType: 'video' | 'sound';
  assetId?: string;
  leftBeforeTimelineRange: TimelineFrameRangeV1;
  leftAfterTimelineRange: TimelineFrameRangeV1;
  rightBeforeTimelineRange: TimelineFrameRangeV1;
  rightAfterTimelineRange: TimelineFrameRangeV1;
  rightTimelineStartFrame: number;
  rightSourceCoordinateField: 'sourceStartFrame' | 'startFromSound';
  rightSourceStartFrame: number;
}

export interface TimelineRangeCutResult {
  overlays: OverlayRecord[];
  deleted: number;
  trimmed: number;
  shifted: number;
  split: number;
  created: number;
  framesCut: number;
  newDurationInFrames: number;
  timelineCoordinateTransform: TimelineRangeCutCoordinateTransformV1;
  splitChildren: TimelineRangeCutSplitChildV1[];
}

export function mapTimelineFrameAfterRangeCutV1(
  transform: TimelineRangeCutCoordinateTransformV1,
  beforeTimelineFrame: number,
): number | null {
  const sourceFrame = exactIntegerFrame(beforeTimelineFrame, 'beforeTimelineFrame');
  if (sourceFrame < 0 || sourceFrame >= transform.beforeDurationInFrames) {
    throw new RangeError(
      `beforeTimelineFrame ${sourceFrame} is outside 0-${transform.beforeDurationInFrames - 1}`,
    );
  }
  if (sourceFrame < transform.removedRange.startFrame) return sourceFrame;
  if (sourceFrame >= transform.removedRange.endFrame) {
    return sourceFrame + transform.shiftAfterRemovedRangeFrames;
  }
  return null;
}

export function mapTimelineRangeAfterRangeCutV1(
  transform: TimelineRangeCutCoordinateTransformV1,
  beforeTimelineRange: TimelineFrameRangeV1,
): TimelineFrameRangeV1 | null {
  const startFrame = exactIntegerFrame(beforeTimelineRange.startFrame, 'beforeTimelineRange.startFrame');
  const endFrame = exactIntegerFrame(beforeTimelineRange.endFrame, 'beforeTimelineRange.endFrame');
  if (startFrame < 0 || endFrame <= startFrame || endFrame > transform.beforeDurationInFrames) {
    throw new RangeError(`Invalid before-timeline range ${startFrame}-${endFrame}`);
  }
  if (endFrame <= transform.removedRange.startFrame) return { startFrame, endFrame };
  if (startFrame >= transform.removedRange.endFrame) {
    return {
      startFrame: startFrame + transform.shiftAfterRemovedRangeFrames,
      endFrame: endFrame + transform.shiftAfterRemovedRangeFrames,
    };
  }
  return null;
}

export function cutTimelineRange(input: {
  overlays: readonly OverlayRecord[];
  startFrame: number;
  endFrame: number;
  fps: number;
  durationInFrames: number;
}): TimelineRangeCutResult {
  const startFrame = integerFrame(input.startFrame, 'startFrame');
  const endFrame = integerFrame(input.endFrame, 'endFrame');
  const fps = positiveNumber(input.fps, 'fps');
  const durationInFrames = integerFrame(input.durationInFrames, 'durationInFrames');

  if (startFrame < 0) throw new RangeError('startFrame must be at least 0');
  if (endFrame <= startFrame) throw new RangeError('endFrame must be greater than startFrame');
  if (endFrame > durationInFrames) {
    throw new RangeError(`Cut range ${startFrame}-${endFrame} exceeds project duration ${durationInFrames}`);
  }

  const framesCut = endFrame - startFrame;
  const nextId = createOverlayIdAllocator(input.overlays);
  const output: OverlayRecord[] = [];
  const splitRightIds = new Map<string, number>();
  const splitChildren: TimelineRangeCutSplitChildV1[] = [];
  let deleted = 0;
  let trimmed = 0;
  let shifted = 0;
  let split = 0;
  let created = 0;

  for (const source of input.overlays) {
    const overlay = structuredClone(source);
    const overlayStart = frame(overlay.from);
    const overlayDuration = Math.max(0, frame(overlay.durationInFrames));
    const overlayEnd = overlayStart + overlayDuration;

    if (overlayDuration <= 0 || overlayEnd <= startFrame) {
      output.push(overlay);
      continue;
    }

    if (overlayStart >= endFrame) {
      output.push(shiftOverlay(overlay, -framesCut));
      shifted += 1;
      continue;
    }

    if (overlayStart >= startFrame && overlayEnd <= endFrame) {
      deleted += 1;
      continue;
    }

    if (isTransition(overlay)) {
      // A transition touching a removed boundary no longer has trustworthy clip
      // ownership. The boundary planner may recreate it from the new cut.
      deleted += 1;
      continue;
    }

    if (isCaption(overlay)) {
      const remapped = remapCaptionOverlay({
        overlay,
        startFrame,
        endFrame,
        fps,
      });
      if (remapped) {
        output.push(remapped);
        trimmed += 1;
      } else {
        deleted += 1;
      }
      continue;
    }

    if (overlayStart < startFrame && overlayEnd > endFrame && isSourceBoundMedia(overlay)) {
      const localCutStart = startFrame - overlayStart;
      const localCutEnd = endFrame - overlayStart;
      const left = sliceSourceBoundOverlay(overlay, {
        sourceLocalStart: 0,
        sourceLocalEnd: localCutStart,
        timelineFrom: overlayStart,
      });
      const rightId = nextId();
      const right = sliceSourceBoundOverlay(
        { ...overlay, id: rightId },
        {
          sourceLocalStart: localCutEnd,
          sourceLocalEnd: overlayDuration,
          timelineFrom: startFrame,
        },
      );
      output.push(left, right);
      splitRightIds.set(String(overlay.id), rightId);
      splitChildren.push(buildSplitChildMapping({
        before: overlay,
        left,
        right,
        cutStartFrame: startFrame,
        cutEndFrame: endFrame,
      }));
      trimmed += 1;
      split += 1;
      created += 1;
      continue;
    }

    if (overlayStart < startFrame && overlayEnd > endFrame) {
      output.push(compressOverlayAcrossRange(overlay, {
        localCutStart: startFrame - overlayStart,
        localCutEnd: endFrame - overlayStart,
      }));
      trimmed += 1;
      continue;
    }

    if (overlayStart < startFrame && overlayEnd > startFrame) {
      output.push(trimOverlayEnd(overlay, startFrame - overlayStart));
      trimmed += 1;
      continue;
    }

    if (overlayStart < endFrame && overlayEnd > endFrame) {
      const localTrimStart = endFrame - overlayStart;
      output.push(
        isSourceBoundMedia(overlay)
          ? sliceSourceBoundOverlay(overlay, {
              sourceLocalStart: localTrimStart,
              sourceLocalEnd: overlayDuration,
              timelineFrom: startFrame,
            })
          : trimOverlayStart(overlay, localTrimStart, startFrame),
      );
      trimmed += 1;
      continue;
    }

    output.push(overlay);
  }

  rewriteSplitTransitionReferences(output, splitRightIds, startFrame);
  output.sort((left, right) => frame(left.from) - frame(right.from) || frame(left.row) - frame(right.row));

  return {
    overlays: output,
    deleted,
    trimmed,
    shifted,
    split,
    created,
    framesCut,
    newDurationInFrames: Math.max(0, durationInFrames - framesCut),
    timelineCoordinateTransform: {
      schemaVersion: 'EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1',
      beforeDurationInFrames: durationInFrames,
      afterDurationInFrames: Math.max(0, durationInFrames - framesCut),
      removedRange: { startFrame, endFrame },
      shiftAfterRemovedRangeFrames: -framesCut,
      mapRule: 'HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1',
    },
    splitChildren,
  };
}

function buildSplitChildMapping(input: {
  before: OverlayRecord;
  left: OverlayRecord;
  right: OverlayRecord;
  cutStartFrame: number;
  cutEndFrame: number;
}): TimelineRangeCutSplitChildV1 {
  const beforeOverlayId = requireOverlayId(input.before.id, 'before overlay');
  const leftOverlayId = requireOverlayId(input.left.id, 'left split child');
  const rightOverlayId = requireOverlayId(input.right.id, 'right split child');
  const beforeStartFrame = frame(input.before.from);
  const beforeEndFrame = beforeStartFrame + Math.max(0, frame(input.before.durationInFrames));
  const rightAfterStartFrame = frame(input.right.from);
  const rightAfterEndFrame = rightAfterStartFrame + Math.max(0, frame(input.right.durationInFrames));
  const overlayType = input.before.type === 'video' ? 'video' : 'sound';
  const rightSourceCoordinateField = overlayType === 'video'
    ? 'sourceStartFrame'
    : 'startFromSound';
  const assetId = typeof input.before.assetId === 'string' && input.before.assetId.length > 0
    ? input.before.assetId
    : undefined;

  return {
    beforeOverlayId,
    leftOverlayId,
    rightOverlayId,
    overlayType,
    ...(assetId ? { assetId } : {}),
    leftBeforeTimelineRange: {
      startFrame: beforeStartFrame,
      endFrame: input.cutStartFrame,
    },
    leftAfterTimelineRange: {
      startFrame: frame(input.left.from),
      endFrame: frame(input.left.from) + Math.max(0, frame(input.left.durationInFrames)),
    },
    rightBeforeTimelineRange: {
      startFrame: input.cutEndFrame,
      endFrame: beforeEndFrame,
    },
    rightAfterTimelineRange: {
      startFrame: rightAfterStartFrame,
      endFrame: rightAfterEndFrame,
    },
    rightTimelineStartFrame: rightAfterStartFrame,
    rightSourceCoordinateField,
    rightSourceStartFrame: frame(input.right[rightSourceCoordinateField]),
  };
}

function sliceSourceBoundOverlay(
  overlay: OverlayRecord,
  slice: {
    sourceLocalStart: number;
    sourceLocalEnd: number;
    timelineFrom: number;
  },
): OverlayRecord {
  const next = structuredClone(overlay);
  const originalDuration = Math.max(1, frame(overlay.durationInFrames));
  const localStart = Math.max(0, Math.min(originalDuration, slice.sourceLocalStart));
  const localEnd = Math.max(localStart, Math.min(originalDuration, slice.sourceLocalEnd));
  next.from = slice.timelineFrom;
  next.durationInFrames = localEnd - localStart;
  setOptionalKeyframeTracks(
    next,
    sliceKeyframeTracks(overlay.keyframeTracks, localStart, localEnd),
  );

  if (overlay.type === 'video') {
    const sourceOffset = frame(overlay.sourceStartFrame ?? overlay.videoStartTime);
    const sourceAdvance = sourceFramesConsumed(overlay, localStart);
    next.sourceStartFrame = sourceOffset + sourceAdvance;
    next.videoStartTime = next.sourceStartFrame;
    next.sourceEndFrame = sourceOffset + sourceFramesConsumed(overlay, localEnd);
    if (Array.isArray(overlay.speedCurve) && overlay.speedCurve.length > 1) {
      next.speedCurve = sliceStepCurve(overlay.speedCurve, localStart, localEnd);
    }
  } else if (overlay.type === 'sound') {
    const playbackRate = positiveFinite(overlay.playbackRate) ?? 1;
    next.startFromSound = frame(overlay.startFromSound) + Math.round(localStart * playbackRate);
    if (overlay.audioStartFrame != null) next.audioStartFrame = slice.timelineFrom;
    if (overlay.audioEndFrame != null) next.audioEndFrame = slice.timelineFrom + next.durationInFrames;
  }

  return next;
}

function compressOverlayAcrossRange(
  overlay: OverlayRecord,
  range: { localCutStart: number; localCutEnd: number },
): OverlayRecord {
  const next = structuredClone(overlay);
  const removed = range.localCutEnd - range.localCutStart;
  next.durationInFrames = Math.max(0, frame(overlay.durationInFrames) - removed);
  setOptionalKeyframeTracks(
    next,
    spliceKeyframeTracks(
      overlay.keyframeTracks,
      range.localCutStart,
      range.localCutEnd,
    ),
  );
  if (next.audioEndFrame != null) next.audioEndFrame = frame(next.audioEndFrame) - removed;
  return next;
}

function trimOverlayEnd(overlay: OverlayRecord, durationInFrames: number): OverlayRecord {
  const next = structuredClone(overlay);
  next.durationInFrames = Math.max(0, durationInFrames);
  setOptionalKeyframeTracks(
    next,
    sliceKeyframeTracks(overlay.keyframeTracks, 0, next.durationInFrames),
  );
  if (next.type === 'video' && next.sourceEndFrame != null) {
    const sourceStartFrame = frame(next.sourceStartFrame ?? next.videoStartTime);
    next.sourceEndFrame = sourceStartFrame + sourceFramesConsumed(overlay, next.durationInFrames);
  }
  if (next.audioEndFrame != null) next.audioEndFrame = next.from + next.durationInFrames;
  return next;
}

function trimOverlayStart(
  overlay: OverlayRecord,
  localTrimStart: number,
  timelineFrom: number,
): OverlayRecord {
  const next = structuredClone(overlay);
  const oldDuration = Math.max(0, frame(overlay.durationInFrames));
  next.from = timelineFrom;
  next.durationInFrames = Math.max(0, oldDuration - localTrimStart);
  setOptionalKeyframeTracks(
    next,
    sliceKeyframeTracks(overlay.keyframeTracks, localTrimStart, oldDuration),
  );
  if (next.audioStartFrame != null) next.audioStartFrame = timelineFrom;
  if (next.audioEndFrame != null) next.audioEndFrame = timelineFrom + next.durationInFrames;
  return next;
}

function shiftOverlay(overlay: OverlayRecord, deltaFrames: number): OverlayRecord {
  const next = structuredClone(overlay);
  next.from = Math.max(0, frame(overlay.from) + deltaFrames);
  if (next.audioStartFrame != null) next.audioStartFrame = Math.max(0, frame(next.audioStartFrame) + deltaFrames);
  if (next.audioEndFrame != null) next.audioEndFrame = Math.max(0, frame(next.audioEndFrame) + deltaFrames);
  return next;
}

function remapCaptionOverlay(input: {
  overlay: OverlayRecord;
  startFrame: number;
  endFrame: number;
  fps: number;
}): OverlayRecord | null {
  const overlay = structuredClone(input.overlay);
  const oldFrom = frame(overlay.from);
  const oldEnd = oldFrom + Math.max(0, frame(overlay.durationInFrames));
  const cutDuration = input.endFrame - input.startFrame;
  const newFrom = oldFrom >= input.endFrame
    ? oldFrom - cutDuration
    : oldFrom >= input.startFrame
      ? input.startFrame
      : oldFrom;
  const newEnd = oldEnd <= input.startFrame
    ? oldEnd
    : oldEnd <= input.endFrame
      ? input.startFrame
      : oldEnd - cutDuration;
  if (newEnd <= newFrom) return null;

  const remapWord = (word: OverlayRecord): OverlayRecord | null => {
    const startMs = finiteNumber(word.startMs);
    const endMs = finiteNumber(word.endMs);
    if (startMs == null || endMs == null || endMs <= startMs) return null;
    const globalStart = oldFrom + Math.round((startMs / 1000) * input.fps);
    const globalEnd = oldFrom + Math.round((endMs / 1000) * input.fps);
    if (globalEnd > input.startFrame && globalStart < input.endFrame) return null;
    const mappedStart = mapFrameAfterCut(globalStart, input.startFrame, input.endFrame);
    const mappedEnd = mapFrameAfterCut(globalEnd, input.startFrame, input.endFrame);
    return {
      ...word,
      startMs: framesToMs(Math.max(0, mappedStart - newFrom), input.fps),
      endMs: framesToMs(Math.max(mappedStart + 1, mappedEnd) - newFrom, input.fps),
    };
  };

  if (Array.isArray(overlay.words)) {
    overlay.words = overlay.words.flatMap((word: unknown) => {
      const mapped = remapWord(asRecord(word));
      return mapped ? [mapped] : [];
    });
  }

  if (Array.isArray(overlay.captions)) {
    overlay.captions = overlay.captions.flatMap((captionValue: unknown) => {
      const caption = asRecord(captionValue);
      const words = Array.isArray(caption.words)
        ? caption.words.flatMap((word: unknown) => {
            const mapped = remapWord(asRecord(word));
            return mapped ? [mapped] : [];
          })
        : [];
      if (Array.isArray(caption.words) && words.length === 0) return [];
      if (words.length > 0) {
        return [{
          ...caption,
          words,
          text: words.map((word) => String(word.word ?? word.text ?? '').trim()).filter(Boolean).join(' '),
          startMs: Math.min(...words.map((word) => Number(word.startMs))),
          endMs: Math.max(...words.map((word) => Number(word.endMs))),
        }];
      }
      const mapped = remapWord(caption);
      return mapped ? [{ ...caption, startMs: mapped.startMs, endMs: mapped.endMs }] : [];
    });
  }

  overlay.from = newFrom;
  overlay.durationInFrames = newEnd - newFrom;
  const readability = parseCaptionReadabilityTimingPolicy(
    overlay.metadata?.evidence?.readability,
  );
  if (readability && Array.isArray(overlay.captions)) {
    const beforeGroupCount = overlay.captions.length;
    const beforeViolationCount = countCaptionReadabilityViolations(
      overlay.captions,
      readability,
    );
    overlay.captions = normalizeCaptionGroupsForReadability(
      overlay.captions,
      readability,
      framesToMs(overlay.durationInFrames, input.fps),
    );
    overlay.metadata = {
      ...asRecord(overlay.metadata),
      evidence: {
        ...asRecord(overlay.metadata?.evidence),
        timelineReadabilityRepair: {
          version: 'caption-timeline-readability-repair-v1',
          beforeGroupCount,
          afterGroupCount: overlay.captions.length,
          beforeViolationCount,
          afterViolationCount: countCaptionReadabilityViolations(
            overlay.captions,
            readability,
          ),
        },
      },
    };
  }
  setOptionalKeyframeTracks(
    overlay,
    spliceKeyframeTracks(
      overlay.keyframeTracks,
      Math.max(0, input.startFrame - oldFrom),
      Math.max(0, input.endFrame - oldFrom),
    ),
  );
  return overlay;
}

function setOptionalKeyframeTracks(
  overlay: OverlayRecord,
  tracks: KeyframeTrack[] | undefined,
): void {
  if (tracks === undefined) {
    delete overlay.keyframeTracks;
    return;
  }
  overlay.keyframeTracks = tracks;
}

function sourceFramesConsumed(overlay: OverlayRecord, localEndFrame: number): number {
  if (Array.isArray(overlay.speedCurve) && overlay.speedCurve.length > 1) {
    const sourceStartFrame = frame(overlay.sourceStartFrame ?? overlay.videoStartTime);
    const explicitSourceEndFrame = Number.isSafeInteger(overlay.sourceEndFrame)
      ? frame(overlay.sourceEndFrame)
      : null;
    const availableSourceFrames = explicitSourceEndFrame != null
      && explicitSourceEndFrame > sourceStartFrame
      ? explicitSourceEndFrame - sourceStartFrame
      : Math.max(1, frame(overlay.durationInFrames));
    const segments = computeSpeedSegments(
      overlay.speedCurve as Keyframe[],
      Math.max(1, frame(overlay.durationInFrames)),
      availableSourceFrames,
    );
    return Math.round(segments.reduce((total, segment) => {
      const overlap = Math.max(
        0,
        Math.min(localEndFrame, segment.compositionEndFrame) - segment.compositionStartFrame,
      );
      return total + overlap * segment.playbackRate;
    }, 0));
  }
  return Math.round(localEndFrame * (positiveFinite(overlay.speed) ?? 1));
}

function sliceKeyframeTracks(
  value: unknown,
  localStart: number,
  localEnd: number,
): KeyframeTrack[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const duration = Math.max(0, localEnd - localStart);
  return (value as KeyframeTrack[]).map((track) => {
    const keyframes = [
      boundaryKeyframe(track, localStart, 0),
      ...track.keyframes
        .filter((keyframe) => keyframe.frame > localStart && keyframe.frame < localEnd)
        .map((keyframe) => ({ ...keyframe, frame: keyframe.frame - localStart })),
      ...(duration > 1 ? [boundaryKeyframe(track, localEnd - 1, duration - 1)] : []),
    ];
    return { ...track, keyframes: dedupeKeyframes(keyframes) };
  });
}

function spliceKeyframeTracks(
  value: unknown,
  localCutStart: number,
  localCutEnd: number,
): KeyframeTrack[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const removed = Math.max(0, localCutEnd - localCutStart);
  return (value as KeyframeTrack[]).map((track) => {
    const before = track.keyframes.filter((keyframe) => keyframe.frame < localCutStart);
    const after = track.keyframes
      .filter((keyframe) => keyframe.frame >= localCutEnd)
      .map((keyframe) => ({ ...keyframe, frame: keyframe.frame - removed }));
    const seam = [
      ...(localCutStart > 0 ? [boundaryKeyframe(track, localCutStart - 1, localCutStart - 1)] : []),
      boundaryKeyframe(track, localCutEnd, localCutStart),
    ];
    return { ...track, keyframes: dedupeKeyframes([...before, ...seam, ...after]) };
  });
}

function sliceStepCurve(value: Keyframe[], localStart: number, localEnd: number): Keyframe[] {
  const sorted = [...value].sort((left, right) => left.frame - right.frame);
  const active = [...sorted].reverse().find((keyframe) => keyframe.frame <= localStart) ?? sorted[0];
  return dedupeKeyframes([
    { ...active, frame: 0 },
    ...sorted
      .filter((keyframe) => keyframe.frame > localStart && keyframe.frame < localEnd)
      .map((keyframe) => ({ ...keyframe, frame: keyframe.frame - localStart })),
  ]);
}

function boundaryKeyframe(track: KeyframeTrack, sourceFrame: number, targetFrame: number): Keyframe {
  const source = [...track.keyframes]
    .sort((left, right) => left.frame - right.frame)
    .reverse()
    .find((keyframe) => keyframe.frame <= sourceFrame);
  return {
    frame: Math.max(0, targetFrame),
    value: evaluateKeyframeTrack(track, Math.max(0, sourceFrame)),
    easing: source?.easing ?? 'linear',
  };
}

function dedupeKeyframes<T extends Keyframe>(keyframes: T[]): T[] {
  const byFrame = new Map<number, T>();
  for (const keyframe of keyframes.sort((left, right) => left.frame - right.frame)) {
    const normalized = Math.max(0, frame(keyframe.frame));
    byFrame.set(normalized, { ...keyframe, frame: normalized });
  }
  return Array.from(byFrame.values()).sort((left, right) => left.frame - right.frame);
}

function rewriteSplitTransitionReferences(
  overlays: OverlayRecord[],
  splitRightIds: Map<string, number>,
  cutStartFrame: number,
): void {
  for (const overlay of overlays) {
    if (!isTransition(overlay) || frame(overlay.from) < cutStartFrame) continue;
    for (const key of ['clipAId', 'clipBId']) {
      const replacement = splitRightIds.get(String(overlay[key] ?? ''));
      if (replacement != null) overlay[key] = replacement;
    }
  }
}

function isSourceBoundMedia(overlay: OverlayRecord): boolean {
  if (overlay.type === 'video') return true;
  if (overlay.type !== 'sound') return false;
  const assetId = String(overlay.assetId ?? '').toLowerCase();
  const role = String(overlay.metadata?.role ?? overlay.metadata?.audioRole ?? '').toLowerCase();
  return overlay.row === ROW.VOICEOVER
    || overlay.row === 4
    || assetId.startsWith('voiceover_')
    || assetId.startsWith('vo_')
    || ['voiceover', 'dialogue', 'narration'].includes(role);
}

function isCaption(overlay: OverlayRecord): boolean {
  return overlay.type === 'caption' || overlay.type === 'captions';
}

function isTransition(overlay: OverlayRecord): boolean {
  return overlay.type === 'transition';
}

function mapFrameAfterCut(value: number, startFrame: number, endFrame: number): number {
  if (value <= startFrame) return value;
  if (value >= endFrame) return value - (endFrame - startFrame);
  return startFrame;
}

function createOverlayIdAllocator(overlays: readonly OverlayRecord[]): () => number {
  let next = Math.max(0, ...overlays.map((overlay) => finiteNumber(overlay.id) ?? 0)) + 1;
  return () => next++;
}

function framesToMs(value: number, fps: number): number {
  return Math.round((value / fps) * 1000);
}

function asRecord(value: unknown): OverlayRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as OverlayRecord
    : {};
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveFinite(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function frame(value: unknown): number {
  return Math.round(finiteNumber(value) ?? 0);
}

function exactIntegerFrame(value: unknown, name: string): number {
  const number = finiteNumber(value);
  if (number == null || !Number.isInteger(number)) {
    throw new TypeError(`${name} must be an integer frame`);
  }
  return number;
}

function requireOverlayId(value: unknown, name: string): number {
  const id = finiteNumber(value);
  if (id == null || !Number.isSafeInteger(id) || id < 0) {
    throw new TypeError(`${name} must have a non-negative safe-integer id`);
  }
  return id;
}

function integerFrame(value: unknown, name: string): number {
  const number = finiteNumber(value);
  if (number == null) throw new TypeError(`${name} must be a finite number`);
  return Math.round(number);
}

function positiveNumber(value: unknown, name: string): number {
  const number = finiteNumber(value);
  if (number == null || number <= 0) throw new TypeError(`${name} must be a positive finite number`);
  return number;
}
