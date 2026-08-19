import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  lowerV2RBoundIntentGeneric,
  type GenericLoweringPolicyV2R,
  type GenericLoweringResultV2R,
} from './generic-lowerer-v2r';
import { buildPlannerOwnershipStageTwoPacketV2R } from './planner-ownership-stage2-packet-v2r';
import {
  bindV2ROperatorCatalogToPacketV2R,
  V2R_OPERATOR_CATALOG,
} from './operator-catalog-v2r';
import {
  assertV2RPreregistrationComplete,
  V2R_CONNECTED_EPISODE_RECEIPT_VERSION,
  type V2RPreregistrationManifest,
} from './v2r-preregistration-manifest';
import { buildEvaluatorPolicyFreezeV2R } from './evaluator-freeze-v2r';
import type { ProviderStageRunV2 } from './provider-transport-v2';
import { bindV2RProviderStageBudgetV2 } from './per-attempt-budget-v2r';
import { validateSelectedOperatorNodesV2R } from './stage2-selected-operator-contract-v2r';
import { bindV2RResearchExecutionContractToPacket } from './v2r-research-execution-contract';
import {
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const V2R_CONNECTED_EPISODE_PARTIAL_RECEIPT_VERSION =
  'EDITRON_OE_V2R_CONNECTED_EPISODE_PARTIAL_RECEIPT_V1' as const;

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
  receiptVersion: typeof V2R_CONNECTED_EPISODE_RECEIPT_VERSION;
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
    | 'BLOCKED_BEFORE_LOWERING'
    | 'UNVERIFIABLE_BEFORE_LOWERING'
    | 'CAPABILITY_GAP_BEFORE_LOWERING';
  lowering: Readonly<{
    performed: boolean;
    zeroAdd: boolean | null;
    zeroDrop: boolean | null;
    compileDisposition: string | null;
    compiledOperatorCount: number | null;
    selectedOperatorCount: number | null;
    sourceEditorialIntentHash: string | null;
    sourceEvidenceBoundIntentHash: string | null;
    evidencePackHash: string | null;
    compiledGraphHash: string | null;
    compiledOperatorIds: readonly string[];
    selectedOperatorIds: readonly string[];
    diagnostics: readonly string[];
  }>;
  actualProviderCostUsd: number;
  stateEffects: readonly [];
  receiptHash: string;
}

export interface V2RConnectedEpisodePartialReceiptV2R {
  receiptVersion: typeof V2R_CONNECTED_EPISODE_PARTIAL_RECEIPT_VERSION;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  preregistrationManifestSha256: string;
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  costBasis: 'USD_METERED' | 'TOKEN_PLAN_CREDITS_UNPRICED';
  rows: readonly Readonly<V2RConnectedStageRowV2>[];
  failurePoint: 'BEFORE_STAGE2_COMPLETION' | 'BEFORE_STAGE3_COMPLETION';
  diagnostics: readonly string[];
  actualProviderCostUsd: number;
  stateEffects: readonly [];
  partialReceiptHash: string;
}

export class V2RConnectedEpisodePartialError extends Error {
  readonly partialReceipt: Readonly<V2RConnectedEpisodePartialReceiptV2R>;

  constructor(partialReceipt: Readonly<V2RConnectedEpisodePartialReceiptV2R>) {
    super(`V2R_CONNECTED_PARTIAL_RECEIPT_AVAILABLE:${partialReceipt.failurePoint}`);
    this.name = 'V2RConnectedEpisodePartialError';
    this.partialReceipt = partialReceipt;
  }
}

