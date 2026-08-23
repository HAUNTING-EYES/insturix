import { describe, expect, it, vi } from 'vitest';

import { bindProviderNativeEpisodeDefinitionArtifactV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-bound-episode-definition-v2r';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type { ProviderNativeDurableAttemptReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-attempt-receipt-v2r';
import type { ProviderNativeDurableDispatchIntentV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-dispatch-intent-v2r';
import type { ProviderNativeDurableArtifactOwnersV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-owner-artifact-resolver-v2r';
import {
  PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
  type ProviderNativeRuntimeGuardResumeStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import {
  createProviderNativePlanExecutionEnvelopeV2R,
  providerNativeEligibleOperationSetRefV2R,
  providerNativePlanExecutionEnvelopeSchemaRefV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-plan-execution-envelope-v2r';
import { createProviderNativePlanExecutionOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-plan-resumed-execution-owner-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCutOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-cut-owner-v2r';
import { createProviderNativeProjectServiceCutProofOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-cut-proof-owner-v2r';
import { projectProposalStateV2R }
  from '@/lib/editron/research/open-ended-planner/project-service-proposal-state-v2r';
import type { ProviderNativeEpisodeContextV2R, ProviderNativeRuntimeGuardV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
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
import type { Phase0RenderedStillEvidence }
  from '@/lib/editron/services/phase0-rendered-evidence-worker';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

import {
  createEditorialPlanDurableFixtureStoresV1,
  EDITORIAL_PLAN_FIXTURE_START_V1 as START,
  editorialPlanFixtureInputV1,
} from './helpers/editorial-plan-durable-fixture-v1';

type JsonRecord = Record<string, unknown>;

const HASH = 'a'.repeat(64);
const GUARD_HASH = 'b'.repeat(64);
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1, value: 7,
  compatibilityUpdatedAt: '2026-08-23T14:00:00.000Z',
};
const PROJECT_REVISION = `project-revision-v1:${hashCanonicalJsonV1(REVISION)}`;
const ELIGIBLE = ['cut_section'] as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'plan-fresh-native-proof-1',
  objective: 'Remove the exact measured silent range from the isolated proposal.',
  activeTarget: { taskId: 'PLAN-FRESH-NATIVE-PROOF' },
  revisionBinding: {
    projectId: 'project-a', expectedProjectRevision: PROJECT_REVISION,
  },
  projectState: { projectId: 'project-a', projectRevision: PROJECT_REVISION },
  evidence: [{ evidenceId: 'ev-silence-1', kind: 'MEASURED_SILENCE' }],
  preservationRules: ['Never mutate the canonical project.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
  budget: { maxTurns: 3, maxOutputTokensPerTurn: 256, maxIdenticalCalls: 1 },
};

describe('provider-native fresh Plan to ProjectService proof integration V2R', () => {
  it('commits one isolated cut proof while canonical ProjectService state stays unchanged', async () => {
    const canonical = project();
    const canonicalBefore = hashCanonicalJsonV1(projectProposalStateV2R(canonical));
    const render = vi.fn(async (_project, options) => renderedEvidence(
      options.requestedSampleFrames ?? [],
    ));
    const projectClone = createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: { loadProjectForMutation: async () => ({
        project: structuredClone(canonical), revision: REVISION,
      }) },
      isolatedOperatorOwner: createProviderNativeProjectServiceCutOwnerV2R(),
      isolatedOutcomeProofOwner: createProviderNativeProjectServiceCutProofOwnerV2R({
        buildRenderedEvidence: render,
        now: () => '2026-08-23T14:05:00.000Z',
      }),
    });
    const setup = await prepared({
      projectClone,
      responses: [cutResponse(), finishResponse()],
    });

    const result = await runEditorialPlanDurableWorkerV1({
      jobStore: setup.jobStore,
      planStore: setup.planStore(),
      jobId: setup.jobId,
      workerId: 'plan-fresh-native-proof-worker',
      executionOwner: createProviderNativePlanExecutionOwnerV2R({
        artifactOwners: setup.artifactOwners,
      }),
      clock: () => START,
    });

    expect(result).toMatchObject({ kind: 'completed', disposition: 'PASS' });
    expect(setup.invoke).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0][0]).toMatchObject({ durationInFrames: 90 });
    expect(render.mock.calls[0][1]).toMatchObject({
      requestedSampleFrames: [29, 30],
      baselineProject: expect.objectContaining({ durationInFrames: 120 }),
      comparisonMode: 'mutation-delta',
    });
    expect(hashCanonicalJsonV1(projectProposalStateV2R(canonical))).toBe(canonicalBefore);

    const persisted = await setup.jobStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
    });
    expect(persisted).toMatchObject({
      status: 'completed',
      terminalReceipt: {
        disposition: 'PASS',
        proofReferences: [
          { proofId: `provider_native_fresh_${CONTEXT.episodeId}`, disposition: 'PASS' },
          { proofId: `projectservice_isolated_proposal_${CONTEXT.episodeId}`,
            disposition: 'PASS' },
          { proofId: `isolated_outcome_proof_${CONTEXT.episodeId}`, disposition: 'PASS' },
        ],
      },
    });
  });
});

async function prepared(input: Readonly<{
  projectClone: ProviderNativeDurableArtifactOwnersV2R['projectClone'];
  responses: readonly Readonly<{ status: number; body: unknown }>[];
}>) {
  const artifact = bindProviderNativeEpisodeDefinitionArtifactV2R({
    tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
    source: { ownerId: 'TEST_EPISODE_OWNER', ownerVersion: 'v1', ownerSha256: HASH },
    context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
  });
  const envelope = createProviderNativePlanExecutionEnvelopeV2R({
    boundEpisodeDefinition: artifact,
    route: ROUTE,
    runtimeGuardBinding: {
      guardKind: 'TEST_RUNTIME_GUARD', guardIdentitySha256: GUARD_HASH,
    },
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
    definitionId: 'provider-native-fresh-proof-definition', episodeId: CONTEXT.episodeId,
    sourcePlanBinding: {
      planId: source.planId, planRevision: source.planRevision,
      planRevisionSha256: source.revisionSha256,
      nodeId: sourceNode.nodeId, nodeVersion: sourceNode.nodeVersion,
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
      ...sourceNode, nodeVersion: 2,
      executionDefinitionRef: executionDefinitionRefV1(definition),
    }],
    changeReason: 'Attach the exact fresh native proof definition.',
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
  let index = 0;
  const invoke = vi.fn(async () => {
    const response = input.responses[index++];
    if (!response) throw new Error('TEST_PROVIDER_RESPONSE_MISSING');
    return response;
  });
  const artifactOwners: ProviderNativeDurableArtifactOwnersV2R = {
    episodeDefinition: { resolve: async () => ({
      context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
    }) },
    projectClone: input.projectClone,
    transport: { resolve: async () => invoke },
    runtimeGuard: { resolve: async () => runtimeGuard() },
  };
  return { ...stores, jobStore, jobId: job.jobId, artifactOwners, invoke };
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
    beforeTurn: ({ turn }) => allow({ phase: 'BEFORE_TURN', status: 'ALLOW', turn }),
    beforeInvoke: ({ turn, request, maxOutputTokens }) => allow({
      phase: 'BEFORE_INVOKE', status: 'ALLOW', turn,
      requestHash: request.requestHash, inputTokensUpperBound: 1,
      reservedWorstCaseNanoUsd: maxOutputTokens,
    }),
    afterInvoke: ({ turn, request }) => allow({
      phase: 'AFTER_INVOKE', status: 'ALLOW', turn,
      requestHash: request.requestHash, actualCostNanoUsd: 0,
      usage: { outputTokens: 0, thoughtTokens: 0 },
    }),
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

function runtimeResumeState(input: Readonly<{
  completedTurns: readonly Readonly<JsonRecord>[];
  accountedProviderAttempts?: readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[];
  pendingProviderDispatchIntent?: Readonly<ProviderNativeDurableDispatchIntentV2R>;
}>): Readonly<ProviderNativeRuntimeGuardResumeStateV2R> {
  const attempts = input.accountedProviderAttempts ?? [];
  const completedTurnsSha256 = hashCanonicalJsonV1(input.completedTurns);
  const attemptBound = attempts.length > 0 || Boolean(input.pendingProviderDispatchIntent);
  const material = {
    version: input.pendingProviderDispatchIntent
      ? PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R
      : attempts.length
      ? PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R
      : PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
    authority: 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION' as const,
    guardKind: 'TEST_RUNTIME_GUARD', guardIdentitySha256: GUARD_HASH,
    completedTurnsSha256,
    nextTurn: input.completedTurns.length + 1,
    ...(attemptBound ? {
      accountedProviderAttemptsSha256: hashCanonicalJsonV1(attempts),
    } : {}),
    ...(input.pendingProviderDispatchIntent ? {
      pendingProviderDispatchIntentSha256:
        input.pendingProviderDispatchIntent.receiptSha256,
    } : {}),
    state: { usage: {
      providerTurns: input.completedTurns.length,
      accountedProviderAttempts: attempts.length,
      pendingDispatch: Boolean(input.pendingProviderDispatchIntent),
    } },
  };
  return { ...material, resumeStateSha256: hashCanonicalJsonV1(material) };
}

function cutResponse() {
  return call('cut', 'cut_section', {
    projectId: 'project-a', expectedProjectRevision: PROJECT_REVISION,
    targetRange: { startFrame: 30, endFrame: 60 },
    evidenceIds: ['ev-silence-1'],
  });
}

function finishResponse() {
  return call('finish', 'finish_editron_research_episode', {
    disposition: 'READY_FOR_PROOF', reasonCodes: ['MODEL_READY_FOR_PROOF'],
    evidenceIds: [], summary: 'The isolated cut is ready for proof.',
  });
}

function call(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`, model: ROUTE.model, status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name,
      arguments: JSON.stringify(args) }],
  } };
}

function renderedEvidence(frames: number[]): Phase0RenderedStillEvidence {
  const capturedAt = '2026-08-23T14:05:00.000Z';
  return {
    version: 'editron-phase0-rendered-still-evidence-v1',
    status: 'completed', statusReason: null,
    source: 'phase0-rendered-evidence-worker', projectId: 'project-a',
    capturedAt, completedAt: capturedAt,
    functionName: 'zero-inference-test-renderer',
    serveUrl: 'https://example.invalid/remotion', region: 'test',
    sampleLimit: frames.length, requestedSampleFrames: frames,
    renderedFrames: frames.map((frame) => ({
      frame, url: `https://example.invalid/${frame}.png`,
      outKey: `${frame}.png`, bucketName: 'test', renderId: `render-${frame}`,
      sizeInBytes: 100,
      baselineUrl: `https://example.invalid/baseline-${frame}.png`,
    })),
    failedFrames: [], artifactPackStatus: 'ready', artifactPackIssues: [],
    renderedAestheticReport: {
      summary: {
        status: 'pass', absoluteQualityStatus: 'pass', mutationStatus: 'pass',
        mutationChangedFrameCount: 1, sampledFrames: frames.length,
      },
      frames: frames.map((frame, index) => ({
        frame, activeOverlayIds: [1], activeOverlayTypes: ['video'],
        fullStill: `https://example.invalid/${frame}.png`,
        baselineStill: `https://example.invalid/baseline-${frame}.png`,
        mutationPixelCount: index === 0 ? 0 : 20,
        sampledPixelCount: 100,
        report: { status: 'pass', score: 1, issues: [] },
      })),
    },
  };
}

function project(): Project {
  return {
    projectId: 'project-a', userId: 'user-a', name: 'Project',
    overlays: [{
      id: 1, type: 'video', startFrame: 0, endFrame: 120,
      from: 0, durationInFrames: 120, sourceStartFrame: 0,
      styles: { opacity: 1 }, content: 'https://example.invalid/source.mp4',
    } as unknown as Project['overlays'][number]],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 120,
    createdAt: new Date('2026-08-23T13:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value, visibility: 'private',
  };
}

function ref(
  ownerId: string,
  artifactId: string,
  artifactSha256: string,
): EditorialPlanArtifactRefV1 {
  return { ownerId, artifactId, artifactVersion: 'v1', artifactSha256 };
}
