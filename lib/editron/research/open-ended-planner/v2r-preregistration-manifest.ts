import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  cap2aPlannerDossierIdentityV2R,
  type Cap2aPlannerDossierIdentityV2R,
} from './cap2a-planner-dossier-v2r';
import { DEV01_LOWERING_POLICY_V2R } from './dev01-lowering-policy-v2r';
import { DEV01_STAGE6_RENDER_PROOF_POLICY_V2 } from './dev01-stage6-render-proof-validator-v2';
import { DEV02_LOWERING_POLICY_V2R } from './dev02-lowering-policy-v2r';
import { DEV03_LOWERING_POLICY_V2R } from './dev03-lowering-policy-v2r';
import { DEV03_STAGE6_RENDER_PROOF_POLICY_V2 } from './dev03-stage6-render-proof-validator-v2';
import { DEV04_LOWERING_POLICY_V2R } from './dev04-lowering-policy-v2r';
import {
  buildV2RBenchmarkRouteRosterV2,
  V2R_BENCHMARK_ROUTE_ROSTER_VERSION,
  type V2RBenchmarkRouteIdentityV2,
} from './development-cohort-routes-v2';
import { buildEvaluatorPolicyFreezeV2R, EVALUATOR_FREEZE_POLICY_VERSION_V2R } from './evaluator-freeze-v2r';
import { GENERIC_LOWERING_POLICY_VERSION_V2R } from './generic-lowerer-v2r';
import { v2rOperatorCatalogIdentity, type V2ROperatorCatalogIdentity } from './operator-catalog-v2r';
import { PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R } from './per-attempt-budget-v2r';
import { STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R } from './stage2-selected-operator-contract-v2r';
import {
  buildV2RSemanticOperatorPolicyV2R,
  V2R_SEMANTIC_OPERATOR_POLICY_VERSION,
} from './v2r-semantic-operator-policy';

export const V2R_EXPERIMENT_VERSION = 'EDITRON_OE_V2R_SELECTED_OPERATOR_EXPERIMENT_V4' as const;

// V2-1R capstone: the single pre-registration manifest.
//
// The contaminated-benchmark postmortem's corrective rule is that an experiment
// cannot begin until ONE versioned manifest freezes every interpretation-bearing
// component. This manifest binds the complete V2R contract-reset surface — the
// selected-operator node contract, the generic zero-add/zero-drop lowerer policy,
// the per-attempt budget law, and the condition-aware evaluator freeze — into a
// single immutable, hashable artifact. A V2R run is only comparable evidence if
// it was produced under exactly this manifest; any component drift creates a new
// experiment version rather than silently extending this one.

export interface V2RPreregistrationManifest {
  experimentVersion: typeof V2R_EXPERIMENT_VERSION;
  authority: string;
  nodeContract: {
    version: typeof STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R;
    semantics: 'SELECTED_OPERATOR_VS_ALTERNATIVES';
    retiredSemantics: 'CANDIDATE_CAPABILITY_IDS_AMBIGUOUS';
  };
  lowerer: {
    policyVersion: typeof GENERIC_LOWERING_POLICY_VERSION_V2R;
    invariant: 'ZERO_CATALOG_OPERATOR_ADD_ZERO_SELECTED_OPERATOR_DROP';
    taskPolicySha256: {
      'DEV-01': string;
      'DEV-02': string;
      'DEV-03': string;
      'DEV-04': string;
    };
  };
  operatorCatalog: Readonly<V2ROperatorCatalogIdentity>;
  plannerDossier: Readonly<Cap2aPlannerDossierIdentityV2R>;
  causalExecution: {
    receiptExecutorIdentity: 'CAUSAL_COMPILED_GRAPH_INTERPRETER_V2R';
    taskContracts: readonly Readonly<{
      taskId: 'DEV-01' | 'DEV-03';
      executorOwner: string;
      proofPolicyVersion: string;
      authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
    }>[];
  };
  routeRoster: {
    version: typeof V2R_BENCHMARK_ROUTE_ROSTER_VERSION;
    routes: readonly Readonly<V2RBenchmarkRouteIdentityV2>[];
  };
  perAttemptBudget: {
    policyVersion: typeof PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R;
    rule: 'EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET';
  };
  evaluatorFreeze: {
    policyVersion: typeof EVALUATOR_FREEZE_POLICY_VERSION_V2R;
    policySha256: string;
  };
  semanticOperatorFreeze: {
    policyVersion: typeof V2R_SEMANTIC_OPERATOR_POLICY_VERSION;
    policySha256: string;
    exposure: 'EVALUATOR_ONLY_NOT_MODEL_INPUT';
  };
  manifestSha256: string;
}

