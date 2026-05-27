/**
 * Test: Non-Speech Coordinate Resolution (Phase 6.1)
 *
 * Tests:
 * 1. Content mode routing (D-004 thresholds)
 * 2. Timestamp coordinate resolution (music/visual mode)
 * 3. Beat index coordinate resolution (music mode)
 * 4. Word index fallback (speech mode — no regression)
 * 5. Decision registry: new music/visual entries are valid
 * 6. Mixed coordinate priority (timestamp > beat > word)
 */

import { routeContentType } from '../lib/editron/services/creative-brief';
import type { ContentMode, BriefDecision, CreativeBrief, BriefDecisionType, DecisionReason } from '../lib/editron/services/creative-brief';
import { executeBrief, type BriefExecutorInput } from '../lib/editron/services/brief-executor';
import { DECISION_REGISTRY, VALID_DECISION_TYPES, VALID_DECISION_REASONS } from '../lib/editron/data/decision-registry';

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

// ── Minimal CreativeBrief builder for testing ──
function makeBrief(decisions: BriefDecision[], mode: ContentMode = 'speech'): CreativeBrief {
  return {
    videoUnderstanding: {
      primaryContent: 'test', shotScale: 'medium', lighting: 'neutral',
      productionQuality: 0.7, environment: 'studio', speakerCount: 0, hasBRoll: false,
    },
    narrativeArc: [],
    decisions,
    audioDesign: { ambientBed: 'none', duckingProfile: 'balanced' },
    captionStyle: 'none',
    overallPacing: 'balanced',
    contentMode: mode,
    modelVersion: 'test',
    processingTimeMs: 0,
  };
}

console.log('=== Content Mode Routing (D-004) ===\n');

assert(routeContentType({ speechCoverage: 0.8, musicPresence: 0.2, visualChangeRate: 0.1 }) === 'speech',
  'high speech coverage → speech');

assert(routeContentType({ speechCoverage: 0.2, musicPresence: 0.7, visualChangeRate: 0.1 }) === 'music',
  'low speech + high music → music');

assert(routeContentType({ speechCoverage: 0.2, musicPresence: 0.1, visualChangeRate: 0.5 }) === 'visual',
  'low speech + high visual change → visual');

assert(routeContentType({ speechCoverage: 0.4, musicPresence: 0.4, visualChangeRate: 0.4 }) === 'hybrid',
  'mixed signals → hybrid');

assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.65, visualChangeRate: 0.5 }) === 'music',
  'music > visual when both present (music checked first)');

assert(routeContentType({ speechCoverage: 0.35, musicPresence: 0.6, visualChangeRate: 0.4 }) === 'hybrid',
  'music present but speech at 0.35 (above non-speech ceiling 0.3) → hybrid');

console.log('\n=== Beat Density Routing ===\n');

assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.7, visualChangeRate: 0.3, beatDensityBpm: 120 }) === 'music',
  'high music + high beat density (120 BPM) → music');

assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.7, visualChangeRate: 0.35, beatDensityBpm: 5 }) === 'visual',
  'high music + ambient beat density (5 BPM) → visual (not music — no rhythm to edit to)');

assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.7, visualChangeRate: 0.35, beatDensityBpm: 0 }) === 'visual',
  'high music + zero beats → visual (ambient/drone, no rhythm)');

assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.7, visualChangeRate: 0.35, beatDensityBpm: 20 }) === 'music',
  'high music + exactly MIN_BEAT_DENSITY (20 BPM) → music (boundary)');

assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.7, visualChangeRate: 0.35, beatDensityBpm: 19 }) === 'visual',
  'high music + just under MIN_BEAT_DENSITY (19 BPM) → visual');

assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.7, visualChangeRate: 0.1 }) === 'music',
  'high music + no beatDensityBpm provided → music (backward compat, assumes rhythm)');

assert(routeContentType({ speechCoverage: 0.1, musicPresence: 0.7, visualChangeRate: 0.1, beatDensityBpm: 10 }) === 'hybrid',
  'high music + low beats + low visual → hybrid (not music, not visual)');

console.log('\n=== Timestamp Coordinate Resolution ===\n');

