import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  stage25EffectRegionsIntersectV1, validateStage25EffectRegionV1,
  type Stage25EffectRegionV1, type Stage25ProjectTimebaseRefV1,
} from './stage25-proposal-reconciliation-v1';

export const STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1 = 'EDITRON_OE_STAGE25_DEPENDENCY_SCHEDULER_V1' as const;
const STABILITY_ORDER = ['NONE', 'RANGE_STABLE', 'PICTURE_LOCK', 'FINAL_CONFORM'] as const;
const NODE_KINDS = ['READ', 'ANALYSIS', 'PROPOSAL', 'MUTATION', 'RENDER', 'PROOF'] as const;

export type Stage25StabilityRequirementV1 = (typeof STABILITY_ORDER)[number];
export type Stage25ScheduledNodeKindV1 = (typeof NODE_KINDS)[number];
export type Stage25ConcurrencyClassV1 = 'READ_SHARED' | 'PROPOSAL_ISOLATED' | 'PROJECT_MUTATION_EXCLUSIVE' | 'RENDER_RESOURCE';
export type Stage25RevisionInputV1 =
  | { origin: 'GRAPH_BASE'; expectedProjectRevision: string }
  | { origin: 'WRITER_RECEIPT'; producerNodeId: string; receiptRef: string };

export interface Stage25SchedulableNodeV1 {
  nodeId: string;
  kind: Stage25ScheduledNodeKindV1;
  dependsOnNodeIds: readonly string[];
  requires: readonly string[];
  produces: readonly string[];
  invalidates: readonly string[];
  reads: readonly Stage25EffectRegionV1[];
  writes: readonly Stage25EffectRegionV1[];
  stabilityRequirement: Stage25StabilityRequirementV1;
  concurrencyClass: Stage25ConcurrencyClassV1;
  revisionInput: Stage25RevisionInputV1;
  whatHasNotBeenChecked: readonly string[];
}

export interface Stage25SchedulerGraphV1 {
  schemaVersion: typeof STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1;
  graphId: string;
  projectId: string;
  baseProjectRevision: string;
  timebase: Stage25ProjectTimebaseRefV1;
  currentStability: Stage25StabilityRequirementV1;
  initialArtifactRefs: readonly string[];
  requiredFinalArtifactRefs: readonly string[];
  limits: { maxNodeCount: number; maxParallelNodes: number; maxRenderNodes: number };
  nodes: readonly Stage25SchedulableNodeV1[];
  graphHash: string;
}

export interface Stage25ScheduleV1 {
  schemaVersion: typeof STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1;
  authority: 'RESEARCH_ONLY_NO_EXECUTION_OR_PROJECT_MUTATION';
  graphHash: string;
  disposition: 'PASS' | 'BLOCKED_STABILITY';
  blockedNodeIds: readonly string[];
  waves: readonly { waveIndex: number; nodeIds: readonly string[] }[];
  finalAvailableArtifactRefs: readonly string[];
  whatHasNotBeenChecked: readonly { nodeId: string; checks: readonly string[] }[];
  stateEffects: readonly [];
  scheduleHash: string;
}

