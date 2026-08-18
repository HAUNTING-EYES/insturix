import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXECUTION_FORM_ARMS_V2,
  assertNoEvaluatorLeakV2,
  buildDev01TruthfulStageOneTextPacketV2,
  buildDevelopmentNoProviderPlanV2,
  buildDevelopmentReferenceImageStageOnePacketV2,
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildDevelopmentReferenceNativeVideoStageOnePacketV2,
  buildDevelopmentStageOnePacketsV2,
  buildNextProviderStagePacketV2,
  validateProviderStageArtifactV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { getCanonicalDev02V2RV2 } from '@/lib/editron/research/open-ended-planner/dev02-canonical-v2r-v2';
import { validateSelectedOperatorNodesV2R } from '@/lib/editron/research/open-ended-planner/stage2-selected-operator-contract-v2r';
import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import canonicalReferenceBlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';

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
    nodes: [{ intentNodeId: 'node-1', operationFamily: executionForm === 'NATIVE' ? 'native-layout' : 'generated-composition', targetClaimIds: ['claim-layout'], candidateCapabilityIds: [executionForm === 'NATIVE' ? 'add_overlay' : 'generated_composition_program'], executionForm: executionForm === 'HYBRID' ? 'GENERATED_COMPOSITION' : executionForm, requiresNodeIds: [], invalidates: ['RENDER_PROOF'], evidenceIds: ['EV-DEV02-R1'], failureDisposition: 'NEEDS_REVIEW' }],
    edges: [], preservationIntents: [], unresolvedRequirements: [],
  };
  if (artifactType === 'EvidenceBoundIntentGraphV2') return {
    artifactType, taskId, stageDisposition: 'CAPABILITY_GAP',
    nodes: [{ intentNodeId: 'node-1', candidateCapabilityIds: ['generated_composition_program'], evidenceBindingIds: ['binding-reference'], preservationIds: ['preserve-reference'], proofObligationIds: ['proof-render'], bindingStatus: 'BOUND', unresolvedRequirementIds: ['req-owner'] }],
    evidenceBindings: [{ bindingId: 'binding-reference', factIds: ['fact-reference-observation'], nodeIds: ['node-1'], status: 'BOUND' }],
    rightsDecision: { decisionId: 'rights', status: 'COMPLIANT', policyFactIds: ['fact-rights-policy'], allowedAssetIds: ['dev02-wide'], deniedActions: ['INSERT_REFERENCE_MEDIA'], reasonCodes: ['OWNED_FIXTURE'] },
    privacyDecision: { decisionId: 'privacy', status: 'COMPLIANT', policyFactIds: ['fact-privacy-egress-policy'], egressDisposition: 'DENIED', reasonCodes: ['SYNTHETIC_NO_EGRESS'] },
    revisionBinding: { projectId: 'oe-dev-02', expectedProjectRevision: 'R3', timebaseFactId: 'fact-project-timebase', status: 'BOUND' },
    preservationBindings: [{ preservationId: 'preserve-reference', factIds: ['fact-reference-observation'], status: 'BOUND' }],
    proofPlan: [{ proofObligationId: 'proof-render', kind: 'RENDERED_GEOMETRY', nodeIds: ['node-1'], targetClaimIds: ['claim-layout'], requiredFactIds: ['fact-reference-observation'], status: 'PLANNED' }],
    unresolvedRequirements: [{ requirementId: 'req-owner', kind: 'CAPABILITY', factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' }],
  };
  return {
    artifactType, taskId,
    compileDisposition: 'CAPABILITY_GAP', executionEligibility: 'NOT_EXECUTABLE',
    sourceEditorialIntentHash: hashCanonicalJsonV1(canonicalEditorialIntentJson),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(canonicalEvidenceBoundIntentJson),
    evidencePackHash: 'ddcd45e6ef7c51eca382919fd04595ceabb3d4eef8483d4809d899aa22519822',
    operatorCatalogVersion: '2.0.0', projectId: 'oe-dev-02', expectedProjectRevision: 'R3',
    nodes: [], edges: [],
    proofPolicy: { proofVersion: 'OE_STAGE4_PROOF_POLICY_V1', mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION', proofObligationIds: ['proof-sandbox-compile'], preservationIds: ['preserve-reference-not-inserted'], onUnverifiable: 'BLOCK_EXECUTION' },
    diagnostics: [{ diagnosticId: 'diag-generated-owner', code: 'CAPABILITY_NOT_IMPLEMENTED', intentNodeIds: ['node-generated-island'], operatorIds: ['generated_composition_program'], factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' }],
    unresolvedIntentNodeIds: ['node-generated-island'],
  };
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
    const beatWithheld = stageOne.find(({ packet }) => packet.taskId === 'DEV-03' && packet.conditionId === 'BEAT_EVIDENCE_WITHHELD' && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
    expect(JSON.stringify(modelInput(visualWithheld as HashedStagePacketV2).evidence)).not.toContain('EV-DEV01-V1');
    expect(JSON.stringify(modelInput(beatWithheld as HashedStagePacketV2).evidence)).not.toContain('EV-DEV03-B1');
    for (const packet of stageOne) {
      expect(JSON.stringify(packet.packet)).not.toContain('sha256:oe2-generated');
      expect(packet.packet.taskId).toMatch(/^DEV-/);
      expect(JSON.stringify(packet.packet)).not.toMatch(/HOLD-0[1-8]/);
    }
  });

  it('builds an ordered reference-image sequence without leaking the pre-digested DEV-02 layout answer', () => {
    const referenceOnly = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');
    const input = modelInput(referenceOnly);
    const serializedEvidence = JSON.stringify(input.evidence);

    expect(referenceOnly.packet.inputArm).toBe('REFERENCE_IMAGE_SEQUENCE_EVIDENCE');
    expect(referenceOnly.transportAttachments).toHaveLength(6);
    expect(referenceOnly.transportAttachments.map(({ sequenceIndex }) => sequenceIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(referenceOnly.transportAttachments.map(({ referenceTick }) => referenceTick)).toEqual(['0', '36', '72', '108', '144', '180']);
    expect(referenceOnly.transportAttachments.map(({ timestampMilliseconds }) => timestampMilliseconds)).toEqual([0, 1_200, 2_400, 3_600, 4_800, 6_000]);
    expect(new Set(referenceOnly.transportAttachments.map(({ bundleSha256 }) => bundleSha256)).size).toBe(1);
    expect(referenceOnly.transportAttachments.every(({ assetId, mimeType, evidenceRole }) =>
      assetId.startsWith('dev02-reference-t') && mimeType === 'image/png'
      && evidenceRole === 'ORDERED_REFERENCE_SAMPLE')).toBe(true);
    expect(input.mediaPolicy).toBe('ATTACH_HASH_BOUND_ORDERED_REFERENCE_IMAGES');
    expect(input.mediaDescriptors).toEqual(referenceOnly.transportAttachments.map((attachment) =>
      expect.objectContaining({
        assetId: attachment.assetId,
        artifactSha256: attachment.artifactSha256,
        referenceTick: attachment.referenceTick,
        timestampMilliseconds: attachment.timestampMilliseconds,
      })));
    expect(input.referenceEvidenceContract).toEqual(expect.objectContaining({
      representation: 'ORDERED_TIMESTAMPED_IMAGE_SEQUENCE',
      order: 'ASCENDING_REFERENCE_TICK',
    }));
    expect(serializedEvidence).toContain('REFERENCE_MEDIA_BINDING');
    expect(serializedEvidence).toContain('observationRequired');
    expect(serializedEvidence).not.toContain('"panels":5');
    expect(serializedEvidence).not.toContain('blackGutters');
    expect(serializedEvidence).not.toContain('opposed-column-slides');
    expect(JSON.stringify(referenceOnly.packet)).not.toContain('artifactPath');
    expect(referenceOnly.transportAttachments.map(({ assetId }) => assetId)).not.toContain('dev02-wide');
    expect(referenceOnly.transportAttachments.map(({ assetId }) => assetId)).not.toContain('dev02-close');
  });

  it('builds a separate native-reference-video arm bound to the same evidence bundle', () => {
    const imageSequence = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');
    const nativeVideo = buildDevelopmentReferenceNativeVideoStageOnePacketV2('DEV-02', 'BASELINE');
    const input = modelInput(nativeVideo);

    expect(nativeVideo.packet.inputArm).toBe('REFERENCE_NATIVE_VIDEO_EVIDENCE');
    expect(nativeVideo.transportAttachments).toEqual([
      expect.objectContaining({
        assetId: 'dev02-reference-native-video',
        mimeType: 'video/mp4',
        evidenceRole: 'NATIVE_REFERENCE_VIDEO',
      }),
    ]);
    expect(nativeVideo.transportAttachments[0].bundleSha256).toBe(
      imageSequence.transportAttachments[0].bundleSha256,
    );
    expect(input.mediaPolicy).toBe('ATTACH_HASH_BOUND_NATIVE_REFERENCE_VIDEO');
    expect(input.referenceEvidenceContract).toEqual(expect.objectContaining({
      representation: 'NATIVE_REFERENCE_VIDEO',
      timebase: { numerator: '30', denominator: '1', startTick: '0', endExclusiveTick: '181' },
    }));
    expect(JSON.stringify(nativeVideo.packet)).not.toContain('artifactPath');
  });

  it('keeps the former reference-image name as a transport-identical compatibility arm', () => {
    const former = buildDevelopmentReferenceImageStageOnePacketV2('DEV-02', 'BASELINE');
    const explicit = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');

    expect(former.packet.inputArm).toBe('REFERENCE_IMAGE_EVIDENCE');
    expect(explicit.packet.inputArm).toBe('REFERENCE_IMAGE_SEQUENCE_EVIDENCE');
    expect(former.transportHash).toBe(explicit.transportHash);
    expect(former.transportAttachments).toEqual(explicit.transportAttachments);
    expect(former.packet.modelInput).toEqual(explicit.packet.modelInput);
    expect(former.packetHash).not.toBe(explicit.packetHash);
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
    const temporalItems = stageOneProperties.temporalStructure.items as Record<string, unknown>;
    const uncertaintyItems = stageOneProperties.uncertainties.items as Record<string, unknown>;
    expect(temporalItems.additionalProperties).toBe(false);
    expect(temporalItems.required).toEqual(expect.arrayContaining(['phaseId', 'phaseRole', 'scope', 'evidenceIds']));
    expect(uncertaintyItems.additionalProperties).toBe(false);
    expect(uncertaintyItems.required).toEqual(expect.arrayContaining(['uncertaintyId', 'affectedClaimIds', 'disposition', 'evidenceIds']));
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: { artifactType: 'ReferenceBlueprintV2', taskId: 'DEV-02', observableTargets: ['looks energetic'] } })).toThrow(/globalEditorialLanguage:REQUIRED/);
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: { ...prior('ReferenceBlueprintV2', 'DEV-02'), temporalStructure: [{}] } })).toThrow(/temporalStructure\[0\]\.phaseId:REQUIRED/);
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: { ...prior('ReferenceBlueprintV2', 'DEV-02'), uncertainties: [{}] } })).toThrow(/uncertainties\[0\]\.uncertaintyId:REQUIRED/);
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: {
      ...prior('ReferenceBlueprintV2', 'DEV-02'),
      temporalStructure: [{ phaseId: 'phase-1', label: 'hold', phaseRole: 'HOLD', scope: scope(), description: 'stable composition', evidenceIds: ['EV-DEV02-R1'], evaluatorOnly: true }],
    } })).toThrow(/temporalStructure\[0\]\.evaluatorOnly:ADDITIONAL/);
    const second = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-02') });
    const stageTwoProperties = second.packet.outputContract.properties as Record<string, Record<string, unknown>>;
    expect(stageTwoProperties).toHaveProperty('routeDecision');
    expect((stageTwoProperties.nodes.items as Record<string, unknown>).additionalProperties).toBe(false);
    expect(modelInput(second)).toHaveProperty('routingExperiment.scopeRule', expect.stringContaining('HYBRID'));
    expect(modelInput(second)).toHaveProperty('routingExperiment.coverageSemantics.COVERED', expect.stringContaining('structurally realize'));
    expect(modelInput(second)).toHaveProperty('routingExperiment.readinessSemantics', expect.stringContaining('RESEARCH_ONLY_NOT_IMPLEMENTED'));
    expect(modelInput(second)).toHaveProperty('routingExperiment.stageBoundary', expect.stringContaining('Stage 3'));
    expect(second.packet.instructions).toEqual(expect.arrayContaining([
      expect.stringContaining('missing concrete project IDs'),
      expect.stringContaining('ideal architectural route'),
    ]));
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

  it('constructs stages 2-5 sequentially and carries the exact Stage-4 source chain', () => {
    const first = stageOne.find(({ packet }) => packet.taskId === 'DEV-02' && packet.conditionId === 'BASELINE' && packet.inputArm === 'MULTIMODAL') as HashedStagePacketV2;
    const forcedSecond = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FORCED_NATIVE', priorArtifact: canonicalReferenceBlueprintJson });
    const executionForm = ((forcedSecond.packet.outputContract.properties as Record<string, unknown>).executionForm as { enum: string[] }).enum;
    expect(executionForm).toEqual(['NATIVE', 'CAPABILITY_GAP']);
    const second = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalReferenceBlueprintJson });
    const third = buildNextProviderStagePacketV2({ previousPacket: second, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalEditorialIntentJson });
    const fourth = buildNextProviderStagePacketV2({ previousPacket: third, stage: 4, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalEvidenceBoundIntentJson });
    const fifth = buildNextProviderStagePacketV2({ previousPacket: fourth, stage: 5, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('CompiledOperationGraphV2', 'DEV-02') });
    expect([second, third, fourth, fifth].map(({ packet }) => packet.stage)).toEqual([2, 3, 4, 5]);
    expect(modelInput(second)).toHaveProperty('operatorCatalog');
    expect(modelInput(third)).toHaveProperty('evidencePack.authority', 'SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION');
    expect(modelInput(third)).toHaveProperty('evidencePack.facts', expect.arrayContaining([
      expect.objectContaining({ factId: 'fact-project-revision', expectedProjectRevision: 'R3' }),
      expect.objectContaining({ factId: 'fact-support-generated-composition', supportStatus: 'RESEARCH_ONLY_NOT_IMPLEMENTED' }),
    ]));
    expect((modelInput(third).operatorCatalog as { operators: unknown[] }).operators).toHaveLength(5);
    expect(third.packet.outputContract).toHaveProperty('properties.stageDisposition.enum', expect.arrayContaining(['CAPABILITY_GAP', 'UNVERIFIABLE']));
    expect(third.packet.instructions).toEqual(expect.arrayContaining([
      expect.stringContaining('BOUND means the supplied facts are complete'),
      expect.stringContaining('PLANNED means a proof obligation is required'),
      expect.stringContaining('COMPLIANT means the proposed plan obeys'),
      expect.stringContaining('distinct from capability readiness'),
    ]));
    expect(modelInput(fourth)).toHaveProperty('operatorCatalog.fieldSchemas');
    expect(modelInput(fourth)).toHaveProperty('compilationSources.sourceEditorialIntent', canonicalEditorialIntentJson);
    expect(modelInput(fourth)).toHaveProperty('compilationSources.sourceEditorialIntentHash', hashCanonicalJsonV1(canonicalEditorialIntentJson));
    expect(modelInput(fourth)).toHaveProperty('compilationSources.sourceEvidenceBoundIntentHash', '9222bc05a08c90a93dfc682bc6f4ac852d9de106eb11df3552c26420fe65334d');
    expect(modelInput(fourth)).toHaveProperty('compilationSources.evidencePackHash', 'ddcd45e6ef7c51eca382919fd04595ceabb3d4eef8483d4809d899aa22519822');
    expect(modelInput(fourth)).toHaveProperty('operatorCatalog.productionEligibility', 'FORBIDDEN_ALL_V2');
    expect(modelInput(fourth)).toHaveProperty('operatorCatalog.operators', expect.arrayContaining([
      expect.objectContaining({ operatorId: 'read_project_file', operatorSpecRef: 'EDITRON_OPERATOR_SPECS_V2@2.0.0#read_project_file', ownerRef: 'v1:read_project_file' }),
      expect.objectContaining({ operatorId: 'generated_composition_program', supportStatus: 'RESEARCH_ONLY_NOT_IMPLEMENTED' }),
    ]));
    expect(modelInput(fourth)).toHaveProperty('compilationPolicy.supportRules', expect.arrayContaining([
      expect.objectContaining({ disposition: 'FORBIDDEN_DIAGNOSTIC_REQUIRED' }),
    ]));
    expect(fourth.packet.instructions).toEqual(expect.arrayContaining([
      expect.stringContaining('does not make the requested graph executable'),
      expect.stringContaining('Every node must declare reads, writes, requires, produces, invalidates'),
    ]));
    const stageFourProperties = fourth.packet.outputContract.properties as Record<string, Record<string, unknown>>;
    expect(fourth.packet.outputContract).toHaveProperty('additionalProperties', false);
    expect(stageFourProperties).toHaveProperty('compileDisposition.enum', expect.arrayContaining(['CAPABILITY_GAP', 'CONFLICT', 'UNVERIFIABLE']));
    const compiledNode = stageFourProperties.nodes.items as { required: string[]; additionalProperties: boolean; properties: Record<string, unknown> };
    expect(compiledNode.additionalProperties).toBe(false);
    expect(compiledNode.required).toEqual(expect.arrayContaining(['operatorSpecRef', 'reads', 'writes', 'invalidates', 'coordinateBindings', 'revisionBinding', 'proofObligationIds', 'concurrency', 'resourcePolicyId', 'reversibility']));
    expect(compiledNode.properties).toHaveProperty('inputs.type', 'object');
    expect(modelInput(fifth)).not.toHaveProperty('operatorCatalog');
    const drifted = structuredClone(canonicalEvidenceBoundIntentJson);
    drifted.nodes[0].candidateCapabilityIds = ['read_project_file'];
    let driftError: unknown;
    try {
      buildNextProviderStagePacketV2({ previousPacket: third, stage: 4, executionFormArm: 'FREE_CHOICE', priorArtifact: drifted });
    } catch (error) {
      driftError = error;
    }
    expect(driftError).toMatchObject({ code: 'STAGE4_CAPABILITY_SET_DRIFT' });
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('EditorialIntentGraphV2', 'DEV-02') })).toThrow(/sequentially/);
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-99') })).toThrow(/same task/);
  });

  it('allocates the complete frozen trial budget without exceeding it', () => {
    const first = stageOne.find(({ packet }) => packet.taskId === 'DEV-02' && packet.conditionId === 'BASELINE') as HashedStagePacketV2;
    const packets = [first];
    const artifacts = [canonicalReferenceBlueprintJson, canonicalEditorialIntentJson, canonicalEvidenceBoundIntentJson, prior('CompiledOperationGraphV2', 'DEV-02')];
    for (let stage = 2; stage <= 5; stage += 1) packets.push(buildNextProviderStagePacketV2({ previousPacket: packets.at(-1) as HashedStagePacketV2, stage: stage as 2 | 3 | 4 | 5, executionFormArm: 'FREE_CHOICE', priorArtifact: artifacts[stage - 2] }));
    const sum = (field: 'maxInputTokens' | 'maxVisibleOutputTokens' | 'maxReasoningTokens' | 'maxWallClockMs' | 'maxProviderCostUsd') => packets.reduce((total, packet) => total + packet.packet.stageBudget[field], 0);
    expect(sum('maxInputTokens')).toBe(233000);
    expect(sum('maxVisibleOutputTokens')).toBe(34800);
    expect(sum('maxReasoningTokens')).toBe(19800);
    expect(sum('maxWallClockMs')).toBe(1380000);
    expect(sum('maxProviderCostUsd')).toBeCloseTo(2.56, 10);
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

describe('open-ended planner V2R selected-operator node contract', () => {
  const stageOne = buildDevelopmentStageOnePacketsV2();
  const first = stageOne.find(({ packet }) => packet.taskId === 'DEV-02' && packet.conditionId === 'BASELINE' && packet.inputArm === 'MULTIMODAL') as HashedStagePacketV2;

  function v2rNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      intentNodeId: 'node-1',
      operationFamily: 'generated-composition',
      targetClaimIds: ['claim-layout'],
      selectedOperatorId: 'generated_composition_program',
      alternativeOperatorIds: [],
      executionForm: 'GENERATED_COMPOSITION',
      requiresNodeIds: [],
      invalidates: ['RENDER_PROOF'],
      evidenceIds: ['EV-DEV02-R1'],
      failureDisposition: 'NEEDS_REVIEW',
      ...overrides,
    };
  }

  function v2rStageTwoArtifact(): Record<string, unknown> {
    return { ...prior('EditorialIntentGraphV2', 'DEV-02'), nodes: [v2rNode()] };
  }

  it('issues a stage-2 contract that requires exactly one selected operator per node', () => {
    const second = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-02'), nodeContractVersion: 'V2R' });
    const nodeSchema = (second.packet.outputContract.properties as Record<string, { items: { required: string[]; properties: Record<string, unknown> } }>).nodes.items;
    expect(nodeSchema.required).toEqual(expect.arrayContaining(['selectedOperatorId', 'alternativeOperatorIds']));
    expect(nodeSchema.required).not.toContain('candidateCapabilityIds');
    expect(nodeSchema.properties.selectedOperatorId).toEqual({ type: 'string', minLength: 1 });
    expect(nodeSchema.properties.failureDisposition).toEqual({ type: 'string', enum: ['NEEDS_REVIEW', 'FAIL'] });
    expect(second.packet.instructions).toEqual(expect.arrayContaining([
      expect.stringContaining('exactly one selectedOperatorId'),
      expect.stringContaining('never through an empty, placeholder, or pseudo operator node'),
    ]));
    expect(validateProviderStageArtifactV2(second, v2rStageTwoArtifact())).toEqual([]);
  });

  it('rejects stage-2 nodes that keep the ambiguous candidate list or omit the selected operator', () => {
    const second = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-02'), nodeContractVersion: 'V2R' });
    const legacy = v2rStageTwoArtifact();
    legacy.nodes = [{ intentNodeId: 'node-1', operationFamily: 'generated-composition', targetClaimIds: ['claim-layout'], candidateCapabilityIds: ['generated_composition_program'], executionForm: 'GENERATED_COMPOSITION', requiresNodeIds: [], invalidates: ['RENDER_PROOF'], evidenceIds: ['EV-DEV02-R1'], failureDisposition: 'NEEDS_REVIEW' }];
    expect(validateProviderStageArtifactV2(second, legacy)).toEqual(expect.arrayContaining([
      expect.stringContaining('nodes[0].selectedOperatorId:REQUIRED'),
      expect.stringContaining('nodes[0].candidateCapabilityIds:ADDITIONAL'),
    ]));
    const emptySelected = v2rStageTwoArtifact();
    emptySelected.nodes = [v2rNode({ selectedOperatorId: '' })];
    expect(validateProviderStageArtifactV2(second, emptySelected)).toEqual(expect.arrayContaining([
      expect.stringContaining('nodes[0].selectedOperatorId:STRING'),
    ]));
  });

  it('keeps the default V2 node contract bit-identical for historical packets', () => {
    const second = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-02') });
    const nodeSchema = (second.packet.outputContract.properties as Record<string, { items: { required: string[] } }>).nodes.items;
    expect(nodeSchema.required).toContain('candidateCapabilityIds');
    expect(nodeSchema.required).not.toContain('selectedOperatorId');
    expect(second.packet.instructions.join('\n')).not.toContain('selectedOperatorId');
    const again = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-02') });
    expect(again.packetHash).toBe(second.packetHash);
  });
});

