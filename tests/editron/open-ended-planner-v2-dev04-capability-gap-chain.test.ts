import { describe, expect, it } from 'vitest';

import {
  compileCanonicalDev04CapabilityGapV2,
  compileDev04CapabilityGapV2,
  evaluateDev04Stage4CapabilityGapV2,
  evaluateDev04StagesOneToThreeV2,
  getCanonicalDev04ConnectedChainV2,
} from '@/lib/editron/research/open-ended-planner/dev04-capability-gap-chain-v2';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertNoEvaluatorLeakV2,
  buildDevelopmentStageOnePacketsV2,
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import { decideStage5ProceedOrStopV2 } from '@/lib/editron/research/open-ended-planner/stage5-proceed-stop-gate-v2';

type JsonRecord = Record<string, unknown>;

describe('open-ended planner V2 DEV-04 truthful capability-gap chain', () => {
  it('connects canonical Stage 1-4 packets without leaking evaluator-only truth', () => {
    const canonical = getCanonicalDev04ConnectedChainV2();
    const { stageOne, stageTwo, stageThree, stageFour } = buildPacketChain();

    expect(stageOne.packet).toMatchObject({ stage: 1, taskId: 'DEV-04', conditionId: 'BASELINE' });
    expect(stageTwo.packet.modelInput).toMatchObject({ priorArtifactHash: hashCanonicalJsonV1(canonical.referenceBlueprint) });
    expect(stageThree.packet.modelInput).toMatchObject({
      priorArtifactHash: hashCanonicalJsonV1(canonical.editorialIntent),
      evidencePack: canonical.evidencePacks.BASELINE,
    });
    expect(stageFour.packet.modelInput).toHaveProperty(
      'compilationSources.sourceEvidenceBoundIntentHash',
      hashCanonicalJsonV1(canonical.evidenceBoundIntent),
    );
    for (const packet of [stageOne, stageTwo, stageThree, stageFour]) {
      expect(() => assertNoEvaluatorLeakV2(packet.packet)).not.toThrow();
    }
    expect(buildPacketChain().stageFour.packetHash).toBe(stageFour.packetHash);
  });

  it('passes complete baseline evidence and stops noisy visual evidence before compilation', () => {
    const canonical = getCanonicalDev04ConnectedChainV2();
    expect(evaluateDev04StagesOneToThreeV2({
      referenceBlueprint: canonical.referenceBlueprint,
      editorialIntent: canonical.editorialIntent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: canonical.evidenceBoundIntent,
    })).toEqual({
      disposition: 'PASS',
      targetReconstruction: 'PASS',
      capabilityHonesty: 'PASS',
      evidenceSufficiency: 'PASS',
      preservation: 'PASS',
      diagnostics: [],
    });

    const noisy = evaluateDev04StagesOneToThreeV2({
      referenceBlueprint: canonical.referenceBlueprint,
      editorialIntent: canonical.editorialIntent,
      evidencePack: canonical.evidencePacks['NOISY-VISUAL-EVIDENCE'],
      evidenceBoundIntent: canonical.evidenceBoundIntent,
    });
    expect(noisy).toMatchObject({ disposition: 'UNVERIFIABLE', evidenceSufficiency: 'UNVERIFIABLE' });
    expect(noisy.diagnostics).toContain('DEV04_VISUAL_EVIDENCE_INSUFFICIENT');
    expect(() => compileDev04CapabilityGapV2({
      referenceBlueprint: canonical.referenceBlueprint,
      editorialIntent: canonical.editorialIntent,
      evidencePack: canonical.evidencePacks['NOISY-VISUAL-EVIDENCE'],
      evidenceBoundIntent: canonical.evidenceBoundIntent,
    })).toThrow(/DEV04_STAGE123_UNVERIFIABLE/);

    const noisyPackets = buildPacketChain('NOISY-VISUAL-EVIDENCE', false);
    const unverifiableBound = clone(canonical.evidenceBoundIntent);
    unverifiableBound.stageDisposition = 'UNVERIFIABLE';
    expect(() => buildNextProviderStagePacketV2({
      previousPacket: noisyPackets.stageThree,
      stage: 4,
      executionFormArm: 'FREE_CHOICE',
      priorArtifact: unverifiableBound as JsonRecord & { artifactType: string; taskId: string },
    })).toThrow(/Stage 4 cannot compile a UNVERIFIABLE/);
  });

  it('compiles alpha-renamed provider symbols without injecting canonical answer IDs', () => {
    const canonical = getCanonicalDev04ConnectedChainV2();
    const symbolMap = new Map([
      ['claim-selective-moving-occlusion', 'TC-provider-occlusion'],
      ['claim-title-visible-outside-overlap', 'TC-provider-title-visible'],
      ['claim-source-and-timing-preserved', 'TC-provider-source-preserved'],
      ['node-current-scene-inspection', 'IN-provider-inspection'],
      ['node-selective-occlusion', 'IN-provider-capability-gap'],
      ['req-moving-matte-or-segmentation-track', 'UR-provider-missing-matte'],
      ['bind-project-and-source', 'EB-provider-project'],
      ['bind-selective-occlusion-gap', 'EB-provider-gap'],
    ]);
    const source = {
      referenceBlueprint: renameSymbols(canonical.referenceBlueprint, symbolMap),
      editorialIntent: renameSymbols(canonical.editorialIntent, symbolMap),
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: renameSymbols(canonical.evidenceBoundIntent, symbolMap),
    };
    expect(JSON.stringify(source)).not.toContain('node-selective-occlusion');
    expect(evaluateDev04StagesOneToThreeV2(source)).toMatchObject({
      disposition: 'PASS', diagnostics: [],
    });

    const compiled = compileDev04CapabilityGapV2(source);
    expect(records(compiled.diagnostics)[0]).toMatchObject({
      intentNodeIds: ['IN-provider-capability-gap'],
      capabilityIds: ['moving-matte-or-segmentation-track'],
    });
    expect(records(compiled.nodes).every((node) => node.intentNodeId === 'IN-provider-inspection')).toBe(true);
    expect(compiled).toMatchObject({
      sourceEditorialIntentHash: hashCanonicalJsonV1(source.editorialIntent),
      sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(source.evidenceBoundIntent),
    });
    expect(evaluateDev04Stage4CapabilityGapV2(compiled, source)).toEqual({
      disposition: 'CAPABILITY_BLOCKED', diagnostics: [],
    });
  });

  it('fails closed when provider artifacts contain two competing gap roles', () => {
    const canonical = getCanonicalDev04ConnectedChainV2();
    const intent = clone(canonical.editorialIntent);
    const gapNode = clone(records(intent.nodes)[1]);
    gapNode.intentNodeId = 'node-second-gap';
    (intent.nodes as JsonRecord[]).push(gapNode);
    const bound = clone(canonical.evidenceBoundIntent);
    const boundGap = clone(records(bound.nodes)[1]);
    boundGap.intentNodeId = 'node-second-gap';
    (bound.nodes as JsonRecord[]).push(boundGap);

    expect(() => compileDev04CapabilityGapV2({
      referenceBlueprint: canonical.referenceBlueprint,
      editorialIntent: intent,
      evidencePack: canonical.evidencePacks.BASELINE,
      evidenceBoundIntent: bound,
    })).toThrow(/DEV04_GAP_NODE_COUNT:2/);
  });

  it('compiles only read nodes and returns the exact non-executable Stage-5 gap', () => {
    const compiled = compileCanonicalDev04CapabilityGapV2();
    expect(evaluateDev04Stage4CapabilityGapV2(compiled)).toEqual({
      disposition: 'CAPABILITY_BLOCKED', diagnostics: [],
    });
    expect(records(compiled.nodes).every((node) => ['read_project_file', 'get_timeline_view'].includes(String(node.operatorId)))).toBe(true);
    expect(records(compiled.nodes).every((node) => arraysEmpty(node.writes, node.invalidates, node.stateEffects))).toBe(true);

    const decision = decideStage5ProceedOrStopV2(compiled);
    expect(decision).toEqual({
      artifactType: 'ProceedOrStopDecisionV2',
      taskId: 'DEV-04',
      disposition: 'CAPABILITY_GAP',
      reasonCode: 'REQUIRED_CAPABILITY_NOT_IMPLEMENTED',
      missingEvidenceIds: [],
      missingCapabilityIds: ['moving-matte-or-segmentation-track'],
      userMessage: 'The edit requires moving-matte-or-segmentation-track. Nothing was executed.',
    });
    expect(decision).not.toHaveProperty('executionAuthorization');

    const { stageFour } = buildPacketChain();
    expect(() => buildNextProviderStagePacketV2({
      previousPacket: stageFour,
      stage: 5,
      executionFormArm: 'FREE_CHOICE',
      priorArtifact: compiled as JsonRecord & { artifactType: string; taskId: string },
    })).not.toThrow();
  });

  it.each([
    'reorder_layer',
    'set_keyframes',
    'generated_composition_program',
    'add_overlay',
    'update_overlay',
    'static_rectangle_mask',
  ])('rejects %s as a substitute for moving selective occlusion', (operatorId) => {
    const compiled = clone(compileCanonicalDev04CapabilityGapV2());
    records(compiled.nodes)[0].operatorId = operatorId;
    const evaluation = evaluateDev04Stage4CapabilityGapV2(compiled);
    expect(evaluation.disposition).toBe('FAIL');
    expect(evaluation.diagnostics).toContain(`DEV04_STAGE4_FORBIDDEN_OPERATOR:${operatorId}`);
    expect(decideStage5ProceedOrStopV2(compiled)).toMatchObject({
      disposition: 'FAIL', reasonCode: 'STAGE4_GRAPH_INVALID', missingCapabilityIds: [],
    });
  });

  it('rejects injected writes, effects, false capability identities, and missing read nodes', () => {
    const withMutation = clone(compileCanonicalDev04CapabilityGapV2());
    records(withMutation.nodes)[0].writes = ['project.overlays'];
    records(withMutation.nodes)[0].stateEffects = ['overlay keyframes'];
    expect(evaluateDev04Stage4CapabilityGapV2(withMutation)).toMatchObject({ disposition: 'FAIL' });

    const fakeCapability = clone(compileCanonicalDev04CapabilityGapV2());
    records(fakeCapability.diagnostics)[0].capabilityIds = ['static-rectangle'];
    records(fakeCapability.diagnostics)[0].operatorIds = ['reorder_layer'];
    expect(evaluateDev04Stage4CapabilityGapV2(fakeCapability)).toMatchObject({
      disposition: 'FAIL', diagnostics: expect.arrayContaining(['DEV04_STAGE4_CAPABILITY_DIAGNOSTIC_DRIFT']),
    });

    const noReads = clone(compileCanonicalDev04CapabilityGapV2()) as JsonRecord;
    noReads.nodes = [];
    expect(evaluateDev04Stage4CapabilityGapV2(noReads)).toMatchObject({
      disposition: 'FAIL', diagnostics: expect.arrayContaining(['DEV04_STAGE4_READ_SET_EMPTY']),
    });
  });

  it('keeps canonical graph and decision hashes reproducible', () => {
    const graphA = compileCanonicalDev04CapabilityGapV2();
    const graphB = compileCanonicalDev04CapabilityGapV2();
    expect(hashCanonicalJsonV1(graphA)).toBe(hashCanonicalJsonV1(graphB));
    expect(hashCanonicalJsonV1(graphA)).toBe('35c7cfce0417e58261eb63f99080e060f23d657ce3157e54c0ce6c4a7f5dade8');
    expect(hashCanonicalJsonV1(decideStage5ProceedOrStopV2(graphA)))
      .toBe(hashCanonicalJsonV1(decideStage5ProceedOrStopV2(graphB)));
    expect(hashCanonicalJsonV1(decideStage5ProceedOrStopV2(graphA)))
      .toBe('9bb4b8a46689ccdd737cf1ffdd860c910f05d14efaa220fc7c5f2245e2b91229');
  });
});

