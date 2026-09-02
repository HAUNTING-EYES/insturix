import {
  applyCameraShakeToProject,
  type CameraShakePlan,
} from '../../agent/chat-visual-tools';
import {
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';
import type { Project, ProjectRevisionV1 } from '../../services/project-service';
import {
  retimeIsolatedVideoSourceRangeV1,
  type VideoSourceRangeRetimeEffectV1,
} from '../../services/video-source-range-retime-v1';
import {
  createProjectVideoSourceTimeTransformV1,
  rebindSourcePresentationTimestampV1,
  VIDEO_SOURCE_TIME_BINDING_KIND_V1,
  type ProjectVideoSourceTimeTransformV1,
  type SourcePresentationTimestampRebindV1,
  type VerifiedVideoSourceTimeBindingV1,
} from '../../services/video-source-time-transform-v1';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { DEP03_PUBLIC_SPEED_RETIME_CONTRACT_VERSION_V1 }
  from './stage25-dep03-public-speed-retime-contract-v1';

type JsonRecord = Record<string, unknown>;

export const DEP03_ISOLATED_OWNER_AUTHORITY_V1 =
  'STAGE25_DEP03_ISOLATED_PRODUCTION_OWNER_REPLAY_V1_1' as const;

export const DEP03_REQUIRED_EVIDENCE_IDS_V1 = [
  'EV-D03-EVENT',
  'EV-D03-RAMP',
  'EV-D03-SPEECH',
  'EV-D03-TIMELINE',
  'EV-D03-MAPPING',
] as const;

export interface Stage25Dep03OwnerScenarioV1 {
  ownerDisposition: 'EDIT_APPLIED' | 'ZERO_WRITE_SAFE_STOP'
    | 'UNSAFE_ATTEMPT_BLOCKED' | 'TAMPER_REJECTED';
  proofArtifactKind: 'CURRENT_EDIT_RECEIPT' | 'SAFE_STOP_RECEIPT' | 'NONE';
  operationAttemptCount: number;
  unsafeAttemptCount: number;
  ownerBlockedAttemptCount: number;
  isolatedMutationCount: number;
  finalSemanticStateSha256: string | null;
  observations: readonly Readonly<JsonRecord>[];
  trace: readonly Readonly<JsonRecord>[];
  trustedReceipt?: boolean;
}

const BEFORE_REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 16,
  compatibilityUpdatedAt: '2026-08-25T00:16:00.000Z',
};
const AFTER_RETIME_REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 17,
  compatibilityUpdatedAt: '2026-08-25T00:17:00.000Z',
};
const AFTER_SHAKE_REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 18,
  compatibilityUpdatedAt: '2026-08-25T00:18:00.000Z',
};
const SOURCE_EVENT_PTS_TICKS = '300000';
const SOURCE_BINDING = sourceBinding();

export const DEP03_MATERIALIZED_EVIDENCE_V1 = materializedEvidence();
export const DEP03_BASELINE_PROJECT_STATE_SHA256_V1 = hashCanonicalJsonV1(
  semanticProjectState(buildProject()),
);
const EXPECTED_GOOD = executeGood('WRITER_MAPPING');
export const DEP03_EXPECTED_FINAL_SEMANTIC_STATE_SHA256_V1 =
  EXPECTED_GOOD.finalSemanticStateSha256!;

export function executeStage25Dep03OwnerScenarioV1(
  sentinelId: string,
): Readonly<Stage25Dep03OwnerScenarioV1> {
  if (sentinelId === 'DEP03_MAPPING_REBIND_ACCEPT') return executeGood('WRITER_MAPPING');
  if (sentinelId === 'DEP03_CURRENT_REVISION_REREAD_EQUIVALENT') {
    return executeGood('CURRENT_REVISION_REREAD');
  }
  if (sentinelId === 'DEP03_STALE_EVENT_FRAME_REJECT') return executeStaleFrame();
  if (sentinelId === 'DEP03_MAPPING_UNAVAILABLE_SAFE_STOP_ACCEPT') {
    return safeStop('SOURCE_TIME_MAPPING_UNAVAILABLE');
  }
  if (sentinelId === 'DEP03_FORGED_TIME_MAP_REJECT') return executeForgedTransform();
  if (sentinelId === 'DEP03_DIALOGUE_OVERLAP_WRITE_REJECT') return executeDialogueOverlap();
  throw new Error(`STAGE25_DEP03_OWNER_SENTINEL_UNKNOWN:${sentinelId}`);
}

