// Untracked READ-ONLY. Dumps the real transcript segments for a project (editron_prev) so we can
// pick a rich moment for the generative spike. Reads MONGODB_URI from .env.local. Never `git add`.
// Run: npx tsx scripts/dump-transcript.ts [proj_OzG2qgoYudFa]
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

// Cues that a moment carries real STRUCTURE worth a generative graphic (not just a keyword).
const RICH = /\d|percent|%|\bthan\b|\bvs\b|\bversus\b|\bfrom\b[\s\S]{0,40}\bto\b|increase|decrease|grew|rose|fell|dropped|doubled|tripled|\bmore\b|\bless\b|\bhalf\b|\bdouble\b|\btimes\b|\bout of\b|\bin (?:two|three|four|five|ten)\b|majority|most|fewer/i;

async function main(): Promise<void> {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set — ensure .env.local holds MONGODB_URI'); process.exit(1); }
  const PID = process.argv[2] || 'proj_OzG2qgoYudFa';
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || 'editron_prev';
  const client = new MongoClient(uri);
  await client.connect();
  const p = await client.db(dbName).collection('projects').findOne({ projectId: PID }) as Record<string, any> | null;
  if (!p) { console.error('NOT FOUND', PID, 'in', dbName); await client.close(); process.exit(1); }

  const rfa = p.rawFootageAnalysis || {};
  const segs = (rfa.segments || []) as Record<string, any>[];
  console.log(`=== ${PID} — ${segs.length} transcript segments (★ = carries structure) ===\n`);
  let richCount = 0;
  segs.forEach((s, i) => {
    const text = String(s.text || '').trim();
    if (!text) return;
    const rich = RICH.test(text);
    if (rich) richCount++;
    console.log(`[${String(i).padStart(3)}] ${Math.round((s.startMs || 0) / 1000)}s ${rich ? '★' : ' '} ${text}`);
  });
  console.log(`\n${richCount} segments flagged as carrying structure.`);
  await client.close();
}
main().catch(e => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
