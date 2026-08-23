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
  episodeId: 'durable-failure-episode-1', objective: 'Prove durable provider retry state.',
  activeTarget: { taskId: 'FAILURE-RETRY-01' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-1' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-1' },
  evidence: [], preservationRules: ['Never forget a charged attempt.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY' },
  budget: { maxTurns: 4, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};
const ELIGIBLE = ['find_audio_moment'] as const;

describe('provider-native durable failed attempt episode', () => {
  it('persists a failed first call and resumes without a fabricated writer', async () => {
    let checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
    const committed = vi.fn(async (input: Readonly<{
      checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
    }>) => { checkpoint = input.checkpoint; });
    const failed = await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: controller(),
      now: () => '2026-08-23T10:00:00.000Z',
      onProviderAttemptCommitted: committed,
      invoke: async () => { throw new ProviderNativeTransportErrorV2R(
        'PROVIDER_TIMEOUT', 'test timeout',
      ); },
      executeIsolated: mustNotExecute(),
    });
    expect(failed.terminal.disposition).toBe('PROVIDER_TIMEOUT');
    expect(committed).toHaveBeenCalledTimes(1);
    const durable = requireCheckpoint(checkpoint);
    expect(durable.completedTurns).toEqual([]);
    expect('accountedProviderAttempts' in durable
      && durable.accountedProviderAttempts).toHaveLength(1);

    const invoke = vi.fn(async (request: Readonly<SerializedProviderNativeTurnV2R>) => {
      expect(request.body.max_output_tokens).toBe(88);
      return finishResponse();
    });
    const resumedGuard = controller();
    const completed = await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: resumedGuard,
      resumeCheckpoint: durable, resumeCurrentProjectRevision: 'revision-1',
      invoke, executeIsolated: mustNotExecute(),
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(completed.terminal.disposition).toBe('READY_FOR_PROOF');
    expect(resumedGuard.receipt(completed.terminal.disposition).usage)
      .toMatchObject({ providerTurns: 2, conservativeReservedOutputTokens: 512,
        outputTokens: 532, pendingRequest: null });
  });

  it('rejects a changed project revision before the retry call', async () => {
    const checkpoint = await failedCheckpoint();
    const invoke = vi.fn(async () => finishResponse());
    await expect(runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES', runtimeGuard: controller(),
      resumeCheckpoint: checkpoint, resumeCurrentProjectRevision: 'revision-2',
      invoke, executeIsolated: mustNotExecute(),
    })).rejects.toThrow('PROVIDER_NATIVE_RESUME_STALE_PROJECT_REVISION');
    expect(invoke).not.toHaveBeenCalled();
  });
});

async function failedCheckpoint() {
  let captured: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  await runProviderNativeToolEpisodeV2R({ route: ROUTE, context: CONTEXT,
    eligibleOperatorIds: ELIGIBLE, argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    runtimeGuard: controller(), now: () => '2026-08-23T10:00:00.000Z',
    onProviderAttemptCommitted: async ({ checkpoint }) => { captured = checkpoint; },
    invoke: async () => { throw new ProviderNativeTransportErrorV2R(
      'PROVIDER_TIMEOUT', 'test timeout',
    ); }, executeIsolated: mustNotExecute() });
  return requireCheckpoint(captured);
}

function finishResponse() {
  return { status: 200, body: { id: 'finish-1', model: ROUTE.model,
    status: 'completed', output: [{ type: 'function_call', call_id: 'finish-call',
      name: 'finish_editron_research_episode', arguments: JSON.stringify({
        disposition: 'READY_FOR_PROOF', reasonCodes: ['MODEL_READY_FOR_PROOF'],
        evidenceIds: [], summary: 'Ready for system proof.' }) }],
    usage: { input_tokens: 100,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 },
      total_tokens: 120 } } };
}

function controller() {
  const publicCase = { caseId: 'durable-failure',
    resourceBudget: { maxNodes: 4, maxCandidates: 3, maxOutputTokens: 600 } };
  const manifestSha256 = 'a'.repeat(64);
  const publicCaseSha256 = hashCanonicalJsonV1(publicCase);
  return new SealedHoldoutRuntimeBudgetControllerV2R({ publicCase,
    publicCaseSha256, manifestSha256, route: ROUTE, authorization: {
      version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256, caseId: publicCase.caseId, publicCaseSha256,
      routeId: ROUTE.routeId, claimedModelIdentity: ROUTE.claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(ROUTE), approvedBy: 'admin',
      approvedAt: '2026-08-23T10:00:00.000Z', maxInputTokensPerTurn: 85_000,
      absoluteMaxSpendMicroUsd: 10_000, pricing: {
        normalInputNanoUsdPerToken: 1_000, cachedInputNanoUsdPerToken: 100,
        cacheWriteNanoUsdPerToken: 1_250, outputNanoUsdPerToken: 6_000 } },
    countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({
      request, inputTokensUpperBound: 100, method: 'TEST_BOUND_V1' }),
  });
}

function requireCheckpoint(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('TEST_CHECKPOINT_MISSING');
  return value as Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
}
function mustNotExecute() {
  return vi.fn(async (): Promise<never> => { throw new Error('MUST_NOT_EXECUTE'); });
}
