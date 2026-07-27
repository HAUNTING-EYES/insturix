import {
  buildAtomicPlacementHints,
  deriveAtomicVisualContext,
  type AtomicPlacementBox,
  type AtomicPlacementHints,
  type AtomicPlacementRegion,
} from '@/lib/editron/engine/atomic-overlay-core';
import { momentBundleToSignalMap, type AtomicMomentBundle } from './moment-bundle';

export interface AtomicPlacementAdjustment {
  candidateRegion?: AtomicPlacementRegion;
  multiplier: number;
  penalty: number;
  bonus: number;
  avoidHits: string[];
  preferHits: string[];
  constraints: string[];
}

export interface AtomicPlacementResolution {
  version: 'atomic-placement-v1';
  requestedRegion?: AtomicPlacementRegion;
  candidateRegion?: AtomicPlacementRegion;
  changedRegion: boolean;
  reason:
    | 'requested-safe'
    | 'requested-conflicted'
    | 'negative-space'
    | 'restrained-negative-space'
    | 'no-region';
  density: AtomicPlacementHints['density'];
  legibilityRisk: number;
  screenBusyness: number;
  placementHints: AtomicPlacementHints;
  placementAdjustment: AtomicPlacementAdjustment;
}

export function resolveAtomicPlacement(input: {
  momentBundle?: AtomicMomentBundle;
  signals?: Record<string, unknown>;
  requestedRegion?: string;
  family?: 'graphic' | 'caption' | 'text' | 'motion-graphic';
  protectedRegions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    reason?: string;
    strength?: number;
  }>;
}): AtomicPlacementResolution {
  const signals = input.momentBundle
    ? { ...momentBundleToSignalMap(input.momentBundle), ...(input.signals ?? {}) }
    : input.signals ?? {};
  const sourcePlacementHints = buildAtomicPlacementHints(deriveAtomicVisualContext(signals));
  const protectedAvoid = normalizeProtectedRegions(input.protectedRegions);
  const placementHints: AtomicPlacementHints = protectedAvoid.length > 0
    ? {
      ...sourcePlacementHints,
      avoid: [...protectedAvoid, ...sourcePlacementHints.avoid].sort((a, b) => b.strength - a.strength),
      constraints: [...new Set([...sourcePlacementHints.constraints, 'protect-caption-reservation'])],
    }
    : sourcePlacementHints;
  const requestedRegion = normalizeAtomicPlacementRegion(input.requestedRegion);
  const preferredRegion = strongestPreferredRegion(placementHints);
  const requestedAvoidHits = requestedRegion
    ? placementHints.avoid.filter((box) => regionConflictsWithBox(requestedRegion, box))
    : [];
  const requestedPreferHits = requestedRegion
    ? placementHints.prefer.filter((box) => regionConflictsWithBox(requestedRegion, box, 0.08))
    : [];

  let candidateRegion = requestedRegion ?? preferredRegion;
  let reason: AtomicPlacementResolution['reason'] = requestedRegion ? 'requested-safe' : preferredRegion ? 'negative-space' : 'no-region';

  if (requestedRegion && requestedAvoidHits.length > 0 && preferredRegion && !preferredConflictsWithAvoid(preferredRegion, requestedAvoidHits)) {
    candidateRegion = preferredRegion;
    reason = 'requested-conflicted';
  } else if (
    requestedRegion
    && requestedPreferHits.length === 0
    && preferredRegion
    && placementHints.density === 'restrained'
  ) {
    candidateRegion = preferredRegion;
    reason = 'restrained-negative-space';
  }

  const avoidHits = candidateRegion
    ? placementHints.avoid.filter((box) => regionConflictsWithBox(candidateRegion, box))
    : [];
  const preferHits = candidateRegion
    ? placementHints.prefer.filter((box) => regionConflictsWithBox(candidateRegion, box, 0.08))
    : [];
  const avoidStrength = Math.max(0, ...avoidHits.map((box) => box.strength));
  const preferStrength = Math.max(0, ...preferHits.map((box) => box.strength));
  const densityPenalty = input.family === 'caption' ? 0 : placementHints.density === 'restrained' ? 0.08 : 0;
  const textPenalty = input.family === 'caption' && placementHints.constraints.includes('protect-existing-text') ? 0.14 : 0;
  const penalty = clamp01(avoidStrength * 0.55 + densityPenalty + textPenalty);
  const bonus = clamp01(preferStrength * 0.25);

  return {
    version: 'atomic-placement-v1',
    requestedRegion,
    candidateRegion,
    changedRegion: Boolean(requestedRegion && candidateRegion && requestedRegion !== candidateRegion),
    reason,
    density: placementHints.density,
    legibilityRisk: placementHints.legibilityRisk,
    screenBusyness: placementHints.screenBusyness,
    placementHints,
    placementAdjustment: {
      candidateRegion,
      multiplier: clampRange(1 + bonus - penalty, 0.25, 1.25),
      penalty,
      bonus,
      avoidHits: avoidHits.map((box) => box.reason),
      preferHits: preferHits.map((box) => box.reason),
      constraints: placementHints.constraints,
    },
  };
}

