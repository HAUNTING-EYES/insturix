// Untracked READ-ONLY probe. Reads project owner + rerun prerequisites + per-moment signal
// richness from Mongo (editron_prev). Reads MONGODB_URI from .env.local — does NOT hardcode the
// secret. Stays UNTRACKED (never `git add`). Run: npx tsx scripts/probe-proj-rerun.ts [proj_OzG2qgoYudFa]
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

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
    } catch { /* file may not exist; try next */ }
  }
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

  // Ownership + rerun prerequisites (executeDirectorPlan needs userId + profileId; Path E needs rawFootageAnalysis)
  console.log(`=== ${PID} — OWNER / RERUN PREREQS (db=${dbName}) ===`);
  for (const k of ['projectId','userId','ownerId','createdBy','clerkUserId','ownerUserId','profileId','status','mode','contentMode','aspectRatio','width','height','fps']) {
    if (p[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(p[k])}`);
  }
  const rfa = p.rawFootageAnalysis;
  console.log(`  rawFootageAnalysis: ${rfa ? 'PRESENT' : 'MISSING'}${rfa?.segments ? ` (${rfa.segments.length} segments)` : ''}`);
  if (rfa && typeof rfa === 'object') console.log(`  rawFootageAnalysis keys: ${Object.keys(rfa).join(', ')}`);
  if (rfa?.segments?.[0]) console.log(`  segment[0] keys: ${Object.keys(rfa.segments[0]).join(', ')}`);
  const overlays = (p.overlays || []) as Record<string, any>[];
  console.log(`  overlays total: ${overlays.length} (video=${overlays.filter(o=>o.type==='video'||!o.type).length}, motion-graphic=${overlays.filter(o=>o.type==='motion-graphic').length})`);

  // Per-moment signal richness from persisted MG overlays (proxy for what the scorer would see)
  const mgs = overlays.filter(o => o.type === 'motion-graphic');
  const sigRanges: Record<string, {min:number;max:number;n:number}> = {};
  for (const o of mgs) {
    const s = (o.content?.signals || {}) as Record<string, unknown>;
    for (const [k,v] of Object.entries(s)) {
      if (typeof v === 'number' && isFinite(v)) {
        const r = sigRanges[k] || {min:Infinity,max:-Infinity,n:0};
        r.min = Math.min(r.min, v); r.max = Math.max(r.max, v); r.n++;
        sigRanges[k] = r;
      }
    }
  }
  const keys = Object.keys(sigRanges).sort();
  console.log(`\n=== PER-MOMENT SIGNALS ON ${mgs.length} GRAPHICS (${keys.length} distinct numeric) ===`);
  for (const k of keys) {
    const r = sigRanges[k];
    console.log(`  ${k}: ${r.min.toFixed(3)}..${r.max.toFixed(3)} (n=${r.n}${r.min===r.max?' CONSTANT':' VARIES'})`);
  }

  // The rich signals the budget/scorer/planner rely on (computeComplexityBudget, emphasis caps, etc.)
  const rich = ['cinematic_moment','visceral_impact','emotional_arousal','enthusiasm','pacing_velocity','visual_significance','warmth','humor','formality','visual_dependency'];
  console.log(`\n=== RICH SIGNALS PRESENT ON GRAPHICS? ===`);
  for (const k of rich) console.log(`  ${k}: ${sigRanges[k] ? 'YES' : 'absent'}`);

  await client.close();
}
main().catch(e => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
