import { persistProjectAssetAnalysis } from './project-analysis-storage';
import type { EditronSegment } from '../storyline/scene-adapter';

const ASSET_ANALYSES_COLLECTION = 'asset_analyses';
const FPS = 30;
const DEFAULT_VISUAL_WINDOW_MS = 4_000;

type BridgeAsset = {
  assetId: string;
  type: 'video' | 'image' | 'audio';
  duration?: number | string | null;
};

type BridgeDb = {
  collection(name: string): {
    find(filter: Record<string, unknown>): { toArray(): Promise<AssetAnalysisDoc[]> };
    updateOne(
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options: { upsert: true },
    ): Promise<unknown>;
  };
};

type SpeechSegment = {
  startMs?: number;
  endMs?: number;
  text?: string;
  confidence?: number;
};

type SourceWord = {
  word?: string;
  text?: string;
  startMs?: number;
  endMs?: number;
  start?: number;
  end?: number;
  confidence?: number | null;
};


type MotionSegment = {
  startFrame?: number;
  endFrame?: number;
  motionIntensity?: number;
};

type Shot = {
  startFrame?: number;
  endFrame?: number;
  durationMs?: number;
};

type FrameAnalysis = {
  frame?: number;
  timestampMs?: number;
  shotType?: string;
  energyLevel?: number;
  moodScore?: number;
  subjects?: Array<{ category?: string; label?: string; boundingBox?: { h?: number } }>;
};

type Wav2VecSegment = {
  startMs?: number;
  endMs?: number;
  emotionIntensity?: number;
  emotionalValence?: string | null;
  energy?: number;
};

type VjepaSegment = {
  startMs?: number;
  endMs?: number;
  visualSignificance?: number;
  significance?: number;
  motionIntensity?: number;
  actionType?: string | null;
  faceEmotion?: string | null;
  faceCount?: number;
  objectCount?: number;
  mainSubjectHeight?: number;
  mainSubject?: { height?: number };
};

type MomentWeightEntry = {
  segment_start_ms?: number;
  segment_end_ms?: number;
  segmentStartMs?: number;
  segmentEndMs?: number;
  startMs?: number;
  endMs?: number;
  final_weight?: number;
  finalWeight?: number;
  confidence?: 'high' | 'medium' | 'low' | null;
};

type SubjectTrack = {
  category?: string;
  frames?: Array<{ frame?: number; box?: { h?: number } }>;
};

type AssetAnalysisDoc = {
  assetId: string;
  userId?: string;
  status?: string;
  durationMs?: number;
  transcription?: {
    words?: SourceWord[];
    language?: string | null;
  };
  rawFootageAnalysis?: {
    transcription?: {
      words?: SourceWord[];
      language?: string | null;
    };
  } & Record<string, unknown>;
  segmentAnalysis?: unknown;
  speechSegments?: SpeechSegment[];
  motionSegments?: MotionSegment[];
  shots?: Shot[];
  keyframeAnalyses?: FrameAnalysis[];
  subjectTracks?: SubjectTrack[];
  analysisQuality?: 'high' | 'medium' | 'low' | 'fallback';
  confidenceBreakdown?: Record<string, number>;
  vjepaAnalysis?: { segments?: VjepaSegment[] } | null;
  wav2vecAnalysis?: { segments?: Wav2VecSegment[] } | null;
  momentWeightMap?: { weights?: MomentWeightEntry[] } | null;
  musicStructure?: unknown;
  musicAnalysis?: unknown;
  audio?: unknown;
};

export type StorylineAnalysisBridgeResult = {
  attemptedAssetCount: number;
  sourceAnalysisCount: number;
  persistedAssetCount: number;
  segmentCount: number;
  skipped: Array<{ assetId: string; reason: string }>;
};

function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function frameToMs(frame: unknown): number | undefined {
  const n = positiveNumber(frame);
  return n == null ? undefined : Math.round((n / FPS) * 1000);
}

