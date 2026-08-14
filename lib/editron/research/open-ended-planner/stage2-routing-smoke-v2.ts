import canonicalBlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOfflineInputTokensUpperBoundV2,
  serializeGoogleCountTokensRequestV2,
  serializeProviderRequestV2,
  type ProviderKindV2,
  type ProviderRouteV2,
  type SerializedProviderRequestV2,
} from './provider-codecs-v2';
import { runProviderStageV2, type ProviderPricingV2 } from './provider-transport-v2';
import { buildDevelopmentSmokePreflightV2 } from './smoke-preflight-v2';
import {
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';

type FetchV2 = typeof fetch;
type JsonRecord = Record<string, unknown>;

interface RouteV2 {
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

interface RowV2 {
  rowId: string;
  routeId: string;
  packetHash: string;
  transportHash: string;
  priorArtifactHash: string;
  localInputTokenUpperBound: number | null;
  providerCountTokensRequestHash: string | null;
  maxInputTokens: number;
  maxProviderCostUsd: number;
}

interface PlanV2 {
  planHash: string;
  routeSourcePlanHash: string;
  routes: RouteV2[];
  rows: RowV2[];
  spend: { absoluteMaxSpendUsd: number };
}

export interface Stage2RoutingRunOptionsV2 {
  expectedPlanHash: string;
  maxAuthorizedSpendUsd: number;
  operatorId: string;
  confirmedAt: string;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: FetchV2;
}

export interface RoutingEvaluationV2 {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  expectedExecutionForm: 'GENERATED_COMPOSITION';
  observedExecutionForm: string | null;
  hardClaimIds: readonly string[];
  coveredHardClaimIds: readonly string[];
  diagnostics: readonly string[];
}

const ROUTE_IDS = new Set(['OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH_LITE', 'GOOGLE_FLASH']);
const blueprint = canonicalBlueprintJson as unknown as JsonRecord;

export async function buildStage2RoutingSmokePreflightV2(): Promise<Readonly<Record<string, unknown>>> {
  const source = await buildDevelopmentSmokePreflightV2() as unknown as { planHash: string; routes: RouteV2[] };
  const routes = source.routes.filter(({ routeId }) => ROUTE_IDS.has(routeId));
  if (routes.length !== ROUTE_IDS.size) throw new Error('STAGE2_ROUTE_SET_INCOMPLETE');
  const artifact = stage2Artifact();
  const rows = await Promise.all(routes.map(async (route) => {
    const requestRoute = providerRoute(route, 'NOT_A_REAL_KEY');
    const request = await serializeProviderRequestV2({
      route: requestRoute,
      artifact,
      attempt: 1,
      outputBudget: {
        visible: artifact.packet.stageBudget.maxVisibleOutputTokens,
        reasoning: artifact.packet.stageBudget.maxReasoningTokens,
      },
    });
    const countRequest = route.provider === 'google'
      ? serializeGoogleCountTokensRequestV2({ route: requestRoute, generationRequest: request })
      : null;
    const localBound = route.provider === 'google'
      ? null
      : estimateOfflineInputTokensUpperBoundV2(request, 0);
    if (localBound !== null && localBound > artifact.packet.stageBudget.maxInputTokens) {
      throw new Error(`STAGE2_LOCAL_INPUT_BUDGET_EXCEEDED:${route.routeId}`);
    }
    return {
      rowId: `${route.routeId}-STAGE2-FREE_CHOICE`,
      routeId: route.routeId,
      packetHash: artifact.packetHash,
      transportHash: artifact.transportHash,
      priorArtifactHash: String(artifact.packet.modelInput.priorArtifactHash),
      localInputTokenUpperBound: localBound,
      providerCountTokensRequestHash: countRequest?.requestHash ?? null,
      maxInputTokens: artifact.packet.stageBudget.maxInputTokens,
      maxProviderCostUsd: artifact.packet.stageBudget.maxProviderCostUsd,
    };
  }));
  const absoluteMaxSpendUsd = Number(rows.reduce((sum, row) => sum + row.maxProviderCostUsd, 0).toFixed(2));
  const material = {
    planVersion: 'EDITRON_OE_STAGE2_ROUTING_SMOKE_PREFLIGHT_V2',
    authority: 'RESEARCH_ONLY_NO_MEDIA_NO_EXECUTION_NO_PROJECT_MUTATION',
    stage: 2,
    taskId: 'DEV-02',
    conditionId: 'BASELINE',
    executionFormArm: 'FREE_CHOICE',
    comparisonPurpose: 'ISOLATED_ROUTING_FROM_EVALUATOR_APPROVED_BLUEPRINT',
    expectedCase: { caseId: 'DEV02_FILMSTRIP_ISLAND', scope: 'BOUNDED_MOVING_PANEL_ISLAND', executionForm: 'GENERATED_COMPOSITION' },
    routeSourcePlanHash: source.planHash,
    canonicalBlueprintHash: hashCanonicalJsonV1(blueprint),
    packetHash: artifact.packetHash,
    transportHash: artifact.transportHash,
    routes,
    rows,
    exclusions: [
      { routeId: 'DEEPSEEK_FLASH', reason: 'CLAIMED_0731_SNAPSHOT_NOT_REQUESTABLE' },
      { routeId: 'QWEN_3_8_MAX', reason: 'NO_ENVIRONMENT_BACKED_PROVIDER_CODEC_ROUTE_IN_CURRENT_HARNESS' },
    ],
    spend: { plannedProviderCalls: rows.length, absoluteMaxSpendUsd, rule: 'Each route remains bounded by the Stage-2 packet cost ceiling including one repair.' },
    persistencePolicy: {
      allowed: ['planHash', 'packetHash', 'requestHash', 'providerRequestId', 'nativeModelIdentity', 'usage', 'cost', 'schemaDiagnostics', 'artifact', 'routingEvaluation'],
      forbidden: ['apiKeyValue', 'authorizationHeader', 'rawProviderResponse', 'userProjectState'],
    },
    operatorConfirmationGate: { requiredEchoFields: ['planHash', 'absoluteMaxSpendUsd', 'operatorId', 'confirmedAt'] },
    globalBlockers: ['GOOGLE_COUNT_TOKENS_NOT_YET_EXECUTED', 'OPERATOR_CONFIRMATION_NOT_RECORDED'],
  };
  return deepFreezeV1({ ...material, planHash: hashCanonicalJsonV1(material) });
}

export async function runStage2RoutingSmokeV2(options: Stage2RoutingRunOptionsV2): Promise<Readonly<JsonRecord>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const plan = await buildStage2RoutingSmokePreflightV2() as unknown as PlanV2;
  validateAuthorization(plan, options);
  const keys = providerKeys(options.environment);
  const routes = new Map(plan.routes.map((route) => [route.routeId, route]));
  const artifact = stage2Artifact();
  const resultRows = [];
  let actualProviderCostUsd = 0;
  for (const row of plan.rows) {
    if (actualProviderCostUsd + row.maxProviderCostUsd > options.maxAuthorizedSpendUsd) throw new Error(`STAGE2_AGGREGATE_SPEND_BLOCKED:${row.rowId}`);
    const routeFact = routes.get(row.routeId);
    if (!routeFact) throw new Error(`STAGE2_ROUTE_MISSING:${row.routeId}`);
    if (artifact.packetHash !== row.packetHash || artifact.transportHash !== row.transportHash) throw new Error(`STAGE2_PACKET_DRIFT:${row.rowId}`);
    const route = providerRoute(routeFact, keys[routeFact.provider]);
    const preflightCounts: JsonRecord[] = [];
    const run = await runProviderStageV2({
      artifact,
      route,
      pricing: pricing(routeFact),
      preflightInputTokens: async ({ attempt, request, priorRequest, priorInputTokens }) => {
        const count = await countRequest({ attempt, request, priorRequest, priorInputTokens, route, row, fetchImpl });
        preflightCounts.push(count);
        return Number(count.inputTokens);
      },
      fetchImpl,
    });
    const rowCost = run.attempts.reduce((sum, attempt) => sum + (attempt.providerCostUsd ?? 0), 0);
    actualProviderCostUsd = Number((actualProviderCostUsd + rowCost).toFixed(12));
    resultRows.push(deepFreezeV1({ rowId: row.rowId, packetHash: row.packetHash, preflightCounts, run, routingEvaluation: evaluateStage2RoutingArtifactV2(run.artifact) }));
  }
  const material = {
    receiptVersion: 'EDITRON_OE_STAGE2_ROUTING_SMOKE_RECEIPT_V2',
    authority: 'RESEARCH_ONLY_NO_EXECUTION_NO_PROJECT_MUTATION',
    planHash: plan.planHash,
    operatorConfirmation: { operatorId: options.operatorId, confirmedAt: options.confirmedAt, maxAuthorizedSpendUsd: options.maxAuthorizedSpendUsd },
    rows: resultRows,
    actualProviderCostUsd,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

export function evaluateStage2RoutingArtifactV2(value: unknown): Readonly<RoutingEvaluationV2> {
  const artifact = record(value);
  const hardClaimIds = records(blueprint.targetClaims).filter(({ criticality }) => criticality === 'HARD').map(({ claimId }) => String(claimId));
  if (!Object.keys(artifact).length) return deepFreezeV1({ disposition: 'UNVERIFIABLE', expectedExecutionForm: 'GENERATED_COMPOSITION', observedExecutionForm: null, hardClaimIds, coveredHardClaimIds: [], diagnostics: ['NO_ACCEPTED_ARTIFACT'] });
  const routeDecision = record(artifact.routeDecision);
  const generatedCandidate = records(routeDecision.candidateForms).find(({ form }) => form === 'GENERATED_COMPOSITION');
  const coverage = records(generatedCandidate?.claimCoverage);
  const coveredHardClaimIds = hardClaimIds.filter((claimId) => coverage.some((entry) => entry.claimId === claimId && entry.status === 'COVERED'));
  const generatedIslandClaimIds = new Set(array(routeDecision.generatedIslandClaimIds).map(String));
  const generatedOwnerPresent = records(artifact.nodes).some((node) => node.executionForm === 'GENERATED_COMPOSITION'
    && array(node.candidateCapabilityIds).includes('generated_composition_program'));
  const diagnostics = [
    ...(artifact.executionForm === 'GENERATED_COMPOSITION' ? [] : ['WRONG_EXECUTION_FORM']),
    ...(routeDecision.scopeClassification === 'BOUNDED_GENERATED_ISLAND' ? [] : ['WRONG_SCOPE_CLASSIFICATION']),
    ...(routeDecision.coverageStatus === 'COMPLETE' ? [] : ['INCOMPLETE_ROUTE_COVERAGE']),
    ...(generatedCandidate?.hardGateStatus === 'ELIGIBLE' ? [] : ['GENERATED_FORM_NOT_ELIGIBLE']),
    ...(coveredHardClaimIds.length === hardClaimIds.length ? [] : ['HARD_CLAIMS_NOT_COVERED']),
    ...(hardClaimIds.every((claimId) => generatedIslandClaimIds.has(claimId)) ? [] : ['HARD_CLAIMS_NOT_BOUND_TO_ISLAND']),
    ...(array(routeDecision.nativeSurroundClaimIds).length === 0 ? [] : ['UNEXPECTED_NATIVE_SURROUND_FOR_BOUNDED_CASE']),
    ...(generatedOwnerPresent ? [] : ['GENERATED_COMPOSITION_OWNER_MISSING']),
  ];
  return deepFreezeV1({ disposition: diagnostics.length ? 'FAIL' : 'PASS', expectedExecutionForm: 'GENERATED_COMPOSITION', observedExecutionForm: typeof artifact.executionForm === 'string' ? artifact.executionForm : null, hardClaimIds, coveredHardClaimIds, diagnostics });
}

function stage2Artifact(): HashedStagePacketV2 {
  return buildNextProviderStagePacketV2({ previousPacket: buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'), stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: blueprint as { artifactType: string; taskId: string; [key: string]: unknown } });
}

async function countRequest(input: { attempt: 1 | 2; request: SerializedProviderRequestV2; priorRequest?: SerializedProviderRequestV2; priorInputTokens?: number; route: ProviderRouteV2; row: RowV2; fetchImpl: FetchV2 }): Promise<JsonRecord> {
  if (input.route.kind === 'google') {
    const count = serializeGoogleCountTokensRequestV2({ route: input.route, generationRequest: input.request });
    if (input.attempt === 1 && count.requestHash !== input.row.providerCountTokensRequestHash) throw new Error(`STAGE2_COUNT_DRIFT:${input.row.rowId}`);
    const response = await input.fetchImpl(count.endpoint, { method: 'POST', headers: count.headers, body: JSON.stringify(count.body), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`STAGE2_COUNT_HTTP_${response.status}`);
    const body = record(await response.json());
    if (!Number.isSafeInteger(body.totalTokens) || Number(body.totalTokens) < 0) throw new Error('STAGE2_COUNT_INVALID');
    return deepFreezeV1({ attempt: input.attempt, method: 'GOOGLE_COUNT_TOKENS', generationRequestHash: input.request.requestHash, countRequestHash: count.requestHash, inputTokens: Number(body.totalTokens) });
  }
  const inputTokens = input.attempt === 2 && input.priorRequest && input.priorInputTokens !== undefined
    ? input.priorInputTokens + Math.max(0, requestBytes(input.request) - requestBytes(input.priorRequest)) + 256
    : estimateOfflineInputTokensUpperBoundV2(input.request, 0);
  if (input.attempt === 1 && inputTokens !== input.row.localInputTokenUpperBound) throw new Error(`STAGE2_LOCAL_COUNT_DRIFT:${input.row.rowId}`);
  return deepFreezeV1({ attempt: input.attempt, method: input.attempt === 1 ? 'OFFLINE_UPPER_BOUND' : 'OFFLINE_REPAIR_DELTA_UPPER_BOUND', generationRequestHash: input.request.requestHash, countRequestHash: null, inputTokens });
}

function providerRoute(route: RouteV2, apiKey: string): ProviderRouteV2 { return { kind: route.provider, apiKey, model: route.requestModel, modelSnapshot: route.claimedBenchmarkIdentity, reasoningMode: route.reasoningMode }; }
function pricing(route: RouteV2): ProviderPricingV2 { return { inputUsdPerMillion: route.pricing.inputUsdPerMillion, outputUsdPerMillion: route.pricing.outputUsdPerMillion, ...(route.pricing.cachedInputUsdPerMillion === null ? {} : { cachedInputUsdPerMillion: route.pricing.cachedInputUsdPerMillion }), ...(route.pricing.cacheWriteUsdPerMillion === null ? {} : { cacheWriteUsdPerMillion: route.pricing.cacheWriteUsdPerMillion }) }; }
function providerKeys(environment: Readonly<Record<string, string | undefined>>): Record<ProviderKindV2, string> { const result = { openai: environment.OPENAI_API_KEY?.trim() ?? '', google: environment.GEMINI_API_KEY?.trim() ?? '', deepseek: '' }; for (const provider of ['openai', 'google'] as const) if (!result[provider]) throw new Error(`STAGE2_PROVIDER_KEY_MISSING:${provider}`); return result; }
function validateAuthorization(plan: PlanV2, options: Stage2RoutingRunOptionsV2): void { if (plan.planHash !== options.expectedPlanHash) throw new Error('STAGE2_PLAN_HASH_MISMATCH'); if (!options.operatorId.trim()) throw new Error('STAGE2_OPERATOR_REQUIRED'); if (Number.isNaN(Date.parse(options.confirmedAt))) throw new Error('STAGE2_CONFIRMATION_INVALID'); if (!Number.isFinite(options.maxAuthorizedSpendUsd) || options.maxAuthorizedSpendUsd < plan.spend.absoluteMaxSpendUsd) throw new Error('STAGE2_SPEND_NOT_AUTHORIZED'); }
function requestBytes(request: SerializedProviderRequestV2): number { return Buffer.byteLength(JSON.stringify(request.body), 'utf8'); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
