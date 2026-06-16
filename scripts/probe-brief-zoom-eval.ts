// UNTRACKED READ-ONLY Rule-35 eval harness (NEVER `git add scripts/`). Phase 3.2 (Path E zoom).
// Runs the REAL generateCreativeBrief on a real project and tallies the zoom-technique distribution
// the LLM chooses — the before/after gauge for the prompt fix (does it EVER pick zoom_pull_back?).
// Reuses the real generator (not a re-implementation) so it can't lie. Reads keys from .env.local;
// never prints secrets. Read-only: findOne + a Gemini generate call (no DB/project writes).
// Run from editron-worktree:  npx tsx scripts/probe-brief-zoom-eval.ts [proj_OzG2qgoYudFa]
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generateCreativeBrief, type VideoContext, type UserEditPreferences } from '../lib/editron/services/creative-brief';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function loadEnvLocal(): void {
  for (const base of [process.cwd(), path.resolve(HERE, '..')]) {
    for (const name of ['.env.local', '.env']) {
      try {
        const txt = fs.readFileSync(path.join(base, name), 'utf8');
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
}

function buildVideoContext(p: any): { ctx: VideoContext; geminiFileUri?: string } {
  const rfa = p.rawFootageAnalysis || {};
  // Flatten segment words → {word,startMs,endMs}; defensive about word field naming.
  const transcription: { word: string; startMs: number; endMs: number }[] = [];
  for (const seg of (rfa.segments || [])) {
    for (const w of (seg.words || [])) {
      const word = w.word ?? w.text ?? w.value;
      if (typeof word === 'string') transcription.push({ word, startMs: w.startMs ?? w.start ?? 0, endMs: w.endMs ?? w.end ?? 0 });
    }
  }
  const totalDurationSec = (rfa.estimatedCleanDurationMs ?? rfa.originalDurationMs ?? 0) / 1000;
  const ma = p.musicAnalysis;
  const ctx: VideoContext = {
    transcription,
    totalDurationSec,
    segmentCount: rfa.segments?.length || 0,
    audioFeatures: Array.isArray(ma?.energyCurve) && ma.energyCurve.length > 0 ? {
      rmsEnergyCurve: ma.energyCurve,
      silenceGaps: (rfa.silenceGaps || []).map((g: any) => ({ startMs: g.startMs ?? g.start ?? 0, endMs: g.endMs ?? g.end ?? 0 })),
    } : undefined,
    vjepaFeatures: p.vjepaAnalysis?.segments?.length > 0 ? { segments: p.vjepaAnalysis.segments } : undefined,
    wav2vecFeatures: p.wav2vecAnalysis?.segments?.length > 0 ? { segments: p.wav2vecAnalysis.segments } : undefined,
    musicFeatures: ma?.beats?.length ? { beats: ma.beats, sections: ma.sections || [], bpm: ma.bpm } : undefined,
  };
  return { ctx, geminiFileUri: p.geminiFileUri };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  if (!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) { console.error('No GEMINI/GOOGLE API key in env'); process.exit(1); }
  const PID = process.argv[2] || 'proj_OzG2qgoYudFa';
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || 'editron_prev';
  const client = new MongoClient(uri);
  await client.connect();
  const p = await client.db(dbName).collection('projects').findOne({ projectId: PID }) as any;
  await client.close();
  if (!p) { console.error('NOT FOUND', PID); process.exit(1); }

  const { ctx, geminiFileUri } = buildVideoContext(p);
  console.log(`=== ${PID}: VideoContext — ${ctx.transcription.length} words, ${ctx.segmentCount} segs, ${ctx.totalDurationSec.toFixed(0)}s, vjepa=${!!ctx.vjepaFeatures} wav2vec=${!!ctx.wav2vecFeatures} music=${!!ctx.musicFeatures} fileUri=${!!geminiFileUri} ===`);
  if (ctx.transcription.length === 0) { console.error('Empty transcription — cannot build a speech brief.'); process.exit(1); }

  const prefs: UserEditPreferences = {}; // defaults (matches director when brief has no overrides)
  const genreParams = p.genreParameters as any;
  console.log(`genreParams present: ${!!genreParams}${genreParams?.zoom_budget != null ? ` (zoom_budget=${genreParams.zoom_budget})` : ''}`);

  // Attempt WITH the uploaded video first (faithful to prod); fall back to text-mode if it errors (e.g. expired file).
  async function run(withFile: boolean) {
    console.log(`\n--- generateCreativeBrief (withFile=${withFile}) ---`);
    try {
      return await generateCreativeBrief(ctx, prefs, withFile ? geminiFileUri : undefined, genreParams, 'speech');
    } catch (e) {
      console.warn(`brief threw (withFile=${withFile}): ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
  let brief = geminiFileUri ? await run(true) : null;
  if (!brief) brief = await run(false);
  if (!brief) { console.error('\nBrief returned null on both attempts. Check Gemini key / Redis cache / JSON parse logs above.'); process.exit(1); }

  // ── Tally zoom technique + direction distribution ──
  const zoomTypes = ['zoom_push', 'zoom_punch', 'zoom_pull_back', 'zoom_drift'];
  const counts: Record<string, number> = {};
  let totalZoom = 0, pullBacks = 0;
  const scaleTos: number[] = [];
  for (const d of brief.decisions) {
    if (!String(d.type).startsWith('zoom_')) continue;
    totalZoom++;
    counts[d.type] = (counts[d.type] || 0) + 1;
    if (d.type === 'zoom_pull_back') pullBacks++;
    const st = (d.params as any)?.scaleTo;
    if (typeof st === 'number') scaleTos.push(st);
  }
  const typeCounts: Record<string, number> = {};
  for (const d of brief.decisions) typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;

  console.log(`\n=== BRIEF RESULT: ${brief.decisions.length} total decisions, pacing=${brief.overallPacing} ===`);
  console.log(`all decision types: ${JSON.stringify(typeCounts)}`);
  console.log(`\n=== ZOOM TECHNIQUE DISTRIBUTION (mechanism-1 gauge) ===`);
  console.log(`total zoom decisions: ${totalZoom}`);
  for (const t of zoomTypes) console.log(`  ${t}: ${counts[t] || 0}`);
  console.log(`\n>>> zoom_pull_back (zoom-OUT) chosen: ${pullBacks} / ${totalZoom} zooms <<<`);
  console.log(`scaleTo values emitted by LLM (if any): [${scaleTos.map(s => s.toFixed(3)).join(', ') || 'none — defaults from registry'}]`);
  console.log(`\nIf pull_back ≈ 0 → mechanism 1 (prompt orphans pull-back) CONFIRMED on real data.`);
}
main().catch(e => { console.error('ERROR:', e instanceof Error ? e.stack : e); process.exit(1); });
