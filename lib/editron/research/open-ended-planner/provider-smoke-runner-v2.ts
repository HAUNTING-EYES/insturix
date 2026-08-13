import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOfflineInputTokensUpperBoundV2,
  serializeGoogleCountTokensRequestV2,
  type ProviderKindV2,
  type ProviderRouteV2,
  type SerializedProviderRequestV2,
} from './provider-codecs-v2';
import { runProviderStageV2, type ProviderPricingV2 } from './provider-transport-v2';
import { buildDevelopmentSmokePreflightV2 } from './smoke-preflight-v2';
import {
  buildDevelopmentReferenceImageStageOnePacketV2,
  buildDevelopmentStageOnePacketsV2,
  type HashedStagePacketV2,
  type InputArmV2,
} from './staged-packet-v2';

type FetchV2 = typeof fetch;
type JsonRecord = Record<string, unknown>;

interface SmokeRouteV2 {
  routeId: string;
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

interface SmokeRowV2 {
  rowId: string;
  routeId: string;
  inputArm: InputArmV2;
  comparisonPurpose: string;
  packetHash: string;
  transportHash: string;
  localInputTokenUpperBound: number | null;
  providerCountTokensRequestHash: string | null;
  maxProviderCostUsd: number;
}

interface SmokePlanV2 {
  planHash: string;
  routes: SmokeRouteV2[];
  smokeRows: SmokeRowV2[];
  spend: { absoluteMaxSpendUsd: number };
}

export interface DevelopmentSmokeRunOptionsV2 {
  expectedPlanHash: string;
  maxAuthorizedSpendUsd: number;
  operatorId: string;
  confirmedAt: string;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: FetchV2;
}

export interface DevelopmentSmokeReceiptV2 {
  receiptVersion: 'EDITRON_OE_DEVELOPMENT_SMOKE_RECEIPT_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  planHash: string;
  operatorConfirmation: { operatorId: string; confirmedAt: string; maxAuthorizedSpendUsd: number };
  rows: ReadonlyArray<Readonly<{
    rowId: string;
    comparisonPurpose: string;
    packetHash: string;
    transportHash: string;
    preflightCounts: ReadonlyArray<Readonly<{
      attempt: 1 | 2;
      method: 'OFFLINE_UPPER_BOUND' | 'OFFLINE_REPAIR_DELTA_UPPER_BOUND' | 'GOOGLE_COUNT_TOKENS';
      generationRequestHash: string;
      countRequestHash: string | null;
      inputTokens: number;
    }>>;
    run: Awaited<ReturnType<typeof runProviderStageV2>>;
  }>>;
  actualProviderCostUsd: number;
  receiptHash: string;
}

export async function runDevelopmentSmokeV2(
  options: DevelopmentSmokeRunOptionsV2,
): Promise<Readonly<DevelopmentSmokeReceiptV2>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const plan = await buildDevelopmentSmokePreflightV2() as unknown as SmokePlanV2;
  validateAuthorization(plan, options);
  const keys = providerKeys(options.environment);
  const routes = new Map(plan.routes.map((route) => [route.routeId, route]));
  const artifacts = smokeArtifacts();
  const rows: Array<Omit<DevelopmentSmokeReceiptV2['rows'][number], never>> = [];
  let actualProviderCostUsd = 0;

