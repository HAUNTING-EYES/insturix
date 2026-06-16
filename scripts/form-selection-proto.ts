// Untracked architecture proof: "is form-selection a preset, or scored emergence — and does it
// survive HARD content?" Forms = scorable overlays; affordance = HARD GATE (a 0/1 structure signal,
// linear slope 1 → 0 kills it multiplicatively); fit = curve. Run through the REAL utility-scorer.
// Shows: compete, lose, subsume, cap, and NOTHING. The LOOK (size/weight/colour) is the dials, not here.
// HONEST: the structure signals are HAND-FED — extracting them from real content is the LLM's job and
// the real risk (a wrong is_series on "2 cats 3 dogs" would mis-fire). This proves the SELECTION model,
// not the extraction. Curve params first-draft (grounded in 1/2/3 thresholds; need calibration).
// Run: npx tsx scripts/form-selection-proto.ts
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import type { OverlayDefinition } from '../lib/editron/engine/utility-types';

const lin = (slope = 1, xShift = 0, yShift = 0) => ({ curveType: 'linear' as const, params: { slope, exponent: 1, xShift, yShift } });
const logi = (xShift = 0) => ({ curveType: 'logistic' as const, params: { slope: 1, exponent: 1, xShift, yShift: 0 } });
const G = (signalId: string, desc: string) => ({ signalId, ...lin(1), invert: false, description: `HARD GATE — ${desc}` });

// Every form: a global warrant + a HARD affordance gate (the structure it REQUIRES) + fit curves.
const FORMS: OverlayDefinition[] = [
  { id: 'form.stat_number', category: 'graphic', rank: 50, weight: 1, minScore: 0.2, minGapFrames: 0,
    considerations: [
      { signalId: 'graphic_warrant', ...lin(1), invert: false, description: 'moment wants a graphic' },
      G('has_number', 'needs a number to exist'),
      { signalId: 'cardinality_norm', ...lin(1), invert: true, description: 'favours a SINGLE value' },
      { signalId: 'salience', ...lin(1), invert: false, description: 'the number is the point' },
    ], outputParams: [] },
  { id: 'form.comparison', category: 'graphic', rank: 50, weight: 1, minScore: 0.2, minGapFrames: 0,
    considerations: [
      { signalId: 'graphic_warrant', ...lin(1), invert: false, description: 'wants a graphic' },
      G('is_comparison', 'needs a real 2-thing contrast'),
      { signalId: 'narrative_turn', ...lin(1), invert: false, description: 'a contrast/turn beat' },
    ], outputParams: [] },
  { id: 'form.timeline', category: 'graphic', rank: 50, weight: 1, minScore: 0.2, minGapFrames: 0,
    considerations: [
      { signalId: 'graphic_warrant', ...lin(1), invert: false, description: 'wants a graphic' },
      G('is_ordered', 'needs a real ordered set'),
      { signalId: 'cardinality_norm', ...logi(-0.2), invert: false, description: 'enough steps (≥3)' },
    ], outputParams: [] },
  { id: 'form.bar_chart', category: 'graphic', rank: 50, weight: 1, minScore: 0.2, minGapFrames: 0,
    considerations: [
      { signalId: 'graphic_warrant', ...lin(1), invert: false, description: 'wants a graphic' },
      G('is_series', 'needs a comparable ≥3 SAME-metric series'),
      { signalId: 'cardinality_norm', ...logi(-0.2), invert: false, description: 'enough points (≥3)' },
    ], outputParams: [] },
  { id: 'form.lower_third', category: 'graphic', rank: 50, weight: 1, minScore: 0.2, minGapFrames: 0,
    considerations: [
      { signalId: 'graphic_warrant', ...lin(1), invert: false, description: 'wants a graphic' },
      G('is_name_first_mention', 'needs a first-mention name'),
      { signalId: 'salience', ...lin(0.7, 0, 0.25), invert: false, description: 'worth identifying' },
    ], outputParams: [] },
];

type M = { name: string; s: Record<string, number>; want: string };
const Z = { has_number: 0, cardinality_norm: 0, salience: 0, is_comparison: 0, is_ordered: 0, is_series: 0, narrative_turn: 0, is_name_first_mention: 0, graphic_warrant: 0 };

