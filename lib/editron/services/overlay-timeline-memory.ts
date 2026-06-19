import type { EditDecision } from './reactive-edit-engine';

export interface OverlayTimelineMemorySnapshot {
  version: 'overlay-timeline-memory-v1';
  frame: number;
  activeWindowFrames: number;
  recentWindowFrames: number;
  activeOverlayDensity: number;
  recentOverlayDensity: number;
  captionPressure: number;
  mgPressure: number;
  zoomPressure: number;
  transitionPressure: number;
  sfxPressure: number;
  recentZoomDensity: number;
  recentZoomSimilarity: number;
  timeSinceLastZoomSec: number | null;
  recentTransitionSimilarity: number;
  recentDirectionSimilarity: number;
  recentSfxDensity: number;
  calibrationStatus: 'invented-needs-calibration';
}

const FPS = 30;
const ACTIVE_WINDOW_FRAMES = 45;
const RECENT_WINDOW_FRAMES = 180;
const ACTIVE_OVERLAY_NORMALIZER = 4;
const FAMILY_PRESSURE_NORMALIZER = 2;
const RECENT_DENSITY_NORMALIZER = 3;

type OverlayFamily = 'caption' | 'mg' | 'zoom' | 'transition' | 'sfx' | 'other';

export function enrichDecisionsWithOverlayTimelineMemory(
  decisions: EditDecision[],
  contextDecisions: EditDecision[] = [],
): EditDecision[] {
  if (decisions.length === 0) return [];
  const timeline = [...contextDecisions].sort((a, b) => a.frame - b.frame);
  return decisions.map((decision) => attachOverlayTimelineMemory(decision, computeOverlayTimelineMemory(decision, timeline)));
}

export function computeOverlayTimelineMemory(
  target: EditDecision,
  timeline: EditDecision[],
): OverlayTimelineMemorySnapshot {
  const nearby = timeline.filter((decision) => decision !== target && isNear(target.frame, decision, ACTIVE_WINDOW_FRAMES));
  const recent = timeline.filter((decision) => decision !== target && decision.frame < target.frame && target.frame - decision.frame <= RECENT_WINDOW_FRAMES);

  const activeByFamily = countFamilies(nearby);
  const recentByFamily = countFamilies(recent);
  const previousZoom = findPreviousFamily(target.frame, timeline, 'zoom');
  const previousTransition = findPreviousFamily(target.frame, timeline, 'transition');

  return {
    version: 'overlay-timeline-memory-v1',
    frame: target.frame,
    activeWindowFrames: ACTIVE_WINDOW_FRAMES,
    recentWindowFrames: RECENT_WINDOW_FRAMES,
    activeOverlayDensity: normalizedCount(nearby.length, ACTIVE_OVERLAY_NORMALIZER),
    recentOverlayDensity: normalizedCount(recent.length, RECENT_DENSITY_NORMALIZER),
    captionPressure: normalizedCount(activeByFamily.caption, FAMILY_PRESSURE_NORMALIZER),
    mgPressure: normalizedCount(activeByFamily.mg, FAMILY_PRESSURE_NORMALIZER),
    zoomPressure: normalizedCount(activeByFamily.zoom, FAMILY_PRESSURE_NORMALIZER),
    transitionPressure: normalizedCount(activeByFamily.transition, FAMILY_PRESSURE_NORMALIZER),
    sfxPressure: normalizedCount(activeByFamily.sfx, FAMILY_PRESSURE_NORMALIZER),
    recentZoomDensity: normalizedCount(recentByFamily.zoom, RECENT_DENSITY_NORMALIZER),
    recentZoomSimilarity: previousZoom ? familySimilarity(target, previousZoom) : 0,
    timeSinceLastZoomSec: previousZoom ? roundAuditNumber((target.frame - previousZoom.frame) / FPS) : null,
    recentTransitionSimilarity: previousTransition ? familySimilarity(target, previousTransition) : 0,
    recentDirectionSimilarity: previousTransition ? directionSimilarity(target, previousTransition) : 0,
    recentSfxDensity: normalizedCount(recentByFamily.sfx, RECENT_DENSITY_NORMALIZER),
    calibrationStatus: 'invented-needs-calibration',
  };
}

function attachOverlayTimelineMemory(
  decision: EditDecision,
  memory: OverlayTimelineMemorySnapshot,
): EditDecision {
  const params = { ...decision.params };
  const signals = {
    ...(recordParam(params.signals) ?? {}),
  };

  setSignalAtom(params, signals, ['activeOverlayDensity', 'active_overlay_density', 'recent_overlay_density'], memory.activeOverlayDensity);
  setSignalAtom(params, signals, ['recentOverlayDensity', 'recent_overlay_density', 'overlay_density'], memory.recentOverlayDensity);
  setSignalAtom(params, signals, ['captionPressure', 'caption_pressure', 'active_caption_pressure'], memory.captionPressure);
  setSignalAtom(params, signals, ['mgPressure', 'mg_pressure', 'active_mg_pressure'], memory.mgPressure);
  setSignalAtom(params, signals, ['zoomPressure', 'zoom_pressure', 'active_zoom_pressure'], memory.zoomPressure);
  setSignalAtom(params, signals, ['transitionPressure', 'transition_pressure', 'active_transition_pressure'], memory.transitionPressure);
  setSignalAtom(params, signals, ['sfxPressure', 'sfx_pressure', 'active_sfx_pressure'], memory.sfxPressure);
  setSignalAtom(params, signals, ['recentZoomDensity', 'recent_zoom_density', 'zoom_density'], memory.recentZoomDensity);
  setSignalAtom(params, signals, ['recentZoomSimilarity', 'recent_zoom_similarity', 'zoom_repetition'], memory.recentZoomSimilarity);
  if (memory.timeSinceLastZoomSec !== null) {
    setSignalAtom(params, signals, ['timeSinceLastZoomSec', 'time_since_last_zoom', 'seconds_since_last_zoom'], memory.timeSinceLastZoomSec);
  }
  setSignalAtom(params, signals, ['recentTransitionSimilarity', 'recent_transition_similarity', 'transition_repetition'], memory.recentTransitionSimilarity);
  setSignalAtom(params, signals, ['recentDirectionSimilarity', 'recent_direction_similarity'], memory.recentDirectionSimilarity);
  setSignalAtom(params, signals, ['recentSfxDensity', 'recent_sfx_density', 'sfx_density'], memory.recentSfxDensity);

  return {
    ...decision,
    params: {
      ...params,
      signals,
      overlayTimelineMemory: {
        ...memory,
        ...(recordParam(params.overlayTimelineMemory) ?? {}),
      },
    },
  };
}

