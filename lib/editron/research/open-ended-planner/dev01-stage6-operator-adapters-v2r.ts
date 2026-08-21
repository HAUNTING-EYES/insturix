import { resolveTranscriptEditRange, type TranscriptEditAction } from '@/lib/editron/agent/chat-transcript-tools';
import { applyAudioDuckingToProject } from '@/lib/editron/agent/chat-audio-tools';
import {
  findVisualMomentCandidates,
  resolveKeyframeEditParams,
  type KeyframeEditDirection,
} from '@/lib/editron/agent/chat-visual-tools';
import { buildKeyframeMutationPatch } from '@/lib/editron/services/keyframe-mutation';
import {
  cutTimelineRange,
  mapTimelineFrameAfterRangeCutV1,
  type TimelineRangeCutCoordinateTransformV1,
  type TimelineRangeCutSplitChildV1,
} from '@/lib/editron/services/timeline-range-cut';

import type { Dev01NativeProxyFixtureV2 } from './dev01-native-proxy-fixture-v2';
import type { Dev01Stage6ProjectSnapshotV2 } from './dev01-stage6-native-proxy-contract-v2';
import {
  assertDev01Stage6CausalEvidenceBindingV2R,
  dev01Stage6CausalEvidenceV2R,
  withDev01Stage6CausalVisualEvidenceV2R,
} from './dev01-stage6-causal-evidence-v2r';

type JsonRecord = Record<string, unknown>;
type MutationStageV2R = 'CUT' | 'PUSH' | 'DUCK';

export interface Dev01Stage6OperatorResultV2R {
  outputs: JsonRecord;
  nextProject?: Dev01Stage6ProjectSnapshotV2;
  mutationStage?: MutationStageV2R;
  changedPaths: readonly string[];
}

export function executeDev01Stage6OperatorV2R(input: {
  operatorId: string;
  inputs: Readonly<JsonRecord>;
  originalProject: Dev01Stage6ProjectSnapshotV2;
  currentProject: Dev01Stage6ProjectSnapshotV2;
  fixture: Readonly<Dev01NativeProxyFixtureV2>;
}): Dev01Stage6OperatorResultV2R {
  assertProjectBinding(input.inputs, input.fixture);
  switch (input.operatorId) {
    case 'resolve_transcript_edit': return resolveTranscript(input.inputs, input.fixture);
    case 'cut_section': return applyCut(input.inputs, input.currentProject);
    case 'find_visual_moment': return findVisual(input);
    case 'resolve_keyframe_edit': return resolveKeyframes(input.inputs, input.currentProject);
    case 'set_keyframes': return applyKeyframes(input.inputs, input.currentProject);
    case 'apply_audio_ducking': return applyDucking(input.inputs, input.currentProject);
    default: throw new Error(`DEV01_STAGE6_OPERATOR_UNSUPPORTED:${input.operatorId}`);
  }
}

function resolveTranscript(
  inputs: Readonly<JsonRecord>,
  fixture: Readonly<Dev01NativeProxyFixtureV2>,
): Dev01Stage6OperatorResultV2R {
  const query = requiredString(inputs.query, 'TRANSCRIPT_QUERY');
  const intent = requiredRecord(inputs.intent, 'TRANSCRIPT_INTENT');
  const action = requiredString(intent.action, 'TRANSCRIPT_ACTION') as TranscriptEditAction;
  const minGapFrames = intent.minGapFrames === undefined
    ? undefined
    : requiredInteger(intent.minGapFrames, 'TRANSCRIPT_MIN_GAP_FRAMES');
  const maxCutFrames = intent.maxCutFrames === undefined
    ? undefined
    : requiredInteger(intent.maxCutFrames, 'TRANSCRIPT_MAX_CUT_FRAMES');
  const evidence = dev01Stage6CausalEvidenceV2R(fixture);
  const resolution = resolveTranscriptEditRange([...evidence.transcriptWords], query, {
    action,
    ...(minGapFrames === undefined ? {} : { minGapFrames }),
    ...(maxCutFrames === undefined ? {} : { maxCutFrames }),
  });
  if (resolution.status !== 'ready' || !resolution.cutSection) {
    throw new Error(`DEV01_STAGE6_TRANSCRIPT_UNRESOLVED:${resolution.status}`);
  }
  return {
    outputs: {
      proposedOperation: {
        targetOperatorId: 'cut_section',
        arguments: { targetRange: frameRange(resolution.cutSection) },
      },
      evidence: resolution,
    },
    changedPaths: [],
  };
}