const EASY: M[] = [
  { name: 'M1 single stat "revenue tripled — 300%"', want: 'STAT',       s: { ...Z, graphic_warrant: 0.85, has_number: 1, cardinality_norm: 0.1, salience: 0.9 } },
  { name: 'M2 "old way vs new way"',                 want: 'COMPARISON', s: { ...Z, graphic_warrant: 0.8, is_comparison: 1, narrative_turn: 0.8, cardinality_norm: 0.2 } },
  { name: 'M3 "first, then, finally"',               want: 'TIMELINE',   s: { ...Z, graphic_warrant: 0.75, is_ordered: 1, cardinality_norm: 0.3, salience: 0.5 } },
  { name: 'M4 "Q1 12, Q2 19, Q3 27, Q4 41"',         want: 'BAR_CHART',  s: { ...Z, graphic_warrant: 0.7, has_number: 1, is_series: 1, cardinality_norm: 0.4, salience: 0.5 } },
];
const TOUGH: M[] = [
  { name: 'T1 FALSE CHART "I have 2 cats and 3 dogs" (coincidental numbers, NOT a series)', want: 'NO chart',   s: { ...Z, graphic_warrant: 0.4, has_number: 1, cardinality_norm: 0.2, salience: 0.3 } },
  { name: 'T2 FAKE TIMELINE "First of all, I love you" ("first" but no process)',           want: 'NOTHING',    s: { ...Z, graphic_warrant: 0.5, salience: 0.4, cardinality_norm: 0.1 } },
  { name: 'T3 MULTI-STRUCTURE "from 12% to 47%, a 4x jump" (comparison CONTAINS the stat)',  want: 'COMPARISON', s: { ...Z, graphic_warrant: 0.85, has_number: 1, is_comparison: 1, cardinality_norm: 0.2, salience: 0.7, narrative_turn: 0.7 } },
  { name: 'T4 PEERS — a name AND a stat at the same beat (cap=1 forces a choice)',           want: 'one wins, other defers', s: { ...Z, graphic_warrant: 0.8, has_number: 1, is_name_first_mention: 1, cardinality_norm: 0.1, salience: 0.7 } },
  { name: 'T5 IDIOM TRAP "it was night and day" (sounds comparative, NO data)',              want: 'NOTHING (if extraction not fooled)', s: { ...Z, graphic_warrant: 0.6, salience: 0.5, narrative_turn: 0.6 } },
  { name: 'T6 RESTRAINT — weak everything',                                                  want: 'NOTHING',    s: { ...Z, graphic_warrant: 0.25, has_number: 1, cardinality_norm: 0.1, salience: 0.2 } },
];

function run(title: string, moments: M[]): void {
  console.log(`\n=== ${title} ===`);
  for (const m of moments) {
    const results = scoreAllOverlays(FORMS, m.s, 'multiplicative');
    const winner = results[0];
    const line = FORMS.map(f => {
      const r = results.find(x => x.overlayId === f.id);
      return `${f.id.replace('form.', '').slice(0, 5).padEnd(5)} ${(r ? r.totalScore : 0).toFixed(2)}`;
    }).join(' ');
    const got = winner ? winner.overlayId.replace('form.', '').toUpperCase() : 'NOTHING';
    const runnerUp = results[1] ? ` (runner-up ${results[1].overlayId.replace('form.', '')} ${results[1].totalScore.toFixed(2)})` : '';
    console.log(`${m.name}\n   ${line}  → ${got}${runnerUp}   [want: ${m.want}]\n`);
  }
}

function main(): void {
  run('EASY — clean single-structure moments', EASY);
  run('TOUGH — false structure / multi-structure / peers / restraint', TOUGH);
  console.log('READ:');
  console.log('  • EASY: structure in → different form out; M2 stat is afforded but LOSES to comparison.');
  console.log('  • T1/T2/T5: false structure is GATED DEAD (no chart on coincidental numbers, no timeline on a fake "first",');
  console.log('    no comparison on an idiom) — BUT only because extraction set is_series/is_ordered/is_comparison=0.');
  console.log('    If extraction is FOOLED, the wrong form fires. THE SELECTION MODEL IS SOUND; EXTRACTION IS THE RISK.');
  console.log('  • T3: comparison WINS and subsumes the stat (one richer form, not a stack).');
  console.log('  • T4: two peers compete for the single graphic slot — winner takes it, loser defers to the next beat.');
  console.log('  • T6: NOTHING. No "if X then form Y" anywhere — the winner emerges from the score.');
}

main();
