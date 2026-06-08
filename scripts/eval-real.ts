// Real-DATA eval: runs the eval LIBRARY (L1 legibility + composite) over the dumped real MGs.
// L1 is recipe-based, so this is real recipes — NOT real pixels (no render; footage-contrast can't
// fire without a sampled frame). Reads the .calibration-temp dump (no Mongo). STAYS UNTRACKED.
// Run: npx tsx scripts/dump-proj-mgs.ts <pid>  then  npx tsx scripts/eval-real.ts <pid>
import * as fs from 'fs';
import * as path from 'path';
import { scoreLegibility } from '../lib/editron/motion-graphics/engine/eval/legibility';
import { scoreAesthetic } from '../lib/editron/motion-graphics/engine/eval/aesthetic';
import { scoreCorrectness, type CorrectnessGroundTruth } from '../lib/editron/motion-graphics/engine/eval/correctness';
import { combineLayers, type LayerResult } from '../lib/editron/motion-graphics/engine/eval/composite';
import type { Recipe } from '../lib/editron/motion-graphics/engine/recipe-types';
import type { MotionTokens } from '../lib/editron/motion-graphics/types';

const pid = process.argv[2] || 'proj_OzG2qgoYudFa';
const file = path.resolve(process.cwd(), '.calibration-temp', `${pid}-mgs.json`);
if (!fs.existsSync(file)) {
  console.error(`No dump at ${file}. Run: npx tsx scripts/dump-proj-mgs.ts ${pid}`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { mgs: Array<Record<string, unknown>> };

// FOUNDER LABELS (the L2 answer key for this project — see vault MG-L2-AnswerKey-proj_OzG2qgoYudFa.md),
// keyed by the DISPLAYED value. Not in the map → NOT warranted (the keyword flood); gt=null → L2 skipped.
// (1/3 is actually a REFUTED proportion; the form can't convey negation yet, so value+form is what L2 checks.)
const LABELS: Record<string, { gt: CorrectnessGroundTruth | null; warranted: boolean }> = {
  '0.02': { gt: { value: '0.02', formFamily: 'magnitude', source: 'human-label' }, warranted: true },
  '1/3': { gt: { value: '1/3', formFamily: 'proportion', source: 'human-label' }, warranted: true },
  '100,000': { gt: { value: '100,000', formFamily: 'magnitude', source: 'human-label' }, warranted: true },
  '90%': { gt: { value: '90%', formFamily: 'proportion', source: 'human-label' }, warranted: true },
  'Selection Bias': { gt: { value: 'Selection Bias', formFamily: 'concept', source: 'human-label' }, warranted: true },
};
const labelFor = (shown: string): { gt: CorrectnessGroundTruth | null; warranted: boolean } =>
  LABELS[shown] ?? { gt: null, warranted: false };

const skipComm: LayerResult = { layer: 'communication', score: null, status: 'skipped', notes: 'L3 not built' };

const origWarn = console.warn;
console.warn = () => {}; // mute the gate's WOULD-SUPPRESS noise; we print our own
const rows: Array<{ i: number; label: string; legibility: number | null; correctness: number | null; aesthetic: number | null; composite: number | null; warranted: boolean; notes?: string }> = [];
const recentForms: string[] = [];
const recentPositions: string[] = [];
let noRecipe = 0;
data.mgs.forEach((mg, i) => {
  const recipe = mg.recipe as Recipe | undefined;
  const tokens = mg.resolvedTokens as MotionTokens | undefined;
  const meta = (mg.metadata ?? {}) as Record<string, unknown>;
  const content = (mg.content ?? {}) as Record<string, unknown>;
  const shown = String(content.value ?? content.text ?? content.name ?? content.quote ?? content.title ?? '');
  const label = `${meta.graphicType ?? '?'} "${shown}"`.slice(0, 38);
  const { gt, warranted } = labelFor(shown);
  if (!recipe || !Array.isArray(recipe.elements) || !tokens || !tokens.color) {
    noRecipe++;
    rows.push({ i, label, legibility: null, correctness: null, aesthetic: null, composite: null, warranted, notes: 'no recipe/tokens (skipped)' });
    return;
  }
  const leg = scoreLegibility(recipe, tokens);
  const cor = scoreCorrectness(recipe, content, gt);
  const aes = scoreAesthetic(recipe, { recentForms, recentPositions });
  const comp = combineLayers([leg, cor, skipComm, aes], { ok: true });
  rows.push({ i, label, legibility: leg.score, correctness: cor.score, aesthetic: aes.score, composite: comp.composite, warranted, notes: [leg.notes, cor.notes, aes.notes].filter(Boolean).join(' | ') || undefined });
  recentForms.push(recipe.id.replace('composed-', ''));
  recentPositions.push(recipe.layout?.position ?? 'center');
});
console.warn = origWarn;

console.log(`\n=== REAL-DATA EVAL — ${pid} (${data.mgs.length} MGs; L1 legibility + L2 correctness + L4 variety; recipe-based, NOT pixels) ===`);
console.log(`(W✗ = founder says NOT warranted — the keyword flood; that's a WHETHER-gate problem, not a correctness one)\n`);
for (const r of rows) {
  const w = r.warranted ? '    ' : 'W✗  ';
  console.log(`  ${w}MG[${String(r.i).padStart(2)}] L1=${r.legibility?.toFixed(2) ?? 'null'} L2=${r.correctness?.toFixed(2) ?? 'skip'} L4=${r.aesthetic?.toFixed(2) ?? 'null'} composite=${r.composite?.toFixed(2) ?? 'null'}  ${r.label}${r.notes ? `  (${r.notes})` : ''}`);
}
const scored = rows.filter((r) => r.composite != null);
const avg = scored.length ? scored.reduce((s, r) => s + (r.composite as number), 0) / scored.length : 0;
const unwarranted = rows.filter((r) => !r.warranted).length;
const l2scored = rows.filter((r) => r.correctness != null);
const l2mean = l2scored.length ? l2scored.reduce((s, r) => s + (r.correctness as number), 0) / l2scored.length : 0;
console.log(`\nScored ${scored.length}/${data.mgs.length} (${noRecipe} no-recipe). Mean composite=${avg.toFixed(2)} (L1+L2+L4; L3 skipped → 'degraded').`);
console.log(`L2 correctness: ${l2scored.length} warranted MGs scored, mean=${l2mean.toFixed(2)} (the system's CONTENT is right where it fires). Founder: ${unwarranted}/${data.mgs.length} NOT warranted — the flood (a WHETHER/salience problem, not correctness).`);
const outFile = path.resolve(process.cwd(), '.calibration-temp', `${pid}-eval-scores.json`);
fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
console.log(`Wrote real-data scores -> ${outFile}`);
