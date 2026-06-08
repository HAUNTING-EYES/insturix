// Untracked PROTOTYPE (D-017 de-risk). Proves the NO-TYPE-MENU generative path: feed the production
// chain (resolveMotionTokens → scoreAllOverlays → planComposition) hand-picked CONTENT + a BRAND +
// a SIGNAL profile ("spine"), with NO graphicType anywhere — the shape emerges from analyzeContentShape.
// Writes overlays to .calibration-temp/spine-proto-mgs.json for render-mg-stills to render.
// Question it answers: does signal+content+brand generation look DESIGNED, or a dirty mashup?
// READ-ONLY (writes only .calibration-temp). Stays UNTRACKED. Run: npx tsx scripts/spine-prototype.ts
import { writeFileSync, readFileSync } from 'fs';
import * as path from 'path';
import { planComposition, type MgOverlayScores } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import { brandInputsFromUnifiedBrand } from '../lib/editron/motion-graphics/engine/brand-composition-rules';

// Selection (multiplicative) vs property (additive) overlays — EXACT mirror of edl-executor.ts:1114-1120.
const SELECTION_IDS = new Set([
  'mg.animation.entrance_fade', 'mg.animation.entrance_pop', 'mg.animation.entrance_slide',
  'mg.animation.entrance_blur', 'mg.animation.entrance_scale', 'mg.animation.entrance_rotate',
  'mg.animation.entrance_skew', 'mg.animation.entrance_zoom_blur',
  'mg.animation.hold_pulse', 'mg.animation.hold_breathe', 'mg.animation.hold_float', 'mg.animation.hold_glow',
]);
const allMgDefs = getOverlayDefinitions().filter(d => d.category === 'mg-property');
const propDefs = allMgDefs.filter(d => !SELECTION_IDS.has(d.id));
const selDefs = allMgDefs.filter(d => SELECTION_IDS.has(d.id));
function computeMgScores(signals: Record<string, number | string>): MgOverlayScores {
  const scores: MgOverlayScores = {};
  for (const r of [...scoreAllOverlays(propDefs, signals as never, 'additive'), ...scoreAllOverlays(selDefs, signals as never, 'multiplicative')])
    scores[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  return scores;
}
function quiet<T>(fn: () => T): T {
  const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = l; console.warn = w; }
}

// Real signal snapshot (correct keys/format) from the dump, modulated into two "spines".
const dump = JSON.parse(readFileSync(path.resolve(process.cwd(), '.calibration-temp', 'proj_OzG2qgoYudFa-mgs.json'), 'utf8'));
const base: Record<string, number | string> = { ...(dump.mgs.find((o: any) => o.contentSignals)?.contentSignals || {}) };
const ENERGETIC = { ...base, formality: 0.25, enthusiasm: 0.95, emotional_arousal: 0.8, pacing_velocity: 0.8, visceral_impact: 0.7, humor: 0.4 };
const CALM      = { ...base, formality: 0.75, enthusiasm: 0.3, emotional_arousal: 0.2, pacing_velocity: 0.3, visceral_impact: 0.2, humor: 0.05 };

const BLUE = brandInputsFromUnifiedBrand({ visual: { colors: ['#2563EB', '#1E3A8A'] } } as never);
const ORANGE = brandInputsFromUnifiedBrand({ visual: { colors: ['#FF6B00', '#7C2D12'] } } as never);

// Content moments — fields chosen so analyzeContentShape duck-types each WITHOUT any graphicType label.
const CONTENT = {
  stat:    { value: '100,000', label: 'subscribers' },
  callout: { title: 'Selection Bias', body: "When your sample isn't random" },
  word:    { emphasisWord: 'superhero', text: 'superhero' },
  quote:   { quote: 'The internet rewards the loudest, not the smartest', author: 'Hank Green' },
  name:    { name: 'Hank Green', title: 'Science Educator' },
};

interface Case { label: string; content: Record<string, unknown>; signals: Record<string, number | string>; brand: typeof BLUE }
const CASES: Case[] = [
  // Set 1 — ONE spine (blue/energetic), 5 different contents: SAME look, shape varies by content.
  { label: 'A1-blue-energetic-stat',    content: CONTENT.stat,    signals: ENERGETIC, brand: BLUE },
  { label: 'A2-blue-energetic-callout', content: CONTENT.callout, signals: ENERGETIC, brand: BLUE },
  { label: 'A3-blue-energetic-word',    content: CONTENT.word,    signals: ENERGETIC, brand: BLUE },
  { label: 'A4-blue-energetic-quote',   content: CONTENT.quote,   signals: ENERGETIC, brand: BLUE },
  { label: 'A5-blue-energetic-name',    content: CONTENT.name,    signals: ENERGETIC, brand: BLUE },
  // Set 2 — SAME content (word), intensity from signals: energetic vs calm.
  { label: 'B1-blue-calm-word',         content: CONTENT.word,    signals: CALM,      brand: BLUE },
  { label: 'B2-blue-calm-stat',         content: CONTENT.stat,    signals: CALM,      brand: BLUE },
  // Set 3 — SAME content+spine, different brand: structure same, colour follows brand.
  { label: 'C1-orange-energetic-stat',  content: CONTENT.stat,    signals: ENERGETIC, brand: ORANGE },
];

const mgs = CASES.map((c, i) => {
  const tokens = resolveMotionTokens(c.signals as never, c.brand);
  const mgScores = computeMgScores(c.signals);
  const recipe = quiet(() => planComposition({ content: c.content, triggerMoment: c.label }, tokens, c.signals as never, mgScores));
  const roles = (recipe.elements || []).map((e: any) => e.role);
  console.log(`  ${c.label.padEnd(28)} kind→ els=${recipe.elements.length} layout=${recipe.layout.position} accent=${(tokens as any).color?.accent} roles=[${roles.slice(0, 8).join(',')}]`);
  return {
    index: i, type: 'motion-graphic', content: c.content, resolvedTokens: tokens,
    contentSignals: c.signals, recipe, durationInFrames: 90, from: 0,
    metadata: { graphicType: c.label },
  };
});

const dst = path.resolve(process.cwd(), '.calibration-temp', 'spine-proto-mgs.json');
writeFileSync(dst, JSON.stringify({ projectId: 'spine-proto', width: 1920, height: 1080, mgs }, null, 2), 'utf8');
console.log(`\nwrote ${mgs.length} prototype graphics → ${dst}\nrender: npx tsx scripts/render-mg-stills.ts spine-proto-mgs.json`);
