import {
  serializeGoogleCountTokensRequestV2,
  type ProviderRouteV2,
  type SerializedProviderRequestV2,
} from './provider-codecs-v2';
import { estimateOpenAiGpt56InputTokensV2 } from './openai-input-token-counter-v2';
import type { DevelopmentModelRouteV2 } from './development-cohort-runner-v2';
import { runProviderStageV2, type ProviderPricingV2 } from './provider-transport-v2';
import {
  runQwenProviderStageV2,
} from './qwen-agent-shell-adapter-v2';
import type { QwenProviderExecutorV2 } from './qwen-direct-provider-v2';

type FetchV2 = typeof fetch;

interface DirectRouteFactV2 {
  routeId: 'OPENAI_LUNA' | 'OPENAI_TERRA' | 'GOOGLE_FLASH';
  provider: 'openai' | 'google';
  requestModel: string;
  claimedModelIdentity: string;
  reasoningMode: string;
  pricing: ProviderPricingV2;
}

const DIRECT_ROUTES: readonly DirectRouteFactV2[] = [
  {
    routeId: 'OPENAI_LUNA', provider: 'openai', requestModel: 'gpt-5.6-luna',
    claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
    pricing: {
      inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1,
      cacheWriteUsdPerMillion: 1.25, outputUsdPerMillion: 6,
    },
  },
  {
    routeId: 'OPENAI_TERRA', provider: 'openai', requestModel: 'gpt-5.6-terra',
    claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
    pricing: {
      inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25,
      cacheWriteUsdPerMillion: 3.125, outputUsdPerMillion: 15,
    },
  },
  {
    routeId: 'GOOGLE_FLASH', provider: 'google', requestModel: 'gemini-3.6-flash',
    claimedModelIdentity: 'gemini-3.6-flash', reasoningMode: 'medium',
    pricing: {
      inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075,
      outputUsdPerMillion: 3.75,
    },
  },
] as const;

export function buildDevelopmentModelRoutesV2(input: {
  environment: Readonly<Record<string, string | undefined>>;
  qwenBudgetMode: 'FAIR_STAGE_BUDGET' | 'ASYNC_QUALITY_DIAGNOSTIC';
  qwenDiagnosticTimeoutOverrideMs?: number;
  fetchImpl?: FetchV2;
  qwenExecute?: QwenProviderExecutorV2;
}): readonly DevelopmentModelRouteV2[] {
  const openAIKey = requiredKey(input.environment.OPENAI_API_KEY, 'OPENAI_API_KEY');
  const googleKey = requiredKey(
    input.environment.GEMINI_API_KEY ?? input.environment.GOOGLE_API_KEY,
    'GEMINI_API_KEY_OR_GOOGLE_API_KEY',
  );
  const fetchImpl = input.fetchImpl ?? fetch;

  return [
    ...DIRECT_ROUTES.map((fact): DevelopmentModelRouteV2 => ({
      routeId: fact.routeId,
      claimedModelIdentity: fact.claimedModelIdentity,
      costBasis: 'USD_METERED',
      runStage: (artifact) => {
        const route: ProviderRouteV2 = {
          kind: fact.provider,
          apiKey: fact.provider === 'openai' ? openAIKey : googleKey,
          model: fact.requestModel,
          modelSnapshot: fact.claimedModelIdentity,
          reasoningMode: fact.reasoningMode,
        };
        return runProviderStageV2({
          artifact,
          route,
          pricing: fact.pricing,
          fetchImpl,
          preflightInputTokens: ({ request }) => countInputTokens({ request, route, fetchImpl }),
        });
      },
    })),
    buildQwenDevelopmentModelRouteV2({
      environment: input.environment,
      qwenBudgetMode: input.qwenBudgetMode,
      ...(input.qwenDiagnosticTimeoutOverrideMs === undefined
        ? {} : { diagnosticTimeoutOverrideMs: input.qwenDiagnosticTimeoutOverrideMs }),
      ...(input.qwenExecute ? { qwenExecute: input.qwenExecute } : {}),
    }),
  ];
}

export function buildQwenDevelopmentModelRouteV2(input: {
  environment: Readonly<Record<string, string | undefined>>;
  qwenBudgetMode: 'FAIR_STAGE_BUDGET' | 'ASYNC_QUALITY_DIAGNOSTIC';
  diagnosticTimeoutOverrideMs?: number;
  qwenExecute?: QwenProviderExecutorV2;
}): DevelopmentModelRouteV2 {
  const qwenKey = requiredKey(
    input.environment.EDITRON_QWEN_TOKEN_PLAN_KEY ?? input.environment.QWEN_API_KEY,
    'EDITRON_QWEN_TOKEN_PLAN_KEY_OR_QWEN_API_KEY',
  );
  return {
    routeId: 'QWEN_3_8_MAX',
    claimedModelIdentity: 'qwen3.8-max',
    costBasis: 'TOKEN_PLAN_CREDITS_UNPRICED',
    runStage: (artifact) => runQwenProviderStageV2({
      artifact,
      apiKey: qwenKey,
      budgetMode: input.qwenBudgetMode,
      ...(input.diagnosticTimeoutOverrideMs === undefined
        ? {} : { diagnosticTimeoutOverrideMs: input.diagnosticTimeoutOverrideMs }),
      ...(input.qwenExecute ? { execute: input.qwenExecute } : {}),
    }),
  };
}

async function countInputTokens(input: {
  request: SerializedProviderRequestV2;
  route: ProviderRouteV2;
  fetchImpl: FetchV2;
}): Promise<number> {
  if (input.route.kind !== 'google') {
    return estimateOpenAiGpt56InputTokensV2(input.request);
  }
  const request = serializeGoogleCountTokensRequestV2({
    route: input.route,
    generationRequest: input.request,
  });
  const response = await input.fetchImpl(request.endpoint, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`COHORT_COUNT_TOKENS_HTTP_${response.status}`);
  const body = await response.json() as { totalTokens?: unknown };
  if (!Number.isSafeInteger(body.totalTokens) || Number(body.totalTokens) < 0) {
    throw new Error('COHORT_COUNT_TOKENS_RESPONSE_INVALID');
  }
  return Number(body.totalTokens);
}

function requiredKey(value: string | undefined, name: string): string {
  const key = value?.trim() ?? '';
  if (!key) throw new Error(`COHORT_PROVIDER_KEY_MISSING:${name}`);
  return key;
}
