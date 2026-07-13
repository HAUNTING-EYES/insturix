import type { ProjectAssetAnalysisDoc } from '../storyline/asset-analysis-reader';
import type { MomentWeightMap } from './moment-weight-service';
import type { MusicAnalysisResult } from './music-analysis-service';
import type { RawFootageAnalysis } from './raw-footage-processor';
import type { SegmentAnalysis, SegmentRecord } from '../types/segment-analysis';
import type { VjepaAnalysisResult, VjepaSegmentResult } from './vjepa-service';
import type { Wav2VecAnalysisResult, Wav2VecSegmentResult } from './wav2vec-service';
import { resolveVisualCutRefinementMode } from './visual-cut-intelligence';

export const CANONICAL_MULTI_ASSET_COORDINATE_SPACE = 'canonical-edited-v1' as const;

export interface MultiAssetTimelineOverlay {
  type?: string;
  assetId?: string;
  from?: number;
  durationInFrames?: number;
  sourceStartFrame?: number;
  videoStartTime?: number;
}

export interface MultiAssetDirectorContextProvenance {
  version: 'multi-asset-director-context-v1';
  coordinateSpace: typeof CANONICAL_MULTI_ASSET_COORDINATE_SPACE;
  selectedVideoClipCount: number;
  sourceAssetCount: number;
  projectedWordCount: number;
  projectedSegmentCount: number;
  projectedVjepaSegmentCount: number;
  projectedWav2vecSegmentCount: number;
  projectedMomentWeightCount: number;
  projectedBeatCount: number;
  sourceAssetIds: string[];
}

export type CanonicalMultiAssetRawFootageAnalysis = RawFootageAnalysis & {
  timelineCoordinateSpace: typeof CANONICAL_MULTI_ASSET_COORDINATE_SPACE;
  multiAssetProvenance: MultiAssetDirectorContextProvenance;
};

export interface MultiAssetDirectorContext {
  rawFootageAnalysis: CanonicalMultiAssetRawFootageAnalysis;
  segmentAnalysis: SegmentAnalysis;
  vjepaAnalysis: VjepaAnalysisResult | null;
  wav2vecAnalysis: Wav2VecAnalysisResult | null;
  momentWeightMap: MomentWeightMap | null;
  musicAnalysis: MusicAnalysisResult | null;
  provenance: MultiAssetDirectorContextProvenance;
}

interface SelectedClip {
  assetId: string;
  from: number;
  durationInFrames: number;
  sourceStartMs: number;
  sourceEndMs: number;
  editedStartMs: number;
}

interface SourceContext {
  doc: ProjectAssetAnalysisDoc;
  raw: Record<string, unknown>;
  segment: SegmentAnalysis;
  vjepa: VjepaAnalysisResult | null;
  wav2vec: Wav2VecAnalysisResult | null;
  weights: MomentWeightMap | null;
  music: MusicAnalysisResult | null;
}

interface ProjectedRange {
  startMs: number;
  endMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
}

