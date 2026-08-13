import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXECUTION_FORM_ARMS_V2,
  assertNoEvaluatorLeakV2,
  buildDevelopmentNoProviderPlanV2,
  buildDevelopmentReferenceImageStageOnePacketV2,
  buildDevelopmentStageOnePacketsV2,
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';

interface FrozenPlanV2 {
  planVersion: string;
  authority: string;
  stageOnePackets: Array<{ taskId: string; conditionId: string; inputArm: string; packetHash: string; transportHash: string }>;
  branches: Array<{ branchId: string; taskId: string; conditionId: string; inputArm: string; executionFormArm: string; stageOnePacketHash: string; branchHash: string; stageStatuses: string[] }>;
  noProviderTelemetry: Record<string, unknown>;
  sourceBindings: Array<{ path: string; sha256: string }>;
  planHash: string;
}

const frozenPlan = JSON.parse(readFileSync(resolve('tests/fixtures/editron/open-ended-planner-v2/development-no-provider-plan-v2.json'), 'utf8')) as FrozenPlanV2;

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

function modelInput(packet: HashedStagePacketV2): Record<string, unknown> {
  return packet.packet.modelInput;
}

function normalizedNonMediaInput(packet: HashedStagePacketV2): Record<string, unknown> {
  const { mediaDescriptors: _descriptors, mediaPolicy: _policy, ...rest } = modelInput(packet);
  return rest;
}

function scope() {
  return { coordinateDomain: 'REFERENCE_TIME', timebaseId: 'reference:dev02', timebaseVersion: 'V2_1F', rate: { numerator: '30', denominator: '1' }, start: '0', endExclusive: '180' };
}

function prior(artifactType: string, taskId: string, executionForm: 'NATIVE' | 'GENERATED_COMPOSITION' | 'HYBRID' = 'HYBRID'): { artifactType: string; taskId: string; [key: string]: unknown } {
  if (artifactType === 'ReferenceBlueprintV2') return {
    artifactType, taskId,
    globalEditorialLanguage: [{ dimension: 'PACING_RHYTHM', observation: 'energetic measured montage', applicability: 'whole requested section', strength: 'SOFT', certainty: 'OBSERVED', evidenceIds: ['EV-DEV02-R1'] }],
    recurringDesignGrammar: [],
    uniqueMoments: [{ momentId: 'filmstrip', scope: scope(), targetClaimIds: ['claim-layout'], evidenceIds: ['EV-DEV02-R1'] }],
    targetClaims: [{ claimId: 'claim-layout', claimKind: 'RELATIONAL_PANEL_LAYOUT', scope: scope(), subjects: ['panel-group'], relation: 'HAS', desired: { valueType: 'layout', value: 'five unequal panels', unit: 'layout', comparisonBasis: 'reference' }, tolerance: { kind: 'EDITORIAL_JUDGMENT', value: 'bounded', unit: 'review' }, criticality: 'HARD', provenance: 'REFERENCE_OBSERVED', evidenceIds: ['EV-DEV02-R1'], ambiguity: 'RESOLVED', proofKind: 'RENDERED_GEOMETRY' }],
    temporalStructure: [], uncertainties: [], evidenceIds: ['EV-DEV02-R1'],
  };
  if (artifactType === 'EditorialIntentGraphV2') return {
    artifactType, taskId, executionForm,
    routeDecision: { scopeClassification: executionForm === 'HYBRID' ? 'HYBRID_FULL_PLAN' : executionForm === 'NATIVE' ? 'NATIVE_ONLY_PLAN' : 'BOUNDED_GENERATED_ISLAND', coverageStatus: 'COMPLETE', candidateForms: [{ form: executionForm, hardGateStatus: 'ELIGIBLE', claimCoverage: [{ claimId: 'claim-layout', status: 'COVERED', ownerRefs: [executionForm === 'NATIVE' ? 'native_layout_owner' : 'generated_composition_program'], reasonCodes: ['RELATIONAL_LAYOUT'] }], representabilitySignals: executionForm === 'NATIVE' ? ['NONE'] : ['CROSS_ELEMENT_DEPENDENCY'], blockers: [], ownerRefs: [executionForm === 'NATIVE' ? 'native_layout_owner' : 'generated_composition_program'], evidenceIds: ['EV-DEV02-R1'] }], selectedReasonCodes: [executionForm === 'HYBRID' ? 'GENERATED_ISLAND_NATIVE_SURROUND' : 'FORCED_ROUTE_TEST'], generatedIslandClaimIds: executionForm === 'NATIVE' ? [] : ['claim-layout'], nativeSurroundClaimIds: executionForm === 'NATIVE' ? ['claim-layout'] : [] },
    nodes: [{ intentNodeId: 'node-1', operationFamily: executionForm === 'NATIVE' ? 'native-layout' : 'generated-composition', targetClaimIds: ['claim-layout'], candidateCapabilityIds: [executionForm === 'NATIVE' ? 'native_layout_owner' : 'generated_composition_program'], executionForm: executionForm === 'HYBRID' ? 'GENERATED_COMPOSITION' : executionForm, requiresNodeIds: [], invalidates: ['RENDER_PROOF'], evidenceIds: ['EV-DEV02-R1'], failureDisposition: 'NEEDS_REVIEW' }],
    edges: [], preservationIntents: [], unresolvedRequirements: [],
  };
  if (artifactType === 'EvidenceBoundIntentGraphV2') return { artifactType, taskId, nodes: [], evidenceBindings: [], rightsDecision: {}, privacyDecision: {}, revisionBinding: {}, proofPlan: {} };
  return { artifactType, taskId, operatorCatalogVersion: 'v2', nodes: [], edges: [], expectedProjectRevision: 'R3', proofPolicy: {} };
}

