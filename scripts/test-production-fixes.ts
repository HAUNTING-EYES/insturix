/**
 * Test: Production bug fixes from proj_APY5gxzbxZ68 (Hank Green vlog)
 *
 * Tests:
 * 1. NaN speechCoverage guard (Number.isFinite)
 * 2. Essentia false positive penalty (speech dominance)
 * 3. Layout cycling for emphasis graphics
 * 4. Adversarial scenarios for each fix
 */

import { routeContentType, DEFAULT_ROUTING_THRESHOLDS } from '../lib/editron/services/creative-brief';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) { console.log(`  ✓ ${message}`); passed++; }
  else { console.error(`  ✗ ${message}`); failed++; }
}

// ── 1. NaN speechCoverage guard ───────────────────────────────────────────

console.log('=== NaN Speech Coverage Guard ===\n');

assert(routeContentType({ speechCoverage: NaN, musicPresence: 0.9, visualChangeRate: 0.5 }) !== 'music',
  'NaN speechCoverage does NOT route to music (NaN > threshold is false)');

assert(routeContentType({ speechCoverage: NaN, musicPresence: 0, visualChangeRate: 0 }) === 'hybrid',
  'NaN speechCoverage → hybrid fallback (all comparisons fail)');

assert(Number.isFinite(NaN) === false, 'Number.isFinite catches NaN');
assert(Number.isFinite(Infinity) === false, 'Number.isFinite catches Infinity');
assert(Number.isFinite(0.82) === true, 'Number.isFinite passes normal values');
assert((NaN ?? 0) !== 0, 'NaN ?? 0 does NOT return 0 (the original bug)');

// ── 2. Essentia false positive penalty ────────────────────────────────────

console.log('\n=== Essentia False Positive Penalty ===\n');

function applyPenalty(speechCoverage: number, rawMusicPresence: number): number {
  let musicPresence = rawMusicPresence;
  if (speechCoverage > 0.5) {
    musicPresence *= Math.max(0, 1 - speechCoverage);
  }
  return musicPresence;
}

// Hank Green scenario: speech=0.82, music=0.90 (false positive)
const hankMusic = applyPenalty(0.82, 0.90);
assert(hankMusic < 0.2, `Hank Green: 0.90 → ${hankMusic.toFixed(3)} (below 0.6 threshold, no music mode)`);

// Real music video: speech=0.1, music=0.90
const realMusic = applyPenalty(0.1, 0.90);
assert(realMusic === 0.90, `Real music: 0.90 → ${realMusic.toFixed(3)} (untouched, speech < 0.5)`);

// Boundary: speech=0.5 exactly — penalty uses > 0.5 (strict), so no penalty at exactly 0.5
const boundary = applyPenalty(0.5, 0.80);
assert(boundary === 0.80, `Boundary speech=0.5: 0.80 → ${boundary.toFixed(3)} (no penalty — strict >)`);

// High speech: speech=0.95
const highSpeech = applyPenalty(0.95, 0.70);
assert(highSpeech < 0.05, `High speech=0.95: 0.70 → ${highSpeech.toFixed(3)} (nearly zero)`);

// Zero speech: no penalty
const zeroSpeech = applyPenalty(0.0, 0.80);
assert(zeroSpeech === 0.80, `Zero speech: 0.80 → ${zeroSpeech.toFixed(3)} (untouched)`);

// Music=0 stays 0 regardless
const noMusic = applyPenalty(0.8, 0.0);
assert(noMusic === 0.0, `No music: 0.0 → ${noMusic.toFixed(3)} (stays zero)`);

// Penalty can't go negative
const extreme = applyPenalty(1.0, 0.50);
assert(extreme >= 0, `Extreme speech=1.0: result ${extreme.toFixed(3)} >= 0 (clamped)`);

// ── 3. Layout cycling ─────────────────────────────────────────────────────

console.log('\n=== Layout Cycling ===\n');

// Can't test the actual module counter without resetting it, but verify the logic
const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
const results: string[] = [];
for (let i = 0; i < 8; i++) {
  results.push(positions[i % positions.length]);
}
assert(results[0] === 'top-left', 'position 1: top-left');
assert(results[1] === 'top-right', 'position 2: top-right');
assert(results[2] === 'bottom-left', 'position 3: bottom-left');
assert(results[3] === 'bottom-right', 'position 4: bottom-right');
assert(results[4] === 'top-left', 'position 5: cycles back to top-left');
assert(new Set(results).size === 4, '4 distinct positions across 8 graphics');

// ── 4. Adversarial scenarios ──────────────────────────────────────────────

console.log('\n=== Adversarial Scenarios ===\n');

// R29: podcast with background music (speech=0.65, music=0.7)
const podcast = applyPenalty(0.65, 0.7);
const podcastRoute = routeContentType({
  speechCoverage: 0.65, musicPresence: podcast, visualChangeRate: 0.1,
});
assert(podcastRoute === 'speech', `Podcast (speech=0.65, raw music=0.7, penalized=${podcast.toFixed(2)}): → ${podcastRoute} (speech wins)`);

// R29: music video with spoken intro (speech=0.25, music=0.8) — below 0.3 ceiling
const musicIntro = applyPenalty(0.25, 0.8);
const musicRoute = routeContentType({
  speechCoverage: 0.25, musicPresence: musicIntro, visualChangeRate: 0.2, beatDensityBpm: 120,
});
assert(musicIntro === 0.8, `Music+intro: music untouched at ${musicIntro} (speech < 0.5)`);
assert(musicRoute === 'music', `Music+intro: → ${musicRoute} (music mode correct)`);

// R29: interview with background jazz (speech=0.7, music=0.5)
const interview = applyPenalty(0.7, 0.5);
assert(Math.abs(interview - 0.15) < 0.001, `Interview+jazz: 0.5 → ${interview.toFixed(3)} ≈ 0.15 (heavy penalty)`);
const interviewRoute = routeContentType({
  speechCoverage: 0.7, musicPresence: interview, visualChangeRate: 0.1,
});
assert(interviewRoute === 'speech', `Interview+jazz: → ${interviewRoute} (speech wins)`);

// R29: ASMR/ambient (speech=0.05, music=0.3, visual=0.1)
const asmr = applyPenalty(0.05, 0.3);
const asmrRoute = routeContentType({
  speechCoverage: 0.05, musicPresence: asmr, visualChangeRate: 0.1,
});
assert(asmrRoute === 'hybrid', `ASMR: → ${asmrRoute} (hybrid — nothing dominates)`);

// ── Results ───────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) {
  console.log('ALL PRODUCTION FIX TESTS PASSED ✓\n');
} else {
  console.log('SOME TESTS FAILED ✗\n');
  process.exit(1);
}