function executeGood(
  mode: 'WRITER_MAPPING' | 'CURRENT_REVISION_REREAD',
): Readonly<Stage25Dep03OwnerScenarioV1> {
  const retimed = executeRetime(buildProject());
  const transform = mode === 'WRITER_MAPPING'
    ? retimed.transform
    : currentRevisionTransform(retimed.project);
  const rebound = requireRebound(rebindSourcePresentationTimestampV1(
    transform,
    SOURCE_BINDING,
    SOURCE_EVENT_PTS_TICKS,
  ));
  const shake = requireChangedShake(applyCameraShakeToProject(retimed.project, {
    targetFrame: rebound.projectFrame,
    videoOverlayId: 302,
    formIntent: 'restrained-impact',
    replacePositionKeyframes: false,
  }));
  const finalProject = applyShake(retimed.project, shake);
  finalProject.projectRevision = AFTER_SHAKE_REVISION.value;
  finalProject.updatedAt = new Date(AFTER_SHAKE_REVISION.compatibilityUpdatedAt);
  const finalState = dep03TaskState(finalProject, rebound);
  const finalSemanticStateSha256 = hashCanonicalJsonV1(finalState);
  return deepFreezeV1({
    ownerDisposition: 'EDIT_APPLIED' as const,
    proofArtifactKind: 'CURRENT_EDIT_RECEIPT' as const,
    operationAttemptCount: 2,
    unsafeAttemptCount: 0,
    ownerBlockedAttemptCount: 0,
    isolatedMutationCount: 2,
    finalSemanticStateSha256,
    observations: [{
      bindingMode: mode,
      eventSourcePresentationTimestampTicks: SOURCE_EVENT_PTS_TICKS,
      rebound,
      retimeEffect: retimed.effect,
      transformSha256: transform.transformSha256,
      finalState,
    }],
    trace: [
      ...retimed.trace,
      operationTrace('apply_camera_shake', AFTER_RETIME_REVISION, AFTER_SHAKE_REVISION, {
        targetOverlayId: 302,
        targetFrame: rebound.projectFrame,
        sourceTransformSha256: transform.transformSha256,
        formOwner: 'lib/editron/agent/chat-visual-tools.ts#applyCameraShakeToProject',
      }),
    ],
  });
}

function executeStaleFrame(): Readonly<Stage25Dep03OwnerScenarioV1> {
  const retimed = executeRetime(buildProject());
  const staleFrame = 100;
  const shake = applyCameraShakeToProject(retimed.project, {
    targetFrame: staleFrame,
    videoOverlayId: 302,
    formIntent: 'restrained-impact',
  });
  if (shake.status !== 'no-target') {
    throw new Error('STAGE25_DEP03_OWNER_STALE_FRAME_NOT_BLOCKED');
  }
  return deepFreezeV1({
    ownerDisposition: 'UNSAFE_ATTEMPT_BLOCKED' as const,
    proofArtifactKind: 'NONE' as const,
    operationAttemptCount: 2,
    unsafeAttemptCount: 1,
    ownerBlockedAttemptCount: 1,
    isolatedMutationCount: 1,
    finalSemanticStateSha256: null,
    observations: [{
      guardCode: 'STALE_PRE_RETIME_EVENT_FRAME_REJECTED',
      staleFrame,
      requiredCurrentFrame: 50,
      shakeStatus: shake.status,
      message: shake.message,
    }],
    trace: [...retimed.trace, {
      stage: 'DOWNSTREAM_EVENT_REBIND_GUARD',
      operatorId: 'apply_camera_shake',
      disposition: 'UNSAFE_ATTEMPT_BLOCKED',
    }],
  });
}

