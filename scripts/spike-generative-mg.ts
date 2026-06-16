// Untracked SPIKE — throwaway de-risk probe, NOT production. Never `git add`.
// Proves the hard claim: ONE generator turns different real content STRUCTURES into different
// visual+motion FORMS by ENCODING RULES — no composer, no graphic-type name (no menu).
// All moments are real, from the Hank Green "internet trolls" transcript (proj_OzG2qgoYudFa).
//
// Encoding rules (grounded in 01-Research/MG-Generative-Grammar-Research, NOT invented):
//   proportion (part-of-whole)        -> FILLED FRACTION (Cleveland-McGill length/position; CONTAINER schema)
//   proportion + NEGATED              -> show the claim diminished, the REFUTATION focal (meaning = "this is false")
//   magnitude LARGE (count, no whole) -> DENSITY: many marks = many (quantity encodes quantity)
//   magnitude SMALL (about scarcity)  -> SPARSE: a lone mark in emptiness (negative space = isolation)
//   reframe (wrong -> right wording)  -> CONTRAST by tier: corrected framing dominant
//   decline (less / worse over time)  -> DOWNWARD (MORE-IS-UP inverted; CHANGE-IS-MOTION)
//   Laws every branch obeys: ONE focal point; legible CRG floors; semantic colour (green=good, red=false).
// Element shapes/bindings modeled on composeNumeric/composeDataSeries/moveBadge/particle (known to render).
// Run: npx tsx scripts/spike-generative-mg.ts   then:   npx tsx scripts/render-mg-stills.ts spike
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import type { Recipe, RecipeElement } from '../lib/editron/motion-graphics/engine/recipe-types';
import * as fs from 'fs';
import * as path from 'path';

const CRG_HERO = 64;   // constant:typography.stat_counter_min_font
const CRG_LABEL = 36;  // constant:typography.callout_label_min_font

// OPEN structures, hand-read from real moments (extraction is a separate, tractable hop; this spike
// isolates the unproven structure->form mapping).
type Structure =
  | { kind: 'proportion'; part: number; whole: number; subject: string; quality: string; negated?: boolean }
  | { kind: 'magnitude'; value: string; sense: 'large' | 'small'; caption: string }
  | { kind: 'reframe'; wrong: string; right: string }
  | { kind: 'decline'; head: string; sub: string };

const txt = (role: string, bindText: string, color: string, minSize: number, opts: Record<string, unknown> = {}): RecipeElement => ({
  primitive: 'text', role, layer: 'foreground',
  bind: { text: bindText, font: 'token:typography.headingFamily', weight: 'token:typography.headingWeight', color, minSize, ...opts },
});

