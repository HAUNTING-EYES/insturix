// CANONICAL MG eval harness (the "normal" regression gate). Drives the REAL planComposition over a
// broad edge-case matrix and asserts deterministic PASS/FAIL per case (shape-correct, not-blank,
// value-integrity, hero-sized). Also writes .calibration-temp/adv2-mgs.json so the VISUAL gate
// (render-mg-stills adv2 -> mg-montage adv2) covers overflow/tofu/wrap/alignment.
// Run: npx tsx scripts/mg-eval.ts   then   npx tsx scripts/render-mg-stills.ts adv2 && npx tsx scripts/mg-montage.ts adv2
// STAYS UNTRACKED. Expand CASES freely — this is the standing adversarial corpus.
import { planComposition } from '../lib/editron/motion-graphics/engine/composition-planner';
import { isCountUpValue } from '../lib/editron/motion-graphics/engine/content-shape-analyzer';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import { scoreLegibility } from '../lib/editron/motion-graphics/engine/eval/legibility';
import { combineLayers } from '../lib/editron/motion-graphics/engine/eval/composite';
import * as fs from 'fs';
import * as path from 'path';

function mgScoresFor(s: Record<string, number>) {
  const defs = getOverlayDefinitions().filter(d => d.category === 'mg-property');
  const out: Record<string, { score: number; values: Record<string, number | string | boolean> }> = {};
  for (const r of scoreAllOverlays(defs, s, 'additive')) out[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  return out;
}
const E = { enthusiasm: 0.9, pacing_velocity: 0.85, formality: 0.2, warmth: 0.3, emotional_arousal: 0.7 };
const F = { enthusiasm: 0.2, pacing_velocity: 0.3, formality: 0.9, warmth: 0.7, emotional_arousal: 0.3 };
const N = { enthusiasm: 0.5, pacing_velocity: 0.5, formality: 0.5, warmth: 0.5, emotional_arousal: 0.5 };
const X = { enthusiasm: 1, pacing_velocity: 1, formality: 1, warmth: 1, emotional_arousal: 1, visceral_impact: 1 };
const BRAND = { accentColor: '#2563EB', primaryColor: '#E2E8F0', backgroundColor: '#0B1220' };
const W = { w: 1920, h: 1080 }, V = { w: 1080, h: 1920 }, SQ = { w: 1080, h: 1080 }, P45 = { w: 1080, h: 1350 }; // 16:9, 9:16, 1:1, 4:5

// expect = the ContentShape the input SHOULD resolve to. A mismatch is a detection defect.
type Case = { name: string; gtype: string; expect: string; content: Record<string, unknown>; sig: Record<string, number>; w: number; h: number };
const C_ = (name: string, gtype: string, expect: string, content: Record<string, unknown>, sig: Record<string, number>, ar: { w: number; h: number }): Case =>
  ({ name, gtype, expect, content, sig, w: ar.w, h: ar.h });

const CASES: Case[] = [
  // ── NUMBERS (the parse/format/count-up stress) ──
  C_('num-comma', 'stat', 'numeric', { value: '1,234,567', prefix: '$', label: 'in new ARR' }, E, W),
  C_('num-plain-million', 'stat', 'numeric', { value: '1000000', prefix: '$', label: 'in new ARR' }, E, W),
  C_('num-negative', 'stat', 'numeric', { value: '-15', suffix: '%', label: 'churn reduction' }, E, W),
  C_('num-eu', 'stat', 'numeric', { value: '1.234,56', prefix: '€', label: 'omzet' }, E, V),
  C_('num-fraction', 'stat', 'numeric', { value: '2/3', label: 'of teams' }, E, W),
  C_('num-suffix-m', 'stat', 'numeric', { value: '100M', label: 'downloads' }, E, SQ),
  C_('num-mult', 'stat', 'numeric', { value: '10x', label: 'faster' }, N, W),
  C_('num-decimal', 'stat', 'numeric', { value: '3.14159', label: 'pi' }, F, W),
  C_('num-pct-decimal', 'stat', 'numeric', { value: '99.99', suffix: '%', label: 'uptime' }, F, W),
  C_('num-pound', 'stat', 'numeric', { value: '4,500', prefix: '£', label: 'saved' }, E, W),
  C_('num-rupee', 'stat', 'numeric', { value: '12,00,000', prefix: '₹', label: 'revenue (lakh)' }, E, W),
  C_('num-accounting-neg', 'stat', 'numeric', { value: '(15)', suffix: '%', label: 'down' }, F, W),
  C_('num-zero', 'stat', 'numeric', { value: '0', label: 'bugs in prod' }, N, W),
  C_('num-range', 'stat', 'numeric', { value: '10-20', label: 'minutes' }, N, W),
  // ── IDENTITY (names / scripts) ──
  C_('id-longhyphen', 'lower-third', 'identity', { name: 'Dr. Maria Gonzalez-Hernandez', title: 'SVP, Global Marketing & Communications' }, F, V),
  C_('id-accented', 'lower-third', 'identity', { name: 'Café Müller Søren', title: 'Tête de création' }, E, W),
  C_('id-single', 'lower-third', 'identity', { name: 'Madonna', title: 'Artist' }, N, SQ),
  C_('id-allcaps', 'lower-third', 'identity', { name: 'JOHN SMITH', title: 'CHIEF EXECUTIVE OFFICER AND FOUNDER' }, X, W),
  C_('id-cyrillic', 'lower-third', 'identity', { name: 'Владимир Ковалёв', title: 'Главный дизайнер' }, F, W),
  // ── QUOTATION (length / scripts) ──
  C_('quote-30word', 'quote', 'quotation', { quote: 'Switching to this platform cut our deployment time from three full days down to under twenty minutes, and for the first time our whole engineering team actually trusts the release pipeline end to end.', author: 'Alexandra Rivera' }, E, W),
  C_('quote-30word-9', 'quote', 'quotation', { quote: 'Switching to this platform cut our deployment time from three full days down to under twenty minutes, and for the first time our whole engineering team actually trusts the release pipeline end to end.', author: 'Alexandra Rivera' }, E, V),
  C_('quote-1word', 'quote', 'quotation', { quote: 'Wow.', author: 'Everyone' }, X, SQ),
  C_('quote-cjk', 'quote', 'quotation', { quote: '人工知能がすべてを変えた', author: '田中太郎' }, E, W),
  C_('quote-arabic', 'quote', 'quotation', { quote: 'هذا غير كل شيء بالنسبة لفريقنا', author: 'أحمد' }, F, W),
  C_('quote-hindi', 'quote', 'quotation', { quote: 'इसने हमारी पूरी टीम बदल दी', author: 'राज' }, E, W),
  // ── COMPARISON ──
  C_('cmp-longpeers', 'comparison', 'comparison', { from: 'legacy on-prem infrastructure', to: 'fully managed cloud', relation: 'vs' }, E, W),
  C_('cmp-longpeers-9', 'comparison', 'comparison', { from: 'legacy on-prem infrastructure', to: 'fully managed cloud', relation: 'vs' }, F, V),
  C_('cmp-numbers', 'comparison', 'comparison', { from: '$2.40', to: '$0.18', fromLabel: 'before', toLabel: 'after' }, E, W),
  C_('cmp-asym', 'comparison', 'comparison', { from: '3', to: 'three thousand four hundred and twelve', relation: 'arrow' }, N, W),
  C_('cmp-short-1x1', 'comparison', 'comparison', { from: '12%', to: '47%', fromLabel: 'before', toLabel: 'after' }, E, SQ),
  C_('cmp-short-9', 'comparison', 'comparison', { from: '12%', to: '47%', fromLabel: 'before', toLabel: 'after' }, F, V),
  // ── KEYWORD / EMPHASIS ──
  C_('kw-longword-9', 'keyword', 'emphasis', { text: 'Internationalization' }, E, V),
  C_('kw-emoji', 'keyword', 'emphasis', { text: 'WINNER 🏆🔥' }, X, SQ),
  C_('kw-zwj-emoji', 'keyword', 'emphasis', { text: 'Family 👨‍👩‍👧‍👦 first' }, E, SQ),
  C_('kw-cjk', 'keyword', 'emphasis', { text: '人工知能革命' }, E, W),
  C_('kw-hashtag-9', 'keyword', 'emphasis', { text: '#GrowthHacking2026' }, E, V),
  C_('kw-url', 'keyword', 'emphasis', { text: 'https://insturix.com/get-started' }, N, W),
  C_('kw-phrase', 'keyword', 'emphasis', { text: 'breaking news alert' }, N, W),
  // ── STRUCTURED / CALLOUT ──
  C_('struct-longbody', 'callout', 'structured', { title: 'Zero config', body: 'Connect any repository and the pipeline provisions, builds, tests, and deploys itself end to end with no manual setup whatsoever.' }, E, W),
  C_('struct-short', 'callout', 'structured', { title: 'Fast', body: 'Ships in seconds.' }, N, SQ),
  C_('struct-longtitle', 'callout', 'structured', { title: 'Enterprise-grade security and compliance', body: 'SOC 2 Type II certified.' }, F, P45),
  // ── DATA-SERIES ──
  C_('data-bars', 'chart', 'data-series', { values: [12, 47, 88], labels: ['Q1', 'Q2', 'Q3'] }, E, W),
  C_('data-ring', 'chart', 'data-series', { values: [73], labels: ['complete'] }, F, SQ),
  C_('data-spark', 'chart', 'data-series', { values: [3, 5, 4, 8, 6, 11, 9, 14], labels: [] }, E, W),
  C_('data-many', 'chart', 'data-series', { values: [5, 9, 3, 12, 7, 15, 2, 11, 6, 14, 8, 10], labels: [] }, E, W),
  C_('data-negative', 'chart', 'data-series', { values: [10, -5, 8, -12, 15], labels: [] }, N, W),
];

// ── deterministic recipe-level checks (the logic gate; overflow/tofu/wrap = the visual gate) ──
function bound(content: Record<string, unknown>, expr: unknown): string {
  const s = String(expr ?? '');
  if (s.startsWith('content:')) return String(content[s.slice(8)] ?? '');
  return s;
}
type Rec = { id: string; elements: Array<{ role?: string; primitive?: string; bind?: Record<string, unknown> }> };
function evalCase(c: Case, recipe: Rec): string[] {
  const fails: string[] = [];
  // 1. shape detected correctly
  if (recipe.id !== `composed-${c.expect}`) fails.push(`SHAPE(got ${recipe.id.replace('composed-', '')}, want ${c.expect})`);
  const heroes = recipe.elements.filter(e => e.role === 'primary' || e.role === 'counter');
  const dataviz = recipe.elements.find(e => e.primitive === 'data-viz' || e.primitive === 'dataviz');
  // 2. not blank: a hero text resolves to non-empty content, OR a data-viz element exists
  if (c.expect === 'data-series') {
    if (!dataviz) fails.push('BLANK(no data-viz element)');
  } else {
    const heroText = heroes.map(h => bound(c.content, h.bind?.text ?? h.bind?.value)).find(t => t.length > 0);
    if (!heroText) fails.push('BLANK(hero text empty)');
  }
  // 3. hero is explicitly sized (no minSize -> renders ~16px). data-viz exempt.
  if (c.expect !== 'data-series' && heroes.length > 0 && !heroes.some(h => typeof h.bind?.minSize === 'number')) {
    fails.push('UNSIZED(hero has no minSize)');
  }
  // 4. value integrity: count-up must not be applied to a value parseFloat would corrupt (commas, multi-part)
  if (c.expect === 'numeric') {
    const v = String(c.content.value ?? '');
    if (isCountUpValue(v)) {
      const pf = parseFloat(v.replace(/[$€£¥₹,\s]/g, '')); // mirror CountUpText: strip separators then parse
      if (!isFinite(pf)) fails.push(`VALUE(count-up cannot parse "${v}")`);
    }
  }
  return fails;
}

const out: Array<Record<string, unknown>> = [];
const results: Array<{ name: string; fails: string[] }> = [];
const scores: Array<{ name: string; legibility: number | null; composite: number | null; status: string }> = [];
for (const c of CASES) {
  const tokens = resolveMotionTokens(c.sig, BRAND);
  const recipeReal = planComposition({ content: c.content }, tokens, c.sig, mgScoresFor(c.sig) as never);
  const recipe = recipeReal as unknown as Rec;
  results.push({ name: c.name, fails: evalCase(c, recipe) });
  // E6: the canonical harness grades via the eval LIBRARY (same source of truth the prod path will
  // use). L2-L4 aren't built yet, so they're passed as 'skipped' → the composite is honestly
  // 'degraded' (legibility-only), never faked-complete.
  const leg = scoreLegibility(recipeReal, tokens);
  const comp = combineLayers([
    leg,
    { layer: 'correctness', score: null, status: 'skipped', notes: 'L2 not built' },
    { layer: 'communication', score: null, status: 'skipped', notes: 'L3 not built' },
    { layer: 'aesthetic', score: null, status: 'skipped', notes: 'L4 not built' },
  ], { ok: true });
  scores.push({ name: c.name, legibility: leg.score, composite: comp.composite, status: comp.status });
  out.push({ recipe, resolvedTokens: tokens, contentSignals: c.sig, content: c.content,
    durationInFrames: 90, canvasWidth: c.w, canvasHeight: c.h, metadata: { graphicType: c.gtype, case: c.name } });
}

const file = path.resolve(process.cwd(), '.calibration-temp', 'adv2-mgs.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ width: 1920, height: 1080, mgs: out }, null, 2));

// Golden snapshot of the eval-library scores per case — the deterministic regression floor
// (no Mongo, no render). Re-run after any curve/gate/eval change and diff against this.
const scoreFile = path.resolve(process.cwd(), '.calibration-temp', 'adv2-scores.json');
fs.writeFileSync(scoreFile, JSON.stringify(scores, null, 2));

const pass = results.filter(r => r.fails.length === 0);
console.log(`\n=== MG EVAL — ${pass.length}/${results.length} cases pass the logic gate ===\n`);
for (const r of results) console.log(`  ${r.fails.length ? 'FAIL' : 'pass'}  ${r.name.padEnd(20)} ${r.fails.join('  ')}`);
console.log(`\nLogic gate: ${pass.length}/${results.length} pass, ${results.length - pass.length} fail.`);
console.log(`\n=== EVAL LIBRARY — L1 legibility + composite (composite='degraded': legibility-only until L2-L4 land) ===`);
for (const s of scores) console.log(`  ${s.name.padEnd(20)} legibility=${s.legibility?.toFixed(2) ?? 'null'}  composite=${s.composite?.toFixed(2) ?? 'null'} (${s.status})`);
console.log(`\nWrote ${out.length} MGs -> ${file}`);
console.log(`Wrote ${scores.length} eval scores -> ${scoreFile}`);
console.log(`VISUAL gate (overflow/tofu/wrap/alignment): npx tsx scripts/render-mg-stills.ts adv2 && npx tsx scripts/mg-montage.ts adv2`);
