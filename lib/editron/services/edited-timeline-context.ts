import type { MomentWeightMap } from './moment-weight-service';
import type {
  EventSignal,
  RawFootageAnalysis,
  SignalSnapshot,
  SignalTimeline,
} from './signal-registry';

export interface EditedTimelineClip {
  from: number;
  durationInFrames: number;
  sourceStartFrame: number;
}

export interface EditedTimelineWord {
  word: string;
  startMs: number;
  endMs: number;
  originalStartMs: number;
  originalEndMs: number;
  speaker?: number;
}

export interface EditedTimelineOverlayLike {
  type?: string;
  from?: number;
  durationInFrames?: number;
  sourceStartFrame?: number;
  videoStartTime?: number;
}

export interface EditedTimelineContext {
  version: 'edited-timeline-context-v1';
  fps: number;
  durationFrames: number;
  durationMs: number;
  sourceClips: EditedTimelineClip[];
  transcription: EditedTimelineWord[];
  sourceRawFootage: RawFootageAnalysis;
  editedRawFootage: RawFootageAnalysis;
  evidence: {
    hasSourceMapping: boolean;
    isCanonicalDecisionTimeline: boolean;
    requiresSourceMapping: boolean;
    inputClipCount: number;
    mappedClipCount: number;
    missingSourceMappingCount: number;
    inputWordCount: number;
    keptWordCount: number;
    droppedWordCount: number;
    clipCount: number;
  };
}

export interface BuildEditedTimelineContextOptions {
  rawFootage: RawFootageAnalysis;
  overlays: EditedTimelineOverlayLike[];
  fps?: number;
  projectDurationFrames?: number;
}

export function buildEditedTimelineContext(options: BuildEditedTimelineContextOptions): EditedTimelineContext {
  const fps = normalizeFps(options.fps);
  const clipExtraction = extractSourceClips(options.overlays);
  const sourceClips = clipExtraction.sourceClips;
  const hasSourceMapping = sourceClips.length > 0;
  const requiresSourceMapping = clipExtraction.inputClipCount > 1;
  const isCanonicalDecisionTimeline = !requiresSourceMapping || hasSourceMapping;
  const durationFrames = resolveDurationFrames(options.projectDurationFrames, options.rawFootage, sourceClips, fps);
  const rawWords = extractRawWords(options.rawFootage);
  const transcription = hasSourceMapping
    ? projectWordsToEditedTimeline(rawWords, sourceClips, fps)
    : rawWords.map((word) => ({
        ...word,
        originalStartMs: word.startMs,
        originalEndMs: word.endMs,
      }));

  const durationMs = framesToMs(durationFrames, fps);
  const editedRawFootage = buildEditedRawFootage(options.rawFootage, transcription, durationMs);

  return {
    version: 'edited-timeline-context-v1',
    fps,
    durationFrames,
    durationMs,
    sourceClips,
    transcription,
    sourceRawFootage: options.rawFootage,
    editedRawFootage,
    evidence: {
      hasSourceMapping,
      isCanonicalDecisionTimeline,
      requiresSourceMapping,
      inputClipCount: clipExtraction.inputClipCount,
      mappedClipCount: clipExtraction.mappedClipCount,
      missingSourceMappingCount: clipExtraction.missingSourceMappingCount,
      inputWordCount: rawWords.length,
      keptWordCount: transcription.length,
      droppedWordCount: Math.max(0, rawWords.length - transcription.length),
      clipCount: sourceClips.length,
    },
  };
}

export function mapSourceFrameToEditedFrame(
  sourceFrame: number,
  sourceClips: EditedTimelineClip[],
): number | null {
  if (!sourceClips.length) return sourceFrame;
  for (const clip of sourceClips) {
    const sourceStart = clip.sourceStartFrame;
    const sourceEnd = sourceStart + clip.durationInFrames;
    if (sourceFrame >= sourceStart && sourceFrame < sourceEnd) {
      return clip.from + (sourceFrame - sourceStart);
    }
  }
  return null;
}

