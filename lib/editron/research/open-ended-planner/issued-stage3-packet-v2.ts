import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  HashedStagePacketV2,
  ProviderStagePacketV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export const ISSUED_STAGE3_PACKET_HASH_V2 =
  'bc561a66bc15e0d914e47d905ad4629b01fdb92fac519a5fc1d3720d30a1762a';
export const ISSUED_STAGE3_TRANSPORT_HASH_V2 =
  '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';

/**
 * Restores the exact output schema used by the already-issued DEV-02 Stage-3
 * benchmark. The shared packet builder has since gained broader task schemas;
 * historical benchmark requests must not silently inherit those mutations.
 */
export function bindIssuedStage3PacketV2(
  candidate: HashedStagePacketV2,
): HashedStagePacketV2 {
  const packet = structuredClone(candidate.packet) as ProviderStagePacketV2;
  if (packet.stage !== 3 || packet.taskId !== 'DEV-02'
    || packet.conditionId !== 'BASELINE' || packet.executionFormArm !== 'FREE_CHOICE') {
    throw new Error('ISSUED_STAGE3_PACKET_IDENTITY_MISMATCH');
  }

  packet.stageBudget.maxVisibleOutputTokens = 2_400;

  const properties = child(packet.outputContract, 'properties');
  const evidenceProperties = child(child(child(properties, 'evidenceBindings'), 'items'), 'properties');
  child(evidenceProperties, 'factIds').minItems = 1;

  const proofProperties = child(child(child(properties, 'proofPlan'), 'items'), 'properties');
  child(proofProperties, 'requiredFactIds').minItems = 1;

  const unresolvedProperties = child(child(child(properties, 'unresolvedRequirements'), 'items'), 'properties');
  delete unresolvedProperties.failureDisposition;

  const packetHash = hashCanonicalJsonV1(packet);
  const transportHash = hashCanonicalJsonV1(candidate.transportAttachments);
  if (packetHash !== ISSUED_STAGE3_PACKET_HASH_V2
    || transportHash !== ISSUED_STAGE3_TRANSPORT_HASH_V2) {
    throw new Error('ISSUED_STAGE3_PACKET_PROVENANCE_DRIFT');
  }

  return deepFreezeV1({
    packet: deepFreezeV1(packet),
    packetHash,
    transportAttachments: deepFreezeV1([...candidate.transportAttachments]),
    transportHash,
  });
}

function child(parent: JsonRecord, key: string): JsonRecord {
  const value = parent[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`ISSUED_STAGE3_SCHEMA_PATH_MISSING:${key}`);
  }
  return value as JsonRecord;
}
