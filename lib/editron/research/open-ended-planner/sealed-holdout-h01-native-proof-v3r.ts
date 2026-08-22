import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import {
  type BudgetedSealedHoldoutEvaluationReceiptV3R2,
  evaluateSealedHoldoutTraceV3R,
  type SealedHoldoutEvaluationReceiptV3R,
} from './sealed-holdout-evaluator-v2r';
import {
  assertSealedHoldoutCohortManifestV3R,
  type SealedHoldoutCohortManifestV3R,
} from './sealed-holdout-cohort-v3r';
import type { SealedHoldoutCohortManifestV3R2 }
  from './sealed-holdout-cohort-v3r2';
import {
  executeSealedHoldoutH01NativeProofMechanicsV2R,
  type SealedHoldoutH01NativeProofMechanicsV2R,
} from './sealed-holdout-h01-native-proof-v2r';
import { bindSealedHoldoutProofInputV3R2 }
  from './sealed-holdout-proof-input-v2r';
import {
  assertSealedHoldoutSelectedOperationTraceV3R,
  type BudgetedSealedHoldoutSelectedOperationTraceV3R2,
  type SealedHoldoutSelectedOperationTraceV3R,
} from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_H01_RENDERED_NATIVE_PROOF_V3R_1' as const;
export const SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_H01_RENDERED_NATIVE_PROOF_V3R_2_RESOURCE_BOUND_1' as const;

export interface SealedHoldoutH01NativeProofReceiptV3R
  extends SealedHoldoutH01NativeProofMechanicsV2R {
  version: typeof SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V3R;
  authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION_NO_RESOURCE_BUDGET_CLAIM';
  caseId: 'HOLD-01:C1';
  taskId: 'HOLD-01';
  manifestSha256: string;
  publicCaseSha256: string;
  traceArtifactSha256: string;
  evaluationReceiptSha256: string;
  resourceBudgetProof: 'NOT_CLAIMED';
  assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY';
  productProjectMutationProof: 'NOT_CLAIMED';
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface SealedHoldoutH01NativeProofReceiptV3R2
  extends SealedHoldoutH01NativeProofMechanicsV2R {
  version: typeof SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V3R2;
  authority: 'RESEARCH_RENDERED_NATIVE_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION';
  caseId: 'HOLD-01:C1';
  taskId: 'HOLD-01';
  manifestSha256: string;
  publicCaseSha256: string;
  traceArtifactSha256: string;
  evaluationReceiptSha256: string;
  runtimeBudgetReceiptSha256: string;
  resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET';
  assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY';
  productProjectMutationProof: 'NOT_CLAIMED';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function proveSealedHoldoutH01NativeOutcomeV3R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R>;
  caseId: 'HOLD-01:C1';
  trace: Readonly<SealedHoldoutSelectedOperationTraceV3R>;
  evaluation: Readonly<SealedHoldoutEvaluationReceiptV3R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
  ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH01NativeProofReceiptV3R>> {
  const manifest = assertSealedHoldoutCohortManifestV3R(input.manifest);
  const trace = assertSealedHoldoutSelectedOperationTraceV3R(input.trace);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase || trace.caseId !== input.caseId) fail('SEALED_V3_H01_PROOF_CASE_BINDING_INVALID');
  const publicCase = record(taskCase.publicCase);
  if (publicCase.taskId !== 'HOLD-01') fail('SEALED_V3_H01_PROOF_TASK_BINDING_INVALID');
  const evaluation = evaluateSealedHoldoutTraceV3R({
    manifest,
    caseId: input.caseId,
    trace,
  });
  if (hashCanonicalJsonV1(input.evaluation) !== hashCanonicalJsonV1(evaluation)) {
    fail('SEALED_V3_H01_PROOF_EVALUATION_DRIFT');
  }
  if (evaluation.assessment !== 'READY_FOR_PROOF'
    || evaluation.executionForm !== 'NATIVE'
    || trace.stateEffects.length
    || evaluation.stateEffects.length) {
    fail('SEALED_V3_H01_PROOF_PRECONDITION_FAILED');
  }
  const mechanics = await executeSealedHoldoutH01NativeProofMechanicsV2R({
    traceNodes: trace.nodes,
    publicCase,
    mediaManifest: input.mediaManifest,
    outputDirectory: input.outputDirectory,
    ffprobePath: input.ffprobePath,
    eligibleIncomingStartWindow: [30, 37],
  });
  const material = {
    version: SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V3R,
    authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION_NO_RESOURCE_BUDGET_CLAIM' as const,
    caseId: input.caseId,
    taskId: 'HOLD-01' as const,
    manifestSha256: manifest.manifestSha256,
    publicCaseSha256: taskCase.publicCaseSha256,
    traceArtifactSha256: trace.artifactSha256,
    evaluationReceiptSha256: evaluation.receiptSha256,
    resourceBudgetProof: 'NOT_CLAIMED' as const,
    ...mechanics,
    assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export async function proveSealedHoldoutH01NativeOutcomeV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-01:C1';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
  ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH01NativeProofReceiptV3R2>> {
  const bound = bindSealedHoldoutProofInputV3R2({
    manifest: input.manifest,
    caseId: input.caseId,
    trace: input.trace,
    evaluation: input.evaluation,
    allowedTaskIds: ['HOLD-01'],
    allowedAssessments: ['READY_FOR_PROOF'],
    allowedExecutionForms: ['NATIVE'],
  });
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId)
    ?? fail('SEALED_V3R2_H01_PROOF_CASE_BINDING_INVALID');
  const publicCase = record(taskCase.publicCase);
  const mechanics = await executeSealedHoldoutH01NativeProofMechanicsV2R({
    traceNodes: bound.trace.nodes,
    publicCase,
    mediaManifest: input.mediaManifest,
    outputDirectory: input.outputDirectory,
    ffprobePath: input.ffprobePath,
    eligibleIncomingStartWindow: [30, 37],
  });
  const material = {
    version: SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V3R2,
    authority: 'RESEARCH_RENDERED_NATIVE_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    taskId: 'HOLD-01' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET' as const,
    ...mechanics,
    assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function fail(code: string): never { throw new Error(code); }
