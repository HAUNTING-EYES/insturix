/**
 * Raw Footage Processor — Mode 2 Intelligence Layer
 *
 * Orchestrates transcript-first analysis of user-uploaded raw footage:
 *   1. Transcribe (Deepgram, word-level timestamps)
 *   2. Detect silences from transcript gaps
 *   3. Detect filler words
 *   4. Segment transcript by topic (pause + sentence boundaries)
 *   4.5. Editorial intent detection (Gemini — CONTENT/META_DISCARD/META_KEEP)
 *   5. Best-take selection (repeated phrases → keep best, discard rest)
 *   6. Classify content type (rule-based, no LLM)
 *   7. Build atomic SilenceRemovalPlan (includes editorial intent removals)
 *
 * Output: RawFootageAnalysis — immutable input to silence-removal-executor.ts
 */

import { getTranscription } from '@/lib/editron/services/media';
import { FILLER_WORDS } from '@/lib/editron/services/media/types';
import type { TranscriptionData, TranscriptionWord, SilenceGap, DetectedFiller } from '@/lib/editron/services/media/types';
import { detectContentType, type ContentTypeDetection } from '@/lib/editron/services/content-type-detector';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { classifyRepetitionIntent, type RepetitionDecision } from '@/lib/editron/services/repetition-intent-discriminator';

// ─── Types ───────────────────────────────────────────────────────

export interface SilenceRemovalAction {
  startMs: number;
  endMs: number;
  action: 'remove' | 'shorten' | 'split';
  /** Target duration in ms (only for 'shorten') */
  shortenToMs?: number;
  reason: 'silence' | 'filler' | 'inferior-take' | 'meta-discard' | 'transcript-edit' | 'pacing-split' | 'visual-dead-air';
  /** Evidence for non-destructive pacing boundaries. */
  metadata?: {
    kind?: 'pacing-split' | 'visual-cut' | 'visual-protection';
    source?: 'transcript-segment-boundary' | 'vjepa-visual-boundary' | 'vjepa-visual-dead-air' | 'vjepa-visual-protection';
    calibrationStatus?: 'invented-threshold';
    previousSegmentIndex?: number;
    nextSegmentIndex?: number;
    boundaryReasons?: PacingSplitBoundaryReason[];
    speechGapMs?: number;
    previousEndedSentence?: boolean;
    previousWord?: string;
    nextWord?: string;
    previousTextPreview?: string;
    nextTextPreview?: string;
    keptRangeStartMs?: number;
    keptRangeEndMs?: number;
    keptRangeDurationMs?: number;
    minSplitIntervalMs?: number;
    visualCut?: {
      decision: 'protect-existing-cut' | 'remove-visual-dead-air' | 'split-visual-boundary';
      confidence: number;
      visualSegmentStartMs: number;
      visualSegmentEndMs: number;
      visualSignificance?: number;
      motionIntensity?: number;
      actionType?: string;
      motionType?: string;
      objectCount?: number;
      faceCount?: number;
      textCoverage?: number;
      reasons: string[];
      evidence?: {
        coverageTrust: number;
        viewerValue?: number;
        speechLock?: number;
        boundaryReadiness?: number;
        visualContinuityRisk?: number;
        artifactRisk?: number;
        brollUsefulness?: number;
        cutEligibility?: number;
        boundaryStrength?: number;
        continuityRisk?: number;
        missingEvidence: string[];
      };
    };
  };
}

export type PacingSplitBoundaryReason =
  | 'speech-pause'
  | 'sentence-boundary'
  | 'transcript-segment-boundary'
  | 'visual-state-change'
  | 'visual-motion-change'
  | 'visual-subject-change'
  | 'visual-text-change';

export interface TranscriptBoundaryEvidence {
  gapMs: number;
  previousEndedSentence: boolean;
  previousWord?: string;
  nextWord?: string;
  reasons: PacingSplitBoundaryReason[];
}

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  wordCount: number;
  words: TranscriptionWord[];
  fillerCount: number;
  silenceGapCount: number;
  avgWordGapMs: number;
  /** Index in the segment array */
  index: number;
  /** Evidence for why this segment begins after the previous segment. */
  boundaryBefore?: TranscriptBoundaryEvidence;
}

export interface BestTakeSelection {
  /** The winning segment */
  keptSegment: TranscriptSegment;
  /** Segments that lost (will be removed) */
  inferiorSegments: TranscriptSegment[];
  /** Intent classifier evidence that licensed the inferior-take removal. */
  repetitionIntent?: RepetitionDecision;
  /** Jaccard similarity between the repeated phrases */
  similarity: number;
  /** Composite quality score of the kept take */
  keptScore: number;
}

