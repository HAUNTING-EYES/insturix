import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1 }
  from './stage25-final-generalisation-paid-audit-v1';

export const STAGE25_FROZEN_DECISION_VERSION_V1 =
  'EDITRON_OE_STAGE25_FROZEN_DECISION_V1' as const;

export const STAGE25_FROZEN_DECISION_OWNER_TEST_FILES_V1 = [
  'tests/editron/stage25-long-form-product-evidence-v1.test.ts',
  'tests/editron/stage25-human-quality-evidence-v1.test.ts',
  'tests/editron/stage25-frozen-decision-v1.test.ts',
] as const;

export const STAGE25_FROZEN_DECISION_EVIDENCE_V1 = [
  accepted('HREF01_REFERENCE_REVIEW', 'f699348094d84079765115556b9b9746ef6a51eccdc79ff7fddecf49ee992d88', 'PASS_SINGLE_REVIEWER_NO_PRODUCTION_PROMOTION'),
  accepted('FINAL_PAID_COHORT_AUDIT', STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1.auditSha256, 'AUDITED_7_STRUCTURAL_9_SAFE_STOP_2_FAILURE_5_CONFOUNDED_1_PROVIDER_NON_EVALUATION'),
  accepted('CORRECTED_ZERO_INFERENCE_GATE', '19c7d43214e769e59a0e524761857b59b1c95444c85f8511bbe2622d7c182d72', 'READY_FOR_EXPLICIT_CAPPED_AUTHORIZATION_NOT_INFERENCE'),
  accepted('RHC01_TECHNICAL_RENDER', '312a112ffda3cdd63fb815bf9876d562ae82f8ede99a6753b2dd61c713e5cadb', 'THREE_RENDERED_RESEARCH_PREVIEWS_UNJUDGED'),
  accepted('RHC02_TECHNICAL_RENDER', 'e0cb167f3faaf2fed05a174cd4884079e05db72b6ce011c75b929370dafa2a98', 'PASS_TECHNICAL_RENDERED_HYBRID_UNJUDGED'),
  accepted('RHC03_TECHNICAL_RENDER', '29883e01bbc1be34803b67d1f2e8eb2af8c08e9c837c9ea6d778c94a80031f32', 'PASS_TECHNICAL_RENDERED_HYBRID_UNJUDGED'),
  accepted('RHC04_TECHNICAL_RENDER', '17e102ae2af9eb8350a704e775de9734f0881bc010c0354996bbda5da322ab0e', 'PASS_TECHNICAL_RENDERED_GENERATED_CORRECTION_UNJUDGED'),
  accepted('PROJECTSERVICE_CONFLICT_LOCK_REBASE', 'b06476798a3f4b46969e1aeae7761e44a47de84575561fdb2604b237ed4e0c8f', 'PASS_BOUNDED_REAL_MONGODB_PROJECTSERVICE_CONFLICT_LOCK_REBASE'),
  accepted('RESUME_ZERO_SPEND_GATE', 'c9ad7fb075edb879f7b3874ceda149de655707ad59be12b038738d796a0d169a', 'PASS_ZERO_SPEND_EXECUTABLE_RESUME_GATE_PAID_NOT_AUTHORIZED'),
  accepted('LONG_FORM_PRODUCT_EVIDENCE', 'eaf5db558f4c6962563e92a4399a12cfd4cbcc68bd1627864bb55829cd146e83', 'MODIFY_LONG_FORM_PRODUCT_EVIDENCE_INCOMPLETE'),
  accepted('HUMAN_QUALITY_EVIDENCE', 'd50fc077f2c20abc16d57877e18fcabc3de79a58e299a0c5f572f2b180de426a', 'MODIFY_HUMAN_QUALITY_CORRECTION_EVIDENCE_INCOMPLETE'),
] as const;
export type Stage25FrozenDecisionEvidenceIdV1 = typeof STAGE25_FROZEN_DECISION_EVIDENCE_V1[number]['evidenceId'];

export interface Stage25FrozenDecisionEvidenceBindingV1 {
  evidenceId: Stage25FrozenDecisionEvidenceIdV1;
  canonicalSha256: string;
  fileSha256: string;
  disposition: string;
}