// Mechanical only: this scheduler orders declared work and must never invent an edit or dependency.
export function scheduleStage25GraphV1(graph: Stage25SchedulerGraphV1): Readonly<Stage25ScheduleV1> {
  validateGraph(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const successors = new Map(graph.nodes.map(({ nodeId }) => [nodeId, new Set<string>()]));
  const addEdge = (from: string, to: string) => { successors.get(from)?.add(to); };
  for (const node of graph.nodes) for (const dependency of node.dependsOnNodeIds) addEdge(dependency, node.nodeId);

  const producerByArtifact = new Map<string, string>();
  for (const node of graph.nodes) for (const artifact of node.produces) {
    if (producerByArtifact.has(artifact)) fail(`MULTIPLE_ARTIFACT_PRODUCERS:${artifact}`);
    producerByArtifact.set(artifact, node.nodeId);
  }
  for (const node of graph.nodes) for (const artifact of node.requires) {
    const producer = producerByArtifact.get(artifact);
    if (producer === node.nodeId) fail(`SELF_PRODUCED_REQUIREMENT:${node.nodeId}:${artifact}`);
    if (producer) addEdge(producer, node.nodeId);
    else if (!graph.initialArtifactRefs.includes(artifact)) fail(`REQUIRED_ARTIFACT_MISSING:${node.nodeId}:${artifact}`);
  }

  assertAcyclic(nodes, successors);
  const reaches = buildReachability(nodes, successors);
  validateMutationOrder(graph.nodes, reaches);
  validateRevisionInputs(graph, reaches);
  validateDataHazards(graph.nodes, reaches);
  validateInvalidations(graph, producerByArtifact, reaches);

  const blockedNodeIds = graph.nodes
    .filter((node) => stabilityRank(node.stabilityRequirement) > stabilityRank(graph.currentStability))
    .map(({ nodeId }) => nodeId).sort();
  const disposition = blockedNodeIds.length ? 'BLOCKED_STABILITY' as const : 'PASS' as const;
  const waves = disposition === 'PASS' ? buildWaves(graph, successors) : [];
  const unsigned = {
    schemaVersion: STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1,
    authority: 'RESEARCH_ONLY_NO_EXECUTION_OR_PROJECT_MUTATION' as const,
    graphHash: graph.graphHash,
    disposition,
    blockedNodeIds,
    waves,
    finalAvailableArtifactRefs: finalAvailableArtifacts(graph, producerByArtifact, reaches),
    whatHasNotBeenChecked: [...graph.nodes].sort((left, right) => left.nodeId.localeCompare(right.nodeId))
      .map(({ nodeId, whatHasNotBeenChecked: checks }) => ({ nodeId, checks: [...checks] })),
    stateEffects: [] as const,
  };
  return Object.freeze({ ...unsigned, scheduleHash: hashCanonicalJsonV1(unsigned) });
}

function validateGraph(graph: Stage25SchedulerGraphV1): void {
  if (graph.schemaVersion !== STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1 || graph.graphHash !== hashWithout(graph, 'graphHash')) fail('GRAPH_HASH_INVALID');
  requireText(graph.graphId, 'GRAPH_ID'); requireText(graph.projectId, 'PROJECT_ID'); requireText(graph.baseProjectRevision, 'BASE_REVISION');
  requireText(graph.timebase.timebaseId, 'TIMEBASE_ID'); requireText(graph.timebase.version, 'TIMEBASE_VERSION');
  if (!STABILITY_ORDER.includes(graph.currentStability)) fail('CURRENT_STABILITY_INVALID');
  const { maxNodeCount, maxParallelNodes, maxRenderNodes } = graph.limits;
  if (![maxNodeCount, maxParallelNodes, maxRenderNodes].every((value) => Number.isSafeInteger(value) && value > 0)
    || maxParallelNodes > maxNodeCount || maxRenderNodes > maxParallelNodes || graph.nodes.length > maxNodeCount) fail('RESOURCE_LIMITS_INVALID');
  uniqueText(graph.initialArtifactRefs, 'INITIAL_ARTIFACTS'); uniqueText(graph.requiredFinalArtifactRefs, 'FINAL_ARTIFACTS');
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) { if (nodeIds.has(node.nodeId)) fail(`NODE_DUPLICATED:${node.nodeId}`); nodeIds.add(node.nodeId); requireText(node.nodeId, 'NODE_ID'); }
  for (const node of graph.nodes) validateNode(node, nodeIds, graph.timebase);
}

function validateNode(node: Stage25SchedulableNodeV1, nodeIds: Set<string>, timebase: Stage25ProjectTimebaseRefV1): void {
  if (!NODE_KINDS.includes(node.kind) || !STABILITY_ORDER.includes(node.stabilityRequirement)) fail(`NODE_KIND_OR_STABILITY_INVALID:${node.nodeId}`);
  uniqueText(node.dependsOnNodeIds, `DEPENDENCIES:${node.nodeId}`); uniqueText(node.requires, `REQUIRES:${node.nodeId}`);
  uniqueText(node.produces, `PRODUCES:${node.nodeId}`); uniqueText(node.invalidates, `INVALIDATES:${node.nodeId}`); uniqueText(node.whatHasNotBeenChecked, `UNCHECKED:${node.nodeId}`);
  if (node.dependsOnNodeIds.includes(node.nodeId) || node.dependsOnNodeIds.some((id) => !nodeIds.has(id))) fail(`DEPENDENCY_INVALID:${node.nodeId}`);
  const regions = [...node.reads, ...node.writes]; const regionIds = new Set<string>();
  for (const region of regions) { if (regionIds.has(region.regionId)) fail(`REGION_DUPLICATED:${node.nodeId}`); regionIds.add(region.regionId); validateStage25EffectRegionV1(region, timebase); }
  const expectedConcurrency: Stage25ConcurrencyClassV1 = node.kind === 'MUTATION' ? 'PROJECT_MUTATION_EXCLUSIVE'
    : node.kind === 'PROPOSAL' ? 'PROPOSAL_ISOLATED' : node.kind === 'RENDER' ? 'RENDER_RESOURCE' : 'READ_SHARED';
  if (node.concurrencyClass !== expectedConcurrency) fail(`CONCURRENCY_CLASS_INVALID:${node.nodeId}`);
  const writesState = node.kind === 'PROPOSAL' || node.kind === 'MUTATION';
  if (writesState !== Boolean(node.writes.length && node.invalidates.length)) fail(`EFFECT_CONTRACT_INVALID:${node.nodeId}`);
  if (node.kind === 'MUTATION' && !node.produces.includes(`${node.nodeId}.receipt`)) fail(`WRITER_RECEIPT_OUTPUT_MISSING:${node.nodeId}`);
}

