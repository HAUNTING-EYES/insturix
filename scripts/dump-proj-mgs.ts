// Untracked verification helper (G-1 render). Pulls the real motion-graphic overlays for a
// project from Mongo (editron_prev) and writes them to .calibration-temp/<pid>-mgs.json so the
// Remotion still-renderer can render the REAL persisted recipes (not a replica).
// READ-ONLY against the DB. Reads MONGODB_URI from .env.local — does NOT hardcode the secret.
// Stays UNTRACKED. Run: npx tsx scripts/dump-proj-mgs.ts [proj_OzG2qgoYudFa]
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local without a dotenv dependency, without printing/persisting the secret.
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
  const p = await db.collection('projects').findOne({ projectId: PID });
  if (!p) { console.error('NOT FOUND', PID, 'in', dbName); await client.close(); process.exit(1); }

  const W = p.width || p.compositionWidth || 1920;
  const H = p.height || p.compositionHeight || 1080;
  const fps = p.fps || 30;
  const mgs = (p.overlays || []).filter((o: Record<string, unknown>) => o.type === 'motion-graphic');

  const outDir = path.resolve(process.cwd(), '.calibration-temp');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${PID}-mgs.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    projectId: PID, db: dbName, width: W, height: H, fps, aspectRatio: p.aspectRatio, count: mgs.length,
    mgs,
  }, null, 2), 'utf8');

  console.log(`=== ${PID} | canvas ${W}x${H} ar=${p.aspectRatio} fps=${fps} | ${mgs.length} motion-graphics ===`);
  mgs.forEach((o: Record<string, any>, i: number) => {
    const c = o.content || {};
    const focal = c.emphasisWord ?? c.text ?? c.value ?? c.title ?? c.headline ?? '(none)';
    const recipe = (o as Record<string, any>).recipe;
    const nEls = recipe?.elements?.length ?? 0;
    const pos = recipe?.layout?.position ?? '(no recipe)';
    const dur = o.durationInFrames ?? '?';
    console.log(`  MG[${String(i).padStart(2)}] "${String(focal).slice(0, 28)}" type=${o.metadata?.graphicType ?? '?'} pos=${pos} els=${nEls} dur=${dur}f from=${o.from ?? '?'}`);
  });
  console.log(`\nwrote ${outFile}`);
  await client.close();
}
main().catch(e => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
