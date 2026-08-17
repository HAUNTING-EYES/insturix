import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  ConnectedDevelopmentStage123ReceiptV2,
  ConnectedDevelopmentStageRowV2,
} from './development-connected-stage123-runner-v2';
import type { DevelopmentModelRouteV2, DevelopmentTaskCaseV2 } from './development-cohort-runner-v2';
import {
  buildConnectedSemanticRepairPacketV2,
  buildConnectedStage1SemanticRepairPacketV2,
  type ConnectedStage1SemanticRepairSourceV2,
} from './development-connected-semantic-repair-v2';
import { evaluateDevelopmentProviderResultV2 } from './development-provider-stage-evaluator-v2';
import type { ProviderStageRunV2 } from './provider-transport-v2';
import { attachStage2PlanningCompilerBoundaryV2 } from './stage2-planning-compiler-boundary-v2';
import { buildNextProviderStagePacketV2 } from './staged-packet-v2';

export const DEV02_HYBRID_ROLE_CHAIN_EVALUATOR_V2 =
  'DEV02_HYBRID_ROLE_CHAIN_SOURCE_GENERATED_CONTINUATION_PROOF_V2' as const;
export const CONNECTED_SOURCE_RELATIVE_STAGE23_EVALUATOR_V2 =
  'CONNECTED_SOURCE_RELATIVE_STAGE23_EVALUATOR_V2' as const;

export interface ConnectedStage1RequalificationHandoffV2 {
  receiptVersion: 'EDITRON_OE_CONNECTED_STAGE1_REQUALIFICATION_HANDOFF_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  reason: 'EVALUATOR_CONTRACT_CHANGED_REUSE_STAGE1_SUPERSEDE_STAGE2_AND_STAGE3';
  evaluatorContractId:
    | typeof DEV02_HYBRID_ROLE_CHAIN_EVALUATOR_V2
    | typeof CONNECTED_SOURCE_RELATIVE_STAGE23_EVALUATOR_V2;
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  sourceReceiptHash: string;
  reusedStage1RowHash: string;
  supersededRowHashes: readonly string[];
  stage1Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
  stateEffects: readonly [];
  receiptHash: string;
}

export interface ConnectedStage2ReevaluationHandoffV2 {
  receiptVersion: 'EDITRON_OE_CONNECTED_STAGE2_REEVALUATION_HANDOFF_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  reason: 'EVALUATOR_CONTRACT_CORRECTED_REUSE_ARTIFACT_CALL_ONLY_STAGE3';
  evaluatorContractId: typeof DEV02_HYBRID_ROLE_CHAIN_EVALUATOR_V2;
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  sourceReceiptHash: string;
  stage2ArtifactHash: string;
  priorEvaluationHash: string;
  correctedEvaluationHash: string;
  stage2Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
  stateEffects: readonly [];
  receiptHash: string;
}

export interface ConnectedStage1SemanticRepairHandoffV2 {
  receiptVersion: 'EDITRON_OE_CONNECTED_STAGE1_SEMANTIC_REPAIR_HANDOFF_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  reason: 'RENDERED_PROOF_POLICY_FOUND_MISSING_STAGE1_TARGET_CLAIMS';
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  sourceReceiptHash: string;
  sourceStage1RowHash: string;
  supersededRowHashes: readonly string[];
  repairSource: Readonly<ConnectedStage1SemanticRepairSourceV2>;
  repairedPacketHash: string;
  repairedTransportHash: string;
  stateEffects: readonly [];
  receiptHash: string;
}

export function buildConnectedStage1SemanticRepairHandoffV2(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  sourceReceipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
  repairDiagnostics: readonly string[];
}): Readonly<{
  handoff: Readonly<ConnectedStage1SemanticRepairHandoffV2>;
  repairedTask: Readonly<DevelopmentTaskCaseV2>;
}> {
  validateSource(input);
  const sourceStageOne = input.sourceReceipt.rows[0];
  const failedArtifact = sourceStageOne.providerRun.artifact;
  if (!failedArtifact) fail('STAGE1_REPAIR_ARTIFACT_MISSING');
  const repair = buildConnectedStage1SemanticRepairPacketV2({
    packet: input.task.stageOnePacket,
    failedArtifact,
    repairDiagnostics: input.repairDiagnostics,
  });
  const material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE1_SEMANTIC_REPAIR_HANDOFF_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    reason: 'RENDERED_PROOF_POLICY_FOUND_MISSING_STAGE1_TARGET_CLAIMS' as const,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    sourceReceiptHash: input.sourceReceipt.receiptHash,
    sourceStage1RowHash: hashCanonicalJsonV1(sourceStageOne),
    supersededRowHashes: input.sourceReceipt.rows.map(hashCanonicalJsonV1),
    repairSource: repair.source,
    repairedPacketHash: repair.packet.packetHash,
    repairedTransportHash: repair.packet.transportHash,
    stateEffects: [] as const,
  };
  const handoff = deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
  const repairedTask = Object.freeze({ ...input.task, stageOnePacket: repair.packet });
  return Object.freeze({ handoff, repairedTask });
}

