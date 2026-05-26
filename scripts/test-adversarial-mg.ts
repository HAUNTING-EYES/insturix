import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import defs from '../lib/editron/engine/overlay-definitions.json';
import { planComposition, type MgOverlayScores } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import type { OverlayDefinition } from '../lib/editron/engine/utility-types';

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ FAIL: ${msg}`); }
}

const mgDefs = (defs as OverlayDefinition[]).filter(d => d.category === 'mg-property');
const SELECTION_IDS = new Set([
  'mg.animation.entrance_fade', 'mg.animation.entrance_pop', 'mg.animation.entrance_slide',
  'mg.animation.entrance_blur', 'mg.animation.entrance_scale',
  'mg.animation.hold_pulse', 'mg.animation.hold_breathe', 'mg.animation.hold_float',
]);
const propDefs = mgDefs.filter(d => !SELECTION_IDS.has(d.id));
const selDefs = mgDefs.filter(d => SELECTION_IDS.has(d.id));

function buildScores(signals: Record<string, number>): MgOverlayScores {
  const propResults = scoreAllOverlays(propDefs, signals, 'additive');
  const selResults = scoreAllOverlays(selDefs, signals, 'multiplicative');
  const scores: MgOverlayScores = {};
  for (const r of [...propResults, ...selResults]) {
    scores[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  }
  return scores;
}

console.log('=== Adversarial: Empty signals ===');
{
  const tokens = resolveMotionTokens({}, {});
  const recipe = planComposition({ kind: 'numeric', content: { value: '42%' }, triggerMoment: 'test' }, tokens);
  assert(recipe.elements.length > 0, 'empty signals: produces elements (uses defaults)');
  const counter = recipe.elements.find(e => e.role === 'counter');
  assert(counter?.bind?.minSize === 64, `empty signals: CRG floor 64px (got ${counter?.bind?.minSize})`);
}

console.log('\n=== Adversarial: mgScores = empty object ===');
{
  const signals = { enthusiasm: 0.5, formality: 0.5, warmth: 0.5 };
  const tokens = resolveMotionTokens(signals, {});
  const recipe = planComposition(
    { kind: 'numeric', content: { value: '42%' }, triggerMoment: 'test' },
    tokens, signals, {},
  );
  assert(recipe.elements.length > 0, 'empty mgScores: produces elements (uses fallbacks)');
  const counter = recipe.elements.find(e => e.role === 'counter');
  assert(counter?.bind?.minSize === 64, `empty mgScores: CRG floor 64px (got ${counter?.bind?.minSize})`);
  assert(counter?.bind?.lineHeight === 1.1, `empty mgScores: default lineHeight 1.1 (got ${counter?.bind?.lineHeight})`);
}

console.log('\n=== Adversarial: All signals at 0.0 ===');
{
  const signals: Record<string, number> = {};
  for (const key of ['enthusiasm', 'warmth', 'formality', 'emotional_arousal', 'pacing_velocity', 'visceral_impact', 'visual_dependency', 'humor', 'speech.coverage']) {
    signals[key] = 0;
  }
  const mgScores = buildScores(signals);
  const tokens = resolveMotionTokens(signals, {});
  const recipe = planComposition(
    { kind: 'numeric', content: { value: '1', label: 'Test' }, triggerMoment: 'test' },
    tokens, signals, mgScores,
  );
  const counter = recipe.elements.find(e => e.role === 'counter');
  assert((counter?.bind?.minSize as number) >= 64, `all-zero signals: font >= CRG floor (got ${counter?.bind?.minSize})`);
  assert(typeof counter?.bind?.lineHeight === 'number', `all-zero signals: lineHeight is number (got ${counter?.bind?.lineHeight})`);
}

console.log('\n=== Adversarial: All signals at 1.0 ===');
{
  const signals: Record<string, number> = {};
  for (const key of ['enthusiasm', 'warmth', 'formality', 'emotional_arousal', 'pacing_velocity', 'visceral_impact', 'visual_dependency', 'humor', 'speech.coverage']) {
    signals[key] = 1;
  }
  const mgScores = buildScores(signals);
  const tokens = resolveMotionTokens(signals, {});
  const recipe = planComposition(
    { kind: 'emphasis', content: { text: 'WOW' }, triggerMoment: 'test' },
    tokens, signals, mgScores,
  );
  const primary = recipe.elements.find(e => e.role === 'primary');
  assert((primary?.bind?.minSize as number) >= 48, `all-one signals: keyword font >= CRG floor 48 (got ${primary?.bind?.minSize})`);
  assert((primary?.bind?.minSize as number) <= 160, `all-one signals: keyword font <= overlay max 160 (got ${primary?.bind?.minSize})`);
}

console.log('\n=== Adversarial: NaN signals ===');
{
  const signals = { enthusiasm: NaN, warmth: NaN, formality: NaN };
  const mgScores = buildScores(signals);
  const tokens = resolveMotionTokens(signals as any, {});
  const recipe = planComposition(
    { kind: 'identity', content: { name: 'Test', title: 'Role' }, triggerMoment: 'test' },
    tokens, signals as any, mgScores,
  );
  assert(recipe.elements.length > 0, 'NaN signals: produces elements (scoring handles NaN gracefully)');
}

console.log('\n=== Adversarial: Partial scores (some overlays missing) ===');
{
  const signals = { enthusiasm: 0.7, formality: 0.3, warmth: 0.6 };
  const partialScores: MgOverlayScores = {
    'mg.typography.font_size': { score: 0.8, values: { fontSize: 135 } },
  };
  const tokens = resolveMotionTokens(signals, {});
  const recipe = planComposition(
    { kind: 'numeric', content: { value: '99', label: 'Score' }, triggerMoment: 'test' },
    tokens, signals, partialScores,
  );
  const counter = recipe.elements.find(e => e.role === 'counter');
  assert(counter?.bind?.minSize === 135, `partial scores: fontSize from overlay (got ${counter?.bind?.minSize})`);
  assert(counter?.bind?.lineHeight === 1.1, `partial scores: lineHeight falls back to default (got ${counter?.bind?.lineHeight})`);
}

console.log('\n=== Adversarial: CRG floor enforcement under all graphic types ===');
{
  const lowSignals = { enthusiasm: 0.01, warmth: 0.01, formality: 0.01, visceral_impact: 0.01, pacing_velocity: 0.01, emotional_arousal: 0.01, visual_dependency: 0.01, humor: 0.01, 'speech.coverage': 0.01 };
  const mgScores = buildScores(lowSignals);
  const tokens = resolveMotionTokens(lowSignals, {});

  const kinds = [
    { kind: 'numeric', content: { value: '1' }, floor: 64, label: 'stat counter' },
    { kind: 'identity', content: { name: 'X' }, floor: 48, label: 'lower third' },
    { kind: 'quotation', content: { quote: 'X' }, floor: 42, label: 'quote card' },
    { kind: 'emphasis', content: { text: 'X' }, floor: 48, label: 'keyword' },
  ] as const;

  for (const k of kinds) {
    const recipe = planComposition(
      { kind: k.kind, content: k.content, triggerMoment: 'test' },
      tokens, lowSignals, mgScores,
    );
    const primary = recipe.elements.find(e => e.role === 'counter' || e.role === 'primary');
    const size = primary?.bind?.minSize as number;
    assert(size >= k.floor, `${k.label}: CRG floor ${k.floor}px enforced with low signals (got ${size})`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) console.log('ALL ADVERSARIAL TESTS PASSED ✓');
else { console.log('SOME ADVERSARIAL TESTS FAILED ✗'); process.exit(1); }
