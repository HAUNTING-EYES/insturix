import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { DEV01_LOWERING_POLICY_V2R } from './dev01-lowering-policy-v2r';
import { buildEvaluatorPolicyFreezeV2R, EVALUATOR_FREEZE_POLICY_VERSION_V2R } from './evaluator-freeze-v2r';
import { GENERIC_LOWERING_POLICY_VERSION_V2R } from './generic-lowerer-v2r';
import { PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R } from './per-attempt-budget-v2r';
import { STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R } from './stage2-selected-operator-contract-v2r';

export const V2R_EXPERIMENT_VERSION = 'EDITRON_OE_V2R_SELECTED_OPERATOR_EXPERIMENT' as const;

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
    dev01PolicySha256: string;
  };
  perAttemptBudget: {
    policyVersion: typeof PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R;
    rule: 'EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET';
  };
  evaluatorFreeze: {
    policyVersion: typeof EVALUATOR_FREEZE_POLICY_VERSION_V2R;
    policySha256: string;
  };
  manifestSha256: string;
}

export function buildV2RPreregistrationManifest(): Readonly<V2RPreregistrationManifest> {
  const evaluatorFreeze = buildEvaluatorPolicyFreezeV2R();
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
      dev01PolicySha256: hashCanonicalJsonV1(DEV01_LOWERING_POLICY_V2R),
    },
    perAttemptBudget: {
      policyVersion: PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R,
      rule: 'EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET' as const,
    },
    evaluatorFreeze: {
      policyVersion: EVALUATOR_FREEZE_POLICY_VERSION_V2R,
      policySha256: evaluatorFreeze.policySha256,
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
  const { manifestSha256, ...material } = candidate as V2RPreregistrationManifest;
  if (typeof manifestSha256 !== 'string' || hashCanonicalJsonV1(material) !== manifestSha256) {
    throw new Error('V2R_PREREGISTRATION_HASH_DRIFT');
  }
  if (!Object.isFrozen(manifest)) {
    throw new Error('V2R_PREREGISTRATION_NOT_IMMUTABLE');
  }
  return manifest as V2RPreregistrationManifest;
}
