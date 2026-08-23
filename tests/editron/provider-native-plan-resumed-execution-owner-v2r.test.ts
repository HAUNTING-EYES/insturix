import { describe, expect, it, vi } from 'vitest';

import { bindProviderNativeEpisodeDefinitionArtifactV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-bound-episode-definition-v2r';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type { ProviderNativeDurableArtifactOwnersV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-owner-artifact-resolver-v2r';
import { ProviderNativeDurableRetryableErrorV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-durable-worker-v2r';
import type { ProviderNativeDurableAttemptReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-attempt-receipt-v2r';
import type { ProviderNativeDurableDispatchIntentV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-dispatch-intent-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import {
  createProviderNativePlanExecutionEnvelopeV2R,
  providerNativeEligibleOperationSetRefV2R,
  providerNativePlanExecutionEnvelopeSchemaRefV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-plan-execution-envelope-v2r';
import {
  createProviderNativePlanExecutionOwnerV2R,
  createProviderNativePlanResumedExecutionOwnerV2R,
}
  from '@/lib/editron/research/open-ended-planner/provider-native-plan-resumed-execution-owner-v2r';
import {
  createProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-proposal-recovery-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeRuntimeGuardV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import {
  PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
  type ProviderNativeRuntimeGuardResumeStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { createOrGetEditorialPlanDurableJobV1 }
  from '@/lib/editron/services/editorial-plan-durable-job-binding-v1';
import { runEditorialPlanDurableWorkerV1 }
  from '@/lib/editron/services/editorial-plan-durable-worker-v1';
import {
  createEditorialPlanExecutionDefinitionV1,
  executionDefinitionRefV1,
} from '@/lib/editron/services/editorial-plan-execution-definition-v1';
import { createEditorialPlanRevisionV1, type EditorialPlanArtifactRefV1 }
  from '@/lib/editron/services/editorial-plan-v1';
import {
  createEditorialPlanDurableFixtureStoresV1,
  EDITORIAL_PLAN_FIXTURE_START_V1 as START,
  editorialPlanFixtureInputV1,
} from './helpers/editorial-plan-durable-fixture-v1';

type JsonRecord = Record<string, unknown>;

const HASH = 'a'.repeat(64);
const GUARD_HASH = 'b'.repeat(64);
const BASE_STATE_SHA = 'c'.repeat(64);
const WRITER_STATE_SHA = 'd'.repeat(64);
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const ELIGIBLE = ['set_keyframes'] as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'plan-resume-episode-1',
  objective: 'Resume one already-started isolated keyframe proposal.',
  activeTarget: { taskId: 'PLAN-RESUME-INTEGRATION' },
  revisionBinding: { projectId: 'project-a', expectedProjectRevision: 'revision-r7' },
  projectState: { projectId: 'project-a', projectRevision: 'revision-r7' },
  evidence: [],
  preservationRules: ['Never mutate the canonical project.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
  budget: { maxTurns: 3, maxOutputTokensPerTurn: 256, maxIdenticalCalls: 1 },
};

describe('provider-native PlanService resumed execution owner V2R', () => {
  it('starts a fresh Plan episode without inventing a resume checkpoint', async () => {
    const setup = await prepared('fresh', finishResponse());
    const result = await runEditorialPlanDurableWorkerV1({
      jobStore: setup.jobStore,
      planStore: setup.planStore(),
      jobId: setup.jobId,
      workerId: 'plan-provider-worker-fresh',
      executionOwner: createProviderNativePlanExecutionOwnerV2R({
        artifactOwners: setup.artifactOwners,
      }),
      clock: () => START,
    });

    expect(result).toMatchObject({ kind: 'completed', disposition: 'UNVERIFIABLE' });
    expect(setup.invoke).toHaveBeenCalledOnce();
    expect(setup.freshProjectClone).toHaveBeenCalledWith({
      tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
      episodeId: CONTEXT.episodeId,
    });
    const persisted = await setup.jobStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
    });
    expect(persisted?.terminalReceipt?.proofReferences[0]).toMatchObject({
      proofId: `provider_native_fresh_${CONTEXT.episodeId}`,
      disposition: 'UNVERIFIABLE',
    });
  });

  it('resumes through the real Plan worker and stores one owner-bound receipt', async () => {
    const setup = await prepared('resumed', finishResponse());
    const result = await runEditorialPlanDurableWorkerV1({
      jobStore: setup.jobStore,
      planStore: setup.planStore(),
      jobId: setup.jobId,
      workerId: 'plan-provider-worker-a',
      executionOwner: createProviderNativePlanResumedExecutionOwnerV2R({
        artifactOwners: setup.artifactOwners,
      }),
      clock: () => START,
    });

    expect(result).toMatchObject({ kind: 'completed', disposition: 'UNVERIFIABLE' });
    expect(setup.invoke).toHaveBeenCalledOnce();
    expect(setup.projectClone).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-a',
      proposalRecoveryState: setup.recovery,
    }));
    await expect(setup.jobStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
    })).resolves.toMatchObject({
      status: 'completed',
      terminalReceipt: {
        disposition: 'UNVERIFIABLE',
        proofReferences: [{ disposition: 'UNVERIFIABLE' }],
      },
    });
  });

  it('persists dispatch and attempt checkpoints before terminalizing a transient', async () => {
    const setup = await prepared('resumed', {
      status: 429, body: { error: { message: 'test rate limit' } },
    });
    const result = await runEditorialPlanDurableWorkerV1({
      jobStore: setup.jobStore,
      planStore: setup.planStore(),
      jobId: setup.jobId,
      workerId: 'plan-provider-worker-b',
      executionOwner: createProviderNativePlanResumedExecutionOwnerV2R({
        artifactOwners: setup.artifactOwners,
      }),
      clock: () => START,
    });

    expect(result).toMatchObject({
      kind: 'completed', jobId: setup.jobId, disposition: 'UNVERIFIABLE',
    });
    const persisted = await setup.jobStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
    });
    expect(persisted?.resumeState?.sequence).toBe(2);
    const payload = persisted?.resumeState?.payload as JsonRecord;
    const checkpoint = payload.checkpoint as ProviderNativeEpisodeResumeCheckpointV2R;
    expect('pendingProviderDispatchIntent' in checkpoint).toBe(false);
    expect('accountedProviderAttempts' in checkpoint
      ? checkpoint.accountedProviderAttempts : []).toHaveLength(1);
    expect('accountedProviderAttempts' in checkpoint
      ? checkpoint.accountedProviderAttempts[0].result : null).toMatchObject({
      kind: 'RESPONSE_RECEIVED', responseStatus: 429,
    });
  });

  it('retries a typed artifact failure that occurs before provider invocation', async () => {
    const setup = await prepared('resumed', finishResponse());
    const artifactOwners: ProviderNativeDurableArtifactOwnersV2R = {
      ...setup.artifactOwners,
      projectClone: { resolve: async () => {
        throw new ProviderNativeDurableRetryableErrorV2R(
          'ARTIFACT_STORE_TIMEOUT', 'Project clone owner timed out.',
        );
      } },
    };
    const result = await runEditorialPlanDurableWorkerV1({
      jobStore: setup.jobStore,
      planStore: setup.planStore(),
      jobId: setup.jobId,
      workerId: 'plan-provider-worker-artifact-retry',
      executionOwner: createProviderNativePlanResumedExecutionOwnerV2R({ artifactOwners }),
      clock: () => START,
    });

    expect(result).toEqual({
      kind: 'retry_wait', jobId: setup.jobId, errorCode: 'ARTIFACT_STORE_TIMEOUT',
    });
    expect(setup.invoke).not.toHaveBeenCalled();
  });

  it('refuses a legacy runtime guard before provider invocation', async () => {
    const setup = await prepared('resumed', finishResponse());
    const artifactOwners: ProviderNativeDurableArtifactOwnersV2R = {
      ...setup.artifactOwners,
      runtimeGuard: { resolve: async () => legacyRuntimeGuard() },
    };
    const result = await runEditorialPlanDurableWorkerV1({
      jobStore: setup.jobStore,
      planStore: setup.planStore(),
      jobId: setup.jobId,
      workerId: 'plan-provider-worker-legacy-guard',
      executionOwner: createProviderNativePlanResumedExecutionOwnerV2R({ artifactOwners }),
      clock: () => START,
    });

    expect(result).toEqual({
      kind: 'dead_letter', jobId: setup.jobId, errorCode: 'PLAN_EXECUTION_FAILED',
    });
    expect(setup.invoke).not.toHaveBeenCalled();
  });

  it('rejects a fresh envelope before resolving an artifact or provider', async () => {
    const setup = await prepared('fresh', finishResponse());
    const owner = createProviderNativePlanResumedExecutionOwnerV2R({
      artifactOwners: setup.artifactOwners,
    });
    expect(() => owner.assertDefinitionSupported({
      plan: setup.active, node: setup.active.nodes[0], definition: setup.definition,
    })).toThrow('PROVIDER_NATIVE_PLAN_FRESH_EXECUTION_NOT_SUPPORTED');
    expect(setup.invoke).not.toHaveBeenCalled();
    expect(setup.projectClone).not.toHaveBeenCalled();
  });
});

