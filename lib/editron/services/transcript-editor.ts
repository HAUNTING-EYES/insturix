/**
 * Transcript Editor — Word-Level Rough Cut via Gemini 3.1 Pro
 *
 * Replaces the segment-based editorial intent + best-take pipeline with
 * a SINGLE Gemini call that sees the FULL word-level transcript and
 * returns ms-precision keep-ranges. Mirrors how a real editor works:
 * read/watch the whole thing, mark what stays.
 *
 * Why: Pre-segmenting at pause boundaries hides retakes that happen
 * without a 1-second pause. "We all, we all know, we all know that..."
 * is ONE segment — classified as CONTENT (correct), but the retake
 * at the start survives. This approach has no segments. Gemini sees
 * every word and decides at word-level granularity.
 */

import type { TranscriptionWord } from '@/lib/editron/services/media/types';
import type { SilenceRemovalAction } from './raw-footage-processor';

// ─── Types ──────────────────────────────────────────────────────────

export interface TranscriptEditKeepRange {
  s: number;
  e: number;
}

export interface TranscriptEditResult {
  removals: SilenceRemovalAction[];
  keepRanges: TranscriptEditKeepRange[];
  method: 'transcript-editor' | 'fragment-pipeline';
  processingTimeMs: number;
  keptWordCount: number;
  totalWordCount: number;
}

interface VideoContext {
  contentType?: string;
  platform?: string;
  userIntent?: string;
  speakerCount?: number;
}

// ─── Config ─────────────────────────────────────────────────────────

const MAX_WORDS_SINGLE_CALL = 50_000;
const CHUNK_SIZE_WORDS = 15_000;
const CHUNK_OVERLAP_WORDS = 500;
const BREATHING_MARGIN_MS = 50;
const MIN_KEPT_RATIO = 0.20;
const MAX_KEPT_RATIO = 0.98;

// ─── Word Formatting ────────────────────────────────────────────────

function formatWordsForPrompt(words: TranscriptionWord[], includeSpeaker: boolean): string {
  const lines: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (includeSpeaker && w.speaker !== undefined) {
      lines.push(`${i}\t${w.word}\t${w.startMs}\t${w.endMs}\t${w.speaker}`);
    } else {
      lines.push(`${i}\t${w.word}\t${w.startMs}\t${w.endMs}`);
    }
  }
  return lines.join('\n');
}

// ─── Prompt ─────────────────────────────────────────────────────────

function buildPrompt(
  wordList: string,
  wordCount: number,
  context: VideoContext,
): string {
  const contextLine = [
    context.contentType && `Content type: ${context.contentType}`,
    context.platform && `Platform: ${context.platform}`,
    context.speakerCount && context.speakerCount > 1 && `Speakers: ${context.speakerCount}`,
  ].filter(Boolean).join('. ');

  return `<role>You are a professional video editor making a rough cut of raw footage. Be CONSERVATIVE — when unsure, KEEP the content.</role>
${contextLine ? `\n<context>${contextLine}</context>\n` : ''}
<task>
Read the full word-level transcript below. Identify ranges of word indices to KEEP in the final edit. Everything NOT covered by a keep-range will be cut.

First, scan the transcript for retake patterns — places where the speaker repeats the same words in immediate succession. Then produce keep-ranges that exclude only those retakes and the other patterns listed below.
</task>

<rules>
ONLY CUT these specific patterns:

1. IMMEDIATE RETAKES: the speaker says the SAME WORDS 2-3 times in a row trying to get the line right. Cut all prior attempts. Keep only the final complete attempt.
2. FALSE STARTS: speaker begins a sentence, abandons it within 1-4 words, and restarts with different words. Cut only the abandoned fragment.
3. PRODUCTION META: speaker talks directly about the recording process — mic checks, "let me restart", "cut that", "I'll edit this out". NOT topic meta-commentary or opinions about the subject matter.
4. DEAD AIR PREAMBLE: filler at the very start of the recording before actual content begins.

DO NOT CUT any of these:
- Different phrasings of the same idea — that is rhetoric/emphasis, NOT a retake
- The speaker returning to a topic after a digression — that is structure
- Imperfect but complete deliveries — a stumble mid-sentence is fine if the sentence finishes
- Asides, jokes, personality moments, reactions
- Transitions between topics
- Any content where you are not certain it is a retake

A RETAKE is ONLY when the same words appear multiple times in IMMEDIATE SUCCESSION. Two sentences about the same TOPIC using different words are NOT retakes — they are elaboration.
</rules>

<output_format>
JSON array of keep-ranges using word indices (inclusive on both sides):
[{"s": startIndex, "e": endIndex}, ...]
Ranges must be non-overlapping, sorted by "s". Every index from 0 to ${wordCount - 1} must be either inside a keep-range or intentionally excluded.
</output_format>

<transcript words="${wordCount}" format="index\\tword\\tstartMs\\tendMs${context.speakerCount && context.speakerCount > 1 ? '\\tspeaker' : ''}">
${wordList}
</transcript>`;
}

