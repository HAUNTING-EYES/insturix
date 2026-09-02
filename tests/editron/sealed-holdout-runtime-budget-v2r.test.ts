import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildBudgetedSealedHoldoutEpisodeContextV2R,
  runBudgetedSealedHoldoutEpisodeV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-episode-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
  type SealedHoldoutCohortManifestV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  bindProviderNativeRuntimeInputTokenBoundV2R,
  bindSealedHoldoutInputTokenBoundV2R,
  ProviderNativeRuntimeBudgetControllerV2R,
  SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
  type SealedHoldoutRuntimeAuthorizationV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-budget-v2r';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

const LUNA_ROUTE: ProviderNativeRouteV2R = {
  routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
  claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
};
const GOOGLE_ROUTE: ProviderNativeRouteV2R = {
  routeId: 'GOOGLE_FLASH', provider: 'google', model: 'gemini-3.7-flash',
  claimedModelIdentity: 'gemini-3.7-flash', reasoningMode: 'medium',
};

async function manifest(): Promise<Readonly<SealedHoldoutCohortManifestV2R>> {
  const bytes = await readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

function authorization(
  cohort: Readonly<SealedHoldoutCohortManifestV2R>,
  caseId: string,
  route: Readonly<ProviderNativeRouteV2R> = LUNA_ROUTE,
  overrides: Partial<SealedHoldoutRuntimeAuthorizationV2R> = {},
): SealedHoldoutRuntimeAuthorizationV2R {
  const taskCase = cohort.cases.find((entry) => entry.caseId === caseId);
  if (!taskCase) throw new Error(`TEST_CASE_MISSING:${caseId}`);
  const pricing = route.provider === 'openai'
    ? {
        normalInputNanoUsdPerToken: 1_000,
        cachedInputNanoUsdPerToken: 100,
        cacheWriteNanoUsdPerToken: 1_250,
        outputNanoUsdPerToken: 6_000,
      }
    : {
        normalInputNanoUsdPerToken: 750,
        cachedInputNanoUsdPerToken: 75,
        cacheWriteNanoUsdPerToken: 750,
        outputNanoUsdPerToken: 3_750,
      };
  return {
    version: SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R,
    manifestSha256: cohort.manifestSha256,
    caseId,
    publicCaseSha256: taskCase.publicCaseSha256,
    routeId: route.routeId,
    claimedModelIdentity: route.claimedModelIdentity,
    routeSha256: hashCanonicalJsonV1(route),
    approvedBy: 'admin',
    approvedAt: '2026-08-22T00:00:00.000Z',
    maxInputTokensPerTurn: 85_000,
    absoluteMaxSpendMicroUsd: 5_000_000,
    pricing,
    ...overrides,
  };
}

function countInputTokens(inputTokensUpperBound = 1_000) {
  return vi.fn(async (request: Parameters<typeof bindSealedHoldoutInputTokenBoundV2R>[0]['request']) => bindSealedHoldoutInputTokenBoundV2R({
    request,
    inputTokensUpperBound,
    method: 'TEST_DETERMINISTIC_UPPER_BOUND_V1',
  }));
}

describe('sealed holdout fail-closed runtime budget V2R', () => {
  it('derives the provider, node and cumulative-output limits from the public case', async () => {
    const cohort = await manifest();
    const context = buildBudgetedSealedHoldoutEpisodeContextV2R({
      manifest: cohort, caseId: 'HOLD-06:C1',
    });
    expect(context.episodeId).toContain('EPISODE_V2R_3');
    expect(context.budget).toEqual({
      maxTurns: 7, maxOutputTokensPerTurn: 2500, maxIdenticalCalls: 2,
    });

    const requests: Array<Record<string, unknown>> = [];
    const receipt = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1'),
      countInputTokens: countInputTokens(),
      invoke: vi.fn(async (request) => {
        requests.push(request.body);
        return {
          status: 200,
          body: openAiFinish('finish-accounted', 'POLICY_BLOCKED', {
            input: 100, cached: 10, cacheWrite: 20, output: 50, reasoning: 15,
          }),
        };
      }),
      executeIsolated: vi.fn(),
    });

    expect(requests[0].max_output_tokens).toBe(2500);
    expect(receipt.providerEpisode.terminal.disposition).toBe('POLICY_BLOCKED');
    expect(receipt.runtimeBudget.assessment).toBe('ACCOUNTED_WITHIN_BUDGET');
    expect(receipt.runtimeBudget.usage).toMatchObject({
      providerTurns: 1,
      selectedOperations: 0,
      inputTokens: 100,
      cachedInputTokens: 10,
      cacheWriteTokens: 20,
      outputTokens: 50,
      spentNanoUsd: 396_000,
    });
  });

  it('does not invoke a provider when input or worst-case spend exceeds authorization', async () => {
    const cohort = await manifest();
    const invoke = vi.fn();
    const oversized = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1'),
      countInputTokens: countInputTokens(85_001), invoke, executeIsolated: vi.fn(),
    });
    expect(oversized.providerEpisode.terminal).toMatchObject({
      disposition: 'RESOURCE_BUDGET_EXHAUSTED',
      reasonCodes: ['INPUT_TOKEN_BUDGET_EXCEEDED'],
    });
    expect(invoke).not.toHaveBeenCalled();

    const underfundedInvoke = vi.fn();
    const underfunded = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1', LUNA_ROUTE, {
        absoluteMaxSpendMicroUsd: 1,
      }),
      countInputTokens: countInputTokens(1_000),
      invoke: underfundedInvoke,
      executeIsolated: vi.fn(),
    });
    expect(underfunded.providerEpisode.terminal.reasonCodes)
      .toEqual(['ABSOLUTE_SPEND_BUDGET_EXCEEDED_PREINVOKE']);
    expect(underfundedInvoke).not.toHaveBeenCalled();
  });

  it('fails closed before dispatch when worst-case cost loses integer precision', async () => {
    const cohort = await manifest();
    const invoke = vi.fn();
    const receipt = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1', LUNA_ROUTE, {
        pricing: {
          normalInputNanoUsdPerToken: Number.MAX_SAFE_INTEGER,
          cachedInputNanoUsdPerToken: 0,
          cacheWriteNanoUsdPerToken: Number.MAX_SAFE_INTEGER,
          outputNanoUsdPerToken: 1,
        },
      }),
      countInputTokens: countInputTokens(2), invoke, executeIsolated: vi.fn(),
    });

    expect(receipt.providerEpisode.terminal).toMatchObject({
      disposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
      reasonCodes: ['PREINVOKE_COST_OVERFLOW'],
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects missing and forged provider usage before any operation executes', async () => {
    const cohort = await manifest();
    const executeIsolated = vi.fn();
    const missing = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1'),
      countInputTokens: countInputTokens(),
      invoke: vi.fn(async () => ({
        status: 200,
        body: openAiCall('missing-usage', 'list_user_assets', {
          projectId: 'proj-h06',
        }),
      })),
      executeIsolated,
    });
    expect(missing.providerEpisode.terminal).toMatchObject({
      disposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
      reasonCodes: ['PROVIDER_USAGE_MISSING_OR_INVALID'],
    });
    expect(executeIsolated).not.toHaveBeenCalled();

    const forged = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1'),
      countInputTokens: countInputTokens(),
      invoke: vi.fn(async () => ({
        status: 200,
        body: openAiFinish('forged-total', 'UNVERIFIABLE', {
          input: 100, cached: 0, cacheWrite: 0, output: 50,
          reasoning: 0, totalOverride: 999,
        }),
      })),
      executeIsolated,
    });
    expect(forged.providerEpisode.terminal.reasonCodes)
      .toEqual(['PROVIDER_USAGE_MISSING_OR_INVALID']);
    expect(executeIsolated).not.toHaveBeenCalled();
  });

  it('blocks oversized owner alternatives and the fifth selected operation', async () => {
    const cohort = await manifest();
    const candidateExecute = vi.fn(async () => ({
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
      disposition: 'OK' as const,
      output: { assets: [{ assetId: 'a' }, { assetId: 'b' }, { assetId: 'c' }], evidence: {} },
      evidenceIds: ['E1'],
    }));
    const candidateReceipt = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1'),
      countInputTokens: countInputTokens(),
      invoke: vi.fn(async () => ({
        status: 200,
        body: openAiCall('candidate-overflow', 'list_user_assets', {
          projectId: 'proj-h06',
        }, { input: 100, cached: 0, cacheWrite: 0, output: 20, reasoning: 0 }),
      })),
      executeIsolated: candidateExecute,
    });
    expect(candidateReceipt.providerEpisode.terminal.reasonCodes)
      .toEqual(['CANDIDATE_BUDGET_EXCEEDED_OUTPUT']);
    expect(candidateExecute).toHaveBeenCalledTimes(1);

    let invocation = 0;
    const nodeExecute = vi.fn(async () => ({
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
      disposition: 'OK' as const,
      output: { assets: [], evidence: {} }, evidenceIds: ['E1'],
    }));
    const nodeReceipt = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1'),
      countInputTokens: countInputTokens(),
      invoke: vi.fn(async () => {
        invocation += 1;
        return {
          status: 200,
          body: openAiCall(`node-${invocation}`, 'search_user_assets', {
            projectId: 'proj-h06', query: `distinct-query-${invocation}`,
          }, { input: 100, cached: 0, cacheWrite: 0, output: 20, reasoning: 0 }),
        };
      }),
      executeIsolated: nodeExecute,
    });
    expect(nodeReceipt.providerEpisode.terminal.reasonCodes)
      .toEqual(['SELECTED_OPERATION_BUDGET_EXHAUSTED']);
    expect(nodeExecute).toHaveBeenCalledTimes(4);
    expect(invocation).toBe(5);
  });

  it('counts Google thought tokens as generated output and billable output', async () => {
    const cohort = await manifest();
    const receipt = await runBudgetedSealedHoldoutEpisodeV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: GOOGLE_ROUTE,
      authorization: authorization(cohort, 'HOLD-06:C1', GOOGLE_ROUTE),
      countInputTokens: countInputTokens(),
      invoke: vi.fn(async () => ({
        status: 200,
        body: {
          id: 'google-finish', model: 'gemini-3.7-flash', status: 'completed',
          steps: [{
            type: 'function_call', id: 'finish-google',
            name: 'finish_editron_research_episode',
            arguments: {
              disposition: 'UNVERIFIABLE', reasonCodes: ['NO_PROOF'],
              evidenceIds: [], summary: 'No proof was supplied.',
            },
          }],
          usage: {
            total_input_tokens: 100, total_cached_tokens: 10,
            total_output_tokens: 20, total_thought_tokens: 30, total_tokens: 150,
          },
        },
      })),
      executeIsolated: vi.fn(),
    });
    expect(receipt.runtimeBudget.usage).toMatchObject({
      inputTokens: 100, cachedInputTokens: 10,
      outputTokens: 50, thoughtTokens: 30,
      spentNanoUsd: 255_750,
    });
  });

  it('separates the visible response cap from the billable generated-token bound', async () => {
    const { guard, request } = googleAccountingFixture();

    expect(await guard.beforeTurn({ turn: 1, configuredMaxOutputTokens: 1_000 }))
      .toMatchObject({ status: 'ALLOW', maxOutputTokens: 1_000 });
    const before = await guard.beforeInvoke({
      turn: 1, request, maxOutputTokens: 1_000,
    });
    expect(before).toMatchObject({
      status: 'ALLOW',
      audit: {
        maxOutputTokens: 1_000,
        maxBillableGeneratedTokens: 9_000,
        reservedWorstCaseNanoUsd: 33_825_000,
      },
    });
    const after = guard.afterInvoke({
      turn: 1,
      request,
      maxOutputTokens: 1_000,
      response: {
        status: 200,
        body: {
          usage: {
            total_input_tokens: 100,
            total_cached_tokens: 0,
            total_output_tokens: 900,
            total_thought_tokens: 8_000,
            total_tokens: 9_000,
          },
        },
      },
    });
    expect(after).toMatchObject({ status: 'ALLOW' });
  });

  it('rejects visible response overflow independently of hidden thought usage', async () => {
    const { guard, request } = googleAccountingFixture();
    await guard.beforeTurn({ turn: 1, configuredMaxOutputTokens: 1_000 });
    await guard.beforeInvoke({ turn: 1, request, maxOutputTokens: 1_000 });
    expect(guard.afterInvoke({
      turn: 1, request, maxOutputTokens: 1_000,
      response: { status: 200, body: { usage: {
        total_input_tokens: 100, total_cached_tokens: 0,
        total_output_tokens: 1_001, total_thought_tokens: 0,
        total_tokens: 1_101,
      } } },
    })).toMatchObject({
      status: 'DENY', reasonCode: 'ACTUAL_RESPONSE_EXCEEDS_REQUEST_LIMIT',
    });
  });

  it('rejects total billable generation above its separately authorized bound', async () => {
    const { guard, request } = googleAccountingFixture();
    await guard.beforeTurn({ turn: 1, configuredMaxOutputTokens: 1_000 });
    await guard.beforeInvoke({ turn: 1, request, maxOutputTokens: 1_000 });
    expect(guard.afterInvoke({
      turn: 1, request, maxOutputTokens: 1_000,
      response: { status: 200, body: { usage: {
        total_input_tokens: 100, total_cached_tokens: 0,
        total_output_tokens: 900, total_thought_tokens: 8_101,
        total_tokens: 9_101,
      } } },
    })).toMatchObject({
      status: 'DENY',
      reasonCode: 'ACTUAL_GENERATED_TOKENS_EXCEED_AUTHORIZED_BOUND',
    });
  });
});

