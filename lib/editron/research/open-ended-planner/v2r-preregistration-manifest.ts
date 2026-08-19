import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildCap2aPlannerToolSheetV2R,
  CAP2A_PLANNER_TOOL_SHEET_VERSION_V2R,
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
import {
  GENERIC_LOWERER_IMPLEMENTATION_VERSION_V2R,
  GENERIC_LOWERING_POLICY_VERSION_V2R,
} from './generic-lowerer-v2r';
import {
  V2R_OPERATOR_CATALOG,
  v2rOperatorCatalogIdentity,
  type V2ROperatorCatalogIdentity,
} from './operator-catalog-v2r';
import {
  PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R,
  V2R_PROVIDER_STAGE_BUDGET_SCHEDULE_VERSION,
  v2rProviderStageBudgetScheduleIdentity,
  type V2RProviderStageBudgetScheduleIdentity,
} from './per-attempt-budget-v2r';
import { PLANNER_OWNERSHIP_STAGE2_PACKET_VERSION_V2R } from './planner-ownership-stage2-packet-v2r';
import { STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R } from './stage2-selected-operator-contract-v2r';
import {
  providerStageInstructionIdentityV2,
  PROVIDER_STAGE_INSTRUCTION_CONTRACT_VERSION_V2,
} from './staged-packet-v2';
import {
  buildV2RSemanticOperatorPolicyV2R,
  V2R_SEMANTIC_OPERATOR_POLICY_VERSION,
} from './v2r-semantic-operator-policy';
import { V2R_RESEARCH_EXECUTION_CONTRACT_VERSION } from './v2r-research-execution-contract';
import {
  buildV2RStage6TaskAdapterRegistry,
  V2R_STAGE6_TASK_ADAPTER_REGISTRY_VERSION,
} from './v2r-stage6-task-adapter-registry';

export const V2R_CONNECTED_EPISODE_RECEIPT_VERSION =
  'EDITRON_OE_V2R_CONNECTED_EPISODE_RECEIPT_V5' as const;
export const V2R_STAGE5_EXECUTION_DECISION_VERSION =
  'EDITRON_OE_V2R_STAGE5_EXECUTION_DECISION_V4' as const;