export interface RawFootageAnalysis {
  transcription: TranscriptionData;
  silenceGaps: SilenceGap[];
  fillerWords: DetectedFiller[];
  segments: TranscriptSegment[];
  bestTakeSelections: BestTakeSelection[];
  contentTypeDetection: ContentTypeDetection;
  /** Editorial intent classifications per segment (Gemini-powered) */
  editorialIntents?: import('./editorial-intent-detector').EditorialIntentResult;
  /** The ATOMIC removal plan — fully computed before any execution */
  silenceRemovalPlan: SilenceRemovalAction[];
  /** Estimated duration after all removals (ms) */
  estimatedCleanDurationMs: number;
  /** Original video duration (ms) */
  originalDurationMs: number;
  /** Which editorial decision path was used */
  editMethod?: 'transcript-editor' | 'fragment-pipeline';
  /** Keep ranges from transcript editor (for debugging/UI) */
  transcriptEditRanges?: import('./transcript-editor').TranscriptEditKeepRange[];
  /** Fraction of video duration covered by speech (0-1). Below 0.3 = speechless content that needs visual-driven editing. */
  speechCoverage: number;
  /** True when speech coverage is too low for transcript-based editing. Director should prioritize visual signals (Path D). */
  needsVisualDrivenEditing: boolean;
}

// ─── Constants ───────────────────────────────────────────────────

const SENTENCE_END_REGEX = /[.!?]$/;
const MIN_VIDEO_DURATION_SEC = 3; // Only skip for clips too short to have meaningful speech

// ─── Step 1: Transcription (delegates to existing service) ───────

async function transcribe(assetId: string, userId: string): Promise<TranscriptionData> {
  // Mode 2: prefer Deepgram for accurate word-level timestamps (caption sync).
  // Wizper returns segment-level → character-proportion drift of 10-30s on long videos.
  // Per v3 constraint:overlay.caption_timing_drift — max 0.5s before speech onset.
  return getTranscription(assetId, userId, { forceRefresh: false, preferWordLevel: true });
}

// ─── Step 2: Silence Detection ───────────────────────────────────

function detectSilences(words: TranscriptionWord[], videoDurationMs: number): SilenceGap[] {
  const gaps: SilenceGap[] = [];

  // Gap before first word (if speech doesn't start at 0)
  if (words.length > 0 && words[0].startMs > 500) {
    gaps.push({
      startMs: 0,
      endMs: words[0].startMs,
      durationMs: words[0].startMs,
      afterWord: words[0].word,
    });
  }

  // Gaps between words
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startMs - words[i - 1].endMs;
    if (gap > 300) { // Only track gaps > 300ms
      gaps.push({
        startMs: words[i - 1].endMs,
        endMs: words[i].startMs,
        durationMs: gap,
        beforeWord: words[i - 1].word,
        afterWord: words[i].word,
      });
    }
  }

  // Gap after last word (if speech doesn't end at video end)
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    const trailingGap = videoDurationMs - lastWord.endMs;
    if (trailingGap > 500) {
      gaps.push({
        startMs: lastWord.endMs,
        endMs: videoDurationMs,
        durationMs: trailingGap,
        beforeWord: lastWord.word,
      });
    }
  }

  return gaps;
}

// ─── Step 3: Filler Detection ────────────────────────────────────

function detectFillers(words: TranscriptionWord[]): DetectedFiller[] {
  const fillerSet = new Set(FILLER_WORDS.map(f => f.toLowerCase()));
  const fillers: DetectedFiller[] = [];

  for (let i = 0; i < words.length; i++) {
    const cleanWord = words[i].word.toLowerCase().replace(/[.,!?]/g, '');
    if (!fillerSet.has(cleanWord)) continue;

    // Check for surrounding silence
    const prevGap = i > 0 ? words[i].startMs - words[i - 1].endMs : 0;
    const nextGap = i < words.length - 1 ? words[i + 1].startMs - words[i].endMs : 0;
    const hasSurroundingSilence = prevGap > 200 || nextGap > 200;
    const totalGapMs = (words[i].endMs - words[i].startMs) + prevGap + nextGap;

    fillers.push({
      word: words[i].word,
      startMs: Math.max(0, words[i].startMs - Math.min(prevGap, 100)), // Include some preceding silence
      endMs: words[i].endMs + Math.min(nextGap, 100), // Include some trailing silence
      hasSurroundingSilence,
      totalGapMs,
    });
  }

  return fillers;
}

// ─── Step 4: Transcript Segmentation ─────────────────────────────