export function buildMultiAssetDirectorContext(args: {
  analyses: readonly ProjectAssetAnalysisDoc[];
  overlays: readonly MultiAssetTimelineOverlay[];
  fps: number;
  durationInFrames: number;
}): MultiAssetDirectorContext {
  const fps = requirePositive(args.fps, 'fps');
  const durationInFrames = Math.max(1, Math.round(requirePositive(args.durationInFrames, 'durationInFrames')));
  const clips = selectedVideoClips(args.overlays, fps);
  if (clips.length === 0) {
    throw new Error('[MultiAssetDirectorContext] Cannot build canonical context without selected video clips.');
  }

  const analysisByAsset = new Map(args.analyses.map((analysis) => [analysis.assetId, analysis]));
  const sourceByAsset = new Map<string, SourceContext>();
  const invalidAssets = new Set<string>();
  for (const clip of clips) {
    if (sourceByAsset.has(clip.assetId)) continue;
    const doc = analysisByAsset.get(clip.assetId);
    const raw = asRecord(doc?.rawFootageAnalysis);
    const segment = asSegmentAnalysis(doc?.segmentAnalysis);
    if (!doc || !raw || !segment) {
      invalidAssets.add(clip.assetId);
      continue;
    }
    sourceByAsset.set(clip.assetId, {
      doc,
      raw,
      segment,
      vjepa: asVjepaAnalysis(doc.vjepaAnalysis),
      wav2vec: asWav2VecAnalysis(doc.wav2vecAnalysis),
      weights: asMomentWeightMap(doc.momentWeightMap),
      music: asMusicAnalysis(doc.musicAnalysis),
    });
  }
  if (invalidAssets.size > 0) {
    throw new Error(
      '[MultiAssetDirectorContext] Selected video assets lack full canonical analysis: ' +
      Array.from(invalidAssets).sort().join(', '),
    );
  }

  const durationMs = framesToMs(durationInFrames, fps);
  const projectedWords = projectWords(clips, sourceByAsset);
  const projectedRawSegments = projectRawSegments(clips, sourceByAsset);
  const projectedSegmentRecords = projectSegmentRecords(clips, sourceByAsset);
  if (projectedSegmentRecords.length === 0) {
    throw new Error('[MultiAssetDirectorContext] Selected video ranges do not intersect analyzed segments.');
  }
  const projectedVjepa = projectVjepa(clips, sourceByAsset, durationMs);
  const projectedWav2vec = projectWav2vec(clips, sourceByAsset);
  const projectedWeights = projectMomentWeights(clips, sourceByAsset);
  const projectedMusic = projectMusic(clips, sourceByAsset, durationMs);
  const sourceAssetIds = Array.from(new Set(clips.map((clip) => clip.assetId)));

  const provenance: MultiAssetDirectorContextProvenance = {
    version: 'multi-asset-director-context-v1',
    coordinateSpace: CANONICAL_MULTI_ASSET_COORDINATE_SPACE,
    selectedVideoClipCount: clips.length,
    sourceAssetCount: sourceAssetIds.length,
    projectedWordCount: projectedWords.length,
    projectedSegmentCount: projectedSegmentRecords.length,
    projectedVjepaSegmentCount: projectedVjepa?.segments.length ?? 0,
    projectedWav2vecSegmentCount: projectedWav2vec?.segments.length ?? 0,
    projectedMomentWeightCount: projectedWeights?.weights.length ?? 0,
    projectedBeatCount: projectedMusic?.beats.length ?? 0,
    sourceAssetIds,
  };

  const dominant = dominantSource(clips, sourceByAsset);
  const rawBase = omitSourceTimelineDecisions(dominant.raw);
  const transcriptionBase = asRecord(rawBase.transcription) ?? {};
  const language = weightedLanguage(clips, sourceByAsset);
  const speechCoverage = intervalCoverage(
    projectedWords.map((word) => ({
      startMs: finiteNumber(word.startMs) ?? 0,
      endMs: finiteNumber(word.endMs) ?? 0,
    })),
    durationMs,
  );
  const visualMode = resolveVisualCutRefinementMode({ speechCoverage });
  const rawFootageAnalysis = {
    ...rawBase,
    transcription: {
      ...transcriptionBase,
      words: projectedWords,
      transcript: projectedWords.map((word) => String(word.word ?? '')).filter(Boolean).join(' '),
      ...(language ? { language } : {}),
    },
    silenceGaps: projectRawRangeCollection('silenceGaps', clips, sourceByAsset),
    fillerWords: projectRawRangeCollection('fillerWords', clips, sourceByAsset),
    segments: projectedRawSegments,
    bestTakeSelections: [],
    silenceRemovalPlan: [],
    originalDurationMs: durationMs,
    estimatedCleanDurationMs: durationMs,
    speechCoverage,
    needsVisualDrivenEditing: visualMode.needsVisualDrivenEditing,
    timelineCoordinateSpace: CANONICAL_MULTI_ASSET_COORDINATE_SPACE,
    multiAssetProvenance: provenance,
  } as unknown as CanonicalMultiAssetRawFootageAnalysis;

  return {
    rawFootageAnalysis,
    segmentAnalysis: buildProjectedSegmentAnalysis(
      clips,
      sourceByAsset,
      projectedSegmentRecords,
      projectedVjepa,
      projectedWav2vec,
      projectedWeights,
      durationMs,
      provenance,
    ),
    vjepaAnalysis: projectedVjepa,
    wav2vecAnalysis: projectedWav2vec,
    momentWeightMap: projectedWeights,
    musicAnalysis: projectedMusic,
    provenance,
  };
}

