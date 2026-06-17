export interface VjepaCoverageSegment {
  startMs: number;
  endMs: number;
  visualSignificance?: number;
  motionIntensity?: number;
  actionType?: string;
  motionType?: string;
  faceEmotion?: string | null;
  eyeContact?: boolean | null;
  motionVectorX?: number;
  motionVectorY?: number;
  motion_vector_x?: number;
  motion_vector_y?: number;
  mainSubject?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  } | null;
  mainSubjectX?: number;
  mainSubjectY?: number;
  mainSubjectWidth?: number;
  mainSubjectHeight?: number;
  main_subject_x?: number;
  main_subject_y?: number;
  main_subject_width?: number;
  main_subject_height?: number;
  textBoxes?: unknown[];
  text_boxes?: unknown[];
  textBoxCount?: number;
  text_box_count?: number;
  textCoverage?: number;
  text_coverage?: number;
  negativeSpaceTop?: number;
  negativeSpaceRight?: number;
  negativeSpaceBottom?: number;
  negativeSpaceLeft?: number;
  negative_space_top?: number;
  negative_space_right?: number;
  negative_space_bottom?: number;
  negative_space_left?: number;
  objectCount?: number;
  object_count?: number;
  faceCount?: number;
  face_count?: number;
  primitivePresence?: Partial<Record<PrimitiveCoverageKey, boolean>>;
  primitive_presence?: Partial<Record<PrimitiveCoverageKey, boolean>>;
}

type PrimitiveCoverageKey =
  | 'motionVector'
  | 'mainSubject'
  | 'textBoxes'
  | 'textCoverage'
  | 'negativeSpace'
  | 'objectCount'
  | 'faceCount';

export interface VjepaCoverageOverlay {
  id?: string | number;
  type?: string;
  from?: number;
  durationInFrames?: number;
  sourceStartFrame?: number;
  videoStartTime?: number;
  assetId?: string;
}

export interface SegmentCoverageSummary {
  segmentCount: number;
  spanStartMs: number | null;
  spanEndMs: number | null;
  coveredMs: number;
  gapCount: number;
  gapTotalMs: number;
  maxGapMs: number;
  coverageRatio: number | null;
  fieldCoverage: {
    visualSignificance: number;
    motionIntensity: number;
    actionType: number;
    motionType: number;
    faceEmotion: number;
    eyeContact: number;
    motionVector: number;
    mainSubject: number;
    textBoxes: number;
    textCoverage: number;
    negativeSpace: number;
    objectCount: number;
    faceCount: number;
  };
}

export interface OverlayCoverageHit {
  index: number;
  overlayId?: string | number;
  overlayType?: string;
  cutFrame: number;
  cutTimeMs: number;
  sourceFrame: number | null;
  sourceTimeMs: number | null;
  mappedClipId?: string | number;
  mappedAssetId?: string;
  exactHit: boolean;
  nearestGapMs: number | null;
  segment?: VjepaCoverageSegment;
  nearestSegment?: VjepaCoverageSegment;
}

export interface VjepaCoverageAudit {
  status: 'pass' | 'warn' | 'fail';
  issues: string[];
  fps: number;
  segmentCoverage: SegmentCoverageSummary;
  rawFootageCoverage?: SegmentCoverageSummary;
  overlayHitRate: number | null;
  overlayHits: OverlayCoverageHit[];
  reliability?: VjepaReliabilitySummary;
}

export interface VjepaReliabilitySummary {
  screenAwarePlacement: 'trusted' | 'degraded' | 'unavailable';
  score: number;
  reasons: string[];
}

type PrimitiveTrust = 'trusted' | 'degraded' | 'unavailable';

export interface VjepaScreenContextPolicy {
  mode: 'trusted' | 'degraded' | 'unavailable';
  score: number;
  overlayHitRate: number | null;
  reasons: string[];
  allowSubjectAvoidance: boolean;
  allowNegativeSpacePlacement: boolean;
  allowMotionDirection: boolean;
  allowTextAvoidance: boolean;
  primitiveTrust: Record<'motionVector' | 'mainSubject' | 'textCoverage' | 'negativeSpace', PrimitiveTrust>;
}