// THE GENERATOR: structure -> recipe, by encoding RULE. No composer, no type name.
function encode(s: Structure): { recipe: Recipe; content: Record<string, unknown>; note: string } {
  let elements: RecipeElement[]; let content: Record<string, unknown>; let layout: Recipe['layout']; let note: string;

  if (s.kind === 'proportion' && !s.negated) {
    const pct = Math.round((s.part / s.whole) * 100);
    elements = [
      { primitive: 'data-viz', role: 'percentage-ring', layer: 'foreground', animation: 'grow-up',
        bind: { values: 'content:values', color: 'token:color.accent', textColor: 'token:color.textPrimary', font: 'token:typography.bodyFamily' } },
      txt('secondary', 'content:caption', 'token:color.textSecondary', CRG_LABEL, { font: 'token:typography.bodyFamily', weight: 'token:typography.bodyWeight' }),
    ];
    content = { values: [pct], caption: `of ${s.subject} are ${s.quality}` };
    layout = { position: 'center', maxWidth: '70%' };
    note = `proportion ${pct}/100 -> filled fraction`;
  } else if (s.kind === 'proportion' && s.negated) {
    // RULE: a refuted proportion -> the claim is diminished; the REFUTATION is the focal point.
    elements = [
      txt('secondary', 'content:claim', 'token:color.textSecondary', 44, { weight: 'token:typography.bodyWeight' }),
      txt('primary', 'content:verdict', 'token:color.accent', CRG_HERO + 16, { weight: 800, transform: 'uppercase' }),
    ];
    content = { claim: `"a third of people are terrible"`, verdict: 'not true' };
    layout = { position: 'center', maxWidth: '75%' };
    note = `negated proportion -> claim dimmed, refutation focal`;
  } else if (s.kind === 'magnitude' && s.sense === 'large') {
    // RULE: large count -> DENSITY. Many marks = many. The number rides the crowd.
    elements = [
      { primitive: 'particle', role: 'ambient-particles', layer: 'background',
        bind: { particlePreset: 'dust', particleCount: 150, color: 'token:color.accent', secondaryColor: 'token:color.primary', size: 5 } },
      { primitive: 'text', role: 'counter', layer: 'foreground', animation: 'count-up',
        bind: { text: 'content:value', font: 'token:typography.headingFamily', weight: 'token:typography.headingWeight', color: 'token:color.textPrimary', minSize: 110 } },
      txt('secondary', 'content:caption', 'token:color.textSecondary', CRG_LABEL, { font: 'token:typography.bodyFamily', weight: 'token:typography.bodyWeight' }),
    ];
    content = { value: s.value, caption: s.caption };
    layout = { position: 'center', maxWidth: '80%' };
    note = `large magnitude -> density (particle crowd) + big number`;
  } else if (s.kind === 'magnitude' && s.sense === 'small') {
    // RULE: a tiny value ABOUT scarcity -> SPARSE. A lone mark in emptiness; narrow box = surrounding void.
    elements = [
      { primitive: 'group', role: 'lone-dot', layer: 'foreground', bind: { width: 14, height: 14 },
        children: [{ primitive: 'shape', shape: 'circle', role: 'dot', layer: 'foreground', bind: { fill: 'token:color.accent' } }] },
      txt('secondary', 'content:value', 'token:color.textSecondary', 44, { font: 'token:typography.monoFamily', weight: 'token:typography.bodyWeight' }),
      txt('label', 'content:caption', 'token:color.textSecondary', CRG_LABEL, { font: 'token:typography.bodyFamily', weight: 'token:typography.bodyWeight' }),
    ];
    content = { value: s.value, caption: s.caption };
    layout = { position: 'center', maxWidth: '42%' };  // narrow -> the void around it is the message
    note = `tiny magnitude -> sparse / lone mark in emptiness`;
  } else if (s.kind === 'reframe') {
    // RULE: a reframe -> CONTRAST by tier. The corrected wording dominates; the wrong one recedes.
    elements = [
      txt('secondary', 'content:wrong', 'token:color.textSecondary', 40, { weight: 'token:typography.bodyWeight' }),
      txt('primary', 'content:right', 'token:color.accent', CRG_HERO + 8, { weight: 'token:typography.headingWeight' }),
    ];
    content = { wrong: s.wrong, right: s.right };
    layout = { position: 'center', maxWidth: '78%' };
    note = `reframe -> contrast by tier`;
  } else if (s.kind === 'decline') {
    // RULE: decline -> DOWNWARD (MORE-IS-UP inverted). The arrow carries the direction.
    elements = [
      txt('primary', '↓', 'token:color.accent', 128, { weight: 800 }),
      txt('secondary', 'content:head', 'token:color.textPrimary', 52, { weight: 'token:typography.headingWeight' }),
      txt('label', 'content:sub', 'token:color.textSecondary', CRG_LABEL, { font: 'token:typography.bodyFamily', weight: 'token:typography.bodyWeight' }),
    ];
    content = { head: s.head, sub: s.sub };
    layout = { position: 'center', maxWidth: '70%' };
    note = `decline -> downward`;
  } else {
    throw new Error('encode: unhandled structure');
  }
  return { recipe: { id: `spike-${s.kind}`, elements, layout, exitStyle: 'reverse-stagger' }, content, note };
}

