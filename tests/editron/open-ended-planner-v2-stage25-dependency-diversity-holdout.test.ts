import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1,
  STAGE25_DEPENDENCY_DIVERSITY_TASK_IDS_V1,
} from '@/lib/editron/research/open-ended-planner/stage25-dependency-diversity-holdout-v1';
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
