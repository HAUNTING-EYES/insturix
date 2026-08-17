import canonicalBlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOfflineInputTokensUpperBoundV2,
  serializeProviderRequestV2,
  type ProviderKindV2,
  type ProviderRouteV2,
  type SerializedProviderRequestV2,
} from './provider-codecs-v2';
import { runProviderStageV2, type ProviderPricingV2 } from './provider-transport-v2';
import { getIssuedStageRouteSourceV2 } from './issued-stage-route-source-v2';
import { evaluateStage4CompiledGraphArtifactV2 } from './stage4-compilation-evaluator-v2';
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
  localInputTokenUpperBound: number;
  requestHash: string;
  maxInputTokens: number;
  maxProviderCostUsd: number;
}

interface PlanV2 {
  planHash: string;
  routes: RouteV2[];
  rows: RowV2[];
  spend: { absoluteMaxSpendUsd: number };
}

export interface Stage4ExactCompilationRunOptionsV2 {
  expectedPlanHash: string;
  maxAuthorizedSpendUsd: number;
  operatorId: string;
  confirmedAt: string;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: FetchV2;
}

const ROUTE_IDS = new Set(['OPENAI_LUNA', 'OPENAI_TERRA']);

export async function buildStage4ExactCompilationSmokePreflightV2(): Promise<Readonly<JsonRecord>> {
  const source = getIssuedStageRouteSourceV2() as unknown as { planHash: string; routes: RouteV2[] };
  const routes = source.routes.filter(({ routeId }) => ROUTE_IDS.has(routeId));
  if (routes.length !== ROUTE_IDS.size || routes.some(({ provider }) => provider !== 'openai')) {
    throw new Error('STAGE4_ROUTE_SET_INCOMPLETE');
  }
  const artifact = stageFourPacket();
  const rows = await Promise.all(routes.map(async (route) => {
    const request = await serializeProviderRequestV2({
      route: providerRoute(route, 'NOT_A_REAL_KEY'), artifact, attempt: 1,
      outputBudget: { visible: artifact.packet.stageBudget.maxVisibleOutputTokens, reasoning: artifact.packet.stageBudget.maxReasoningTokens },
    });
    const localInputTokenUpperBound = estimateOfflineInputTokensUpperBoundV2(request, 0);
    if (localInputTokenUpperBound > artifact.packet.stageBudget.maxInputTokens) {
      throw new Error(`STAGE4_LOCAL_INPUT_BUDGET_EXCEEDED:${route.routeId}:${localInputTokenUpperBound}/${artifact.packet.stageBudget.maxInputTokens}`);
    }
    return {
      rowId: `${route.routeId}-STAGE4-EXACT-COMPILATION`, routeId: route.routeId,
      packetHash: artifact.packetHash, transportHash: artifact.transportHash,
      priorArtifactHash: String(artifact.packet.modelInput.priorArtifactHash),
      localInputTokenUpperBound, requestHash: request.requestHash,
      maxInputTokens: artifact.packet.stageBudget.maxInputTokens,
      maxProviderCostUsd: artifact.packet.stageBudget.maxProviderCostUsd,
    };
  }));
  const absoluteMaxSpendUsd = Number(rows.reduce((sum, row) => sum + row.maxProviderCostUsd, 0).toFixed(2));
  const material = {
    planVersion: 'EDITRON_OE_STAGE4_EXACT_COMPILATION_SMOKE_PREFLIGHT_V2',
    authority: 'RESEARCH_ONLY_NO_MEDIA_EXECUTION_NO_PROJECT_MUTATION',
    stage: 4, taskId: 'DEV-02', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
    comparisonPurpose: 'ISOLATED_EXACT_OPERATOR_AND_INPUT_COMPILATION_FROM_ONE_EVALUATOR_APPROVED_EVIDENCE_BOUND_INTENT',
    routeSourcePlanHash: source.planHash,
    canonicalEvidenceBoundIntentHash: hashCanonicalJsonV1(canonicalEvidenceBoundIntentJson),
    packetHash: artifact.packetHash, transportHash: artifact.transportHash, routes, rows,
    evaluationContract: {
      version: 'EDITRON_OE_STAGE4_EXACT_COMPILATION_EVALUATION_V2',
      dimensions: ['sourceChain', 'operatorResolution', 'inputBindings', 'dependencyGraph', 'nodeContract', 'policyAndRevision', 'proofAndPreservation', 'capabilityHonesty'],
      expectedCompileDisposition: 'CAPABILITY_GAP',
      rule: 'Compile an exact safe read/resolver subgraph, but keep the full graph non-executable because the generated composition owner is not implemented.',
    },
    exclusions: [
      { routeId: 'QWEN_3_8_MAX', reason: 'STANDARD_APPLICATION_API_KEY_NOT_AVAILABLE_FOR_AUTOMATED_BENCHMARK' },
      { routeId: 'GOOGLE_FLASH', reason: 'NOT_IN_OPERATOR_SELECTED_STAGE4_COHORT' },
      { routeId: 'GOOGLE_FLASH_LITE', reason: 'FAILED_STAGE2_CAPABILITY_HONESTY' },
    ],
    spend: { plannedProviderCalls: rows.length, absoluteMaxSpendUsd, rule: 'Each route includes at most one schema repair within the frozen Stage-4 ceiling.' },
    persistencePolicy: {
      allowed: ['planHash', 'packetHash', 'requestHash', 'providerRequestId', 'nativeModelIdentity', 'usage', 'cost', 'schemaDiagnostics', 'artifact', 'compilationEvaluation'],
      forbidden: ['apiKeyValue', 'authorizationHeader', 'rawProviderResponse', 'userProjectState'],
    },
    operatorConfirmationGate: { requiredEchoFields: ['planHash', 'absoluteMaxSpendUsd', 'operatorId', 'confirmedAt'] },
    globalBlockers: ['OPERATOR_CONFIRMATION_NOT_RECORDED'],
  };
  return deepFreezeV1({ ...material, planHash: hashCanonicalJsonV1(material) });
}