export async function runV2RConnectedEpisodeV2(input: {
  manifest: unknown;
  task: V2RConnectedTaskV2;
  route: V2RConnectedRouteV2;
}): Promise<Readonly<V2RConnectedEpisodeReceiptV2>> {
  const manifest = assertV2RPreregistrationComplete(input.manifest);
  validateTask(input.task, manifest);
  validateRoute(input.route, manifest);
  const rows: V2RConnectedStageRowV2[] = [];
  const stageOnePacket = bindV2RProviderStageBudgetV2(input.task.stageOnePacket);

  const stageOne = await runStage({
    route: input.route,
    packet: stageOnePacket,
    priorArtifactHash: null,
  });
  rows.push(stageOne);
  if (!accepted(stageOne)) return receipt(input, manifest, rows, 'BLOCKED_BEFORE_STAGE2', notLowered());

  let stageTwoPacket: HashedStagePacketV2;
  let stageTwo: V2RConnectedStageRowV2;
  try {
    stageTwoPacket = bindV2RResearchExecutionContractToPacket({ source: buildPlannerOwnershipStageTwoPacketV2R({
      previousPacket: stageOnePacket,
      executionFormArm: input.task.executionFormArm,
      priorArtifact: requireArtifact(stageOne),
      loweringPolicy: input.task.loweringPolicy,
    }) });
    stageTwo = await runStage({
      route: input.route,
      packet: stageTwoPacket,
      priorArtifactHash: stageOne.artifactHash,
    });
  } catch (error) {
    throw partialError(input, manifest, rows, 'BEFORE_STAGE2_COMPLETION', error);
  }
  rows.push(stageTwo);
  if (!accepted(stageTwo)) return receipt(input, manifest, rows, 'BLOCKED_BEFORE_STAGE3', notLowered());

  const stageTwoArtifact = requireArtifact(stageTwo);
  const stageTwoDiagnostics = validateSelectedOperatorNodesV2R(
    stageTwoArtifact.nodes,
    catalogOperatorIds(),
  );
  if (stageTwoDiagnostics.length) {
    return receipt(
      input,
      manifest,
      rows,
      'BLOCKED_BEFORE_STAGE3',
      notLowered(stageTwoDiagnostics.map((diagnostic) => `STAGE2_CONTRACT_REJECTED:${diagnostic}`)),
    );
  }

  let stageThree: V2RConnectedStageRowV2;
  try {
    const stageThreePacket = bindV2RResearchExecutionContractToPacket({ source: bindV2RProviderStageBudgetV2(bindV2ROperatorCatalogToPacketV2R(buildNextProviderStagePacketV2({
      previousPacket: stageTwoPacket,
      stage: 3,
      executionFormArm: input.task.executionFormArm,
      priorArtifact: stageTwoArtifact,
      stageThreeSource: { evidencePack: input.task.evidencePack },
      nodeContractVersion: 'V2R',
    }))) });
    stageThree = await runStage({
      route: input.route,
      packet: stageThreePacket,
      priorArtifactHash: stageTwo.artifactHash,
    });
  } catch (error) {
    throw partialError(input, manifest, rows, 'BEFORE_STAGE3_COMPLETION', error);
  }
  rows.push(stageThree);
  if (!accepted(stageThree)) return receipt(input, manifest, rows, 'BLOCKED_BEFORE_LOWERING', notLowered());

  const stageThreeArtifact = requireArtifact(stageThree);
  if (stageThreeArtifact.stageDisposition === 'UNVERIFIABLE') {
    return receipt(
      input,
      manifest,
      rows,
      'UNVERIFIABLE_BEFORE_LOWERING',
      notLowered(['STAGE3_UNVERIFIABLE_EXECUTION_BLOCK']),
    );
  }
  if (stageThreeArtifact.stageDisposition === 'CAPABILITY_GAP') {
    return receipt(
      input,
      manifest,
      rows,
      'CAPABILITY_GAP_BEFORE_LOWERING',
      notLowered(['STAGE3_CAPABILITY_GAP_EXECUTION_BLOCK']),
    );
  }
  const lowering = lowerModelOutput(input.task, stageTwoArtifact, stageThreeArtifact);
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
      sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent),
      sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent),
      evidencePackHash: hashCanonicalJsonV1(task.evidencePack),
      compiledGraphHash: null,
      compiledOperatorIds: [],
      selectedOperatorIds: [],
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
    sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent),
    evidencePackHash: hashCanonicalJsonV1(task.evidencePack),
    compiledGraphHash: hashCanonicalJsonV1(compiled),
    compiledOperatorIds: [...result.compiledOperatorIds],
    selectedOperatorIds: [...result.selectedOperatorIds],
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
  const actualProviderCostUsd = providerCost(rows);
  const material = {
    receiptVersion: V2R_CONNECTED_EPISODE_RECEIPT_VERSION,
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

function partialError(
  input: { task: V2RConnectedTaskV2; route: V2RConnectedRouteV2 },
  manifest: Readonly<V2RPreregistrationManifest>,
  rows: readonly V2RConnectedStageRowV2[],
  failurePoint: V2RConnectedEpisodePartialReceiptV2R['failurePoint'],
  error: unknown,
): V2RConnectedEpisodePartialError {
  if (!rows.length) throw error;
  const material = {
    receiptVersion: V2R_CONNECTED_EPISODE_PARTIAL_RECEIPT_VERSION,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    preregistrationManifestSha256: manifest.manifestSha256,
    taskId: input.task.taskId,
    conditionId: input.task.conditionId,
    routeId: input.route.routeId,
    claimedModelIdentity: input.route.claimedModelIdentity,
    costBasis: input.route.costBasis,
    rows,
    failurePoint,
    diagnostics: [`HARNESS_ERROR:${safeError(error)}`],
    actualProviderCostUsd: providerCost(rows),
    stateEffects: [] as const,
  };
  return new V2RConnectedEpisodePartialError(deepFreezeV1({
    ...material,
    partialReceiptHash: hashCanonicalJsonV1(material),
  }));
}

function providerCost(rows: readonly V2RConnectedStageRowV2[]): number {
  return Number(rows.reduce((total, row) => total + row.providerRun.attempts
    .reduce((sum, attempt) => sum + (attempt.providerCostUsd ?? 0), 0), 0)
    .toFixed(12));
}

function notLowered(diagnostics: readonly string[] = []): V2RConnectedEpisodeReceiptV2['lowering'] {
  return deepFreezeV1({
    performed: false,
    zeroAdd: null,
    zeroDrop: null,
    compileDisposition: null,
    compiledOperatorCount: null,
    selectedOperatorCount: null,
    sourceEditorialIntentHash: null,
    sourceEvidenceBoundIntentHash: null,
    evidencePackHash: null,
    compiledGraphHash: null,
    compiledOperatorIds: [],
    selectedOperatorIds: [],
    diagnostics: [...diagnostics],
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

function validateTask(
  task: V2RConnectedTaskV2,
  manifest: Readonly<V2RPreregistrationManifest>,
): void {
  if (task.stageOnePacket.packet.stage !== 1
    || task.stageOnePacket.packet.taskId !== task.taskId
    || task.stageOnePacket.packet.conditionId !== task.conditionId) {
    throw new Error('V2R_CONNECTED_STAGE1_BINDING_INVALID');
  }
  if (task.loweringPolicy.taskId !== task.taskId) {
    throw new Error('V2R_CONNECTED_LOWERING_POLICY_TASK_DRIFT');
  }
  const manifestPolicyHash = manifest.lowerer.taskPolicySha256[
    task.taskId as keyof typeof manifest.lowerer.taskPolicySha256
  ];
  if (!manifestPolicyHash || hashCanonicalJsonV1(task.loweringPolicy) !== manifestPolicyHash) {
    throw new Error('V2R_CONNECTED_LOWERING_POLICY_NOT_PREREGISTERED');
  }
  const evaluatorTask = buildEvaluatorPolicyFreezeV2R().tasks
    .find((candidate) => candidate.taskId === task.taskId);
  const condition = evaluatorTask?.conditions
    .find((candidate) => candidate.conditionId === task.conditionId);
  if (!evaluatorTask || !condition) {
    throw new Error('V2R_CONNECTED_TASK_CONDITION_NOT_PREREGISTERED');
  }
  if (task.executionFormArm !== 'FREE_CHOICE'
    && task.executionFormArm.replace('FORCED_', '') !== evaluatorTask.executionForm) {
    throw new Error('V2R_CONNECTED_EXECUTION_FORM_NOT_PREREGISTERED');
  }
}

function validateRoute(
  route: V2RConnectedRouteV2,
  manifest: Readonly<V2RPreregistrationManifest>,
): void {
  const registered = manifest.routeRoster.routes.find(({ routeId }) => routeId === route.routeId);
  if (!registered || registered.claimedModelIdentity !== route.claimedModelIdentity
    || registered.costBasis !== route.costBasis) {
    throw new Error('V2R_CONNECTED_ROUTE_NOT_PREREGISTERED');
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);
}

function catalogOperatorIds(): ReadonlySet<string> {
  const operators = Array.isArray(V2R_OPERATOR_CATALOG.operators)
    ? V2R_OPERATOR_CATALOG.operators
    : [];
  return new Set(operators.flatMap((operator) => (
    operator && typeof operator === 'object' && !Array.isArray(operator)
      && typeof (operator as JsonRecord).operatorId === 'string'
      ? [(operator as JsonRecord).operatorId as string]
      : []
  )));
}
