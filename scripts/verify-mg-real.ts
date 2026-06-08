/**
 * Untracked verification harness — REAL content + REAL signals → CURRENT scorer → CURRENT planComposition.
 *
 * WHY: unit tests inject mgScores directly and bypass the scorer; they masked a calibration bug.
 * Persisted recipes predate the Tier-3 vocabulary (05-29/30), so they can't show current behaviour.
 * This pulls REAL motion-graphic overlays (content + contentSignals snapshot) from real projects and
 * re-runs the CURRENT composition path EXACTLY as edl-executor does (edl-executor.ts:1100-1140), so we
 * see what the current rank-and-cap vocabulary produces on real signal noise across content types.
 *
 * It is read-only against Mongo and writes computed recipes to .calibration-temp/real-recipes.json
 * for the pixel-render step. Run: npx tsx scripts/verify-mg-real.ts
 */
import { MongoClient } from 'mongodb';
import { writeFileSync, mkdirSync } from 'fs';
import { planComposition, type MgOverlayScores } from '../lib/editron/motion-graphics/engine/composition-planner';
import { analyzeContentShape } from '../lib/editron/motion-graphics/engine/content-shape-analyzer';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';

const uri = process.env.MONGODB_URI || 'mongodb+srv://admin:iWPwpRrZ5Pp9rWEW@main-cluster.glgebdc.mongodb.net/?retryWrites=true&w=majority&appName=main-cluster';

// 7 real projects whose MG overlays carry real signal snapshots (from mg-probe.ts inventory).
const PROJECT_IDS = [
  'proj_AAefyxxNilnW', 'proj_FLiymdtCzv2V', 'proj_sKX79IVPsSKG',
  'proj_y16vijrN5crw', 'proj_CGeIHVzXHdUs', 'proj_6dAeIQ9tJXZE', 'proj_2YQA-AadcYxs',
];

// EXACT mirror of edl-executor.ts:1114-1120 — the selection overlays (multiplicative) vs property overlays (additive).
const SELECTION_IDS = new Set([
  'mg.animation.entrance_fade', 'mg.animation.entrance_pop', 'mg.animation.entrance_slide',
  'mg.animation.entrance_blur', 'mg.animation.entrance_scale',
  'mg.animation.entrance_rotate', 'mg.animation.entrance_skew', 'mg.animation.entrance_zoom_blur',
  'mg.animation.hold_pulse', 'mg.animation.hold_breathe', 'mg.animation.hold_float',
  'mg.animation.hold_glow',
]);

const STRUCTURE_IDS = [
  'mg.structure.backdrop_card', 'mg.structure.side_bar', 'mg.structure.accent_line',
  'mg.structure.underline', 'mg.structure.divider', 'mg.structure.kicker',
  'mg.structure.badge', 'mg.structure.brackets', 'mg.structure.corner_marks', 'mg.structure.annotation',
];
const GATE = 0.45; // composition-planner.ts:756

const allMgDefs = getOverlayDefinitions().filter(d => d.category === 'mg-property');
const propDefs = allMgDefs.filter(d => !SELECTION_IDS.has(d.id));
const selDefs = allMgDefs.filter(d => SELECTION_IDS.has(d.id));

