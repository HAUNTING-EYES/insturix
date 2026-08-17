import dev02Bound from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02Blueprint from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import dev02EvidencePack from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import dev02Intent from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import { runConnectedDevelopmentStage123V2, type ConnectedDevelopmentStage123ReceiptV2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import type { DevelopmentModelRouteV2, DevelopmentTaskCaseV2 } from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import { buildDevelopmentReferenceImageSequenceStageOnePacketV2, type HashedStagePacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export async function completedSource(): Promise<ConnectedDevelopmentStage123ReceiptV2> {
  return runConnectedDevelopmentStage123V2({
    task: task(),
    route: route(async (packet) => accepted(packet, packet.packet.stage === 1
      ? asRecord(dev02Blueprint) : packet.packet.stage === 2 ? asRecord(dev02Intent) : asRecord(dev02Bound))),
  }) as Promise<ConnectedDevelopmentStage123ReceiptV2>;
}

export function task(): DevelopmentTaskCaseV2 {
  return {
    taskId: 'DEV-02', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
    stageOnePacket: buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'),
    canonical: { referenceBlueprint: asRecord(dev02Blueprint), editorialIntent: asRecord(dev02Intent), evidencePack: asRecord(dev02EvidencePack), evidenceBoundIntent: asRecord(dev02Bound) },
    evaluateStage: () => ({ disposition: 'PASS', diagnostics: [] }),
    runDeterministicMechanics: async () => ({ taskId: 'DEV-02', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION', stage4Disposition: 'PASS', stage5Disposition: 'PROCEED', stage6Disposition: 'PASS', stateEffects: [], evidenceRefs: [] }),
  };
}

function route(runStage: DevelopmentModelRouteV2['runStage']): DevelopmentModelRouteV2 {
  return { routeId: 'QWEN_3_8_MAX', claimedModelIdentity: 'qwen3.8-max', costBasis: 'TOKEN_PLAN_CREDITS_UNPRICED', runStage };
}
function accepted(packet: HashedStagePacketV2, artifact: JsonRecord): ProviderStageRunV2 {
  return { runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION', packetHash: packet.packetHash, disposition: 'ARTIFACT_ACCEPTED', attempts: [], artifact };
}
function asRecord(value: unknown): JsonRecord { return structuredClone(value) as JsonRecord; }
