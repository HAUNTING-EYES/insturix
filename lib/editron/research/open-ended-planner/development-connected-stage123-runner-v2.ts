import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildConnectedSemanticRepairPacketV2,
  type ConnectedSemanticRepairSourceV2,
} from './development-connected-semantic-repair-v2';
import type {
  DevelopmentModelRouteV2,
  DevelopmentStageEvaluationV2,
  DevelopmentTaskCaseV2,
} from './development-cohort-runner-v2';
import { evaluateDevelopmentProviderResultV2 } from './development-provider-stage-evaluator-v2';
import type { ProviderStageRunV2 } from './provider-transport-v2';
import { attachStage2PlanningCompilerBoundaryV2 } from './stage2-planning-compiler-boundary-v2';
import {
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
  type StageThreeEvidenceSourceV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type ConnectedStageV2 = 1 | 2 | 3;
type NextConnectedStageV2 = 2 | 3;

export interface ConnectedDevelopmentStageRowV2 {
  stage: ConnectedStageV2;
  packetHash: string;
  transportHash: string;
  priorArtifactHash: string | null;
  packetPriorArtifactHash: string | null;
  artifactHash: string | null;
  providerRun: Readonly<ProviderStageRunV2>;
  evaluation: Readonly<DevelopmentStageEvaluationV2>;
  semanticRepair: Readonly<{
    source: Readonly<ConnectedSemanticRepairSourceV2>;
    initialProviderRun: Readonly<ProviderStageRunV2>;
    initialEvaluation: Readonly<DevelopmentStageEvaluationV2>;
  }> | null;
}

interface ConnectedStageRunResultV2 {
  row: Readonly<ConnectedDevelopmentStageRowV2>;
  packet: HashedStagePacketV2;
}

export interface ConnectedDevelopmentStage123ReceiptV2 {
  receiptVersion: 'EDITRON_OE_CONNECTED_STAGE123_RECEIPT_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT';
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  costBasis: DevelopmentModelRouteV2['costBasis'];
  systemEvidencePackHash: string;
  rows: readonly Readonly<ConnectedDevelopmentStageRowV2>[];
  finalDisposition:
    | 'STAGE3_EVALUATED'
    | 'BLOCKED_BEFORE_STAGE2'
    | 'BLOCKED_BEFORE_STAGE3';
  actualProviderCostUsd: number;
  providerCostCoverage: 'COMPLETE' | 'TOKEN_PLAN_CREDITS_UNPRICED';
  stateEffects: readonly [];
  receiptHash: string;
}

export interface ConnectedDevelopmentStage123ContinuationReceiptV2 {
  receiptVersion: 'EDITRON_OE_CONNECTED_STAGE123_CONTINUATION_RECEIPT_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  handoffMode: 'REUSE_HASH_IDENTICAL_ACCEPTED_PREFIX_CALL_ONLY_MISSING';
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  sourceReceiptHash: string;
  reusedRowHashes: readonly string[];
  supersededRowHashes: readonly string[];
  liveRowHashes: readonly string[];
  stage123Receipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
  incrementalProviderCostUsd: number;
  stateEffects: readonly [];
  receiptHash: string;
}

export async function runConnectedDevelopmentStage123V2(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
}): Promise<Readonly<ConnectedDevelopmentStage123ReceiptV2>> {
  validateInput(input.task, input.route);
  const rows: ConnectedDevelopmentStageRowV2[] = [];

  const stageOneRun = await runStage({
    task: input.task,
    route: input.route,
    packet: input.task.stageOnePacket,
    priorArtifactHash: null,
  });
  const stageOne = stageOneRun.row;
  rows.push(stageOne);
  if (!canContinue(stageOne)) {
    return receipt(input, rows, 'BLOCKED_BEFORE_STAGE2');
  }

  const stageOneArtifact = requiredAcceptedArtifact(stageOne);
  const stageTwoPacket = attachStage2PlanningCompilerBoundaryV2(
    buildNextProviderStagePacketV2({
      previousPacket: stageOneRun.packet,
      stage: 2,
      executionFormArm: input.task.executionFormArm,
      priorArtifact: stageOneArtifact,
    }),
  );
  const stageTwoRun = await runStage({
    task: input.task,
    route: input.route,
    packet: stageTwoPacket,
    priorArtifactHash: stageOne.artifactHash,
  });
  const stageTwo = stageTwoRun.row;
  rows.push(stageTwo);
  if (!canContinue(stageTwo)) {
    return receipt(input, rows, 'BLOCKED_BEFORE_STAGE3');
  }

  const stageTwoArtifact = requiredAcceptedArtifact(stageTwo);
  const stageThreeSource: StageThreeEvidenceSourceV2 = {
    evidencePack: input.task.canonical.evidencePack,
  };
  const stageThreePacket = buildNextProviderStagePacketV2({
    previousPacket: stageTwoRun.packet,
    stage: 3,
    executionFormArm: input.task.executionFormArm,
    priorArtifact: stageTwoArtifact,
    stageThreeSource,
  });
  const stageThreeRun = await runStage({
    task: input.task,
    route: input.route,
    packet: stageThreePacket,
    priorArtifactHash: stageTwo.artifactHash,
  });
  rows.push(stageThreeRun.row);
  return receipt(input, rows, 'STAGE3_EVALUATED');
}