function clamp01(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

function cleanStringList(values: unknown[], limit = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function confidenceLabel(analysis: AssetAnalysisDoc): 'high' | 'medium' | 'low' {
  if (analysis.analysisQuality === 'high') return 'high';
  if (analysis.analysisQuality === 'medium') return 'medium';
  return 'low';
}

function nearestKeyframe(analysis: AssetAnalysisDoc, startMs: number): FrameAnalysis | undefined {
  const frames = analysis.keyframeAnalyses?.filter((kf) => typeof kf.timestampMs === 'number') ?? [];
  return frames.reduce<FrameAnalysis | undefined>((best, kf) => {
    if (!best) return kf;
    return Math.abs((kf.timestampMs ?? 0) - startMs) < Math.abs((best.timestampMs ?? 0) - startMs) ? kf : best;
  }, undefined);
}

function overlappingMotion(analysis: AssetAnalysisDoc, startMs: number, endMs: number): MotionSegment | undefined {
  return analysis.motionSegments?.find((motion) => {
    const motionStart = frameToMs(motion.startFrame) ?? 0;
    const motionEnd = frameToMs(motion.endFrame) ?? motionStart;
    return motionEnd > startMs && motionStart < endMs;
  });
}

function overlapByMidpoint<T>(
  items: readonly T[] | undefined,
  startMs: number,
  endMs: number,
  readStartMs: (item: T) => number | undefined,
  readEndMs: (item: T) => number | undefined,
): T | undefined {
  if (!items?.length) return undefined;
  const midpoint = (startMs + endMs) / 2;
  return items.find((item) => {
    const itemStart = readStartMs(item);
    const itemEnd = readEndMs(item);
    return itemStart != null && itemEnd != null && midpoint >= itemStart && midpoint < itemEnd;
  });
}

function mainSubjectHeight(analysis: AssetAnalysisDoc, frame?: number): number | undefined {
  const fromTrack = analysis.subjectTracks
    ?.flatMap((track) => track.frames ?? [])
    .filter((item) => typeof item.box?.h === 'number')
    .sort((a, b) => Math.abs((a.frame ?? 0) - (frame ?? 0)) - Math.abs((b.frame ?? 0) - (frame ?? 0)))[0]?.box?.h;
  return clamp01(fromTrack);
}

function segmentVisual(analysis: AssetAnalysisDoc, startMs: number, endMs: number): EditronSegment['visual'] {
  const vjepa = overlapByMidpoint(
    analysis.vjepaAnalysis?.segments,
    startMs,
    endMs,
    (segment) => nonNegativeNumber(segment.startMs),
    (segment) => nonNegativeNumber(segment.endMs),
  );
  if (vjepa) {
    return {
      significance: clamp01(vjepa.visualSignificance ?? vjepa.significance) ?? null,
      motionIntensity: clamp01(vjepa.motionIntensity) ?? null,
      actionType: typeof vjepa.actionType === 'string' && vjepa.actionType.trim() ? vjepa.actionType.trim() : null,
      faceEmotion: typeof vjepa.faceEmotion === 'string' && vjepa.faceEmotion.trim() ? vjepa.faceEmotion.trim() : null,
      faceCount: positiveNumber(vjepa.faceCount) ?? null,
      objectCount: positiveNumber(vjepa.objectCount) ?? null,
      mainSubjectHeight: clamp01(vjepa.mainSubjectHeight ?? vjepa.mainSubject?.height) ?? null,
    };
  }

  const keyframe = nearestKeyframe(analysis, startMs);
  const motion = overlappingMotion(analysis, startMs, endMs);
  const personCount = analysis.subjectTracks?.filter((track) => track.category === 'person').length ?? 0;
  const objectCount = analysis.subjectTracks?.length ?? keyframe?.subjects?.length ?? 0;

  return {
    significance: clamp01(keyframe?.energyLevel ?? analysis.confidenceBreakdown?.vision) ?? null,
    motionIntensity: clamp01(motion?.motionIntensity) ?? null,
    faceCount: personCount || null,
    objectCount: objectCount || null,
    mainSubjectHeight: mainSubjectHeight(analysis, keyframe?.frame) ?? null,
  };
}

function keyframeOcrText(keyframe: FrameAnalysis | undefined): string[] {
  return cleanStringList((keyframe?.subjects ?? [])
    .filter((subject) => {
      const category = subject.category?.toLowerCase();
      return category === 'text' || category === 'logo';
    })
    .map((subject) => subject.label));
}

function segmentSemanticVisual(analysis: AssetAnalysisDoc, startMs: number): EditronSegment['semanticVisual'] {
  const keyframe = nearestKeyframe(analysis, startMs);
  const hasPerson = (analysis.subjectTracks ?? []).some((track) => track.category === 'person');
  const hasText = (keyframe?.subjects ?? []).some((subject) => subject.category === 'text');
  const ocrText = keyframeOcrText(keyframe);
  const mode = hasText ? 'screen-share' : hasPerson ? 'talking-head' : undefined;

  return {
    primaryVisualMode: mode ?? null,
    salience: clamp01(keyframe?.energyLevel ?? analysis.confidenceBreakdown?.vision) ?? null,
    visuallyExplains: null,
    ...(ocrText.length > 0 ? { ocrText } : {}),
  };
}

function momentWeightForWindow(analysis: AssetAnalysisDoc, startMs: number, endMs: number): MomentWeightEntry | undefined {
  return overlapByMidpoint(
    analysis.momentWeightMap?.weights,
    startMs,
    endMs,
    (weight) => nonNegativeNumber(weight.segment_start_ms ?? weight.segmentStartMs ?? weight.startMs),
    (weight) => nonNegativeNumber(weight.segment_end_ms ?? weight.segmentEndMs ?? weight.endMs),
  );
}

function segmentWeight(analysis: AssetAnalysisDoc, startMs: number, endMs: number): EditronSegment['weight'] {
  const confidence = confidenceLabel(analysis);
  const weight = momentWeightForWindow(analysis, startMs, endMs);
  return {
    finalWeight: clamp01(weight?.final_weight ?? weight?.finalWeight) ?? null,
    confidence: weight?.confidence ?? confidence,
  };
}

function segmentVocal(analysis: AssetAnalysisDoc, startMs: number, endMs: number): EditronSegment['vocal'] {
  const wav2vec = overlapByMidpoint(
    analysis.wav2vecAnalysis?.segments,
    startMs,
    endMs,
    (segment) => nonNegativeNumber(segment.startMs),
    (segment) => nonNegativeNumber(segment.endMs),
  );
  if (!wav2vec) return null;
  const valence = wav2vec.emotionalValence;
  const emotionalValence =
    valence === 'positive' || valence === 'negative' || valence === 'neutral' || valence === 'mixed'
      ? valence
      : undefined;
  return {
    emotionIntensity: clamp01(wav2vec.emotionIntensity) ?? null,
    energy: clamp01(wav2vec.energy) ?? null,
    emotionalValence: emotionalValence ?? null,
  };
}

function speechToSegment(analysis: AssetAnalysisDoc, speech: SpeechSegment): EditronSegment | null {
  const startMs = nonNegativeNumber(speech.startMs);
  const endMs = positiveNumber(speech.endMs);
  if (startMs == null || endMs == null || endMs <= startMs) return null;
  const text = typeof speech.text === 'string' ? speech.text.trim() : '';

  return {
    startMs,
    endMs,
    transcript: { text, wordCount: text ? text.split(/\s+/).length : 0 },
    visual: segmentVisual(analysis, startMs, endMs),
    vocal: segmentVocal(analysis, startMs, endMs),
    semanticVisual: segmentSemanticVisual(analysis, startMs),
    weight: segmentWeight(analysis, startMs, endMs),
  };
}

function wordMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function secToMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value * 1000)
    : undefined;
}

