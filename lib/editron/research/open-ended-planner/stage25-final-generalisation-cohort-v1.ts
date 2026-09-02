import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { providerNativeCohortRoutesV2R }
  from './provider-native-cohort-manifest-v2r';
import { V2R_OPERATOR_CATALOG } from './operator-catalog-v2r';
import { STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1 }
  from './stage25-dependency-diversity-holdout-v1';
import { STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1 }
  from './stage25-dependency-diversity-owner-materialization-v1';
import {
  STAGE25_FINAL_GENERALISATION_PROTOCOL_VERSION_V1,
  type Stage25FinalGeneralisationPublicTaskV1,
} from './stage25-final-generalisation-protocol-v1';
import { STAGE25_GENERALISATION_SCORECARD_V1 }
  from './stage25-generalisation-scorecard-v1';
import { STAGE25_HELDOUT_ROUTE_FREEZE_V1 }
  from './stage25-heldout-route-freeze-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_FINAL_GENERALISATION_COHORT_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_COHORT_V1_2' as const;
export const STAGE25_FINAL_GENERALISATION_COHORT_ID_V1 =
  'stage25-final-generalisation-v1-2' as const;

const ALL_OPERATOR_IDS = records(V2R_OPERATOR_CATALOG.operators)
  .map(({ operatorId }) => String(operatorId));
const ROUTES = providerNativeCohortRoutesV2R().map(({ route }) => route);

const DEPENDENCY_POLICIES: Readonly<Record<string, Readonly<JsonRecord>>> = {
  'HOLD-DEP-01': policy([
    count('find_visual_moment', 3), count('apply_filter', 3),
  ], [['find_visual_moment', 'apply_filter']], true),
  'HOLD-DEP-02': policy([
    oneOf('DISCOVER_REPLACEMENT', ['list_user_assets', 'search_user_assets'], 1),
    count('inspect_user_asset', 1), count('resolve_user_asset_overlay', 1),
    count('add_overlay', 1), count('delete_overlay', 1),
  ], [
    ['inspect_user_asset', 'resolve_user_asset_overlay'],
    ['resolve_user_asset_overlay', 'add_overlay'], ['add_overlay', 'delete_overlay'],
  ], true),
  'HOLD-DEP-03': policy([
    count('find_visual_moment', 1), count('find_transcript_moment', 1),
    count('resolve_visual_edit', 1), count('apply_speed_ramp', 1),
    count('apply_camera_shake', 1),
  ], [
    ['find_transcript_moment', 'apply_speed_ramp'],
    ['apply_speed_ramp', 'find_visual_moment'],
    ['find_visual_moment', 'apply_camera_shake'],
  ], true),
  'HOLD-DEP-04': policy([
    count('find_visual_moment', 2), count('resolve_visual_edit', 2),
    count('cut_section', 2),
  ], [
    ['find_visual_moment', 'cut_section'], ['resolve_visual_edit', 'cut_section'],
  ], true),
};

function buildDependencyTasks(): Stage25FinalGeneralisationPublicTaskV1[] {
  return STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.tasks.map((task) => {
    const owner = STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1.tasks
      .find(({ taskId }) => taskId === task.taskId) ?? fail(`OWNER_MISSING:${task.taskId}`);
    const publicTask = {
      project: task.project,
      request: task.publicRequest,
      publicRules: task.publicRules,
      equivalentForms: task.equivalentForms,
      safeStopConditions: task.safeStopConditions,
      publicMachinePolicy: DEPENDENCY_POLICIES[task.taskId],
      historicalFreeze: {
        taskSha256: task.taskSha256,
        historicalStatus: task.status,
        historicalPublicContractGap: task.publicContractGap,
      },
      currentSuccessorContract: {
        disposition: owner.disposition,
        ownerRefs: owner.ownerRefs,
        effectShape: owner.effectShape,
        proofCeiling: owner.proofCeiling,
        materializationSha256:
          STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1.materializationSha256,
      },
    };
    return finalizeTask({
      taskId: task.taskId, lane: 'DEPENDENCY_PLAN', taskSha256: task.taskSha256,
      publicTask, eligibleOperatorIds: task.eligibleOperatorIds,
      currentOwnerEvidence: owner as unknown as JsonRecord,
      publicRuleIds: task.scoredRuleIds, evidenceIds: task.evidenceIds,
      preservationRules: task.publicRules.map(({ ruleId, text }) => `${ruleId}:${text}`),
    });
  });
}

function buildRouteTasks(): Stage25FinalGeneralisationPublicTaskV1[] {
  return STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks.map((task) => {
    const taskId = String(task.taskId);
    const targets = records(task.targetPredicates);
    const preservation = records(task.preservationPredicates);
    const publicRuleIds = [...ids(targets), ...ids(preservation)];
    const currentOwnerEvidence = routeOwnerEvidence(taskId);
    const publicTask = {
      task,
      arm: 'FREE_CHOICE',
      armInstruction: 'Qualify all three route families from current owner evidence; choose only an available route, otherwise stop with zero writes.',
      publicMachinePolicy: {
        exactCandidateRoutes: ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'],
        exactTargetPredicateIds: ids(targets),
        exactPreservationPredicateIds: ids(preservation),
        selectedRouteMustBeResearchPreviewAvailable: true,
        ownerOrFixtureGapRequiresNamedBlocker: true,
        generatedOrHybridRequiresBoundedSandboxAndExplicitHandoffs: true,
        researchPreviewIsNotProductCertification: true,
      },
    };
    return finalizeTask({
      taskId, lane: 'ROUTE_DECISION', taskSha256: String(task.taskSha256),
      publicTask, eligibleOperatorIds: ALL_OPERATOR_IDS, currentOwnerEvidence,
      publicRuleIds, evidenceIds: [`${taskId}-CURRENT-OWNER-EVIDENCE`],
      preservationRules: preservation.map(({ predicateId, text }) => `${predicateId}:${text}`),
    });
  });
}

