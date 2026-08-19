import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  GENERIC_LOWERING_POLICY_VERSION_V2R,
  PLANNER_INPUT_OWNERSHIP_VERSION_V2R,
  buildPlannerInputOwnershipV2R,
  type GenericLoweringPolicyV2R,
  type PlannerInputOwnershipV2R,
} from './generic-lowerer-v2r';
import { bindV2ROperatorCatalogToPacketV2R } from './operator-catalog-v2r';
import { bindV2RProviderStageBudgetV2 } from './per-attempt-budget-v2r';
import {
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const PLANNER_OWNERSHIP_STAGE2_PACKET_VERSION_V2R =
  'EDITRON_OE_PLANNER_OWNERSHIP_STAGE2_PACKET_V2R_3' as const;

type ExecutionFormArmV2R =
  | 'FREE_CHOICE'
  | 'FORCED_NATIVE'
  | 'FORCED_GENERATED_COMPOSITION'
  | 'FORCED_HYBRID'
  | 'THRESHOLD_ABLATION'
  | 'SIGNAL_ABLATION';

const OWNERSHIP_INSTRUCTIONS_V2R = [
  'modelInput.plannerInputOwnership is the normative field-ownership contract for this packet. For each selected operator, put only its modelOwnedInputFields in nodeInputs, using the exact field names and JSON schemas shown there.',
  'Never put compilerBoundInputFields or unboundInputFields in nodeInputs, and never invent placeholder project ids, revisions, ranges, overlay ids, evidence ids, or resolver-produced operation forms.',
  'A required unboundInputField makes that operator unavailable under this task policy. Select a different fully bound operator or declare the exact capability gap; do not guess a value or silently weaken the requested edit.',
] as const;

export function buildPlannerOwnershipStageTwoPacketV2R(input: {
  previousPacket: HashedStagePacketV2;
  executionFormArm: ExecutionFormArmV2R;
  priorArtifact: { artifactType: string; taskId: string; [key: string]: unknown };
  loweringPolicy: GenericLoweringPolicyV2R;
}): HashedStagePacketV2 {
  const ownership = buildPlannerInputOwnershipV2R(input.loweringPolicy);
  const base = bindV2ROperatorCatalogToPacketV2R(buildNextProviderStagePacketV2({
    previousPacket: input.previousPacket,
    stage: 2,
    executionFormArm: input.executionFormArm,
    priorArtifact: input.priorArtifact,
    nodeContractVersion: 'V2R',
  }));
  assertOwnershipBindingV2R(base, ownership);

  const packet = deepFreezeV1({
    ...base.packet,
    instructions: [...base.packet.instructions, ...OWNERSHIP_INSTRUCTIONS_V2R],
    modelInput: {
      ...base.packet.modelInput,
      plannerInputOwnershipPacketVersion: PLANNER_OWNERSHIP_STAGE2_PACKET_VERSION_V2R,
      plannerInputOwnership: ownership,
    },
  });
  const transportAttachments = deepFreezeV1([...base.transportAttachments]);
  return bindV2RProviderStageBudgetV2(deepFreezeV1({
    packet,
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments,
    transportHash: hashCanonicalJsonV1(transportAttachments),
  }));
}

function assertOwnershipBindingV2R(
  packet: HashedStagePacketV2,
  ownership: Readonly<PlannerInputOwnershipV2R>,
): void {
  if (!Object.isFrozen(ownership)) throw new Error('PLANNER_INPUT_OWNERSHIP_NOT_IMMUTABLE');
  if (ownership.ownershipVersion !== PLANNER_INPUT_OWNERSHIP_VERSION_V2R
    || ownership.policyVersion !== GENERIC_LOWERING_POLICY_VERSION_V2R) {
    throw new Error('PLANNER_INPUT_OWNERSHIP_VERSION_DRIFT');
  }
  if (packet.packet.stage !== 2 || packet.packet.taskId !== ownership.taskId) {
    throw new Error('PLANNER_INPUT_OWNERSHIP_TASK_DRIFT');
  }
  const catalog = record(packet.packet.modelInput.operatorCatalog);
  if (catalog.version !== ownership.operatorCatalogVersion
    || catalog.catalogRevision !== ownership.operatorCatalogRevision
    || catalog.catalogSha256 !== ownership.operatorCatalogSha256) {
    throw new Error('PLANNER_INPUT_OWNERSHIP_CATALOG_DRIFT');
  }
  const catalogOperatorIds = records(catalog.operators).map((operator) => text(operator.operatorId));
  const ownershipOperatorIds = ownership.operators.map(({ operatorId }) => operatorId);
  if (new Set(catalogOperatorIds).size !== catalogOperatorIds.length
    || new Set(ownershipOperatorIds).size !== ownershipOperatorIds.length
    || hashCanonicalJsonV1(catalogOperatorIds) !== hashCanonicalJsonV1(ownershipOperatorIds)) {
    throw new Error('PLANNER_INPUT_OWNERSHIP_OPERATOR_COVERAGE_DRIFT');
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
