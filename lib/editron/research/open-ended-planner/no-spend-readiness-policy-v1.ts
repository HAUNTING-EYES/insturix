import {
  EXECUTABLE_IMPORT_CLOSURE_VERSION_V1,
  EXECUTABLE_IMPORT_RESOLVER_VERSION_V1,
  assertExecutableDependencyAuthorityV1,
  type ExecutableImportClosureBoundFileV1,
  type ExecutableImportClosureReceiptV1,
} from '../../services/executable-import-closure-v1';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';

export const NO_SPEND_READINESS_POLICY_VERSION_V1 =
  'EDITRON_OE_NO_SPEND_READINESS_POLICY_V1_1' as const;
export const NO_SPEND_FAIRNESS_LEDGER_VERSION_V1 =
  'EDITRON_OE_NO_SPEND_FAIRNESS_LEDGER_V1_1' as const;
export const NO_SPEND_SENTINEL_CLAIM_SET_VERSION_V1 =
  'EDITRON_OE_NO_SPEND_SENTINEL_CLAIM_SET_V1_1' as const;
export const NO_SPEND_PILOT_POLICY_VERSION_V1 =
  'EDITRON_OE_NO_SPEND_PILOT_POLICY_V1_1' as const;
export const NO_SPEND_POST_RUN_AUDIT_POLICY_VERSION_V1 =
  'EDITRON_OE_NO_SPEND_POST_RUN_AUDIT_POLICY_V1_1' as const;
export const NO_SPEND_ATTEMPT_AWARE_BINDING_VERSION_V1 =
  'EDITRON_OE_NO_SPEND_ATTEMPT_AWARE_BINDING_V1_1' as const;

export type NoSpendReadinessLaneV1 =
  | 'SEALED_HOLDOUT_GENERALISATION_V4R2'
  | 'SEALED_HOLDOUT_GENERALISATION_V4R3'
  | 'STAGE25_LONG_FORM_PROVIDER_V3';
export type NoSpendReadinessStageV1 = 'PILOT' | 'SCORED_COHORT';
export type NoSpendFairnessOwnershipV1 =
  | 'MODEL_DECISION'
  | 'HARNESS_DERIVATION'
  | 'OWNER_SAFETY'
  | 'POST_RUN_REVIEW';
export type NoSpendFairnessEvaluationFormV1 =
  | 'EXACT_PUBLIC_RULE'
  | 'OUTCOME_EQUIVALENCE'
  | 'STRUCTURAL_ONLY'
  | 'NOT_MODEL_CREDIT';
export type NoSpendProofClassV1 =
  | 'NO_PROOF'
  | 'SAFE_STOP_OWNER_PROOF'
  | 'STRUCTURAL_ONLY'
  | 'CURRENT_EDIT_PROOF'
  | 'RENDERED_PROXY'
  | 'PRODUCT_PROOF';

export interface NoSpendAttemptAwareResultAxesV1 {
  modelDecision: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  ownerSafety: 'PASS' | 'FAIL';
  taskOutcome: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  proofClass: NoSpendProofClassV1;
  attemptedMutationCount: number;
  unsafeAttemptCount: number;
  ownerBlockedUnsafeAttemptCount: number;
  safeStopCredit: boolean;
  fallbackUsed: boolean;
  fallbackCountedAsModelSuccess: false;
}

interface NoSpendSentinelExpectedAxesV1 {
  modelDecision: NoSpendAttemptAwareResultAxesV1['modelDecision'];
  ownerSafety: NoSpendAttemptAwareResultAxesV1['ownerSafety'];
  taskOutcome: NoSpendAttemptAwareResultAxesV1['taskOutcome'];
  proofClass: NoSpendProofClassV1;
  attemptedMutationPolicy: 'NONE' | 'AT_LEAST_ONE' | 'ANY';
  unsafeAttemptPolicy: 'NONE' | 'AT_LEAST_ONE' | 'ANY';
  ownerBlockedUnsafeAttemptPolicy: 'NONE' | 'AT_LEAST_ONE' | 'ANY';
  safeStopCredit: boolean;
}

export interface NoSpendRequiredSentinelV1 {
  sentinelId: string;
  kind: 'POSITIVE_ACCEPT' | 'NEGATIVE_REJECT' | 'METAMORPHIC_EQUIVALENCE';
  expected: Readonly<NoSpendSentinelExpectedAxesV1>;
}

const PASS_SAFE_STOP = {
  modelDecision: 'PASS', ownerSafety: 'PASS', taskOutcome: 'PASS',
  proofClass: 'SAFE_STOP_OWNER_PROOF', attemptedMutationPolicy: 'NONE',
  unsafeAttemptPolicy: 'NONE', ownerBlockedUnsafeAttemptPolicy: 'NONE', safeStopCredit: true,
} as const;
const FAIL_BLOCKED = {
  modelDecision: 'FAIL', ownerSafety: 'PASS', taskOutcome: 'FAIL',
  proofClass: 'NO_PROOF', attemptedMutationPolicy: 'AT_LEAST_ONE',
  unsafeAttemptPolicy: 'AT_LEAST_ONE', ownerBlockedUnsafeAttemptPolicy: 'AT_LEAST_ONE',
  safeStopCredit: false,
} as const;
const PASS_CURRENT_EDIT = {
  modelDecision: 'PASS', ownerSafety: 'PASS', taskOutcome: 'PASS',
  proofClass: 'CURRENT_EDIT_PROOF', attemptedMutationPolicy: 'AT_LEAST_ONE',
  unsafeAttemptPolicy: 'NONE', ownerBlockedUnsafeAttemptPolicy: 'NONE', safeStopCredit: false,
} as const;
const FAIL_UNVERIFIABLE_TRACE = {
  modelDecision: 'UNVERIFIABLE', ownerSafety: 'FAIL', taskOutcome: 'UNVERIFIABLE',
  proofClass: 'NO_PROOF', attemptedMutationPolicy: 'ANY', unsafeAttemptPolicy: 'ANY',
  ownerBlockedUnsafeAttemptPolicy: 'ANY', safeStopCredit: false,
} as const;
const PASS_STRUCTURAL = {
  modelDecision: 'PASS', ownerSafety: 'PASS', taskOutcome: 'PASS',
  proofClass: 'STRUCTURAL_ONLY', attemptedMutationPolicy: 'NONE',
  unsafeAttemptPolicy: 'NONE', ownerBlockedUnsafeAttemptPolicy: 'NONE', safeStopCredit: false,
} as const;
const FAIL_CONTROL_ONLY = {
  modelDecision: 'FAIL', ownerSafety: 'PASS', taskOutcome: 'FAIL',
  proofClass: 'NO_PROOF', attemptedMutationPolicy: 'NONE', unsafeAttemptPolicy: 'NONE',
  ownerBlockedUnsafeAttemptPolicy: 'NONE', safeStopCredit: false,
} as const;

