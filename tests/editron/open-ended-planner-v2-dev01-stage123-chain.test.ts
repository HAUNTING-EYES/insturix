import { describe, expect, it } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { evaluateDev01StagesOneToThreeV2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-evaluator-v2';
import {
  buildDev01TruthfulStageOneTextPacketV2,
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type ConditionId = 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stageOne(conditionId: ConditionId): HashedStagePacketV2 {
  return buildDev01TruthfulStageOneTextPacketV2(conditionId);
}

function packetChain(conditionId: ConditionId): {
  stageOne: HashedStagePacketV2;
  stageTwo: HashedStagePacketV2;
  stageThree: HashedStagePacketV2;
} {
  const canonical = getCanonicalDev01Stage123V2();
  const first = stageOne(conditionId);
  const second = buildNextProviderStagePacketV2({
    previousPacket: first,
    stage: 2,
    executionFormArm: 'FREE_CHOICE',
    priorArtifact: canonical.referenceBlueprints[conditionId] as JsonRecord & { artifactType: string; taskId: string },
  });
  const third = buildNextProviderStagePacketV2({
    previousPacket: second,
    stage: 3,
    executionFormArm: 'FREE_CHOICE',
    priorArtifact: canonical.editorialIntent as JsonRecord & { artifactType: string; taskId: string },
  });
  return { stageOne: first, stageTwo: second, stageThree: third };
}

function evaluate(conditionId: ConditionId, overrides: Partial<{
  referenceBlueprint: JsonRecord;
  editorialIntent: JsonRecord;
  evidencePack: JsonRecord;
  evidenceBoundIntent: JsonRecord;
}> = {}) {
  const canonical = getCanonicalDev01Stage123V2();
  return evaluateDev01StagesOneToThreeV2({
    conditionId,
    referenceBlueprint: overrides.referenceBlueprint ?? canonical.referenceBlueprints[conditionId],
    editorialIntent: overrides.editorialIntent ?? canonical.editorialIntent,
    evidencePack: overrides.evidencePack ?? canonical.evidencePacks[conditionId],
    evidenceBoundIntent: overrides.evidenceBoundIntent ?? canonical.evidenceBoundIntents[conditionId],
  });
}

describe('open-ended planner V2 DEV-01 connected Stage 1-3 chain', () => {
  it('uses only the versioned truthful fixture in the connected text-evidence arm', () => {
    const baseline = stageOne('BASELINE').packet.modelInput;
    expect(baseline.mediaPolicy).toBe('NO_MEDIA_BYTES_OR_PATHS_TRUTHFUL_TEXT_EVIDENCE_ONLY');
    expect(JSON.stringify(baseline)).toContain('dev01-host-truth-v2');
    expect(JSON.stringify(baseline)).toContain('dev01-dialogue-truth-v2');
    expect(JSON.stringify(baseline)).toContain('dev01-bgm-truth-v2');
    expect(JSON.stringify(baseline)).not.toContain('dev01-music@');
    expect(stageOne('BASELINE').transportAttachments).toEqual([]);
  });

  it('builds schema-valid Stage 1-3 packets for both evidence conditions', () => {
    for (const conditionId of ['BASELINE', 'VISUAL_EVIDENCE_WITHHELD'] as const) {
      const chain = packetChain(conditionId);
      expect(chain.stageOne.packet.stage).toBe(1);
      expect(chain.stageTwo.packet.stage).toBe(2);
      expect(chainThreeEvidencePack(chain.stageThree)).toMatchObject({
        taskId: 'DEV-01',
        conditionId,
      });
    }
  });

  it('passes the baseline only when native operations have the required dependency order', () => {
    expect(evaluate('BASELINE')).toEqual({
      assessment: 'PASS',
      expectedStageDisposition: 'READY_FOR_COMPILATION',
      diagnostics: [],
    });

    const canonical = getCanonicalDev01Stage123V2();
    const wrongOrder = clone(canonical.editorialIntent) as JsonRecord;
    wrongOrder.edges = (wrongOrder.edges as JsonRecord[]).filter(({ edgeId }) => edgeId !== 'cut-resolve-product');
    const productResolver = (wrongOrder.nodes as JsonRecord[]).find(({ intentNodeId }) => intentNodeId === 'node-resolve-post-cut-product');
    if (!productResolver) throw new Error('Missing product resolver node');
    productResolver.requiresNodeIds = [];
    expect(evaluate('BASELINE', { editorialIntent: wrongOrder }).diagnostics).toContain(
      'DEV01_ORDER_CUT_BEFORE_POSTCUT_TARGET',
    );
  });

  it('rejects generated substitution and missing native family coverage', () => {
    const canonical = getCanonicalDev01Stage123V2();
    const generated = clone(canonical.editorialIntent) as JsonRecord;
    generated.executionForm = 'GENERATED_COMPOSITION';
    const nodes = generated.nodes as JsonRecord[];
    nodes[2].candidateCapabilityIds = ['generated_composition_program'];
    const result = evaluate('BASELINE', { editorialIntent: generated });
    expect(result.assessment).toBe('FAIL');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      'DEV01_STAGE2_ROUTE_NOT_NATIVE',
      'DEV01_STAGE2_GENERATED_SUBSTITUTION',
      'DEV01_STAGE2_CAPABILITY_COVERAGE',
    ]));
  });

  it('grades selected operations semantically rather than hidden candidate and preservation IDs', () => {
    const intent = clone(getCanonicalDev01Stage123V2().editorialIntent) as JsonRecord;
    const routeDecision = intent.routeDecision as JsonRecord;
    const nativeCandidate = clone((routeDecision.candidateForms as JsonRecord[])[0]);
    routeDecision.candidateForms = [nativeCandidate, {
      ...nativeCandidate,
      form: 'GENERATED_COMPOSITION',
      hardGateStatus: 'INELIGIBLE',
      ownerRefs: ['generated_composition_program'],
      blockers: ['RESEARCH_ONLY_NOT_IMPLEMENTED'],
    }];
    (intent.preservationIntents as JsonRecord[]).forEach((entry, index) => {
      entry.preservationId = `provider-authored-preservation-${index}`;
    });
    expect(evaluate('BASELINE', { editorialIntent: intent })).toEqual({
      assessment: 'PASS',
      expectedStageDisposition: 'READY_FOR_COMPILATION',
      diagnostics: [],
    });
  });

  it('accepts an honest isolated-proxy capability gap after all evidence is bound', () => {
    const bound = clone(getCanonicalDev01Stage123V2().evidenceBoundIntents.BASELINE) as JsonRecord;
    bound.stageDisposition = 'CAPABILITY_GAP';
    bound.unresolvedRequirements = [{
      requirementId: 'provider-authored-native-execution-gap',
      kind: 'CAPABILITY',
      factIds: ['fact-support-cut_section', 'fact-support-set_keyframes', 'fact-support-apply_audio_ducking'],
      disposition: 'CAPABILITY_GAP',
      failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER',
    }];
    expect(evaluate('BASELINE', { evidenceBoundIntent: bound })).toEqual({
      assessment: 'PASS',
      expectedStageDisposition: 'READY_FOR_COMPILATION',
      diagnostics: [],
    });
  });

  it('keeps dialogue and BGM distinct in the Stage-3 evidence contract', () => {
    const canonical = getCanonicalDev01Stage123V2();
    const pack = clone(canonical.evidencePacks.BASELINE) as JsonRecord;
    const audio = (pack.facts as JsonRecord[]).find(({ factId }) => factId === 'fact-audio-stems');
    if (!audio) throw new Error('Missing canonical audio fact');
    audio.bgmAssetId = audio.dialogueAssetId;
    expect(evaluate('BASELINE', { evidencePack: pack }).diagnostics).toContain(
      'DEV01_STAGE3_AUDIO_STEMS_NOT_SEPARATE',
    );
  });

  it('treats withheld product evidence as an honest Stage-3 stop', () => {
    expect(evaluate('VISUAL_EVIDENCE_WITHHELD')).toEqual({
      assessment: 'PASS',
      expectedStageDisposition: 'UNVERIFIABLE',
      diagnostics: [],
    });
    const canonical = getCanonicalDev01Stage123V2();
    const chain = packetChain('VISUAL_EVIDENCE_WITHHELD');
    expect(() => buildNextProviderStagePacketV2({
      previousPacket: chain.stageThree,
      stage: 4,
      executionFormArm: 'FREE_CHOICE',
      priorArtifact: canonical.evidenceBoundIntents.VISUAL_EVIDENCE_WITHHELD as JsonRecord & { artifactType: string; taskId: string },
    })).toThrow(/Stage 4 cannot compile a UNVERIFIABLE/);
  });

  it('prepares baseline Stage 4 only after the exact Stage-3 evidence-bound intent', () => {
    const canonical = getCanonicalDev01Stage123V2();
    const chain = packetChain('BASELINE');
    const stageFour = buildNextProviderStagePacketV2({
      previousPacket: chain.stageThree,
      stage: 4,
      executionFormArm: 'FREE_CHOICE',
      priorArtifact: canonical.evidenceBoundIntents.BASELINE as JsonRecord & { artifactType: string; taskId: string },
    });
    expect(stageFour.packet.stage).toBe(4);
    expect(stageFour.packet.modelInput.compilationSources).toMatchObject({
      sourceEditorialIntentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      evidencePackHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});

function chainThreeEvidencePack(stageThree: HashedStagePacketV2): JsonRecord {
  const pack = stageThree.packet.modelInput.evidencePack;
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('Stage-3 evidence pack missing');
  return pack as JsonRecord;
}