function cleanWords(words: unknown): SourceWord[] {
  if (!Array.isArray(words)) return [];
  const out: SourceWord[] = [];
  for (const item of words) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as SourceWord;
    const word = typeof raw.word === 'string' && raw.word.trim()
      ? raw.word.trim()
      : typeof raw.text === 'string' && raw.text.trim()
        ? raw.text.trim()
        : '';
    const startMs = wordMs(raw.startMs) ?? secToMs(raw.start);
    const endMs = wordMs(raw.endMs) ?? secToMs(raw.end);
    if (!word || startMs == null || endMs == null || endMs <= startMs) continue;
    out.push({
      word,
      startMs,
      endMs,
      ...(typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
        ? { confidence: Math.max(0, Math.min(1, raw.confidence)) }
        : {}),
    });
  }
  return out;
}

function sourceWords(analysis: AssetAnalysisDoc): SourceWord[] {
  const direct = cleanWords(analysis.transcription?.words);
  if (direct.length > 0) return direct;
  const raw = cleanWords(analysis.rawFootageAnalysis?.transcription?.words);
  if (raw.length > 0) return raw;
  if (analysis.audio && typeof analysis.audio === 'object') {
    const audio = analysis.audio as { transcription?: { words?: unknown }; words?: unknown };
    const audioTranscription = cleanWords(audio.transcription?.words);
    if (audioTranscription.length > 0) return audioTranscription;
    const audioWords = cleanWords(audio.words);
    if (audioWords.length > 0) return audioWords;
  }
  return [];
}

function sourceLanguage(analysis: AssetAnalysisDoc): string | undefined {
  const direct = analysis.transcription?.language;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const raw = analysis.rawFootageAnalysis?.transcription?.language;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return undefined;
}

function fullSegmentAnalysis(analysis: AssetAnalysisDoc): { segments: EditronSegment[] } & Record<string, unknown> | null {
  if (!analysis.segmentAnalysis || typeof analysis.segmentAnalysis !== 'object') return null;
  const candidate = analysis.segmentAnalysis as { segments?: unknown; globalContext?: unknown } & Record<string, unknown>;
  return Array.isArray(candidate.segments) && candidate.globalContext
    ? candidate as { segments: EditronSegment[] } & Record<string, unknown>
    : null;
}

function visualWindowToSegment(analysis: AssetAnalysisDoc, startMs: number, endMs: number): EditronSegment | null {
  if (!(endMs > startMs)) return null;
  return {
    startMs,
    endMs,
    transcript: { text: '', wordCount: 0 },
    visual: segmentVisual(analysis, startMs, endMs),
    vocal: segmentVocal(analysis, startMs, endMs),
    semanticVisual: segmentSemanticVisual(analysis, startMs),
    weight: segmentWeight(analysis, startMs, endMs),
  };
}