export function buildV2RPreregistrationManifest(): Readonly<V2RPreregistrationManifest> {
  const evaluatorFreeze = buildEvaluatorPolicyFreezeV2R();
  const semanticOperatorFreeze = buildV2RSemanticOperatorPolicyV2R();
  const material = {
    experimentVersion: V2R_EXPERIMENT_VERSION,
    authority: 'RESEARCH_ONLY_V2R_PREREGISTRATION_NO_PROJECT_MUTATION',
    nodeContract: {
      version: STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R,
      semantics: 'SELECTED_OPERATOR_VS_ALTERNATIVES' as const,
      retiredSemantics: 'CANDIDATE_CAPABILITY_IDS_AMBIGUOUS' as const,
    },
    lowerer: {
      policyVersion: GENERIC_LOWERING_POLICY_VERSION_V2R,
      invariant: 'ZERO_CATALOG_OPERATOR_ADD_ZERO_SELECTED_OPERATOR_DROP' as const,
      taskPolicySha256: {
        'DEV-01': hashCanonicalJsonV1(DEV01_LOWERING_POLICY_V2R),
        'DEV-02': hashCanonicalJsonV1(DEV02_LOWERING_POLICY_V2R),
        'DEV-03': hashCanonicalJsonV1(DEV03_LOWERING_POLICY_V2R),
        'DEV-04': hashCanonicalJsonV1(DEV04_LOWERING_POLICY_V2R),
      },
    },
    operatorCatalog: v2rOperatorCatalogIdentity(),
    plannerDossier: cap2aPlannerDossierIdentityV2R(),
    causalExecution: {
      receiptExecutorIdentity: 'CAUSAL_COMPILED_GRAPH_INTERPRETER_V2R' as const,
      taskContracts: [
        {
          taskId: 'DEV-01' as const,
          executorOwner: 'dev01-stage6-generic-lowered-executor-v2r',
          proofPolicyVersion: DEV01_STAGE6_RENDER_PROOF_POLICY_V2,
          authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const,
        },
        {
          taskId: 'DEV-03' as const,
          executorOwner: 'dev03-stage6-generic-lowered-executor-v2r',
          proofPolicyVersion: DEV03_STAGE6_RENDER_PROOF_POLICY_V2,
          authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const,
        },
      ],
    },
    routeRoster: {
      version: V2R_BENCHMARK_ROUTE_ROSTER_VERSION,
      routes: buildV2RBenchmarkRouteRosterV2(),
    },
    perAttemptBudget: {
      policyVersion: PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R,
      rule: 'EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET' as const,
    },
    evaluatorFreeze: {
      policyVersion: EVALUATOR_FREEZE_POLICY_VERSION_V2R,
      policySha256: evaluatorFreeze.policySha256,
    },
    semanticOperatorFreeze: {
      policyVersion: V2R_SEMANTIC_OPERATOR_POLICY_VERSION,
      policySha256: semanticOperatorFreeze.policySha256,
      exposure: 'EVALUATOR_ONLY_NOT_MODEL_INPUT' as const,
    },
  };
  const manifestSha256 = hashCanonicalJsonV1(material);
  return deepFreezeV1({ ...material, manifestSha256 });
}

export function assertV2RPreregistrationComplete(manifest: unknown): Readonly<V2RPreregistrationManifest> {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('V2R_PREREGISTRATION_MISSING');
  }
  const candidate = manifest as Partial<V2RPreregistrationManifest>;
  if (candidate.experimentVersion !== V2R_EXPERIMENT_VERSION) {
    throw new Error('V2R_PREREGISTRATION_VERSION_DRIFT');
  }
  if (candidate.nodeContract?.version !== STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R) {
    throw new Error('V2R_PREREGISTRATION_NODE_CONTRACT_DRIFT');
  }
  if (candidate.lowerer?.policyVersion !== GENERIC_LOWERING_POLICY_VERSION_V2R) {
    throw new Error('V2R_PREREGISTRATION_LOWERER_DRIFT');
  }
  if (candidate.perAttemptBudget?.policyVersion !== PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R) {
    throw new Error('V2R_PREREGISTRATION_BUDGET_DRIFT');
  }
  if (candidate.evaluatorFreeze?.policyVersion !== EVALUATOR_FREEZE_POLICY_VERSION_V2R) {
    throw new Error('V2R_PREREGISTRATION_EVALUATOR_DRIFT');
  }
  if (candidate.semanticOperatorFreeze?.policyVersion !== V2R_SEMANTIC_OPERATOR_POLICY_VERSION) {
    throw new Error('V2R_PREREGISTRATION_SEMANTIC_POLICY_DRIFT');
  }
  const expected = buildV2RPreregistrationManifest();
  if (!same(candidate.lowerer, expected.lowerer)) {
    throw new Error('V2R_PREREGISTRATION_TASK_POLICY_DRIFT');
  }
  if (!same(candidate.operatorCatalog, expected.operatorCatalog)) {
    throw new Error('V2R_PREREGISTRATION_OPERATOR_CATALOG_DRIFT');
  }
  if (!same(candidate.plannerDossier, expected.plannerDossier)) {
    throw new Error('V2R_PREREGISTRATION_PLANNER_DOSSIER_DRIFT');
  }
  if (!same(candidate.causalExecution, expected.causalExecution)) {
    throw new Error('V2R_PREREGISTRATION_EXECUTION_CONTRACT_DRIFT');
  }
  if (!same(candidate.routeRoster, expected.routeRoster)) {
    throw new Error('V2R_PREREGISTRATION_ROUTE_ROSTER_DRIFT');
  }
  if (!same(candidate.evaluatorFreeze, expected.evaluatorFreeze)) {
    throw new Error('V2R_PREREGISTRATION_EVALUATOR_HASH_DRIFT');
  }
  if (!same(candidate.semanticOperatorFreeze, expected.semanticOperatorFreeze)) {
    throw new Error('V2R_PREREGISTRATION_SEMANTIC_POLICY_HASH_DRIFT');
  }
  const { manifestSha256, ...material } = candidate as V2RPreregistrationManifest;
  if (typeof manifestSha256 !== 'string' || hashCanonicalJsonV1(material) !== manifestSha256) {
    throw new Error('V2R_PREREGISTRATION_HASH_DRIFT');
  }
  if (!isDeepFrozen(manifest)) {
    throw new Error('V2R_PREREGISTRATION_NOT_IMMUTABLE');
  }
  return manifest as V2RPreregistrationManifest;
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
