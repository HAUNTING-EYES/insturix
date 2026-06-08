// UNTRACKED read-only proof (never `git add scripts/`). Applies the REAL mapCutFrameToOriginalFrame
// to the project's 13 MG cut-frames and compares RAW (old) vs MAPPED (Phase-2 fix) V-JEPA coverage.
// Reads MONGODB_URI from .env.local (does not print it). Run: npx tsx scripts/verify-timeline-coverage.ts [pid]
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { mapCutFrameToOriginalFrame } from '../lib/editron/services/brief-executor';

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

async function main(): Promise<void> {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  const PID = process.argv[2] || 'proj_OzG2qgoYudFa';
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || 'editron_prev';
  const client = new MongoClient(uri);
  await client.connect();
  const p = await client.db(dbName).collection('projects').findOne({ projectId: PID }) as Record<string, any> | null;
  if (!p) { console.error('NOT FOUND', PID); await client.close(); process.exit(1); }

  const fps = p.fps || 30;
  const overlays = (p.overlays || []) as Record<string, any>[];
  const clips = overlays
    .filter((o) => o.type === 'video')
    .map((o) => ({ from: o.from, durationInFrames: o.durationInFrames, sourceStartFrame: o.sourceStartFrame ?? o.videoStartTime }));
  const vjepaSegs = (p.vjepaAnalysis?.segments || []) as Array<{ startMs: number; endMs: number }>;
  const mgs = overlays.filter((o) => o.type === 'motion-graphic');

  const hit = (timeMs: number) => vjepaSegs.some((s) => timeMs >= s.startMs && timeMs < s.endMs);
  console.log(`=== TIMELINE COVERAGE — ${PID} (${mgs.length} MGs, ${vjepaSegs.length} V-JEPA segs, ${clips.length} clips, fps ${fps}) ===`);
  let rawHits = 0; let mappedHits = 0; let mappedNull = 0;
  mgs.forEach((mg, i) => {
    const cutFrame = mg.from as number;
    const rawMs = (cutFrame / fps) * 1000;
    const origFrame = mapCutFrameToOriginalFrame(cutFrame, clips);
    if (origFrame == null) mappedNull++;
    const mappedMs = ((origFrame ?? cutFrame) / fps) * 1000;
    const r = hit(rawMs); const m = hit(mappedMs);
    if (r) rawHits++; if (m) mappedHits++;
    console.log(`  MG[${String(i).padStart(2)}] cutFrame=${String(cutFrame).padStart(5)} | RAW ${(rawMs / 1000).toFixed(1)}s ${r ? 'HIT ' : 'miss'} -> MAPPED ${(mappedMs / 1000).toFixed(1)}s ${m ? 'HIT ' : 'miss'}${origFrame == null ? ' (no clip!)' : ''}`);
  });
  console.log(`\n  RAW (old code):    ${rawHits}/${mgs.length} hit a V-JEPA segment`);
  console.log(`  MAPPED (Phase-2):  ${mappedHits}/${mgs.length} hit a V-JEPA segment  (${mappedNull} frames had no containing clip)`);
  console.log(mappedHits > rawHits ? '  -> PASS: the cut→original map lifts coverage.' : '  -> NO IMPROVEMENT — investigate.');
  await client.close();
}
main().catch((e) => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