function googleAccountingFixture() {
  const request = {
    provider: 'google' as const,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    authMode: 'X_GOOG_API_KEY' as const,
    body: { model: 'gemini-3.7-flash' },
    requestHash: 'a'.repeat(64),
  };
  const guard = new ProviderNativeRuntimeBudgetControllerV2R({
    guardKind: 'TEST_GOOGLE_GENERATED_TOKEN_ACCOUNTING_V1',
    guardIdentitySha256: 'b'.repeat(64),
    authorizationSha256: 'c'.repeat(64),
    inputTokenBoundVersion: 'TEST_GOOGLE_INPUT_BOUND_V1',
    limits: {
      maxProviderTurns: 1,
      maxSelectedOperations: 1,
      maxCandidatesPerOperation: 1,
      maxCumulativeOutputTokens: 9_000,
      maxBillableGeneratedTokensPerInvoke: 9_000,
      maxInputTokensPerTurn: 1_000,
      absoluteMaxSpendNanoUsd: 40_000_000,
    },
    pricing: {
      normalInputNanoUsdPerToken: 750,
      cachedInputNanoUsdPerToken: 75,
      cacheWriteNanoUsdPerToken: 750,
      outputNanoUsdPerToken: 3_750,
    },
    countInputTokens: async (candidate) =>
      bindProviderNativeRuntimeInputTokenBoundV2R({
        version: 'TEST_GOOGLE_INPUT_BOUND_V1',
        request: candidate,
        inputTokensUpperBound: 100,
        method: 'TEST_EXACT_INPUT_BOUND',
      }),
  });
  return { guard, request };
}

function openAiCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
  usage?: {
    input: number; cached: number; cacheWrite: number; output: number;
    reasoning: number; totalOverride?: number;
  },
): Record<string, unknown> {
  return {
    id, model: 'gpt-5.6-luna', status: 'completed',
    output: [{
      type: 'function_call', call_id: `call-${id}`, name,
      arguments: JSON.stringify(args),
    }],
    ...(usage ? { usage: openAiUsage(usage) } : {}),
  };
}

function openAiFinish(
  id: string,
  disposition: string,
  usage: {
    input: number; cached: number; cacheWrite: number; output: number;
    reasoning: number; totalOverride?: number;
  },
): Record<string, unknown> {
  return openAiCall(id, 'finish_editron_research_episode', {
    disposition, reasonCodes: [`MODEL_${disposition}`], evidenceIds: [],
    summary: `Finished as ${disposition}`,
  }, usage);
}

function openAiUsage(input: {
  input: number; cached: number; cacheWrite: number; output: number;
  reasoning: number; totalOverride?: number;
}): Record<string, unknown> {
  return {
    input_tokens: input.input,
    input_tokens_details: {
      cached_tokens: input.cached, cache_write_tokens: input.cacheWrite,
    },
    output_tokens: input.output,
    output_tokens_details: { reasoning_tokens: input.reasoning },
    total_tokens: input.totalOverride ?? input.input + input.output,
  };
}