interface AuditOptions {
  fps: number;
  originalDurationMs?: number;
  cleanDurationMs?: number;
  vjepaSegments: VjepaCoverageSegment[];
  rawFootageSegments?: VjepaCoverageSegment[];
  overlays: VjepaCoverageOverlay[];
  targetOverlayTypes?: string[];
}

const DEFAULT_TARGET_TYPES = new Set([
  'motion-graphic',
  'html-scene',
  'sticker',
  'text',
  'caption',
  'transition',
  'zoom',
]);
const SOURCE_TYPES = new Set(['video']);

export function auditVjepaCoverage(options: AuditOptions): VjepaCoverageAudit {
  const fps = Number.isFinite(options.fps) && options.fps > 0 ? options.fps : 30;
  const targetTypes = new Set(options.targetOverlayTypes ?? DEFAULT_TARGET_TYPES);
  const segmentCoverage = summarizeSegments(options.vjepaSegments, options.originalDurationMs);
  const rawFootageCoverage = options.rawFootageSegments
    ? summarizeSegments(options.rawFootageSegments, options.originalDurationMs)
    : undefined;

  const sortedSegments = sortSegments(options.vjepaSegments);
  const sourceClips = options.overlays
    .filter((overlay) => SOURCE_TYPES.has(String(overlay.type ?? '')))
    .sort((a, b) => readFrame(a.from) - readFrame(b.from));
  const targets = options.overlays
    .filter((overlay) => targetTypes.has(String(overlay.type ?? '')))
    .sort((a, b) => readFrame(a.from) - readFrame(b.from));

  const overlayHits = targets.map((overlay, index) => mapOverlayHit(overlay, index, sourceClips, sortedSegments, fps));
  const overlayHitRate = overlayHits.length > 0
    ? overlayHits.filter((hit) => hit.exactHit).length / overlayHits.length
    : null;

  const reliability = assessVjepaReliability(segmentCoverage, overlayHitRate);
  const issues = buildIssues(segmentCoverage, overlayHitRate, overlayHits, reliability, options.originalDurationMs);
  return {
    status: issues.some((issue) => issue.startsWith('fail:')) ? 'fail' : issues.length > 0 ? 'warn' : 'pass',
    issues,
    fps,
    segmentCoverage,
    rawFootageCoverage,
    overlayHitRate,
    overlayHits,
    reliability,
  };
}

export function summarizeSegments(
  segments: VjepaCoverageSegment[] = [],
  totalDurationMs?: number,
): SegmentCoverageSummary {
  const sorted = sortSegments(segments);
  const fieldCounts = {
    visualSignificance: 0,
    motionIntensity: 0,
    actionType: 0,
    motionType: 0,
    faceEmotion: 0,
    eyeContact: 0,
    motionVector: 0,
    mainSubject: 0,
    textBoxes: 0,
    textCoverage: 0,
    negativeSpace: 0,
    objectCount: 0,
    faceCount: 0,
  };
  for (const segment of sorted) {
    if (typeof segment.visualSignificance === 'number') fieldCounts.visualSignificance++;
    if (typeof segment.motionIntensity === 'number') fieldCounts.motionIntensity++;
    if (typeof segment.actionType === 'string') fieldCounts.actionType++;
    if (typeof segment.motionType === 'string') fieldCounts.motionType++;
    if (segment.faceEmotion != null) fieldCounts.faceEmotion++;
    if (segment.eyeContact != null) fieldCounts.eyeContact++;
    if (hasMotionVector(segment)) fieldCounts.motionVector++;
    if (hasMainSubject(segment)) fieldCounts.mainSubject++;
    if (hasTextBoxes(segment)) fieldCounts.textBoxes++;
    if (hasPrimitiveNumberField(segment, 'textCoverage', 'textCoverage', 'text_coverage')) fieldCounts.textCoverage++;
    if (hasNegativeSpace(segment)) fieldCounts.negativeSpace++;
    if (hasPrimitiveNumberField(segment, 'objectCount', 'objectCount', 'object_count')) fieldCounts.objectCount++;
    if (hasPrimitiveNumberField(segment, 'faceCount', 'faceCount', 'face_count')) fieldCounts.faceCount++;
  }

  if (sorted.length === 0) {
    return {
      segmentCount: 0,
      spanStartMs: null,
      spanEndMs: null,
      coveredMs: 0,
      gapCount: 0,
      gapTotalMs: 0,
      maxGapMs: 0,
      coverageRatio: totalDurationMs && totalDurationMs > 0 ? 0 : null,
      fieldCoverage: toCoverageRatios(fieldCounts, 0),
    };
  }

  const merged = mergeSegments(sorted);
  let coveredMs = 0;
  let gapTotalMs = 0;
  let gapCount = 0;
  let maxGapMs = 0;
  for (let i = 0; i < merged.length; i++) {
    coveredMs += merged[i].endMs - merged[i].startMs;
    if (i > 0) {
      const gap = merged[i].startMs - merged[i - 1].endMs;
      if (gap > 1) {
        gapCount++;
        gapTotalMs += gap;
        maxGapMs = Math.max(maxGapMs, gap);
      }
    }
  }

  return {
    segmentCount: sorted.length,
    spanStartMs: merged[0].startMs,
    spanEndMs: merged[merged.length - 1].endMs,
    coveredMs,
    gapCount,
    gapTotalMs,
    maxGapMs,
    coverageRatio: totalDurationMs && totalDurationMs > 0 ? clamp01(coveredMs / totalDurationMs) : null,
    fieldCoverage: toCoverageRatios(fieldCounts, sorted.length),
  };
}

