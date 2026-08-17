import { describe, expect, it } from 'vitest';

import dev02EvidenceBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02IntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02EvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import dev02BlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  continueConnectedDevelopmentStage14V2,
  runConnectedDevelopmentStage14V2,
} from '@/lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import { runConnectedDevelopmentStage123V2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { decideConnectedDevelopmentStage5V2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import { buildConnectedDev02Stage4OwnerV2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import type { ConnectedDevelopmentStage4OwnerV2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage4-delegator-v2';
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

describe('open-ended planner V2 connected Stage 1-5', () => {
  it('authorizes only the bounded proxy for a noncanonical but valid actual DEV-02 chain', async () => {
    const receipt = await runConnectedDevelopmentStage14V2({
      task: task(),
      route: route(connectedArtifacts()),
      owner: buildConnectedDev02Stage4OwnerV2(),
    });
    expect(receipt).toMatchObject({
      finalDisposition: 'STAGE4_EVALUATED',
      blockReasonCode: null,
      stage4Receipt: {
        compiledArtifactType: 'CompiledDev02HybridResearchGraphV2',
        evaluation: { disposition: 'PASS', diagnostics: [] },
      },
      stateEffects: [],
    });
    const decision = decideConnectedDevelopmentStage5V2(receipt);
    expect(decision).toMatchObject({
      disposition: 'PROCEED',
      reasonCode: 'CONNECTED_STAGE4_SOURCE_BOUND_AND_VERIFIED',
      sourceStage14ReceiptHash: receipt.receiptHash,
      executionAuthorization: {
        scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY',
        projectMutation: 'DENY',
        fullProjectExecution: 'DENY',
      },
    });
    const { decisionHash, ...unsigned } = decision;
    expect(decisionHash).toBe(hashCanonicalJsonV1(unsigned));
  });

  it('fails closed when the connected receipt is tampered after issue', async () => {
    const receipt = await runConnectedDevelopmentStage14V2({
      task: task(), route: route(connectedArtifacts()), owner: buildConnectedDev02Stage4OwnerV2(),
    });
    const decision = decideConnectedDevelopmentStage5V2({ ...receipt, taskId: 'tampered-task' });
    expect(decision).toMatchObject({
      disposition: 'UNVERIFIABLE', reasonCode: 'CONNECTED_STAGE14_RECEIPT_INVALID',
    });
    expect(decision.executionAuthorization).toBeUndefined();
  });

  it('preserves an owner-verified capability gap instead of authorizing a substitute', async () => {
    const owner: ConnectedDevelopmentStage4OwnerV2 = {
      ownerRef: 'test/connected-capability-gap-owner',
      compiledArtifactType: 'CompiledOperationGraphV2',
      compile: (source) => ({
        artifactType: 'CompiledOperationGraphV2', taskId: source.taskId,
        sourceEditorialIntentHash: source.sourceEditorialIntentHash,
        sourceEvidenceBoundIntentHash: source.sourceEvidenceBoundIntentHash,
        evidencePackHash: source.evidencePackHash,
        executionEligibility: 'NOT_EXECUTABLE', stateEffects: [],
        diagnostics: [{ code: 'CAPABILITY_NOT_IMPLEMENTED', capabilityIds: ['moving_matte'] }],
      }),
      evaluate: () => ({ disposition: 'EXPECTED_CAPABILITY_GAP', diagnostics: [] }),
    };
    const receipt = await runConnectedDevelopmentStage14V2({
      task: task(), route: route(connectedArtifacts()), owner,
    });
    const decision = decideConnectedDevelopmentStage5V2(receipt);
    expect(decision).toMatchObject({
      disposition: 'CAPABILITY_GAP',
      missingCapabilityIds: ['moving_matte'],
    });
    expect(decision.executionAuthorization).toBeUndefined();
  });

  it('does not invoke Stage 4 after a provider stops the chain', async () => {
    let compiled = false;
    const owner: ConnectedDevelopmentStage4OwnerV2 = {
      ownerRef: 'test/must-not-compile',
      compiledArtifactType: 'CompiledOperationGraphV2',
      compile: () => { compiled = true; return {}; },
      evaluate: () => ({ disposition: 'PASS', diagnostics: [] }),
    };
    const failingRoute: DevelopmentModelRouteV2 = {
      routeId: 'connected-timeout', claimedModelIdentity: 'fake/timeout', costBasis: 'USD_METERED',
      runStage: async (packet) => ({
        runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
        packetHash: packet.packetHash, disposition: 'PROVIDER_TIMEOUT', attempts: [],
      }),
    };
    const receipt = await runConnectedDevelopmentStage14V2({ task: task(), route: failingRoute, owner });
    expect(compiled).toBe(false);
    expect(receipt).toMatchObject({ finalDisposition: 'BLOCKED_BEFORE_STAGE4', stage4Receipt: null });
    expect(decideConnectedDevelopmentStage5V2(receipt)).toMatchObject({ disposition: 'UNVERIFIABLE' });
  });

  it('continues a verified Stage-123 receipt without another provider call', async () => {
    const sourceRoute = route(connectedArtifacts());
    const stage123Receipt = await runConnectedDevelopmentStage123V2({ task: task(), route: sourceRoute });
    let providerCalls = 0;
    const noCallRoute: DevelopmentModelRouteV2 = {
      ...sourceRoute,
      runStage: async () => { providerCalls += 1; throw new Error('must not dispatch'); },
    };
    const receipt = await continueConnectedDevelopmentStage14V2({
      task: task(), route: noCallRoute, owner: buildConnectedDev02Stage4OwnerV2(), stage123Receipt,
    });
    expect(providerCalls).toBe(0);
    expect(receipt.stage123Receipt.receiptHash).toBe(stage123Receipt.receiptHash);
    expect(receipt.stage4Receipt?.evaluation.disposition).toBe('PASS');
  });
});

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
      : { disposition: 'PASS', diagnostics: [] },
    runDeterministicMechanics: async () => ({
      taskId: 'DEV-02', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      stage4Disposition: 'PASS', stage5Disposition: 'PROCEED', stage6Disposition: 'PASS',
      stateEffects: [], evidenceRefs: [],
    }),
  };
}

function route(artifacts: Record<1 | 2 | 3, JsonRecord>): DevelopmentModelRouteV2 {
  return {
    routeId: 'connected-fake', claimedModelIdentity: 'fake/connected', costBasis: 'USD_METERED',
    runStage: async (packet) => accepted(packet, artifacts[packet.packet.stage as 1 | 2 | 3]),
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
    runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    packetHash: packet.packetHash, disposition: 'ARTIFACT_ACCEPTED', attempts: [], artifact,
  };
}

function asRecord(value: unknown): JsonRecord { return value as JsonRecord; }