function applyCut(
  inputs: Readonly<JsonRecord>,
  project: Dev01Stage6ProjectSnapshotV2,
): Dev01Stage6OperatorResultV2R {
  const range = frameRange(requiredRecord(inputs.targetRange, 'CUT_TARGET_RANGE'));
  const cut = cutTimelineRange({
    overlays: records(project.overlays),
    ...range,
    fps: requiredNumber(project.fps, 'PROJECT_FPS'),
    durationInFrames: requiredInteger(project.durationInFrames, 'PROJECT_DURATION'),
  });
  const nextProject = clone({
    ...project,
    durationInFrames: cut.newDurationInFrames,
    overlays: cut.overlays,
  });
  return {
    outputs: {
      receipt: {
        status: 'PASS',
        proof: {
          targetRange: range,
          framesCut: cut.framesCut,
          counts: {
            deleted: cut.deleted, trimmed: cut.trimmed, shifted: cut.shifted,
            split: cut.split, created: cut.created,
          },
        },
      },
      timelineCoordinateTransform: cut.timelineCoordinateTransform,
      splitChildren: cut.splitChildren,
    },
    nextProject,
    mutationStage: 'CUT',
    changedPaths: ['durationInFrames', 'overlays'],
  };
}

function findVisual(input: {
  inputs: Readonly<JsonRecord>;
  originalProject: Dev01Stage6ProjectSnapshotV2;
  currentProject: Dev01Stage6ProjectSnapshotV2;
  fixture: Readonly<Dev01NativeProxyFixtureV2>;
}): Dev01Stage6OperatorResultV2R {
  const query = requiredString(input.inputs.query, 'VISUAL_QUERY');
  const transform = requiredRecord(
    input.inputs.timelineCoordinateTransform,
    'VISUAL_TIMELINE_TRANSFORM',
  ) as unknown as TimelineRangeCutCoordinateTransformV1;
  const splitChildren = records(input.inputs.splitChildren) as unknown as TimelineRangeCutSplitChildV1[];
  const candidates = findVisualMomentCandidates(
    withDev01Stage6CausalVisualEvidenceV2R(input.originalProject, input.fixture),
    query,
  );
  const candidate = candidates[0];
  if (!candidate?.safeForAutoEdit) {
    throw new Error(`DEV01_STAGE6_VISUAL_UNRESOLVED:${candidate ? 'AMBIGUOUS' : 'NO_MATCH'}`);
  }
  const targetFrame = mapTimelineFrameAfterRangeCutV1(transform, candidate.frame);
  if (targetFrame == null) throw new Error('DEV01_STAGE6_VISUAL_TARGET_REMOVED_BY_CUT');
  const sourceOverlayId = requiredInteger(candidate.source.overlayId, 'VISUAL_SOURCE_OVERLAY');
  const overlayId = mapOverlayIdAfterCut(sourceOverlayId, candidate.frame, splitChildren);
  if (!records(input.currentProject.overlays).some((overlay) => overlay.id === overlayId)) {
    throw new Error(`DEV01_STAGE6_VISUAL_TARGET_OVERLAY_MISSING:${overlayId}`);
  }
  const focalPoint = normalizedFocalPoint(candidate.boundingBox);
  return {
    outputs: {
      result: { candidate, sourceOverlayId, sourceFrame: candidate.frame, overlayId, targetFrame },
      evidence: candidate,
      overlayId,
      targetFrame,
      focalPoint,
      evidenceStrength: candidate.confidence,
    },
    changedPaths: [],
  };
}

