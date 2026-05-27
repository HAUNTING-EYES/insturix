import { evaluateCurve } from '../lib/editron/engine/response-curves';
import { scoreOverlay, scoreAllOverlays, scoreGridPoint } from '../lib/editron/engine/utility-scorer';
import { inspectGridPoint, formatInspectorLog } from '../lib/editron/engine/decision-inspector';
import type { OverlayDefinition, SignalSnapshot, CurveParams } from '../lib/editron/engine/utility-types';
import { DEFAULT_CURVE_PARAMS } from '../lib/editron/engine/utility-types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function approx(a: number, b: number, tolerance = 0.05): boolean {
  return Math.abs(a - b) < tolerance;
}

// ── SECTION 1: Response Curves ──

console.log('\n=== Response Curves ===');

console.log('Linear:');
assert(approx(evaluateCurve('linear', DEFAULT_CURVE_PARAMS, 0.0), 0.0), 'linear(0.0) ≈ 0.0');
assert(approx(evaluateCurve('linear', DEFAULT_CURVE_PARAMS, 0.5), 0.5), 'linear(0.5) ≈ 0.5');
assert(approx(evaluateCurve('linear', DEFAULT_CURVE_PARAMS, 1.0), 1.0), 'linear(1.0) ≈ 1.0');

console.log('Polynomial (k=2, quadratic):');
const quadParams: CurveParams = { slope: 1, exponent: 2, xShift: 0, yShift: 0 };
assert(approx(evaluateCurve('polynomial', quadParams, 0.0), 0.0), 'quad(0.0) ≈ 0.0');
assert(approx(evaluateCurve('polynomial', quadParams, 0.5), 0.25), 'quad(0.5) ≈ 0.25');
assert(approx(evaluateCurve('polynomial', quadParams, 1.0), 1.0), 'quad(1.0) ≈ 1.0');

console.log('Logistic (S-curve):');
const logisticOut = evaluateCurve('logistic', DEFAULT_CURVE_PARAMS, 0.5);
assert(approx(logisticOut, 0.5, 0.1), `logistic(0.5) ≈ 0.5 (got ${logisticOut.toFixed(3)})`);
assert(evaluateCurve('logistic', DEFAULT_CURVE_PARAMS, 0.0) < 0.1, 'logistic(0.0) < 0.1');
assert(evaluateCurve('logistic', DEFAULT_CURVE_PARAMS, 1.0) > 0.9, 'logistic(1.0) > 0.9');

console.log('Normal (bell):');
const bellCenter = evaluateCurve('normal', DEFAULT_CURVE_PARAMS, 0.5);
const bellEdge = evaluateCurve('normal', DEFAULT_CURVE_PARAMS, 0.0);
assert(bellCenter > bellEdge, `bell peaks at center (${bellCenter.toFixed(3)} > ${bellEdge.toFixed(3)})`);

console.log('Edge cases:');
assert(evaluateCurve('linear', DEFAULT_CURVE_PARAMS, NaN) === 0.5, 'NaN input → 0.5');
assert(evaluateCurve('linear', DEFAULT_CURVE_PARAMS, Infinity) === 0.5, 'Infinity input → 0.5');
assert(evaluateCurve('linear', DEFAULT_CURVE_PARAMS, -1) === 0.0, 'negative input clamped to 0');
assert(evaluateCurve('linear', DEFAULT_CURVE_PARAMS, 2) === 1.0, 'input > 1 clamped');

// ── SECTION 2: Overlay Scoring ──

console.log('\n=== Overlay Scoring ===');

const zoomPush: OverlayDefinition = {
  id: 'zoom_push',
  category: 'zoom',
  rank: 50,
  weight: 1.0,
  minScore: 0.3,
  minGapFrames: 90,
  considerations: [
    { signalId: 'speech_energy', curveType: 'polynomial', params: quadParams, invert: false, description: 'prefers high energy' },
    { signalId: 'enthusiasm', curveType: 'linear', params: DEFAULT_CURVE_PARAMS, invert: false, description: 'proportional to enthusiasm' },
    { signalId: 'motion_intensity', curveType: 'linear', params: DEFAULT_CURVE_PARAMS, invert: true, description: 'prefers LOW motion' },
  ],
  outputParams: [
    { name: 'scaleTo', mode: 'proportional', minValue: 1.02, maxValue: 1.15 },
  ],
};

const dissolve: OverlayDefinition = {
  id: 'dissolve',
  category: 'transition',
  rank: 50,
  weight: 1.0,
  minScore: 0.3,
  minGapFrames: 0,
  considerations: [
    { signalId: 'warmth', curveType: 'linear', params: DEFAULT_CURVE_PARAMS, invert: false, description: 'warm content' },
    { signalId: 'speech_energy', curveType: 'linear', params: DEFAULT_CURVE_PARAMS, invert: true, description: 'prefers calm moments' },
  ],
  outputParams: [
    { name: 'durationFrames', mode: 'proportional', minValue: 10, maxValue: 30 },
  ],
};

