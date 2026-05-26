import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import defs from '../lib/editron/engine/overlay-definitions.json';
import { planComposition, type MgOverlayScores } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import type { OverlayDefinition } from '../lib/editron/engine/utility-types';

const mgDefs = (defs as OverlayDefinition[]).filter(d => d.category === 'mg-property');
const SELECTION_IDS = new Set([
  'mg.animation.entrance_fade', 'mg.animation.entrance_pop', 'mg.animation.entrance_slide',
  'mg.animation.entrance_blur', 'mg.animation.entrance_scale',
  'mg.animation.hold_pulse', 'mg.animation.hold_breathe', 'mg.animation.hold_float',
]);
const propDefs = mgDefs.filter(d => !SELECTION_IDS.has(d.id));
const selDefs = mgDefs.filter(d => SELECTION_IDS.has(d.id));

function buildMgScores(signals: Record<string, number>): MgOverlayScores {
  const propResults = scoreAllOverlays(propDefs, signals, 'additive');
  const selResults = scoreAllOverlays(selDefs, signals, 'multiplicative');
  const scores: MgOverlayScores = {};
  for (const r of [...propResults, ...selResults]) {
    scores[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  }
  return scores;
}

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ FAIL: ${msg}`); }
}

const profiles: Record<string, Record<string, number>> = {
  'Energetic Vlog': { enthusiasm: 0.85, warmth: 0.7, formality: 0.2, emotional_arousal: 0.6, pacing_velocity: 0.7, visceral_impact: 0.6, visual_dependency: 0.3, humor: 0.3, 'speech.coverage': 0.65 },
  'Calm Corporate': { enthusiasm: 0.3, warmth: 0.3, formality: 0.8, emotional_arousal: 0.2, pacing_velocity: 0.3, visceral_impact: 0.2, visual_dependency: 0.5, humor: 0.05, 'speech.coverage': 0.7 },
};

for (const [name, signals] of Object.entries(profiles)) {
  const mgScores = buildMgScores(signals);
  const tokens = resolveMotionTokens(signals, {});

  console.log(`\n=== ${name}: planComposition integration ===`);

  const withoutScores = planComposition(
    { kind: 'numeric', content: { value: '42%', label: 'Growth' }, triggerMoment: 'test' },
    tokens, signals,
  );
  const withScores = planComposition(
    { kind: 'numeric', content: { value: '42%', label: 'Growth' }, triggerMoment: 'test' },
    tokens, signals, mgScores,
  );

  const c1 = withoutScores.elements.find(e => e.role === 'counter');
  const c2 = withScores.elements.find(e => e.role === 'counter');

  console.log(`  Without: minSize=${c1?.bind?.minSize}, lineHeight=${c1?.bind?.lineHeight}`);
  console.log(`  With:    minSize=${c2?.bind?.minSize}, lineHeight=${c2?.bind?.lineHeight}`);

  assert(c1 !== undefined, `counter element exists without scores`);
  assert(c2 !== undefined, `counter element exists with scores`);

  if (c1 && c2) {
    const sizeChanged = c1.bind?.minSize !== c2.bind?.minSize;
    const lhChanged = c1.bind?.lineHeight !== c2.bind?.lineHeight;
    assert(sizeChanged || lhChanged, `overlay scores produce different output than defaults`);

    assert(typeof c2.bind?.minSize === 'number' && c2.bind.minSize >= 64,
      `CRG floor enforced: minSize=${c2.bind?.minSize} >= 64 (stat counter floor)`);
  }

  const hold1 = withoutScores.elements.filter(e => e.holdAnimation).map(e => e.holdAnimation)[0];
  const hold2 = withScores.elements.filter(e => e.holdAnimation).map(e => e.holdAnimation)[0];
  console.log(`  Hold without: ${hold1 || 'static'} | Hold with: ${hold2 || 'static'}`);
  assert(hold2 !== undefined, `hold pattern assigned with overlay scores`);
}

// Cross-profile test: vlog and corporate should produce DIFFERENT recipes
console.log('\n=== Cross-profile differentiation ===');
const vlogScores = buildMgScores(profiles['Energetic Vlog']);
const corpScores = buildMgScores(profiles['Calm Corporate']);
const vlogTokens = resolveMotionTokens(profiles['Energetic Vlog'], {});
const corpTokens = resolveMotionTokens(profiles['Calm Corporate'], {});

const vlogRecipe = planComposition(
  { kind: 'numeric', content: { value: '100M', label: 'Views' }, triggerMoment: 'test' },
  vlogTokens, profiles['Energetic Vlog'], vlogScores,
);
const corpRecipe = planComposition(
  { kind: 'numeric', content: { value: '2.3%', label: 'YoY Growth' }, triggerMoment: 'test' },
  corpTokens, profiles['Calm Corporate'], corpScores,
);

const vlogCounter = vlogRecipe.elements.find(e => e.role === 'counter');
const corpCounter = corpRecipe.elements.find(e => e.role === 'counter');
console.log(`  Vlog: minSize=${vlogCounter?.bind?.minSize}, lineHeight=${vlogCounter?.bind?.lineHeight}`);
console.log(`  Corp: minSize=${corpCounter?.bind?.minSize}, lineHeight=${corpCounter?.bind?.lineHeight}`);

assert(
  (vlogCounter?.bind?.minSize as number) > (corpCounter?.bind?.minSize as number),
  `vlog font (${vlogCounter?.bind?.minSize}) > corporate font (${corpCounter?.bind?.minSize})`,
);

const vlogHold = vlogRecipe.elements.find(e => e.holdAnimation)?.holdAnimation;
const corpHold = corpRecipe.elements.find(e => e.holdAnimation)?.holdAnimation;
assert(vlogHold !== corpHold, `different hold patterns: vlog=${vlogHold}, corp=${corpHold}`);

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) console.log('ALL INTEGRATION TESTS PASSED ✓');
else { console.log('SOME TESTS FAILED ✗'); process.exit(1); }
