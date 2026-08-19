import { describe, expect, it } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { getCanonicalDev02V2RV2 } from '@/lib/editron/research/open-ended-planner/dev02-canonical-v2r-v2';
import { getCanonicalDev04ConnectedChainV2 } from '@/lib/editron/research/open-ended-planner/dev04-capability-gap-chain-v2';
import {
  assertEvaluatorPolicyFrozenV2R,
  buildEvaluatorPolicyFreezeV2R,
  EVALUATOR_FREEZE_POLICY_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/evaluator-freeze-v2r';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { readFile } from 'node:fs/promises';

describe('V2-1R condition-aware evaluator freeze', () => {
  it('builds an immutable, hashable evaluator policy manifest', () => {
    const freeze = buildEvaluatorPolicyFreezeV2R();
    expect(Object.isFrozen(freeze)).toBe(true);
    expect(freeze.policyVersion).toBe(EVALUATOR_FREEZE_POLICY_VERSION_V2R);
    expect(freeze.frozenBeforeProviderDispatch).toBe(true);
    expect(freeze.tasks.map(({ taskId }) => taskId)).toEqual(['DEV-01', 'DEV-02', 'DEV-03', 'DEV-04']);
    expect(freeze.tasks.find(({ taskId }) => taskId === 'DEV-03')?.conditions[0]).toMatchObject({
      expectedLoweringDisposition: 'COMPILED_RESEARCH_PROXY',
      expectedStage6Disposition: 'PASS',
    });
    expect(typeof freeze.policySha256).toBe('string');
    expect(freeze.policySha256).toHaveLength(64);
  });

  it('is reproducible: the same policy always freezes to the same hash', () => {
    expect(buildEvaluatorPolicyFreezeV2R().policySha256).toBe(buildEvaluatorPolicyFreezeV2R().policySha256);
  });

  it('accepts a valid freeze and rejects tampered, drifted, or mutable manifests', () => {
    const freeze = buildEvaluatorPolicyFreezeV2R();
    expect(assertEvaluatorPolicyFrozenV2R(freeze)).toBe(freeze);

    expect(() => assertEvaluatorPolicyFrozenV2R(undefined)).toThrow('EVALUATOR_FREEZE_MISSING');
    expect(() => assertEvaluatorPolicyFrozenV2R({ ...freeze, policyVersion: 'WRONG' })).toThrow('EVALUATOR_FREEZE_VERSION_DRIFT');
    expect(() => assertEvaluatorPolicyFrozenV2R({ ...freeze, frozenBeforeProviderDispatch: false })).toThrow('EVALUATOR_FREEZE_NOT_DECLARED_BEFORE_DISPATCH');
    expect(() => assertEvaluatorPolicyFrozenV2R({ ...freeze, policySha256: '0'.repeat(64) })).toThrow('EVALUATOR_FREEZE_HASH_DRIFT');
    const tamperedTask = structuredClone(freeze);
    (tamperedTask.tasks[0].conditions[0] as { expectedStageDisposition: string }).expectedStageDisposition = 'UNVERIFIABLE';
    expect(() => assertEvaluatorPolicyFrozenV2R(tamperedTask)).toThrow('EVALUATOR_FREEZE_HASH_DRIFT');
    const unfrozen = structuredClone(freeze);
    expect(() => assertEvaluatorPolicyFrozenV2R(unfrozen)).toThrow('EVALUATOR_FREEZE_NOT_IMMUTABLE');

    const forged = structuredClone(freeze) as unknown as {
      tasks: Array<{ evaluatorOwners: string[] }>;
      policySha256: string;
      [key: string]: unknown;
    };
    forged.tasks[0].evaluatorOwners[0] = 'post-output-replacement-evaluator';
    const { policySha256: _discarded, ...forgedMaterial } = forged;
    forged.policySha256 = hashCanonicalJsonV1(forgedMaterial);
    Object.freeze(forged);
    expect(() => assertEvaluatorPolicyFrozenV2R(forged)).toThrow('EVALUATOR_FREEZE_COMPONENT_DRIFT');
  });

  it('frozen dispositions match the actual canonical V2R chains, not invented targets', async () => {
    const freeze = buildEvaluatorPolicyFreezeV2R();
    const dev01 = getCanonicalDev01Stage123V2();
    const dev02 = getCanonicalDev02V2RV2();
    const dev04 = getCanonicalDev04ConnectedChainV2();
    const [audioBytes, analyzerSourceBytes] = await Promise.all([
      readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
      readFile('lib/editron/services/media/beat-detection-service.ts'),
    ]);
    const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
    const dev03 = getCanonicalDev03Stage123V2({ measuredEvidence: measured, withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2() });

    const actual: Record<string, Record<string, string>> = {
      'DEV-01': {
        BASELINE: String(dev01.evidenceBoundIntentsV2R.BASELINE.stageDisposition),
        VISUAL_EVIDENCE_WITHHELD: String(dev01.evidenceBoundIntentsV2R.VISUAL_EVIDENCE_WITHHELD.stageDisposition),
      },
      'DEV-02': { BASELINE: String(dev02.evidenceBoundIntent.stageDisposition) },
      'DEV-03': {
        BASELINE: String(dev03.evidenceBoundIntentsV2R.BASELINE.stageDisposition),
        BEAT_EVIDENCE_WITHHELD: String(dev03.evidenceBoundIntentsV2R.BEAT_EVIDENCE_WITHHELD.stageDisposition),
      },
      'DEV-04': { BASELINE: String(dev04.evidenceBoundIntent.stageDisposition) },
    };
    for (const task of freeze.tasks) {
      for (const condition of task.conditions) {
        expect(actual[task.taskId]?.[condition.conditionId], `${task.taskId}/${condition.conditionId}`).toBe(condition.expectedStageDisposition);
      }
    }
  });
});
