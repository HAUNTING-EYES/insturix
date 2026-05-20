/**
 * Footage Matcher — Match user video segments to reference scenes.
 *
 * Per EDITRON_MATCH_EDIT_PLAN.md Phase 2:
 * 1. Get user video transcription (Whisper, cached)
 * 2. Segment transcript by pauses + sentence boundaries
 * 3. For each ReferenceScene: Jaccard match against each user segment
 * 4. Return MatchPlan with matched + gaps
 *
 * NO AI calls. Pure text similarity. The reference narrationSummary
 * from Gemini is semantically rich, Whisper transcripts are word-accurate.
 *
 * Threshold is configurable (default 0.25 = conservative/loose matching).
 */

import type { ReferenceScene } from './reference-content-extractor';
import type { TranscriptionWord } from './media/types';

// ─── Types ──────────────────────────────────────────────────────

export interface MatchedSegment {
  referenceScene: ReferenceScene;
  userSegment: {
    startMs: number;
    endMs: number;
    text: string;
  };
  confidence: number;
}

export interface GapScene {
  referenceScene: ReferenceScene;
  estimatedDurationSec: number;
}

export interface MatchPlan {
  matched: MatchedSegment[];
  gaps: GapScene[];
  totalReferenceScenes: number;
  coveragePercent: number;
}

// ─── Segmentation (reuses auto-edit-service pattern) ────────────

const PAUSE_THRESHOLD_MS = 1000;
const SENTENCE_END = /[.!?]$/;

interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  wordCount: number;
}

function segmentTranscript(words: TranscriptionWord[]): TranscriptSegment[] {
  if (words.length === 0) return [];

  const segments: TranscriptSegment[] = [];
  let currentWords: TranscriptionWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const curr = words[i];
    const gap = curr.startMs - prev.endMs;
    const prevEndsSentence = SENTENCE_END.test(prev.word.trim());

    if (gap >= PAUSE_THRESHOLD_MS || prevEndsSentence) {
      segments.push({
        text: currentWords.map(w => w.word).join(' '),
        startMs: currentWords[0].startMs,
        endMs: currentWords[currentWords.length - 1].endMs,
        wordCount: currentWords.length,
      });
      currentWords = [curr];
    } else {
      currentWords.push(curr);
    }
  }

  if (currentWords.length > 0) {
    segments.push({
      text: currentWords.map(w => w.word).join(' '),
      startMs: currentWords[0].startMs,
      endMs: currentWords[currentWords.length - 1].endMs,
      wordCount: currentWords.length,
    });
  }

  return segments;
}

// ─── Jaccard Similarity ─────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2) // skip short words (a, is, the, etc.)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Match user video footage against reference content map.
 *
 * @param userAssetId - User's video asset ID (for cached transcription lookup)
 * @param userId - Asset owner
 * @param contentMap - Reference video's scene breakdown (from extractReferenceAnalysis)
 * @param matchThreshold - Jaccard score above which = matched (default 0.25)
 */
export async function matchFootage(
  userAssetId: string,
  userId: string,
  contentMap: ReferenceScene[],
  matchThreshold: number = 0.25,
): Promise<MatchPlan> {
  // 1. Get user video transcription
  const { getTranscription } = await import('./media/transcription-service');
  let transcription;
  try {
    transcription = await getTranscription(userAssetId, userId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[FootageMatcher] Transcription failed: ${msg}. All scenes → gaps.`);
    return {
      matched: [],
      gaps: contentMap.map(scene => ({
        referenceScene: scene,
        estimatedDurationSec: scene.endApproxSec - scene.startApproxSec,
      })),
      totalReferenceScenes: contentMap.length,
      coveragePercent: 0,
    };
  }

  // 2. Segment transcript
  const segments = segmentTranscript(transcription.words || []);
  console.log(`[FootageMatcher] ${segments.length} user segments, ${contentMap.length} reference scenes`);

  // 3. For each reference scene, find best matching user segment
  const matched: MatchedSegment[] = [];
  const gaps: GapScene[] = [];
  const usedSegmentIndices = new Set<number>();

  for (const refScene of contentMap) {
    const refTokens = tokenize(
      `${refScene.narrationSummary} ${refScene.description} ${refScene.keyVisuals.join(' ')}`
    );

    let bestScore = 0;
    let bestSegmentIdx = -1;

    for (let i = 0; i < segments.length; i++) {
      if (usedSegmentIndices.has(i)) continue; // each segment used once
      const segTokens = tokenize(segments[i].text);
      const score = jaccardSimilarity(refTokens, segTokens);
      if (score > bestScore) {
        bestScore = score;
        bestSegmentIdx = i;
      }
    }

    if (bestScore >= matchThreshold && bestSegmentIdx >= 0) {
      usedSegmentIndices.add(bestSegmentIdx);
      matched.push({
        referenceScene: refScene,
        userSegment: {
          startMs: segments[bestSegmentIdx].startMs,
          endMs: segments[bestSegmentIdx].endMs,
          text: segments[bestSegmentIdx].text,
        },
        confidence: bestScore,
      });
    } else {
      gaps.push({
        referenceScene: refScene,
        estimatedDurationSec: refScene.endApproxSec - refScene.startApproxSec,
      });
    }
  }

  const coveragePercent = contentMap.length > 0
    ? Math.round((matched.length / contentMap.length) * 100)
    : 0;

  console.log(`[FootageMatcher] Result: ${matched.length} matched (${coveragePercent}%), ${gaps.length} gaps`);

  return { matched, gaps, totalReferenceScenes: contentMap.length, coveragePercent };
}
