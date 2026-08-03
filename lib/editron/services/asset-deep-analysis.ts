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
import { DEFAULT_CONFIG } from '../config/editron-config';
import {
  analyzeVideo,
  type SyntheticStoryboard,
} from './video-understanding-service';

type SourceSpeechSegment = { startMs?: number; endMs?: number; text?: string };
type SourceWord = { word?: string; startMs?: number; endMs?: number; confidence?: number; speaker?: number };
type CanonicalSourceWord = { word: string; startMs: number; endMs: number; confidence: number; speaker?: number };

export const ASSET_DEEP_ANALYSIS_VERSION = 2;

const DEFAULT_ASSET_DEEP_ANALYSIS_PROVIDER_TIMEOUT_MS = 275_000;
const MAX_ASSET_DEEP_ANALYSIS_PROVIDER_TIMEOUT_MS = 275_000;
const DEFAULT_ASSET_DEEP_ANALYSIS_CLAIM_STALE_MS = 5 * 60 * 1000;

export type AssetDeepAnalysisSource = {
  durationMs?: number;
  speechSegments?: SourceSpeechSegment[];
  transcription?: {
    words?: SourceWord[];
    transcript?: string;
    language?: string;
    confidence?: number;
  };
};

export type AssetDeepAnalysisInput = {
  videoUrl: string;
  durationMs: number;
  sourceAnalysis?: AssetDeepAnalysisSource | null;
};

export type AssetDeepAnalysisDiagnostics = {
  version: typeof ASSET_DEEP_ANALYSIS_VERSION;
  status: 'complete' | 'degraded';
  canonicalWindowCount: number;
  speechWindowCount: number;
  semanticVisualWindowCount: number;
  providers: {
    semanticVisual: 'complete' | 'missing' | 'failed';
    vjepa: 'complete' | 'missing' | 'failed';
    wav2vec: 'complete' | 'not-applicable' | 'missing' | 'failed';
    music: 'complete' | 'missing' | 'failed';
  };
  errors: string[];
};

export type AssetDeepAnalysisResult = {
  rawFootageAnalysis: RawFootageAnalysis;
  syntheticStoryboard: SyntheticStoryboard | null;
  vjepaAnalysis: VjepaAnalysisResult | null;
  wav2vecAnalysis: Wav2VecAnalysisResult | null;
  musicAnalysis: MusicAnalysisResult | null;
  momentWeightMap: MomentWeightMap;
  segmentAnalysis: SegmentAnalysis | null;
  diagnostics: AssetDeepAnalysisDiagnostics;
};

export type AssetDeepAnalysisDependencies = {
  analyzeSemanticVisual(videoUrl: string, durationSec: number): Promise<SyntheticStoryboard | null>;
  analyzeVjepa(videoUrl: string, segments: VjepaSegmentInput[]): Promise<VjepaAnalysisResult | null>;
  analyzeWav2vec(audioUrl: string, segments: Wav2VecSegmentInput[]): Promise<Wav2VecAnalysisResult | null>;
  analyzeMusic(videoUrl: string): Promise<MusicAnalysisResult | null>;
};

export type AssetDeepAnalysisOptions = {
  providerTimeoutMs?: number;
};

export function buildAssetDeepAnalysisClaimFilter(
  assetId: string,
  userId: string,
  options: { now?: Date; staleMs?: number } = {},
): Record<string, unknown> {
  const now = options.now ?? new Date();
  const staleMs = Math.max(1, options.staleMs ?? DEFAULT_ASSET_DEEP_ANALYSIS_CLAIM_STALE_MS);
  const staleBefore = new Date(now.getTime() - staleMs);
  return {
    assetId,
    userId,
    $or: [
      { deepAnalysisStatus: { $nin: ['analyzing', 'complete', 'degraded'] } },
      { deepAnalysisStatus: 'analyzing', deepAnalysisStartedAt: { $lt: staleBefore } },
      {
        deepAnalysisStatus: { $in: ['complete', 'degraded'] },
        deepAnalysisVersion: { $ne: ASSET_DEEP_ANALYSIS_VERSION },
      },
    ],
  };
}

