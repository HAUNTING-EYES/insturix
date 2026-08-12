import {
  deepFreezeV1,
  hashCanonicalJsonV1,
  type CandidateGraphNodeV1,
  type CandidateGraphV1,
  type MaterializedPlannerPacketArtifactV1,
  type OperatorCatalogV1,
  type OperatorSpecV1,
} from './contracts-v1';
import {
  comparePortTypesV1,
  parsePortContractV1,
  validatePortValueV1,
  type PortContractV1,
} from './graph-verifier-port-contract-v1';

export const OE2_GRAPH_VERIFIER_VERSION_V1 = 'OE2_GRAPH_VERIFIER_V1';

export interface GraphVerificationIssueV1 {
  code: string;
  path: string;
  message: string;
}

export interface GraphVerifierPredicateV1 {
  predicateId: string;
  version: string;
  message: string;
  evaluate(context: Readonly<GraphVerifierContextV1>): boolean;
}

export interface GraphVerifierContextV1 {
  graph: CandidateGraphV1;
  artifact: MaterializedPlannerPacketArtifactV1;
  operatorCatalog: OperatorCatalogV1;
}

export interface GraphVerificationResultV1 {
  verifierVersion: typeof OE2_GRAPH_VERIFIER_VERSION_V1;
  disposition: 'ACCEPTED' | 'REJECTED';
  packetHash: string;
  graphHash?: string;
  evaluatedAt: string;
  predicateVersions: Array<{ predicateId: string; version: string }>;
  issues: GraphVerificationIssueV1[];
}

interface NodeContractV1 {
  node: CandidateGraphNodeV1;
  spec: OperatorSpecV1;
  inputs: PortContractV1;
  outputs: PortContractV1;
  mutates: boolean;
}

const GRAPH_KEYS = ['graphId', 'taskId', 'envelopeHash', 'projectRevision', 'nodes', 'edges', 'expectedOutcome', 'preservationClaims', 'clarifications', 'declines'];
const NODE_KEYS = ['nodeId', 'operatorId', 'operatorVersion', 'inputs', 'evidenceIds', 'expectedOutputs', 'expectedStateEffects', 'failureDisposition'];
const EDGE_KEYS = ['fromNodeId', 'fromPort', 'toNodeId', 'toPort'];