function selectedVideoClips(overlays: readonly MultiAssetTimelineOverlay[], fps: number): SelectedClip[] {
  return overlays
    .filter((overlay) => overlay.type === 'video')
    .map((overlay) => {
      const assetId = cleanString(overlay.assetId);
      const from = finiteNumber(overlay.from);
      const durationInFrames = finiteNumber(overlay.durationInFrames);
      const sourceStartFrame = finiteNumber(overlay.sourceStartFrame ?? overlay.videoStartTime);
      if (!assetId || from == null || durationInFrames == null || durationInFrames <= 0 || sourceStartFrame == null) {
        throw new Error(
          '[MultiAssetDirectorContext] Every selected video clip requires assetId, from, durationInFrames, and sourceStartFrame.',
        );
      }
      return {
        assetId,
        from: Math.round(from),
        durationInFrames: Math.round(durationInFrames),
        sourceStartMs: framesToMs(sourceStartFrame, fps),
        sourceEndMs: framesToMs(sourceStartFrame + durationInFrames, fps),
        editedStartMs: framesToMs(from, fps),
      };
    })
    .sort((left, right) => left.from - right.from);
}

function projectWords(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
): Array<Record<string, unknown>> {
  const projected: Array<Record<string, unknown>> = [];
  for (const clip of clips) {
    const source = sources.get(clip.assetId);
    if (!source) continue;
    for (const [wordIndex, value] of asArray(asRecord(source.raw.transcription)?.words).entries()) {
      const word = asRecord(value);
      if (!word) continue;
      const startMs = finiteNumber(word.startMs ?? word.start);
      const endMs = finiteNumber(word.endMs ?? word.end);
      const centerMs = startMs == null || endMs == null ? null : (startMs + endMs) / 2;
      if (startMs == null || endMs == null || centerMs == null || centerMs < clip.sourceStartMs || centerMs >= clip.sourceEndMs) {
        continue;
      }
      const range = projectRange(clip, startMs, endMs);
      const text = cleanString(word.word ?? word.text);
      if (!range || !text) continue;
      projected.push({
        ...word,
        word: text,
        startMs: range.startMs,
        endMs: range.endMs,
        originalStartMs: startMs,
        originalEndMs: endMs,
        originalWordIndex: finiteNumber(word.originalWordIndex ?? word.wordIndex) ?? wordIndex,
        assetId: clip.assetId,
      });
    }
  }
  return projected.sort((left, right) => Number(left.startMs) - Number(right.startMs));
}

function projectRawSegments(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
): Array<Record<string, unknown>> {
  const projected: Array<Record<string, unknown>> = [];
  for (const clip of clips) {
    const source = sources.get(clip.assetId);
    if (!source) continue;
    const sourceWords = timedWords(source.raw);
    for (const value of asArray(source.raw.segments)) {
      const segment = asRecord(value);
      const startMs = finiteNumber(segment?.startMs);
      const endMs = finiteNumber(segment?.endMs);
      if (!segment || startMs == null || endMs == null) continue;
      const range = projectRange(clip, startMs, endMs);
      if (!range) continue;
      const words = sourceWords
        .filter((word) => word.centerMs >= range.sourceStartMs && word.centerMs < range.sourceEndMs)
        .flatMap((word) => {
          const wordRange = projectRange(clip, word.startMs, word.endMs);
          return wordRange ? [{
            ...word.value,
            startMs: wordRange.startMs,
            endMs: wordRange.endMs,
            originalStartMs: word.startMs,
            originalEndMs: word.endMs,
            assetId: clip.assetId,
          }] : [];
        });
      projected.push({
        ...segment,
        startMs: range.startMs,
        endMs: range.endMs,
        words,
        text: words.length > 0
          ? words.map((word) => cleanString(asRecord(word)?.word ?? asRecord(word)?.text)).filter(Boolean).join(' ')
          : String(segment.text ?? ''),
        assetId: clip.assetId,
        sourceStartMs: range.sourceStartMs,
        sourceEndMs: range.sourceEndMs,
      });
    }
  }
  return projected
    .sort((left, right) => Number(left.startMs) - Number(right.startMs))
    .map((segment, index) => ({ ...segment, index }));
}

function timedWords(raw: Record<string, unknown>): Array<{
  value: Record<string, unknown>;
  startMs: number;
  endMs: number;
  centerMs: number;
}> {
  return asArray(asRecord(raw.transcription)?.words).flatMap((value) => {
    const word = asRecord(value);
    const startMs = finiteNumber(word?.startMs ?? word?.start);
    const endMs = finiteNumber(word?.endMs ?? word?.end);
    return word && startMs != null && endMs != null
      ? [{ value: word, startMs, endMs, centerMs: (startMs + endMs) / 2 }]
      : [];
  });
}

