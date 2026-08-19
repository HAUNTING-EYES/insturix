import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { normalizeDev02Stage4SourceRelativeArtifactV2 } from './dev02-stage4-source-normalizer-v2';

type JsonRecord = Record<string, unknown>;
type DimensionV2 = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface Stage4CompilationEvaluationV2 {
  disposition: 'CAPABILITY_BLOCKED' | 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  sourceChain: DimensionV2;
  operatorResolution: DimensionV2;
  inputBindings: DimensionV2;
  dependencyGraph: DimensionV2;
  nodeContract: DimensionV2;
  policyAndRevision: DimensionV2;
  proofAndPreservation: DimensionV2;
  capabilityHonesty: DimensionV2;
  diagnostics: readonly string[];
}

export interface Stage4CompilationSourceV2 {
  referenceBlueprint?: unknown;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
}

const editorialIntent = canonicalEditorialIntentJson as unknown as JsonRecord;
const evidenceBoundIntent = canonicalEvidenceBoundIntentJson as unknown as JsonRecord;
const evidencePack = evidencePackJson as unknown as JsonRecord;
const operatorCatalog = operatorCatalogJson as unknown as JsonRecord;
const intentNodes = new Map(records(editorialIntent.nodes).map((node) => [String(node.intentNodeId), node]));
const boundNodes = new Map(records(evidenceBoundIntent.nodes).map((node) => [String(node.intentNodeId), node]));
const operators = new Map(records(operatorCatalog.operators).map((operator) => [String(operator.operatorId), operator]));
const facts = records(evidencePack.facts);
const factsById = new Map(facts.map((fact) => [String(fact.factId), fact]));
const factIds = new Set(factsById.keys());
const evidenceIds = new Set(strings(evidencePack.visibleEvidenceIds));
const evidenceBindingIds = new Set(records(evidenceBoundIntent.evidenceBindings).map((binding) => String(binding.bindingId)));
const proofIds = new Set(records(evidenceBoundIntent.proofPlan).map((proof) => String(proof.proofObligationId)));
const preservationIds = new Set(records(evidenceBoundIntent.preservationBindings).map((entry) => String(entry.preservationId)));
const policyFactIds = new Set(['fact-rights-policy', 'fact-privacy-egress-policy']);
const allowedAssetIds = new Set(strings(record(evidenceBoundIntent.rightsDecision).allowedAssetIds));
const knownOverlayIds = new Set(['ov-next']);