export function verifyCandidateGraphV1(input: {
  graph: CandidateGraphV1;
  artifact: MaterializedPlannerPacketArtifactV1;
  operatorCatalog: OperatorCatalogV1;
  evaluatedAt: string;
  availableProofObligations: string[];
  taskPredicates: GraphVerifierPredicateV1[];
}): Readonly<GraphVerificationResultV1> {
  const issues: GraphVerificationIssueV1[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const { graph, artifact, operatorCatalog } = input;
  const packet = artifact.packet;
  const envelope = packet.materializedPlannerEnvelope;
  let graphHash: string | undefined;
  try { graphHash = hashCanonicalJsonV1(graph); } catch (error) {
    add('SCHEMA_INVALID', '$', error instanceof Error ? error.message : 'Graph is not canonical JSON');
  }
  if (artifact.packetHash !== hashCanonicalJsonV1(packet)) add('PACKET_HASH_MISMATCH', '$.packetHash', 'Packet hash does not match the packet');
  if (packet.envelopeHash !== hashCanonicalJsonV1(envelope)) add('ENVELOPE_HASH_MISMATCH', '$.envelopeHash', 'Envelope hash does not match the materialized envelope');
  if (packet.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION') add('AUTHORITY_INVALID', '$.authority', 'Verifier accepts research-only packets');
  if (operatorCatalog.version !== packet.operatorCatalogVersion) add('CATALOG_VERSION_MISMATCH', '$.operatorCatalogVersion', 'Operator catalog version differs from the packet');
  validateScope(graph, packet.taskId, packet.envelopeHash, envelope.projectRevision, add);
  validateEvaluationTime(input.evaluatedAt, envelope.expiresAt, add);
  validateExactKeys(graph, GRAPH_KEYS, '$', add);
  for (const field of ['graphId', 'taskId', 'envelopeHash', 'projectRevision', 'expectedOutcome'] as const) {
    if (typeof graph[field] !== 'string' || !graph[field].trim()) add('SCHEMA_INVALID', `$.${field}`, `${field} must be a non-empty string`);
  }

  const operatorById = new Map<string, OperatorSpecV1>();
  for (const spec of operatorCatalog.operators) {
    if (operatorById.has(spec.operatorId)) add('OPERATOR_SPEC_INVALID', '$.operatorCatalog', `Duplicate operator ${spec.operatorId}`);
    else operatorById.set(spec.operatorId, spec);
  }
  const allowed = new Set(envelope.allowedOperatorIds);
  const denied = new Set(envelope.deniedOperatorIds);
  const evidence = new Set(envelope.boundEvidenceIds);
  const proofs = new Set(input.availableProofObligations);
  const knownIds = collectStrings([envelope.projectFacts, envelope.evidenceBindings]);
  const duration = typeof envelope.projectFacts.durationFrames === 'number' ? envelope.projectFacts.durationFrames : undefined;
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const nodeById = new Map<string, CandidateGraphNodeV1>();
  const contracts = new Map<string, NodeContractV1>();
  const maximumNodes = envelope.resourceBudget.maxNodes;
  if (typeof maximumNodes === 'number' && nodes.length > maximumNodes) add('RESOURCE_BUDGET_EXCEEDED', '$.nodes', `Node count exceeds ${maximumNodes}`);

  for (const [index, node] of nodes.entries()) {
    const path = `$.nodes[${index}]`;
    if (!isRecord(node)) { add('SCHEMA_INVALID', path, 'Node must be an object'); continue; }
    validateExactKeys(node, NODE_KEYS, path, add);
    if (!node.nodeId) add('SCHEMA_INVALID', `${path}.nodeId`, 'nodeId must be non-empty');
    if (nodeById.has(node.nodeId)) add('DUPLICATE_NODE_ID', `${path}.nodeId`, `Duplicate nodeId ${node.nodeId}`);
    else nodeById.set(node.nodeId, node);
    const spec = operatorById.get(node.operatorId);
    if (!spec) { add('UNKNOWN_OPERATOR', `${path}.operatorId`, `Unknown operator ${node.operatorId}`); continue; }
    if (!allowed.has(node.operatorId) || denied.has(node.operatorId) || spec.plannerEligibility === 'EXCLUDED_FROM_ENVELOPE') {
      add('OPERATOR_POLICY_DENIED', `${path}.operatorId`, `Operator ${node.operatorId} is not eligible in this envelope`);
    }
    if (node.operatorVersion !== spec.version) add('OPERATOR_VERSION_MISMATCH', `${path}.operatorVersion`, `Expected ${spec.version}`);
    const inputContract = parsePortContractV1(spec.inputPorts);
    const outputContract = parsePortContractV1(spec.outputPorts);
    for (const error of [...inputContract.errors, ...outputContract.errors]) add('OPERATOR_SPEC_INVALID', `${path}.operatorId`, error);
    contracts.set(node.nodeId, { node, spec, inputs: inputContract, outputs: outputContract, mutates: isMutating(spec) });
    validateOperatorPolicy(spec, envelope.networkPolicy, proofs, path, add);
    validateEvidence(node, evidence, path, add);
    validateEffectsAndFailure(node, spec, path, add);
    validatePortValues(node.inputs, inputContract, duration, knownIds, `${path}.inputs`, add);
    validatePortValues(node.expectedOutputs, outputContract, duration, knownIds, `${path}.expectedOutputs`, add);
    validateRangePairs(node.inputs, path, add);
    validateCandidateBudget(node, envelope.resourceBudget.maxCandidates, path, add);
  }

  const adjacency = new Map<string, Set<string>>([...nodeById.keys()].map((nodeId) => [nodeId, new Set()]));
  const incoming = new Map<string, Set<string>>();
  const edgeFingerprints = new Set<string>();
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  for (const [index, edge] of edges.entries()) {
    const path = `$.edges[${index}]`;
    if (!isRecord(edge)) { add('SCHEMA_INVALID', path, 'Edge must be an object'); continue; }
    validateExactKeys(edge, EDGE_KEYS, path, add);
    const fingerprint = `${edge.fromNodeId}\0${edge.fromPort}\0${edge.toNodeId}\0${edge.toPort}`;
    if (edgeFingerprints.has(fingerprint)) add('DUPLICATE_EDGE', path, 'Duplicate edge');
    edgeFingerprints.add(fingerprint);
    const source = contracts.get(edge.fromNodeId);
    const target = contracts.get(edge.toNodeId);
    if (!source || !target) { add('EDGE_NODE_MISSING', path, 'Edge references a missing or invalid node'); continue; }
    const sourcePort = source.outputs.byName.get(edge.fromPort);
    const targetPort = target.inputs.byName.get(edge.toPort);
    if (!sourcePort) add('OUTPUT_PORT_UNKNOWN', `${path}.fromPort`, `Unknown output port ${edge.fromPort}`);
    if (!targetPort) add('INPUT_PORT_UNKNOWN', `${path}.toPort`, `Unknown input port ${edge.toPort}`);
    if (!sourcePort || !targetPort) continue;
    const compatibility = comparePortTypesV1(sourcePort.typeExpression, targetPort.typeExpression);
    if (compatibility !== 'COMPATIBLE') add(compatibility === 'UNVERIFIABLE' ? 'PORT_TYPE_UNVERIFIABLE' : 'PORT_TYPE_MISMATCH', path, 'Edge port types are not verifiably compatible');
    if (!(edge.fromPort in source.node.expectedOutputs)) add('OUTPUT_BINDING_MISSING', `${path}.fromPort`, 'Source expectedOutputs does not declare this port');
    const targetKey = `${edge.toNodeId}\0${edge.toPort}`;
    if (incoming.has(targetKey) || edge.toPort in target.node.inputs) add('INPUT_BINDING_CONFLICT', `${path}.toPort`, 'Input has multiple bindings');
    else incoming.set(targetKey, new Set([edge.fromNodeId]));
    adjacency.get(edge.fromNodeId)?.add(edge.toNodeId);
  }
  validateRequiredInputs(contracts, incoming, add);
  if (hasCycle(adjacency)) add('GRAPH_CYCLE', '$.edges', 'Graph contains a cycle');
  validateMutationOrder(contracts, adjacency, add);

  if (nodes.length === 0 && graph.clarifications.length + graph.declines.length === 0) add('EMPTY_GRAPH_WITHOUT_DISPOSITION', '$.nodes', 'An empty graph must clarify or decline');
  if (nodes.length > 0) for (const claim of envelope.preservationPredicates) {
    if (!graph.preservationClaims.includes(claim)) add('PRESERVATION_CLAIM_MISSING', '$.preservationClaims', `Missing ${claim}`);
  }
  validateTaskPredicates(input.taskPredicates, { graph, artifact, operatorCatalog }, add);
  const ordered = uniqueIssues(issues).sort((left, right) =>
    compareUtf16(left.path, right.path)
    || compareUtf16(left.code, right.code)
    || compareUtf16(left.message, right.message));
  return deepFreezeV1({
    verifierVersion: OE2_GRAPH_VERIFIER_VERSION_V1,
    disposition: ordered.length === 0 ? 'ACCEPTED' : 'REJECTED',
    packetHash: artifact.packetHash,
    ...(graphHash ? { graphHash } : {}),
    evaluatedAt: input.evaluatedAt,
    predicateVersions: input.taskPredicates.map(({ predicateId, version }) => ({ predicateId, version })),
    issues: ordered,
  });
}

type AddIssue = (code: string, path: string, message: string) => void;

function validateScope(graph: CandidateGraphV1, taskId: string, envelopeHash: string, revision: string, add: AddIssue): void {
  if (graph.taskId !== taskId) add('TASK_SCOPE_MISMATCH', '$.taskId', 'Graph task differs from packet');
  if (graph.envelopeHash !== envelopeHash) add('ENVELOPE_SCOPE_MISMATCH', '$.envelopeHash', 'Graph envelope differs from packet');
  if (graph.projectRevision !== revision) add('REVISION_SCOPE_MISMATCH', '$.projectRevision', 'Graph revision differs from envelope');
}

function validateEvaluationTime(evaluatedAt: string, expiresAt: string, add: AddIssue): void {
  const evaluated = Date.parse(evaluatedAt); const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(evaluated) || !Number.isFinite(expiry)) add('TIME_BINDING_INVALID', '$.evaluatedAt', 'Evaluation or expiry time is invalid');
  else if (evaluated >= expiry) add('ENVELOPE_EXPIRED', '$.evaluatedAt', 'Planner envelope has expired');
}

function validateOperatorPolicy(spec: OperatorSpecV1, networkPolicy: string, proofs: Set<string>, path: string, add: AddIssue): void {
  const rights = isRecord(spec.rightsPrivacyEgress) ? spec.rightsPrivacyEgress : undefined;
  if (networkPolicy === 'DENY' && (typeof rights?.network !== 'string' || !rights.network.startsWith('DENY'))) add('NETWORK_POLICY_VIOLATION', `${path}.operatorId`, 'Operator does not declare network denial');
  const obligations = stringArray(spec.proofObligations);
  if (!obligations) add('OPERATOR_SPEC_INVALID', `${path}.operatorId`, 'proofObligations must be strings');
  else for (const proof of obligations) if (!proofs.has(proof)) add('PROOF_UNAVAILABLE', `${path}.operatorId`, `Proof ${proof} is unavailable`);
}

function validateEvidence(node: CandidateGraphNodeV1, evidence: Set<string>, path: string, add: AddIssue): void {
  if (!Array.isArray(node.evidenceIds) || node.evidenceIds.some((id) => typeof id !== 'string')) add('SCHEMA_INVALID', `${path}.evidenceIds`, 'evidenceIds must be strings');
  else for (const id of node.evidenceIds) if (!evidence.has(id)) add('EVIDENCE_UNBOUND', `${path}.evidenceIds`, `Evidence ${id} is not bound`);
}

function validateEffectsAndFailure(node: CandidateGraphNodeV1, spec: OperatorSpecV1, path: string, add: AddIssue): void {
  const actual = stringArray(node.expectedStateEffects); const declared = stringArray(spec.stateEffects);
  if (!actual || !declared) add('STATE_EFFECT_INVALID', `${path}.expectedStateEffects`, 'State effects must be string arrays');
  else if (!sameStringSet(actual, declared)) add('STATE_EFFECT_MISMATCH', `${path}.expectedStateEffects`, 'Expected state effects differ from operator declaration');
  const failures = stringArray(spec.failureDispositions);
  if (!failures || !failures.includes(node.failureDisposition)) add('FAILURE_DISPOSITION_INVALID', `${path}.failureDisposition`, 'Failure disposition is not declared by the operator');
}

function validatePortValues(values: unknown, contract: PortContractV1, duration: number | undefined, knownIds: Set<string>, path: string, add: AddIssue): void {
  if (!isRecord(values)) { add('SCHEMA_INVALID', path, 'Port values must be an object'); return; }
  for (const [name, value] of Object.entries(values)) {
    const port = contract.byName.get(name);
    if (!port) { add(path.endsWith('inputs') ? 'INPUT_PORT_UNKNOWN' : 'OUTPUT_PORT_UNKNOWN', `${path}.${name}`, `Undeclared port ${name}`); continue; }
    const error = validatePortValueV1(value, port.typeExpression, duration);
    if (error) add('PORT_VALUE_INVALID', `${path}.${name}`, error);
    if (port.typeExpression?.endsWith('-id') && typeof value === 'string' && !knownIds.has(value)) add('PROJECT_ID_UNBOUND', `${path}.${name}`, `Identifier ${value} is absent from project/evidence facts`);
  }
  if (path.endsWith('expectedOutputs')) for (const group of contract.groups) {
    if (!group.optional && !group.names.some((name) => name in values)) add('OUTPUT_BINDING_MISSING', path, `Required output ${group.raw} is absent`);
  }
}

function validateRequiredInputs(contracts: Map<string, NodeContractV1>, incoming: Map<string, Set<string>>, add: AddIssue): void {
  for (const [nodeId, contract] of contracts) for (const group of contract.inputs.groups) {
    if (group.optional) continue;
    const bound = group.names.some((name) => name in contract.node.inputs || incoming.has(`${nodeId}\0${name}`));
    if (!bound) add('INPUT_BINDING_MISSING', `$.nodes.${nodeId}.inputs`, `Required input ${group.raw} is absent`);
  }
}

function validateRangePairs(inputs: Record<string, unknown>, path: string, add: AddIssue): void {
  for (const [startName, endName] of [['startFrame', 'endFrame'], ['fromFrame', 'toFrame']] as const) {
    const start = inputs[startName]; const end = inputs[endName];
    if (typeof start === 'number' && typeof end === 'number' && end <= start) add('RANGE_INVALID', `${path}.inputs`, `${endName} must be after ${startName}`);
  }
}

function validateCandidateBudget(node: CandidateGraphNodeV1, maximum: unknown, path: string, add: AddIssue): void {
  if (typeof maximum !== 'number') return;
  walk(node, (key, value) => { if (key === 'candidates' && Array.isArray(value) && value.length > maximum) add('RESOURCE_BUDGET_EXCEEDED', path, `Candidate count exceeds ${maximum}`); });
}

function validateMutationOrder(contracts: Map<string, NodeContractV1>, adjacency: Map<string, Set<string>>, add: AddIssue): void {
  const mutations = [...contracts.entries()].filter(([, contract]) => contract.mutates).map(([id]) => id);
  for (let left = 0; left < mutations.length; left += 1) for (let right = left + 1; right < mutations.length; right += 1) {
    if (!reachable(mutations[left], mutations[right], adjacency) && !reachable(mutations[right], mutations[left], adjacency)) add('UNORDERED_STATE_EFFECTS', '$.edges', `Mutations ${mutations[left]} and ${mutations[right]} are unordered`);
  }
}

function validateTaskPredicates(predicates: GraphVerifierPredicateV1[], context: GraphVerifierContextV1, add: AddIssue): void {
  const seen = new Set<string>();
  if (predicates.length === 0) add('TASK_PREDICATE_MISSING', '$.taskPredicates', 'At least one frozen task predicate is required');
  for (const predicate of predicates) {
    const key = `${predicate.predicateId}@${predicate.version}`;
    if (!predicate.predicateId || !predicate.version || seen.has(key)) { add('TASK_PREDICATE_INVALID', '$.taskPredicates', `Invalid or duplicate predicate ${key}`); continue; }
    seen.add(key);
    try { if (!predicate.evaluate(context)) add('TASK_PREDICATE_FAILED', `$.taskPredicates.${predicate.predicateId}`, predicate.message); }
    catch { add('TASK_PREDICATE_ERROR', `$.taskPredicates.${predicate.predicateId}`, 'Predicate threw during deterministic evaluation'); }
  }
}

function hasCycle(adjacency: Map<string, Set<string>>): boolean {
  const active = new Set<string>(); const complete = new Set<string>();
  const visit = (node: string): boolean => { if (active.has(node)) return true; if (complete.has(node)) return false; active.add(node); for (const next of adjacency.get(node) ?? []) if (visit(next)) return true; active.delete(node); complete.add(node); return false; };
  return [...adjacency.keys()].some(visit);
}

function reachable(start: string, target: string, adjacency: Map<string, Set<string>>): boolean {
  const pending = [start]; const seen = new Set<string>();
  while (pending.length) { const node = pending.pop() as string; if (node === target && node !== start) return true; if (seen.has(node)) continue; seen.add(node); pending.push(...(adjacency.get(node) ?? [])); }
  return false;
}

function validateExactKeys(value: Record<string, unknown>, allowed: string[], path: string, add: AddIssue): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) add('SCHEMA_ADDITIONAL_PROPERTY', `${path}.${key}`, `Unexpected property ${key}`);
}

function isMutating(spec: OperatorSpecV1): boolean { return !['READ', 'RESOLVE'].includes(spec.kind); }
function stringArray(value: unknown): string[] | undefined { return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined; }
function sameStringSet(left: string[], right: string[]): boolean { return left.length === right.length && new Set(left).size === left.length && left.every((entry) => right.includes(entry)); }
function uniqueIssues(issues: GraphVerificationIssueV1[]): GraphVerificationIssueV1[] { return [...new Map(issues.map((issue) => [`${issue.code}\0${issue.path}\0${issue.message}`, issue])).values()]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function collectStrings(values: unknown[]): Set<string> { const result = new Set<string>(); walk(values, (_key, value) => { if (typeof value === 'string') result.add(value); }); return result; }
function walk(value: unknown, visit: (key: string, value: unknown) => void): void { if (Array.isArray(value)) { for (const entry of value) walk(entry, visit); return; } if (!isRecord(value)) return; for (const [key, child] of Object.entries(value)) { visit(key, child); walk(child, visit); } }
