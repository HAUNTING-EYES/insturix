import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  executeDev01TruthCutV2,
  getCanonicalDev01NativeProxyFixtureV2,
  mapDev01SourceTimelineFrameV2,
  mapDev01SourceTimelineRangeV2,
} from './dev01-native-proxy-fixture-v2';
import { getCanonicalDev01Stage123V2 } from './dev01-stage123-canonical-v2';
import {
  isDev01CompilerMaterializationTraceV1,
  resolveDev01CompilerMaterializationTraceV1,
  resolveDev01Stage4RoleSymbolsV2,
} from './dev01-stage4-role-resolver-v2';

type JsonRecord = Record<string, unknown>;
type DimensionV2 = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface Dev01Stage4EvaluationV2 {
  assessment: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  sourceChain: DimensionV2;
  operatorResolution: DimensionV2;
  inputBindings: DimensionV2;
  dependencyGraph: DimensionV2;
  nodeContract: DimensionV2;
  revisionAndPolicy: DimensionV2;
  proofAndPreservation: DimensionV2;
  capabilityHonesty: DimensionV2;
  diagnostics: readonly string[];
}

export interface Dev01Stage4SourceV2 {
  referenceBlueprint?: unknown;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
}

const canonical = getCanonicalDev01Stage123V2();
const fixture = getCanonicalDev01NativeProxyFixtureV2();
const truthCut = executeDev01TruthCutV2();
const catalog = operatorCatalogJson as unknown as JsonRecord;
const operators = new Map(records(catalog.operators).map((operator) => [string(operator.operatorId), operator]));
const requiredNodeFields = [
  'nodeId', 'intentNodeId', 'operatorId', 'operatorSpecRef', 'ownerRef', 'inputs', 'reads', 'writes',
  'requires', 'produces', 'invalidates', 'coordinateBindings', 'revisionBinding', 'stabilityRequirement',
  'stateEffects', 'idempotency', 'proofObligationIds', 'failureDisposition', 'retryDisposition', 'policyFactIds',
  'concurrency', 'resourcePolicyId', 'reversibility', 'traceRefs',
];

export function evaluateDev01Stage4CompiledGraphV2(
  value: unknown,
  source?: Dev01Stage4SourceV2,
): Readonly<Dev01Stage4EvaluationV2> {
  if (!isRecord(value)) return emptyEvaluation();
  const artifact = value;
  const diagnostics: string[] = [];
  let context: EvaluationContextV2;
  try {
    context = buildEvaluationContext(source);
  } catch (error) {
    return sourceFailureEvaluation(error instanceof Error ? error.message : String(error));
  }
  validateSourceChain(artifact, diagnostics, source, context);
  const nodes = records(artifact.nodes);
  const nodeIds = new Set<string>();
  const outputProducer = new Map<string, string>();
  for (const node of nodes) {
    const nodeId = string(node.nodeId);
    if (!nodeId || nodeIds.has(nodeId)) diagnostics.push(`NODE_CONTRACT_NODE_ID_INVALID:${nodeId || 'empty'}`);
    nodeIds.add(nodeId);
    for (const output of strings(node.produces)) {
      if (outputProducer.has(output)) diagnostics.push(`NODE_CONTRACT_OUTPUT_DUPLICATE:${output}`);
      outputProducer.set(output, nodeId);
    }
  }
  for (const expectedNodeId of context.expectedNodes.keys()) if (!nodeIds.has(expectedNodeId)) diagnostics.push(`OPERATOR_RESOLUTION_NODE_MISSING:${expectedNodeId}`);
  for (const nodeId of nodeIds) if (!context.expectedNodes.has(nodeId)) diagnostics.push(`OPERATOR_RESOLUTION_NODE_UNEXPECTED:${nodeId}`);
  for (const node of nodes) validateNode(node, nodeIds, outputProducer, diagnostics, context);
  validateExactBindings(new Map(nodes.map((node) => [string(node.nodeId), node])), diagnostics);
  validateGraph(records(artifact.edges), nodeIds, outputProducer, nodes, diagnostics);
  validateProofPolicy(record(artifact.proofPolicy), diagnostics, context);
  validateCapabilityHonesty(artifact, nodes, diagnostics, context);

  const sourceChain = dimension(diagnostics, /^SOURCE_CHAIN_/);
  const operatorResolution = dimension(diagnostics, /^OPERATOR_RESOLUTION_/);
  const inputBindings = dimension(diagnostics, /^INPUT_BINDING_/);
  const dependencyGraph = dimension(diagnostics, /^DEPENDENCY_GRAPH_/);
  const nodeContract = dimension(diagnostics, /^NODE_CONTRACT_/);
  const revisionAndPolicy = dimension(diagnostics, /^REVISION_POLICY_/);
  const proofAndPreservation = dimension(diagnostics, /^PROOF_PRESERVATION_/);
  const capabilityHonesty = dimension(diagnostics, /^CAPABILITY_HONESTY_/);
  const dimensions = [sourceChain, operatorResolution, inputBindings, dependencyGraph, nodeContract, revisionAndPolicy, proofAndPreservation, capabilityHonesty];
  return deepFreezeV1({
    assessment: dimensions.includes('FAIL') ? 'FAIL' : 'PASS',
    sourceChain, operatorResolution, inputBindings, dependencyGraph, nodeContract,
    revisionAndPolicy, proofAndPreservation, capabilityHonesty,
    diagnostics: unique(diagnostics).sort(compareUtf16),
  });
}