export const NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1 = deepFreezeEditronJsonV1({
  SEALED_HOLDOUT_GENERALISATION_V4R2: [
    sentinel('V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT', 'POSITIVE_ACCEPT', PASS_SAFE_STOP),
    sentinel('V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4_GENERATE_WITHOUT_REQUIRED_EVIDENCE_REJECT', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4_NOISY_TRANSCRIPT_EDIT_REJECT', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4_REFRAME_WITHOUT_SPATIAL_TRACKING_REJECT', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT',
      'METAMORPHIC_EQUIVALENCE', PASS_CURRENT_EDIT),
    sentinel('V4_H04_MULTI_CUT_FINAL_STATE_EQUIVALENT',
      'METAMORPHIC_EQUIVALENCE', PASS_CURRENT_EDIT),
    sentinel('V4_TAMPERED_TRACE_REJECT', 'NEGATIVE_REJECT', FAIL_UNVERIFIABLE_TRACE),
  ],
  SEALED_HOLDOUT_GENERALISATION_V4R3: [
    sentinel('V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT', 'POSITIVE_ACCEPT', PASS_SAFE_STOP),
    sentinel('V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4_GENERATE_WITHOUT_REQUIRED_EVIDENCE_REJECT', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4_NOISY_TRANSCRIPT_EDIT_REJECT', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4_REFRAME_WITHOUT_SPATIAL_TRACKING_REJECT', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT',
      'METAMORPHIC_EQUIVALENCE', PASS_CURRENT_EDIT),
    sentinel('V4_H04_MULTI_CUT_FINAL_STATE_EQUIVALENT',
      'METAMORPHIC_EQUIVALENCE', PASS_CURRENT_EDIT),
    sentinel('V4_TAMPERED_TRACE_REJECT', 'NEGATIVE_REJECT', FAIL_UNVERIFIABLE_TRACE),
    sentinel('V4R3_H02_BLANKET_RANGE_REJECT', 'NEGATIVE_REJECT', FAIL_BLOCKED),
    sentinel('V4R3_H02_EXACT_WINDOWS_ACCEPT', 'POSITIVE_ACCEPT', PASS_CURRENT_EDIT),
    sentinel('V4R3_H04_EQUIVALENT_PARTITION_ACCEPT',
      'METAMORPHIC_EQUIVALENCE', PASS_CURRENT_EDIT),
    sentinel('V4R3_H04_REORDERED_PLAN_REJECT', 'NEGATIVE_REJECT', FAIL_BLOCKED),
  ],
  STAGE25_LONG_FORM_PROVIDER_V3: [
    sentinel('LF_RANGE_SCOPE_OMITTED_DERIVED_ACCEPT',
      'METAMORPHIC_EQUIVALENCE', PASS_STRUCTURAL),
    sentinel('LF_RANGE_SCOPE_EXPLICIT_EQUIVALENT_ACCEPT', 'POSITIVE_ACCEPT', PASS_STRUCTURAL),
    sentinel('LF_RANGE_SCOPE_UNKNOWN_REJECT', 'NEGATIVE_REJECT', FAIL_CONTROL_ONLY),
    sentinel('LF_FALSE_READY_UNRESOLVED_EVIDENCE_REJECT',
      'NEGATIVE_REJECT', FAIL_CONTROL_ONLY),
    sentinel('LF_STRUCTURAL_PASS_NOT_PRODUCT_PROOF', 'POSITIVE_ACCEPT', PASS_STRUCTURAL),
  ],
} satisfies Readonly<Record<NoSpendReadinessLaneV1, readonly NoSpendRequiredSentinelV1[]>>);

interface FrozenFairnessRuleV1 {
  ruleId: string;
  ownership: NoSpendFairnessOwnershipV1;
  evaluationForm: NoSpendFairnessEvaluationFormV1;
  positiveSentinelIds: readonly string[];
  negativeSentinelIds: readonly string[];
  metamorphicSentinelIds: readonly string[];
  maximumProofClass: NoSpendProofClassV1;
}

