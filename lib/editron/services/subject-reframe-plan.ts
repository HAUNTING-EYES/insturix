import type {
  AspectRatio,
  Keyframe,
  KeyframeTrack,
} from '@/components/editron/editor/version-7.0.0/types';

import { buildCanonicalChatEvidenceDocuments } from './chat-multimodal-evidence';
import { renderTargetForAspect } from '../storyline/storyline';

export const SUBJECT_REFRAME_PLAN_VERSION = 'editron-subject-reframe-v2' as const;
export const SUBJECT_REFRAME_POLICY = {
  calibrationStatus: 'invented-needs-calibration',
  fullCanvasTolerancePx: 1,
} as const;

interface MediaOverlay {
  id: number;
  type: string;
  from: number;
  durationInFrames: number;
  left: number;
  top: number;
  width: number;
  height: number;
  assetId?: string;
  metadata?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  keyframeTracks?: KeyframeTrack[];
}

type MediaOverlayMutation = Partial<Pick<
  MediaOverlay,
  'left' | 'top' | 'width' | 'height' | 'styles' | 'keyframeTracks'
>>;

export interface SubjectReframeOverlayUpdate {
  overlayId: number;
  trackingStatus: 'subject-tracked' | 'safe-contained' | 'authored-layout-preserved';
  evidenceCount: number;
  updates: MediaOverlayMutation;
}

export interface SubjectReframePlan {
  version: typeof SUBJECT_REFRAME_PLAN_VERSION;
  status: 'changed' | 'error';
  targetAspectRatio: AspectRatio;
  projectUpdates: Record<string, unknown>;
  overlayUpdates: SubjectReframeOverlayUpdate[];
  skippedOverlayIds: number[];
  subjectTrackedOverlayIds: number[];
  safeContainedOverlayIds: number[];
  authoredLayoutOverlayIds: number[];
  warnings: string[];
  calibrationStatus: typeof SUBJECT_REFRAME_POLICY.calibrationStatus;
  message: string;
}

