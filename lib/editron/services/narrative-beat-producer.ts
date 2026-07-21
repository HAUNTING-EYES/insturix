/**
 * Narrative beat producer — P3.5 Phase B2 (2026-07-21): the LIVE producer for factless transcript beats.
 *
 * WHY: the narrative lane (designer-licensed factless MG) shipped end-to-end in Phase B1, but nothing in
 * production constructed its input — the director only emitted fact graphics (stats/names/quotes), so the
 * designer never saw the rest of the video. Most moments in a talking-head video carry no extractable fact;
 * this module turns the EDITED transcript into narrative beat decisions the design pre-pass offers to the
 * designer, whose approved plan (within the density budget) is their ONLY render license (edl-executor
 * enforces plan-or-skip; a declined beat renders nothing, never free-form).
 *
 * Segmentation is lifted VERBATIM from the proven eval harness (scripts/prompt-optimization/
 * eval-designer-compliance.ts): a beat ends at sentence-final punctuation or a ≥800ms inter-word pause;
 * groups under 4 words merge into the previous beat. Duration = min(150, (max(2500, span+700)/1000)×fps).
 *
 * Beat-count cap ← the design-plan contract itself (design-plan.ts: moments.max(24) + declined.max(48)):
 * every offered moment must be accounted for in the plan or validation deterministically rejects, so at most
 * 72 moments can be offered per session. The cap is applied to narrative beats after subtracting the fact
 * beats already offered, sampled EVENLY across the timeline (no intro bias).
 *
 * Pure and deterministic: no IO, no env, no model. The designer + density budget own all taste downstream.
 */

import type { EditDecisionList } from '@/lib/editron/services/reactive-edit-engine';

type EditDecision = EditDecisionList['decisions'][number];

export interface NarrativeBeatWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface NarrativeBeat {
  line: string;
  startMs: number;
  endMs: number;
  wordCount: number;
}

/** Total moments a design session can account for: design-plan schema moments.max(24) + declined.max(48). */
export const MAX_DESIGN_SESSION_MOMENTS = 72;

/** Above the executor's "confidence > 0.5" execution floor; below brief facts (0.7-0.95) so facts win ties. */
const NARRATIVE_BEAT_CONFIDENCE = 0.6;

const SENTENCE_END = /[.!?]["')\]]?$/;
const PAUSE_BOUNDARY_MS = 800; // eval-designer-compliance.ts beat boundary
const MIN_BEAT_WORDS = 4; // eval: merge smaller groups into the previous beat
const MIN_BEAT_DURATION_MS = 2500; // eval duration floor
const BEAT_TAIL_MS = 700; // eval: breathing room after the last word
const MAX_BEAT_DURATION_FRAMES = 150; // eval duration ceiling (5s @ 30fps)

/** Sentence/pause segmentation, lifted from the eval harness. Deterministic for identical input. */
export function segmentNarrativeBeats(words: NarrativeBeatWord[]): NarrativeBeat[] {
  const clean = words.filter((w) => typeof w.word === 'string' && w.word.trim().length > 0
    && Number.isFinite(w.startMs) && Number.isFinite(w.endMs));
  if (clean.length === 0) return [];

  const groups: NarrativeBeatWord[][] = [];
  let current: NarrativeBeatWord[] = [];
  for (let i = 0; i < clean.length; i++) {
    current.push(clean[i]);
    const sentenceEnd = SENTENCE_END.test(clean[i].word);
    const pause = i + 1 < clean.length ? clean[i + 1].startMs - clean[i].endMs >= PAUSE_BOUNDARY_MS : false;
    if (sentenceEnd || pause) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);

  const merged: NarrativeBeatWord[][] = [];
  for (const group of groups) {
    if (merged.length && group.length < MIN_BEAT_WORDS) merged[merged.length - 1].push(...group);
    else merged.push(group);
  }

  return merged.map((group) => ({
    line: group.map((w) => w.word).join(' '),
    startMs: group[0].startMs,
    endMs: group[group.length - 1].endMs,
    wordCount: group.length,
  }));
}

export interface ProduceNarrativeBeatDecisionsInput {
  words: NarrativeBeatWord[];
  fps: number;
  /** Decisions already planned for this video — beats overlapping an existing GRAPHIC decision are skipped
   *  (that moment is owned by a data fact), and the remaining offer budget is 72 minus those facts. */
  existingDecisions: ReadonlyArray<Pick<EditDecision, 'type' | 'frame'>>;
}

/** Build narrative beat decisions for the design pre-pass. Returns [] when there is nothing to offer. */
export function produceNarrativeBeatDecisions(input: ProduceNarrativeBeatDecisionsInput): EditDecision[] {
  const fps = Number.isFinite(input.fps) && input.fps > 0 ? input.fps : 30;
  const beats = segmentNarrativeBeats(input.words);
  if (beats.length === 0) return [];

  const graphicFrames = input.existingDecisions
    .filter((d) => d.type === 'graphic' && Number.isFinite(d.frame))
    .map((d) => d.frame);
  const factBeatCount = graphicFrames.length;

  // A beat whose window already contains a fact graphic is that fact's moment — never double-book it.
  const free = beats.filter((beat) => !graphicFrames.some((frame) => {
    const frameMs = (frame / fps) * 1000;
    return frameMs >= beat.startMs && frameMs <= beat.endMs;
  }));
  if (free.length === 0) return [];

  // Offer cap ← design-plan schema bounds (see header). Even temporal sampling — no intro bias.
  const budget = Math.max(0, MAX_DESIGN_SESSION_MOMENTS - factBeatCount);
  const offered = free.length <= budget
    ? free
    : Array.from({ length: budget }, (_, i) => free[Math.floor((i * free.length) / budget)]);

  return offered.map((beat) => ({
    type: 'graphic' as const,
    frame: Math.max(0, Math.round((beat.startMs / 1000) * fps)),
    durationFrames: Math.min(
      MAX_BEAT_DURATION_FRAMES,
      Math.round((Math.max(MIN_BEAT_DURATION_MS, beat.endMs - beat.startMs + BEAT_TAIL_MS) / 1000) * fps),
    ),
    priority: 2,
    source: 'narrative-beat-producer:p3.5',
    signal: 'narrative_beat',
    reason: 'narrative_beat',
    confidence: NARRATIVE_BEAT_CONFIDENCE,
    params: {
      graphicType: 'narrative',
      line: beat.line,
      sourceSpan: { text: beat.line, startMs: beat.startMs, endMs: beat.endMs },
    },
  } as EditDecision));
}