async function prepared(
  mode: 'fresh' | 'resumed',
  providerResponse: Readonly<{ status: number; body: unknown }>,
) {
  const artifact = bindProviderNativeEpisodeDefinitionArtifactV2R({
    tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    source: { ownerId: 'TEST_EPISODE_OWNER', ownerVersion: 'v1', ownerSha256: HASH },
    context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
  });
  const checkpoint = mode === 'resumed' ? await writerCheckpoint() : null;
  const recovery = checkpoint ? createProviderNativeProposalRecoveryStateV2R({
    checkpoint,
    projectId: 'project-a',
    canonicalBaseProjectRevision: 'revision-r7',
    canonicalBaseStateSha256: BASE_STATE_SHA,
    operations: [{
      turn: 1,
      beforeStateSha256: BASE_STATE_SHA,
      afterStateSha256: WRITER_STATE_SHA,
    }],
  }) : null;
  const envelope = createProviderNativePlanExecutionEnvelopeV2R({
    boundEpisodeDefinition: artifact,
    route: ROUTE,
    runtimeGuardBinding: {
      guardKind: 'TEST_RUNTIME_GUARD', guardIdentitySha256: GUARD_HASH,
    },
    ...(checkpoint ? { resumeCheckpoint: checkpoint } : {}),
    ...(recovery ? { resumeProposalRecoveryState: recovery } : {}),
  });
  const eligibleOperationSetRef = providerNativeEligibleOperationSetRefV2R(envelope);
  const budget = ref('BUDGET_SERVICE', 'test-runtime-budget', GUARD_HASH);
  const sourceInput = editorialPlanFixtureInputV1();
  const sourceNode = {
    ...sourceInput.nodes[0], eligibleOperationSetRef, budgetReservationRefs: [budget],
  };
  const source = createEditorialPlanRevisionV1({ ...sourceInput, nodes: [sourceNode] });
  const stores = createEditorialPlanDurableFixtureStoresV1();
  await stores.planStore().createInitial(source, START);
  const definition = createEditorialPlanExecutionDefinitionV1({
    version: 'EDITRON_PLAN_EXECUTION_DEFINITION_V1_1',
    tenantId: source.tenantId, userId: source.userId, projectId: source.projectId,
    definitionId: 'provider-native-resume-definition', episodeId: CONTEXT.episodeId,
    sourcePlanBinding: {
      planId: source.planId,
      planRevision: source.planRevision,
      planRevisionSha256: source.revisionSha256,
      nodeId: sourceNode.nodeId,
      nodeVersion: sourceNode.nodeVersion,
      nodeSha256: hashEditronCanonicalJsonV1(sourceNode),
    },
    plannerEnvelopeSchemaRef: providerNativePlanExecutionEnvelopeSchemaRefV2R(),
    plannerEnvelope: envelope,
    eligibleOperationSetRef,
    privacyPolicyRef: ref('POLICY_SERVICE', 'privacy-v1', HASH),
    proofPolicyRef: ref('PROOF_SERVICE', 'proof-v1', HASH),
    budgetReservationRefs: [budget],
    createdBy: { actorId: 'system-planner', actorKind: 'SYSTEM' },
    createdAt: START.toISOString(),
  });
  await stores.planStore().putExecutionDefinition(definition, START);
  const active = createEditorialPlanRevisionV1({
    ...sourceInput,
    planRevision: 2,
    previousRevisionSha256: source.revisionSha256,
    nodes: [{
      ...sourceNode,
      nodeVersion: 2,
      executionDefinitionRef: executionDefinitionRefV1(definition),
    }],
    changeReason: 'Attach the exact provider-native resume definition.',
  });
  await stores.planStore().appendSuccessor({
    plan: active,
    expectedCurrentRevisionSha256: source.revisionSha256,
    now: START,
  });
  const jobStore = stores.jobStoreFactory();
  const { job } = await createOrGetEditorialPlanDurableJobV1({
    planStore: stores.planStore(), jobStore, now: START,
    request: {
      tenantId: active.tenantId, userId: active.userId, projectId: active.projectId,
      planId: active.planId, planRevision: active.planRevision,
      planRevisionSha256: active.revisionSha256,
      nodeId: active.nodes[0].nodeId, nodeVersion: active.nodes[0].nodeVersion,
      parentCommandId: null, parentReceiptId: null, maxAttempts: 3,
    },
  });

  const invoke = vi.fn(async () => providerResponse);
  const projectClone = vi.fn(async (input: Readonly<{
    proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
  }>) => ({
    currentRevision: {
      origin: 'PROJECTSERVICE_CURRENT_REVISION_READ' as const,
      projectRevision: 'revision-r7',
      readReceiptId: 'test-current-revision-read',
      readReceiptSha256: HASH,
    },
    isolatedClone: isolatedClone(input.proposalRecoveryState),
  }));
  const freshProjectClone = vi.fn(async (_input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
  }>) => ({
    currentRevision: {
      origin: 'PROJECTSERVICE_CURRENT_REVISION_READ' as const,
      projectRevision: 'revision-r7',
      readReceiptId: 'test-current-revision-read',
      readReceiptSha256: HASH,
    },
    isolatedClone: isolatedClone(),
  }));
  const artifactOwners: ProviderNativeDurableArtifactOwnersV2R = {
    episodeDefinition: { resolve: async () => ({ context: CONTEXT, eligibleOperatorIds: ELIGIBLE }) },
    projectClone: { resolve: projectClone, resolveFresh: freshProjectClone },
    transport: { resolve: async () => invoke },
    runtimeGuard: { resolve: async () => runtimeGuard() },
  };
  return {
    ...stores, jobStore, jobId: job.jobId, active, definition,
    artifactOwners, invoke, projectClone, freshProjectClone, recovery,
  };
}

