// Level-2 behavior self-test for eval/correctness.ts (plan §11 E8). Drives the REAL planComposition
// (tests against actual composer output, not synthetic recipes — handover rule). No Mongo, no render.
// Run from worktree root: npx tsx scripts/eval-correctness-selftest.ts
import { scoreCorrectness, type CorrectnessGroundTruth } from '../lib/editron/motion-graphics/engine/eval/correctness';
import { planComposition } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';

const BRAND = { accentColor: '#2563EB', primaryColor: '#E2E8F0', backgroundColor: '#0B1220' };
const SIG = { enthusiasm: 0.5, pacing_velocity: 0.5, formality: 0.5, warmth: 0.5, emotional_arousal: 0.5 };

function recipeFor(content: Record<string, unknown>) {
  return planComposition({ content }, resolveMotionTokens(SIG, BRAND), SIG);
}

const fails: string[] = [];
const results: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (!cond) fails.push(name);
  results.push(`  ${cond ? 'pass' : 'FAIL'}  ${name}${cond ? '' : `  — ${detail}`}`);
};

const origWarn = console.warn;
console.warn = () => {}; // mute planner/gate console noise

// 1. correct proportion → value + form both pass → 1.0
{
  const content = { value: '90%', label: 'are good' };
  const gt: CorrectnessGroundTruth = { value: '90%', formFamily: 'proportion', source: 'human-label' };
  const r = scoreCorrectness(recipeFor(content), content, gt);
  check('proportion correct → 1.0', r.score === 1, `score=${r.score} notes=${r.notes ?? ''}`);
  check('proportion: source tagged human-label', r.groundTruthSource === 'human-label', `${r.groundTruthSource}`);
  check('proportion: status scored', r.status === 'scored', r.status);
}
// 2. value shown as "90" when it must be "90%" → value FAILS, form ok → 0.5  (the extraction-fidelity catch)
{
  const content = { value: '90', label: 'are good' };
  const gt: CorrectnessGroundTruth = { value: '90%', formFamily: 'proportion', source: 'human-label' };
  const r = scoreCorrectness(recipeFor(content), content, gt);
  check('value drift 90%→90 caught → 0.5', r.score === 0.5, `score=${r.score} notes=${r.notes ?? ''}`);
}
// 3. comparison meaning rendered as keyword-box → form + value both FAIL → 0.0  (the "5% problem")
{
  const content = { text: 'selection bias' };
  const gt: CorrectnessGroundTruth = { value: '1/3', formFamily: 'comparison', source: 'human-label' };
  const r = scoreCorrectness(recipeFor(content), content, gt);
  check('wrong form comparison→emphasis → 0.0', r.score === 0, `score=${r.score} notes=${r.notes ?? ''}`);
}
// 4. comparison correct → the "to" value (47%) is shown + form ok → 1.0
{
  const content = { from: '12%', to: '47%', fromLabel: 'before', toLabel: 'after' };
  const gt: CorrectnessGroundTruth = { value: '47%', formFamily: 'comparison', source: 'human-label' };
  const r = scoreCorrectness(recipeFor(content), content, gt);
  check('comparison correct → 1.0', r.score === 1, `score=${r.score} notes=${r.notes ?? ''}`);
}
// 5. no ground truth → skipped, score null (not 0)
{
  const content = { value: '5' };
  const r = scoreCorrectness(recipeFor(content), content, { source: 'none' });
  check('no GT → skipped/null', r.score === null && r.status === 'skipped', `score=${r.score} status=${r.status}`);
}
// 6. determinism
{
  const content = { value: '42', label: 'wins' };
  const gt: CorrectnessGroundTruth = { value: '42', formFamily: 'magnitude', source: 'human-label' };
  const a = scoreCorrectness(recipeFor(content), content, gt).score;
  const b = scoreCorrectness(recipeFor(content), content, gt).score;
  check('deterministic', a === b, `${a} vs ${b}`);
}

console.warn = origWarn;
results.forEach((l) => console.log(l));
console.log(`\ncorrectness self-test: ${fails.length} assertion(s) failed`);
if (fails.length) {
  console.error('FAILED: ' + fails.join(', '));
  process.exit(1);
}
console.log('ALL PASS ✓');