describe('open-ended planner V2R DEV-01 canonical chain', () => {
  const canonical = getCanonicalDev01Stage123V2();
  const asPrior = (artifact: unknown): { artifactType: string; taskId: string; [key: string]: unknown } => artifact as { artifactType: string; taskId: string; [key: string]: unknown };
  const dev01Operators = new Set([
    'read_project_file', 'get_timeline_view', 'find_transcript_moment', 'resolve_transcript_edit',
    'cut_section', 'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes',
    'find_audio_moment', 'apply_audio_ducking',
  ]);

  it('decomposes the canonical DEV-01 intent into one catalog-known selected operator per node', () => {
    const intentNodes = (canonical.editorialIntentV2R.nodes as unknown[]);
    expect(intentNodes).toHaveLength(12);
    expect(validateSelectedOperatorNodesV2R(intentNodes, dev01Operators)).toEqual([]);
    const boundNodes = (canonical.evidenceBoundIntentsV2R.BASELINE.nodes as unknown[]);
    expect(boundNodes).toHaveLength(12);
    const selectedIds = intentNodes.map((node) => (node as { selectedOperatorId: string }).selectedOperatorId).sort();
    expect(new Set(selectedIds).size).toBe(10);
    expect(selectedIds.filter((id) => id === 'read_project_file')).toHaveLength(2);
    expect(selectedIds.filter((id) => id === 'get_timeline_view')).toHaveLength(2);
  });

  it('builds the connected DEV-01 stage 2-4 V2R chain without operator drift', () => {
    const stageOne = buildDev01TruthfulStageOneTextPacketV2('BASELINE');
    const second = buildNextProviderStagePacketV2({ previousPacket: stageOne, stage: 2, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(canonical.referenceBlueprints.BASELINE), nodeContractVersion: 'V2R' });
    expect(second.packet.instructions).toEqual(expect.arrayContaining([
      expect.stringContaining('exactly one selectedOperatorId'),
    ]));
    const third = buildNextProviderStagePacketV2({ previousPacket: second, stage: 3, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(canonical.editorialIntentV2R), nodeContractVersion: 'V2R' });
    expect((third.packet.modelInput.operatorCatalog as { operators: unknown[] }).operators).toHaveLength(10);
    expect(third.packet.instructions).toEqual(expect.arrayContaining([
      expect.stringContaining('must not add, drop, or substitute operators'),
    ]));
    const fourth = buildNextProviderStagePacketV2({ previousPacket: third, stage: 4, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(canonical.evidenceBoundIntentsV2R.BASELINE), nodeContractVersion: 'V2R' });
    expect(fourth.packet.modelInput).toHaveProperty('compilationSources.sourceEditorialIntentHash', hashCanonicalJsonV1(canonical.editorialIntentV2R));
    expect(fourth.packet.modelInput).toHaveProperty('compilationSources.sourceEditorialIntent', canonical.editorialIntentV2R);
  });

  it('refuses V2R stage-4 compilation when bound nodes drift from the selected operators', () => {
    const stageOne = buildDev01TruthfulStageOneTextPacketV2('BASELINE');
    const second = buildNextProviderStagePacketV2({ previousPacket: stageOne, stage: 2, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(canonical.referenceBlueprints.BASELINE), nodeContractVersion: 'V2R' });
    const third = buildNextProviderStagePacketV2({ previousPacket: second, stage: 3, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(canonical.editorialIntentV2R), nodeContractVersion: 'V2R' });
    const drifted = structuredClone(canonical.evidenceBoundIntentsV2R.BASELINE) as { nodes: Array<{ selectedOperatorId: string }>; [key: string]: unknown };
    drifted.nodes[4].selectedOperatorId = 'get_timeline_view';
    let driftError: unknown;
    try {
      buildNextProviderStagePacketV2({ previousPacket: third, stage: 4, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(drifted), nodeContractVersion: 'V2R' });
    } catch (error) {
      driftError = error;
    }
    expect(driftError).toMatchObject({ code: 'STAGE4_CAPABILITY_SET_DRIFT' });
  });

  it('keeps the withheld-visual V2R condition unverifiable and therefore non-compilable', () => {
    expect(canonical.evidenceBoundIntentsV2R.VISUAL_EVIDENCE_WITHHELD.stageDisposition).toBe('UNVERIFIABLE');
    const stageOne = buildDev01TruthfulStageOneTextPacketV2('VISUAL_EVIDENCE_WITHHELD');
    const second = buildNextProviderStagePacketV2({ previousPacket: stageOne, stage: 2, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(canonical.referenceBlueprints.VISUAL_EVIDENCE_WITHHELD), nodeContractVersion: 'V2R' });
    const third = buildNextProviderStagePacketV2({ previousPacket: second, stage: 3, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(canonical.editorialIntentV2R), nodeContractVersion: 'V2R' });
    expect(() => buildNextProviderStagePacketV2({ previousPacket: third, stage: 4, executionFormArm: 'FORCED_NATIVE', priorArtifact: asPrior(canonical.evidenceBoundIntentsV2R.VISUAL_EVIDENCE_WITHHELD), nodeContractVersion: 'V2R' }))
      .toThrow(/STAGE4_PRIOR_STAGE_NOT_COMPILABLE|cannot compile/);
  });
});

