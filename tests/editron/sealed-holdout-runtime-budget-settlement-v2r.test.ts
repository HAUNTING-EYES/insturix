import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
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
const PUBLIC_CASE = {
  caseId: 'attempt-settlement-1',
  resourceBudget: { maxNodes: 4, maxCandidates: 3, maxOutputTokens: 600 },
};
const REQUEST = {
  provider: 'openai', requestHash: 'a'.repeat(64),
  body: { max_output_tokens: 512 },
} as unknown as Readonly<SerializedProviderNativeTurnV2R>;

describe('sealed runtime unknown provider-attempt settlement', () => {
  it('conservatively consumes the authorized request reservation', async () => {
    const guard = controller();
    await authorize(guard);
    const settlement = guard.settleUnknownInvoke({
      turn: 1, request: REQUEST, maxOutputTokens: 512,
      transportErrorCode: 'PROVIDER_TIMEOUT',
    });
    const receipt = guard.receipt('PROVIDER_TIMEOUT');

    expect(settlement).toMatchObject({ status: 'ALLOW', audit: {
      phase: 'AFTER_INVOKE_RESULT_UNAVAILABLE_CONSERVATIVE_RESERVATION',
      accountingMode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
      accountedOutputTokens: 512,
      accountedCostNanoUsd: 3_197_000,
    } });
    expect(receipt.assessment).toBe('ACCOUNTED_WITHIN_BUDGET');
    expect(receipt.usage).toMatchObject({
      providerTurns: 1, outputTokens: 512, spentNanoUsd: 3_197_000,
      conservativeReservedOutputTokens: 512,
      conservativeReservedNanoUsd: 3_197_000,
      pendingRequest: null,
    });
    expect(guard.beforeTurn({ turn: 2, configuredMaxOutputTokens: 512 }))
      .toMatchObject({ status: 'ALLOW', maxOutputTokens: 88 });
  });

  it('uses the same conservative bound for an HTTP failure with no usage', async () => {
    const guard = controller();
    await authorize(guard);
    const settlement = guard.afterInvoke({
      turn: 1, request: REQUEST, maxOutputTokens: 512,
      response: { status: 429, body: { error: { code: 'rate_limit' } } },
    });
    expect(settlement).toMatchObject({ status: 'ALLOW', audit: {
      phase: 'AFTER_INVOKE_HTTP_FAILURE_CONSERVATIVE_RESERVATION',
      responseStatus: 429, accountedOutputTokens: 512,
    } });
    expect(guard.receipt('PROVIDER_RATE_LIMIT').usage)
      .toMatchObject({ spentNanoUsd: 3_197_000, pendingRequest: null });
  });

  it('refuses mismatched unknown-result settlement and keeps it unresolved', async () => {
    const guard = controller();
    await authorize(guard);
    const settlement = guard.settleUnknownInvoke({
      turn: 2, request: REQUEST, maxOutputTokens: 512,
      transportErrorCode: 'PROVIDER_TIMEOUT',
    });
    expect(settlement).toMatchObject({ status: 'DENY',
      disposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
      reasonCode: 'UNKNOWN_RESULT_REQUEST_BINDING_INVALID' });
    expect(guard.receipt('RESOURCE_ACCOUNTING_UNVERIFIABLE'))
      .toMatchObject({ assessment: 'ACCOUNTING_UNVERIFIABLE',
        usage: { pendingRequest: expect.objectContaining({ turn: 1 }) } });
  });
});

async function authorize(guard: SealedHoldoutRuntimeBudgetControllerV2R) {
  expect(guard.beforeTurn({ turn: 1, configuredMaxOutputTokens: 512 }))
    .toMatchObject({ status: 'ALLOW', maxOutputTokens: 512 });
  expect(await guard.beforeInvoke({ turn: 1, request: REQUEST, maxOutputTokens: 512 }))
    .toMatchObject({ status: 'ALLOW' });
}

function controller() {
  const manifestSha256 = 'b'.repeat(64);
  const publicCaseSha256 = hashCanonicalJsonV1(PUBLIC_CASE);
  return new SealedHoldoutRuntimeBudgetControllerV2R({
    publicCase: PUBLIC_CASE, publicCaseSha256, manifestSha256, route: ROUTE,
    authorization: {
      version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
      manifestSha256, caseId: PUBLIC_CASE.caseId, publicCaseSha256,
      routeId: ROUTE.routeId, claimedModelIdentity: ROUTE.claimedModelIdentity,
      routeSha256: hashCanonicalJsonV1(ROUTE), approvedBy: 'admin',
      approvedAt: '2026-08-23T10:00:00.000Z', maxInputTokensPerTurn: 85_000,
      absoluteMaxSpendMicroUsd: 10_000,
      pricing: { normalInputNanoUsdPerToken: 1_000,
        cachedInputNanoUsdPerToken: 100, cacheWriteNanoUsdPerToken: 1_250,
        outputNanoUsdPerToken: 6_000 },
    },
    countInputTokens: async (request) => bindSealedHoldoutInputTokenBoundV2R({
      request, inputTokensUpperBound: 100, method: 'TEST_BOUND_V1',
    }),
  });
}