function computeMgScores(signals: Record<string, number | string>): MgOverlayScores {
  const propResults = scoreAllOverlays(propDefs, signals as any, 'additive');
  const selResults = scoreAllOverlays(selDefs, signals as any, 'multiplicative');
  const scores: MgOverlayScores = {};
  for (const r of [...propResults, ...selResults]) scores[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  return scores;
}

// Silence the planner's verbose console.log/console.warn during a call, return what it logged count.
function quiet<T>(fn: () => T): T {
  const origLog = console.log, origWarn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = origLog; console.warn = origWarn; }
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
function register(s: Record<string, number | string>): string {
  const f = Number(s.formality) || 0, e = Number(s.enthusiasm) || 0, a = Number(s.emotional_arousal) || 0;
  if (f >= 0.6) return 'formal/corporate';
  if (e >= 0.6 || a >= 0.6) return 'energetic/casual';
  if (f < 0.35 && e < 0.45) return 'casual/neutral';
  return 'mid';
}

interface MgRow {
  pid: string; frame: number; gtype: string; shapeKinds: string[]; recipeId: string;
  elementCount: number; roles: string[]; moves: string[]; budget: number;
  layout: string; register: string;
  sig: { formality: number; enthusiasm: number; arousal: number; pacing: number; visdep: number };
  structScores: Record<string, number>;
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('editron_prev');

  const rows: MgRow[] = [];
  const dumpedRecipes: any[] = [];

  for (const pid of PROJECT_IDS) {
    const proj = await db.collection('projects').findOne({ projectId: pid });
    if (!proj) { console.log(`SKIP ${pid}: not found`); continue; }
    const mgs = (proj.overlays || []).filter((o: any) => o.type === 'motion-graphic'
      && o.contentSignals && Object.keys(o.contentSignals).length > 0);

    for (const o of mgs) {
      const content: Record<string, unknown> = o.content || {};
      const signals: Record<string, number | string> = o.contentSignals || {};
      const triggerMoment = o.metadata?.edlReason || o.metadata?.graphicType || 'unknown';

      const tokens = resolveMotionTokens(signals as any, {});
      const mgScores = computeMgScores(signals);
      const recipe = quiet(() => planComposition({ content, triggerMoment }, tokens, signals as any, mgScores));
      const budget = quiet(() => analyzeContentShape(content, undefined, signals as any).complexityBudget);

      const roles = (recipe.elements || []).map((e: any) => e.role);
      const moves = roles.filter((r: string) => typeof r === 'string' && r.startsWith('sm-') && !r.includes('-', 3 + r.indexOf('sm-')))
        // keep only top-level move roles (sm-<move>), not group children like sm-badge-num
        .filter((r: string) => /^sm-[a-z]+(-[a-z]+)?$/.test(r) && !/(num|pill|line|label|-[lrtb]$|-[lrtb]-|-v$|-h$|-tl|-tr|-bl|-br)/.test(r));
      // simpler: structural-move parent roles are exactly the move names
      const MOVE_ROLES = new Set(['sm-accent-line', 'sm-side-bar', 'sm-backdrop', 'sm-divider', 'sm-underline', 'sm-kicker', 'sm-badge', 'sm-brackets', 'sm-corner-marks', 'sm-annotation']);
      const firedMoves = roles.filter((r: string) => MOVE_ROLES.has(r));

      const structScores: Record<string, number> = {};
      for (const id of STRUCTURE_IDS) structScores[id.replace('mg.structure.', '')] = round(mgScores[id]?.score ?? 0);

      rows.push({
        pid, frame: o.from, gtype: o.metadata?.graphicType || '?',
        shapeKinds: analyzeContentShape(content, undefined, signals as any).shapes.map(s => s.kind),
        recipeId: recipe.id, elementCount: recipe.elements.length, roles,
        moves: firedMoves, budget, layout: recipe.layout.position, register: register(signals),
        sig: {
          formality: round(Number(signals.formality) || 0), enthusiasm: round(Number(signals.enthusiasm) || 0),
          arousal: round(Number(signals.emotional_arousal) || 0), pacing: round(Number(signals.pacing_velocity) || 0),
          visdep: round(Number(signals.visual_dependency) || 0),
        },
        structScores,
      });

      dumpedRecipes.push({ pid, frame: o.from, gtype: o.metadata?.graphicType, content, signals, tokens, recipe });
    }
  }

  // ── Per-MG report ──
  console.log(`\n${'='.repeat(110)}\nPER-MG (real content + real signals → current scorer → current planComposition)\n${'='.repeat(110)}`);
  let curPid = '';
  for (const r of rows) {
    if (r.pid !== curPid) { curPid = r.pid; console.log(`\n── ${r.pid} ──`); }
    const topStruct = Object.entries(r.structScores).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k}=${v}${v >= GATE ? '✓' : ''}`).join(' ');
    console.log(
      `f=${String(r.frame).padStart(5)} ${r.gtype.padEnd(16)} kind=${r.shapeKinds.join('+').padEnd(20)} ` +
      `budget=${r.budget} moves=[${r.moves.map(m => m.replace('sm-', '')).join(',') || '—'}] el=${r.elementCount} ` +
      `lay=${r.layout.padEnd(12)} reg=${r.register.padEnd(16)} ` +
      `| f=${r.sig.formality} e=${r.sig.enthusiasm} a=${r.sig.arousal} p=${r.sig.pacing} vd=${r.sig.visdep} | top: ${topStruct}`,
    );
  }

  // ── Aggregate calibration summary ──
  console.log(`\n${'='.repeat(110)}\nCALIBRATION SUMMARY (${rows.length} real MGs across ${PROJECT_IDS.length} projects)\n${'='.repeat(110)}`);

  const moveCountDist: Record<number, number> = {};
  rows.forEach(r => { moveCountDist[r.moves.length] = (moveCountDist[r.moves.length] || 0) + 1; });
  console.log('Structural-move COUNT distribution:', JSON.stringify(moveCountDist),
    `(cap is 1/2/3 by budget; ${rows.filter(r => r.moves.length > 3).length} exceed 3 = over-decoration)`);

  const moveFreq: Record<string, number> = {};
  rows.forEach(r => r.moves.forEach(m => { moveFreq[m] = (moveFreq[m] || 0) + 1; }));
  console.log('Which moves fired (freq):', JSON.stringify(moveFreq));

  const kindDist: Record<string, number> = {};
  rows.forEach(r => { const k = r.shapeKinds[0] || 'none'; kindDist[k] = (kindDist[k] || 0) + 1; });
  console.log('Primary shape-kind distribution:', JSON.stringify(kindDist));

  const regDist: Record<string, number> = {};
  rows.forEach(r => { regDist[r.register] = (regDist[r.register] || 0) + 1; });
  console.log('Register distribution:', JSON.stringify(regDist));

  // Wrong-register check: editorial/broadcast moves (brackets, corner-marks, side-bar, kicker) on casual content
  const EDITORIAL = new Set(['brackets', 'corner-marks', 'side-bar', 'kicker', 'badge']);
  const wrongRegister = rows.filter(r => r.register.startsWith('casual') && r.moves.some(m => EDITORIAL.has(m.replace('sm-', ''))));
  console.log(`Editorial moves on CASUAL content (wrong-register risk): ${wrongRegister.length}`);
  wrongRegister.slice(0, 8).forEach(r => console.log(`   ${r.pid} f=${r.frame} moves=[${r.moves.map(m => m.replace('sm-', ''))}] f=${r.sig.formality} e=${r.sig.enthusiasm}`));

  // Score distribution per structure overlay across all MGs (are they clustering below/above the 0.45 gate?)
  console.log('\nmg.structure.* score distribution across all real MGs (min / median / max | %>=0.45):');
  for (const id of STRUCTURE_IDS) {
    const key = id.replace('mg.structure.', '');
    const vals = rows.map(r => r.structScores[key]).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    const pctFired = round(100 * vals.filter(v => v >= GATE).length / vals.length, 0);
    console.log(`  ${key.padEnd(14)} ${String(round(vals[0])).padStart(5)} / ${String(round(med)).padStart(5)} / ${String(round(vals[vals.length - 1])).padStart(5)}  | ${pctFired}%`);
  }

  const noMoves = rows.filter(r => r.moves.length === 0).length;
  console.log(`\nMGs with ZERO structural moves: ${noMoves}/${rows.length} (${round(100 * noMoves / rows.length, 0)}%) — under-decoration check`);

  // Dump recipes for the render step
  mkdirSync('.calibration-temp', { recursive: true });
  writeFileSync('.calibration-temp/real-recipes.json', JSON.stringify(dumpedRecipes, null, 2));
  console.log(`\nWrote ${dumpedRecipes.length} computed recipes → .calibration-temp/real-recipes.json (for pixel render)`);

  await client.close();
}

main().catch(e => { console.error('ERROR:', e.stack || e.message); process.exit(1); });
