import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { getCanonicalDev01NativeProxyFixtureV2 } from '@/lib/editron/research/open-ended-planner/dev01-native-proxy-fixture-v2';
import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import {
  compileCanonicalDev01Stage4NativeV2,
  compileCanonicalStage4DeterministicBaselineV2,
  compileDev01Stage4NativeV2,
} from '@/lib/editron/research/open-ended-planner/stage4-deterministic-compiler-v2';
import { evaluateDev01Stage4CompiledGraphV2 } from '@/lib/editron/research/open-ended-planner/stage4-dev01-native-evaluator-v2';
import {
  buildDev01TruthfulStageOneTextPacketV2,
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;

describe('open-ended planner V2 DEV-01 deterministic Stage-4 compiler', () => {
  it('compiles the complete native research graph with exact post-cut and receipt dependencies', () => {
    const artifact = compiled();
    expect(evaluateDev01Stage4CompiledGraphV2(artifact)).toEqual({
      assessment: 'PASS', sourceChain: 'PASS', operatorResolution: 'PASS', inputBindings: 'PASS',
      dependencyGraph: 'PASS', nodeContract: 'PASS', revisionAndPolicy: 'PASS',
      proofAndPreservation: 'PASS', capabilityHonesty: 'PASS', diagnostics: [],
    });
    expect(artifact).toMatchObject({
      artifactType: 'CompiledOperationGraphV2', taskId: 'DEV-01',
      compileDisposition: 'COMPILED_RESEARCH_PROXY', executionEligibility: 'RESEARCH_PROXY_ONLY',
      expectedProjectRevision: 'R7', diagnostics: [], unresolvedIntentNodeIds: [],
    });
    expect(artifact.nodes.map(({ operatorId }) => operatorId)).toEqual([
      'read_project_file', 'get_timeline_view', 'find_transcript_moment', 'resolve_transcript_edit',
      'cut_section', 'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes',
      'find_audio_moment', 'apply_audio_ducking', 'read_project_file', 'get_timeline_view',
    ]);
    expect(node(artifact, 'compile-cut').produces).toEqual([
      'compile-cut.receipt', 'compile-cut.timelineCoordinateTransform', 'compile-cut.splitChildren',
    ]);
    expect(node(artifact, 'compile-resolve-product').inputs).toMatchObject({
      overlayId: '@compile-cut.splitChildren[beforeOverlayId=101].rightOverlayId',
      expectedProjectRevision: '@compile-cut.receipt.revision',
      intent: { sourceFrame: 205, outputTimelineFrame: 160, rightChildLocalFrame: 9 },
      constraints: { expectedResolvedOverlayId: '104', normalizedFocalPoint: [0.745, 0.5], scaleBounds: [1, 1.12] },
    });
    expect(node(artifact, 'compile-duck').inputs).toMatchObject({
      overlayId: '103', expectedProjectRevision: '@compile-push.receipt.revision',
      audioPlan: { outputSpeechRanges: [[60, 151], [151, 285]], storedState: 'overlay.styles.duckingConfig' },
    });
  });

  it('is deterministic, binds the corrected dialogue evidence pack, and preserves the frozen DEV-02 compiler bytes', () => {
    const first = compileCanonicalDev01Stage4NativeV2();
    const second = compileCanonicalDev01Stage4NativeV2();
    expect(hashCanonicalJsonV1(first)).toBe(hashCanonicalJsonV1(second));
    expect(hashCanonicalJsonV1(first)).toBe('02987634af9ac37faf5d78b385fc492333f4976705d4391de9d4aec812e03876');
    expect(first.evidencePackHash).toBe('7afef37f2453b66ce4621e9d6daa73bbb8e474e9e2ff64cdd7a69545671c548d');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen((first as Artifact).nodes)).toBe(true);
    expect(hashCanonicalJsonV1(compileCanonicalStage4DeterministicBaselineV2())).toBe(
      '8ffd22ff17a43bd71ec69b28375d6d473b9e3cbd81af7af1b5c3ed96518d8c53',
    );
  });

  it('proves the prior freeze differs only because dialogue evidence became source-bound', () => {
    const currentFixture = getCanonicalDev01NativeProxyFixtureV2();
    const currentFixtureHash = hashCanonicalJsonV1(currentFixture);
    expect(currentFixtureHash).toBe('90635497775dcd0fa8dba3dd603934c42202c46cc1da82ba8563d27161d8dd92');
    expect(currentFixture.project.overlays.find(({ id }) => id === 102)).toMatchObject({
      metadata: {
        nativeAudioEvidence: {
          evidenceId: 'EV-DEV01-T1',
          sourceAssetId: 'dev01-dialogue-truth-v2',
          sourceVersion: 'DEV01_NATIVE_PROXY_FIXTURE_V2',
        },
      },
    });

    const priorFixture = structuredClone(currentFixture);
    const priorDialogue = priorFixture.project.overlays.find(({ id }) => id === 102);
    if (!priorDialogue) throw new Error('Missing DEV-01 dialogue overlay');
    priorDialogue.metadata = { role: 'dialogue' };
    const priorFixtureHash = hashCanonicalJsonV1(priorFixture);
    expect(priorFixtureHash).toBe('81d1921e33e31e0b5177d9ca37a4bd960752958de250d3996bf030cdbbba56f2');

    const canonical = getCanonicalDev01Stage123V2();
    const priorEvidencePack = replaceExactStringDeep(
      canonical.evidencePacks.BASELINE,
      currentFixtureHash,
      priorFixtureHash,
    );
    const priorEvidencePackHash = hashCanonicalJsonV1(priorEvidencePack);
    expect(priorEvidencePackHash).toBe('1d707446e09feded079165b6c8de3f5cb6489141c555742223143ddee64f3f5f');

    const currentGraph = structuredClone(compileCanonicalDev01Stage4NativeV2()) as Artifact;
    const priorGraph = structuredClone(currentGraph) as Artifact;
    priorGraph.evidencePackHash = priorEvidencePackHash;
    expect(hashCanonicalJsonV1(priorGraph)).toBe('dfb29e0e5261f55075bf60f7dd2eb76fba3977fadd506670fdcc9a99b21c8e07');
    expect(priorGraph.nodes).toEqual(currentGraph.nodes);
    expect(priorGraph.edges).toEqual(currentGraph.edges);
    expect(priorGraph.sourceEditorialIntentHash).toBe(currentGraph.sourceEditorialIntentHash);
    expect(priorGraph.sourceEvidenceBoundIntentHash).toBe(currentGraph.sourceEvidenceBoundIntentHash);
  });

  it('publishes the truthful fixture and mutation-proxy policy only in the DEV-01 Stage-4 packet', () => {
    const stageFour = dev01StageFourPacket();
    expect(stageFour.packet.modelInput.compilationSources).toMatchObject({
      nativeProxyFixtureHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      nativeProxyFixture: {
        authority: 'RESEARCH_ONLY_NO_PROJECT_AUTHORITY',
        project: { projectId: 'oe-dev-01', projectRevision: 'R7', durationInFrames: 480 },
        expected: { revealOutputFrame: 160, revealRightChildLocalFrame: 9 },
      },
    });
    expect((stageFour.packet.modelInput.compilationPolicy as Policy).resourcePolicies).toContainEqual(
      expect.objectContaining({ resourcePolicyId: 'OE_STAGE4_MUTATION_PROXY_V1', currentEligibility: 'ISOLATED_IN_MEMORY_CLONE_ONLY' }),
    );
    expect(() => buildNextProviderStagePacketV2({
      previousPacket: stageFour, stage: 5, executionFormArm: 'FREE_CHOICE',
      priorArtifact: compileCanonicalDev01Stage4NativeV2() as JsonRecord & { artifactType: string; taskId: string },
    })).not.toThrow();
  });

  it('fails closed when a frozen Stage-3 source drifts', () => {
    const canonical = getCanonicalDev01Stage123V2();
    const drifted = structuredClone(canonical.evidencePacks.BASELINE) as JsonRecord;
    const visual = (drifted.facts as JsonRecord[]).find(({ factId }) => factId === 'fact-product-reveal');
    if (!visual) throw new Error('Missing product fact');
    visual.sourceFrame = '206';
    expect(() => compileDev01Stage4NativeV2({
      editorialIntent: canonical.editorialIntent,
      evidenceBoundIntent: canonical.evidenceBoundIntents.BASELINE,
      evidencePack: drifted,
    })).toThrow(/STAGE4_DEV01_EVIDENCE_PACK_DRIFT/);
  });

  it('accepts catalog read and resolver alternatives while rejecting an undeclared mutation', () => {
    const canonical = getCanonicalDev01Stage123V2();
    const editorialIntent = structuredClone(canonical.editorialIntent) as JsonRecord;
    const evidenceBoundIntent = structuredClone(canonical.evidenceBoundIntents.BASELINE) as JsonRecord;
    const addCandidates = (source: JsonRecord, nodeId: string, candidates: string[]) => {
      const target = (source.nodes as JsonRecord[]).find(({ intentNodeId }) => intentNodeId === nodeId);
      if (!target) throw new Error(`Missing ${nodeId}`);
      target.candidateCapabilityIds = [
        ...(target.candidateCapabilityIds as string[]),
        ...candidates,
      ];
    };
    for (const source of [editorialIntent, evidenceBoundIntent]) {
      addCandidates(source, 'node-observe', [
        'list_user_assets', 'search_user_assets', 'inspect_user_asset',
      ]);
      addCandidates(source, 'node-resolve-cut', ['get_video_transcription']);
      addCandidates(source, 'node-resolve-post-cut-product', ['resolve_visual_edit']);
    }

    const source = {
      editorialIntent,
      evidenceBoundIntent,
      evidencePack: canonical.evidencePacks.BASELINE,
    };
    expect(evaluateDev01Stage4CompiledGraphV2(
      compileDev01Stage4NativeV2(source),
      source,
    )).toMatchObject({ assessment: 'PASS', diagnostics: [] });

    addCandidates(editorialIntent, 'node-observe', ['add_overlay']);
    addCandidates(evidenceBoundIntent, 'node-observe', ['add_overlay']);
    expect(() => compileDev01Stage4NativeV2({
      editorialIntent,
      evidenceBoundIntent,
      evidencePack: canonical.evidencePacks.BASELINE,
    })).toThrow(/DEV01_STAGE4_ROLE_RESOLUTION:CAPABILITY_FORBIDDEN:add_overlay/);
  });

  it('rejects old identities, fabricated coordinates, owner bypass, stale revisions, and missing cut outputs', () => {
    const oldIdentity = compiled();
    node(oldIdentity, 'compile-resolve-product').inputs.overlayId = '101';
    expect(evaluateDev01Stage4CompiledGraphV2(oldIdentity)).toMatchObject({ assessment: 'FAIL', inputBindings: 'FAIL' });

    const fabricatedFrame = compiled();
    (node(fabricatedFrame, 'compile-resolve-product').inputs.intent as JsonRecord).outputTimelineFrame = 205;
    expect(evaluateDev01Stage4CompiledGraphV2(fabricatedFrame)).toMatchObject({ assessment: 'FAIL', inputBindings: 'FAIL' });

    const bypassedResolver = compiled();
    node(bypassedResolver, 'compile-push').inputs.keyframes = [{ frame: 9, value: 1.12 }];
    expect(evaluateDev01Stage4CompiledGraphV2(bypassedResolver)).toMatchObject({ assessment: 'FAIL', inputBindings: 'FAIL' });

    const stale = compiled();
    node(stale, 'compile-duck').revisionBinding.expectedProjectRevision = 'R7';
    expect(evaluateDev01Stage4CompiledGraphV2(stale)).toMatchObject({ assessment: 'FAIL', revisionAndPolicy: 'FAIL' });

    const missingTransform = compiled();
    node(missingTransform, 'compile-cut').produces = ['compile-cut.receipt', 'compile-cut.splitChildren'];
    expect(evaluateDev01Stage4CompiledGraphV2(missingTransform)).toMatchObject({ assessment: 'FAIL', nodeContract: 'FAIL' });
  });

  it('rejects dependency, proof, and capability-honesty failures independently', () => {
    const wrongOrder = compiled();
    wrongOrder.edges = wrongOrder.edges.filter(({ edgeId }) => edgeId !== 'edge-push-duck');
    expect(evaluateDev01Stage4CompiledGraphV2(wrongOrder)).toMatchObject({ assessment: 'FAIL', dependencyGraph: 'FAIL' });

    const missingProof = compiled();
    (missingProof.proofPolicy as JsonRecord).proofObligationIds = ['proof-revision'];
    expect(evaluateDev01Stage4CompiledGraphV2(missingProof)).toMatchObject({ assessment: 'FAIL', proofAndPreservation: 'FAIL' });

    const falseProduction = compiled();
    falseProduction.executionEligibility = 'PRODUCTION';
    expect(evaluateDev01Stage4CompiledGraphV2(falseProduction)).toMatchObject({ assessment: 'FAIL', capabilityHonesty: 'FAIL' });

    const generatedSubstitution = compiled();
    node(generatedSubstitution, 'compile-push').operatorId = 'generated_composition_program';
    expect(evaluateDev01Stage4CompiledGraphV2(generatedSubstitution)).toMatchObject({ assessment: 'FAIL', capabilityHonesty: 'FAIL', operatorResolution: 'FAIL' });
  });
});

