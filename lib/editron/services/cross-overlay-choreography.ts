import type { EditDecision } from './reactive-edit-engine';

export type CrossOverlayChoreographyFamily =
  | 'caption'
  | 'mg'
  | 'camera'
  | 'transition'
  | 'audio'
  | 'timing'
  | 'pacing'
  | 'other';

export interface CrossOverlayChoreographyDecisionSummary {
  type: EditDecision['type'];
  frame: number;
  durationFrames: number;
  source: string;
  family: CrossOverlayChoreographyFamily;
}

export interface CrossOverlayChoreographySuppression {
  decision: EditDecision;
  reason: string;
  family: CrossOverlayChoreographyFamily;
  frame: number;
  conflictingWith: CrossOverlayChoreographyDecisionSummary;
  calibrationStatus: 'invented-needs-calibration';
}

export interface CrossOverlayChoreographyReport {
  version: 'cross-overlay-choreography-v1';
  inputDecisionCount: number;
  outputDecisionCount: number;
  suppressedDecisionCount: number;
  annotatedDecisionCount: number;
  calibrationStatus: 'invented-needs-calibration';
  suppressed: Array<Omit<CrossOverlayChoreographySuppression, 'decision'>>;
}

export interface CrossOverlayChoreographyResult {
  decisions: EditDecision[];
  suppressed: CrossOverlayChoreographySuppression[];
  report: CrossOverlayChoreographyReport;
}

const ACTIVE_WINDOW_FRAMES = 45;
const TEXT_LANE_WINDOW_FRAMES = 45;
const MOTION_SYNC_WINDOW_FRAMES = 18;
const AUDIO_SYNC_WINDOW_FRAMES = 12;
const MAX_ACTIVE_VISUAL_FAMILIES = 3;

export function applyCrossOverlayChoreography(decisions: EditDecision[]): CrossOverlayChoreographyResult {
  if (decisions.length === 0) {
    return buildResult([], []);
  }

  const ordered = [...decisions].sort((a, b) => (
    familyExecutionRank(familyForDecision(a)) - familyExecutionRank(familyForDecision(b))
    || decisionStrength(b) - decisionStrength(a)
    || a.frame - b.frame
  ));
  const kept: EditDecision[] = [];
  const suppressed: CrossOverlayChoreographySuppression[] = [];

  for (const decision of ordered) {
    const conflict = findChoreographyConflict(decision, kept);
    if (conflict) {
      suppressed.push({
        decision,
        reason: conflict.reason,
        family: familyForDecision(decision),
        frame: decision.frame,
        conflictingWith: summarizeDecision(conflict.conflictingWith),
        calibrationStatus: 'invented-needs-calibration',
      });
      continue;
    }
    kept.push(decision);
  }

  const suppressedByFrame = suppressed.reduce<Record<number, number>>((counts, item) => {
    counts[item.frame] = (counts[item.frame] ?? 0) + 1;
    return counts;
  }, {});

  const annotated = kept
    .sort((a, b) => a.frame - b.frame || a.priority - b.priority)
    .map((decision) => annotateKeptDecision(decision, kept, suppressedByFrame[decision.frame] ?? 0));

  return buildResult(annotated, suppressed);
}

function findChoreographyConflict(
  candidate: EditDecision,
  kept: EditDecision[],
): { reason: string; conflictingWith: EditDecision } | null {
  const family = familyForDecision(candidate);
  const nearby = kept.filter((decision) => framesNear(candidate, decision, ACTIVE_WINDOW_FRAMES));
  for (const existing of nearby) {
    const existingFamily = familyForDecision(existing);
    const frameDistance = Math.abs(candidate.frame - existing.frame);

    if (isTextLaneFamily(family) && isTextLaneFamily(existingFamily) && frameDistance <= TEXT_LANE_WINDOW_FRAMES) {
      if (!isCaptionMgCoordinationAllowed(candidate, existing)) {
        return { reason: 'text-lane-stack', conflictingWith: existing };
      }
    }

    if (isMotionFamily(family) && isMotionFamily(existingFamily) && frameDistance <= MOTION_SYNC_WINDOW_FRAMES) {
      if (!isTransitionZoomBridgeAllowed(candidate, existing)) {
        return { reason: 'motion-lane-stack', conflictingWith: existing };
      }
    }

    if (family === 'audio' && frameDistance <= AUDIO_SYNC_WINDOW_FRAMES) {
      if (!isAudioLinkedToVisualBeat(candidate, existing)) {
        return { reason: 'unlinked-audio-on-crowded-moment', conflictingWith: existing };
      }
    }
  }

  const activeVisualFamilies = new Set(nearby.map(familyForDecision).filter(isVisualFamily));
  if (isVisualFamily(family) && activeVisualFamilies.size >= MAX_ACTIVE_VISUAL_FAMILIES) {
    return { reason: 'visual-moment-overfull', conflictingWith: nearby[0] };
  }

  return null;
}