export function evaluateStage4CompiledGraphArtifactV2(
  value: unknown,
  source?: Stage4CompilationSourceV2,
): Readonly<Stage4CompilationEvaluationV2> {
  const receivedArtifact = record(value);
  if (!Object.keys(receivedArtifact).length) return emptyEvaluation();
  let artifact = receivedArtifact;
  if (source) {
    try {
      artifact = record(normalizeDev02Stage4SourceRelativeArtifactV2(receivedArtifact, source));
    } catch (error) {
      return sourceRelativeFailure(error);
    }
  }
  const diagnostics: string[] = [];
  validateSourceChain(artifact, diagnostics, source);

  const nodes = records(artifact.nodes);
  const nodeIds = new Set<string>();
  const compiledByIntent = new Map<string, JsonRecord[]>();
  const outputProducerByRef = new Map<string, string>();
  for (const node of nodes) {
    const nodeId = String(node.nodeId ?? '');
    if (!nodeId || nodeIds.has(nodeId)) diagnostics.push(`NODE_CONTRACT_NODE_ID_INVALID:${nodeId || 'empty'}`);
    nodeIds.add(nodeId);
    const intentNodeId = String(node.intentNodeId ?? '');
    const list = compiledByIntent.get(intentNodeId) ?? [];
    list.push(node);
    compiledByIntent.set(intentNodeId, list);
    for (const outputRef of strings(node.produces)) {
      if (outputProducerByRef.has(outputRef)) diagnostics.push(`NODE_CONTRACT_OUTPUT_REF_DUPLICATE:${outputRef}`);
      else outputProducerByRef.set(outputRef, nodeId);
    }
  }
  for (const node of nodes) validateCompiledNode(node, String(node.intentNodeId ?? ''), nodeIds, outputProducerByRef, diagnostics);
  if (!nodes.length) diagnostics.push('OPERATOR_RESOLUTION_NO_COMPILED_RESEARCH_NODE');
  validateOwnedSourceInspection(nodes, diagnostics);
  validateEdges(records(artifact.edges), nodes, nodeIds, outputProducerByRef, compiledByIntent, diagnostics);
  validateRootProofPolicy(record(artifact.proofPolicy), diagnostics);
  validateCapabilityDisposition(artifact, nodes, compiledByIntent, diagnostics);

  const sourceChain = dimension(diagnostics, /^SOURCE_CHAIN_/);
  const operatorResolution = dimension(diagnostics, /^OPERATOR_RESOLUTION_/);
  const inputBindings = dimension(diagnostics, /^INPUT_BINDING_/);
  const dependencyGraph = dimension(diagnostics, /^DEPENDENCY_GRAPH_/);
  const nodeContract = dimension(diagnostics, /^NODE_CONTRACT_/);
  const policyAndRevision = dimension(diagnostics, /^POLICY_REVISION_/);
  const proofAndPreservation = dimension(diagnostics, /^PROOF_PRESERVATION_/);
  const capabilityHonesty = dimension(diagnostics, /^CAPABILITY_HONESTY_/);
  const dimensions = [sourceChain, operatorResolution, inputBindings, dependencyGraph, nodeContract, policyAndRevision, proofAndPreservation, capabilityHonesty];
  const disposition = dimensions.includes('FAIL') ? 'FAIL'
    : artifact.compileDisposition === 'CAPABILITY_GAP' ? 'CAPABILITY_BLOCKED'
    : artifact.executionEligibility === 'RESEARCH_PROXY_ONLY' ? 'PASS' : 'UNVERIFIABLE';
  return deepFreezeV1({
    disposition, sourceChain, operatorResolution, inputBindings, dependencyGraph,
    nodeContract, policyAndRevision, proofAndPreservation, capabilityHonesty,
    diagnostics: unique(diagnostics).sort(compareUtf16),
  });
}

function validateSourceChain(
  artifact: JsonRecord,
  diagnostics: string[],
  source?: Stage4CompilationSourceV2,
): void {
  const expected = {
    taskId: 'DEV-02',
    sourceEditorialIntentHash: hashCanonicalJsonV1(source?.editorialIntent ?? editorialIntent),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(source?.evidenceBoundIntent ?? evidenceBoundIntent),
    evidencePackHash: hashCanonicalJsonV1(source?.evidencePack ?? evidencePack),
    operatorCatalogVersion: String(operatorCatalog.version),
    projectId: 'oe-dev-02',
    expectedProjectRevision: 'R3',
  };
  for (const [field, value] of Object.entries(expected)) {
    if (artifact[field] !== value) diagnostics.push(`SOURCE_CHAIN_${field.toUpperCase()}_DRIFT`);
  }
}

function validateCompiledNode(node: JsonRecord, intentNodeId: string, allNodeIds: Set<string>, outputProducerByRef: Map<string, string>, diagnostics: string[]): void {
  const sourceIntent = intentNodes.get(intentNodeId);
  const boundIntent = boundNodes.get(intentNodeId);
  if (!sourceIntent || !boundIntent) diagnostics.push(`OPERATOR_RESOLUTION_UNKNOWN_INTENT_NODE:${intentNodeId}`);
  const operatorId = String(node.operatorId ?? '');
  const operator = operators.get(operatorId);
  if (!operator) diagnostics.push(`OPERATOR_RESOLUTION_UNKNOWN_OPERATOR:${operatorId}`);
  if (sourceIntent && !strings(sourceIntent.candidateCapabilityIds).includes(operatorId)) {
    diagnostics.push(`OPERATOR_RESOLUTION_NOT_A_CANDIDATE:${intentNodeId}/${operatorId}`);
  }
  if (!operator) return;
  const expectedSpecRef = `EDITRON_OPERATOR_SPECS_V2@${operatorCatalog.version}#${operatorId}`;
  if (node.operatorSpecRef !== expectedSpecRef) diagnostics.push(`OPERATOR_RESOLUTION_SPEC_REF_DRIFT:${node.nodeId}`);
  if (node.ownerRef !== ownerRef(operator)) diagnostics.push(`OPERATOR_RESOLUTION_OWNER_REF_DRIFT:${node.nodeId}`);
  if (operator.compilerEligibility !== 'RESEARCH_READ_ONLY' || !['READ', 'RESOLVER'].includes(String(operator.kind))) {
    diagnostics.push(`OPERATOR_RESOLUTION_FORBIDDEN_OPERATOR:${node.nodeId}/${operatorId}`);
  }
  validateOperatorInputs(node, operator, diagnostics);
  validateNodeContract(node, operator, boundIntent, allNodeIds, outputProducerByRef, diagnostics);
}

