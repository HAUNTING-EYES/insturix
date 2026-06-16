// UNTRACKED read-only proof (never `git add scripts/`). The 1+2 checkpoint: does the CORRECTED
// per-moment signal (Phase 2 timeline fix) flowing through the REWIRED entrance dials (Phase 1)
// change the entrance vs the pre-fix persisted signal? Replicates signalsAtFrame's per-moment
// overrides via the REAL mapCutFrameToOriginalFrame + the project's real V-JEPA/W2V segments, then
// scores the REAL entrance dials. Reads .env.local MONGODB_URI (never printed).
// Run: npx tsx scripts/verify-entrance-projection.ts [pid]
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { mapCutFrameToOriginalFrame } from '../lib/editron/services/brief-executor';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import type { SignalSnapshot } from '../lib/editron/engine/utility-types';

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

// entrance dials are SELECTION dials → scored MULTIPLICATIVELY in the real pipeline
// (edl-executor.ts:1153-1163). entrance_speed is a property dial (additive) → excluded from the pool.
const entranceDefs = getOverlayDefinitions().filter(
  (d) => d.id.startsWith('mg.animation.entrance_') && d.id !== 'mg.animation.entrance_speed',
);
const pick = (s: SignalSnapshot): string => {
  const top = scoreAllOverlays(entranceDefs, s, 'multiplicative')[0];
  return top ? top.overlayId.replace('mg.animation.entrance_', '') : 'none';
};

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
  const clips = overlays.filter((o) => o.type === 'video').map((o) => ({ from: o.from, durationInFrames: o.durationInFrames, sourceStartFrame: o.sourceStartFrame ?? o.videoStartTime }));
  const vjepaSegs = (p.vjepaAnalysis?.segments || []) as Array<Record<string, number>>;
  const mgs = overlays.filter((o) => o.type === 'motion-graphic');

  console.log(`=== ENTRANCE PROJECTION — ${PID} (Phase1 dials x Phase2 signals) ===`);
  const before: Record<string, number> = {}; const after: Record<string, number> = {};
  mgs.forEach((mg, i) => {
    const base = { ...(mg.content?.signals || {}) } as SignalSnapshot; // pre-fix persisted signals
    const beforeWinner = pick(base);
    before[beforeWinner] = (before[beforeWinner] || 0) + 1;

    // Corrected per-moment override (what the fixed signalsAtFrame now computes)
    const corrected: SignalSnapshot = { ...base };
    const origFrame = mapCutFrameToOriginalFrame(mg.from as number, clips);
    const timeMs = ((origFrame ?? (mg.from as number)) / fps) * 1000;
    const seg = vjepaSegs.find((s) => timeMs >= s.startMs && timeMs < s.endMs);
    if (seg) {
      corrected.visual_change_rate = seg.motionIntensity ?? corrected.visual_change_rate;
      corrected.visual_significance = seg.visualSignificance ?? 0;
      corrected.visceral_impact = Math.max(Number(corrected.visceral_impact ?? 0), seg.visualSignificance ?? 0);
    }
    const afterWinner = pick(corrected);
    after[afterWinner] = (after[afterWinner] || 0) + 1;

    const changed = beforeWinner !== afterWinner ? '  <-- CHANGED' : '';
    const vsig = seg ? (seg.visualSignificance ?? 0).toFixed(2) : 'GAP';
    console.log(`  MG[${String(i).padStart(2)}] before=${beforeWinner.padEnd(9)} after=${afterWinner.padEnd(9)} (corrected vsig=${vsig})${changed}`);
  });
  const dist = (d: Record<string, number>) => Object.entries(d).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`\n  BEFORE (persisted signals): ${dist(before)}  -> ${Object.keys(before).length} types`);
  console.log(`  AFTER  (corrected signals): ${dist(after)}  -> ${Object.keys(after).length} types`);
  await client.close();
}
main().catch((e) => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
