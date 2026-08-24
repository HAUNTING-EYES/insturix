import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1,
  STAGE25_DEPENDENCY_DIVERSITY_TASK_IDS_V1,
} from '@/lib/editron/research/open-ended-planner/stage25-dependency-diversity-holdout-v1';
import {
  auditDep02PublicOwnerGapV1,
  executeStage25DependencyDiversityOwnerScenarioV1,
  STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1,
} from '@/lib/editron/research/open-ended-planner/stage25-dependency-diversity-owner-materialization-v1';
import { runStage25DependencyDiversityOwnerSentinelsV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-dependency-diversity-owner-sentinel-runner-v1';
import { runStage25DependencyDiversitySentinelsV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-dependency-diversity-sentinel-runner-v1';

type JsonRecord = Record<string, unknown>;

describe('Stage 2.5 dependency-diversity no-spend freeze V1', () => {
  it('freezes four fresh tasks and remains blocked from inference', () => {
    const receipt = runStage25DependencyDiversitySentinelsV1(
      STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1,
    );
    expect(receipt).toMatchObject({
      assessment: 'PASS_ZERO_SPEND_SPEC_FREEZE',
      inferenceDisposition: 'NOT_READY_FOR_INFERENCE',
      providerInferenceCallCount: 0,
      stateEffects: [],
    });
    expect((receipt.taskReceipts as JsonRecord[]).map(({ taskId }) => taskId))
      .toEqual(STAGE25_DEPENDENCY_DIVERSITY_TASK_IDS_V1);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('keeps retime-event rebinding blocked on the public source-time-map gap', () => {
    const task = STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.tasks
      .find(({ taskId }) => taskId === 'HOLD-DEP-03');
    expect(task).toMatchObject({
      status: 'NOT_READY_PUBLIC_CONTRACT_GAP', proofCeiling: 'NO_PROOF',
      fixtureMaterialization: 'NOT_MATERIALIZED',
    });
    expect(task?.publicContractGap).toContain('receipt');
  });

  it.each([
    ['enabled dispatch', (freeze: JsonRecord) => { freeze.dispatchAuthorized = true; }, 'DISPATCH_ENABLED'],
    ['hidden scored rule', (freeze: JsonRecord) => {
      const task = firstTask(freeze); task.scoredRuleIds = [...task.scoredRuleIds as string[], 'HIDDEN-RULE'];
    }, 'HIDDEN_OR_UNSCORED_RULE:HOLD-DEP-01'],
    ['missing safe-stop sentinel', (freeze: JsonRecord) => {
      const task = firstTask(freeze); task.sentinels = (task.sentinels as JsonRecord[]).filter(({ kind }) => kind !== 'SAFE_STOP');
    }, 'SENTINEL_COVERAGE_MISSING:HOLD-DEP-01:SAFE_STOP'],
    ['unknown operator', (freeze: JsonRecord) => {
      const task = firstTask(freeze); task.eligibleOperatorIds = ['made_up']; task.eligibleOperatorRefs = ['EDITRON_OPERATOR_SPECS_V2R_9#made_up'];
    }, 'V2R_OPERATOR_CATALOG_UNKNOWN_OPERATOR:made_up'],
    ['historical task substitution', (freeze: JsonRecord) => { firstTask(freeze).taskId = 'HOLD-01'; }, 'TASK_SET_INVALID'],
    ['unsafe attempt credited as safe stop', (freeze: JsonRecord) => {
      const task = firstTask(freeze);
      const sentinel = (task.sentinels as JsonRecord[]).find(({ kind }) => kind === 'KNOWN_BAD') as JsonRecord;
      sentinel.expected = { modelAssessment: 'PASS', ownerAssessment: 'PASS', benchmarkAssessment: 'PASS', proofLevel: 'SAFE_STOP_OWNER_PROOF', mutationAttemptPolicy: 'ZERO_MUTATION_ATTEMPTS' };
    }, 'UNSAFE_ATTEMPT_CREDIT_INVALID:HOLD-DEP-01'],
    ['retime gap promoted', (freeze: JsonRecord) => {
      const task = (freeze.tasks as JsonRecord[]).find(({ taskId }) => taskId === 'HOLD-DEP-03') as JsonRecord;
      task.status = 'OWNER_IMPLEMENTATION_REQUIRED'; task.proofCeiling = 'CURRENT_EDIT_PROOF'; task.publicContractGap = null;
    }, 'PUBLIC_GAP_INVALID:HOLD-DEP-03'],
  ])('rejects a self-rehashed %s', (_name, mutate, code) => {
    const freeze = structuredClone(STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1) as unknown as JsonRecord;
    mutate(freeze); rehash(freeze);
    expect(() => runStage25DependencyDiversitySentinelsV1(freeze)).toThrow(code);
  });

  it('rejects a forged freeze hash before interpreting tasks', () => {
    const freeze = structuredClone(STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1) as unknown as JsonRecord;
    freeze.freezeSha256 = '0'.repeat(64);
    expect(() => runStage25DependencyDiversitySentinelsV1(freeze))
      .toThrow('STAGE25_DEPENDENCY_DIVERSITY_FREEZE_HASH_INVALID');
  });

  it('recomputes the same receipt for the same exact freeze', () => {
    expect(runStage25DependencyDiversitySentinelsV1(STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1))
      .toEqual(runStage25DependencyDiversitySentinelsV1(structuredClone(STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1)));
  });

  it('materializes only the tasks that current public owners can execute honestly', () => {
    const tasks = STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1.tasks;
    expect(tasks.find(({ taskId }) => taskId === 'HOLD-DEP-01')).toMatchObject({
      disposition: 'EXECUTABLE_ZERO_SPEND_OWNER', proofCeiling: 'CURRENT_EDIT_PROOF',
    });
    expect(tasks.find(({ taskId }) => taskId === 'HOLD-DEP-04')).toMatchObject({
      disposition: 'EXECUTABLE_ZERO_SPEND_OWNER', proofCeiling: 'CURRENT_EDIT_PROOF',
    });
    expect(tasks.find(({ taskId }) => taskId === 'HOLD-DEP-02')).toMatchObject({
      disposition: 'NOT_EXECUTABLE_PUBLIC_FORM_OWNER_GAP', proofCeiling: 'NO_PROOF',
    });
    expect(tasks.find(({ taskId }) => taskId === 'HOLD-DEP-03')).toMatchObject({
      disposition: 'NOT_EXECUTABLE_PUBLIC_SOURCE_TIME_MAP_GAP', proofCeiling: 'NO_PROOF',
    });
    const dep02Audit = auditDep02PublicOwnerGapV1();
    expect(dep02Audit).toMatchObject({
      resolvedOperatorId: 'use_matching_footage',
      resolvedOperatorEligibleInFrozenTask: false,
      observedReplacementHandoffFields: ['assetId', 'overlayId', 'sourceStartFrame'],
      structuralBindingCriteria: {
        rights: ['rightsStatus', 'rightsEvidenceId'],
        sourceHandles: ['sourceStartFrame', 'sourceEndFrame'],
      },
      hasRightsBinding: false,
      hasSourceHandleBinding: false,
    });
    expect(dep02Audit.unrelatedCandidateNote).toContain('rights and source handles');
    expect(STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1).toMatchObject({
      fixtureEvidenceProvenance: {
        status: 'DETERMINISTIC_SYNTHETIC_FIXTURES_ONLY',
        evidenceQualityCeiling: 'STRUCTURAL_OWNER_MECHANICS_ONLY',
        doesNotEstablish: [
          'REAL_COLOUR_EVIDENCE_QUALITY',
          'REAL_MOTION_EVIDENCE_QUALITY',
          'REAL_AUDIO_EVIDENCE_QUALITY',
          'REAL_EDITORIAL_QUALITY',
        ],
      },
      providerInferenceCallCount: 0, renderCallCount: 0,
      canonicalProjectMutationCount: 0, stateEffects: [],
    });
  });

  it.each([
    ['missing evidence ID', 'DEP04_MISSING_EVIDENCE_GUARD_REJECT',
      'UNSAFE_ATTEMPT_BLOCKED', 'D04_EVIDENCE_BINDING_INVALID'],
    ['forged evidence ID', 'DEP04_FORGED_EVIDENCE_ID_GUARD_REJECT',
      'TAMPER_REJECTED', 'D04_EVIDENCE_BINDING_INVALID'],
    ['tampered evidence fact', 'DEP04_TAMPERED_EVIDENCE_FACT_GUARD_REJECT',
      'TAMPER_REJECTED', 'D04_MATERIALIZED_EVIDENCE_INVALID'],
  ])('blocks a D04 cut before owner execution for %s', async (
    _case,
    sentinelId,
    ownerDisposition,
    guardCode,
  ) => {
    const outcome = await executeStage25DependencyDiversityOwnerScenarioV1(sentinelId);
    expect(outcome).toMatchObject({
      taskId: 'HOLD-DEP-04', ownerDisposition,
      proofArtifactKind: 'NONE', operationAttemptCount: 1,
      ownerBlockedAttemptCount: 1, isolatedMutationCount: 0,
      canonicalProjectMutationCount: 0, finalSemanticStateSha256: null,
      observations: [{ guardCode }],
    });
  });

  it('derives executable-task axes from owner outcomes while preserving public gaps', async () => {
    const receipt = await runStage25DependencyDiversityOwnerSentinelsV1();
    expect(receipt).toMatchObject({
      assessment: 'PASS_ZERO_SPEND_OWNER_EXECUTION_WITH_PUBLIC_GAPS',
      inferenceDisposition: 'NOT_READY_FOR_INFERENCE',
      executedTaskIds: ['HOLD-DEP-01', 'HOLD-DEP-04'],
      blockedTaskIds: ['HOLD-DEP-02', 'HOLD-DEP-03'],
      providerInferenceCallCount: 0, renderCallCount: 0,
      canonicalProjectMutationCount: 0, stateEffects: [],
    });
    const taskReceipts = receipt.taskReceipts as JsonRecord[];
    expect(taskReceipts.filter(({ taskId }) => taskId === 'HOLD-DEP-01' || taskId === 'HOLD-DEP-04'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ taskId: 'HOLD-DEP-01', disposition: 'PASS_EXECUTED_ZERO_SPEND_OWNER_SENTINELS', frozenExpectationMatchCount: 6 }),
        expect.objectContaining({ taskId: 'HOLD-DEP-04', disposition: 'PASS_EXECUTED_ZERO_SPEND_OWNER_SENTINELS', frozenExpectationMatchCount: 6 }),
      ]));
    expect(taskReceipts.find(({ taskId }) => taskId === 'HOLD-DEP-02'))
      .toMatchObject({ disposition: 'NOT_READY_PUBLIC_FORM_OWNER_GAP' });
    expect(taskReceipts.find(({ taskId }) => taskId === 'HOLD-DEP-03'))
      .toMatchObject({ disposition: 'NOT_READY_PUBLIC_SOURCE_TIME_MAP_GAP' });

    const results = receipt.sentinelResults as JsonRecord[];
    expect(results.find(({ sentinelId }) => sentinelId === 'DEP01_AMBIGUOUS_CAST_SAFE_STOP_ACCEPT'))
      .toMatchObject({ ownerDisposition: 'ZERO_WRITE_SAFE_STOP', actual: {
        modelAssessment: 'PASS', ownerAssessment: 'PASS', benchmarkAssessment: 'PASS',
        proofLevel: 'SAFE_STOP_OWNER_PROOF', mutationAttemptPolicy: 'ZERO_MUTATION_ATTEMPTS',
      }, operationAttemptCount: 0 });
    expect(results.find(({ sentinelId }) => sentinelId === 'DEP04_STALE_UNSHIFTED_SECOND_RANGE_REJECT'))
      .toMatchObject({ ownerDisposition: 'UNSAFE_ATTEMPT_BLOCKED', actual: {
        modelAssessment: 'FAIL', ownerAssessment: 'PASS', benchmarkAssessment: 'FAIL',
        proofLevel: 'NO_PROOF', mutationAttemptPolicy: 'ATTEMPTED_UNSAFE_OWNER_BLOCKED',
      }, unsafeAttemptCount: 1, ownerBlockedAttemptCount: 1 });
    expect(results.find(({ sentinelId }) => sentinelId === 'DEP01_TAMPERED_TRACE_REJECT'))
      .toMatchObject({ ownerDisposition: 'TAMPER_REJECTED', actual: {
        modelAssessment: 'UNVERIFIABLE', ownerAssessment: 'FAIL',
        benchmarkAssessment: 'UNVERIFIABLE', proofLevel: 'NO_PROOF',
      } });
  });

  it('accepts equivalent dependency orders only when their final semantic state agrees', async () => {
    const [exact, permuted, lateFirst, transformedLate] = await Promise.all([
      executeStage25DependencyDiversityOwnerScenarioV1('DEP01_EXACT_THREE_ACCEPT'),
      executeStage25DependencyDiversityOwnerScenarioV1('DEP01_WRITER_PERMUTATIONS_EQUIVALENT'),
      executeStage25DependencyDiversityOwnerScenarioV1('DEP04_LATE_THEN_EARLY_ACCEPT'),
      executeStage25DependencyDiversityOwnerScenarioV1('DEP04_EARLY_THEN_TRANSFORMED_LATE_EQUIVALENT'),
    ]);
    expect(permuted.finalSemanticStateSha256).toBe(exact.finalSemanticStateSha256);
    expect(permuted).toMatchObject({ operationAttemptCount: 18, isolatedMutationCount: 18 });
    expect(transformedLate.finalSemanticStateSha256).toBe(lateFirst.finalSemanticStateSha256);
    expect([lateFirst, transformedLate]).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationAttemptCount: 2, isolatedMutationCount: 2 }),
      expect.objectContaining({ operationAttemptCount: 2, isolatedMutationCount: 2 }),
    ]));
  });

  it('rejects a validly rehashed substitute materialization', async () => {
    const materialization = structuredClone(
      STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1,
    ) as unknown as JsonRecord;
    materialization.runtimeContractClosure = { status: 'FORGED_SUBSTITUTE' };
    delete materialization.materializationSha256;
    materialization.materializationSha256 = hashCanonicalJsonV1(materialization);
    await expect(runStage25DependencyDiversityOwnerSentinelsV1(
      STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1,
      materialization,
    )).rejects.toThrow('STAGE25_DEPENDENCY_DIVERSITY_OWNER_SENTINEL_EXACT_MATERIALIZATION_IDENTITY_MISMATCH');
  });

  it('recomputes the same owner-derived receipt for the same exact artifacts', async () => {
    expect(await runStage25DependencyDiversityOwnerSentinelsV1())
      .toEqual(await runStage25DependencyDiversityOwnerSentinelsV1(
        structuredClone(STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1),
        structuredClone(STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1),
      ));
  });
});

function firstTask(freeze: JsonRecord): JsonRecord { return (freeze.tasks as JsonRecord[])[0]; }
function rehash(freeze: JsonRecord): void {
  freeze.tasks = (freeze.tasks as JsonRecord[]).map((task) => {
    const unsigned = structuredClone(task); delete unsigned.taskSha256;
    return { ...unsigned, taskSha256: hashCanonicalJsonV1(unsigned) };
  });
  const unsigned = structuredClone(freeze); delete unsigned.freezeSha256;
  freeze.freezeSha256 = hashCanonicalJsonV1(unsigned);
}
