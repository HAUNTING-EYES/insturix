/**
 * Test: Threshold Registry Data Integrity (Phase 7.2, R29/R34)
 */

import {
  THRESHOLD_REGISTRY,
  registrySummary,
  getThreshold,
  getAdaptiveThresholds,
  getBySource,
  type ThresholdSource,
} from '../lib/editron/data/threshold-registry';

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

console.log('=== Data Integrity ===\n');

const ids = THRESHOLD_REGISTRY.map(t => t.id);
const uniqueIds = new Set(ids);
assert(uniqueIds.size === ids.length, `no duplicate IDs (${ids.length} entries, ${uniqueIds.size} unique)`);

for (const t of THRESHOLD_REGISTRY) {
  assert(t.prior.sigma >= 0, `${t.id}: sigma >= 0 (got ${t.prior.sigma})`);
  assert(t.prior.mu === t.value, `${t.id}: prior mu matches value (mu=${t.prior.mu}, value=${t.value})`);
  assert(t.id.length > 0, `${t.id}: has non-empty ID`);
  assert(t.file.length > 0, `${t.id}: has file path`);
  assert(t.controls.length > 0, `${t.id}: has description`);
  assert(['crg', 'ae', 'domain', 'wcag', 'invented'].includes(t.source), `${t.id}: valid source '${t.source}'`);
}

console.log('\n=== Prior Width Consistency ===\n');

for (const t of THRESHOLD_REGISTRY) {
  if (t.fixed) {
    assert(t.prior.sigma === 0, `${t.id}: fixed threshold has sigma=0`);
  }
  if (t.source === 'crg' && !t.fixed) {
    const ratio = t.value !== 0 ? t.prior.sigma / Math.abs(t.value) : 0;
    assert(ratio <= 0.15, `${t.id}: CRG-grounded has tight prior (sigma/mu=${(ratio * 100).toFixed(1)}% ≤ 15%)`);
  }
  if (t.source === 'invented') {
    const ratio = t.value !== 0 ? t.prior.sigma / Math.abs(t.value) : 0;
    assert(ratio >= 0.1, `${t.id}: INVENTED has wide prior (sigma/mu=${(ratio * 100).toFixed(1)}% ≥ 10%)`);
  }
  if (t.aeRange) {
    assert(t.aeRange[0] <= t.value && t.value <= t.aeRange[1],
      `${t.id}: value ${t.value} within AE range [${t.aeRange[0]}, ${t.aeRange[1]}]`);
  }
}

console.log('\n=== Helper Functions ===\n');

const summary = registrySummary();
assert(summary.total === THRESHOLD_REGISTRY.length, `registrySummary total matches (${summary.total})`);
assert(summary.adaptive > 0, `has adaptive thresholds (${summary.adaptive})`);
assert(summary.fixed > 0, `has fixed thresholds (${summary.fixed})`);
const nonAdaptiveNonFixed = THRESHOLD_REGISTRY.filter(t => !t.adaptive && !t.fixed).length;
assert(summary.adaptive + summary.fixed + nonAdaptiveNonFixed === summary.total,
  `adaptive(${summary.adaptive}) + fixed(${summary.fixed}) + crg-locked(${nonAdaptiveNonFixed}) = total(${summary.total})`);

const validSources: ThresholdSource[] = ['crg', 'ae', 'domain', 'wcag', 'invented'];
let sourceSum = 0;
for (const s of validSources) {
  sourceSum += summary.bySource[s];
}
assert(sourceSum === summary.total, `source counts sum to total (${sourceSum})`);

assert(getThreshold('speech-coverage-threshold') !== undefined, 'getThreshold finds known ID');
assert(getThreshold('nonexistent-id') === undefined, 'getThreshold returns undefined for unknown');

const adaptive = getAdaptiveThresholds();
assert(adaptive.every(t => t.adaptive && !t.fixed), 'getAdaptiveThresholds filters correctly');

const invented = getBySource('invented');
assert(invented.every(t => t.source === 'invented'), 'getBySource filters correctly');
assert(invented.length === summary.bySource.invented, 'getBySource count matches summary');

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) {
  console.log('ALL THRESHOLD REGISTRY TESTS PASSED ✓\n');
} else {
  console.log('SOME TESTS FAILED ✗\n');
  process.exit(1);
}
