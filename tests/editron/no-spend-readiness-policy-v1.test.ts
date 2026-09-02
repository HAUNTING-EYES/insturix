import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '../../lib/editron/services/canonical-json-v1';
import {
  NO_SPEND_LAUNCHER_POLICY_V1,
  NO_SPEND_POST_RUN_AUDIT_POLICY_V1,
  NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1,
  assertStageAgainstPilotPolicyV1,
  buildNoSpendFairnessLedgerV1,
  buildNoSpendPilotPolicyV1,
  buildNoSpendSentinelClaimSetV1,
  hashNoSpendProviderRequestTextV1,
  type NoSpendFairnessLedgerInputV1,
  type NoSpendFairnessRuleBindingInputV1,
  type NoSpendReadinessLaneV1,
  type NoSpendSentinelClaimInputV1,
} from '../../lib/editron/research/open-ended-planner/no-spend-readiness-policy-v1';

describe('no-spend readiness policy v1', () => {
  it('freezes the lane sentinel sets, launcher separation, and all-row audit policy', () => {
    expect(NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1
      .SEALED_HOLDOUT_GENERALISATION_V4R2.map(({ sentinelId }) => sentinelId)).toEqual([
      'V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT',
      'V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS',
      'V4_GENERATE_WITHOUT_REQUIRED_EVIDENCE_REJECT',
      'V4_NOISY_TRANSCRIPT_EDIT_REJECT',
      'V4_REFRAME_WITHOUT_SPATIAL_TRACKING_REJECT',
      'V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT',
      'V4_H04_MULTI_CUT_FINAL_STATE_EQUIVALENT',
      'V4_TAMPERED_TRACE_REJECT',
    ]);
    expect(NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1
      .STAGE25_LONG_FORM_PROVIDER_V3.map(({ sentinelId }) => sentinelId)).toEqual([
      'LF_RANGE_SCOPE_OMITTED_DERIVED_ACCEPT',
      'LF_RANGE_SCOPE_EXPLICIT_EQUIVALENT_ACCEPT',
      'LF_RANGE_SCOPE_UNKNOWN_REJECT',
      'LF_FALSE_READY_UNRESOLVED_EVIDENCE_REJECT',
      'LF_STRUCTURAL_PASS_NOT_PRODUCT_PROOF',
    ]);
    expect(NO_SPEND_LAUNCHER_POLICY_V1).toEqual({
      resolvedDeclaredCommand: 'REQUIRE_PRESENT_AND_MATCH_DECLARATION',
      zeroInferenceValidationLauncher: 'ALLOW_KNOWN_NON_DECLARED_LAUNCHER',
      paidRunnerLauncher: 'REQUIRE_DECLARED_LAUNCHER_MATCH',
    });
    expect(NO_SPEND_POST_RUN_AUDIT_POLICY_V1).toMatchObject({
      coverage: 'ALL_ROWS_AND_ALL_ATTEMPTS',
      scoringBlockedUntilAudit: true,
      promotionBlockedUntilAudit: true,
      modelFailureRateForbiddenWhenHarnessConfounded: true,
    });
  });

  it('builds a deterministic exact-once public-hidden fairness ledger', () => {
    const input = fairnessInput('SEALED_HOLDOUT_GENERALISATION_V4R2');
    const first = buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', input,
    );
    const reordered = buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', {
        ...input,
        hiddenPredicateIds: [...input.hiddenPredicateIds].reverse(),
        ruleBindings: [...input.ruleBindings].reverse(),
      },
    );
    expect(reordered.ledgerSha256).toBe(first.ledgerSha256);
    expect(first.hiddenPredicateCoverage).toBe('PASS_EXACTLY_ONCE');
    expect(first.providerRequestLeakageAssessment).toBe('PASS_NO_EVALUATOR_TOKEN_LEAK');
  });

  it('rejects missing, duplicated, hidden-only, echo, owner-credit, and proof-ceiling defects', () => {
    const v4 = fairnessInput('SEALED_HOLDOUT_GENERALISATION_V4R2');
    expect(() => buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', {
        ...v4,
        hiddenPredicateIds: [...v4.hiddenPredicateIds, 'P_ORPHAN'],
      },
    )).toThrow(/HIDDEN_PREDICATE_COVERAGE_INCOMPLETE/);

    const duplicated = replaceRule(v4, 'V4_REVISION_ATTEMPT_SAFETY', (rule) => ({
      ...rule, hiddenPredicateIds: [...rule.hiddenPredicateIds, 'P_EVIDENCE'],
    }));
    expect(() => buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', duplicated,
    )).toThrow(/HIDDEN_PREDICATE_DUPLICATED_ACROSS_RULES/);

    const hiddenModelRule = replaceRule(v4, 'V4_REQUIRED_EVIDENCE', (rule) => ({
      ...rule, publicRuleRefs: [],
    }));
    expect(() => buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', hiddenModelRule,
    )).toThrow(/MODEL_DECISION_PUBLIC_RULE_MISSING/);

    const ownerCredit = replaceRule(v4, 'V4_OWNER_SAFETY_SEPARATION', (rule) => ({
      ...rule, modelCreditAllowed: true,
    }));
    expect(() => buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', ownerCredit,
    )).toThrow(/OWNER_SAFETY_MODEL_CREDIT_FORBIDDEN/);

    const longForm = fairnessInput('STAGE25_LONG_FORM_PROVIDER_V3');
    const echo = replaceRule(longForm, 'LF_RANGE_SCOPE_DERIVATION', (rule) => ({
      ...rule, providerEchoRequired: true,
    }));
    expect(() => buildNoSpendFairnessLedgerV1(
      'STAGE25_LONG_FORM_PROVIDER_V3', echo,
    )).toThrow(/HARNESS_DERIVATION_PROVIDER_ECHO_FORBIDDEN/);

    const promoted = replaceRule(longForm, 'LF_STRUCTURAL_PROOF_CEILING', (rule) => ({
      ...rule, maximumProofClass: 'PRODUCT_PROOF',
    }));
    expect(() => buildNoSpendFairnessLedgerV1(
      'STAGE25_LONG_FORM_PROVIDER_V3', promoted,
    )).toThrow(/FAIRNESS_PROOF_CEILING_DRIFT/);

    const lowered = replaceRule(v4, 'V4_REQUIRED_EVIDENCE', (rule) => ({
      ...rule, maximumProofClass: 'NO_PROOF',
    }));
    expect(() => buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', lowered,
    )).toThrow(/FAIRNESS_PROOF_CEILING_DRIFT/);

    const duplicatedPublicRef = replaceRule(v4, 'V4_REQUIRED_EVIDENCE', (rule) => ({
      ...rule, publicRuleRefs: [...rule.publicRuleRefs, ...rule.publicRuleRefs],
    }));
    expect(() => buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', duplicatedPublicRef,
    )).toThrow(/PUBLIC_RULE_REF_V4_REQUIRED_EVIDENCE_DUPLICATED/);
  });

  it('rejects evaluator leakage and incomplete bidirectional/metamorphic claim sets', () => {
    const input = fairnessInput('SEALED_HOLDOUT_GENERALISATION_V4R2');
    const leakedText = '{"public":"SECRET_EVALUATOR_TOKEN"}';
    expect(() => buildNoSpendFairnessLedgerV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2', {
        ...input,
        providerRequestCaptures: [{
          captureId: 'capture-1',
          serializedRequest: leakedText,
          requestSha256: hashNoSpendProviderRequestTextV1(leakedText),
        }],
      },
    )).toThrow(/PROVIDER_REQUEST_EVALUATOR_TOKEN_LEAK/);

    const claims = sentinelClaims('SEALED_HOLDOUT_GENERALISATION_V4R2');
    for (const sentinelId of [
      'V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT',
      'V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS',
      'V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT',
    ]) {
      expect(() => buildNoSpendSentinelClaimSetV1(
        'SEALED_HOLDOUT_GENERALISATION_V4R2',
        claims.filter((claim) => claim.sentinelId !== sentinelId),
      )).toThrow(/SENTINEL_CLAIM_SET_DRIFT/);
    }
    expect(() => buildNoSpendSentinelClaimSetV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2',
      claims.map((claim) => claim.sentinelId === 'V4_H02_VARIABLE_DURATION_SEQUENCE_EQUIVALENT'
        ? { ...claim, transformationSha256: null } : claim),
    )).toThrow(/METAMORPHIC_TRANSFORMATION_BINDING_MISSING/);
  });

  it('separates unsafe attempts and fallbacks from model success', () => {
    const claims = sentinelClaims('SEALED_HOLDOUT_GENERALISATION_V4R2');
    expect(() => buildNoSpendSentinelClaimSetV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2',
      claims.map((claim) => claim.sentinelId === 'V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS'
        ? { ...claim, axes: { ...claim.axes, modelDecision: 'PASS' } } : claim),
    )).toThrow(/UNSAFE_ATTEMPT_MODEL_OR_SAFE_STOP_CREDIT_FORBIDDEN/);
    expect(() => buildNoSpendSentinelClaimSetV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2',
      claims.map((claim) => claim.sentinelId === 'V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'
        ? { ...claim, axes: { ...claim.axes, fallbackUsed: true } } : claim),
    )).toThrow(/FALLBACK_MODEL_SUCCESS_FORBIDDEN/);

    expect(() => buildNoSpendSentinelClaimSetV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2',
      claims.map((claim) => claim.sentinelId === 'V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'
        ? { ...claim, axes: { ...claim.axes, attemptedMutationCount: 1 } } : claim),
    )).toThrow(/SENTINEL_EXPECTATION_MISMATCH|SAFE_STOP_CREDIT_SEMANTICS_INVALID/);

    expect(() => buildNoSpendSentinelClaimSetV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2',
      claims.map((claim) => claim.sentinelId === 'V4_STALE_WRITE_BLOCKED_MODEL_FAIL_OWNER_PASS'
        ? { ...claim, axes: { ...claim.axes, ownerBlockedUnsafeAttemptCount: 0 } } : claim),
    )).toThrow(/OWNER_PASS_REQUIRES_ALL_UNSAFE_ATTEMPTS_BLOCKED/);

    expect(() => buildNoSpendSentinelClaimSetV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2',
      claims.map((claim) => claim.sentinelId === 'V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'
        ? { ...claim, axes: { ...claim.axes, fallbackUsed: 0 as unknown as boolean } } : claim),
    )).toThrow(/ATTEMPT_BOOLEAN_INVALID/);

    expect(() => buildNoSpendSentinelClaimSetV1(
      'SEALED_HOLDOUT_GENERALISATION_V4R2',
      claims.map((claim) => claim.sentinelId === 'V4_SAFE_STOP_WITHOUT_WRITE_ATTEMPT_ACCEPT'
        ? { ...claim, axes: { ...claim.axes,
          proofClass: 'FAKE_PROOF' as typeof claim.axes.proofClass } } : claim),
    )).toThrow(/ATTEMPT_PROOF_CLASS_INVALID/);
  });

  it('requires a non-scored one-per-route pilot and an audit before cohort stage', () => {
    const unaudited = buildNoSpendPilotPolicyV1(pilotPolicyInput(null));
    expect(assertStageAgainstPilotPolicyV1('PILOT', unaudited)).toMatchObject({
      maximumProviderAttempts: 3,
      absoluteMaxSpendMicroUsd: 30_000,
    });
    expect(() => assertStageAgainstPilotPolicyV1('SCORED_COHORT', unaudited))
      .toThrow(/SCORED_COHORT_PILOT_AUDIT_REQUIRED/);

    const audited = buildNoSpendPilotPolicyV1(pilotPolicyInput(hash('pilot-audit')));
    expect(assertStageAgainstPilotPolicyV1('SCORED_COHORT', audited)).toMatchObject({
      maximumProviderAttempts: 3,
      absoluteMaxSpendMicroUsd: 90_000,
    });
    expect(() => assertStageAgainstPilotPolicyV1('PILOT', audited))
      .toThrow(/PILOT_STAGE_PREEXISTING_AUDIT_FORBIDDEN/);
  });
});

