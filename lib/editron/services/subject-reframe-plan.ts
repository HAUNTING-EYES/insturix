import type {
  AspectRatio,
  Keyframe,
  KeyframeTrack,
} from '@/components/editron/editor/version-7.0.0/types';

import { buildCanonicalChatEvidenceDocuments } from './chat-multimodal-evidence';
import { renderTargetForAspect } from '../storyline/storyline';

export const SUBJECT_REFRAME_PLAN_VERSION = 'editron-subject-reframe-v1' as const;
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
  styles?: Record<string, unknown>;
  keyframeTracks?: KeyframeTrack[];
}

type MediaOverlayMutation = Partial<Pick<
  MediaOverlay,
  'left' | 'top' | 'width' | 'height' | 'styles' | 'keyframeTracks'
>>;

export interface SubjectReframeOverlayUpdate {
  overlayId: number;
  trackingStatus: 'subject-tracked' | 'safe-contained';
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
  warnings: string[];
  calibrationStatus: typeof SUBJECT_REFRAME_POLICY.calibrationStatus;
  message: string;
}

export function buildSubjectAwareReframePlan(input: {
  project: Record<string, unknown>;
  analyses: unknown[];
  targetAspectRatio: AspectRatio;
}): SubjectReframePlan {
  const fps = positiveNumber(input.project.fps) ?? 30;
  const target = renderTargetForAspect(input.targetAspectRatio, fps);
  const currentCanvas = readCanvas(input.project);
  const overlays = asRecords(input.project.overlays) as MediaOverlay[];
  const media = overlays.filter((overlay) => overlay.type === 'video' || overlay.type === 'image');
  const eligible = media.filter((overlay) => isFullCanvasOverlay(overlay, currentCanvas));
  const skippedOverlayIds = media
    .filter((overlay) => !eligible.includes(overlay))
    .map((overlay) => overlay.id);

  if (eligible.length === 0) {
    return errorPlan(input.targetAspectRatio, 'No exact full-canvas video or image overlays are available to reframe.', skippedOverlayIds);
  }

  const projectId = stringValue(input.project.projectId) ?? 'unknown-project';
  const evidence = buildCanonicalChatEvidenceDocuments({
    projectId,
    project: input.project,
    analyses: input.analyses,
  });
  const overlayUpdates = eligible.map((overlay) => planOverlayUpdate(overlay, evidence, target.width, target.height));
  const subjectTrackedOverlayIds = overlayUpdates
    .filter((update) => update.trackingStatus === 'subject-tracked')
    .map((update) => update.overlayId);
  const safeContainedOverlayIds = overlayUpdates
    .filter((update) => update.trackingStatus === 'safe-contained')
    .map((update) => update.overlayId);
  const warnings = [
    ...(skippedOverlayIds.length > 0
      ? [`Skipped ${skippedOverlayIds.length} non-full-canvas media overlay(s); their authored layout was preserved.`]
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
    skippedOverlayIds,
    calibrationStatus: SUBJECT_REFRAME_POLICY.calibrationStatus,
    plannedAt: new Date().toISOString(),
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
    warnings,
    calibrationStatus: SUBJECT_REFRAME_POLICY.calibrationStatus,
    message: `Reframed ${overlayUpdates.length} full-canvas media overlay(s) for ${input.targetAspectRatio}: ${subjectTrackedOverlayIds.length} subject-tracked, ${safeContainedOverlayIds.length} safely contained.`,
  };
}

function planOverlayUpdate(
  overlay: MediaOverlay,
  evidence: ReturnType<typeof buildCanonicalChatEvidenceDocuments>,
  targetWidth: number,
  targetHeight: number,
): SubjectReframeOverlayUpdate {
  const overlayEvidence = evidence.filter((document) => (
    String(document.overlayId) === String(overlay.id)
    && document.boundingBox?.units === 'normalized'
    && document.editedStartFrame != null
    && document.editedEndFrame != null
  ));
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

  const points = focalPointsForOverlay(overlay, overlayEvidence);
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
): Array<{ frame: number; x: number; y: number }> {
  const byFrame = new Map<number, Array<{ x: number; y: number; weight: number }>>();
  for (const document of evidence) {
    const box = document.boundingBox!;
    const absoluteFrame = Math.round(((document.editedStartFrame ?? 0) + (document.editedEndFrame ?? 0)) / 2);
    const frame = clamp(Math.round(absoluteFrame - overlay.from), 0, Math.max(0, overlay.durationInFrames - 1));
    const value = {
      x: clamp((box.x + box.width / 2) * 100, 0, 100),
      y: clamp((box.y + box.height / 2) * 100, 0, 100),
      weight: positiveNumber(document.importance) ?? 1,
    };
    const entries = byFrame.get(frame) ?? [];
    entries.push(value);
    byFrame.set(frame, entries);
  }
  return Array.from(byFrame.entries())
    .map(([frame, entries]) => {
      const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
      return {
        frame,
        x: entries.reduce((sum, entry) => sum + entry.x * entry.weight, 0) / totalWeight,
        y: entries.reduce((sum, entry) => sum + entry.y * entry.weight, 0) / totalWeight,
      };
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
      easing: 'ease-in-out',
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
