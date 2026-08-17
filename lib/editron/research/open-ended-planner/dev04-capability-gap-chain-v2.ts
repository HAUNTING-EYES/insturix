import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { resolveDev04Stage4RolesV2 } from './dev04-stage4-role-resolver-v2';

type JsonRecord = Record<string, unknown>;

export interface Dev04Stage123EvaluationV2 {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  targetReconstruction: 'PASS' | 'FAIL';
  capabilityHonesty: 'PASS' | 'FAIL';
  evidenceSufficiency: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  preservation: 'PASS' | 'FAIL';
  diagnostics: readonly string[];
}

export interface Dev04Stage4EvaluationV2 {
  disposition: 'CAPABILITY_BLOCKED' | 'FAIL' | 'UNVERIFIABLE';
  diagnostics: readonly string[];
}

export interface Dev04Stage4SourceV2 {
  referenceBlueprint: unknown;
  editorialIntent: unknown;
  evidencePack: unknown;
  evidenceBoundIntent: unknown;
}

interface Dev04FixtureV2 {
  fixtureVersion: string;
  referenceBlueprint: JsonRecord;
  editorialIntent: JsonRecord;
  evidencePacks: Record<string, JsonRecord>;
  evidenceBoundIntent: JsonRecord;
}

const missingCapabilityId = 'moving-matte-or-segmentation-track';
const canonical = deepFreezeV1(buildCanonicalFixture());
const operatorCatalog = operatorCatalogJson as unknown as JsonRecord;
const operators = new Map(records(operatorCatalog.operators).map((operator) => [text(operator.operatorId), operator]));

export function getCanonicalDev04ConnectedChainV2(): Readonly<Dev04FixtureV2> {
  return canonical;
}

export function evaluateDev04StagesOneToThreeV2(input: {
  referenceBlueprint: unknown;
  editorialIntent: unknown;
  evidencePack: unknown;
  evidenceBoundIntent: unknown;
}): Readonly<Dev04Stage123EvaluationV2> {
  const resolution = resolveDev04Stage4RolesV2(input);
  return stage123(resolution.disposition, [...resolution.diagnostics]);
}

export function compileCanonicalDev04CapabilityGapV2(): Readonly<JsonRecord> {
  return compileDev04CapabilityGapV2({
    referenceBlueprint: canonical.referenceBlueprint,
    editorialIntent: canonical.editorialIntent,
    evidencePack: canonical.evidencePacks.BASELINE,
    evidenceBoundIntent: canonical.evidenceBoundIntent,
  });
}

export function compileDev04CapabilityGapV2(input: {
  referenceBlueprint: unknown;
  editorialIntent: unknown;
  evidencePack: unknown;
  evidenceBoundIntent: unknown;
}): Readonly<JsonRecord> {
  const resolution = resolveDev04Stage4RolesV2(input);
  if (resolution.disposition !== 'PASS' || !resolution.roles) {
    throw new Error(`DEV04_STAGE123_${resolution.disposition}:${resolution.diagnostics.join(',')}`);
  }
  const roles = resolution.roles;
  const intent = record(input.editorialIntent);
  const pack = record(input.evidencePack);
  const bound = record(input.evidenceBoundIntent);
  const readProject = readNode({
    nodeId: 'compile-dev04-read-project', operatorId: 'read_project_file',
    inputs: { projectId: roles.projectId, expectedProjectRevision: roles.expectedProjectRevision, selector: { overlayKinds: ['VIDEO', 'TEXT'] } },
    reads: [roles.revisionFactId, roles.timebaseFactId, roles.sourceFactId, roles.visualFactId],
    requires: [], ...roles,
  });
  const readTimeline = readNode({
    nodeId: 'compile-dev04-read-timeline', operatorId: 'get_timeline_view',
    inputs: {
      projectId: roles.projectId,
      expectedProjectRevision: roles.expectedProjectRevision,
      targetRange: { startFrame: roles.targetStartFrame, endFrame: roles.targetEndFrame },
    },
    reads: [roles.revisionFactId, roles.timebaseFactId, roles.targetRangeFactId, roles.visualFactId],
    requires: ['compile-dev04-read-project.result'], ...roles,
  });
  const material: JsonRecord = {
    artifactType: 'CompiledOperationGraphV2',
    taskId: 'DEV-04',
    compileDisposition: 'CAPABILITY_GAP',
    executionEligibility: 'NOT_EXECUTABLE',
    sourceEditorialIntentHash: hashCanonicalJsonV1(intent),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(bound),
    evidencePackHash: hashCanonicalJsonV1(pack),
    operatorCatalogVersion: text(operatorCatalog.version),
    projectId: roles.projectId,
    expectedProjectRevision: roles.expectedProjectRevision,
    nodes: [readProject, readTimeline],
    edges: [{ edgeId: 'edge-dev04-read-project-timeline', fromNodeId: readProject.nodeId, toNodeId: readTimeline.nodeId, edgeType: 'DATA' }],
    proofPolicy: {
      proofVersion: 'OE_DEV04_STAGE4_PROOF_POLICY_V2',
      mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION',
      proofObligationIds: roles.proofIds,
      preservationIds: roles.preservationIds,
      onUnverifiable: 'BLOCK_EXECUTION',
    },
    diagnostics: [{
      diagnosticId: 'diag-moving-matte-or-segmentation-track',
      code: 'CAPABILITY_NOT_IMPLEMENTED',
      intentNodeIds: [roles.gapIntentNodeId],
      operatorIds: [],
      capabilityIds: [roles.missingCapabilityId],
      factIds: [roles.missingCapabilityFactId],
      disposition: 'CAPABILITY_GAP',
    }],
    unresolvedIntentNodeIds: [roles.gapIntentNodeId],
  };
  return deepFreezeV1(material);
}

