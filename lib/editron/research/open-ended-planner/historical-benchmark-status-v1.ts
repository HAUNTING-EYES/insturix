import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';

export const HISTORICAL_BENCHMARK_STATUS_VERSION_V1 =
  'EDITRON_OE_HISTORICAL_BENCHMARK_STATUS_V1_1' as const;
export const HISTORICAL_BENCHMARK_STATUS_AUTHORITY_V1 =
  'DERIVED_RESEARCH_INTERPRETATION_NO_PROVIDER_OR_PROJECT_AUTHORITY' as const;

export type BenchmarkInterpretationStatusV1 =
  | 'PASS_STRUCTURAL_ONLY'
  | 'PASS_SAFE_STOP_PROOF'
  | 'PASS_RENDERED_PROXY'
  | 'PASS_PRODUCT_PROOF'
  | 'FAIL_STRUCTURAL'
  | 'FAIL_UNSAFE_ATTEMPT'
  | 'FAIL_CLAIM_PROOF'
  | 'INVALID_BENCHMARK_CONFOUNDED'
  | 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE'
  | 'NOT_EVALUATED_RESOURCE_GUARD'
  | 'UNRESOLVED_PROOF_FAILURE';

export type BenchmarkProofLevelV1 =
  | 'NONE' | 'STRUCTURAL' | 'SAFE_STOP' | 'RENDERED_PROXY' | 'PRODUCT';
export type BenchmarkSafetyDispositionV1 =
  | 'COMPLIANT'
  | 'OWNER_BLOCKED_UNSAFE_ATTEMPT'
  | 'UNSAFE_MUTATION_SUCCEEDED'
  | 'UNVERIFIED';
export type BenchmarkValidityV1 =
  | 'VALID' | 'CONFOUNDED' | 'INFRASTRUCTURE_UNVERIFIABLE';
export type BenchmarkDecisionV1 = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface HistoricalBenchmarkRowStatusInputV1 {
  rowId: string;
  routeId: string;
  caseId: string | null;
  sourceRowSha256: string;
  rawStatus: string;
  interpretationStatus: BenchmarkInterpretationStatusV1;
  proofLevel: BenchmarkProofLevelV1;
  safetyDisposition: BenchmarkSafetyDispositionV1;
  benchmarkValidity: BenchmarkValidityV1;
  modelDecision: BenchmarkDecisionV1;
  taskOutcome: BenchmarkDecisionV1;
  reasonCodes: readonly string[];
  evidenceReceiptSha256: string | null;
}

export interface HistoricalBenchmarkStatusReceiptV1 {
  version: typeof HISTORICAL_BENCHMARK_STATUS_VERSION_V1;
  authority: typeof HISTORICAL_BENCHMARK_STATUS_AUTHORITY_V1;
  lane: string;
  successorManifestSha256: string;
  readinessReceiptSha256: string;
  historicalManifestSha256: string;
  historicalCohortReceiptSha256: string;
  policyVersion: string;
  policySha256: string;
  proofCeiling: BenchmarkProofLevelV1;
  sourceArtifactSetSha256: string;
  rows: readonly Readonly<HistoricalBenchmarkRowStatusInputV1 & {
    rowInterpretationSha256: string;
  }>[];
  counts: Readonly<{
    interpretationStatus: Readonly<Record<string, number>>;
    proofLevel: Readonly<Record<string, number>>;
    safetyDisposition: Readonly<Record<string, number>>;
    benchmarkValidity: Readonly<Record<string, number>>;
    modelDecision: Readonly<Record<string, number>>;
    taskOutcome: Readonly<Record<string, number>>;
  }>;
  providerInferenceCalls: 0;
  networkCalls: 0;
  projectReads: 0;
  projectMutations: 0;
  mediaWrites: 0;
  stateEffects: readonly [];
  providerRankingAuthorized: false;
  reliabilityEstimateAuthorized: false;
  productionPromotionAuthorized: false;
  assessment: 'HISTORICAL_EVIDENCE_RESCORED_NO_PROVIDER_RANKING';
  receiptSha256: string;
}

