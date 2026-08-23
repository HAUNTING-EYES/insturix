import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  ProviderNativeTransportErrorV2R,
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeInvokeResponseV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SealedHoldoutRuntimeBudgetControllerV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';

const ROUTE = { routeId: 'OPENAI_TERRA', provider: 'openai',
  model: 'gpt-5.6-terra', claimedModelIdentity: 'gpt-5.6-terra',
  reasoningMode: 'medium' } as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'durable-dispatch-episode-1', objective: 'Prove write-ahead dispatch.',
  activeTarget: { taskId: 'DISPATCH-01' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-1' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-1' },
  evidence: [], preservationRules: ['Never dispatch before durable intent.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
  budget: { maxTurns: 4, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};

describe('provider-native durable dispatch episode', () => {
  it('recovers an unresolved write-ahead intent before retrying', async () => {
    const firstInvoke = vi.fn(async () => finishResponse());
    const pending = await capturePendingCheckpoint(firstInvoke);
    expect(firstInvoke).not.toHaveBeenCalled();
    expect('pendingProviderDispatchIntent' in pending).toBe(true);

    const order: string[] = [];
    const resumedGuard = controller();
    const completed = await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ['find_audio_moment'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: resumedGuard,
      resumeCheckpoint: pending, resumeCurrentProjectRevision: 'revision-1',
      now: () => '2026-08-23T14:01:00.000Z',
      onProviderAttemptCommitted: async ({ dispatchIntent }) => {
        expect(dispatchIntent?.deliveryState).toBe('AUTHORIZED_NOT_PROVEN_DISPATCHED');
        order.push('reconcile-intent');
      },
      onProviderDispatchCommitted: async () => { order.push('commit-retry-intent'); },
      invoke: async (request) => {
        expect(request.body.max_output_tokens).toBe(88);
        order.push('invoke-retry');
        return finishResponse();
      },
      executeIsolated: mustNotExecute(),
    });
    expect(order).toEqual(['reconcile-intent', 'commit-retry-intent', 'invoke-retry']);
    expect(completed.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(resumedGuard.receipt(completed.terminal.disposition).usage)
      .toMatchObject({ providerTurns: 2, conservativeReservedOutputTokens: 512,
        outputTokens: 532, pendingRequest: null });
  });

  it('rejects a stale project before reconciling or retrying', async () => {
    const pending = await capturePendingCheckpoint(vi.fn(async () => finishResponse()));
    const invoke = vi.fn(async () => finishResponse());
    const reconcile = vi.fn(async () => undefined);
    await expect(runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ['find_audio_moment'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: controller(),
      resumeCheckpoint: pending, resumeCurrentProjectRevision: 'revision-2',
      onProviderAttemptCommitted: reconcile,
      onProviderDispatchCommitted: async () => undefined,
      invoke, executeIsolated: mustNotExecute(),
    })).rejects.toThrow('PROVIDER_NATIVE_RESUME_STALE_PROJECT_REVISION');
    expect(reconcile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reconciles a pending dispatch after an earlier accounted attempt', async () => {
    let failedAttempt: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
    await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ['find_audio_moment'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: controller(2_000),
      now: () => '2026-08-23T14:10:00.000Z',
      onProviderAttemptCommitted: async ({ checkpoint }) => { failedAttempt = checkpoint; },
      invoke: async () => {
        throw new ProviderNativeTransportErrorV2R('PROVIDER_TIMEOUT', 'first timeout');
      },
      executeIsolated: mustNotExecute(),
    });
    if (!failedAttempt) throw new Error('TEST_FAILED_ATTEMPT_CHECKPOINT_MISSING');

    let secondPending: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
    await expect(runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ['find_audio_moment'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: controller(2_000),
      resumeCheckpoint: failedAttempt,
      resumeCurrentProjectRevision: 'revision-1',
      now: () => '2026-08-23T14:11:00.000Z',
      onProviderAttemptCommitted: async () => undefined,
      onProviderDispatchCommitted: async ({ checkpoint }) => {
        secondPending = checkpoint;
        throw new Error('SIMULATED_SECOND_PROCESS_EXIT');
      },
      invoke: async () => finishResponse(), executeIsolated: mustNotExecute(),
    })).rejects.toThrow('SIMULATED_SECOND_PROCESS_EXIT');
    if (!secondPending) throw new Error('TEST_SECOND_PENDING_CHECKPOINT_MISSING');

    const order: string[] = [];
    const guard = controller(2_000);
    const completed = await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ['find_audio_moment'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: guard,
      resumeCheckpoint: secondPending,
      resumeCurrentProjectRevision: 'revision-1',
      now: () => '2026-08-23T14:12:00.000Z',
      onProviderAttemptCommitted: async () => { order.push('reconcile-second-intent'); },
      onProviderDispatchCommitted: async () => { order.push('commit-third-intent'); },
      invoke: async () => { order.push('invoke-third-attempt'); return finishResponse(); },
      executeIsolated: mustNotExecute(),
    });
    expect(order).toEqual([
      'reconcile-second-intent', 'commit-third-intent', 'invoke-third-attempt',
    ]);
    expect(completed.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(guard.receipt(completed.terminal.disposition).usage).toMatchObject({
      providerTurns: 3, conservativeReservedOutputTokens: 1_024,
      outputTokens: 1_044, pendingRequest: null,
    });
  });
});