export function evaluateDev04Stage4CapabilityGapV2(
  value: unknown,
  source?: Dev04Stage4SourceV2,
): Readonly<Dev04Stage4EvaluationV2> {
  const artifact = record(value);
  if (!Object.keys(artifact).length) return stage4('UNVERIFIABLE', ['DEV04_STAGE4_ARTIFACT_MISSING']);
  const diagnostics: string[] = [];
  const expected = source
    ? compileDev04CapabilityGapV2(source)
    : compileCanonicalDev04CapabilityGapV2();
  for (const field of ['taskId', 'compileDisposition', 'executionEligibility', 'sourceEditorialIntentHash',
    'sourceEvidenceBoundIntentHash', 'evidencePackHash', 'operatorCatalogVersion', 'projectId', 'expectedProjectRevision']) {
    if (artifact[field] !== expected[field]) diagnostics.push(`DEV04_STAGE4_${field.toUpperCase()}_DRIFT`);
  }
  const nodes = records(artifact.nodes);
  if (!nodes.length) diagnostics.push('DEV04_STAGE4_READ_SET_EMPTY');
  if (hashCanonicalJsonV1(nodes) !== hashCanonicalJsonV1(expected.nodes)) diagnostics.push('DEV04_STAGE4_READ_SET_DRIFT');
  if (hashCanonicalJsonV1(artifact.edges) !== hashCanonicalJsonV1(expected.edges)) diagnostics.push('DEV04_STAGE4_EDGE_SET_DRIFT');
  if (hashCanonicalJsonV1(artifact.proofPolicy) !== hashCanonicalJsonV1(expected.proofPolicy)) diagnostics.push('DEV04_STAGE4_PROOF_POLICY_DRIFT');
  for (const node of nodes) {
    const operatorId = text(node.operatorId);
    if (!['read_project_file', 'get_timeline_view'].includes(operatorId)) diagnostics.push(`DEV04_STAGE4_FORBIDDEN_OPERATOR:${operatorId}`);
    if (strings(node.writes).length || strings(node.invalidates).length || strings(node.stateEffects).length) {
      diagnostics.push(`DEV04_STAGE4_STATE_EFFECT:${text(node.nodeId)}`);
    }
    if (record(node.concurrency).class !== 'READ_SHARED'
      || record(node.reversibility).disposition !== 'NOT_APPLICABLE_READ_ONLY') {
      diagnostics.push(`DEV04_STAGE4_READ_CONTRACT_DRIFT:${text(node.nodeId)}`);
    }
  }
  if (hashCanonicalJsonV1(artifact.diagnostics) !== hashCanonicalJsonV1(expected.diagnostics)) {
    diagnostics.push('DEV04_STAGE4_CAPABILITY_DIAGNOSTIC_DRIFT');
  }
  if (!sameSet(strings(artifact.unresolvedIntentNodeIds), strings(expected.unresolvedIntentNodeIds))) {
    diagnostics.push('DEV04_STAGE4_UNRESOLVED_SET_DRIFT');
  }
  return diagnostics.length ? stage4('FAIL', diagnostics) : stage4('CAPABILITY_BLOCKED', []);
}

