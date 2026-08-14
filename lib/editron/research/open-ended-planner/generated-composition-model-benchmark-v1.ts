import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { buildDev02GeneratedCompositionModelPacketV1 } from './generated-composition-model-candidate-v1';
import {
  estimateOfflineInputTokensUpperBoundV2,
  serializeGoogleCountTokensRequestV2,
  type ProviderKindV2,
  type ProviderRouteV2,
  type SerializedProviderRequestV2,
} from './provider-codecs-v2';
import { runProviderStageV2, type ProviderPricingV2 } from './provider-transport-v2';
import { buildDevelopmentSmokePreflightV2 } from './smoke-preflight-v2';
import type { HashedStagePacketV2 } from './staged-packet-v2';

type FetchV2 = typeof fetch;

export interface GeneratedCompositionBenchmarkRouteV1 {
  routeId: 'OPENAI_LUNA' | 'OPENAI_TERRA' | 'GOOGLE_FLASH';
  provider: ProviderKindV2;
  requestModel: string;
  claimedBenchmarkIdentity: string;
  reasoningMode: string;
  pricing: {
    inputUsdPerMillion: number;
    cachedInputUsdPerMillion: number | null;
    cacheWriteUsdPerMillion: number | null;
    outputUsdPerMillion: number;
  };
}

export interface GeneratedCompositionModelBenchmarkPlanV1 {
  planVersion: 'EDITRON_GENERATED_COMPOSITION_MODEL_BENCHMARK_PLAN_V1';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  taskId: 'DEV-02';
  apiImplementationHash: string;
  initialPacketHash: string;
  routes: readonly GeneratedCompositionBenchmarkRouteV1[];
  repairPolicy: { maximumExternalRepairsPerRoute: 1; maximumProviderRunsPerRoute: 2 };
  spend: { maximumUsdPerProviderRun: number; absoluteMaxSpendUsd: number };
  exclusions: readonly { routeId: string; disposition: string; reason: string; source: string }[];
  planHash: string;
}

export interface GeneratedCompositionProviderCallV1 {
  run: Awaited<ReturnType<typeof runProviderStageV2>>;
  preflightCounts: readonly {
    attempt: 1 | 2;
    method: 'OFFLINE_UPPER_BOUND' | 'OFFLINE_REPAIR_DELTA_UPPER_BOUND' | 'GOOGLE_COUNT_TOKENS';
    generationRequestHash: string;
    countRequestHash: string | null;
    inputTokens: number;
  }[];
}

const SELECTED_ROUTE_IDS = ['OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH'] as const;

export async function buildGeneratedCompositionModelBenchmarkPlanV1(
  apiImplementationHash: string,
): Promise<Readonly<GeneratedCompositionModelBenchmarkPlanV1>> {
  const packet = buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash });
  const smokePlan = await buildDevelopmentSmokePreflightV2() as unknown as { routes: GeneratedCompositionBenchmarkRouteV1[] };
  const routeMap = new Map(smokePlan.routes.map((route) => [route.routeId, route]));
  const routes = SELECTED_ROUTE_IDS.map((id) => {
    const route = routeMap.get(id);
    if (!route) throw new Error(`MODEL_BENCHMARK_ROUTE_MISSING:${id}`);
    return route;
  });
  const maximumUsdPerProviderRun = packet.packet.stageBudget.maxProviderCostUsd;
  const material = {
    planVersion: 'EDITRON_GENERATED_COMPOSITION_MODEL_BENCHMARK_PLAN_V1' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    taskId: 'DEV-02' as const,
    apiImplementationHash,
    initialPacketHash: packet.packetHash,
    routes,
    repairPolicy: { maximumExternalRepairsPerRoute: 1 as const, maximumProviderRunsPerRoute: 2 as const },
    spend: {
      maximumUsdPerProviderRun,
      absoluteMaxSpendUsd: Number((routes.length * 2 * maximumUsdPerProviderRun).toFixed(2)),
    },
    exclusions: [{
      routeId: 'QWEN_3_8_MAX',
      disposition: 'CREDENTIAL_CLASS_NOT_AUTHORIZED_FOR_AUTOMATED_HARNESS',
      reason: 'The supplied sk-sp Token Plan credential is restricted to interactive coding/agent tools; direct scripts and application backends are prohibited. Earlier qwen3.8-max diagnostic evidence remains separately valid.',
      source: 'https://www.alibabacloud.com/help/en/model-studio/more-tools',
    }],
  };
  return deepFreezeV1({ ...material, planHash: hashCanonicalJsonV1(material) });
}

