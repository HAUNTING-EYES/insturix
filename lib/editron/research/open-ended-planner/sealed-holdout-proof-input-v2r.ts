import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  evaluateBudgetedSealedHoldoutTraceV2R,
  evaluateBudgetedSealedHoldoutTraceV3R2,
  type BudgetedSealedHoldoutEvaluationReceiptV2R,
  type BudgetedSealedHoldoutEvaluationReceiptV3R2,
} from './sealed-holdout-evaluator-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import {
  assertBudgetedSealedHoldoutSelectedOperationTraceV2R,
  assertBudgetedSealedHoldoutSelectedOperationTraceV3R2,
  type BudgetedSealedHoldoutSelectedOperationTraceV2R,
  type BudgetedSealedHoldoutSelectedOperationTraceV3R2,
} from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

export interface BoundSealedHoldoutProofInputV2R {
  taskId: string;
  publicCaseSha256: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
}

export interface BoundSealedHoldoutProofInputV3R2 {
  taskId: string;
  publicCaseSha256: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2>;
}

export function bindSealedHoldoutProofInputV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  allowedTaskIds: readonly string[];
  allowedAssessments: readonly BudgetedSealedHoldoutEvaluationReceiptV2R['assessment'][];
  allowedExecutionForms: readonly BudgetedSealedHoldoutEvaluationReceiptV2R['executionForm'][];
}): Readonly<BoundSealedHoldoutProofInputV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV2R(input.trace);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase || trace.caseId !== input.caseId) fail('SEALED_PROOF_INPUT_CASE_BINDING_INVALID');
  const taskId = text(record(taskCase.publicCase).taskId);
  if (!input.allowedTaskIds.includes(taskId)) {
    fail(`SEALED_PROOF_INPUT_TASK_UNSUPPORTED:${taskId || 'missing'}`);
  }
  const evaluation = evaluateBudgetedSealedHoldoutTraceV2R({
    manifest,
    caseId: input.caseId,
    trace,
  });
  if (hashCanonicalJsonV1(input.evaluation) !== hashCanonicalJsonV1(evaluation)) {
    fail('SEALED_PROOF_INPUT_EVALUATION_DRIFT');
  }
  if (!input.allowedAssessments.includes(evaluation.assessment)
    || !input.allowedExecutionForms.includes(evaluation.executionForm)
    || trace.runtimeBudgetAssessment !== 'ACCOUNTED_WITHIN_BUDGET'
    || evaluation.runtimeBudgetAssessment !== 'ACCOUNTED_WITHIN_BUDGET'
    || evaluation.runtimeBudgetReceiptSha256 !== trace.runtimeBudgetReceiptSha256
    || trace.stateEffects.length
    || evaluation.stateEffects.length) {
    fail('SEALED_PROOF_INPUT_PRECONDITION_FAILED');
  }
  return deepFreezeV1({
    taskId,
    publicCaseSha256: taskCase.publicCaseSha256,
    trace,
    evaluation,
  });
}

export function bindSealedHoldoutProofInputV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2>;
  allowedTaskIds: readonly string[];
  allowedAssessments: readonly BudgetedSealedHoldoutEvaluationReceiptV3R2['assessment'][];
  allowedExecutionForms: readonly BudgetedSealedHoldoutEvaluationReceiptV3R2[
    'executionForm'
  ][];
}): Readonly<BoundSealedHoldoutProofInputV3R2> {
  const manifest = assertSealedHoldoutCohortManifestV3R2(input.manifest);
  const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV3R2(input.trace);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase || trace.caseId !== input.caseId) {
    fail('SEALED_V3R2_PROOF_INPUT_CASE_BINDING_INVALID');
  }
  const taskId = text(record(taskCase.publicCase).taskId);
  if (!input.allowedTaskIds.includes(taskId)) {
    fail(`SEALED_V3R2_PROOF_INPUT_TASK_UNSUPPORTED:${taskId || 'missing'}`);
  }
  const evaluation = evaluateBudgetedSealedHoldoutTraceV3R2({
    manifest,
    caseId: input.caseId,
    trace,
  });
  if (hashCanonicalJsonV1(input.evaluation) !== hashCanonicalJsonV1(evaluation)) {
    fail('SEALED_V3R2_PROOF_INPUT_EVALUATION_DRIFT');
  }
  if (!input.allowedAssessments.includes(evaluation.assessment)
    || !input.allowedExecutionForms.includes(evaluation.executionForm)
    || trace.runtimeBudgetAssessment !== 'ACCOUNTED_WITHIN_BUDGET'
    || evaluation.runtimeBudgetAssessment !== 'ACCOUNTED_WITHIN_BUDGET'
    || evaluation.runtimeBudgetReceiptSha256 !== trace.runtimeBudgetReceiptSha256
    || trace.stateEffects.length
    || evaluation.stateEffects.length) {
    fail('SEALED_V3R2_PROOF_INPUT_PRECONDITION_FAILED');
  }
  return deepFreezeV1({
    taskId,
    publicCaseSha256: taskCase.publicCaseSha256,
    trace,
    evaluation,
  });
}

function fail(code: string): never { throw new Error(code); }
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
