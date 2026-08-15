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

interface GeneratedCompositionBenchmarkRouteBaseV1 {
  routeId: 'OPENAI_LUNA' | 'OPENAI_TERRA' | 'GOOGLE_FLASH' | 'QWEN_3_8_MAX';
  requestModel: string;
  claimedBenchmarkIdentity: string;
  reasoningMode: string;
}

export interface GeneratedCompositionDirectBenchmarkRouteV1 extends GeneratedCompositionBenchmarkRouteBaseV1 {
  executionAdapter: 'DIRECT_PROVIDER';
  provider: ProviderTransportKindV2;
  billingDisposition: 'METERED_USD';
  pricing: {
    inputUsdPerMillion: number;
    cachedInputUsdPerMillion: number | null;
    cacheWriteUsdPerMillion: number | null;
    outputUsdPerMillion: number;
  };
}

export interface GeneratedCompositionAgentShellBenchmarkRouteV1 extends GeneratedCompositionBenchmarkRouteBaseV1 {
  executionAdapter: 'OPENCODE_AGENT_SHELL';
  provider: 'alibaba-token-plan';
  billingDisposition: 'TOKEN_PLAN_CREDITS_NO_COMPARABLE_USD_TELEMETRY';
  pricing: null;
  credentialEnvironmentVariable: 'QWEN_API_KEY';
  termsSource: string;
}

export type GeneratedCompositionBenchmarkRouteV1 =
  | GeneratedCompositionDirectBenchmarkRouteV1
  | GeneratedCompositionAgentShellBenchmarkRouteV1;

export type GeneratedCompositionBenchmarkRouteIdV1 = GeneratedCompositionBenchmarkRouteV1['routeId'];

export interface GeneratedCompositionBenchmarkExecutionV1 {
  executionVersion: 'EDITRON_GENERATED_COMPOSITION_MODEL_BENCHMARK_EXECUTION_V1';
  planHash: string;
  trialId: string;
  routeIds: readonly GeneratedCompositionBenchmarkRouteIdV1[];
  executionAdapter: GeneratedCompositionBenchmarkRouteV1['executionAdapter'];
  maximumAuthorizedSpendUsd: number;
  evidenceDirectoryName: string;
  executionHash: string;
}

export interface GeneratedCompositionModelBenchmarkPlanV1 {
  planVersion: 'EDITRON_GENERATED_COMPOSITION_MODEL_BENCHMARK_PLAN_V1';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  taskId: 'DEV-02';
  apiImplementationHash: string;
  initialPacketHash: string;
  routes: readonly GeneratedCompositionBenchmarkRouteV1[];
  executionLanes: {
    directProviderRouteIds: readonly GeneratedCompositionBenchmarkRouteIdV1[];
    agentShellRouteIds: readonly GeneratedCompositionBenchmarkRouteIdV1[];
  };
  repairPolicy: { maximumExternalRepairsPerRoute: 1; maximumProviderRunsPerRoute: 2 };
  spend: {
    maximumUsdPerProviderRun: number;
    absoluteMaxSpendUsd: number;
    nonUsdRouteIds: readonly GeneratedCompositionBenchmarkRouteIdV1[];
    nonUsdDisposition: 'TOKEN_PLAN_CREDITS_NO_COMPARABLE_USD_TELEMETRY';
  };
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
type SmokeBenchmarkRouteV1 = Omit<
  GeneratedCompositionDirectBenchmarkRouteV1,
  'executionAdapter' | 'billingDisposition'
>;

const QWEN_ROUTE: GeneratedCompositionAgentShellBenchmarkRouteV1 = {
  routeId: 'QWEN_3_8_MAX',
  executionAdapter: 'OPENCODE_AGENT_SHELL',
  provider: 'alibaba-token-plan',
  requestModel: 'qwen3.8-max',
  claimedBenchmarkIdentity: 'qwen3.8-max',
  reasoningMode: 'high',
  billingDisposition: 'TOKEN_PLAN_CREDITS_NO_COMPARABLE_USD_TELEMETRY',
  pricing: null,
  credentialEnvironmentVariable: 'QWEN_API_KEY',
  termsSource: 'https://www.alibabacloud.com/help/en/model-studio/more-tools',
};

export async function buildGeneratedCompositionModelBenchmarkPlanV1(
  apiImplementationHash: string,
): Promise<Readonly<GeneratedCompositionModelBenchmarkPlanV1>> {
  const packet = buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash });
  const smokePlan = await buildDevelopmentSmokePreflightV2() as unknown as { routes: SmokeBenchmarkRouteV1[] };
  const routeMap = new Map(smokePlan.routes.map((route) => [route.routeId, route]));
  const selectedRoutes: GeneratedCompositionDirectBenchmarkRouteV1[] = SELECTED_ROUTE_IDS.map((id) => {
    const route = routeMap.get(id);
    if (!route) throw new Error(`MODEL_BENCHMARK_ROUTE_MISSING:${id}`);
    return {
      ...route,
      executionAdapter: 'DIRECT_PROVIDER',
      billingDisposition: 'METERED_USD',
    };
  });
  const routes: GeneratedCompositionBenchmarkRouteV1[] = [...selectedRoutes, QWEN_ROUTE];
  const directProviderRouteIds = routes.filter(isDirectRoute).map(({ routeId }) => routeId);
  const agentShellRouteIds = routes.filter(isAgentShellRoute).map(({ routeId }) => routeId);
  const maximumUsdPerProviderRun = packet.packet.stageBudget.maxProviderCostUsd;
  const material = {
    planVersion: 'EDITRON_GENERATED_COMPOSITION_MODEL_BENCHMARK_PLAN_V1' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    taskId: 'DEV-02' as const,
    apiImplementationHash,
    initialPacketHash: packet.packetHash,
    routes,
    executionLanes: { directProviderRouteIds, agentShellRouteIds },
    repairPolicy: { maximumExternalRepairsPerRoute: 1 as const, maximumProviderRunsPerRoute: 2 as const },
    spend: {
      maximumUsdPerProviderRun,
      absoluteMaxSpendUsd: Number((directProviderRouteIds.length * 2 * maximumUsdPerProviderRun).toFixed(2)),
      nonUsdRouteIds: agentShellRouteIds,
      nonUsdDisposition: 'TOKEN_PLAN_CREDITS_NO_COMPARABLE_USD_TELEMETRY' as const,
    },
    exclusions: [],
  };
  return deepFreezeV1({ ...material, planHash: hashCanonicalJsonV1(material) });
}

