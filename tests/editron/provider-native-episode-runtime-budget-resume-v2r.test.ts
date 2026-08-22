import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  createProviderNativeEpisodeResumeCheckpointV2R,
  PROVIDER_NATIVE_EPISODE_RESUME_RUNTIME_BOUND_VERSION_V2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
  type ProviderNativeRuntimeGuardResumeStateV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeInvokeResponseV2R,
  type ProviderNativeToolExecutionV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SealedHoldoutRuntimeBudgetControllerV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
  type SealedHoldoutRuntimeAuthorizationV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';

type JsonRecord = Record<string, unknown>;
type RuntimeCheckpoint = Extract<
  ProviderNativeEpisodeResumeCheckpointV2R,
  { runtimeGuardResumeState: Readonly<ProviderNativeRuntimeGuardResumeStateV2R> }
>;
type MutableResumeState = Omit<ProviderNativeRuntimeGuardResumeStateV2R, 'state'> & {
  state: JsonRecord;
};

const ROUTE: ProviderNativeRouteV2R = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
};
const PUBLIC_CASE = {
  caseId: 'stage25-runtime-resume-1',
  resourceBudget: { maxNodes: 4, maxCandidates: 3, maxOutputTokens: 600 },
};
const MANIFEST_SHA256 = 'c'.repeat(64);
const PUBLIC_CASE_SHA256 = hashCanonicalJsonV1(PUBLIC_CASE);
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'stage25-runtime-resume-episode-1',
  objective: 'Align cuts to measured impacts without resetting the sealed budget.',
  activeTarget: { taskId: 'RUNTIME-RESUME-01', requirement: 'accounted beat sync' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-42' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-42' },
  evidence: [{ evidenceId: 'ev-audio-1', kind: 'MEASURED_AUDIO' }],
  preservationRules: ['Never replay a charged provider turn or completed mutation.'],
  authorityAndPolicy: {
    mutation: 'ISOLATED_CLONE_ONLY', network: 'PROVIDER_ONLY',
    completeCapabilityDossier: { plannerRecordSupplements: [
      {
        selectableOperatorId: 'sync_cuts_to_beats',
        inputOrigins: { beatPlan: [{
          origin: 'OPERATOR_OUTPUT', operatorId: 'find_audio_moment', outputField: 'result',
        }] },
      },
      {
        selectableOperatorId: 'apply_camera_shake',
        inputOrigins: { expectedProjectRevision: [{
          origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
          outputField: 'receipt.projectRevision',
        }] },
      },
    ] },
  },
  budget: { maxTurns: 4, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};
const ELIGIBLE = [
  'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake',
] as const;
const BEAT_PLAN = {
  schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1', assetId: 'music-1',
  measuredEvidenceReceiptHash: 'a'.repeat(64),
  strongPeakFrames: [119, 239, 359, 479], finalStrongPeakFrame: 479,
};
const BEAT_CONSTRAINTS = {
  maxSnapFrames: 8, minClipFrames: 20, maxConsecutiveBeatCuts: 4,
  protectedAudioRange: { startFrame: 0, endFrame: 90 },
  protectedBoundaryToleranceFrames: 3,
  sourceDurationFramesByAssetId: { 'asset-1': 600 }, requireSourceHandles: true,
};