function segmentTranscript(words: TranscriptionWord[], pauseThresholdMs: number): TranscriptSegment[] {
  if (words.length === 0) return [];

  const segments: TranscriptSegment[] = [];
  let currentWords: TranscriptionWord[] = [words[0]];
  let currentBoundaryBefore: TranscriptBoundaryEvidence | undefined;
  let segIndex = 0;

  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const curr = words[i];
    const gap = curr.startMs - prev.endMs;
    const prevEndsSentence = SENTENCE_END_REGEX.test(prev.word.trim());
    const isPauseBoundary = gap >= pauseThresholdMs;

    if (isPauseBoundary || prevEndsSentence) {
      segments.push(buildSegment(currentWords, segIndex++, currentBoundaryBefore));
      currentWords = [curr];
      currentBoundaryBefore = buildTranscriptBoundaryEvidence(prev, curr, gap, isPauseBoundary, prevEndsSentence);
    } else {
      currentWords.push(curr);
    }
  }

  if (currentWords.length > 0) {
    segments.push(buildSegment(currentWords, segIndex, currentBoundaryBefore));
  }

  return segments;
}

function buildTranscriptBoundaryEvidence(
  previousWord: TranscriptionWord,
  nextWord: TranscriptionWord,
  gapMs: number,
  isPauseBoundary: boolean,
  previousEndedSentence: boolean,
): TranscriptBoundaryEvidence {
  const reasons: PacingSplitBoundaryReason[] = [];
  if (isPauseBoundary) reasons.push('speech-pause');
  if (previousEndedSentence) reasons.push('sentence-boundary');
  if (!reasons.length) reasons.push('transcript-segment-boundary');

  return {
    gapMs: Math.max(0, Math.round(gapMs)),
    previousEndedSentence,
    previousWord: previousWord.word,
    nextWord: nextWord.word,
    reasons,
  };
}

function buildSegment(
  words: TranscriptionWord[],
  index: number,
  boundaryBefore?: TranscriptBoundaryEvidence,
): TranscriptSegment {
  const fillerSet = new Set(FILLER_WORDS.map(f => f.toLowerCase()));
  const text = words.map(w => w.word).join(' ');
  let fillerCount = 0;
  let silenceGapCount = 0;
  let totalGap = 0;

  for (let i = 0; i < words.length; i++) {
    if (fillerSet.has(words[i].word.toLowerCase().replace(/[.,!?]/g, ''))) fillerCount++;
    if (i > 0) {
      const gap = words[i].startMs - words[i - 1].endMs;
      totalGap += gap;
      if (gap > 500) silenceGapCount++;
    }
  }

  return {
    text,
    startMs: words[0].startMs,
    endMs: words[words.length - 1].endMs,
    wordCount: words.length,
    words,
    fillerCount,
    silenceGapCount,
    avgWordGapMs: words.length > 1 ? totalGap / (words.length - 1) : 0,
    index,
    ...(boundaryBefore && { boundaryBefore }),
  };
}

// ─── Step 5: Best-Take Detection ─────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2),
  );
}

/**
 * Extract normalized word array for prefix comparison.
 * Keeps ALL words (including short ones like "I", "a") because prefix matching
 * needs exact word-order match, unlike Jaccard which uses bag-of-words.
 */
function getWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9'\s-]/g, '').split(/\s+/).filter(Boolean);
}

/**
 * Extract uncommon keywords (≥5 chars) for paraphrase detection.
 * Filters stop words and short common words — keeps content-carrying words
 * like "grocery", "store", "internet", "anonymity" that identify the topic.
 */
function getKeywords(text: string): Set<string> {
  const STOP = new Set([
    // 4-char stop words
    'also', 'been', 'come', 'does', 'done', 'each', 'even', 'from', 'gets',
    'goes', 'gone', 'good', 'gotta', 'guys', 'have', 'here', 'into', 'it\'s',
    'just', 'keep', 'kind', 'know', 'last', 'left', 'like', 'look', 'made',
    'make', 'many', 'more', 'most', 'much', 'must', 'need', 'next', 'only',
    'over', 'part', 'same', 'said', 'says', 'seem', 'some', 'sort', 'such',
    'sure', 'take', 'tell', 'than', 'that', 'them', 'then', 'they', 'this',
    'took', 'very', 'want', 'well', 'went', 'were', 'what', 'when', 'will',
    'with', 'work', 'yeah',
    // 5+ char stop words
    'about', 'after', 'again', 'being', 'below', 'could', 'doing', 'during',
    'every', 'first', 'going', 'gonna', 'great', 'having', 'maybe', 'might',
    'never', 'other', 'quite', 'rally', 'ready', 'really', 'right', 'shall',
    'since', 'still', 'their', 'there', 'these', 'thing', 'think', 'those',
    'under', 'until', 'where', 'which', 'while', 'whole', 'would', 'years',
    'should', 'because', 'doesn', 'people', 'pretty', 'actually', 'basically',
    'always', 'around', 'before', 'between', 'coming', 'enough', 'getting',
    'having', 'little', 'looking', 'making', 'nothing', 'saying', 'something',
    'talking', 'trying', 'you\'re', 'you\'ve', 'we\'re', 'we\'ve', 'don\'t',
  ]);
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
      .filter(w => w.length >= 4 && !STOP.has(w))
  );
}