function validateSourceChain(
  artifact: JsonRecord,
  diagnostics: string[],
  source?: Dev01Stage4SourceV2,
  context?: EvaluationContextV2,
): void {
  const expected: JsonRecord = {
    artifactType: 'CompiledOperationGraphV2', taskId: 'DEV-01',
    sourceEditorialIntentHash: hashCanonicalJsonV1(source?.editorialIntent ?? canonical.editorialIntent),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(
      source?.evidenceBoundIntent ?? canonical.evidenceBoundIntents.BASELINE,
    ),
    evidencePackHash: hashCanonicalJsonV1(source?.evidencePack ?? canonical.evidencePacks.BASELINE),
    operatorCatalogVersion: catalog.version, projectId: context?.projectId,
    expectedProjectRevision: context?.initialRevision,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (artifact[field] !== expectedValue) diagnostics.push(`SOURCE_CHAIN_${field.toUpperCase()}_DRIFT`);
  }
}

function validateNode(
  node: JsonRecord, nodeIds: Set<string>, outputProducer: Map<string, string>, diagnostics: string[],
  context: EvaluationContextV2,
): void {
  const nodeId = string(node.nodeId);
  const expected = context.expectedNodes.get(nodeId);
  if (!expected) return;
  const [expectedIntentId, expectedOperatorId] = expected;
  if (node.intentNodeId !== expectedIntentId || node.operatorId !== expectedOperatorId) diagnostics.push(`OPERATOR_RESOLUTION_NODE_BINDING_DRIFT:${nodeId}`);
  const operator = operators.get(string(node.operatorId));
  if (!operator) {
    diagnostics.push(`OPERATOR_RESOLUTION_UNKNOWN_OPERATOR:${nodeId}`);
    return;
  }
  const intent = context.intentNodes.get(string(node.intentNodeId));
  validateCompilerMaterialization(node, intent, diagnostics);
  if (!['RESEARCH_READ_ONLY', 'ISOLATED_PROXY_ONLY'].includes(string(operator.compilerEligibility))) diagnostics.push(`OPERATOR_RESOLUTION_FORBIDDEN:${nodeId}`);
  if (node.operatorSpecRef !== `EDITRON_OPERATOR_SPECS_V2@${catalog.version}#${node.operatorId}` || node.ownerRef !== operator.ownerRef) diagnostics.push(`OPERATOR_RESOLUTION_OWNER_OR_SPEC_DRIFT:${nodeId}`);
  for (const field of requiredNodeFields) if (!(field in node)) diagnostics.push(`NODE_CONTRACT_FIELD_MISSING:${nodeId}/${field}`);
  validateInputs(node, operator, diagnostics, context);
  for (const factId of strings(node.reads)) if (!context.factIds.has(factId)) diagnostics.push(`NODE_CONTRACT_UNKNOWN_READ:${nodeId}/${factId}`);
  for (const requirement of strings(node.requires)) if (!outputProducer.has(requirement) && !nodeIds.has(requirement) && !context.factIds.has(requirement)) diagnostics.push(`NODE_CONTRACT_UNKNOWN_REQUIREMENT:${nodeId}/${requirement}`);
  const expectedOutputs = nodeId === 'compile-cut'
    ? fixture.operatorContractAmendments.cutSection.requiredFields.map((field) => `${nodeId}.${field}`)
    : strings(record(operator.output).required).map((field) => `${nodeId}.${field}`);
  if (!sameSet(strings(node.produces), expectedOutputs)) diagnostics.push(`NODE_CONTRACT_OUTPUT_DRIFT:${nodeId}`);
  for (const binding of records(node.coordinateBindings)) {
    if (!['SOURCE_FRAME', 'SOURCE_SAMPLE', 'PROJECT_TICK'].includes(string(binding.coordinateDomain))) diagnostics.push(`NODE_CONTRACT_COORDINATE_DOMAIN_INVALID:${nodeId}`);
    for (const factId of [...strings(binding.timebaseFactIds), ...strings(binding.rangeFactIds), ...strings(binding.assetFactIds)]) if (!context.factIds.has(factId)) diagnostics.push(`NODE_CONTRACT_COORDINATE_FACT_UNKNOWN:${nodeId}/${factId}`);
  }
  const expectedRevision = context.expectedRevisions.get(nodeId);
  const revision = record(node.revisionBinding);
  if (revision.projectId !== context.projectId || revision.expectedProjectRevision !== expectedRevision) diagnostics.push(`REVISION_POLICY_NODE_REVISION_DRIFT:${nodeId}`);
  const inputs = record(node.inputs);
  if ('expectedProjectRevision' in inputs && inputs.expectedProjectRevision !== expectedRevision) diagnostics.push(`REVISION_POLICY_INPUT_REVISION_DRIFT:${nodeId}`);
  if (!sameSet(strings(node.policyFactIds), [...context.policyFactIds])) diagnostics.push(`REVISION_POLICY_FACT_SET_DRIFT:${nodeId}`);
  const kind = string(operator.kind);
  const mutating = kind === 'MUTATION';
  const writes = strings(node.writes);
  const invalidates = strings(node.invalidates);
  const concurrency = record(node.concurrency);
  const reversibility = record(node.reversibility);
  if (mutating) {
    if (!writes.length || !invalidates.length) diagnostics.push(`NODE_CONTRACT_MUTATION_EFFECTS_MISSING:${nodeId}`);
    if (concurrency.class !== 'MUTATION_EXCLUSIVE' || !sameSet(strings(concurrency.conflictDomainRefs), writes)) diagnostics.push(`REVISION_POLICY_MUTATION_CONCURRENCY_DRIFT:${nodeId}`);
    if (node.resourcePolicyId !== 'OE_STAGE4_MUTATION_PROXY_V1' || node.retryDisposition !== 'REBASE_REQUIRED') diagnostics.push(`REVISION_POLICY_MUTATION_RESOURCE_OR_RETRY_DRIFT:${nodeId}`);
    if (reversibility.disposition !== 'CHECKPOINT_REQUIRED' || !strings(reversibility.undoBindingRefs).length) diagnostics.push(`REVISION_POLICY_MUTATION_UNDO_MISSING:${nodeId}`);
  } else {
    if (writes.length || invalidates.length) diagnostics.push(`NODE_CONTRACT_READ_RESOLVER_EFFECTS_PRESENT:${nodeId}`);
    const expectedClass = kind === 'READ' ? 'READ_SHARED' : 'RESOLVER_ISOLATED';
    const expectedResource = kind === 'READ' ? 'OE_STAGE4_READ_V1' : 'OE_STAGE4_RESOLVER_V1';
    if (concurrency.class !== expectedClass || node.resourcePolicyId !== expectedResource) diagnostics.push(`REVISION_POLICY_READ_RESOLVER_CLASS_DRIFT:${nodeId}`);
    if (reversibility.disposition !== 'NOT_APPLICABLE_READ_ONLY') diagnostics.push(`REVISION_POLICY_READ_RESOLVER_UNDO_DRIFT:${nodeId}`);
  }
  const bound = context.boundNodes.get(string(node.intentNodeId));
  for (const proofId of strings(node.proofObligationIds)) if (!strings(bound?.proofObligationIds).includes(proofId)) diagnostics.push(`PROOF_PRESERVATION_NODE_PROOF_UNBOUND:${nodeId}/${proofId}`);
}

