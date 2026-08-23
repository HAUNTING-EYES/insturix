import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { bindProviderNativeDurableOutcomeProofReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-outcome-proof-v2r';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import {
  createProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-proposal-recovery-v2r';
import { PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { projectProposalStateV2R }
  from '@/lib/editron/research/open-ended-planner/project-service-proposal-state-v2r';
import {
  PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  type ProviderNativeToolExecutionV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

const USER_ID = 'user-1';
const PROJECT_ID = 'project-1';
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: '2026-08-23T10:00:00.000Z',
};
const CHECKPOINT = createProviderNativeEpisodeResumeCheckpointV2R({
  route: {
    routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
    claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
  },
  episodeId: 'proposal-episode-1',
  contextSha256: 'a'.repeat(64),
  toolSetSha256: 'b'.repeat(64),
  completedTurns: [{ turn: 1, marker: 'committed-prefix' }],
});

describe('ProjectService-backed provider-native proposal clone V2R', () => {
  it('executes only on the clone and finalizes a hash-bound changed-path receipt', async () => {
    const canonical = project();
    const loadProjectForMutation = vi.fn(async () => snapshot(canonical));
    const writerExecution = ok({ receipt: { projectRevision: 'local-proposal-r1' } });
    const execute = vi.fn(async ({ project: clone }: { project: Project }) => {
      (clone.overlays[0].styles as Record<string, unknown>).opacity = 0.5;
      return writerExecution;
    });
    const prove = vi.fn(async (input: Readonly<{
      project: Readonly<Project>;
      episodeReceipt: Readonly<{ receiptSha256: string; episodeId: string }>;
      resumedReceiptSha256: string;
      proposalReceipt: Readonly<{ receiptSha256: string; finalStateSha256: string }>;
    }>) => {
      expect((input.project.overlays[0].styles as Record<string, unknown>).opacity).toBe(0.5);
      return proofReceipt(input);
    });
    const owner = createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation },
      isolatedOperatorOwner: { execute },
      isolatedOutcomeProofOwner: { prove },
    });

    const resolved = await owner.resolve(scope());
    expect(resolved.currentRevision.projectRevision)
      .toMatch(/^project-revision-v1:[a-f0-9]{64}$/);
    expect(resolved.currentRevision.projectRevision)
      .toBe(resolved.isolatedClone.projectRevision);
    expect(resolved.currentRevision.readReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    const proposalRevisionBinding = resolved.isolatedClone.proposalRevisionBinding!;
    expect(proposalRevisionBinding).toMatchObject({
      authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_BINDING',
      canonicalBaseProjectRevision: resolved.currentRevision.projectRevision,
      canonicalBaseStateSha256: resolved.isolatedClone.stateSha256,
      isolatedWorkingProjectRevision: resolved.currentRevision.projectRevision,
      isolatedWorkingStateSha256: resolved.isolatedClone.stateSha256,
    });
    const { bindingSha256, ...bindingMaterial } = proposalRevisionBinding;
    expect(bindingSha256).toBe(hashCanonicalJsonV1(bindingMaterial));

    const writerCall = {
      operatorId: 'set_keyframes', arguments: { overlayId: 'overlay-1' }, turn: 2,
    } as const;
    await expect(resolved.isolatedClone.executeIsolated(writerCall)).resolves.toMatchObject({
      disposition: 'OK',
    });
    const recovery = await resolved.isolatedClone.captureProposalRecoveryState?.(
      checkpointWith([
        ...CHECKPOINT.completedTurns,
        committedWriterTurn(writerCall, writerExecution),
      ]),
    );
    expect(recovery).toMatchObject({
      isolatedWorkingProjectRevision: 'local-proposal-r1',
      operations: [{ operatorId: 'set_keyframes', turn: 2 }],
    });
    expect((canonical.overlays[0].styles as Record<string, unknown>).opacity).toBe(1);

    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
    expect(receipt).toMatchObject({
      authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_NO_PROJECT_MUTATION',
      projectId: PROJECT_ID,
      baseProjectRevision: resolved.isolatedClone.projectRevision,
      baseStateSha256: resolved.isolatedClone.stateSha256,
      canonicalUnchanged: true,
      changedPaths: ['$.overlays[0].styles.opacity'],
    });
    expect(receipt?.finalStateSha256).not.toBe(receipt?.baseStateSha256);
    expect(receipt?.operationReceipts).toHaveLength(1);
    const { receiptSha256, ...material } = receipt!;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(material));
    const outcomeProof = await resolved.isolatedClone.finalizeOutcomeProof?.({
      episodeReceipt: episodeReceipt(),
      resumedReceiptSha256: 'd'.repeat(64),
      proposalReceipt: receipt!,
    });
    expect(outcomeProof).toMatchObject({ disposition: 'PASS' });
    expect(prove).toHaveBeenCalledTimes(1);
    expect((canonical.overlays[0].styles as Record<string, unknown>).opacity).toBe(1);
    expect(loadProjectForMutation).toHaveBeenCalledTimes(6);
  });

  it('reconstructs an exact committed prefix through the pure replay port', async () => {
    const fixture = recoveryFixture();
    const canonical = project();
    const replayCommitted = vi.fn(async ({
      project: clone,
      call,
      recordedExecution,
    }: {
      project: Project;
      call: { operatorId: string; turn: number };
      recordedExecution: Readonly<ProviderNativeToolExecutionV2R>;
    }) => {
      expect(call).toMatchObject({ operatorId: 'set_keyframes', turn: 1 });
      (clone.overlays[0].styles as Record<string, unknown>).opacity = 0.5;
      return recordedExecution;
    });
    const execute = vi.fn();
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => snapshot(canonical) },
      isolatedOperatorOwner: { execute, replayCommitted },
    }).resolve(scope(fixture.checkpoint, fixture.recovery));

    expect(replayCommitted).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(resolved.isolatedClone.proposalRevisionBinding).toMatchObject({
      isolatedWorkingProjectRevision: 'local-proposal-r1',
      isolatedWorkingStateSha256: fixture.recovery.isolatedWorkingStateSha256,
    });
    expect((canonical.overlays[0].styles as Record<string, unknown>).opacity).toBe(1);
    const recaptured = await resolved.isolatedClone.captureProposalRecoveryState?.(
      fixture.checkpoint,
    );
    expect(recaptured).toEqual(fixture.recovery);
    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
    expect(receipt).toMatchObject({
      finalStateSha256: fixture.recovery.isolatedWorkingStateSha256,
      operationReceipts: [{ operatorId: 'set_keyframes', turn: 1 }],
      canonicalUnchanged: true,
    });
  });

  it('rejects committed writer history without recovery state or a replay owner', async () => {
    const fixture = recoveryFixture();
    const projectService = { loadProjectForMutation: async () => snapshot(project()) };
    await expect(createProviderNativeProjectServiceCloneOwnerV2R({
      projectService,
      isolatedOperatorOwner: { execute: vi.fn(), replayCommitted: vi.fn() },
    }).resolve(scope(fixture.checkpoint))).rejects.toThrow(
      'PROJECTSERVICE_PROPOSAL_RECOVERY_REQUIRED',
    );
    await expect(createProviderNativeProjectServiceCloneOwnerV2R({
      projectService,
      isolatedOperatorOwner: { execute: vi.fn() },
    }).resolve(scope(fixture.checkpoint, fixture.recovery))).rejects.toThrow(
      'PROJECTSERVICE_PROPOSAL_REPLAY_OWNER_REQUIRED',
    );
  });

  it.each(['execution', 'state'] as const)(
    'rejects %s drift while replaying a committed prefix',
    async (drift) => {
      const fixture = recoveryFixture();
      await expect(createProviderNativeProjectServiceCloneOwnerV2R({
        projectService: { loadProjectForMutation: async () => snapshot(project()) },
        isolatedOperatorOwner: {
          execute: vi.fn(),
          replayCommitted: async ({ project: clone, recordedExecution }) => {
            (clone.overlays[0].styles as Record<string, unknown>).opacity =
              drift === 'state' ? 0.4 : 0.5;
            return drift === 'execution'
              ? ok({ receipt: { projectRevision: 'forged-revision' } })
              : recordedExecution;
          },
        },
      }).resolve(scope(fixture.checkpoint, fixture.recovery))).rejects.toThrow(
        'PROJECTSERVICE_PROPOSAL_REPLAY_RESULT_MISMATCH',
      );
    },
  );

  it('rolls back an OK clone mutation that lacks a writer-issued revision', async () => {
    const canonical = project();
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => snapshot(canonical) },
      isolatedOperatorOwner: { execute: async ({ project: clone }) => {
        clone.name = 'unreceipted';
        return ok({});
      } },
    }).resolve(scope());

    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'update_title', arguments: {}, turn: 2,
    })).rejects.toThrow('PROJECTSERVICE_PROPOSAL_WRITER_REVISION_REQUIRED');
    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
    expect(receipt).toMatchObject({ changedPaths: [], operationReceipts: [] });
  });

  it('returns a structured conflict before execution when the canonical base is stale', async () => {
    const loadProjectForMutation = vi.fn()
      .mockResolvedValueOnce(snapshot(project()))
      .mockResolvedValueOnce(snapshot(project(revision(8))));
    const execute = vi.fn();
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation }, isolatedOperatorOwner: { execute },
    }).resolve(scope());

    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'cut_section', arguments: {}, turn: 1,
    })).resolves.toMatchObject({
      disposition: 'CONFLICT', output: { code: 'PROJECTSERVICE_PROPOSAL_BASE_STALE' },
    });
    expect(execute).not.toHaveBeenCalled();
    await expect(resolved.isolatedClone.finalizeProposalReceipt?.())
      .rejects.toThrow('PROJECTSERVICE_PROPOSAL_BASE_STALE');
  });

  it('discards a speculative clone mutation when the canonical project changes after execution', async () => {
    const canonical = project();
    const newer = project(revision(8));
    const loadProjectForMutation = vi.fn()
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(newer));
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation },
      isolatedOperatorOwner: { execute: async ({ project: clone }) => {
        clone.name = 'speculative';
        return ok({});
      } },
    }).resolve(scope());

    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'update_title', arguments: {}, turn: 1,
    })).resolves.toMatchObject({
      disposition: 'CONFLICT', output: { code: 'PROJECTSERVICE_PROPOSAL_BASE_STALE' },
    });
    await expect(resolved.isolatedClone.finalizeProposalReceipt?.())
      .rejects.toThrow('PROJECTSERVICE_PROPOSAL_BASE_STALE');
  });

  it('rejects proof when the canonical project changes during inspection', async () => {
    const canonical = project();
    const newer = project(revision(8));
    const loadProjectForMutation = vi.fn()
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(canonical))
      .mockResolvedValueOnce(snapshot(newer));
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation },
      isolatedOperatorOwner: { execute: async ({ project: clone }) => {
        (clone.overlays[0].styles as Record<string, unknown>).opacity = 0.5;
        return ok({ receipt: { projectRevision: 'local-proposal-r1' } });
      } },
      isolatedOutcomeProofOwner: { prove: async (input) => proofReceipt(input) },
    }).resolve(scope());
    await resolved.isolatedClone.executeIsolated({
      operatorId: 'set_keyframes', arguments: { overlayId: 'overlay-1' }, turn: 1,
    });
    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();
    await expect(resolved.isolatedClone.finalizeOutcomeProof?.({
      episodeReceipt: episodeReceipt(),
      resumedReceiptSha256: 'd'.repeat(64),
      proposalReceipt: receipt!,
    })).rejects.toThrow('PROJECTSERVICE_PROPOSAL_BASE_STALE');
    expect((canonical.overlays[0].styles as Record<string, unknown>).opacity).toBe(1);
  });

  it('rolls back failed operations and rejects clone identity forgery', async () => {
    const canonical = project();
    let attempt = 0;
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => snapshot(canonical) },
      isolatedOperatorOwner: { execute: async ({ project: clone }) => {
        attempt += 1;
        if (attempt === 1) {
          clone.name = 'must-not-survive';
          return failure('FORM_UNVERIFIABLE');
        }
        expect(clone.name).toBe('Project');
        clone.projectId = 'forged-project';
        return ok({});
      } },
    }).resolve(scope());

    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'first', arguments: {}, turn: 1,
    })).resolves.toMatchObject({ disposition: 'UNVERIFIABLE' });
    await expect(resolved.isolatedClone.executeIsolated({
      operatorId: 'second', arguments: {}, turn: 2,
    })).rejects.toThrow('PROJECTSERVICE_PROPOSAL_CLONE_IDENTITY_MUTATED');
  });

  it('rejects sparse stored state before exposing an isolated executor', async () => {
    const malformed = project();
    malformed.overlays = Array(2) as Project['overlays'];
    await expect(createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => snapshot(malformed) },
      isolatedOperatorOwner: { execute: vi.fn() },
    }).resolve(scope())).rejects.toThrow('PROJECTSERVICE_PROPOSAL_STATE_SPARSE_ARRAY');
  });
});