const highEnergySignals: SignalSnapshot = {
  speech_energy: 0.8,
  enthusiasm: 0.7,
  motion_intensity: 0.1,
  warmth: 0.3,
};

const calmSignals: SignalSnapshot = {
  speech_energy: 0.2,
  enthusiasm: 0.3,
  motion_intensity: 0.1,
  warmth: 0.8,
};

console.log('High energy → zoom_push should win zoom category:');
const zoomResult = scoreOverlay(zoomPush, highEnergySignals);
assert(zoomResult.totalScore > 0.5, `zoom_push scores well on high energy (${zoomResult.totalScore.toFixed(3)})`);
assert(zoomResult.considerationScores.length === 3, 'all 3 considerations evaluated');
assert(typeof zoomResult.outputValues['scaleTo'] === 'number', 'scaleTo is numeric');
assert((zoomResult.outputValues['scaleTo'] as number) > 1.02, 'scaleTo > minimum');

console.log('Calm → dissolve should outscore zoom_push:');
const dissolveCalm = scoreOverlay(dissolve, calmSignals);
const zoomCalm = scoreOverlay(zoomPush, calmSignals);
assert(dissolveCalm.totalScore > zoomCalm.totalScore, `dissolve(${dissolveCalm.totalScore.toFixed(3)}) > zoom(${zoomCalm.totalScore.toFixed(3)}) on calm content`);

console.log('Missing signal → skip consideration, still score:');
const partialSignals: SignalSnapshot = { speech_energy: 0.8 };
const partialResult = scoreOverlay(zoomPush, partialSignals);
assert(partialResult.considerationScores.length === 1, 'only 1 of 3 considerations evaluated');
assert(partialResult.totalScore > 0, 'still produces a score');

console.log('Empty signals → score 0:');
const emptyResult = scoreOverlay(zoomPush, {});
assert(emptyResult.totalScore === 0, 'no signals → score 0');

// ── SECTION 3: Compensation Factor ──

console.log('\n=== Compensation Factor ===');

const twoConsiderations: OverlayDefinition = {
  ...zoomPush,
  id: 'two_cons',
  considerations: zoomPush.considerations.slice(0, 2),
};
const threeConsiderations = zoomPush;

const uniformSignals: SignalSnapshot = {
  speech_energy: 0.81,
  enthusiasm: 0.9,
  motion_intensity: 0.1,
};

const score2 = scoreOverlay(twoConsiderations, uniformSignals, 'multiplicative');
const score3 = scoreOverlay(threeConsiderations, uniformSignals, 'multiplicative');
console.log(`2 considerations: ${score2.totalScore.toFixed(3)}, 3 considerations: ${score3.totalScore.toFixed(3)}`);
assert(Math.abs(score2.totalScore - score3.totalScore) < 0.3, 'compensation keeps scores comparable');

// ── SECTION 4: A/B Scoring Methods ──

console.log('\n=== A/B: Multiplicative vs Additive ===');

const multResult = scoreOverlay(zoomPush, highEnergySignals, 'multiplicative');
const addResult = scoreOverlay(zoomPush, highEnergySignals, 'additive');
console.log(`  Multiplicative: ${multResult.totalScore.toFixed(3)}`);
console.log(`  Additive:       ${addResult.totalScore.toFixed(3)}`);
assert(multResult.totalScore > 0, 'multiplicative produces score');
assert(addResult.totalScore > 0, 'additive produces score');

// ── SECTION 5: Grid Point Scoring ──

console.log('\n=== Grid Point Decision ===');

const definitions = [zoomPush, dissolve];
const recent = new Map<any, number>();
const gridDecision = scoreGridPoint(definitions, highEnergySignals, 450, 15000, recent);
assert(gridDecision.frame === 450, 'correct frame');
assert(gridDecision.winners.zoom !== null, 'zoom category has winner');
assert(gridDecision.winners.zoom?.overlayId === 'zoom_push', 'zoom_push wins zoom category');

// ── SECTION 6: Decision Inspector ──

console.log('\n=== Decision Inspector ===');

const entry = inspectGridPoint(gridDecision);
assert(entry.winners.length > 0, 'inspector finds winners');
const log = formatInspectorLog(entry);
assert(log.includes('zoom_push'), 'log mentions winner');
assert(log.includes('speech_energy'), 'log includes signal breakdown');
console.log('\nSample inspector output:');
console.log(log);

// ── SECTION 7: Veto (zero consideration) ──

console.log('\n=== Veto Behavior ===');

const vetoSignals: SignalSnapshot = {
  speech_energy: 0.9,
  enthusiasm: 0.8,
  motion_intensity: 1.0,
};
const vetoResult = scoreOverlay(zoomPush, vetoSignals, 'multiplicative');
console.log(`  zoom_push with high motion (inverted → 0): ${vetoResult.totalScore.toFixed(3)}`);
assert(vetoResult.totalScore < 0.3, 'high motion vetoes zoom_push via inverted consideration');

// ── RESULTS ──

console.log(`\n${'='.repeat(40)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✓');
}
