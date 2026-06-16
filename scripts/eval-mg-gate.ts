// Untracked Phase E observe-mode harness. Runs the structural gate over persisted MG recipes
// from the .calibration-temp dump sets and tallies the would-suppress rate by dimension — the
// false-positive measurement that gates flipping the gate from observe to enforce (Rule 29).
// Real projects (proj/brands) SHOULD mostly pass; adversarial SHOULD fail. Stays UNTRACKED.
// Run from the worktree root: npx tsx scripts/eval-mg-gate.ts
import * as path from 'path';
import * as fs from 'fs';
import { checkCompositionStructure } from '../lib/editron/motion-graphics/engine/structural-gate';
import type { Recipe } from '../lib/editron/motion-graphics/engine/recipe-types';
import type { MotionTokens } from '../lib/editron/motion-graphics/types';

const SETS = ['proj_OzG2qgoYudFa', 'adversarial', 'brands', 'spine-proto'];
const TEMP = path.resolve(process.cwd(), '.calibration-temp');
const THRESHOLD = 60;

interface Dump { mgs: Array<Record<string, unknown>>; }

/* eslint-disable @typescript-eslint/no-explicit-any */
// SELF-TEST (Rule 29 "show me the corpse" + Rule 34): prove each check FIRES on a known-bad
// recipe — otherwise a 0%-suppress real-data result can't be trusted (it might be a silent no-op).
function tk(textPrimary = '#FFFFFF', surfaceBase = '#0B0B0A'): any {
  return { color: { textPrimary, surfaceBase, textSecondary: '#94A3B8', accent: '#D4A652', surfaceOpacity: 0.8 } };
}
function txt(role: string, minSize?: number): any {
  return { primitive: 'text', role, layer: 'foreground', bind: minSize == null ? {} : { minSize } };
}
function rec(id: string, elements: any[]): any {
  return { id, layout: { position: 'center' }, elements, exitStyle: 'fade' };
}
function selftest(): boolean {
  const cases: Array<{ name: string; recipe: any; tokens: any; expect: string }> = [
    { name: 'unreadable-tiny-font', recipe: rec('tiny', [txt('label', 10)]), tokens: tk(), expect: 'readability' },
    { name: 'below-role-floor (primary 40<48)', recipe: rec('floor', [txt('primary', 40)]), tokens: tk(), expect: 'readability' },
    { name: 'two-heroes (no focal point)', recipe: rec('2hero', [txt('primary', 80), txt('counter', 80)]), tokens: tk(), expect: 'hierarchy' },
    { name: 'low-contrast text/surface', recipe: rec('lowc', [txt('primary', 80)]), tokens: tk('#222222', '#000000'), expect: 'contrast' },
  ];
  const origWarn = console.warn; console.warn = () => {};
  let allOk = true;
  const lines: string[] = [];
  for (const c of cases) {
    const r = checkCompositionStructure(c.recipe, c.tokens);
    const fired = r.issues.some(i => i.dimension === c.expect);
    if (!fired) allOk = false;
    lines.push(`   ${fired ? 'OK  ' : 'MISS'} ${c.name} → expected '${c.expect}', got [${r.issues.map(i => i.dimension).join(',') || 'none'}] score=${r.score}`);
  }
  console.warn = origWarn;
  console.log('=== SELF-TEST (each known-bad recipe MUST trip its check) ===');
  lines.forEach(l => console.log(l));
  console.log(`   ${allOk ? 'ALL CHECKS FIRE ✓' : 'SOME CHECKS ARE NO-OPS ✗ — fix before trusting the sweep'}\n`);
  return allOk;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function main(): void {
  selftest();
  const origWarn = console.warn;
  const dimTotals: Record<string, number> = {};
  let grandTotal = 0, grandSuppress = 0, grandNoRecipe = 0;
  const perSet: Array<{ set: string; total: number; suppress: number; noRecipe: number; worst: Array<{ id: string; score: number; dims: string }> }> = [];

  for (const set of SETS) {
    const f = path.join(TEMP, `${set}-mgs.json`);
    if (!fs.existsSync(f)) { origWarn(`(skip ${set}: no dump at ${f})`); continue; }
    const data = JSON.parse(fs.readFileSync(f, 'utf8')) as Dump;
    let total = 0, suppress = 0, noRecipe = 0;
    const scored: Array<{ id: string; score: number; dims: string; pass: boolean }> = [];
    console.warn = () => { /* mute the gate's own WOULD-SUPPRESS warns; we print our own summary */ };
    for (const mg of data.mgs) {
      const recipe = mg.recipe as Recipe | undefined;
      const tokens = mg.resolvedTokens as MotionTokens | undefined;
      if (!recipe || !Array.isArray(recipe.elements) || !tokens || !tokens.color) { noRecipe++; continue; }
      total++;
      const r = checkCompositionStructure(recipe, tokens);
      const dims = [...new Set(r.issues.map(i => i.dimension))].join(',') || 'none';
      scored.push({ id: recipe.id || `mg${total}`, score: r.score, dims, pass: r.pass });
      if (!r.pass) suppress++;
      for (const iss of r.issues) dimTotals[iss.dimension] = (dimTotals[iss.dimension] || 0) + 1;
    }
    console.warn = origWarn;
    const worst = scored.filter(s => !s.pass).sort((a, b) => a.score - b.score).slice(0, 6).map(s => ({ id: s.id, score: s.score, dims: s.dims }));
    perSet.push({ set, total, suppress, noRecipe, worst });
    grandTotal += total; grandSuppress += suppress; grandNoRecipe += noRecipe;
  }

  console.log(`\n=== Phase E — Structural Gate OBSERVE sweep (suppress if score < ${THRESHOLD}) ===\n`);
  for (const p of perSet) {
    const pct = p.total ? Math.round((100 * p.suppress) / p.total) : 0;
    console.log(`${p.set}: ${p.suppress}/${p.total} would-suppress (${pct}%)${p.noRecipe ? `  [${p.noRecipe} no-recipe skipped]` : ''}`);
    for (const w of p.worst) console.log(`    - ${w.id}  score=${w.score}  dims=[${w.dims}]`);
  }
  const gpct = grandTotal ? Math.round((100 * grandSuppress) / grandTotal) : 0;
  console.log(`\nOVERALL: ${grandSuppress}/${grandTotal} would-suppress (${gpct}%); ${grandNoRecipe} no-recipe skipped`);
  console.log('Issue counts by dimension:', JSON.stringify(dimTotals));
  console.log('\nRead: high suppress% on REAL sets (proj/brands) = the gate over-fires (false positives) → recalibrate BEFORE enforce. adversarial SHOULD score high.');
}

main();
