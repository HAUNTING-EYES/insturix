import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import type { ProviderNativeProposalRecoveryStateV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-proposal-recovery-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCutOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-cut-owner-v2r';
import { PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import type { ProviderNativeToolExecutionV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

const USER_ID = 'cut-owner-user';
const PROJECT_ID = 'cut-owner-project';
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 11,
  compatibilityUpdatedAt: '2026-08-23T12:00:00.000Z',
};
const CHECKPOINT = createProviderNativeEpisodeResumeCheckpointV2R({
  route: {
    routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
    claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
  },
  episodeId: 'cut-owner-episode',
  contextSha256: 'a'.repeat(64),
  toolSetSha256: 'b'.repeat(64),
  completedTurns: [{ turn: 1, marker: 'committed-read-prefix' }],
});

describe('ProjectService isolated cut owner V2R', () => {
  it('uses the canonical cut owner, keeps ProjectService unchanged, and replays in a fresh owner', async () => {
    const canonical = project();
    const projectService = {
      loadProjectForMutation: async () => snapshot(canonical),
    };
    const first = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService,
      isolatedOperatorOwner: createProviderNativeProjectServiceCutOwnerV2R(),
    }).resolve(scope(CHECKPOINT));
    const firstCall = call(2, first.currentRevision.projectRevision, 30, 60);
    const firstExecution = await first.isolatedClone.executeIsolated(firstCall);

    expect(firstExecution).toMatchObject({
      disposition: 'OK',
      output: {
        receipt: { status: 'PASS' },
        timelineCoordinateTransform: {
          removedRange: { startFrame: 30, endFrame: 60 },
          beforeDurationInFrames: 120,
          afterDurationInFrames: 90,
        },
      },
    });
    const writerRevision = receiptRevision(firstExecution);
    expect(writerRevision).toMatch(/^project-proposal-v2r:[a-f0-9]{64}$/);
    expect(canonical.durationInFrames).toBe(120);
    expect(canonical.overlays).toHaveLength(1);

    const resumedCheckpoint = checkpointWith([
      committedWriterTurn(firstCall, firstExecution),
    ]);
    const recovery = await first.isolatedClone.captureProposalRecoveryState?.(
      resumedCheckpoint,
    );
    expect(recovery).toMatchObject({
      isolatedWorkingProjectRevision: writerRevision,
      operations: [{ operatorId: 'cut_section', turn: 2 }],
    });

    const resumed = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService,
      isolatedOperatorOwner: createProviderNativeProjectServiceCutOwnerV2R(),
    }).resolve(scope(resumedCheckpoint, recovery));
    expect(resumed.isolatedClone.proposalRevisionBinding)
      .toMatchObject({ isolatedWorkingProjectRevision: writerRevision });

    const secondCall = call(3, writerRevision, 45, 60);
    const secondExecution = await resumed.isolatedClone.executeIsolated(secondCall);
    expect(secondExecution).toMatchObject({
      disposition: 'OK',
      output: {
        timelineCoordinateTransform: {
          beforeDurationInFrames: 90,
          afterDurationInFrames: 75,
        },
      },
    });
    const receipt = await resumed.isolatedClone.finalizeProposalReceipt?.();
    expect(receipt).toMatchObject({
      canonicalUnchanged: true,
      operationReceipts: [
        { operatorId: 'cut_section', turn: 2 },
        { operatorId: 'cut_section', turn: 3 },
      ],
    });
    expect(receipt?.changedPaths).toEqual(expect.arrayContaining([
      '$.durationInFrames',
    ]));
    expect(canonical.durationInFrames).toBe(120);
  });

  it('rejects forged revisions and non-empty unknown constraints without changing the clone', async () => {
    const canonical = project();
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => snapshot(canonical) },
      isolatedOperatorOwner: createProviderNativeProjectServiceCutOwnerV2R(),
    }).resolve(scope(CHECKPOINT));

    await expect(resolved.isolatedClone.executeIsolated(
      call(2, 'forged-project-revision', 30, 60),
    )).resolves.toMatchObject({
      disposition: 'CONFLICT',
      output: { code: 'PROJECTSERVICE_ISOLATED_CUT_REVISION_CONFLICT' },
    });
    await expect(resolved.isolatedClone.executeIsolated({
      ...call(3, resolved.currentRevision.projectRevision, 30, 60),
      arguments: {
        ...call(3, resolved.currentRevision.projectRevision, 30, 60).arguments,
        constraints: { preserveDialogue: true },
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      output: { code: 'PROJECTSERVICE_ISOLATED_CUT_CONSTRAINTS_UNSUPPORTED' },
    });
    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
    expect(receipt).toMatchObject({
      changedPaths: [],
      operationReceipts: [],
      canonicalUnchanged: true,
    });
  });

  it('fails closed when deterministic replay no longer matches the recorded writer result', async () => {
    const owner = createProviderNativeProjectServiceCutOwnerV2R();
    const base = project();
    const firstCall = call(
      2,
      `project-revision-v1:${hashCanonicalJsonV1(REVISION)}`,
      30,
      60,
    );
    const execution = await owner.execute({
      tenantId: 'tenant-1', userId: USER_ID, projectId: PROJECT_ID,
      checkpoint: CHECKPOINT, project: base, baseRevision: REVISION, call: firstCall,
    });
    const forged = structuredClone(execution) as ProviderNativeToolExecutionV2R;
    (forged.output.receipt as Record<string, unknown>).projectRevision = 'forged';

    await expect(owner.replayCommitted?.({
      tenantId: 'tenant-1', userId: USER_ID, projectId: PROJECT_ID,
      checkpoint: CHECKPOINT, project: project(), baseRevision: REVISION,
      call: firstCall, recordedExecution: forged,
    })).rejects.toThrow('PROJECTSERVICE_ISOLATED_CUT_REPLAY_MISMATCH');
  });
});