export function buildConnectedStage1RequalificationHandoffV2(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  sourceReceipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
  evaluatorContractId?: ConnectedStage1RequalificationHandoffV2['evaluatorContractId'];
}): Readonly<ConnectedStage1RequalificationHandoffV2> {
  validateSource(input);
  const stageOne = input.sourceReceipt.rows[0];
  const stage1Material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE123_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT' as const,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    costBasis: input.route.costBasis,
    systemEvidencePackHash: hashCanonicalJsonV1(input.task.canonical.evidencePack),
    rows: [stageOne],
    finalDisposition: 'BLOCKED_BEFORE_STAGE3' as const,
    actualProviderCostUsd: providerCostUsd(stageOne),
    providerCostCoverage: input.route.costBasis === 'USD_METERED'
      ? 'COMPLETE' as const : 'TOKEN_PLAN_CREDITS_UNPRICED' as const,
    stateEffects: [] as const,
  };
  const stage1Receipt = deepFreezeV1({
    ...stage1Material,
    receiptHash: hashCanonicalJsonV1(stage1Material),
  });
  const material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE1_REQUALIFICATION_HANDOFF_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    reason: 'EVALUATOR_CONTRACT_CHANGED_REUSE_STAGE1_SUPERSEDE_STAGE2_AND_STAGE3' as const,
    evaluatorContractId: input.evaluatorContractId ?? DEV02_HYBRID_ROLE_CHAIN_EVALUATOR_V2,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    sourceReceiptHash: input.sourceReceipt.receiptHash,
    reusedStage1RowHash: hashCanonicalJsonV1(stageOne),
    supersededRowHashes: input.sourceReceipt.rows.slice(1).map(hashCanonicalJsonV1),
    stage1Receipt,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