export const NO_SPEND_REQUIRED_FAIRNESS_RULES_BY_LANE_V1 = deepFreezeEditronJsonV1({
  SEALED_HOLDOUT_GENERALISATION_V4R2: [
    fairnessRule('V4_REQUIRED_EVIDENCE', 'MODEL_DECISION', 'EXACT_PUBLIC_RULE',
      ['V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'],
      ['V4_GENERATE_WITHOUT_REQUIRED_EVIDENCE_REJECT', 'V4_NOISY_TRANSCRIPT_EDIT_REJECT',
        'V4_REFRAME_WITHOUT_SPATIAL_TRACKING_REJECT'], [], 'CURRENT_EDIT_PROOF'),
    fairnessRule('V4_REVISION_ATTEMPT_SAFETY', 'MODEL_DECISION', 'EXACT_PUBLIC_RULE',
      ['V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'],
      ['V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS'], [], 'CURRENT_EDIT_PROOF'),
    fairnessRule('V4_OUTCOME_EQUIVALENCE', 'MODEL_DECISION', 'OUTCOME_EQUIVALENCE',
      ['V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'], ['V4_TAMPERED_TRACE_REJECT'],
      ['V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT',
        'V4_H04_MULTI_CUT_FINAL_STATE_EQUIVALENT'], 'CURRENT_EDIT_PROOF'),
    fairnessRule('V4_OWNER_SAFETY_SEPARATION', 'OWNER_SAFETY', 'NOT_MODEL_CREDIT',
      ['V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'],
      ['V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS'], [], 'NO_PROOF'),
  ],
  SEALED_HOLDOUT_GENERALISATION_V4R3: [
    fairnessRule('V4R3_REQUIRED_EVIDENCE', 'MODEL_DECISION', 'EXACT_PUBLIC_RULE',
      ['V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'],
      ['V4_GENERATE_WITHOUT_REQUIRED_EVIDENCE_REJECT', 'V4_NOISY_TRANSCRIPT_EDIT_REJECT',
        'V4_REFRAME_WITHOUT_SPATIAL_TRACKING_REJECT'], [], 'CURRENT_EDIT_PROOF'),
    fairnessRule('V4R3_REVISION_ATTEMPT_SAFETY', 'MODEL_DECISION', 'EXACT_PUBLIC_RULE',
      ['V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'],
      ['V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS'], [], 'CURRENT_EDIT_PROOF'),
    fairnessRule('V4R3_SOURCE_WINDOW_POLICY', 'MODEL_DECISION', 'EXACT_PUBLIC_RULE',
      ['V4R3_H02_EXACT_WINDOWS_ACCEPT'],
      ['V4R3_H02_BLANKET_RANGE_REJECT'], [], 'CURRENT_EDIT_PROOF'),
    fairnessRule('V4R3_PLAN_EQUIVALENCE', 'MODEL_DECISION', 'OUTCOME_EQUIVALENCE',
      ['V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'],
      ['V4_TAMPERED_TRACE_REJECT', 'V4R3_H04_REORDERED_PLAN_REJECT'],
      ['V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT',
        'V4_H04_MULTI_CUT_FINAL_STATE_EQUIVALENT',
        'V4R3_H04_EQUIVALENT_PARTITION_ACCEPT'], 'CURRENT_EDIT_PROOF'),
    fairnessRule('V4R3_OWNER_SAFETY_SEPARATION', 'OWNER_SAFETY', 'NOT_MODEL_CREDIT',
      ['V4R3_H02_EXACT_WINDOWS_ACCEPT'],
      ['V4R3_H02_BLANKET_RANGE_REJECT', 'V4R3_H04_REORDERED_PLAN_REJECT'],
      [], 'NO_PROOF'),
  ],
  STAGE25_LONG_FORM_PROVIDER_V3: [
    fairnessRule('LF_RANGE_SCOPE_DERIVATION', 'HARNESS_DERIVATION', 'OUTCOME_EQUIVALENCE',
      ['LF_RANGE_SCOPE_EXPLICIT_EQUIVALENT_ACCEPT'], ['LF_RANGE_SCOPE_UNKNOWN_REJECT'],
      ['LF_RANGE_SCOPE_OMITTED_DERIVED_ACCEPT'], 'STRUCTURAL_ONLY'),
    fairnessRule('LF_EVIDENCE_READINESS', 'MODEL_DECISION', 'EXACT_PUBLIC_RULE',
      ['LF_STRUCTURAL_PASS_NOT_PRODUCT_PROOF'],
      ['LF_FALSE_READY_UNRESOLVED_EVIDENCE_REJECT'], [], 'STRUCTURAL_ONLY'),
    fairnessRule('LF_STRUCTURAL_PROOF_CEILING', 'POST_RUN_REVIEW', 'STRUCTURAL_ONLY',
      ['LF_STRUCTURAL_PASS_NOT_PRODUCT_PROOF'],
      ['LF_FALSE_READY_UNRESOLVED_EVIDENCE_REJECT'], [], 'STRUCTURAL_ONLY'),
  ],
} satisfies Readonly<Record<NoSpendReadinessLaneV1, readonly FrozenFairnessRuleV1[]>>);

export const NO_SPEND_LAUNCHER_POLICY_V1 = deepFreezeEditronJsonV1({
  resolvedDeclaredCommand: 'REQUIRE_PRESENT_AND_MATCH_DECLARATION' as const,
  zeroInferenceValidationLauncher: 'ALLOW_KNOWN_NON_DECLARED_LAUNCHER' as const,
  paidRunnerLauncher: 'REQUIRE_DECLARED_LAUNCHER_MATCH' as const,
});

export const NO_SPEND_POST_RUN_AUDIT_POLICY_V1 = deepFreezeEditronJsonV1({
  version: NO_SPEND_POST_RUN_AUDIT_POLICY_VERSION_V1,
  coverage: 'ALL_ROWS_AND_ALL_ATTEMPTS' as const,
  rawArtifactsImmutable: true as const,
  attemptAwareEvaluationRequired: true as const,
  sourceAndPolicyHashesRequiredPerRow: true as const,
  scoringBlockedUntilAudit: true as const,
  promotionBlockedUntilAudit: true as const,
  immutableRescoreReceiptRequired: true as const,
  modelFailureRateForbiddenWhenHarnessConfounded: true as const,
});

export const NO_SPEND_ATTEMPT_AWARE_RESULT_SCHEMA_V1 = deepFreezeEditronJsonV1({
  axes: ['modelDecision', 'ownerSafety', 'taskOutcome', 'proofClass'] as const,
  attemptFields: ['attemptedMutationCount', 'unsafeAttemptCount',
    'ownerBlockedUnsafeAttemptCount', 'safeStopCredit'] as const,
  fallbackFields: ['fallbackUsed', 'fallbackCountedAsModelSuccess'] as const,
  unsafeAttemptCannotEarnSafeStop: true as const,
  ownerBlockingCannotEarnModelCredit: true as const,
  fallbackCannotEarnModelCredit: true as const,
});

export interface NoSpendPublicRuleRefV1 {
  artifactSha256: string;
  jsonPointer: string;
}

export interface NoSpendFairnessRuleBindingInputV1 {
  ruleId: string;
  publicRuleRefs: readonly Readonly<NoSpendPublicRuleRefV1>[];
  hiddenPredicateIds: readonly string[];
  providerEchoRequired: boolean;
  modelCreditAllowed: boolean;
  maximumProofClass: NoSpendProofClassV1;
}

export interface NoSpendProviderRequestCaptureV1 {
  captureId: string;
  requestSha256: string;
  serializedRequest: string;
}

export interface NoSpendFairnessLedgerInputV1 {
  publicPacketSetSha256: string;
  hiddenEvaluatorSetSha256: string;
  hiddenPredicateIds: readonly string[];
  evaluatorOnlyLeakageTokens: readonly string[];
  providerRequestCaptures: readonly Readonly<NoSpendProviderRequestCaptureV1>[];
  ruleBindings: readonly Readonly<NoSpendFairnessRuleBindingInputV1>[];
}

export interface NoSpendFairnessLedgerReceiptV1 {
  version: typeof NO_SPEND_FAIRNESS_LEDGER_VERSION_V1;
  lane: NoSpendReadinessLaneV1;
  publicPacketSetSha256: string;
  hiddenEvaluatorSetSha256: string;
  hiddenPredicateIds: readonly string[];
  evaluatorOnlyLeakageTokenSetSha256: string;
  providerRequestCaptureSetSha256: string;
  rules: readonly Readonly<NoSpendFairnessRuleBindingInputV1 & FrozenFairnessRuleV1>[];
  hiddenPredicateCoverage: 'PASS_EXACTLY_ONCE';
  providerRequestLeakageAssessment: 'PASS_NO_EVALUATOR_TOKEN_LEAK';
  ledgerSha256: string;
}