function validateOperatorInputs(node: JsonRecord, operator: JsonRecord, diagnostics: string[]): void {
  const inputContract = record(operator.input);
  const fields = strings(inputContract.fields);
  const fieldSchemas = record(operatorCatalog.fieldSchemas);
  const properties: JsonRecord = {};
  for (const field of fields) {
    if (!(field in fieldSchemas)) diagnostics.push(`INPUT_BINDING_FIELD_SCHEMA_MISSING:${node.nodeId}/${field}`);
    else properties[field] = fieldSchemas[field];
  }
  const schema = { type: 'object', required: strings(inputContract.required), properties, additionalProperties: false };
  for (const diagnostic of validateJsonSchemaV2(node.inputs, schema, '$.inputs')) {
    diagnostics.push(`INPUT_BINDING_SCHEMA:${node.nodeId}:${diagnostic}`);
  }
  const inputs = record(node.inputs);
  if ('projectId' in inputs && inputs.projectId !== 'oe-dev-02') diagnostics.push(`INPUT_BINDING_PROJECT_DRIFT:${node.nodeId}`);
  if ('expectedProjectRevision' in inputs && inputs.expectedProjectRevision !== 'R3') diagnostics.push(`INPUT_BINDING_REVISION_DRIFT:${node.nodeId}`);
  if (typeof inputs.assetId === 'string' && !allowedAssetIds.has(inputs.assetId)) diagnostics.push(`INPUT_BINDING_ASSET_UNBOUND:${node.nodeId}/${inputs.assetId}`);
  for (const assetId of strings(inputs.assetIds)) if (!allowedAssetIds.has(assetId)) diagnostics.push(`INPUT_BINDING_ASSET_UNBOUND:${node.nodeId}/${assetId}`);
  if (typeof inputs.overlayId === 'string' && !knownOverlayIds.has(inputs.overlayId)) diagnostics.push(`INPUT_BINDING_OVERLAY_UNBOUND:${node.nodeId}/${inputs.overlayId}`);
  for (const overlayId of strings(inputs.overlayIds)) if (!knownOverlayIds.has(overlayId)) diagnostics.push(`INPUT_BINDING_OVERLAY_UNBOUND:${node.nodeId}/${overlayId}`);
  for (const evidenceId of strings(inputs.evidenceIds)) if (!evidenceIds.has(evidenceId)) diagnostics.push(`INPUT_BINDING_EVIDENCE_UNBOUND:${node.nodeId}/${evidenceId}`);
  validateTargetRange(inputs.targetRange, node, diagnostics);
  validateSourceRange(inputs.sourceRange, inputs.assetId, node, diagnostics);
}

