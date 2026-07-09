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

type SubjectTrack = {
  category?: string;
  frames?: Array<{ frame?: number; box?: { h?: number } }>;
};

type AssetAnalysisDoc = {
  assetId: string;
  userId?: string;
  status?: string;
  durationMs?: number;
  speechSegments?: SpeechSegment[];
  motionSegments?: MotionSegment[];
  shots?: Shot[];
  keyframeAnalyses?: FrameAnalysis[];
  subjectTracks?: SubjectTrack[];
  analysisQuality?: 'high' | 'medium' | 'low' | 'fallback';
  confidenceBreakdown?: Record<string, number>;
  musicStructure?: unknown;
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

function frameToMs(frame: unknown): number | undefined {
  const n = positiveNumber(frame);
  return n == null ? undefined : Math.round((n / FPS) * 1000);
}

function clamp01(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
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

function mainSubjectHeight(analysis: AssetAnalysisDoc, frame?: number): number | undefined {
  const fromTrack = analysis.subjectTracks
    ?.flatMap((track) => track.frames ?? [])
    .filter((item) => typeof item.box?.h === 'number')
    .sort((a, b) => Math.abs((a.frame ?? 0) - (frame ?? 0)) - Math.abs((b.frame ?? 0) - (frame ?? 0)))[0]?.box?.h;
  return clamp01(fromTrack);
}

function segmentVisual(analysis: AssetAnalysisDoc, startMs: number, endMs: number): EditronSegment['visual'] {
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

function segmentSemanticVisual(analysis: AssetAnalysisDoc, startMs: number): EditronSegment['semanticVisual'] {
  const keyframe = nearestKeyframe(analysis, startMs);
  const hasPerson = (analysis.subjectTracks ?? []).some((track) => track.category === 'person');
  const hasText = (keyframe?.subjects ?? []).some((subject) => subject.category === 'text' || subject.category === 'logo');
  const mode = hasText ? 'screen-share' : hasPerson ? 'talking-head' : undefined;

  return {
    primaryVisualMode: mode ?? null,
    salience: clamp01(keyframe?.energyLevel ?? analysis.confidenceBreakdown?.vision) ?? null,
    visuallyExplains: hasText ? true : null,
  };
}

function segmentWeight(analysis: AssetAnalysisDoc, speechConfidence?: number, visualScore?: number): EditronSegment['weight'] {
  const confidence = confidenceLabel(analysis);
  const score = clamp01(Math.max(
    speechConfidence ?? 0,
    visualScore ?? 0,
    analysis.confidenceBreakdown?.speech ?? 0,
    analysis.confidenceBreakdown?.vision ?? 0,
  ));
  return { finalWeight: score ?? 0.35, confidence };
}

function speechToSegment(analysis: AssetAnalysisDoc, speech: SpeechSegment): EditronSegment | null {
  const startMs = positiveNumber(speech.startMs);
  const endMs = positiveNumber(speech.endMs);
  if (startMs == null || endMs == null || endMs <= startMs) return null;
  const text = typeof speech.text === 'string' ? speech.text.trim() : '';
  const keyframe = nearestKeyframe(analysis, startMs);

  return {
    startMs,
    endMs,
    transcript: { text, wordCount: text ? text.split(/\s+/).length : 0 },
    visual: segmentVisual(analysis, startMs, endMs),
    semanticVisual: segmentSemanticVisual(analysis, startMs),
    weight: segmentWeight(analysis, clamp01(speech.confidence), clamp01(keyframe?.energyLevel)),
  };
}

function visualWindowToSegment(analysis: AssetAnalysisDoc, startMs: number, endMs: number): EditronSegment | null {
  if (!(endMs > startMs)) return null;
  const keyframe = nearestKeyframe(analysis, startMs);
  return {
    startMs,
    endMs,
    transcript: { text: '', wordCount: 0 },
    visual: segmentVisual(analysis, startMs, endMs),
    semanticVisual: segmentSemanticVisual(analysis, startMs),
    weight: segmentWeight(analysis, undefined, clamp01(keyframe?.energyLevel)),
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

    const segments = buildComposableSegmentsFromAssetAnalysis(analysis, positiveNumber(asset.duration));
    if (segments.length === 0) {
      result.skipped.push({ assetId: asset.assetId, reason: 'no_composable_segments' });
      continue;
    }

    await persistProjectAssetAnalysis(db, params.projectId, asset.assetId, {
      rawFootageAnalysis: {
        transcription: {
          transcript: segments.map((segment) => segment.transcript?.text).filter(Boolean).join(' '),
          words: [],
        },
      },
      segmentAnalysis: {
        version: 1,
        source: 'asset_analyses_bridge',
        segments,
        meta: {
          sourceAssetAnalysis: true,
          segmentCount: segments.length,
          analysisQuality: analysis.analysisQuality ?? null,
        },
      },
      musicAnalysis: analysis.musicStructure ?? analysis.audio ?? undefined,
    }, now);

    result.persistedAssetCount += 1;
    result.segmentCount += segments.length;
  }

  return result;
}
