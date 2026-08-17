import { describe, expect, it, vi } from 'vitest';

import dev02EvidenceBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02IntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02EvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import dev02BlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  continueConnectedDevelopmentStage123V2,
  runConnectedDevelopmentStage123V2,
  type ConnectedDevelopmentStage123ReceiptV2,
} from '@/lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import type {
  DevelopmentModelRouteV2,
  DevelopmentTaskCaseV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import {
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;

describe('open-ended planner V2 connected Stage 1-3 continuation', () => {
  it('reuses the accepted prefix byte-for-byte and calls only missing stages', async () => {
    const source = await timedOutAfterStageOne();
    const calls: number[] = [];
    const route = acceptedRoute(async (packet) => {
      calls.push(packet.packet.stage);
      return accepted(packet, packet.packet.stage === 2 ? asRecord(dev02IntentJson) : asRecord(dev02EvidenceBoundJson));
    });

    const result = await continueConnectedDevelopmentStage123V2({ task: task(), route, sourceReceipt: source });

    expect(calls).toEqual([2, 3]);
    expect(result.reusedRowHashes).toEqual([hashCanonicalJsonV1(source.rows[0])]);
    expect(result.supersededRowHashes).toEqual([hashCanonicalJsonV1(source.rows[1])]);
    expect(result.liveRowHashes).toHaveLength(2);
    expect(result.stage123Receipt.rows[0]).toEqual(source.rows[0]);
    expect(result.stage123Receipt.finalDisposition).toBe('STAGE3_EVALUATED');
    expect(result.stateEffects).toEqual([]);
    const { receiptHash, ...unsigned } = result;
    expect(receiptHash).toBe(hashCanonicalJsonV1(unsigned));
  });

  it('makes zero provider calls when all three accepted rows already exist', async () => {
    const source = await completedSource();
    const runStage = vi.fn(async () => { throw new Error('must not dispatch'); });
    const result = await continueConnectedDevelopmentStage123V2({
      task: task(), route: acceptedRoute(runStage), sourceReceipt: source,
    });
    expect(runStage).not.toHaveBeenCalled();
    expect(result.reusedRowHashes).toHaveLength(3);
    expect(result.liveRowHashes).toEqual([]);
    expect(result.stage123Receipt.receiptHash).toBe(source.receiptHash);
  });

  it('rejects receipt drift before any provider call', async () => {
    const source = await timedOutAfterStageOne();
    const drifted = structuredClone(source) as unknown as {
      rows: Array<{ packetHash: string }>;
    };
    drifted.rows[0].packetHash = '0'.repeat(64);
    const runStage = vi.fn(async () => { throw new Error('must not dispatch'); });
    await expect(continueConnectedDevelopmentStage123V2({
      task: task(), route: acceptedRoute(runStage),
      sourceReceipt: drifted as unknown as ConnectedDevelopmentStage123ReceiptV2,
    })).rejects.toThrow('CONNECTED_CONTINUATION_SOURCE_RECEIPT_INVALID');
    expect(runStage).not.toHaveBeenCalled();
  });
});

async function timedOutAfterStageOne(): Promise<Readonly<ConnectedDevelopmentStage123ReceiptV2>> {
  return runConnectedDevelopmentStage123V2({
    task: task(),
    route: acceptedRoute(async (packet) => packet.packet.stage === 1
      ? accepted(packet, asRecord(dev02BlueprintJson))
      : timeout(packet)),
  });
}

async function completedSource(): Promise<Readonly<ConnectedDevelopmentStage123ReceiptV2>> {
  return runConnectedDevelopmentStage123V2({
    task: task(),
    route: acceptedRoute(async (packet) => accepted(packet, packet.packet.stage === 1
      ? asRecord(dev02BlueprintJson)
      : packet.packet.stage === 2 ? asRecord(dev02IntentJson) : asRecord(dev02EvidenceBoundJson))),
  });
}

function task(): DevelopmentTaskCaseV2 {
  return {
    taskId: 'DEV-02', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
    stageOnePacket: buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'),
    canonical: {
      referenceBlueprint: asRecord(dev02BlueprintJson), editorialIntent: asRecord(dev02IntentJson),
      evidencePack: asRecord(dev02EvidencePackJson), evidenceBoundIntent: asRecord(dev02EvidenceBoundJson),
    },
    evaluateStage: (stage) => stage === 1
      ? { disposition: 'HUMAN_REVIEW_REQUIRED', diagnostics: [] }
      : { disposition: stage === 2 ? 'EXPECTED_CAPABILITY_GAP' : 'PASS', diagnostics: [] },
    runDeterministicMechanics: async () => ({
      taskId: 'DEV-02', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      stage4Disposition: 'PASS', stage5Disposition: 'PROCEED', stage6Disposition: 'PASS',
      stateEffects: [], evidenceRefs: [],
    }),
  };
}

function acceptedRoute(runStage: DevelopmentModelRouteV2['runStage']): DevelopmentModelRouteV2 {
  return { routeId: 'QWEN_3_8_MAX', claimedModelIdentity: 'qwen3.8-max', costBasis: 'TOKEN_PLAN_CREDITS_UNPRICED', runStage };
}

function accepted(packet: HashedStagePacketV2, artifact: JsonRecord): Readonly<ProviderStageRunV2> {
  return {
    runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    packetHash: packet.packetHash, disposition: 'ARTIFACT_ACCEPTED', attempts: [], artifact,
  };
}

function timeout(packet: HashedStagePacketV2): Readonly<ProviderStageRunV2> {
  return {
    runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    packetHash: packet.packetHash, disposition: 'PROVIDER_TIMEOUT', attempts: [],
  };
}

function asRecord(value: unknown): JsonRecord {
  return structuredClone(value) as JsonRecord;
}
