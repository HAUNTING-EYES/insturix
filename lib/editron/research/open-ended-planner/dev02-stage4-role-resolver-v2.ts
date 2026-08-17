import { deepFreezeV1 } from './contracts-v1';
import { evaluateConnectedDevelopmentStageArtifactV2 } from './development-connected-source-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export interface Dev02Stage4RoleSymbolsV2 {
  sourceResolutionIntentNodeId: string;
  generatedIslandIntentNodeId: string;
  nativeContinuationIntentNodeId: string;
  proofIntentNodeId: string;
}

export interface Dev02Stage4RoleSourceV2 {
  referenceBlueprint: unknown;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
}

interface Dev02Stage2RoleNodesV2 {
  nodesById: Map<string, JsonRecord>;
  source: JsonRecord;
  generated: JsonRecord;
  continuation: JsonRecord;
  proof: JsonRecord;
}

export function resolveDev02Stage4RoleSymbolsV2(
  input: Dev02Stage4RoleSourceV2,
): Readonly<Dev02Stage4RoleSymbolsV2> {
  const stageTwo = evaluateConnectedDevelopmentStageArtifactV2({
    taskId: 'DEV-02',
    stage: 2,
    artifact: input.editorialIntent,
    priorArtifact: input.referenceBlueprint,
  });
  if (stageTwo.disposition !== 'EXPECTED_CAPABILITY_GAP' || stageTwo.diagnostics.length) {
    fail(`STAGE2_SOURCE_INVALID:${stageTwo.diagnostics.join(',')}`);
  }
  const stageThree = evaluateConnectedDevelopmentStageArtifactV2({
    taskId: 'DEV-02',
    stage: 3,
    artifact: input.evidenceBoundIntent,
    priorArtifact: input.editorialIntent,
    evidencePack: input.evidencePack,
  });
  if (stageThree.disposition !== 'EXPECTED_CAPABILITY_GAP' || stageThree.diagnostics.length) {
    fail(`STAGE3_SOURCE_INVALID:${stageThree.diagnostics.join(',')}`);
  }

  const roles = resolveDev02Stage2RoleNodesV2(input.editorialIntent);

  const boundNodes = uniqueNodes(records(record(input.evidenceBoundIntent).nodes));
  if (boundNodes.size !== roles.nodesById.size) fail('BOUND_NODE_SET_DRIFT');
  for (const [id, node] of roles.nodesById) {
    const bound = boundNodes.get(id);
    if (!bound || !sameSet(strings(node.candidateCapabilityIds), strings(bound.candidateCapabilityIds))) {
      fail(`BOUND_CAPABILITY_SET_DRIFT:${id}`);
    }
  }

  return deepFreezeV1({
    sourceResolutionIntentNodeId: nodeId(roles.source),
    generatedIslandIntentNodeId: nodeId(roles.generated),
    nativeContinuationIntentNodeId: nodeId(roles.continuation),
    proofIntentNodeId: nodeId(roles.proof),
  });
}

