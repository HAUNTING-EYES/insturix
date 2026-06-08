// Level-2 self-test for eval/aesthetic.ts (v1 variety) + a real-13 monotony demo. Pure, no render.
// Run from worktree root: npx tsx scripts/eval-aesthetic-selftest.ts
import * as fs from 'fs';
import * as path from 'path';
import { scoreAesthetic } from '../lib/editron/motion-graphics/engine/eval/aesthetic';
import type { Recipe, RecipeLayout } from '../lib/editron/motion-graphics/engine/recipe-types';

function rec(form: string, pos: RecipeLayout['position']): Recipe {
  return { id: `composed-${form}`, elements: [], layout: { position: pos }, exitStyle: 'simultaneous-fade' };
}

const fails: string[] = [];
const results: string[] = [];
const check = (n: string, c: boolean, d = '') => {
  if (!c) fails.push(n);
  results.push(`  ${c ? 'pass' : 'FAIL'}  ${n}${c ? '' : `  — ${d}`}`);
};

// fresh → 1.0
{
  const r = scoreAesthetic(rec('numeric', 'center'));
  check('fresh → 1.0', r.score === 1, `${r.score}`);
  check('fresh: layer=aesthetic', r.layer === 'aesthetic');
}
// flood: 4 same forms preceding → low (≤0.4) + flagged repetitive
{
  const r = scoreAesthetic(rec('emphasis', 'top-left'), {
    recentForms: ['emphasis', 'emphasis', 'emphasis', 'emphasis'],
    recentPositions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  });
  check('flood form×4 → ≤0.4', (r.score ?? 1) <= 0.4, `${r.score}`);
  check('flood: flagged repetitive', (r.notes ?? '').includes('repetitive'));
}
// diverse → high (≥0.8)
{
  const r = scoreAesthetic(rec('comparison', 'center'), {
    recentForms: ['numeric', 'identity', 'quotation'],
    recentPositions: ['bottom-left', 'center', 'top-right'],
  });
  check('diverse → ≥0.8', (r.score ?? 0) >= 0.8, `${r.score}`);
}
// position repetition alone lowers variety
{
  const fresh = scoreAesthetic(rec('numeric', 'center'), { recentForms: ['identity', 'quotation'], recentPositions: ['top-left', 'top-right'] }).score as number;
  const posRepeat = scoreAesthetic(rec('numeric', 'center'), { recentForms: ['identity', 'quotation'], recentPositions: ['center', 'center'] }).score as number;
  check('position repeat lowers variety', posRepeat < fresh, `posRepeat=${posRepeat} fresh=${fresh}`);
}
// determinism
{
  const ctx = { recentForms: ['numeric', 'numeric'], recentPositions: ['center', 'center'] };
  const a = scoreAesthetic(rec('numeric', 'center'), ctx).score;
  const b = scoreAesthetic(rec('numeric', 'center'), ctx).score;
  check('deterministic', a === b, `${a} vs ${b}`);
}

results.forEach((l) => console.log(l));
console.log(`\naesthetic self-test: ${fails.length} assertion(s) failed`);

// --- real-13 monotony demo (informational; proves variety decays on the real keyword-flood) ---
const dump = path.resolve(process.cwd(), '.calibration-temp', 'proj_OzG2qgoYudFa-mgs.json');
if (fs.existsSync(dump)) {
  const data = JSON.parse(fs.readFileSync(dump, 'utf8')) as { mgs: Array<Record<string, unknown>> };
  const recentForms: string[] = [];
  const recentPositions: string[] = [];
  console.log('\n--- REAL 13 (rolling variety; the repeated keyword form should decay) ---');
  for (let i = 0; i < data.mgs.length; i++) {
    const recipe = data.mgs[i].recipe as Recipe | undefined;
    if (!recipe?.id) { console.log(`  MG[${i}] (no recipe)`); continue; }
    const v = scoreAesthetic(recipe, { recentForms, recentPositions }).score;
    const form = recipe.id.replace('composed-', '');
    console.log(`  MG[${String(i).padStart(2)}] variety=${v?.toFixed(2)}  form=${form}`);
    recentForms.push(form);
    recentPositions.push(recipe.layout?.position ?? 'center');
  }
} else {
  console.log('\n(real-13 demo skipped — no dump; run dump-proj-mgs first)');
}

if (fails.length) {
  console.error('FAILED: ' + fails.join(', '));
  process.exit(1);
}
console.log('\nALL PASS ✓');