/**
 * Check if two segments share the same opening words (prefix match).
 * Detects: (a) false starts ("So must..." vs "So must the other people..."),
 * (b) duplicate takes with different endings ("Now a big problem..." said twice).
 * Returns the number of matching prefix words, or 0 if no significant match.
 */
function prefixOverlap(wordsA: string[], wordsB: string[]): number {
  const min = Math.min(wordsA.length, wordsB.length);
  let match = 0;
  for (let k = 0; k < min; k++) {
    if (wordsA[k] === wordsB[k]) match++;
    else break;
  }
  return match;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) { if (b.has(word)) intersection++; }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function scoreSegmentQuality(seg: TranscriptSegment): number {
  const fillerPenalty = Math.max(0, 1 - seg.fillerCount * 0.15);
  const silencePenalty = Math.max(0, 1 - seg.silenceGapCount * 0.1);
  const energyScore = Math.max(0, 1 - (seg.avgWordGapMs / 500));
  // Length bonus: longer takes that complete the thought score higher.
  // Normalized to 0-1 range (30 words = full score). Prevents false starts
  // from winning over complete takes purely on filler/silence metrics.
  const lengthBonus = Math.min(1, seg.wordCount / 30);
  return fillerPenalty * 0.25 + silencePenalty * 0.20 + energyScore * 0.30 + lengthBonus * 0.25;
}

// Minimum prefix words to confirm same attempted line.
// 3 words can be coincidence ("I think that"). 4 is unambiguous
// ("So must the other", "Now a big problem").
const MIN_PREFIX_WORDS = 4;

// For false start detection: if segment A is very short (≤ this word count)
// AND segment B starts with ALL of A's words, A is an abandoned false start.
// "So must..." (2 words) followed by "So must the other people..." (10 words)
// → "So must..." is a false start. Requires ALL words of the short segment
// to match the beginning of the longer one — very low false positive risk.
const FALSE_START_MAX_WORDS = 5;

function detectBestTakes(
  segments: TranscriptSegment[],
  jaccardThreshold: number,
): BestTakeSelection[] {
  const selections: BestTakeSelection[] = [];
  const consumed = new Set<number>(); // segment indices already matched

  // Pre-compute word arrays for prefix matching
  const segWords = segments.map(s => getWords(s.text));

  for (let i = 0; i < segments.length; i++) {
    if (consumed.has(i)) continue;
    const tokensI = tokenize(segments[i].text);

    const group: TranscriptSegment[] = [segments[i]];

    // Look ahead within a reasonable window (repeated takes are usually nearby)
    const searchWindow = Math.min(segments.length, i + 30);
    for (let j = i + 1; j < searchWindow; j++) {
      if (consumed.has(j)) continue;
      const tokensJ = tokenize(segments[j].text);

      // Match strategy 1: Jaccard similarity (original — catches full repeated sentences)
      // Only check when both segments have enough tokens for meaningful comparison
      let isMatch = false;
      if (tokensI.size >= 3 && tokensJ.size >= 3) {
        const sim = jaccardSimilarity(tokensI, tokensJ);
        if (sim >= jaccardThreshold) isMatch = true;
      }

      // Match strategy 2: Prefix overlap (catches different-ending duplicates)
      // "Now a big problem here is..." said twice with different endings.
      if (!isMatch) {
        const overlap = prefixOverlap(segWords[i], segWords[j]);
        if (overlap >= MIN_PREFIX_WORDS) isMatch = true;
      }

      // Match strategy 3: False start detection (catches abandoned short attempts)
      // "So must..." (2 words) near "So must the other people..." (10 words)
      // → the short one is a false start. ALL words of the short segment must
      // match the beginning of the longer one.
      if (!isMatch) {
        const wordsI = segWords[i];
        const wordsJ = segWords[j];
        const shortWords = wordsI.length <= wordsJ.length ? wordsI : wordsJ;
        const longWords = wordsI.length <= wordsJ.length ? wordsJ : wordsI;
        if (
          shortWords.length >= 2 &&
          shortWords.length <= FALSE_START_MAX_WORDS &&
          longWords.length > shortWords.length &&
          prefixOverlap(shortWords, longWords) === shortWords.length
        ) {
          isMatch = true;
        }
      }

      // Strategy 4 (keyword overlap) REMOVED — caused quality regression.
      // Keyword overlap catches paraphrased retakes but also kills distinct
      // argument points that share topic words. Semantic dedup is now handled
      // by Gemini in the editorial intent detector (DUPLICATE_TAKE classification).

      // Match strategy 5: Single-word exact repeat (catches "Zero." / "Zero.")
      // Strategy 3 requires >= 2 words. Single-word segments that are identical
      // and within 5 positions of each other are the same take.
      if (!isMatch && segWords[i].length === 1 && segWords[j].length === 1
          && segWords[i][0] === segWords[j][0] && j - i <= 5) {
        isMatch = true;
      }

      if (isMatch) {
        group.push(segments[j]);
        consumed.add(j);
      }
    }

    if (group.length > 1) {
      const repetitionIntent = classifyRepetitionIntent(group);
      if (repetitionIntent.verdict !== 'RETAKE') {
        continue;
      }

      // Score each take and pick the best (longest complete take wins)
      const scored = group.map(seg => ({ seg, score: scoreSegmentQuality(seg) }));
      scored.sort((a, b) => b.score - a.score);

      const best = scored[0];
      const inferior = scored.slice(1).map(s => s.seg);

      selections.push({
        keptSegment: best.seg,
        inferiorSegments: inferior,
        repetitionIntent,
        similarity: jaccardSimilarity(tokenize(best.seg.text), tokenize(inferior[0].text)),
        keptScore: best.score,
      });

      consumed.add(best.seg.index);
      for (const inf of inferior) consumed.add(inf.index);
    }
  }

  return selections;
}

