/**
 * Test: Decision Tracker (Phase 7.1)
 *
 * Tests:
 * 1. Snapshot creation from EditDecisions
 * 2. Diff: kept decisions (overlay at same position)
 * 3. Diff: modified decisions (overlay moved)
 * 4. Diff: removed decisions (overlay deleted by user)
 * 5. Diff: mixed outcomes
 * 6. Outcome aggregation (keepRate, byTechnique, byReason)
 * 7. Edge cases (empty inputs, no overlays, duplicate frames)
 */

import {
  snapshotDecisions,
  diffOutcomes,
  aggregateOutcomes,
  type DecisionSnapshot,
  type OverlayRef,
  type ProjectDecisionLog,
} from '../lib/editron/services/decision-tracker';
import type { EditDecision } from '../lib/editron/types/edit-decision';

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

// ── Test data ─────────────────────────────────────────────────────────────

const testDecisions: EditDecision[] = [
  { type: 'zoom', frame: 100, confidence: 0.85, source: 'creative-brief:music_beat:timestamp', technique: 'zoom_push', params: { scaleFrom: 1.0, scaleTo: 1.06 }, reason: 'music_beat' },
  { type: 'transition', frame: 300, confidence: 0.78, source: 'creative-brief:music_section_change:timestamp', technique: 'transition_hard_cut', params: {}, reason: 'music_section_change' },
  { type: 'sfx', frame: 500, confidence: 0.92, source: 'creative-brief:music_drop:timestamp', technique: 'sfx_impact', params: { volume: 0.4 }, reason: 'music_drop' },
  { type: 'zoom', frame: 800, confidence: 0.7, source: 'creative-brief:visual_peak:timestamp', technique: 'zoom_punch', params: { scaleFrom: 1.0, scaleTo: 1.12 }, reason: 'visual_peak' },
  { type: 'camera-shake', frame: 1200, confidence: 0.65, source: 'creative-brief:motion_peak:timestamp', technique: 'camera_shake', params: { intensity: 0.3 }, reason: 'motion_peak' },
];

const signalCtx = { speech_coverage: 0.1, visual_change_rate: 0.6, music_presence: 0 };

// ── 1. Snapshot creation ──────────────────────────────────────────────────

console.log('=== Snapshot Creation ===\n');

const log = snapshotDecisions('proj_test', 'user_1', testDecisions, 'visual', 60000, signalCtx);

assert(log.projectId === 'proj_test', 'projectId preserved');
assert(log.userId === 'user_1', 'userId preserved');
assert(log.contentMode === 'visual', 'contentMode preserved');
assert(log.totalDurationMs === 60000, 'totalDurationMs preserved');
assert(log.snapshots.length === 5, `5 snapshots created (got ${log.snapshots.length})`);
assert(log.snapshots[0].frame === 100, 'first snapshot frame correct');
assert(log.snapshots[0].technique === 'zoom_push', 'technique preserved');
assert(log.snapshots[0].reason === 'music_beat', 'reason preserved');
assert(log.snapshots[0].signalContext.speech_coverage === 0.1, 'signal context preserved');
assert(log.snapshots[2].confidence === 0.92, 'confidence preserved');

// ── 2. Diff: all kept ─────────────────────────────────────────────────────

console.log('\n=== Diff: All Kept ===\n');

const keptOverlays: OverlayRef[] = [
  { id: 'o1', from: 100, durationInFrames: 30 },
  { id: 'o2', from: 301, durationInFrames: 15 },
  { id: 'o3', from: 499, durationInFrames: 20 },
  { id: 'o4', from: 802, durationInFrames: 30 },
  { id: 'o5', from: 1200, durationInFrames: 10 },
];

const keptOutcomes = diffOutcomes(log, keptOverlays);
assert(keptOutcomes.length === 5, `5 outcomes (got ${keptOutcomes.length})`);
assert(keptOutcomes.every(o => o.outcome === 'kept'), 'all classified as kept (within ±3 frame tolerance)');

// ── 3. Diff: all removed ──────────────────────────────────────────────────

console.log('\n=== Diff: All Removed ===\n');

const removedOutcomes = diffOutcomes(log, []);
assert(removedOutcomes.length === 5, `5 outcomes (got ${removedOutcomes.length})`);
assert(removedOutcomes.every(o => o.outcome === 'removed'), 'all classified as removed');

// ── 4. Diff: modified ─────────────────────────────────────────────────────

console.log('\n=== Diff: Modified ===\n');

const movedOverlays: OverlayRef[] = [
  { id: 'o1', from: 130, durationInFrames: 30 },
  { id: 'o2', from: 250, durationInFrames: 15 },
  { id: 'o3', from: 500, durationInFrames: 20 },
  { id: 'o4', from: 810, durationInFrames: 30 },
  { id: 'o5', from: 1200, durationInFrames: 10 },
];

const movedOutcomes = diffOutcomes(log, movedOverlays);
assert(movedOutcomes[0].outcome === 'modified', 'frame 100→130 = modified (delta=30)');
assert(movedOutcomes[0].frameDelta === 30, `frame delta is 30 (got ${movedOutcomes[0].frameDelta})`);
assert(movedOutcomes[1].outcome === 'modified', 'frame 300→250 = modified (delta=-50)');
assert(movedOutcomes[1].frameDelta === -50, `frame delta is -50 (got ${movedOutcomes[1].frameDelta})`);
assert(movedOutcomes[2].outcome === 'kept', 'frame 500→500 = kept (delta=0)');
assert(movedOutcomes[3].outcome === 'modified', 'frame 800→810 = modified (delta=10, outside ±3)');
assert(movedOutcomes[4].outcome === 'kept', 'frame 1200→1200 = kept');