export function buildSubjectAwareReframePlan(input: {
  project: Record<string, unknown>;
  analyses: unknown[];
  targetAspectRatio: AspectRatio;
  sourceRastersByAssetId?: Readonly<Record<string, Readonly<{ width: number; height: number }>>>;
  authoredLayoutEvidence?: readonly unknown[];
}): SubjectReframePlan {
  const fps = positiveNumber(input.project.fps) ?? 30;
  const target = renderTargetForAspect(input.targetAspectRatio, fps);
  const currentCanvas = readCanvas(input.project);
  const overlays = asRecords(input.project.overlays) as MediaOverlay[];
  const media = overlays.filter((overlay) => overlay.type === 'video' || overlay.type === 'image');
  const eligible = media.filter((overlay) => isFullCanvasOverlay(overlay, currentCanvas));
  const nonFullCanvas = media.filter((overlay) => !eligible.includes(overlay));
  const layoutEvidence = readAuthoredLayoutEvidence(input.authoredLayoutEvidence);

  if ((input.authoredLayoutEvidence?.length ?? 0) !== layoutEvidence.length) {
    return errorPlan(input.targetAspectRatio, 'Authored layout evidence is malformed.', nonFullCanvas.map(({ id }) => id));
  }
  if (new Set(layoutEvidence.map(({ overlayRef }) => overlayRef)).size !== layoutEvidence.length) {
    return errorPlan(input.targetAspectRatio, 'Authored layout evidence contains duplicate overlay targets.', nonFullCanvas.map(({ id }) => id));
  }

  if (eligible.length === 0) {
    return errorPlan(input.targetAspectRatio, 'No exact full-canvas video or image overlays are available to reframe.', nonFullCanvas.map(({ id }) => id));
  }

  const projectId = stringValue(input.project.projectId) ?? 'unknown-project';
  const evidence = buildCanonicalChatEvidenceDocuments({
    projectId,
    project: input.project,
    analyses: input.analyses,
  });
  for (const layout of layoutEvidence) {
    if (!nonFullCanvas.some((overlay) => overlayReference(overlay) === layout.overlayRef)) {
      return errorPlan(input.targetAspectRatio, `Authored layout target ${layout.overlayRef} is absent from the project.`, nonFullCanvas.map(({ id }) => id));
    }
  }
  for (const overlay of eligible) {
    const overlayEvidence = evidenceForOverlay(overlay, evidence);
    if (overlayEvidence.length === 0) continue;
    const raster = sourceRasterForOverlay(overlay, input.sourceRastersByAssetId);
    if (!raster) {
      return errorPlan(input.targetAspectRatio, `Source raster is required to prove subject-aware cover geometry for overlay ${overlay.id}.`, nonFullCanvas.map(({ id }) => id));
    }
    if (overlayEvidence.some(({ boundingBox }) => !validNormalizedBox(boundingBox)
      || !boxFitsCover(boundingBox!, raster, target))) {
      return errorPlan(input.targetAspectRatio, `Subject bounds cannot be proven visible for overlay ${overlay.id}.`, nonFullCanvas.map(({ id }) => id));
    }
  }
  const trackedUpdates = eligible.map((overlay) => planOverlayUpdate(
    overlay, evidence, target.width, target.height,
    sourceRasterForOverlay(overlay, input.sourceRastersByAssetId),
  ));
  const layoutUpdates = layoutEvidence.map((layout) => {
    const overlay = nonFullCanvas.find((candidate) => overlayReference(candidate) === layout.overlayRef)!;
    return planAuthoredLayoutUpdate(overlay, layout.safeRelation, currentCanvas, target);
  });
  if (layoutUpdates.some((update) => update == null)) {
    return errorPlan(input.targetAspectRatio, 'An authored layout relation is unsupported or cannot fit the target canvas.', nonFullCanvas.map(({ id }) => id));
  }
  const resolvedLayoutUpdates = layoutUpdates as SubjectReframeOverlayUpdate[];
  const overlayUpdates = [...trackedUpdates, ...resolvedLayoutUpdates];
  const authoredLayoutOverlayIds = resolvedLayoutUpdates.map(({ overlayId }) => overlayId);
  const authoredLayoutSet = new Set(authoredLayoutOverlayIds);
  const skippedOverlayIds = nonFullCanvas.filter(({ id }) => !authoredLayoutSet.has(id)).map(({ id }) => id);
  const subjectTrackedOverlayIds = overlayUpdates
    .filter((update) => update.trackingStatus === 'subject-tracked')
    .map((update) => update.overlayId);
  const safeContainedOverlayIds = overlayUpdates
    .filter((update) => update.trackingStatus === 'safe-contained')
    .map((update) => update.overlayId);
  const warnings = [
    ...(skippedOverlayIds.length > 0
      ? [`Left ${skippedOverlayIds.length} non-full-canvas media overlay(s) unchanged because no explicit authored-layout relation was supplied.`]
      : []),
    ...(safeContainedOverlayIds.length > 0
      ? [`Kept ${safeContainedOverlayIds.length} media overlay(s) fully visible with contain because normalized subject evidence was unavailable.`]
      : []),
  ];
  const receipt = {
    version: SUBJECT_REFRAME_PLAN_VERSION,
    targetAspectRatio: input.targetAspectRatio,
    subjectTrackedOverlayIds,
    safeContainedOverlayIds,
    authoredLayoutOverlayIds,
    skippedOverlayIds,
    calibrationStatus: SUBJECT_REFRAME_POLICY.calibrationStatus,
  };

  return {
    version: SUBJECT_REFRAME_PLAN_VERSION,
    status: 'changed',
    targetAspectRatio: input.targetAspectRatio,
    projectUpdates: {
      aspectRatio: input.targetAspectRatio,
      playerDimensions: { width: target.width, height: target.height },
      'intelligence.lastSubjectReframe': receipt,
    },
    overlayUpdates,
    skippedOverlayIds,
    subjectTrackedOverlayIds,
    safeContainedOverlayIds,
    authoredLayoutOverlayIds,
    warnings,
    calibrationStatus: SUBJECT_REFRAME_POLICY.calibrationStatus,
    message: `Reframed ${eligible.length} full-canvas media overlay(s) for ${input.targetAspectRatio}: ${subjectTrackedOverlayIds.length} subject-tracked, ${safeContainedOverlayIds.length} safely contained, ${authoredLayoutOverlayIds.length} authored layouts preserved.`,
  };
}