function mapOverlayHit(
  overlay: VjepaCoverageOverlay,
  index: number,
  sourceClips: VjepaCoverageOverlay[],
  segments: VjepaCoverageSegment[],
  fps: number,
): OverlayCoverageHit {
  const cutFrame = readFrame(overlay.from);
  const clip = findSourceClip(cutFrame, sourceClips);
  const sourceFrame = clip ? readSourceStartFrame(clip) + Math.max(0, cutFrame - readFrame(clip.from)) : null;
  const sourceTimeMs = sourceFrame == null ? null : (sourceFrame / fps) * 1000;
  const segment = sourceTimeMs == null ? undefined : findSegmentAt(segments, sourceTimeMs);
  const nearest = sourceTimeMs == null ? undefined : findNearestSegment(segments, sourceTimeMs);

  return {
    index,
    overlayId: overlay.id,
    overlayType: overlay.type,
    cutFrame,
    cutTimeMs: (cutFrame / fps) * 1000,
    sourceFrame,
    sourceTimeMs,
    mappedClipId: clip?.id,
    mappedAssetId: clip?.assetId,
    exactHit: !!segment,
    nearestGapMs: sourceTimeMs == null || !nearest ? null : distanceToSegment(nearest, sourceTimeMs),
    segment,
    nearestSegment: nearest,
  };
}

function buildIssues(
  segmentCoverage: SegmentCoverageSummary,
  overlayHitRate: number | null,
  overlayHits: OverlayCoverageHit[],
  reliability: VjepaReliabilitySummary,
  originalDurationMs?: number,
): string[] {
  const issues: string[] = [];
  if (segmentCoverage.segmentCount === 0) {
    issues.push('fail:no-vjepa-segments');
    return issues;
  }
  if (originalDurationMs && originalDurationMs > 0 && (segmentCoverage.coverageRatio ?? 0) < 0.9) {
    issues.push(`warn:low-vjepa-duration-coverage:${formatPct(segmentCoverage.coverageRatio ?? 0)}`);
  }
  if (segmentCoverage.maxGapMs > 10_000) {
    issues.push(`warn:large-vjepa-gap:${Math.round(segmentCoverage.maxGapMs)}ms`);
  }
  if (overlayHits.some((hit) => hit.sourceFrame == null)) {
    issues.push('warn:overlay-without-source-clip');
  }
  if (overlayHitRate != null && overlayHitRate < 0.9) {
    issues.push(`warn:low-overlay-vjepa-hit-rate:${formatPct(overlayHitRate)}`);
  }
  if (segmentCoverage.fieldCoverage.visualSignificance < 0.95 || segmentCoverage.fieldCoverage.motionIntensity < 0.95) {
    issues.push('warn:missing-core-vjepa-fields');
  }
  if (segmentCoverage.fieldCoverage.actionType < 0.95 || segmentCoverage.fieldCoverage.motionType < 0.95) {
    issues.push('warn:missing-semantic-vjepa-fields');
  }
  if (
    segmentCoverage.fieldCoverage.motionVector < 0.95 ||
    segmentCoverage.fieldCoverage.mainSubject < 0.95 ||
    segmentCoverage.fieldCoverage.textCoverage < 0.95 ||
    segmentCoverage.fieldCoverage.negativeSpace < 0.95
  ) {
    issues.push('warn:missing-vjepa-primitives');
  }
  if (reliability.screenAwarePlacement === 'degraded') {
    issues.push(`warn:vjepa-screen-aware-placement-degraded:${formatPct(reliability.score)}`);
  }
  return issues;
}