function readNode(input: {
  nodeId: string; operatorId: 'read_project_file' | 'get_timeline_view'; inputs: JsonRecord;
  reads: string[]; requires: string[]; projectId: string; expectedProjectRevision: string;
  inspectionIntentNodeId: string; revisionFactId: string; timebaseFactId: string;
  targetRangeFactId: string; sourceFactId: string; proofIds: readonly string[];
  policyFactIds: readonly string[]; traceBindingIds: readonly string[];
  tracePreservationIds: readonly string[];
}): JsonRecord {
  const operator = operators.get(input.operatorId);
  if (!operator || operator.kind !== 'READ' || operator.compilerEligibility !== 'RESEARCH_READ_ONLY') {
    throw new Error(`DEV04_READ_OWNER_UNAVAILABLE:${input.operatorId}`);
  }
  return {
    nodeId: input.nodeId,
    intentNodeId: input.inspectionIntentNodeId,
    operatorId: input.operatorId,
    operatorSpecRef: `EDITRON_OPERATOR_SPECS_V2@${operatorCatalog.version}#${input.operatorId}`,
    ownerRef: text(operator.ownerRef),
    inputs: input.inputs,
    reads: input.reads,
    writes: [],
    requires: input.requires,
    produces: strings(record(operator.output).required).map((name) => `${input.nodeId}.${name}`),
    invalidates: [],
    coordinateBindings: [{ coordinateDomain: 'PROJECT_TICK', timebaseFactIds: [input.timebaseFactId], rangeFactIds: [input.targetRangeFactId], assetFactIds: [input.sourceFactId] }],
    revisionBinding: { projectId: input.projectId, expectedProjectRevision: input.expectedProjectRevision },
    stabilityRequirement: 'RANGE_STABLE',
    stateEffects: [],
    idempotency: { scope: 'PROJECT_REVISION', keyMaterialRefs: unique([input.inspectionIntentNodeId, input.revisionFactId, ...input.reads]) },
    proofObligationIds: input.proofIds,
    failureDisposition: 'ABORT_GRAPH',
    retryDisposition: 'TRANSIENT_SAME_COMMAND',
    policyFactIds: input.policyFactIds,
    concurrency: { class: 'READ_SHARED', conflictDomainRefs: [] },
    resourcePolicyId: 'OE_STAGE4_READ_V1',
    reversibility: { disposition: 'NOT_APPLICABLE_READ_ONLY', undoBindingRefs: [] },
    traceRefs: [input.inspectionIntentNodeId, ...input.traceBindingIds, ...input.proofIds, ...input.tracePreservationIds],
  };
}