export interface Stage25FrozenDecisionInputV1 {
  source: Readonly<{
    commitSha: string;
    treeSha: string;
    relevantScopeSha256: string;
    relevantTrackedFileCount: number;
    relevantStatusEntries: readonly string[];
  }>;
  generatedAt: string;
  ownerTests: Readonly<{
    reportSha256: string;
    testFiles: readonly string[];
    passedTestCount: number;
    failedTestCount: number;
  }>;
  evidence: readonly Stage25FrozenDecisionEvidenceBindingV1[];
  successorWholeEpisode: Readonly<{
    disposition: 'NOT_RUN_NOT_AUTHORIZED_AND_NOT_DECISION_CRITICAL';
    providerInferenceCalls: 0;
    providerSpendUsd: 0;
  }>;
}

export function finalizeStage25FrozenDecisionV1(input: Readonly<Stage25FrozenDecisionInputV1>) {
  validateInput(input);
  const material = {
    version: STAGE25_FROZEN_DECISION_VERSION_V1,
    artifactType: 'Stage25FrozenDecisionReceiptV1' as const,
    authority: 'FROZEN_STAGE25_RESEARCH_EXIT_DECISION_NO_PRODUCTION_MUTATION_AUTHORITY' as const,
    source: structuredClone(input.source),
    generatedAt: input.generatedAt,
    ownerTests: structuredClone(input.ownerTests),
    evidence: structuredClone(input.evidence),
    historicalPaidCohortInterpretation: {
      auditSha256: STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1.auditSha256,
      validStructuralPassCount: 7 as const,
      validOwnerSupportedSafeStopCount: 9 as const,
      genuineFailureCount: 2 as const,
      confoundedCount: 5 as const,
      providerResourceNonEvaluationCount: 1 as const,
      confoundedDisposition: 'PERMANENTLY_CONFOUNDED_UNVERIFIABLE_EXCLUDED_FROM_MODEL_SCORING' as const,
      providerNonEvaluationDisposition: 'UNVERIFIABLE_NOT_PASS_OR_FAILURE' as const,
      genuineFailureDisposition: 'PRESERVED_REAL_FAILURES_RUNTIME_MUST_BLOCK_BEFORE_MUTATION' as const,
      historicalRerunDisposition: 'NOT_RUN_IMMUTABLE_HISTORICAL_COHORT' as const,
    },
    successorWholeEpisode: structuredClone(input.successorWholeEpisode),
    decision: 'MODIFY' as const,
    stage25Status: 'FROZEN_MODIFY_DECISION_ISSUED' as const,
    stage3ProductionModelDrivenMutation: 'BLOCKED_NOT_AUTHORIZED' as const,
    goAuthorized: false as const,
    noGoIssued: false as const,
    decisionRationale: {
      whyNotGo: [
        'LONG_FORM_PRODUCT_EVIDENCE_INCOMPLETE',
        'RHC01_TO_RHC04_HUMAN_QUALITY_UNVERIFIABLE',
        'RHC04_MEASURED_HANDS_ON_CORRECTION_NOT_PERFORMED',
        'COMPLETE_RENDER_AND_PROVIDER_COST_ACCOUNTING_UNAVAILABLE',
        'BROAD_OPERATION_PRECONDITION_AND_PROJECTSERVICE_OWNER_ENFORCEMENT_INCOMPLETE',
      ] as const,
      whyNotNoGo: [
        'BOUNDED_NATIVE_GENERATED_AND_HYBRID_TECHNICAL_FEASIBILITY_EXISTS',
        'BOUNDED_PROJECTSERVICE_CONFLICT_LOCK_REBASE_SAFETY_PASSES',
        'ZERO_SPEND_RESUME_MECHANICS_PASS',
        'IDENTIFIED_GAPS_ARE_REPAIRABLE_AND_FAIL_CLOSED',
      ] as const,
    },
    requiredModificationsBeforeReconsideration: [
      'ENFORCE_EVIDENCE_ORDER_REVISION_RANGE_LOCK_RIGHTS_AND_INVALIDATION_IN_EVERY_REAL_MUTATION_OWNER',
      'IMPLEMENT_PRIVATE_PTS_STORAGE_RATIONAL_MIXED_RATE_VFR_AND_DISCONTINUITY_CONSUMPTION',
      'PROVE_RIGHTS_CLEARED_MULTI_HOUR_SEMANTIC_RETRIEVAL_ACCURACY',
      'PROVE_LIVE_PROXY_MASTER_INVALIDATION_AND_PRODUCTION_VISUAL_PLAYBACK_RENDER_DELIVERY_RECOVERY',
      'COLLECT_QUALIFIED_BLIND_RHC01_TO_RHC04_HUMAN_REVIEWS',
      'RUN_FRESH_ISOLATED_RHC04_MEASURED_HANDS_ON_CORRECTION',
      'BIND_COMPLETE_LOCAL_CLOUD_RENDER_AND_OPTIONAL_PROVIDER_COST_ACCOUNTING',
    ] as const,
    modelRankingAuthorized: false as const,
    paidCohortRerunAuthorized: false as const,
    providerInferenceCalls: 0 as const,
    canonicalProjectReads: 0 as const,
    canonicalProjectMutations: 0 as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function assertStage25FrozenDecisionReceiptV1(value: unknown): void {
  const receipt = record(value, 'RECEIPT_INVALID');
  const unsigned = structuredClone(receipt); delete unsigned.receiptSha256;
  if (receipt.version !== STAGE25_FROZEN_DECISION_VERSION_V1
    || receipt.artifactType !== 'Stage25FrozenDecisionReceiptV1'
    || receipt.decision !== 'MODIFY' || receipt.stage25Status !== 'FROZEN_MODIFY_DECISION_ISSUED'
    || receipt.stage3ProductionModelDrivenMutation !== 'BLOCKED_NOT_AUTHORIZED'
    || receipt.goAuthorized !== false || receipt.noGoIssued !== false
    || receipt.providerInferenceCalls !== 0 || receipt.canonicalProjectMutations !== 0
    || !isSha(receipt.receiptSha256) || hashCanonicalJsonV1(unsigned) !== receipt.receiptSha256) {
    fail('RECEIPT_INVALID');
  }
}

function validateInput(input: Readonly<Stage25FrozenDecisionInputV1>): void {
  if (!/^[a-f0-9]{40}$/.test(input.source.commitSha) || !/^[a-f0-9]{40}$/.test(input.source.treeSha)
    || !isSha(input.source.relevantScopeSha256) || input.source.relevantTrackedFileCount < 1
    || input.source.relevantStatusEntries.length || !Number.isFinite(Date.parse(input.generatedAt))
    || !isSha(input.ownerTests.reportSha256) || input.ownerTests.failedTestCount !== 0
    || input.ownerTests.passedTestCount < 1
    || hashCanonicalJsonV1([...input.ownerTests.testFiles].sort())
      !== hashCanonicalJsonV1([...STAGE25_FROZEN_DECISION_OWNER_TEST_FILES_V1].sort())) {
    fail('SOURCE_OR_TEST_IDENTITY_INVALID');
  }
  if (input.evidence.length !== STAGE25_FROZEN_DECISION_EVIDENCE_V1.length) fail('EVIDENCE_SET_INVALID');
  for (let index = 0; index < STAGE25_FROZEN_DECISION_EVIDENCE_V1.length; index += 1) {
    const expected = STAGE25_FROZEN_DECISION_EVIDENCE_V1[index];
    const actual = input.evidence[index];
    if (actual.evidenceId !== expected.evidenceId
      || actual.canonicalSha256 !== expected.canonicalSha256
      || actual.disposition !== expected.disposition || !isSha(actual.fileSha256)) {
      fail(`EVIDENCE_INVALID:${expected.evidenceId}`);
    }
  }
  const classification = STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1.auditedClassification;
  if (classification.validStructuralRows.length !== 7
    || classification.validOwnerSupportedSafeStopRows.length !== 9
    || classification.genuineModelOrTaskFailureRows.length !== 2
    || classification.confoundedRows.length !== 5
    || classification.providerResourceNonEvaluationRows.length !== 1
    || STAGE25_FINAL_GENERALISATION_PAID_AUDIT_V1.aggregateUsePolicy.paidRerunAuthorized
    || input.successorWholeEpisode.disposition !== 'NOT_RUN_NOT_AUTHORIZED_AND_NOT_DECISION_CRITICAL'
    || input.successorWholeEpisode.providerInferenceCalls !== 0
    || input.successorWholeEpisode.providerSpendUsd !== 0) fail('DECISION_PREMISE_INVALID');
}

function accepted<EvidenceId extends string>(evidenceId: EvidenceId, canonicalSha256: string, disposition: string) {
  return { evidenceId, canonicalSha256, disposition } as const;
}
function isSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function record(value: unknown, code: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code); return value as Record<string, unknown>; }
function fail(code: string): never { throw new Error(`STAGE25_FROZEN_DECISION_${code}`); }