// ─── Step 6: Build Silence Removal Plan ──────────────────────────

function buildSilenceRemovalPlan(
  silenceGaps: SilenceGap[],
  fillerWords: DetectedFiller[],
  bestTakeSelections: BestTakeSelection[],
  silenceThreshold: ContentTypeDetection['silenceThreshold'],
  fillerRemovalMode: string,
  fillerRate: number,
  casualFillerRateThreshold: number,
): SilenceRemovalAction[] {
  const actions: SilenceRemovalAction[] = [];

  // A. Silence gaps
  for (const gap of silenceGaps) {
    if (gap.durationMs >= silenceThreshold.removeAboveMs) {
      actions.push({ startMs: gap.startMs, endMs: gap.endMs, action: 'remove', reason: 'silence' });
    } else if (
      gap.durationMs >= silenceThreshold.shortenRangeMs[0] &&
      gap.durationMs <= silenceThreshold.shortenRangeMs[1]
    ) {
      actions.push({
        startMs: gap.startMs,
        endMs: gap.endMs,
        action: 'shorten',
        shortenToMs: silenceThreshold.shortenTargetMs,
        reason: 'silence',
      });
    }
    // Gaps below shortenRangeMs[0] are kept (natural speech rhythm)
  }

  // B. Filler words (if mode is 'all-above-threshold' and filler rate exceeds threshold)
  if (fillerRemovalMode === 'all-above-threshold' && fillerRate >= casualFillerRateThreshold) {
    for (const filler of fillerWords) {
      // Only add if this range isn't already covered by a silence removal
      const alreadyCovered = actions.some(
        a => filler.startMs >= a.startMs && filler.endMs <= a.endMs,
      );
      if (!alreadyCovered) {
        actions.push({
          startMs: filler.startMs,
          endMs: filler.endMs,
          action: 'remove',
          reason: 'filler',
        });
      }
    }
  }

  // C. Inferior takes from best-take selection
  for (const selection of bestTakeSelections) {
    for (const inferior of selection.inferiorSegments) {
      // Remove the entire inferior take
      const alreadyCovered = actions.some(
        a => a.startMs <= inferior.startMs && a.endMs >= inferior.endMs,
      );
      if (!alreadyCovered) {
        actions.push({
          startMs: inferior.startMs,
          endMs: inferior.endMs,
          action: 'remove',
          reason: 'inferior-take',
        });
      }
    }
  }

  // Sort by startMs for consistent processing
  actions.sort((a, b) => a.startMs - b.startMs);

  // Merge overlapping actions (prefer 'remove' over 'shorten')
  const merged: SilenceRemovalAction[] = [];
  for (const action of actions) {
    const last = merged[merged.length - 1];
    if (last && action.startMs <= last.endMs) {
      // Overlap — extend and prefer 'remove'
      last.endMs = Math.max(last.endMs, action.endMs);
      if (action.action === 'remove') last.action = 'remove';
      if (action.reason === 'inferior-take') last.reason = 'inferior-take';
    } else {
      merged.push({ ...action });
    }
  }

  return merged;
}

// ─── Main Entry ──────────────────────────────────────────────────