describe('provider-native sealed runtime budget across interruption and resume', () => {
  it('restores cumulative usage and historical per-turn output limits', async () => {
    const checkpoint = await interruptAccountedEpisode();
    const runtimeState = checkpoint.runtimeGuardResumeState;
    const prefixUsage = runtimeState.state.usage as JsonRecord;
    expect(checkpoint.checkpointVersion)
      .toBe(PROVIDER_NATIVE_EPISODE_RESUME_RUNTIME_BOUND_VERSION_V2R);
    expect(checkpoint.completedTurns.map((turn) => turn.maxOutputTokens))
      .toEqual([512, 200]);
    expect(prefixUsage).toMatchObject({
      providerTurns: 2, selectedOperations: 2,
      inputTokens: 200, outputTokens: 420, reasoningTokens: 10,
      spentNanoUsd: 2_720_000, pendingRequest: null,
    });

    const resumedBudget = controller();
    const invoke = vi.fn(async (
      request: Readonly<SerializedProviderNativeTurnV2R>,
    ): Promise<ProviderNativeInvokeResponseV2R> => {
      expect(request.body.max_output_tokens).toBe(180);
      expect(JSON.stringify(request.body)).toContain(runtimeState.resumeStateSha256);
      expect(JSON.stringify(request.body)).not.toContain('revision-43');
      return finishResponse(20);
    });
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      resumeCheckpoint: checkpoint, resumeCurrentProjectRevision: 'revision-43',
      runtimeGuard: resumedBudget, invoke, executeIsolated: mustNotExecute(),
    });
    const budgetReceipt = resumedBudget.receipt(receipt.terminal.disposition);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(receipt.selectedOperatorIds).toEqual([
      'find_audio_moment', 'sync_cuts_to_beats',
    ]);
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(budgetReceipt.assessment).toBe('ACCOUNTED_WITHIN_BUDGET');
    expect(budgetReceipt.usage).toMatchObject({
      providerTurns: 3, selectedOperations: 2,
      inputTokens: 300, outputTokens: 440, reasoningTokens: 15,
      spentNanoUsd: 2_940_000, pendingRequest: null,
    });
    expect(budgetReceipt.events).toHaveLength(13);
  });

  it('rejects missing, legacy-unbound, wrong and forged accounting state', async () => {
    const checkpoint = await interruptAccountedEpisode();
    const invoke = mustNotInvoke();
    const executeIsolated = mustNotExecute();

    await expect(resume(checkpoint, undefined, invoke, executeIsolated)).rejects
      .toThrow('PROVIDER_NATIVE_RESUME_RUNTIME_GUARD_REQUIRED');

    const legacy = createProviderNativeEpisodeResumeCheckpointV2R({
      route: checkpoint.route, episodeId: checkpoint.episodeId,
      contextSha256: checkpoint.contextSha256, toolSetSha256: checkpoint.toolSetSha256,
      completedTurns: checkpoint.completedTurns,
    });
    await expect(resume(legacy, controller(), invoke, executeIsolated)).rejects
      .toThrow('PROVIDER_NATIVE_RESUME_RUNTIME_GUARD_STATE_UNBOUND');

    await expect(resume(checkpoint, controller({
      absoluteMaxSpendMicroUsd: 9_000_000,
    }), invoke, executeIsolated)).rejects
      .toThrow('SEALED_RUNTIME_RESUME_GUARD_IDENTITY_MISMATCH');

    const forged = structuredClone(
      checkpoint.runtimeGuardResumeState,
    ) as MutableResumeState;
    (forged.state.usage as JsonRecord).providerTurns = 0;
    const { resumeStateSha256: _oldHash, ...forgedMaterial } = forged;
    forged.resumeStateSha256 = hashCanonicalJsonV1(forgedMaterial);
    const forgedCheckpoint = createProviderNativeEpisodeResumeCheckpointV2R({
      route: checkpoint.route, episodeId: checkpoint.episodeId,
      contextSha256: checkpoint.contextSha256, toolSetSha256: checkpoint.toolSetSha256,
      completedTurns: checkpoint.completedTurns, runtimeGuardResumeState: forged,
    });
    await expect(resume(
      forgedCheckpoint, controller(), invoke, executeIsolated,
    )).rejects.toThrow('SEALED_RUNTIME_RESUME_USAGE_EVENTS_MISMATCH');
    expect(invoke).not.toHaveBeenCalled();
    expect(executeIsolated).not.toHaveBeenCalled();
  });

  it('refuses to checkpoint an unresolved in-flight provider request', async () => {
    const runtimeBudget = controller();
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: runtimeBudget,
      invoke: async () => { throw new Error('TEST_TRANSPORT_INTERRUPTED'); },
      executeIsolated: mustNotExecute(),
    });
    expect(receipt.terminal.disposition).toBe('RESOURCE_ACCOUNTING_UNVERIFIABLE');
    expect(() => runtimeBudget.createResumeState({ completedTurns: [] }))
      .toThrow('SEALED_RUNTIME_RESUME_PENDING_REQUEST');
  });
});

async function interruptAccountedEpisode(): Promise<Readonly<RuntimeCheckpoint>> {
  const runtimeBudget = controller();
  let invocation = 0;
  let captured: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  await expect(runProviderNativeToolEpisodeV2R({
    route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: runtimeBudget,
    invoke: async () => {
      invocation += 1;
      return invocation === 1
        ? callResponse('prefix-find', 'find_audio_moment', {
            projectId: 'project-1', query: 'measured strong music impacts',
          }, 400)
        : callResponse('prefix-sync', 'sync_cuts_to_beats', {
            projectId: 'project-1', expectedProjectRevision: 'revision-42',
            overlayIds: ['overlay-video-1'], beatSyncConstraints: BEAT_CONSTRAINTS,
            evidenceIds: ['ev-audio-1'], argumentReferences: [{
              targetField: 'beatPlan', resultReferenceId: 'result_t1_1',
            }],
          }, 20);
    },
    executeIsolated: async ({ operatorId }) => operatorId === 'find_audio_moment'
      ? execution({ result: BEAT_PLAN, evidence: { evidenceId: 'ev-audio-1' } })
      : execution({
          receipt: { status: 'PASS', projectRevision: 'revision-43' },
          result: { alignedBoundaries: [119, 239, 359, 479],
            finalHitOverlayId: 'overlay-video-1', finalStrongPeakFrame: 479 },
        }),
    onTurnCommitted: ({ checkpoint }) => {
      captured = checkpoint;
      if (checkpoint.nextTurn === 3) throw new Error('TEST_ACCOUNTED_INTERRUPTION');
    },
  })).rejects.toThrow('TEST_ACCOUNTED_INTERRUPTION');
  return requireRuntimeCheckpoint(captured);
}