function projectRawRangeCollection(
  field: 'silenceGaps' | 'fillerWords',
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
): Array<Record<string, unknown>> {
  const projected: Array<Record<string, unknown>> = [];
  for (const clip of clips) {
    const source = sources.get(clip.assetId);
    if (!source) continue;
    for (const value of asArray(source.raw[field])) {
      const item = asRecord(value);
      const startMs = finiteNumber(item?.startMs);
      const endMs = finiteNumber(item?.endMs);
      if (!item || startMs == null || endMs == null) continue;
      const range = projectRange(clip, startMs, endMs);
      if (!range) continue;
      projected.push({
        ...item,
        startMs: range.startMs,
        endMs: range.endMs,
        ...(field === 'silenceGaps' ? { durationMs: range.endMs - range.startMs } : {}),
        assetId: clip.assetId,
      });
    }
  }
  return projected.sort((left, right) => Number(left.startMs) - Number(right.startMs));
}

function projectSegmentRecords(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
): SegmentRecord[] {
  const projected: Array<SegmentRecord & { assetId: string; sourceStartMs: number; sourceEndMs: number }> = [];
  for (const clip of clips) {
    const source = sources.get(clip.assetId);
    if (!source) continue;
    for (const segment of source.segment.segments) {
      const range = projectRange(clip, segment.startMs, segment.endMs);
      if (!range) continue;
      projected.push({
        ...segment,
        index: 0,
        startMs: range.startMs,
        endMs: range.endMs,
        semanticVisual: segment.semanticVisual
          ? {
              ...segment.semanticVisual,
              windows: segment.semanticVisual.windows.flatMap((window) => {
                const windowRange = projectRange(clip, window.startSec * 1000, window.endSec * 1000);
                return windowRange ? [{
                  ...window,
                  startSec: windowRange.startMs / 1000,
                  endSec: windowRange.endMs / 1000,
                }] : [];
              }),
            }
          : null,
        assetId: clip.assetId,
        sourceStartMs: range.sourceStartMs,
        sourceEndMs: range.sourceEndMs,
      });
    }
  }
  return projected
    .sort((left, right) => left.startMs - right.startMs)
    .map((segment, index) => ({ ...segment, index }));
}

function projectVjepa(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
  durationMs: number,
): VjepaAnalysisResult | null {
  const segments: Array<VjepaSegmentResult & { assetId: string }> = [];
  const roots: VjepaAnalysisResult[] = [];
  for (const clip of clips) {
    const source = sources.get(clip.assetId);
    if (!source?.vjepa) continue;
    roots.push(source.vjepa);
    for (const segment of source.vjepa.segments) {
      const range = projectRange(clip, segment.startMs, segment.endMs);
      if (range) segments.push({ ...segment, startMs: range.startMs, endMs: range.endMs, assetId: clip.assetId });
    }
  }
  if (segments.length === 0) return null;
  segments.sort((left, right) => left.startMs - right.startMs);
  return {
    segments,
    modelVersion: combinedModelVersion(roots.map((root) => root.modelVersion)),
    processingTimeMs: sum(roots.map((root) => root.processingTimeMs)),
    requestedSegmentCount: segments.length,
    analyzedSegmentCount: segments.length,
    droppedSegmentCount: 0,
    coverageRatio: intervalCoverage(segments, durationMs),
    partial: roots.some((root) => root.partial),
    failedBatchCount: sum(roots.map((root) => root.failedBatchCount ?? 0)),
  };
}

function projectWav2vec(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
): Wav2VecAnalysisResult | null {
  const segments: Array<Wav2VecSegmentResult & { assetId: string }> = [];
  const roots: Wav2VecAnalysisResult[] = [];
  for (const clip of clips) {
    const source = sources.get(clip.assetId);
    if (!source?.wav2vec) continue;
    roots.push(source.wav2vec);
    for (const segment of source.wav2vec.segments) {
      const range = projectRange(clip, segment.startMs, segment.endMs);
      if (range) segments.push({ ...segment, startMs: range.startMs, endMs: range.endMs, assetId: clip.assetId });
    }
  }
  if (segments.length === 0) return null;
  return {
    segments: segments.sort((left, right) => left.startMs - right.startMs),
    modelVersion: combinedModelVersion(roots.map((root) => root.modelVersion)),
    processingTimeMs: sum(roots.map((root) => root.processingTimeMs)),
  };
}