function validateCompilerMaterialization(
  node: JsonRecord,
  intent: JsonRecord | undefined,
  diagnostics: string[],
): void {
  const nodeId = string(node.nodeId);
  const materializationTraces = strings(node.traceRefs)
    .filter(isDev01CompilerMaterializationTraceV1);
  if (!intent) {
    diagnostics.push(`OPERATOR_RESOLUTION_SOURCE_INTENT_MISSING:${nodeId}`);
    return;
  }
  try {
    const expectedTrace = resolveDev01CompilerMaterializationTraceV1({
      nodeId,
      sourceIntentNodeId: string(node.intentNodeId),
      operatorId: string(node.operatorId),
      candidateCapabilityIds: strings(intent.candidateCapabilityIds),
    });
    if (expectedTrace == null) {
      if (materializationTraces.length) {
        diagnostics.push(`OPERATOR_RESOLUTION_COMPILER_MATERIALIZATION_TRACE_INVALID:${nodeId}`);
      }
      return;
    }
    if (materializationTraces.length !== 1 || materializationTraces[0] !== expectedTrace) {
      diagnostics.push(`OPERATOR_RESOLUTION_COMPILER_MATERIALIZATION_TRACE_INVALID:${nodeId}`);
    }
  } catch {
    diagnostics.push(`OPERATOR_RESOLUTION_COMPILER_MATERIALIZATION_UNAUTHORIZED:${nodeId}`);
  }
}