  for (const row of plan.smokeRows) {
    if (actualProviderCostUsd + row.maxProviderCostUsd > options.maxAuthorizedSpendUsd) {
      throw new Error(`AGGREGATE_SPEND_PREFLIGHT_BLOCKED:${row.rowId}`);
    }
    const routeFact = routes.get(row.routeId);
    if (!routeFact) throw new Error(`SMOKE_ROUTE_MISSING:${row.routeId}`);
    const artifact = artifacts.get(row.inputArm);
    if (!artifact || artifact.packetHash !== row.packetHash || artifact.transportHash !== row.transportHash) {
      throw new Error(`SMOKE_PACKET_DRIFT:${row.rowId}`);
    }
    const route: ProviderRouteV2 = {
      kind: routeFact.provider,
      apiKey: keys[routeFact.provider],
      model: routeFact.requestModel,
      modelSnapshot: routeFact.claimedBenchmarkIdentity,
      reasoningMode: routeFact.reasoningMode,
    };
    const preflightCounts: Array<DevelopmentSmokeReceiptV2['rows'][number]['preflightCounts'][number]> = [];
    const run = await runProviderStageV2({
      artifact,
      route,
      pricing: pricing(routeFact),
      preflightInputTokens: async ({ attempt, request, priorRequest, priorInputTokens }) => {
        const count = await countExactRequest({
          attempt, request, route, artifact, row, fetchImpl, priorRequest, priorInputTokens,
        });
        preflightCounts.push(count);
        return count.inputTokens;
      },
      fetchImpl,
    });
    const rowCost = run.attempts.reduce((sum, attempt) => sum + (attempt.providerCostUsd ?? 0), 0);
    actualProviderCostUsd = Number((actualProviderCostUsd + rowCost).toFixed(12));
    rows.push(deepFreezeV1({
      rowId: row.rowId,
      comparisonPurpose: row.comparisonPurpose,
      packetHash: row.packetHash,
      transportHash: row.transportHash,
      preflightCounts,
      run,
    }));
  }