function projectMomentWeights(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
): MomentWeightMap | null {
  const weights: MomentWeightMap['weights'] = [];
  let defaultWeightTotal = 0;
  let durationTotal = 0;
  const phases: MomentWeightMap['computation_phase'][] = [];
  for (const clip of clips) {
    const source = sources.get(clip.assetId);
    if (!source?.weights) continue;
    phases.push(source.weights.computation_phase);
    defaultWeightTotal += source.weights.default_weight * clip.durationInFrames;
    durationTotal += clip.durationInFrames;
    for (const weight of source.weights.weights) {
      const range = projectRange(clip, weight.segment_start_ms, weight.segment_end_ms);
      if (!range) continue;
      weights.push({ ...weight, segment_start_ms: range.startMs, segment_end_ms: range.endMs });
    }
  }
  if (weights.length === 0 && durationTotal === 0) return null;
  return {
    weights: weights.sort((left, right) => left.segment_start_ms - right.segment_start_ms),
    default_weight: durationTotal > 0 ? defaultWeightTotal / durationTotal : 0.55,
    computation_phase: phases.length > 0 ? Math.min(...phases) as MomentWeightMap['computation_phase'] : 0,
  };
}

function projectMusic(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
  durationMs: number,
): MusicAnalysisResult | null {
  const beats: MusicAnalysisResult['beats'] = [];
  const sections: MusicAnalysisResult['sections'] = [];
  const energyCurve: number[] = [];
  const weightedRoots: Array<{ music: MusicAnalysisResult; frames: number }> = [];
  for (const clip of clips) {
    const source = sources.get(clip.assetId);
    if (!source?.music) continue;
    const music = source.music;
    weightedRoots.push({ music, frames: clip.durationInFrames });
    for (const beat of music.beats) {
      const timestampMs = projectPoint(clip, beat.timestampMs);
      if (timestampMs != null) beats.push({ ...beat, timestampMs });
    }
    for (const section of music.sections) {
      const range = projectRange(clip, section.startMs, section.endMs);
      if (range) sections.push({ ...section, startMs: range.startMs, endMs: range.endMs });
    }
    const sourceDurationMs = music.durationMs > 0 ? music.durationMs : clip.sourceEndMs;
    if (music.energyCurve.length > 0 && sourceDurationMs > 0) {
      const startIndex = Math.max(0, Math.floor((clip.sourceStartMs / sourceDurationMs) * music.energyCurve.length));
      const endIndex = Math.min(
        music.energyCurve.length,
        Math.max(startIndex + 1, Math.ceil((clip.sourceEndMs / sourceDurationMs) * music.energyCurve.length)),
      );
      energyCurve.push(...music.energyCurve.slice(startIndex, endIndex));
    }
  }
  if (weightedRoots.length === 0) return null;
  const frameTotal = sum(weightedRoots.map((entry) => entry.frames));
  const weightedAverage = (read: (music: MusicAnalysisResult) => number) => (
    frameTotal > 0
      ? weightedRoots.reduce((total, entry) => total + read(entry.music) * entry.frames, 0) / frameTotal
      : 0
  );
  return {
    bpm: weightedAverage((music) => music.bpm),
    beats: beats.sort((left, right) => left.timestampMs - right.timestampMs),
    sections: sections.sort((left, right) => left.startMs - right.startMs),
    musicPresence: weightedAverage((music) => music.musicPresence),
    key: weightedMode(weightedRoots, (entry) => entry.music.key),
    energyCurve,
    durationMs,
    processingTimeMs: sum(weightedRoots.map((entry) => entry.music.processingTimeMs)),
  };
}

