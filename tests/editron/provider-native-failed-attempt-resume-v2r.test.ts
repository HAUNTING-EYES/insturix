import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  createProviderNativeDurableAttemptReceiptV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-durable-attempt-receipt-v2r';
import {
  createProviderNativeEpisodeResumeCheckpointV2R,
  PROVIDER_NATIVE_EPISODE_RESUME_ATTEMPT_RUNTIME_BOUND_VERSION_V2R,
  PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_ATTEMPT_RUNTIME_BOUND_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R,
  verifyProviderNativeEpisodeResumeCheckpointV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SealedHoldoutRuntimeBudgetControllerV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const EPISODE_ID = 'failed-attempt-resume-1';
const CONTEXT_SHA256 = 'a'.repeat(64);
const TOOL_SET_SHA256 = 'b'.repeat(64);
const REQUEST = { provider: 'openai', requestHash: 'c'.repeat(64),
  body: { max_output_tokens: 512 } } as unknown as SerializedProviderNativeTurnV2R;

describe('provider-native failed-attempt resume binding', () => {
  it('restores a zero-turn checkpoint without forgetting reserved spend', async () => {
    const first = controller();
    const beforeTurn = first.beforeTurn({ turn: 1, configuredMaxOutputTokens: 512 });
    const beforeInvoke = await first.beforeInvoke({
      turn: 1, request: REQUEST, maxOutputTokens: 512,
    });
    const settled = first.settleUnknownInvoke({
      turn: 1, request: REQUEST, maxOutputTokens: 512,
      transportErrorCode: 'PROVIDER_TIMEOUT',
    });
    const runtimeGuardAudit = [beforeTurn.audit, beforeInvoke.audit, settled.audit];
    const attempt = createProviderNativeDurableAttemptReceiptV2R({
      episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
      toolSetSha256: TOOL_SET_SHA256, route: ROUTE, turn: 1,
      requestHash: REQUEST.requestHash, maxOutputTokens: 512,
      result: { kind: 'TRANSPORT_RESULT_UNAVAILABLE',
        transportErrorCode: 'PROVIDER_TIMEOUT', errorSha256: 'd'.repeat(64) },
      accounting: { mode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
        accountedCostNanoUsd: 3_197_000, accountedOutputTokens: 512,
        isUpperBound: true, runtimeGuardAudit },
      retryDisposition: 'RETRY_SAFE_AFTER_DURABLE_COMMIT',
      occurredAt: '2026-08-23T10:00:00.000Z',
    });
    const runtimeGuardResumeState = first.createResumeState({
      completedTurns: [], accountedProviderAttempts: [attempt],
    });
    const checkpoint = createProviderNativeEpisodeResumeCheckpointV2R({
      route: ROUTE, episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
      toolSetSha256: TOOL_SET_SHA256, completedTurns: [],
      runtimeGuardResumeState, accountedProviderAttempts: [attempt],
    });

    expect(checkpoint.checkpointVersion)
      .toBe(PROVIDER_NATIVE_EPISODE_RESUME_ATTEMPT_RUNTIME_BOUND_VERSION_V2R);
    expect(runtimeGuardResumeState.version)
      .toBe(PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R);
    expect(() => verifyProviderNativeEpisodeResumeCheckpointV2R(checkpoint))
      .not.toThrow();
    const referenceCheckpoint = createProviderNativeEpisodeResumeCheckpointV2R({
      route: ROUTE, episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
      toolSetSha256: TOOL_SET_SHA256, completedTurns: [],
      referenceInputManifestSha256: '9'.repeat(64),
      runtimeGuardResumeState, accountedProviderAttempts: [attempt],
    });
    expect(referenceCheckpoint.checkpointVersion)
      .toBe(PROVIDER_NATIVE_EPISODE_RESUME_REFERENCE_ATTEMPT_RUNTIME_BOUND_VERSION_V2R);
    expect(() => verifyProviderNativeEpisodeResumeCheckpointV2R(referenceCheckpoint))
      .not.toThrow();

    const restored = controller();
    restored.restoreResumeState({ resumeState: runtimeGuardResumeState,
      completedTurns: [], accountedProviderAttempts: [attempt] });
    expect(restored.receipt('PROVIDER_TIMEOUT').usage).toMatchObject({
      providerTurns: 1, outputTokens: 512, spentNanoUsd: 3_197_000,
      conservativeReservedOutputTokens: 512, pendingRequest: null,
    });
    expect(restored.beforeTurn({ turn: 1, configuredMaxOutputTokens: 512 }))
      .toMatchObject({ status: 'ALLOW', maxOutputTokens: 88 });
  });

  it('rejects a missing or copied attempt ledger before restore', async () => {
    const material = await checkpointMaterial();
    expect(() => controller().restoreResumeState({
      resumeState: material.runtimeState, completedTurns: [],
    })).toThrow('PROVIDER_NATIVE_RUNTIME_RESUME_STATE_ENVELOPE_INVALID');
    const copied = structuredClone(material.attempt);
    Object.assign(copied.scope, { episodeId: 'copied-episode' });
    expect(() => createProviderNativeEpisodeResumeCheckpointV2R({
      route: ROUTE, episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
      toolSetSha256: TOOL_SET_SHA256, completedTurns: [],
      runtimeGuardResumeState: material.runtimeState,
      accountedProviderAttempts: [copied],
    })).toThrow();
  });
});

async function checkpointMaterial() {
  const guard = controller();
  const beforeTurn = guard.beforeTurn({ turn: 1, configuredMaxOutputTokens: 512 });
  const beforeInvoke = await guard.beforeInvoke({ turn: 1, request: REQUEST,
    maxOutputTokens: 512 });
  const settled = guard.settleUnknownInvoke({ turn: 1, request: REQUEST,
    maxOutputTokens: 512, transportErrorCode: 'PROVIDER_TIMEOUT' });
  const attempt = createProviderNativeDurableAttemptReceiptV2R({
    episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
    toolSetSha256: TOOL_SET_SHA256, route: ROUTE, turn: 1,
    requestHash: REQUEST.requestHash, maxOutputTokens: 512,
    result: { kind: 'TRANSPORT_RESULT_UNAVAILABLE',
      transportErrorCode: 'PROVIDER_TIMEOUT', errorSha256: 'd'.repeat(64) },
    accounting: { mode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
      accountedCostNanoUsd: 3_197_000, accountedOutputTokens: 512,
      isUpperBound: true,
      runtimeGuardAudit: [beforeTurn.audit, beforeInvoke.audit, settled.audit] },
    retryDisposition: 'RETRY_SAFE_AFTER_DURABLE_COMMIT',
    occurredAt: '2026-08-23T10:00:00.000Z',
  });
  return { attempt, runtimeState: guard.createResumeState({ completedTurns: [],
    accountedProviderAttempts: [attempt] }) };
}

function controller() {
  const publicCase = { caseId: 'failed-attempt-resume',
    resourceBudget: { maxNodes: 4, maxCandidates: 3, maxOutputTokens: 600 } };
  const manifestSha256 = 'e'.repeat(64);
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
