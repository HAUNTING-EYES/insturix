import {
  applyCameraShakeToProject,
  type CameraShakePlan,
} from '@/lib/editron/agent/chat-visual-tools';
import { findAudioMomentCandidates } from '@/lib/editron/agent/chat-audio-tools';
import {
  alignCutsToBeatsWithEvidence,
  type BeatAlignmentResult,
} from '@/lib/pipeline/scene-to-editron';

import { hashCanonicalJsonV1 } from './contracts-v1';
import type { Dev03NativeProxyFixtureV2 } from './dev03-native-proxy-fixture-v2';
import type { Dev03Stage6ProjectSnapshotV2 } from './dev03-stage6-native-proxy-contract-v2';

type JsonRecord = Record<string, unknown>;
type MutationStageV2R = 'ALIGN' | 'SHAKE';

export interface Dev03Stage6OperatorResultV2R {
  outputs: JsonRecord;
  nextProject?: Dev03Stage6ProjectSnapshotV2;
  mutationStage?: MutationStageV2R;
  changedPaths: readonly string[];
}

export function executeDev03Stage6OperatorV2R(input: {
  operatorId: string;
  inputs: Readonly<JsonRecord>;
  currentProject: Dev03Stage6ProjectSnapshotV2;
  fixture: Readonly<Dev03NativeProxyFixtureV2>;
  evidencePack: Readonly<JsonRecord>;
}): Dev03Stage6OperatorResultV2R {
  assertProjectBinding(input.inputs, input.fixture);
  switch (input.operatorId) {
    case 'read_project_file': return readProject(input.currentProject, input.fixture);
    case 'get_timeline_view': return readTimeline(input.currentProject, input.fixture);
    case 'find_audio_moment': return findMeasuredImpacts(input);
    case 'sync_cuts_to_beats': return alignBoundaries(input);
    case 'apply_camera_shake': return applyFinalShake(input);
    default: throw new Error(`DEV03_STAGE6_OPERATOR_UNSUPPORTED:${input.operatorId}`);
  }
}

function readProject(
  project: Dev03Stage6ProjectSnapshotV2,
  fixture: Readonly<Dev03NativeProxyFixtureV2>,
): Dev03Stage6OperatorResultV2R {
  return {
    outputs: {
      result: clone(project),
      evidence: {
        projectId: fixture.project.projectId,
        projectRevision: fixture.project.projectRevision,
        stateHash: hashCanonicalJsonV1(project),
      },
    },
    changedPaths: [],
  };
}

function readTimeline(
  project: Dev03Stage6ProjectSnapshotV2,
  fixture: Readonly<Dev03NativeProxyFixtureV2>,
): Dev03Stage6OperatorResultV2R {
  const overlays = records(project.overlays);
  return {
    outputs: {
      result: {
        fps: project.fps,
        durationInFrames: project.durationInFrames,
        overlays: overlays.map(({ id, type, assetId, row, from, durationInFrames }) => (
          { id, type, assetId, row, from, durationInFrames }
        )),
      },
      evidence: {
        projectId: fixture.project.projectId,
        projectRevision: fixture.project.projectRevision,
        timelineStateHash: hashCanonicalJsonV1(overlays),
      },
    },
    changedPaths: [],
  };
}

function findMeasuredImpacts(input: {
  inputs: Readonly<JsonRecord>;
  currentProject: Dev03Stage6ProjectSnapshotV2;
  fixture: Readonly<Dev03NativeProxyFixtureV2>;
  evidencePack: Readonly<JsonRecord>;
}): Dev03Stage6OperatorResultV2R {
  const query = requiredString(input.inputs.query, 'AUDIO_QUERY');
  const fact = measuredBeatFact(input.evidencePack, input.fixture);
  const strongPeakFrames = orderedUniqueFrames(fact.strongPeakFrames, 'STRONG_PEAKS');
  const finalStrongPeakFrame = requiredInteger(fact.finalStrongPeakFrame, 'FINAL_STRONG_PEAK');
  if (strongPeakFrames.at(-1) !== finalStrongPeakFrame) {
    throw new Error('DEV03_STAGE6_FINAL_STRONG_PEAK_DRIFT');
  }
  const analysisProject = clone({
    ...input.currentProject,
    musicAnalysis: { beats: strongPeakFrames },
  });
  const candidates = findAudioMomentCandidates(analysisProject, query, {
    limit: 12,
    minConfidence: 0.78,
    includeOverlayMetadata: false,
  });
  const candidateFrames = [...new Set(candidates.map(({ frame }) => frame))].sort((a, b) => a - b);
  if (!same(candidateFrames, strongPeakFrames)) {
    throw new Error('DEV03_STAGE6_AUDIO_OWNER_DID_NOT_RESOLVE_BOUND_PEAKS');
  }
  const result = {
    schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1',
    assetId: input.fixture.assets.beats.assetId,
    measuredEvidenceReceiptHash: requiredSha256(fact.receiptHash, 'MEASURED_RECEIPT_HASH'),
    strongPeakFrames,
    finalStrongPeakFrame,
  };
  return {
    outputs: {
      result,
      evidence: {
        factId: fact.factId,
        evidenceId: fact.evidenceId,
        candidateFrames,
        candidateHash: hashCanonicalJsonV1(clone(candidates)),
      },
    },
    changedPaths: [],
  };
}