function normalizeProtectedRegions(
  regions: Parameters<typeof resolveAtomicPlacement>[0]['protectedRegions'],
): AtomicPlacementBox[] {
  if (!Array.isArray(regions)) return [];
  return regions.flatMap((region): AtomicPlacementBox[] => {
    if (![region.x, region.y, region.width, region.height].every(Number.isFinite)) return [];
    const x = clamp01(region.x);
    const y = clamp01(region.y);
    const width = Math.min(clamp01(region.width), 1 - x);
    const height = Math.min(clamp01(region.height), 1 - y);
    if (width <= 0 || height <= 0) return [];
    return [{
      kind: 'avoid',
      reason: 'text-occupancy',
      region: regionForRect({ x, y, width, height }),
      x,
      y,
      width,
      height,
      strength: clamp01(region.strength ?? 1),
      source: 'layout-analysis',
    }];
  });
}

function regionForRect(rect: { x: number; y: number; width: number; height: number }): AtomicPlacementRegion {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const vertical = centerY < 1 / 3 ? 'top' : centerY > 2 / 3 ? 'bottom' : 'middle';
  const horizontal = centerX < 1 / 3 ? 'left' : centerX > 2 / 3 ? 'right' : 'center';
  return `${vertical}-${horizontal}` as AtomicPlacementRegion;
}

export function normalizeAtomicPlacementRegion(value: unknown): AtomicPlacementRegion | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase().trim().replace(/_/g, '-');
  const aliases: Record<string, AtomicPlacementRegion> = {
    center: 'middle-center',
    middle: 'middle-center',
    'center-center': 'middle-center',
    left: 'middle-left',
    right: 'middle-right',
    top: 'top-center',
    bottom: 'bottom-center',
    'lower-third': 'bottom-center',
    'upper-third': 'top-center',
    'right-third': 'middle-right',
    'left-third': 'middle-left',
    fullscreen: 'full-frame',
  };
  const candidate = aliases[normalized] ?? normalized;
  return isPlacementRegion(candidate) ? candidate : undefined;
}

function strongestPreferredRegion(placementHints: AtomicPlacementHints): AtomicPlacementRegion | undefined {
  return placementHints.prefer[0]?.region;
}

function preferredConflictsWithAvoid(
  preferredRegion: AtomicPlacementRegion,
  avoidHits: AtomicPlacementHints['avoid'],
): boolean {
  return avoidHits.some((box) => regionConflictsWithBox(preferredRegion, box));
}

function regionConflictsWithBox(
  candidate: AtomicPlacementRegion,
  box: Pick<AtomicPlacementHints['avoid'][number], 'region' | 'x' | 'y' | 'width' | 'height'>,
  overlapThreshold = 0.18,
): boolean {
  if (candidate === 'full-frame' || box.region === 'full-frame') return true;
  const candidateRect = regionRect(candidate);
  const boxRect = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
  const overlap = intersectionArea(candidateRect, boxRect);
  if (overlap <= 0) return false;
  const candidateArea = Math.max(0.0001, candidateRect.width * candidateRect.height);
  const boxArea = Math.max(0.0001, boxRect.width * boxRect.height);
  const overlapPressure = Math.max(overlap / candidateArea, overlap / boxArea);
  return overlapPressure >= overlapThreshold;
}

function regionRect(region: AtomicPlacementRegion): { x: number; y: number; width: number; height: number } {
  if (region === 'full-frame') return { x: 0, y: 0, width: 1, height: 1 };
  const [vertical, horizontal] = region.split('-');
  const x = horizontal === 'left' ? 0.06 : horizontal === 'right' ? 0.66 : 0.28;
  const width = horizontal === 'center' ? 0.44 : 0.28;
  const y = vertical === 'top' ? 0.06 : vertical === 'bottom' ? 0.68 : 0.28;
  const height = vertical === 'middle' ? 0.44 : 0.26;
  return { x, y, width, height };
}

function intersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function isPlacementRegion(value: string): value is AtomicPlacementRegion {
  return [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'middle-center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
    'full-frame',
  ].includes(value);
}

function clamp01(value: number): number {
  return clampRange(value, 0, 1);
}

function clampRange(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
