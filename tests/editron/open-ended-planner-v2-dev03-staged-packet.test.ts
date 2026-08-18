import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import {
  buildCanonicalTextStageOnePacketV2,
  buildNextProviderStagePacketV2,
  validateProviderStageArtifactV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;
let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

function source() {
  return getCanonicalDev03Stage123V2({
    measuredEvidence: measured,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });
}

function packets() {
  const canonical = source();
  const stageOne = buildCanonicalTextStageOnePacketV2({
    taskId: 'DEV-03', conditionId: 'BASELINE',
    canonicalInput: canonical.stageOneTextInputs.BASELINE,
  });
  const stageTwo = buildNextProviderStagePacketV2({
    previousPacket: stageOne, stage: 2, executionFormArm: 'FREE_CHOICE',
    priorArtifact: canonical.referenceBlueprints.BASELINE as JsonRecord & { artifactType: string; taskId: string },
  });
  const stageThree = buildNextProviderStagePacketV2({
    previousPacket: stageTwo, stage: 3, executionFormArm: 'FREE_CHOICE',
    priorArtifact: canonical.editorialIntent as JsonRecord & { artifactType: string; taskId: string },
    stageThreeSource: { evidencePack: canonical.evidencePacks.BASELINE },
  });
  return { canonical, stageOne, stageTwo, stageThree };
}

describe('open-ended planner V2 DEV-03 provider packet convergence', () => {
  it('builds truthful Stage 1-3 packets and accepts the canonical Stage-3 artifact', () => {
    const { canonical, stageOne, stageThree } = packets();
    expect(stageOne.packet.modelInput).toMatchObject({
      projectFacts: { projectId: 'oe-dev-03', projectRevision: 'R11' },
      condition: { conditionId: 'BASELINE' },
    });
    expect(stageThree.packet.modelInput).toHaveProperty(
      'evidencePack.facts',
      expect.arrayContaining([
        expect.objectContaining({ factId: 'fact-measured-beats', strongPeakFrames: [119, 239, 359, 479] }),
      ]),
    );
    expect(validateProviderStageArtifactV2(
      stageThree,
      canonical.evidenceBoundIntents.BASELINE,
    )).toEqual([]);
  });

  it('rejects task, revision, evidence-set, media, and support drift', () => {
    const canonical = source();
    const wrongProject = structuredClone(canonical.stageOneTextInputs.BASELINE) as JsonRecord;
    (wrongProject.projectFacts as JsonRecord).projectRevision = 'R12';
    let bindingError: unknown;
    try {
      buildCanonicalTextStageOnePacketV2({
        taskId: 'DEV-03', conditionId: 'BASELINE', canonicalInput: wrongProject,
      });
    } catch (error) {
      bindingError = error;
    }
    expect(bindingError).toMatchObject({ code: 'PROJECT_BINDING_DRIFT' });

    const stageOne = buildCanonicalTextStageOnePacketV2({
      taskId: 'DEV-03', conditionId: 'BASELINE', canonicalInput: canonical.stageOneTextInputs.BASELINE,
    });
    const stageTwo = buildNextProviderStagePacketV2({
      previousPacket: stageOne, stage: 2, executionFormArm: 'FREE_CHOICE',
      priorArtifact: canonical.referenceBlueprints.BASELINE as JsonRecord & { artifactType: string; taskId: string },
    });
    const driftedPack = structuredClone(canonical.evidencePacks.BASELINE) as JsonRecord;
    const handles = (driftedPack.facts as JsonRecord[])
      .find(({ factId }) => factId === 'fact-source-handles');
    if (!handles) throw new Error('Missing DEV-03 source handles');
    handles.sourceArtifactSha256 = '0'.repeat(64);
    let mediaError: unknown;
    try {
      buildNextProviderStagePacketV2({
        previousPacket: stageTwo, stage: 3, executionFormArm: 'FREE_CHOICE',
        priorArtifact: canonical.editorialIntent as JsonRecord & { artifactType: string; taskId: string },
        stageThreeSource: { evidencePack: driftedPack },
      });
    } catch (error) {
      mediaError = error;
    }
    expect(mediaError).toMatchObject({ code: 'STAGE3_MEDIA_BINDING_DRIFT' });
  });

  it('keeps absent measured evidence expressible only as an unverifiable stop', () => {
    const canonical = source();
    const withheld = canonical.evidenceBoundIntents.BEAT_EVIDENCE_WITHHELD;
    const unresolved = (withheld.unresolvedRequirements as JsonRecord[])[0];
    expect(withheld.stageDisposition).toBe('UNVERIFIABLE');
    expect(unresolved).toEqual(expect.objectContaining({
      factIds: [], disposition: 'UNVERIFIABLE',
      failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER',
    }));
  });
});

describe('open-ended planner V2R DEV-03 canonical chain', () => {
  function v2rPackets(conditionId: 'BASELINE' | 'BEAT_EVIDENCE_WITHHELD') {
    const canonical = source();
    const stageOne = buildCanonicalTextStageOnePacketV2({
      taskId: 'DEV-03', conditionId,
      canonicalInput: canonical.stageOneTextInputs[conditionId],
    });
    const stageTwo = buildNextProviderStagePacketV2({
      previousPacket: stageOne, stage: 2, executionFormArm: 'FORCED_NATIVE',
      priorArtifact: canonical.referenceBlueprints[conditionId] as JsonRecord & { artifactType: string; taskId: string },
      nodeContractVersion: 'V2R',
    });
    const stageThree = buildNextProviderStagePacketV2({
      previousPacket: stageTwo, stage: 3, executionFormArm: 'FORCED_NATIVE',
      priorArtifact: canonical.editorialIntentV2R as JsonRecord & { artifactType: string; taskId: string },
      stageThreeSource: { evidencePack: canonical.evidencePacks[conditionId] },
      nodeContractVersion: 'V2R',
    });
    return { canonical, stageThree };
  }

  it('decomposes the canonical DEV-03 intent into seven single-operator nodes', () => {
    const canonical = source();
    const nodes = canonical.editorialIntentV2R.nodes as Array<{ selectedOperatorId: string }>;
    expect(nodes).toHaveLength(7);
    expect(nodes.map(({ selectedOperatorId }) => selectedOperatorId)).toEqual([
      'read_project_file', 'get_timeline_view', 'find_audio_moment',
      'sync_cuts_to_beats', 'apply_camera_shake', 'read_project_file', 'get_timeline_view',
    ]);
    expect(canonical.evidenceBoundIntentsV2R.BASELINE.stageDisposition).toBe('READY_FOR_COMPILATION');
    expect(canonical.evidenceBoundIntentsV2R.BEAT_EVIDENCE_WITHHELD.stageDisposition).toBe('UNVERIFIABLE');
  });

  it('builds V2R stage 1-3 packets and accepts the canonical V2R bound artifacts', () => {
    const { canonical, stageThree } = v2rPackets('BASELINE');
    expect(stageThree.packet.instructions).toEqual(expect.arrayContaining([
      expect.stringContaining('must not add, drop, or substitute operators'),
    ]));
    expect(validateProviderStageArtifactV2(stageThree, canonical.evidenceBoundIntentsV2R.BASELINE)).toEqual([]);
    const withheld = v2rPackets('BEAT_EVIDENCE_WITHHELD');
    expect(validateProviderStageArtifactV2(withheld.stageThree, canonical.evidenceBoundIntentsV2R.BEAT_EVIDENCE_WITHHELD)).toEqual([]);
  });

  it('rejects legacy candidate-list artifacts against the V2R stage-3 contract', () => {
    const { canonical, stageThree } = v2rPackets('BASELINE');
    const diagnostics = validateProviderStageArtifactV2(stageThree, canonical.evidenceBoundIntents.BASELINE);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('selectedOperatorId:REQUIRED'),
      expect.stringContaining('candidateCapabilityIds:ADDITIONAL'),
    ]));
  });
});
