import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { evaluateDevelopmentProviderResultV2 } from './development-provider-stage-evaluator-v2';
import type { ProviderStageRunV2 } from './provider-transport-v2';
import {
  buildNextProviderStagePacketV2,
  validateProviderStageArtifactV2,
  type HashedStagePacketV2,
  type StageThreeEvidenceSourceV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type ModelStageV2 = 1 | 2 | 3;

export const DEVELOPMENT_COHORT_TASK_IDS_V2 = [
  'DEV-01', 'DEV-02', 'DEV-03', 'DEV-04',
] as const;
export type DevelopmentCohortTaskIdV2 = typeof DEVELOPMENT_COHORT_TASK_IDS_V2[number];

export interface DevelopmentStageEvaluationV2 {
  disposition: 'PASS' | 'EXPECTED_CAPABILITY_GAP' | 'FAIL' | 'UNVERIFIABLE' | 'HUMAN_REVIEW_REQUIRED';
  diagnostics: readonly string[];
  dimensions?: Readonly<JsonRecord>;
}

export interface DevelopmentMechanicsReceiptV2 {
  taskId: DevelopmentCohortTaskIdV2;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  stage4Disposition: 'PASS' | 'EXPECTED_CAPABILITY_GAP' | 'UNVERIFIABLE';
  stage5Disposition: 'PROCEED' | 'CAPABILITY_GAP' | 'UNVERIFIABLE';
  stage6Disposition: 'PASS' | 'CAPABILITY_GAP' | 'UNVERIFIABLE';
  stateEffects: readonly [];
  evidenceRefs: readonly string[];
}

export interface DevelopmentTaskCaseV2 {
  taskId: DevelopmentCohortTaskIdV2;
  conditionId: string;
  executionFormArm: 'FREE_CHOICE';
  stageOnePacket: HashedStagePacketV2;
  canonical: {
    referenceBlueprint: JsonRecord;
    editorialIntent: JsonRecord;
    evidencePack: JsonRecord;
    evidenceBoundIntent: JsonRecord;
  };
  evaluateStage: (
    stage: ModelStageV2,
    artifact: Readonly<JsonRecord>,
  ) => Readonly<DevelopmentStageEvaluationV2>;
  runDeterministicMechanics: () => Promise<Readonly<DevelopmentMechanicsReceiptV2>>;
}

export interface DevelopmentModelRouteV2 {
  routeId: string;
  claimedModelIdentity: string;
  costBasis: 'USD_METERED' | 'TOKEN_PLAN_CREDITS_UNPRICED';
  runStage: (packet: HashedStagePacketV2) => Promise<Readonly<ProviderStageRunV2>>;
}

export interface DevelopmentCohortReceiptV2 {
  receiptVersion: 'EDITRON_OE_DEVELOPMENT_COHORT_RECEIPT_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  handoffMode: 'ISOLATED_COMPETENCY_WITH_EVALUATOR_APPROVED_CANONICAL_PRIOR';
  tasks: ReadonlyArray<Readonly<{
    taskId: DevelopmentCohortTaskIdV2;
    conditionId: string;
    packetHashes: ReadonlyArray<Readonly<{ stage: ModelStageV2; packetHash: string; transportHash: string }>>;
    canonicalHandoffHashes: Readonly<{ referenceBlueprint: string; editorialIntent: string; evidencePack: string; evidenceBoundIntent: string }>;
    mechanics: Readonly<DevelopmentMechanicsReceiptV2>;
    mechanicsHash: string;
  }>>;
  routes: ReadonlyArray<Readonly<{
    routeId: string;
    claimedModelIdentity: string;
    costBasis: DevelopmentModelRouteV2['costBasis'];
    rows: ReadonlyArray<Readonly<{
      taskId: DevelopmentCohortTaskIdV2;
      stage: ModelStageV2;
      packetHash: string;
      transportDisposition: ProviderStageRunV2['disposition'];
      providerRun: Readonly<ProviderStageRunV2>;
      evaluation: Readonly<DevelopmentStageEvaluationV2>;
    }>>;
  }>>;
  actualProviderCostUsd: number;
  providerCostCoverage: 'COMPLETE' | 'PARTIAL_UNPRICED_ROUTE';
  unpricedRouteIds: readonly string[];
  stage7Disposition: 'PENDING_REAL_HUMAN_REVIEW';
  stateEffects: readonly [];
  receiptHash: string;
}

export async function runDevelopmentCohortV2(input: {
  tasks: readonly DevelopmentTaskCaseV2[];
  routes: readonly DevelopmentModelRouteV2[];
}): Promise<Readonly<DevelopmentCohortReceiptV2>> {
  validateCohort(input.tasks, input.routes);
  const prepared = input.tasks.map(prepareTask);
  const taskReceipts = [];
  for (const task of prepared) {
    const mechanics = await task.source.runDeterministicMechanics();
    validateMechanics(task.source.taskId, mechanics);
    taskReceipts.push(deepFreezeV1({
      taskId: task.source.taskId,
      conditionId: task.source.conditionId,
      packetHashes: task.packets.map(({ packet, packetHash, transportHash }) => ({
        stage: packet.stage as ModelStageV2, packetHash, transportHash,
      })),
      canonicalHandoffHashes: {
        referenceBlueprint: hashCanonicalJsonV1(task.source.canonical.referenceBlueprint),
        editorialIntent: hashCanonicalJsonV1(task.source.canonical.editorialIntent),
        evidencePack: hashCanonicalJsonV1(task.source.canonical.evidencePack),
        evidenceBoundIntent: hashCanonicalJsonV1(task.source.canonical.evidenceBoundIntent),
      },
      mechanics,
      mechanicsHash: hashCanonicalJsonV1(mechanics),
    }));
  }

  let actualProviderCostUsd = 0;
  const routeReceipts = [];
  for (const route of input.routes) {
    const rows = [];
    for (const task of prepared) {
      for (const packet of task.packets) {
        const providerRun = await route.runStage(packet);
        actualProviderCostUsd = Number((actualProviderCostUsd + providerRun.attempts
          .reduce((sum, attempt) => sum + (attempt.providerCostUsd ?? 0), 0)).toFixed(12));
        const evaluation = evaluateDevelopmentProviderResultV2(task.source, packet, providerRun);
        rows.push(deepFreezeV1({
          taskId: task.source.taskId,
          stage: packet.packet.stage as ModelStageV2,
          packetHash: packet.packetHash,
          transportDisposition: providerRun.disposition,
          providerRun,
          evaluation,
        }));
      }
    }
    routeReceipts.push(deepFreezeV1({
      routeId: route.routeId,
      claimedModelIdentity: route.claimedModelIdentity,
      costBasis: route.costBasis,
      rows,
    }));
  }

  const unpricedRouteIds = input.routes
    .filter(({ costBasis }) => costBasis === 'TOKEN_PLAN_CREDITS_UNPRICED')
    .map(({ routeId }) => routeId);

  const material = {
    receiptVersion: 'EDITRON_OE_DEVELOPMENT_COHORT_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    handoffMode: 'ISOLATED_COMPETENCY_WITH_EVALUATOR_APPROVED_CANONICAL_PRIOR' as const,
    tasks: taskReceipts,
    routes: routeReceipts,
    actualProviderCostUsd,
    providerCostCoverage: unpricedRouteIds.length ? 'PARTIAL_UNPRICED_ROUTE' as const : 'COMPLETE' as const,
    unpricedRouteIds,
    stage7Disposition: 'PENDING_REAL_HUMAN_REVIEW' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

function prepareTask(source: DevelopmentTaskCaseV2): {
  source: DevelopmentTaskCaseV2;
  packets: readonly [HashedStagePacketV2, HashedStagePacketV2, HashedStagePacketV2];
} {
  const stageOne = source.stageOnePacket;
  if (stageOne.packet.stage !== 1 || stageOne.packet.taskId !== source.taskId
    || stageOne.packet.conditionId !== source.conditionId) {
    throw new Error(`COHORT_STAGE1_BINDING_DRIFT:${source.taskId}`);
  }
  const stageTwo = buildNextProviderStagePacketV2({
    previousPacket: stageOne, stage: 2, executionFormArm: source.executionFormArm,
    priorArtifact: source.canonical.referenceBlueprint as JsonRecord & { artifactType: string; taskId: string },
  });
  const stageThreeSource: StageThreeEvidenceSourceV2 = {
    evidencePack: source.canonical.evidencePack,
  };
  const stageThree = buildNextProviderStagePacketV2({
    previousPacket: stageTwo, stage: 3, executionFormArm: source.executionFormArm,
    priorArtifact: source.canonical.editorialIntent as JsonRecord & { artifactType: string; taskId: string },
    stageThreeSource,
  });
  const canonicalStageThreeDiagnostics = validateProviderStageArtifactV2(
    stageThree,
    source.canonical.evidenceBoundIntent,
  );
  if (canonicalStageThreeDiagnostics.length) {
    throw new Error(`COHORT_CANONICAL_STAGE3_INVALID:${source.taskId}:${canonicalStageThreeDiagnostics.join(';')}`);
  }
  return { source, packets: [stageOne, stageTwo, stageThree] };
}

function validateCohort(
  tasks: readonly DevelopmentTaskCaseV2[],
  routes: readonly DevelopmentModelRouteV2[],
): void {
  const taskIds = tasks.map(({ taskId }) => taskId);
  if (taskIds.length !== DEVELOPMENT_COHORT_TASK_IDS_V2.length
    || DEVELOPMENT_COHORT_TASK_IDS_V2.some((taskId) => !taskIds.includes(taskId))
    || new Set(taskIds).size !== taskIds.length) {
    throw new Error('COHORT_TASK_SET_INCOMPLETE');
  }
  if (!routes.length || routes.some(({ routeId, claimedModelIdentity }) =>
    !routeId.trim() || !claimedModelIdentity.trim())
    || new Set(routes.map(({ routeId }) => routeId)).size !== routes.length) {
    throw new Error('COHORT_ROUTE_SET_INVALID');
  }
}

function validateMechanics(
  taskId: DevelopmentCohortTaskIdV2,
  receipt: Readonly<DevelopmentMechanicsReceiptV2>,
): void {
  if (receipt.taskId !== taskId
    || receipt.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || receipt.stateEffects.length) {
    throw new Error(`COHORT_MECHANICS_RECEIPT_INVALID:${taskId}`);
  }
}
