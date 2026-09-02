import type {
  Keyframe,
  KeyframeTrack,
} from '@/components/editron/editor/version-7.0.0/types';

type EasingFunction = (progress: number) => number;

const ease = cubicBezier(0.42, 0, 1, 1);
const EASING_MAP: Record<Keyframe['easing'], EasingFunction> = {
  linear: (progress) => progress,
  'ease-in': ease,
  'ease-out': (progress) => 1 - ease(1 - progress),
  'ease-in-out': (progress) => (
    progress < 0.5
      ? ease(progress * 2) / 2
      : 1 - ease((1 - progress) * 2) / 2
  ),
  'snap-out': (progress) => 1 - ((1 - progress) ** 4),
};

export interface SpeedSegment {
  compositionStartFrame: number;
  compositionEndFrame: number;
  playbackRate: number;
  sourceStartFrame: number;
}

export function evaluateKeyframeTrack(
  track: KeyframeTrack,
  localFrame: number,
): number {
  const sorted = [...(track.keyframes ?? [])].sort((left, right) => left.frame - right.frame);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1 || localFrame <= sorted[0].frame) return sorted[0].value;
  if (localFrame >= sorted[sorted.length - 1].frame) return sorted[sorted.length - 1].value;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index];
    const to = sorted[index + 1];
    if (localFrame < from.frame || localFrame > to.frame) continue;
    const frameSpan = to.frame - from.frame;
    if (frameSpan <= 0) return to.value;
    const progress = clamp01((localFrame - from.frame) / frameSpan);
    const eased = (EASING_MAP[from.easing] ?? EASING_MAP.linear)(progress);
    return from.value + ((to.value - from.value) * eased);
  }

  return sorted[sorted.length - 1].value;
}

export function evaluateAllTracks(
  tracks: KeyframeTrack[],
  localFrame: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const track of tracks) {
    if (track.keyframes?.length > 0) {
      result[track.property] = evaluateKeyframeTrack(track, localFrame);
    }
  }
  return result;
}

export function computeSpeedSegments(
  speedCurve: Keyframe[],
  totalDurationFrames: number,
  availableSourceFrames: number = totalDurationFrames,
): SpeedSegment[] {
  if (!Number.isFinite(totalDurationFrames) || totalDurationFrames < 0) {
    throw new RangeError('totalDurationFrames must be a non-negative finite number');
  }
  if (!Number.isFinite(availableSourceFrames) || availableSourceFrames < 0) {
    throw new RangeError('availableSourceFrames must be a non-negative finite number');
  }
  if (!speedCurve || speedCurve.length === 0) {
    return [{
      compositionStartFrame: 0,
      compositionEndFrame: totalDurationFrames,
      playbackRate: 1,
      sourceStartFrame: 0,
    }];
  }

  const sorted = [...speedCurve].sort((left, right) => left.frame - right.frame);
  const intervals: Array<{ startFrame: number; endFrame: number; requestedRate: number }> = [];

  if (sorted[0].frame > 0) {
    intervals.push({
      startFrame: 0,
      endFrame: sorted[0].frame,
      requestedRate: 1,
    });
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const startFrame = sorted[index].frame;
    const endFrame = index < sorted.length - 1
      ? sorted[index + 1].frame
      : totalDurationFrames;
    if (endFrame <= startFrame) continue;
    intervals.push({
      startFrame,
      endFrame,
      requestedRate: Math.max(0.1, Math.min(sorted[index].value, 4)),
    });
  }

  const segments: SpeedSegment[] = [];
  let sourceOffset = 0;
  for (const interval of intervals) {
    const compositionDuration = interval.endFrame - interval.startFrame;
    const remainingSourceFrames = Math.max(0, availableSourceFrames - sourceOffset);
    const maximumSafeRate = compositionDuration > 0
      ? remainingSourceFrames / compositionDuration
      : 0;
    const playbackRate = Math.min(interval.requestedRate, maximumSafeRate);
    segments.push({
      compositionStartFrame: interval.startFrame,
      compositionEndFrame: interval.endFrame,
      playbackRate,
      sourceStartFrame: sourceOffset,
    });
    sourceOffset += compositionDuration * playbackRate;
  }
  return segments;
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  const sampleX = (value: number) => cubic(value, x1, x2);
  const sampleY = (value: number) => cubic(value, y1, y2);
  const sampleDerivativeX = (value: number) => (
    3 * ((1 - value) ** 2) * x1
    + 6 * (1 - value) * value * (x2 - x1)
    + 3 * (value ** 2) * (1 - x2)
  );

  return (progress: number): number => {
    const target = clamp01(progress);
    let parameter = target;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const error = sampleX(parameter) - target;
      if (Math.abs(error) < 1e-7) return sampleY(parameter);
      const derivative = sampleDerivativeX(parameter);
      if (Math.abs(derivative) < 1e-7) break;
      parameter -= error / derivative;
    }

    let lower = 0;
    let upper = 1;
    parameter = target;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const sample = sampleX(parameter);
      if (Math.abs(sample - target) < 1e-7) break;
      if (sample < target) lower = parameter;
      else upper = parameter;
      parameter = (lower + upper) / 2;
    }
    return sampleY(parameter);
  };
}

function cubic(value: number, firstControl: number, secondControl: number): number {
  const inverse = 1 - value;
  return (
    3 * inverse * inverse * value * firstControl
    + 3 * inverse * value * value * secondControl
    + value * value * value
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