describe('open-ended planner V2 staged no-provider packets', () => {
  const stageOne = buildDevelopmentStageOnePacketsV2();
  const plan = buildDevelopmentNoProviderPlanV2();

  it('builds 16 pre-routing packets and exactly six branches per packet', () => {
    expect(stageOne).toHaveLength(16);
    expect(plan.branches).toHaveLength(96);
    expect(new Set(stageOne.map(({ packetHash }) => packetHash)).size).toBe(16);
    expect(new Set(plan.branches.map(({ branchId }) => branchId)).size).toBe(96);
    for (const packet of stageOne) {
      const branches = plan.branches.filter(({ stageOnePacketHash }) => stageOnePacketHash === packet.packetHash);
      expect(branches).toHaveLength(6);
      expect(new Set(branches.map(({ executionFormArm }) => executionFormArm))).toEqual(new Set(EXECUTION_FORM_ARMS_V2));
      expect(packet.packet.executionFormArm).toBe('NOT_APPLICABLE_PRE_ROUTING');
      expect(JSON.stringify(packet.packet)).not.toMatch(/FORCED_NATIVE|FORCED_HYBRID|THRESHOLD_ABLATION/);
    }
  });

  it('keeps both modality arms equivalent except for declared media transport', () => {
    const keys = new Set(stageOne.map(({ packet }) => `${packet.taskId}/${packet.conditionId}`));
    expect(keys.size).toBe(8);
    for (const key of keys) {
      const [taskId, conditionId] = key.split('/');
      const multimodal = stageOne.find(({ packet }) => packet.taskId === taskId && packet.conditionId === conditionId && packet.inputArm === 'MULTIMODAL');
      const textOnly = stageOne.find(({ packet }) => packet.taskId === taskId && packet.conditionId === conditionId && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
      expect(multimodal).toBeDefined();
      expect(textOnly).toBeDefined();
      expect(normalizedNonMediaInput(multimodal as HashedStagePacketV2)).toEqual(normalizedNonMediaInput(textOnly as HashedStagePacketV2));
      expect(multimodal?.transportAttachments.length).toBeGreaterThan(0);
      expect(textOnly?.transportAttachments).toEqual([]);
      expect(JSON.stringify(textOnly?.packet)).not.toContain('artifactPath');
      expect(JSON.stringify(textOnly?.packet)).not.toContain('.calibration-temp');
    }
  });

  it('passes only condition-visible evidence and replaces placeholder media hashes', () => {
    const visualWithheld = stageOne.find(({ packet }) => packet.taskId === 'DEV-01' && packet.conditionId === 'VISUAL_EVIDENCE_WITHHELD' && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
    const beatWithheld = stageOne.find(({ packet }) => packet.taskId === 'DEV-03' && packet.conditionId === 'BEAT-EVIDENCE_WITHHELD' && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
    expect(JSON.stringify(modelInput(visualWithheld as HashedStagePacketV2).evidence)).not.toContain('EV-DEV01-V1');
    expect(JSON.stringify(modelInput(beatWithheld as HashedStagePacketV2).evidence)).not.toContain('EV-DEV03-B1');
    for (const packet of stageOne) {
      expect(JSON.stringify(packet.packet)).not.toContain('sha256:oe2-generated');
      expect(packet.packet.taskId).toMatch(/^DEV-/);
      expect(JSON.stringify(packet.packet)).not.toMatch(/HOLD-0[1-8]/);
    }
  });

  it('builds a reference-image arm without leaking the pre-digested DEV-02 layout answer', () => {
    const referenceOnly = buildDevelopmentReferenceImageStageOnePacketV2('DEV-02', 'BASELINE');
    const input = modelInput(referenceOnly);
    const serializedEvidence = JSON.stringify(input.evidence);

    expect(referenceOnly.packet.inputArm).toBe('REFERENCE_IMAGE_EVIDENCE');
    expect(referenceOnly.transportAttachments).toEqual([
      expect.objectContaining({ assetId: 'dev02-reference', mimeType: 'image/png' }),
    ]);
    expect(input.mediaPolicy).toBe('ATTACH_HASH_BOUND_REFERENCE_IMAGES_ONLY');
    expect(input.mediaDescriptors).toEqual([
      expect.objectContaining({ assetId: 'dev02-reference', mimeType: 'image/png' }),
    ]);
    expect(serializedEvidence).toContain('REFERENCE_MEDIA_BINDING');
    expect(serializedEvidence).toContain('observationRequired');
    expect(serializedEvidence).not.toContain('"panels":5');
    expect(serializedEvidence).not.toContain('blackGutters');
    expect(serializedEvidence).not.toContain('opposed-column-slides');
    expect(JSON.stringify(referenceOnly.packet)).not.toContain('artifactPath');
    expect(referenceOnly.transportAttachments.map(({ assetId }) => assetId)).not.toContain('dev02-wide');
    expect(referenceOnly.transportAttachments.map(({ assetId }) => assetId)).not.toContain('dev02-close');
  });

  it('uses explicit rational project/source coordinates instead of naked FPS or ambiguous frames', () => {
    for (const packet of stageOne) {
      const input = modelInput(packet);
      const projectFacts = input.projectFacts as Record<string, unknown>;
      expect(projectFacts).not.toHaveProperty('fps');
      expect(projectFacts).not.toHaveProperty('durationFrames');
      expect(projectFacts).toHaveProperty('projectTimebase.rate', { numerator: '30', denominator: '1' });
      expect(input.sourceCoordinateFacts).toBeInstanceOf(Array);
    }
  });

  it('closes target claims and routing traces instead of accepting free-text target or open nodes', () => {
    const first = stageOne.find(({ packet }) => packet.taskId === 'DEV-02' && packet.conditionId === 'BASELINE' && packet.inputArm === 'MULTIMODAL') as HashedStagePacketV2;
    const stageOneProperties = first.packet.outputContract.properties as Record<string, Record<string, unknown>>;
    expect(stageOneProperties).toHaveProperty('globalEditorialLanguage');
    expect(stageOneProperties).toHaveProperty('recurringDesignGrammar');
    expect(stageOneProperties).toHaveProperty('uniqueMoments');
    expect(stageOneProperties).toHaveProperty('targetClaims');
    expect(stageOneProperties).not.toHaveProperty('observableTargets');
    const claimItems = stageOneProperties.targetClaims.items as Record<string, unknown>;
    expect(claimItems.additionalProperties).toBe(false);
    expect((claimItems.required as string[])).toEqual(expect.arrayContaining(['scope', 'relation', 'tolerance', 'proofKind']));
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: { artifactType: 'ReferenceBlueprintV2', taskId: 'DEV-02', observableTargets: ['looks energetic'] } })).toThrow(/globalEditorialLanguage:REQUIRED/);
    const second = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-02') });
    const stageTwoProperties = second.packet.outputContract.properties as Record<string, Record<string, unknown>>;
    expect(stageTwoProperties).toHaveProperty('routeDecision');
    expect((stageTwoProperties.nodes.items as Record<string, unknown>).additionalProperties).toBe(false);
    expect(modelInput(second)).toHaveProperty('routingExperiment.scopeRule', expect.stringContaining('HYBRID'));
  });

  it('excludes evaluator structures recursively from every provider-visible packet', () => {
    const forbiddenStrings = ['baselineDisposition', 'acceptableExecutionForms', 'requiredOperationFamilies', 'successPredicates'];
    for (const packet of stageOne) {
      expect(() => assertNoEvaluatorLeakV2(packet.packet)).not.toThrow();
      const serialized = JSON.stringify(packet.packet);
      for (const forbidden of forbiddenStrings) expect(serialized).not.toContain(forbidden);
    }
    expect(() => assertNoEvaluatorLeakV2({ nested: { evaluatorOnly: 'sentinel-secret' } })).toThrow(/Forbidden provider key/);
  });

  it('constructs stages 2-5 sequentially and narrows forced routing schemas', () => {
    const first = stageOne.find(({ packet }) => packet.taskId === 'DEV-02' && packet.conditionId === 'BASELINE' && packet.inputArm === 'MULTIMODAL') as HashedStagePacketV2;
    const second = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FORCED_NATIVE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-02') });
    const third = buildNextProviderStagePacketV2({ previousPacket: second, stage: 3, executionFormArm: 'FORCED_NATIVE', priorArtifact: prior('EditorialIntentGraphV2', 'DEV-02', 'NATIVE') });
    const fourth = buildNextProviderStagePacketV2({ previousPacket: third, stage: 4, executionFormArm: 'FORCED_NATIVE', priorArtifact: prior('EvidenceBoundIntentGraphV2', 'DEV-02') });
    const fifth = buildNextProviderStagePacketV2({ previousPacket: fourth, stage: 5, executionFormArm: 'FORCED_NATIVE', priorArtifact: prior('CompiledOperationGraphV2', 'DEV-02') });
    expect([second, third, fourth, fifth].map(({ packet }) => packet.stage)).toEqual([2, 3, 4, 5]);
    const executionForm = ((second.packet.outputContract.properties as Record<string, unknown>).executionForm as { enum: string[] }).enum;
    expect(executionForm).toEqual(['NATIVE', 'CAPABILITY_GAP']);
    expect(modelInput(second)).toHaveProperty('operatorCatalog');
    expect(modelInput(fourth)).toHaveProperty('operatorCatalog.fieldSchemas');
    expect(modelInput(fifth)).not.toHaveProperty('operatorCatalog');
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('EditorialIntentGraphV2', 'DEV-02') })).toThrow(/sequentially/);
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-99') })).toThrow(/same task/);
  });

  it('allocates the complete frozen trial budget without exceeding it', () => {
    const first = stageOne[0];
    const packets = [first];
    const types = ['ReferenceBlueprintV2', 'EditorialIntentGraphV2', 'EvidenceBoundIntentGraphV2', 'CompiledOperationGraphV2'];
    for (let stage = 2; stage <= 5; stage += 1) packets.push(buildNextProviderStagePacketV2({ previousPacket: packets.at(-1) as HashedStagePacketV2, stage: stage as 2 | 3 | 4 | 5, executionFormArm: 'FREE_CHOICE', priorArtifact: prior(types[stage - 2], first.packet.taskId) }));
    const sum = (field: 'maxInputTokens' | 'maxVisibleOutputTokens' | 'maxReasoningTokens' | 'maxWallClockMs' | 'maxProviderCostUsd') => packets.reduce((total, packet) => total + packet.packet.stageBudget[field], 0);
    expect(sum('maxInputTokens')).toBe(49000);
    expect(sum('maxVisibleOutputTokens')).toBe(15800);
    expect(sum('maxReasoningTokens')).toBe(13200);
    expect(sum('maxWallClockMs')).toBe(240000);
    expect(sum('maxProviderCostUsd')).toBeCloseTo(0.77, 10);
  });

  it('freezes a reproducible plan with source and plan hashes', () => {
    expect(plan.stageOnePackets).toEqual(frozenPlan.stageOnePackets);
    expect(plan.branches).toEqual(frozenPlan.branches);
    expect(plan.noProviderTelemetry).toEqual(frozenPlan.noProviderTelemetry);
    for (const binding of frozenPlan.sourceBindings) expect(sha256File(binding.path)).toBe(binding.sha256);
    const { planHash, ...material } = frozenPlan;
    expect(hashCanonicalJsonV1(material)).toBe(planHash);
    expect(frozenPlan.noProviderTelemetry).toMatchObject({ provider: 'NO_PROVIDER', model: 'NO_MODEL', finishReason: 'NOT_DISPATCHED_V2_1B', inputTokens: 0, visibleOutputTokens: 0, reasoningTokens: 0, providerCostUsd: 0, parseStatus: 'NOT_ATTEMPTED' });
    expect(Object.keys(frozenPlan.noProviderTelemetry)).toHaveLength(18);
  });
});
