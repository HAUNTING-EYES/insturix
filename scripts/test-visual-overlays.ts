import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defs = JSON.parse(readFileSync(join(__dirname, '../lib/editron/engine/overlay-definitions.json'), 'utf-8'));

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) { if (cond) passed++; else { failed++; console.error('  FAIL: ' + msg); } }

console.log('=== Dead Air Scenario ===');
console.log('Low engagement + silence + no speech');
const da = { 'visual.engagement': 0.2, 'speech.silence_normalized': 0.8, 'speech.energy': 0.05, 'audio.music_beat': 0, 'speech.coverage': 0.1 };
const dr = scoreAllOverlays(defs, da).filter((r: any) => r.category === 'cut');
console.log('Cut decisions: ' + dr.length);
for (const r of dr) {
  console.log('  ' + r.overlayId + ': ' + r.totalScore.toFixed(3));
  for (const c of r.considerationScores) console.log('    ' + c.signalId + ': ' + c.rawInput.toFixed(2) + ' -> ' + c.compensated.toFixed(3));
}
assert(dr.some(r => r.overlayId === 'visual.cut_dead_air'), 'dead air scenario triggers cut_dead_air');

console.log('\n=== Music Beat Scenario ===');
console.log('On beat + no speech');
const mb = { 'visual.engagement': 0.7, 'speech.silence_normalized': 0.0, 'speech.energy': 0.0, 'audio.music_beat': 1.0, 'speech.coverage': 0.05 };
const mr = scoreAllOverlays(defs, mb).filter((r: any) => r.category === 'cut');
console.log('Cut decisions: ' + mr.length);
for (const r of mr) {
  console.log('  ' + r.overlayId + ': ' + r.totalScore.toFixed(3));
  for (const c of r.considerationScores) console.log('    ' + c.signalId + ': ' + c.rawInput.toFixed(2) + ' -> ' + c.compensated.toFixed(3));
}
assert(mr.some(r => r.overlayId === 'visual.beat_sync_cut'), 'music beat triggers beat_sync_cut');

console.log('\n=== Scene Change Scenario ===');
console.log('High visual change');
const sc = { 'visual.scene_change': 0.8, 'speech.energy': 0.3 };
const sr = scoreAllOverlays(defs, sc).filter((r: any) => r.category === 'transition');
const sceneHit = sr.some(r => r.overlayId === 'visual.scene_transition');
console.log('Scene transition found: ' + sceneHit);
if (sceneHit) { const st = sr.find(r => r.overlayId === 'visual.scene_transition')!; console.log('  Score: ' + st.totalScore.toFixed(3)); }
assert(sceneHit, 'high scene change triggers scene_transition');

console.log('\n=== Active Speaker (should NOT cut) ===');
console.log('High engagement + active speech');
const as2 = { 'visual.engagement': 0.8, 'speech.silence_normalized': 0.0, 'speech.energy': 0.7, 'audio.music_beat': 0, 'speech.coverage': 0.8 };
const ar = scoreAllOverlays(defs, as2).filter((r: any) => r.category === 'cut');
console.log('Cut decisions: ' + ar.length);
if (ar.length === 0) console.log('  (none - correct)');
assert(ar.length === 0, 'active speaker produces no cuts');

console.log('\n' + '='.repeat(40));
console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
else console.log('ALL VISUAL OVERLAY TESTS PASSED ✓');