export function assessVjepaReliability(
  segmentCoverage: SegmentCoverageSummary,
  overlayHitRate: number | null,
): VjepaReliabilitySummary {
  if (segmentCoverage.segmentCount === 0) {
    return {
      screenAwarePlacement: 'unavailable',
      score: 0,
      reasons: ['no-vjepa-segments'],
    };
  }

  const reasons: string[] = [];
  const durationCoverage = segmentCoverage.coverageRatio ?? 1;
  if (durationCoverage < 0.9) {
    reasons.push(`duration-coverage-below-90:${formatPct(durationCoverage)}`);
  }
  if (segmentCoverage.maxGapMs > 10_000) {
    reasons.push(`max-gap-over-10s:${Math.round(segmentCoverage.maxGapMs)}ms`);
  }
  if (overlayHitRate != null && overlayHitRate < 0.9) {
    reasons.push(`overlay-hit-rate-below-90:${formatPct(overlayHitRate)}`);
  }

  const primitiveCoverage = {
    motionVector: segmentCoverage.fieldCoverage.motionVector,
    mainSubject: segmentCoverage.fieldCoverage.mainSubject,
    textCoverage: segmentCoverage.fieldCoverage.textCoverage,
    negativeSpace: segmentCoverage.fieldCoverage.negativeSpace,
  };
  for (const [key, value] of Object.entries(primitiveCoverage)) {
    if (value < 0.9) {
      reasons.push(`${key}-coverage-below-90:${formatPct(value)}`);
    }
  }

  const primitiveScore = (
    primitiveCoverage.motionVector +
    primitiveCoverage.mainSubject +
    primitiveCoverage.textCoverage +
    primitiveCoverage.negativeSpace
  ) / 4;
  const gapScore = segmentCoverage.maxGapMs <= 5_000
    ? 1
    : segmentCoverage.maxGapMs <= 10_000
      ? 0.75
      : segmentCoverage.maxGapMs <= 20_000
        ? 0.35
        : 0;
  const score = round2(
    durationCoverage * 0.35 +
    (overlayHitRate ?? 1) * 0.2 +
    primitiveScore * 0.3 +
    gapScore * 0.15,
  );

  return {
    screenAwarePlacement: reasons.length === 0 && score >= 0.9 ? 'trusted' : 'degraded',
    score,
    reasons,
  };
}

