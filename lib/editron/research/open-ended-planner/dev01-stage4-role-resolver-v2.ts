import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1 } from './contracts-v1';
import { evaluateConnectedDevelopmentStageArtifactV2 } from './development-connected-source-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export const DEV01_STAGE4_COMPILER_MATERIALIZATION_POLICY_V1 =
  'EDITRON_OE_DEV01_COMPILER_MATERIALIZATION_POLICY_V1';

interface Dev01CompilerMaterializationRuleV1 {
  nodeId: string;
  operatorId: string;
  impliedByCapabilityIds: readonly string[];
  reasonCode: string;
}

const compilerMaterializationRulesV1: readonly Dev01CompilerMaterializationRuleV1[] = [
  { nodeId: 'compile-read-project', operatorId: 'read_project_file', impliedByCapabilityIds: ['resolve_transcript_edit'], reasonCode: 'INITIAL_PROJECT_READ_FOR_TRANSCRIPT_RESOLUTION' },
  { nodeId: 'compile-read-timeline', operatorId: 'get_timeline_view', impliedByCapabilityIds: ['resolve_transcript_edit'], reasonCode: 'INITIAL_TIMELINE_READ_FOR_TRANSCRIPT_RESOLUTION' },
  { nodeId: 'compile-find-transcript', operatorId: 'find_transcript_moment', impliedByCapabilityIds: ['resolve_transcript_edit'], reasonCode: 'TRANSCRIPT_EVIDENCE_LOOKUP_FOR_SELECTED_RESOLVER' },
  { nodeId: 'compile-find-product', operatorId: 'find_visual_moment', impliedByCapabilityIds: ['resolve_keyframe_edit', 'resolve_visual_edit'], reasonCode: 'VISUAL_EVIDENCE_LOOKUP_FOR_SELECTED_RESOLVER' },
  { nodeId: 'compile-find-audio', operatorId: 'find_audio_moment', impliedByCapabilityIds: ['resolve_audio_edit', 'apply_audio_ducking'], reasonCode: 'AUDIO_EVIDENCE_LOOKUP_FOR_SELECTED_RESOLVER_OR_MUTATION' },
  { nodeId: 'compile-proof-read', operatorId: 'read_project_file', impliedByCapabilityIds: ['apply_audio_ducking'], reasonCode: 'POST_MUTATION_PROJECT_PROOF_READ' },
  { nodeId: 'compile-proof-timeline', operatorId: 'get_timeline_view', impliedByCapabilityIds: ['apply_audio_ducking'], reasonCode: 'POST_MUTATION_TIMELINE_PROOF_READ' },
];

export function resolveDev01CompilerMaterializationTraceV1(input: {
  nodeId: string;
  sourceIntentNodeId: string;
  operatorId: string;
  candidateCapabilityIds: readonly string[];
}): string | null {
  if (!input.nodeId || !input.sourceIntentNodeId || !input.operatorId) {
    fail('COMPILER_MATERIALIZATION_IDENTITY_INVALID');
  }
  const candidates = new Set(input.candidateCapabilityIds);
  if (candidates.has(input.operatorId)) return null;
  const rule = compilerMaterializationRulesV1.find(({ nodeId, operatorId }) =>
    nodeId === input.nodeId && operatorId === input.operatorId);
  if (!rule) fail(`COMPILER_MATERIALIZATION_FORBIDDEN:${input.nodeId}/${input.operatorId}`);
  const impliedBy = rule.impliedByCapabilityIds.filter((capabilityId) => candidates.has(capabilityId));
  if (!impliedBy.length) {
    fail(`COMPILER_MATERIALIZATION_UNSUPPORTED:${input.nodeId}/${input.operatorId}`);
  }
  return [
    DEV01_STAGE4_COMPILER_MATERIALIZATION_POLICY_V1,
    input.nodeId,
    input.operatorId,
    input.sourceIntentNodeId,
    [...impliedBy].sort().join('+'),
    rule.reasonCode,
  ].join(':');
}

export function isDev01CompilerMaterializationTraceV1(value: string): boolean {
  return value.startsWith(`${DEV01_STAGE4_COMPILER_MATERIALIZATION_POLICY_V1}:`);
}

export interface Dev01Stage4RoleSymbolsV2 {
  readProjectIntentNodeId: string;
  readTimelineIntentNodeId: string;
  transcriptFinderIntentNodeId: string;
  transcriptResolverIntentNodeId: string;
  cutIntentNodeId: string;
  visualFinderIntentNodeId: string;
  keyframeResolverIntentNodeId: string;
  pushIntentNodeId: string;
  audioFinderIntentNodeId: string;
  audioResolverIntentNodeId: string | null;
  duckIntentNodeId: string;
  proofReadIntentNodeId: string;
  proofTimelineIntentNodeId: string;
}

export interface Dev01Stage4RoleSourceV2 {
  referenceBlueprint: unknown;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
}

