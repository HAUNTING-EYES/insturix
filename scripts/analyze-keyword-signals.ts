// Untracked G-7a measurement (G-7b-lite). Reads a dumped <pid>-mgs.json and tabulates each MG's
// focal word + per-moment signal values, to test whether a SIGNAL GATE can distinguish "worth a
// keyword" (superhero/d-bag) from "everyday noun" (internet/comment) before we design any threshold.
// Evidence-first: no threshold is invented until the distribution is seen. READ-ONLY. Stays UNTRACKED.
// Run: npx tsx scripts/analyze-keyword-signals.ts [proj_OzG2qgoYudFa ...]
import * as fs from 'fs';
import * as path from 'path';

const SIG = ['visual_significance', 'emotional_arousal', 'visceral_impact', 'enthusiasm', 'emphasis', 'formality', 'pacing_velocity', 'humor'];

function num(v: unknown): string { return typeof v === 'number' ? v.toFixed(2) : '  - '; }

function analyze(pid: string): void {
  const file = path.resolve(process.cwd(), '.calibration-temp', `${pid}-mgs.json`);
  if (!fs.existsSync(file)) { console.log(`(skip ${pid}: no dump — run dump-proj-mgs.ts ${pid})`); return; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const mgs = (data.mgs || []) as Array<Record<string, any>>;
  console.log(`\n# ${data.projectId}  (${mgs.length} MGs, canvas ${data.width}x${data.height})`);
  console.log(`  ${'type'.padEnd(16)} ${'word'.padEnd(20)} ${SIG.map(s => s.slice(0, 9).padStart(9)).join(' ')}`);

  const kwSig: Record<string, number[]> = {};
  for (const o of mgs) {
    const c = (o.content || {}) as Record<string, any>;
    const s = ((c.signals || o.contentSignals || {}) as Record<string, unknown>);
    const word = String(c.emphasisWord ?? c.text ?? c.value ?? c.title ?? '?').slice(0, 20);
    const gt = String(o.metadata?.graphicType ?? '?');
    console.log(`  ${gt.padEnd(16)} ${word.padEnd(20)} ${SIG.map(k => num(s[k]).padStart(9)).join(' ')}`);
    if (gt === 'keyword-highlight') for (const k of SIG) if (typeof s[k] === 'number') (kwSig[k] ||= []).push(s[k] as number);
  }

  // Distribution of each signal across KEYWORD graphics — can a threshold separate them?
  console.log(`  -- keyword-highlight signal spread (min / mean / max) --`);
  for (const k of SIG) {
    const a = kwSig[k]; if (!a || !a.length) { console.log(`     ${k.padEnd(20)} (absent)`); continue; }
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    console.log(`     ${k.padEnd(20)} ${Math.min(...a).toFixed(2)} / ${mean.toFixed(2)} / ${Math.max(...a).toFixed(2)}  (n=${a.length})`);
  }
}

const pids = process.argv.slice(2);
if (!pids.length) pids.push('proj_OzG2qgoYudFa');
pids.forEach(analyze);