export function resolveVjepaScreenContextPolicy(audit?: VjepaCoverageAudit | null): VjepaScreenContextPolicy {
  if (!audit || audit.segmentCoverage.segmentCount === 0) {
    return {
      mode: 'unavailable',
      score: 0,
      overlayHitRate: audit?.overlayHitRate ?? null,
      reasons: ['no-usable-vjepa-audit'],
      allowSubjectAvoidance: false,
      allowNegativeSpacePlacement: false,
      allowMotionDirection: false,
      allowTextAvoidance: false,
      primitiveTrust: unavailablePrimitiveTrust(),
    };
  }

  const reliability = audit.reliability ?? assessVjepaReliability(audit.segmentCoverage, audit.overlayHitRate);
  if (reliability.screenAwarePlacement === 'unavailable') {
    return {
      mode: 'unavailable',
      score: reliability.score,
      overlayHitRate: audit.overlayHitRate,
      reasons: reliability.reasons,
      allowSubjectAvoidance: false,
      allowNegativeSpacePlacement: false,
      allowMotionDirection: false,
      allowTextAvoidance: false,
      primitiveTrust: unavailablePrimitiveTrust(),
    };
  }

  const overlayTrusted = audit.overlayHitRate == null || audit.overlayHitRate >= 0.9;
  const fieldCoverage = audit.segmentCoverage.fieldCoverage;
  const primitiveTrust = {
    motionVector: primitiveTrustFor(fieldCoverage.motionVector, overlayTrusted),
    mainSubject: primitiveTrustFor(fieldCoverage.mainSubject, overlayTrusted),
    textCoverage: primitiveTrustFor(fieldCoverage.textCoverage, overlayTrusted),
    negativeSpace: primitiveTrustFor(fieldCoverage.negativeSpace, overlayTrusted),
  };

  return {
    mode: reliability.screenAwarePlacement,
    score: reliability.score,
    overlayHitRate: audit.overlayHitRate,
    reasons: reliability.reasons,
    allowSubjectAvoidance: primitiveTrust.mainSubject === 'trusted',
    allowNegativeSpacePlacement: primitiveTrust.negativeSpace === 'trusted',
    allowMotionDirection: primitiveTrust.motionVector === 'trusted',
    allowTextAvoidance: primitiveTrust.textCoverage === 'trusted',
    primitiveTrust,
  };
}

function primitiveTrustFor(coverage: number, overlayTrusted: boolean): PrimitiveTrust {
  if (!Number.isFinite(coverage) || coverage <= 0) return 'unavailable';
  return coverage >= 0.9 && overlayTrusted ? 'trusted' : 'degraded';
}

function unavailablePrimitiveTrust(): VjepaScreenContextPolicy['primitiveTrust'] {
  return {
    motionVector: 'unavailable',
    mainSubject: 'unavailable',
    textCoverage: 'unavailable',
    negativeSpace: 'unavailable',
  };
}

function hasMotionVector(segment: VjepaCoverageSegment): boolean {
  return primitivePresent(segment, 'motionVector', () => (
    hasNumberField(segment, 'motionVectorX', 'motion_vector_x') &&
    hasNumberField(segment, 'motionVectorY', 'motion_vector_y')
  ));
}

function hasMainSubject(segment: VjepaCoverageSegment): boolean {
  return primitivePresent(segment, 'mainSubject', () => {
    const boxed = segment.mainSubject;
    if (
      boxed &&
      typeof boxed.x === 'number' &&
      typeof boxed.y === 'number' &&
      typeof boxed.width === 'number' &&
      typeof boxed.height === 'number'
    ) {
      return true;
    }
    return (
      hasNumberField(segment, 'mainSubjectX', 'main_subject_x') &&
      hasNumberField(segment, 'mainSubjectY', 'main_subject_y') &&
      hasNumberField(segment, 'mainSubjectWidth', 'main_subject_width') &&
      hasNumberField(segment, 'mainSubjectHeight', 'main_subject_height')
    );
  });
}

function hasTextBoxes(segment: VjepaCoverageSegment): boolean {
  return primitivePresent(segment, 'textBoxes', () => (
    Array.isArray(segment.textBoxes) ||
    Array.isArray(segment.text_boxes) ||
    hasNumberField(segment, 'textBoxCount', 'text_box_count')
  ));
}

function hasNegativeSpace(segment: VjepaCoverageSegment): boolean {
  return primitivePresent(segment, 'negativeSpace', () => (
    hasNumberField(segment, 'negativeSpaceTop', 'negative_space_top') &&
    hasNumberField(segment, 'negativeSpaceRight', 'negative_space_right') &&
    hasNumberField(segment, 'negativeSpaceBottom', 'negative_space_bottom') &&
    hasNumberField(segment, 'negativeSpaceLeft', 'negative_space_left')
  ));
}

