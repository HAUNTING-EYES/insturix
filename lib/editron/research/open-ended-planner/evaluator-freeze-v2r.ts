import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const EVALUATOR_FREEZE_POLICY_VERSION_V2R =
  'EDITRON_OE_EVALUATOR_FREEZE_POLICY_V2R_2' as const;

// V2-1R condition-aware evaluator freeze.
//
// One of the contaminated-benchmark failure modes was adjusting evaluator
// expectations after seeing model output. The corrected law: the evaluator
// policy — which evaluators score which task/condition/stage, and the expected
// disposition per condition — is frozen into an immutable, hashable manifest
// BEFORE any provider dispatch. A run that cannot produce this manifest, or
// whose manifest hash drifts, must not score provider output.
//
// The expected dispositions below are the condition-aware ground truth taken
// from the canonical V2R chains, not invented targets: a withheld-evidence
// condition must stop UNVERIFIABLE, a capability-gap task must stay
// CAPABILITY_GAP, and a fully-bound baseline must reach READY_FOR_COMPILATION.

export interface EvaluatorConditionPolicyV2R {
  conditionId: string;
  expectedStageDisposition: 'READY_FOR_COMPILATION' | 'CAPABILITY_GAP' | 'UNVERIFIABLE';
  expectedLoweringDisposition: 'COMPILED_RESEARCH_PROXY' | 'CAPABILITY_GAP' | 'NOT_RUN';
  expectedStage6Disposition: 'PASS' | 'HONEST_CAPABILITY_GAP' | 'NOT_RUN';
  withheldEvidenceIds: readonly string[];
}

export interface EvaluatorTaskPolicyV2R {
  taskId: string;
  executionForm: 'NATIVE' | 'HYBRID' | 'GENERATED_COMPOSITION';
  evaluatorOwners: readonly string[];
  conditions: readonly EvaluatorConditionPolicyV2R[];
}

export interface EvaluatorPolicyFreezeV2R {
  policyVersion: typeof EVALUATOR_FREEZE_POLICY_VERSION_V2R;
  authority: string;
  frozenBeforeProviderDispatch: true;
  tasks: readonly EvaluatorTaskPolicyV2R[];
  policySha256: string;
}

const EVALUATOR_TASK_POLICIES_V2R: readonly EvaluatorTaskPolicyV2R[] = [
  {
    taskId: 'DEV-01',
    executionForm: 'NATIVE',
    evaluatorOwners: [
      'dev01-stage123-evaluator-v2',
      'generic-lowerer-v2r',
      'dev01-stage6-generic-lowered-executor-v2r',
      'dev01-stage6-render-proof-validator-v2',
    ],
    conditions: [
      {
        conditionId: 'BASELINE', expectedStageDisposition: 'READY_FOR_COMPILATION',
        expectedLoweringDisposition: 'COMPILED_RESEARCH_PROXY', expectedStage6Disposition: 'PASS',
        withheldEvidenceIds: [],
      },
      {
        conditionId: 'VISUAL_EVIDENCE_WITHHELD', expectedStageDisposition: 'UNVERIFIABLE',
        expectedLoweringDisposition: 'NOT_RUN', expectedStage6Disposition: 'NOT_RUN',
        withheldEvidenceIds: ['EV-DEV01-V1'],
      },
    ],
  },
  {
    taskId: 'DEV-02',
    executionForm: 'HYBRID',
    evaluatorOwners: ['dev02-reference-evaluator-v2', 'generic-lowerer-v2r'],
    conditions: [
      {
        conditionId: 'BASELINE', expectedStageDisposition: 'CAPABILITY_GAP',
        expectedLoweringDisposition: 'CAPABILITY_GAP', expectedStage6Disposition: 'HONEST_CAPABILITY_GAP',
        withheldEvidenceIds: [],
      },
    ],
  },
  {
    taskId: 'DEV-03',
    executionForm: 'NATIVE',
    evaluatorOwners: [
      'dev03-stage123-evaluator-v2',
      'generic-lowerer-v2r',
      'dev03-stage6-generic-lowered-executor-v2r',
      'dev03-stage6-render-proof-validator-v2',
    ],
    conditions: [
      {
        conditionId: 'BASELINE', expectedStageDisposition: 'READY_FOR_COMPILATION',
        expectedLoweringDisposition: 'COMPILED_RESEARCH_PROXY', expectedStage6Disposition: 'PASS',
        withheldEvidenceIds: [],
      },
      {
        conditionId: 'BEAT_EVIDENCE_WITHHELD', expectedStageDisposition: 'UNVERIFIABLE',
        expectedLoweringDisposition: 'NOT_RUN', expectedStage6Disposition: 'NOT_RUN',
        withheldEvidenceIds: ['EV-DEV03-B1'],
      },
    ],
  },
  {
    taskId: 'DEV-04',
    executionForm: 'NATIVE',
    evaluatorOwners: ['dev04-capability-gap-chain-v2', 'generic-lowerer-v2r'],
    conditions: [{
      conditionId: 'BASELINE', expectedStageDisposition: 'CAPABILITY_GAP',
      expectedLoweringDisposition: 'CAPABILITY_GAP', expectedStage6Disposition: 'HONEST_CAPABILITY_GAP',
      withheldEvidenceIds: [],
    }],
  },
];