export function buildComposableSegmentsFromAssetAnalysis(
  analysis: AssetAnalysisDoc,
  fallbackDurationSec?: number,
): EditronSegment[] {
  const speechSegments = (analysis.speechSegments ?? [])
    .map((speech) => speechToSegment(analysis, speech))
    .filter((segment): segment is EditronSegment => !!segment);
  if (speechSegments.length > 0) return speechSegments;

  const motionSegments = (analysis.motionSegments ?? [])
    .map((motion) => {
      const startMs = frameToMs(motion.startFrame) ?? 0;
      const endMs = frameToMs(motion.endFrame) ?? startMs + DEFAULT_VISUAL_WINDOW_MS;
      return visualWindowToSegment(analysis, startMs, endMs);
    })
    .filter((segment): segment is EditronSegment => !!segment);
  if (motionSegments.length > 0) return motionSegments;

  const shotSegments = (analysis.shots ?? [])
    .map((shot) => {
      const startMs = frameToMs(shot.startFrame) ?? 0;
      const endMs = frameToMs(shot.endFrame) ?? startMs + (positiveNumber(shot.durationMs) ?? DEFAULT_VISUAL_WINDOW_MS);
      return visualWindowToSegment(analysis, startMs, endMs);
    })
    .filter((segment): segment is EditronSegment => !!segment);
  if (shotSegments.length > 0) return shotSegments;

  const durationMs = positiveNumber(analysis.durationMs) ?? (positiveNumber(fallbackDurationSec) ?? 0) * 1000;
  const endMs = durationMs > 0 ? Math.min(durationMs, DEFAULT_VISUAL_WINDOW_MS) : 0;
  const wholeAsset = visualWindowToSegment(analysis, 0, endMs);
  return wholeAsset ? [wholeAsset] : [];
}

export async function hydrateStorylineAnalysesForBatch(
  db: BridgeDb,
  params: {
    projectId: string;
    userId: string;
    assets: readonly BridgeAsset[];
    now?: Date;
  },
): Promise<StorylineAnalysisBridgeResult> {
  const videoAssets = params.assets.filter((asset) => asset.type === 'video' && asset.assetId.trim());
  const result: StorylineAnalysisBridgeResult = {
    attemptedAssetCount: videoAssets.length,
    sourceAnalysisCount: 0,
    persistedAssetCount: 0,
    segmentCount: 0,
    skipped: [],
  };

  if (videoAssets.length === 0) return result;

  const ids = videoAssets.map((asset) => asset.assetId);
  const analyses = await db.collection(ASSET_ANALYSES_COLLECTION)
    .find({ assetId: { $in: ids }, userId: params.userId, status: 'complete' })
    .toArray();
  result.sourceAnalysisCount = analyses.length;

  const analysisByAsset = new Map(analyses.map((analysis) => [analysis.assetId, analysis]));
  const now = params.now ?? new Date();

  for (const asset of videoAssets) {
    const analysis = analysisByAsset.get(asset.assetId);
    if (!analysis) {
      result.skipped.push({ assetId: asset.assetId, reason: 'missing_asset_analysis' });
      continue;
    }

    const completeSegmentAnalysis = fullSegmentAnalysis(analysis);
    const segments = completeSegmentAnalysis?.segments
      ?? buildComposableSegmentsFromAssetAnalysis(analysis, positiveNumber(asset.duration));
    if (segments.length === 0) {
      result.skipped.push({ assetId: asset.assetId, reason: 'no_composable_segments' });
      continue;
    }

    const language = sourceLanguage(analysis);

    await persistProjectAssetAnalysis(db, params.projectId, asset.assetId, {
      rawFootageAnalysis: analysis.rawFootageAnalysis ?? {
        transcription: {
          transcript: segments.map((segment) => segment.transcript?.text).filter(Boolean).join(' '),
          words: sourceWords(analysis),
          ...(language ? { language } : {}),
        },
      },
      segmentAnalysis: completeSegmentAnalysis ?? {
        version: 1,
        source: 'asset_analyses_bridge',
        segments,
        meta: {
          sourceAssetAnalysis: true,
          segmentCount: segments.length,
          analysisQuality: analysis.analysisQuality ?? null,
        },
      },
      vjepaAnalysis: analysis.vjepaAnalysis ?? undefined,
      wav2vecAnalysis: analysis.wav2vecAnalysis ?? undefined,
      momentWeightMap: analysis.momentWeightMap ?? undefined,
      musicAnalysis: analysis.musicAnalysis ?? analysis.musicStructure ?? analysis.audio ?? undefined,
    }, now);

    result.persistedAssetCount += 1;
    result.segmentCount += segments.length;
  }

  return result;
}
