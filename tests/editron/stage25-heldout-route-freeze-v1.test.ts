import { describe, expect, it } from 'vitest';

import {
  evaluateStage25HeldoutRouteCandidateV1,
  hashStage25HeldoutRouteCandidateV1,
  STAGE25_HELDOUT_ROUTE_EVALUATOR_VERSION_V1,
  type Stage25HeldoutRouteCandidateV1,
} from '@/lib/editron/research/open-ended-planner/stage25-heldout-route-evaluator-v1';
import {
  buildStage25HeldoutRoutePublicPacketV1,
  STAGE25_HELDOUT_ROUTE_ARMS_V1,
  STAGE25_HELDOUT_ROUTE_FREEZE_V1,
  type Stage25HeldoutRouteArmV1,
} from '@/lib/editron/research/open-ended-planner/stage25-heldout-route-freeze-v1';

type Route = NonNullable<Stage25HeldoutRouteCandidateV1['selectedRoute']>;
type CandidateUnsigned = Omit<Stage25HeldoutRouteCandidateV1, 'candidateSha256'>;

describe('Stage 2.5 heldout route freeze V1', () => {
  it('binds four new tasks to four arms without target drift or dispatch', () => {
    expect(STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks).toHaveLength(4);
    expect(STAGE25_HELDOUT_ROUTE_FREEZE_V1.arms).toHaveLength(16);
    expect(STAGE25_HELDOUT_ROUTE_FREEZE_V1).toMatchObject({
      dispatchAuthorized: false, providerInferenceCallCount: 0, stateEffects: [],
    });
    for (const task of STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks) {
      const arms = STAGE25_HELDOUT_ROUTE_FREEZE_V1.arms.filter(({ taskId }) => taskId === task.taskId);
      expect(arms.map(({ arm }) => arm)).toEqual(STAGE25_HELDOUT_ROUTE_ARMS_V1);
      expect(new Set(arms.map(({ targetMaterialSha256 }) => targetMaterialSha256)))
        .toEqual(new Set([task.taskSha256]));
    }
    expect(JSON.stringify(STAGE25_HELDOUT_ROUTE_FREEZE_V1)).not.toMatch(/DEV-02|H03/);
  });

  it('emits a public packet without evaluator keys or acceptable-route answers', () => {
    const packet = buildStage25HeldoutRoutePublicPacketV1({ taskId: 'RHC-01', arm: 'FREE_CHOICE' });
    const serialized = JSON.stringify(packet).toLowerCase();
    expect(serialized).not.toContain('evaluatorpolicy');
    expect(serialized).not.toContain('acceptableroute');
    expect(serialized).not.toContain('baseline');
    expect(serialized).not.toContain('sealed');
    expect(packet).toMatchObject({ dispatchAuthorized: false, arm: 'FREE_CHOICE' });
  });

  it.each([
    ['FORCED_NATIVE', 'NATIVE'],
    ['FORCED_GENERATED_COMPOSITION', 'GENERATED_COMPOSITION'],
    ['FORCED_HYBRID', 'HYBRID'],
  ] as const)('accepts a fully qualified %s structural sentinel', (arm, route) => {
    expect(evaluateStage25HeldoutRouteCandidateV1(candidate('RHC-01', arm, route)))
      .toMatchObject({ assessment: 'PASS_STRUCTURAL_SENTINEL', diagnostics: [] });
  });

  it('accepts multiple free-choice routes instead of one hidden expected recipe', () => {
    expect(evaluateStage25HeldoutRouteCandidateV1(candidate('RHC-04', 'FREE_CHOICE', 'NATIVE')).assessment)
      .toBe('PASS_STRUCTURAL_SENTINEL');
    expect(evaluateStage25HeldoutRouteCandidateV1(candidate('RHC-04', 'FREE_CHOICE', 'HYBRID')).assessment)
      .toBe('PASS_STRUCTURAL_SENTINEL');
  });

  it('accepts an untouched forced-route capability gap', () => {
    const value = unsigned('RHC-02', 'FORCED_GENERATED_COMPOSITION', 'GENERATED_COMPOSITION');
    value.disposition = 'CAPABILITY_GAP'; value.capabilityAvailable = false;
    value.qualifications = { nativeOwner: false, generatedSandbox: false, timebaseHandoff: false, audioHandoff: false, boundaryHandoff: false };
    value.canonicalEditableRepresentation = false; value.targetPredicatePassIds = [];
    value.preservationPredicatePassIds = []; value.proofLevel = 'SAFE_STOP_OWNER_PROOF';
    value.capabilityGapCode = 'CAPABILITY_GAP:GENERATED_OWNER_UNAVAILABLE';
    expect(evaluateStage25HeldoutRouteCandidateV1(sign(value)))
      .toMatchObject({ assessment: 'PASS_SAFE_STOP', diagnostics: [] });
  });

  it.each([
    ['wrong forced route', (value: CandidateUnsigned) => { value.selectedRoute = 'NATIVE'; }, 'FORCED_ROUTE_SUBSTITUTED'],
    ['flattened output', (value: CandidateUnsigned) => { value.canonicalEditableRepresentation = false; }, 'EDITABLE_REPRESENTATION_MISSING'],
    ['missing target predicate', (value: CandidateUnsigned) => { value.targetPredicatePassIds = value.targetPredicatePassIds.slice(1); }, 'TARGET_PREDICATES_INCOMPLETE'],
    ['incomplete hybrid join', (value: CandidateUnsigned) => { value.qualifications = { ...value.qualifications, boundaryHandoff: false }; }, 'ROUTE_QUALIFICATION_INCOMPLETE'],
    ['unavailable owner attempt', (value: CandidateUnsigned) => { value.capabilityAvailable = false; value.attemptedUnavailableOwner = true; }, 'EXECUTION_ELIGIBILITY_INVALID'],
    ['unknown route', (value: CandidateUnsigned) => { value.selectedRoute = 'MAGIC' as Route; value.checkedRouteFamilies = ['MAGIC' as Route]; }, 'ROUTE_INVALID'],
  ])('rejects %s', (_name, mutate, diagnostic) => {
    const value = unsigned('RHC-03', 'FORCED_HYBRID', 'HYBRID'); mutate(value);
    expect(evaluateStage25HeldoutRouteCandidateV1(sign(value)))
      .toMatchObject({ assessment: 'FAIL', diagnostics: expect.arrayContaining([diagnostic]) });
  });

  it('rejects a forged candidate hash and task substitution', () => {
    const valid = candidate('RHC-01', 'FORCED_NATIVE', 'NATIVE');
    expect(() => evaluateStage25HeldoutRouteCandidateV1({ ...valid, candidateSha256: '0'.repeat(64) }))
      .toThrow('STAGE25_HELDOUT_ROUTE_CANDIDATE_HASH_INVALID');
    const substituted = { ...valid, taskId: 'RHC-02' };
    const { candidateSha256: _ignored, ...material } = substituted;
    expect(() => evaluateStage25HeldoutRouteCandidateV1(sign(material)))
      .toThrow('STAGE25_HELDOUT_ROUTE_TASK_OR_ARM_BINDING_INVALID');
  });
});