export const V2R_EXPERIMENT_VERSION = 'EDITRON_OE_V2R_SELECTED_OPERATOR_EXPERIMENT_V18' as const;

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
    stage2PacketVersion: typeof PLANNER_OWNERSHIP_STAGE2_PACKET_VERSION_V2R;
    semantics: 'SELECTED_OPERATOR_VS_ALTERNATIVES';
    retiredSemantics: 'CANDIDATE_CAPABILITY_IDS_AMBIGUOUS';
  };
  stageInstructions: {
    version: typeof PROVIDER_STAGE_INSTRUCTION_CONTRACT_VERSION_V2;
    instructionsSha256: string;
  };
  lowerer: {
    implementationVersion: typeof GENERIC_LOWERER_IMPLEMENTATION_VERSION_V2R;
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
  plannerToolSheet: {
    version: typeof CAP2A_PLANNER_TOOL_SHEET_VERSION_V2R;
    operatorCount: number;
    sheetSha256: string;
  };
  executionOrchestration: {
    connectedEpisodeReceiptVersion: typeof V2R_CONNECTED_EPISODE_RECEIPT_VERSION;
    stage5ExecutionDecisionVersion: typeof V2R_STAGE5_EXECUTION_DECISION_VERSION;
    capabilityGapRule: 'STOP_BEFORE_LOWERING_NO_EXECUTION_AUTHORIZATION';
  };
  causalExecution: {
    receiptExecutorIdentity: 'CAUSAL_COMPILED_GRAPH_INTERPRETER_V2R';
    researchExecutionContractVersion: typeof V2R_RESEARCH_EXECUTION_CONTRACT_VERSION;
    taskAdapterRegistry: {
      version: typeof V2R_STAGE6_TASK_ADAPTER_REGISTRY_VERSION;
      registrySha256: string;
    };
    taskContracts: readonly Readonly<{
      taskId: 'DEV-01' | 'DEV-03';
      adapterId: string;
      executorOwner: string;
      supportedOperatorIds: readonly string[];
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
    providerStageSchedule: Readonly<V2RProviderStageBudgetScheduleIdentity>;
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
  const taskAdapterRegistry = buildV2RStage6TaskAdapterRegistry();
  const operatorRecords = Array.isArray(V2R_OPERATOR_CATALOG.operators)
    ? V2R_OPERATOR_CATALOG.operators.filter((operator): operator is Record<string, unknown> => (
        Boolean(operator) && typeof operator === 'object' && !Array.isArray(operator)
      ))
    : [];
  const plannerToolSheet = buildCap2aPlannerToolSheetV2R(operatorRecords);
  const material = {
    experimentVersion: V2R_EXPERIMENT_VERSION,
    authority: 'RESEARCH_ONLY_V2R_PREREGISTRATION_NO_PROJECT_MUTATION',
    nodeContract: {
      version: STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R,
      stage2PacketVersion: PLANNER_OWNERSHIP_STAGE2_PACKET_VERSION_V2R,
      semantics: 'SELECTED_OPERATOR_VS_ALTERNATIVES' as const,
      retiredSemantics: 'CANDIDATE_CAPABILITY_IDS_AMBIGUOUS' as const,
    },
    stageInstructions: providerStageInstructionIdentityV2(),
    lowerer: {
      implementationVersion: GENERIC_LOWERER_IMPLEMENTATION_VERSION_V2R,
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
    plannerToolSheet: {
      version: plannerToolSheet.version,
      operatorCount: plannerToolSheet.operators.length,
      sheetSha256: plannerToolSheet.sheetSha256,
    },
    executionOrchestration: {
      connectedEpisodeReceiptVersion: V2R_CONNECTED_EPISODE_RECEIPT_VERSION,
      stage5ExecutionDecisionVersion: V2R_STAGE5_EXECUTION_DECISION_VERSION,
      capabilityGapRule: 'STOP_BEFORE_LOWERING_NO_EXECUTION_AUTHORIZATION' as const,
    },
    causalExecution: {
      receiptExecutorIdentity: 'CAUSAL_COMPILED_GRAPH_INTERPRETER_V2R' as const,
      researchExecutionContractVersion: V2R_RESEARCH_EXECUTION_CONTRACT_VERSION,
      taskAdapterRegistry: {
        version: taskAdapterRegistry.version,
        registrySha256: taskAdapterRegistry.registrySha256,
      },
      taskContracts: taskAdapterRegistry.adapters.map((adapter) => ({
        taskId: adapter.taskId,
        adapterId: adapter.adapterId,
        executorOwner: adapter.ownerRef,
        supportedOperatorIds: [...adapter.supportedOperatorIds],
        proofPolicyVersion: adapter.taskId === 'DEV-01'
          ? DEV01_STAGE6_RENDER_PROOF_POLICY_V2
          : DEV03_STAGE6_RENDER_PROOF_POLICY_V2,
        authority: adapter.executionAuthority,
      })),
    },
    routeRoster: {
      version: V2R_BENCHMARK_ROUTE_ROSTER_VERSION,
      routes: buildV2RBenchmarkRouteRosterV2(),
    },
    perAttemptBudget: {
      policyVersion: PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R,
      rule: 'EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET' as const,
      providerStageSchedule: v2rProviderStageBudgetScheduleIdentity(),
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
  if (candidate.nodeContract?.stage2PacketVersion !== PLANNER_OWNERSHIP_STAGE2_PACKET_VERSION_V2R) {
    throw new Error('V2R_PREREGISTRATION_STAGE2_PACKET_DRIFT');
  }
  if (candidate.stageInstructions?.version !== PROVIDER_STAGE_INSTRUCTION_CONTRACT_VERSION_V2) {
    throw new Error('V2R_PREREGISTRATION_STAGE_INSTRUCTION_VERSION_DRIFT');
  }
  if (candidate.lowerer?.policyVersion !== GENERIC_LOWERING_POLICY_VERSION_V2R) {
    throw new Error('V2R_PREREGISTRATION_LOWERER_DRIFT');
  }
  if (candidate.lowerer?.implementationVersion !== GENERIC_LOWERER_IMPLEMENTATION_VERSION_V2R) {
    throw new Error('V2R_PREREGISTRATION_LOWERER_IMPLEMENTATION_DRIFT');
  }
  if (candidate.executionOrchestration?.connectedEpisodeReceiptVersion
    !== V2R_CONNECTED_EPISODE_RECEIPT_VERSION
    || candidate.executionOrchestration?.stage5ExecutionDecisionVersion
    !== V2R_STAGE5_EXECUTION_DECISION_VERSION) {
    throw new Error('V2R_PREREGISTRATION_EXECUTION_ORCHESTRATION_DRIFT');
  }
  if (candidate.causalExecution?.researchExecutionContractVersion
    !== V2R_RESEARCH_EXECUTION_CONTRACT_VERSION) {
    throw new Error('V2R_PREREGISTRATION_RESEARCH_EXECUTION_CONTRACT_DRIFT');
  }
  if (candidate.causalExecution?.taskAdapterRegistry?.version
    !== V2R_STAGE6_TASK_ADAPTER_REGISTRY_VERSION) {
    throw new Error('V2R_PREREGISTRATION_TASK_ADAPTER_REGISTRY_VERSION_DRIFT');
  }
  if (candidate.perAttemptBudget?.policyVersion !== PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R) {
    throw new Error('V2R_PREREGISTRATION_BUDGET_DRIFT');
  }
  if (candidate.perAttemptBudget?.providerStageSchedule?.version
    !== V2R_PROVIDER_STAGE_BUDGET_SCHEDULE_VERSION) {
    throw new Error('V2R_PREREGISTRATION_BUDGET_SCHEDULE_VERSION_DRIFT');
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
  if (!same(candidate.plannerToolSheet, expected.plannerToolSheet)) {
    throw new Error('V2R_PREREGISTRATION_PLANNER_TOOL_SHEET_DRIFT');
  }
  if (!same(candidate.executionOrchestration, expected.executionOrchestration)) {
    throw new Error('V2R_PREREGISTRATION_EXECUTION_ORCHESTRATION_DRIFT');
  }
  if (!same(candidate.stageInstructions, expected.stageInstructions)) {
    throw new Error('V2R_PREREGISTRATION_STAGE_INSTRUCTION_HASH_DRIFT');
  }
  if (!same(candidate.causalExecution, expected.causalExecution)) {
    throw new Error('V2R_PREREGISTRATION_EXECUTION_CONTRACT_DRIFT');
  }
  if (!same(candidate.routeRoster, expected.routeRoster)) {
    throw new Error('V2R_PREREGISTRATION_ROUTE_ROSTER_DRIFT');
  }
  if (!same(candidate.perAttemptBudget, expected.perAttemptBudget)) {
    throw new Error('V2R_PREREGISTRATION_BUDGET_SCHEDULE_DRIFT');
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