function planOverlayUpdate(
  overlay: MediaOverlay,
  evidence: ReturnType<typeof buildCanonicalChatEvidenceDocuments>,
  targetWidth: number,
  targetHeight: number,
  sourceRaster: Readonly<{ width: number; height: number }> | null,
): SubjectReframeOverlayUpdate {
  const overlayEvidence = evidenceForOverlay(overlay, evidence);
  const existingTracks = Array.isArray(overlay.keyframeTracks) ? overlay.keyframeTracks : [];
  const nonFocalTracks = existingTracks.filter((track) => (
    track.property !== 'objectPositionX' && track.property !== 'objectPositionY'
  ));
  const baseUpdates: MediaOverlayMutation = {
    left: 0,
    top: 0,
    width: targetWidth,
    height: targetHeight,
  };

  if (overlayEvidence.length === 0) {
    return {
      overlayId: overlay.id,
      trackingStatus: 'safe-contained',
      evidenceCount: 0,
      updates: {
        ...baseUpdates,
        styles: { ...asRecord(overlay.styles), objectFit: 'contain', objectPosition: '50% 50%' },
        keyframeTracks: nonFocalTracks,
      },
    };
  }

  const points = focalPointsForOverlay(
    overlay, overlayEvidence, sourceRaster!, { width: targetWidth, height: targetHeight },
  );
  const focalTracks = buildFocalTracks(points, overlay.durationInFrames);
  const first = points[0] ?? { frame: 0, x: 50, y: 50 };
  return {
    overlayId: overlay.id,
    trackingStatus: 'subject-tracked',
    evidenceCount: overlayEvidence.length,
    updates: {
      ...baseUpdates,
      styles: {
        ...asRecord(overlay.styles),
        objectFit: 'cover',
        objectPosition: `${round2(first.x)}% ${round2(first.y)}%`,
      },
      keyframeTracks: [...nonFocalTracks, ...focalTracks],
    },
  };
}

function focalPointsForOverlay(
  overlay: MediaOverlay,
  evidence: ReturnType<typeof buildCanonicalChatEvidenceDocuments>,
  sourceRaster: Readonly<{ width: number; height: number }>,
  target: Readonly<{ width: number; height: number }>,
): Array<{ frame: number; x: number; y: number }> {
  const byFrame = new Map<number, Array<{ x: number; y: number; width: number; height: number; weight: number }>>();
  for (const document of evidence) {
    const box = document.boundingBox!;
    const absoluteFrame = Math.round(((document.editedStartFrame ?? 0) + (document.editedEndFrame ?? 0)) / 2);
    const frame = clamp(Math.round(absoluteFrame - overlay.from), 0, Math.max(0, overlay.durationInFrames - 1));
    const value = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      weight: positiveNumber(document.importance) ?? 1,
    };
    const entries = byFrame.get(frame) ?? [];
    entries.push(value);
    byFrame.set(frame, entries);
  }
  return Array.from(byFrame.entries())
    .map(([frame, entries]) => {
      const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
      const box = {
        x: entries.reduce((sum, entry) => sum + entry.x * entry.weight, 0) / totalWeight,
        y: entries.reduce((sum, entry) => sum + entry.y * entry.weight, 0) / totalWeight,
        width: entries.reduce((sum, entry) => sum + entry.width * entry.weight, 0) / totalWeight,
        height: entries.reduce((sum, entry) => sum + entry.height * entry.weight, 0) / totalWeight,
      };
      return { frame, ...coverFocalPoint(box, sourceRaster, target) };
    })
    .sort((left, right) => left.frame - right.frame);
}