function validateNodeContract(node: JsonRecord, operator: JsonRecord, boundIntent: JsonRecord | undefined, allNodeIds: Set<string>, outputProducerByRef: Map<string, string>, diagnostics: string[]): void {
  const nodeId = String(node.nodeId);
  const reads = strings(node.reads);
  for (const factId of reads) if (!factIds.has(factId)) diagnostics.push(`NODE_CONTRACT_UNKNOWN_READ:${nodeId}/${factId}`);
  if (strings(node.writes).length) diagnostics.push(`POLICY_REVISION_READ_RESOLVER_WRITES:${nodeId}`);
  const requiredRefs = strings(node.requires);
  for (const reference of requiredRefs) {
    if (!factIds.has(reference) && !allNodeIds.has(reference) && !outputProducerByRef.has(reference)) diagnostics.push(`NODE_CONTRACT_UNKNOWN_REQUIREMENT:${nodeId}/${reference}`);
  }
  if (strings(node.invalidates).length) diagnostics.push(`NODE_CONTRACT_READ_RESOLVER_INVALIDATES:${nodeId}`);
  const expectedOutputs = strings(record(operator.output).required).map((outputName) => `${nodeId}.${outputName}`);
  if (!sameSet(strings(node.produces), expectedOutputs)) diagnostics.push(`NODE_CONTRACT_OUTPUT_SET_DRIFT:${nodeId}`);
  for (const binding of records(node.coordinateBindings)) {
    for (const factId of [...strings(binding.timebaseFactIds), ...strings(binding.rangeFactIds), ...strings(binding.assetFactIds)]) {
      if (!factIds.has(factId)) diagnostics.push(`NODE_CONTRACT_COORDINATE_FACT_UNKNOWN:${nodeId}/${factId}`);
    }
  }
  const revision = record(node.revisionBinding);
  if (revision.projectId !== 'oe-dev-02' || revision.expectedProjectRevision !== 'R3') diagnostics.push(`POLICY_REVISION_NODE_REVISION_DRIFT:${nodeId}`);
  if (!sameSet(strings(node.stateEffects), strings(operator.stateEffects))) diagnostics.push(`NODE_CONTRACT_STATE_EFFECT_DRIFT:${nodeId}`);
  const idempotency = record(node.idempotency);
  if (!strings(idempotency.keyMaterialRefs).length) diagnostics.push(`NODE_CONTRACT_IDEMPOTENCY_MISSING:${nodeId}`);
  const allowedProofs = new Set(strings(boundIntent?.proofObligationIds));
  for (const proofId of strings(node.proofObligationIds)) if (!allowedProofs.has(proofId)) diagnostics.push(`PROOF_PRESERVATION_NODE_PROOF_UNBOUND:${nodeId}/${proofId}`);
  for (const policyId of strings(node.policyFactIds)) if (!policyFactIds.has(policyId)) diagnostics.push(`POLICY_REVISION_POLICY_FACT_UNBOUND:${nodeId}/${policyId}`);
  if (!strings(node.policyFactIds).length) diagnostics.push(`POLICY_REVISION_POLICY_BINDING_MISSING:${nodeId}`);
  const kind = String(operator.kind);
  const expectedClass = kind === 'READ' ? 'READ_SHARED' : 'RESOLVER_ISOLATED';
  const expectedResource = kind === 'READ' ? 'OE_STAGE4_READ_V1' : 'OE_STAGE4_RESOLVER_V1';
  if (record(node.concurrency).class !== expectedClass) diagnostics.push(`POLICY_REVISION_CONCURRENCY_DRIFT:${nodeId}`);
  if (node.resourcePolicyId !== expectedResource) diagnostics.push(`POLICY_REVISION_RESOURCE_POLICY_DRIFT:${nodeId}`);
  const reversibility = record(node.reversibility);
  if (reversibility.disposition !== 'NOT_APPLICABLE_READ_ONLY' || strings(reversibility.undoBindingRefs).length) diagnostics.push(`POLICY_REVISION_REVERSIBILITY_DRIFT:${nodeId}`);
  const knownTraceRefs = new Set([...factIds, ...evidenceIds, ...evidenceBindingIds, ...proofIds, ...preservationIds, ...intentNodes.keys(), ...boundNodes.keys()]);
  const traceRefs = strings(node.traceRefs);
  if (!traceRefs.includes(String(node.intentNodeId))) diagnostics.push(`NODE_CONTRACT_INTENT_TRACE_MISSING:${nodeId}`);
  for (const reference of traceRefs) if (!knownTraceRefs.has(reference)) diagnostics.push(`NODE_CONTRACT_TRACE_REF_UNKNOWN:${nodeId}/${reference}`);
}