function buildProjectedSegmentAnalysis(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
  segments: SegmentRecord[],
  vjepa: VjepaAnalysisResult | null,
  wav2vec: Wav2VecAnalysisResult | null,
  weights: MomentWeightMap | null,
  durationMs: number,
  provenance: MultiAssetDirectorContextProvenance,
): SegmentAnalysis {
  const weightedSources = Array.from(sources.values()).map((source) => ({
    source,
    frames: clips.filter((clip) => clip.assetId === source.doc.assetId)
      .reduce((total, clip) => total + clip.durationInFrames, 0),
  }));
  const visualPerceptionWindows = clips.flatMap((clip) => {
    const source = sources.get(clip.assetId);
    return source?.segment.globalContext.visualPerceptionWindows.flatMap((window) => {
      const range = projectRange(clip, window.startSec * 1000, window.endSec * 1000);
      return range ? [{ ...window, startSec: range.startMs / 1000, endSec: range.endMs / 1000 }] : [];
    }) ?? [];
  });
  const sourceMeta = Array.from(sources.values()).map((source) => source.segment.meta);
  const distinctAssets = new Set(clips.map((clip) => clip.assetId));
  return {
    version: 1,
    globalContext: {
      visualSetup: distinctAssets.size === 1 ? dominantSource(clips, sources).segment.globalContext.visualSetup : null,
      visualPerceptionWindows,
      contentType: weightedMode(weightedSources, (entry) => entry.source.segment.globalContext.contentType) ?? 'unknown',
      platform: weightedMode(weightedSources, (entry) => entry.source.segment.globalContext.platform) ?? 'general',
      colorGrade: weightedMode(weightedSources, (entry) => entry.source.segment.globalContext.colorGrade) ?? 'neutral',
      pacing: weightedMode(weightedSources, (entry) => entry.source.segment.globalContext.pacing) ?? 'medium',
      narrativeArc: weightedMode(weightedSources, (entry) => entry.source.segment.globalContext.narrativeArc) ?? 'unknown',
    },
    segments,
    defaultWeight: weights?.default_weight
      ?? weightedAverageNumber(weightedSources, (entry) => entry.source.segment.defaultWeight)
      ?? 0.55,
    meta: {
      builtAt: new Date().toISOString(),
      hasVjepa: Boolean(vjepa?.segments.length),
      vjepaStatus: !vjepa ? 'absent' : vjepa.partial ? 'partial' : 'complete',
      vjepaRequestedSegmentCount: vjepa?.requestedSegmentCount ?? vjepa?.segments.length ?? 0,
      vjepaAnalyzedSegmentCount: vjepa?.analyzedSegmentCount ?? vjepa?.segments.length ?? 0,
      vjepaDroppedSegmentCount: vjepa?.droppedSegmentCount ?? 0,
      vjepaCoverageRatio: vjepa?.coverageRatio ?? null,
      vjepaFailedBatchCount: sum(sourceMeta.map((meta) => meta.vjepaFailedBatchCount)),
      hasWav2vec: Boolean(wav2vec?.segments.length),
      momentWeightPhase: weights?.computation_phase ?? 0,
      segmentCount: segments.length,
      originalDurationMs: durationMs,
      estimatedCleanDurationMs: durationMs,
      ...({ coordinateSpace: CANONICAL_MULTI_ASSET_COORDINATE_SPACE, multiAssetProvenance: provenance } as Record<string, unknown>),
    },
  };
}

function projectRange(clip: SelectedClip, startMs: number, endMs: number): ProjectedRange | null {
  const overlapStart = Math.max(startMs, clip.sourceStartMs);
  const overlapEnd = Math.min(endMs, clip.sourceEndMs);
  if (!(overlapEnd > overlapStart)) return null;
  return {
    startMs: Math.round(clip.editedStartMs + (overlapStart - clip.sourceStartMs)),
    endMs: Math.round(clip.editedStartMs + (overlapEnd - clip.sourceStartMs)),
    sourceStartMs: overlapStart,
    sourceEndMs: overlapEnd,
  };
}

function projectPoint(clip: SelectedClip, sourceMs: number): number | null {
  if (sourceMs < clip.sourceStartMs || sourceMs >= clip.sourceEndMs) return null;
  return Math.round(clip.editedStartMs + (sourceMs - clip.sourceStartMs));
}