const timestampDecision: BriefDecision = {
  type: 'zoom_punch' as BriefDecisionType,
  targetWordIdx: -1,
  targetTimestampMs: 5000,
  confidence: 0.85,
  reason: 'music_drop' as DecisionReason,
  params: { scaleFrom: 1.0, scaleTo: 1.15 },
};

const timestampResult = executeBrief({
  brief: makeBrief([timestampDecision], 'music'),
  transcription: [],
  fps: 30,
  totalDurationMs: 60000,
});

assert(timestampResult.stats.resolvedToFrame === 1, 'timestamp decision resolved (no transcription needed)');
assert(timestampResult.edl.decisions[0]?.frame === 150, 'timestamp 5000ms → frame 150 at 30fps');
assert(timestampResult.edl.decisions[0]?.source?.includes('timestamp'), 'source includes coordinate type');

console.log('\n=== Beat Index Coordinate Resolution ===\n');

const beats = [
  { timestampMs: 0, strength: 0.3 },
  { timestampMs: 1000, strength: 0.5 },
  { timestampMs: 2000, strength: 0.9 },
  { timestampMs: 3000, strength: 0.4 },
  { timestampMs: 4000, strength: 0.8 },
];

const beatDecision: BriefDecision = {
  type: 'zoom_push' as BriefDecisionType,
  targetWordIdx: -1,
  targetBeatIdx: 2,
  confidence: 0.75,
  reason: 'music_beat' as DecisionReason,
  params: { scaleFrom: 1.0, scaleTo: 1.06 },
};

const beatResult = executeBrief({
  brief: makeBrief([beatDecision], 'music'),
  transcription: [],
  fps: 30,
  totalDurationMs: 10000,
  beats,
});

assert(beatResult.stats.resolvedToFrame === 1, 'beat decision resolved');
assert(beatResult.edl.decisions[0]?.frame === 60, 'beat index 2 → timestamp 2000ms → frame 60');
assert(beatResult.edl.decisions[0]?.source?.includes('beat'), 'source includes beat coordinate type');

console.log('\n=== Beat Index Clamping ===\n');

const beatOvershoot: BriefDecision = {
  type: 'sfx_impact' as BriefDecisionType,
  targetWordIdx: -1,
  targetBeatIdx: 5,
  confidence: 0.7,
  reason: 'music_drop' as DecisionReason,
  params: { volume: 0.4 },
};

const beatClampResult = executeBrief({
  brief: makeBrief([beatOvershoot], 'music'),
  transcription: [],
  fps: 30,
  totalDurationMs: 10000,
  beats,
});

assert(beatClampResult.stats.resolvedToFrame === 1, 'beat index 5 (overshoot by 1 of 5) → clamped to last beat');

const beatWildOvershoot: BriefDecision = {
  type: 'sfx_impact' as BriefDecisionType,
  targetWordIdx: -1,
  targetBeatIdx: 50,
  confidence: 0.7,
  reason: 'music_drop' as DecisionReason,
  params: { volume: 0.4 },
};

const beatWildResult = executeBrief({
  brief: makeBrief([beatWildOvershoot], 'music'),
  transcription: [],
  fps: 30,
  totalDurationMs: 10000,
  beats,
});

assert(beatWildResult.stats.skippedOutOfRange === 1, 'beat index 50 (wild overshoot) → discarded');

console.log('\n=== Word Index Fallback (No Regression) ===\n');

const wordDecision: BriefDecision = {
  type: 'zoom_push' as BriefDecisionType,
  targetWordIdx: 3,
  confidence: 0.8,
  reason: 'vocal_build' as DecisionReason,
  params: { scaleFrom: 1.0, scaleTo: 1.06 },
};

const wordResult = executeBrief({
  brief: makeBrief([wordDecision], 'speech'),
  transcription: [
    { word: 'hello', startMs: 0, endMs: 300 },
    { word: 'world', startMs: 350, endMs: 600 },
    { word: 'this', startMs: 700, endMs: 900 },
    { word: 'is', startMs: 1000, endMs: 1200 },
    { word: 'test', startMs: 1300, endMs: 1500 },
  ],
  fps: 30,
  totalDurationMs: 5000,
});

assert(wordResult.stats.resolvedToFrame === 1, 'word index decision resolved (regression check)');
assert(wordResult.edl.decisions[0]?.frame === 30, 'word index 3 → startMs 1000 → frame 30');