export async function continueConnectedDevelopmentStage123V2(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  sourceReceipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
}): Promise<Readonly<ConnectedDevelopmentStage123ContinuationReceiptV2>> {
  validateInput(input.task, input.route);
  const sourcePackets = validateSourceReceipt(input);
  const reusableCount = reusablePrefixLength(input.sourceReceipt.rows);
  const rows = input.sourceReceipt.rows.slice(0, reusableCount) as ConnectedDevelopmentStageRowV2[];
  const liveRows: ConnectedDevelopmentStageRowV2[] = [];

  while (rows.length < 3 && (rows.length === 0 || canContinue(rows.at(-1)!))) {
    const packet = buildContinuationPacket(input.task, rows, sourcePackets);
    const priorArtifactHash = rows.at(-1)?.artifactHash ?? null;
    const result = await runStage({ task: input.task, route: input.route, packet, priorArtifactHash });
    rows.push(result.row);
    liveRows.push(result.row);
    sourcePackets[rows.length - 1] = result.packet;
  }

  const stage123Receipt = receipt(input, rows, finalDispositionForRows(rows));
  const material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE123_CONTINUATION_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    handoffMode: 'REUSE_HASH_IDENTICAL_ACCEPTED_PREFIX_CALL_ONLY_MISSING' as const,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    sourceReceiptHash: input.sourceReceipt.receiptHash,
    reusedRowHashes: input.sourceReceipt.rows.slice(0, reusableCount).map(hashCanonicalJsonV1),
    supersededRowHashes: input.sourceReceipt.rows.slice(reusableCount).map(hashCanonicalJsonV1),
    liveRowHashes: liveRows.map(hashCanonicalJsonV1),
    stage123Receipt,
    incrementalProviderCostUsd: providerCostUsd(liveRows),
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

async function runStage(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  packet: HashedStagePacketV2;
  priorArtifactHash: string | null;
}): Promise<Readonly<ConnectedStageRunResultV2>> {
  const packetPriorArtifactHash = stringOrNull(input.packet.packet.modelInput.priorArtifactHash);
  if (packetPriorArtifactHash !== input.priorArtifactHash) {
    throw new Error(`CONNECTED_PRIOR_ARTIFACT_HASH_DRIFT:STAGE_${input.packet.packet.stage}`);
  }
  let activePacket = input.packet;
  let providerRun = await input.route.runStage(activePacket);
  let evaluation = evaluateDevelopmentProviderResultV2(
    input.task,
    activePacket,
    providerRun,
    { sourceRelativeConnected: true },
  );
  let semanticRepair: ConnectedDevelopmentStageRowV2['semanticRepair'] = null;
  if (activePacket.packet.stage !== 1
    && providerRun.disposition === 'ARTIFACT_ACCEPTED'
    && providerRun.artifact
    && evaluation.disposition === 'FAIL') {
    const initialProviderRun = providerRun;
    const initialEvaluation = evaluation;
    const repair = buildConnectedSemanticRepairPacketV2({
      packet: activePacket,
      failedArtifact: providerRun.artifact,
      evaluation,
    });
    activePacket = repair.packet;
    providerRun = await input.route.runStage(activePacket);
    evaluation = evaluateDevelopmentProviderResultV2(
      input.task,
      activePacket,
      providerRun,
      { sourceRelativeConnected: true },
    );
    semanticRepair = deepFreezeV1({
      source: repair.source,
      initialProviderRun,
      initialEvaluation,
    });
  }
  const artifactHash = providerRun.disposition === 'ARTIFACT_ACCEPTED' && providerRun.artifact
    ? hashCanonicalJsonV1(providerRun.artifact)
    : null;
  const row = deepFreezeV1({
    stage: activePacket.packet.stage as ConnectedStageV2,
    packetHash: activePacket.packetHash,
    transportHash: activePacket.transportHash,
    priorArtifactHash: input.priorArtifactHash,
    packetPriorArtifactHash,
    artifactHash,
    providerRun,
    evaluation,
    semanticRepair,
  });
  return deepFreezeV1({ row, packet: activePacket });
}