async function capturePendingCheckpoint(
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) =>
    Promise<ProviderNativeInvokeResponseV2R>,
) {
  let checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  await expect(runProviderNativeToolEpisodeV2R({
    route: ROUTE, context: CONTEXT, eligibleOperatorIds: ['find_audio_moment'],
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: controller(),
    now: () => '2026-08-23T14:00:00.000Z',
    onProviderAttemptCommitted: async () => undefined,
    onProviderDispatchCommitted: async (input) => {
      checkpoint = input.checkpoint;
      throw new Error('SIMULATED_PROCESS_EXIT_AFTER_INTENT_COMMIT');
    }, invoke, executeIsolated: mustNotExecute(),
  })).rejects.toThrow('SIMULATED_PROCESS_EXIT_AFTER_INTENT_COMMIT');
  if (!checkpoint) throw new Error('TEST_PENDING_CHECKPOINT_MISSING');
  return checkpoint as Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
}

function finishResponse() {
  return { status: 200, body: { id: 'finish-1', model: ROUTE.model,
    status: 'completed', output: [{ type: 'function_call', call_id: 'finish-call',
      name: 'finish_editron_research_episode', arguments: JSON.stringify({
        disposition: 'READY_FOR_PROOF', reasonCodes: ['MODEL_READY_FOR_PROOF'],
        evidenceIds: [], summary: 'Ready for proof.' }) }], usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 },
      total_tokens: 120 } } };
}

function controller(maxOutputTokens = 600) {
  const publicCase = { caseId: 'durable-dispatch',
    resourceBudget: { maxNodes: 4, maxCandidates: 3, maxOutputTokens } };
  const manifestSha256 = 'a'.repeat(64);
  const publicCaseSha256 = hashCanonicalJsonV1(publicCase);
  return new SealedHoldoutRuntimeBudgetControllerV2R({ publicCase,
    publicCaseSha256, manifestSha256, route: ROUTE, authorization: {
      version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256, caseId: publicCase.caseId, publicCaseSha256,
      routeId: ROUTE.routeId, claimedModelIdentity: ROUTE.claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(ROUTE), approvedBy: 'admin',
      approvedAt: '2026-08-23T14:00:00.000Z', maxInputTokensPerTurn: 85_000,
      absoluteMaxSpendMicroUsd: 10_000, pricing: {
        normalInputNanoUsdPerToken: 1_000, cachedInputNanoUsdPerToken: 100,
        cacheWriteNanoUsdPerToken: 1_250, outputNanoUsdPerToken: 6_000 } },
    countInputTokens: async (request: Readonly<SerializedProviderNativeTurnV2R>) =>
      bindSealedHoldoutInputTokenBoundV2R({ request,
        inputTokensUpperBound: 100, method: 'TEST_BOUND_V1' }),
  });
}

function mustNotExecute() {
  return vi.fn(async (): Promise<never> => { throw new Error('MUST_NOT_EXECUTE'); });
}
