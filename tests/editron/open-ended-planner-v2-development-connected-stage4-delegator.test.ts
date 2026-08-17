import { describe, expect, it, vi } from 'vitest';

import dev02EvidenceBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02IntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02EvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import dev02BlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { runConnectedDevelopmentStage123V2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { buildConnectedDev02Stage4OwnerV2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import {
  delegateConnectedDevelopmentStage4V2,
  type ConnectedDevelopmentStage4CompilerInputV2,
  type ConnectedDevelopmentStage4OwnerV2,
} from '@/lib/editron/research/open-ended-planner/development-connected-stage4-delegator-v2';
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

describe('open-ended planner V2 connected Stage-4 delegator', () => {
  it('delegates actual same-route artifacts and records their exact hashes', async () => {
    const source = task();
    const artifacts = connectedArtifacts();
    const stage123 = await connectedReceipt(source, artifacts);
    const compile = vi.fn((input: Readonly<ConnectedDevelopmentStage4CompilerInputV2>) =>
      compiled(input));
    const result = await delegateConnectedDevelopmentStage4V2({
      task: source,
      stage123Receipt: stage123,
      owner: owner(compile),
    });

    expect(compile).toHaveBeenCalledOnce();
    expect(compile.mock.calls[0][0]).toMatchObject({
      referenceBlueprint: artifacts[1],
      editorialIntent: artifacts[2],
      evidenceBoundIntent: artifacts[3],
    });
    expect(result).toMatchObject({
      handoffMode: 'CONNECTED_ACTUAL_STAGE123_TO_EXISTING_COMPILER_OWNER',
      compilerOwnerRef: 'test/existing-stage4-owner',
      compiledArtifactType: 'CompiledOperationGraphV2',
      evaluation: { disposition: 'PASS', diagnostics: [] },
      stateEffects: [],
    });
    expect(result.sourceHashes).toEqual({
      referenceBlueprint: hashCanonicalJsonV1(artifacts[1]),
      editorialIntent: hashCanonicalJsonV1(artifacts[2]),
      evidencePack: hashCanonicalJsonV1(dev02EvidencePackJson),
      evidenceBoundIntent: hashCanonicalJsonV1(artifacts[3]),
    });
    const { receiptHash, ...unsigned } = result;
    expect(receiptHash).toBe(hashCanonicalJsonV1(unsigned));
  });

  it('accepts DEV-02 full hybrid output only when it binds the actual model artifacts', async () => {
    const source = task();
    const artifacts = connectedArtifacts();
    const stage123 = await connectedReceipt(source, artifacts);
    const result = await delegateConnectedDevelopmentStage4V2({
      task: source,
      stage123Receipt: stage123,
      owner: buildConnectedDev02Stage4OwnerV2(),
    });

    expect(result).toMatchObject({
      compiledArtifactType: 'CompiledDev02HybridResearchGraphV2',
      evaluation: { disposition: 'PASS', diagnostics: [] },
      compiledArtifact: {
        artifactType: 'CompiledDev02HybridResearchGraphV2',
        sourceEditorialIntentHash: hashCanonicalJsonV1(artifacts[2]),
        sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(artifacts[3]),
        evidencePackHash: hashCanonicalJsonV1(dev02EvidencePackJson),
      },
      stateEffects: [],
    });
    const previewBundle = (result.compiledArtifact?.previewInputBundle ?? {}) as JsonRecord;
    const program = (previewBundle.program ?? {}) as JsonRecord;
    const referenceBinding = (program.referenceBinding ?? {}) as JsonRecord;
    expect(referenceBinding.blueprintHash).toBe(hashCanonicalJsonV1(artifacts[1]));
  });

  it('rejects a tampered Stage 1-3 receipt before invoking the owner', async () => {
    const source = task();
    const stage123 = await connectedReceipt(source, connectedArtifacts());
    const compile = vi.fn(() => { throw new Error('must not compile'); });
    await expect(delegateConnectedDevelopmentStage4V2({
      task: source,
      stage123Receipt: { ...stage123, routeId: 'tampered' },
      owner: owner(compile),
    })).rejects.toThrow('CONNECTED_STAGE4_STAGE123_RECEIPT_INVALID');
    expect(compile).not.toHaveBeenCalled();
  });

  it('blocks compilation when the actual Stage-3 result failed evaluation', async () => {
    const source = task();
    const artifacts = connectedArtifacts();
    const stageThreeNodes = artifacts[3].nodes as JsonRecord[];
    stageThreeNodes[0].intentNodeId = 'fabricated-stage-three-node';
    const stage123 = await connectedReceipt(source, artifacts);
    expect(stage123.rows[2].evaluation).toMatchObject({ disposition: 'FAIL' });
    const compile = vi.fn(() => { throw new Error('must not compile'); });
    await expect(delegateConnectedDevelopmentStage4V2({
      task: source, stage123Receipt: stage123, owner: owner(compile),
    })).rejects.toThrow('CONNECTED_STAGE4_STAGE3_NOT_APPROVED:FAIL');
    expect(compile).not.toHaveBeenCalled();
  });

  it('marks a compiler that points at canonical instead of actual artifacts unverifiable', async () => {
    const source = task();
    const stage123 = await connectedReceipt(source, connectedArtifacts());
    const evaluate = vi.fn(() => ({ disposition: 'PASS' as const, diagnostics: [] }));
    const result = await delegateConnectedDevelopmentStage4V2({
      task: source,
      stage123Receipt: stage123,
      owner: {
        ownerRef: 'test/existing-stage4-owner',
        compiledArtifactType: 'CompiledOperationGraphV2',
        compile: (input) => ({
          ...compiled(input),
          sourceEditorialIntentHash: hashCanonicalJsonV1(dev02IntentJson),
        }),
        evaluate,
      },
    });
    expect(result.evaluation).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostics: ['COMPILED_ARTIFACT_BINDING_INVALID:sourceEditorialIntentHash'],
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('turns a compiler rejection into a hash-bound unverifiable receipt', async () => {
    const source = task();
    const stage123 = await connectedReceipt(source, connectedArtifacts());
    const result = await delegateConnectedDevelopmentStage4V2({
      task: source,
      stage123Receipt: stage123,
      owner: owner(() => { throw new Error('SOURCE_NOT_COMPILABLE'); }),
    });
    expect(result).toMatchObject({
      compiledArtifact: null,
      compiledArtifactHash: null,
      evaluation: {
        disposition: 'UNVERIFIABLE',
        diagnostics: ['COMPILER_REJECTED:SOURCE_NOT_COMPILABLE'],
      },
    });
  });

  it('preserves an expected capability gap as an honest Stage-4 outcome', async () => {
    const source = task();
    const stage123 = await connectedReceipt(source, connectedArtifacts());
    const result = await delegateConnectedDevelopmentStage4V2({
      task: source,
      stage123Receipt: stage123,
      owner: owner((input) => compiled(input), 'EXPECTED_CAPABILITY_GAP'),
    });
    expect(result.evaluation).toEqual({
      disposition: 'EXPECTED_CAPABILITY_GAP', diagnostics: ['MOVING_MATTE_OWNER_MISSING'],
    });
  });
});

async function connectedReceipt(
  source: DevelopmentTaskCaseV2,
  artifacts: Record<1 | 2 | 3, JsonRecord>,
) {
  const route: DevelopmentModelRouteV2 = {
    routeId: 'connected-fake',
    claimedModelIdentity: 'fake/connected',
    costBasis: 'USD_METERED',
    runStage: async (packet) => accepted(packet, artifacts[packet.packet.stage as 1 | 2 | 3]),
  };
  return runConnectedDevelopmentStage123V2({ task: source, route });
}

function owner(
  compile: ConnectedDevelopmentStage4OwnerV2['compile'],
  disposition: 'PASS' | 'EXPECTED_CAPABILITY_GAP' = 'PASS',
): ConnectedDevelopmentStage4OwnerV2 {
  return {
    ownerRef: 'test/existing-stage4-owner',
    compiledArtifactType: 'CompiledOperationGraphV2',
    compile,
    evaluate: () => ({
      disposition,
      diagnostics: disposition === 'PASS' ? [] : ['MOVING_MATTE_OWNER_MISSING'],
    }),
  };
}

function compiled(input: Readonly<ConnectedDevelopmentStage4CompilerInputV2>): JsonRecord {
  return {
    artifactType: 'CompiledOperationGraphV2',
    taskId: input.taskId,
    sourceEditorialIntentHash: input.sourceEditorialIntentHash,
    sourceEvidenceBoundIntentHash: input.sourceEvidenceBoundIntentHash,
    evidencePackHash: input.evidencePackHash,
    compileDisposition: 'READY',
    nodes: [],
    edges: [],
  };
}

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
  (blueprint.globalEditorialLanguage as JsonRecord[])[0].observation = 'connected blueprint';
  const intent = structuredClone(dev02IntentJson) as unknown as JsonRecord;
  (intent.unresolvedRequirements as JsonRecord[])[0].detail = 'connected intent';
  return {
    1: blueprint,
    2: intent,
    3: structuredClone(dev02EvidenceBoundJson) as unknown as JsonRecord,
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
