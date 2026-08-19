import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  lowerV2RBoundIntentGeneric,
  type GenericLoweringPolicyV2R,
  type GenericLoweringResultV2R,
} from './generic-lowerer-v2r';
import { buildPlannerOwnershipStageTwoPacketV2R } from './planner-ownership-stage2-packet-v2r';
import { bindV2ROperatorCatalogToPacketV2R } from './operator-catalog-v2r';
import {
  assertV2RPreregistrationComplete,
  type V2RPreregistrationManifest,
} from './v2r-preregistration-manifest';
import type { ProviderStageRunV2 } from './provider-transport-v2';
import {
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

// V2-1F connected episode runner.
//
// Runs one model route through the connected Stage 1 -> 2 -> 3 chain under the
// V2R selected-operator contract, then lowers the model's own Stage-3 output
// with the generic zero-add/zero-drop lowerer. Raw provider lineage is preserved
// end to end; no canonical handoff is substituted for the model's artifacts, and
// the lowerer performs no creative repair. The run is refused unless a complete
// V2R pre-registration manifest is supplied.

export interface V2RConnectedTaskV2 {
  taskId: string;
  conditionId: string;
  executionFormArm: 'FREE_CHOICE' | 'FORCED_NATIVE' | 'FORCED_HYBRID';
  stageOnePacket: HashedStagePacketV2;
  evidencePack: Readonly<JsonRecord>;
  loweringPolicy: GenericLoweringPolicyV2R;
}

export interface V2RConnectedRouteV2 {
  routeId: string;
  claimedModelIdentity: string;
  costBasis: 'USD_METERED' | 'TOKEN_PLAN_CREDITS_UNPRICED';
  runStage: (packet: HashedStagePacketV2) => Promise<Readonly<ProviderStageRunV2>>;
}

export interface V2RConnectedStageRowV2 {
  stage: 1 | 2 | 3;
  packetHash: string;
  priorArtifactHash: string | null;
  artifactHash: string | null;
  providerRun: Readonly<ProviderStageRunV2>;
}

export interface V2RConnectedEpisodeReceiptV2 {
  receiptVersion: 'EDITRON_OE_V2R_CONNECTED_EPISODE_RECEIPT_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  preregistrationManifestSha256: string;
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  costBasis: 'USD_METERED' | 'TOKEN_PLAN_CREDITS_UNPRICED';
  rows: readonly Readonly<V2RConnectedStageRowV2>[];
  finalDisposition:
    | 'STAGE3_LOWERED'
    | 'BLOCKED_BEFORE_STAGE2'
    | 'BLOCKED_BEFORE_STAGE3'
    | 'BLOCKED_BEFORE_LOWERING';
  lowering: Readonly<{
    performed: boolean;
    zeroAdd: boolean | null;
    zeroDrop: boolean | null;
    compileDisposition: string | null;
    compiledOperatorCount: number | null;
    selectedOperatorCount: number | null;
    diagnostics: readonly string[];
  }>;
  actualProviderCostUsd: number;
  stateEffects: readonly [];
  receiptHash: string;
}

export async function runV2RConnectedEpisodeV2(input: {
  manifest: unknown;
  task: V2RConnectedTaskV2;
  route: V2RConnectedRouteV2;
}): Promise<Readonly<V2RConnectedEpisodeReceiptV2>> {
  const manifest = assertV2RPreregistrationComplete(input.manifest);
  validateTask(input.task);
  const rows: V2RConnectedStageRowV2[] = [];

  const stageOne = await runStage({
    route: input.route,
    packet: input.task.stageOnePacket,
    priorArtifactHash: null,
  });
  rows.push(stageOne);
  if (!accepted(stageOne)) return receipt(input, manifest, rows, 'BLOCKED_BEFORE_STAGE2', notLowered());

  const stageTwoPacket = buildPlannerOwnershipStageTwoPacketV2R({
    previousPacket: input.task.stageOnePacket,
    executionFormArm: input.task.executionFormArm,
    priorArtifact: requireArtifact(stageOne),
    loweringPolicy: input.task.loweringPolicy,
  });
  const stageTwo = await runStage({
    route: input.route,
    packet: stageTwoPacket,
    priorArtifactHash: stageOne.artifactHash,
  });
  rows.push(stageTwo);
  if (!accepted(stageTwo)) return receipt(input, manifest, rows, 'BLOCKED_BEFORE_STAGE3', notLowered());

  const stageThreePacket = bindV2ROperatorCatalogToPacketV2R(buildNextProviderStagePacketV2({
    previousPacket: stageTwoPacket,
    stage: 3,
    executionFormArm: input.task.executionFormArm,
    priorArtifact: requireArtifact(stageTwo),
    stageThreeSource: { evidencePack: input.task.evidencePack },
    nodeContractVersion: 'V2R',
  }));
  const stageThree = await runStage({
    route: input.route,
    packet: stageThreePacket,
    priorArtifactHash: stageTwo.artifactHash,
  });
  rows.push(stageThree);
  if (!accepted(stageThree)) return receipt(input, manifest, rows, 'BLOCKED_BEFORE_LOWERING', notLowered());

  const lowering = lowerModelOutput(input.task, requireArtifact(stageTwo), requireArtifact(stageThree));
  return receipt(input, manifest, rows, 'STAGE3_LOWERED', lowering);
}

function lowerModelOutput(
  task: V2RConnectedTaskV2,
  editorialIntent: Readonly<JsonRecord>,
  evidenceBoundIntent: Readonly<JsonRecord>,
): Readonly<V2RConnectedEpisodeReceiptV2['lowering']> {
  let result: Readonly<GenericLoweringResultV2R>;
  try {
    result = lowerV2RBoundIntentGeneric({
      taskId: task.taskId,
      editorialIntent,
      evidenceBoundIntent,
      evidencePack: task.evidencePack,
      policy: task.loweringPolicy,
    });
  } catch (error) {
    return deepFreezeV1({
      performed: true,
      zeroAdd: null,
      zeroDrop: null,
      compileDisposition: 'LOWERING_REJECTED',
      compiledOperatorCount: null,
      selectedOperatorCount: null,
      diagnostics: [`LOWERING_ERROR:${error instanceof Error ? error.message : 'UNKNOWN'}`],
    });
  }
  const compiled = result.compiled;
  const compiledLowering = (compiled.lowering ?? {}) as JsonRecord;
  return deepFreezeV1({
    performed: true,
    zeroAdd: result.zeroAdd,
    zeroDrop: result.zeroDrop,
    compileDisposition: String(compiled.compileDisposition),
    compiledOperatorCount: Number(compiledLowering.compiledOperatorCount ?? 0),
    selectedOperatorCount: Number(compiledLowering.selectedOperatorCount ?? 0),
    diagnostics: result.diagnostics,
  });
}

async function runStage(input: {
  route: V2RConnectedRouteV2;
  packet: HashedStagePacketV2;
  priorArtifactHash: string | null;
}): Promise<V2RConnectedStageRowV2> {
  const packetPriorArtifactHash = stringOrNull(input.packet.packet.modelInput.priorArtifactHash);
  if (packetPriorArtifactHash !== input.priorArtifactHash) {
    throw new Error(`V2R_CONNECTED_PRIOR_ARTIFACT_HASH_DRIFT:STAGE_${input.packet.packet.stage}`);
  }
  const providerRun = await input.route.runStage(input.packet);
  const artifactHash = providerRun.disposition === 'ARTIFACT_ACCEPTED' && providerRun.artifact
    ? hashCanonicalJsonV1(providerRun.artifact)
    : null;
  return deepFreezeV1({
    stage: input.packet.packet.stage as 1 | 2 | 3,
    packetHash: input.packet.packetHash,
    priorArtifactHash: input.priorArtifactHash,
    artifactHash,
    providerRun,
  });
}

function receipt(
  input: { task: V2RConnectedTaskV2; route: V2RConnectedRouteV2 },
  manifest: Readonly<V2RPreregistrationManifest>,
  rows: readonly V2RConnectedStageRowV2[],
  finalDisposition: V2RConnectedEpisodeReceiptV2['finalDisposition'],
  lowering: V2RConnectedEpisodeReceiptV2['lowering'],
): Readonly<V2RConnectedEpisodeReceiptV2> {
  const actualProviderCostUsd = Number(rows
    .reduce((total, row) => total + row.providerRun.attempts
      .reduce((sum, attempt) => sum + (attempt.providerCostUsd ?? 0), 0), 0)
    .toFixed(12));
  const material = {
    receiptVersion: 'EDITRON_OE_V2R_CONNECTED_EPISODE_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    preregistrationManifestSha256: manifest.manifestSha256,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    costBasis: input.route.costBasis,
    rows,
    finalDisposition,
    lowering,
    actualProviderCostUsd,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

function notLowered(): V2RConnectedEpisodeReceiptV2['lowering'] {
  return deepFreezeV1({
    performed: false,
    zeroAdd: null,
    zeroDrop: null,
    compileDisposition: null,
    compiledOperatorCount: null,
    selectedOperatorCount: null,
    diagnostics: [],
  });
}

function accepted(row: Readonly<V2RConnectedStageRowV2>): boolean {
  return row.providerRun.disposition === 'ARTIFACT_ACCEPTED'
    && Boolean(row.providerRun.artifact)
    && Boolean(row.artifactHash);
}

function requireArtifact(row: Readonly<V2RConnectedStageRowV2>): JsonRecord & { artifactType: string; taskId: string } {
  if (!row.providerRun.artifact || !row.artifactHash) {
    throw new Error(`V2R_CONNECTED_ACCEPTED_ARTIFACT_MISSING:STAGE_${row.stage}`);
  }
  return row.providerRun.artifact as JsonRecord & { artifactType: string; taskId: string };
}

function validateTask(task: V2RConnectedTaskV2): void {
  if (task.stageOnePacket.packet.stage !== 1
    || task.stageOnePacket.packet.taskId !== task.taskId
    || task.stageOnePacket.packet.conditionId !== task.conditionId) {
    throw new Error('V2R_CONNECTED_STAGE1_BINDING_INVALID');
  }
  if (task.loweringPolicy.taskId !== task.taskId) {
    throw new Error('V2R_CONNECTED_LOWERING_POLICY_TASK_DRIFT');
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