function removalRangesFromPlan(
  plan: SilenceRemovalAction[],
  videoDurationMs: number,
): Array<{ startMs: number; endMs: number }> {
  const ranges = plan
    .map((action) => {
      if (action.action === 'remove') {
        return { startMs: action.startMs, endMs: action.endMs };
      }
      if (action.action === 'shorten') {
        const keepMs = Math.max(0, action.shortenToMs ?? 300);
        return { startMs: Math.min(action.endMs, action.startMs + keepMs), endMs: action.endMs };
      }
      return null;
    })
    .filter((range): range is { startMs: number; endMs: number } =>
      !!range && range.endMs > range.startMs,
    )
    .sort((a, b) => a.startMs - b.startMs);

  const merged: Array<{ startMs: number; endMs: number }> = [];
  for (const range of ranges) {
    const clipped = {
      startMs: Math.max(0, Math.min(videoDurationMs, range.startMs)),
      endMs: Math.max(0, Math.min(videoDurationMs, range.endMs)),
    };
    if (clipped.endMs <= clipped.startMs) continue;
    const last = merged[merged.length - 1];
    if (last && clipped.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, clipped.endMs);
    } else {
      merged.push(clipped);
    }
  }
  return merged;
}

function invertRemovalRanges(
  ranges: Array<{ startMs: number; endMs: number }>,
  videoDurationMs: number,
): Array<{ startMs: number; endMs: number }> {
  const kept: Array<{ startMs: number; endMs: number }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.startMs > cursor) kept.push({ startMs: cursor, endMs: range.startMs });
    cursor = Math.max(cursor, range.endMs);
  }
  if (cursor < videoDurationMs) kept.push({ startMs: cursor, endMs: videoDurationMs });
  return kept;
}

function previewText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function inferSegmentBoundaryEvidence(
  previous: TranscriptSegment,
  next: TranscriptSegment,
): TranscriptBoundaryEvidence {
  const previousLastWord = previous.words[previous.words.length - 1];
  const nextFirstWord = next.words[0];
  const gapMs = Math.max(0, Math.round(next.startMs - previous.endMs));
  const previousEndedSentence = SENTENCE_END_REGEX.test(previous.text.trim());
  const reasons: PacingSplitBoundaryReason[] = [];
  if (gapMs >= DEFAULT_CONFIG.rawFootage.segmentPauseThresholdMs) reasons.push('speech-pause');
  if (previousEndedSentence) reasons.push('sentence-boundary');
  if (!reasons.length) reasons.push('transcript-segment-boundary');

  return {
    gapMs,
    previousEndedSentence,
    ...(previousLastWord?.word && { previousWord: previousLastWord.word }),
    ...(nextFirstWord?.word && { nextWord: nextFirstWord.word }),
    reasons,
  };
}

export function buildPacingSplitActions(
  segments: TranscriptSegment[],
  existingPlan: SilenceRemovalAction[],
  videoDurationMs: number,
): SilenceRemovalAction[] {
  if (!segments.length || videoDurationMs <= 0) return [];

  const minSplitIntervalMs = DEFAULT_CONFIG.rawFootage.minSegmentAfterCutSeconds * 1000;
  const minKeptSpanForSplitsMs = minSplitIntervalMs * 4;
  const keptRanges = invertRemovalRanges(removalRangesFromPlan(existingPlan, videoDurationMs), videoDurationMs);
  const actions: SilenceRemovalAction[] = [];

  for (const kept of keptRanges) {
    const keptDurationMs = kept.endMs - kept.startMs;
    if (keptDurationMs < minKeptSpanForSplitsMs) continue;

    const candidateSegments = segments.filter((segment) =>
      segment.startMs >= kept.startMs &&
      segment.endMs <= kept.endMs,
    );
    if (candidateSegments.length < 2) continue;

    let lastSplitMs = kept.startMs;
    for (let i = 1; i < candidateSegments.length; i++) {
      const previous = candidateSegments[i - 1];
      const next = candidateSegments[i];
      const splitMs = next.startMs;
      if (splitMs - lastSplitMs < minSplitIntervalMs) continue;
      if (kept.endMs - splitMs < minSplitIntervalMs) continue;
      const boundary = next.boundaryBefore ?? inferSegmentBoundaryEvidence(previous, next);

      actions.push({
        startMs: splitMs,
        endMs: splitMs,
        action: 'split',
        reason: 'pacing-split',
        metadata: {
          kind: 'pacing-split',
          source: 'transcript-segment-boundary',
          calibrationStatus: 'invented-threshold',
          previousSegmentIndex: previous.index,
          nextSegmentIndex: next.index,
          boundaryReasons: boundary.reasons,
          speechGapMs: boundary.gapMs,
          previousEndedSentence: boundary.previousEndedSentence,
          previousWord: boundary.previousWord,
          nextWord: boundary.nextWord,
          previousTextPreview: previewText(previous.text),
          nextTextPreview: previewText(next.text),
          keptRangeStartMs: kept.startMs,
          keptRangeEndMs: kept.endMs,
          keptRangeDurationMs: keptDurationMs,
          minSplitIntervalMs,
        },
      });
      lastSplitMs = splitMs;
    }
  }

  return actions;
}

