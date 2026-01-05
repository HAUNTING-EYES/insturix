/**
 * Audio Analysis Service
 * 
 * Programmatic analysis of audio content for silence gaps and filler words.
 * Returns timeline-ready data for AI agent consumption.
 * 
 * Key insight: Filler words WITH surrounding silence are the worst offenders.
 */

import type { 
  ContentAnalysis, 
  AudioAnalysisOptions,
  SilenceGap,
  DetectedFiller,
  ProblematicSegment,
  TranscriptionWord,
  TranscriptionData,
} from './types';
import { FILLER_WORDS, DEFAULTS } from './types';
import { getTranscription } from './transcription-service';

/**
 * Analyze video/audio content for silences and filler words
 * 
 * @param assetId - Asset to analyze
 * @param userId - User ID for authorization
 * @param options - Analysis options
 */
export async function analyzeContent(
  assetId: string,
  userId: string,
  options: AudioAnalysisOptions = {}
): Promise<ContentAnalysis> {
  const {
    silenceThresholdMs = DEFAULTS.SILENCE_THRESHOLD_MS,
    detectFillers = true,
  } = options;
  
  // Get transcription (cached or fresh)
  const transcription = await getTranscription(assetId, userId);
  
  // Detect silences
  const silenceGaps = detectSilenceGaps(transcription.words, silenceThresholdMs);
  
  // Detect filler words
  const fillerWords = detectFillers 
    ? detectFillerWords(transcription.words, silenceGaps)
    : [];
  
  // Identify problematic segments (worst offenders)
  const problematicSegments = identifyProblematicSegments(silenceGaps, fillerWords);
  
  // Calculate summary
  const totalSilenceMs = silenceGaps.reduce((sum, g) => sum + g.durationMs, 0);
  const potentialSavingsMs = problematicSegments.reduce(
    (sum, s) => sum + (s.endMs - s.startMs), 
    0
  );
  
  return {
    silenceGaps,
    fillerWords,
    problematicSegments,
    summary: {
      totalSilenceMs,
      totalFillerWords: fillerWords.length,
      problematicCount: problematicSegments.length,
      potentialSavingsMs,
    },
  };
}

/**
 * Detect gaps between words that exceed the threshold
 */
function detectSilenceGaps(
  words: TranscriptionWord[],
  thresholdMs: number
): SilenceGap[] {
  const gaps: SilenceGap[] = [];
  
  for (let i = 0; i < words.length - 1; i++) {
    const currentWord = words[i];
    const nextWord = words[i + 1];
    
    const gapMs = nextWord.startMs - currentWord.endMs;
    
    if (gapMs >= thresholdMs) {
      gaps.push({
        startMs: currentWord.endMs,
        endMs: nextWord.startMs,
        durationMs: gapMs,
        beforeWord: currentWord.word,
        afterWord: nextWord.word,
      });
    }
  }
  
  return gaps;
}

/**
 * Detect filler words in the transcription
 */
function detectFillerWords(
  words: TranscriptionWord[],
  silenceGaps: SilenceGap[]
): DetectedFiller[] {
  const fillers: DetectedFiller[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lowerWord = word.word.toLowerCase().replace(/[.,!?]/g, '');
    
    // Check if word is a filler
    const isFiller = FILLER_WORDS.some(f => {
      // Handle multi-word fillers like "you know"
      if (f.includes(' ')) {
        const nextWord = words[i + 1];
        if (nextWord) {
          const twoWords = `${lowerWord} ${nextWord.word.toLowerCase().replace(/[.,!?]/g, '')}`;
          return twoWords === f;
        }
        return false;
      }
      return lowerWord === f;
    });
    
    if (isFiller) {
      // Check for surrounding silence
      const { hasSurrounding, totalGap } = checkSurroundingSilence(
        word,
        words[i - 1],
        words[i + 1],
        DEFAULTS.MIN_SURROUNDING_SILENCE_MS
      );
      
      fillers.push({
        word: word.word,
        startMs: word.startMs,
        endMs: word.endMs,
        hasSurroundingSilence: hasSurrounding,
        totalGapMs: hasSurrounding ? totalGap : (word.endMs - word.startMs),
      });
    }
  }
  
  return fillers;
}

/**
 * Check if there's significant silence around a word
 */
function checkSurroundingSilence(
  word: TranscriptionWord,
  prevWord: TranscriptionWord | undefined,
  nextWord: TranscriptionWord | undefined,
  minSilenceMs: number
): { hasSurrounding: boolean; totalGap: number } {
  let silenceBefore = 0;
  let silenceAfter = 0;
  
  if (prevWord) {
    silenceBefore = word.startMs - prevWord.endMs;
  }
  
  if (nextWord) {
    silenceAfter = nextWord.startMs - word.endMs;
  }
  
  const totalGap = silenceBefore + (word.endMs - word.startMs) + silenceAfter;
  const hasSurrounding = silenceBefore >= minSilenceMs || silenceAfter >= minSilenceMs;
  
  return { hasSurrounding, totalGap };
}

/**
 * Identify segments that are candidates for removal
 */
function identifyProblematicSegments(
  silenceGaps: SilenceGap[],
  fillerWords: DetectedFiller[]
): ProblematicSegment[] {
  const segments: ProblematicSegment[] = [];
  
  // Add long silences as problematic
  for (const gap of silenceGaps) {
    const severity = gap.durationMs > 5000 ? 'high' : 
                     gap.durationMs > 3000 ? 'medium' : 'low';
    
    segments.push({
      startMs: gap.startMs,
      endMs: gap.endMs,
      reason: 'long_silence',
      severity,
      description: `${(gap.durationMs / 1000).toFixed(1)}s silence after "${gap.beforeWord}"`,
    });
  }
  
  // Add fillers with surrounding silence as problematic (these are the worst)
  for (const filler of fillerWords) {
    if (filler.hasSurroundingSilence) {
      segments.push({
        startMs: filler.startMs,
        endMs: filler.endMs,
        reason: 'filler_with_silence',
        severity: filler.totalGapMs > 2000 ? 'high' : 'medium',
        description: `"${filler.word}" with ${(filler.totalGapMs / 1000).toFixed(1)}s total gap`,
      });
    }
  }
  
  // Sort by start time
  segments.sort((a, b) => a.startMs - b.startMs);
  
  return segments;
}

/**
 * Convert analysis results to timeline frames for AI agent
 */
export function analysisToTimelineFrames(
  analysis: ContentAnalysis,
  clipFrom: number,
  videoStartTime: number,
  fps: number
): ContentAnalysis & { 
  silenceGapsFrames: Array<{ startFrame: number; endFrame: number }>;
  problematicFrames: Array<{ startFrame: number; endFrame: number; description: string }>;
} {
  const msToFrame = (ms: number) => {
    const adjustedMs = ms - (videoStartTime * 1000);
    return clipFrom + Math.round((adjustedMs / 1000) * fps);
  };
  
  return {
    ...analysis,
    silenceGapsFrames: analysis.silenceGaps.map(g => ({
      startFrame: msToFrame(g.startMs),
      endFrame: msToFrame(g.endMs),
    })),
    problematicFrames: analysis.problematicSegments.map(s => ({
      startFrame: msToFrame(s.startMs),
      endFrame: msToFrame(s.endMs),
      description: s.description,
    })),
  };
}