function alignBoundaries(input: {
  inputs: Readonly<JsonRecord>;
  currentProject: Dev03Stage6ProjectSnapshotV2;
  fixture: Readonly<Dev03NativeProxyFixtureV2>;
  evidencePack: Readonly<JsonRecord>;
}): Dev03Stage6OperatorResultV2R {
  const beatPlan = requiredRecord(input.inputs.beatPlan, 'BEAT_PLAN');
  const constraints = requiredRecord(input.inputs.beatSyncConstraints, 'BEAT_SYNC_CONSTRAINTS');
  const fact = measuredBeatFact(input.evidencePack, input.fixture);
  const strongPeakFrames = orderedUniqueFrames(beatPlan.strongPeakFrames, 'BEAT_PLAN_PEAKS');
  if (beatPlan.measuredEvidenceReceiptHash !== fact.receiptHash
    || !same(strongPeakFrames, fact.strongPeakFrames)
    || beatPlan.finalStrongPeakFrame !== fact.finalStrongPeakFrame) {
    throw new Error('DEV03_STAGE6_BEAT_PLAN_EVIDENCE_DRIFT');
  }
  const overlayIds = overlayIdArray(input.inputs.overlayIds, 'ALIGN_OVERLAY_IDS');
  const nextProject = clone(input.currentProject);
  const overlays = records(nextProject.overlays);
  const visualIds = overlays
    .filter(({ type }) => type === 'video' || type === 'image')
    .sort((left, right) => requiredInteger(left.from, 'VISUAL_FROM') - requiredInteger(right.from, 'VISUAL_FROM'))
    .map(({ id }) => id as string | number);
  if (!same(visualIds, overlayIds)) throw new Error('DEV03_STAGE6_ALIGN_OVERLAY_SET_DRIFT');

  const protectedRange = frameRange(constraints.protectedAudioRange, 'PROTECTED_AUDIO_RANGE');
  const result = alignCutsToBeatsWithEvidence(
    overlays,
    strongPeakFrames.map((frame, index) => ({ frame, isDownbeat: index === 0 })),
    requiredNumber(nextProject.fps, 'PROJECT_FPS'),
    {
      maxSnapFrames: requiredInteger(constraints.maxSnapFrames, 'MAX_SNAP_FRAMES'),
      minClipFrames: requiredInteger(constraints.minClipFrames, 'MIN_CLIP_FRAMES'),
      maxConsecutiveBeatCuts: requiredInteger(constraints.maxConsecutiveBeatCuts, 'MAX_CONSECUTIVE_BEAT_CUTS'),
      protectedBoundaryFrames: [protectedRange.startFrame, protectedRange.endFrame],
      protectedBoundaryToleranceFrames: requiredInteger(
        constraints.protectedBoundaryToleranceFrames,
        'PROTECTED_BOUNDARY_TOLERANCE',
      ),
      sourceDurationFramesByAssetId: positiveIntegerRecord(
        constraints.sourceDurationFramesByAssetId,
        'SOURCE_DURATIONS',
      ),
      requireSourceHandles: constraints.requireSourceHandles === true,
    },
  );
  assertAlignmentResult(result, strongPeakFrames);
  nextProject.overlays = overlays;
  const finalStrongPeakFrame = requiredInteger(beatPlan.finalStrongPeakFrame, 'FINAL_STRONG_PEAK');
  const finalHitOverlayId = activeVisualOverlayId(overlays, overlayIds, finalStrongPeakFrame);
  const afterStateHash = hashCanonicalJsonV1(nextProject);
  return {
    outputs: {
      receipt: {
        result: 'PASS',
        beforeStateHash: hashCanonicalJsonV1(input.currentProject),
        afterStateHash,
        snappedCount: result.snappedCount,
        changes: result.changes,
        rejections: result.rejections,
      },
      result: {
        ...result,
        finalStrongPeakFrame,
        finalHitOverlayId,
      },
    },
    nextProject,
    mutationStage: 'ALIGN',
    changedPaths: alignmentChangedPaths(result),
  };
}