function buildCanonicalFixture(): Dev04FixtureV2 {
  const projectScope = () => ({
    coordinateDomain: 'PROJECT_TICK', timebaseId: 'oe-dev-04:timeline', timebaseVersion: 'V2_1F',
    rate: { numerator: '30', denominator: '1' }, start: '0', endExclusive: '240',
  });
  const referenceBlueprint: JsonRecord = {
    artifactType: 'ReferenceBlueprintV2', taskId: 'DEV-04',
    globalEditorialLanguage: [{
      dimension: 'COMPOSITION_FRAMING',
      observation: 'The moving foreground subject must occlude only title pixels it intersects while the rest remains visible.',
      applicability: 'project ticks 0-239', strength: 'HARD', certainty: 'OBSERVED', evidenceIds: ['EV-DEV04-V1'],
    }],
    recurringDesignGrammar: [],
    uniqueMoments: [{
      momentId: 'moment-changing-subject-overlap', scope: projectScope(),
      targetClaimIds: ['claim-selective-moving-occlusion', 'claim-title-visible-outside-overlap'],
      evidenceIds: ['EV-DEV04-V1'],
    }],
    targetClaims: [
      targetClaim('claim-selective-moving-occlusion', 'SELECTIVE_MOVING_SUBJECT_OCCLUSION',
        ['moving-subject', 'title'], 'MOVES_RELATIVE_TO',
        'the changing foreground contour covers only intersecting title pixels', 'per-frame composite',
        'subject edges and identity remain credible throughout the crossing', 'USER_EXPLICIT',
        'RENDERED_OCCLUSION_GEOMETRY', projectScope()),
      targetClaim('claim-title-visible-outside-overlap', 'TITLE_VISIBILITY_PRESERVATION',
        ['title', 'non-overlap-region'], 'PRESERVES',
        'title remains visible wherever the subject does not overlap it', 'per-frame composite',
        'no permanent or rectangular title hiding', 'USER_EXPLICIT',
        'RENDERED_VISIBILITY_PRESERVATION', projectScope()),
      targetClaim('claim-source-and-timing-preserved', 'SOURCE_AND_TIMING_PRESERVATION',
        ['dev04-crossing', 'project-timeline'], 'PRESERVES',
        'source pixels, background, shot timing and duration remain unchanged', 'project state',
        'no source replacement, flattening, retime or duration change', 'BRIEF_DERIVED',
        'STATE_RELOAD', projectScope()),
    ],
    temporalStructure: [{
      phaseId: 'phase-subject-crossing', label: 'changing subject crossing', phaseRole: 'STEADY', scope: projectScope(),
      description: 'The subject contour changes continuously while crossing the title zone.', evidenceIds: ['EV-DEV04-V1'],
    }],
    uncertainties: [{
      uncertaintyId: 'uncertainty-pixel-contour',
      statement: 'The observation establishes a changing contour but supplies no verified per-frame matte.',
      impact: 'A static box, layer reorder or ordinary keyframes cannot be treated as equivalent.',
      affectedClaimIds: ['claim-selective-moving-occlusion', 'claim-title-visible-outside-overlap'],
      disposition: 'REQUIRES_ADDITIONAL_EVIDENCE', evidenceIds: ['EV-DEV04-V1'],
    }],
    evidenceIds: ['EV-DEV04-V1'],
  };
  const editorialIntent: JsonRecord = {
    artifactType: 'EditorialIntentGraphV2', taskId: 'DEV-04', executionForm: 'CAPABILITY_GAP',
    routeDecision: {
      scopeClassification: 'CAPABILITY_GAP', coverageStatus: 'INCOMPLETE',
      candidateForms: [{
        form: 'NATIVE', hardGateStatus: 'INELIGIBLE',
        claimCoverage: [
          { claimId: 'claim-selective-moving-occlusion', status: 'UNCOVERED', ownerRefs: [], reasonCodes: ['MOVING_MATTE_OR_SEGMENTATION_TRACK_MISSING'] },
          { claimId: 'claim-title-visible-outside-overlap', status: 'UNCOVERED', ownerRefs: [], reasonCodes: ['STATIC_LAYER_ORDER_CANNOT_EXPRESS_SELECTIVE_OCCLUSION'] },
          { claimId: 'claim-source-and-timing-preserved', status: 'COVERED', ownerRefs: ['read_project_file', 'get_timeline_view'], reasonCodes: ['READ_ONLY_INSPECTION_CAN_CONFIRM_CURRENT_STATE'] },
        ],
        representabilitySignals: ['PER_FRAME_PROCEDURE'], blockers: ['MOVING_MATTE_OR_SEGMENTATION_TRACK_NOT_IMPLEMENTED'],
        ownerRefs: ['read_project_file', 'get_timeline_view'], evidenceIds: ['EV-DEV04-V1'],
      }],
      selectedReasonCodes: ['NO_CERTIFIED_FORM_CAN_PRESERVE_SELECTIVE_DYNAMIC_OCCLUSION'],
      generatedIslandClaimIds: [], nativeSurroundClaimIds: ['claim-source-and-timing-preserved'],
    },
    nodes: [
      { intentNodeId: 'node-current-scene-inspection', operationFamily: 'read_current_scene_and_timeline', targetClaimIds: ['claim-source-and-timing-preserved'], candidateCapabilityIds: ['read_project_file', 'get_timeline_view'], executionForm: 'NATIVE', requiresNodeIds: [], invalidates: [], evidenceIds: ['EV-DEV04-V1'], failureDisposition: 'ASK_USER' },
      { intentNodeId: 'node-selective-occlusion', operationFamily: 'selective_moving_subject_occlusion', targetClaimIds: ['claim-selective-moving-occlusion', 'claim-title-visible-outside-overlap'], candidateCapabilityIds: [], executionForm: 'NATIVE', requiresNodeIds: ['node-current-scene-inspection'], invalidates: ['RENDERED_OCCLUSION_PROOF'], evidenceIds: ['EV-DEV04-V1'], failureDisposition: 'CAPABILITY_GAP' },
    ],
    edges: [{ edgeId: 'edge-inspection-occlusion', fromNodeId: 'node-current-scene-inspection', toNodeId: 'node-selective-occlusion', edgeType: 'DATA' }],
    preservationIntents: [
      { preservationId: 'preserve-source-pixels', claimId: 'claim-source-and-timing-preserved', rule: 'Do not flatten, replace or alter source pixels.', scopeRef: 'asset:dev04-crossing', proofKind: 'ASSET_AND_STATE' },
      { preservationId: 'preserve-title-outside-overlap', claimId: 'claim-title-visible-outside-overlap', rule: 'Do not hide the title where the subject is absent.', scopeRef: 'project:oe-dev-04/range:0-240', proofKind: 'RENDERED_GEOMETRY' },
      { preservationId: 'preserve-shot-timing', claimId: 'claim-source-and-timing-preserved', rule: 'Do not change shot timing or duration.', scopeRef: 'project:oe-dev-04@R2', proofKind: 'STATE_RELOAD' },
    ],
    unresolvedRequirements: [{ requirementId: 'req-moving-matte-or-segmentation-track', kind: 'CAPABILITY', detail: 'Selective per-frame subject occlusion requires an unavailable moving matte or segmentation track.', targetClaimIds: ['claim-selective-moving-occlusion', 'claim-title-visible-outside-overlap'], disposition: 'CAPABILITY_GAP' }],
  };
  const evidenceBoundIntent: JsonRecord = {
    artifactType: 'EvidenceBoundIntentGraphV2', taskId: 'DEV-04', stageDisposition: 'CAPABILITY_GAP',
    nodes: [
      { intentNodeId: 'node-current-scene-inspection', candidateCapabilityIds: ['read_project_file', 'get_timeline_view'], evidenceBindingIds: ['bind-project-and-source'], preservationIds: ['preserve-source-pixels', 'preserve-shot-timing'], proofObligationIds: ['proof-revision-freshness', 'proof-asset-rights', 'proof-state-unchanged'], bindingStatus: 'BOUND', unresolvedRequirementIds: [] },
      { intentNodeId: 'node-selective-occlusion', candidateCapabilityIds: [], evidenceBindingIds: ['bind-selective-occlusion-gap'], preservationIds: ['preserve-title-outside-overlap', 'preserve-source-pixels'], proofObligationIds: ['proof-selective-occlusion', 'proof-state-unchanged'], bindingStatus: 'BOUND', unresolvedRequirementIds: ['req-moving-matte-or-segmentation-track'] },
    ],
    evidenceBindings: [
      { bindingId: 'bind-project-and-source', factIds: ['fact-project-revision', 'fact-project-timebase', 'fact-project-target-range', 'fact-source-dev04-crossing', 'fact-rights-policy'], nodeIds: ['node-current-scene-inspection'], status: 'BOUND' },
      { bindingId: 'bind-selective-occlusion-gap', factIds: ['fact-visual-selective-occlusion', 'fact-support-moving-matte', 'fact-project-canvas', 'fact-project-target-range'], nodeIds: ['node-selective-occlusion'], status: 'BOUND' },
    ],
    rightsDecision: { decisionId: 'rights-dev04-owned-source-only', status: 'COMPLIANT', policyFactIds: ['fact-rights-policy', 'fact-source-dev04-crossing'], allowedAssetIds: ['dev04-crossing'], deniedActions: ['SOURCE_REPLACEMENT', 'REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'], reasonCodes: ['OWNED_FIXTURE_SOURCE_ONLY', 'NO_UNDECLARED_ASSET_USE'] },
    privacyDecision: { decisionId: 'privacy-dev04-no-egress', status: 'COMPLIANT', policyFactIds: ['fact-privacy-egress-policy'], egressDisposition: 'DENIED', reasonCodes: ['NO_NETWORK_EGRESS_PLANNED', 'NO_REMOTE_TOOL_CALL_PLANNED'] },
    revisionBinding: { projectId: 'oe-dev-04', expectedProjectRevision: 'R2', timebaseFactId: 'fact-project-timebase', status: 'BOUND' },
    preservationBindings: [
      { preservationId: 'preserve-source-pixels', factIds: ['fact-source-dev04-crossing', 'fact-rights-policy'], status: 'BOUND' },
      { preservationId: 'preserve-title-outside-overlap', factIds: ['fact-project-target-range', 'fact-visual-selective-occlusion'], status: 'BOUND' },
      { preservationId: 'preserve-shot-timing', factIds: ['fact-project-revision', 'fact-project-timebase'], status: 'BOUND' },
    ],
    proofPlan: [
      proof('proof-revision-freshness', 'REVISION_FRESHNESS', ['node-current-scene-inspection'], ['claim-source-and-timing-preserved'], ['fact-project-revision']),
      proof('proof-asset-rights', 'ASSET_IDENTITY_RIGHTS', ['node-current-scene-inspection'], ['claim-source-and-timing-preserved'], ['fact-source-dev04-crossing', 'fact-rights-policy']),
      proof('proof-selective-occlusion', 'RENDERED_GEOMETRY', ['node-selective-occlusion'], ['claim-selective-moving-occlusion', 'claim-title-visible-outside-overlap'], ['fact-project-canvas', 'fact-project-target-range', 'fact-visual-selective-occlusion']),
      proof('proof-state-unchanged', 'STATE_RELOAD', ['node-current-scene-inspection', 'node-selective-occlusion'], ['claim-source-and-timing-preserved', 'claim-title-visible-outside-overlap'], ['fact-project-revision', 'fact-source-dev04-crossing']),
    ],
    unresolvedRequirements: [{ requirementId: 'req-moving-matte-or-segmentation-track', kind: 'CAPABILITY', factIds: ['fact-support-moving-matte'], disposition: 'CAPABILITY_GAP' }],
  };
  return {
    fixtureVersion: 'EDITRON_OE_DEV04_CONNECTED_CHAIN_CANONICAL_V2',
    referenceBlueprint, editorialIntent,
    evidencePacks: { BASELINE: dev04EvidencePack('BASELINE', false), 'NOISY-VISUAL-EVIDENCE': dev04EvidencePack('NOISY-VISUAL-EVIDENCE', true) },
    evidenceBoundIntent,
  };
}

