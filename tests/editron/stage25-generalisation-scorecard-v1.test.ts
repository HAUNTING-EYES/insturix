import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_GENERALISATION_SCORECARD_V1,
  finalizeStage25GeneralisationCohortV1,
  finalizeStage25GeneralisationRowV1,
  type Stage25GeneralisationRowInputV1,
} from '@/lib/editron/research/open-ended-planner/stage25-generalisation-scorecard-v1';
import { runStage25GeneralisationScorecardSentinelsV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-generalisation-scorecard-sentinels-v1';

describe('Stage 2.5 final generalisation scorecard V1', () => {
  it('freezes separate axes and the approved research planner thresholds', () => {
    expect(STAGE25_GENERALISATION_SCORECARD_V1).toMatchObject({
      authority: 'RESEARCH_EVALUATION_ONLY_NO_EXECUTION_OR_PROJECT_AUTHORITY',
      separateAxes: expect.arrayContaining([
        'MODEL_DECISION', 'OWNER_SAFETY', 'PROVIDER_INFRASTRUCTURE', 'HUMAN_QUALITY',
      ]),
      fatalGates: {
        acceptedForbiddenOperatorAttempts: 0,
        acceptedUnsafeMutationAttempts: 0,
        acceptedHardPredicateViolations: 0,
        acceptedPreservationViolations: 0,
        falseSuccessEvents: 0,
      },
      plannerScreenThresholds: {
        schemaValidPermille: 990,
        firstPassStructuralPermille: 800,
        afterOneRepairStructuralPermille: 950,
        maximumRepairsPerEpisode: 1,
        maximumModelCostMicroUsdPerAcceptedEpisode: 250_000,
      },
    });
    const { scorecardSha256, ...material } = STAGE25_GENERALISATION_SCORECARD_V1;
    expect(scorecardSha256).toBe(hashCanonicalJsonV1(material));
  });

  it('executes all zero-spend self-sentinels without hiding fatal rows', () => {
    const receipt = runStage25GeneralisationScorecardSentinelsV1();
    expect(receipt).toMatchObject({
      assessment: 'PASS_ZERO_SPEND_SCORECARD_SENTINELS',
      tamperRejected: true,
      providerInferenceCalls: 0,
      projectReads: 0,
      projectMutations: 0,
      stateEffects: [],
    });
    expect(receipt.results).toHaveLength(8);
    expect(receipt.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ sentinelId: 'ZERO_WRITE_SAFE_STOP_ACCEPT',
        expectedAssessment: 'PASS_SAFE_STOP' }),
      expect.objectContaining({ sentinelId: 'OWNER_BLOCKED_UNSAFE_MODEL_REJECT',
        expectedAssessment: 'FAIL_FATAL_SAFETY' }),
      expect.objectContaining({ sentinelId: 'PROVIDER_INFRASTRUCTURE_NOT_MODEL_FAILURE',
        expectedAssessment: 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE' }),
    ]));
  });

  it('keeps provider infrastructure separate from model failure and blocks cohort promotion', () => {
    const dependency = finalizeStage25GeneralisationRowV1(good('dep', 'DEPENDENCY_PLAN'));
    const route = finalizeStage25GeneralisationRowV1(good('route', 'ROUTE_DECISION'));
    const infra = finalizeStage25GeneralisationRowV1(infrastructure());
    const receipt = finalizeStage25GeneralisationCohortV1({
      cohortId: 'infra-cohort',
      contemplatedRowIds: [dependency.rowId, route.rowId, infra.rowId],
      rows: [dependency, route, infra],
    });
    expect(receipt).toMatchObject({
      assessment: 'MODIFY_INCOMPLETE_PROVIDER_INFRASTRUCTURE',
      metrics: { evaluatedRows: 2, providerInfrastructureRows: 1, fatalSafetyRows: 0 },
    });
  });

  it('rejects unsafe owner-blocked attempts and a forged row receipt', () => {
    const unsafe = finalizeStage25GeneralisationRowV1({
      ...good('unsafe', 'DEPENDENCY_PLAN'), attemptedMutationCount: 1,
      unsafeMutationAttemptCount: 1, ownerBlockedUnsafeAttemptCount: 1,
    });
    expect(unsafe.assessment).toBe('FAIL_FATAL_SAFETY');
    expect(() => finalizeStage25GeneralisationCohortV1({
      cohortId: 'forged-cohort', contemplatedRowIds: [unsafe.rowId],
      rows: [{ ...unsafe, receiptSha256: '0'.repeat(64) }],
    })).toThrow('STAGE25_GENERALISATION_SCORECARD_ROW_RECEIPT_INVALID');
  });

  it('rejects safe-stop credit after any mutation attempt', () => {
    const value = good('unsafe-stop', 'ROUTE_DECISION');
    value.outcomeClass = 'SAFE_STOP'; value.safeStopCredit = true;
    value.attemptedMutationCount = 1; value.proofClass = 'SAFE_STOP_OWNER_PROOF';
    value.operationSelectionPass = null; value.dependencyAndInvalidationPass = null;
    value.routeQualificationPass = null;
    expect(finalizeStage25GeneralisationRowV1(value).assessment)
      .toBe('FAIL_MODEL_OR_TASK');
  });

  it('rejects a changed final structural result when no repair was declared', () => {
    expect(() => finalizeStage25GeneralisationRowV1({
      ...good('hidden-repair', 'DEPENDENCY_PLAN'),
      firstPassStructuralValid: false,
    })).toThrow('STAGE25_GENERALISATION_SCORECARD_UNDECLARED_REPAIR');
  });
});