function scope(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> = CHECKPOINT,
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>,
) {
  return {
    tenantId: 'tenant-1', userId: USER_ID, projectId: PROJECT_ID, checkpoint,
    ...(proposalRecoveryState ? { proposalRecoveryState } : {}),
  };
}

function recoveryFixture() {
  const base = project();
  const after = project();
  (after.overlays[0].styles as Record<string, unknown>).opacity = 0.5;
  const writerExecution = ok({ receipt: { projectRevision: 'local-proposal-r1' } });
  const call = { operatorId: 'set_keyframes', arguments: { overlayId: 'overlay-1' }, turn: 1 };
  const checkpoint = checkpointWith([committedWriterTurn(call, writerExecution)]);
  const recovery = createProviderNativeProposalRecoveryStateV2R({
    checkpoint,
    projectId: PROJECT_ID,
    canonicalBaseProjectRevision: `project-revision-v1:${hashCanonicalJsonV1(REVISION)}`,
    canonicalBaseStateSha256: hashCanonicalJsonV1(projectProposalStateV2R(base)),
    operations: [{
      turn: 1,
      beforeStateSha256: hashCanonicalJsonV1(projectProposalStateV2R(base)),
      afterStateSha256: hashCanonicalJsonV1(projectProposalStateV2R(after)),
    }],
  });
  return { checkpoint, recovery };
}

