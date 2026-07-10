import type { RawFootageAnalysis } from './raw-footage-processor';
import type { RawFootageAnalysis as SignalRawFootageAnalysis } from './signal-registry';
import {
  analyzeVideoWithVjepa,
  buildVjepaCoverageSegments,
  toVjepaWeightFormat,
  type VjepaAnalysisResult,
  type VjepaSegmentInput,
} from './vjepa-service';
import {
  analyzeAudioWithWav2Vec,
  toWav2VecWeightFormat,
  type Wav2VecAnalysisResult,
  type Wav2VecSegmentInput,
} from './wav2vec-service';
import { analyzeMusicContent, type MusicAnalysisResult } from './music-analysis-service';
import {
  buildMomentWeightMap,
  integrateVjepaScores,
  integrateWav2vecScores,
  type MomentWeightMap,
} from './moment-weight-service';
import { buildSegmentAnalysis } from './segment-analysis-builder';
import type { SegmentAnalysis } from '../types/segment-analysis';

type SourceSpeechSegment = { startMs?: number; endMs?: number; text?: string };

export type AssetDeepAnalysisSource = {
  durationMs?: number;
  speechSegments?: SourceSpeechSegment[];
};

export type AssetDeepAnalysisInput = {
  videoUrl: string;
  durationMs: number;
  sourceAnalysis?: AssetDeepAnalysisSource | null;
};

export type AssetDeepAnalysisDiagnostics = {
  status: 'complete' | 'degraded';
  canonicalWindowCount: number;
  speechWindowCount: number;
  providers: {
    vjepa: 'complete' | 'missing' | 'failed';
    wav2vec: 'complete' | 'not-applicable' | 'missing' | 'failed';
    music: 'complete' | 'missing' | 'failed';
  };
  errors: string[];
};

export type AssetDeepAnalysisResult = {
  rawFootageAnalysis: RawFootageAnalysis;
  vjepaAnalysis: VjepaAnalysisResult | null;
  wav2vecAnalysis: Wav2VecAnalysisResult | null;
  musicAnalysis: MusicAnalysisResult | null;
  momentWeightMap: MomentWeightMap;
  segmentAnalysis: SegmentAnalysis | null;
  diagnostics: AssetDeepAnalysisDiagnostics;
};

export type AssetDeepAnalysisDependencies = {
  analyzeVjepa(videoUrl: string, segments: VjepaSegmentInput[]): Promise<VjepaAnalysisResult | null>;
  analyzeWav2vec(audioUrl: string, segments: Wav2VecSegmentInput[]): Promise<Wav2VecAnalysisResult | null>;
  analyzeMusic(videoUrl: string): Promise<MusicAnalysisResult | null>;
};

const DEFAULT_DEPENDENCIES: AssetDeepAnalysisDependencies = {
  analyzeVjepa: analyzeVideoWithVjepa,
  analyzeWav2vec: analyzeAudioWithWav2Vec,
  analyzeMusic: analyzeMusicContent,
};

function finiteMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function cleanSpeechSegments(source: AssetDeepAnalysisSource | null | undefined): Array<Required<SourceSpeechSegment>> {
  return (source?.speechSegments ?? [])
    .map((segment) => {
      const startMs = finiteMs(segment.startMs);
      const endMs = finiteMs(segment.endMs);
      if (startMs === null || endMs === null || endMs <= startMs) return null;
      return { startMs, endMs, text: typeof segment.text === 'string' ? segment.text.trim() : '' };
    })
    .filter((segment): segment is Required<SourceSpeechSegment> => segment !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function overlaps(startMs: number, endMs: number, otherStartMs: number, otherEndMs: number): boolean {
  return Math.max(startMs, otherStartMs) < Math.min(endMs, otherEndMs);
}

export function buildAssetDeepAnalysisTimeline(input: AssetDeepAnalysisInput): {
  rawFootageAnalysis: RawFootageAnalysis;
  visualWindows: VjepaSegmentInput[];
  speechWindows: Wav2VecSegmentInput[];
} {
  const sourceDurationMs = finiteMs(input.sourceAnalysis?.durationMs) ?? 0;
  const durationMs = Math.max(finiteMs(input.durationMs) ?? 0, sourceDurationMs);
  const speech = cleanSpeechSegments(input.sourceAnalysis);
  const speechWindows = speech.map(({ startMs, endMs }) => ({ startMs, endMs }));
  const visualWindows = buildVjepaCoverageSegments(durationMs, speechWindows);
  const segments = visualWindows.map((window, index) => {
    const matchingSpeech = speech.filter((segment) => overlaps(window.startMs, window.endMs, segment.startMs, segment.endMs));
    const text = matchingSpeech.map((segment) => segment.text).filter(Boolean).join(' ');
    return {
      startMs: window.startMs,
      endMs: window.endMs,
      text,
      wordCount: text ? text.split(/\s+/).length : 0,
      words: [],
      fillerCount: 0,
      silenceGapCount: 0,
      avgWordGapMs: 0,
      index,
    };
  });
  const speechDurationMs = speech.reduce(
    (total, segment) => total + Math.max(0, segment.endMs - segment.startMs),
    0,
  );
  const speechCoverage = durationMs > 0 ? Math.min(1, speechDurationMs / durationMs) : 0;
  const transcript = speech.map((segment) => segment.text).filter(Boolean).join(' ');

  return {
    rawFootageAnalysis: {
      transcription: {
        words: [],
        transcript,
        language: 'unknown',
        confidence: 0,
        generatedAt: new Date(),
      },
      silenceGaps: [],
      fillerWords: [],
      segments,
      bestTakeSelections: [],
      silenceRemovalPlan: [],
      originalDurationMs: durationMs,
      estimatedCleanDurationMs: durationMs,
      speechCoverage,
      needsVisualDrivenEditing: speechCoverage < 0.3,
    } as unknown as RawFootageAnalysis,
    visualWindows,
    speechWindows,
  };
}

function errorMessage(result: PromiseSettledResult<unknown>, provider: string): string | null {
  if (result.status !== 'rejected') return null;
  const detail = result.reason instanceof Error ? result.reason.message : String(result.reason);
  return `${provider}: ${detail}`.slice(0, 500);
}

function projectWav2vecScoresToCanonicalWindows(
  windows: VjepaSegmentInput[],
  analysis: Wav2VecAnalysisResult,
): Array<{ startMs: number; endMs: number; emotionIntensity: number }> {
  const source = toWav2VecWeightFormat(analysis);
  return windows.flatMap((window) => {
    const overlapping = source
      .map((segment) => ({
        segment,
        overlapMs: Math.max(0, Math.min(window.endMs, segment.endMs) - Math.max(window.startMs, segment.startMs)),
      }))
      .filter(({ overlapMs }) => overlapMs > 0);
    if (overlapping.length === 0) return [];
    const totalOverlapMs = overlapping.reduce((sum, item) => sum + item.overlapMs, 0);
    const emotionIntensity = overlapping.reduce(
      (sum, item) => sum + item.segment.emotionIntensity * item.overlapMs,
      0,
    ) / totalOverlapMs;
    return [{ startMs: window.startMs, endMs: window.endMs, emotionIntensity }];
  });
}

export async function runAssetDeepAnalysis(
  input: AssetDeepAnalysisInput,
  dependencies: AssetDeepAnalysisDependencies = DEFAULT_DEPENDENCIES,
): Promise<AssetDeepAnalysisResult> {
  const timeline = buildAssetDeepAnalysisTimeline(input);
  const [vjepaResult, wav2vecResult, musicResult] = await Promise.allSettled([
    dependencies.analyzeVjepa(input.videoUrl, timeline.visualWindows),
    timeline.speechWindows.length > 0
      ? dependencies.analyzeWav2vec(input.videoUrl, timeline.speechWindows)
      : Promise.resolve(null),
    dependencies.analyzeMusic(input.videoUrl),
  ]);
  const vjepaAnalysis = vjepaResult.status === 'fulfilled' ? vjepaResult.value : null;
  const wav2vecAnalysis = wav2vecResult.status === 'fulfilled' ? wav2vecResult.value : null;
  const musicAnalysis = musicResult.status === 'fulfilled' ? musicResult.value : null;

  let momentWeightMap = buildMomentWeightMap(
    null,
    timeline.rawFootageAnalysis as unknown as SignalRawFootageAnalysis,
  );
  if (vjepaAnalysis) momentWeightMap = integrateVjepaScores(momentWeightMap, toVjepaWeightFormat(vjepaAnalysis));
  if (wav2vecAnalysis) {
    momentWeightMap = integrateWav2vecScores(
      momentWeightMap,
      projectWav2vecScoresToCanonicalWindows(timeline.visualWindows, wav2vecAnalysis),
    );
  }

  const segmentAnalysis = buildSegmentAnalysis(
    timeline.rawFootageAnalysis,
    null,
    vjepaAnalysis,
    wav2vecAnalysis,
    momentWeightMap,
  );
  const errors = [
    errorMessage(vjepaResult, 'vjepa'),
    errorMessage(wav2vecResult, 'wav2vec'),
    errorMessage(musicResult, 'music'),
  ].filter((message): message is string => message !== null);

  return {
    rawFootageAnalysis: timeline.rawFootageAnalysis,
    vjepaAnalysis,
    wav2vecAnalysis,
    musicAnalysis,
    momentWeightMap,
    segmentAnalysis,
    diagnostics: {
      status: !vjepaAnalysis || errors.length > 0 ? 'degraded' : 'complete',
      canonicalWindowCount: timeline.visualWindows.length,
      speechWindowCount: timeline.speechWindows.length,
      providers: {
        vjepa: vjepaResult.status === 'rejected' ? 'failed' : vjepaAnalysis ? 'complete' : 'missing',
        wav2vec: timeline.speechWindows.length === 0
          ? 'not-applicable'
          : wav2vecResult.status === 'rejected'
            ? 'failed'
            : wav2vecAnalysis ? 'complete' : 'missing',
        music: musicResult.status === 'rejected' ? 'failed' : musicAnalysis ? 'complete' : 'missing',
      },
      errors,
    },
  };
}