function dev01StageFourPacket(): HashedStagePacketV2 {
  const canonical = getCanonicalDev01Stage123V2();
  const one = buildDev01TruthfulStageOneTextPacketV2('BASELINE');
  const two = buildNextProviderStagePacketV2({ previousPacket: one, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: canonical.referenceBlueprints.BASELINE as JsonRecord & { artifactType: string; taskId: string } });
  const three = buildNextProviderStagePacketV2({ previousPacket: two, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: canonical.editorialIntent as JsonRecord & { artifactType: string; taskId: string } });
  return buildNextProviderStagePacketV2({ previousPacket: three, stage: 4, executionFormArm: 'FREE_CHOICE', priorArtifact: canonical.evidenceBoundIntents.BASELINE as JsonRecord & { artifactType: string; taskId: string } });
}

function compiled(): Artifact { return structuredClone(compileCanonicalDev01Stage4NativeV2()) as Artifact; }
function node(artifact: Artifact, nodeId: string): TestNode { return artifact.nodes.find((candidate) => candidate.nodeId === nodeId) ?? fail(`Missing ${nodeId}`); }
function replaceExactStringDeep(value: unknown, before: string, after: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => replaceExactStringDeep(entry, before, after));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceExactStringDeep(entry, before, after)]));
  }
  return typeof value === 'string' ? value.split(before).join(after) : value;
}
function fail(message: string): never { throw new Error(message); }

interface TestNode extends JsonRecord {
  nodeId: string;
  operatorId: string;
  inputs: JsonRecord;
  produces: string[];
  revisionBinding: { projectId: string; expectedProjectRevision: string };
}
interface Artifact extends JsonRecord {
  nodes: TestNode[];
  edges: Array<JsonRecord & { edgeId: string }>;
  executionEligibility: string;
}
interface Policy extends JsonRecord { resourcePolicies: JsonRecord[] }