function controller(
  overrides: Partial<SealedHoldoutRuntimeAuthorizationV2R> = {},
): SealedHoldoutRuntimeBudgetControllerV2R {
  const authorization: SealedHoldoutRuntimeAuthorizationV2R = {
    version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
    manifestSha256: MANIFEST_SHA256, caseId: PUBLIC_CASE.caseId,
    publicCaseSha256: PUBLIC_CASE_SHA256, routeId: ROUTE.routeId,
    claimedModelIdentity: ROUTE.claimedModelIdentity,
    routeSha256: hashCanonicalJsonV1(ROUTE), approvedBy: 'admin',
    approvedAt: '2026-08-23T00:00:00.000Z', maxInputTokensPerTurn: 85_000,
    absoluteMaxSpendMicroUsd: 10_000_000,
    pricing: { normalInputNanoUsdPerToken: 1_000, cachedInputNanoUsdPerToken: 100,
      cacheWriteNanoUsdPerToken: 1_250, outputNanoUsdPerToken: 6_000 },
    ...overrides,
  };
  return new SealedHoldoutRuntimeBudgetControllerV2R({
    publicCase: PUBLIC_CASE, publicCaseSha256: PUBLIC_CASE_SHA256,
    manifestSha256: MANIFEST_SHA256, route: ROUTE, authorization,
    countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({
      request, inputTokensUpperBound: 1_000, method: 'TEST_BOUND_V1',
    }),
  });
}

function resume(
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  runtimeGuard: SealedHoldoutRuntimeBudgetControllerV2R | undefined,
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
    => Promise<ProviderNativeInvokeResponseV2R>,
  executeIsolated: Parameters<typeof runProviderNativeToolEpisodeV2R>[0]['executeIsolated'],
) {
  return runProviderNativeToolEpisodeV2R({
    route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    resumeCheckpoint: checkpoint, resumeCurrentProjectRevision: 'revision-43',
    ...(runtimeGuard ? { runtimeGuard } : {}), invoke, executeIsolated,
  });
}

function callResponse(id: string, name: string, args: JsonRecord, outputTokens: number) {
  return { status: 200, body: {
    id, model: ROUTE.model, status: 'completed',
    output: [{ type: 'function_call', call_id: `call-${id}`, name,
      arguments: JSON.stringify(args) }],
    usage: usage(outputTokens),
  } };
}
function finishResponse(outputTokens: number) {
  return callResponse('finish-runtime-resume', 'finish_editron_research_episode', {
    disposition: 'READY_FOR_PROOF', reasonCodes: ['MODEL_READY_FOR_PROOF'],
    evidenceIds: [], summary: 'The isolated edits are ready for system proof.',
  }, outputTokens);
}
function usage(outputTokens: number) {
  return { input_tokens: 100,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: outputTokens, output_tokens_details: { reasoning_tokens: 5 },
    total_tokens: 100 + outputTokens };
}
function execution(output: JsonRecord): Readonly<ProviderNativeToolExecutionV2R> {
  return { authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK',
    output, evidenceIds: ['ev-audio-1'] };
}
function requireRuntimeCheckpoint(value: unknown): Readonly<RuntimeCheckpoint> {
  if (!value || typeof value !== 'object' || !('runtimeGuardResumeState' in value)) {
    throw new Error('TEST_RUNTIME_CHECKPOINT_NOT_CAPTURED');
  }
  return value as RuntimeCheckpoint;
}
function mustNotInvoke() {
  return vi.fn(async (): Promise<ProviderNativeInvokeResponseV2R> => {
    throw new Error('TEST_PROVIDER_INVOKE_MUST_NOT_RUN');
  });
}
function mustNotExecute() {
  return vi.fn(async (): Promise<Readonly<ProviderNativeToolExecutionV2R>> => {
    throw new Error('TEST_ISOLATED_EXECUTION_MUST_NOT_RUN');
  });
}
