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

export type CrossOverlayChoreographyLane =
  | 'text'
  | 'motion'
  | 'audio'
  | 'timeline'
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

export interface CrossOverlayChoreographyShape {
  decision: EditDecision;
  reason: string;
  family: CrossOverlayChoreographyFamily;
  originalFrame: number;
  frame: number;
  shiftFrames: number;
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
  laneLoad: Record<CrossOverlayChoreographyLane, number>;
  syncGroups: CrossOverlayChoreographySyncGroup[];
  shapedDecisionCount: number;
  suppressed: Array<Omit<CrossOverlayChoreographySuppression, 'decision'>>;
  shaped: Array<Omit<CrossOverlayChoreographyShape, 'decision'>>;
  suppressedByReason: Record<string, number>;
  shapedByReason: Record<string, number>;
  suppressedByFamily: Partial<Record<CrossOverlayChoreographyFamily, number>>;
  shapedByFamily: Partial<Record<CrossOverlayChoreographyFamily, number>>;
}

export interface CrossOverlayChoreographySyncGroup {
  id: string;
  lane: CrossOverlayChoreographyLane;
  lanes: CrossOverlayChoreographyLane[];
  frame: number;
  families: CrossOverlayChoreographyFamily[];
  decisionTypes: EditDecision['type'][];
  count: number;
}

export interface CrossOverlayChoreographyResult {
  decisions: EditDecision[];
  suppressed: CrossOverlayChoreographySuppression[];
  shaped: CrossOverlayChoreographyShape[];
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
  const shaped: CrossOverlayChoreographyShape[] = [];

