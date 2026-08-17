import canonicalBlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import canonicalIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  estimateOfflineInputTokensUpperBoundV2,
  serializeProviderRequestV2,
  type ProviderKindV2,
  type ProviderRouteV2,
  type SerializedProviderRequestV2,
} from './provider-codecs-v2';
import { runProviderStageV2, type ProviderPricingV2 } from './provider-transport-v2';
import { bindIssuedStage2PacketV2 } from './issued-stage2-packet-v2';
import { bindIssuedStage3PacketV2 } from './issued-stage3-packet-v2';
import { getIssuedStageRouteSourceV2 } from './issued-stage-route-source-v2';
import {
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';

type FetchV2 = typeof fetch;
type JsonRecord = Record<string, unknown>;
type DimensionV2 = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

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

export interface Stage3EvidenceBindingRunOptionsV2 {
  expectedPlanHash: string;
  maxAuthorizedSpendUsd: number;
  operatorId: string;
  confirmedAt: string;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: FetchV2;
}

export interface EvidenceBindingEvaluationV2 {
  disposition: 'CAPABILITY_BLOCKED' | 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  nodeBinding: DimensionV2;
  factIntegrity: DimensionV2;
  revisionBinding: DimensionV2;
  rightsAndPrivacy: DimensionV2;
  preservationBinding: DimensionV2;
  proofCoverage: DimensionV2;
  capabilityHonesty: DimensionV2;
  diagnostics: readonly string[];
}

const ROUTE_IDS = new Set(['OPENAI_LUNA', 'OPENAI_TERRA']);
const intent = canonicalIntentJson as unknown as JsonRecord;
const evidencePack = evidencePackJson as unknown as JsonRecord;

export async function buildStage3EvidenceBindingSmokePreflightV2(): Promise<Readonly<JsonRecord>> {
  const source = getIssuedStageRouteSourceV2() as unknown as { planHash: string; routes: RouteV2[] };
  const routes = source.routes.filter(({ routeId }) => ROUTE_IDS.has(routeId));
  if (routes.length !== ROUTE_IDS.size || routes.some(({ provider }) => provider !== 'openai')) {
    throw new Error('STAGE3_ROUTE_SET_INCOMPLETE');
  }
  const artifact = stageThreePacket();
  const rows = await Promise.all(routes.map(async (route) => {
    const request = await serializeProviderRequestV2({
      route: providerRoute(route, 'NOT_A_REAL_KEY'), artifact, attempt: 1,
      outputBudget: { visible: artifact.packet.stageBudget.maxVisibleOutputTokens, reasoning: artifact.packet.stageBudget.maxReasoningTokens },
    });
    const localInputTokenUpperBound = estimateOfflineInputTokensUpperBoundV2(request, 0);
    if (localInputTokenUpperBound > artifact.packet.stageBudget.maxInputTokens) {
      throw new Error(`STAGE3_LOCAL_INPUT_BUDGET_EXCEEDED:${route.routeId}`);
    }
    return {
      rowId: `${route.routeId}-STAGE3-EVIDENCE-BINDING`, routeId: route.routeId,
      packetHash: artifact.packetHash, transportHash: artifact.transportHash,
      priorArtifactHash: String(artifact.packet.modelInput.priorArtifactHash),
      localInputTokenUpperBound, requestHash: request.requestHash,
      maxInputTokens: artifact.packet.stageBudget.maxInputTokens,
      maxProviderCostUsd: artifact.packet.stageBudget.maxProviderCostUsd,
    };
  }));
  const absoluteMaxSpendUsd = Number(rows.reduce((sum, row) => sum + row.maxProviderCostUsd, 0).toFixed(2));
  const material = {
    planVersion: 'EDITRON_OE_STAGE3_EVIDENCE_BINDING_SMOKE_PREFLIGHT_V2',
    authority: 'RESEARCH_ONLY_NO_MEDIA_EXECUTION_NO_PROJECT_MUTATION',
    stage: 3, taskId: 'DEV-02', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
    comparisonPurpose: 'ISOLATED_EVIDENCE_BINDING_FROM_EVALUATOR_APPROVED_HYBRID_INTENT',
    routeSourcePlanHash: source.planHash,
    canonicalIntentHash: hashCanonicalJsonV1(intent), evidencePackHash: hashCanonicalJsonV1(evidencePack),
    packetHash: artifact.packetHash, transportHash: artifact.transportHash, routes, rows,
    evaluationContract: {
      version: 'EDITRON_OE_STAGE3_EVIDENCE_BINDING_EVALUATION_V2',
      dimensions: ['nodeBinding', 'factIntegrity', 'revisionBinding', 'rightsAndPrivacy', 'preservationBinding', 'proofCoverage', 'capabilityHonesty'],
      expectedStageDisposition: 'CAPABILITY_GAP',
      rule: 'All supplied facts must remain exact; the unimplemented generated owner must remain a capability gap even when every evidence binding is complete.',
    },
    exclusions: [
      { routeId: 'QWEN_3_8_MAX', reason: 'STANDARD_APPLICATION_API_KEY_NOT_AVAILABLE_FOR_AUTOMATED_BENCHMARK' },
      { routeId: 'GOOGLE_FLASH', reason: 'NOT_IN_OPERATOR_SELECTED_STAGE3_COHORT' },
      { routeId: 'GOOGLE_FLASH_LITE', reason: 'FAILED_STAGE2_CAPABILITY_HONESTY' },
    ],
    spend: { plannedProviderCalls: rows.length, absoluteMaxSpendUsd, rule: 'Each route includes at most one schema repair within the frozen Stage-3 ceiling.' },
    persistencePolicy: {
      allowed: ['planHash', 'packetHash', 'requestHash', 'providerRequestId', 'nativeModelIdentity', 'usage', 'cost', 'schemaDiagnostics', 'artifact', 'evidenceBindingEvaluation'],
      forbidden: ['apiKeyValue', 'authorizationHeader', 'rawProviderResponse', 'userProjectState'],
    },
    operatorConfirmationGate: { requiredEchoFields: ['planHash', 'absoluteMaxSpendUsd', 'operatorId', 'confirmedAt'] },
    globalBlockers: ['OPERATOR_CONFIRMATION_NOT_RECORDED'],
  };
  return deepFreezeV1({ ...material, planHash: hashCanonicalJsonV1(material) });
}

export async function runStage3EvidenceBindingSmokeV2(options: Stage3EvidenceBindingRunOptionsV2): Promise<Readonly<JsonRecord>> {
  const plan = await buildStage3EvidenceBindingSmokePreflightV2() as unknown as PlanV2;
  validateAuthorization(plan, options);
  const apiKey = options.environment.OPENAI_API_KEY?.trim() ?? '';
  if (!apiKey) throw new Error('STAGE3_PROVIDER_KEY_MISSING:openai');
  const fetchImpl = options.fetchImpl ?? fetch;
  const routes = new Map(plan.routes.map((route) => [route.routeId, route]));
  const artifact = stageThreePacket();
  const resultRows = [];
  let actualProviderCostUsd = 0;
  for (const row of plan.rows) {
    if (actualProviderCostUsd + row.maxProviderCostUsd > options.maxAuthorizedSpendUsd) {
      throw new Error(`STAGE3_AGGREGATE_SPEND_BLOCKED:${row.rowId}`);
    }
    const routeFact = routes.get(row.routeId);
    if (!routeFact) throw new Error(`STAGE3_ROUTE_MISSING:${row.routeId}`);
    if (artifact.packetHash !== row.packetHash || artifact.transportHash !== row.transportHash) {
      throw new Error(`STAGE3_PACKET_DRIFT:${row.rowId}`);
    }
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
      evidenceBindingEvaluation: evaluateStage3EvidenceBindingArtifactV2(run.artifact),
    }));
  }
  const material = {
    receiptVersion: 'EDITRON_OE_STAGE3_EVIDENCE_BINDING_SMOKE_RECEIPT_V2',
    authority: 'RESEARCH_ONLY_NO_EXECUTION_NO_PROJECT_MUTATION', planHash: plan.planHash,
    operatorConfirmation: { operatorId: options.operatorId, confirmedAt: options.confirmedAt, maxAuthorizedSpendUsd: options.maxAuthorizedSpendUsd },
    rows: resultRows, actualProviderCostUsd,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

export function evaluateStage3EvidenceBindingArtifactV2(value: unknown): Readonly<EvidenceBindingEvaluationV2> {
  const artifact = record(value);
  if (!Object.keys(artifact).length) return emptyEvaluation();
  const facts = records(evidencePack.facts);
  const factIds = new Set(facts.map(({ factId }) => String(factId)));
  const expectedNodes = new Map(records(intent.nodes).map((node) => [String(node.intentNodeId), node]));
  const nodes = records(artifact.nodes);
  const bindings = records(artifact.evidenceBindings);
  const preservation = records(artifact.preservationBindings);
  const proof = records(artifact.proofPlan);
  const unresolved = records(artifact.unresolvedRequirements);
  const nodeIds = new Set(nodes.map(({ intentNodeId }) => String(intentNodeId)));
  const bindingIds = new Set(bindings.map(({ bindingId }) => String(bindingId)));
  const preservationIds = new Set(preservation.map(({ preservationId }) => String(preservationId)));
  const proofIds = new Set(proof.map(({ proofObligationId }) => String(proofObligationId)));
  const unresolvedIds = new Set(unresolved.map(({ requirementId }) => String(requirementId)));
  const diagnostics: string[] = [];

  for (const id of symmetricDifference(nodeIds, new Set(expectedNodes.keys()))) diagnostics.push(`NODE_SET_DRIFT:${id}`);
  for (const node of nodes) {
    const id = String(node.intentNodeId);
    const expected = expectedNodes.get(id);
    if (!expected) continue;
    if (!sameSet(strings(node.candidateCapabilityIds), strings(expected.candidateCapabilityIds))) diagnostics.push(`CAPABILITY_SET_DRIFT:${id}`);
    if (node.bindingStatus !== 'BOUND') diagnostics.push(`NODE_NOT_BOUND:${id}`);
    if (!strings(node.evidenceBindingIds).length) diagnostics.push(`NODE_BINDING_MISSING:${id}`);
    for (const bindingId of strings(node.evidenceBindingIds)) {
      if (!bindingIds.has(bindingId) || !bindings.some((binding) => binding.bindingId === bindingId && strings(binding.nodeIds).includes(id))) diagnostics.push(`NODE_BINDING_BROKEN:${id}/${bindingId}`);
    }
    for (const idRef of strings(node.preservationIds)) if (!preservationIds.has(idRef)) diagnostics.push(`UNKNOWN_PRESERVATION_REF:${id}/${idRef}`);
    for (const idRef of strings(node.proofObligationIds)) if (!proofIds.has(idRef)) diagnostics.push(`UNKNOWN_PROOF_REF:${id}/${idRef}`);
    for (const idRef of strings(node.unresolvedRequirementIds)) if (!unresolvedIds.has(idRef)) diagnostics.push(`UNKNOWN_UNRESOLVED_REF:${id}/${idRef}`);
  }
  const nodeBinding = dimension(diagnostics, /NODE_|CAPABILITY_SET|UNKNOWN_.*_REF/);

  const usedFactIds = new Set<string>();
  for (const binding of bindings) {
    if (binding.status !== 'BOUND') diagnostics.push(`BINDING_NOT_BOUND:${binding.bindingId}`);
    for (const id of strings(binding.factIds)) usedFactIds.add(id);
    for (const id of strings(binding.nodeIds)) if (!nodeIds.has(id)) diagnostics.push(`BINDING_UNKNOWN_NODE:${id}`);
  }
  const rights = record(artifact.rightsDecision);
  const privacy = record(artifact.privacyDecision);
  const revision = record(artifact.revisionBinding);
  for (const id of [...strings(rights.policyFactIds), ...strings(privacy.policyFactIds), String(revision.timebaseFactId ?? '')]) if (id) usedFactIds.add(id);
  for (const entry of [...preservation, ...proof, ...unresolved]) for (const id of [...strings(entry.factIds), ...strings(entry.requiredFactIds)]) usedFactIds.add(id);
  for (const id of usedFactIds) if (!factIds.has(id)) diagnostics.push(`UNKNOWN_FACT_ID:${id}`);
  for (const id of factIds) if (!usedFactIds.has(id)) diagnostics.push(`UNBOUND_FACT_ID:${id}`);
  const factIntegrity = dimension(diagnostics, /FACT_ID|BINDING_/);

  if (revision.projectId !== 'oe-dev-02' || revision.expectedProjectRevision !== 'R3'
    || revision.timebaseFactId !== 'fact-project-timebase' || revision.status !== 'BOUND') diagnostics.push('REVISION_BINDING_DRIFT');
  const revisionBinding = dimension(diagnostics, /REVISION_BINDING/);

  const rightsFact = fact('fact-rights-policy');
  if (rights.status !== 'COMPLIANT' || !strings(rights.policyFactIds).includes('fact-rights-policy')
    || !sameSet(strings(rights.allowedAssetIds), strings(rightsFact.allowedAssetIds))
    || !containsAll(strings(rights.deniedActions), strings(rightsFact.deniedActions))) diagnostics.push('RIGHTS_DECISION_DRIFT');
  if (privacy.status !== 'COMPLIANT' || privacy.egressDisposition !== 'DENIED'
    || !strings(privacy.policyFactIds).includes('fact-privacy-egress-policy')) diagnostics.push('PRIVACY_DECISION_DRIFT');
  const rightsAndPrivacy = dimension(diagnostics, /RIGHTS_|PRIVACY_/);

  for (const requirement of records(evidencePack.preservationRequirements)) {
    const match = preservation.find(({ preservationId }) => preservationId === requirement.preservationId);
    if (!match || match.status !== 'BOUND' || !containsAll(strings(match.factIds), strings(requirement.requiredFactIds))) diagnostics.push(`PRESERVATION_INCOMPLETE:${requirement.preservationId}`);
  }
  const preservationBinding = dimension(diagnostics, /PRESERVATION_/);

  for (const requirement of records(evidencePack.proofRequirements)) {
    const match = proof.find(({ proofObligationId }) => proofObligationId === requirement.proofObligationId);
    if (!match || match.kind !== requirement.kind || match.status !== 'PLANNED'
      || !containsAll(strings(match.requiredFactIds), strings(requirement.requiredFactIds))
      || strings(match.nodeIds).some((id) => !nodeIds.has(id))) diagnostics.push(`PROOF_INCOMPLETE:${requirement.proofObligationId}`);
  }
  const proofCoverage = dimension(diagnostics, /PROOF_/);

  const capabilityGap = unresolved.some((entry) => entry.kind === 'CAPABILITY' && entry.disposition === 'CAPABILITY_GAP'
    && strings(entry.factIds).includes('fact-support-generated-composition'));
  if (artifact.stageDisposition !== 'CAPABILITY_GAP' || !capabilityGap) diagnostics.push('CAPABILITY_STATUS_MISREPRESENTED');
  const capabilityHonesty = dimension(diagnostics, /CAPABILITY_STATUS/);
  const dimensions = [nodeBinding, factIntegrity, revisionBinding, rightsAndPrivacy, preservationBinding, proofCoverage, capabilityHonesty];
  const disposition = dimensions.includes('FAIL') ? 'FAIL'
    : artifact.stageDisposition === 'CAPABILITY_GAP' ? 'CAPABILITY_BLOCKED' : 'PASS';
  return deepFreezeV1({ disposition, nodeBinding, factIntegrity, revisionBinding, rightsAndPrivacy, preservationBinding, proofCoverage, capabilityHonesty, diagnostics });
}

function stageThreePacket(): HashedStagePacketV2 {
  const stageOne = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');
  const stageTwo = bindIssuedStage2PacketV2(buildNextProviderStagePacketV2({ previousPacket: stageOne, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalBlueprintJson as JsonRecord & { artifactType: string; taskId: string } }));
  const currentPacket = buildNextProviderStagePacketV2({ previousPacket: stageTwo, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: intent as JsonRecord & { artifactType: string; taskId: string } });
  return bindIssuedStage3PacketV2(currentPacket);
}

function countInputTokens(input: { attempt: 1 | 2; request: SerializedProviderRequestV2; priorRequest?: SerializedProviderRequestV2; priorInputTokens?: number; row: RowV2 }): number {
  const value = input.attempt === 2 && input.priorRequest && input.priorInputTokens !== undefined
    ? input.priorInputTokens + Math.max(0, requestBytes(input.request) - requestBytes(input.priorRequest)) + 256
    : estimateOfflineInputTokensUpperBoundV2(input.request, 0);
  if (input.attempt === 1 && (value !== input.row.localInputTokenUpperBound || input.request.requestHash !== input.row.requestHash)) throw new Error(`STAGE3_REQUEST_DRIFT:${input.row.rowId}`);
  return value;
}

function providerRoute(route: RouteV2, apiKey: string): ProviderRouteV2 { return { kind: route.provider, apiKey, model: route.requestModel, modelSnapshot: route.claimedBenchmarkIdentity, reasoningMode: route.reasoningMode }; }
function pricing(route: RouteV2): ProviderPricingV2 { return { inputUsdPerMillion: route.pricing.inputUsdPerMillion, outputUsdPerMillion: route.pricing.outputUsdPerMillion, ...(route.pricing.cachedInputUsdPerMillion === null ? {} : { cachedInputUsdPerMillion: route.pricing.cachedInputUsdPerMillion }), ...(route.pricing.cacheWriteUsdPerMillion === null ? {} : { cacheWriteUsdPerMillion: route.pricing.cacheWriteUsdPerMillion }) }; }
function validateAuthorization(plan: PlanV2, options: Stage3EvidenceBindingRunOptionsV2): void { if (plan.planHash !== options.expectedPlanHash) throw new Error('STAGE3_PLAN_HASH_MISMATCH'); if (!options.operatorId.trim()) throw new Error('STAGE3_OPERATOR_REQUIRED'); if (Number.isNaN(Date.parse(options.confirmedAt))) throw new Error('STAGE3_CONFIRMATION_INVALID'); if (!Number.isFinite(options.maxAuthorizedSpendUsd) || options.maxAuthorizedSpendUsd < plan.spend.absoluteMaxSpendUsd) throw new Error('STAGE3_SPEND_NOT_AUTHORIZED'); }
function emptyEvaluation(): Readonly<EvidenceBindingEvaluationV2> { return deepFreezeV1({ disposition: 'UNVERIFIABLE', nodeBinding: 'UNVERIFIABLE', factIntegrity: 'UNVERIFIABLE', revisionBinding: 'UNVERIFIABLE', rightsAndPrivacy: 'UNVERIFIABLE', preservationBinding: 'UNVERIFIABLE', proofCoverage: 'UNVERIFIABLE', capabilityHonesty: 'UNVERIFIABLE', diagnostics: ['NO_ACCEPTED_ARTIFACT'] }); }
function dimension(diagnostics: string[], pattern: RegExp): DimensionV2 { return diagnostics.some((entry) => pattern.test(entry)) ? 'FAIL' : 'PASS'; }
function fact(factId: string): JsonRecord { return records(evidencePack.facts).find((entry) => entry.factId === factId) ?? {}; }
function requestBytes(request: SerializedProviderRequestV2): number { return Buffer.byteLength(JSON.stringify(request.body), 'utf8'); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && containsAll(left, right); }
function containsAll(haystack: string[], needles: string[]): boolean { const values = new Set(haystack); return needles.every((value) => values.has(value)); }
function symmetricDifference(left: Set<string>, right: Set<string>): string[] { return [...new Set([...left].filter((id) => !right.has(id)).concat([...right].filter((id) => !left.has(id))))]; }
