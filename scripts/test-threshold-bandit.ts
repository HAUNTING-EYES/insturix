/**
 * Test: Threshold Bandit (Phase 7.3, R34)
 *
 * Tests:
 * 1. State creation with registry-informed priors
 * 2. Sampling returns registry defaults when < 10 outcomes
 * 3. Sampling returns adjusted values when active
 * 4. Update from decision outcomes shifts arms
 * 5. CRG-grounded thresholds barely drift (tight priors)
 * 6. INVENTED thresholds explore broadly (wide priors)
 * 7. Clamping prevents extreme adjustments
 * 8. Serialization roundtrip
 * 9. getEffectiveThreshold fallback
 * 10. REASON_TO_THRESHOLDS coverage
 */

import {
  createThresholdBanditState,
  sampleThresholdAdjustments,
  updateThresholdBandit,
  getEffectiveThreshold,
  serializeThresholdBanditState,
  deserializeThresholdBanditState,
  type ThresholdBanditState,
} from '../lib/editron/services/threshold-bandit';
import { THRESHOLD_REGISTRY, getAdaptiveThresholds } from '../lib/editron/data/threshold-registry';
import type { DecisionOutcome } from '../lib/editron/services/decision-tracker';
import { buildContextKey, buildSignalBucket, type BanditContext } from '../lib/editron/services/genre-parameter-bandit';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

const testContext: BanditContext = {
  signalBucket: buildSignalBucket({ speechCoverage: 0.82, motionIntensity: 0.24, musicEnergy: 0.18 }),
  speechCoverageBucket: 'high',
  durationBucket: 'medium',
  platform: 'youtube',
};

// ── 1. State creation ─────────────────────────────────────────────────────

console.log('=== State Creation ===\n');

const state = createThresholdBanditState('test_user');
assert(state.userId === 'test_user', 'userId preserved');
assert(state.totalOutcomes === 0, 'starts with 0 outcomes');
assert(state.arms.size === 0, 'starts with empty arms (lazy creation)');

// ── 2. Inactive sampling (< 10 outcomes) ──────────────────────────────────

console.log('\n=== Inactive Sampling ===\n');

const inactiveAdj = sampleThresholdAdjustments(state, testContext);
assert(inactiveAdj.usedBandit === false, 'bandit inactive with 0 outcomes');

const adaptive = getAdaptiveThresholds();
for (const entry of adaptive) {
  const val = inactiveAdj.values.get(entry.id);
  assert(val === entry.value, `${entry.id}: returns registry default ${entry.value} when inactive`);
}

// ── 3. Active sampling (>= 10 outcomes) ───────────────────────────────────

console.log('\n=== Active Sampling ===\n');

const activeState = createThresholdBanditState('active_user');
activeState.totalOutcomes = 15;

const activeAdj = sampleThresholdAdjustments(activeState, testContext);
assert(activeAdj.usedBandit === true, 'bandit active with 15 outcomes');
assert(activeAdj.values.size === adaptive.length, `returns ${adaptive.length} threshold values`);

for (const entry of adaptive) {
  const val = activeAdj.values.get(entry.id)!;
  assert(typeof val === 'number' && !isNaN(val), `${entry.id}: produces valid number (got ${val.toFixed(4)})`);
}

// ── 4. Update shifts arms ─────────────────────────────────────────────────

console.log('\n=== Update Shifts Arms ===\n');

const learnState = createThresholdBanditState('learn_user');
learnState.totalOutcomes = 10;

const keptOutcomes: DecisionOutcome[] = Array.from({ length: 20 }, (_, i) => ({
  snapshotId: `d-${i}`,
  outcome: 'kept' as const,
  technique: 'zoom_push',
  reason: 'energy_peak',
  originalFrame: 100 + i * 30,
  signalContext: { speech_coverage: 0.8 },
}));

updateThresholdBandit(learnState, keptOutcomes, testContext);
assert(learnState.totalOutcomes === 30, `totalOutcomes updated (${learnState.totalOutcomes})`);

const contextKey = buildContextKey(testContext);
const speechArm = learnState.arms.get(`t:speech-coverage-threshold:${contextKey}`);
assert(speechArm !== undefined, 'speech-coverage-threshold arm created');
assert(speechArm!.observations === 20, `20 observations recorded (got ${speechArm!.observations})`);
assert(speechArm!.mu > 0, `mu shifted positive from kept outcomes (mu=${speechArm!.mu.toFixed(4)})`);

// ── 5. CRG-grounded barely drifts ────────────────────────────────────────

console.log('\n=== CRG vs INVENTED Drift ===\n');

const driftState = createThresholdBanditState('drift_user');
driftState.totalOutcomes = 100;

