import type {
  AtomicMotionProperty,
  AtomicOverlayPlan,
  AtomicStructure,
} from './atomic-overlay-plan';

export interface AtomicOverlayInspection {
  overlayId: number | string;
  from: number;
  durationInFrames: number;
  recipeId: string;
  observeMode: boolean;
  elementCount: number;
  primitiveCounts: Record<string, number>;
  roles: string[];
  dataShapes: Array<NonNullable<AtomicStructure['dataShape']>>;
  motionProperties: AtomicMotionProperty[];
  intensity: AtomicOverlayPlan['intensity'];
}

export interface AtomicOverlayReport {
  totalOverlays: number;
  atomicOverlayCount: number;
  missingAtomicPlanCount: number;
  recipeCounts: Record<string, number>;
  primitiveCounts: Record<string, number>;
  dataShapeCounts: Record<string, number>;
  motionPropertyCounts: Record<string, number>;
  averageIntensity: AtomicOverlayPlan['intensity'];
  maxOverallIntensity: number;
  overlays: AtomicOverlayInspection[];
}

interface OverlayLike {
  id?: number | string;
  type?: string;
  from?: number;
  durationInFrames?: number;
  metadata?: {
    atomicOverlayPlan?: unknown;
    atomicPlanObserveMode?: unknown;
  };
}

const EMPTY_INTENSITY: AtomicOverlayPlan['intensity'] = {
  motion: 0,
  scale: 0,
  opacity: 0,
  blur: 0,
  typography: 0,
  structure: 0,
  signal: 0,
  overlayScore: 0,
  overall: 0,
};

export function getAtomicOverlayPlan(overlay: unknown): AtomicOverlayPlan | null {
  const plan = asOverlayLike(overlay)?.metadata?.atomicOverlayPlan;
  return isAtomicOverlayPlan(plan) ? plan : null;
}

export function listAtomicOverlayPlans(overlays: unknown[]): AtomicOverlayInspection[] {
  return overlays
    .map((overlay) => inspectAtomicOverlay(overlay))
    .filter((inspection): inspection is AtomicOverlayInspection => inspection !== null)
    .sort((a, b) => a.from - b.from || String(a.overlayId).localeCompare(String(b.overlayId)));
}

export function summarizeAtomicOverlayPlans(overlays: unknown[]): AtomicOverlayReport {
  const inspections = listAtomicOverlayPlans(overlays);
  const motionGraphicCount = overlays.filter((overlay) => asOverlayLike(overlay)?.type === 'motion-graphic').length;

  const report: AtomicOverlayReport = {
    totalOverlays: overlays.length,
    atomicOverlayCount: inspections.length,
    missingAtomicPlanCount: Math.max(0, motionGraphicCount - inspections.length),
    recipeCounts: {},
    primitiveCounts: {},
    dataShapeCounts: {},
    motionPropertyCounts: {},
    averageIntensity: { ...EMPTY_INTENSITY },
    maxOverallIntensity: 0,
    overlays: inspections,
  };

  for (const inspection of inspections) {
    increment(report.recipeCounts, inspection.recipeId);
    mergeCounts(report.primitiveCounts, inspection.primitiveCounts);
    for (const dataShape of inspection.dataShapes) increment(report.dataShapeCounts, dataShape);
    for (const property of inspection.motionProperties) increment(report.motionPropertyCounts, property);
    report.maxOverallIntensity = Math.max(report.maxOverallIntensity, inspection.intensity.overall);
    addIntensity(report.averageIntensity, inspection.intensity);
  }

  if (inspections.length > 0) {
    divideIntensity(report.averageIntensity, inspections.length);
  }

  return report;
}

export function formatAtomicOverlayReport(report: AtomicOverlayReport): string {
  if (report.atomicOverlayCount === 0) {
    return `Atomic overlays: 0/${report.totalOverlays} overlays inspected.`;
  }

  const recipes = formatCounts(report.recipeCounts);
  const primitives = formatCounts(report.primitiveCounts);
  const dataShapes = formatCounts(report.dataShapeCounts);
  const motion = formatCounts(report.motionPropertyCounts);

  return [
    `Atomic overlays: ${report.atomicOverlayCount}/${report.totalOverlays} inspected (${report.missingAtomicPlanCount} motion graphics missing plans).`,
    `Recipes: ${recipes || 'none'}.`,
    `Primitives: ${primitives || 'none'}.`,
    `Data shapes: ${dataShapes || 'none'}.`,
    `Motion properties: ${motion || 'none'}.`,
    `Avg intensity: ${report.averageIntensity.overall.toFixed(2)} overall, ${report.averageIntensity.signal.toFixed(2)} signal.`,
    `Max intensity: ${report.maxOverallIntensity.toFixed(2)}.`,
  ].join('\n');
}

function inspectAtomicOverlay(overlay: unknown): AtomicOverlayInspection | null {
  const overlayLike = asOverlayLike(overlay);
  if (!overlayLike) return null;

  const plan = getAtomicOverlayPlan(overlayLike);
  if (!plan) return null;

  const primitiveCounts: Record<string, number> = {};
  const dataShapeSet = new Set<NonNullable<AtomicStructure['dataShape']>>();
  const motionPropertySet = new Set<AtomicMotionProperty>();
  const roleSet = new Set<string>();

  for (const element of plan.elements) {
    increment(primitiveCounts, element.primitive);
    roleSet.add(element.role);
    if (element.structure.dataShape) dataShapeSet.add(element.structure.dataShape);
    for (const track of element.motion.tracks) {
      motionPropertySet.add(track.property);
    }
  }

  return {
    overlayId: overlayLike.id ?? 'unknown',
    from: numberOrZero(overlayLike.from),
    durationInFrames: numberOrZero(overlayLike.durationInFrames),
    recipeId: plan.recipeId,
    observeMode: overlayLike.metadata?.atomicPlanObserveMode === true,
    elementCount: plan.elements.length,
    primitiveCounts,
    roles: Array.from(roleSet).sort(),
    dataShapes: Array.from(dataShapeSet).sort(),
    motionProperties: Array.from(motionPropertySet).sort(),
    intensity: plan.intensity,
  };
}

function isAtomicOverlayPlan(value: unknown): value is AtomicOverlayPlan {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AtomicOverlayPlan>;
  return typeof candidate.recipeId === 'string'
    && !!candidate.layout
    && !!candidate.exitStyle
    && Array.isArray(candidate.elements)
    && !!candidate.intensity
    && typeof candidate.intensity.overall === 'number';
}

function asOverlayLike(value: unknown): OverlayLike | null {
  return value && typeof value === 'object' ? value as OverlayLike : null;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function addIntensity(
  target: AtomicOverlayPlan['intensity'],
  source: AtomicOverlayPlan['intensity'],
): void {
  for (const key of Object.keys(target) as Array<keyof AtomicOverlayPlan['intensity']>) {
    target[key] += source[key];
  }
}

function divideIntensity(intensity: AtomicOverlayPlan['intensity'], divisor: number): void {
  for (const key of Object.keys(intensity) as Array<keyof AtomicOverlayPlan['intensity']>) {
    intensity[key] /= divisor;
  }
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(', ');
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && isFinite(value) ? value : 0;
}
