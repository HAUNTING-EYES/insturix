// UNTRACKED READ-ONLY harness (NEVER `git add scripts/`). Phase 3.2 root-cause + verify harness.
// Reconstructs the REAL per-frame zoom signals offline using the ACTUAL signal builder
// (signal-registry.buildSignalTimeline — a pure fn), then scores the 12 zoom overlays at every grid
// point to reveal: does energy_delta go negative? do pull-backs ever win? what is the real scaleTo
// distribution? This is the harness that will prove the 3.2 fix before/after. NO project mutation.
// Reuses the REAL machinery (not a synthetic re-implementation) so it cannot lie the way the old
// verify-zoom-direction.ts did. Reads MONGODB_URI from .env.local; never prints the secret.
// Run from editron-worktree:  npx tsx scripts/probe-zoom-reconstruct.ts [proj_OzG2qgoYudFa]
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildSignalTimeline, buildSignalTimelineFromAnalysis } from '../lib/editron/services/signal-registry';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import type { SignalSnapshot } from '../lib/editron/engine/utility-types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function loadEnvLocal(): void {
  if (process.env.MONGODB_URI) return;
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
function stats(xs: number[]): string {
  if (!xs.length) return 'n=0';
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `n=${xs.length} min=${s[0].toFixed(3)} p50=${s[Math.floor(s.length / 2)].toFixed(3)} max=${s[s.length - 1].toFixed(3)} mean=${mean.toFixed(3)}`;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  const PID = process.argv[2] || 'proj_OzG2qgoYudFa';
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || 'editron_prev';
  const client = new MongoClient(uri);
  await client.connect();
  const p = await client.db(dbName).collection('projects').findOne({ projectId: PID }) as any;
  if (!p) { console.error('NOT FOUND', PID); await client.close(); process.exit(1); }

  // ── Inspect persisted shapes (so we feed the builder correctly — no silent lie) ──
  console.log(`=== ${PID} — persisted analysis shapes ===`);
  console.log(`fps=${p.fps} overlays=${(p.overlays || []).length} rawFootage=${p.rawFootageAnalysis ? 'Y' : 'N'}`);
  console.log(`segmentAnalysis: ${p.segmentAnalysis ? `Y (${p.segmentAnalysis.segments?.length ?? 0} segs)` : 'N'}${p.segmentAnalysis?.segments?.[0] ? ' seg[0]=' + Object.keys(p.segmentAnalysis.segments[0]).join(',') : ''}`);
  if (p.segmentAnalysis?.segments?.[0]?.visual) console.log(`  seg[0].visual=${Object.keys(p.segmentAnalysis.segments[0].visual).join(',')}`);
  if (p.segmentAnalysis?.segments?.[0]?.vocal) console.log(`  seg[0].vocal=${Object.keys(p.segmentAnalysis.segments[0].vocal).join(',')}`);
  console.log(`vjepaAnalysis: ${p.vjepaAnalysis ? `Y (${p.vjepaAnalysis.segments?.length ?? 0} segs)` : 'N'}`);
  console.log(`wav2vecAnalysis: ${p.wav2vecAnalysis ? `Y (${p.wav2vecAnalysis.segments?.length ?? 0} segs)` : 'N'}`);
  console.log(`musicAnalysis: ${p.musicAnalysis ? `Y keys=${Object.keys(p.musicAnalysis).join(',')}` : 'N'}`);

  // ── Build essentia shape defensively from musicAnalysis (null if unsure → music zoom won't fire,
  //    irrelevant to the speech-driven pull-back question; energy_delta is reported directly anyway) ──
  const ma = p.musicAnalysis;
  const essentia = ma && Array.isArray(ma.beats) ? {
    bpm: ma.bpm ?? 0,
    beats: ma.beats,
    sections: ma.sections ?? [],
    energyCurve: ma.energyCurve ?? [],
    musicPresence: ma.musicPresence ?? 0,
  } : null;

  // ── Reconstruct the REAL signal timeline. Prefer the segmentAnalysis adapter; fall back to the
  //    direct builder with persisted vjepa/wav2vec. Print which path produced signals. ──
  let timeline: any = null;
  let builtVia = 'none';
  try {
    if (p.segmentAnalysis?.segments?.length) {
      timeline = buildSignalTimelineFromAnalysis(p.segmentAnalysis as any, [], p.rawFootageAnalysis as any, [], p.fps ?? 30, essentia as any);
      builtVia = 'buildSignalTimelineFromAnalysis(segmentAnalysis)';
    }
  } catch (e) { console.warn(`adapter build failed: ${e instanceof Error ? e.message : e}`); }
  if (!timeline || !(timeline.gridSignals?.size > 0)) {
    try {
      timeline = buildSignalTimeline([], p.rawFootageAnalysis as any, [], p.fps ?? 30, p.vjepaAnalysis as any, p.wav2vecAnalysis as any, essentia as any);
      builtVia = 'buildSignalTimeline(vjepa+wav2vec)';
    } catch (e) { console.error(`direct build failed: ${e instanceof Error ? e.message : e}`); }
  }
  if (!timeline || !(timeline.gridSignals?.size > 0)) { console.error('No grid signals reconstructed — shapes mismatch; inspect above.'); await client.close(); process.exit(1); }

  const grid: Map<number, SignalSnapshot> = timeline.gridSignals;
  console.log(`\n=== Reconstructed via ${builtVia}: ${grid.size} grid points (totalFrames=${timeline.totalFrames}) ===`);

  // ── The zoom-driving signal distributions (the root-cause question) ──
  const ed: number[] = [], es: number[] = [], mi: number[] = [], cm: number[] = [];
  for (const snap of grid.values()) {
    const g = (k: string) => (typeof (snap as any)[k] === 'number' ? (snap as any)[k] as number : undefined);
    const a = g('speech.energy_delta'); if (a !== undefined) ed.push(a);
    const b = g('speech.energy_surprise'); if (b !== undefined) es.push(b);
    const c = g('visual.motion_intensity'); if (c !== undefined) mi.push(c);
    const d = g('composite.cinematic_moment'); if (d !== undefined) cm.push(d);
  }
  console.log(`speech.energy_delta:    ${stats(ed)}  | < -0.2 (winding-down/pull-back trigger): ${ed.filter(x => x < -0.2).length}/${ed.length}  | > 0.15 (push trigger): ${ed.filter(x => x > 0.15).length}`);
  console.log(`speech.energy_surprise: ${stats(es)}  | < -0.1 (post-peak decompress): ${es.filter(x => x < -0.1).length}/${es.length}`);
  console.log(`visual.motion_intensity:${stats(mi)}`);
  console.log(`composite.cinematic_moment:${stats(cm)}`);

  // ── Score the 12 zoom overlays at every grid point (multiplicative = the prod method for zoom) ──
  const zoomDefs = getOverlayDefinitions().filter(d => d.category === 'zoom');
  const winCount: Record<string, number> = {};
  const clearsMinScore: Record<string, number> = {};
  const winnerScaleTos: number[] = [];
  let firedPoints = 0, pullbackWins = 0, inWins = 0, outWins = 0, statWins = 0;
  for (const snap of grid.values()) {
    const results = scoreAllOverlays(zoomDefs, snap as any, 'multiplicative'); // sorted desc, filtered by minScore
    for (const r of results) { clearsMinScore[short(r.overlayId)] = (clearsMinScore[short(r.overlayId)] || 0) + 1; }
    const top = results[0];
    if (!top) continue;
    firedPoints++;
    const id = short(top.overlayId);
    winCount[id] = (winCount[id] || 0) + 1;
    const st = (top.outputValues as any)?.scaleTo;
    if (typeof st === 'number') {
      winnerScaleTos.push(st);
      if (st < 1) outWins++; else if (st > 1) inWins++; else statWins++;
    }
    if (id.includes('pull_back')) pullbackWins++;
  }
  console.log(`\n=== ZOOM SCORING over ${grid.size} grid points (multiplicative) ===`);
  console.log(`grid points where ANY zoom cleared minScore 0.3 and won: ${firedPoints}`);
  console.log(`winner direction: IN=${inWins} OUT=${outWins} STATIC=${statWins}  | pull-back wins: ${pullbackWins}`);
  console.log(`winner scaleTo: ${stats(winnerScaleTos)}`);
  console.log(`win counts by overlay:`); for (const [k, v] of Object.entries(winCount).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log(`\nhow often each zoom overlay CLEARS minScore 0.3 (is a candidate):`);
  for (const [k, v] of Object.entries(clearsMinScore).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  await client.close();
}
function short(id: string): string { return id.split('.').slice(0, 2).join('.'); }
main().catch(e => { console.error('ERROR:', e instanceof Error ? e.stack : e); process.exit(1); });
