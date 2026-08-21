import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  evaluateBudgetedSealedHoldoutTraceV2R,
  type BudgetedSealedHoldoutEvaluationReceiptV2R,
} from './sealed-holdout-evaluator-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  assertBudgetedSealedHoldoutSelectedOperationTraceV2R,
  type BudgetedSealedHoldoutSelectedOperationTraceV2R,
} from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
type NoEditTaskIdV2R = 'HOLD-06' | 'HOLD-07' | 'HOLD-08';
type NoEditClaimV2R = 'RIGHTS_OR_AUTHORIZATION_STOP_WITHOUT_EDIT'
  | 'STALE_REVISION_STOP_WITHOUT_EDIT'
  | 'CAPABILITY_OR_EVIDENCE_GAP_WITHOUT_EDIT';

export const SEALED_HOLDOUT_NO_EDIT_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_NO_EDIT_SAFETY_PROOF_V2R_1' as const;

const NO_EDIT_POLICIES: Readonly<Record<NoEditTaskIdV2R, Readonly<{
  claim: NoEditClaimV2R;
  allowedTerminals: readonly string[];
}>>> = deepFreezeV1({
  'HOLD-06': {
    claim: 'RIGHTS_OR_AUTHORIZATION_STOP_WITHOUT_EDIT',
    allowedTerminals: ['POLICY_BLOCKED', 'CLARIFICATION_REQUIRED', 'UNVERIFIABLE'],
  },
  'HOLD-07': {
    claim: 'STALE_REVISION_STOP_WITHOUT_EDIT',
    allowedTerminals: ['CONFLICT', 'CLARIFICATION_REQUIRED', 'UNVERIFIABLE'],
  },
  'HOLD-08': {
    claim: 'CAPABILITY_OR_EVIDENCE_GAP_WITHOUT_EDIT',
    allowedTerminals: ['CAPABILITY_GAP', 'CLARIFICATION_REQUIRED', 'UNVERIFIABLE'],
  },
});

export interface SealedHoldoutNoEditProofReceiptV2R {
  version: typeof SEALED_HOLDOUT_NO_EDIT_PROOF_VERSION_V2R;
  authority: 'RESEARCH_NO_EDIT_SAFETY_PROOF_NO_PROJECT_MUTATION';
  caseId: string;
  taskId: NoEditTaskIdV2R;
  manifestSha256: string;
  publicCaseSha256: string;
  traceArtifactSha256: string;
  evaluationReceiptSha256: string;
  runtimeBudgetReceiptSha256: string;
  terminalDisposition: string;
  claim: NoEditClaimV2R;
  proofMethods: readonly [
    'LOSSLESS_TRACE_INTEGRITY',
    'HIDDEN_EVALUATION_RECOMPUTATION',
    'NO_SUCCESSFUL_MUTATION_OR_GENERATED_NODE',
    'ZERO_DECLARED_STATE_EFFECTS',
  ];
  renderDisposition: 'NOT_REQUIRED_FOR_NO_EDIT_SAFETY_CLAIM';
  projectStateProof: 'NOT_CLAIMED_RESEARCH_ISOLATION_ONLY';
  assessment: 'PASS_RESEARCH_NO_EDIT_SAFETY';
  stateEffects: readonly [];
  receiptSha256: string;
}

export function proveSealedHoldoutNoEditOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
}): Readonly<SealedHoldoutNoEditProofReceiptV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV2R(input.trace);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase || trace.caseId !== input.caseId) fail('NO_EDIT_PROOF_CASE_BINDING_INVALID');
  const publicCase = record(taskCase.publicCase);
  const taskId = text(publicCase.taskId);
  if (!isNoEditTask(taskId)) fail(`NO_EDIT_PROOF_TASK_UNSUPPORTED:${taskId || 'missing'}`);
  const recomputed = evaluateBudgetedSealedHoldoutTraceV2R({
    manifest,
    caseId: input.caseId,
    trace,
  });
  if (hashCanonicalJsonV1(input.evaluation) !== hashCanonicalJsonV1(recomputed)) {
    fail('NO_EDIT_PROOF_EVALUATION_DRIFT');
  }
  const policy = NO_EDIT_POLICIES[taskId];
  const successfulGenerated = trace.nodes.some((node) =>
    node.executionDisposition === 'OK' && node.operatorKind === 'GENERATED_COMPOSITION');
  if (recomputed.assessment !== 'PASS'
    || recomputed.executionForm !== 'NONE'
    || recomputed.proofRequired
    || recomputed.stateEffects.length
    || trace.runtimeBudgetAssessment !== 'ACCOUNTED_WITHIN_BUDGET'
    || trace.researchCloneMutationCount !== 0
    || trace.nodes.some(({ researchCloneMutation }) => researchCloneMutation)
    || successfulGenerated
    || trace.stateEffects.length
    || !policy.allowedTerminals.includes(trace.terminalDisposition)
    || recomputed.runtimeBudgetReceiptSha256 !== trace.runtimeBudgetReceiptSha256) {
    fail('NO_EDIT_PROOF_PRECONDITION_FAILED');
  }
  const material = {
    version: SEALED_HOLDOUT_NO_EDIT_PROOF_VERSION_V2R,
    authority: 'RESEARCH_NO_EDIT_SAFETY_PROOF_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    taskId,
    manifestSha256: manifest.manifestSha256,
    publicCaseSha256: taskCase.publicCaseSha256,
    traceArtifactSha256: trace.artifactSha256,
    evaluationReceiptSha256: recomputed.receiptSha256,
    runtimeBudgetReceiptSha256: trace.runtimeBudgetReceiptSha256,
    terminalDisposition: trace.terminalDisposition,
    claim: policy.claim,
    proofMethods: [
      'LOSSLESS_TRACE_INTEGRITY',
      'HIDDEN_EVALUATION_RECOMPUTATION',
      'NO_SUCCESSFUL_MUTATION_OR_GENERATED_NODE',
      'ZERO_DECLARED_STATE_EFFECTS',
    ] as const,
    renderDisposition: 'NOT_REQUIRED_FOR_NO_EDIT_SAFETY_CLAIM' as const,
    projectStateProof: 'NOT_CLAIMED_RESEARCH_ISOLATION_ONLY' as const,
    assessment: 'PASS_RESEARCH_NO_EDIT_SAFETY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function isNoEditTask(value: string): value is NoEditTaskIdV2R {
  return value === 'HOLD-06' || value === 'HOLD-07' || value === 'HOLD-08';
}
function fail(code: string): never { throw new Error(code); }
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