function dominantSource(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
): SourceContext {
  const framesByAsset = new Map<string, number>();
  for (const clip of clips) {
    framesByAsset.set(clip.assetId, (framesByAsset.get(clip.assetId) ?? 0) + clip.durationInFrames);
  }
  const dominantAssetId = Array.from(framesByAsset.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  const source = dominantAssetId ? sources.get(dominantAssetId) : undefined;
  if (!source) throw new Error('[MultiAssetDirectorContext] No analyzed source remains after timeline projection.');
  return source;
}

function weightedLanguage(
  clips: readonly SelectedClip[],
  sources: ReadonlyMap<string, SourceContext>,
): string | undefined {
  return weightedMode(clips.map((clip) => ({
    language: cleanString(asRecord(sources.get(clip.assetId)?.raw.transcription)?.language),
    frames: clip.durationInFrames,
  })), (entry) => entry.language);
}

function weightedMode<T>(
  values: readonly T[],
  read: (value: T) => string | undefined,
): string | undefined {
  const totals = new Map<string, number>();
  for (const value of values) {
    const key = cleanString(read(value));
    if (!key) continue;
    const frames = finiteNumber(asRecord(value)?.frames) ?? 1;
    totals.set(key, (totals.get(key) ?? 0) + frames);
  }
  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}

function weightedAverageNumber<T>(
  values: readonly T[],
  read: (value: T) => number,
): number | undefined {
  let total = 0;
  let weight = 0;
  for (const value of values) {
    const number = read(value);
    const frames = finiteNumber(asRecord(value)?.frames) ?? 1;
    if (!Number.isFinite(number) || frames <= 0) continue;
    total += number * frames;
    weight += frames;
  }
  return weight > 0 ? total / weight : undefined;
}

function intervalCoverage(
  ranges: readonly { startMs: number; endMs: number }[],
  durationMs: number,
): number {
  if (durationMs <= 0 || ranges.length === 0) return 0;
  const sorted = ranges
    .filter((range) => range.endMs > range.startMs)
    .map((range) => ({ startMs: Math.max(0, range.startMs), endMs: Math.min(durationMs, range.endMs) }))
    .sort((left, right) => left.startMs - right.startMs);
  let coveredMs = 0;
  let currentStart = sorted[0]?.startMs ?? 0;
  let currentEnd = sorted[0]?.endMs ?? 0;
  for (const range of sorted.slice(1)) {
    if (range.startMs <= currentEnd) {
      currentEnd = Math.max(currentEnd, range.endMs);
    } else {
      coveredMs += Math.max(0, currentEnd - currentStart);
      currentStart = range.startMs;
      currentEnd = range.endMs;
    }
  }
  coveredMs += Math.max(0, currentEnd - currentStart);
  return Math.max(0, Math.min(1, coveredMs / durationMs));
}

function omitSourceTimelineDecisions(source: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...source };
  for (const field of [
    'bestTakeSelections',
    'silenceRemovalPlan',
    'transcriptEditRanges',
    'editorialIntents',
    'visualCutIntelligence',
  ]) {
    delete copy[field];
  }
  return copy;
}

function asSegmentAnalysis(value: unknown): SegmentAnalysis | null {
  const record = asRecord(value);
  return record?.version === 1
    && asRecord(record.globalContext) != null
    && Array.isArray(record.segments)
    && asRecord(record.meta) != null
    ? value as SegmentAnalysis
    : null;
}

function asVjepaAnalysis(value: unknown): VjepaAnalysisResult | null {
  const record = asRecord(value);
  return record && Array.isArray(record.segments) ? value as VjepaAnalysisResult : null;
}

function asWav2VecAnalysis(value: unknown): Wav2VecAnalysisResult | null {
  const record = asRecord(value);
  return record && Array.isArray(record.segments) ? value as Wav2VecAnalysisResult : null;
}

function asMomentWeightMap(value: unknown): MomentWeightMap | null {
  const record = asRecord(value);
  return record && Array.isArray(record.weights)
    && finiteNumber(record.default_weight) != null
    && finiteNumber(record.computation_phase) != null
    ? value as MomentWeightMap
    : null;
}

function asMusicAnalysis(value: unknown): MusicAnalysisResult | null {
  const record = asRecord(value);
  return record
    && Array.isArray(record.beats)
    && Array.isArray(record.sections)
    && Array.isArray(record.energyCurve)
    ? value as MusicAnalysisResult
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requirePositive(value: unknown, field: string): number {
  const number = finiteNumber(value);
  if (number == null || number <= 0) {
    throw new Error(`[MultiAssetDirectorContext] ${field} must be a positive finite number.`);
  }
  return number;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function framesToMs(frame: number, fps: number): number {
  return Math.round((frame / fps) * 1000);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function combinedModelVersion(values: readonly string[]): string {
  const unique = Array.from(new Set(values.filter(Boolean))).sort();
  return unique.length > 0 ? `multi-asset:${unique.join('+')}` : 'multi-asset:unknown';
}