function validateInputs(
  node: JsonRecord, operator: JsonRecord, diagnostics: string[], context: EvaluationContextV2,
): void {
  const nodeId = string(node.nodeId);
  const input = record(node.inputs);
  const contract = record(operator.input);
  const fields = strings(contract.fields);
  for (const field of Object.keys(input)) if (!fields.includes(field)) diagnostics.push(`INPUT_BINDING_UNDECLARED_FIELD:${nodeId}/${field}`);
  for (const field of strings(contract.required)) if (!(field in input)) diagnostics.push(`INPUT_BINDING_REQUIRED_FIELD_MISSING:${nodeId}/${field}`);
  if ('projectId' in input && input.projectId !== context.projectId) diagnostics.push(`INPUT_BINDING_PROJECT_DRIFT:${nodeId}`);
  for (const evidenceId of strings(input.evidenceIds)) if (!context.evidenceIds.has(evidenceId)) diagnostics.push(`INPUT_BINDING_EVIDENCE_UNKNOWN:${nodeId}/${evidenceId}`);
  const allowedAssets = new Set(Object.values(fixture.assets));
  for (const assetId of strings(input.assetIds)) if (!allowedAssets.has(assetId as never)) diagnostics.push(`INPUT_BINDING_ASSET_UNKNOWN:${nodeId}/${assetId}`);
  const range = record(input.targetRange);
  if ('targetRange' in input && (!Number.isSafeInteger(range.startFrame) || !Number.isSafeInteger(range.endFrame) || Number(range.endFrame) <= Number(range.startFrame))) diagnostics.push(`INPUT_BINDING_RANGE_INVALID:${nodeId}`);
}