export async function runStage4ExactCompilationSmokeV2(options: Stage4ExactCompilationRunOptionsV2): Promise<Readonly<JsonRecord>> {
  const plan = await buildStage4ExactCompilationSmokePreflightV2() as unknown as PlanV2;
  validateAuthorization(plan, options);
  const apiKey = options.environment.OPENAI_API_KEY?.trim() ?? '';
  if (!apiKey) throw new Error('STAGE4_PROVIDER_KEY_MISSING:openai');
  const fetchImpl = options.fetchImpl ?? fetch;
  const routes = new Map(plan.routes.map((route) => [route.routeId, route]));
  const artifact = stageFourPacket();
  const resultRows = [];
  let actualProviderCostUsd = 0;
  for (const row of plan.rows) {
    if (actualProviderCostUsd + row.maxProviderCostUsd > options.maxAuthorizedSpendUsd) throw new Error(`STAGE4_AGGREGATE_SPEND_BLOCKED:${row.rowId}`);
    const routeFact = routes.get(row.routeId);
    if (!routeFact) throw new Error(`STAGE4_ROUTE_MISSING:${row.routeId}`);
    if (artifact.packetHash !== row.packetHash || artifact.transportHash !== row.transportHash) throw new Error(`STAGE4_PACKET_DRIFT:${row.rowId}`);
    const run = await runProviderStageV2({
      artifact, route: providerRoute(routeFact, apiKey), pricing: pricing(routeFact), fetchImpl,
      preflightInputTokens: ({ attempt, request, priorRequest, priorInputTokens }) => Promise.resolve(
        countInputTokens({ attempt, request, priorRequest, priorInputTokens, row }),
      ),
    });
    const rowCost = run.attempts.reduce((sum, attempt) => sum + (attempt.providerCostUsd ?? 0), 0);
    actualProviderCostUsd = Number((actualProviderCostUsd + rowCost).toFixed(12));
    resultRows.push(deepFreezeV1({
      rowId: row.rowId, packetHash: row.packetHash, run,
      compilationEvaluation: evaluateStage4CompiledGraphArtifactV2(run.artifact),
    }));
  }
  const material = {
    receiptVersion: 'EDITRON_OE_STAGE4_EXACT_COMPILATION_SMOKE_RECEIPT_V2',
    authority: 'RESEARCH_ONLY_NO_EXECUTION_NO_PROJECT_MUTATION', planHash: plan.planHash,
    operatorConfirmation: { operatorId: options.operatorId, confirmedAt: options.confirmedAt, maxAuthorizedSpendUsd: options.maxAuthorizedSpendUsd },
    rows: resultRows, actualProviderCostUsd,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

function stageFourPacket(): HashedStagePacketV2 {
  const stageOne = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');
  const stageTwo = buildNextProviderStagePacketV2({ previousPacket: stageOne, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalBlueprintJson });
  const stageThree = buildNextProviderStagePacketV2({ previousPacket: stageTwo, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalIntentJson });
  return buildNextProviderStagePacketV2({ previousPacket: stageThree, stage: 4, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalEvidenceBoundIntentJson });
}

function countInputTokens(input: { attempt: 1 | 2; request: SerializedProviderRequestV2; priorRequest?: SerializedProviderRequestV2; priorInputTokens?: number; row: RowV2 }): number {
  const value = input.attempt === 2 && input.priorRequest && input.priorInputTokens !== undefined
    ? input.priorInputTokens + Math.max(0, requestBytes(input.request) - requestBytes(input.priorRequest)) + 256
    : estimateOfflineInputTokensUpperBoundV2(input.request, 0);
  if (input.attempt === 1 && (value !== input.row.localInputTokenUpperBound || input.request.requestHash !== input.row.requestHash)) throw new Error(`STAGE4_REQUEST_DRIFT:${input.row.rowId}`);
  return value;
}

function providerRoute(route: RouteV2, apiKey: string): ProviderRouteV2 { return { kind: route.provider, apiKey, model: route.requestModel, modelSnapshot: route.claimedBenchmarkIdentity, reasoningMode: route.reasoningMode }; }
function pricing(route: RouteV2): ProviderPricingV2 { return { inputUsdPerMillion: route.pricing.inputUsdPerMillion, outputUsdPerMillion: route.pricing.outputUsdPerMillion, ...(route.pricing.cachedInputUsdPerMillion === null ? {} : { cachedInputUsdPerMillion: route.pricing.cachedInputUsdPerMillion }), ...(route.pricing.cacheWriteUsdPerMillion === null ? {} : { cacheWriteUsdPerMillion: route.pricing.cacheWriteUsdPerMillion }) }; }
function validateAuthorization(plan: PlanV2, options: Stage4ExactCompilationRunOptionsV2): void { if (plan.planHash !== options.expectedPlanHash) throw new Error('STAGE4_PLAN_HASH_MISMATCH'); if (!options.operatorId.trim()) throw new Error('STAGE4_OPERATOR_REQUIRED'); if (Number.isNaN(Date.parse(options.confirmedAt))) throw new Error('STAGE4_CONFIRMATION_INVALID'); if (!Number.isFinite(options.maxAuthorizedSpendUsd) || options.maxAuthorizedSpendUsd < plan.spend.absoluteMaxSpendUsd) throw new Error('STAGE4_SPEND_NOT_AUTHORIZED'); }
function requestBytes(request: SerializedProviderRequestV2): number { return Buffer.byteLength(JSON.stringify(request.body), 'utf8'); }