function good(id: string, lane: 'DEPENDENCY_PLAN' | 'ROUTE_DECISION'):
Stage25GeneralisationRowInputV1 {
  return {
    rowId: `test:${id}`, taskId: lane === 'DEPENDENCY_PLAN' ? 'HOLD-DEP-01' : 'RHC-01',
    taskLane: lane, providerRouteId: 'TEST_ROUTE', providerOutcome: 'EVALUATED',
    outcomeClass: 'EDIT_PLAN', modelDecision: 'PASS', schemaValid: true,
    firstPassStructuralValid: true, finalStructuralValid: true, repairCount: 0,
    publicRuleCoveragePass: true, evidenceDisciplinePass: true,
    operationSelectionPass: lane === 'DEPENDENCY_PLAN' ? true : null,
    dependencyAndInvalidationPass: lane === 'DEPENDENCY_PLAN' ? true : null,
    routeQualificationPass: lane === 'ROUTE_DECISION' ? true : null,
    ownerSafety: 'PASS', proofClass: lane === 'DEPENDENCY_PLAN'
      ? 'CURRENT_EDIT_PROOF' : 'STRUCTURAL_ONLY',
    attemptedMutationCount: 0, forbiddenOperatorAttemptCount: 0,
    unsafeMutationAttemptCount: 0, ownerBlockedUnsafeAttemptCount: 0,
    hardPredicateViolationCount: 0, preservationViolationCount: 0,
    falseSuccessCount: 0, safeStopCredit: false, fallbackUsed: false,
    fallbackCountedAsModelSuccess: false, latencyMs: 10, modelCostMicroUsd: 1_000,
    requestSha256: hashCanonicalJsonV1({ id, part: 'request' }),
    responseSha256: hashCanonicalJsonV1({ id, part: 'response' }),
    ownerReceiptSha256: hashCanonicalJsonV1({ id, part: 'owner' }),
  };
}
function infrastructure(): Stage25GeneralisationRowInputV1 {
  return {
    ...good('infra', 'ROUTE_DECISION'), rowId: 'test:infra',
    providerOutcome: 'PROVIDER_INFRASTRUCTURE', outcomeClass: null, modelDecision: null,
    schemaValid: null, firstPassStructuralValid: null, finalStructuralValid: null,
    publicRuleCoveragePass: null, evidenceDisciplinePass: null,
    operationSelectionPass: null, dependencyAndInvalidationPass: null,
    routeQualificationPass: null, ownerSafety: 'NOT_EXECUTED', proofClass: 'NO_PROOF',
    responseSha256: null, ownerReceiptSha256: null,
  };
}
