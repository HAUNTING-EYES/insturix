// Level-2 behavior self-test for eval/legibility.ts (plan §11 E8 + E4 footage-contrast revival).
// Recipe-based, no render, no Mongo. Mirrors eval-mg-gate.ts fixtures. STAYS UNTRACKED.
// Run from worktree root: npx tsx scripts/eval-legibility-selftest.ts
import { scoreLegibility } from '../lib/editron/motion-graphics/engine/eval/legibility';
import { checkCompositionStructure } from '../lib/editron/motion-graphics/engine/structural-gate';

function tk(surfaceOpacity = 0.8, textPrimary = '#FFFFFF', surfaceBase = '#0B0B0A'): any {
  return { color: { textPrimary, surfaceBase, textSecondary: '#94A3B8', accent: '#D4A652', surfaceOpacity } };
}
function txt(role: string, minSize?: number): any {
  return { primitive: 'text', role, layer: 'foreground', bind: minSize == null ? {} : { minSize } };
}
function rec(id: string, elements: any[]): any {
  return { id, layout: { position: 'center' }, elements, exitStyle: 'fade' };
}

const fails: string[] = [];
const results: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (!cond) fails.push(name);
  results.push(`  ${cond ? 'pass' : 'FAIL'}  ${name}${cond ? '' : `  — ${detail}`}`);
};

const origWarn = console.warn;
console.warn = () => {}; // mute the gate's own WOULD-SUPPRESS warnings; we print our own summary

// 1. good recipe → high score, well-formed result
{
  const r = scoreLegibility(rec('good', [txt('primary', 80)]), tk());
  check('good: score in [0,1]', r.score != null && r.score >= 0 && r.score <= 1, `${r.score}`);
  check('good: high score (>=0.9)', r.score != null && r.score >= 0.9, `${r.score}`);
  check('good: status scored', r.status === 'scored', r.status);
  check('good: layer=legibility', r.layer === 'legibility');
}
// 2. tiny font scores strictly lower than good (readability penalty bites)
{
  const good = scoreLegibility(rec('g', [txt('primary', 80)]), tk()).score as number;
  const tiny = scoreLegibility(rec('tiny', [txt('label', 10)]), tk()).score as number;
  check('tiny < good', tiny < good, `tiny=${tiny} good=${good}`);
}
// 3. low contrast → score < 1 AND the contrast check actually fired
{
  const recipe = rec('lowc', [txt('primary', 80)]);
  const tokens = tk(0.8, '#222222', '#000000');
  const r = scoreLegibility(recipe, tokens);
  const gate = checkCompositionStructure(recipe, tokens);
  check('lowcontrast: score < 1', r.score != null && r.score < 1, `${r.score}`);
  check('lowcontrast: contrast issue fired', gate.issues.some((i) => i.dimension === 'contrast'));
}
// 4. two heroes → hierarchy check fires + score < 1
{
  const recipe = rec('2hero', [txt('primary', 80), txt('counter', 80)]);
  const r = scoreLegibility(recipe, tk());
  const gate = checkCompositionStructure(recipe, tk());
  check('2hero: hierarchy issue fired', gate.issues.some((i) => i.dimension === 'hierarchy'));
  check('2hero: score < 1', r.score != null && r.score < 1, `${r.score}`);
}
// 5. E4 footage-contrast REVIVAL: bright frame + light text + low surface opacity → the
//    brightness-match check (DEAD in prod, no frameContext passed) fires AND lowers the score.
{
  const recipe = rec('bright', [txt('primary', 80)]);
  const tokens = tk(0.2); // low surfaceOpacity so the deduction (not just the issue) bites
  const withFrame = scoreLegibility(recipe, tokens, { brightness: 0.8 }).score as number;
  const without = scoreLegibility(recipe, tokens).score as number;
  const gate = checkCompositionStructure(recipe, tokens, { brightness: 0.8 });
  check('footage: brightness-match fired (was DEAD in prod)', gate.issues.some((i) => i.dimension === 'brightness-match'));
  check('footage: frameContext lowers score', withFrame < without, `withFrame=${withFrame} without=${without}`);
}
// 6. determinism: identical inputs → identical score
{
  const a = scoreLegibility(rec('d', [txt('primary', 64), txt('secondary', 36)]), tk()).score;
  const b = scoreLegibility(rec('d', [txt('primary', 64), txt('secondary', 36)]), tk()).score;
  check('deterministic', a === b, `${a} vs ${b}`);
}

console.warn = origWarn;
results.forEach((l) => console.log(l));
console.log(`\nlegibility self-test: ${fails.length} assertion(s) failed`);
if (fails.length) {
  console.error('FAILED: ' + fails.join(', '));
  process.exit(1);
}
console.log('ALL PASS ✓');