function hasNumberField(segment: VjepaCoverageSegment, camelKey: keyof VjepaCoverageSegment, snakeKey: keyof VjepaCoverageSegment): boolean {
  return typeof segment[camelKey] === 'number' || typeof segment[snakeKey] === 'number';
}

function hasPrimitiveNumberField(
  segment: VjepaCoverageSegment,
  key: PrimitiveCoverageKey,
  camelKey: keyof VjepaCoverageSegment,
  snakeKey: keyof VjepaCoverageSegment,
): boolean {
  return primitivePresent(segment, key, () => hasNumberField(segment, camelKey, snakeKey));
}

function primitivePresent(segment: VjepaCoverageSegment, key: PrimitiveCoverageKey, fallback: () => boolean): boolean {
  const presence = segment.primitivePresence ?? segment.primitive_presence;
  if (presence && typeof presence[key] === 'boolean') return presence[key];
  return fallback();
}

function findSourceClip(frame: number, sourceClips: VjepaCoverageOverlay[]): VjepaCoverageOverlay | undefined {
  return sourceClips.find((clip) => {
    const start = readFrame(clip.from);
    const end = start + Math.max(0, readFrame(clip.durationInFrames));
    return frame >= start && frame < end;
  });
}

function findSegmentAt(segments: VjepaCoverageSegment[], timestampMs: number): VjepaCoverageSegment | undefined {
  return segments.find((segment) => timestampMs >= segment.startMs && timestampMs < segment.endMs);
}

function findNearestSegment(segments: VjepaCoverageSegment[], timestampMs: number): VjepaCoverageSegment | undefined {
  let best: VjepaCoverageSegment | undefined;
  let bestDistance = Infinity;
  for (const segment of segments) {
    const distance = distanceToSegment(segment, timestampMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = segment;
    }
  }
  return best;
}

function distanceToSegment(segment: VjepaCoverageSegment, timestampMs: number): number {
  if (timestampMs >= segment.startMs && timestampMs < segment.endMs) return 0;
  return timestampMs < segment.startMs ? segment.startMs - timestampMs : timestampMs - segment.endMs;
}

function mergeSegments(segments: VjepaCoverageSegment[]): VjepaCoverageSegment[] {
  const merged: VjepaCoverageSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (!last || segment.startMs > last.endMs) {
      merged.push({ ...segment });
    } else {
      last.endMs = Math.max(last.endMs, segment.endMs);
    }
  }
  return merged;
}

function sortSegments(segments: VjepaCoverageSegment[] = []): VjepaCoverageSegment[] {
  return segments
    .filter((segment) => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.endMs > segment.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

function toCoverageRatios(counts: Record<keyof SegmentCoverageSummary['fieldCoverage'], number>, total: number): SegmentCoverageSummary['fieldCoverage'] {
  if (total <= 0) {
    return {
      visualSignificance: 0,
      motionIntensity: 0,
      actionType: 0,
      motionType: 0,
      faceEmotion: 0,
      eyeContact: 0,
      motionVector: 0,
      mainSubject: 0,
      textBoxes: 0,
      textCoverage: 0,
      negativeSpace: 0,
      objectCount: 0,
      faceCount: 0,
    };
  }
  return {
    visualSignificance: counts.visualSignificance / total,
    motionIntensity: counts.motionIntensity / total,
    actionType: counts.actionType / total,
    motionType: counts.motionType / total,
    faceEmotion: counts.faceEmotion / total,
    eyeContact: counts.eyeContact / total,
    motionVector: counts.motionVector / total,
    mainSubject: counts.mainSubject / total,
    textBoxes: counts.textBoxes / total,
    textCoverage: counts.textCoverage / total,
    negativeSpace: counts.negativeSpace / total,
    objectCount: counts.objectCount / total,
    faceCount: counts.faceCount / total,
  };
}

function readFrame(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readSourceStartFrame(clip: VjepaCoverageOverlay): number {
  if (typeof clip.sourceStartFrame === 'number' && Number.isFinite(clip.sourceStartFrame)) return clip.sourceStartFrame;
  if (typeof clip.videoStartTime === 'number' && Number.isFinite(clip.videoStartTime)) return clip.videoStartTime;
  return 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
