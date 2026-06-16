// Untracked helper — parse the Vercel CSV log export into a clean chronological
// `time [level] (fn) message` view so the pipeline narrative is readable (Rule 27).
// Writes .calibration-temp/logs-parsed.txt (ALL messages, ascending time) + prints summary.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const path = process.argv[2] || 'D:\\google downloads\\front-end-log-export-2026-05-29T21-34-59.csv';
const raw = readFileSync(path, 'utf8');

// Minimal RFC4180 CSV parser (handles quoted fields, embedded commas/newlines, "" escapes).
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(raw);
const header = rows[0];
const ix = (n: string) => header.indexOf(n);
const tI = ix('TimeUTC'), tsI = ix('timestampInMs'), lvI = ix('level'), fnI = ix('function'), msI = ix('message'), pidI = ix('projectId'), pathI = ix('requestPath');

const data = rows.slice(1)
  .map(r => ({ t: r[tI], ts: Number(r[tsI]) || 0, lvl: r[lvI] || '·', fn: r[fnI] || '', msg: r[msI] || '', path: r[pathI] || '' }))
  .filter(r => r.msg && r.msg.trim().length > 0)
  .sort((a, b) => a.ts - b.ts);

const fnShort = (f: string) => f.replace('/api/internal/workers/', 'w:').replace('/api/services/editron/', 's:').replace('/api/', '');
const lines = data.map(r => `${r.t} [${r.lvl}] (${fnShort(r.fn)}) ${r.msg}`);

mkdirSync('.calibration-temp', { recursive: true });
const outPath = process.argv[3] || '.calibration-temp/logs-parsed.txt';
writeFileSync(outPath, lines.join('\n'));

console.log(`Total rows: ${rows.length - 1} | rows with message: ${data.length}`);
if (data.length) console.log(`Time range: ${data[0].t} → ${data[data.length - 1].t}`);
// function/worker distribution (what ran)
const fnCount: Record<string, number> = {};
data.forEach(r => { const k = fnShort(r.fn); fnCount[k] = (fnCount[k] || 0) + 1; });
console.log('Functions by message count:', JSON.stringify(Object.fromEntries(Object.entries(fnCount).sort((a, b) => b[1] - a[1]).slice(0, 25)), null, 0));
console.log(`\nWrote .calibration-temp/logs-parsed.txt (${lines.length} lines)`);