export function buildHistoricalBenchmarkStatusReceiptV1(input: Readonly<{
  lane: string;
  successorManifestSha256: string;
  readinessReceiptSha256: string;
  historicalManifestSha256: string;
  historicalCohortReceiptSha256: string;
  policyVersion: string;
  policySha256: string;
  proofCeiling: BenchmarkProofLevelV1;
  rows: readonly Readonly<HistoricalBenchmarkRowStatusInputV1>[];
}>): Readonly<HistoricalBenchmarkStatusReceiptV1> {
  for (const value of [
    input.successorManifestSha256,
    input.readinessReceiptSha256,
    input.historicalManifestSha256,
    input.historicalCohortReceiptSha256,
    input.policySha256,
  ]) assertSha(value, 'SUBJECT_HASH_INVALID');
  assertIdentifier(input.lane, 'LANE_INVALID');
  assertIdentifier(input.policyVersion, 'POLICY_VERSION_INVALID');
  if (!input.rows.length) fail('ROW_SET_EMPTY');
  const rows = [...input.rows].sort((left, right) => compare(left.rowId, right.rowId))
    .map(normalizeRow);
  if (new Set(rows.map(({ rowId }) => rowId)).size !== rows.length) {
    fail('ROW_ID_DUPLICATED');
  }
  const proofCeiling = proofRank(input.proofCeiling);
  if (rows.some(({ proofLevel }) => proofRank(proofLevel) > proofCeiling)) {
    fail('PROOF_CEILING_EXCEEDED');
  }
  const sourceArtifactSetSha256 = hashEditronCanonicalJsonV1(rows.map(
    ({ rowId, sourceRowSha256 }) => ({ rowId, sourceRowSha256 }),
  ));
  const material = {
    version: HISTORICAL_BENCHMARK_STATUS_VERSION_V1,
    authority: HISTORICAL_BENCHMARK_STATUS_AUTHORITY_V1,
    lane: input.lane,
    successorManifestSha256: input.successorManifestSha256,
    readinessReceiptSha256: input.readinessReceiptSha256,
    historicalManifestSha256: input.historicalManifestSha256,
    historicalCohortReceiptSha256: input.historicalCohortReceiptSha256,
    policyVersion: input.policyVersion,
    policySha256: input.policySha256,
    proofCeiling: input.proofCeiling,
    sourceArtifactSetSha256,
    rows,
    counts: {
      interpretationStatus: count(rows, 'interpretationStatus'),
      proofLevel: count(rows, 'proofLevel'),
      safetyDisposition: count(rows, 'safetyDisposition'),
      benchmarkValidity: count(rows, 'benchmarkValidity'),
      modelDecision: count(rows, 'modelDecision'),
      taskOutcome: count(rows, 'taskOutcome'),
    },
    providerInferenceCalls: 0 as const,
    networkCalls: 0 as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    mediaWrites: 0 as const,
    stateEffects: [] as const,
    providerRankingAuthorized: false as const,
    reliabilityEstimateAuthorized: false as const,
    productionPromotionAuthorized: false as const,
    assessment: 'HISTORICAL_EVIDENCE_RESCORED_NO_PROVIDER_RANKING' as const,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertHistoricalBenchmarkStatusReceiptV1(input: Readonly<{
  value: unknown;
  expected: Parameters<typeof buildHistoricalBenchmarkStatusReceiptV1>[0];
}>): Readonly<HistoricalBenchmarkStatusReceiptV1> {
  const rebuilt = buildHistoricalBenchmarkStatusReceiptV1(input.expected);
  if (hashEditronCanonicalJsonV1(input.value) !== hashEditronCanonicalJsonV1(rebuilt)) {
    fail('RECEIPT_FORGED_OR_EXPECTATION_DRIFT');
  }
  return rebuilt;
}

function normalizeRow(input: Readonly<HistoricalBenchmarkRowStatusInputV1>) {
  assertIdentifier(input.rowId, 'ROW_ID_INVALID');
  assertIdentifier(input.routeId, 'ROUTE_ID_INVALID');
  if (input.caseId !== null) assertIdentifier(input.caseId, 'CASE_ID_INVALID');
  assertSha(input.sourceRowSha256, 'SOURCE_ROW_HASH_INVALID');
  assertIdentifier(input.rawStatus, 'RAW_STATUS_INVALID');
  if (input.evidenceReceiptSha256 !== null) {
    assertSha(input.evidenceReceiptSha256, 'EVIDENCE_RECEIPT_HASH_INVALID');
  }
  assertEnum(input.interpretationStatus, [
    'PASS_STRUCTURAL_ONLY', 'PASS_SAFE_STOP_PROOF', 'PASS_RENDERED_PROXY',
    'PASS_PRODUCT_PROOF', 'FAIL_STRUCTURAL', 'FAIL_UNSAFE_ATTEMPT',
    'FAIL_CLAIM_PROOF', 'INVALID_BENCHMARK_CONFOUNDED',
    'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE', 'NOT_EVALUATED_RESOURCE_GUARD',
    'UNRESOLVED_PROOF_FAILURE',
  ], 'INTERPRETATION_STATUS_INVALID');
  proofRank(input.proofLevel);
  assertEnum(input.safetyDisposition, [
    'COMPLIANT', 'OWNER_BLOCKED_UNSAFE_ATTEMPT',
    'UNSAFE_MUTATION_SUCCEEDED', 'UNVERIFIED',
  ], 'SAFETY_DISPOSITION_INVALID');
  assertEnum(input.benchmarkValidity, [
    'VALID', 'CONFOUNDED', 'INFRASTRUCTURE_UNVERIFIABLE',
  ], 'BENCHMARK_VALIDITY_INVALID');
  assertEnum(input.modelDecision, ['PASS', 'FAIL', 'UNVERIFIABLE'],
    'MODEL_DECISION_INVALID');
  assertEnum(input.taskOutcome, ['PASS', 'FAIL', 'UNVERIFIABLE'],
    'TASK_OUTCOME_INVALID');
  const reasonCodes = sortedUnique(input.reasonCodes, 'REASON_CODE');
  assertRowAxes(input);
  const material = { ...input, reasonCodes };
  return {
    ...material,
    rowInterpretationSha256: hashEditronCanonicalJsonV1(material),
  };
}

function assertRowAxes(row: Readonly<HistoricalBenchmarkRowStatusInputV1>): void {
  const pass = row.interpretationStatus.startsWith('PASS_');
  const fail = row.interpretationStatus.startsWith('FAIL_');
  const invalid = row.interpretationStatus === 'INVALID_BENCHMARK_CONFOUNDED';
  const nonEvaluation = row.interpretationStatus.startsWith('NOT_EVALUATED_');
  const unresolved = row.interpretationStatus === 'UNRESOLVED_PROOF_FAILURE';
  if (pass && (row.modelDecision !== 'PASS' || row.taskOutcome !== 'PASS'
    || row.benchmarkValidity !== 'VALID' || row.safetyDisposition !== 'COMPLIANT')) {
    failNow('PASS_AXES_INCONSISTENT');
  }
  if (fail && (row.modelDecision !== 'FAIL' || row.taskOutcome !== 'FAIL'
    || row.benchmarkValidity !== 'VALID')) failNow('FAIL_AXES_INCONSISTENT');
  if (row.interpretationStatus === 'FAIL_UNSAFE_ATTEMPT'
    && !['OWNER_BLOCKED_UNSAFE_ATTEMPT', 'UNSAFE_MUTATION_SUCCEEDED']
      .includes(row.safetyDisposition)) failNow('UNSAFE_ATTEMPT_AXIS_MISSING');
  if ((invalid || nonEvaluation || unresolved)
    && (row.modelDecision !== 'UNVERIFIABLE' || row.taskOutcome !== 'UNVERIFIABLE')) {
    failNow('UNVERIFIABLE_AXES_INCONSISTENT');
  }
  if (invalid && row.benchmarkValidity !== 'CONFOUNDED') {
    failNow('CONFOUNDED_VALIDITY_MISSING');
  }
  if (nonEvaluation && row.benchmarkValidity !== 'INFRASTRUCTURE_UNVERIFIABLE') {
    failNow('INFRASTRUCTURE_VALIDITY_MISSING');
  }
  const expectedProof: Partial<Record<BenchmarkInterpretationStatusV1, BenchmarkProofLevelV1>> = {
    PASS_STRUCTURAL_ONLY: 'STRUCTURAL', PASS_SAFE_STOP_PROOF: 'SAFE_STOP',
    PASS_RENDERED_PROXY: 'RENDERED_PROXY', PASS_PRODUCT_PROOF: 'PRODUCT',
    FAIL_STRUCTURAL: 'NONE', FAIL_UNSAFE_ATTEMPT: 'NONE',
  };
  if (expectedProof[row.interpretationStatus]
    && expectedProof[row.interpretationStatus] !== row.proofLevel) {
    failNow('STATUS_PROOF_LEVEL_INCONSISTENT');
  }
}

function count<T extends Record<string, unknown>>(values: readonly T[], field: keyof T) {
  const keys = [...new Set(values.map((value) => String(value[field])))].sort(compare);
  return Object.fromEntries(keys.map((key) => [
    key, values.filter((value) => String(value[field]) === key).length,
  ]));
}
function proofRank(value: BenchmarkProofLevelV1): number {
  const rank = ['NONE', 'STRUCTURAL', 'SAFE_STOP', 'RENDERED_PROXY', 'PRODUCT']
    .indexOf(value);
  if (rank < 0) fail('PROOF_LEVEL_INVALID');
  return rank;
}
function assertEnum(value: string, allowed: readonly string[], code: string): void {
  if (!allowed.includes(value)) fail(code);
}
function sortedUnique(values: readonly string[], label: string): string[] {
  const output = [...new Set(values)];
  output.forEach((value) => assertIdentifier(value, `${label}_INVALID`));
  if (output.length !== values.length) fail(`${label}_DUPLICATED`);
  return output.sort(compare);
}
function assertIdentifier(value: string, code: string): void {
  if (!value || value.length > 240) fail(code);
}
function assertSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail(code);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function failNow(code: string): never { return fail(code); }
function fail(code: string): never {
  throw new Error(`HISTORICAL_BENCHMARK_STATUS_V1_${code}`);
}