// ── 5. Diff: mixed ────────────────────────────────────────────────────────

console.log('\n=== Diff: Mixed Outcomes ===\n');

const mixedOverlays: OverlayRef[] = [
  { id: 'o1', from: 101, durationInFrames: 30 },
  { id: 'o3', from: 600, durationInFrames: 20 },
];

const mixedOutcomes = diffOutcomes(log, mixedOverlays);
const kept = mixedOutcomes.filter(o => o.outcome === 'kept');
const modified = mixedOutcomes.filter(o => o.outcome === 'modified');
const removed = mixedOutcomes.filter(o => o.outcome === 'removed');

assert(kept.length === 1, `1 kept (got ${kept.length})`);
assert(modified.length === 1, `1 modified (got ${modified.length})`);
assert(removed.length === 3, `3 removed (got ${removed.length})`);
assert(kept[0].originalFrame === 100, 'kept: frame 100 (delta ≤3)');
assert(modified[0].originalFrame === 500, 'modified: frame 500→600');

// ── 6. Aggregation ────────────────────────────────────────────────────────

console.log('\n=== Outcome Aggregation ===\n');

const stats = aggregateOutcomes(mixedOutcomes);
assert(stats.total === 5, `total=5 (got ${stats.total})`);
assert(stats.kept === 1, `kept=1 (got ${stats.kept})`);
assert(stats.modified === 1, `modified=1 (got ${stats.modified})`);
assert(stats.removed === 3, `removed=3 (got ${stats.removed})`);
assert(Math.abs(stats.keepRate - 0.3) < 0.01, `keepRate=0.3 (1 kept + 0.5*1 modified) / 5 = 0.3 (got ${stats.keepRate.toFixed(3)})`);

assert(stats.byTechnique['zoom_push']?.kept === 1, 'zoom_push: 1 kept');
assert(stats.byTechnique['sfx_impact']?.modified === 1, 'sfx_impact: 1 modified');
assert(stats.byTechnique['zoom_punch']?.removed === 1, 'zoom_punch: 1 removed');
assert(stats.byReason['music_beat']?.kept === 1, 'reason music_beat: 1 kept');
assert(stats.byReason['music_drop']?.modified === 1, 'reason music_drop: 1 modified');

// ── 7. Edge cases ─────────────────────────────────────────────────────────

console.log('\n=== Edge Cases ===\n');

const emptyLog = snapshotDecisions('proj_empty', 'user_1', [], 'speech', 30000, {});
assert(emptyLog.snapshots.length === 0, 'empty decisions → 0 snapshots');

const emptyOutcomes = diffOutcomes(emptyLog, [{ id: 'o1', from: 100, durationInFrames: 30 }]);
assert(emptyOutcomes.length === 0, 'empty snapshots → 0 outcomes (extra overlays ignored)');

const emptyStats = aggregateOutcomes([]);
assert(emptyStats.total === 0, 'empty outcomes → total=0');
assert(emptyStats.keepRate === 0, 'empty outcomes → keepRate=0');

// Overlay ID matching
const idLog = snapshotDecisions('proj_id', 'user_1', testDecisions.slice(0, 1), 'music', 60000, signalCtx, new Map([[100, 'overlay_exact']]));
assert(idLog.snapshots[0].overlayId === 'overlay_exact', 'overlayId stored in snapshot');

const idOverlays: OverlayRef[] = [
  { id: 'overlay_exact', from: 102, durationInFrames: 30 },
  { id: 'decoy', from: 100, durationInFrames: 30 },
];
const idOutcomes = diffOutcomes(idLog, idOverlays);
assert(idOutcomes[0].outcome === 'kept', 'ID match wins over frame proximity (overlay_exact at 102, within ±3)');
assert(idOutcomes[0].finalFrame === 102, 'matched by ID, not by closest frame');

// R29 adversarial: user deletes original overlay, places new one at same frame
const deletedReplacedLog = snapshotDecisions('proj_r29', 'user_1', testDecisions.slice(0, 1), 'music', 60000, signalCtx, new Map([[100, 'original_overlay']]));
const deletedReplacedOverlays: OverlayRef[] = [
  { id: 'user_manual_new', from: 100, durationInFrames: 30 },
];
const deletedReplacedOutcomes = diffOutcomes(deletedReplacedLog, deletedReplacedOverlays);
assert(deletedReplacedOutcomes[0].outcome === 'kept',
  'R29: original overlay deleted + new overlay at same frame → kept (proximity fallback, not crash)');

// R29 adversarial: all overlays far away (beyond 5s snap range)
const farOverlays: OverlayRef[] = [
  { id: 'far1', from: 5000, durationInFrames: 30 },
];
const farOutcomes = diffOutcomes(log, farOverlays);
assert(farOutcomes.every(o => o.outcome === 'removed'),
  'R29: all overlays >5s away → all decisions classified as removed (no false matches)');

// ── Results ───────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failed === 0) {
  console.log('ALL DECISION TRACKER TESTS PASSED ✓\n');
} else {
  console.log('SOME TESTS FAILED ✗\n');
  process.exit(1);
}