export function fairnessInput(lane: NoSpendReadinessLaneV1): NoSpendFairnessLedgerInputV1 {
  const request = '{"public":"context"}';
  const ruleBindings: NoSpendFairnessRuleBindingInputV1[] = lane
    === 'SEALED_HOLDOUT_GENERALISATION_V4R2'
    ? [
      binding('V4_REQUIRED_EVIDENCE', 'P_EVIDENCE', 'CURRENT_EDIT_PROOF'),
      binding('V4_REVISION_ATTEMPT_SAFETY', 'P_REVISION', 'CURRENT_EDIT_PROOF'),
      binding('V4_OUTCOME_EQUIVALENCE', 'P_OUTCOME', 'CURRENT_EDIT_PROOF'),
      { ...binding('V4_OWNER_SAFETY_SEPARATION', 'P_OWNER', 'NO_PROOF'),
        modelCreditAllowed: false },
    ]
    : [
      { ...binding('LF_RANGE_SCOPE_DERIVATION', 'P_SCOPE', 'STRUCTURAL_ONLY'),
        providerEchoRequired: false },
      binding('LF_EVIDENCE_READINESS', 'P_READY', 'STRUCTURAL_ONLY'),
      { ...binding('LF_STRUCTURAL_PROOF_CEILING', 'P_PROOF', 'STRUCTURAL_ONLY'),
        modelCreditAllowed: false },
    ];
  return {
    publicPacketSetSha256: hash(`${lane}:public`),
    hiddenEvaluatorSetSha256: hash(`${lane}:hidden`),
    hiddenPredicateIds: ruleBindings.flatMap(({ hiddenPredicateIds }) => hiddenPredicateIds),
    evaluatorOnlyLeakageTokens: ['SECRET_EVALUATOR_TOKEN'],
    providerRequestCaptures: [{
      captureId: 'capture-1', serializedRequest: request,
      requestSha256: hashNoSpendProviderRequestTextV1(request),
    }],
    ruleBindings,
  };
}