function annotateKeptDecision(
  decision: EditDecision,
  kept: EditDecision[],
  suppressedNearbyCount: number,
): EditDecision {
  const activeFamilies = [...new Set(
    kept
      .filter((candidate) => candidate !== decision && framesNear(decision, candidate, ACTIVE_WINDOW_FRAMES))
      .map(familyForDecision),
  )].sort();
  const params = { ...(decision.params ?? {}) };
  const merge = recordParam(params.unifiedDecisionMerge) ?? {};
  return {
    ...decision,
    params: {
      ...params,
      crossOverlayChoreography: {
        version: 'cross-overlay-choreography-v1',
        family: familyForDecision(decision),
        decisionStrength: roundAuditNumber(decisionStrength(decision)),
        activeFamilies,
        activeNeighborCount: activeFamilies.length,
        suppressedNearbyCount,
        calibrationStatus: 'invented-needs-calibration',
      },
      unifiedDecisionMerge: {
        ...merge,
        crossOverlayChoreography: {
          version: 'cross-overlay-choreography-v1',
          role: 'kept',
          activeFamilies,
          suppressedNearbyCount,
        },
      },
    },
  };
}

function buildResult(
  decisions: EditDecision[],
  suppressed: CrossOverlayChoreographySuppression[],
): CrossOverlayChoreographyResult {
  return {
    decisions,
    suppressed,
    report: {
      version: 'cross-overlay-choreography-v1',
      inputDecisionCount: decisions.length + suppressed.length,
      outputDecisionCount: decisions.length,
      suppressedDecisionCount: suppressed.length,
      annotatedDecisionCount: decisions.length,
      calibrationStatus: 'invented-needs-calibration',
      suppressed: suppressed.map(({ decision: _decision, ...rest }) => rest),
    },
  };
}

function familyForDecision(decision: EditDecision): CrossOverlayChoreographyFamily {
  switch (decision.type) {
    case 'caption-emphasis':
      return 'caption';
    case 'graphic':
      return 'mg';
    case 'zoom':
    case 'pan':
    case 'camera-shake':
      return 'camera';
    case 'transition':
    case 'fade':
      return 'transition';
    case 'sfx':
    case 'sfx-trigger':
      return 'audio';
    case 'speed-change':
      return 'timing';
    case 'pacing':
      return 'pacing';
    default:
      return 'other';
  }
}

function decisionStrength(decision: EditDecision): number {
  const priorityStrength = clamp01((6 - (decision.priority ?? 3)) / 5);
  const owner = recordParam(decision.params?.unifiedDecisionOwner);
  const merge = recordParam(decision.params?.unifiedDecisionMerge);
  const plannerOwned = owner?.owner === 'unified-planner' || merge?.plannerOwned === true ? 0.08 : 0;
  return roundAuditNumber(clamp01((decision.confidence ?? 0) * 0.62 + priorityStrength * 0.3 + plannerOwned));
}

function isTextLaneFamily(family: CrossOverlayChoreographyFamily): boolean {
  return family === 'caption' || family === 'mg';
}

function isMotionFamily(family: CrossOverlayChoreographyFamily): boolean {
  return family === 'camera' || family === 'transition';
}

function isVisualFamily(family: CrossOverlayChoreographyFamily): boolean {
  return family === 'caption' || family === 'mg' || family === 'camera' || family === 'transition';
}