  const material = {
    receiptVersion: 'EDITRON_OE_DEVELOPMENT_SMOKE_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    planHash: plan.planHash,
    operatorConfirmation: {
      operatorId: options.operatorId,
      confirmedAt: options.confirmedAt,
      maxAuthorizedSpendUsd: options.maxAuthorizedSpendUsd,
    },
    rows,
    actualProviderCostUsd,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

async function countExactRequest(input: {
  attempt: 1 | 2;
  request: SerializedProviderRequestV2;
  route: ProviderRouteV2;
  artifact: HashedStagePacketV2;
  row: SmokeRowV2;
  fetchImpl: FetchV2;
  priorRequest?: SerializedProviderRequestV2;
  priorInputTokens?: number;
}): Promise<DevelopmentSmokeReceiptV2['rows'][number]['preflightCounts'][number]> {
  if (input.route.kind === 'google') {
    const countRequest = serializeGoogleCountTokensRequestV2({ route: input.route, generationRequest: input.request });
    if (input.attempt === 1 && countRequest.requestHash !== input.row.providerCountTokensRequestHash) {
      throw new Error(`COUNT_TOKENS_REQUEST_DRIFT:${input.row.rowId}`);
    }
    const response = await input.fetchImpl(countRequest.endpoint, {
      method: 'POST',
      headers: countRequest.headers,
      body: JSON.stringify(countRequest.body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`COUNT_TOKENS_HTTP_${response.status}`);
    const body = await response.json() as unknown;
    const totalTokens = isRecord(body) ? body.totalTokens : undefined;
    if (!Number.isSafeInteger(totalTokens) || Number(totalTokens) < 0) throw new Error('COUNT_TOKENS_INVALID_RESPONSE');
    return deepFreezeV1({
      attempt: input.attempt,
      method: 'GOOGLE_COUNT_TOKENS' as const,
      generationRequestHash: input.request.requestHash,
      countRequestHash: countRequest.requestHash,
      inputTokens: Number(totalTokens),
    });
  }
  let method: 'OFFLINE_UPPER_BOUND' | 'OFFLINE_REPAIR_DELTA_UPPER_BOUND' = 'OFFLINE_UPPER_BOUND';
  let inputTokens: number;
  if (input.attempt === 2 && input.priorRequest && input.priorInputTokens !== undefined) {
    method = 'OFFLINE_REPAIR_DELTA_UPPER_BOUND';
    inputTokens = estimateRepairInputTokensUpperBound(input.request, input.priorRequest, input.priorInputTokens);
  } else {
    inputTokens = estimateOfflineInputTokensUpperBoundV2(input.request, input.artifact.transportAttachments.length);
  }
  if (input.attempt === 1 && inputTokens !== input.row.localInputTokenUpperBound) {
    throw new Error(`LOCAL_INPUT_COUNT_DRIFT:${input.row.rowId}`);
  }
  return deepFreezeV1({
    attempt: input.attempt,
    method,
    generationRequestHash: input.request.requestHash,
    countRequestHash: null,
    inputTokens,
  });
}

function validateAuthorization(plan: SmokePlanV2, options: DevelopmentSmokeRunOptionsV2): void {
  if (plan.planHash !== options.expectedPlanHash) throw new Error('SMOKE_PLAN_HASH_MISMATCH');
  if (!options.operatorId.trim()) throw new Error('SMOKE_OPERATOR_ID_REQUIRED');
  if (Number.isNaN(Date.parse(options.confirmedAt))) throw new Error('SMOKE_CONFIRMATION_TIMESTAMP_INVALID');
  if (!Number.isFinite(options.maxAuthorizedSpendUsd) || options.maxAuthorizedSpendUsd <= 0) throw new Error('SMOKE_AUTHORIZED_SPEND_INVALID');
  if (plan.spend.absoluteMaxSpendUsd > options.maxAuthorizedSpendUsd) throw new Error('SMOKE_PLAN_EXCEEDS_AUTHORIZED_SPEND');
}

function providerKeys(environment: Readonly<Record<string, string | undefined>>): Record<ProviderKindV2, string> {
  const result = {
    openai: environment.OPENAI_API_KEY?.trim() ?? '',
    google: environment.GEMINI_API_KEY?.trim() ?? '',
    deepseek: environment.DEEPSEEK_API_KEY?.trim() ?? '',
  };
  for (const provider of ['openai', 'google'] as const) {
    if (!result[provider]) throw new Error(`SMOKE_PROVIDER_KEY_MISSING:${provider}`);
  }
  return result;
}

function pricing(route: SmokeRouteV2): ProviderPricingV2 {
  return {
    inputUsdPerMillion: route.pricing.inputUsdPerMillion,
    outputUsdPerMillion: route.pricing.outputUsdPerMillion,
    ...(route.pricing.cachedInputUsdPerMillion === null ? {} : { cachedInputUsdPerMillion: route.pricing.cachedInputUsdPerMillion }),
    ...(route.pricing.cacheWriteUsdPerMillion === null ? {} : { cacheWriteUsdPerMillion: route.pricing.cacheWriteUsdPerMillion }),
  };
}

function smokeArtifacts(): Map<InputArmV2, HashedStagePacketV2> {
  const reference = buildDevelopmentReferenceImageStageOnePacketV2('DEV-02', 'BASELINE');
  const multimodal = buildDevelopmentStageOnePacketsV2().find(({ packet }) =>
    packet.taskId === 'DEV-02' && packet.conditionId === 'BASELINE' && packet.inputArm === 'MULTIMODAL');
  if (!multimodal) throw new Error('SMOKE_MULTIMODAL_PACKET_MISSING');
  return new Map([[reference.packet.inputArm, reference], [multimodal.packet.inputArm, multimodal]]);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function estimateRepairInputTokensUpperBound(
  request: SerializedProviderRequestV2,
  priorRequest: SerializedProviderRequestV2,
  priorInputTokens: number,
): number {
  const requestBytes = requestBodyBytesWithoutMedia(request);
  const priorBytes = requestBodyBytesWithoutMedia(priorRequest);
  return priorInputTokens + Math.max(0, requestBytes - priorBytes) + 256;
}

function requestBodyBytesWithoutMedia(request: SerializedProviderRequestV2): number {
  const value = JSON.stringify(request.body, (key, entry: unknown) =>
    key === 'image_url' && typeof entry === 'string' && entry.startsWith('data:')
      ? '[HASH_BOUND_INLINE_IMAGE]'
      : entry);
  return Buffer.byteLength(value, 'utf8');
}
