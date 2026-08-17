import { describe, expect, it, vi } from 'vitest';

import dev02EvidenceBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02IntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02EvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import dev02BlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  runConnectedDevelopmentStage123V2,
} from '@/lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import type {
  DevelopmentModelRouteV2,
  DevelopmentTaskCaseV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import { STAGE2_PLANNING_COMPILER_BOUNDARY_V2 } from '@/lib/editron/research/open-ended-planner/stage2-planning-compiler-boundary-v2';
import {
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;

describe('open-ended planner V2 connected Stage 1-3 runner', () => {
  it('feeds actual same-route artifacts forward and proves every lineage hash', async () => {
    const artifacts = connectedArtifacts();
    const packets: HashedStagePacketV2[] = [];
    const route = acceptedRoute(async (packet) => {
      packets.push(packet);
      return accepted(packet, artifacts[packet.packet.stage as 1 | 2 | 3]);
    });

    const result = await runConnectedDevelopmentStage123V2({ task: task(), route });

    expect(result).toMatchObject({
      handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT',
      finalDisposition: 'STAGE3_EVALUATED',
      routeId: 'connected-fake',
      stateEffects: [],
    });
    expect(result.rows.map(({ stage }) => stage)).toEqual([1, 2, 3]);
    expect(packets[1].packet.modelInput).toMatchObject({
      priorArtifact: artifacts[1],
      priorArtifactHash: hashCanonicalJsonV1(artifacts[1]),
    });
    expect(packets[2].packet.modelInput).toMatchObject({
      priorArtifact: artifacts[2],
      priorArtifactHash: hashCanonicalJsonV1(artifacts[2]),
    });
    expect(hashCanonicalJsonV1(artifacts[1])).not.toBe(hashCanonicalJsonV1(dev02BlueprintJson));
    expect(hashCanonicalJsonV1(artifacts[2])).not.toBe(hashCanonicalJsonV1(dev02IntentJson));
    expect(result.rows.map(({ priorArtifactHash, packetPriorArtifactHash }) =>
      [priorArtifactHash, packetPriorArtifactHash])).toEqual([
      [null, null],
      [hashCanonicalJsonV1(artifacts[1]), hashCanonicalJsonV1(artifacts[1])],
      [hashCanonicalJsonV1(artifacts[2]), hashCanonicalJsonV1(artifacts[2])],
    ]);
    const material = structuredClone(result) as unknown as JsonRecord;
    const receiptHash = String(material.receiptHash);
    delete material.receiptHash;
    expect(hashCanonicalJsonV1(material)).toBe(receiptHash);
  });

  it('stops before Stage 2 when Stage 1 transport is not accepted', async () => {
    const runStage = vi.fn(async (packet: HashedStagePacketV2): Promise<Readonly<ProviderStageRunV2>> => ({
      runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2',
      authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      packetHash: packet.packetHash,
      disposition: 'PROVIDER_TIMEOUT',
      attempts: [],
    }));
    const result = await runConnectedDevelopmentStage123V2({
      task: task(), route: acceptedRoute(runStage),
    });
    expect(runStage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ finalDisposition: 'BLOCKED_BEFORE_STAGE2' });
    expect(result.rows[0].evaluation).toMatchObject({
      disposition: 'UNVERIFIABLE',
      diagnostics: ['TRANSPORT_NOT_ACCEPTED:PROVIDER_TIMEOUT'],
    });
  });

  it('stops before Stage 3 when Stage 2 fabricates a claim absent from the actual Stage 1 artifact', async () => {
    const artifacts = connectedArtifacts();
    const nodes = artifacts[2].nodes as JsonRecord[];
    nodes[0].targetClaimIds = ['fabricated-hidden-claim'];
    const runStage = vi.fn(async (packet: HashedStagePacketV2) =>
      accepted(packet, artifacts[packet.packet.stage as 1 | 2 | 3]));
    const result = await runConnectedDevelopmentStage123V2({
      task: task(), route: acceptedRoute(runStage),
    });
    expect(runStage).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ finalDisposition: 'BLOCKED_BEFORE_STAGE3' });
    expect(result.rows[1].evaluation).toMatchObject({ disposition: 'FAIL' });
    expect(result.rows[1].evaluation.diagnostics).toContain(
      'CONNECTED_STAGE2_UNKNOWN_CLAIM:fabricated-hidden-claim',
    );
    expect(result.rows[1].semanticRepair).toMatchObject({
      source: {
        repairVersion: 'EDITRON_OE_CONNECTED_SEMANTIC_REPAIR_V2',
        repairDiagnostics: expect.arrayContaining([
          'CONNECTED_STAGE2_UNKNOWN_CLAIM:fabricated-hidden-claim',
        ]),
      },
      initialEvaluation: { disposition: 'FAIL' },
    });
  });

  it('accepts one hash-bound semantic repair and feeds only the corrected artifact to Stage 3', async () => {
    const artifacts = connectedArtifacts();
    const invalidIntent = structuredClone(artifacts[2]) as JsonRecord;
    (invalidIntent.nodes as JsonRecord[])[0].targetClaimIds = ['fabricated-hidden-claim'];
    const packets: HashedStagePacketV2[] = [];
    const route = acceptedRoute(async (packet) => {
      packets.push(packet);
      if (packet.packet.stage === 2 && !packet.packet.modelInput.semanticRepairFeedback) {
        return accepted(packet, invalidIntent);
      }
      return accepted(packet, artifacts[packet.packet.stage as 1 | 2 | 3]);
    });
    const result = await runConnectedDevelopmentStage123V2({ task: task(), route });

    expect(packets).toHaveLength(4);
    expect(result.finalDisposition).toBe('STAGE3_EVALUATED');
    expect(result.rows[1]).toMatchObject({
      evaluation: { disposition: 'EXPECTED_CAPABILITY_GAP', diagnostics: [] },
      semanticRepair: {
        initialEvaluation: { disposition: 'FAIL' },
      },
    });
    const feedback = packets[2].packet.modelInput.semanticRepairFeedback as JsonRecord;
    expect(feedback.failedArtifactHash).toBe(hashCanonicalJsonV1(invalidIntent));
    expect(feedback.repairDiagnostics).toContain(
      'CONNECTED_STAGE2_UNKNOWN_CLAIM:fabricated-hidden-claim',
    );
    expect(packets[3].packet.modelInput).toMatchObject({
      priorArtifact: artifacts[2],
      priorArtifactHash: hashCanonicalJsonV1(artifacts[2]),
    });
  });

  it('accepts an editorial plan without compiler-owned proof reads and exposes the ownership boundary', async () => {
    const artifacts = connectedArtifacts();
    const editorialIntent = structuredClone(artifacts[2]) as JsonRecord;
    editorialIntent.nodes = (editorialIntent.nodes as JsonRecord[])
      .filter(({ intentNodeId }) => intentNodeId !== 'node-proof');
    editorialIntent.edges = (editorialIntent.edges as JsonRecord[])
      .filter(({ fromNodeId, toNodeId }) => fromNodeId !== 'node-proof' && toNodeId !== 'node-proof');
    const packets: HashedStagePacketV2[] = [];
    const route = acceptedRoute(async (packet) => {
      packets.push(packet);
      if (packet.packet.stage === 2) return accepted(packet, editorialIntent);
      if (packet.packet.stage === 3) {
        return {
          runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2',
          authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
          packetHash: packet.packetHash,
          disposition: 'PROVIDER_TIMEOUT',
          attempts: [],
        };
      }
      return accepted(packet, artifacts[1]);
    });

    const result = await runConnectedDevelopmentStage123V2({ task: task(), route });
    expect(result.finalDisposition).toBe('STAGE3_EVALUATED');
    expect(result.rows[1]).toMatchObject({
      evaluation: { disposition: 'EXPECTED_CAPABILITY_GAP', diagnostics: [] },
      semanticRepair: null,
    });
    expect(packets[1].packet.modelInput.planningCompilerBoundary)
      .toEqual(STAGE2_PLANNING_COMPILER_BOUNDARY_V2);
    expect(result.rows[2].evaluation).toMatchObject({
      disposition: 'UNVERIFIABLE',
      diagnostics: ['TRANSPORT_NOT_ACCEPTED:PROVIDER_TIMEOUT'],
    });
  });

  it('treats a mis-bound provider run as unverifiable and stops', async () => {
    const artifacts = connectedArtifacts();
    const route = acceptedRoute(async (packet) => ({
      ...accepted(packet, artifacts[1]),
      packetHash: '0'.repeat(64),
    }));
    const result = await runConnectedDevelopmentStage123V2({ task: task(), route });
    expect(result).toMatchObject({ finalDisposition: 'BLOCKED_BEFORE_STAGE2' });
    expect(result.rows[0].evaluation).toMatchObject({
      disposition: 'UNVERIFIABLE', diagnostics: ['PROVIDER_RUN_BINDING_INVALID'],
    });
  });

  it('rejects an invalid Stage-1 task binding before dispatch', async () => {
    const source = task();
    await expect(runConnectedDevelopmentStage123V2({
      task: { ...source, conditionId: 'DRIFTED' },
      route: acceptedRoute(async () => { throw new Error('must not dispatch'); }),
    })).rejects.toThrow('CONNECTED_STAGE1_BINDING_INVALID');
  });
});