function validateOwnedSourceInspection(nodes: JsonRecord[], diagnostics: string[]): void {
  const inspected = new Set(nodes.filter((node) => node.operatorId === 'inspect_user_asset').map((node) => String(record(node.inputs).assetId ?? '')));
  for (const assetId of allowedAssetIds) if (!inspected.has(assetId)) diagnostics.push(`OPERATOR_RESOLUTION_OWNED_SOURCE_NOT_INSPECTED:${assetId}`);
}

function validateEdges(edges: JsonRecord[], nodes: JsonRecord[], nodeIds: Set<string>, outputProducerByRef: Map<string, string>, compiledByIntent: Map<string, JsonRecord[]>, diagnostics: string[]): void {
  const adjacency = new Map([...nodeIds].map((nodeId) => [nodeId, new Set<string>()]));
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    const edgeId = String(edge.edgeId ?? '');
    const from = String(edge.fromNodeId ?? '');
    const to = String(edge.toNodeId ?? '');
    if (!edgeId || edgeIds.has(edgeId)) diagnostics.push(`DEPENDENCY_GRAPH_EDGE_ID_INVALID:${edgeId || 'empty'}`);
    edgeIds.add(edgeId);
    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) diagnostics.push(`DEPENDENCY_GRAPH_EDGE_ENDPOINT_INVALID:${edgeId}`);
    else adjacency.get(from)?.add(to);
  }
  if (hasCycle(adjacency)) diagnostics.push('DEPENDENCY_GRAPH_CYCLE');
  for (const node of nodes) {
    for (const reference of strings(node.requires)) {
      const requiredNodeId = nodeIds.has(reference) ? reference : outputProducerByRef.get(reference);
      if (!requiredNodeId) continue;
      if (requiredNodeId === node.nodeId || !reachable(requiredNodeId, String(node.nodeId), adjacency)) {
        diagnostics.push(`DEPENDENCY_GRAPH_REQUIRED_EDGE_MISSING:${requiredNodeId}/${node.nodeId}`);
      }
    }
    const sourceIntent = intentNodes.get(String(node.intentNodeId));
    for (const requiredIntentId of strings(sourceIntent?.requiresNodeIds)) {
      const upstream = compiledByIntent.get(requiredIntentId) ?? [];
      if (upstream.length && !upstream.some((candidate) => reachable(String(candidate.nodeId), String(node.nodeId), adjacency))) {
        diagnostics.push(`DEPENDENCY_GRAPH_INTENT_ORDER_MISSING:${requiredIntentId}/${node.intentNodeId}`);
      }
    }
  }
}

