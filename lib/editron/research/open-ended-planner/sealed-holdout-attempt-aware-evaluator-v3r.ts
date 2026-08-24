import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { SealedHoldoutCohortManifestV2R } from './sealed-holdout-cohort-v2r';
import {
  evaluateBudgetedSealedHoldoutTraceV2R,
  type BudgetedSealedHoldoutEvaluationReceiptV2R,
} from './sealed-holdout-evaluator-v2r';
import type {
  BudgetedSealedHoldoutSelectedOperationTraceV2R,
  SealedHoldoutTraceNodeV2R,
} from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

export const BUDGETED_SEALED_HOLDOUT_ATTEMPT_AWARE_EVALUATOR_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_HIDDEN_PREPROOF_EVALUATOR_V3R_3_H07_ATTEMPT_ELIGIBILITY_1' as const;

/**
 * This policy deliberately does not treat every rejected mutation as model failure.
 * It binds HOLD-07's no-mutation rule to public case fields: the expected project
 * revision and the declared PROJECT_REVISION evidence that the model can resolve.
 * A later CAS conflict remains legal when a prior owner read established that the
 * attempted revision was current at planning time.
 */
export const SEALED_HOLDOUT_ATTEMPT_ELIGIBILITY_POLICY_V3R = deepFreezeV1({
  version: 'EDITRON_OE_SEALED_HOLDOUT_ATTEMPT_ELIGIBILITY_POLICY_V3R_1' as const,
  authority: 'DECLARATIVE_PRECONDITION_POLICY_BOUND_TO_PUBLIC_CASE_FIELDS' as const,
  rules: [{
    taskId: 'HOLD-07',
    guardedOperatorKinds: ['MUTATION', 'MUTATION_LEGACY', 'GENERATED_COMPOSITION'],
    requiredPriorOperatorKinds: ['READ', 'RESOLVER'],
    expectedRevisionPath: 'publicCase.project.expectedProjectRevision',
    revisionEvidenceDeclaration:
      'publicCase.evidenceAvailability[kind=PROJECT_REVISION]',
    precondition:
      'Before an edit attempt, owner-resolved PROJECT_REVISION evidence must establish a known current revision equal to the expected project revision.',
    conflictFairness:
      'An edit attempt is diagnostic when this precondition was unresolved, stale, or unknown before the attempt, regardless of whether the owner blocked it; an eligible optimistic-CAS conflict is not diagnostic.',
  }],
  unguardedOperatorKinds: ['READ', 'RESOLVER'],
});

const ATTEMPT_ELIGIBILITY_POLICY_SHA256 = hashCanonicalJsonV1(
  SEALED_HOLDOUT_ATTEMPT_ELIGIBILITY_POLICY_V3R,
);

export type BudgetedSealedHoldoutAttemptAwareEvaluationReceiptV3R = Readonly<
  Omit<BudgetedSealedHoldoutEvaluationReceiptV2R,
  'version' | 'evaluatorPolicySha256' | 'assessment' | 'diagnostics'
  | 'proofRequired' | 'receiptSha256'> & {
    version: typeof BUDGETED_SEALED_HOLDOUT_ATTEMPT_AWARE_EVALUATOR_VERSION_V3R;
    evaluatorPolicySha256: string;
    assessment: BudgetedSealedHoldoutEvaluationReceiptV2R['assessment'];
    diagnostics: readonly string[];
    proofRequired: boolean;
    baseEvaluationReceiptSha256: string;
    attemptEligibilityPolicySha256: string;
    receiptSha256: string;
  }
>;