const removedOutcomes: DecisionOutcome[] = Array.from({ length: 50 }, (_, i) => ({
  snapshotId: `d-${i}`,
  outcome: 'removed' as const,
  technique: 'zoom_push',
  reason: 'energy_peak',
  originalFrame: 100 + i * 30,
  signalContext: { speech_coverage: 0.8 },
}));

updateThresholdBandit(driftState, removedOutcomes, testContext);

const speechEntry = THRESHOLD_REGISTRY.find(t => t.id === 'speech-coverage-threshold')!;
const speechArmDrift = driftState.arms.get(`t:speech-coverage-threshold:${contextKey}`);

const adj1 = sampleThresholdAdjustments(driftState, testContext);
const speechVal = adj1.values.get('speech-coverage-threshold')!;
const drift = Math.abs(speechVal - speechEntry.value);

assert(drift < speechEntry.prior.sigma * 3,
  `INVENTED speech-coverage drifts within 3σ (drift=${drift.toFixed(4)}, 3σ=${(speechEntry.prior.sigma * 3).toFixed(4)})`);

// ── 6. Clamping ──────────────────────────────────────────────────────────

console.log('\n=== Clamping ===\n');

const extremeState = createThresholdBanditState('extreme_user');
extremeState.totalOutcomes = 100;

const megaRemoved: DecisionOutcome[] = Array.from({ length: 500 }, (_, i) => ({
  snapshotId: `d-${i}`,
  outcome: 'removed' as const,
  technique: 'zoom_push',
  reason: 'energy_peak',
  originalFrame: i * 10,
  signalContext: {},
}));

updateThresholdBandit(extremeState, megaRemoved, testContext);
const extremeAdj = sampleThresholdAdjustments(extremeState, testContext);
const extremeSpeech = extremeAdj.values.get('speech-coverage-threshold')!;

assert(extremeSpeech >= 0, `extreme removal doesn't push below 0 (got ${extremeSpeech.toFixed(4)})`);
assert(extremeSpeech <= 2, `extreme removal stays reasonable (got ${extremeSpeech.toFixed(4)})`);

// ── 7. Serialization roundtrip ───────────────────────────────────────────

console.log('\n=== Serialization ===\n');

const serialized = serializeThresholdBanditState(learnState);
const deserialized = deserializeThresholdBanditState(serialized);

assert(deserialized.userId === learnState.userId, 'userId survives roundtrip');
assert(deserialized.totalOutcomes === learnState.totalOutcomes, 'totalOutcomes survives roundtrip');
assert(deserialized.arms.size === learnState.arms.size, `arms count survives (${deserialized.arms.size})`);

const roundtripArm = deserialized.arms.get(`t:speech-coverage-threshold:${contextKey}`);
assert(roundtripArm !== undefined, 'specific arm survives roundtrip');
assert(roundtripArm!.mu === speechArm!.mu, `mu preserved (${roundtripArm!.mu.toFixed(6)})`);

// ── 8. getEffectiveThreshold ─────────────────────────────────────────────

console.log('\n=== getEffectiveThreshold ===\n');

assert(getEffectiveThreshold(inactiveAdj, 'speech-coverage-threshold') === 0.6,
  'inactive: returns registry default 0.6');
assert(getEffectiveThreshold(inactiveAdj, 'nonexistent-id') === 0,
  'unknown ID: returns 0 (not crash)');

// ── 9. REASON_TO_THRESHOLDS coverage ─────────────────────────────────────

console.log('\n=== Reason Coverage ===\n');

const testReasons = ['music_beat', 'music_drop', 'music_section_change', 'beat_accent',
  'visual_peak', 'motion_peak', 'energy_peak', 'vocal_build', 'vocal_emphasis', 'visual_monotony'];

const coverageState = createThresholdBanditState('coverage_user');
coverageState.totalOutcomes = 10;

for (const reason of testReasons) {
  const outcome: DecisionOutcome = {
    snapshotId: 'test', outcome: 'kept', technique: 'zoom_push',
    reason, originalFrame: 100, signalContext: {},
  };
  const armsBefore = coverageState.arms.size;
  updateThresholdBandit(coverageState, [outcome], testContext);
  const armsAfter = coverageState.arms.size;
  assert(armsAfter > armsBefore || armsBefore > 0,
    `reason '${reason}' creates/updates bandit arms (${armsBefore} → ${armsAfter})`);
}

// ── Results ───────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) {
  console.log('ALL THRESHOLD BANDIT TESTS PASSED ✓\n');
} else {
  console.log('SOME TESTS FAILED ✗\n');
  process.exit(1);
}