function familyExecutionRank(family: CrossOverlayChoreographyFamily): number {
  if (isVisualFamily(family)) return 0;
  if (family === 'timing' || family === 'pacing') return 1;
  if (family === 'audio') return 2;
  return 3;
}

function isCaptionMgCoordinationAllowed(a: EditDecision, b: EditDecision): boolean {
  const aConflictRisk = numberParam(a, ['caption_mg_conflict_risk']);
  const bConflictRisk = numberParam(b, ['caption_mg_conflict_risk']);
  return booleanParam(a, ['coordinateWithCaptions', 'captionCoordinated', 'caption_coordinated'])
    || booleanParam(b, ['coordinateWithCaptions', 'captionCoordinated', 'caption_coordinated'])
    || (aConflictRisk !== undefined && aConflictRisk < 0.35)
    || (bConflictRisk !== undefined && bConflictRisk < 0.35);
}

function isTransitionZoomBridgeAllowed(a: EditDecision, b: EditDecision): boolean {
  return booleanParam(a, ['zoomBridgeAllowed', 'zoom_bridge_allowed'])
    || booleanParam(b, ['zoomBridgeAllowed', 'zoom_bridge_allowed'])
    || booleanAtPath(a.params, ['transitionBoundaryPlan.crossFamily.zoomBridgeAllowed'])
    || booleanAtPath(b.params, ['transitionBoundaryPlan.crossFamily.zoomBridgeAllowed']);
}

function isAudioLinkedToVisualBeat(audio: EditDecision, visual: EditDecision): boolean {
  const anchorFrame = numberParam(audio, ['beatFrame', 'anchorFrame', 'boundaryFrame']);
  return booleanAtPath(audio.params, ['sfxSyncPlan.crossFamily.linkedOverlay'])
    || booleanParam(audio, ['linkedOverlay', 'linked_overlay'])
    || (anchorFrame !== undefined && Math.abs(anchorFrame - visual.frame) <= AUDIO_SYNC_WINDOW_FRAMES);
}

function framesNear(a: EditDecision, b: EditDecision, windowFrames: number): boolean {
  const aStart = a.frame;
  const aEnd = a.frame + Math.max(1, a.durationFrames ?? 1);
  const bStart = b.frame;
  const bEnd = b.frame + Math.max(1, b.durationFrames ?? 1);
  if (aStart < bEnd && bStart < aEnd) return true;
  return Math.min(Math.abs(aStart - bEnd), Math.abs(bStart - aEnd), Math.abs(aStart - bStart)) <= windowFrames;
}

function summarizeDecision(decision: EditDecision): CrossOverlayChoreographyDecisionSummary {
  return {
    type: decision.type,
    frame: decision.frame,
    durationFrames: Math.max(1, decision.durationFrames ?? 1),
    source: decision.source,
    family: familyForDecision(decision),
  };
}

function booleanParam(decision: EditDecision, aliases: string[]): boolean {
  for (const alias of aliases) {
    const direct = valueAtPath(decision.params, alias);
    if (typeof direct === 'boolean') return direct;
    const signal = valueAtPath(recordParam(decision.params.signals) ?? {}, alias);
    if (typeof signal === 'boolean') return signal;
  }
  return false;
}

function booleanAtPath(record: Record<string, unknown>, paths: string[]): boolean {
  for (const path of paths) {
    const value = valueAtPath(record, path);
    if (typeof value === 'boolean') return value;
  }
  return false;
}

function numberParam(decision: EditDecision, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const direct = valueAtPath(decision.params, alias);
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
    const signal = valueAtPath(recordParam(decision.params.signals) ?? {}, alias);
    if (typeof signal === 'number' && Number.isFinite(signal)) return signal;
  }
  return undefined;
}

function valueAtPath(record: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(record, path)) return record[path];
  if (!path.includes('.')) return undefined;
  let current: unknown = record;
  for (const part of path.split('.')) {
    const currentRecord = recordParam(current);
    if (!currentRecord || !Object.prototype.hasOwnProperty.call(currentRecord, part)) return undefined;
    current = currentRecord[part];
  }
  return current;
}

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundAuditNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
