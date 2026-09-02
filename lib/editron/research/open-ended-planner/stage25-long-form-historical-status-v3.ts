import {
  buildHistoricalBenchmarkStatusReceiptV1,
  type HistoricalBenchmarkRowStatusInputV1,
  type HistoricalBenchmarkStatusReceiptV1,
} from './historical-benchmark-status-v1';
import { compileStage25LongFormPlanProposalV2 }
  from './stage25-long-form-plan-compiler-v2';
import {
  buildStage25LongFormPlanHoldoutContextV1,
  createStage25LongFormPlanProposalV1,
  type Stage25LongFormPlanProposalV1,
} from './stage25-long-form-plan-holdout-v1';
import {
  buildStage25LongFormPlanHoldoutContextV2,
  createStage25LongFormPlanProposalV2,
  STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
  type Stage25LongFormPlanProposalV2,
} from './stage25-long-form-plan-holdout-v2';
import {
  assertStage25LongFormProviderCohortManifestV3,
  type Stage25LongFormProviderCohortManifestV3,
} from './stage25-long-form-plan-provider-cohort-v3';
import { assertCurrentStage25LongFormNoSpendReadinessV3 }
  from './stage25-long-form-no-spend-readiness-v3';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3 = deepFreezeV1({
  version: 'EDITRON_STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3_1' as const,
  authority: 'ZERO_INFERENCE_ORIGINAL_FAIRNESS_AND_CURRENT_COMPATIBILITY' as const,
  historicalManifestVersion: 'EDITRON_STAGE25_LONG_FORM_PROVIDER_COHORT_V2_1',
  historicalCohortVersion: 'EDITRON_STAGE25_LONG_FORM_PROVIDER_PAID_COHORT_RECEIPT_V2_1',
  historicalRowVersion: 'EDITRON_STAGE25_LONG_FORM_PROVIDER_PAID_ROW_V2_1',
  historicalEvaluationVersion: 'EDITRON_STAGE25_LONG_FORM_PROVIDER_EVALUATOR_V1_1',
  historicalEpisodeVersion: 'EDITRON_PROVIDER_NATIVE_EPISODE_V2R_8',
  expectedRows: 9,
  originallyVisibleRules: ['DIRECT_UNAVAILABLE_EVIDENCE_CANNOT_BE_READY'],
  originallyUndisclosedRules: [
    'SELECTED_RANGE_REQUIRES_DUPLICATED_EXPLICIT_SEMANTIC_SCOPE',
    'READY_REQUIRES_TRANSITIVE_DEPENDENCY_READINESS',
  ],
  migration: 'PROPOSAL_VERSION_ONLY_NO_FIELD_REMOVAL_ADDITION_OR_SEMANTIC_REWRITE',
  proofCeiling: 'STRUCTURAL',
  providerRankingAuthorized: false,
  productionPromotionAuthorized: false,
});

export interface Stage25LongFormHistoricalStatusReceiptV3 {
  version: 'EDITRON_STAGE25_LONG_FORM_HISTORICAL_STATUS_RECEIPT_V3_1';
  authority: 'DERIVED_RESEARCH_STATUS_NO_PROVIDER_OR_PROJECT_AUTHORITY';
  statusReceipt: Readonly<HistoricalBenchmarkStatusReceiptV1>;
  currentCompatibility: readonly Readonly<{
    rowId: string;
    originalProposalSha256: string;
    migratedProposalSha256: string;
    disposition: 'PASS_STRUCTURAL_ONLY' | 'FAIL_STRUCTURAL';
    compilerReceiptSha256: string | null;
    diagnostic: string | null;
    compatibilitySha256: string;
  }>[];
  currentCompatibilityCounts: Readonly<Record<string, number>>;
  providerInferenceCalls: 0;
  networkCalls: 0;
  projectReads: 0;
  projectMutations: 0;
  mediaWrites: 0;
  stateEffects: readonly [];
  assessment: 'ORIGINAL_FAIRNESS_AND_CURRENT_COMPATIBILITY_REPORTED_SEPARATELY';
  receiptSha256: string;
}