export function buildConnectedStage2ReevaluationHandoffV2(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  sourceReceipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
}): Readonly<ConnectedStage2ReevaluationHandoffV2> {
  validateSource(input);
  const stageOne = input.sourceReceipt.rows[0];
  const stageTwo = input.sourceReceipt.rows[1];
  if (!stageTwo || stageTwo.stage !== 2 || !stageOne.artifactHash || !stageOne.providerRun.artifact) {
    fail('STAGE2_ROW_MISSING');
  }
  let packet = attachStage2PlanningCompilerBoundaryV2(
    buildNextProviderStagePacketV2({
      previousPacket: input.task.stageOnePacket,
      stage: 2,
      executionFormArm: input.task.executionFormArm,
      priorArtifact: stageOne.providerRun.artifact as Record<string, unknown> & {
        artifactType: string; taskId: string;
      },
    }),
  );
  if (stageTwo.semanticRepair) {
    const failedArtifact = stageTwo.semanticRepair.initialProviderRun.artifact;
    if (!failedArtifact) fail('STAGE2_REPAIR_ARTIFACT_MISSING');
    const repair = buildConnectedSemanticRepairPacketV2({
      packet,
      failedArtifact,
      evaluation: stageTwo.semanticRepair.initialEvaluation,
    });
    if (hashCanonicalJsonV1(repair.source) !== hashCanonicalJsonV1(stageTwo.semanticRepair.source)) {
      fail('STAGE2_REPAIR_SOURCE_DRIFT');
    }
    packet = repair.packet;
  }
  const currentEvaluation = evaluateDevelopmentProviderResultV2(
    input.task, packet, stageTwo.providerRun, { sourceRelativeConnected: true },
  );
  if (stageTwo.packetHash !== packet.packetHash || stageTwo.transportHash !== packet.transportHash
    || stageTwo.priorArtifactHash !== stageOne.artifactHash
    || stageTwo.packetPriorArtifactHash !== stageOne.artifactHash
    || stageTwo.providerRun.packetHash !== packet.packetHash
    || stageTwo.providerRun.disposition !== 'ARTIFACT_ACCEPTED' || !stageTwo.providerRun.artifact
    || stageTwo.artifactHash !== hashCanonicalJsonV1(stageTwo.providerRun.artifact)
    || !['PASS', 'EXPECTED_CAPABILITY_GAP'].includes(currentEvaluation.disposition)
    || currentEvaluation.diagnostics.length) {
    fail('STAGE2_ROW_NOT_REQUALIFIED');
  }
  const correctedStageTwo = deepFreezeV1({ ...stageTwo, evaluation: currentEvaluation });
  const receiptMaterial = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE123_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT' as const,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    costBasis: input.route.costBasis,
    systemEvidencePackHash: hashCanonicalJsonV1(input.task.canonical.evidencePack),
    rows: [stageOne, correctedStageTwo],
    finalDisposition: 'STAGE3_EVALUATED' as const,
    actualProviderCostUsd: providerCostUsd(stageOne) + providerCostUsd(stageTwo),
    providerCostCoverage: input.route.costBasis === 'USD_METERED'
      ? 'COMPLETE' as const : 'TOKEN_PLAN_CREDITS_UNPRICED' as const,
    stateEffects: [] as const,
  };
  const stage2Receipt = deepFreezeV1({
    ...receiptMaterial,
    receiptHash: hashCanonicalJsonV1(receiptMaterial),
  });
  const material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE2_REEVALUATION_HANDOFF_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    reason: 'EVALUATOR_CONTRACT_CORRECTED_REUSE_ARTIFACT_CALL_ONLY_STAGE3' as const,
    evaluatorContractId: DEV02_HYBRID_ROLE_CHAIN_EVALUATOR_V2,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    sourceReceiptHash: input.sourceReceipt.receiptHash,
    stage2ArtifactHash: stageTwo.artifactHash,
    priorEvaluationHash: hashCanonicalJsonV1(stageTwo.evaluation),
    correctedEvaluationHash: hashCanonicalJsonV1(currentEvaluation),
    stage2Receipt,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

function validateSource(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  sourceReceipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
}): void {
  const { receiptHash, ...unsigned } = input.sourceReceipt;
  if (receiptHash !== hashCanonicalJsonV1(unsigned)
    || input.sourceReceipt.taskId !== input.task.taskId
    || input.sourceReceipt.conditionId !== input.task.conditionId
    || input.sourceReceipt.routeId !== input.route.routeId
    || input.sourceReceipt.claimedModelIdentity !== input.route.claimedModelIdentity
    || input.sourceReceipt.costBasis !== input.route.costBasis
    || input.sourceReceipt.systemEvidencePackHash !== hashCanonicalJsonV1(input.task.canonical.evidencePack)) {
    fail('SOURCE_RECEIPT_INVALID');
  }
  const row = input.sourceReceipt.rows[0];
  const packet = input.task.stageOnePacket;
  if (!row || row.stage !== 1 || row.packetHash !== packet.packetHash
    || row.transportHash !== packet.transportHash || row.priorArtifactHash !== null
    || row.packetPriorArtifactHash !== null || row.semanticRepair !== null
    || row.providerRun.packetHash !== row.packetHash
    || row.providerRun.disposition !== 'ARTIFACT_ACCEPTED' || !row.providerRun.artifact
    || row.artifactHash !== hashCanonicalJsonV1(row.providerRun.artifact)
    || hashCanonicalJsonV1(row.evaluation) !== hashCanonicalJsonV1(evaluateDevelopmentProviderResultV2(
      input.task, packet, row.providerRun, { sourceRelativeConnected: true },
    ))) {
    fail('STAGE1_ROW_INVALID');
  }
}

function providerCostUsd(row: Readonly<ConnectedDevelopmentStageRowV2>): number {
  return Number([row.semanticRepair?.initialProviderRun, row.providerRun]
    .filter((run): run is Readonly<ProviderStageRunV2> => Boolean(run))
    .reduce((total, run) => total + run.attempts.reduce((sum, attempt) =>
      sum + (attempt.providerCostUsd ?? 0), 0), 0).toFixed(12));
}

function fail(code: string): never {
  throw new Error(`CONNECTED_STAGE1_REQUALIFICATION:${code}`);
}