function isolatedClone(recovery?: Readonly<ProviderNativeProposalRecoveryStateV2R>) {
  const workingRevision = recovery ? 'revision-r8' : 'revision-r7';
  const workingStateSha256 = recovery ? WRITER_STATE_SHA : BASE_STATE_SHA;
  const material = {
    schemaVersion: 1 as const,
    authority: 'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_BINDING' as const,
    canonicalBaseProjectRevision: 'revision-r7',
    canonicalBaseStateSha256: BASE_STATE_SHA,
    isolatedWorkingProjectRevision: workingRevision,
    isolatedWorkingStateSha256: workingStateSha256,
  };
  return {
    origin: 'PROJECTSERVICE_REVISION_CLONE' as const,
    projectRevision: 'revision-r7',
    stateSha256: BASE_STATE_SHA,
    proposalRevisionBinding: {
      ...material, bindingSha256: hashCanonicalJsonV1(material),
    },
    executeIsolated: vi.fn(),
    captureProposalRecoveryState: async () => recovery,
  };
}

async function writerCheckpoint(): Promise<Readonly<ProviderNativeEpisodeResumeCheckpointV2R>> {
  let checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  try {
    await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: CONTEXT,
      eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      runtimeGuard: runtimeGuard(),
      invoke: async () => call('writer', 'set_keyframes', {
        projectId: 'project-a', expectedProjectRevision: 'revision-r7',
        overlayId: 1, keyframes: [{ frame: 10, value: 1.05 }],
      }),
      executeIsolated: async () => ({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
        disposition: 'OK',
        output: { receipt: { status: 'PASS', projectRevision: 'revision-r8' } },
        evidenceIds: [],
      }),
      onTurnCommitted: (input) => {
        checkpoint = input.checkpoint;
        throw new Error('TEST_STOP_AFTER_WRITER');
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'TEST_STOP_AFTER_WRITER') throw error;
  }
  if (!checkpoint) throw new Error('TEST_WRITER_CHECKPOINT_MISSING');
  return checkpoint;
}