export function buildGeneratedCompositionBenchmarkExecutionV1(
  plan: GeneratedCompositionModelBenchmarkPlanV1,
  input: {
    trialId: string;
    routeIds: readonly string[];
  },
): Readonly<GeneratedCompositionBenchmarkExecutionV1> {
  const trialId = input.trialId.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(trialId)) {
    throw new Error('MODEL_BENCHMARK_TRIAL_ID_INVALID');
  }
  if (input.routeIds.length < 1) throw new Error('MODEL_BENCHMARK_ROUTE_SELECTION_EMPTY');
  const requested = new Set(input.routeIds);
  if (requested.size !== input.routeIds.length) throw new Error('MODEL_BENCHMARK_ROUTE_SELECTION_DUPLICATE');
  const selectedRoutes = plan.routes.filter(({ routeId }) => requested.has(routeId));
  const routeIds = selectedRoutes.map(({ routeId }) => routeId);
  if (routeIds.length !== requested.size) throw new Error('MODEL_BENCHMARK_ROUTE_SELECTION_UNKNOWN');
  const adapters = new Set(selectedRoutes.map(({ executionAdapter }) => executionAdapter));
  if (adapters.size !== 1) throw new Error('MODEL_BENCHMARK_EXECUTION_ADAPTER_MIXED');
  const executionAdapter = selectedRoutes[0].executionAdapter;
  const directProviderRouteCount = selectedRoutes.filter(isDirectRoute).length;
  const material = {
    executionVersion: 'EDITRON_GENERATED_COMPOSITION_MODEL_BENCHMARK_EXECUTION_V1' as const,
    planHash: plan.planHash,
    trialId,
    routeIds,
    executionAdapter,
    maximumAuthorizedSpendUsd: Number((
      directProviderRouteCount
      * plan.repairPolicy.maximumProviderRunsPerRoute
      * plan.spend.maximumUsdPerProviderRun
    ).toFixed(2)),
    evidenceDirectoryName: `evidence-${plan.planHash.slice(0, 16)}-${trialId}`,
  };
  return deepFreezeV1({ ...material, executionHash: hashCanonicalJsonV1(material) });
}

export function assertGeneratedCompositionDirectExecutionV1(
  plan: GeneratedCompositionModelBenchmarkPlanV1,
  execution: GeneratedCompositionBenchmarkExecutionV1,
): void {
  if (execution.executionAdapter !== 'DIRECT_PROVIDER') {
    throw new Error('MODEL_BENCHMARK_AGENT_SHELL_ROUTE_REQUIRES_SEPARATE_RUNNER');
  }
  const routeMap = new Map(plan.routes.map((route) => [route.routeId, route]));
  for (const routeId of execution.routeIds) {
    const route = routeMap.get(routeId);
    if (!route || !isDirectRoute(route)) {
      throw new Error('MODEL_BENCHMARK_AGENT_SHELL_ROUTE_REQUIRES_SEPARATE_RUNNER');
    }
  }
}

export async function runGeneratedCompositionSourceProviderCallV1(input: {
  artifact: HashedStagePacketV2;
  route: GeneratedCompositionDirectBenchmarkRouteV1;
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

function pricing(route: GeneratedCompositionDirectBenchmarkRouteV1): ProviderPricingV2 {
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

function isDirectRoute(
  route: GeneratedCompositionBenchmarkRouteV1,
): route is GeneratedCompositionDirectBenchmarkRouteV1 {
  return route.executionAdapter === 'DIRECT_PROVIDER';
}

function isAgentShellRoute(
  route: GeneratedCompositionBenchmarkRouteV1,
): route is GeneratedCompositionAgentShellBenchmarkRouteV1 {
  return route.executionAdapter === 'OPENCODE_AGENT_SHELL';
}