function resolveKeyframes(
  inputs: Readonly<JsonRecord>,
  project: Dev01Stage6ProjectSnapshotV2,
): Dev01Stage6OperatorResultV2R {
  const intent = requiredRecord(inputs.intent, 'KEYFRAME_INTENT');
  const direction = requiredString(intent.direction, 'KEYFRAME_DIRECTION') as KeyframeEditDirection;
  if (direction !== 'in' && direction !== 'out') throw new Error('DEV01_STAGE6_KEYFRAME_DIRECTION_INVALID');
  const scaleDelta = intent.scaleDelta === undefined
    ? undefined
    : requiredNumber(intent.scaleDelta, 'KEYFRAME_SCALE_DELTA');
  const plan = resolveKeyframeEditParams(project, {
    overlayId: requiredInteger(inputs.overlayId, 'KEYFRAME_OVERLAY'),
    targetFrame: requiredInteger(inputs.targetFrame, 'KEYFRAME_TARGET_FRAME'),
    focalPoint: normalizedPoint(inputs.focalPoint),
    evidenceStrength: requiredNumber(inputs.evidenceStrength, 'KEYFRAME_EVIDENCE_STRENGTH'),
    evidenceModality: 'visual',
    direction,
    ...(scaleDelta === undefined ? {} : { scaleDelta }),
  });
  if (plan.status !== 'ready' || !plan.useWith?.set_keyframes) {
    throw new Error(`DEV01_STAGE6_KEYFRAME_FORM_UNRESOLVED:${plan.status}`);
  }
  return {
    outputs: {
      proposedOperation: { targetOperatorId: 'set_keyframes', arguments: plan.useWith.set_keyframes },
      evidence: plan,
    },
    changedPaths: [],
  };
}

function applyKeyframes(
  inputs: Readonly<JsonRecord>,
  project: Dev01Stage6ProjectSnapshotV2,
): Dev01Stage6OperatorResultV2R {
  const overlayId = requiredInteger(inputs.overlayId, 'SET_KEYFRAMES_OVERLAY');
  const overlay = records(project.overlays).find((candidate) => candidate.id === overlayId);
  if (!overlay) throw new Error(`DEV01_STAGE6_SET_KEYFRAMES_OVERLAY_MISSING:${overlayId}`);
  const mutation = buildKeyframeMutationPatch({
    overlay,
    property: 'scale',
    keyframes: records(inputs.keyframes).map((point) => ({
      frame: requiredNumber(point.frame, 'KEYFRAME_FRAME'),
      value: requiredNumber(point.value, 'KEYFRAME_VALUE'),
      easing: requiredEasing(point.easing),
    })),
    ...(inputs.focalPoint === undefined ? {} : { focalPoint: normalizedPoint(inputs.focalPoint) }),
  });
  return {
    outputs: { receipt: { status: 'PASS', proof: { overlayId, property: 'scale' } } },
    nextProject: replaceOverlay(project, overlayId, { ...overlay, ...mutation.patch }),
    mutationStage: 'PUSH',
    changedPaths: [
      `overlays.${overlayId}.keyframeTracks.scale`,
      ...(mutation.patch.styles ? [`overlays.${overlayId}.styles.transformOrigin`] : []),
    ],
  };
}

function applyDucking(
  inputs: Readonly<JsonRecord>,
  project: Dev01Stage6ProjectSnapshotV2,
): Dev01Stage6OperatorResultV2R {
  const audioPlan = requiredRecord(inputs.audioPlan, 'AUDIO_PLAN');
  const plan = applyAudioDuckingToProject(project, audioPlan);
  if (plan.status !== 'changed' || !plan.updates.length) {
    throw new Error(`DEV01_STAGE6_DUCK_FORM_UNRESOLVED:${plan.status}`);
  }
  let nextProject = clone(project);
  const changedPaths: string[] = [];
  for (const update of plan.updates) {
    const overlayId = requiredInteger(update.overlayId, 'DUCK_OVERLAY');
    const overlay = records(nextProject.overlays).find((candidate) => candidate.id === overlayId);
    if (!overlay) throw new Error(`DEV01_STAGE6_DUCK_OVERLAY_MISSING:${overlayId}`);
    nextProject = replaceOverlay(nextProject, overlayId, { ...overlay, styles: update.nextStyles });
    changedPaths.push(`overlays.${overlayId}.styles.duckingConfig`);
  }
  return {
    outputs: {
      receipt: {
        status: 'PASS',
        proof: { updatedOverlayIds: plan.updates.map(({ overlayId }) => overlayId) },
      },
    },
    nextProject,
    mutationStage: 'DUCK',
    changedPaths,
  };
}

