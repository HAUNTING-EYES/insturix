// UNTRACKED READ-ONLY probe (NEVER `git add scripts/` — .env.local holds the Mongo URI).
// Phase 3.1 real-data zoom measurement. Confirms/refutes the code-level "always zoom-in" hypothesis
// BEFORE any fix, by measuring the ACTUAL persisted zoom decisions + rendered scale keyframe tracks
// + energy_delta distribution for a real project (editron_prev). Reads MONGODB_URI from .env.local;
// never hardcodes or prints the secret. Read-only: findOne only, no writes.
// Run from editron-worktree:  npx tsx scripts/probe-zoom-realdata.ts [proj_OzG2qgoYudFa]
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

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
  if (!uri) { console.error('MONGODB_URI not set — ensure .env.local holds MONGODB_URI'); process.exit(1); }
  const PID = process.argv[2] || 'proj_OzG2qgoYudFa';
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || 'editron_prev';

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const p = await db.collection('projects').findOne({ projectId: PID }) as Record<string, any> | null;
  if (!p) { console.error('NOT FOUND', PID, 'in', dbName); await client.close(); process.exit(1); }

  console.log(`=== ${PID} (db=${dbName}) — Phase 3.1 zoom real-data probe ===`);
  console.log(`top-level keys: ${Object.keys(p).join(', ')}`);

  // 1) Locate the decision log (defensive about where it lives)
  const intel = (p.intelligence || {}) as Record<string, any>;
  const decisionLog: any[] = Array.isArray(intel.decisionLog) ? intel.decisionLog
    : Array.isArray(p.decisionLog) ? p.decisionLog
    : Array.isArray(intel.decisions) ? intel.decisions
    : [];
  console.log(`intelligence keys: ${Object.keys(intel).join(', ') || '(none)'}`);
  console.log(`decisionLog entries: ${decisionLog.length}`);
  if (decisionLog[0]) console.log(`decision[0] keys: ${Object.keys(decisionLog[0]).join(', ')}`);

  // 2) ZOOM DECISIONS (what was decided)
  const isZoom = (d: any) => d?.type === 'zoom' || String(d?.technique || '').includes('zoom') || String(d?.type || '').includes('zoom');
  const zoomDecs = decisionLog.filter(isZoom);
  console.log(`\n=== ZOOM DECISIONS: ${zoomDecs.length} ===`);
  const ztCount: Record<string, number> = {};
  const techCount: Record<string, number> = {};
  const scaleTos: number[] = [];
  const energyDeltas: number[] = [];
  let inN = 0, outN = 0, statN = 0, noScale = 0;
  for (const d of zoomDecs) {
    const params = (d.params || {}) as Record<string, any>;
    const zt = params.zoomType || '(inferred)';
    ztCount[zt] = (ztCount[zt] || 0) + 1;
    const tech = String(d.technique || d.overlayId || d.mappingId || '?');
    techCount[tech] = (techCount[tech] || 0) + 1;
    const st = typeof params.scaleTo === 'number' ? params.scaleTo : undefined;
    const sf = typeof params.scaleFrom === 'number' ? params.scaleFrom : 1.0;
    if (st === undefined) noScale++;
    else { scaleTos.push(st); if (st < sf) outN++; else if (st > sf) inN++; else statN++; }
    const ed = params.signals?.['speech.energy_delta'] ?? params.signals?.energy_delta;
    if (typeof ed === 'number' && isFinite(ed)) energyDeltas.push(ed);
  }
  console.log(`zoomType: ${JSON.stringify(ztCount)}`);
  console.log(`winning technique/overlay: ${JSON.stringify(techCount)}`);
  console.log(`direction (scaleTo vs scaleFrom): IN=${inN} OUT=${outN} STATIC=${statN} noScaleTo=${noScale}`);
  console.log(`scaleTo: ${stats(scaleTos)}`);
  const buckets: Record<string, number> = {};
  for (const st of scaleTos) {
    const b = st < 1 ? '<1.0 (out)' : st === 1 ? '=1.0' : st <= 1.05 ? '1.0-1.05' : st <= 1.1 ? '1.05-1.1' : st <= 1.2 ? '1.1-1.2' : '>1.2';
    buckets[b] = (buckets[b] || 0) + 1;
  }
  console.log(`scaleTo buckets: ${JSON.stringify(buckets)}`);
  console.log(`energy_delta @ zoom decisions: ${stats(energyDeltas)}  (pull-back overlay needs < -0.2)`);
  if (energyDeltas.length) console.log(`  energy_delta < -0.2 (winding-down): ${energyDeltas.filter(x => x < -0.2).length}/${energyDeltas.length}`);

  // 3) ZOOM AS RENDERED (ground truth — what the viewer sees): video-overlay scale keyframe tracks
  const overlays = (p.overlays || []) as any[];
  const vids = overlays.filter(o => o.type === 'video' || !o.type);
  let scaleTracks = 0, rIn = 0, rOut = 0, rStat = 0;
  const rendIn: number[] = [], rendOut: number[] = [];
  const sample: string[] = [];
  for (const o of vids) {
    const tracks = o.keyframeTracks || [];
    const sc = Array.isArray(tracks) ? tracks.find((t: any) => t.property === 'scale') : undefined;
    if (!sc || !Array.isArray(sc.keyframes) || sc.keyframes.length < 2) continue;
    scaleTracks++;
    const vals = sc.keyframes.map((k: any) => k.value).filter((v: any) => typeof v === 'number') as number[];
    if (vals.length < 2) continue;
    const peak = Math.max(...vals), trough = Math.min(...vals);
    if (trough < 0.999) { rOut++; rendOut.push(trough); }
    else if (peak > 1.001) { rIn++; rendIn.push(peak); }
    else rStat++;
    if (sample.length < 8) sample.push(`[${vals.map(v => v.toFixed(3)).join('→')}]`);
  }
  console.log(`\n=== ZOOM AS RENDERED (video overlays with a scale track): ${scaleTracks} of ${vids.length} video overlays ===`);
  console.log(`direction: IN=${rIn} OUT=${rOut} STATIC=${rStat}`);
  console.log(`rendered IN  peak scale:   ${stats(rendIn)}`);
  console.log(`rendered OUT trough scale: ${stats(rendOut)}`);
  console.log(`sample scale tracks: ${sample.join('  ')}`);

  await client.close();
}
main().catch(e => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