export async function runGeneratedCompositionSourceProviderCallV1(input: {
  artifact: HashedStagePacketV2;
  route: GeneratedCompositionBenchmarkRouteV1;
  apiKey: string;
  fetchImpl?: FetchV2;
}): Promise<Readonly<GeneratedCompositionProviderCallV1>> {
  if (!input.apiKey.trim()) throw new Error(`MODEL_BENCHMARK_PROVIDER_KEY_MISSING:${input.route.provider}`);
  const fetchImpl = input.fetchImpl ?? fetch;
  const route: ProviderRouteV2 = {
    kind: input.route.provider,
    apiKey: input.apiKey,
    model: input.route.requestModel,
    modelSnapshot: input.route.claimedBenchmarkIdentity,
    reasoningMode: input.route.reasoningMode,
  };
  const preflightCounts: GeneratedCompositionProviderCallV1['preflightCounts'][number][] = [];
  const run = await runProviderStageV2({
    artifact: input.artifact,
    route,
    pricing: pricing(input.route),
    fetchImpl,
    preflightInputTokens: async ({ attempt, request, priorRequest, priorInputTokens }) => {
      const count = await countRequest({ attempt, request, priorRequest, priorInputTokens, route, fetchImpl });
      preflightCounts.push(count);
      return count.inputTokens;
    },
  });
  return deepFreezeV1({ run, preflightCounts });
}

function pricing(route: GeneratedCompositionBenchmarkRouteV1): ProviderPricingV2 {
  return {
    inputUsdPerMillion: route.pricing.inputUsdPerMillion,
    outputUsdPerMillion: route.pricing.outputUsdPerMillion,
    ...(route.pricing.cachedInputUsdPerMillion === null ? {} : { cachedInputUsdPerMillion: route.pricing.cachedInputUsdPerMillion }),
    ...(route.pricing.cacheWriteUsdPerMillion === null ? {} : { cacheWriteUsdPerMillion: route.pricing.cacheWriteUsdPerMillion }),
  };
}

async function countRequest(input: {
  attempt: 1 | 2;
  request: SerializedProviderRequestV2;
  priorRequest?: SerializedProviderRequestV2;
  priorInputTokens?: number;
  route: ProviderRouteV2;
  fetchImpl: FetchV2;
}): Promise<GeneratedCompositionProviderCallV1['preflightCounts'][number]> {
  if (input.route.kind === 'google') {
    const count = serializeGoogleCountTokensRequestV2({ route: input.route, generationRequest: input.request });
    const response = await input.fetchImpl(count.endpoint, {
      method: 'POST', headers: count.headers, body: JSON.stringify(count.body), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`MODEL_BENCHMARK_COUNT_TOKENS_HTTP_${response.status}`);
    const value = await response.json() as { totalTokens?: unknown };
    if (!Number.isSafeInteger(value.totalTokens) || Number(value.totalTokens) < 0) throw new Error('MODEL_BENCHMARK_COUNT_TOKENS_INVALID');
    return {
      attempt: input.attempt, method: 'GOOGLE_COUNT_TOKENS', generationRequestHash: input.request.requestHash,
      countRequestHash: count.requestHash, inputTokens: Number(value.totalTokens),
    };
  }
  const repair = input.attempt === 2 && input.priorRequest && input.priorInputTokens !== undefined;
  const inputTokens = repair
    ? input.priorInputTokens! + Math.max(0, requestBytes(input.request) - requestBytes(input.priorRequest!)) + 256
    : estimateOfflineInputTokensUpperBoundV2(input.request, 0);
  return {
    attempt: input.attempt,
    method: repair ? 'OFFLINE_REPAIR_DELTA_UPPER_BOUND' : 'OFFLINE_UPPER_BOUND',
    generationRequestHash: input.request.requestHash,
    countRequestHash: null,
    inputTokens,
  };
}

function requestBytes(request: SerializedProviderRequestV2): number {
  return Buffer.byteLength(JSON.stringify(request.body), 'utf8');
}