export function sentinelClaims(lane: NoSpendReadinessLaneV1): NoSpendSentinelClaimInputV1[] {
  return NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1[lane].map((requirement) => {
    const unsafeAttemptCount = requirement.expected.unsafeAttemptPolicy === 'AT_LEAST_ONE' ? 1 : 0;
    const attemptedMutationCount = requirement.expected.attemptedMutationPolicy === 'AT_LEAST_ONE'
      ? 1 : 0;
    return {
      sentinelId: requirement.sentinelId,
      fixtureSha256: hash(`${requirement.sentinelId}:fixture`),
      transformationSha256: requirement.kind === 'METAMORPHIC_EQUIVALENCE'
        ? hash(`${requirement.sentinelId}:transform`) : null,
      evaluatorResultSha256: hash(`${requirement.sentinelId}:result`),
      axes: {
        modelDecision: requirement.expected.modelDecision,
        ownerSafety: requirement.expected.ownerSafety,
        taskOutcome: requirement.expected.taskOutcome,
        proofClass: requirement.expected.proofClass,
        attemptedMutationCount,
        unsafeAttemptCount,
        ownerBlockedUnsafeAttemptCount: unsafeAttemptCount,
        safeStopCredit: requirement.expected.safeStopCredit,
        fallbackUsed: false,
        fallbackCountedAsModelSuccess: false,
      },
    };
  });
}