function canContinue(row: Readonly<ConnectedDevelopmentStageRowV2>): boolean {
  if (row.providerRun.disposition !== 'ARTIFACT_ACCEPTED' || !row.providerRun.artifact
    || !row.artifactHash) return false;
  if (row.stage === 1) {
    return row.evaluation.disposition === 'PASS'
      || row.evaluation.disposition === 'HUMAN_REVIEW_REQUIRED';
  }
  return row.stage === 2 && (row.evaluation.disposition === 'PASS'
    || row.evaluation.disposition === 'EXPECTED_CAPABILITY_GAP');
}

function requiredAcceptedArtifact(
  row: Readonly<ConnectedDevelopmentStageRowV2>,
): JsonRecord & { artifactType: string; taskId: string } {
  const artifact = row.providerRun.artifact;
  if (!artifact || !row.artifactHash) {
    throw new Error(`CONNECTED_ACCEPTED_ARTIFACT_MISSING:STAGE_${row.stage}`);
  }
  return artifact as JsonRecord & { artifactType: string; taskId: string };
}

function receipt(
  input: { task: DevelopmentTaskCaseV2; route: DevelopmentModelRouteV2 },
  rows: readonly Readonly<ConnectedDevelopmentStageRowV2>[],
  finalDisposition: ConnectedDevelopmentStage123ReceiptV2['finalDisposition'],
): Readonly<ConnectedDevelopmentStage123ReceiptV2> {
  const actualProviderCostUsd = providerCostUsd(rows);
  const material = {
    receiptVersion: 'EDITRON_OE_CONNECTED_STAGE123_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT' as const,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    costBasis: input.route.costBasis,
    systemEvidencePackHash: hashCanonicalJsonV1(input.task.canonical.evidencePack),
    rows,
    finalDisposition,
    actualProviderCostUsd,
    providerCostCoverage: input.route.costBasis === 'USD_METERED'
      ? 'COMPLETE' as const
      : 'TOKEN_PLAN_CREDITS_UNPRICED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

function validateSourceReceipt(input: {
  task: DevelopmentTaskCaseV2;
  route: DevelopmentModelRouteV2;
  sourceReceipt: Readonly<ConnectedDevelopmentStage123ReceiptV2>;
}): HashedStagePacketV2[] {
  const { receiptHash, ...unsigned } = input.sourceReceipt;
  if (receiptHash !== hashCanonicalJsonV1(unsigned)
    || input.sourceReceipt.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || input.sourceReceipt.handoffMode !== 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT'
    || input.sourceReceipt.taskId !== input.task.taskId
    || input.sourceReceipt.conditionId !== input.task.conditionId
    || input.sourceReceipt.routeId !== input.route.routeId
    || input.sourceReceipt.claimedModelIdentity !== input.route.claimedModelIdentity
    || input.sourceReceipt.costBasis !== input.route.costBasis
    || input.sourceReceipt.systemEvidencePackHash !== hashCanonicalJsonV1(input.task.canonical.evidencePack)
    || input.sourceReceipt.rows.length < 1
    || input.sourceReceipt.rows.length > 3) {
    throw new Error('CONNECTED_CONTINUATION_SOURCE_RECEIPT_INVALID');
  }
  const packets: HashedStagePacketV2[] = [];
  let packet = input.task.stageOnePacket;
  let priorArtifactHash: string | null = null;
  for (const [index, row] of input.sourceReceipt.rows.entries()) {
    if (row.stage !== index + 1) throw new Error('CONNECTED_CONTINUATION_SOURCE_ROW_ORDER_INVALID');
    if (row.semanticRepair) {
      const failedArtifact = row.semanticRepair.initialProviderRun.artifact;
      if (!failedArtifact) throw new Error(`CONNECTED_CONTINUATION_REPAIR_ARTIFACT_MISSING:STAGE_${row.stage}`);
      const repair = buildConnectedSemanticRepairPacketV2({
        packet,
        failedArtifact,
        evaluation: row.semanticRepair.initialEvaluation,
      });
      if (hashCanonicalJsonV1(repair.source) !== hashCanonicalJsonV1(row.semanticRepair.source)) {
        throw new Error(`CONNECTED_CONTINUATION_REPAIR_SOURCE_DRIFT:STAGE_${row.stage}`);
      }
      packet = repair.packet;
    }
    const packetPriorArtifactHash = stringOrNull(packet.packet.modelInput.priorArtifactHash);
    if (row.packetHash !== packet.packetHash
      || row.transportHash !== packet.transportHash
      || row.priorArtifactHash !== priorArtifactHash
      || row.packetPriorArtifactHash !== packetPriorArtifactHash
      || row.providerRun.packetHash !== row.packetHash
      || hashCanonicalJsonV1(evaluateDevelopmentProviderResultV2(
        input.task, packet, row.providerRun, { sourceRelativeConnected: true },
      )) !== hashCanonicalJsonV1(row.evaluation)) {
      throw new Error(`CONNECTED_CONTINUATION_SOURCE_ROW_INVALID:STAGE_${row.stage}`);
    }
    const artifact = row.providerRun.artifact;
    if (artifact
      ? row.providerRun.disposition !== 'ARTIFACT_ACCEPTED'
        || row.artifactHash !== hashCanonicalJsonV1(artifact)
      : row.artifactHash !== null) {
      throw new Error(`CONNECTED_CONTINUATION_SOURCE_ARTIFACT_INVALID:STAGE_${row.stage}`);
    }
    packets.push(packet);
    if (index < input.sourceReceipt.rows.length - 1) {
      if (!canContinue(row)) throw new Error(`CONNECTED_CONTINUATION_ROWS_AFTER_BLOCK:STAGE_${row.stage}`);
      const acceptedArtifact = requiredAcceptedArtifact(row);
      packet = buildNextPacket(input.task, packet, row.stage + 1 as NextConnectedStageV2, acceptedArtifact);
      priorArtifactHash = row.artifactHash;
    }
  }
  if (input.sourceReceipt.finalDisposition !== finalDispositionForRows(input.sourceReceipt.rows)) {
    throw new Error('CONNECTED_CONTINUATION_SOURCE_DISPOSITION_INVALID');
  }
  return packets;
}

function buildContinuationPacket(
  task: DevelopmentTaskCaseV2,
  rows: readonly ConnectedDevelopmentStageRowV2[],
  packets: readonly HashedStagePacketV2[],
): HashedStagePacketV2 {
  if (!rows.length) return task.stageOnePacket;
  const priorRow = rows.at(-1)!;
  const priorPacket = packets[rows.length - 1];
  return buildNextPacket(task, priorPacket, priorRow.stage + 1 as NextConnectedStageV2, requiredAcceptedArtifact(priorRow));
}

function buildNextPacket(
  task: DevelopmentTaskCaseV2,
  previousPacket: HashedStagePacketV2,
  stage: NextConnectedStageV2,
  priorArtifact: JsonRecord & { artifactType: string; taskId: string },
): HashedStagePacketV2 {
  const packet = buildNextProviderStagePacketV2({
    previousPacket,
    stage,
    executionFormArm: task.executionFormArm,
    priorArtifact,
    ...(stage === 3 ? { stageThreeSource: { evidencePack: task.canonical.evidencePack } } : {}),
  });
  return stage === 2 ? attachStage2PlanningCompilerBoundaryV2(packet) : packet;
}

function reusablePrefixLength(rows: readonly ConnectedDevelopmentStageRowV2[]): number {
  let count = 0;
  for (const row of rows) {
    const accepted = row.providerRun.disposition === 'ARTIFACT_ACCEPTED'
      && Boolean(row.providerRun.artifact)
      && Boolean(row.artifactHash);
    const approved = row.stage === 3 || canContinue(row);
    if (!accepted || !approved) break;
    count += 1;
  }
  return count;
}

function finalDispositionForRows(
  rows: readonly ConnectedDevelopmentStageRowV2[],
): ConnectedDevelopmentStage123ReceiptV2['finalDisposition'] {
  if (!rows[0] || !canContinue(rows[0])) return 'BLOCKED_BEFORE_STAGE2';
  if (!rows[1] || !canContinue(rows[1])) return 'BLOCKED_BEFORE_STAGE3';
  return 'STAGE3_EVALUATED';
}

function providerCostUsd(rows: readonly Readonly<ConnectedDevelopmentStageRowV2>[]): number {
  return Number(rows.reduce((total, row) =>
    total + [row.semanticRepair?.initialProviderRun, row.providerRun]
      .filter((run): run is Readonly<ProviderStageRunV2> => Boolean(run))
      .reduce((runTotal, run) => runTotal + run.attempts.reduce((sum, attempt) =>
        sum + (attempt.providerCostUsd ?? 0), 0), 0), 0).toFixed(12));
}

function validateInput(task: DevelopmentTaskCaseV2, route: DevelopmentModelRouteV2): void {
  if (task.stageOnePacket.packet.stage !== 1
    || task.stageOnePacket.packet.taskId !== task.taskId
    || task.stageOnePacket.packet.conditionId !== task.conditionId) {
    throw new Error('CONNECTED_STAGE1_BINDING_INVALID');
  }
  if (!route.routeId.trim() || !route.claimedModelIdentity.trim()) {
    throw new Error('CONNECTED_ROUTE_IDENTITY_INVALID');
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