function validateExactBindings(nodes: Map<string, JsonRecord>, diagnostics: string[]): void {
  const input = (nodeId: string) => record(nodes.get(nodeId)?.inputs);
  if (!same(input('compile-cut').targetRange, fixture.expected.cutRange)) diagnostics.push('INPUT_BINDING_CUT_RANGE_DRIFT');
  const cutConstraints = record(input('compile-cut').constraints);
  if (cutConstraints.preserveAllSpeech !== true || cutConstraints.requireTimelineCoordinateTransform !== true || cutConstraints.requireSplitChildren !== true) diagnostics.push('INPUT_BINDING_CUT_CONSTRAINTS_MISSING');
  const sourceFrame = fixture.evidence.visual.sourceFrame;
  const mappedFrame = mapDev01SourceTimelineFrameV2(sourceFrame);
  const hostRight = truthCut.splitChildren.find(({ beforeOverlayId }) => beforeOverlayId === 101);
  if (mappedFrame == null || !hostRight) {
    diagnostics.push('INPUT_BINDING_TRUTH_MAPPING_UNAVAILABLE');
    return;
  }
  const expectedOverlayRef = '@compile-cut.splitChildren[beforeOverlayId=101].rightOverlayId';
  const resolveProduct = input('compile-resolve-product');
  const productIntent = record(resolveProduct.intent);
  const productConstraints = record(resolveProduct.constraints);
  if (resolveProduct.overlayId !== expectedOverlayRef || productConstraints.expectedResolvedOverlayId !== String(hostRight.rightOverlayId)) diagnostics.push('INPUT_BINDING_POSTCUT_OVERLAY_DRIFT');
  if (productIntent.sourceFrame !== sourceFrame || productIntent.outputTimelineFrame !== mappedFrame || productIntent.rightChildLocalFrame !== mappedFrame - hostRight.rightTimelineStartFrame) diagnostics.push('INPUT_BINDING_POSTCUT_FRAME_MAPPING_DRIFT');
  if (!same(productConstraints.normalizedFocalPoint, fixture.evidence.visual.normalizedFocalPoint) || !same(productConstraints.scaleBounds, fixture.expected.scaleBounds)) diagnostics.push('INPUT_BINDING_PRODUCT_CONSTRAINT_DRIFT');
  const push = input('compile-push');
  if (push.overlayId !== expectedOverlayRef || !same(push.keyframes, [{ fromOutputRef: 'compile-resolve-product.proposedOperation.keyframes' }])) diagnostics.push('INPUT_BINDING_KEYFRAME_OWNER_BYPASSED');
  const audioPlan = record(input('compile-duck').audioPlan);
  const mappedSpeech = fixture.evidence.transcript.speechSourceRanges.map(mapDev01SourceTimelineRangeV2);
  if (input('compile-duck').overlayId !== '103' || !same(audioPlan.outputSpeechRanges, mappedSpeech)) diagnostics.push('INPUT_BINDING_AUDIO_TARGET_OR_RANGE_DRIFT');
  if (audioPlan.storedState !== fixture.operatorContractAmendments.applyAudioDucking.storedState || audioPlan.rendererEffect !== fixture.operatorContractAmendments.applyAudioDucking.rendererEffect) diagnostics.push('NODE_CONTRACT_DUCKING_STATE_DRIFT');
  if (nodes.has('compile-resolve-audio') !== (audioPlan.fromOutputRef === 'compile-resolve-audio.proposedOperation')) diagnostics.push('INPUT_BINDING_AUDIO_RESOLVER_HANDOFF_DRIFT');
  if (Object.keys(audioPlan).some((field) => ['duckAmount', 'attackMs', 'releaseMs', 'threshold'].includes(field))) diagnostics.push('INPUT_BINDING_AUDIO_FORM_SHADOW_OWNER');
  if (!same(input('compile-proof-timeline').targetRange, { startFrame: 0, endFrame: truthCut.newDurationInFrames })) diagnostics.push('INPUT_BINDING_PROOF_RANGE_DRIFT');
}

function validateGraph(edges: JsonRecord[], nodeIds: Set<string>, outputProducer: Map<string, string>, nodes: JsonRecord[], diagnostics: string[]): void {
  const adjacency = new Map([...nodeIds].map((nodeId) => [nodeId, new Set<string>()]));
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    const edgeId = string(edge.edgeId); const from = string(edge.fromNodeId); const to = string(edge.toNodeId);
    if (!edgeId || edgeIds.has(edgeId)) diagnostics.push(`DEPENDENCY_GRAPH_EDGE_ID_INVALID:${edgeId || 'empty'}`);
    edgeIds.add(edgeId);
    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) diagnostics.push(`DEPENDENCY_GRAPH_ENDPOINT_INVALID:${edgeId}`);
    else adjacency.get(from)?.add(to);
  }
  if (hasCycle(adjacency)) diagnostics.push('DEPENDENCY_GRAPH_CYCLE');
  for (const node of nodes) for (const requirement of strings(node.requires)) {
    const producer = outputProducer.get(requirement) ?? (nodeIds.has(requirement) ? requirement : '');
    if (producer && !reachable(producer, string(node.nodeId), adjacency)) diagnostics.push(`DEPENDENCY_GRAPH_REQUIRED_PATH_MISSING:${producer}/${node.nodeId}`);
  }
  for (const [from, to, label] of [
    ['compile-cut', 'compile-find-product', 'CUT_BEFORE_PRODUCT_SEARCH'],
    ['compile-cut', 'compile-push', 'CUT_BEFORE_PUSH'],
    ['compile-cut', 'compile-find-audio', 'CUT_BEFORE_AUDIO_REMAP'],
    ['compile-push', 'compile-duck', 'REVISION_CHAIN_PUSH_BEFORE_DUCK'],
    ['compile-duck', 'compile-proof-timeline', 'MUTATIONS_BEFORE_PROOF'],
  ]) if (!reachable(from, to, adjacency)) diagnostics.push(`DEPENDENCY_GRAPH_${label}`);
}