export function pilotPolicyInput(pilotAuditReceiptSha256: string | null) {
  return {
    providerRouteIds: ['google', 'luna', 'terra'],
    pilotRows: ['google', 'luna', 'terra'].map((routeId) => ({
      rowId: `pilot-${routeId}`, routeId,
    })),
    scoredRows: ['google', 'luna', 'terra'].map((routeId) => ({
      rowId: `scored-${routeId}`, routeId,
    })),
    absoluteMaxPilotSpendMicroUsd: 30_000,
    absoluteMaxScoredCohortSpendMicroUsd: 90_000,
    pilotAuditReceiptSha256,
  } as const;
}

export function hash(value: unknown): string {
  return hashEditronCanonicalJsonV1(value);
}

function binding(
  ruleId: string,
  hiddenPredicateId: string,
  maximumProofClass: NoSpendFairnessRuleBindingInputV1['maximumProofClass'],
): NoSpendFairnessRuleBindingInputV1 {
  return {
    ruleId,
    publicRuleRefs: [{ artifactSha256: hash(`${ruleId}:public`), jsonPointer: '/rules/0' }],
    hiddenPredicateIds: [hiddenPredicateId],
    providerEchoRequired: false,
    modelCreditAllowed: true,
    maximumProofClass,
  };
}

function replaceRule(
  input: NoSpendFairnessLedgerInputV1,
  ruleId: string,
  replace: (rule: Readonly<NoSpendFairnessRuleBindingInputV1>) =>
    Readonly<NoSpendFairnessRuleBindingInputV1>,
): NoSpendFairnessLedgerInputV1 {
  return {
    ...input,
    ruleBindings: input.ruleBindings.map((rule) => rule.ruleId === ruleId ? replace(rule) : rule),
  };
}