function checkpointWith(completedTurns: readonly Record<string, unknown>[]) {
  return createProviderNativeEpisodeResumeCheckpointV2R({
    route: CHECKPOINT.route,
    episodeId: CHECKPOINT.episodeId,
    contextSha256: CHECKPOINT.contextSha256,
    toolSetSha256: CHECKPOINT.toolSetSha256,
    completedTurns,
  });
}

function committedWriterTurn(
  call: Readonly<{ operatorId: string; arguments: Readonly<Record<string, unknown>>; turn: number }>,
  execution: Readonly<ProviderNativeToolExecutionV2R>,
) {
  const writerRevision = ((execution.output.receipt as Record<string, unknown>)
    .projectRevision) as string;
  return {
    turn: call.turn,
    modelCall: { callId: `call-${call.turn}`, name: call.operatorId, arguments: call.arguments },
    normalizedArguments: call.arguments,
    execution,
    issuedResultReferences: [{
      version: PROVIDER_NATIVE_RESULT_REFERENCE_VERSION_V2R,
      resultReferenceId: `result_t${call.turn}_1`,
      originTurn: call.turn,
      sourceOperatorId: call.operatorId,
      sourceOutputField: 'receipt.projectRevision',
      sourceOutputPath: ['receipt', 'projectRevision'],
      valueKind: 'STRING',
      valueSha256: hashCanonicalJsonV1(writerRevision),
    }],
  };
}