type Moment = { label: string; structure: Structure; signals: Record<string, number>; brand: Record<string, string> };
const MOMENTS: Moment[] = [
  { label: '90pct-good', structure: { kind: 'proportion', part: 90, whole: 100, subject: 'people', quality: 'good' },
    signals: { enthusiasm: 0.55, warmth: 0.85, formality: 0.45, emotional_arousal: 0.5, pacing_velocity: 0.4, visual_dependency: 0.6 },
    brand: { accentColor: '#16A34A', primaryColor: '#E8F0E8', backgroundColor: '#0B130D' } }, // green = good
  { label: '100k-crowd', structure: { kind: 'magnitude', value: '100,000', sense: 'large', caption: 'people watching the same video' },
    signals: { enthusiasm: 0.8, warmth: 0.4, formality: 0.35, emotional_arousal: 0.7, pacing_velocity: 0.7, visual_dependency: 0.7 },
    brand: { accentColor: '#3B82F6', primaryColor: '#DCE7F5', backgroundColor: '#0A0E16' } },
  { label: 'third-myth', structure: { kind: 'proportion', part: 1, whole: 3, subject: 'people', quality: 'terrible', negated: true },
    signals: { enthusiasm: 0.5, warmth: 0.3, formality: 0.55, emotional_arousal: 0.6, pacing_velocity: 0.5, visual_dependency: 0.5 },
    brand: { accentColor: '#DC2626', primaryColor: '#F0E0E0', backgroundColor: '#140B0B' } }, // red = false/danger
  { label: 'worst-people', structure: { kind: 'reframe', wrong: 'not the worst IN people', right: 'the worst people' },
    signals: { enthusiasm: 0.6, warmth: 0.35, formality: 0.45, emotional_arousal: 0.65, pacing_velocity: 0.6, visual_dependency: 0.55 },
    brand: { accentColor: '#F59E0B', primaryColor: '#F2EADA', backgroundColor: '#12100A' } },
  { label: 'fewer-worse', structure: { kind: 'decline', head: 'fewer good voices', sub: 'and it gets worse and worse' },
    signals: { enthusiasm: 0.25, warmth: 0.3, formality: 0.5, emotional_arousal: 0.4, pacing_velocity: 0.35, visual_dependency: 0.5 },
    brand: { accentColor: '#64748B', primaryColor: '#D8DEE6', backgroundColor: '#0B0E13' } }, // desaturated = decline
  { label: '0p02-isolation', structure: { kind: 'magnitude', value: '0.02', sense: 'small', caption: 'people he talks to — all day, in the whole real world' },
    signals: { enthusiasm: 0.2, warmth: 0.25, formality: 0.5, emotional_arousal: 0.35, pacing_velocity: 0.3, visual_dependency: 0.45 },
    brand: { accentColor: '#94A3B8', primaryColor: '#C8CED6', backgroundColor: '#0A0C10' } }, // dim = isolation
];

const mgs = MOMENTS.map((m) => {
  const tokens = resolveMotionTokens(m.signals as never, m.brand as never);
  const { recipe, content, note } = encode(m.structure);
  return { recipe, content, resolvedTokens: tokens, contentSignals: m.signals, durationInFrames: 120,
    canvasWidth: 1920, canvasHeight: 1080, metadata: { graphicType: m.label, note } };
});

const file = path.resolve(process.cwd(), '.calibration-temp', 'spike-mgs.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ width: 1920, height: 1080, mgs }, null, 2));
console.log(`Wrote ${mgs.length} spike MGs (one generator, ${new Set(MOMENTS.map(m => m.structure.kind)).size} structure kinds) -> ${file}\n`);
mgs.forEach((m, i) => console.log(`  [${i}] ${(MOMENTS[i].label).padEnd(16)} ${m.metadata.note}`));