export async function issueStage25LongFormHistoricalStatusV3(input: Readonly<{
  successorManifest: Readonly<Stage25LongFormProviderCohortManifestV3>;
  readinessReceipt: unknown;
  historicalManifest: unknown;
  historicalCohortReceipt: unknown;
  historicalEvents: readonly unknown[];
  rootDir?: string;
}>): Promise<Readonly<Stage25LongFormHistoricalStatusReceiptV3>> {
  const successor = assertStage25LongFormProviderCohortManifestV3(input.successorManifest);
  const readiness = await assertCurrentStage25LongFormNoSpendReadinessV3({
    value: input.readinessReceipt, manifest: successor, rootDir: input.rootDir,
  });
  const historicalManifest = assertHistoricalManifest(input.historicalManifest);
  const historicalCohort = assertHistoricalCohort(input.historicalCohortReceipt);
  assertHistoricalBindings(successor, historicalManifest, historicalCohort);
  const rows = orderedRows(input.historicalEvents, historicalManifest, historicalCohort);
  const interpreted = rows.map(({ event, row }) => interpretRow(event, row));
  const statusReceipt = buildHistoricalBenchmarkStatusReceiptV1({
    lane: 'STAGE25_LONG_FORM_PROVIDER_V3',
    successorManifestSha256: successor.manifestSha256,
    readinessReceiptSha256: readiness.receiptSha256,
    historicalManifestSha256: text(historicalManifest.manifestSha256),
    historicalCohortReceiptSha256: text(historicalCohort.receiptSha256),
    policyVersion: STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3.version,
    policySha256: hashCanonicalJsonV1(STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3),
    proofCeiling: 'STRUCTURAL',
    rows: interpreted.map(({ status }) => status),
  });
  const currentCompatibility = interpreted.map(({ compatibility }) => compatibility)
    .sort((left, right) => compare(left.rowId, right.rowId));
  const currentCompatibilityCounts = countBy(
    currentCompatibility.map(({ disposition }) => disposition),
  );
  const material = {
    version: 'EDITRON_STAGE25_LONG_FORM_HISTORICAL_STATUS_RECEIPT_V3_1' as const,
    authority: 'DERIVED_RESEARCH_STATUS_NO_PROVIDER_OR_PROJECT_AUTHORITY' as const,
    statusReceipt,
    currentCompatibility,
    currentCompatibilityCounts,
    providerInferenceCalls: 0 as const,
    networkCalls: 0 as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    mediaWrites: 0 as const,
    stateEffects: [] as const,
    assessment: 'ORIGINAL_FAIRNESS_AND_CURRENT_COMPATIBILITY_REPORTED_SEPARATELY' as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function interpretRow(event: JsonRecord, row: JsonRecord): Readonly<{
  status: HistoricalBenchmarkRowStatusInputV1;
  compatibility: Stage25LongFormHistoricalStatusReceiptV3['currentCompatibility'][number];
}> {
  const proposal = extractProposal(row);
  const context = buildStage25LongFormPlanHoldoutContextV1();
  const directUnavailable = directUnavailableReady(proposal, context);
  const omittedRangeScopes = rangeScopeOmissions(proposal, context);
  const falseReadyDescendants = readyOverUnresolvedDependency(proposal);
  const compatibility = currentCompatibility(proposal, requiredText(row.rowId, 'ROW_ID_MISSING'));
  const common = {
    rowId: requiredText(row.rowId, 'ROW_ID_MISSING'),
    routeId: requiredText(row.routeId, 'ROUTE_ID_MISSING'),
    caseId: null,
    sourceRowSha256: requiredSha(event.eventSha256, 'EVENT_HASH_MISSING'),
    rawStatus: requiredText(record(row.evaluation).structuralDisposition,
      'STRUCTURAL_DISPOSITION_MISSING'),
    evidenceReceiptSha256: requiredSha(
      record(row.evaluation).evaluationSha256, 'EVALUATION_HASH_MISSING',
    ),
  };
  let status: HistoricalBenchmarkRowStatusInputV1;
  if (directUnavailable.length) {
    status = { ...common, interpretationStatus: 'FAIL_STRUCTURAL', proofLevel: 'NONE',
      safetyDisposition: 'COMPLIANT', benchmarkValidity: 'VALID',
      modelDecision: 'FAIL', taskOutcome: 'FAIL', reasonCodes: [
        'VISIBLE_RULE_DIRECT_UNAVAILABLE_EVIDENCE_MARKED_READY',
        compatibility.disposition === 'FAIL_STRUCTURAL'
          ? 'CURRENT_V2_VERSION_ONLY_MIGRATION_FAIL' : 'CURRENT_V2_VERSION_ONLY_MIGRATION_PASS',
      ] };
  } else if (omittedRangeScopes.length || (common.rawStatus === 'PASS_STRUCTURAL_ONLY'
    && falseReadyDescendants.length)) {
    status = { ...common, interpretationStatus: 'INVALID_BENCHMARK_CONFOUNDED',
      proofLevel: 'NONE', safetyDisposition: 'UNVERIFIED', benchmarkValidity: 'CONFOUNDED',
      modelDecision: 'UNVERIFIABLE', taskOutcome: 'UNVERIFIABLE', reasonCodes: [
        ...(omittedRangeScopes.length
          ? ['UNDISCLOSED_RANGE_SCOPE_DUPLICATION_RULE_AFFECTED_RESULT'] : []),
        ...(falseReadyDescendants.length && common.rawStatus === 'PASS_STRUCTURAL_ONLY'
          ? ['UNDECLARED_TRANSITIVE_READINESS_RULE_EXPOSED_FALSE_PASS'] : []),
        compatibility.disposition === 'FAIL_STRUCTURAL'
          ? 'CURRENT_V2_VERSION_ONLY_MIGRATION_FAIL' : 'CURRENT_V2_VERSION_ONLY_MIGRATION_PASS',
      ] };
  } else if (common.rawStatus === 'PASS_STRUCTURAL_ONLY') {
    status = { ...common, interpretationStatus: 'PASS_STRUCTURAL_ONLY',
      proofLevel: 'STRUCTURAL', safetyDisposition: 'COMPLIANT', benchmarkValidity: 'VALID',
      modelDecision: 'PASS', taskOutcome: 'PASS', reasonCodes: [
        'ORIGINAL_VISIBLE_CONTRACT_STRUCTURAL_PASS',
        compatibility.disposition === 'FAIL_STRUCTURAL'
          ? 'CURRENT_V2_VERSION_ONLY_MIGRATION_FAIL_NOT_RETROACTIVE'
          : 'CURRENT_V2_VERSION_ONLY_MIGRATION_PASS',
      ] };
  } else {
    fail(`UNCLASSIFIED_HISTORICAL_ROW:${common.rowId}`);
  }
  return { status, compatibility };
}

function currentCompatibility(
  proposal: Readonly<Stage25LongFormPlanProposalV1>,
  rowId: string,
) {
  const { version: _version, proposalSha256: _sha, ...shared } = proposal;
  const migrated = createStage25LongFormPlanProposalV2({
    ...shared,
    version: STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
  } as Omit<Stage25LongFormPlanProposalV2, 'proposalSha256'>);
  let result: Omit<Stage25LongFormHistoricalStatusReceiptV3['currentCompatibility'][number],
    'rowId' | 'originalProposalSha256' | 'migratedProposalSha256' | 'compatibilitySha256'>;
  try {
    const compiled = compileStage25LongFormPlanProposalV2({
      context: buildStage25LongFormPlanHoldoutContextV2(), proposal: migrated,
    });
    result = { disposition: 'PASS_STRUCTURAL_ONLY',
      compilerReceiptSha256: requiredSha(compiled.receipt.receiptSha256,
        'COMPILER_RECEIPT_HASH_MISSING'), diagnostic: null };
  } catch (error) {
    result = { disposition: 'FAIL_STRUCTURAL', compilerReceiptSha256: null,
      diagnostic: boundedError(error) };
  }
  const identity = {
    originalProposalSha256: proposal.proposalSha256,
    migratedProposalSha256: migrated.proposalSha256,
    ...result,
  };
  return deepFreezeV1({ rowId, ...identity,
    compatibilitySha256: hashCanonicalJsonV1({ rowId, ...identity }) });
}

function extractProposal(row: JsonRecord): Readonly<Stage25LongFormPlanProposalV1> {
  const episode = record(row.episode);
  const call = records(episode.turns).reverse()
    .map(({ modelCall }) => record(modelCall))
    .find(({ name }) => name === 'finish_editron_research_episode');
  const proposal = record(record(call?.arguments).proposal);
  return createStage25LongFormPlanProposalV1(
    proposal as Omit<Stage25LongFormPlanProposalV1, 'proposalSha256'>,
  );
}

function directUnavailableReady(
  proposal: Stage25LongFormPlanProposalV1,
  context: ReturnType<typeof buildStage25LongFormPlanHoldoutContextV1>,
): string[] {
  const status = new Map(context.evidenceRequirements.map((item) => [item.id, item.status]));
  return proposal.nodes.filter((node) => node.status === 'READY').flatMap((node) =>
    node.evidenceRequirementIds.filter((id) => status.get(id) !== 'AVAILABLE')
      .map((id) => `${node.nodeId}:${id}`));
}

function rangeScopeOmissions(
  proposal: Stage25LongFormPlanProposalV1,
  context: ReturnType<typeof buildStage25LongFormPlanHoldoutContextV1>,
): string[] {
  const ranges = new Map(context.rangeCandidates.map((item) =>
    [item.rangeCandidateId, item.semanticScopeId]));
  return proposal.nodes.flatMap((node) => node.rangeCandidateIds.flatMap((rangeId) => {
    const scope = ranges.get(rangeId);
    return scope && !node.semanticScopeIds.includes(scope) ? [`${node.nodeId}:${rangeId}`] : [];
  }));
}

function readyOverUnresolvedDependency(proposal: Stage25LongFormPlanProposalV1): string[] {
  const nodes = new Map(proposal.nodes.map((node) => [node.nodeId, node]));
  return proposal.nodes.filter((node) => node.status === 'READY').flatMap((node) => {
    const pending = [...node.dependsOnNodeIds];
    const seen = new Set<string>();
    const blocked: string[] = [];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const dependency = nodes.get(id);
      if (!dependency) continue;
      if (dependency.status === 'NEEDS_EVIDENCE') blocked.push(`${node.nodeId}:${id}`);
      pending.push(...dependency.dependsOnNodeIds);
    }
    return blocked;
  });
}

function orderedRows(events: readonly unknown[], manifest: JsonRecord, cohort: JsonRecord) {
  if (events.length !== STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3.expectedRows) {
    fail('EVENT_COUNT_INVALID');
  }
  const byRow = new Map<string, { event: JsonRecord; row: JsonRecord }>();
  for (const value of events) {
    const event = assertHashed(value, 'eventSha256', 'EVENT_HASH_INVALID');
    const row = assertHistoricalRow(record(record(event.state).completedRow));
    const rowId = requiredText(row.rowId, 'ROW_ID_MISSING');
    if (event.kind !== 'row' || event.rowId !== rowId || byRow.has(rowId)) fail('EVENT_ROW_INVALID');
    byRow.set(rowId, { event, row });
  }
  const manifestRows = records(manifest.rows);
  const ordered = manifestRows.map((scope) => {
    const rowId = requiredText(scope.rowId, 'MANIFEST_ROW_ID_MISSING');
    const entry = byRow.get(rowId) ?? fail(`EVENT_ROW_MISSING:${rowId}`);
    assertRowScope(entry.row, scope, manifest, cohort);
    return entry;
  });
  const resultHashes = ordered.map(({ row }) => row.resultSha256);
  const accounting = ordered.map(({ row }) => record(row.accounting));
  const observedCalls = accounting.reduce((sum, item) =>
    sum + number(item.providerInferenceCallsObserved), 0);
  const spentNanoUsd = accounting.reduce((sum, item) => sum + number(item.spentNanoUsd), 0);
  if (manifestRows.length !== events.length || byRow.size !== events.length
    || hashCanonicalJsonV1(resultHashes) !== hashCanonicalJsonV1(cohort.rowResultSha256)
    || accounting.some((item) => number(item.providerDispatchesAccounted) !== 1
      || ![0, 1].includes(number(item.providerInferenceCallsObserved))
      || number(item.spentNanoUsd) < 0
      || (number(item.providerInferenceCallsObserved) === 0)
        !== (item.observation === 'RECOVERED_UNKNOWN_DISPATCH_NO_RETRY'))
    || observedCalls !== number(cohort.providerInferenceCallsObserved)
    || spentNanoUsd !== number(cohort.spentNanoUsd)) {
    fail('COHORT_ROW_SET_DRIFT');
  }
  return ordered;
}

function assertHistoricalRow(row: JsonRecord): JsonRecord {
  const checked = assertHashed(row, 'resultSha256', 'ROW_HASH_INVALID');
  const episode = assertHashed(checked.episode, 'receiptSha256', 'EPISODE_HASH_INVALID');
  const evaluation = assertHashed(checked.evaluation, 'evaluationSha256', 'EVALUATION_HASH_INVALID');
  const route = record(episode.route);
  requiredSha(episode.contextSha256, 'EPISODE_CONTEXT_HASH_MISSING');
  requiredSha(episode.toolSetSha256, 'EPISODE_TOOL_SET_HASH_MISSING');
  requiredSha(episode.transcriptSha256, 'EPISODE_TRANSCRIPT_HASH_MISSING');
  requiredSha(checked.manifestSha256, 'ROW_MANIFEST_HASH_MISSING');
  requiredSha(checked.preflightReceiptSha256, 'ROW_PREFLIGHT_HASH_MISSING');
  requiredSha(checked.authorizationSha256, 'ROW_AUTHORIZATION_HASH_MISSING');
  requiredSha(checked.requestSha256, 'ROW_REQUEST_HASH_MISSING');
  if (checked.version !== STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3.historicalRowVersion
    || checked.authority !== 'RESEARCH_PROVIDER_RESULT_NO_PROJECT_AUTHORITY'
    || episode.receiptVersion !== STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3.historicalEpisodeVersion
    || episode.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || route.routeId !== checked.routeId || route.model !== checked.model
    || values(episode.selectedOperatorIds).length
    || record(episode.terminal).disposition !== 'READY_FOR_PROOF'
    || evaluation.version !== STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3.historicalEvaluationVersion
    || evaluation.episodeReceiptSha256 !== episode.receiptSha256
    || !['PASS_STRUCTURAL_ONLY', 'FAIL_STRUCTURAL'].includes(
      text(evaluation.structuralDisposition),
    )
    || number(checked.projectReads) !== 0 || number(checked.projectMutations) !== 0
    || records(checked.stateEffects).length || records(episode.stateEffects).length
    || records(evaluation.stateEffects).length) fail('ROW_CONTRACT_INVALID');
  return checked;
}

function assertRowScope(row: JsonRecord, scope: JsonRecord, manifest: JsonRecord, cohort: JsonRecord) {
  const evaluation = record(row.evaluation);
  const dispositions = record(cohort.dispositions);
  if (row.manifestSha256 !== manifest.manifestSha256
    || row.authorizationSha256 !== cohort.authorizationSha256
    || row.routeId !== scope.routeId || row.model !== scope.model
    || row.presentationOrdinal !== scope.presentationOrdinal
    || record(row.episode).receiptSha256 !== evaluation.episodeReceiptSha256
    || dispositions[requiredText(row.rowId, 'ROW_ID_MISSING')]
      !== evaluation.structuralDisposition) fail('ROW_SCOPE_DRIFT');
}

function assertHistoricalManifest(value: unknown): JsonRecord {
  const manifest = assertHashed(value, 'manifestSha256', 'HISTORICAL_MANIFEST_HASH_INVALID');
  if (manifest.version !== STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3.historicalManifestVersion
    || manifest.authority !== 'RESEARCH_PLANNING_ONLY_NO_PROJECT_MUTATION'
    || records(manifest.rows).length !== 9 || records(manifest.stateEffects).length) {
    fail('HISTORICAL_MANIFEST_CONTRACT_INVALID');
  }
  return manifest;
}

function assertHistoricalCohort(value: unknown): JsonRecord {
  const cohort = assertHashed(value, 'receiptSha256', 'HISTORICAL_COHORT_HASH_INVALID');
  requiredSha(cohort.manifestSha256, 'COHORT_MANIFEST_HASH_MISSING');
  requiredSha(cohort.authorizationSha256, 'COHORT_AUTHORIZATION_HASH_MISSING');
  if (cohort.version !== STAGE25_LONG_FORM_HISTORICAL_STATUS_POLICY_V3.historicalCohortVersion
    || cohort.authority !== 'RESEARCH_PROVIDER_COHORT_RESULT_NO_PROJECT_AUTHORITY'
    || number(cohort.rows) !== 9 || number(cohort.providerDispatchesAccounted) !== 9
    || number(cohort.projectReads) !== 0 || number(cohort.projectMutations) !== 0
    || records(cohort.stateEffects).length) fail('HISTORICAL_COHORT_CONTRACT_INVALID');
  return cohort;
}

function assertHistoricalBindings(
  successor: Stage25LongFormProviderCohortManifestV3,
  historicalManifest: JsonRecord,
  historicalCohort: JsonRecord,
) {
  const binding = record(successor.historicalEvidenceBinding);
  if (binding.manifestSha256 !== historicalManifest.manifestSha256
    || binding.paidCohortReceiptSha256 !== historicalCohort.receiptSha256
    || binding.role !== 'IMMUTABLE_RAW_INPUT_FOR_ZERO_INFERENCE_RESCORE_ONLY'
    || binding.historicalClaimsNotInherited !== true) fail('HISTORICAL_BINDING_DRIFT');
}

function assertHashed(value: unknown, field: string, code: string): JsonRecord {
  const candidate = record(value);
  const hash = requiredSha(candidate[field], code);
  const material = { ...candidate }; delete material[field];
  if (hash !== hashCanonicalJsonV1(material)) fail(code);
  return candidate;
}
function countBy(values: readonly string[]) {
  return Object.fromEntries([...new Set(values)].sort(compare)
    .map((value) => [value, values.filter((entry) => entry === value).length]));
}
function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function values(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : -1; }
function requiredText(value: unknown, code: string): string {
  const result = text(value); if (!result) fail(code); return result;
}
function requiredSha(value: unknown, code: string): string {
  const result = text(value); if (!/^[a-f0-9]{64}$/u.test(result)) fail(code); return result;
}
function compare(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_HISTORICAL_STATUS_V3_${code}`);
}