export function mapEditedFrameToSourceFrame(
  editedFrame: number,
  sourceClips: EditedTimelineClip[],
): number | null {
  if (!sourceClips.length) return editedFrame;
  for (const clip of sourceClips) {
    const editedStart = clip.from;
    const editedEnd = editedStart + clip.durationInFrames;
    if (editedFrame >= editedStart && editedFrame < editedEnd) {
      return clip.sourceStartFrame + (editedFrame - editedStart);
    }
  }
  return null;
}

export function projectSignalTimelineToEditedTimeline(
  sourceTimeline: SignalTimeline,
  context: EditedTimelineContext,
): SignalTimeline {
  if (!context.evidence.hasSourceMapping) return sourceTimeline;

  const gridSignals = new Map<number, SignalSnapshot>();
  const gridFrames = Array.from(sourceTimeline.gridSignals.keys()).sort((a, b) => a - b);
  for (let frame = 0; frame <= context.durationFrames; frame += sourceTimeline.gridInterval) {
    const sourceFrame = mapEditedFrameToSourceFrame(frame, context.sourceClips);
    if (sourceFrame == null) continue;
    const sourceSnapshot = nearestSourceSnapshot(sourceTimeline, gridFrames, sourceFrame);
    if (!sourceSnapshot) continue;
    gridSignals.set(frame, {
      ...sourceSnapshot,
      frame,
      timestampMs: framesToMs(frame, context.fps),
      sourceFrame,
      sourceTimestampMs: framesToMs(sourceFrame, context.fps),
    } as SignalSnapshot);
  }

  const eventSignals = sourceTimeline.eventSignals.flatMap((event) => {
    const sourceFrame = Number.isFinite(event.frame)
      ? event.frame
      : msToFrame(event.timestampMs, context.fps);
    const editedFrame = mapSourceFrameToEditedFrame(sourceFrame, context.sourceClips);
    if (editedFrame == null) return [];
    return [{
      ...event,
      frame: editedFrame,
      timestampMs: framesToMs(editedFrame, context.fps),
    } satisfies EventSignal];
  });

  return {
    ...sourceTimeline,
    gridSignals,
    eventSignals,
    globalSignals: {
      ...sourceTimeline.globalSignals,
      'video.duration_s': context.durationMs / 1000,
      'content.speech_coverage': computeSpeechCoverage(context.transcription, context.durationMs),
    },
    totalFrames: context.durationFrames,
  };
}

export function projectMomentWeightMapToEditedTimeline(
  weightMap: MomentWeightMap,
  context: EditedTimelineContext,
): MomentWeightMap {
  if (!context.evidence.hasSourceMapping) return weightMap;

  const weights: MomentWeightMap['weights'] = [];
  for (const weight of weightMap.weights) {
    const sourceStartFrame = msToFrame(weight.segment_start_ms, context.fps);
    const sourceEndFrame = Math.max(sourceStartFrame + 1, msToFrame(weight.segment_end_ms, context.fps));
    for (const clip of context.sourceClips) {
      const overlapStart = Math.max(sourceStartFrame, clip.sourceStartFrame);
      const overlapEnd = Math.min(sourceEndFrame, clip.sourceStartFrame + clip.durationInFrames);
      if (overlapStart >= overlapEnd) continue;

      const editedStart = clip.from + (overlapStart - clip.sourceStartFrame);
      const editedEnd = clip.from + (overlapEnd - clip.sourceStartFrame);
      weights.push({
        ...weight,
        segment_start_ms: framesToMs(editedStart, context.fps),
        segment_end_ms: framesToMs(editedEnd, context.fps),
      });
    }
  }

  return {
    ...weightMap,
    weights: weights.sort((a, b) => a.segment_start_ms - b.segment_start_ms),
  };
}