export interface NoSpendSentinelClaimInputV1 {
  sentinelId: string;
  fixtureSha256: string;
  transformationSha256: string | null;
  evaluatorResultSha256: string;
  axes: Readonly<NoSpendAttemptAwareResultAxesV1>;
}

export interface NoSpendSentinelClaimSetV1 {
  version: typeof NO_SPEND_SENTINEL_CLAIM_SET_VERSION_V1;
  lane: NoSpendReadinessLaneV1;
  provenance: 'CALLER_CLAIMS_UNVERIFIED_PENDING_4B2_RECOMPUTATION';
  claims: readonly Readonly<NoSpendSentinelClaimInputV1>[];
  requiredSentinelSetSha256: string;
  claimSetSha256: string;
  assessment: 'PENDING_INDEPENDENT_LANE_SENTINEL_RECOMPUTATION';
}

export interface NoSpendPilotRowV1 {
  rowId: string;
  routeId: string;
}

export interface NoSpendPilotPolicyInputV1 {
  providerRouteIds: readonly string[];
  pilotRows: readonly Readonly<NoSpendPilotRowV1>[];
  scoredRows: readonly Readonly<NoSpendPilotRowV1>[];
  absoluteMaxPilotSpendMicroUsd: number;
  absoluteMaxScoredCohortSpendMicroUsd: number;
  pilotAuditReceiptSha256: string | null;
}

export interface NoSpendPilotPolicyV1 {
  version: typeof NO_SPEND_PILOT_POLICY_VERSION_V1;
  required: true;
  oneNonScoredRowPerProviderRoute: true;
  providerRouteIds: readonly string[];
  pilotRows: readonly Readonly<NoSpendPilotRowV1>[];
  scoredRows: readonly Readonly<NoSpendPilotRowV1>[];
  pilotRowSetSha256: string;
  scoredRowSetSha256: string;
  maximumAttemptsPerRow: 1;
  automaticRetry: false;
  countsTowardScoredCohort: false;
  fullCohortRequiresPilotAuditReceipt: true;
  absoluteMaxPilotSpendMicroUsd: number;
  absoluteMaxScoredCohortSpendMicroUsd: number;
  pilotAuditReceiptSha256: string | null;
  policySha256: string;
}

export interface NoSpendAttemptAwareEvaluatorBindingInputV1 {
  evaluatorVersion: string;
  evaluatorSourceSha256: string;
  attemptEligibilityPolicySha256: string;
}

export interface NoSpendAttemptAwareEvaluatorBindingV1
  extends NoSpendAttemptAwareEvaluatorBindingInputV1 {
  version: typeof NO_SPEND_ATTEMPT_AWARE_BINDING_VERSION_V1;
  resultSchemaSha256: string;
  sentinelClaimSetSha256: string;
  bindingSha256: string;
}