function applyFinalShake(input: {
  inputs: Readonly<JsonRecord>;
  currentProject: Dev03Stage6ProjectSnapshotV2;
}): Dev03Stage6OperatorResultV2R {
  const effectPlan = requiredRecord(input.inputs.effectPlan, 'SHAKE_EFFECT_PLAN');
  const goal = requiredString(effectPlan.goal, 'SHAKE_GOAL').toLowerCase();
  if (!goal.includes('restrained') || !goal.includes('neutral')) {
    throw new Error('DEV03_STAGE6_SHAKE_GOAL_UNSUPPORTED');
  }
  const targetOverlayId = overlayId(input.inputs.overlayId, 'SHAKE_OVERLAY_ID');
  const targetFrame = requiredInteger(input.inputs.targetFrame, 'SHAKE_TARGET_FRAME');
  const nextProject = clone(input.currentProject);
  const plan = applyCameraShakeToProject(nextProject, {
    targetFrame,
    videoOverlayId: targetOverlayId,
    replacePositionKeyframes: false,
  });
  const update = exactShakeUpdate(plan, targetOverlayId, targetFrame);
  nextProject.overlays = records(nextProject.overlays).map((overlay) => (
    String(overlay.id) === String(update.overlayId)
      ? { ...overlay, keyframeTracks: update.nextKeyframeTracks }
      : overlay
  ));
  return {
    outputs: {
      receipt: {
        result: 'PASS',
        beforeStateHash: hashCanonicalJsonV1(input.currentProject),
        afterStateHash: hashCanonicalJsonV1(nextProject),
        ownerPlan: plan,
      },
    },
    nextProject,
    mutationStage: 'SHAKE',
    changedPaths: [
      `overlays.${String(update.overlayId)}.keyframeTracks.x`,
      `overlays.${String(update.overlayId)}.keyframeTracks.y`,
    ],
  };
}

function measuredBeatFact(
  evidencePack: Readonly<JsonRecord>,
  fixture: Readonly<Dev03NativeProxyFixtureV2>,
): JsonRecord {
  const fact = records(evidencePack.facts).find(({ kind }) => kind === 'HASH_BOUND_MEASURED_AUDIO');
  if (!fact) throw new Error('DEV03_STAGE6_MEASURED_BEAT_FACT_MISSING');
  if (fact.evidenceId !== 'EV-DEV03-B1'
    || fact.sourceArtifactSha256 !== fixture.assets.beats.sha256
    || requiredNumber(fact.bpmConfidence, 'BPM_CONFIDENCE') < 0.8
    || fact.frameRounding !== 'NEAREST_PROJECT_TICK') {
    throw new Error('DEV03_STAGE6_MEASURED_BEAT_FACT_INVALID');
  }
  requiredSha256(fact.analyzerImplementationSha256, 'ANALYZER_HASH');
  requiredSha256(fact.analyzerOptionsHash, 'ANALYZER_OPTIONS_HASH');
  return fact;
}

function assertAlignmentResult(result: BeatAlignmentResult, strongPeakFrames: readonly number[]): void {
  if (!result.changes.length || result.snappedCount !== result.changes.length || result.rejections.length) {
    throw new Error('DEV03_STAGE6_ALIGNMENT_OWNER_REJECTED');
  }
  const licensed = new Set(strongPeakFrames);
  if (result.changes.some(({ alignedFrame, beatFrame }) => (
    alignedFrame !== beatFrame || !licensed.has(alignedFrame)
  ))) throw new Error('DEV03_STAGE6_ALIGNMENT_OUTSIDE_MEASURED_BEATS');
}