function snapshot(value: Project) {
  return { project: structuredClone(value), revision: revision(value.projectRevision ?? 0) };
}

function revision(value: number): ProjectRevisionV1 {
  return {
    ...REVISION,
    value,
    compatibilityUpdatedAt: `2026-08-23T10:00:0${value - 7}.000Z`,
  };
}

function project(projectRevision = REVISION): Project {
  return {
    projectId: PROJECT_ID, userId: USER_ID, name: 'Project',
    overlays: [{
      id: 'overlay-1', type: 'text', startFrame: 0, endFrame: 60,
      styles: { opacity: 1 },
    } as unknown as Project['overlays'][number]],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 60,
    createdAt: new Date('2026-08-23T09:00:00.000Z'),
    updatedAt: new Date(projectRevision.compatibilityUpdatedAt),
    projectRevision: projectRevision.value, visibility: 'private',
  };
}

function ok(output: Record<string, unknown>): Readonly<ProviderNativeToolExecutionV2R> {
  return {
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK', output, evidenceIds: [],
  };
}

function failure(code: string): Readonly<ProviderNativeToolExecutionV2R> {
  return {
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'UNVERIFIABLE',
    output: { code, message: 'The isolated owner could not prove the requested form.' },
    evidenceIds: [],
  };
}

function episodeReceipt() {
  return {
    receiptVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    route: CHECKPOINT.route,
    episodeId: CHECKPOINT.episodeId,
    contextSha256: CHECKPOINT.contextSha256,
    toolSetSha256: CHECKPOINT.toolSetSha256,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES' as const,
    selectedOperatorIds: ['set_keyframes'], turns: [],
    terminal: {
      disposition: 'READY_FOR_PROOF' as const,
      reasonCodes: ['MODEL_READY_FOR_PROOF'], evidenceIds: [], summary: 'Ready.',
    },
    productOutcome: 'NOT_EVALUATED_ADAPTER_ONLY' as const,
    stateEffects: [] as const,
    transcriptSha256: 'c'.repeat(64),
    receiptSha256: 'c'.repeat(64),
  };
}