function buildFocalTracks(
  rawPoints: Array<{ frame: number; x: number; y: number }>,
  durationInFrames: number,
): KeyframeTrack[] {
  const lastFrame = Math.max(0, durationInFrames - 1);
  const points = rawPoints.length === 1
    ? [
        { ...rawPoints[0], frame: 0 },
        { ...rawPoints[0], frame: lastFrame },
      ]
    : withEndpointHolds(rawPoints, lastFrame);
  const makeTrack = (property: 'objectPositionX' | 'objectPositionY', axis: 'x' | 'y'): KeyframeTrack => ({
    property,
    keyframes: points.map((point): Keyframe => ({
      frame: point.frame,
      value: round2(point[axis]),
      // Tracking follows measured positions; decorative easing can lag behind
      // the subject and invalidate a visibility guarantee between samples.
      easing: 'linear',
    })),
  });
  return [makeTrack('objectPositionX', 'x'), makeTrack('objectPositionY', 'y')];
}

function withEndpointHolds(
  points: Array<{ frame: number; x: number; y: number }>,
  lastFrame: number,
): Array<{ frame: number; x: number; y: number }> {
  const result = [...points];
  if (result[0].frame > 0) result.unshift({ ...result[0], frame: 0 });
  if (result[result.length - 1].frame < lastFrame) result.push({ ...result[result.length - 1], frame: lastFrame });
  return result;
}

function readCanvas(project: Record<string, unknown>): { width: number; height: number } {
  const dimensions = asRecord(project.playerDimensions);
  return {
    width: positiveNumber(dimensions.width) ?? 1920,
    height: positiveNumber(dimensions.height) ?? 1080,
  };
}

function isFullCanvasOverlay(overlay: MediaOverlay, canvas: { width: number; height: number }): boolean {
  const tolerance = SUBJECT_REFRAME_POLICY.fullCanvasTolerancePx;
  return Math.abs((overlay.left ?? 0) - 0) <= tolerance
    && Math.abs((overlay.top ?? 0) - 0) <= tolerance
    && Math.abs((overlay.width ?? 0) - canvas.width) <= tolerance
    && Math.abs((overlay.height ?? 0) - canvas.height) <= tolerance;
}

function evidenceForOverlay(
  overlay: MediaOverlay,
  evidence: ReturnType<typeof buildCanonicalChatEvidenceDocuments>,
) {
  return evidence.filter((document) => String(document.overlayId) === String(overlay.id)
    && document.boundingBox?.units === 'normalized'
    && document.editedStartFrame != null && document.editedEndFrame != null);
}

function sourceRasterForOverlay(
  overlay: MediaOverlay,
  values: Readonly<Record<string, Readonly<{ width: number; height: number }>>> | undefined,
): Readonly<{ width: number; height: number }> | null {
  const value = overlay.assetId ? values?.[overlay.assetId] : undefined;
  const width = positiveNumber(value?.width); const height = positiveNumber(value?.height);
  return width && height ? { width, height } : null;
}