function validateMutationOrder(nodes: readonly Stage25SchedulableNodeV1[], reaches: Reachability): void {
  const mutations = nodes.filter(({ kind }) => kind === 'MUTATION');
  forEachPair(mutations, (left, right) => { if (!ordered(left.nodeId, right.nodeId, reaches)) fail(`UNORDERED_PROJECT_MUTATIONS:${left.nodeId}:${right.nodeId}`); });
}

function validateRevisionInputs(graph: Stage25SchedulerGraphV1, reaches: Reachability): void {
  const mutations = graph.nodes.filter(({ kind }) => kind === 'MUTATION');
  for (const node of graph.nodes) {
    const ancestors = mutations.filter((mutation) => mutation.nodeId !== node.nodeId && reaches.get(mutation.nodeId)?.has(node.nodeId));
    const latest = ancestors.find((candidate) => !ancestors.some((other) => other.nodeId !== candidate.nodeId && reaches.get(candidate.nodeId)?.has(other.nodeId)));
    if (!latest) {
      if (node.revisionInput.origin !== 'GRAPH_BASE' || node.revisionInput.expectedProjectRevision !== graph.baseProjectRevision
        || !sameKeys(node.revisionInput, ['expectedProjectRevision', 'origin'])) fail(`REVISION_ORIGIN_INVALID:${node.nodeId}`);
      continue;
    }
    const expectedReceiptRef = `${latest.nodeId}.receipt`;
    if (node.revisionInput.origin !== 'WRITER_RECEIPT' || node.revisionInput.producerNodeId !== latest.nodeId
      || node.revisionInput.receiptRef !== expectedReceiptRef || !latest.produces.includes(expectedReceiptRef)
      || !sameKeys(node.revisionInput, ['origin', 'producerNodeId', 'receiptRef'])) fail(`REVISION_ORIGIN_INVALID:${node.nodeId}`);
  }
}

function validateDataHazards(nodes: readonly Stage25SchedulableNodeV1[], reaches: Reachability): void {
  forEachPair(nodes, (left, right) => {
    const hazard = regionsOverlap(left.writes, right.writes) || regionsOverlap(left.writes, right.reads) || regionsOverlap(right.writes, left.reads);
    if (hazard && !ordered(left.nodeId, right.nodeId, reaches)) fail(`UNORDERED_DATA_HAZARD:${left.nodeId}:${right.nodeId}`);
  });
}

function validateInvalidations(graph: Stage25SchedulerGraphV1, producers: Map<string, string>, reaches: Reachability): void {
  const invalidatorsByArtifact = new Map<string, string[]>();
  for (const node of graph.nodes) for (const artifact of node.invalidates) invalidatorsByArtifact.set(artifact, [...(invalidatorsByArtifact.get(artifact) ?? []), node.nodeId]);
  for (const consumer of graph.nodes) for (const artifact of consumer.requires) {
    const producer = producers.get(artifact); const invalidators = invalidatorsByArtifact.get(artifact) ?? [];
    for (const invalidator of invalidators) {
      if (producer && reaches.get(invalidator)?.has(producer)) continue;
      if (reaches.get(consumer.nodeId)?.has(invalidator)) continue;
      fail(`STALE_OR_UNORDERED_REQUIREMENT:${consumer.nodeId}:${artifact}`);
    }
  }
  for (const artifact of graph.requiredFinalArtifactRefs) {
    const producer = producers.get(artifact); const invalidators = invalidatorsByArtifact.get(artifact) ?? [];
    if (!producer && !graph.initialArtifactRefs.includes(artifact)) fail(`FINAL_ARTIFACT_MISSING:${artifact}`);
    for (const invalidator of invalidators) if (!producer || !reaches.get(invalidator)?.has(producer)) fail(`FINAL_ARTIFACT_STALE:${artifact}`);
  }
}

