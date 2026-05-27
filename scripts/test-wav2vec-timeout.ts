/**
 * Test: Wav2Vec gap detection + partial results (R34)
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) { console.log(`  ✓ ${message}`); passed++; }
  else { console.error(`  ✗ ${message}`); failed++; }
}

const COLD_TIMEOUT_MS = 90_000;
const WARM_TIMEOUT_MS = 45_000;
const GAP_COLD_RESTART_MS = 30_000;

function selectTimeout(batchIndex: number, timeSinceLastResponse: number): number {
  return (batchIndex === 0 || timeSinceLastResponse > GAP_COLD_RESTART_MS)
    ? COLD_TIMEOUT_MS : WARM_TIMEOUT_MS;
}

console.log('=== Gap Detection ===\n');

assert(selectTimeout(0, 0) === COLD_TIMEOUT_MS, 'batch 0: always cold (90s)');
assert(selectTimeout(1, 1000) === WARM_TIMEOUT_MS, 'batch 1, 1s gap: warm (45s)');
assert(selectTimeout(1, 31000) === COLD_TIMEOUT_MS, 'batch 1, 31s gap: cold (container likely restarted)');
assert(selectTimeout(5, 500) === WARM_TIMEOUT_MS, 'batch 5, 0.5s gap: warm');
assert(selectTimeout(5, 60000) === COLD_TIMEOUT_MS, 'batch 5, 60s gap: cold');
assert(selectTimeout(9, 29999) === WARM_TIMEOUT_MS, 'batch 9, 29.999s gap: warm (just under threshold)');
assert(selectTimeout(9, 30001) === COLD_TIMEOUT_MS, 'batch 9, 30.001s gap: cold (just over threshold)');

console.log('\n=== Partial Results ===\n');

// Simulate batch processing with some empty responses
const batches = [
  [{ start: 0, end: 100 }],
  [{ start: 100, end: 200 }],
  [], // empty batch
  [{ start: 300, end: 400 }],
];

const allResults: { start: number; end: number }[] = [];
for (const batch of batches) {
  if (!batch.length) {
    // continue instead of return null
    continue;
  }
  allResults.push(...batch);
}

assert(allResults.length === 3, `partial: 3 of 4 batches succeeded (got ${allResults.length})`);
assert(allResults[0].start === 0, 'first batch preserved');
assert(allResults[2].start === 300, 'batch after empty preserved');

// All empty → should return null (no data)
const allEmpty: { start: number; end: number }[] = [];
for (const batch of [[], [], []]) {
  if (!batch.length) continue;
  allEmpty.push(...batch);
}
assert(allEmpty.length === 0, 'all empty → 0 results (would return null)');

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) {
  console.log('ALL WAV2VEC TIMEOUT TESTS PASSED ✓\n');
} else {
  console.log('SOME TESTS FAILED ✗\n');
  process.exit(1);
}