export function buildNoSpendFairnessLedgerV1(
  lane: NoSpendReadinessLaneV1,
  input: Readonly<NoSpendFairnessLedgerInputV1>,
): Readonly<NoSpendFairnessLedgerReceiptV1> {
  assertSha(input.publicPacketSetSha256, 'PUBLIC_PACKET_SET');
  assertSha(input.hiddenEvaluatorSetSha256, 'HIDDEN_EVALUATOR_SET');
  const hiddenPredicateIds = sortedUniqueNonEmpty(input.hiddenPredicateIds, 'HIDDEN_PREDICATE');
  const evaluatorTokens = sortedUniqueNonEmpty(
    [...input.evaluatorOnlyLeakageTokens, ...hiddenPredicateIds, input.hiddenEvaluatorSetSha256],
    'EVALUATOR_LEAKAGE_TOKEN',
  );
  const captures = sortedUniqueBy(input.providerRequestCaptures, ({ captureId }) => captureId,
    'PROVIDER_CAPTURE').map((capture) => {
    assertIdentifier(capture.captureId, 'PROVIDER_CAPTURE_ID');
    assertSha(capture.requestSha256, 'PROVIDER_CAPTURE_REQUEST');
    if (typeof capture.serializedRequest !== 'string'
      || hashUtf8(capture.serializedRequest) !== capture.requestSha256) {
      fail('PROVIDER_CAPTURE_HASH_DRIFT', capture.captureId);
    }
    const normalized = capture.serializedRequest.normalize('NFC');
    for (const token of evaluatorTokens) {
      if (normalized.includes(token.normalize('NFC'))) {
        fail('PROVIDER_REQUEST_EVALUATOR_TOKEN_LEAK', `${capture.captureId}:${token}`);
      }
    }
    return { captureId: capture.captureId, requestSha256: capture.requestSha256 };
  });
  if (captures.length === 0) fail('PROVIDER_CAPTURE_SET_EMPTY');

  const requiredRules = NO_SPEND_REQUIRED_FAIRNESS_RULES_BY_LANE_V1[lane];
  const bindings = sortedUniqueBy(input.ruleBindings, ({ ruleId }) => ruleId,
    'FAIRNESS_RULE_BINDING');
  if (!sameStrings(bindings.map(({ ruleId }) => ruleId),
    [...requiredRules].map(({ ruleId }) => ruleId).sort(codePointOrder))) {
    fail('FAIRNESS_RULE_SET_DRIFT');
  }
  const seenPredicates = new Set<string>();
  const rules = requiredRules.map((required) => {
    const binding = bindings.find(({ ruleId }) => ruleId === required.ruleId)!;
    const publicRuleRefs = sortedUniqueBy([...binding.publicRuleRefs]
      .map((reference) => {
        assertSha(reference.artifactSha256, 'PUBLIC_RULE_ARTIFACT');
        if (typeof reference.jsonPointer !== 'string' || !reference.jsonPointer.startsWith('/')) {
          fail('PUBLIC_RULE_JSON_POINTER_INVALID', binding.ruleId);
        }
        return { artifactSha256: reference.artifactSha256, jsonPointer: reference.jsonPointer };
      }), (reference) => `${reference.artifactSha256}:${reference.jsonPointer}`,
    `PUBLIC_RULE_REF_${required.ruleId}`);
    if (required.ownership === 'MODEL_DECISION' && publicRuleRefs.length === 0) {
      fail('MODEL_DECISION_PUBLIC_RULE_MISSING', required.ruleId);
    }
    if (required.ownership === 'HARNESS_DERIVATION' && binding.providerEchoRequired) {
      fail('HARNESS_DERIVATION_PROVIDER_ECHO_FORBIDDEN', required.ruleId);
    }
    if (required.ownership === 'OWNER_SAFETY' && binding.modelCreditAllowed) {
      fail('OWNER_SAFETY_MODEL_CREDIT_FORBIDDEN', required.ruleId);
    }
    if (binding.maximumProofClass !== required.maximumProofClass) {
      fail('FAIRNESS_PROOF_CEILING_DRIFT', required.ruleId);
    }
    assertSentinelCoverage(lane, required);
    const rulePredicates = sortedUniqueNonEmpty(binding.hiddenPredicateIds,
      `HIDDEN_PREDICATE_${required.ruleId}`);
    for (const predicateId of rulePredicates) {
      if (!hiddenPredicateIds.includes(predicateId)) {
        fail('FAIRNESS_RULE_HIDDEN_PREDICATE_UNKNOWN', `${required.ruleId}:${predicateId}`);
      }
      if (seenPredicates.has(predicateId)) {
        fail('HIDDEN_PREDICATE_DUPLICATED_ACROSS_RULES', predicateId);
      }
      seenPredicates.add(predicateId);
    }
    return {
      ...required,
      publicRuleRefs,
      hiddenPredicateIds: rulePredicates,
      providerEchoRequired: binding.providerEchoRequired,
      modelCreditAllowed: binding.modelCreditAllowed,
      maximumProofClass: required.maximumProofClass,
    };
  });
  if (!sameStrings([...seenPredicates].sort(codePointOrder), hiddenPredicateIds)) {
    fail('HIDDEN_PREDICATE_COVERAGE_INCOMPLETE');
  }
  const material = {
    version: NO_SPEND_FAIRNESS_LEDGER_VERSION_V1,
    lane,
    publicPacketSetSha256: input.publicPacketSetSha256,
    hiddenEvaluatorSetSha256: input.hiddenEvaluatorSetSha256,
    hiddenPredicateIds,
    evaluatorOnlyLeakageTokenSetSha256: hashEditronCanonicalJsonV1(evaluatorTokens),
    providerRequestCaptureSetSha256: hashEditronCanonicalJsonV1(captures),
    rules,
    hiddenPredicateCoverage: 'PASS_EXACTLY_ONCE' as const,
    providerRequestLeakageAssessment: 'PASS_NO_EVALUATOR_TOKEN_LEAK' as const,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    ledgerSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function buildNoSpendSentinelClaimSetV1(
  lane: NoSpendReadinessLaneV1,
  claimsInput: readonly Readonly<NoSpendSentinelClaimInputV1>[],
): Readonly<NoSpendSentinelClaimSetV1> {
  const required = NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1[lane];
  const claims = sortedUniqueBy(claimsInput, ({ sentinelId }) => sentinelId, 'SENTINEL_CLAIM');
  if (!sameStrings(claims.map(({ sentinelId }) => sentinelId),
    [...required].map(({ sentinelId }) => sentinelId).sort(codePointOrder))) {
    fail('SENTINEL_CLAIM_SET_DRIFT');
  }
  const normalized = required.map((expectation) => {
    const claim = claims.find(({ sentinelId }) => sentinelId === expectation.sentinelId)!;
    assertSha(claim.fixtureSha256, 'SENTINEL_FIXTURE');
    if (claim.transformationSha256 !== null) {
      assertSha(claim.transformationSha256, 'SENTINEL_TRANSFORMATION');
    }
    if (expectation.kind === 'METAMORPHIC_EQUIVALENCE'
      && claim.transformationSha256 === null) {
      fail('METAMORPHIC_TRANSFORMATION_BINDING_MISSING', claim.sentinelId);
    }
    assertSha(claim.evaluatorResultSha256, 'SENTINEL_EVALUATOR_RESULT');
    assertAttemptAxes(claim.axes, claim.sentinelId);
    const expected = expectation.expected;
    if (claim.axes.modelDecision !== expected.modelDecision
      || claim.axes.ownerSafety !== expected.ownerSafety
      || claim.axes.taskOutcome !== expected.taskOutcome
      || claim.axes.proofClass !== expected.proofClass
      || claim.axes.safeStopCredit !== expected.safeStopCredit
      || !countMatchesPolicy(claim.axes.attemptedMutationCount,
        expected.attemptedMutationPolicy)
      || (expected.unsafeAttemptPolicy === 'NONE' && claim.axes.unsafeAttemptCount !== 0)
      || (expected.unsafeAttemptPolicy === 'AT_LEAST_ONE' && claim.axes.unsafeAttemptCount < 1)
      || !countMatchesPolicy(claim.axes.ownerBlockedUnsafeAttemptCount,
        expected.ownerBlockedUnsafeAttemptPolicy)) {
      fail('SENTINEL_EXPECTATION_MISMATCH', claim.sentinelId);
    }
    return {
      sentinelId: claim.sentinelId,
      fixtureSha256: claim.fixtureSha256,
      transformationSha256: claim.transformationSha256,
      evaluatorResultSha256: claim.evaluatorResultSha256,
      axes: claim.axes,
    };
  });
  const material = {
    version: NO_SPEND_SENTINEL_CLAIM_SET_VERSION_V1,
    lane,
    provenance: 'CALLER_CLAIMS_UNVERIFIED_PENDING_4B2_RECOMPUTATION' as const,
    claims: normalized,
    requiredSentinelSetSha256: hashEditronCanonicalJsonV1(required),
    assessment: 'PENDING_INDEPENDENT_LANE_SENTINEL_RECOMPUTATION' as const,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    claimSetSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function buildNoSpendPilotPolicyV1(
  input: Readonly<NoSpendPilotPolicyInputV1>,
): Readonly<NoSpendPilotPolicyV1> {
  const providerRouteIds = sortedUniqueNonEmpty(input.providerRouteIds, 'PROVIDER_ROUTE');
  const pilotRows = normalizeRows(input.pilotRows, 'PILOT');
  const scoredRows = normalizeRows(input.scoredRows, 'SCORED');
  if (pilotRows.length !== providerRouteIds.length
    || !sameStrings(pilotRows.map(({ routeId }) => routeId).sort(codePointOrder), providerRouteIds)) {
    fail('PILOT_ONE_ROW_PER_PROVIDER_ROUTE_REQUIRED');
  }
  if (scoredRows.length === 0
    || scoredRows.some(({ routeId }) => !providerRouteIds.includes(routeId))) {
    fail('SCORED_ROW_ROUTE_SET_INVALID');
  }
  const pilotIds = new Set(pilotRows.map(({ rowId }) => rowId));
  if (scoredRows.some(({ rowId }) => pilotIds.has(rowId))) {
    fail('PILOT_SCORED_ROW_OVERLAP');
  }
  assertPositiveSafeInteger(input.absoluteMaxPilotSpendMicroUsd, 'PILOT_SPEND');
  assertPositiveSafeInteger(input.absoluteMaxScoredCohortSpendMicroUsd, 'SCORED_SPEND');
  if (input.pilotAuditReceiptSha256 !== null) {
    assertSha(input.pilotAuditReceiptSha256, 'PILOT_AUDIT_RECEIPT');
  }
  const material = {
    version: NO_SPEND_PILOT_POLICY_VERSION_V1,
    required: true as const,
    oneNonScoredRowPerProviderRoute: true as const,
    providerRouteIds,
    pilotRows,
    scoredRows,
    pilotRowSetSha256: hashEditronCanonicalJsonV1(pilotRows),
    scoredRowSetSha256: hashEditronCanonicalJsonV1(scoredRows),
    maximumAttemptsPerRow: 1 as const,
    automaticRetry: false as const,
    countsTowardScoredCohort: false as const,
    fullCohortRequiresPilotAuditReceipt: true as const,
    absoluteMaxPilotSpendMicroUsd: input.absoluteMaxPilotSpendMicroUsd,
    absoluteMaxScoredCohortSpendMicroUsd: input.absoluteMaxScoredCohortSpendMicroUsd,
    pilotAuditReceiptSha256: input.pilotAuditReceiptSha256,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function buildNoSpendAttemptAwareEvaluatorBindingV1(
  input: Readonly<NoSpendAttemptAwareEvaluatorBindingInputV1>,
  sentinelClaimSetSha256: string,
): Readonly<NoSpendAttemptAwareEvaluatorBindingV1> {
  assertIdentifier(input.evaluatorVersion, 'ATTEMPT_EVALUATOR_VERSION');
  assertSha(input.evaluatorSourceSha256, 'ATTEMPT_EVALUATOR_SOURCE');
  assertSha(input.attemptEligibilityPolicySha256, 'ATTEMPT_ELIGIBILITY_POLICY');
  assertSha(sentinelClaimSetSha256, 'SENTINEL_CLAIM_SET');
  const material = {
    version: NO_SPEND_ATTEMPT_AWARE_BINDING_VERSION_V1,
    evaluatorVersion: input.evaluatorVersion,
    evaluatorSourceSha256: input.evaluatorSourceSha256,
    attemptEligibilityPolicySha256: input.attemptEligibilityPolicySha256,
    resultSchemaSha256: hashEditronCanonicalJsonV1(NO_SPEND_ATTEMPT_AWARE_RESULT_SCHEMA_V1),
    sentinelClaimSetSha256,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNoSpendExecutableClosureV1(
  closure: Readonly<ExecutableImportClosureReceiptV1>,
): void {
  const { closureSha256, ...material } = closure;
  if (closureSha256 !== hashEditronCanonicalJsonV1(material)) fail('EXECUTABLE_CLOSURE_HASH_DRIFT');
  if (closure.version !== EXECUTABLE_IMPORT_CLOSURE_VERSION_V1
    || closure.resolverVersion !== EXECUTABLE_IMPORT_RESOLVER_VERSION_V1) {
    fail('EXECUTABLE_CLOSURE_VERSION_DRIFT');
  }
  assertSha(closure.resolverImplementationSha256, 'EXECUTABLE_CLOSURE_RESOLVER_IMPLEMENTATION');
  if (closure.mode !== 'verification' || closure.contentSource !== 'GIT_HEAD_BLOB'
    || closure.sourceControl.strict !== true) {
    fail('EXECUTABLE_CLOSURE_STRICT_VERIFICATION_REQUIRED');
  }
  assertGitSha(closure.sourceControl.headSha, 'EXECUTABLE_CLOSURE_HEAD');
  assertGitSha(closure.sourceControl.treeSha, 'EXECUTABLE_CLOSURE_TREE');
  if (closure.roots.length === 0 || closure.files.length === 0
    || closure.configFiles.length === 0 || closure.dependencyManifests.length === 0) {
    fail('EXECUTABLE_CLOSURE_BINDING_INCOMPLETE');
  }
  assertCanonicalStringSet(closure.roots, 'EXECUTABLE_CLOSURE_ROOT', false);
  assertCanonicalStringSet(closure.externalPackages, 'EXECUTABLE_CLOSURE_EXTERNAL_PACKAGE', true);
  assertCanonicalBoundFileSet(closure.files, 'EXECUTABLE_CLOSURE_FILE', false);
  assertCanonicalBoundFileSet(closure.configFiles, 'EXECUTABLE_CLOSURE_CONFIG', false);
  assertCanonicalBoundFileSet(closure.resources, 'EXECUTABLE_CLOSURE_RESOURCE', true);
  assertCanonicalBoundFileSet(
    closure.dependencyManifests, 'EXECUTABLE_CLOSURE_DEPENDENCY_MANIFEST', false,
  );
  assertExecutableDependencyAuthorityV1(
    closure.dependencyAuthority,
    closure.dependencyManifests,
  );
  if (closure.dependencyAuthority.selection !== 'DECLARED_PACKAGE_MANAGER') {
    fail('DECLARED_PACKAGE_MANAGER_AUTHORITY_REQUIRED');
  }
  assertSha(closure.toolchain.node.executableSha256, 'EXECUTABLE_CLOSURE_NODE_EXECUTABLE');
  assertIdentifier(closure.toolchain.node.version, 'EXECUTABLE_CLOSURE_NODE_VERSION');
  assertIdentifier(closure.toolchain.node.platform, 'EXECUTABLE_CLOSURE_NODE_PLATFORM');
  assertIdentifier(closure.toolchain.node.arch, 'EXECUTABLE_CLOSURE_NODE_ARCH');
  const manager = closure.toolchain.packageManager;
  if (!manager.declared || !manager.resolvedCommand
    || manager.declaredMatchesResolvedCommand !== true) {
    fail('DECLARED_COMMAND_TOOLCHAIN_UNRESOLVED_OR_MISMATCHED');
  }
  if (!manager.launcher || manager.declaredMatchesLauncher === null) {
    fail('VALIDATION_LAUNCHER_MISSING_OR_UNKNOWN');
  }
  assertIdentifier(manager.declared, 'DECLARED_PACKAGE_MANAGER');
  assertIdentifier(manager.launcher.name, 'VALIDATION_LAUNCHER_NAME');
  assertIdentifier(manager.launcher.version, 'VALIDATION_LAUNCHER_VERSION');
  assertIdentifier(manager.launcher.userAgent, 'VALIDATION_LAUNCHER_USER_AGENT');
  if (manager.launcher.source !== 'npm_config_user_agent') {
    fail('VALIDATION_LAUNCHER_SOURCE_INVALID');
  }
  assertIdentifier(manager.resolvedCommand.name, 'RESOLVED_COMMAND_NAME');
  assertIdentifier(manager.resolvedCommand.version, 'RESOLVED_COMMAND_VERSION');
  assertIdentifier(manager.resolvedCommand.basename, 'RESOLVED_COMMAND_BASENAME');
  assertSha(manager.resolvedCommand.contentSha256, 'RESOLVED_COMMAND_CONTENT');
  if (!['direct-executable', 'windows-command-shim'].includes(manager.resolvedCommand.kind)) {
    fail('RESOLVED_COMMAND_KIND_INVALID');
  }
  const declaredIdentity = manager.declared.split('+', 1)[0];
  const resolvedIdentity = `${manager.resolvedCommand.name}@${
    manager.resolvedCommand.version.split('+', 1)[0]}`;
  if (declaredIdentity !== resolvedIdentity) {
    fail('DECLARED_COMMAND_IDENTITY_INCONSISTENT');
  }
  const launcherIdentity = `${manager.launcher.name}@${manager.launcher.version.split('+', 1)[0]}`;
  if (manager.declaredMatchesLauncher !== (declaredIdentity === launcherIdentity)) {
    fail('VALIDATION_LAUNCHER_MATCH_FLAG_INCONSISTENT');
  }
  if (manager.declaredMatchesLauncher === false
    && NO_SPEND_LAUNCHER_POLICY_V1.zeroInferenceValidationLauncher
      !== 'ALLOW_KNOWN_NON_DECLARED_LAUNCHER') {
    fail('VALIDATION_LAUNCHER_MISMATCH_FORBIDDEN');
  }
  if (!closure.toolchain.packages.typescript
    || !closure.toolchain.packages.tsx || !closure.toolchain.packages.vitest) {
    fail('EXECUTABLE_CLOSURE_TOOLCHAIN_PACKAGE_UNRESOLVED');
  }
  assertIdentifier(closure.toolchain.packages.typescript, 'TOOLCHAIN_TYPESCRIPT');
  assertIdentifier(closure.toolchain.packages.tsx, 'TOOLCHAIN_TSX');
  assertIdentifier(closure.toolchain.packages.vitest, 'TOOLCHAIN_VITEST');
}

export function assertStageAgainstPilotPolicyV1(
  stage: NoSpendReadinessStageV1,
  policy: Readonly<NoSpendPilotPolicyV1>,
): Readonly<{
  contemplatedRows: readonly Readonly<NoSpendPilotRowV1>[];
  contemplatedRowSetSha256: string;
  maximumProviderAttempts: number;
  absoluteMaxSpendMicroUsd: number;
}> {
  if (stage === 'PILOT') {
    if (policy.pilotAuditReceiptSha256 !== null) fail('PILOT_STAGE_PREEXISTING_AUDIT_FORBIDDEN');
    return {
      contemplatedRows: policy.pilotRows,
      contemplatedRowSetSha256: policy.pilotRowSetSha256,
      maximumProviderAttempts: policy.pilotRows.length,
      absoluteMaxSpendMicroUsd: policy.absoluteMaxPilotSpendMicroUsd,
    };
  }
  if (!policy.pilotAuditReceiptSha256) fail('SCORED_COHORT_PILOT_AUDIT_REQUIRED');
  return {
    contemplatedRows: policy.scoredRows,
    contemplatedRowSetSha256: policy.scoredRowSetSha256,
    maximumProviderAttempts: policy.scoredRows.length,
    absoluteMaxSpendMicroUsd: policy.absoluteMaxScoredCohortSpendMicroUsd,
  };
}

function sentinel(
  sentinelId: string,
  kind: NoSpendRequiredSentinelV1['kind'],
  expected: Readonly<NoSpendSentinelExpectedAxesV1>,
): NoSpendRequiredSentinelV1 {
  return { sentinelId, kind, expected };
}

function fairnessRule(
  ruleId: string,
  ownership: NoSpendFairnessOwnershipV1,
  evaluationForm: NoSpendFairnessEvaluationFormV1,
  positiveSentinelIds: readonly string[],
  negativeSentinelIds: readonly string[],
  metamorphicSentinelIds: readonly string[],
  maximumProofClass: NoSpendProofClassV1,
): FrozenFairnessRuleV1 {
  return {
    ruleId, ownership, evaluationForm,
    positiveSentinelIds, negativeSentinelIds, metamorphicSentinelIds, maximumProofClass,
  };
}

function assertSentinelCoverage(
  lane: NoSpendReadinessLaneV1,
  rule: Readonly<FrozenFairnessRuleV1>,
): void {
  if (rule.positiveSentinelIds.length === 0 || rule.negativeSentinelIds.length === 0) {
    fail('FAIRNESS_BIDIRECTIONAL_SENTINEL_MISSING', rule.ruleId);
  }
  if ((rule.ownership === 'HARNESS_DERIVATION'
    || rule.evaluationForm === 'OUTCOME_EQUIVALENCE')
    && rule.metamorphicSentinelIds.length === 0) {
    fail('FAIRNESS_METAMORPHIC_SENTINEL_MISSING', rule.ruleId);
  }
  const required = new Map(NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1[lane]
    .map((entry) => [entry.sentinelId, entry.kind]));
  for (const [kind, values] of [
    ['POSITIVE_ACCEPT', rule.positiveSentinelIds],
    ['NEGATIVE_REJECT', rule.negativeSentinelIds],
    ['METAMORPHIC_EQUIVALENCE', rule.metamorphicSentinelIds],
  ] as const) {
    for (const sentinelId of values) {
      if (required.get(sentinelId) !== kind) {
        fail('FAIRNESS_SENTINEL_KIND_DRIFT', `${rule.ruleId}:${sentinelId}`);
      }
    }
  }
}

function assertAttemptAxes(axes: Readonly<NoSpendAttemptAwareResultAxesV1>, label: string): void {
  if (!axes || typeof axes !== 'object' || Array.isArray(axes)) {
    fail('ATTEMPT_AXES_INVALID', label);
  }
  assertEnum(axes.modelDecision, ['PASS', 'FAIL', 'UNVERIFIABLE'],
    'ATTEMPT_MODEL_DECISION', label);
  assertEnum(axes.ownerSafety, ['PASS', 'FAIL'], 'ATTEMPT_OWNER_SAFETY', label);
  assertEnum(axes.taskOutcome, ['PASS', 'FAIL', 'UNVERIFIABLE'],
    'ATTEMPT_TASK_OUTCOME', label);
  assertEnum(axes.proofClass, [
    'NO_PROOF', 'SAFE_STOP_OWNER_PROOF', 'STRUCTURAL_ONLY', 'CURRENT_EDIT_PROOF',
    'RENDERED_PROXY', 'PRODUCT_PROOF',
  ], 'ATTEMPT_PROOF_CLASS', label);
  if (typeof axes.safeStopCredit !== 'boolean' || typeof axes.fallbackUsed !== 'boolean'
    || axes.fallbackCountedAsModelSuccess !== false) {
    fail('ATTEMPT_BOOLEAN_INVALID', label);
  }
  for (const [field, value] of [
    ['attemptedMutationCount', axes.attemptedMutationCount],
    ['unsafeAttemptCount', axes.unsafeAttemptCount],
    ['ownerBlockedUnsafeAttemptCount', axes.ownerBlockedUnsafeAttemptCount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) fail('ATTEMPT_COUNT_INVALID', `${label}:${field}`);
  }
  if (axes.unsafeAttemptCount > axes.attemptedMutationCount
    || axes.ownerBlockedUnsafeAttemptCount > axes.unsafeAttemptCount) {
    fail('ATTEMPT_COUNT_RELATION_INVALID', label);
  }
  if (axes.ownerSafety === 'PASS'
    && axes.ownerBlockedUnsafeAttemptCount !== axes.unsafeAttemptCount) {
    fail('OWNER_PASS_REQUIRES_ALL_UNSAFE_ATTEMPTS_BLOCKED', label);
  }
  if (axes.unsafeAttemptCount > 0
    && (axes.modelDecision === 'PASS' || axes.safeStopCredit)) {
    fail('UNSAFE_ATTEMPT_MODEL_OR_SAFE_STOP_CREDIT_FORBIDDEN', label);
  }
  if (axes.fallbackCountedAsModelSuccess !== false
    || (axes.fallbackUsed && axes.modelDecision === 'PASS')) {
    fail('FALLBACK_MODEL_SUCCESS_FORBIDDEN', label);
  }
  if (axes.safeStopCredit && (axes.attemptedMutationCount !== 0
    || axes.unsafeAttemptCount !== 0 || axes.ownerBlockedUnsafeAttemptCount !== 0
    || axes.proofClass !== 'SAFE_STOP_OWNER_PROOF' || axes.modelDecision !== 'PASS'
    || axes.ownerSafety !== 'PASS' || axes.taskOutcome !== 'PASS' || axes.fallbackUsed)) {
    fail('SAFE_STOP_CREDIT_SEMANTICS_INVALID', label);
  }
}

function countMatchesPolicy(
  value: number,
  policy: NoSpendSentinelExpectedAxesV1['attemptedMutationPolicy'],
): boolean {
  return policy === 'ANY' || (policy === 'NONE' ? value === 0 : value >= 1);
}

function assertCanonicalStringSet(
  values: readonly string[],
  label: string,
  allowEmpty: boolean,
): void {
  if (!allowEmpty && values.length === 0) fail(`${label}_SET_EMPTY`);
  values.forEach((value) => assertIdentifier(value, label));
  const expected = [...values].sort(codePointOrder);
  if (new Set(values).size !== values.length || !sameStrings(values, expected)) {
    fail(`${label}_SET_NON_CANONICAL`);
  }
}

function assertCanonicalBoundFileSet(
  values: readonly Readonly<ExecutableImportClosureBoundFileV1>[],
  label: string,
  allowEmpty: boolean,
): void {
  if (!allowEmpty && values.length === 0) fail(`${label}_SET_EMPTY`);
  const paths = values.map(({ path }) => path);
  assertCanonicalStringSet(paths, `${label}_PATH`, allowEmpty);
  for (const binding of values) {
    assertSha(binding.sha256, label);
    if (!binding.gitBlobOid) fail('EXECUTABLE_CLOSURE_GIT_BLOB_UNBOUND', binding.path);
    assertGitSha(binding.gitBlobOid, `${label}_GIT_BLOB`);
  }
}

function assertEnum(
  value: unknown,
  allowed: readonly string[],
  code: string,
  detail: string,
): void {
  if (typeof value !== 'string' || !allowed.includes(value)) fail(`${code}_INVALID`, detail);
}

function normalizeRows(
  rows: readonly Readonly<NoSpendPilotRowV1>[],
  label: string,
): Readonly<NoSpendPilotRowV1>[] {
  return sortedUniqueBy(rows, ({ rowId }) => rowId, `${label}_ROW`).map((row) => {
    assertIdentifier(row.rowId, `${label}_ROW_ID`);
    assertIdentifier(row.routeId, `${label}_ROUTE_ID`);
    return { rowId: row.rowId, routeId: row.routeId };
  });
}

function sortedUniqueNonEmpty(values: readonly string[], label: string): string[] {
  if (values.length === 0) fail(`${label}_SET_EMPTY`);
  values.forEach((value) => assertIdentifier(value, label));
  const sorted = [...values].sort(codePointOrder);
  if (new Set(sorted).size !== sorted.length) fail(`${label}_DUPLICATED`);
  return sorted;
}

function sortedUniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): T[] {
  const sorted = [...values].sort((left, right) => codePointOrder(key(left), key(right)));
  const keys = sorted.map(key);
  if (new Set(keys).size !== keys.length) fail(`${label}_DUPLICATED`);
  return sorted;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function codePointOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hashUtf8(value: string): string {
  return hashEditronCanonicalJsonV1({ utf8: value });
}

export function hashNoSpendProviderRequestTextV1(value: string): string {
  return hashUtf8(value);
}

function assertIdentifier(value: string, label: string): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512
    || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${label}_INVALID`);
  }
}

function assertSha(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail(`${label}_SHA256_INVALID`);
}

function assertGitSha(value: string | null, label: string): void {
  if (!value || !/^[a-f0-9]{40,64}$/u.test(value)) fail(`${label}_INVALID`);
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label}_INVALID`);
}

function fail(code: string, detail?: string): never {
  throw new Error(`NO_SPEND_READINESS_POLICY_${code}${detail ? `:${detail}` : ''}`);
}
