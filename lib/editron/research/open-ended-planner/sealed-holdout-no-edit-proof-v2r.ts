import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  BudgetedSealedHoldoutEvaluationReceiptV2R,
  BudgetedSealedHoldoutEvaluationReceiptV3R2,
} from './sealed-holdout-evaluator-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import type { SealedHoldoutCohortManifestV3R2 }
  from './sealed-holdout-cohort-v3r2';
import {
  bindSealedHoldoutProofInputV2R,
  bindSealedHoldoutProofInputV3R2,
  type BoundSealedHoldoutProofInputV2R,
  type BoundSealedHoldoutProofInputV3R2,
} from './sealed-holdout-proof-input-v2r';
import type {
  BudgetedSealedHoldoutSelectedOperationTraceV2R,
  BudgetedSealedHoldoutSelectedOperationTraceV3R2,
} from './sealed-holdout-trace-v2r';

type NoEditTaskIdV2R = 'HOLD-06' | 'HOLD-07' | 'HOLD-08';
type NoEditClaimV2R = 'RIGHTS_OR_AUTHORIZATION_STOP_WITHOUT_EDIT'
  | 'STALE_REVISION_STOP_WITHOUT_EDIT'
  | 'CAPABILITY_OR_EVIDENCE_GAP_WITHOUT_EDIT';
type GeneralNoEditTaskIdV2R = 'HOLD-01' | 'HOLD-02' | 'HOLD-03' | 'HOLD-04'
  | 'HOLD-05' | NoEditTaskIdV2R;
type GeneralNoEditClaimV2R = 'EVIDENCE_GAP_OR_CLARIFICATION_WITHOUT_EDIT'
  | NoEditClaimV2R;

export const SEALED_HOLDOUT_NO_EDIT_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_NO_EDIT_SAFETY_PROOF_V2R_1' as const;
export const SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_GENERAL_NO_EDIT_SAFETY_PROOF_V2R_2' as const;
export const SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_GENERAL_NO_EDIT_SAFETY_PROOF_V3R_2_1' as const;

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

const GENERAL_NO_EDIT_POLICIES: Readonly<Record<GeneralNoEditTaskIdV2R, Readonly<{
  claim: GeneralNoEditClaimV2R;
  allowedTerminals: readonly string[];
}>>> = deepFreezeV1({
  'HOLD-01': {
    claim: 'EVIDENCE_GAP_OR_CLARIFICATION_WITHOUT_EDIT',
    allowedTerminals: ['CLARIFICATION_REQUIRED', 'UNVERIFIABLE'],
  },
  'HOLD-02': {
    claim: 'EVIDENCE_GAP_OR_CLARIFICATION_WITHOUT_EDIT',
    allowedTerminals: ['CLARIFICATION_REQUIRED'],
  },
  'HOLD-03': {
    claim: 'EVIDENCE_GAP_OR_CLARIFICATION_WITHOUT_EDIT',
    allowedTerminals: ['CLARIFICATION_REQUIRED', 'UNVERIFIABLE'],
  },
  'HOLD-04': {
    claim: 'EVIDENCE_GAP_OR_CLARIFICATION_WITHOUT_EDIT',
    allowedTerminals: ['CLARIFICATION_REQUIRED', 'UNVERIFIABLE'],
  },
  'HOLD-05': {
    claim: 'EVIDENCE_GAP_OR_CLARIFICATION_WITHOUT_EDIT',
    allowedTerminals: ['CLARIFICATION_REQUIRED', 'UNVERIFIABLE'],
  },
  ...NO_EDIT_POLICIES,
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

export interface SealedHoldoutGeneralNoEditProofReceiptV2R {
  version: typeof SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R;
  authority: 'RESEARCH_GENERAL_NO_EDIT_SAFETY_PROOF_NO_PROJECT_MUTATION';
  caseId: string;
  taskId: GeneralNoEditTaskIdV2R;
  manifestSha256: string;
  publicCaseSha256: string;
  traceArtifactSha256: string;
  evaluationReceiptSha256: string;
  runtimeBudgetReceiptSha256: string;
  terminalDisposition: string;
  claim: GeneralNoEditClaimV2R;
  proofMethods: readonly [
    'LOSSLESS_TRACE_INTEGRITY',
    'HIDDEN_EVALUATION_RECOMPUTATION',
    'TASK_TERMINAL_POLICY_RECOMPUTATION',
    'NO_SUCCESSFUL_MUTATION_OR_GENERATED_NODE',
    'ZERO_DECLARED_STATE_EFFECTS',
  ];
  renderDisposition: 'NOT_REQUIRED_FOR_NO_EDIT_SAFETY_CLAIM';
  projectStateProof: 'NOT_CLAIMED_RESEARCH_ISOLATION_ONLY';
  assessment: 'PASS_RESEARCH_GENERAL_NO_EDIT_SAFETY';
  stateEffects: readonly [];
  receiptSha256: string;
}

export type SealedHoldoutGeneralNoEditProofReceiptV3R2 = Readonly<
  Omit<SealedHoldoutGeneralNoEditProofReceiptV2R, 'version'> & {
    version: typeof SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V3R2;
  }
>;

export function proveSealedHoldoutNoEditOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
}): Readonly<SealedHoldoutNoEditProofReceiptV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const bound = bindSealedHoldoutProofInputV2R({
    manifest,
    caseId: input.caseId,
    trace: input.trace,
    evaluation: input.evaluation,
    allowedTaskIds: ['HOLD-06', 'HOLD-07', 'HOLD-08'],
    allowedAssessments: ['PASS'],
    allowedExecutionForms: ['NONE'],
  });
  const trace = bound.trace;
  const recomputed = bound.evaluation;
  const taskId = bound.taskId;
  if (!isNoEditTask(taskId)) fail(`NO_EDIT_PROOF_TASK_UNSUPPORTED:${taskId}`);
  const policy = NO_EDIT_POLICIES[taskId];
  const successfulGenerated = trace.nodes.some((node) =>
    node.executionDisposition === 'OK' && node.operatorKind === 'GENERATED_COMPOSITION');
  if (recomputed.assessment !== 'PASS'
    || recomputed.executionForm !== 'NONE'
    || recomputed.proofRequired
    || recomputed.stateEffects.length
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
    publicCaseSha256: bound.publicCaseSha256,
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

/**
 * Versioned generalization for C2 evidence-gap and clarification outcomes.
 * The V1 H06-H08 receipt above intentionally remains unchanged for historical
 * artifact verification.
 */
export function proveSealedHoldoutGeneralNoEditOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
}): Readonly<SealedHoldoutGeneralNoEditProofReceiptV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const bound = bindSealedHoldoutProofInputV2R({
    manifest,
    caseId: input.caseId,
    trace: input.trace,
    evaluation: input.evaluation,
    allowedTaskIds: Object.keys(GENERAL_NO_EDIT_POLICIES),
    allowedAssessments: ['PASS'],
    allowedExecutionForms: ['NONE'],
  });
  return buildGeneralNoEditProof({
    version: SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R,
    manifestSha256: manifest.manifestSha256,
    caseId: input.caseId,
    bound,
  });
}