function validateRootProofPolicy(policy: JsonRecord, diagnostics: string[]): void {
  if (policy.mode !== 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION' || policy.onUnverifiable !== 'BLOCK_EXECUTION') diagnostics.push('PROOF_PRESERVATION_POLICY_MODE_DRIFT');
  if (!sameSet(strings(policy.proofObligationIds), [...proofIds])) diagnostics.push('PROOF_PRESERVATION_PROOF_SET_DRIFT');
  if (!sameSet(strings(policy.preservationIds), [...preservationIds])) diagnostics.push('PROOF_PRESERVATION_PRESERVATION_SET_DRIFT');
}

function validateCapabilityDisposition(artifact: JsonRecord, nodes: JsonRecord[], compiledByIntent: Map<string, JsonRecord[]>, diagnostics: string[]): void {
  const unresolved = new Set(strings(artifact.unresolvedIntentNodeIds));
  const declaredDiagnostics = records(artifact.diagnostics);
  if (artifact.compileDisposition !== 'CAPABILITY_GAP' || artifact.executionEligibility !== 'NOT_EXECUTABLE') diagnostics.push('CAPABILITY_HONESTY_FALSE_READINESS');
  if (nodes.some((node) => node.operatorId === 'generated_composition_program')) diagnostics.push('CAPABILITY_HONESTY_GENERATED_NODE_EMITTED');
  if (!unresolved.has('node-generated-island')) diagnostics.push('CAPABILITY_HONESTY_GENERATED_INTENT_NOT_UNRESOLVED');
  const generatedGap = declaredDiagnostics.some((entry) => entry.code === 'CAPABILITY_NOT_IMPLEMENTED'
    && strings(entry.intentNodeIds).includes('node-generated-island')
    && strings(entry.operatorIds).includes('generated_composition_program')
    && strings(entry.factIds).includes('fact-support-generated-composition')
    && entry.disposition === 'CAPABILITY_GAP');
  if (!generatedGap) diagnostics.push('CAPABILITY_HONESTY_GENERATED_DIAGNOSTIC_MISSING');
  for (const intentNodeId of intentNodes.keys()) if (!compiledByIntent.has(intentNodeId) && !unresolved.has(intentNodeId)) diagnostics.push(`CAPABILITY_HONESTY_UNREPRESENTED_INTENT:${intentNodeId}`);
  for (const intentNodeId of unresolved) {
    if (!intentNodes.has(intentNodeId)) diagnostics.push(`CAPABILITY_HONESTY_UNKNOWN_UNRESOLVED_INTENT:${intentNodeId}`);
    if (!declaredDiagnostics.some((entry) => strings(entry.intentNodeIds).includes(intentNodeId))) diagnostics.push(`CAPABILITY_HONESTY_UNRESOLVED_WITHOUT_DIAGNOSTIC:${intentNodeId}`);
  }
  for (const diagnostic of declaredDiagnostics) {
    for (const intentNodeId of strings(diagnostic.intentNodeIds)) if (!intentNodes.has(intentNodeId)) diagnostics.push(`CAPABILITY_HONESTY_DIAGNOSTIC_INTENT_UNKNOWN:${intentNodeId}`);
    for (const operatorId of strings(diagnostic.operatorIds)) if (!operators.has(operatorId)) diagnostics.push(`CAPABILITY_HONESTY_DIAGNOSTIC_OPERATOR_UNKNOWN:${operatorId}`);
    for (const factId of strings(diagnostic.factIds)) if (!factsById.has(factId)) diagnostics.push(`CAPABILITY_HONESTY_DIAGNOSTIC_FACT_UNKNOWN:${factId}`);
  }
}

function validateTargetRange(value: unknown, node: JsonRecord, diagnostics: string[]): void {
  if (value === undefined) return;
  const range = record(value);
  const start = Number(range.startFrame);
  const end = Number(range.endFrame);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > 360) diagnostics.push(`INPUT_BINDING_TARGET_RANGE_INVALID:${node.nodeId}`);
  if (end > 180 && !strings(node.reads).includes('fact-exit-continuity')) diagnostics.push(`INPUT_BINDING_TARGET_RANGE_EVIDENCE_MISSING:${node.nodeId}`);
}

function validateSourceRange(value: unknown, assetIdValue: unknown, node: JsonRecord, diagnostics: string[]): void {
  if (value === undefined) return;
  const assetId = typeof assetIdValue === 'string' ? assetIdValue : '';
  const range = record(value);
  const start = Number(range.startFrame);
  const end = Number(range.endFrame);
  const windowsFact = factsById.get('fact-source-windows');
  const windows = records(windowsFact?.windows).find((entry) => entry.assetId === assetId);
  const legal = records(windows?.ranges).some((entry) => start >= Number(entry.start) && end <= Number(entry.endExclusive));
  if (!legal || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) diagnostics.push(`INPUT_BINDING_SOURCE_RANGE_INVALID:${node.nodeId}`);
}