  for (const decision of ordered) {
    const conflict = findChoreographyConflict(decision, kept);
    if (conflict) {
      const shapedDecision = shapeDecisionAwayFromConflict(decision, conflict, kept);
      if (shapedDecision) {
        kept.push(shapedDecision.decision);
        shaped.push(shapedDecision);
        continue;
      }
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

  const annotated = kept
    .sort((a, b) => a.frame - b.frame || a.priority - b.priority)
    .map((decision) => annotateKeptDecision(decision, kept, suppressed));

  return buildResult(annotated, suppressed, shaped);
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

    if (isTextMotionPair(family, existingFamily) && framesNear(candidate, existing, MOTION_SYNC_WINDOW_FRAMES)) {
      if (!isTextMotionCoordinationAllowed(candidate, existing)) {
        return { reason: 'text-motion-stack', conflictingWith: existing };
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

function shapeDecisionAwayFromConflict(
  candidate: EditDecision,
  conflict: { reason: string; conflictingWith: EditDecision },
  kept: EditDecision[],
): CrossOverlayChoreographyShape | null {
  const family = familyForDecision(candidate);
  const maxShiftFrames = maxChoreographyShapeShiftFrames(candidate, conflict.reason);
  if (maxShiftFrames <= 0) return null;

  for (const frame of choreographyShapeTargetFrames(candidate, conflict, maxShiftFrames)) {
    if (frame === candidate.frame) continue;
    const shiftFrames = frame - candidate.frame;
    const shapeAudit = {
      version: 'cross-overlay-choreography-shape-v1',
      reason: conflict.reason,
      family,
      originalFrame: candidate.frame,
      frame,
      shiftFrames,
      conflictingWith: summarizeDecision(conflict.conflictingWith),
      calibrationStatus: 'invented-needs-calibration' as const,
    };
    const shapedDecision: EditDecision = {
      ...candidate,
      frame,
      params: {
        ...(candidate.params ?? {}),
        crossOverlayChoreographyShape: shapeAudit,
      },
    };
    if (!findChoreographyConflict(shapedDecision, kept)) {
      return {
        decision: shapedDecision,
        reason: conflict.reason,
        family,
        originalFrame: candidate.frame,
        frame,
        shiftFrames,
        conflictingWith: summarizeDecision(conflict.conflictingWith),
        calibrationStatus: 'invented-needs-calibration',
      };
    }
  }

  return null;
}

function annotateKeptDecision(
  decision: EditDecision,
  kept: EditDecision[],
  suppressed: CrossOverlayChoreographySuppression[],
): EditDecision {
  const nearbyKept = kept.filter((candidate) => candidate !== decision && framesNear(decision, candidate, ACTIVE_WINDOW_FRAMES));
  const nearbySuppressed = suppressed.filter((item) => framesNear(decision, item.decision, ACTIVE_WINDOW_FRAMES));
  const activeFamilies = [...new Set(nearbyKept.map(familyForDecision))].sort();
  const family = familyForDecision(decision);
  const lane = laneForFamily(family);
  const linkedDecisions = nearbyKept.filter((candidate) => decisionsCoordinate(decision, candidate));
  const linkedFamilies = [...new Set(linkedDecisions.map(familyForDecision))].sort();
  const syncFrame = linkedDecisions.length ? resolveChoreographySyncFrame(decision, linkedDecisions) : null;
  const syncGroupId = syncFrame !== null ? `sync:${Math.round(syncFrame)}` : null;
  const params = { ...(decision.params ?? {}) };
  const merge = recordParam(params.unifiedDecisionMerge) ?? {};
  const shape = choreographyShapeAudit(params.crossOverlayChoreographyShape);
  return {
    ...decision,
    params: {
      ...params,
      crossOverlayChoreography: {
        version: 'cross-overlay-choreography-v1',
        family,
        lane,
        syncGroupId,
        decisionStrength: roundAuditNumber(decisionStrength(decision)),
        activeFamilies,
        linkedFamilies,
        activeNeighborCount: activeFamilies.length,
        nearbyDecisionCount: nearbyKept.length,
        linkedDecisionCount: linkedDecisions.length,
        suppressedNearbyCount: nearbySuppressed.length,
        shaped: shape,
        calibrationStatus: 'invented-needs-calibration',
      },
      unifiedDecisionMerge: {
        ...merge,
        crossOverlayChoreography: {
          version: 'cross-overlay-choreography-v1',
          role: shape ? 'shaped' : 'kept',
          lane,
          syncGroupId,
          activeFamilies,
          linkedFamilies,
          suppressedNearbyCount: nearbySuppressed.length,
          shaped: shape,
        },
      },
    },
  };
}

function buildResult(
  decisions: EditDecision[],
  suppressed: CrossOverlayChoreographySuppression[],
  shaped: CrossOverlayChoreographyShape[] = [],
): CrossOverlayChoreographyResult {
  return {
    decisions,
    suppressed,
    shaped,
    report: {
      version: 'cross-overlay-choreography-v1',
      inputDecisionCount: decisions.length + suppressed.length,
      outputDecisionCount: decisions.length,
      suppressedDecisionCount: suppressed.length,
      shapedDecisionCount: shaped.length,
      annotatedDecisionCount: decisions.length,
      calibrationStatus: 'invented-needs-calibration',
      laneLoad: buildLaneLoad(decisions),
      syncGroups: buildSyncGroups(decisions),
      suppressed: suppressed.map(({ decision: _decision, ...rest }) => rest),
      shaped: shaped.map(({ decision: _decision, ...rest }) => rest),
      suppressedByReason: countSuppressedByReason(suppressed),
      shapedByReason: countShapedByReason(shaped),
      suppressedByFamily: countSuppressedByFamily(suppressed),
      shapedByFamily: countShapedByFamily(shaped),
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

function isTextMotionPair(a: CrossOverlayChoreographyFamily, b: CrossOverlayChoreographyFamily): boolean {
  return (isTextLaneFamily(a) && isMotionFamily(b)) || (isMotionFamily(a) && isTextLaneFamily(b));
}

function isVisualFamily(family: CrossOverlayChoreographyFamily): boolean {
  return family === 'caption' || family === 'mg' || family === 'camera' || family === 'transition';
}

function laneForFamily(family: CrossOverlayChoreographyFamily): CrossOverlayChoreographyLane {
  if (isTextLaneFamily(family)) return 'text';
  if (isMotionFamily(family)) return 'motion';
  if (family === 'audio') return 'audio';
  if (family === 'timing' || family === 'pacing') return 'timeline';
  return 'other';
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

function isTextMotionCoordinationAllowed(a: EditDecision, b: EditDecision): boolean {
  const text = isTextLaneFamily(familyForDecision(a)) ? a : b;
  const motion = text === a ? b : a;
  const textFamily = familyForDecision(text);
  const motionFamily = familyForDecision(motion);

  if (textFamily === 'mg') {
    if (motionFamily === 'camera' && booleanParam(text, [
      'coordinateWithZoom',
      'coordinate_with_zoom',
      'mgExpressionAuthority.visualIntent.choreography.coordinateWithZoom',
    ])) return true;
    if (motionFamily === 'transition' && booleanParam(text, [
      'coordinateWithTransition',
      'coordinate_with_transition',
      'mgExpressionAuthority.visualIntent.choreography.coordinateWithTransition',
    ])) return true;
  }

  if (textFamily === 'caption') {
    if (motionFamily === 'camera' && lowRisk(text, ['captionMomentPlan.crossFamily.zoomConflictRisk'])) return true;
    if (motionFamily === 'transition' && lowRisk(text, ['captionMomentPlan.crossFamily.transitionConflictRisk'])) return true;
  }

  if (textFamily === 'mg' && lowRisk(motion, [
    'transitionBoundaryPlan.crossFamily.mgConflictRisk',
    'zoomMotionPlan.crossFamily.mgConflictRisk',
  ])) return true;
  if (textFamily === 'caption' && lowRisk(motion, [
    'transitionBoundaryPlan.crossFamily.captionConflictRisk',
    'zoomMotionPlan.crossFamily.captionConflictRisk',
  ])) return true;

  return hasSharedChoreographySync(text, motion);
}

function isAudioLinkedToVisualBeat(audio: EditDecision, visual: EditDecision): boolean {
  const anchorFrame = numberParam(audio, ['beatFrame', 'anchorFrame', 'boundaryFrame']);
  return booleanAtPath(audio.params, ['sfxSyncPlan.crossFamily.linkedOverlay'])
    || booleanParam(audio, ['linkedOverlay', 'linked_overlay'])
    || (anchorFrame !== undefined && Math.abs(anchorFrame - visual.frame) <= AUDIO_SYNC_WINDOW_FRAMES);
}

function decisionsCoordinate(a: EditDecision, b: EditDecision): boolean {
  const aFamily = familyForDecision(a);
  const bFamily = familyForDecision(b);
  if (isTextLaneFamily(aFamily) && isTextLaneFamily(bFamily)) {
    return isCaptionMgCoordinationAllowed(a, b);
  }
  if (isMotionFamily(aFamily) && isMotionFamily(bFamily)) {
    return isTransitionZoomBridgeAllowed(a, b);
  }
  if (isTextMotionPair(aFamily, bFamily)) {
    return isTextMotionCoordinationAllowed(a, b);
  }
  if (aFamily === 'audio' && isVisualFamily(bFamily)) {
    return isAudioLinkedToVisualBeat(a, b);
  }
  if (bFamily === 'audio' && isVisualFamily(aFamily)) {
    return isAudioLinkedToVisualBeat(b, a);
  }
  return false;
}

function resolveDecisionSyncFrame(decision: EditDecision): number | null {
  return numberParam(decision, ['beatFrame', 'anchorFrame', 'boundaryFrame'])
    ?? numberParam(decision, ['transitionFrame', 'syncFrame', 'sfxSyncFrame'])
    ?? decision.frame;
}

function resolveChoreographySyncFrame(decision: EditDecision, linkedDecisions: EditDecision[]): number {
  const frames = [decision, ...linkedDecisions]
    .map(resolveDecisionSyncFrame)
    .filter((frame): frame is number => typeof frame === 'number' && Number.isFinite(frame));
  if (!frames.length) return decision.frame;
  return Math.min(...frames);
}

function buildLaneLoad(decisions: EditDecision[]): Record<CrossOverlayChoreographyLane, number> {
  const load: Record<CrossOverlayChoreographyLane, number> = {
    text: 0,
    motion: 0,
    audio: 0,
    timeline: 0,
    other: 0,
  };
  for (const decision of decisions) {
    load[laneForFamily(familyForDecision(decision))] += 1;
  }
  return load;
}

function buildSyncGroups(decisions: EditDecision[]): CrossOverlayChoreographySyncGroup[] {
  const groups = new Map<string, { lane: CrossOverlayChoreographyLane; frame: number; decisions: EditDecision[] }>();
  for (const decision of decisions) {
    const choreography = recordParam(decision.params.crossOverlayChoreography);
    const id = typeof choreography?.syncGroupId === 'string' ? choreography.syncGroupId : null;
    if (!id) continue;
    const lane = laneForFamily(familyForDecision(decision));
    const frame = resolveDecisionSyncFrame(decision) ?? decision.frame;
    const group = groups.get(id) ?? { lane, frame, decisions: [] };
    group.decisions.push(decision);
    groups.set(id, group);
  }
  return [...groups.entries()]
    .map(([id, group]) => ({
      id,
      lane: group.lane,
      lanes: [...new Set(group.decisions.map((decision) => laneForFamily(familyForDecision(decision))))].sort(),
      frame: group.frame,
      families: [...new Set(group.decisions.map(familyForDecision))].sort(),
      decisionTypes: [...new Set(group.decisions.map((decision) => decision.type))].sort(),
      count: group.decisions.length,
    }))
    .sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
}

function countSuppressedByReason(suppressed: CrossOverlayChoreographySuppression[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of suppressed) {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  }
  return counts;
}

function countShapedByReason(shaped: CrossOverlayChoreographyShape[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of shaped) {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  }
  return counts;
}

function countShapedByFamily(
  shaped: CrossOverlayChoreographyShape[],
): Partial<Record<CrossOverlayChoreographyFamily, number>> {
  const counts: Partial<Record<CrossOverlayChoreographyFamily, number>> = {};
  for (const item of shaped) {
    counts[item.family] = (counts[item.family] ?? 0) + 1;
  }
  return counts;
}

function countSuppressedByFamily(
  suppressed: CrossOverlayChoreographySuppression[],
): Partial<Record<CrossOverlayChoreographyFamily, number>> {
  const counts: Partial<Record<CrossOverlayChoreographyFamily, number>> = {};
  for (const item of suppressed) {
    counts[item.family] = (counts[item.family] ?? 0) + 1;
  }
  return counts;
}

function framesNear(a: EditDecision, b: EditDecision, windowFrames: number): boolean {
  const aStart = a.frame;
  const aEnd = a.frame + Math.max(1, a.durationFrames ?? 1);
  const bStart = b.frame;
  const bEnd = b.frame + Math.max(1, b.durationFrames ?? 1);
  if (aStart < bEnd && bStart < aEnd) return true;
  return Math.min(Math.abs(aStart - bEnd), Math.abs(bStart - aEnd), Math.abs(aStart - bStart)) <= windowFrames;
}

function maxChoreographyShapeShiftFrames(decision: EditDecision, reason: string): number {
  const explicit = numberParam(decision, ['maxChoreographyShiftFrames', 'choreographyShiftToleranceFrames']);
  if (explicit !== undefined) return Math.max(0, Math.min(90, Math.round(explicit)));

  const family = familyForDecision(decision);
  if (!isTextLaneFamily(family)) return 0;
  if (reason === 'text-lane-stack') return family === 'caption' ? 20 : 45;
  if (reason === 'text-motion-stack') return family === 'caption' ? 12 : 24;
  return 0;
}

function choreographyShapeTargetFrames(
  candidate: EditDecision,
  conflict: { reason: string; conflictingWith: EditDecision },
  maxShiftFrames: number,
): number[] {
  const windowFrames = conflictWindowFrames(conflict.reason);
  const anchorFrame = conflict.conflictingWith.frame;
  const targets = [anchorFrame + windowFrames + 1, anchorFrame - windowFrames - 1]
    .map((frame) => Math.round(frame))
    .filter((frame) => Math.abs(frame - candidate.frame) <= maxShiftFrames);
  return [...new Set(targets)].sort((a, b) => Math.abs(a - candidate.frame) - Math.abs(b - candidate.frame));
}

function conflictWindowFrames(reason: string): number {
  switch (reason) {
    case 'text-lane-stack':
      return TEXT_LANE_WINDOW_FRAMES;
    case 'motion-lane-stack':
    case 'text-motion-stack':
      return MOTION_SYNC_WINDOW_FRAMES;
    case 'unlinked-audio-on-crowded-moment':
      return AUDIO_SYNC_WINDOW_FRAMES;
    default:
      return ACTIVE_WINDOW_FRAMES;
  }
}

function choreographyShapeAudit(value: unknown): Record<string, unknown> | null {
  const record = recordParam(value);
  if (!record) return null;
  return {
    version: 'cross-overlay-choreography-shape-v1',
    reason: typeof record.reason === 'string' ? record.reason : 'unknown',
    originalFrame: typeof record.originalFrame === 'number' ? record.originalFrame : null,
    frame: typeof record.frame === 'number' ? record.frame : null,
    shiftFrames: typeof record.shiftFrames === 'number' ? record.shiftFrames : null,
    conflictingWith: recordParam(record.conflictingWith) ?? null,
    calibrationStatus: 'invented-needs-calibration',
  };
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

function lowRisk(decision: EditDecision, paths: string[], maxRisk = 0.35): boolean {
  for (const path of paths) {
    const value = valueAtPath(decision.params, path);
    if (typeof value === 'number' && Number.isFinite(value) && value < maxRisk) return true;
  }
  return false;
}

function hasSharedChoreographySync(a: EditDecision, b: EditDecision): boolean {
  const aSync = resolveDecisionSyncFrame(a);
  const bSync = resolveDecisionSyncFrame(b);
  if (aSync === null || bSync === null) return false;
  return Math.abs(aSync - bSync) <= AUDIO_SYNC_WINDOW_FRAMES && (
    booleanParam(a, ['linkedOverlay', 'linked_overlay', 'coordinateWithMotion', 'coordinate_with_motion'])
    || booleanParam(b, ['linkedOverlay', 'linked_overlay', 'coordinateWithMotion', 'coordinate_with_motion'])
  );
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
