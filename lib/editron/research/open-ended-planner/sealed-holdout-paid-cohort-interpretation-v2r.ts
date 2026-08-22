import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R }
  from './sealed-holdout-no-edit-proof-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_PAID_COHORT_INTERPRETATION_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_PAID_COHORT_INTERPRETATION_V2R_1' as const;
export const SEALED_HOLDOUT_ENVIRONMENT_REPROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_ENVIRONMENT_REPROOF_V2R_1' as const;

export type SealedHoldoutEvidenceDispositionV2R =
  | 'VALID_SAFE_STOP_PROOF'
  | 'VALID_EDIT_RENDER_PROOF'
  | 'VALID_EDIT_RENDER_PROOF_AFTER_ENVIRONMENT_REPROOF'
  | 'VALID_MODEL_TRACE_FAILURE'
  | 'INVALID_BENCHMARK_CONFOUNDED'
  | 'NOT_EVALUATED_RESOURCE_GUARD'
  | 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE'
  | 'REPROOF_REQUIRED_ENVIRONMENT_FAILURE'
  | 'UNRESOLVED_CLAIM_PROOF_FAILURE';

export interface SealedHoldoutEnvironmentReproofReceiptV2R {
  version: typeof SEALED_HOLDOUT_ENVIRONMENT_REPROOF_VERSION_V2R;
  authority: 'LOCAL_ENVIRONMENT_REPROOF_NO_INFERENCE_NO_PROJECT_AUTHORITY';
  rowId: string;
  caseId: string;
  sourceRowReceiptSha256: string;
  originalProofErrorSha256: string;
  proofReceipt: Readonly<JsonRecord>;
  projectReads: 0;
  projectMutations: 0;
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface SealedHoldoutPaidCohortInterpretationReceiptV2R {
  version: typeof SEALED_HOLDOUT_PAID_COHORT_INTERPRETATION_VERSION_V2R;
  authority: 'FROZEN_INTERPRETATION_NO_PROJECT_AUTHORITY';
  sourceCohortReceiptSha256: string;
  rowCount: number;
  rawStatusCounts: Readonly<Record<string, number>>;
  evidenceDispositionCounts: Readonly<Partial<Record<SealedHoldoutEvidenceDispositionV2R, number>>>;
  rowInterpretations: readonly Readonly<JsonRecord>[];
  environmentReproofSetSha256: string;
  providerInferenceCalls: number;
  providerTurns: number;
  googleCountTokensCalls: number;
  spentNanoUsd: number;
  projectReads: 0;
  projectMutations: 0;
  stateEffects: readonly [];
  assessment: 'MODIFY_BENCHMARK_AND_RERUN_TARGETED_ROWS';
  receiptSha256: string;
}

const CONFOUNDED_EXECUTION_CASES: Readonly<Record<string, readonly string[]>> =
  deepFreezeV1({
    'HOLD-01:C1': ['OWNER_RESOLVER_AND_PROOF_EXPECT_DIFFERENT_MUTATION_FORMS'],
    'HOLD-01:C2': ['OWNER_RESOLVER_AND_PROOF_EXPECT_DIFFERENT_MUTATION_FORMS'],
    'HOLD-03:C1': [
      'VISIBLE_REFERENCE_BINDING_DISAGREES_WITH_HIDDEN_PROOF_LITERAL',
      'GENERATED_COMPOSITION_NESTED_SCHEMA_NOT_DECLARED_TO_MODEL',
      'PROOF_RENDERS_HUMAN_AUTHORED_PROGRAM_NOT_MODEL_GENERATED_PROGRAM',
    ],
    'HOLD-04:C1': ['POST_CUT_STATE_AND_CAPTION_OWNER_EFFECT_NOT_EXPOSED'],
    'HOLD-04:C2': ['POST_CUT_STATE_AND_CAPTION_OWNER_EFFECT_NOT_EXPOSED'],
    'HOLD-05:C1': ['HIDDEN_REFRAME_PLAN_FIELDS_NOT_DECLARED_IN_CALLABLE_SCHEMA'],
  });

export function isSealedHoldoutEnvironmentReproofCandidateV2R(
  rowValue: unknown,
): boolean {
  const row = record(rowValue);
  const evaluation = record(row.evaluation);
  const proof = record(row.proof);
  return row.status === 'FAIL_CLAIM_PROOF'
    && evaluation.assessment === 'READY_FOR_PROOF'
    && proof.attempted === true
    && proof.passed === false
    && text(proof.error).includes('No such file or directory');
}

export function buildSealedHoldoutEnvironmentReproofReceiptV2R(input: Readonly<{
  row: unknown;
  proofReceipt: unknown;
}>): Readonly<SealedHoldoutEnvironmentReproofReceiptV2R> {
  const row = assertRowReceipt(input.row);
  if (!isSealedHoldoutEnvironmentReproofCandidateV2R(row)) {
    fail('SEALED_INTERPRETATION_ROW_NOT_ENVIRONMENT_REPROOF_CANDIDATE');
  }
  const proofReceipt = assertHashedReceipt(
    input.proofReceipt,
    'SEALED_INTERPRETATION_REPROOF_PROOF_RECEIPT_INVALID',
  );
  if (!text(proofReceipt.assessment).startsWith('PASS_')) {
    fail('SEALED_INTERPRETATION_REPROOF_NOT_PASSING');
  }
  const rowPlan = record(row.rowPlan);
  const material = {
    version: SEALED_HOLDOUT_ENVIRONMENT_REPROOF_VERSION_V2R,
    authority: 'LOCAL_ENVIRONMENT_REPROOF_NO_INFERENCE_NO_PROJECT_AUTHORITY' as const,
    rowId: text(rowPlan.rowId),
    caseId: text(rowPlan.caseId),
    sourceRowReceiptSha256: text(row.receiptSha256),
    originalProofErrorSha256: hashCanonicalJsonV1(text(record(row.proof).error)),
    proofReceipt,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function interpretSealedHoldoutPaidCohortV2R(input: Readonly<{
  cohortReceipt: unknown;
  rows: readonly unknown[];
  environmentReproofs?: readonly unknown[];
}>): Readonly<SealedHoldoutPaidCohortInterpretationReceiptV2R> {
  const cohort = assertHashedReceipt(
    input.cohortReceipt,
    'SEALED_INTERPRETATION_COHORT_RECEIPT_INVALID',
  );
  const summaries = records(cohort.rowSummaries);
  if (number(cohort.rowCount) !== input.rows.length || summaries.length !== input.rows.length) {
    fail('SEALED_INTERPRETATION_ROW_COUNT_MISMATCH');
  }
  const reproofs = (input.environmentReproofs ?? []).map(assertEnvironmentReproof);
  const reproofByRow = uniqueBy(reproofs, (entry) => entry.rowId,
    'SEALED_INTERPRETATION_DUPLICATE_REPROOF');
  const summaryByRow = uniqueBy(summaries, (entry) => text(entry.rowId),
    'SEALED_INTERPRETATION_DUPLICATE_SUMMARY');
  const seenRows = new Set<string>();
  const rowInterpretations = input.rows.map((value) => {
    const row = assertRowReceipt(value);
    const rowPlan = record(row.rowPlan);
    const rowId = text(rowPlan.rowId);
    if (!rowId || seenRows.has(rowId)) fail('SEALED_INTERPRETATION_DUPLICATE_ROW');
    seenRows.add(rowId);
    const summary = summaryByRow.get(rowId);
    if (!summary
      || summary.receiptSha256 !== row.receiptSha256
      || summary.caseId !== rowPlan.caseId
      || summary.routeId !== record(rowPlan.route).routeId
      || summary.handoffMode !== rowPlan.handoffMode
      || summary.status !== row.status) {
      fail(`SEALED_INTERPRETATION_ROW_SUMMARY_DRIFT:${rowId}`);
    }
    const reproof = reproofByRow.get(rowId);
    if (reproof && reproof.sourceRowReceiptSha256 !== row.receiptSha256) {
      fail(`SEALED_INTERPRETATION_REPROOF_ROW_DRIFT:${rowId}`);
    }
    const interpreted = classifyRow(row, reproof);
    return deepFreezeV1({
      rowId,
      caseId: rowPlan.caseId,
      routeId: record(rowPlan.route).routeId,
      handoffMode: rowPlan.handoffMode,
      rawStatus: row.status,
      ...interpreted,
      sourceRowReceiptSha256: row.receiptSha256,
      environmentReproofReceiptSha256: reproof?.receiptSha256 ?? null,
    });
  });
  if (seenRows.size !== summaryByRow.size || reproofs.some((entry) => !seenRows.has(entry.rowId))) {
    fail('SEALED_INTERPRETATION_UNBOUND_ROW_OR_REPROOF');
  }
  const evidenceDispositionCounts = countBy(
    rowInterpretations,
    (entry) => text(entry.evidenceDisposition) as SealedHoldoutEvidenceDispositionV2R,
  );
  const material = {
    version: SEALED_HOLDOUT_PAID_COHORT_INTERPRETATION_VERSION_V2R,
    authority: 'FROZEN_INTERPRETATION_NO_PROJECT_AUTHORITY' as const,
    sourceCohortReceiptSha256: text(cohort.receiptSha256),
    rowCount: input.rows.length,
    rawStatusCounts: countBy(input.rows.map(record), (entry) => text(entry.status)),
    evidenceDispositionCounts,
    rowInterpretations,
    environmentReproofSetSha256: hashCanonicalJsonV1(reproofs),
    providerInferenceCalls: number(cohort.providerInferenceCalls),
    providerTurns: number(cohort.providerTurns),
    googleCountTokensCalls: number(cohort.googleCountTokensCalls),
    spentNanoUsd: number(cohort.spentNanoUsd),
    projectReads: 0 as const,
    projectMutations: 0 as const,
    stateEffects: [] as const,
    assessment: 'MODIFY_BENCHMARK_AND_RERUN_TARGETED_ROWS' as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function classifyRow(
  row: Readonly<JsonRecord>,
  reproof?: Readonly<SealedHoldoutEnvironmentReproofReceiptV2R>,
): Readonly<{ evidenceDisposition: SealedHoldoutEvidenceDispositionV2R; reasonCodes: readonly string[] }> {
  if (row.status === 'NOT_EVALUATED_RESOURCE_GUARD') {
    return { evidenceDisposition: 'NOT_EVALUATED_RESOURCE_GUARD', reasonCodes: ['INPUT_TOKEN_BUDGET_EXCEEDED'] };
  }
  if (row.status === 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE') {
    return { evidenceDisposition: 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE', reasonCodes: ['PROVIDER_INFRASTRUCTURE'] };
  }
  const proof = record(row.proof);
  const proofReceipt = record(proof.receipt);
  if (proof.passed === true) {
    return proofReceipt.version === SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R
      ? { evidenceDisposition: 'VALID_SAFE_STOP_PROOF', reasonCodes: ['NO_EDIT_SAFETY_PROVED'] }
      : { evidenceDisposition: 'VALID_EDIT_RENDER_PROOF', reasonCodes: ['CLAIM_PROOF_PASSED'] };
  }
  if (reproof) {
    return {
      evidenceDisposition: 'VALID_EDIT_RENDER_PROOF_AFTER_ENVIRONMENT_REPROOF',
      reasonCodes: ['ORIGINAL_WINDOWS_PATH_LENGTH_FAILURE', 'UNCHANGED_TRACE_REPROVED_LOCALLY'],
    };
  }
  const caseId = text(record(row.rowPlan).caseId);
  const confounds = CONFOUNDED_EXECUTION_CASES[caseId];
  if (confounds) {
    return { evidenceDisposition: 'INVALID_BENCHMARK_CONFOUNDED', reasonCodes: confounds };
  }
  if (row.status === 'FAIL_HIDDEN_EVALUATION') {
    return { evidenceDisposition: 'VALID_MODEL_TRACE_FAILURE', reasonCodes: ['HIDDEN_EVALUATOR_REJECTED_TRACE'] };
  }
  if (isSealedHoldoutEnvironmentReproofCandidateV2R(row)) {
    return { evidenceDisposition: 'REPROOF_REQUIRED_ENVIRONMENT_FAILURE', reasonCodes: ['WINDOWS_PATH_LENGTH_FAILURE'] };
  }
  return { evidenceDisposition: 'UNRESOLVED_CLAIM_PROOF_FAILURE', reasonCodes: ['CLAIM_PROOF_FAILED'] };
}

function assertRowReceipt(value: unknown): Readonly<JsonRecord> {
  return assertHashedReceipt(value, 'SEALED_INTERPRETATION_ROW_RECEIPT_INVALID');
}
function assertEnvironmentReproof(value: unknown): Readonly<SealedHoldoutEnvironmentReproofReceiptV2R> {
  const receipt = assertHashedReceipt(
    value,
    'SEALED_INTERPRETATION_REPROOF_RECEIPT_INVALID',
  );
  if (receipt.version !== SEALED_HOLDOUT_ENVIRONMENT_REPROOF_VERSION_V2R
    || receipt.authority !== 'LOCAL_ENVIRONMENT_REPROOF_NO_INFERENCE_NO_PROJECT_AUTHORITY'
    || number(receipt.projectReads) !== 0
    || number(receipt.projectMutations) !== 0
    || records(receipt.stateEffects).length !== 0) {
    fail('SEALED_INTERPRETATION_REPROOF_CONTRACT_INVALID');
  }
  return receipt as unknown as SealedHoldoutEnvironmentReproofReceiptV2R;
}
function assertHashedReceipt(value: unknown, code: string): Readonly<JsonRecord> {
  const receipt = record(value);
  const { receiptSha256, ...material } = receipt;
  if (!isSha(receiptSha256) || receiptSha256 !== hashCanonicalJsonV1(material)) fail(code);
  return deepFreezeV1(receipt);
}
function uniqueBy<T>(values: readonly T[], key: (value: T) => string, code: string): Map<string, T> {
  const output = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (!id || output.has(id)) fail(code);
    output.set(id, value);
  }
  return output;
}
function countBy<T>(values: readonly T[], key: (value: T) => string): Record<string, number> {
  return Object.fromEntries([...new Set(values.map(key))].sort()
    .map((id) => [id, values.filter((value) => key(value) === id).length]));
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord =>
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : 0; }
function isSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function fail(code: string): never { throw new Error(code); }