// ─── Gemini Call ────────────────────────────────────────────────────

async function callGemini(
  words: TranscriptionWord[],
  context: VideoContext,
): Promise<TranscriptEditKeepRange[]> {
  const { getGeneralModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getGeneralModel();

  const includeSpeaker = (context.speakerCount ?? 1) > 1;
  const wordList = formatWordsForPrompt(words, includeSpeaker);
  const prompt = buildPrompt(wordList, words.length, context);

  console.log(`[TranscriptEditor] Sending ${words.length} words to Gemini 3.1 Pro...`);

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.0,
      seed: 1,
    },
  });

  const text = result.response.text();
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array, got ${typeof parsed}`);
  }

  return parsed as TranscriptEditKeepRange[];
}

// ─── Validation ─────────────────────────────────────────────────────

function validateKeepRanges(
  ranges: TranscriptEditKeepRange[],
  wordCount: number,
): TranscriptEditKeepRange[] | null {
  if (!ranges || ranges.length === 0) {
    console.warn('[TranscriptEditor] Empty keep-ranges — validation failed');
    return null;
  }

  // Check bounds and structure
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (typeof r.s !== 'number' || typeof r.e !== 'number') {
      console.warn(`[TranscriptEditor] Range ${i} has non-numeric s/e`);
      return null;
    }
    if (r.s < 0 || r.e >= wordCount) {
      console.warn(`[TranscriptEditor] Range ${i} out of bounds: s=${r.s}, e=${r.e}, wordCount=${wordCount}`);
      return null;
    }
    if (r.s > r.e) {
      console.warn(`[TranscriptEditor] Range ${i} has s > e: s=${r.s}, e=${r.e}`);
      return null;
    }
  }

  // Sort by start index
  const sorted = [...ranges].sort((a, b) => a.s - b.s);

  // Check non-overlapping
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].s <= sorted[i - 1].e) {
      console.warn(`[TranscriptEditor] Overlapping ranges at ${i}: prev.e=${sorted[i - 1].e}, curr.s=${sorted[i].s}`);
      // Auto-fix: merge overlapping ranges
      sorted[i - 1].e = Math.max(sorted[i - 1].e, sorted[i].e);
      sorted.splice(i, 1);
      i--;
    }
  }

  // Check kept ratio
  let keptWords = 0;
  for (const r of sorted) keptWords += (r.e - r.s + 1);
  const ratio = keptWords / wordCount;

  if (ratio < MIN_KEPT_RATIO) {
    console.warn(`[TranscriptEditor] Kept ratio ${(ratio * 100).toFixed(1)}% below minimum ${MIN_KEPT_RATIO * 100}%`);
    return null;
  }
  if (ratio > MAX_KEPT_RATIO) {
    console.warn(`[TranscriptEditor] Kept ratio ${(ratio * 100).toFixed(1)}% above maximum ${MAX_KEPT_RATIO * 100}% — Gemini found almost nothing to cut`);
    return null;
  }

  return sorted;
}

// ─── Keep-Ranges → Removal Actions ─────────────────────────────────

function keepRangesToRemovalActions(
  keepRanges: TranscriptEditKeepRange[],
  words: TranscriptionWord[],
  videoDurationMs: number,
): SilenceRemovalAction[] {
  if (keepRanges.length === 0 || words.length === 0) return [];

  // Convert word-index ranges to ms ranges with breathing margin
  const keepMs: Array<{ startMs: number; endMs: number }> = [];
  for (const r of keepRanges) {
    keepMs.push({
      startMs: Math.max(0, words[r.s].startMs - BREATHING_MARGIN_MS),
      endMs: Math.min(videoDurationMs, words[r.e].endMs + BREATHING_MARGIN_MS),
    });
  }

  // Merge adjacent/overlapping keep-ranges after margin expansion
  const merged: Array<{ startMs: number; endMs: number }> = [];
  for (const k of keepMs) {
    const last = merged[merged.length - 1];
    if (last && k.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, k.endMs);
    } else {
      merged.push({ ...k });
    }
  }

  // Invert: gaps between keep-ranges are removals
  const removals: SilenceRemovalAction[] = [];

  // Gap before first keep-range
  if (merged[0].startMs > 0) {
    removals.push({
      startMs: 0,
      endMs: merged[0].startMs,
      action: 'remove',
      reason: 'transcript-edit' as SilenceRemovalAction['reason'],
    });
  }

  // Gaps between keep-ranges
  for (let i = 1; i < merged.length; i++) {
    const gapStart = merged[i - 1].endMs;
    const gapEnd = merged[i].startMs;
    if (gapEnd > gapStart) {
      removals.push({
        startMs: gapStart,
        endMs: gapEnd,
        action: 'remove',
        reason: 'transcript-edit' as SilenceRemovalAction['reason'],
      });
    }
  }

  // Gap after last keep-range
  const lastKeep = merged[merged.length - 1];
  if (lastKeep.endMs < videoDurationMs) {
    removals.push({
      startMs: lastKeep.endMs,
      endMs: videoDurationMs,
      action: 'remove',
      reason: 'transcript-edit' as SilenceRemovalAction['reason'],
    });
  }

  return removals;
}

// ─── Chunking (for transcripts > 50K words) ─────────────────────────

interface TranscriptChunk {
  words: TranscriptionWord[];
  globalStartIndex: number;
  globalEndIndex: number;
  coreStartIndex: number;
  coreEndIndex: number;
}

function chunkTranscript(words: TranscriptionWord[]): TranscriptChunk[] {
  if (words.length <= MAX_WORDS_SINGLE_CALL) {
    return [{ words, globalStartIndex: 0, globalEndIndex: words.length - 1, coreStartIndex: 0, coreEndIndex: words.length - 1 }];
  }

  const chunks: TranscriptChunk[] = [];
  let pos = 0;

  while (pos < words.length) {
    const coreEnd = Math.min(pos + CHUNK_SIZE_WORDS - 1, words.length - 1);

    // Snap to sentence boundary (search within 200 words of target)
    let snapEnd = coreEnd;
    for (let i = coreEnd; i > Math.max(pos, coreEnd - 200); i--) {
      if (/[.!?]$/.test(words[i].word.trim())) {
        snapEnd = i;
        break;
      }
    }

    const overlapEnd = Math.min(snapEnd + CHUNK_OVERLAP_WORDS, words.length - 1);
    const overlapStart = Math.max(0, pos - CHUNK_OVERLAP_WORDS);

    const chunkWords = words.slice(overlapStart, overlapEnd + 1);

    chunks.push({
      words: chunkWords,
      globalStartIndex: overlapStart,
      globalEndIndex: overlapEnd,
      coreStartIndex: pos,
      coreEndIndex: snapEnd,
    });

    pos = snapEnd + 1;
  }

  return chunks;
}

function mergeChunkResults(
  chunks: TranscriptChunk[],
  chunkResults: TranscriptEditKeepRange[][],
): TranscriptEditKeepRange[] {
  const allRanges: TranscriptEditKeepRange[] = [];

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const localRanges = chunkResults[c] || [];
    const offset = chunk.globalStartIndex;

    for (const r of localRanges) {
      const globalS = r.s + offset;
      const globalE = r.e + offset;

      // Only include ranges that fall within the core zone
      if (globalE >= chunk.coreStartIndex && globalS <= chunk.coreEndIndex) {
        allRanges.push({
          s: Math.max(globalS, chunk.coreStartIndex),
          e: Math.min(globalE, chunk.coreEndIndex),
        });
      }
    }
  }

  // Sort and merge overlapping
  allRanges.sort((a, b) => a.s - b.s);
  const merged: TranscriptEditKeepRange[] = [];
  for (const r of allRanges) {
    const last = merged[merged.length - 1];
    if (last && r.s <= last.e + 1) {
      last.e = Math.max(last.e, r.e);
    } else {
      merged.push({ ...r });
    }
  }

  return merged;
}

// ─── Main Entry ─────────────────────────────────────────────────────

export async function editTranscript(
  words: TranscriptionWord[],
  videoDurationMs: number,
  context: VideoContext = {},
): Promise<TranscriptEditResult> {
  const start = Date.now();

  if (words.length < 20) {
    console.log(`[TranscriptEditor] Only ${words.length} words — too short, skipping`);
    return {
      removals: [],
      keepRanges: [],
      method: 'fragment-pipeline',
      processingTimeMs: Date.now() - start,
      keptWordCount: words.length,
      totalWordCount: words.length,
    };
  }

  try {
    const chunks = chunkTranscript(words);

    let allKeepRanges: TranscriptEditKeepRange[];

    if (chunks.length === 1) {
      // Single call — most common case (up to ~3 hours of video)
      const raw = await callGemini(words, context);
      const validated = validateKeepRanges(raw, words.length);
      if (!validated) throw new Error('Keep-range validation failed');
      allKeepRanges = validated;
    } else {
      // Chunked — parallel calls for very long videos
      console.log(`[TranscriptEditor] ${words.length} words → ${chunks.length} chunks (parallel)`);
      const chunkResults = await Promise.all(
        chunks.map(chunk => callGemini(chunk.words, context)),
      );
      allKeepRanges = mergeChunkResults(chunks, chunkResults);
      const validated = validateKeepRanges(allKeepRanges, words.length);
      if (!validated) throw new Error('Chunked keep-range validation failed');
      allKeepRanges = validated;
    }

    const removals = keepRangesToRemovalActions(allKeepRanges, words, videoDurationMs);

    let keptWords = 0;
    for (const r of allKeepRanges) keptWords += (r.e - r.s + 1);

    const elapsed = Date.now() - start;
    console.log(`[TranscriptEditor] ${words.length} words → ${allKeepRanges.length} keep-ranges, ${keptWords}/${words.length} words kept (${(keptWords / words.length * 100).toFixed(1)}%), ${removals.length} removals (${elapsed}ms)`);

    return {
      removals,
      keepRanges: allKeepRanges,
      method: 'transcript-editor',
      processingTimeMs: elapsed,
      keptWordCount: keptWords,
      totalWordCount: words.length,
    };
  } catch (err: any) {
    const elapsed = Date.now() - start;
    console.warn(`[TranscriptEditor] Failed (${elapsed}ms): ${err.message}. Falling back to fragment pipeline.`);
    return {
      removals: [],
      keepRanges: [],
      method: 'fragment-pipeline',
      processingTimeMs: elapsed,
      keptWordCount: words.length,
      totalWordCount: words.length,
    };
  }
}