function buildPacketChain(conditionId = 'BASELINE', includeStageFour = true): {
  stageOne: HashedStagePacketV2;
  stageTwo: HashedStagePacketV2;
  stageThree: HashedStagePacketV2;
  stageFour: HashedStagePacketV2;
} {
  const canonical = getCanonicalDev04ConnectedChainV2();
  const stageOne = buildDevelopmentStageOnePacketsV2().find(({ packet }) =>
    packet.taskId === 'DEV-04' && packet.conditionId === conditionId && packet.inputArm === 'TEXT_EVIDENCE_ONLY') as HashedStagePacketV2;
  const stageTwo = buildNextProviderStagePacketV2({
    previousPacket: stageOne, stage: 2, executionFormArm: 'FREE_CHOICE',
    priorArtifact: canonical.referenceBlueprint as JsonRecord & { artifactType: string; taskId: string },
  });
  const stageThree = buildNextProviderStagePacketV2({
    previousPacket: stageTwo, stage: 3, executionFormArm: 'FREE_CHOICE',
    priorArtifact: canonical.editorialIntent as JsonRecord & { artifactType: string; taskId: string },
  });
  const stageFour = includeStageFour ? buildNextProviderStagePacketV2({
    previousPacket: stageThree, stage: 4, executionFormArm: 'FREE_CHOICE',
    priorArtifact: canonical.evidenceBoundIntent as JsonRecord & { artifactType: string; taskId: string },
  }) : stageThree;
  return { stageOne, stageTwo, stageThree, stageFour };
}

function clone<T>(value: T): T { return structuredClone(value); }
function renameSymbols<T>(value: T, symbols: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') return (symbols.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((entry) => renameSymbols(entry, symbols)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .map(([key, entry]) => [key, renameSymbols(entry, symbols)])) as T;
  }
  return value;
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }
function arraysEmpty(...values: unknown[]): boolean { return values.every((value) => Array.isArray(value) && value.length === 0); }