function extractSourceClips(overlays: EditedTimelineOverlayLike[]): {
  sourceClips: EditedTimelineClip[];
  inputClipCount: number;
  mappedClipCount: number;
  missingSourceMappingCount: number;
} {
  const candidates = overlays
    .filter((overlay) => overlay.type === 'video' || !overlay.type)
    .map((overlay) => {
      const from = readFiniteNumber(overlay.from);
      const durationInFrames = readFiniteNumber(overlay.durationInFrames);
      const sourceStartFrame = readFiniteNumber(overlay.sourceStartFrame ?? overlay.videoStartTime);
      return { from, durationInFrames, sourceStartFrame };
    })
    .filter((clip) => clip.from != null && clip.durationInFrames != null && clip.durationInFrames > 0);

  const mappedClipCount = candidates.filter((clip) => clip.sourceStartFrame != null).length;
  const missingSourceMappingCount = candidates.length - mappedClipCount;
  const hasCompleteSourceMapping = candidates.length > 0
    && mappedClipCount === candidates.length
    && missingSourceMappingCount === 0;

  if (!hasCompleteSourceMapping) {
    return {
      sourceClips: [],
      inputClipCount: candidates.length,
      mappedClipCount,
      missingSourceMappingCount,
    };
  }

  return {
    sourceClips: candidates
      .map((clip) => ({
        from: clip.from ?? 0,
        durationInFrames: clip.durationInFrames ?? 0,
        sourceStartFrame: clip.sourceStartFrame ?? 0,
      }))
      .sort((a, b) => a.from - b.from),
    inputClipCount: candidates.length,
    mappedClipCount,
    missingSourceMappingCount,
  };
}