console.log('\n=== Coordinate Priority (timestamp > beat > word) ===\n');

const mixedDecision: BriefDecision = {
  type: 'zoom_punch' as BriefDecisionType,
  targetWordIdx: 0,
  targetTimestampMs: 3000,
  targetBeatIdx: 1,
  confidence: 0.9,
  reason: 'energy_peak' as DecisionReason,
  params: { scaleFrom: 1.0, scaleTo: 1.12 },
};

const mixedResult = executeBrief({
  brief: makeBrief([mixedDecision], 'hybrid'),
  transcription: [
    { word: 'hello', startMs: 0, endMs: 300 },
  ],
  fps: 30,
  totalDurationMs: 10000,
  beats: [{ timestampMs: 0, strength: 0.5 }, { timestampMs: 1000, strength: 0.8 }],
});

assert(mixedResult.edl.decisions[0]?.frame === 90, 'timestamp 3000ms wins over beat 1000ms and word 0ms → frame 90');

console.log('\n=== Decision Registry: New Entries Valid ===\n');

const musicEntries = DECISION_REGISTRY.filter(e =>
  ['music_beat', 'music_drop', 'music_section_change', 'beat_accent'].includes(e.signal));
assert(musicEntries.length === 9, `9 music-driven entries in registry (got ${musicEntries.length})`);

const visualEntries = DECISION_REGISTRY.filter(e =>
  ['motion_peak', 'visual_peak'].includes(e.signal));
assert(visualEntries.length === 6, `6 visual-driven entries in registry (got ${visualEntries.length})`);

for (const entry of [...musicEntries, ...visualEntries]) {
  assert(VALID_DECISION_TYPES.has(entry.type), `${entry.id}: type '${entry.type}' is valid`);
  assert(VALID_DECISION_REASONS.has(entry.signal), `${entry.id}: signal '${entry.signal}' is valid`);
}

console.log('\n=== Timestamp Out-of-Range ===\n');

const outOfRangeTimestamp: BriefDecision = {
  type: 'zoom_push' as BriefDecisionType,
  targetWordIdx: -1,
  targetTimestampMs: 200000,
  confidence: 0.8,
  reason: 'visual_peak' as DecisionReason,
  params: { scaleFrom: 1.0, scaleTo: 1.06 },
};

const oorResult = executeBrief({
  brief: makeBrief([outOfRangeTimestamp], 'visual'),
  transcription: [],
  fps: 30,
  totalDurationMs: 60000,
});

assert(oorResult.stats.skippedOutOfRange === 1, 'timestamp 200000ms >> 60000ms duration → discarded');

const nearBoundaryTimestamp: BriefDecision = {
  type: 'zoom_push' as BriefDecisionType,
  targetWordIdx: -1,
  targetTimestampMs: 61000,
  confidence: 0.8,
  reason: 'visual_peak' as DecisionReason,
  params: { scaleFrom: 1.0, scaleTo: 1.06 },
};

const nearResult = executeBrief({
  brief: makeBrief([nearBoundaryTimestamp], 'visual'),
  transcription: [],
  fps: 30,
  totalDurationMs: 60000,
});

assert(nearResult.stats.resolvedToFrame === 1, 'timestamp 61000ms ≈ 60000ms (1.7% over) → clamped');

console.log('\n=== Empty Transcription + No Alternative Coordinates → null ===\n');

const noCoordDecision: BriefDecision = {
  type: 'zoom_push' as BriefDecisionType,
  targetWordIdx: -1,
  confidence: 0.8,
  reason: 'visual_monotony' as DecisionReason,
  params: { scaleFrom: 1.0, scaleTo: 1.06 },
};

const noCoordResult = executeBrief({
  brief: makeBrief([noCoordDecision], 'visual'),
  transcription: [],
  fps: 30,
  totalDurationMs: 60000,
});

assert(noCoordResult.stats.skippedOutOfRange === 1, 'no coordinates at all → skipped (not crash)');

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) {
  console.log('ALL NON-SPEECH COORDINATE TESTS PASSED ✓\n');
} else {
  console.log('SOME TESTS FAILED ✗\n');
  process.exit(1);
}