function setSignalAtom(
  params: Record<string, unknown>,
  signals: Record<string, unknown>,
  aliases: string[],
  value: number,
): void {
  if (!Number.isFinite(value)) return;
  if (value <= 0) return;
  if (aliases.some((alias) => primitiveAtPath(params, alias) !== undefined || primitiveAtPath(signals, alias) !== undefined)) return;
  const camel = aliases[0];
  const snake = aliases.find((alias) => alias.includes('_')) ?? camel;
  signals[camel] = value;
  signals[snake] = value;
}

function countFamilies(decisions: EditDecision[]): Record<OverlayFamily, number> {
  return decisions.reduce<Record<OverlayFamily, number>>((counts, decision) => {
    const family = overlayFamily(decision);
    counts[family]++;
    return counts;
  }, {
    caption: 0,
    mg: 0,
    zoom: 0,
    transition: 0,
    sfx: 0,
    other: 0,
  });
}

function findPreviousFamily(
  frame: number,
  timeline: EditDecision[],
  family: OverlayFamily,
): EditDecision | null {
  let previous: EditDecision | null = null;
  for (const decision of timeline) {
    if (decision.frame >= frame) continue;
    if (overlayFamily(decision) !== family) continue;
    if (!previous || decision.frame > previous.frame) previous = decision;
  }
  return previous;
}

function familySimilarity(target: EditDecision, previous: EditDecision): number {
  const frameDistance = Math.max(0, target.frame - previous.frame);
  const timeSimilarity = clamp01(1 - frameDistance / RECENT_WINDOW_FRAMES);
  const typeSimilarity = target.type === previous.type ? 0.35 : 0;
  const semanticSimilarity = normalizedStringParam(target) && normalizedStringParam(target) === normalizedStringParam(previous) ? 0.25 : 0;
  return roundAuditNumber(clamp01(timeSimilarity * 0.4 + typeSimilarity + semanticSimilarity));
}

function directionSimilarity(target: EditDecision, previous: EditDecision): number {
  const targetX = numberPrimitive(target, ['motionVectorX', 'motion_vector_x', 'visual_motion_x']);
  const previousX = numberPrimitive(previous, ['motionVectorX', 'motion_vector_x', 'visual_motion_x']);
  const targetY = numberPrimitive(target, ['motionVectorY', 'motion_vector_y', 'visual_motion_y']);
  const previousY = numberPrimitive(previous, ['motionVectorY', 'motion_vector_y', 'visual_motion_y']);
  if (targetX === undefined && targetY === undefined) return 0;
  if (previousX === undefined && previousY === undefined) return 0;

  const xSimilarity = axisDirectionSimilarity(targetX ?? 0, previousX ?? 0);
  const ySimilarity = axisDirectionSimilarity(targetY ?? 0, previousY ?? 0);
  return roundAuditNumber(Math.max(xSimilarity, ySimilarity));
}

function axisDirectionSimilarity(a: number, b: number): number {
  if (Math.abs(a) < 0.05 || Math.abs(b) < 0.05) return 0;
  return Math.sign(a) === Math.sign(b) ? Math.min(1, (Math.abs(a) + Math.abs(b)) / 2) : 0;
}

function isNear(frame: number, decision: EditDecision, windowFrames: number): boolean {
  const start = decision.frame;
  const end = decision.frame + Math.max(1, decision.durationFrames ?? 1);
  if (frame >= start && frame <= end) return true;
  return Math.min(Math.abs(frame - start), Math.abs(frame - end)) <= windowFrames;
}

function overlayFamily(decision: EditDecision): OverlayFamily {
  switch (decision.type) {
    case 'caption-emphasis':
      return 'caption';
    case 'graphic':
      return 'mg';
    case 'zoom':
    case 'pan':
    case 'camera-shake':
      return 'zoom';
    case 'transition':
    case 'fade':
      return 'transition';
    case 'sfx':
    case 'sfx-trigger':
      return 'sfx';
    default:
      return 'other';
  }
}

function normalizedStringParam(decision: EditDecision): string {
  const value = primitiveAtPath(decision.params, 'transitionType')
    ?? primitiveAtPath(decision.params, 'type')
    ?? primitiveAtPath(decision.params, 'sfxType')
    ?? primitiveAtPath(decision.params, 'semanticRole');
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function numberPrimitive(decision: EditDecision, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const value = primitiveAtPath(decision.params, alias);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const signalValue = primitiveAtPath(recordParam(decision.params.signals) ?? {}, alias);
    if (typeof signalValue === 'number' && Number.isFinite(signalValue)) return signalValue;
  }
  return undefined;
}

function primitiveAtPath(record: Record<string, unknown>, path: string): string | number | boolean | undefined {
  const value = valueAtPath(record, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
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

function normalizedCount(count: number, normalizer: number): number {
  return roundAuditNumber(clamp01(count / normalizer));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundAuditNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
