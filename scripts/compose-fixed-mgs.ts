// UNTRACKED (never `git add scripts/`). Recompose the project's MGs with CORRECTED per-moment signals
// (Phase-2 timeline fix) through the REAL composition path — an exact mirror of edl-executor.ts:1134-1191
// (resolveMotionTokens -> prop=additive/sel=multiplicative scoring -> font_weight dial -> planComposition).
// Writes <pid>-FIXED-mgs.json so render-mg-motion.ts can render the post-fix entrances vs the pre-fix dump.
// Reads .env.local MONGODB_URI (never printed) for clips + V-JEPA segments. Run: npx tsx scripts/compose-fixed-mgs.ts [pid]
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { mapCutFrameToOriginalFrame } from '../lib/editron/services/brief-executor';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { planComposition, type MgOverlayScores } from '../lib/editron/motion-graphics/engine/composition-planner';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';

function loadEnvLocal(): void {
  if (process.env.MONGODB_URI) return;
  for (const name of ['.env.local', '.env']) {
    try {
      const txt = fs.readFileSync(path.resolve(process.cwd(), name), 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
      }
    } catch { /* next */ }
  }
}

// Selection dials (multiplicative); everything else mg-property is additive — exact split from edl-executor.
const SELECTION_IDS = new Set([
  'mg.animation.entrance_fade', 'mg.animation.entrance_pop', 'mg.animation.entrance_slide',
  'mg.animation.entrance_blur', 'mg.animation.entrance_scale', 'mg.animation.entrance_rotate',
  'mg.animation.entrance_skew', 'mg.animation.entrance_zoom_blur',
  'mg.animation.hold_pulse', 'mg.animation.hold_breathe', 'mg.animation.hold_float', 'mg.animation.hold_glow',
]);

function computeMgScores(signals: Record<string, number | string>): MgOverlayScores {
  const allMgDefs = getOverlayDefinitions().filter((d) => d.category === 'mg-property');
  const propDefs = allMgDefs.filter((d) => !SELECTION_IDS.has(d.id));
  const selDefs = allMgDefs.filter((d) => SELECTION_IDS.has(d.id));
  const propResults = scoreAllOverlays(propDefs, signals as never, 'additive');
  const selResults = scoreAllOverlays(selDefs, signals as never, 'multiplicative');
  const mgScores: MgOverlayScores = {};
  for (const r of [...propResults, ...selResults]) mgScores[r.overlayId] = { score: r.totalScore, values: r.outputValues };
  return mgScores;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  const PID = process.argv[2] || 'proj_OzG2qgoYudFa';
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || 'editron_prev';
  const dumpFile = path.resolve(process.cwd(), '.calibration-temp', `${PID}-mgs.json`);
  if (!fs.existsSync(dumpFile)) { console.error(`Run dump-proj-mgs.ts ${PID} first`); process.exit(1); }
  const dump = JSON.parse(fs.readFileSync(dumpFile, 'utf8')) as { width: number; height: number; fps: number; mgs: Array<Record<string, any>> };

  const client = new MongoClient(uri);
  await client.connect();
  const p = await client.db(dbName).collection('projects').findOne({ projectId: PID }) as Record<string, any> | null;
  if (!p) { console.error('NOT FOUND', PID); await client.close(); process.exit(1); }
  const fps = p.fps || dump.fps || 30;
  const overlays = (p.overlays || []) as Record<string, any>[];
  const clips = overlays.filter((o) => o.type === 'video').map((o) => ({ from: o.from, durationInFrames: o.durationInFrames, sourceStartFrame: o.sourceStartFrame ?? o.videoStartTime }));
  const vjepaSegs = (p.vjepaAnalysis?.segments || []) as Array<Record<string, number>>;
  await client.close();

  const fixed = dump.mgs.map((mg) => {
    const base = { ...(mg.content?.signals || {}) } as Record<string, number | string>;
    // Corrected per-moment override (the fixed signalsAtFrame: cut->original then V-JEPA lookup).
    const corrected = { ...base };
    const origFrame = mapCutFrameToOriginalFrame(mg.from as number, clips);
    const timeMs = ((origFrame ?? (mg.from as number)) / fps) * 1000;
    const seg = vjepaSegs.find((s) => timeMs >= s.startMs && timeMs < s.endMs);
    if (seg) {
      corrected.visual_change_rate = seg.motionIntensity ?? (corrected.visual_change_rate as number);
      corrected.visual_significance = seg.visualSignificance ?? 0;
      corrected.visceral_impact = Math.max(Number(corrected.visceral_impact ?? 0), seg.visualSignificance ?? 0);
    }
    // Mirror edl-executor's compose path with the CORRECTED signals.
    const tokens = resolveMotionTokens(corrected as never, {});
    const mgScores = computeMgScores(corrected);
    const weightDial = mgScores['mg.typography.font_weight']?.values?.fontWeight;
    if (typeof weightDial === 'number' && isFinite(weightDial)) {
      const hw = Math.round(weightDial);
      tokens.typography.headingWeight = hw;
      tokens.typography.bodyWeight = Math.max(300, Math.min(600, hw - 200));
    }
    const { signals: _omit, ...contentMap } = (mg.content || {}) as Record<string, unknown>;
    const recipe = planComposition({ content: contentMap, triggerMoment: String(mg.reason ?? '') } as never, tokens, corrected as never, mgScores);
    const entrance = recipe.elements?.find((e: any) => e.entranceOverride)?.entranceOverride ?? recipe.elements?.[0]?.entranceOverride ?? '(default)';
    return { ...mg, recipe, resolvedTokens: tokens, content: { ...mg.content, signals: corrected }, _entrance: entrance };
  });

  const outFile = path.resolve(process.cwd(), '.calibration-temp', `${PID}-FIXED-mgs.json`);
  fs.writeFileSync(outFile, JSON.stringify({ width: dump.width, height: dump.height, fps, count: fixed.length, mgs: fixed }, null, 2));
  console.log(`Recomposed ${fixed.length} MGs with corrected signals -> ${path.basename(outFile)}`);
  fixed.forEach((m, i) => console.log(`  MG[${String(i).padStart(2)}] entrance=${m._entrance}  recipe=${m.recipe?.id}`));
}
main().catch((e) => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