function validNormalizedBox(value: unknown): value is { x: number; y: number; width: number; height: number; units: 'normalized' } {
  const box = asRecord(value);
  const x = Number(box.x); const y = Number(box.y);
  const width = Number(box.width); const height = Number(box.height);
  return [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0
    && width > 0 && height > 0 && x + width <= 1 && y + height <= 1
    && box.units === 'normalized';
}

function boxFitsCover(
  box: { width: number; height: number },
  source: Readonly<{ width: number; height: number }>,
  target: Readonly<{ width: number; height: number }>,
): boolean {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  return box.width * source.width * scale <= target.width + 0.01
    && box.height * source.height * scale <= target.height + 0.01;
}

function coverFocalPoint(
  box: { x: number; y: number; width: number; height: number },
  source: Readonly<{ width: number; height: number }>,
  target: Readonly<{ width: number; height: number }>,
): { x: number; y: number } {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  return {
    x: focalPercentForAxis(box.x, box.width, source.width * scale, target.width),
    y: focalPercentForAxis(box.y, box.height, source.height * scale, target.height),
  };
}

function focalPercentForAxis(start: number, size: number, renderedSize: number, targetSize: number): number {
  const overflow = renderedSize - targetSize;
  if (overflow <= 0.01) return 50;
  const renderedStart = start * renderedSize;
  const renderedEnd = (start + size) * renderedSize;
  const minimum = Math.max(0, (renderedEnd - targetSize) / overflow * 100);
  const maximum = Math.min(100, renderedStart / overflow * 100);
  const centered = (((renderedStart + renderedEnd) / 2) - targetSize / 2) / overflow * 100;
  return round2(clamp(centered, minimum, maximum));
}

function readAuthoredLayoutEvidence(values: readonly unknown[] | undefined): Array<{ overlayRef: string; safeRelation: string }> {
  return asRecords(values).flatMap((value) => {
    const overlayRef = stringValue(value.overlayId ?? value.logoOverlayId);
    const safeRelation = stringValue(value.safeRelation);
    return overlayRef && safeRelation ? [{ overlayRef, safeRelation }] : [];
  });
}

function overlayReference(overlay: MediaOverlay): string {
  return stringValue(asRecord(overlay.metadata).authoredId) ?? String(overlay.id);
}

function planAuthoredLayoutUpdate(
  overlay: MediaOverlay,
  safeRelation: string,
  current: Readonly<{ width: number; height: number }>,
  target: Readonly<{ width: number; height: number }>,
): SubjectReframeOverlayUpdate | null {
  // Brand placement is never inferred here. This only projects an explicitly
  // declared designer-authored anchor onto the new canvas.
  const match = /^(top|bottom)-(left|right)-(\d+(?:\.\d+)?)-percent$/.exec(safeRelation);
  if (!match) return null;
  const margin = Number(match[3]) / 100;
  if (!Number.isFinite(margin) || margin < 0 || margin > 0.5) return null;
  const scale = Math.min(target.width / current.width, target.height / current.height);
  const width = round2(overlay.width * scale); const height = round2(overlay.height * scale);
  const horizontalMargin = target.width * margin; const verticalMargin = target.height * margin;
  const left = match[2] === 'left' ? horizontalMargin : target.width - horizontalMargin - width;
  const top = match[1] === 'top' ? verticalMargin : target.height - verticalMargin - height;
  if (left < 0 || top < 0 || left + width > target.width || top + height > target.height) return null;
  return {
    overlayId: overlay.id, trackingStatus: 'authored-layout-preserved', evidenceCount: 1,
    updates: { left: round2(left), top: round2(top), width, height },
  };
}

function errorPlan(targetAspectRatio: AspectRatio, message: string, skippedOverlayIds: number[]): SubjectReframePlan {
  return {
    version: SUBJECT_REFRAME_PLAN_VERSION,
    status: 'error',
    targetAspectRatio,
    projectUpdates: {},
    overlayUpdates: [],
    skippedOverlayIds,
    subjectTrackedOverlayIds: [],
    safeContainedOverlayIds: [],
    authoredLayoutOverlayIds: [],
    warnings: [],
    calibrationStatus: SUBJECT_REFRAME_POLICY.calibrationStatus,
    message,
  };
}

function asRecords(value: unknown): Record<string, any>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, any> => entry != null && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