function targetClaim(claimId: string, claimKind: string, subjects: string[], relation: string, value: string, unit: string, tolerance: string, provenance: string, proofKind: string, scope: JsonRecord): JsonRecord {
  return { claimId, claimKind, scope, subjects, relation, desired: { valueType: 'observable-result', value, unit, comparisonBasis: 'explicit request and supplied evidence' }, tolerance: { kind: 'EDITORIAL_JUDGMENT', value: tolerance, unit: 'render or state inspection' }, criticality: 'HARD', provenance, evidenceIds: ['EV-DEV04-V1'], ambiguity: 'RESOLVED', proofKind };
}

function proof(proofObligationId: string, kind: string, nodeIds: string[], targetClaimIds: string[], requiredFactIds: string[]): JsonRecord {
  return { proofObligationId, kind, nodeIds, targetClaimIds, requiredFactIds, status: 'PLANNED' };
}

function dev04EvidencePack(conditionId: string, noisy: boolean): JsonRecord {
  return {
    evidencePackVersion: 'EDITRON_OE_DEV04_STAGE3_EVIDENCE_PACK_V2',
    authority: 'SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION', taskId: 'DEV-04', conditionId,
    visibleEvidenceIds: ['EV-DEV04-V1'],
    facts: [
      { factId: 'fact-project-revision', kind: 'PROJECT_REVISION', projectId: 'oe-dev-04', expectedProjectRevision: 'R2' },
      { factId: 'fact-project-timebase', kind: 'PROJECT_TIMEBASE', timebaseId: 'oe-dev-04:timeline', timebaseVersion: 'V2_1F', coordinateDomain: 'PROJECT_TICK', rate: { numerator: '30', denominator: '1' } },
      { factId: 'fact-project-target-range', kind: 'AUTHORIZED_TARGET_RANGE', coordinateDomain: 'PROJECT_TICK', timebaseId: 'oe-dev-04:timeline', start: '0', endExclusive: '240' },
      { factId: 'fact-project-canvas', kind: 'CANVAS', width: '1920', height: '1080', pixelAspectRatio: { numerator: '1', denominator: '1' } },
      { factId: 'fact-source-dev04-crossing', kind: 'SOURCE_MEDIA_IDENTITY', assetId: 'dev04-crossing', assetVersion: 'sha256:6bbcb3256143b02a968cf4795e3552f0869ea142ff98e6c9d15cbd9c0002ef6b', rightsStatus: 'INTERNAL_OWNED_FIXTURE', coordinateDomain: 'SOURCE_FRAME', timebase: { timebaseId: 'dev04-crossing:source', timebaseVersion: 'V2_1F', rate: { numerator: '30', denominator: '1' } }, extent: { start: '0', endExclusive: '240' } },
      { factId: 'fact-visual-selective-occlusion', kind: 'VISUAL_OCCLUSION_OBSERVATION', evidenceId: 'EV-DEV04-V1', movingSubject: true, changingContour: noisy ? 'UNKNOWN' : true, staticBoxSufficient: noisy ? 'UNKNOWN' : false, segmentationTrackAvailable: noisy ? 'UNKNOWN' : false, confidence: noisy ? 0.42 : 1 },
      { factId: 'fact-support-moving-matte', kind: 'CAPABILITY_SUPPORT', capabilityId: missingCapabilityId, supportStatus: 'MISSING', compilerEligibility: 'NOT_COMPILABLE' },
      { factId: 'fact-rights-policy', kind: 'RIGHTS_POLICY', policyId: 'KS-018_ONLY', allowedAssetIds: ['dev04-crossing'], deniedActions: ['SOURCE_REPLACEMENT', 'REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'] },
      { factId: 'fact-privacy-egress-policy', kind: 'PRIVACY_EGRESS_POLICY', policyId: 'SYNTHETIC_ONLY_NO_EGRESS', networkPolicy: 'DENY', deniedActions: ['NETWORK_EGRESS', 'REMOTE_TOOL_CALL', 'PERSIST_RAW_PROVIDER_RESPONSE'] },
    ],
    preservationRequirements: [
      { preservationId: 'preserve-source-pixels', requiredFactIds: ['fact-source-dev04-crossing', 'fact-rights-policy'] },
      { preservationId: 'preserve-title-outside-overlap', requiredFactIds: ['fact-project-target-range', 'fact-visual-selective-occlusion'] },
      { preservationId: 'preserve-shot-timing', requiredFactIds: ['fact-project-revision', 'fact-project-timebase'] },
    ],
    proofRequirements: [
      { proofObligationId: 'proof-revision-freshness', kind: 'REVISION_FRESHNESS', requiredFactIds: ['fact-project-revision'] },
      { proofObligationId: 'proof-asset-rights', kind: 'ASSET_IDENTITY_RIGHTS', requiredFactIds: ['fact-source-dev04-crossing', 'fact-rights-policy'] },
      { proofObligationId: 'proof-selective-occlusion', kind: 'RENDERED_GEOMETRY', requiredFactIds: ['fact-project-canvas', 'fact-project-target-range', 'fact-visual-selective-occlusion'] },
      { proofObligationId: 'proof-state-unchanged', kind: 'STATE_RELOAD', requiredFactIds: ['fact-project-revision', 'fact-source-dev04-crossing'] },
    ],
  };
}

function stage123(disposition: Dev04Stage123EvaluationV2['disposition'], diagnostics: string[]): Readonly<Dev04Stage123EvaluationV2> {
  const failed = disposition === 'FAIL';
  return deepFreezeV1({ disposition, targetReconstruction: failed ? 'FAIL' : 'PASS', capabilityHonesty: failed ? 'FAIL' : 'PASS', evidenceSufficiency: disposition === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : failed ? 'FAIL' : 'PASS', preservation: failed ? 'FAIL' : 'PASS', diagnostics: unique(diagnostics).sort(compareUtf16) });
}
function stage4(disposition: Dev04Stage4EvaluationV2['disposition'], diagnostics: string[]): Readonly<Dev04Stage4EvaluationV2> { return deepFreezeV1({ disposition, diagnostics: unique(diagnostics).sort(compareUtf16) }); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && left.every((value) => right.includes(value)); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
