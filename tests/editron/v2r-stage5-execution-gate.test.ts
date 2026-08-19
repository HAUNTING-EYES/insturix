import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import { buildDev01TruthfulStageOneTextPacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import {
  runV2RConnectedEpisodeV2,
  type V2RConnectedEpisodeReceiptV2,
  type V2RConnectedRouteV2,
  type V2RConnectedTaskV2,
} from '@/lib/editron/research/open-ended-planner/v2r-connected-episode-v2r';
import { buildV2RPreregistrationManifest } from '@/lib/editron/research/open-ended-planner/v2r-preregistration-manifest';
import { decideV2RStage5ExecutionV2R } from '@/lib/editron/research/open-ended-planner/v2r-stage5-execution-gate';
import {
  buildV2RStage6TaskAdapterRegistry,
  V2R_STAGE6_TASK_ADAPTER_REGISTRY_VERSION,
} from '@/lib/editron/research/open-ended-planner/v2r-stage6-task-adapter-registry';

type JsonRecord = Record<string, unknown>;
const canonical = getCanonicalDev01Stage123V2();

function task(
  conditionId: 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD' = 'BASELINE',
): V2RConnectedTaskV2 {
  return {
    taskId: 'DEV-01', conditionId, executionFormArm: 'FORCED_NATIVE',
    stageOnePacket: buildDev01TruthfulStageOneTextPacketV2(conditionId),
    evidencePack: canonical.evidencePacks[conditionId],
    loweringPolicy: DEV01_LOWERING_POLICY_V2R,
  };
}

function fakeRoute(artifacts: readonly JsonRecord[]): V2RConnectedRouteV2 {
  let call = 0;
  return {
    routeId: 'OPENAI_LUNA', claimedModelIdentity: 'gpt-5.6-luna',
    costBasis: 'USD_METERED',
    runStage: async (packet) => {
      const artifact = artifacts[call];
      call += 1;
      return {
        runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2',
        authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
        packetHash: packet.packetHash,
        disposition: artifact ? 'ARTIFACT_ACCEPTED' : 'PROVIDER_TIMEOUT',
        attempts: [],
        ...(artifact ? { artifact } : {}),
      } as ProviderStageRunV2;
    },
  };
}

async function connected(input: {
  conditionId?: 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD';
  editorialIntent?: JsonRecord;
  evidenceBoundIntent?: JsonRecord;
} = {}): Promise<{
  manifest: ReturnType<typeof buildV2RPreregistrationManifest>;
  task: V2RConnectedTaskV2;
  receipt: Readonly<V2RConnectedEpisodeReceiptV2>;
}> {
  const conditionId = input.conditionId ?? 'BASELINE';
  const manifest = buildV2RPreregistrationManifest();
  const taskValue = task(conditionId);
  const route = fakeRoute([
    canonical.referenceBlueprints[conditionId] as JsonRecord,
    input.editorialIntent ?? canonical.editorialIntentV2R as JsonRecord,
    input.evidenceBoundIntent ?? canonical.evidenceBoundIntentsV2R[conditionId] as JsonRecord,
  ]);
  const receipt = await runV2RConnectedEpisodeV2({ manifest, task: taskValue, route });
  return { manifest, task: taskValue, receipt };
}

function capabilityGapArtifacts(): { editorialIntent: JsonRecord; evidenceBoundIntent: JsonRecord } {
  const editorialIntent = structuredClone(canonical.editorialIntentV2R) as JsonRecord & {
    nodes: Array<JsonRecord>;
  };
  editorialIntent.executionForm = 'CAPABILITY_GAP';
  editorialIntent.nodes = [{
    ...editorialIntent.nodes[0], selectedOperatorId: null,
    alternativeOperatorIds: ['generated_composition_program'],
    failureDisposition: 'CAPABILITY_GAP',
  }];
  delete editorialIntent.nodes[0].nodeInputs;
  const evidenceBoundIntent = structuredClone(canonical.evidenceBoundIntentsV2R.BASELINE) as JsonRecord & {
    nodes: Array<JsonRecord>;
  };
  evidenceBoundIntent.stageDisposition = 'CAPABILITY_GAP';
  evidenceBoundIntent.nodes = [{
    ...evidenceBoundIntent.nodes[0], intentNodeId: editorialIntent.nodes[0].intentNodeId,
    selectedOperatorId: null, alternativeOperatorIds: ['generated_composition_program'],
  }];
  evidenceBoundIntent.unresolvedRequirements = [{
    requirementId: 'REQ-CAPABILITY-GAP', kind: 'CAPABILITY', factIds: [],
    disposition: 'CAPABILITY_GAP', failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER',
  }];
  return { editorialIntent, evidenceBoundIntent };
}

describe('V2R generic Stage-5 execution gate', () => {
  it('authorizes the model-selected DEV-01 graph without requiring legacy canonical node ids', async () => {
    const run = await connected();
    const result = decideV2RStage5ExecutionV2R({
      manifest: run.manifest, task: run.task, connectedEpisode: run.receipt,
    });

    expect(result.decision).toMatchObject({
      disposition: 'PROCEED',
      reasonCode: 'GENERIC_V2R_RESEARCH_PROXY_AUTHORIZED',
      stage6AdapterId: 'DEV01_CAUSAL_NATIVE_PROXY_V2R',
      executionAuthorization: {
        scope: 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY',
        projectMutation: 'DENY', fullProjectExecution: 'DENY',
      },
    });
    expect(result.semanticEvaluation?.disposition).toBe('PASS');
    expect(result.lowering).toMatchObject({ zeroAdd: true, zeroDrop: true });
    expect(result.decision.compiledGraphHash).toBe(run.receipt.lowering.compiledGraphHash);
    const { receiptSha256, ...material } = result.decision;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(material));
  });

  it('stops evidence-withheld work as UNVERIFIABLE with no executable lowering', async () => {
    const run = await connected({ conditionId: 'VISUAL_EVIDENCE_WITHHELD' });
    const result = decideV2RStage5ExecutionV2R({
      manifest: run.manifest, task: run.task, connectedEpisode: run.receipt,
    });

    expect(result.decision).toMatchObject({
      disposition: 'UNVERIFIABLE', reasonCode: 'EVIDENCE_INSUFFICIENT',
    });
    expect(result.decision.executionAuthorization).toBeUndefined();
    expect(result.semanticEvaluation?.disposition).toBe('PASS');
    expect(result.lowering).toBeNull();
  });

  it('rejects a false capability-gap claim before terminal handling', async () => {
    const gap = capabilityGapArtifacts();
    const run = await connected(gap);
    const result = decideV2RStage5ExecutionV2R({
      manifest: run.manifest, task: run.task, connectedEpisode: run.receipt,
    });

    expect(run.receipt.finalDisposition).toBe('CAPABILITY_GAP_BEFORE_LOWERING');
    expect(result.decision).toMatchObject({
      disposition: 'FAIL',
      reasonCode: 'SEMANTIC_OPERATOR_POLICY_FAILED',
      compiledGraphHash: null,
      stage6AdapterId: null,
    });
    expect(result.decision.diagnostics).toEqual(expect.arrayContaining([
      'EXECUTION_FORM:CAPABILITY_GAP:NATIVE',
      'STAGE_DISPOSITION:CAPABILITY_GAP:READY_FOR_COMPILATION',
    ]));
    expect(result.decision.executionAuthorization).toBeUndefined();
    expect(result.semanticEvaluation?.disposition).toBe('FAIL');
    expect(result.lowering).toBeNull();
  });

  it('fails a superficially compilable plan that omits a required creative operation', async () => {
    const incomplete = structuredClone(canonical.editorialIntentV2R) as {
      nodes: Array<JsonRecord>;
    };
    incomplete.nodes = incomplete.nodes.filter(({ selectedOperatorId }) => selectedOperatorId !== 'set_keyframes');
    const run = await connected({ editorialIntent: incomplete as unknown as JsonRecord });
    const result = decideV2RStage5ExecutionV2R({
      manifest: run.manifest, task: run.task, connectedEpisode: run.receipt,
    });

    expect(result.decision.disposition).toBe('FAIL');
    expect(result.decision.reasonCode).toBe('SEMANTIC_OPERATOR_POLICY_FAILED');
    expect(result.decision.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('EFFECT_GROUP_CARDINALITY:PUSH_IN'),
    ]));
    expect(result.decision.executionAuthorization).toBeUndefined();
  });

  it('rejects a modified connected receipt before semantic scoring or execution', async () => {
    const run = await connected();
    const tampered = structuredClone(run.receipt) as V2RConnectedEpisodeReceiptV2;
    (tampered as { conditionId: string }).conditionId = 'TAMPERED';
    const result = decideV2RStage5ExecutionV2R({
      manifest: run.manifest, task: run.task, connectedEpisode: tampered,
    });

    expect(result.decision.disposition).toBe('FAIL');
    expect(result.decision.reasonCode).toBe('CONNECTED_EPISODE_INTEGRITY_FAILED');
    expect(result.decision.diagnostics).toEqual(expect.arrayContaining([
      'CONNECTED_RECEIPT_HASH_DRIFT', 'CONNECTED_TASK_BINDING_DRIFT',
    ]));
    expect(result.semanticEvaluation).toBeNull();
    expect(result.lowering).toBeNull();
  });

  it('freezes the only two executable research adapters and their exact operator coverage', () => {
    const registry = buildV2RStage6TaskAdapterRegistry();
    expect(registry.version).toBe(V2R_STAGE6_TASK_ADAPTER_REGISTRY_VERSION);
    expect(registry.adapters.map(({ taskId }) => taskId)).toEqual(['DEV-01', 'DEV-03']);
    expect(registry.adapters.find(({ taskId }) => taskId === 'DEV-01')?.supportedOperatorIds)
      .toContain('apply_audio_ducking');
    expect(registry.adapters.find(({ taskId }) => taskId === 'DEV-03')?.supportedOperatorIds)
      .toEqual([
        'read_project_file', 'get_timeline_view', 'find_audio_moment',
        'sync_cuts_to_beats', 'apply_camera_shake',
      ]);
    expect(Object.isFrozen(registry)).toBe(true);
    const { registrySha256, ...material } = registry;
    expect(registrySha256).toBe(hashCanonicalJsonV1(material));
  });
});
