import { parsePromptTimeRange, parseTimeToSeconds } from '../utils/analysis';

export interface AnalysisOverlayCoordinates {
  id?: string | number;
  type?: string;
  assetId?: string;
  name?: string;
  content?: unknown;
  src?: unknown;
  sourceVersionPinV1?: unknown;
  from?: number;
  durationInFrames?: number;
  sourceStartFrame?: number;
  videoStartTime?: number;
  startFromSound?: number;
  audioStartFrame?: number;
}

export interface AnalysisFrameRange {
  startFrame: number;
  endFrame: number;
}

export interface AnalysisWindow {
  timeline: AnalysisFrameRange;
  source: AnalysisFrameRange;
}

interface RequestedRangeInput {
  startTime?: string;
  endTime?: string;
  startFrame?: number;
  endFrame?: number;
  prompt?: string;
  fps: number;
  maxDurationSeconds?: number;
}

interface ResolveWindowInput {
  overlay: AnalysisOverlayCoordinates;
  requestedTimelineRange?: AnalysisFrameRange | null;
  preferredWindowFrames: number;
  maxWindowFrames: number;
}

interface SelectOverlayInput<T extends AnalysisOverlayCoordinates> {
  overlays: T[];
  assetId?: string;
  target?: string;
  requestedTimelineRange?: AnalysisFrameRange | null;
  selectedOverlayId?: string | number | null;
}

export function selectAnalysisOverlay<T extends AnalysisOverlayCoordinates>(input: SelectOverlayInput<T>): T {
  if (input.overlays.length === 0) throw new Error('No analyzable media overlays were found.');

  const assetId = nonEmptyString(input.assetId);
  if (assetId) {
    const exactAsset = input.overlays.find((overlay) => overlay.assetId === assetId);
    if (exactAsset) return exactAsset;
    throw new Error(`Requested asset ${assetId} is not present on this project timeline.`);
  }

  const target = normalizeTarget(input.target);
  if (target) {
    const matched = input.overlays.filter((overlay) => overlayMatchesTarget(overlay, target));
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) return chooseSelectedOrThrow(matched, input.selectedOverlayId, `target "${input.target}"`);
    if (!input.requestedTimelineRange) {
      throw new Error(
        `No timeline media matched "${input.target}". Resolve the clip with project/visual/asset evidence and retry with its assetId.`,
      );
    }
  }

  if (input.requestedTimelineRange) {
    const overlaps = input.overlays.filter((overlay) => overlapsRange(overlay, input.requestedTimelineRange as AnalysisFrameRange));
    if (overlaps.length === 1) return overlaps[0];
    if (overlaps.length > 1) return chooseSelectedOrThrow(overlaps, input.selectedOverlayId, 'requested timeline range');
    throw new Error(
      `No timeline media overlaps analysis range ${input.requestedTimelineRange.startFrame}-${input.requestedTimelineRange.endFrame}.`,
    );
  }

  const selected = input.overlays.find((overlay) => String(overlay.id) === String(input.selectedOverlayId ?? ''));
  if (selected) return selected;
  if (input.overlays.length === 1) return input.overlays[0];
  throw new Error(
    `Analysis target is ambiguous across ${input.overlays.length} media overlays. Resolve or select one clip before analysis.`,
  );
}

export function resolveRequestedTimelineRange(input: RequestedRangeInput): AnalysisFrameRange | null {
  const fps = positiveNumber(input.fps, 'fps');
  const maxFrames = Math.max(1, Math.round((input.maxDurationSeconds ?? 120) * fps));
  const hasTimeStart = nonEmptyString(input.startTime);
  const hasTimeEnd = nonEmptyString(input.endTime);
  if (hasTimeStart || hasTimeEnd) {
    if (!hasTimeStart || !hasTimeEnd) {
      throw new Error('Both startTime and endTime are required for an explicit analysis time range.');
    }
    const startFrame = Math.round(parseTimeToSeconds(hasTimeStart) * fps);
    const endFrame = Math.round(parseTimeToSeconds(hasTimeEnd) * fps);
    return validateAndLimitRange({ startFrame, endFrame }, maxFrames);
  }

  const hasFrameStart = Number.isFinite(input.startFrame);
  const hasFrameEnd = Number.isFinite(input.endFrame);
  if (hasFrameStart || hasFrameEnd) {
    if (!hasFrameStart || !hasFrameEnd) {
      throw new Error('Both startFrame and endFrame are required for an explicit analysis frame range.');
    }
    return validateAndLimitRange({
      startFrame: Math.round(input.startFrame as number),
      endFrame: Math.round(input.endFrame as number),
    }, maxFrames);
  }

  const parsed = parsePromptTimeRange(input.prompt ?? '', fps, input.maxDurationSeconds ?? 120);
  return parsed
    ? validateAndLimitRange({
        startFrame: Math.round(parsed.startSec * fps),
        endFrame: Math.round(parsed.endSec * fps),
      }, maxFrames)
    : null;
}