function runtimeGuard(): ProviderNativeRuntimeGuardV2R {
  const allow = (audit: Readonly<JsonRecord>) => ({ status: 'ALLOW' as const, audit });
  return {
    createResumeState: ({ completedTurns, accountedProviderAttempts }) =>
      runtimeResumeState({ completedTurns, accountedProviderAttempts }),
    createPendingDispatchResumeState: ({
      completedTurns, accountedProviderAttempts, pendingProviderDispatchIntent,
    }) => runtimeResumeState({
      completedTurns, accountedProviderAttempts, pendingProviderDispatchIntent,
    }),
    restoreResumeState: () => undefined,
    beforeTurn: ({ turn }) => allow({
      phase: 'BEFORE_TURN', status: 'ALLOW', turn,
    }),
    beforeInvoke: ({ turn, request, maxOutputTokens }) => allow({
      phase: 'BEFORE_INVOKE', status: 'ALLOW', turn,
      requestHash: request.requestHash, inputTokensUpperBound: 1,
      reservedWorstCaseNanoUsd: maxOutputTokens,
    }),
    afterInvoke: ({ turn, request, response, maxOutputTokens }) =>
      response.status < 200 || response.status >= 300
        ? allow({ phase: 'AFTER_INVOKE_HTTP_FAILURE_CONSERVATIVE_RESERVATION',
          status: 'ALLOW', turn, requestHash: request.requestHash,
          accountingMode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
          accountedCostNanoUsd: maxOutputTokens,
          accountedOutputTokens: maxOutputTokens })
        : allow({ phase: 'AFTER_INVOKE', status: 'ALLOW', turn,
          requestHash: request.requestHash, actualCostNanoUsd: 0,
          usage: { outputTokens: 0, thoughtTokens: 0 } }),
    settleUnknownInvoke: ({ turn, request, maxOutputTokens }) => allow({
      phase: 'AFTER_INVOKE_RESULT_UNAVAILABLE_CONSERVATIVE_RESERVATION',
      status: 'ALLOW', turn, requestHash: request.requestHash,
      accountingMode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
      accountedCostNanoUsd: maxOutputTokens,
      accountedOutputTokens: maxOutputTokens,
    }),
    settleRecoveredDispatchIntent: ({ pendingProviderDispatchIntent }) => allow({
      phase: 'RECOVERED_DISPATCH_INTENT_CONSERVATIVE_RESERVATION',
      status: 'ALLOW', turn: pendingProviderDispatchIntent.dispatch.turn,
      requestHash: pendingProviderDispatchIntent.dispatch.requestHash,
      accountingMode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
      accountedCostNanoUsd:
        pendingProviderDispatchIntent.reservation.reservedWorstCaseNanoUsd,
      accountedOutputTokens: pendingProviderDispatchIntent.dispatch.maxOutputTokens,
    }),
    beforeExecute: ({ turn, operatorId }) => allow({
      phase: 'BEFORE_EXECUTE', status: 'ALLOW', turn, operatorId,
    }),
    afterExecute: ({ turn, operatorId }) => allow({
      phase: 'AFTER_EXECUTE', status: 'ALLOW', turn, operatorId,
    }),
  };
}

