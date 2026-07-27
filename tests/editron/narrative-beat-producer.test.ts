/**
 * Narrative beat producer (P3.5 Phase B2) — segmentation + decision synthesis.
 * Thresholds under test are lifted from the proven eval harness (eval-designer-compliance.ts): sentence-end
 * or ≥800ms pause boundaries, <4-word merge, 2.5s duration floor + 700ms tail, 150-frame ceiling. The offer
 * cap (72) comes from the design-plan contract (moments.max 24 + declined.max 48).
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_DESIGN_SESSION_MOMENTS,
  produceNarrativeBeatDecisions,
  segmentNarrativeBeats,
  type NarrativeBeatWord,
} from '@/lib/editron/services/narrative-beat-producer';

function w(word: string, startMs: number, endMs?: number): NarrativeBeatWord {
  return { word, startMs, endMs: endMs ?? startMs + 200 };
}

function sentence(text: string, startMs: number, gapMs = 250): NarrativeBeatWord[] {
  return text.split(' ').map((word, i) => w(word, startMs + i * gapMs));
}

describe('segmentNarrativeBeats', () => {
  it('splits at sentence-final punctuation', () => {
    const words = [...sentence('Money is a tool.', 0), ...sentence('Use it well every day', 2000)];
    const beats = segmentNarrativeBeats(words);
    expect(beats.map((b) => b.line)).toEqual(['Money is a tool.', 'Use it well every day']);
  });

  it('splits at a >=800ms pause without punctuation', () => {
    const first = sentence('nobody teaches this stuff', 0);
    const second = sentence('so you learn it alone', first[first.length - 1].endMs + 800);
    const beats = segmentNarrativeBeats([...first, ...second]);
    expect(beats).toHaveLength(2);
  });

  it('merges groups under 4 words into the previous beat', () => {
    const words = [...sentence('This is the whole game right here.', 0), ...sentence('Truly so.', 3000)];
    const beats = segmentNarrativeBeats(words);
    expect(beats).toHaveLength(1);
    expect(beats[0].line).toContain('Truly so.');
  });

  it('is deterministic and ignores empty/invalid words', () => {
    const words = [w('  ', 0), ...sentence('Real words only here.', 100), { word: 'x', startMs: NaN, endMs: NaN }];
    expect(segmentNarrativeBeats(words)).toEqual(segmentNarrativeBeats(words));
    expect(segmentNarrativeBeats(words)).toHaveLength(1);
  });
});

describe('produceNarrativeBeatDecisions', () => {
  const words = [
    ...sentence('How come they never teach us money at school.', 0),
    ...sentence('Well they do not want you to know.', 4000),
  ];

  it('emits a designer-licensed graphic decision per free beat, grounded in its span', () => {
    const decisions = produceNarrativeBeatDecisions({ words, fps: 30, existingDecisions: [] });
    expect(decisions).toHaveLength(2);
    for (const d of decisions) {
      expect(d.type).toBe('graphic');
      expect(d.confidence).toBeGreaterThan(0.5); // executor's execution floor
      expect(d.params.graphicType).toBe('narrative');
      expect(String(d.params.line).length).toBeGreaterThan(0);
      const span = d.params.sourceSpan as { text: string; startMs: number; endMs: number };
      expect(span.text).toBe(d.params.line);
      expect(d.frame).toBe(Math.round((span.startMs / 1000) * 30));
      expect(d.durationFrames).toBeGreaterThanOrEqual(75); // 2.5s floor @ 30fps
      expect(d.durationFrames).toBeLessThanOrEqual(150);
    }
  });

  it('skips beats whose window already contains a fact graphic (no double-booking)', () => {
    // frame 30 @ 30fps = 1000ms → inside beat 1's window
    const decisions = produceNarrativeBeatDecisions({
      words, fps: 30, existingDecisions: [{ type: 'graphic', frame: 30 }],
    });
    expect(decisions).toHaveLength(1);
    expect(String(decisions[0].params.line)).toContain('do not want you to know');
  });

  it('caps the offer at the design-plan contract bound, sampled across the timeline', () => {
    const many: NarrativeBeatWord[] = [];
    for (let i = 0; i < 200; i++) many.push(...sentence(`Beat number ${i} says something real.`, i * 5000));
    const decisions = produceNarrativeBeatDecisions({ words: many, fps: 30, existingDecisions: [] });
    expect(decisions.length).toBeLessThanOrEqual(MAX_DESIGN_SESSION_MOMENTS);
    // even sampling: the last offered beat comes from the back half of the timeline, not the intro
    const lastFrame = decisions[decisions.length - 1].frame;
    expect(lastFrame).toBeGreaterThan((100 * 5000 / 1000) * 30);
  });

  it('returns [] for empty transcripts', () => {
    expect(produceNarrativeBeatDecisions({ words: [], fps: 30, existingDecisions: [] })).toEqual([]);
  });
});