interface Dev01Stage2RoleNodesV2 {
  nodesById: Map<string, JsonRecord>;
  readProject: JsonRecord;
  readTimeline: JsonRecord;
  transcriptFinder: JsonRecord;
  transcriptResolver: JsonRecord;
  cut: JsonRecord;
  visualFinder: JsonRecord;
  keyframeResolver: JsonRecord;
  push: JsonRecord;
  audioFinder: JsonRecord;
  audioResolver: JsonRecord | null;
  duck: JsonRecord;
  proofRead: JsonRecord;
  proofTimeline: JsonRecord;
}

const selectedMutationCapabilities = new Set([
  'cut_section', 'set_keyframes', 'apply_audio_ducking',
]);
const catalogCapabilities = new Map(
  records((operatorCatalogJson as unknown as JsonRecord).operators)
    .map((operator) => [text(operator.operatorId), text(operator.kind)]),
);

export function resolveDev01Stage4RoleSymbolsV2(
  input: Dev01Stage4RoleSourceV2,
): Readonly<Dev01Stage4RoleSymbolsV2> {
  assertConnectedSources(input);
  const roles = resolveDev01Stage2RoleNodesV2(input.editorialIntent);

  const boundNodes = uniqueNodes(records(record(input.evidenceBoundIntent).nodes));
  if (boundNodes.size !== roles.nodesById.size) fail('BOUND_NODE_SET_DRIFT');
  for (const [id, node] of roles.nodesById) {
    const bound = boundNodes.get(id);
    if (!bound || !sameSet(strings(node.candidateCapabilityIds), strings(bound.candidateCapabilityIds))) {
      fail(`BOUND_CAPABILITY_SET_DRIFT:${id}`);
    }
  }

  return deepFreezeV1({
    readProjectIntentNodeId: nodeId(roles.readProject),
    readTimelineIntentNodeId: nodeId(roles.readTimeline),
    transcriptFinderIntentNodeId: nodeId(roles.transcriptFinder),
    transcriptResolverIntentNodeId: nodeId(roles.transcriptResolver),
    cutIntentNodeId: nodeId(roles.cut),
    visualFinderIntentNodeId: nodeId(roles.visualFinder),
    keyframeResolverIntentNodeId: nodeId(roles.keyframeResolver),
    pushIntentNodeId: nodeId(roles.push),
    audioFinderIntentNodeId: nodeId(roles.audioFinder),
    audioResolverIntentNodeId: roles.audioResolver ? nodeId(roles.audioResolver) : null,
    duckIntentNodeId: nodeId(roles.duck),
    proofReadIntentNodeId: nodeId(roles.proofRead),
    proofTimelineIntentNodeId: nodeId(roles.proofTimeline),
  });
}