function legacyRuntimeGuard(): ProviderNativeRuntimeGuardV2R {
  const guard = runtimeGuard();
  return {
    createResumeState: guard.createResumeState,
    restoreResumeState: guard.restoreResumeState,
    beforeTurn: guard.beforeTurn,
    beforeInvoke: guard.beforeInvoke,
    afterInvoke: guard.afterInvoke,
    beforeExecute: guard.beforeExecute,
    afterExecute: guard.afterExecute,
  };
}

function runtimeResumeState(input: Readonly<{
  completedTurns: readonly Readonly<JsonRecord>[];
  accountedProviderAttempts?: readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[];
  pendingProviderDispatchIntent?: Readonly<ProviderNativeDurableDispatchIntentV2R>;
}>): Readonly<ProviderNativeRuntimeGuardResumeStateV2R> {
  const completedTurns = input.completedTurns;
  const attempts = input.accountedProviderAttempts ?? [];
  const completedTurnsSha256 = hashCanonicalJsonV1(completedTurns);
  const attemptBound = attempts.length > 0 || Boolean(input.pendingProviderDispatchIntent);
  const material = {
    version: input.pendingProviderDispatchIntent
      ? PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R
      : attempts.length
      ? PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R
      : PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
    authority: 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION' as const,
    guardKind: 'TEST_RUNTIME_GUARD',
    guardIdentitySha256: GUARD_HASH,
    completedTurnsSha256,
    nextTurn: completedTurns.length + 1,
    ...(attemptBound ? {
      accountedProviderAttemptsSha256: hashCanonicalJsonV1(attempts),
    } : {}),
    ...(input.pendingProviderDispatchIntent ? {
      pendingProviderDispatchIntentSha256:
        input.pendingProviderDispatchIntent.receiptSha256,
    } : {}),
    state: { usage: { providerTurns: completedTurns.length,
      accountedProviderAttempts: attempts.length,
      pendingDispatch: Boolean(input.pendingProviderDispatchIntent) } },
  };
  return { ...material, resumeStateSha256: hashCanonicalJsonV1(material) };
}

function finishResponse() {
  return call('finish', 'finish_editron_research_episode', {
    disposition: 'READY_FOR_PROOF',
    reasonCodes: ['MODEL_READY_FOR_PROOF'],
    evidenceIds: [],
    summary: 'The isolated proposal is ready for bounded proof.',
  });
}

function call(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`, model: ROUTE.model, status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name,
      arguments: JSON.stringify(args) }],
  } };
}

function ref(
  ownerId: string,
  artifactId: string,
  artifactSha256: string,
): EditorialPlanArtifactRefV1 {
  return { ownerId, artifactId, artifactVersion: 'v1', artifactSha256 };
}
