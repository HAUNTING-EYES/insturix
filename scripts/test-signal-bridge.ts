/**
 * Test: Signal bridge + speech coverage alignment (investigation fixes)
 *
 * Tests:
 * 1. Speech coverage: sum-of-durations vs span method
 * 2. Signal bridge: personality signals derived from content signals
 * 3. Caption scoring: formality drives subtitle vs word-by-word
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) { console.log(`  ✓ ${message}`); passed++; }
  else { console.error(`  ✗ ${message}`); failed++; }
}

// ── 1. Speech coverage: sum vs span ───────────────────────────────────────

console.log('=== Speech Coverage Method ===\n');

function sumOfDurations(words: { startMs: number; endMs: number }[], durationMs: number): number {
  const speechMs = words.reduce((sum, w) => {
    const dur = (w.endMs ?? 0) - (w.startMs ?? 0);
    return sum + (dur > 0 ? dur : 0);
  }, 0);
  return Math.min(1, speechMs / durationMs);
}

function spanMethod(words: { startMs: number; endMs: number }[], durationMs: number): number {
  const span = words[words.length - 1].endMs - words[0].startMs;
  return Math.min(1, span / durationMs);
}

// Hank Green scenario: 2879 words, 1175s video, spanning 1960ms to 1172840ms
// Real data: words have ~180ms avg duration but span almost the entire video
const hankDuration = 1175400;
const hankWords = Array.from({ length: 2879 }, (_, i) => {
  const startMs = 1960 + Math.round(i * (1170880 / 2879));
  return { startMs, endMs: startMs + 180 };
});
const hankSum = sumOfDurations(hankWords, hankDuration);
const hankSpan = spanMethod(hankWords, hankDuration);

assert(hankSum < 0.6, `sum method: ${(hankSum * 100).toFixed(1)}% (actual speech time, should be <60%)`);
assert(hankSpan > 0.95, `span method: ${(hankSpan * 100).toFixed(1)}% (bookend span, inflated)`);
assert(hankSum < hankSpan, 'sum < span (sum is more conservative, correct)');

// Edge: video with speech only at start and end
const bookendWords = [
  { startMs: 0, endMs: 500 },
  { startMs: 59500, endMs: 60000 },
];
const bookendSum = sumOfDurations(bookendWords, 60000);
const bookendSpan = spanMethod(bookendWords, 60000);
assert(bookendSum < 0.02, `bookend sum: ${(bookendSum * 100).toFixed(1)}% (almost no speech)`);
assert(bookendSpan > 0.99, `bookend span: ${(bookendSpan * 100).toFixed(1)}% (falsely high)`);

// ── 2. Signal bridge derivation ──────────────────────────────────────────

console.log('\n=== Signal Bridge ===\n');

function derivePersonalitySignals(speechCoverage: number, formality: number) {
  return {
    formality,
    enthusiasm: speechCoverage > 0.5 ? Math.min(1, speechCoverage * 1.2) : 0.5,
    warmth: 0.3 + (speechCoverage > 0 ? 0.4 : 0),
  };
}

// Hank Green: high speech, low formality
const hank = derivePersonalitySignals(0.47, 0.3);
assert(hank.formality === 0.3, `Hank formality: ${hank.formality} (from genre params)`);
assert(hank.enthusiasm === 0.5, `Hank enthusiasm: ${hank.enthusiasm} (speech 0.47 <= 0.5 → default)`);
assert(hank.warmth === 0.7, `Hank warmth: ${hank.warmth} (has speech → 0.3 + 0.4)`);

// Corporate tutorial: high speech, high formality
const corp = derivePersonalitySignals(0.8, 0.8);
assert(corp.formality === 0.8, `Corporate formality: ${corp.formality}`);
assert(corp.enthusiasm > 0.9, `Corporate enthusiasm: ${corp.enthusiasm.toFixed(2)} (high speech → boosted)`);
assert(corp.warmth === 0.7, `Corporate warmth: ${corp.warmth}`);

// Music video: no speech
const music = derivePersonalitySignals(0.0, 0.5);
assert(music.enthusiasm === 0.5, `Music enthusiasm: ${music.enthusiasm} (no speech → default)`);
assert(music.warmth === 0.3, `Music warmth: ${music.warmth} (no speech → base only)`);

// Drone footage: no speech, low formality
const drone = derivePersonalitySignals(0.0, 0.2);
assert(drone.formality === 0.2, `Drone formality: ${drone.formality}`);
assert(drone.warmth === 0.3, `Drone warmth: ${drone.warmth} (no speech → base)`);

// ── 3. Caption scoring direction ─────────────────────────────────────────

console.log('\n=== Caption Scoring Direction ===\n');

// With real signals: low formality + high enthusiasm should favor word-by-word
// Subtitle scores HIGH on formality (non-inverted logistic)
// Word-by-word scores HIGH on enthusiasm + LOW on formality (inverted)
const casualEnergetic = { formality: 0.3, enthusiasm: 0.8 };
const formalCalm = { formality: 0.8, enthusiasm: 0.3 };

// Simulate: subtitle prefers high formality, word-by-word prefers low formality + high enthusiasm
const subtitleScoreCasual = casualEnergetic.formality; // simplified: higher formality = higher score
const wbwScoreCasual = (1 - casualEnergetic.formality) * casualEnergetic.enthusiasm;

const subtitleScoreFormal = formalCalm.formality;
const wbwScoreFormal = (1 - formalCalm.formality) * formalCalm.enthusiasm;

assert(wbwScoreCasual > subtitleScoreCasual, `casual: word-by-word (${wbwScoreCasual.toFixed(2)}) > subtitle (${subtitleScoreCasual.toFixed(2)})`);
assert(subtitleScoreFormal > wbwScoreFormal, `formal: subtitle (${subtitleScoreFormal.toFixed(2)}) > word-by-word (${wbwScoreFormal.toFixed(2)})`);

// ── Results ───────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) {
  console.log('ALL SIGNAL BRIDGE TESTS PASSED ✓\n');
} else {
  console.log('SOME TESTS FAILED ✗\n');
  process.exit(1);
}