export function resolveAnalysisWindow(input: ResolveWindowInput): AnalysisWindow {
  const overlayStart = nonNegativeFrame(input.overlay.from ?? 0, 'overlay.from');
  const overlayDuration = positiveFrame(input.overlay.durationInFrames, 'overlay.durationInFrames');
  const overlayEnd = overlayStart + overlayDuration;
  const preferredFrames = positiveFrame(input.preferredWindowFrames, 'preferredWindowFrames');
  const maxFrames = positiveFrame(input.maxWindowFrames, 'maxWindowFrames');

  let timelineStart: number;
  let timelineEnd: number;
  if (input.requestedTimelineRange) {
    const requested = validateAndLimitRange(input.requestedTimelineRange, maxFrames);
    timelineStart = Math.max(overlayStart, requested.startFrame);
    timelineEnd = Math.min(overlayEnd, requested.endFrame, timelineStart + maxFrames);
    if (timelineEnd <= timelineStart) {
      throw new Error(
        `Requested analysis range ${requested.startFrame}-${requested.endFrame} does not overlap clip ${overlayStart}-${overlayEnd}.`,
      );
    }
  } else {
    const duration = Math.min(overlayDuration, preferredFrames, maxFrames);
    timelineStart = overlayStart + Math.floor((overlayDuration - duration) / 2);
    timelineEnd = timelineStart + duration;
  }

  const sourceBase = resolveSourceStartFrame(input.overlay);
  const sourceStart = sourceBase + (timelineStart - overlayStart);
  const sourceEnd = sourceStart + (timelineEnd - timelineStart);
  return {
    timeline: { startFrame: timelineStart, endFrame: timelineEnd },
    source: { startFrame: sourceStart, endFrame: sourceEnd },
  };
}

export function resolveSourceStartFrame(overlay: AnalysisOverlayCoordinates): number {
  const type = overlay.type?.toLowerCase();
  const candidates = type === 'sound' || type === 'audio'
    ? [overlay.sourceStartFrame, overlay.startFromSound, overlay.audioStartFrame, overlay.videoStartTime]
    : [overlay.sourceStartFrame, overlay.videoStartTime, overlay.audioStartFrame, overlay.startFromSound];
  const found = candidates.find((value) => Number.isFinite(value));
  return nonNegativeFrame(found ?? 0, 'overlay source start frame');
}

function chooseSelectedOrThrow<T extends AnalysisOverlayCoordinates>(
  overlays: T[],
  selectedOverlayId: string | number | null | undefined,
  reason: string,
): T {
  const selected = overlays.find((overlay) => String(overlay.id) === String(selectedOverlayId ?? ''));
  if (selected) return selected;
  const candidates = overlays.map((overlay) => overlay.assetId ?? overlay.name ?? overlay.id ?? 'unknown').join(', ');
  throw new Error(`Multiple media overlays match ${reason}: ${candidates}. Select or resolve the intended clip first.`);
}

function overlapsRange(overlay: AnalysisOverlayCoordinates, range: AnalysisFrameRange): boolean {
  const start = Number.isFinite(overlay.from) ? Math.round(overlay.from as number) : 0;
  const duration = Number.isFinite(overlay.durationInFrames) ? Math.round(overlay.durationInFrames as number) : 0;
  return duration > 0 && range.endFrame > start && range.startFrame < start + duration;
}

function overlayMatchesTarget(overlay: AnalysisOverlayCoordinates, target: string): boolean {
  return [overlay.assetId, overlay.name, overlay.content, overlay.src]
    .map(normalizeTarget)
    .filter(Boolean)
    .some((candidate) => candidate === target || candidate.includes(target) || target.includes(candidate));
}

function normalizeTarget(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token && !['the', 'a', 'an', 'clip', 'video', 'audio', 'footage', 'analyze', 'analysis'].includes(token))
    .join(' ')
    .trim();
}

function validateAndLimitRange(range: AnalysisFrameRange, maxFrames: number): AnalysisFrameRange {
  const startFrame = nonNegativeFrame(range.startFrame, 'analysis start frame');
  const requestedEnd = nonNegativeFrame(range.endFrame, 'analysis end frame');
  if (requestedEnd <= startFrame) {
    throw new Error(`Analysis end frame ${requestedEnd} must be after start frame ${startFrame}.`);
  }
  return {
    startFrame,
    endFrame: Math.min(requestedEnd, startFrame + maxFrames),
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
}

function nonNegativeFrame(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite frame.`);
  }
  return Math.round(value);
}

function positiveFrame(value: unknown, label: string): number {
  const frame = nonNegativeFrame(value, label);
  if (frame <= 0) throw new Error(`${label} must be greater than zero.`);
  return frame;
}