function proofReceipt(input: Readonly<{
  episodeReceipt: Readonly<{ receiptSha256: string; episodeId: string }>;
  resumedReceiptSha256: string;
  proposalReceipt: Readonly<{ receiptSha256: string; finalStateSha256: string }>;
}>) {
  return bindProviderNativeDurableOutcomeProofReceiptV2R({
    tenantId: 'tenant-1', userId: USER_ID, projectId: PROJECT_ID,
    episodeId: input.episodeReceipt.episodeId,
    subject: {
      episodeReceiptSha256: input.episodeReceipt.receiptSha256,
      resumedReceiptSha256: input.resumedReceiptSha256,
      proposalReceiptSha256: input.proposalReceipt.receiptSha256,
      finalStateSha256: input.proposalReceipt.finalStateSha256,
    },
    proofPolicy: {
      policyId: 'test-render-policy', policyVersion: 'v1',
      policySha256: '2'.repeat(64),
    },
    obligations: [{
      obligationId: 'rendered-outcome', kind: 'render', disposition: 'PASS',
      proofReferenceIds: ['render-proof-1'],
    }],
    proofReferences: [{
      proofId: 'render-proof-1', proofSha256: '3'.repeat(64), disposition: 'PASS',
    }],
    observedAt: '2026-08-23T10:05:00.000Z', summary: 'Test proof.',
  });
}