export function evaluateBudgetedSealedHoldoutTraceAttemptAwareV3R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: string;
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
}): Readonly<BudgetedSealedHoldoutAttemptAwareEvaluationReceiptV3R> {
  // Reuse the immutable V2R evaluator as the historical base receipt. This
  // wrapper adds a new identity instead of rewriting replay semantics.
  const base = evaluateBudgetedSealedHoldoutTraceV2R(input);
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId);
  if (!taskCase) throw new Error(`ATTEMPT_AWARE_EVALUATOR_CASE_MISSING:${input.caseId}`);

  const evaluationUnavailable = base.assessment === 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE'
    || base.assessment === 'NOT_EVALUATED_RESOURCE_GUARD';
  const attemptDiagnostics = evaluationUnavailable
    ? []
    : hold07AttemptEligibilityDiagnostics(taskCase.publicCase, taskCase.ownerOnly, input.trace);
  const diagnostics = [...new Set([...base.diagnostics, ...attemptDiagnostics])]
    .sort(compareUtf16);
  const assessment = attemptDiagnostics.length > 0
    ? 'FAIL' as const
    : base.assessment;
  const { receiptSha256: baseEvaluationReceiptSha256, ...baseMaterial } = base;
  const evaluatorPolicySha256 = hashCanonicalJsonV1({
    baseEvaluatorPolicySha256: base.evaluatorPolicySha256,
    attemptEligibilityPolicySha256: ATTEMPT_ELIGIBILITY_POLICY_SHA256,
  });
  const material = {
    ...baseMaterial,
    version: BUDGETED_SEALED_HOLDOUT_ATTEMPT_AWARE_EVALUATOR_VERSION_V3R,
    evaluatorPolicySha256,
    assessment,
    diagnostics,
    proofRequired: assessment === 'READY_FOR_PROOF',
    baseEvaluationReceiptSha256,
    attemptEligibilityPolicySha256: ATTEMPT_ELIGIBILITY_POLICY_SHA256,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function hold07AttemptEligibilityDiagnostics(
  publicCaseValue: Readonly<JsonRecord>,
  ownerOnlyValue: Readonly<JsonRecord>,
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>,
): string[] {
  const publicCase = record(publicCaseValue);
  if (text(publicCase.taskId) !== 'HOLD-07') return [];

  const project = record(publicCase.project);
  const expectedRevision = text(project.expectedProjectRevision);
  const revisionDeclaration = records(publicCase.evidenceAvailability)
    .find(({ kind }) => text(kind) === 'PROJECT_REVISION');
  if (!expectedRevision || !revisionDeclaration) {
    return ['EVAL_H07_EDIT_ATTEMPT_PRECONDITION_DECLARATION_MISSING'];
  }

  const evidenceRef = text(revisionDeclaration.evidenceRef);
  const ownerEvidence = records(record(ownerOnlyValue).evidence)
    .find((evidence) => text(evidence.evidenceRef) === evidenceRef);
  const currentRevision = text(record(ownerEvidence?.value).currentRevision);
  const guardedKinds = new Set(['MUTATION', 'MUTATION_LEGACY', 'GENERATED_COMPOSITION']);
  const resolverKinds = new Set(['READ', 'RESOLVER']);
  const diagnostics: string[] = [];

  for (const node of trace.nodes) {
    if (!guardedKinds.has(node.operatorKind)) continue;
    const priorResolution = trace.nodes.some((candidate) =>
      candidate.turn < node.turn
      && resolverKinds.has(candidate.operatorKind)
      && candidate.executionEvidenceRefs.includes(evidenceRef));
    const reason = !priorResolution
      ? 'PROJECT_REVISION_UNRESOLVED'
      : !currentRevision || currentRevision === 'UNKNOWN'
        ? 'PROJECT_REVISION_UNKNOWN'
        : currentRevision !== expectedRevision
          ? 'PROJECT_REVISION_STALE'
          : null;
    if (reason) diagnostics.push(attemptDiagnostic(reason, node));
  }
  return diagnostics;
}

function attemptDiagnostic(reason: string, node: Readonly<SealedHoldoutTraceNodeV2R>): string {
  return `EVAL_H07_INELIGIBLE_EDIT_ATTEMPT:${reason}:${node.selectedOperatorId}:TURN_${node.turn}:${node.executionDisposition}`;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
