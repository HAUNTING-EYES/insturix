// UNTRACKED verification (never `git add scripts/`). Scores the entrance dials through the REAL
// loader + REAL scoreAllOverlays against (a) the 13 real MGs' persisted signals and (b) an
// adversarial synthetic sweep. Proves the entrance winner now VARIES per-moment (was 100% slide-up).
// Importing overlay-definitions.json via the loader also validates the JSON parses after the rewire.
// Run: npx tsx scripts/verify-entrance-rewire.ts [proj_OzG2qgoYudFa]
import * as fs from 'fs';
import * as path from 'path';
import { getOverlayDefinitions } from '../lib/editron/engine/overlay-definitions-loader';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import type { SignalSnapshot } from '../lib/editron/engine/utility-types';

const pid = process.argv[2] || 'proj_OzG2qgoYudFa';

const entranceDefs = getOverlayDefinitions().filter(
  (d) => d.id.startsWith('mg.animation.entrance_') && d.id !== 'mg.animation.entrance_speed',
);
console.log(`Loaded ${entranceDefs.length} entrance dials (JSON parses OK after rewire).`);
console.log('Signals each now reads:');
for (const d of entranceDefs) {
  const sigs = d.considerations.map((c) => `${c.invert ? '¬' : ''}${c.signalId}`).join(' + ');
  console.log(`  ${d.id.replace('mg.animation.entrance_', '').padEnd(10)} ← ${sigs}`);
}

// mgWinner is an argmax over entrance_* scores (all same rank) — scoreAllOverlays returns sorted desc.
function pick(signals: SignalSnapshot): { id: string; dist: string } {
  const results = scoreAllOverlays(entranceDefs, signals, 'additive');
  const top = results[0];
  const dist = results.map((r) => `${r.overlayId.replace('mg.animation.entrance_', '')}=${r.totalScore.toFixed(2)}`).join(' ');
  return { id: top ? top.overlayId.replace('mg.animation.entrance_', '') : 'NONE', dist };
}

// ── (a) Real MGs ──
const file = path.resolve(process.cwd(), '.calibration-temp', `${pid}-mgs.json`);
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { mgs: Array<Record<string, any>> };
console.log(`\n=== REAL DATA — ${pid} (${data.mgs.length} MGs, persisted per-moment signals) ===`);
const tally: Record<string, number> = {};
data.mgs.forEach((mg, i) => {
  const s = (mg.content?.signals ?? {}) as SignalSnapshot;
  const w = pick(s);
  tally[w.id] = (tally[w.id] ?? 0) + 1;
  const num = (k: string) => (typeof s[k] === 'number' ? (s[k] as number).toFixed(2) : ' — ');
  console.log(`  MG[${String(i).padStart(2)}] -> ${w.id.padEnd(9)} | vi=${num('visceral_impact')} vcr=${num('visual_change_rate')} vsig=${num('visual_significance')}`);
});
console.log(`\n  NEW winner distribution: ${JSON.stringify(tally)}`);
console.log(`  OLD (persisted entranceOverride): { "slide-up": 13 }  (100% — the monotony)`);
const distinct = Object.keys(tally).length;
console.log(`  → ${distinct} distinct entrance type(s) now. ${distinct > 1 ? 'PASS — entrance varies per-moment.' : 'FAIL — still monotonous.'}`);

// ── (b) Adversarial synthetic sweep (Rule 29) — does the wiring pick SENSIBLE entrances? ──
console.log(`\n=== ADVERSARIAL SWEEP (synthetic moments — sanity of the mapping) ===`);
const scenarios: Array<[string, SignalSnapshot]> = [
  ['calm/low-impact      ', { visceral_impact: 0.15, visual_change_rate: 0.12, visual_significance: 0.1, formality: 0.4, warmth: 0.3 }],
  ['punchy/high-impact   ', { visceral_impact: 0.92, visual_change_rate: 0.5, visual_significance: 0.85, formality: 0.3, warmth: 0.3 }],
  ['high-motion/low-imp  ', { visceral_impact: 0.3, visual_change_rate: 0.95, visual_significance: 0.2, formality: 0.3, warmth: 0.3 }],
  ['formal/calm          ', { visceral_impact: 0.25, visual_change_rate: 0.2, visual_significance: 0.15, formality: 0.85, warmth: 0.3 }],
  ['warm/still           ', { visceral_impact: 0.3, visual_change_rate: 0.1, visual_significance: 0.2, formality: 0.3, warmth: 0.9 }],
  ['extreme peak         ', { visceral_impact: 0.99, visual_change_rate: 0.9, visual_significance: 0.95, formality: 0.3, warmth: 0.3 }],
];
for (const [label, s] of scenarios) {
  const w = pick(s);
  console.log(`  ${label} -> ${w.id.padEnd(9)} | [${w.dist}]`);
}
