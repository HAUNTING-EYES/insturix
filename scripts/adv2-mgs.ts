// Untracked PRODUCTION-READINESS adversarial matrix (BROAD). Drives the REAL planComposition across
// every composer with agency-grade + edge content: number formats (comma/fraction/suffix/negative/EU),
// scripts (CJK/RTL/accented/emoji), long/short text, 5 signal profiles, 3 aspect ratios (16:9, 9:16, 1:1).
// Goal (Rule 3N/29): surface the FULL defect set before we fix. Render: npx tsx scripts/render-mg-stills.ts adv2
// then montage: npx tsx scripts/mg-montage.ts adv2. STAYS UNTRACKED.
import { planComposition } from '../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import * as fs from 'fs';
import * as path from 'path';

function mgScoresFor(signals: Record<string, number>): Record<string, { score: number; values: Record<string, number | string | boolean> }> {
  const defs = getOverlayDefinitions().filter(d => d.category === 'mg-property');
  const results = scoreAllOverlays(defs, signals, 'additive');
  const out: Record<string, { score: number; values: Record<string, number | string | boolean> }> = {};
  for (const r of results) out[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  return out;
}
// signal profiles: Energetic, Formal, Neutral(all .5), maX(all high), Conflict(energetic+formal both high)
const E = { enthusiasm: 0.9, pacing_velocity: 0.85, formality: 0.2, warmth: 0.3, emotional_arousal: 0.7 };
const F = { enthusiasm: 0.2, pacing_velocity: 0.3, formality: 0.9, warmth: 0.7, emotional_arousal: 0.3 };
const N = { enthusiasm: 0.5, pacing_velocity: 0.5, formality: 0.5, warmth: 0.5, emotional_arousal: 0.5 };
const X = { enthusiasm: 1, pacing_velocity: 1, formality: 1, warmth: 1, emotional_arousal: 1, visceral_impact: 1 };
const C = { enthusiasm: 0.9, pacing_velocity: 0.8, formality: 0.9, warmth: 0.6, emotional_arousal: 0.8 };
const BRAND = { accentColor: '#2563EB', primaryColor: '#E2E8F0', backgroundColor: '#0B1220' };
const W = { w: 1920, h: 1080 }, V = { w: 1080, h: 1920 }, S = { w: 1080, h: 1080 };

type Case = { name: string; gtype: string; content: Record<string, unknown>; sig: Record<string, number>; w: number; h: number };
const C_ = (name: string, gtype: string, content: Record<string, unknown>, sig: Record<string, number>, ar: { w: number; h: number }): Case => ({ name, gtype, content, sig, w: ar.w, h: ar.h });

const CASES: Case[] = [
  // ── number formats (the count-up / parse stress) ──
  C_('num-comma-E-16', 'stat', { value: '1,234,567', prefix: '$', label: 'in new ARR' }, E, W),
  C_('num-comma-F-9', 'stat', { value: '1,234,567', prefix: '$', label: 'in new ARR' }, F, V),
  C_('num-fraction-E-16', 'stat', { value: '2/3', label: 'of teams adopted it' }, E, W),
  C_('num-suffix-E-1', 'stat', { value: '100M', label: 'downloads' }, E, S),
  C_('num-mult-N-16', 'stat', { value: '10x', label: 'faster builds' }, N, W),
  C_('num-negative-E-16', 'stat', { value: '-15', suffix: '%', label: 'churn reduction' }, E, W),
  C_('num-decimal-F-16', 'stat', { value: '3.14159', label: 'pi to five places' }, F, W),
  C_('num-eu-E-9', 'stat', { value: '1.234,56', prefix: '€', label: 'omzet per maand' }, E, V),
  // ── identity (names / scripts) ──
  C_('id-longhyphen-F-9', 'lower-third', { name: 'Dr. Maria Gonzalez-Hernandez', title: 'SVP, Global Marketing & Communications' }, F, V),
  C_('id-accented-E-16', 'lower-third', { name: 'Café Müller Søren', title: 'Tête de création' }, E, W),
  C_('id-single-N-1', 'lower-third', { name: 'Madonna', title: 'Artist' }, N, S),
  C_('id-allcaps-X-16', 'lower-third', { name: 'JOHN SMITH', title: 'CHIEF EXECUTIVE OFFICER AND FOUNDER' }, X, W),
  // ── quotation (length / scripts) ──
  C_('quote-30word-E-16', 'quote', { quote: 'Switching to this platform cut our deployment time from three full days down to under twenty minutes, and for the first time our whole engineering team actually trusts the release pipeline end to end.', author: 'Alexandra Rivera' }, E, W),
  C_('quote-30word-E-9', 'quote', { quote: 'Switching to this platform cut our deployment time from three full days down to under twenty minutes, and for the first time our whole engineering team actually trusts the release pipeline end to end.', author: 'Alexandra Rivera' }, E, V),
  C_('quote-1word-X-1', 'quote', { quote: 'Wow.', author: 'Everyone' }, X, S),
  C_('quote-cjk-E-16', 'quote', { quote: '人工知能がすべてを変えた', author: '田中太郎' }, E, W),
  C_('quote-arabic-F-16', 'quote', { quote: 'هذا غير كل شيء بالنسبة لفريقنا', author: 'أحمد' }, F, W),
  // ── comparison (peers / aspects / relations) ──
  C_('cmp-longpeers-E-16', 'comparison', { from: 'legacy on-prem infrastructure', to: 'fully managed cloud', relation: 'vs' }, E, W),
  C_('cmp-longpeers-F-9', 'comparison', { from: 'legacy on-prem infrastructure', to: 'fully managed cloud', relation: 'vs' }, F, V),
  C_('cmp-numbers-E-16', 'comparison', { from: '$2.40', to: '$0.18', fromLabel: 'cost per unit before', toLabel: 'after automation' }, E, W),
  C_('cmp-asym-N-16', 'comparison', { from: '3', to: 'three thousand four hundred and twelve', relation: 'arrow' }, N, W),
  C_('cmp-short-E-1', 'comparison', { from: '12%', to: '47%', fromLabel: 'before', toLabel: 'after' }, E, S),
  C_('cmp-short-F-9', 'comparison', { from: '12%', to: '47%', fromLabel: 'before', toLabel: 'after' }, F, V),
  // ── keyword / emphasis (single text, scripts) ──
  C_('kw-longword-E-9', 'keyword', { text: 'Internationalization' }, E, V),
  C_('kw-emoji-X-1', 'keyword', { text: 'WINNER 🏆🔥' }, X, S),
  C_('kw-cjk-E-16', 'keyword', { text: '人工知能革命' }, E, W),
  C_('kw-hashtag-E-9', 'keyword', { text: '#GrowthHacking2026' }, E, V),
  C_('kw-phrase-N-16', 'keyword', { text: 'breaking news alert' }, N, W),
  // ── structured / callout ──
  C_('struct-longbody-E-16', 'callout', { title: 'Zero config', body: 'Connect any repository and the pipeline provisions, builds, tests, and deploys itself end to end with no manual setup whatsoever.' }, E, W),
  C_('struct-short-N-1', 'callout', { title: 'Fast', body: 'Ships in seconds.' }, N, S),
  // ── data-series (charts) ──
  C_('data-bars-E-16', 'chart', { values: [12, 47, 88], labels: ['Q1', 'Q2', 'Q3'] }, E, W),
  C_('data-ring-F-1', 'chart', { values: [73], labels: ['complete'] }, F, S),
  C_('data-spark-E-16', 'chart', { values: [3, 5, 4, 8, 6, 11, 9, 14], labels: [] }, E, W),
];

const mgs = CASES.map((c) => {
  const tokens = resolveMotionTokens(c.sig, BRAND);
  const mgScores = mgScoresFor(c.sig);
  const recipe = planComposition({ content: c.content }, tokens, c.sig, mgScores as never);
  return { recipe, resolvedTokens: tokens, contentSignals: c.sig, content: c.content,
    durationInFrames: 90, canvasWidth: c.w, canvasHeight: c.h, metadata: { graphicType: c.gtype, case: c.name } };
});

const file = path.resolve(process.cwd(), '.calibration-temp', 'adv2-mgs.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ width: 1920, height: 1080, mgs }, null, 2));
console.log(`Wrote ${mgs.length} adversarial MGs -> ${file}\n`);
mgs.forEach((m, i) => console.log(`  [${String(i).padStart(2)}] ${(m.metadata.case + '').padEnd(22)} ${String(m.canvasWidth).padStart(4)}x${String(m.canvasHeight).padEnd(4)} ${(m.recipe.layout.arrangement + '').padEnd(22)} shape=${m.recipe.elements.length}el`));
console.log('\nRender: npx tsx scripts/render-mg-stills.ts adv2   then   npx tsx scripts/mg-montage.ts adv2');
