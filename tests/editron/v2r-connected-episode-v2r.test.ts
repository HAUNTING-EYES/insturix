import { describe, expect, it } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import { buildDev01TruthfulStageOneTextPacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import { buildV2RPreregistrationManifest } from '@/lib/editron/research/open-ended-planner/v2r-preregistration-manifest';
import {
  runV2RConnectedEpisodeV2,
  type V2RConnectedRouteV2,
  type V2RConnectedTaskV2,
} from '@/lib/editron/research/open-ended-planner/v2r-connected-episode-v2r';
import type { HashedStagePacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { V2R_OPERATOR_CATALOG_REVISION } from '@/lib/editron/research/open-ended-planner/operator-catalog-v2r';

type JsonRecord = Record<string, unknown>;
const canonical = getCanonicalDev01Stage123V2();

function dev01Task(): V2RConnectedTaskV2 {
  return {
    taskId: 'DEV-01',
    conditionId: 'BASELINE',
    executionFormArm: 'FORCED_NATIVE',
    stageOnePacket: buildDev01TruthfulStageOneTextPacketV2('BASELINE'),
    evidencePack: canonical.evidencePacks.BASELINE,
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
    routeId: 'FAKE_ROUTE',
    claimedModelIdentity: 'fake-model',
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
    expect(receipt.rows.map(({ stage }) => stage)).toEqual([1, 2, 3]);
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
    expect(stageTwoCatalog).toMatchObject({
      version: '2.0.0',
      catalogRevision: V2R_OPERATOR_CATALOG_REVISION,
    });
    expect(typeof stageTwoCatalog.catalogSha256).toBe('string');
    expect(stageThreeCatalog.catalogRevision).toBe(stageTwoCatalog.catalogRevision);
    expect(stageThreeCatalog.catalogSha256).toBe(stageTwoCatalog.catalogSha256);
    expect((stageThreeCatalog.operators as Array<{ operatorId: string }>).map(({ operatorId }) => operatorId))
      .toEqual((canonical.editorialIntentV2R.nodes as Array<{ selectedOperatorId: string }>)
        .map(({ selectedOperatorId }) => selectedOperatorId)
        .filter((operatorId, index, all) => all.indexOf(operatorId) === index)
        .sort((left, right) => {
          const stageTwoIds = (stageTwoCatalog.operators as Array<{ operatorId: string }>).map(({ operatorId }) => operatorId);
          return stageTwoIds.indexOf(left) - stageTwoIds.indexOf(right);
        }));
    const dossier = stageTwoInput.capabilityDossier as Array<{ operatorId: string; cap2a: unknown }>;
    expect(Array.isArray(dossier)).toBe(true);
    expect(dossier.length).toBeGreaterThan(0);
    expect(dossier.some(({ cap2a }) => cap2a !== null)).toBe(true);
    expect(dossier.find(({ operatorId }) => operatorId === 'resolve_transcript_edit')?.cap2a).toBeTruthy();
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
      .toEqual(['projectId', 'expectedProjectRevision', 'overlayId', 'keyframes', 'evidenceIds']);
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
      compiledOperatorCount: 12,
      selectedOperatorCount: 12,
    });
    expect(receipt.stateEffects).toEqual([]);
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

  it('reports lowering diagnostics honestly when the model output is not lowerable', async () => {
    const manifest = buildV2RPreregistrationManifest();
    const brokenBound = {
      ...(canonical.evidenceBoundIntentsV2R.BASELINE as JsonRecord),
      nodes: [{ intentNodeId: 'node-observe-project', selectedOperatorId: 'invented_operator', alternativeOperatorIds: [], evidenceBindingIds: [], preservationIds: [], proofObligationIds: [], bindingStatus: 'BOUND', unresolvedRequirementIds: [] }],
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