function candidate(taskId: string, arm: Stage25HeldoutRouteArmV1, route: Route) {
  return sign(unsigned(taskId, arm, route));
}
function unsigned(taskId: string, arm: Stage25HeldoutRouteArmV1, route: Route): CandidateUnsigned {
  const task = STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks.find((value) => value.taskId === taskId) as Record<string, unknown>;
  const armRecord = STAGE25_HELDOUT_ROUTE_FREEZE_V1.arms.find((value) => value.taskId === taskId && value.arm === arm) as Record<string, unknown>;
  const ids = (field: string) => (task[field] as { predicateId: string }[]).map(({ predicateId }) => predicateId);
  return {
    version: STAGE25_HELDOUT_ROUTE_EVALUATOR_VERSION_V1, taskId, arm,
    taskSha256: String(task.taskSha256), armSha256: String(armRecord.armSha256),
    disposition: 'EXECUTED', selectedRoute: route, capabilityAvailable: true,
    attemptedUnavailableOwner: false, checkedRouteFamilies: [route],
    canonicalEditableRepresentation: true,
    qualifications: { nativeOwner: true, generatedSandbox: true, timebaseHandoff: true, audioHandoff: true, boundaryHandoff: true },
    targetPredicatePassIds: ids('targetPredicates'), preservationPredicatePassIds: ids('preservationPredicates'),
    capabilityGapCode: null, proofLevel: 'STRUCTURAL_SENTINEL', stateEffects: [],
  };
}
function sign(value: CandidateUnsigned): Stage25HeldoutRouteCandidateV1 {
  return { ...value, candidateSha256: hashStage25HeldoutRouteCandidateV1(value) };
}