function extractRawWords(rawFootage: RawFootageAnalysis): Array<{
  word: string;
  startMs: number;
  endMs: number;
  speaker?: number;
}> {
  const source = Array.isArray(rawFootage.transcription?.words)
    ? rawFootage.transcription.words
    : extractSegmentWords(rawFootage);

  return source
    .map((word) => ({
      word: String((word as any).word ?? (word as any).text ?? '').trim(),
      startMs: readFiniteNumber((word as any).startMs ?? (word as any).start) ?? 0,
      endMs: readFiniteNumber((word as any).endMs ?? (word as any).end) ?? 0,
      speaker: typeof (word as any).speaker === 'number' ? (word as any).speaker : undefined,
    }))
    .filter((word) => word.word.length > 0 && word.endMs >= word.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

function extractSegmentWords(rawFootage: RawFootageAnalysis): unknown[] {
  const words: unknown[] = [];
  for (const segment of rawFootage.segments ?? []) {
    const segmentWords = (segment as any).words;
    if (Array.isArray(segmentWords)) words.push(...segmentWords);
  }
  return words;
}

function projectWordsToEditedTimeline(
  rawWords: Array<{ word: string; startMs: number; endMs: number; speaker?: number }>,
  sourceClips: EditedTimelineClip[],
  fps: number,
): EditedTimelineWord[] {
  const projected: EditedTimelineWord[] = [];
  for (const word of rawWords) {
    const centerFrame = msToFrame((word.startMs + word.endMs) / 2, fps);
    const clip = sourceClips.find((candidate) => (
      centerFrame >= candidate.sourceStartFrame
      && centerFrame < candidate.sourceStartFrame + candidate.durationInFrames
    ));
    if (!clip) continue;

    const rawStartFrame = msToFrame(word.startMs, fps);
    const rawEndFrame = Math.max(rawStartFrame + 1, msToFrame(word.endMs, fps));
    const sourceStart = clip.sourceStartFrame;
    const sourceEnd = sourceStart + clip.durationInFrames;
    const clampedStart = clamp(rawStartFrame, sourceStart, sourceEnd - 1);
    const clampedEnd = clamp(rawEndFrame, clampedStart + 1, sourceEnd);
    const editedStartFrame = clip.from + (clampedStart - sourceStart);
    const editedEndFrame = clip.from + (clampedEnd - sourceStart);

    projected.push({
      word: word.word,
      startMs: framesToMs(editedStartFrame, fps),
      endMs: framesToMs(editedEndFrame, fps),
      originalStartMs: word.startMs,
      originalEndMs: word.endMs,
      speaker: word.speaker,
    });
  }
  return projected.sort((a, b) => a.startMs - b.startMs);
}

function buildEditedRawFootage(
  source: RawFootageAnalysis,
  words: EditedTimelineWord[],
  durationMs: number,
): RawFootageAnalysis {
  const editedWords = words.map(({ word, startMs, endMs, speaker }) => ({ word, startMs, endMs, speaker }));
  const speechCoverage = computeSpeechCoverage(words, durationMs);
  return {
    ...source,
    transcription: { words: editedWords },
    silenceGaps: [],
    fillerWords: projectFillerWords(source, words),
    segments: buildEditedSegments(words),
    estimatedCleanDurationMs: durationMs,
    originalDurationMs: durationMs,
    ...(source as any).speechCoverage != null || speechCoverage > 0
      ? { speechCoverage }
      : {},
  } as RawFootageAnalysis;
}

function projectFillerWords(source: RawFootageAnalysis, words: EditedTimelineWord[]): NonNullable<RawFootageAnalysis['fillerWords']> {
  const byOriginalStart = new Map(words.map((word) => [Math.round(word.originalStartMs), word]));
  return (source.fillerWords ?? []).flatMap((filler) => {
    const projected = byOriginalStart.get(Math.round(filler.startMs));
    if (!projected) return [];
    return [{
      ...filler,
      startMs: projected.startMs,
      endMs: projected.endMs,
    }];
  });
}

function buildEditedSegments(words: EditedTimelineWord[]): NonNullable<RawFootageAnalysis['segments']> {
  if (!words.length) return [];
  const startMs = words[0].startMs;
  const endMs = words[words.length - 1].endMs;
  const gaps = words.slice(1).map((word, index) => Math.max(0, word.startMs - words[index].endMs));
  const avgWordGapMs = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
  return [{
    text: words.map((word) => word.word).join(' '),
    startMs,
    endMs,
    fillerCount: words.filter((word) => FILLER_WORDS.has(word.word.toLowerCase())).length,
    silenceGapCount: gaps.filter((gap) => gap > 500).length,
    avgWordGapMs,
  }];
}

function resolveDurationFrames(
  projectDurationFrames: number | undefined,
  rawFootage: RawFootageAnalysis,
  sourceClips: EditedTimelineClip[],
  fps: number,
): number {
  const explicitDuration = readFiniteNumber(projectDurationFrames);
  if (explicitDuration && explicitDuration > 0) return Math.round(explicitDuration);

  const clipEnd = sourceClips.length
    ? Math.max(...sourceClips.map((clip) => clip.from + clip.durationInFrames))
    : 0;
  if (clipEnd > 0) return clipEnd;

  const durationMs = rawFootage.estimatedCleanDurationMs ?? rawFootage.originalDurationMs ?? 0;
  if (durationMs > 0) return Math.ceil((durationMs / 1000) * fps);
  return fps;
}

function nearestSourceSnapshot(
  timeline: SignalTimeline,
  gridFrames: number[],
  sourceFrame: number,
): SignalSnapshot | null {
  let bestFrame: number | null = null;
  let bestDistance = Infinity;
  for (const frame of gridFrames) {
    const distance = Math.abs(frame - sourceFrame);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFrame = frame;
    }
  }
  return bestFrame == null ? null : timeline.gridSignals.get(bestFrame) ?? null;
}

function computeSpeechCoverage(words: Array<{ startMs: number; endMs: number }>, durationMs: number): number {
  if (!words.length || durationMs <= 0) return 0;
  const speechMs = words.reduce((sum, word) => sum + Math.max(0, word.endMs - word.startMs), 0);
  return Math.max(0, Math.min(1, speechMs / durationMs));
}

function normalizeFps(fps: number | undefined): number {
  return typeof fps === 'number' && Number.isFinite(fps) && fps > 0 ? fps : 30;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function msToFrame(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

function framesToMs(frame: number, fps: number): number {
  return Math.round((frame / fps) * 1000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const FILLER_WORDS = new Set(['um', 'uh', 'like', 'you know', 'actually', 'basically']);
