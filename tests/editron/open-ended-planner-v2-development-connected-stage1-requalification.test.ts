import { describe, expect, it, vi } from 'vitest';

import dev02Bound from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02Intent from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02Reference from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildConnectedStage1RequalificationHandoffV2,
  buildConnectedStage1SemanticRepairHandoffV2,
  buildConnectedStage2ReevaluationHandoffV2,
} from '@/lib/editron/research/open-ended-planner/development-connected-stage1-requalification-v2';
import {
  continueConnectedDevelopmentStage123V2,
  runConnectedDevelopmentStage123V2,
  type ConnectedDevelopmentStage123ReceiptV2,
} from '@/lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import type { DevelopmentModelRouteV2 } from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import type { HashedStagePacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import { completedSource, task } from './open-ended-planner-v2-development-connected-stage1-requalification.fixture';

type JsonRecord = Record<string, unknown>;

describe('open-ended planner V2 Stage-1 requalification handoff', () => {
  it('supersedes the full chain and reruns Stage 1-3 from one hash-bound semantic repair', async () => {
    const source = await completedSource();
    const calls: number[] = [];
    const route = acceptedRoute(async (packet) => {
      calls.push(packet.packet.stage);
      const artifact = packet.packet.stage === 1 ? dev02Reference
        : packet.packet.stage === 2 ? dev02Intent : dev02Bound;
      return accepted(packet, structuredClone(artifact) as JsonRecord);
    });
    const build = buildConnectedStage1SemanticRepairHandoffV2({
      task: task(), route, sourceReceipt: source,
      repairDiagnostics: ['TITLE_YELLOW', 'OPPOSED_PANEL_MOTION'],
    });
    const receipt = await runConnectedDevelopmentStage123V2({
      task: build.repairedTask, route,
    });

    expect(calls).toEqual([1, 2, 3]);
    expect(build.handoff.sourceStage1RowHash).toBe(hashCanonicalJsonV1(source.rows[0]));
    expect(build.handoff.supersededRowHashes).toEqual(source.rows.map(hashCanonicalJsonV1));
    expect(build.handoff.repairSource.repairDiagnostics).toEqual([
      'TITLE_YELLOW', 'OPPOSED_PANEL_MOTION',
    ]);
    expect(build.repairedTask.stageOnePacket.transportHash).toBe(task().stageOnePacket.transportHash);
    expect(build.repairedTask.stageOnePacket.packetHash).not.toBe(task().stageOnePacket.packetHash);
    expect(build.repairedTask.stageOnePacket.packet.modelInput).toHaveProperty('stageOneSemanticRepairFeedback');
    expect(receipt.finalDisposition).toBe('STAGE3_EVALUATED');
    expect(receipt.rows[0].semanticRepair).toBeNull();
    expect(build.handoff.stateEffects).toEqual([]);
  });

  it('rejects an empty Stage-1 repair diagnostic before provider dispatch', async () => {
    const source = await completedSource();
    const runStage = vi.fn(async () => { throw new Error('must not dispatch'); });
    expect(() => buildConnectedStage1SemanticRepairHandoffV2({
      task: task(), route: acceptedRoute(runStage), sourceReceipt: source,
      repairDiagnostics: [''],
    })).toThrow(/CONNECTED_STAGE1_SEMANTIC_REPAIR_NOT_ELIGIBLE/);
    expect(runStage).not.toHaveBeenCalled();
  });

  it('reuses only hash-verified Stage 1 and calls Stage 2-3 under the new evaluator contract', async () => {
    const source = await completedSource();
    const calls: number[] = [];
    const route = acceptedRoute(async (packet) => {
      calls.push(packet.packet.stage);
      return accepted(packet, packet.packet.stage === 2
        ? structuredClone(dev02Intent) as JsonRecord : structuredClone(dev02Bound) as JsonRecord);
    });
    const handoff = buildConnectedStage1RequalificationHandoffV2({ task: task(), route, sourceReceipt: source });
    const continuation = await continueConnectedDevelopmentStage123V2({
      task: task(), route, sourceReceipt: handoff.stage1Receipt,
    });
    expect(calls).toEqual([2, 3]);
    expect(handoff.reusedStage1RowHash).toBe(hashCanonicalJsonV1(source.rows[0]));
    expect(handoff.supersededRowHashes).toEqual(source.rows.slice(1).map(hashCanonicalJsonV1));
    expect(continuation.stage123Receipt.rows[0]).toEqual(source.rows[0]);
    expect(continuation.stage123Receipt.finalDisposition).toBe('STAGE3_EVALUATED');
    expect(handoff.stateEffects).toEqual([]);
  });

  it('rejects Stage-1 drift before dispatch', async () => {
    const source = structuredClone(await completedSource()) as unknown as {
      rows: Array<{ artifactHash: string }>;
    };
    source.rows[0].artifactHash = '0'.repeat(64);
    const runStage = vi.fn(async () => { throw new Error('must not dispatch'); });
    const route = acceptedRoute(runStage);
    expect(() => buildConnectedStage1RequalificationHandoffV2({
      task: task(), route, sourceReceipt: source as unknown as ConnectedDevelopmentStage123ReceiptV2,
    })).toThrow(/CONNECTED_STAGE1_REQUALIFICATION:SOURCE_RECEIPT_INVALID/);
    expect(runStage).not.toHaveBeenCalled();
  });

  it('re-evaluates the same Stage-2 artifact and calls only missing Stage 3', async () => {
    const source = structuredClone(await completedSource()) as unknown as ConnectedDevelopmentStage123ReceiptV2;
    const mutable = source as unknown as { rows: Array<{ evaluation: unknown }>; receiptHash: string };
    mutable.rows = mutable.rows.slice(0, 2);
    mutable.rows[1].evaluation = { disposition: 'FAIL', diagnostics: ['STALE_EVALUATOR_RESULT'], dimensions: {} };
    const { receiptHash: _oldHash, ...unsigned } = mutable as unknown as Record<string, unknown>;
    mutable.receiptHash = hashCanonicalJsonV1(unsigned);
    const calls: number[] = [];
    const route = acceptedRoute(async (packet) => {
      calls.push(packet.packet.stage);
      return accepted(packet, structuredClone(dev02Bound) as JsonRecord);
    });
    const handoff = buildConnectedStage2ReevaluationHandoffV2({ task: task(), route, sourceReceipt: source });
    const continuation = await continueConnectedDevelopmentStage123V2({
      task: task(), route, sourceReceipt: handoff.stage2Receipt,
    });
    expect(calls).toEqual([3]);
    expect(handoff.stage2ArtifactHash).toBe(source.rows[1].artifactHash);
    expect(handoff.priorEvaluationHash).not.toBe(handoff.correctedEvaluationHash);
    expect(continuation.stage123Receipt.rows[1].providerRun.artifact).toEqual(source.rows[1].providerRun.artifact);
    expect(continuation.stage123Receipt.finalDisposition).toBe('STAGE3_EVALUATED');
  });
});

function acceptedRoute(runStage: DevelopmentModelRouteV2['runStage']): DevelopmentModelRouteV2 {
  return { routeId: 'QWEN_3_8_MAX', claimedModelIdentity: 'qwen3.8-max', costBasis: 'TOKEN_PLAN_CREDITS_UNPRICED', runStage };
}
function accepted(packet: HashedStagePacketV2, artifact: JsonRecord): Readonly<ProviderStageRunV2> {
  return { runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION', packetHash: packet.packetHash, disposition: 'ARTIFACT_ACCEPTED', attempts: [], artifact };
}