function call(turn: number, expectedProjectRevision: string, startFrame: number, endFrame: number) {
  return {
    operatorId: 'cut_section',
    arguments: {
      projectId: PROJECT_ID,
      expectedProjectRevision,
      targetRange: { startFrame, endFrame },
      evidenceIds: ['EV-CUT'],
    },
    turn,
  } as const;
}

function checkpointWith(completedTurns: readonly Record<string, unknown>[]) {
  return createProviderNativeEpisodeResumeCheckpointV2R({
    route: CHECKPOINT.route,
    episodeId: CHECKPOINT.episodeId,
    contextSha256: CHECKPOINT.contextSha256,
    toolSetSha256: CHECKPOINT.toolSetSha256,
    completedTurns: [...CHECKPOINT.completedTurns, ...completedTurns],
  });
}

function committedWriterTurn(
  writerCall: ReturnType<typeof call>,
  execution: Readonly<ProviderNativeToolExecutionV2R>,
) {
  const writerRevision = receiptRevision(execution);
  return {
    turn: writerCall.turn,
    modelCall: {
      callId: `call-${writerCall.turn}`,
      name: writerCall.operatorId,
      arguments: writerCall.arguments,
    },
    normalizedArguments: writerCall.arguments,
    execution,
    issuedResultReferences: [{
      version: PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
      resultReferenceId: `result_t${writerCall.turn}_1`,
      originTurn: writerCall.turn,
      sourceOperatorId: writerCall.operatorId,
      sourceOutputField: 'receipt.projectRevision',
      sourceOutputPath: ['receipt', 'projectRevision'],
      valueKind: 'STRING',
      valueSha256: hashCanonicalJsonV1(writerRevision),
    }],
  };
}

function receiptRevision(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  return String((execution.output.receipt as Record<string, unknown>).projectRevision);
}

function scope(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> = CHECKPOINT,
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>,
) {
  return {
    tenantId: 'tenant-1', userId: USER_ID, projectId: PROJECT_ID, checkpoint,
    ...(proposalRecoveryState ? { proposalRecoveryState } : {}),
  };
}

function snapshot(value: Project) {
  return { project: structuredClone(value), revision: REVISION };
}

function project(): Project {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: 'Cut owner project',
    overlays: [{
      id: 101,
      type: 'video',
      assetId: 'source-video',
      src: '/source-video.mp4',
      row: 0,
      from: 0,
      durationInFrames: 120,
      sourceStartFrame: 0,
      videoStartTime: 0,
    } as unknown as Project['overlays'][number]],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 120,
    createdAt: new Date('2026-08-23T11:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value,
    visibility: 'private',
  };
}