export function evaluateDev02Stage2RoleCompilabilityV2(editorialIntent: unknown): readonly string[] {
  try {
    resolveDev02Stage2RoleNodesV2(editorialIntent);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

function resolveDev02Stage2RoleNodesV2(editorialIntent: unknown): Dev02Stage2RoleNodesV2 {
  const editorial = record(editorialIntent);
  const nodes = records(editorial.nodes);
  if (editorial.taskId !== 'DEV-02' || nodes.length < 4) fail('FOUR_SEMANTIC_ROLES_REQUIRED');
  const nodesById = uniqueNodes(nodes);
  const dependencies = new Map(nodes.map((node) => [nodeId(node), new Set(strings(node.requiresNodeIds))]));
  for (const node of nodes) for (const dependencyId of strings(node.requiresNodeIds)) {
    if (!nodesById.has(dependencyId)) fail(`DEPENDENCY_UNKNOWN:${nodeId(node)}/${dependencyId}`);
  }
  const generated = uniqueRole(nodes, (node) => node.executionForm === 'GENERATED_COMPOSITION'
    && strings(node.candidateCapabilityIds).includes('generated_composition_program')
    && node.failureDisposition === 'CAPABILITY_GAP', 'GENERATED_ISLAND');
  const source = uniqueRole(nodes, (node) => {
    const capabilities = strings(node.candidateCapabilityIds);
    return node.executionForm === 'NATIVE'
      && capabilities.includes('inspect_user_asset')
      && capabilities.includes('resolve_user_asset_overlay')
      && hasDependencyPath(nodeId(node), nodeId(generated), dependencies);
  }, 'SOURCE_RESOLUTION');
  const continuation = uniqueRole(nodes, (node) => node !== source && node !== generated
    && node.executionForm === 'NATIVE'
    && strings(node.candidateCapabilityIds).some((capabilityId) => [
      'resolve_user_asset_overlay', 'move_retime_overlay', 'trim_overlay', 'update_overlay',
    ].includes(capabilityId))
    && hasDependencyPath(nodeId(generated), nodeId(node), dependencies), 'NATIVE_CONTINUATION');
  const proof = uniqueRole(nodes, (node) => {
    const capabilities = strings(node.candidateCapabilityIds);
    return node !== source && node !== generated && node !== continuation
      && node.executionForm === 'NATIVE'
      && capabilities.includes('read_project_file')
      && capabilities.includes('get_timeline_view')
      && hasDependencyPath(nodeId(continuation), nodeId(node), dependencies);
  }, 'PROOF_HANDOFF');
  if (!hasDependencyPath(nodeId(source), nodeId(generated), dependencies)) fail('SOURCE_BEFORE_ISLAND_MISSING');
  if (!hasDependencyPath(nodeId(source), nodeId(continuation), dependencies)) fail('SOURCE_BEFORE_CONTINUATION_MISSING');
  if (!hasDependencyPath(nodeId(generated), nodeId(proof), dependencies)) fail('ISLAND_BEFORE_PROOF_MISSING');
  if (!hasDependencyPath(nodeId(continuation), nodeId(proof), dependencies)) fail('CONTINUATION_BEFORE_PROOF_MISSING');
  return { nodesById, source, generated, continuation, proof };
}

export function readDev02Stage4RoleSymbolsFromBlockedGraphV2(
  value: unknown,
): Readonly<Dev02Stage4RoleSymbolsV2> {
  const graph = record(value);
  if (graph.taskId !== 'DEV-02' || graph.compileDisposition !== 'CAPABILITY_GAP'
    || graph.executionEligibility !== 'NOT_EXECUTABLE') fail('BLOCKED_GRAPH_DISPOSITION_INVALID');
  const compiledRoleIds = [...new Set(records(graph.nodes).map(nodeId).filter(Boolean))];
  if (compiledRoleIds.length !== 1) fail(`BLOCKED_SOURCE_ROLE_AMBIGUOUS:${compiledRoleIds.join('|')}`);
  const diagnostics = records(graph.diagnostics);
  const generated = uniqueDiagnosticRole(diagnostics, (entry) => entry.code === 'CAPABILITY_NOT_IMPLEMENTED'
    && strings(entry.operatorIds).includes('generated_composition_program'), 'BLOCKED_GENERATED');
  const continuation = uniqueDiagnosticRole(diagnostics, (entry) => entry.code === 'DEPENDENCY_BLOCKED'
    && strings(entry.factIds).includes('fact-exit-continuity'), 'BLOCKED_CONTINUATION');
  const proof = uniqueDiagnosticRole(diagnostics, (entry) => entry.code === 'DEPENDENCY_BLOCKED'
    && !strings(entry.factIds).includes('fact-exit-continuity'), 'BLOCKED_PROOF');
  const roles = {
    sourceResolutionIntentNodeId: compiledRoleIds[0],
    generatedIslandIntentNodeId: generated,
    nativeContinuationIntentNodeId: continuation,
    proofIntentNodeId: proof,
  };
  if (new Set(Object.values(roles)).size !== 4) fail('BLOCKED_ROLE_SET_NOT_DISTINCT');
  if (!sameSet(strings(graph.unresolvedIntentNodeIds), [generated, continuation, proof])) {
    fail('BLOCKED_UNRESOLVED_ROLE_SET_DRIFT');
  }
  return deepFreezeV1(roles);
}

function uniqueDiagnosticRole(
  diagnostics: JsonRecord[],
  predicate: (entry: JsonRecord) => boolean,
  label: string,
): string {
  const matches = diagnostics.filter(predicate);
  const ids = matches.flatMap((entry) => strings(entry.intentNodeIds));
  if (matches.length !== 1 || ids.length !== 1) fail(`${label}_AMBIGUOUS:${ids.join('|') || 'NONE'}`);
  return ids[0];
}

function uniqueRole(nodes: JsonRecord[], predicate: (node: JsonRecord) => boolean, role: string): JsonRecord {
  const matches = nodes.filter(predicate);
  if (matches.length !== 1) fail(`${role}_AMBIGUOUS:${matches.map(nodeId).join('|') || 'NONE'}`);
  return matches[0];
}

function uniqueNodes(nodes: JsonRecord[]): Map<string, JsonRecord> {
  const result = new Map<string, JsonRecord>();
  for (const node of nodes) {
    const id = nodeId(node);
    if (!id || result.has(id)) fail(`NODE_ID_INVALID:${id || 'EMPTY'}`);
    result.set(id, node);
  }
  return result;
}

function hasDependencyPath(from: string, to: string, dependencies: Map<string, Set<string>>): boolean {
  const pending = [to];
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.pop() as string;
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(dependencies.get(current) ?? []));
  }
  return false;
}

function nodeId(node: JsonRecord): string { return text(node.intentNodeId); }
function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
function record(value: unknown): JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function fail(message: string): never { throw new Error(`DEV02_STAGE4_ROLE_RESOLUTION:${message}`); }
