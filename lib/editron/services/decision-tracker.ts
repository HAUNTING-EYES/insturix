/**
 * Decision Tracker — Records system decisions + diffs against user edits.
 *
 * Phase 7.1: Foundation for Thompson sampling on thresholds.
 *
 * Flow:
 *   1. Director creates EDL decisions → snapshotDecisions() stores them
 *   2. User edits the project in Remotion (keeps/moves/deletes overlays)
 *   3. User renders → diffOutcomes() compares snapshot vs current overlays
 *   4. Outcomes feed the bandit for threshold calibration
 *
 * Each decision snapshot includes signal context — the signal values that
 * were active when the system made that decision. This is what the bandit
 * needs to learn "at these signal values, users prefer/reject this action."
 */

import type { EditDecision } from '../types/edit-decision';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DecisionSnapshot {
  id: string;
  type: EditDecision['type'];
  technique: string;
  frame: number;
  confidence: number;
  reason: string;
  source: string;
  params: Record<string, number | string>;
  signalContext: Record<string, number>;
  overlayId?: string;
}

export type DecisionOutcomeType = 'kept' | 'modified' | 'removed';

export interface DecisionOutcome {
  snapshotId: string;
  outcome: DecisionOutcomeType;
  technique: string;
  reason: string;
  originalFrame: number;
  finalFrame?: number;
  frameDelta?: number;
  signalContext: Record<string, number>;
}

export interface ProjectDecisionLog {
  projectId: string;
  userId: string;
  createdAt: number;
  contentMode: string;
  totalDurationMs: number;
  snapshots: DecisionSnapshot[];
  outcomes?: DecisionOutcome[];
  outcomeComputedAt?: number;
}

export interface OverlayRef {
  id: string;
  from: number;
  durationInFrames: number;
  type?: string;
  row?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// ⚠️ INVENTED — ±3 frames at 30fps = 100ms. CRG theory:cognition.temporal_perception
// says human cut-timing perception is ~200ms. 100ms is "same position." Needs calibration.
const FRAME_MATCH_TOLERANCE = 3;

// ─── Snapshot Creation ──────────────────────────────────────────────────────

export function snapshotDecisions(
  projectId: string,
  userId: string,
  decisions: EditDecision[],
  contentMode: string,
  totalDurationMs: number,
  signalContext: Record<string, number>,
  overlayIdMap?: Map<number, string>,
): ProjectDecisionLog {
  const snapshots: DecisionSnapshot[] = decisions.map((d, i) => ({
    id: `d-${projectId}-${i}`,
    type: d.type,
    technique: d.technique,
    frame: d.frame,
    confidence: d.confidence,
    reason: d.reason || '',
    source: d.source,
    params: { ...d.params },
    signalContext: { ...signalContext },
    overlayId: overlayIdMap?.get(d.frame),
  }));

  return {
    projectId,
    userId,
    createdAt: Date.now(),
    contentMode,
    totalDurationMs,
    snapshots,
  };
}

// ─── Outcome Diff ───────────────────────────────────────────────────────────

/**
 * Compare system-placed decisions against current overlay state.
 *
 * For each snapshot:
 *   - Find overlay by ID (if available) or by frame+type proximity
 *   - If found at same position (±FRAME_MATCH_TOLERANCE) → KEPT
 *   - If found at different position → MODIFIED (record delta)
 *   - If not found → REMOVED
 */
export function diffOutcomes(
  log: ProjectDecisionLog,
  currentOverlays: OverlayRef[],
): DecisionOutcome[] {
  const overlayMap = new Map<string, OverlayRef>();
  for (const o of currentOverlays) {
    overlayMap.set(o.id, o);
  }

  const outcomes: DecisionOutcome[] = [];
  const matchedOverlayIds = new Set<string>();

  for (const snap of log.snapshots) {
    let match: OverlayRef | undefined;

    if (snap.overlayId && overlayMap.has(snap.overlayId)) {
      match = overlayMap.get(snap.overlayId)!;
    } else {
      match = findClosestOverlay(snap, currentOverlays, matchedOverlayIds);
    }

    if (!match) {
      outcomes.push({
        snapshotId: snap.id,
        outcome: 'removed',
        technique: snap.technique,
        reason: snap.reason,
        originalFrame: snap.frame,
        signalContext: snap.signalContext,
      });
      continue;
    }

    matchedOverlayIds.add(match.id);
    const delta = match.from - snap.frame;

    if (Math.abs(delta) <= FRAME_MATCH_TOLERANCE) {
      outcomes.push({
        snapshotId: snap.id,
        outcome: 'kept',
        technique: snap.technique,
        reason: snap.reason,
        originalFrame: snap.frame,
        finalFrame: match.from,
        frameDelta: 0,
        signalContext: snap.signalContext,
      });
    } else {
      outcomes.push({
        snapshotId: snap.id,
        outcome: 'modified',
        technique: snap.technique,
        reason: snap.reason,
        originalFrame: snap.frame,
        finalFrame: match.from,
        frameDelta: delta,
        signalContext: snap.signalContext,
      });
    }
  }

  return outcomes;
}

// ─── Outcome Aggregation ────────────────────────────────────────────────────

export interface OutcomeStats {
  total: number;
  kept: number;
  modified: number;
  removed: number;
  keepRate: number;
  byTechnique: Record<string, { kept: number; modified: number; removed: number }>;
  byReason: Record<string, { kept: number; modified: number; removed: number }>;
}

export function aggregateOutcomes(outcomes: DecisionOutcome[]): OutcomeStats {
  const stats: OutcomeStats = {
    total: outcomes.length,
    kept: 0, modified: 0, removed: 0,
    keepRate: 0,
    byTechnique: {},
    byReason: {},
  };

  for (const o of outcomes) {
    stats[o.outcome]++;

    if (!stats.byTechnique[o.technique]) {
      stats.byTechnique[o.technique] = { kept: 0, modified: 0, removed: 0 };
    }
    stats.byTechnique[o.technique][o.outcome]++;

    if (o.reason && !stats.byReason[o.reason]) {
      stats.byReason[o.reason] = { kept: 0, modified: 0, removed: 0 };
    }
    if (o.reason) stats.byReason[o.reason][o.outcome]++;
  }

  stats.keepRate = stats.total > 0 ? (stats.kept + stats.modified * 0.5) / stats.total : 0;

  return stats;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SOURCE_OVERLAY_TYPES = new Set(['video', 'sound']);

function findClosestOverlay(
  snap: DecisionSnapshot,
  overlays: OverlayRef[],
  alreadyMatched: Set<string>,
): OverlayRef | undefined {
  let best: OverlayRef | undefined;
  let bestDist = Infinity;

  for (const o of overlays) {
    if (alreadyMatched.has(o.id)) continue;
    if (o.type && SOURCE_OVERLAY_TYPES.has(o.type)) continue;
    const dist = Math.abs(o.from - snap.frame);
    if (dist < bestDist) {
      bestDist = dist;
      best = o;
    }
  }

  // Only match if within reasonable range (5 seconds at 30fps)
  // ⚠️ INVENTED — 150 frames = 5s. Beyond this, it's a different decision, not a moved one. Needs calibration.
  if (best && bestDist <= 150) return best;
  return undefined;
}
