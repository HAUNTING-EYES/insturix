import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { createProviderNativeDurableDispatchIntentV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-durable-dispatch-intent-v2r';
import {
  createProviderNativeEpisodeResumeCheckpointV2R,
  PROVIDER_NATIVE_EPISODE_RESUME_DISPATCH_RUNTIME_BOUND_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R,
  verifyProviderNativeEpisodeResumeCheckpointV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  bindSealedHoldoutInputTokenBoundV2R,
  SealedHoldoutRuntimeBudgetControllerV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';

const ROUTE = { routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium' } as const;
const REQUEST = { provider: 'openai', requestHash: 'c'.repeat(64),
  body: { max_output_tokens: 512 } } as unknown as SerializedProviderNativeTurnV2R;
const EPISODE_ID = 'pending-dispatch-episode-1';
const CONTEXT_SHA256 = 'a'.repeat(64);
const TOOL_SET_SHA256 = 'b'.repeat(64);

describe('provider-native pending dispatch resume', () => {
  it('persists and restores the sole pending reservation without claiming delivery', async () => {
    const first = controller();
    const beforeTurn = first.beforeTurn({ turn: 1, configuredMaxOutputTokens: 512 });
    const beforeInvoke = await first.beforeInvoke({ turn: 1, request: REQUEST,
      maxOutputTokens: 512 });
    const intent = createProviderNativeDurableDispatchIntentV2R({
      episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
      toolSetSha256: TOOL_SET_SHA256, route: ROUTE, turn: 1,
      requestHash: REQUEST.requestHash, maxOutputTokens: 512,
      inputTokensUpperBound: Number(beforeInvoke.audit.inputTokensUpperBound),
      reservedWorstCaseNanoUsd: Number(beforeInvoke.audit.reservedWorstCaseNanoUsd),
      runtimeGuardAudit: [beforeTurn.audit, beforeInvoke.audit],
      createdAt: '2026-08-23T13:00:00.000Z',
    });
    const runtimeGuardResumeState = first.createPendingDispatchResumeState({
      completedTurns: [], pendingProviderDispatchIntent: intent,
    });
    const checkpoint = createProviderNativeEpisodeResumeCheckpointV2R({
      route: ROUTE, episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
      toolSetSha256: TOOL_SET_SHA256, completedTurns: [],
      runtimeGuardResumeState, pendingProviderDispatchIntent: intent,
    });

    expect(checkpoint.checkpointVersion)
      .toBe(PROVIDER_NATIVE_EPISODE_RESUME_DISPATCH_RUNTIME_BOUND_VERSION_V2R);
    expect(runtimeGuardResumeState.version)
      .toBe(PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R);
    expect(() => verifyProviderNativeEpisodeResumeCheckpointV2R(checkpoint)).not.toThrow();

    const restored = controller();
    restored.restoreResumeState({ resumeState: runtimeGuardResumeState,
      completedTurns: [], pendingProviderDispatchIntent: intent });
    expect(restored.receipt('PROVIDER_TIMEOUT').usage).toMatchObject({
      providerTurns: 1, outputTokens: 0, spentNanoUsd: 0,
      pendingRequest: { turn: 1, requestHash: REQUEST.requestHash,
        maxOutputTokens: 512, inputTokensUpperBound: 100 },
    });
    expect(restored.beforeTurn({ turn: 1, configuredMaxOutputTokens: 512 }))
      .toMatchObject({ status: 'DENY', reasonCode: 'PENDING_REQUEST_USAGE_UNRESOLVED' });
    expect(restored.settleUnknownInvoke({ turn: 1, request: REQUEST,
      maxOutputTokens: 512, transportErrorCode: 'PROCESS_EXIT_AFTER_DISPATCH_INTENT' }))
      .toMatchObject({ status: 'ALLOW', audit: {
        accountingMode: 'CONSERVATIVE_WORST_CASE_RESERVATION' } });
  });

  it('rejects a copied intent or a checkpoint missing its intent', async () => {
    const material = await pendingMaterial();
    const copied = structuredClone(material.intent);
    Object.assign(copied.scope, { episodeId: 'copied-episode' });
    expect(() => createProviderNativeEpisodeResumeCheckpointV2R({
      route: ROUTE, episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
      toolSetSha256: TOOL_SET_SHA256, completedTurns: [],
      runtimeGuardResumeState: material.runtimeState,
      pendingProviderDispatchIntent: copied,
    })).toThrow();
    expect(() => controller().restoreResumeState({
      resumeState: material.runtimeState, completedTurns: [],
    })).toThrow('PROVIDER_NATIVE_RUNTIME_RESUME_STATE_ENVELOPE_INVALID');
  });
});

async function pendingMaterial() {
  const guard = controller();
  const beforeTurn = guard.beforeTurn({ turn: 1, configuredMaxOutputTokens: 512 });
  const beforeInvoke = await guard.beforeInvoke({ turn: 1, request: REQUEST,
    maxOutputTokens: 512 });
  const intent = createProviderNativeDurableDispatchIntentV2R({
    episodeId: EPISODE_ID, contextSha256: CONTEXT_SHA256,
    toolSetSha256: TOOL_SET_SHA256, route: ROUTE, turn: 1,
    requestHash: REQUEST.requestHash, maxOutputTokens: 512,
    inputTokensUpperBound: Number(beforeInvoke.audit.inputTokensUpperBound),
    reservedWorstCaseNanoUsd: Number(beforeInvoke.audit.reservedWorstCaseNanoUsd),
    runtimeGuardAudit: [beforeTurn.audit, beforeInvoke.audit],
    createdAt: '2026-08-23T13:00:00.000Z',
  });
  return { intent, runtimeState: guard.createPendingDispatchResumeState({
    completedTurns: [], pendingProviderDispatchIntent: intent }) };
}

function controller() {
  const publicCase = { caseId: 'pending-dispatch-resume',
    resourceBudget: { maxNodes: 4, maxCandidates: 3, maxOutputTokens: 600 } };
  const manifestSha256 = 'e'.repeat(64);
  const publicCaseSha256 = hashCanonicalJsonV1(publicCase);
  return new SealedHoldoutRuntimeBudgetControllerV2R({ publicCase,
    publicCaseSha256, manifestSha256, route: ROUTE, authorization: {
      version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256, caseId: publicCase.caseId, publicCaseSha256,
      routeId: ROUTE.routeId, claimedModelIdentity: ROUTE.claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(ROUTE), approvedBy: 'admin',
      approvedAt: '2026-08-23T13:00:00.000Z', maxInputTokensPerTurn: 85_000,
      absoluteMaxSpendMicroUsd: 10_000, pricing: {
        normalInputNanoUsdPerToken: 1_000, cachedInputNanoUsdPerToken: 100,
        cacheWriteNanoUsdPerToken: 1_250, outputNanoUsdPerToken: 6_000 } },
    countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({
      request, inputTokensUpperBound: 100, method: 'TEST_BOUND_V1' }),
  });
}