export function buildEvaluatorPolicyFreezeV2R(): Readonly<EvaluatorPolicyFreezeV2R> {
  const material = {
    policyVersion: EVALUATOR_FREEZE_POLICY_VERSION_V2R,
    authority: 'RESEARCH_ONLY_EVALUATOR_FROZEN_BEFORE_DISPATCH',
    frozenBeforeProviderDispatch: true as const,
    tasks: EVALUATOR_TASK_POLICIES_V2R,
  };
  const policySha256 = hashCanonicalJsonV1(material);
  return deepFreezeV1({ ...material, policySha256 });
}

export function assertEvaluatorPolicyFrozenV2R(freeze: unknown): Readonly<EvaluatorPolicyFreezeV2R> {
  if (!freeze || typeof freeze !== 'object' || Array.isArray(freeze)) {
    throw new Error('EVALUATOR_FREEZE_MISSING');
  }
  const candidate = freeze as Partial<EvaluatorPolicyFreezeV2R>;
  if (candidate.policyVersion !== EVALUATOR_FREEZE_POLICY_VERSION_V2R) {
    throw new Error('EVALUATOR_FREEZE_VERSION_DRIFT');
  }
  if (candidate.frozenBeforeProviderDispatch !== true) {
    throw new Error('EVALUATOR_FREEZE_NOT_DECLARED_BEFORE_DISPATCH');
  }
  if (!Array.isArray(candidate.tasks) || !candidate.tasks.length) {
    throw new Error('EVALUATOR_FREEZE_TASKS_EMPTY');
  }
  const { policySha256, ...material } = candidate as EvaluatorPolicyFreezeV2R;
  if (typeof policySha256 !== 'string' || hashCanonicalJsonV1(material) !== policySha256) {
    throw new Error('EVALUATOR_FREEZE_HASH_DRIFT');
  }
  const expected = buildEvaluatorPolicyFreezeV2R();
  if (!same(candidate.tasks, expected.tasks) || candidate.authority !== expected.authority) {
    throw new Error('EVALUATOR_FREEZE_COMPONENT_DRIFT');
  }
  if (!isDeepFrozen(freeze)) {
    throw new Error('EVALUATOR_FREEZE_NOT_IMMUTABLE');
  }
  return freeze as EvaluatorPolicyFreezeV2R;
}

function same(left: unknown, right: unknown): boolean {
  try {
    return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
  } catch {
    return false;
  }
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((entry) => isDeepFrozen(entry, seen));
}