describe('open-ended planner V2R DEV-02 hybrid canonical chain', () => {
  const canonical = getCanonicalDev02V2RV2();
  const asPrior = (artifact: unknown): { artifactType: string; taskId: string; [key: string]: unknown } => artifact as { artifactType: string; taskId: string; [key: string]: unknown };
  const dev02Operators = new Set([
    'inspect_user_asset', 'resolve_user_asset_overlay', 'generated_composition_program',
    'get_timeline_view', 'read_project_file',
  ]);

  it('decomposes the hybrid DEV-02 intent into one selected operator per node with a generated island', () => {
    const intentNodes = canonical.editorialIntent.nodes as unknown as Array<{ selectedOperatorId: string; executionForm: string }>;
    expect(intentNodes).toHaveLength(7);
    expect(validateSelectedOperatorNodesV2R(intentNodes, dev02Operators)).toEqual([]);
    expect(intentNodes.filter(({ selectedOperatorId }) => selectedOperatorId === 'resolve_user_asset_overlay')).toHaveLength(2);
    const island = intentNodes.find(({ selectedOperatorId }) => selectedOperatorId === 'generated_composition_program');
    expect(island?.executionForm).toBe('GENERATED_COMPOSITION');
    expect(canonical.evidenceBoundIntent.stageDisposition).toBe('CAPABILITY_GAP');
  });

  it('builds the connected DEV-02 stage 2-4 V2R chain and keeps the capability-gap disposition', () => {
    const stageOne = buildDevelopmentStageOnePacketsV2().find(({ packet }) => packet.taskId === 'DEV-02' && packet.conditionId === 'BASELINE' && packet.inputArm === 'MULTIMODAL') as HashedStagePacketV2;
    const second = buildNextProviderStagePacketV2({ previousPacket: stageOne, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: canonicalReferenceBlueprintJson, nodeContractVersion: 'V2R' });
    const third = buildNextProviderStagePacketV2({ previousPacket: second, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: asPrior(canonical.editorialIntent), nodeContractVersion: 'V2R' });
    expect((third.packet.modelInput.operatorCatalog as { operators: unknown[] }).operators).toHaveLength(5);
    const fourth = buildNextProviderStagePacketV2({ previousPacket: third, stage: 4, executionFormArm: 'FREE_CHOICE', priorArtifact: asPrior(canonical.evidenceBoundIntent), nodeContractVersion: 'V2R' });
    expect(fourth.packet.modelInput).toHaveProperty('compilationSources.sourceEditorialIntentHash', hashCanonicalJsonV1(canonical.editorialIntent));
    const diagnostics = (fourth.packet.outputContract.properties as Record<string, { properties: Record<string, unknown> }>).diagnostics;
    expect(diagnostics).toBeDefined();
  });
});
