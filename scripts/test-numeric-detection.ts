// Untracked adversarial check for the fraction/suffixed-numeric fix (Rule 3N).
// Verifies: which values become 'numeric' shape, and which count-up vs render static.
import { analyzeContentShape } from '../lib/editron/motion-graphics/engine/content-shape-analyzer';
import { isCountUpValue } from '../lib/editron/motion-graphics/engine/content-shape-analyzer';

// [value, expectedKind, expectedCountUp]
const cases: Array<[string, 'numeric' | 'emphasis' | 'free-text', boolean]> = [
  ['1/3', 'numeric', false],      // THE bug — fraction, static
  ['3.5/5', 'numeric', false],    // decimal fraction (rating), static
  ['2:1', 'numeric', false],      // ratio, static
  ['100M', 'numeric', false],     // magnitude suffix, static
  ['$1.2B', 'numeric', false],    // currency + magnitude, static
  ['10x', 'numeric', false],      // multiplier, static
  ['42%', 'numeric', true],       // percent → count-up (unchanged)
  ['$1,200', 'numeric', true],    // currency → count-up (unchanged)
  ['0.02', 'numeric', true],      // decimal → count-up (proj_AAef real case, unchanged)
  ['2024', 'numeric', true],      // year → count-up (unchanged behaviour)
  ['300', 'numeric', true],       // plain → count-up
];

// Non-numeric values must NOT become numeric (no false positives).
const nonNumeric: string[] = ['challenge', '3 reasons why', 'selection bias', 'D-bag', '', 'the worst'];

let pass = 0, fail = 0;
console.log('=== numeric value detection (kind + count-up) ===');
for (const [val, kind, countUp] of cases) {
  const shapes = analyzeContentShape({ value: val }, undefined, {}).shapes;
  const gotKind = shapes[0]?.kind;
  const gotCountUp = isCountUpValue(val);
  const ok = gotKind === kind && gotCountUp === countUp;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? '✓' : '✗ FAIL'} "${val}" → kind=${gotKind} (exp ${kind}), countUp=${gotCountUp} (exp ${countUp})`);
}

console.log('\n=== non-numeric must NOT be numeric (false-positive guard) ===');
for (const val of nonNumeric) {
  // emphasis path: value present but non-numeric → should NOT be numeric; if only text, emphasis.
  const shapes = analyzeContentShape({ value: val, text: val }, undefined, {}).shapes;
  const isNumeric = shapes.some(s => s.kind === 'numeric');
  const ok = !isNumeric;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? '✓' : '✗ FAIL'} "${val}" → numeric=${isNumeric} (exp false)`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