const DEFAULT_DEPENDENCIES: AssetDeepAnalysisDependencies = {
  analyzeSemanticVisual: (videoUrl, durationSec) => analyzeVideo(videoUrl, durationSec),
  analyzeVjepa: analyzeVideoWithVjepa,
  analyzeWav2vec: analyzeAudioWithWav2Vec,
  analyzeMusic: analyzeMusicContent,
};

function resolveProviderTimeoutMs(options: AssetDeepAnalysisOptions): number {
  if (typeof options.providerTimeoutMs === 'number' && Number.isFinite(options.providerTimeoutMs)) {
    return Math.max(1, Math.min(MAX_ASSET_DEEP_ANALYSIS_PROVIDER_TIMEOUT_MS, Math.round(options.providerTimeoutMs)));
  }
  const configured = Number(process.env.EDITRON_ASSET_DEEP_ANALYSIS_PROVIDER_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(MAX_ASSET_DEEP_ANALYSIS_PROVIDER_TIMEOUT_MS, Math.round(configured));
  }
  return DEFAULT_ASSET_DEEP_ANALYSIS_PROVIDER_TIMEOUT_MS;
}

async function settleProviderWithin<T>(
  provider: string,
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${provider} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timeout.unref?.();
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function finiteMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function cleanSourceWords(source: AssetDeepAnalysisSource | null | undefined): CanonicalSourceWord[] {
  return (source?.transcription?.words ?? [])
    .map((word): CanonicalSourceWord | null => {
      const text = typeof word.word === 'string' ? word.word.trim() : '';
      const startMs = finiteMs(word.startMs);
      const endMs = finiteMs(word.endMs);
      if (!text || startMs === null || endMs === null || endMs <= startMs) return null;
      return {
        word: text,
        startMs,
        endMs,
        confidence: typeof word.confidence === 'number' && Number.isFinite(word.confidence)
          ? Math.max(0, Math.min(1, word.confidence))
          : 0,
        ...(typeof word.speaker === 'number' ? { speaker: word.speaker } : {}),
      };
    })
    .filter((word): word is CanonicalSourceWord => word !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function speechSegmentsFromWords(words: readonly CanonicalSourceWord[]): Array<Required<SourceSpeechSegment>> {
  if (words.length === 0) return [];
  const segments: Array<Required<SourceSpeechSegment>> = [];
  let current: CanonicalSourceWord[] = [words[0]];
  const flush = () => {
    if (current.length === 0) return;
    segments.push({
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
      text: current.map((word) => word.word).join(' '),
    });
  };
  for (let index = 1; index < words.length; index++) {
    const previous = words[index - 1];
    const word = words[index];
    const pauseBoundary = word.startMs - previous.endMs >= DEFAULT_CONFIG.rawFootage.segmentPauseThresholdMs;
    const sentenceBoundary = /[.!?]["')\]]?$/.test(previous.word);
    if (pauseBoundary || sentenceBoundary) {
      flush();
      current = [word];
    } else {
      current.push(word);
    }
  }
  flush();
  return segments;
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
  const words = cleanSourceWords(input.sourceAnalysis);
  const classifiedSpeech = cleanSpeechSegments(input.sourceAnalysis);
  const speech = classifiedSpeech.length > 0 ? classifiedSpeech : speechSegmentsFromWords(words);
  const speechWindows = speech.map(({ startMs, endMs }) => ({ startMs, endMs }));
  const visualWindows = buildVjepaCoverageSegments(durationMs, speechWindows);
  const segments = visualWindows.map((window, index) => {
    const matchingSpeech = speech.filter((segment) => overlaps(window.startMs, window.endMs, segment.startMs, segment.endMs));
    const matchingWords = words.filter((word) => overlaps(window.startMs, window.endMs, word.startMs, word.endMs));
    const text = matchingSpeech.map((segment) => segment.text).filter(Boolean).join(' ')
      || matchingWords.map((word) => word.word).join(' ');
    const wordGaps = matchingWords.slice(1).map((word, wordIndex) =>
      Math.max(0, word.startMs - matchingWords[wordIndex].endMs),
    );
    return {
      startMs: window.startMs,
      endMs: window.endMs,
      text,
      wordCount: matchingWords.length || (text ? text.split(/\s+/).length : 0),
      words: matchingWords,
      fillerCount: 0,
      silenceGapCount: wordGaps.filter((gap) => gap > 500).length,
      avgWordGapMs: wordGaps.length > 0
        ? Math.round(wordGaps.reduce((sum, gap) => sum + gap, 0) / wordGaps.length)
        : 0,
      index,
    };
  });
  const speechDurationMs = speech.reduce(
    (total, segment) => total + Math.max(0, segment.endMs - segment.startMs),
    0,
  );
  const speechCoverage = durationMs > 0 ? Math.min(1, speechDurationMs / durationMs) : 0;
  const sourceTranscription = input.sourceAnalysis?.transcription;
  const transcript = typeof sourceTranscription?.transcript === 'string' && sourceTranscription.transcript.trim()
    ? sourceTranscription.transcript.trim()
    : words.map((word) => word.word).join(' ');
  const transcriptionConfidence = typeof sourceTranscription?.confidence === 'number' && Number.isFinite(sourceTranscription.confidence)
    ? Math.max(0, Math.min(1, sourceTranscription.confidence))
    : words.length > 0
      ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length
      : 0;

  return {
    rawFootageAnalysis: {
      transcription: {
        words,
        transcript,
        language: typeof sourceTranscription?.language === 'string' && sourceTranscription.language.trim()
          ? sourceTranscription.language.trim()
          : 'unknown',
        confidence: transcriptionConfidence,
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
  options: AssetDeepAnalysisOptions = {},
): Promise<AssetDeepAnalysisResult> {
  const timeline = buildAssetDeepAnalysisTimeline(input);
  const durationSec = timeline.rawFootageAnalysis.originalDurationMs / 1000;
  const providerTimeoutMs = resolveProviderTimeoutMs(options);
  const [semanticVisualResult, vjepaResult, wav2vecResult, musicResult] = await Promise.allSettled([
    settleProviderWithin(
      'semantic-visual',
      dependencies.analyzeSemanticVisual(input.videoUrl, durationSec),
      providerTimeoutMs,
    ),
    settleProviderWithin(
      'vjepa',
      dependencies.analyzeVjepa(input.videoUrl, timeline.visualWindows),
      providerTimeoutMs,
    ),
    timeline.speechWindows.length > 0
      ? settleProviderWithin(
          'wav2vec',
          dependencies.analyzeWav2vec(input.videoUrl, timeline.speechWindows),
          providerTimeoutMs,
        )
      : Promise.resolve(null),
    settleProviderWithin(
      'music',
      dependencies.analyzeMusic(input.videoUrl),
      providerTimeoutMs,
    ),
  ]);
  const syntheticStoryboard = semanticVisualResult.status === 'fulfilled' ? semanticVisualResult.value : null;
  const semanticVisualWindowCount = syntheticStoryboard?.visualPerceptionWindows?.length ?? 0;
  const hasSemanticVisualEvidence = semanticVisualWindowCount > 0;
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
    syntheticStoryboard,
    vjepaAnalysis,
    wav2vecAnalysis,
    momentWeightMap,
  );
  const errors = [
    errorMessage(semanticVisualResult, 'semantic-visual'),
    errorMessage(vjepaResult, 'vjepa'),
    errorMessage(wav2vecResult, 'wav2vec'),
    errorMessage(musicResult, 'music'),
  ].filter((message): message is string => message !== null);

  return {
    rawFootageAnalysis: timeline.rawFootageAnalysis,
    syntheticStoryboard,
    vjepaAnalysis,
    wav2vecAnalysis,
    musicAnalysis,
    momentWeightMap,
    segmentAnalysis,
    diagnostics: {
      version: ASSET_DEEP_ANALYSIS_VERSION,
      status: !hasSemanticVisualEvidence || !vjepaAnalysis || errors.length > 0 ? 'degraded' : 'complete',
      canonicalWindowCount: timeline.visualWindows.length,
      speechWindowCount: timeline.speechWindows.length,
      semanticVisualWindowCount,
      providers: {
        semanticVisual: semanticVisualResult.status === 'rejected'
          ? 'failed'
          : hasSemanticVisualEvidence ? 'complete' : 'missing',
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