export function validateJsonSchemaV2(value: unknown, schemaValue: unknown, path: string): string[] {
  const schema = record(schemaValue);
  if ('const' in schema && value !== schema.const) return [`${path}:CONST`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${path}:ENUM`];
  if (schema.type === 'string') return typeof value === 'string' && (!schema.minLength || value.length >= Number(schema.minLength)) ? [] : [`${path}:STRING`];
  if (schema.type === 'integer') {
    return Number.isSafeInteger(value) && !Object.is(value, -0) && withinNumericSchemaBounds(value as number, schema)
      ? [] : [`${path}:INTEGER`];
  }
  if (schema.type === 'number') {
    return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)
      && withinNumericSchemaBounds(value, schema) ? [] : [`${path}:NUMBER`];
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}:ARRAY`];
    const result = value.flatMap((entry, index) => validateJsonSchemaV2(entry, schema.items, `${path}[${index}]`));
    if (schema.minItems && value.length < Number(schema.minItems)) result.push(`${path}:MIN_ITEMS`);
    if (schema.uniqueItems === true && new Set(value.map((entry) => hashCanonicalJsonV1(entry))).size !== value.length) result.push(`${path}:UNIQUE`);
    return result;
  }
  if (schema.type === 'object') {
    if (!isRecord(value)) return [`${path}:OBJECT`];
    const properties = record(schema.properties);
    const result = strings(schema.required).filter((field) => !(field in value)).map((field) => `${path}.${field}:REQUIRED`);
    if (schema.additionalProperties === false) for (const field of Object.keys(value)) if (!(field in properties)) result.push(`${path}.${field}:ADDITIONAL`);
    for (const [field, child] of Object.entries(value)) if (field in properties) result.push(...validateJsonSchemaV2(child, properties[field], `${path}.${field}`));
    if (schema.minProperties && Object.keys(value).length < Number(schema.minProperties)) result.push(`${path}:MIN_PROPERTIES`);
    return result;
  }
  return [];
}

function withinNumericSchemaBounds(value: number, schema: JsonRecord): boolean {
  const minimum = schema.minimum;
  const maximum = schema.maximum;
  if (minimum !== undefined && (typeof minimum !== 'number' || !Number.isFinite(minimum) || value < minimum)) return false;
  if (maximum !== undefined && (typeof maximum !== 'number' || !Number.isFinite(maximum) || value > maximum)) return false;
  return true;
}

function ownerRef(operator: JsonRecord): string {
  if (typeof operator.ownerRef === 'string') return operator.ownerRef;
  const owner = record(operator.owner);
  return `${String(owner.path)}#${String(owner.symbol)}`;
}
function emptyEvaluation(): Readonly<Stage4CompilationEvaluationV2> { return deepFreezeV1({ disposition: 'UNVERIFIABLE', sourceChain: 'UNVERIFIABLE', operatorResolution: 'UNVERIFIABLE', inputBindings: 'UNVERIFIABLE', dependencyGraph: 'UNVERIFIABLE', nodeContract: 'UNVERIFIABLE', policyAndRevision: 'UNVERIFIABLE', proofAndPreservation: 'UNVERIFIABLE', capabilityHonesty: 'UNVERIFIABLE', diagnostics: ['NO_ACCEPTED_ARTIFACT'] }); }
function sourceRelativeFailure(error: unknown): Readonly<Stage4CompilationEvaluationV2> {
  return deepFreezeV1({
    disposition: 'FAIL', sourceChain: 'FAIL', operatorResolution: 'UNVERIFIABLE',
    inputBindings: 'UNVERIFIABLE', dependencyGraph: 'UNVERIFIABLE', nodeContract: 'UNVERIFIABLE',
    policyAndRevision: 'UNVERIFIABLE', proofAndPreservation: 'UNVERIFIABLE',
    capabilityHonesty: 'UNVERIFIABLE',
    diagnostics: [`SOURCE_CHAIN_SOURCE_RELATIVE_RESOLUTION:${error instanceof Error ? error.message : String(error)}`],
  });
}
function dimension(diagnostics: string[], pattern: RegExp): DimensionV2 { return diagnostics.some((entry) => pattern.test(entry)) ? 'FAIL' : 'PASS'; }
function hasCycle(adjacency: Map<string, Set<string>>): boolean { const active = new Set<string>(); const done = new Set<string>(); const visit = (node: string): boolean => { if (active.has(node)) return true; if (done.has(node)) return false; active.add(node); for (const next of adjacency.get(node) ?? []) if (visit(next)) return true; active.delete(node); done.add(node); return false; }; return [...adjacency.keys()].some(visit); }
function reachable(start: string, target: string, adjacency: Map<string, Set<string>>): boolean { const pending = [start]; const seen = new Set<string>(); while (pending.length) { const node = pending.pop() as string; if (node === target && node !== start) return true; if (seen.has(node)) continue; seen.add(node); pending.push(...(adjacency.get(node) ?? [])); } return false; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && right.every((value) => left.includes(value)); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