const TASKS = [...buildDependencyTasks(), ...buildRouteTasks()];
const ROWS = TASKS.flatMap((task) => ROUTES.map((route) => ({
  rowId: `${task.taskId}:${route.routeId}`,
  taskId: task.taskId,
  taskLane: task.lane,
  taskPacketSha256: task.taskPacketSha256,
  route,
  maximumProviderAttempts: 2 as const,
  automaticTransportRetries: 0 as const,
})));

const MATERIAL = {
  version: STAGE25_FINAL_GENERALISATION_COHORT_VERSION_V1,
  artifactType: 'Stage25FinalGeneralisationCohortV1' as const,
  cohortId: STAGE25_FINAL_GENERALISATION_COHORT_ID_V1,
  authority: 'RESEARCH_PLANNER_SCREEN_NO_PROJECT_MUTATION' as const,
  protocolVersion: STAGE25_FINAL_GENERALISATION_PROTOCOL_VERSION_V1,
  scorecardSha256: STAGE25_GENERALISATION_SCORECARD_V1.scorecardSha256,
  sourceFreezeBindings: {
    dependencyFreezeSha256: STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.freezeSha256,
    dependencyOwnerMaterializationSha256:
      STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1.materializationSha256,
    routeFreezeSha256: STAGE25_HELDOUT_ROUTE_FREEZE_V1.freezeSha256,
  },
  tasks: TASKS,
  rows: ROWS,
  counts: { tasks: 8, routes: 3, rows: 24 },
  repairPolicy: {
    maximumSchemaOrProtocolCorrections: 1,
    automaticTransportRetries: 0,
    correctionMayNotAddTaskFacts: true,
  },
  dispatchAuthorized: false as const,
  providerInferenceCallCount: 0 as const,
  stateEffects: [] as const,
};

export const STAGE25_FINAL_GENERALISATION_COHORT_V1 = deepFreezeV1({
  ...MATERIAL, cohortSha256: hashCanonicalJsonV1(MATERIAL),
});

function finalizeTask(input: Omit<Stage25FinalGeneralisationPublicTaskV1, 'taskPacketSha256'>):
Stage25FinalGeneralisationPublicTaskV1 {
  return deepFreezeV1({ ...input, taskPacketSha256: hashCanonicalJsonV1(input) });
}
function policy(groups: readonly JsonRecord[], precedence: readonly (readonly [string, string])[], chain: boolean) {
  return {
    requiredOperatorGroups: groups,
    requiredPrecedence: precedence.map(([predecessorOperatorId, successorOperatorId]) => ({
      predecessorOperatorId,
      successorOperatorId,
    })),
    precedenceSemantics:
      'Each predecessorOperatorId node must be an ancestor of every applicable successorOperatorId node; serialized JSON key order is irrelevant.',
    allEvidenceBeforeFirstWriter: true,
    eachWriterAfterFirstConsumesPriorWriterReceipt: chain,
    unknownOperatorsForbidden: true,
  };
}
function count(operatorId: string, exactCount: number): JsonRecord {
  return { groupId: operatorId, operatorIds: [operatorId], minimumCount: exactCount, maximumCount: exactCount };
}
function oneOf(groupId: string, operatorIds: readonly string[], exactCount: number): JsonRecord {
  return { groupId, operatorIds, minimumCount: exactCount, maximumCount: exactCount };
}
function routeOwnerEvidence(taskId: string): JsonRecord {
  if (taskId === 'RHC-01') return {
    taskId, routeQualifications: ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'].map((route) => ({ route, qualification: 'RESEARCH_PREVIEW_AVAILABLE' })),
    previewReceiptPath: '.calibration-temp/open-ended-planner-v2/stage25-rhc01-preview/rhc01-preview-0dcbe01c4-v1/execution-receipt.json',
    previewReceiptHash: '312a112ffda3cdd63fb815bf9876d562ae82f8ede99a6753b2dd61c713e5cadb',
    proofCeiling: 'CAPTURED_UNJUDGED_RESEARCH_PREVIEW', productExecution: 'NOT_AUTHORIZED',
  };
  return { taskId, routeQualifications: ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'].map((route) => ({ route, qualification: 'OWNER_OR_FIXTURE_GAP' })), proofCeiling: 'SAFE_STOP_OWNER_PROOF_ONLY', productExecution: 'NOT_AUTHORIZED' };
}
function ids(values: readonly JsonRecord[]): string[] { return values.map(({ predicateId }) => String(predicateId)); }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value as JsonRecord[] : []; }
function fail(code: string): never { throw new Error(`STAGE25_FINAL_GENERALISATION_COHORT_${code}`); }