function exactShakeUpdate(
  plan: CameraShakePlan,
  overlayId: string | number,
  targetFrame: number,
): CameraShakePlan['updates'][number] {
  const update = plan.updates[0];
  if (plan.status !== 'changed' || plan.updates.length !== 1 || !update
    || String(update.overlayId) !== String(overlayId) || update.targetFrame !== targetFrame
    || update.durationFrames < 2 || !Number.isFinite(update.intensity)) {
    throw new Error(`DEV03_STAGE6_SHAKE_OWNER_REJECTED:${plan.status}`);
  }
  return update;
}

function activeVisualOverlayId(
  overlays: readonly JsonRecord[],
  allowedIds: readonly (string | number)[],
  frame: number,
): string | number {
  const allowed = new Set(allowedIds.map(String));
  const active = overlays.filter((overlay) => allowed.has(String(overlay.id))
    && (overlay.type === 'video' || overlay.type === 'image')
    && requiredInteger(overlay.from, 'ACTIVE_FROM') <= frame
    && frame < requiredInteger(overlay.from, 'ACTIVE_FROM')
      + requiredInteger(overlay.durationInFrames, 'ACTIVE_DURATION'));
  if (active.length !== 1) throw new Error('DEV03_STAGE6_FINAL_HIT_OVERLAY_AMBIGUOUS');
  return overlayId(active[0].id, 'FINAL_HIT_OVERLAY_ID');
}

function alignmentChangedPaths(result: BeatAlignmentResult): string[] {
  const paths = new Set<string>();
  for (const change of result.changes) {
    paths.add(`overlays.${String(change.clipAId)}.durationInFrames`);
    paths.add(`overlays.${String(change.clipBId)}.from`);
    paths.add(`overlays.${String(change.clipBId)}.durationInFrames`);
    paths.add(`overlays.${String(change.clipBId)}.sourceStartFrame`);
    paths.add(`overlays.${String(change.clipBId)}.videoStartTime`);
    for (const transitionId of change.transitionOverlayIds) {
      paths.add(`overlays.${String(transitionId)}.from`);
    }
  }
  return [...paths].sort(compareUtf16);
}

function assertProjectBinding(
  inputs: Readonly<JsonRecord>,
  fixture: Readonly<Dev03NativeProxyFixtureV2>,
): void {
  if (inputs.projectId !== undefined && inputs.projectId !== fixture.project.projectId) {
    throw new Error('DEV03_STAGE6_PROJECT_ID_DRIFT');
  }
  if (inputs.expectedProjectRevision !== undefined
    && inputs.expectedProjectRevision !== fixture.project.projectRevision) {
    throw new Error('DEV03_STAGE6_PROJECT_REVISION_DRIFT');
  }
}

function orderedUniqueFrames(value: unknown, code: string): number[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  const frames = value.map((entry) => requiredInteger(entry, code));
  if (new Set(frames).size !== frames.length
    || frames.some((frame, index) => frame < 0 || (index > 0 && frame <= frames[index - 1]))) {
    throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  }
  return frames;
}

function overlayIdArray(value: unknown, code: string): Array<string | number> {
  if (!Array.isArray(value) || !value.length) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  const values = value.map((entry) => overlayId(entry, code));
  if (new Set(values.map(String)).size !== values.length) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  return values;
}

function overlayId(value: unknown, code: string): string | number {
  if ((typeof value === 'string' && value.length > 0)
    || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) return value;
  throw new Error(`DEV03_STAGE6_${code}_INVALID`);
}

function positiveIntegerRecord(value: unknown, code: string): Record<string, number> {
  const source = requiredRecord(value, code);
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(source)) {
    result[key] = requiredInteger(entry, code);
    if (result[key] < 1) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  }
  if (!Object.keys(result).length) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  return result;
}

function frameRange(value: unknown, code: string): { startFrame: number; endFrame: number } {
  const range = requiredRecord(value, code);
  const startFrame = requiredInteger(range.startFrame, code);
  const endFrame = requiredInteger(range.endFrame, code);
  if (startFrame < 0 || endFrame <= startFrame) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  return { startFrame, endFrame };
}

function requiredSha256(value: unknown, code: string): string {
  const hash = requiredString(value, code);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  return hash;
}
function requiredString(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  return value;
}
function requiredNumber(value: unknown, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  return value;
}
function requiredInteger(value: unknown, code: string): number {
  const number = requiredNumber(value, code);
  if (!Number.isSafeInteger(number)) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  return number;
}
function requiredRecord(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  }
  return value as JsonRecord;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}
function same(left: unknown, right: unknown): boolean {
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}
function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
