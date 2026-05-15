/**
 * Editorial Intent Detector — Mode 2 Raw Footage Intelligence
 *
 * Classifies transcript segments as CONTENT, META_DISCARD, or META_KEEP
 * using Gemini Flash semantic understanding (NOT regex).
 *
 * Integration point: after segmentation (Step 4), before silence removal planning (Step 7).
 * Produces additional SilenceRemovalActions for META_DISCARD segments.
 *
 * Creative knowledge graph grounding:
 *   - constraint:charged_silence_protection ("NEVER remove silence when narrative_pressure > 0.6")
 *   - signal:speech_energy_delta (meta-commentary often has lower energy than content)
 *   - signal:speaker_direct_address (breaking the fourth wall = meta signal)
 */

import type { TranscriptSegment, SilenceRemovalAction } from './raw-footage-processor';

// ─── Types ──────────────────────────────────────────────────────────

export type EditorialClass = 'CONTENT' | 'META_DISCARD' | 'META_KEEP' | 'DUPLICATE_TAKE';

export interface EditorialIntent {
  segmentIndex: number;
  classification: EditorialClass;
  confidence: number;
  reason: string;
  directive?: string;
  retroactiveTargets?: number[];
}

export interface EditorialIntentResult {
  intents: EditorialIntent[];
  metaDiscardSegmentIndices: number[];
  metaKeepSegmentIndices: number[];
  contentSegmentIndices: number[];
  additionalRemovals: SilenceRemovalAction[];
  processingTimeMs: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const META_CONFIDENCE_THRESHOLD = 0.7;
const MAX_SEGMENTS_PER_BATCH = 60;
const RETROACTIVE_WINDOW = 3;

// ─── Main Entry Point ───────────────────────────────────────────────

export async function detectEditorialIntent(
  segments: TranscriptSegment[],
): Promise<EditorialIntentResult> {
  const start = Date.now();

  if (segments.length === 0) {
    return emptyResult(start);
  }

  // Short videos (< 5 segments): likely no meta-commentary, skip LLM call
  if (segments.length < 5) {
    return {
      intents: segments.map((_, i) => ({
        segmentIndex: i,
        classification: 'CONTENT' as EditorialClass,
        confidence: 0.9,
        reason: 'Short video — all segments treated as content',
      })),
      metaDiscardSegmentIndices: [],
      metaKeepSegmentIndices: [],
      contentSegmentIndices: segments.map((_, i) => i),
      additionalRemovals: [],
      processingTimeMs: Date.now() - start,
    };
  }

  // Batch segments for Gemini classification
  const allIntents: EditorialIntent[] = [];
  for (let batchStart = 0; batchStart < segments.length; batchStart += MAX_SEGMENTS_PER_BATCH) {
    const batch = segments.slice(batchStart, batchStart + MAX_SEGMENTS_PER_BATCH);
    const batchIntents = await classifyBatch(batch, batchStart, segments);
    allIntents.push(...batchIntents);
  }

  // Apply retroactive flagging pass
  applyRetroactiveFlags(allIntents, segments);

  // Build removal actions for META_DISCARD segments
  const metaDiscard: number[] = [];
  const metaKeep: number[] = [];
  const content: number[] = [];
  const removals: SilenceRemovalAction[] = [];

  let duplicateTakeCount = 0;
  for (const intent of allIntents) {
    const shouldRemove = (intent.classification === 'META_DISCARD' || intent.classification === 'DUPLICATE_TAKE')
      && intent.confidence >= META_CONFIDENCE_THRESHOLD;
    if (shouldRemove) {
      metaDiscard.push(intent.segmentIndex);
      if (intent.classification === 'DUPLICATE_TAKE') duplicateTakeCount++;
      const seg = segments[intent.segmentIndex];
      if (seg) {
        removals.push({
          startMs: seg.startMs,
          endMs: seg.endMs,
          action: 'remove',
          reason: intent.classification === 'DUPLICATE_TAKE' ? 'inferior-take' as any : 'meta-discard' as any,
        });
      }
    } else if (intent.classification === 'META_KEEP') {
      metaKeep.push(intent.segmentIndex);
    } else {
      content.push(intent.segmentIndex);
    }
  }
  if (duplicateTakeCount > 0) {
    console.log(`[EditorialIntent] Gemini identified ${duplicateTakeCount} duplicate takes`);
  }

  // Also remove segments retroactively flagged by META_DISCARD directives
  for (const intent of allIntents) {
    if (intent.retroactiveTargets?.length) {
      for (const targetIdx of intent.retroactiveTargets) {
        if (!metaDiscard.includes(targetIdx)) {
          metaDiscard.push(targetIdx);
          const seg = segments[targetIdx];
          if (seg) {
            removals.push({
              startMs: seg.startMs,
              endMs: seg.endMs,
              action: 'remove',
              reason: 'meta-discard' as any,
            });
          }
        }
      }
    }
  }

  // ── Orphan and abandoned fragment detection ──
  const ORPHAN_MAX_WORDS = 8;
  const ABANDONED_MAX_WORDS = 3;
  let orphanCount = 0;
  for (let i = 0; i < segments.length; i++) {
    if (metaDiscard.includes(i)) continue;
    const text = (segments[i].text || '').trim();
    const words = text.split(/\s+/).filter(Boolean);
    const lastChar = text.slice(-1);
    const isIncomplete = !lastChar || !'.?!"\''.includes(lastChar);
    const trailsOff = text.endsWith('...');

    let shouldRemove = false;

    // Type 1: Lead-in whose next segment was removed
    // "And you're gonna see..." → [removed meta]
    if (words.length <= ORPHAN_MAX_WORDS && isIncomplete && i < segments.length - 1 && metaDiscard.includes(i + 1)) {
      shouldRemove = true;
    }

    // Type 2: Abandoned micro-start (≤3 words, incomplete or trailing off)
    // "Anonymity..." "Imagine..." "And people..." — speaker said 1-2 words and stopped.
    // These are never intentional content regardless of what follows.
    if (words.length <= ABANDONED_MAX_WORDS && (isIncomplete || trailsOff)) {
      shouldRemove = true;
    }

    if (shouldRemove) {
      metaDiscard.push(i);
      const idx = content.indexOf(i);
      if (idx !== -1) content.splice(idx, 1);
      const seg = segments[i];
      if (seg) {
        removals.push({
          startMs: seg.startMs,
          endMs: seg.endMs,
          action: 'remove',
          reason: 'meta-discard' as any,
        });
      }
      orphanCount++;
    }
  }
  if (orphanCount > 0) {
    console.log(`[EditorialIntent] Orphan/fragment detection: ${orphanCount} segments removed`);
  }

  console.log(`[EditorialIntent] ${segments.length} segments → ${content.length} CONTENT, ${metaDiscard.length} META_DISCARD, ${metaKeep.length} META_KEEP (${Date.now() - start}ms)`);

  return {
    intents: allIntents,
    metaDiscardSegmentIndices: metaDiscard,
    metaKeepSegmentIndices: metaKeep,
    contentSegmentIndices: content,
    additionalRemovals: removals,
    processingTimeMs: Date.now() - start,
  };
}

// ─── Gemini Classification ──────────────────────────────────────────

async function classifyBatch(
  batch: TranscriptSegment[],
  batchOffset: number,
  allSegments: TranscriptSegment[],
): Promise<EditorialIntent[]> {
  try {
    const { getGeneralModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getGeneralModel();

    const segmentList = batch.map((seg, i) => {
      const globalIdx = batchOffset + i;
      return `[${globalIdx}] (${formatMs(seg.startMs)}–${formatMs(seg.endMs)}) "${seg.text}"`;
    }).join('\n');

    const prompt = buildClassificationPrompt(segmentList, allSegments.length);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      console.warn('[EditorialIntent] Gemini returned non-array, treating all as CONTENT');
      return batch.map((_, i) => defaultContentIntent(batchOffset + i));
    }

    return parsed.map((item: any, i: number) => {
      const globalIdx = batchOffset + i;
      const classification = validateClass(item.classification);
      return {
        segmentIndex: globalIdx,
        classification,
        confidence: clamp(Number(item.confidence) || 0.5, 0, 1),
        reason: String(item.reason || ''),
        directive: item.directive || undefined,
        retroactiveTargets: parseRetroactiveTargets(item.retroactive_targets, globalIdx, allSegments.length),
      };
    });
  } catch (err: any) {
    console.warn(`[EditorialIntent] Gemini classification failed: ${err.message}. Treating batch as CONTENT.`);
    return batch.map((_, i) => defaultContentIntent(batchOffset + i));
  }
}

function buildClassificationPrompt(segmentList: string, totalSegments: number): string {
  // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
  return `<role>
You are a professional video editor analyzing raw footage transcript segments.
</role>

<task>
Classify each of the ${totalSegments} segments below into exactly one category: CONTENT, META_DISCARD, or META_KEEP.
</task>

<rules>
RULE 1 — CATEGORIES:
CONTENT — Actual video content the viewer should see. The speaker is delivering their message, telling a story, explaining, or performing. This is the DEFAULT — when in doubt, classify as CONTENT.

META_DISCARD — Meta-commentary to REMOVE from the final edit:
- Self-corrections: "wait, let me start over", "that came out wrong"
- Explicit retake requests: "cut!", "take two", "let me redo that"
- Behind-the-scenes: "is the camera recording?", "can you adjust the light?"
- Verbal mistakes acknowledged: "I messed that up", "sorry, one more time"
- Counting in: "three, two, one" (when clearly a slate, NOT part of content)
- Process commentary: talking ABOUT the video/recording process itself
- Creative self-assessment: reacting to own performance — "I like it", "that sounds good"
- Production decisions: choosing between takes — "let me use that one", "that's better"
- Video format/structure commentary: talking TO THE VIEWER about the video itself rather than the topic
- Intro/preamble before content delivery: warm-up, self-introduction, describing what the video will be. META_DISCARD unless the introduction IS the content (e.g., podcast host introducing episode topic)

META_KEEP — Meta-commentary containing editorial INSTRUCTIONS to preserve:
- Structural directives: "put this part at the beginning", "this should be the intro"
- Emphasis requests: "make sure to highlight this", "zoom in here"
- Sequencing instructions: "this goes after the product demo"
- Content flags: "this is the key message", "this is the B-roll section"

RULE 2 — ANTI-OVERFIRE (CRITICAL):
1. DEFAULT IS CONTENT. Only flag META when the speaker CLEARLY breaks out of content delivery.
2. Pauses, hesitations, "um", "uh" = NOT meta. Handled separately by filler detection.
3. Rhetorical self-address ("let me think...") within natural flow = CONTENT. Commenting on OWN SCRIPT/PERFORMANCE = META.
4. Segment with BOTH content + meta = classify by PRIMARY purpose.
5. Emotional moments, dramatic pauses, charged silence = ALWAYS CONTENT.
6. THREE-WAY DISTINCTION:
   a) THE TOPIC (CONTENT): "I think the internet is great", "The data shows 40% increase"
   b) THE VIDEO ITSELF (META_DISCARD): "So this is the editing challenge", "I'm gonna make a video"
   c) THE PRODUCTION (META_DISCARD): "Is my mic on?", "That take was great"
   Only (a) is CONTENT.
7. ORPHAN DETECTION: lead-in segment for a topic NOT continued in the next segment = META_DISCARD.

RULE 3 — RETROACTIVE FLAGGING:
When META_DISCARD references a PREVIOUS segment ("that last part was bad", "scratch what I just said"), include retroactive_targets with segment indices to also discard. Only reference segments within ${RETROACTIVE_WINDOW} positions back.
</rules>

<output_format>
JSON array, one object per segment, in order:
[{"classification": "CONTENT"|"META_DISCARD"|"META_KEEP", "confidence": 0.0-1.0, "reason": "brief explanation", "directive": "editorial instruction if META_KEEP", "retroactive_targets": [indices] or null}]
</output_format>

<segments>
${segmentList}
</segments>`;
}

// ─── Retroactive Flagging ───────────────────────────────────────────

function applyRetroactiveFlags(
  intents: EditorialIntent[],
  segments: TranscriptSegment[],
): void {
  for (const intent of intents) {
    if (intent.classification !== 'META_DISCARD' || !intent.retroactiveTargets?.length) continue;

    for (const targetIdx of intent.retroactiveTargets) {
      const target = intents.find(i => i.segmentIndex === targetIdx);
      if (!target) continue;
      // Only override if the target was classified as CONTENT with moderate confidence
      // Don't override high-confidence CONTENT (the speaker might be wrong about wanting to redo)
      if (target.classification === 'CONTENT' && target.confidence < 0.85) {
        target.classification = 'META_DISCARD';
        target.confidence = Math.min(intent.confidence * 0.8, 0.75);
        target.reason = `Retroactively flagged by segment ${intent.segmentIndex}: "${segments[intent.segmentIndex]?.text?.substring(0, 50)}"`;
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function validateClass(raw: any): EditorialClass {
  const upper = String(raw || '').toUpperCase();
  if (upper === 'META_DISCARD') return 'META_DISCARD';
  if (upper === 'META_KEEP') return 'META_KEEP';
  if (upper === 'DUPLICATE_TAKE') return 'DUPLICATE_TAKE';
  return 'CONTENT';
}

function parseRetroactiveTargets(
  raw: any,
  currentIdx: number,
  totalSegments: number,
): number[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw
    .map(Number)
    .filter(n => !isNaN(n) && n >= 0 && n < totalSegments && n !== currentIdx && n >= currentIdx - RETROACTIVE_WINDOW);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function defaultContentIntent(segmentIndex: number): EditorialIntent {
  return {
    segmentIndex,
    classification: 'CONTENT',
    confidence: 0.5,
    reason: 'Fallback — classification unavailable',
  };
}

function emptyResult(startTime: number): EditorialIntentResult {
  return {
    intents: [],
    metaDiscardSegmentIndices: [],
    metaKeepSegmentIndices: [],
    contentSegmentIndices: [],
    additionalRemovals: [],
    processingTimeMs: Date.now() - startTime,
  };
}