/**
 * Process raw footage: transcribe → analyze → build atomic removal plan.
 * The plan is FULLY COMPUTED before any timeline modifications.
 */
export async function processRawFootage(
  assetId: string,
  userId: string,
  videoDurationSec: number,
  platform?: string,
  userIntent?: string,
): Promise<RawFootageAnalysis> {
  const config = DEFAULT_CONFIG.rawFootage;
  const videoDurationMs = videoDurationSec * 1000;

  // Skip for very short clips
  if (videoDurationSec < MIN_VIDEO_DURATION_SEC) {
    console.log(`[RawFootage] Video too short (${videoDurationSec}s < ${MIN_VIDEO_DURATION_SEC}s), skipping processing`);
    const emptyTranscription: TranscriptionData = {
      words: [], transcript: '', language: 'en', confidence: 0, generatedAt: new Date(),
    };
    const detection = detectContentType([], videoDurationSec, platform, userIntent);
    return {
      transcription: emptyTranscription,
      silenceGaps: [],
      fillerWords: [],
      segments: [],
      bestTakeSelections: [],
      contentTypeDetection: detection,
      silenceRemovalPlan: [],
      estimatedCleanDurationMs: videoDurationMs,
      originalDurationMs: videoDurationMs,
      speechCoverage: 0,
      needsVisualDrivenEditing: true,
    };
  }

  // Step 1: Transcribe
  console.log(`[RawFootage] Transcribing ${assetId}...`);
  const transcription = await transcribe(assetId, userId);

  // Step 2: Detect silences
  const silenceGaps = detectSilences(transcription.words, videoDurationMs);
  console.log(`[RawFootage] Found ${silenceGaps.length} silence gaps`);

  // Step 3: Detect fillers
  const fillerWords = detectFillers(transcription.words);
  const fillerRate = transcription.words.length > 0
    ? fillerWords.length / transcription.words.length
    : 0;
  console.log(`[RawFootage] Found ${fillerWords.length} fillers (rate=${(fillerRate * 100).toFixed(1)}%)`);

  // Step 4: Classify content type (moved before editorial decisions — needed for context)
  const contentTypeDetection = detectContentType(
    transcription.words,
    videoDurationSec,
    platform,
    userIntent,
  );

  // Step 5: Transcript Editor (primary) — word-level Gemini call
  // Falls back to fragment pipeline (segment + editorial intent + best-take) on failure
  let transcriptEditRemovals: SilenceRemovalAction[] = [];
  let editMethod: 'transcript-editor' | 'fragment-pipeline' = 'fragment-pipeline';
  let transcriptEditRanges: import('./transcript-editor').TranscriptEditKeepRange[] | undefined;
  let segments: TranscriptSegment[] = [];
  let bestTakeSelections: BestTakeSelection[] = [];
  let editorialIntents: import('./editorial-intent-detector').EditorialIntentResult | undefined;

  try {
    const { editTranscript } = await import('./transcript-editor');
    const editResult = await editTranscript(transcription.words, videoDurationMs, {
      contentType: contentTypeDetection.contentType,
      platform,
      userIntent,
      speakerCount: transcription.speakerCount,
    });

    if (editResult.method === 'transcript-editor') {
      transcriptEditRemovals = editResult.removals;
      transcriptEditRanges = editResult.keepRanges;
      editMethod = 'transcript-editor';
      // Still segment for downstream consumers (Director, captions) that expect segments
      segments = segmentTranscript(transcription.words, config.segmentPauseThresholdMs);
      console.log(`[RawFootage] ${segments.length} transcript segments (for downstream consumers)`);
    }
  } catch (err: any) {
    console.warn(`[RawFootage] Transcript editor import/call failed: ${err.message}`);
  }

  // Fallback: fragment pipeline (segment → editorial intent → best-take)
  if (editMethod === 'fragment-pipeline') {
    segments = segmentTranscript(transcription.words, config.segmentPauseThresholdMs);
    console.log(`[RawFootage] ${segments.length} transcript segments`);

    try {
      const { detectEditorialIntent } = await import('./editorial-intent-detector');
      editorialIntents = await detectEditorialIntent(segments);
    } catch (err: any) {
      console.warn(`[RawFootage] Editorial intent detection failed (non-fatal): ${err.message}`);
    }

    bestTakeSelections = detectBestTakes(segments, config.bestTakeJaccardThreshold);
    if (bestTakeSelections.length > 0) {
      console.log(`[RawFootage] ${bestTakeSelections.length} repeated phrases detected, best takes selected`);
    }
  }

  // Step 7: Build atomic silence removal plan
  let silenceRemovalPlan: SilenceRemovalAction[];

  if (editMethod === 'transcript-editor') {
    // Transcript editor made the holistic decision — it already accounts for
    // pauses within kept content. Adding silence/filler removals on top would
    // double-cut and destroy the edit (bug: 1175s→23s estimated clean).
    silenceRemovalPlan = [...transcriptEditRemovals];
    silenceRemovalPlan.sort((a, b) => a.startMs - b.startMs);
    console.log(`[RawFootage] Using ${transcriptEditRemovals.length} transcript-edit removals (no silence/filler merge)`);
  } else {
    // Fragment pipeline: merge silence + filler + best-take + editorial intent
    silenceRemovalPlan = buildSilenceRemovalPlan(
      silenceGaps,
      fillerWords,
      bestTakeSelections,
      contentTypeDetection.silenceThreshold,
      config.fillerRemovalMode,
      fillerRate,
      config.casualFillerRateThreshold,
    );
    if (editorialIntents?.additionalRemovals.length) {
      silenceRemovalPlan.push(...editorialIntents.additionalRemovals);
      silenceRemovalPlan.sort((a, b) => a.startMs - b.startMs);
      console.log(`[RawFootage] Added ${editorialIntents.additionalRemovals.length} editorial-intent removals to plan`);
    }
  }

  const pacingSplitActions = buildPacingSplitActions(segments, silenceRemovalPlan, videoDurationMs);
  if (pacingSplitActions.length > 0) {
    silenceRemovalPlan.push(...pacingSplitActions);
    silenceRemovalPlan.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    console.log(`[RawFootage] Added ${pacingSplitActions.length} non-destructive pacing split boundaries`);
  }

  // Estimate clean duration
  const totalRemovedMs = silenceRemovalPlan.reduce((sum, action) => {
    if (action.action === 'remove') return sum + (action.endMs - action.startMs);
    if (action.action === 'shorten') return sum + (action.endMs - action.startMs) - (action.shortenToMs || 0);
    return sum;
  }, 0);
  const estimatedCleanDurationMs = videoDurationMs - totalRemovedMs;

  // Speech coverage: fraction of video duration with speech.
  // Gap-based: consecutive words with < 2s gap = continuous speech block.
  // Robust against STT timestamp style differences (Grok file upload returns
  // "tight" per-word durations ~200ms vs url path "inclusive" ~500ms).
  // Old per-word-duration sum gave 46% for the same video that was 99% before.
  let speechMs = 0;
  const words = transcription.words;
  if (words.length > 0) {
    const MAX_GAP_MS = 2000; // ⚠️ INVENTED — normal speech gaps 200-500ms, 2s covers sentence pauses
    let blockStart = (words[0] as any).startMs ?? (words[0] as any).start ?? 0;
    let blockEnd = (words[0] as any).endMs ?? (words[0] as any).end ?? blockStart;
    for (let i = 1; i < words.length; i++) {
      const wStart = (words[i] as any).startMs ?? (words[i] as any).start ?? 0;
      const wEnd = (words[i] as any).endMs ?? (words[i] as any).end ?? wStart;
      if (wStart - blockEnd > MAX_GAP_MS) {
        speechMs += Math.max(0, blockEnd - blockStart);
        blockStart = wStart;
      }
      blockEnd = Math.max(blockEnd, wEnd);
    }
    speechMs += Math.max(0, blockEnd - blockStart);
  }
  const speechCoverage = (videoDurationMs > 0 && Number.isFinite(speechMs)) ? Math.min(1, speechMs / videoDurationMs) : 0;
  const VISUAL_EDITING_THRESHOLD = 0.3; // ← below 30% speech, transcript-based editing is insufficient
  const needsVisualDrivenEditing = speechCoverage < VISUAL_EDITING_THRESHOLD;

  if (needsVisualDrivenEditing) {
    console.log(`[RawFootage] LOW SPEECH COVERAGE: ${(speechCoverage * 100).toFixed(1)}% (threshold: ${VISUAL_EDITING_THRESHOLD * 100}%). Director should prioritize visual signals (Path D) over transcript-based editing.`);
  }

  console.log(`[RawFootage] Plan (${editMethod}): ${silenceRemovalPlan.length} actions, ${Math.round(totalRemovedMs / 1000)}s removed, clean=${Math.round(estimatedCleanDurationMs / 1000)}s (was ${Math.round(videoDurationSec)}s), speechCoverage=${(speechCoverage * 100).toFixed(1)}%`);

  return {
    transcription,
    silenceGaps,
    fillerWords,
    segments,
    bestTakeSelections,
    contentTypeDetection,
    editorialIntents,
    silenceRemovalPlan,
    estimatedCleanDurationMs,
    originalDurationMs: videoDurationMs,
    editMethod,
    transcriptEditRanges,
    speechCoverage,
    needsVisualDrivenEditing,
  };
}