function validateProofPolicy(policy: JsonRecord, diagnostics: string[], context: EvaluationContextV2): void {
  if (policy.mode !== 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION' || policy.onUnverifiable !== 'BLOCK_EXECUTION') diagnostics.push('PROOF_PRESERVATION_POLICY_MODE_DRIFT');
  if (!sameSet(strings(policy.proofObligationIds), [...context.proofIds])) diagnostics.push('PROOF_PRESERVATION_PROOF_SET_DRIFT');
  if (!sameSet(strings(policy.preservationIds), [...context.preservationIds])) diagnostics.push('PROOF_PRESERVATION_PRESERVATION_SET_DRIFT');
}

function validateCapabilityHonesty(
  artifact: JsonRecord, nodes: JsonRecord[], diagnostics: string[], context: EvaluationContextV2,
): void {
  if (artifact.compileDisposition !== 'COMPILED_RESEARCH_PROXY' || artifact.executionEligibility !== 'RESEARCH_PROXY_ONLY') diagnostics.push('CAPABILITY_HONESTY_FALSE_ELIGIBILITY');
  if (records(artifact.diagnostics).length || strings(artifact.unresolvedIntentNodeIds).length) diagnostics.push('CAPABILITY_HONESTY_UNEXPECTED_GAP');
  if (nodes.some((node) => node.operatorId === 'generated_composition_program')) diagnostics.push('CAPABILITY_HONESTY_GENERATED_SUBSTITUTION');
  const represented = new Set(nodes.map((node) => string(node.intentNodeId)));
  for (const intentNodeId of context.intentNodes.keys()) if (!represented.has(intentNodeId)) diagnostics.push(`CAPABILITY_HONESTY_INTENT_UNREPRESENTED:${intentNodeId}`);
}

interface EvaluationContextV2 {
  intentNodes: Map<string, JsonRecord>;
  boundNodes: Map<string, JsonRecord>;
  factIds: Set<string>;
  evidenceIds: Set<string>;
  proofIds: Set<string>;
  preservationIds: Set<string>;
  policyFactIds: Set<string>;
  expectedNodes: Map<string, readonly [string, string]>;
  expectedRevisions: Map<string, string>;
  projectId: string;
  initialRevision: string;
}

function buildEvaluationContext(source?: Dev01Stage4SourceV2): EvaluationContextV2 {
  const resolvedSource = {
    referenceBlueprint: source?.referenceBlueprint ?? canonical.referenceBlueprints.BASELINE,
    editorialIntent: source?.editorialIntent ?? canonical.editorialIntent,
    evidenceBoundIntent: source?.evidenceBoundIntent ?? canonical.evidenceBoundIntents.BASELINE,
    evidencePack: source?.evidencePack ?? canonical.evidencePacks.BASELINE,
  };
  const roles = resolveDev01Stage4RoleSymbolsV2(resolvedSource);
  const intent = record(resolvedSource.editorialIntent);
  const bound = record(resolvedSource.evidenceBoundIntent);
  const pack = record(resolvedSource.evidencePack);
  const facts = records(pack.facts);
  const revision = record(bound.revisionBinding);
  const projectId = string(revision.projectId);
  const initialRevision = string(revision.expectedProjectRevision);
  const expectedNodes = new Map<string, readonly [string, string]>([
    ['compile-read-project', [roles.readProjectIntentNodeId, 'read_project_file']],
    ['compile-read-timeline', [roles.readTimelineIntentNodeId, 'get_timeline_view']],
    ['compile-find-transcript', [roles.transcriptFinderIntentNodeId, 'find_transcript_moment']],
    ['compile-resolve-cut', [roles.transcriptResolverIntentNodeId, 'resolve_transcript_edit']],
    ['compile-cut', [roles.cutIntentNodeId, 'cut_section']],
    ['compile-find-product', [roles.visualFinderIntentNodeId, 'find_visual_moment']],
    ['compile-resolve-product', [roles.keyframeResolverIntentNodeId, 'resolve_keyframe_edit']],
    ['compile-push', [roles.pushIntentNodeId, 'set_keyframes']],
    ['compile-find-audio', [roles.audioFinderIntentNodeId, 'find_audio_moment']],
    ...(roles.audioResolverIntentNodeId
      ? [['compile-resolve-audio', [roles.audioResolverIntentNodeId, 'resolve_audio_edit']] as const]
      : []),
    ['compile-duck', [roles.duckIntentNodeId, 'apply_audio_ducking']],
    ['compile-proof-read', [roles.proofReadIntentNodeId, 'read_project_file']],
    ['compile-proof-timeline', [roles.proofTimelineIntentNodeId, 'get_timeline_view']],
  ]);
  const expectedRevisions = new Map<string, string>([
    ['compile-read-project', initialRevision], ['compile-read-timeline', initialRevision],
    ['compile-find-transcript', initialRevision], ['compile-resolve-cut', initialRevision],
    ['compile-cut', initialRevision],
    ['compile-find-product', '@compile-cut.receipt.revision'],
    ['compile-resolve-product', '@compile-cut.receipt.revision'],
    ['compile-push', '@compile-cut.receipt.revision'],
    ['compile-find-audio', '@compile-cut.receipt.revision'],
    ...(roles.audioResolverIntentNodeId
      ? [['compile-resolve-audio', '@compile-cut.receipt.revision'] as const]
      : []),
    ['compile-duck', '@compile-push.receipt.revision'],
    ['compile-proof-read', '@compile-duck.receipt.revision'],
    ['compile-proof-timeline', '@compile-duck.receipt.revision'],
  ]);
  return {
    intentNodes: new Map(records(intent.nodes).map((node) => [string(node.intentNodeId), node])),
    boundNodes: new Map(records(bound.nodes).map((node) => [string(node.intentNodeId), node])),
    factIds: new Set(facts.map((fact) => string(fact.factId))),
    evidenceIds: new Set(strings(pack.visibleEvidenceIds)),
    proofIds: new Set(records(bound.proofPlan).map((proof) => string(proof.proofObligationId))),
    preservationIds: new Set(records(bound.preservationBindings).map((entry) => string(entry.preservationId))),
    policyFactIds: new Set(facts.filter(({ kind }) => kind === 'RIGHTS_POLICY' || kind === 'PRIVACY_EGRESS_POLICY').map(({ factId }) => string(factId))),
    expectedNodes, expectedRevisions, projectId, initialRevision,
  };
}

function sourceFailureEvaluation(diagnostic: string): Readonly<Dev01Stage4EvaluationV2> {
  return deepFreezeV1({
    assessment: 'FAIL', sourceChain: 'FAIL', operatorResolution: 'UNVERIFIABLE',
    inputBindings: 'UNVERIFIABLE', dependencyGraph: 'UNVERIFIABLE', nodeContract: 'UNVERIFIABLE',
    revisionAndPolicy: 'UNVERIFIABLE', proofAndPreservation: 'UNVERIFIABLE',
    capabilityHonesty: 'UNVERIFIABLE', diagnostics: [`SOURCE_CHAIN_ROLE_RESOLUTION_FAILED:${diagnostic}`],
  });
}

function emptyEvaluation(): Readonly<Dev01Stage4EvaluationV2> {
  return deepFreezeV1({ assessment: 'UNVERIFIABLE', sourceChain: 'UNVERIFIABLE', operatorResolution: 'UNVERIFIABLE', inputBindings: 'UNVERIFIABLE', dependencyGraph: 'UNVERIFIABLE', nodeContract: 'UNVERIFIABLE', revisionAndPolicy: 'UNVERIFIABLE', proofAndPreservation: 'UNVERIFIABLE', capabilityHonesty: 'UNVERIFIABLE', diagnostics: ['NO_COMPILED_ARTIFACT'] });
}
function dimension(diagnostics: string[], prefix: RegExp): DimensionV2 { return diagnostics.some((diagnostic) => prefix.test(diagnostic)) ? 'FAIL' : 'PASS'; }
function hasCycle(adjacency: Map<string, Set<string>>): boolean { const active = new Set<string>(); const done = new Set<string>(); const visit = (node: string): boolean => { if (active.has(node)) return true; if (done.has(node)) return false; active.add(node); for (const next of adjacency.get(node) ?? []) if (visit(next)) return true; active.delete(node); done.add(node); return false; }; return [...adjacency.keys()].some(visit); }
function reachable(start: string, target: string, adjacency: Map<string, Set<string>>): boolean { const pending = [start]; const seen = new Set<string>(); while (pending.length) { const node = pending.pop() as string; if (node === target && node !== start) return true; if (seen.has(node)) continue; seen.add(node); pending.push(...(adjacency.get(node) ?? [])); } return false; }
function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && right.every((entry) => left.includes(entry)); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
