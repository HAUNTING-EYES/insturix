/**
 * Phase 1.3: Integration test — utility scorer with CRG-converted overlay definitions.
 * Simulates the director-agent shadow scoring path with realistic signal profiles.
 *
 * Run: npx tsx scripts/test-utility-integration.ts
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scoreAllOverlays, scoreGridPoint } from '../lib/editron/engine/utility-scorer';
import { inspectGridPoint, formatInspectorLog, generateVideoReport } from '../lib/editron/engine/decision-inspector';
import type { OverlayDefinition, SignalSnapshot, OverlayCategory, GridPointDecision } from '../lib/editron/engine/utility-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const defsPath = join(__dirname, '../lib/editron/engine/overlay-definitions.json');
const defs: OverlayDefinition[] = JSON.parse(readFileSync(defsPath, 'utf-8'));

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

// ── Content Profiles (simulate real signal timelines) ──────────────────────

interface ContentProfile {
  name: string;
  description: string;
  gridPoints: { frame: number; timestampMs: number; signals: SignalSnapshot }[];
  expectedCategories: OverlayCategory[];
  unexpectedCategories: OverlayCategory[];
}

const profiles: ContentProfile[] = [
  {
    name: 'Talking Head — High Energy',
    description: 'Enthusiastic speaker, steady camera, some numbers mentioned',
    gridPoints: [
      { frame: 0, timestampMs: 0, signals: { 'speech.energy': 0.3, 'speech.energy_delta': 0.05, enthusiasm: 0.4, motion_intensity: 0.1, warmth: 0.5, formality: 0.3 } },
      { frame: 15, timestampMs: 500, signals: { 'speech.energy': 0.5, 'speech.energy_delta': 0.15, enthusiasm: 0.6, motion_intensity: 0.1, warmth: 0.5, formality: 0.3 } },
      { frame: 30, timestampMs: 1000, signals: { 'speech.energy': 0.7, 'speech.energy_delta': 0.2, enthusiasm: 0.7, motion_intensity: 0.15, warmth: 0.5, formality: 0.3, entity_number: 1.0, claim_strength: 0.8 } },
      { frame: 45, timestampMs: 1500, signals: { 'speech.energy': 0.8, 'speech.energy_delta': 0.1, enthusiasm: 0.8, motion_intensity: 0.1, warmth: 0.5, formality: 0.3 } },
      { frame: 60, timestampMs: 2000, signals: { 'speech.energy': 0.6, 'speech.energy_delta': -0.2, enthusiasm: 0.5, motion_intensity: 0.1, warmth: 0.6, formality: 0.3 } },
    ],
    expectedCategories: ['zoom', 'graphic'],
    unexpectedCategories: [],
  },
  {
    name: 'Calm Corporate',
    description: 'Formal speaker, low energy, structured content',
    gridPoints: [
      { frame: 0, timestampMs: 0, signals: { 'speech.energy': 0.3, 'speech.energy_delta': 0.0, enthusiasm: 0.2, motion_intensity: 0.05, warmth: 0.2, formality: 0.8 } },
      { frame: 15, timestampMs: 500, signals: { 'speech.energy': 0.35, 'speech.energy_delta': 0.02, enthusiasm: 0.25, motion_intensity: 0.05, warmth: 0.2, formality: 0.8 } },
      { frame: 30, timestampMs: 1000, signals: { 'speech.energy': 0.3, 'speech.energy_delta': -0.02, enthusiasm: 0.2, motion_intensity: 0.05, warmth: 0.2, formality: 0.8, entity_number: 1.0, claim_strength: 0.6 } },
    ],
    expectedCategories: ['graphic'],
    unexpectedCategories: [],
  },
  {
    name: 'Silent / Low Signal',
    description: 'No speech, minimal signals — system should produce few or no decisions',
    gridPoints: [
      { frame: 0, timestampMs: 0, signals: { 'speech.energy': 0.0, 'speech.energy_delta': 0.0, enthusiasm: 0.0, motion_intensity: 0.1, warmth: 0.3, formality: 0.5 } },
      { frame: 15, timestampMs: 500, signals: { 'speech.energy': 0.0, 'speech.energy_delta': 0.0, enthusiasm: 0.0, motion_intensity: 0.1, warmth: 0.3, formality: 0.5 } },
      { frame: 30, timestampMs: 1000, signals: { 'speech.energy': 0.0, 'speech.energy_delta': 0.0, enthusiasm: 0.0, motion_intensity: 0.1, warmth: 0.3, formality: 0.5 } },
    ],
    expectedCategories: [],
    unexpectedCategories: ['zoom'],
  },
  {
    name: 'Name Mentioned',
    description: 'Speaker mentions a person name — should trigger lower-third graphic',
    gridPoints: [
      { frame: 0, timestampMs: 0, signals: { 'speech.energy': 0.5, enthusiasm: 0.5, entity_name: 1.0, motion_intensity: 0.1, warmth: 0.5, formality: 0.4 } },
    ],
    expectedCategories: ['graphic'],
    unexpectedCategories: [],
  },
  {
    name: 'High Motion',
    description: 'Lots of camera movement — zooms should be suppressed (inverted consideration)',
    gridPoints: [
      { frame: 0, timestampMs: 0, signals: { 'speech.energy': 0.7, 'speech.energy_delta': 0.2, enthusiasm: 0.6, motion_intensity: 0.9, warmth: 0.3, formality: 0.3 } },
    ],
    expectedCategories: [],
    unexpectedCategories: [],
  },
];

// ── Run Tests ──────────────────────────────────────────────────────────────

console.log(`\nUtility AI Integration Test`);
console.log(`Overlay definitions loaded: ${defs.length}`);
console.log(`Content profiles: ${profiles.length}`);
console.log('');

for (const profile of profiles) {
  console.log(`=== ${profile.name} ===`);
  console.log(`  ${profile.description}`);

  const recentDecisions = new Map<OverlayCategory, number>();
  const decisions: GridPointDecision[] = [];
  const allCategoriesSeen = new Set<OverlayCategory>();

  for (const gp of profile.gridPoints) {
    const decision = scoreGridPoint(defs, gp.signals, gp.frame, gp.timestampMs, recentDecisions);
    decisions.push(decision);

    for (const [cat, winner] of Object.entries(decision.winners)) {
      if (winner) {
        allCategoriesSeen.add(cat as OverlayCategory);
        recentDecisions.set(cat as OverlayCategory, gp.frame);
      }
    }
  }

  const report = generateVideoReport(decisions);
  const totalDecisions = report.reduce((sum, e) => sum + e.winners.length, 0);
  console.log(`  Grid points: ${profile.gridPoints.length}, Decisions: ${totalDecisions}`);
  console.log(`  Categories seen: ${[...allCategoriesSeen].join(', ') || '(none)'}`);

  for (const expected of profile.expectedCategories) {
    assert(allCategoriesSeen.has(expected), `${profile.name}: expected category '${expected}' not found`);
  }

  for (const unexpected of profile.unexpectedCategories) {
    assert(!allCategoriesSeen.has(unexpected), `${profile.name}: unexpected category '${unexpected}' was produced`);
  }

  if (report.length > 0 && report[0].winners.length > 0) {
    console.log(`  Sample decision:`);
    console.log(`    ${formatInspectorLog(report[0]).split('\n').join('\n    ')}`);
  }

  console.log('');
}

// ── Edge Cases ──────────────────────────────────────────────────────────────

console.log('=== Edge Cases ===');

console.log('Empty signals:');
const emptyResults = scoreAllOverlays(defs, {});
assert(emptyResults.length === 0, 'empty signals produce zero decisions');

console.log('All signals NaN:');
const nanSignals: SignalSnapshot = {};
for (const d of defs) for (const c of d.considerations) nanSignals[c.signalId] = NaN;
const nanResults = scoreAllOverlays(defs, nanSignals);
assert(nanResults.length === 0, 'NaN signals produce zero decisions');

console.log('All signals at 1.0:');
const maxSignals: SignalSnapshot = {};
for (const d of defs) for (const c of d.considerations) maxSignals[c.signalId] = 1.0;
const maxResults = scoreAllOverlays(defs, maxSignals);
console.log(`  ${maxResults.length} overlays scored above minScore with all signals at 1.0`);
assert(maxResults.length > 0, 'max signals produce some decisions');

console.log('All signals at 0.0:');
const minSignals: SignalSnapshot = {};
for (const d of defs) for (const c of d.considerations) minSignals[c.signalId] = 0.0;
const minResults = scoreAllOverlays(defs, minSignals);
console.log(`  ${minResults.length} overlays scored above minScore with all signals at 0.0`);

// ── Performance ──────────────────────────────────────────────────────────

console.log('\n=== Performance ===');
const perfSignals: SignalSnapshot = {
  'speech.energy': 0.6, 'speech.energy_delta': 0.1, enthusiasm: 0.5,
  motion_intensity: 0.15, warmth: 0.4, formality: 0.3,
  entity_number: 0, claim_strength: 0.5, entity_name: 0,
  position_in_video: 0.5, silence_duration: 0, topic_boundary: 0,
};
const gridCount = 240;
const start = performance.now();
for (let i = 0; i < gridCount; i++) {
  scoreAllOverlays(defs, perfSignals);
}
const elapsed = performance.now() - start;
console.log(`  ${defs.length} overlays × ${gridCount} grid points = ${(defs.length * gridCount).toLocaleString()} evaluations`);
console.log(`  Time: ${elapsed.toFixed(1)}ms`);
assert(elapsed < 50, `performance within budget (${elapsed.toFixed(1)}ms < 50ms)`);

// ── Results ──────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED ✓');
}