function executeForgedTransform(): Readonly<Stage25Dep03OwnerScenarioV1> {
  const retimed = executeRetime(buildProject());
  const forged = structuredClone(retimed.transform) as unknown as {
    segments: Array<{ sourceEndFrameExclusive: number }>;
  };
  forged.segments[0]!.sourceEndFrameExclusive -= 1;
  let rejection = '';
  try {
    rebindSourcePresentationTimestampV1(
      forged as unknown as ProjectVideoSourceTimeTransformV1,
      SOURCE_BINDING,
      SOURCE_EVENT_PTS_TICKS,
    );
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  if (rejection !== 'VIDEO_SOURCE_TIME_TRANSFORM_INVALID') {
    throw new Error('STAGE25_DEP03_OWNER_FORGED_TRANSFORM_NOT_REJECTED');
  }
  return deepFreezeV1({
    ownerDisposition: 'TAMPER_REJECTED' as const,
    proofArtifactKind: 'NONE' as const,
    operationAttemptCount: 2,
    unsafeAttemptCount: 0,
    ownerBlockedAttemptCount: 1,
    isolatedMutationCount: 1,
    finalSemanticStateSha256: null,
    observations: [{ guardCode: rejection }],
    trace: [...retimed.trace, {
      stage: 'SOURCE_TIME_TRANSFORM_INTEGRITY_GATE',
      disposition: 'TAMPER_REJECTED',
    }],
    trustedReceipt: false,
  });
}

function executeDialogueOverlap(): Readonly<Stage25Dep03OwnerScenarioV1> {
  const project = buildProject();
  project.overlays.push(overlay({
    id: 304,
    type: 'sound',
    assetId: 'dep03-assembly-take',
    row: 4,
    from: 0,
    durationInFrames: 240,
    startFromSound: 0,
    audioStartFrame: 0,
    audioEndFrame: 240,
    metadata: { role: 'dialogue', protectedSourceRange: { startFrame: 120, endFrame: 240 } },
    styles: { volume: 1 },
  }));
  const retime = retimeIsolatedVideoSourceRangeV1({
    overlays: project.overlays,
    projectDurationInFrames: project.durationInFrames,
    overlayId: 302,
    verifiedSourceStartFrame: 0,
    verifiedSourceEndFrameExclusive: 120,
    playbackRate: 2,
  });
  if (retime.disposition !== 'SAFE_STOP'
    || retime.reason !== 'OVERLAPPING_DEPENDENT_OVERLAY') {
    throw new Error('STAGE25_DEP03_OWNER_DIALOGUE_OVERLAP_NOT_BLOCKED');
  }
  return deepFreezeV1({
    ownerDisposition: 'UNSAFE_ATTEMPT_BLOCKED' as const,
    proofArtifactKind: 'NONE' as const,
    operationAttemptCount: 1,
    unsafeAttemptCount: 1,
    ownerBlockedAttemptCount: 1,
    isolatedMutationCount: 0,
    finalSemanticStateSha256: null,
    observations: [{
      guardCode: retime.reason,
      protectedDialogueSourceRange: { startFrame: 120, endFrame: 240 },
    }],
    trace: [{
      stage: 'PROJECTSERVICE_RETIME_DEPENDENCY_GUARD',
      operatorId: 'apply_speed_ramp',
      disposition: 'UNSAFE_ATTEMPT_BLOCKED',
    }],
  });
}

function safeStop(reason: string): Readonly<Stage25Dep03OwnerScenarioV1> {
  return deepFreezeV1({
    ownerDisposition: 'ZERO_WRITE_SAFE_STOP' as const,
    proofArtifactKind: 'SAFE_STOP_RECEIPT' as const,
    operationAttemptCount: 0,
    unsafeAttemptCount: 0,
    ownerBlockedAttemptCount: 0,
    isolatedMutationCount: 0,
    finalSemanticStateSha256: null,
    observations: [{
      reason,
      baselineProjectStateSha256: DEP03_BASELINE_PROJECT_STATE_SHA256_V1,
    }],
    trace: [{ stage: 'PUBLIC_EVIDENCE_GATE', disposition: 'ZERO_WRITE_SAFE_STOP', reason }],
  });
}

function executeRetime(project: Project): Readonly<{
  project: Project;
  effect: VideoSourceRangeRetimeEffectV1;
  transform: ProjectVideoSourceTimeTransformV1;
  trace: readonly Readonly<JsonRecord>[];
}> {
  const retime = retimeIsolatedVideoSourceRangeV1({
    overlays: project.overlays,
    projectDurationInFrames: project.durationInFrames,
    overlayId: 302,
    verifiedSourceStartFrame: 0,
    verifiedSourceEndFrameExclusive: 120,
    playbackRate: 2,
  });
  if (retime.disposition !== 'APPLIED') {
    throw new Error(`STAGE25_DEP03_OWNER_RETIME_NOT_APPLIED:${retime.reason}`);
  }
  const next = structuredClone(project);
  next.overlays = retime.overlays;
  next.durationInFrames = retime.effect.afterProjectDurationInFrames;
  next.projectRevision = AFTER_RETIME_REVISION.value;
  next.updatedAt = new Date(AFTER_RETIME_REVISION.compatibilityUpdatedAt);
  const target = next.overlays.find(({ id }) => id === 302);
  if (!target || target.type !== 'video' || !target.speedCurve) {
    throw new Error('STAGE25_DEP03_OWNER_RETIME_TARGET_STATE_MISSING');
  }
  const transform = createProjectVideoSourceTimeTransformV1({
    projectId: next.projectId,
    overlayId: target.id,
    beforeProjectRevision: BEFORE_REVISION,
    afterProjectRevision: AFTER_RETIME_REVISION,
    projectFps: next.fps,
    timelineStartFrame: target.from,
    sourceStartFrame: 0,
    sourceEndFrameExclusive: 120,
    durationInFrames: target.durationInFrames,
    speedCurve: target.speedCurve,
    sourceBinding: SOURCE_BINDING,
  });
  return deepFreezeV1({
    project: next,
    effect: retime.effect,
    transform,
    trace: [operationTrace('apply_speed_ramp', BEFORE_REVISION, AFTER_RETIME_REVISION, {
      publicContractVersion: DEP03_PUBLIC_SPEED_RETIME_CONTRACT_VERSION_V1,
      sourceRangeRetimeEffectSha256: hashCanonicalJsonV1(retime.effect),
      sourceTimeTransformSha256: transform.transformSha256,
    })],
  });
}

function currentRevisionTransform(project: Project): ProjectVideoSourceTimeTransformV1 {
  const target = project.overlays.find(({ id }) => id === 302);
  if (!target || target.type !== 'video' || !target.speedCurve) {
    throw new Error('STAGE25_DEP03_OWNER_CURRENT_RETIME_STATE_MISSING');
  }
  return createProjectVideoSourceTimeTransformV1({
    projectId: project.projectId,
    overlayId: target.id,
    beforeProjectRevision: BEFORE_REVISION,
    afterProjectRevision: AFTER_RETIME_REVISION,
    projectFps: project.fps,
    timelineStartFrame: target.from,
    sourceStartFrame: target.sourceStartFrame ?? target.videoStartTime ?? 0,
    sourceEndFrameExclusive: target.sourceEndFrame,
    durationInFrames: target.durationInFrames,
    speedCurve: target.speedCurve,
    sourceBinding: SOURCE_BINDING,
  });
}

function applyShake(project: Project, plan: CameraShakePlan): Project {
  const next = structuredClone(project);
  const update = plan.updates[0];
  const target = next.overlays.find(({ id }) => id === update?.overlayId);
  if (!update || !target) throw new Error('STAGE25_DEP03_OWNER_SHAKE_UPDATE_MISSING');
  target.keyframeTracks = structuredClone(update.nextKeyframeTracks);
  return next;
}

function requireChangedShake(plan: CameraShakePlan): CameraShakePlan & { status: 'changed' } {
  if (plan.status !== 'changed' || plan.updates.length !== 1) {
    throw new Error(`STAGE25_DEP03_OWNER_SHAKE_NOT_APPLIED:${plan.status}`);
  }
  return plan as CameraShakePlan & { status: 'changed' };
}

function requireRebound(
  result: SourcePresentationTimestampRebindV1,
): Extract<SourcePresentationTimestampRebindV1, { disposition: 'REBOUND' }> {
  if (result.disposition !== 'REBOUND' || result.projectFrame !== 50) {
    throw new Error(`STAGE25_DEP03_OWNER_EVENT_NOT_REBOUND:${result.disposition}`);
  }
  return result;
}

function dep03TaskState(
  project: Project,
  rebound: Extract<SourcePresentationTimestampRebindV1, { disposition: 'REBOUND' }>,
): JsonRecord {
  const setup = project.overlays.find(({ id }) => id === 302)!;
  const warning = project.overlays.find(({ id }) => id === 303)!;
  if (setup.type !== 'video' || warning.type !== 'video') {
    throw new Error('STAGE25_DEP03_OWNER_VIDEO_STATE_MISSING');
  }
  return {
    projectId: project.projectId,
    durationInFrames: project.durationInFrames,
    setup: overlayTemporalState(setup),
    warning: overlayTemporalState(warning),
    warningSourcePreserved: warning.from === 60
      && warning.durationInFrames === 120
      && warning.sourceStartFrame === 120
      && warning.sourceEndFrame === 240,
    event: {
      sourcePresentationTimestampTicks: SOURCE_EVENT_PTS_TICKS,
      sourceFrameOrdinal: rebound.sourceFrameOrdinal,
      projectFrame: rebound.projectFrame,
      targetOverlayId: 302,
    },
  };
}

function semanticProjectState(project: Project): JsonRecord {
  return {
    projectId: project.projectId,
    fps: project.fps,
    durationInFrames: project.durationInFrames,
    projectRevision: project.projectRevision,
    overlays: project.overlays.map(overlayTemporalState),
  };
}

function overlayTemporalState(value: Project['overlays'][number]): JsonRecord {
  const video = value.type === 'video' ? value : null;
  return {
    id: value.id,
    type: value.type,
    assetId: value.assetId,
    from: value.from,
    durationInFrames: value.durationInFrames,
    sourceStartFrame: video?.sourceStartFrame ?? video?.videoStartTime ?? null,
    sourceEndFrame: video?.sourceEndFrame ?? null,
    speedCurve: video?.speedCurve ?? [],
    keyframeTracks: value.keyframeTracks ?? [],
  };
}

function materializedEvidence(): readonly Readonly<JsonRecord>[] {
  const base = buildProject();
  return deepFreezeV1([
    evidenceFact({
      evidenceId: 'EV-D03-EVENT',
      visibility: 'PUBLIC_TASK_EVIDENCE',
      assetId: SOURCE_BINDING.assetId,
      semanticEvent: 'lid-click',
      sourcePresentationTimestampTicks: SOURCE_EVENT_PTS_TICKS,
      sourceFrameOrdinal: 100,
    }),
    evidenceFact({
      evidenceId: 'EV-D03-RAMP',
      visibility: 'PUBLIC_TASK_EVIDENCE',
      targetOverlayId: 302,
      targetRange: { startFrame: 0, endFrame: 120 },
      playbackRate: 2,
      closedSemanticForm: 'ISOLATED_WHOLE_SOURCE_RANGE_CFR_FAST_RETIME_V1',
    }),
    evidenceFact({
      evidenceId: 'EV-D03-SPEECH',
      visibility: 'PUBLIC_TASK_EVIDENCE',
      warningOverlayId: 303,
      sourceRange: { startFrame: 120, endFrame: 240 },
      timelineRangeBefore: { startFrame: 120, endFrame: 240 },
      preservation: 'DO_NOT_RETIME_CUT_OR_SHAKE',
    }),
    evidenceFact({
      evidenceId: 'EV-D03-TIMELINE',
      visibility: 'PUBLIC_TASK_EVIDENCE',
      expectedProjectRevision: BEFORE_REVISION,
      projectStateSha256: hashCanonicalJsonV1(semanticProjectState(base)),
    }),
    evidenceFact({
      evidenceId: 'EV-D03-MAPPING',
      visibility: 'PUBLIC_TASK_EVIDENCE',
      publicContractVersion: DEP03_PUBLIC_SPEED_RETIME_CONTRACT_VERSION_V1,
      sourceVersionSha256: SOURCE_BINDING.sourceVersionSha256,
      sourcePtsMapStateSha256: SOURCE_BINDING.sourcePtsMapStateSha256,
      sourceTimeEvidenceRef: `source-time-binding:${SOURCE_BINDING.bindingSha256}`,
    }),
  ]);
}

function evidenceFact(material: JsonRecord): Readonly<JsonRecord> {
  return deepFreezeV1({ ...material, factSha256: hashCanonicalJsonV1(material) });
}

function sourceBinding(): VerifiedVideoSourceTimeBindingV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: VIDEO_SOURCE_TIME_BINDING_KIND_V1,
    assetId: 'dep03-assembly-take',
    sourceVersionSha256: fixtureSha('dep03-source-version'),
    sourcePtsMapStateSha256: fixtureSha('dep03-source-pts-state'),
    mapBindingSha256: fixtureSha('dep03-map-binding'),
    terminalReceiptSha256: fixtureSha('dep03-terminal-receipt'),
    sourceTimebase: { numerator: '1', denominator: '90000' },
    sourceCadence: { kind: 'CFR' as const, durationTicks: '3000' },
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: '720000',
    totalSourceFrameCount: '240',
  };
  return deepFreezeV1({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

function buildProject(): Project {
  return {
    projectId: 'oe-hold-dep-03',
    userId: 'stage25-hold-dep-03-user',
    name: 'HOLD-DEP-03 deterministic owner fixture',
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 240,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date(BEFORE_REVISION.compatibilityUpdatedAt),
    projectRevision: BEFORE_REVISION.value,
    visibility: 'private',
    overlays: [
      overlay({
        id: 302,
        type: 'video',
        assetId: 'dep03-assembly-take',
        row: 0,
        from: 0,
        durationInFrames: 120,
        sourceStartFrame: 0,
        videoStartTime: 0,
        sourceEndFrame: 120,
        styles: { objectFit: 'cover' },
      }),
      overlay({
        id: 303,
        type: 'video',
        assetId: 'dep03-assembly-take',
        row: 0,
        from: 120,
        durationInFrames: 120,
        sourceStartFrame: 120,
        videoStartTime: 120,
        sourceEndFrame: 240,
        styles: { objectFit: 'cover' },
        metadata: { role: 'spoken-warning', preserve: true },
      }),
    ],
  };
}

function operationTrace(
  operatorId: string,
  beforeProjectRevision: ProjectRevisionV1,
  afterProjectRevision: ProjectRevisionV1,
  output: JsonRecord,
): Readonly<JsonRecord> {
  const material = {
    authority: DEP03_ISOLATED_OWNER_AUTHORITY_V1,
    operatorId,
    beforeProjectRevision,
    afterProjectRevision,
    output,
    canonicalProjectMutationCount: 0 as const,
  };
  return deepFreezeV1({ ...material, operationReceiptSha256: hashCanonicalJsonV1(material) });
}

function overlay(value: JsonRecord): Project['overlays'][number] {
  return value as unknown as Project['overlays'][number];
}

function fixtureSha(label: string): string {
  return hashEditronCanonicalJsonV1({ fixture: label });
}
