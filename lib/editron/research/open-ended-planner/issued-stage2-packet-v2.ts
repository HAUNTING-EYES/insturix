import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  HashedStagePacketV2,
  ProviderStagePacketV2,
} from './staged-packet-v2';

export const ISSUED_STAGE2_PACKET_HASH_V2 =
  '433b31abaa52cd883376c76e6c094e957ef58d69e110ba3fff6a525bf175830e';
export const ISSUED_STAGE2_TRANSPORT_HASH_V2 =
  '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';

/**
 * Restores the exact budget used by the already-issued DEV-02 Stage-2
 * benchmark. Current connected trials have a larger retry-aware output
 * budget; that must not rewrite the identity of the historical paid run.
 */
export function bindIssuedStage2PacketV2(
  candidate: HashedStagePacketV2,
): HashedStagePacketV2 {
  const packet = structuredClone(candidate.packet) as ProviderStagePacketV2;
  if (packet.stage !== 2 || packet.taskId !== 'DEV-02'
    || packet.conditionId !== 'BASELINE' || packet.executionFormArm !== 'FREE_CHOICE') {
    throw new Error('ISSUED_STAGE2_PACKET_IDENTITY_MISMATCH');
  }

  packet.stageBudget.maxVisibleOutputTokens = 4_000;

  const packetHash = hashCanonicalJsonV1(packet);
  const transportHash = hashCanonicalJsonV1(candidate.transportAttachments);
  if (packetHash !== ISSUED_STAGE2_PACKET_HASH_V2
    || transportHash !== ISSUED_STAGE2_TRANSPORT_HASH_V2) {
    throw new Error('ISSUED_STAGE2_PACKET_PROVENANCE_DRIFT');
  }

  return deepFreezeV1({
    packet: deepFreezeV1(packet),
    packetHash,
    transportAttachments: deepFreezeV1([...candidate.transportAttachments]),
    transportHash,
  });
}