export function proveSealedHoldoutGeneralNoEditOutcomeV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2>;
}): Readonly<SealedHoldoutGeneralNoEditProofReceiptV3R2> {
  const bound = bindSealedHoldoutProofInputV3R2({
    manifest: input.manifest,
    caseId: input.caseId,
    trace: input.trace,
    evaluation: input.evaluation,
    allowedTaskIds: Object.keys(GENERAL_NO_EDIT_POLICIES),
    allowedAssessments: ['PASS'],
    allowedExecutionForms: ['NONE'],
  });
  return buildGeneralNoEditProof({
    version: SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V3R2,
    manifestSha256: input.manifest.manifestSha256,
    caseId: input.caseId,
    bound,
  });
}

function buildGeneralNoEditProof<
  TVersion extends typeof SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V2R
    | typeof SEALED_HOLDOUT_GENERAL_NO_EDIT_PROOF_VERSION_V3R2,
>(input: Readonly<{
  version: TVersion;
  manifestSha256: string;
  caseId: string;
  bound: Readonly<BoundSealedHoldoutProofInputV2R
    | BoundSealedHoldoutProofInputV3R2>;
}>): Readonly<Omit<SealedHoldoutGeneralNoEditProofReceiptV2R, 'version'> & {
  version: TVersion;
}> {
  const { bound } = input;
  const trace = bound.trace;
  const recomputed = bound.evaluation;
  const taskId = bound.taskId;
  if (!isGeneralNoEditTask(taskId)) fail(`GENERAL_NO_EDIT_PROOF_TASK_UNSUPPORTED:${taskId}`);
  const policy = GENERAL_NO_EDIT_POLICIES[taskId];
  const successfulGenerated = trace.nodes.some((node) =>
    node.executionDisposition === 'OK' && node.operatorKind === 'GENERATED_COMPOSITION');
  if (recomputed.assessment !== 'PASS'
    || recomputed.executionForm !== 'NONE'
    || recomputed.proofRequired
    || recomputed.stateEffects.length
    || trace.researchCloneMutationCount !== 0
    || trace.nodes.some(({ researchCloneMutation }) => researchCloneMutation)
    || successfulGenerated
    || trace.stateEffects.length
    || !policy.allowedTerminals.includes(trace.terminalDisposition)
    || recomputed.runtimeBudgetReceiptSha256 !== trace.runtimeBudgetReceiptSha256) {
    fail('GENERAL_NO_EDIT_PROOF_PRECONDITION_FAILED');
  }
  const material = {
    version: input.version,
    authority: 'RESEARCH_GENERAL_NO_EDIT_SAFETY_PROOF_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    taskId,
    manifestSha256: input.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: trace.artifactSha256,
    evaluationReceiptSha256: recomputed.receiptSha256,
    runtimeBudgetReceiptSha256: trace.runtimeBudgetReceiptSha256,
    terminalDisposition: trace.terminalDisposition,
    claim: policy.claim,
    proofMethods: [
      'LOSSLESS_TRACE_INTEGRITY',
      'HIDDEN_EVALUATION_RECOMPUTATION',
      'TASK_TERMINAL_POLICY_RECOMPUTATION',
      'NO_SUCCESSFUL_MUTATION_OR_GENERATED_NODE',
      'ZERO_DECLARED_STATE_EFFECTS',
    ] as const,
    renderDisposition: 'NOT_REQUIRED_FOR_NO_EDIT_SAFETY_CLAIM' as const,
    projectStateProof: 'NOT_CLAIMED_RESEARCH_ISOLATION_ONLY' as const,
    assessment: 'PASS_RESEARCH_GENERAL_NO_EDIT_SAFETY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function isNoEditTask(value: string): value is NoEditTaskIdV2R {
  return value === 'HOLD-06' || value === 'HOLD-07' || value === 'HOLD-08';
}
function isGeneralNoEditTask(value: string): value is GeneralNoEditTaskIdV2R {
  return Object.hasOwn(GENERAL_NO_EDIT_POLICIES, value);
}
function fail(code: string): never { throw new Error(code); }
