import { planComposition } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';

const signals: Record<string, number> = {
  formality: 0.2, enthusiasm: 0.9, warmth: 0.7, visceral_impact: 0.8,
  humor: 0.6, emotional_arousal: 0.7, pacing_velocity: 0.6,
  cinematic_moment: 0.7, speech_coverage: 0.6, energy_delta: 0.3,
  motion_intensity: 0.4, visual_complexity: 0.3,
};
const tokens = resolveMotionTokens(signals, {});
const intent = { kind: 'numeric' as const, content: { value: '2.5M', label: 'Subscribers', prefix: '', suffix: '' } };

const mgScores = {
  'mg.particle.confetti': { score: 0.85, values: { particleScore: 0.75 } },
  'mg.particle.bokeh': { score: 0.4, values: { particleScore: 0.3 } },
  'mg.mask.circle_reveal': { score: 0.7, values: { maskScore: 0.6 } },
  'mg.mask.wipe_reveal': { score: 0.3, values: { maskScore: 0.2 } },
  'mg.animation.entrance_pop': { score: 0.8, values: { popScore: 0.7 } },
  'mg.animation.hold_glow': { score: 0.6, values: { glowScore: 0.5 } },
  'mg.typography.font_size': { score: 0.7, values: { fontSize: 120 } },
};

const recipe = planComposition(intent, tokens, signals, mgScores);
console.log(`Elements: ${recipe.elements.length}`);
for (const el of recipe.elements) {
  const extra = el.primitive === 'particle' ? ` preset=${el.bind?.particlePreset} count=${el.bind?.particleCount}` : '';
  const maskExtra = el.primitive === 'mask' ? ` shape=${el.shape} dir=${el.bind?.direction}` : '';
  console.log(`  ${el.role} (${el.primitive})${el.layer ? ` [${el.layer}]` : ''}${extra}${maskExtra}`);
}
const hasP = recipe.elements.some(e => e.primitive === 'particle');
const hasM = recipe.elements.some(e => e.primitive === 'mask');
console.log(`\nParticle produced: ${hasP ? 'YES ✅' : 'NO ❌'}`);
console.log(`Mask produced: ${hasM ? 'YES ✅' : 'NO ❌'}`);

if (!hasP || !hasM) {
  console.log('\nDEBUG: budget and scores check');
  const cinematicBoost = signals.cinematic_moment > 0.6 ? 1 : 0;
  console.log(`  cinematic_moment=${signals.cinematic_moment} boost=${cinematicBoost}`);
  console.log(`  complexityBudget would need to be >= 3 (mask) or >= 4 (particle) after boost`);
}