function buildWaves(graph: Stage25SchedulerGraphV1, successors: Map<string, Set<string>>): { waveIndex: number; nodeIds: string[] }[] {
  const indegree = new Map(graph.nodes.map(({ nodeId }) => [nodeId, 0]));
  for (const targets of successors.values()) for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  const remaining = new Set(indegree.keys()); const waves: { waveIndex: number; nodeIds: string[] }[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((id) => indegree.get(id) === 0).sort();
    if (!ready.length) fail('SCHEDULER_CYCLE');
    const mutation = ready.find((id) => graph.nodes.find((node) => node.nodeId === id)?.kind === 'MUTATION');
    const selected = mutation ? [mutation] : selectParallel(ready, graph);
    waves.push({ waveIndex: waves.length, nodeIds: selected });
    for (const id of selected) { remaining.delete(id); for (const target of successors.get(id) ?? []) indegree.set(target, (indegree.get(target) ?? 0) - 1); }
  }
  return waves;
}

function selectParallel(ready: string[], graph: Stage25SchedulerGraphV1): string[] {
  const selected: string[] = []; let renders = 0;
  for (const id of ready) {
    const node = graph.nodes.find((candidate) => candidate.nodeId === id) ?? fail(`NODE_MISSING:${id}`);
    if (node.kind === 'RENDER' && renders >= graph.limits.maxRenderNodes) continue;
    selected.push(id); if (node.kind === 'RENDER') renders += 1;
    if (selected.length >= graph.limits.maxParallelNodes) break;
  }
  return selected;
}

function finalAvailableArtifacts(graph: Stage25SchedulerGraphV1, producers: Map<string, string>, reaches: Reachability): string[] {
  const available = new Set([...graph.initialArtifactRefs, ...producers.keys()]);
  for (const node of graph.nodes) for (const artifact of node.invalidates) {
    const producer = producers.get(artifact);
    if (!producer || !reaches.get(node.nodeId)?.has(producer)) available.delete(artifact);
  }
  return [...available].sort();
}

type Reachability = Map<string, Set<string>>;
function buildReachability(nodes: Map<string, Stage25SchedulableNodeV1>, successors: Map<string, Set<string>>): Reachability {
  const result = new Map<string, Set<string>>();
  for (const id of nodes.keys()) { const seen = new Set<string>(); const pending = [...(successors.get(id) ?? [])]; while (pending.length) { const next = pending.pop() as string; if (seen.has(next)) continue; seen.add(next); pending.push(...(successors.get(next) ?? [])); } result.set(id, seen); }
  return result;
}
function assertAcyclic(nodes: Map<string, Stage25SchedulableNodeV1>, successors: Map<string, Set<string>>): void { for (const [id, reachable] of buildReachability(nodes, successors)) if (reachable.has(id)) fail(`GRAPH_CYCLE:${id}`); }
function ordered(left: string, right: string, reaches: Reachability): boolean { return Boolean(reaches.get(left)?.has(right) || reaches.get(right)?.has(left)); }
function regionsOverlap(left: readonly Stage25EffectRegionV1[], right: readonly Stage25EffectRegionV1[]): boolean { return left.some((a) => right.some((b) => stage25EffectRegionsIntersectV1(a, b))); }
function stabilityRank(value: Stage25StabilityRequirementV1): number { return STABILITY_ORDER.indexOf(value); }
function forEachPair<T>(values: readonly T[], visit: (left: T, right: T) => void): void { for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) visit(values[left], values[right]); }
function uniqueText(values: readonly string[], label: string): void { if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) fail(`${label}_INVALID`); }
function requireText(value: string, label: string): void { if (!value.trim()) fail(`${label}_INVALID`); }
function sameKeys(value: object, expected: string[]): boolean { const actual = Object.keys(value).sort(); const sorted = [...expected].sort(); return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]); }
function hashWithout<T extends object>(value: T, field: keyof T): string { const unsigned = { ...value }; delete unsigned[field]; return hashCanonicalJsonV1(unsigned); }
function fail(message: string): never { throw new Error(`STAGE25_SCHEDULER_${message}`); }