function task(
  evaluateStage: DevelopmentTaskCaseV2['evaluateStage'] = (stage) => stage === 1
    ? { disposition: 'HUMAN_REVIEW_REQUIRED', diagnostics: [] }
    : { disposition: 'PASS', diagnostics: [] },
): DevelopmentTaskCaseV2 {
  return {
    taskId: 'DEV-02',
    conditionId: 'BASELINE',
    executionFormArm: 'FREE_CHOICE',
    stageOnePacket: buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'),
    canonical: {
      referenceBlueprint: asRecord(dev02BlueprintJson),
      editorialIntent: asRecord(dev02IntentJson),
      evidencePack: asRecord(dev02EvidencePackJson),
      evidenceBoundIntent: asRecord(dev02EvidenceBoundJson),
    },
    evaluateStage,
    runDeterministicMechanics: async () => ({
      taskId: 'DEV-02', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      stage4Disposition: 'PASS', stage5Disposition: 'PROCEED', stage6Disposition: 'PASS',
      stateEffects: [], evidenceRefs: [],
    }),
  };
}

function connectedArtifacts(): Record<1 | 2 | 3, JsonRecord> {
  const blueprint = structuredClone(dev02BlueprintJson) as unknown as JsonRecord;
  const globalLanguage = blueprint.globalEditorialLanguage as JsonRecord[];
  globalLanguage[0].observation = `${String(globalLanguage[0].observation)} [connected-candidate]`;
  const intent = structuredClone(dev02IntentJson) as unknown as JsonRecord;
  const requirements = intent.unresolvedRequirements as JsonRecord[];
  requirements[0].detail = `${String(requirements[0].detail)} [connected-candidate]`;
  const bound = structuredClone(dev02EvidenceBoundJson) as unknown as JsonRecord;
  const replacements = new Map([
    ['claim-user-stacked-layout', 'candidate-layout-claim'],
    ['claim-user-centred-title', 'candidate-title-claim'],
    ['claim-user-varied-crops', 'candidate-crops-claim'],
    ['claim-user-exit-continuity', 'candidate-continuity-claim'],
  ]);
  return {
    1: replaceStrings(blueprint, replacements),
    2: replaceStrings(intent, replacements),
    3: replaceStrings(bound, replacements),
  };
}

function replaceStrings(value: JsonRecord, replacements: ReadonlyMap<string, string>): JsonRecord {
  const visit = (entry: unknown): unknown => {
    if (typeof entry === 'string') return replacements.get(entry) ?? entry;
    if (Array.isArray(entry)) return entry.map(visit);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(Object.entries(entry as JsonRecord)
        .map(([key, child]) => [key, visit(child)]));
    }
    return entry;
  };
  return visit(value) as JsonRecord;
}

function acceptedRoute(
  runStage: DevelopmentModelRouteV2['runStage'],
): DevelopmentModelRouteV2 {
  return {
    routeId: 'connected-fake', claimedModelIdentity: 'fake/connected',
    costBasis: 'USD_METERED', runStage,
  };
}

function accepted(packet: HashedStagePacketV2, artifact: JsonRecord): Readonly<ProviderStageRunV2> {
  return {
    runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2',
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    packetHash: packet.packetHash,
    disposition: 'ARTIFACT_ACCEPTED',
    attempts: [],
    artifact,
  };
}

function asRecord(value: unknown): JsonRecord {
  return value as JsonRecord;
}
