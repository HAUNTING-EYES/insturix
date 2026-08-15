import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildDev02GeneratedCompositionModelPacketV1,
  type GeneratedCompositionModelRepairV1,
} from './generated-composition-model-candidate-v1';
import type { GeneratedCompositionProgramV1 } from './generated-composition-program-v1';
import type { GeneratedCompositionSandboxRequestV1 } from './generated-composition-sandbox-contract-v1';
import { GeneratedCompositionSandboxExecutionErrorV1 } from './generated-composition-sandbox-runner-v1';
import {
  estimateOfflineInputTokensUpperBoundV2,
  serializeGoogleCountTokensRequestV2,
  type ProviderRouteV2,
  type ProviderTransportKindV2,
  type SerializedProviderRequestV2,
} from './provider-codecs-v2';
import { runProviderStageV2, type ProviderPricingV2 } from './provider-transport-v2';
import { buildDevelopmentSmokePreflightV2 } from './smoke-preflight-v2';
import type { HashedStagePacketV2 } from './staged-packet-v2';

type FetchV2 = typeof fetch;

export interface GeneratedCompositionBenchmarkRouteV1 {
  routeId: 'OPENAI_LUNA' | 'OPENAI_TERRA' | 'GOOGLE_FLASH' | 'QWEN_3_8_MAX';
  provider: ProviderTransportKindV2;
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

export interface GeneratedCompositionAssessmentFailureV1 {
  artifactType: 'GeneratedCompositionAssessmentFailureV1';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  routeId: GeneratedCompositionBenchmarkRouteV1['routeId'];
  candidateOrdinal: 0 | 1;
  failureStage: GeneratedCompositionModelRepairV1['failureStage'];
  failureClass: GeneratedCompositionAssessmentFailureClassV1;
  observedAt: string;
  programHash: string;
  sourceBundleHash: string;
  diagnostics: readonly string[];
  stateEffects: readonly [];
  failureHash: string;
}

export type GeneratedCompositionAssessmentFailureClassV1 =
  | 'INVALID_PLAN'
  | 'TIMEOUT'
  | 'RENDER_FAIL'
  | 'QUALITY_FAIL'
  | 'SANDBOX_INFRASTRUCTURE_FAIL';

const SELECTED_ROUTE_IDS = ['OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH'] as const;
const QWEN_ROUTE: GeneratedCompositionBenchmarkRouteV1 = {
  routeId: 'QWEN_3_8_MAX',
  provider: 'openrouter',
  requestModel: 'qwen/qwen3.8-max',
  claimedBenchmarkIdentity: 'qwen/qwen3.8-max-20260803',
  reasoningMode: 'high',
  pricing: {
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.25,
    cacheWriteUsdPerMillion: 2.5,
    outputUsdPerMillion: 6,
  },
};

export async function buildGeneratedCompositionModelBenchmarkPlanV1(
  apiImplementationHash: string,
): Promise<Readonly<GeneratedCompositionModelBenchmarkPlanV1>> {
  const packet = buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash });
  const smokePlan = await buildDevelopmentSmokePreflightV2() as unknown as { routes: GeneratedCompositionBenchmarkRouteV1[] };
  const routeMap = new Map(smokePlan.routes.map((route) => [route.routeId, route]));
  const selectedRoutes = SELECTED_ROUTE_IDS.map((id) => {
    const route = routeMap.get(id);
    if (!route) throw new Error(`MODEL_BENCHMARK_ROUTE_MISSING:${id}`);
    return route;
  });
  const routes = [...selectedRoutes, QWEN_ROUTE];
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
    exclusions: [],
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

export function buildGeneratedCompositionAssessmentFailureV1(input: {
  routeId: GeneratedCompositionBenchmarkRouteV1['routeId'];
  candidateOrdinal: 0 | 1;
  failureStage: GeneratedCompositionModelRepairV1['failureStage'];
  failureClass: GeneratedCompositionAssessmentFailureClassV1;
  observedAt: string;
  programHash: string;
  sourceBundleHash: string;
  diagnostics: readonly string[];
}): Readonly<GeneratedCompositionAssessmentFailureV1> {
  const observedAt = new Date(input.observedAt);
  if (Number.isNaN(observedAt.getTime()) || observedAt.toISOString() !== input.observedAt) {
    throw new Error('MODEL_BENCHMARK_FAILURE_TIMESTAMP_INVALID');
  }
  if (!isSha256(input.programHash) || !isSha256(input.sourceBundleHash)) {
    throw new Error('MODEL_BENCHMARK_FAILURE_IDENTITY_INVALID');
  }
  if (input.diagnostics.length < 1 || input.diagnostics.length > 64) {
    throw new Error('MODEL_BENCHMARK_FAILURE_DIAGNOSTIC_COUNT_INVALID');
  }
  const diagnostics = input.diagnostics.map((diagnostic) => {
    const bounded = diagnostic.trim();
    if (!bounded || Buffer.byteLength(bounded, 'utf8') > 2_000) {
      throw new Error('MODEL_BENCHMARK_FAILURE_DIAGNOSTIC_INVALID');
    }
    return bounded;
  });
  const material = {
    artifactType: 'GeneratedCompositionAssessmentFailureV1' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    routeId: input.routeId,
    candidateOrdinal: input.candidateOrdinal,
    failureStage: input.failureStage,
    failureClass: input.failureClass,
    observedAt: input.observedAt,
    programHash: input.programHash,
    sourceBundleHash: input.sourceBundleHash,
    diagnostics,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, failureHash: hashCanonicalJsonV1(material) });
}

export function buildGeneratedCompositionBenchmarkSandboxResourcesV1(
  program: GeneratedCompositionProgramV1,
): Readonly<GeneratedCompositionSandboxRequestV1['resources']> {
  const vcpus = 1;
  const memoryMiB = vcpus * 2_048;
  if (program.resourceBudget.maxMemoryMiB < memoryMiB) {
    throw new Error('MODEL_BENCHMARK_PROGRAM_MEMORY_BELOW_SANDBOX_ALLOCATION');
  }
  return deepFreezeV1({
    wallTimeMs: program.resourceBudget.maxWallTimeMs,
    maxCpuMs: program.resourceBudget.maxCpuMs,
    vcpus,
    memoryMiB,
    maxOutputBytes: program.resourceBudget.maxOutputBytes,
  });
}

export function classifyGeneratedCompositionBenchmarkExecutionErrorV1(
  error: unknown,
): Extract<GeneratedCompositionAssessmentFailureClassV1, 'TIMEOUT' | 'RENDER_FAIL' | 'SANDBOX_INFRASTRUCTURE_FAIL'> {
  return error instanceof GeneratedCompositionSandboxExecutionErrorV1
    ? error.failureClass
    : 'SANDBOX_INFRASTRUCTURE_FAIL';
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

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