function assertProjectBinding(inputs: Readonly<JsonRecord>, fixture: Readonly<Dev01NativeProxyFixtureV2>): void {
  assertDev01Stage6CausalEvidenceBindingV2R(fixture);
  if (inputs.projectId !== undefined && inputs.projectId !== fixture.project.projectId) {
    throw new Error('DEV01_STAGE6_PROJECT_ID_DRIFT');
  }
  if (inputs.expectedProjectRevision !== undefined
    && inputs.expectedProjectRevision !== fixture.project.projectRevision) {
    throw new Error('DEV01_STAGE6_PROJECT_REVISION_DRIFT');
  }
}

function mapOverlayIdAfterCut(
  beforeOverlayId: number,
  beforeFrame: number,
  children: readonly TimelineRangeCutSplitChildV1[],
): number {
  const split = children.find((child) => child.beforeOverlayId === beforeOverlayId);
  if (!split) return beforeOverlayId;
  if (beforeFrame >= split.rightBeforeTimelineRange.startFrame
    && beforeFrame < split.rightBeforeTimelineRange.endFrame) return split.rightOverlayId;
  if (beforeFrame >= split.leftBeforeTimelineRange.startFrame
    && beforeFrame < split.leftBeforeTimelineRange.endFrame) return split.leftOverlayId;
  throw new Error('DEV01_STAGE6_VISUAL_SPLIT_CHILD_UNRESOLVED');
}

function normalizedFocalPoint(box: unknown): { x: number; y: number } {
  const recordBox = requiredRecord(box, 'VISUAL_BOUNDING_BOX');
  if (recordBox.units !== 'normalized') throw new Error('DEV01_STAGE6_VISUAL_PIXEL_BOX_UNVERIFIABLE');
  return normalizedPoint({
    x: requiredNumber(recordBox.x, 'VISUAL_BOX_X') + requiredNumber(recordBox.width, 'VISUAL_BOX_WIDTH') / 2,
    y: requiredNumber(recordBox.y, 'VISUAL_BOX_Y') + requiredNumber(recordBox.height, 'VISUAL_BOX_HEIGHT') / 2,
  });
}

function normalizedPoint(value: unknown): { x: number; y: number } {
  const point = requiredRecord(value, 'NORMALIZED_POINT');
  const x = requiredNumber(point.x, 'NORMALIZED_POINT_X');
  const y = requiredNumber(point.y, 'NORMALIZED_POINT_Y');
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error('DEV01_STAGE6_NORMALIZED_POINT_OUT_OF_RANGE');
  return { x, y };
}

function frameRange(value: JsonRecord): { startFrame: number; endFrame: number } {
  const startFrame = requiredInteger(value.startFrame, 'RANGE_START');
  const endFrame = requiredInteger(value.endFrame, 'RANGE_END');
  if (startFrame < 0 || endFrame <= startFrame) throw new Error('DEV01_STAGE6_FRAME_RANGE_INVALID');
  return { startFrame, endFrame };
}

function replaceOverlay(project: Dev01Stage6ProjectSnapshotV2, id: number, replacement: JsonRecord): Dev01Stage6ProjectSnapshotV2 {
  return clone({ ...project, overlays: records(project.overlays).map((overlay) => overlay.id === id ? replacement : overlay) });
}
function requiredEasing(value: unknown): 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' {
  if (value === 'linear' || value === 'ease-in' || value === 'ease-out' || value === 'ease-in-out') return value;
  throw new Error('DEV01_STAGE6_KEYFRAME_EASING_INVALID');
}
function requiredString(value: unknown, code: string): string { if (typeof value !== 'string' || !value) throw new Error(`DEV01_STAGE6_${code}_INVALID`); return value; }
function requiredNumber(value: unknown, code: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`DEV01_STAGE6_${code}_INVALID`); return value; }
function requiredInteger(value: unknown, code: string): number { const number = requiredNumber(value, code); if (!Number.isSafeInteger(number)) throw new Error(`DEV01_STAGE6_${code}_INVALID`); return number; }
function requiredRecord(value: unknown, code: string): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`DEV01_STAGE6_${code}_INVALID`); return value as JsonRecord; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
