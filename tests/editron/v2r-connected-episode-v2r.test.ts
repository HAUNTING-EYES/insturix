import { describe, expect, it } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import { buildDev01TruthfulStageOneTextPacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import { buildV2RPreregistrationManifest } from '@/lib/editron/research/open-ended-planner/v2r-preregistration-manifest';
import {
  runV2RConnectedEpisodeV2,
  V2RConnectedEpisodePartialError,
  type V2RConnectedRouteV2,
  type V2RConnectedTaskV2,
} from '@/lib/editron/research/open-ended-planner/v2r-connected-episode-v2r';
import type { HashedStagePacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { V2R_OPERATOR_CATALOG_REVISION } from '@/lib/editron/research/open-ended-planner/operator-catalog-v2r';
import { V2R_PROVIDER_STAGE_BUDGETS } from '@/lib/editron/research/open-ended-planner/per-attempt-budget-v2r';

type JsonRecord = Record<string, unknown>;
const canonical = getCanonicalDev01Stage123V2();

function dev01Task(
  conditionId: 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD' = 'BASELINE',
): V2RConnectedTaskV2 {
  return {
    taskId: 'DEV-01',
    conditionId,
    executionFormArm: 'FORCED_NATIVE',
    stageOnePacket: buildDev01TruthfulStageOneTextPacketV2(conditionId),
    evidencePack: canonical.evidencePacks[conditionId],
    loweringPolicy: DEV01_LOWERING_POLICY_V2R,
  };
}

function fakeRoute(scriptedArtifacts: Array<JsonRecord | null>): {
  route: V2RConnectedRouteV2;
  seenPackets: HashedStagePacketV2[];
} {
  const seenPackets: HashedStagePacketV2[] = [];
  let call = 0;
  const route: V2RConnectedRouteV2 = {
    routeId: 'OPENAI_LUNA',
    claimedModelIdentity: 'gpt-5.6-luna',
    costBasis: 'USD_METERED',
    runStage: async (packet) => {
      seenPackets.push(packet);
      const artifact = scriptedArtifacts[call];
      call += 1;
      const run: ProviderStageRunV2 = {
        runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2',
        authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
        packetHash: packet.packetHash,
        disposition: artifact ? 'ARTIFACT_ACCEPTED' : 'PROVIDER_TIMEOUT',
        attempts: [],
        ...(artifact ? { artifact } : {}),
      } as ProviderStageRunV2;
      return run;
    },
  };
  return { route, seenPackets };
}

function capabilityGapArtifacts(): { editorialIntent: JsonRecord; evidenceBoundIntent: JsonRecord } {
  const editorialIntent = structuredClone(canonical.editorialIntentV2R) as JsonRecord & {
    nodes: Array<JsonRecord>;
  };
  editorialIntent.executionForm = 'CAPABILITY_GAP';
  editorialIntent.nodes = [{
    ...editorialIntent.nodes[0],
    selectedOperatorId: null,
    alternativeOperatorIds: ['generated_composition_program'],
    failureDisposition: 'CAPABILITY_GAP',
  }];
  delete editorialIntent.nodes[0].nodeInputs;

  const evidenceBoundIntent = structuredClone(canonical.evidenceBoundIntentsV2R.BASELINE) as JsonRecord & {
    nodes: Array<JsonRecord>;
  };
  evidenceBoundIntent.stageDisposition = 'CAPABILITY_GAP';
  evidenceBoundIntent.nodes = [{
    ...evidenceBoundIntent.nodes[0],
    intentNodeId: editorialIntent.nodes[0].intentNodeId,
    selectedOperatorId: null,
    alternativeOperatorIds: ['generated_composition_program'],
  }];
  evidenceBoundIntent.unresolvedRequirements = [{
    requirementId: 'REQ-CAPABILITY-GAP',
    kind: 'CAPABILITY',
    factIds: [],
    disposition: 'CAPABILITY_GAP',
    failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER',
  }];
  return { editorialIntent, evidenceBoundIntent };
}

describe('V2-1F V2R connected episode harness', () => {
  it('refuses to run without a complete pre-registration manifest', async () => {
    const { route } = fakeRoute([]);
    await expect(runV2RConnectedEpisodeV2({ manifest: undefined, task: dev01Task(), route }))
      .rejects.toThrow('V2R_PREREGISTRATION_MISSING');
    await expect(runV2RConnectedEpisodeV2({ manifest: { experimentVersion: 'WRONG' }, task: dev01Task(), route }))
      .rejects.toThrow('V2R_PREREGISTRATION_VERSION_DRIFT');
  });

  it('runs the connected stage 1-3 chain on V2R packets and lowers the model output zero-add/zero-drop', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const scripted = [
      canonical.referenceBlueprints.BASELINE as JsonRecord,
      canonical.editorialIntentV2R as JsonRecord,
      canonical.evidenceBoundIntentsV2R.BASELINE as JsonRecord,
    ];
    const { route, seenPackets } = fakeRoute(scripted);
    const receipt = await runV2RConnectedEpisodeV2({ manifest, task: dev01Task(), route });

    expect(receipt.finalDisposition).toBe('STAGE3_LOWERED');
    expect(receipt.preregistrationManifestSha256).toBe(manifest.manifestSha256);
    expect(manifest.executionOrchestration).toEqual({
      connectedEpisodeReceiptVersion: 'EDITRON_OE_V2R_CONNECTED_EPISODE_RECEIPT_V4',
      stage5ExecutionDecisionVersion: 'EDITRON_OE_V2R_STAGE5_EXECUTION_DECISION_V2',
      capabilityGapRule: 'STOP_BEFORE_LOWERING_NO_EXECUTION_AUTHORIZATION',
    });
    expect(receipt.rows.map(({ stage }) => stage)).toEqual([1, 2, 3]);
    expect(seenPackets.map(({ packet }) => packet.stageBudget)).toEqual([
      V2R_PROVIDER_STAGE_BUDGETS[1],
      V2R_PROVIDER_STAGE_BUDGETS[2],
      V2R_PROVIDER_STAGE_BUDGETS[3],
    ]);
    expect(seenPackets.every(({ packet }) => Object.isFrozen(packet.stageBudget))).toBe(true);
    // Stage 2 and 3 packets must be V2R (selectedOperatorId node contract).
    const stageTwoNodeSchema = ((seenPackets[1].packet.outputContract.properties as JsonRecord).nodes as JsonRecord).items as JsonRecord;
    expect((stageTwoNodeSchema.required as string[])).toContain('selectedOperatorId');
    expect((stageTwoNodeSchema.required as string[])).not.toContain('candidateCapabilityIds');
    // The V2R planner input carries the rich CAP-2A capability dossier alongside
    // the executable operator catalog.
    const stageTwoInput = seenPackets[1].packet.modelInput as JsonRecord;
    expect(Array.isArray(stageTwoInput.operatorCatalog)).toBe(false);
    expect((stageTwoInput.operatorCatalog as JsonRecord).operators).toBeTruthy();
    const stageTwoCatalog = stageTwoInput.operatorCatalog as JsonRecord;
    const stageThreeCatalog = seenPackets[2].packet.modelInput.operatorCatalog as JsonRecord;
    const stageTwoExecution = stageTwoInput.researchExecutionContract as JsonRecord;
    const stageThreeExecution = seenPackets[2].packet.modelInput.researchExecutionContract as JsonRecord;
    expect(stageTwoCatalog).toMatchObject({
      version: '2.0.0',
      catalogRevision: V2R_OPERATOR_CATALOG_REVISION,
    });
    expect(typeof stageTwoCatalog.catalogSha256).toBe('string');
    expect(stageThreeCatalog.catalogRevision).toBe(stageTwoCatalog.catalogRevision);
    expect(stageThreeCatalog.catalogSha256).toBe(stageTwoCatalog.catalogSha256);
    expect(stageTwoExecution).toMatchObject({
      taskId: 'DEV-01',
      authority: 'RESEARCH_BENCHMARK_EXECUTION_TRUTH_NOT_PRODUCTION_CERTIFICATION',
      taskAdapter: { adapterId: 'DEV01_CAUSAL_NATIVE_PROXY_V2R' },
    });
    expect(stageThreeExecution).toMatchObject({
      taskId: stageTwoExecution.taskId,
      adapterRegistryVersion: stageTwoExecution.adapterRegistryVersion,
      adapterRegistrySha256: stageTwoExecution.adapterRegistrySha256,
      taskAdapter: stageTwoExecution.taskAdapter,
      semantics: stageTwoExecution.semantics,
    });
    expect((stageThreeExecution.operators as Array<{
      executionDisposition: string;
    }>).every(({ executionDisposition }) => (
      executionDisposition === 'EXECUTABLE_VIA_REGISTERED_RESEARCH_PROXY'
    ))).toBe(true);
    expect((stageTwoExecution.operators as Array<{
      operatorId: string;
      executionDisposition: string;
    }>).find(({ operatorId }) => operatorId === 'cut_section')?.executionDisposition)
      .toBe('EXECUTABLE_VIA_REGISTERED_RESEARCH_PROXY');
    expect(seenPackets[1].packet.instructions.join('\n')).toContain('researchExecutionContract is the normative task-scoped execution truth');
    expect((stageThreeCatalog.operators as Array<{ operatorId: string }>).map(({ operatorId }) => operatorId))
      .toEqual((canonical.editorialIntentV2R.nodes as Array<{ selectedOperatorId: string }>)
        .map(({ selectedOperatorId }) => selectedOperatorId)
        .filter((operatorId, index, all) => all.indexOf(operatorId) === index)
        .sort((left, right) => {
          const stageTwoIds = (stageTwoCatalog.operators as Array<{ operatorId: string }>).map(({ operatorId }) => operatorId);
          return stageTwoIds.indexOf(left) - stageTwoIds.indexOf(right);
        }));
    const dossier = stageTwoInput.capabilityDossier as Array<{
      selectableOperatorId: string;
      cap2a: unknown;
    }>;
    expect(Array.isArray(dossier)).toBe(true);
    expect(dossier.length).toBeGreaterThan(0);
    expect(dossier.some(({ cap2a }) => cap2a !== null)).toBe(true);
    expect(dossier.find(({ selectableOperatorId }) => (
      selectableOperatorId === 'resolve_transcript_edit'
    ))?.cap2a).toBeTruthy();
    const ownership = stageTwoInput.plannerInputOwnership as JsonRecord;
    const ownershipRows = ownership.operators as Array<{
      operatorId: string;
      modelOwnedInputFields: Array<{ field: string; required: boolean; jsonSchema: JsonRecord | null }>;
      compilerBoundInputFields: Array<{ field: string; bindingSource: string }>;
      unboundInputFields: Array<{ field: string; required: boolean }>;
    }>;
    const ownershipFor = (operatorId: string) => ownershipRows.find((row) => row.operatorId === operatorId);
    expect(ownership).toMatchObject({
      ownershipVersion: 'EDITRON_OE_PLANNER_INPUT_OWNERSHIP_V2R_1',
      policyVersion: 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R_3',
      taskId: 'DEV-01',
      operatorCatalogVersion: '2.0.0',
      operatorCatalogRevision: V2R_OPERATOR_CATALOG_REVISION,
      operatorCatalogSha256: stageTwoCatalog.catalogSha256,
      nodeInputsRule: 'NODE_INPUTS_CONTAIN_ONLY_MODEL_OWNED_FIELDS',
      unboundRequiredFieldsBlockSelection: true,
    });
    expect(Object.isFrozen(ownership)).toBe(true);
    expect(ownershipFor('find_transcript_moment')?.modelOwnedInputFields).toEqual([{
      field: 'query',
      required: true,
      jsonSchema: { type: 'string', minLength: 1 },
    }]);
    expect(ownershipFor('read_project_file')?.modelOwnedInputFields).toEqual([]);
    expect(ownershipFor('read_project_file')?.compilerBoundInputFields.map(({ field }) => field))
      .toEqual(['projectId', 'expectedProjectRevision', 'selector']);
    expect(ownershipFor('set_keyframes')?.modelOwnedInputFields).toEqual([]);
    expect(ownershipFor('set_keyframes')?.compilerBoundInputFields.map(({ field }) => field))
      .toEqual(['projectId', 'expectedProjectRevision', 'overlayId', 'keyframes', 'focalPoint', 'evidenceIds']);
    expect(ownershipFor('resolve_transcript_edit')?.modelOwnedInputFields.map(({ field }) => field))
      .toEqual(['query', 'intent']);
    expect(ownershipFor('cut_section')?.compilerBoundInputFields)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'targetRange', bindingSource: 'NODE_OUTPUT' }),
      ]));
    expect(ownershipFor('apply_audio_ducking')?.modelOwnedInputFields.map(({ field }) => field))
      .toEqual(['audioPlan']);
    expect(ownershipFor('add_overlay')?.unboundInputFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'assetId', required: true }),
    ]));
    expect(JSON.stringify(ownership)).not.toContain('ov-host-video');
    expect(JSON.stringify(ownership)).not.toContain('dev01-dialogue-truth-v2');
    expect(seenPackets[1].packet.instructions.join('\n')).toContain('plannerInputOwnership is the normative field-ownership contract');
    expect(receipt.lowering).toMatchObject({
      performed: true,
      zeroAdd: true,
      zeroDrop: true,
      compileDisposition: 'COMPILED_RESEARCH_PROXY',
      compiledOperatorCount: 6,
      selectedOperatorCount: 6,
      evidencePackHash: hashCanonicalJsonV1(canonical.evidencePacks.BASELINE),
    });
    expect(receipt.lowering.compiledGraphHash).toHaveLength(64);
    expect(receipt.lowering.sourceEditorialIntentHash).toBe(hashCanonicalJsonV1(scripted[1]));
    expect(receipt.lowering.sourceEvidenceBoundIntentHash).toBe(hashCanonicalJsonV1(scripted[2]));
    expect([...receipt.lowering.compiledOperatorIds].sort())
      .toEqual([...receipt.lowering.selectedOperatorIds].sort());
    expect(receipt.stateEffects).toEqual([]);
  });

  it('rejects an unregistered route or lowering policy before provider dispatch', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const rogueRoute = fakeRoute([]);
    rogueRoute.route.routeId = 'ROGUE_ROUTE';
    await expect(runV2RConnectedEpisodeV2({ manifest, task: dev01Task(), route: rogueRoute.route }))
      .rejects.toThrow('V2R_CONNECTED_ROUTE_NOT_PREREGISTERED');
    expect(rogueRoute.seenPackets).toHaveLength(0);

    const policyDrift = structuredClone(dev01Task()) as V2RConnectedTaskV2;
    (policyDrift.loweringPolicy.fieldBindings.projectId as { source: string }).source = 'STATIC';
    const registeredRoute = fakeRoute([]);
    await expect(runV2RConnectedEpisodeV2({ manifest, task: policyDrift, route: registeredRoute.route }))
      .rejects.toThrow('V2R_CONNECTED_LOWERING_POLICY_NOT_PREREGISTERED');
    expect(registeredRoute.seenPackets).toHaveLength(0);
  });

  it('preserves raw lineage: each stage packet binds the prior accepted artifact hash', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const scripted = [
      canonical.referenceBlueprints.BASELINE as JsonRecord,
      canonical.editorialIntentV2R as JsonRecord,
      canonical.evidenceBoundIntentsV2R.BASELINE as JsonRecord,
    ];
    const { route } = fakeRoute(scripted);
    const receipt = await runV2RConnectedEpisodeV2({ manifest, task: dev01Task(), route });
    expect(receipt.rows[0].priorArtifactHash).toBeNull();
    expect(receipt.rows[1].priorArtifactHash).toBe(hashCanonicalJsonV1(scripted[0]));
    expect(receipt.rows[2].priorArtifactHash).toBe(hashCanonicalJsonV1(scripted[1]));
  });

  it('records an honest block when the model times out at stage 2, without lowering', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const scripted = [canonical.referenceBlueprints.BASELINE as JsonRecord, null];
    const { route } = fakeRoute(scripted);
    const receipt = await runV2RConnectedEpisodeV2({ manifest, task: dev01Task(), route });
    expect(receipt.finalDisposition).toBe('BLOCKED_BEFORE_STAGE3');
    expect(receipt.lowering.performed).toBe(false);
    expect(receipt.rows.map(({ stage }) => stage)).toEqual([1, 2]);
  });

  it('records an unknown executable operator as a Stage-2 contract rejection, not a crash', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const invalidStageTwo = structuredClone(canonical.editorialIntentV2R) as {
      nodes: Array<Record<string, unknown>>;
    };
    invalidStageTwo.nodes[0].selectedOperatorId = 'generated-composition.prepare';
    const { route, seenPackets } = fakeRoute([
      canonical.referenceBlueprints.BASELINE as JsonRecord,
      invalidStageTwo as JsonRecord,
    ]);
    const receipt = await runV2RConnectedEpisodeV2({ manifest, task: dev01Task(), route });
    expect(receipt.finalDisposition).toBe('BLOCKED_BEFORE_STAGE3');
    expect(receipt.lowering.performed).toBe(false);
    expect(receipt.lowering.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('STAGE2_CONTRACT_REJECTED:SELECTED_OPERATOR_UNKNOWN'),
    ]));
    expect(seenPackets).toHaveLength(2);
  });

  it('preserves accepted model rows in a distinct partial receipt when later harness work crashes', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const base = fakeRoute([
      canonical.referenceBlueprints.BASELINE as JsonRecord,
      canonical.editorialIntentV2R as JsonRecord,
    ]);
    const originalRunStage = base.route.runStage;
    base.route.runStage = async (packet) => {
      if (packet.packet.stage === 3) throw new Error('synthetic stage-three harness crash');
      return originalRunStage(packet);
    };

    let thrown: unknown;
    try {
      await runV2RConnectedEpisodeV2({ manifest, task: dev01Task(), route: base.route });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(V2RConnectedEpisodePartialError);
    const partial = (thrown as V2RConnectedEpisodePartialError).partialReceipt;
    expect(partial).toMatchObject({
      receiptVersion: 'EDITRON_OE_V2R_CONNECTED_EPISODE_PARTIAL_RECEIPT_V1',
      authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      preregistrationManifestSha256: manifest.manifestSha256,
      taskId: 'DEV-01', conditionId: 'BASELINE', routeId: 'OPENAI_LUNA',
      failurePoint: 'BEFORE_STAGE3_COMPLETION', actualProviderCostUsd: 0,
      diagnostics: ['HARNESS_ERROR:synthetic stage-three harness crash'],
      stateEffects: [],
    });
    expect(partial.rows.map(({ stage }) => stage)).toEqual([1, 2]);
    expect(partial.rows[1].artifactHash).toBe(
      hashCanonicalJsonV1(canonical.editorialIntentV2R),
    );
    const { partialReceiptHash, ...material } = partial;
    expect(partialReceiptHash).toBe(hashCanonicalJsonV1(material));
    expect(Object.isFrozen(partial)).toBe(true);
  });

  it('stops an evidence-withheld UNVERIFIABLE result before lowering or execution', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const conditionId = 'VISUAL_EVIDENCE_WITHHELD' as const;
    const { route } = fakeRoute([
      canonical.referenceBlueprints[conditionId] as JsonRecord,
      canonical.editorialIntentV2R as JsonRecord,
      canonical.evidenceBoundIntentsV2R[conditionId] as JsonRecord,
    ]);
    const receipt = await runV2RConnectedEpisodeV2({
      manifest,
      task: dev01Task(conditionId),
      route,
    });
    expect(receipt.finalDisposition).toBe('UNVERIFIABLE_BEFORE_LOWERING');
    expect(receipt.lowering).toMatchObject({
      performed: false,
      compiledGraphHash: null,
      diagnostics: ['STAGE3_UNVERIFIABLE_EXECUTION_BLOCK'],
    });
    expect(receipt.rows).toHaveLength(3);
  });

  it('stops an explicit capability gap before lowering without inventing an operator', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const gap = capabilityGapArtifacts();
    const { route } = fakeRoute([
      canonical.referenceBlueprints.BASELINE as JsonRecord,
      gap.editorialIntent,
      gap.evidenceBoundIntent,
    ]);
    const receipt = await runV2RConnectedEpisodeV2({ manifest, task: dev01Task(), route });
    expect(receipt.finalDisposition).toBe('CAPABILITY_GAP_BEFORE_LOWERING');
    expect(receipt.lowering).toMatchObject({
      performed: false,
      compiledGraphHash: null,
      compiledOperatorIds: [],
      selectedOperatorIds: [],
      diagnostics: ['STAGE3_CAPABILITY_GAP_EXECUTION_BLOCK'],
    });
    expect(receipt.stateEffects).toEqual([]);
  });

  it('reports lowering diagnostics honestly when the model output is not lowerable', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const brokenBound = {
      ...(canonical.evidenceBoundIntentsV2R.BASELINE as JsonRecord),
      nodes: [{ intentNodeId: 'node-resolve-cut', selectedOperatorId: 'invented_operator', alternativeOperatorIds: [], evidenceBindingIds: [], preservationIds: [], proofObligationIds: [], bindingStatus: 'BOUND', unresolvedRequirementIds: [] }],
    };
    const scripted = [
      canonical.referenceBlueprints.BASELINE as JsonRecord,
      canonical.editorialIntentV2R as JsonRecord,
      brokenBound,
    ];
    const { route } = fakeRoute(scripted);
    const receipt = await runV2RConnectedEpisodeV2({ manifest, task: dev01Task(), route });
    expect(receipt.finalDisposition).toBe('STAGE3_LOWERED');
    expect(receipt.lowering.zeroAdd).toBe(true);
    expect(receipt.lowering.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('LOWERING_OPERATOR_UNKNOWN'),
    ]));
  });
});
