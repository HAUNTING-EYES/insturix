/**
 * Phase 5.5: The hardest test — dramatic pause vs dead air.
 * Both have: silence + no speech.
 * Difference: dramatic pause has HIGH recent energy + HIGH visual engagement.
 * Dead air has LOW recent energy + LOW visual engagement.
 *
 * Run: npx tsx scripts/test-dramatic-vs-deadair.ts
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scoreAllOverlays } from '../lib/editron/engine/utility-scorer';
import type { OverlayDefinition } from '../lib/editron/engine/utility-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defs: OverlayDefinition[] = JSON.parse(readFileSync(join(__dirname, '../lib/editron/engine/overlay-definitions.json'), 'utf-8'));

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}

console.log('=== DRAMATIC PAUSE ===');
console.log('Speaker was energetic, pauses for effect, maintains eye contact.');
console.log('Silence present, but energy WAS high recently + engagement IS high.');
const dramaticPause = {
  'visual.engagement': 0.75,
  'speech.silence_normalized': 0.4,
  'speech.energy': 0.05,
  'speech.energy_ema': 0.65,
  'speech.energy_surprise': -0.6,
  'audio.music_beat': 0,
  'speech.coverage': 0.3,
};
const dpResults = scoreAllOverlays(defs, dramaticPause);
const dpCuts = dpResults.filter(r => r.category === 'cut');
const dpHold = dpCuts.find(r => r.overlayId === 'visual.hold_dramatic_pause');
const dpCut = dpCuts.find(r => r.overlayId === 'visual.cut_dead_air');

console.log('  hold_dramatic_pause score: ' + (dpHold ? dpHold.totalScore.toFixed(3) : 'NOT SCORED'));
console.log('  cut_dead_air score: ' + (dpCut ? dpCut.totalScore.toFixed(3) : 'NOT SCORED'));

if (dpHold && dpCut) {
  assert(dpHold.totalScore > dpCut.totalScore, 'hold beats cut on dramatic pause (hold=' + dpHold.totalScore.toFixed(3) + ' > cut=' + dpCut.totalScore.toFixed(3) + ')');
} else if (dpHold && !dpCut) {
  assert(true, 'hold fires, cut does NOT fire — correct (dramatic pause protected)');
} else if (!dpHold && dpCut) {
  assert(false, 'cut fires but hold does NOT — wrong (dramatic pause should be protected)');
} else {
  assert(false, 'neither fires — unexpected');
}

// Also verify rank: hold_dramatic_pause rank 60 > cut_dead_air rank 50
assert(
  defs.find(d => d.id === 'visual.hold_dramatic_pause')!.rank >
  defs.find(d => d.id === 'visual.cut_dead_air')!.rank,
  'hold rank (60) > cut rank (50) — hold wins ties in selectWinners'
);

console.log('\n=== DEAD AIR ===');
console.log('Speaker disengaged. Looking at notes. Energy was ALSO low before.');
console.log('Silence present, energy was LOW recently + engagement IS low.');
const deadAir = {
  'visual.engagement': 0.2,
  'speech.silence_normalized': 0.7,
  'speech.energy': 0.05,
  'speech.energy_ema': 0.15,
  'speech.energy_surprise': -0.1,
  'audio.music_beat': 0,
  'speech.coverage': 0.1,
};
const daResults = scoreAllOverlays(defs, deadAir);
const daCuts = daResults.filter(r => r.category === 'cut');
const daHold = daCuts.find(r => r.overlayId === 'visual.hold_dramatic_pause');
const daCut = daCuts.find(r => r.overlayId === 'visual.cut_dead_air');

console.log('  hold_dramatic_pause score: ' + (daHold ? daHold.totalScore.toFixed(3) : 'NOT SCORED'));
console.log('  cut_dead_air score: ' + (daCut ? daCut.totalScore.toFixed(3) : 'NOT SCORED'));

if (daCut && !daHold) {
  assert(true, 'cut fires, hold does NOT — correct (dead air should be cut)');
} else if (daCut && daHold) {
  assert(daCut.totalScore > daHold.totalScore || daCut.rank >= daHold.rank, 'cut beats hold on dead air');
} else if (!daCut && !daHold) {
  assert(false, 'neither fires — dead air goes undetected');
} else {
  assert(false, 'hold fires but cut does NOT on dead air — wrong');
}

console.log('\n=== ACTIVE SPEECH (neither should fire) ===');
const active = {
  'visual.engagement': 0.8,
  'speech.silence_normalized': 0.0,
  'speech.energy': 0.7,
  'speech.energy_ema': 0.65,
  'speech.energy_surprise': 0.05,
  'audio.music_beat': 0,
  'speech.coverage': 0.8,
};
const activeResults = scoreAllOverlays(defs, active);
const activeCuts = activeResults.filter(r => r.category === 'cut');
assert(activeCuts.length === 0, 'active speech produces no cuts');

console.log('\n=== SHORT PAUSE (< 0.3s, too short for either) ===');
const shortPause = {
  'visual.engagement': 0.6,
  'speech.silence_normalized': 0.1,
  'speech.energy': 0.1,
  'speech.energy_ema': 0.5,
  'speech.energy_surprise': -0.4,
  'speech.coverage': 0.6,
};
const spResults = scoreAllOverlays(defs, shortPause);
const spCuts = spResults.filter(r => r.category === 'cut');
console.log('  Cuts on short pause: ' + spCuts.length);
for (const r of spCuts) console.log('    ' + r.overlayId + ': ' + r.totalScore.toFixed(3));

console.log('\n' + '='.repeat(50));
console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { console.error('SOME TESTS FAILED'); process.exit(1); }
else console.log('DRAMATIC PAUSE vs DEAD AIR DISTINCTION WORKS ✓');