export function evaluateDev01Stage2RoleCompilabilityV2(editorialIntent: unknown): readonly string[] {
  try {
    resolveDev01Stage2RoleNodesV2(editorialIntent);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

function resolveDev01Stage2RoleNodesV2(editorialIntent: unknown): Dev01Stage2RoleNodesV2 {
  const nodes = records(record(editorialIntent).nodes);
  const nodesById = uniqueNodes(nodes);
  const dependencies = new Map(nodes.map((node) => [nodeId(node), new Set(strings(node.requiresNodeIds))]));
  for (const node of nodes) {
    for (const capabilityId of strings(node.candidateCapabilityIds)) {
      const kind = catalogCapabilities.get(capabilityId);
      if (!kind) fail(`CAPABILITY_UNKNOWN:${capabilityId}`);
      if (!['READ', 'RESOLVER'].includes(kind) && !selectedMutationCapabilities.has(capabilityId)) {
        fail(`CAPABILITY_FORBIDDEN:${capabilityId}`);
      }
    }
  }
  const transcriptResolver = uniqueCapabilityNode(nodes, 'resolve_transcript_edit');
  const transcriptFinder = optionalCapabilityNode(nodes, 'find_transcript_moment') ?? transcriptResolver;
  const cut = uniqueCapabilityNode(nodes, 'cut_section');
  const keyframeResolver = uniqueCapabilityNode(nodes, 'resolve_keyframe_edit');
  const visualFinder = optionalCapabilityNode(nodes, 'find_visual_moment') ?? keyframeResolver;
  const push = uniqueCapabilityNode(nodes, 'set_keyframes');
  const audioResolver = optionalCapabilityNode(nodes, 'resolve_audio_edit');
  const duck = uniqueCapabilityNode(nodes, 'apply_audio_ducking');
  const audioFinder = optionalCapabilityNode(nodes, 'find_audio_moment') ?? audioResolver ?? duck;
  requireRoleDependency(transcriptFinder, transcriptResolver, dependencies, 'TRANSCRIPT_FIND_BEFORE_RESOLVE');
  requireRoleDependency(visualFinder, keyframeResolver, dependencies, 'VISUAL_FIND_BEFORE_RESOLVE');
  requireRoleDependency(audioFinder, audioResolver ?? duck, dependencies, 'AUDIO_FIND_BEFORE_RESOLVE_OR_DUCK');
  if (audioResolver) requireRoleDependency(audioResolver, duck, dependencies, 'AUDIO_RESOLVE_BEFORE_DUCK');
  const mutationIds = [nodeId(cut), nodeId(push), nodeId(duck)];
  const readProject = initialReadRole(nodes, 'read_project_file', mutationIds, transcriptResolver, dependencies);
  const readTimeline = initialReadRole(nodes, 'get_timeline_view', mutationIds, transcriptResolver, dependencies);
  const proofRead = proofReadRole(nodes, 'read_project_file', mutationIds, readProject, duck, dependencies);
  const proofTimeline = proofReadRole(nodes, 'get_timeline_view', mutationIds, readTimeline, duck, dependencies);
  return {
    nodesById, readProject, readTimeline, transcriptFinder, transcriptResolver, cut,
    visualFinder, keyframeResolver, push, audioFinder, audioResolver, duck, proofRead, proofTimeline,
  };
}

function assertConnectedSources(input: Dev01Stage4RoleSourceV2): void {
  const stageTwo = evaluateConnectedDevelopmentStageArtifactV2({
    taskId: 'DEV-01', stage: 2,
    priorArtifact: input.referenceBlueprint,
    artifact: input.editorialIntent,
  });
  if (stageTwo.disposition !== 'PASS' || stageTwo.diagnostics.length) {
    fail(`STAGE2_SOURCE_INVALID:${stageTwo.diagnostics.join(',')}`);
  }
  const stageThree = evaluateConnectedDevelopmentStageArtifactV2({
    taskId: 'DEV-01', stage: 3,
    priorArtifact: input.editorialIntent,
    evidencePack: input.evidencePack,
    artifact: input.evidenceBoundIntent,
  });
  if (stageThree.disposition !== 'PASS' || stageThree.diagnostics.length) {
    fail(`STAGE3_SOURCE_INVALID:${stageThree.diagnostics.join(',')}`);
  }
}

function uniqueCapabilityNode(nodes: JsonRecord[], capabilityId: string): JsonRecord {
  const matches = nodes.filter((node) => strings(node.candidateCapabilityIds).includes(capabilityId));
  if (matches.length !== 1) fail(`CAPABILITY_ROLE_AMBIGUOUS:${capabilityId}:${matches.map(nodeId).join('|') || 'NONE'}`);
  return matches[0];
}

function optionalCapabilityNode(nodes: JsonRecord[], capabilityId: string): JsonRecord | null {
  const matches = nodes.filter((node) => strings(node.candidateCapabilityIds).includes(capabilityId));
  if (matches.length > 1) fail(`CAPABILITY_ROLE_AMBIGUOUS:${capabilityId}:${matches.map(nodeId).join('|')}`);
  return matches[0] ?? null;
}

function initialReadRole(
  nodes: JsonRecord[], capabilityId: string, mutationIds: string[],
  semanticFallback: JsonRecord,
  dependencies: Map<string, Set<string>>,
): JsonRecord {
  const declared = nodes.filter((node) => strings(node.candidateCapabilityIds).includes(capabilityId));
  const candidates = declared.filter((node) =>
    mutationIds.every((mutationId) => dependsOn(mutationId, nodeId(node), dependencies)));
  if (candidates.length > 1) fail(`INITIAL_READ_ROLE_AMBIGUOUS:${capabilityId}:${candidates.map(nodeId).join('|')}`);
  if (candidates.length === 1) return candidates[0];
  if (declared.length) fail(`INITIAL_READ_ROLE_DISCONNECTED:${capabilityId}:${declared.map(nodeId).join('|')}`);
  return semanticFallback;
}

function proofReadRole(
  nodes: JsonRecord[], capabilityId: string, mutationIds: string[], explicitFallback: JsonRecord,
  semanticFallback: JsonRecord,
  dependencies: Map<string, Set<string>>,
): JsonRecord {
  const candidates = nodes.filter((node) => strings(node.candidateCapabilityIds).includes(capabilityId)
    && mutationIds.every((mutationId) => dependsOn(nodeId(node), mutationId, dependencies)));
  if (candidates.length > 1) fail(`PROOF_READ_ROLE_AMBIGUOUS:${capabilityId}:${candidates.map(nodeId).join('|')}`);
  if (candidates.length === 1) return candidates[0];
  return strings(explicitFallback.candidateCapabilityIds).includes(capabilityId)
    ? explicitFallback
    : semanticFallback;
}

function requireRoleDependency(
  prerequisite: JsonRecord,
  dependent: JsonRecord,
  dependencies: Map<string, Set<string>>,
  label: string,
): void {
  if (prerequisite === dependent) return;
  if (!dependsOn(nodeId(dependent), nodeId(prerequisite), dependencies)) {
    fail(`CAPABILITY_ROLE_DEPENDENCY_MISSING:${label}:${nodeId(prerequisite)}->${nodeId(dependent)}`);
  }
}

function dependsOn(node: string, required: string, dependencies: Map<string, Set<string>>): boolean {
  const pending = [...(dependencies.get(node) ?? [])];
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.pop() as string;
    if (current === required) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(dependencies.get(current) ?? []));
  }
  return false;
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
function fail(message: string): never { throw new Error(`DEV01_STAGE4_ROLE_RESOLUTION:${message}`); }
