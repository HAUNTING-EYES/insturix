import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  scheduleStage25GraphV1,
  type Stage25SchedulerGraphV1,
} from './stage25-dependency-scheduler-v1';

export const STAGE25_EPISODE_CHECKPOINT_VERSION_V1 =
  'EDITRON_OE_STAGE25_EPISODE_CHECKPOINT_V1' as const;

export interface Stage25OpaqueResultHandleV1 {
  resultHandleId: string;
  producerNodeId: string;
  artifactRef: string;
  payloadSha256: string;
}

interface CompactedContextV1 {
  transcriptPrefixSha256: string;
  compactedMessageCount: number;
  summarySha256: string;
  includedNodeIds: readonly string[];
}

interface EpisodeBudgetV1 {
  maxTurns: number;
  turnsConsumed: number;
  maxSpendUsdMicros: string;
  spendConsumedUsdMicros: string;
}

export interface Stage25EpisodeCheckpointV1 {
  schemaVersion: typeof STAGE25_EPISODE_CHECKPOINT_VERSION_V1;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION_OR_PLAN_AUTHORITY';
  checkpointId: string;
  planId: string;
  graphHash: string;
  scheduleHash: string;
  projectId: string;
  baseProjectRevision: string;
  activeNodeId: string;
  completedNodeIds: readonly string[];
  resultHandles: readonly Readonly<Stage25OpaqueResultHandleV1>[];
  revisionOrigin:
    | Readonly<{ origin: 'GRAPH_BASE' }>
    | Readonly<{ origin: 'WRITER_RECEIPT'; producerNodeId: string; resultHandleId: string }>;
  compactedContext: Readonly<CompactedContextV1>;
  budget: Readonly<EpisodeBudgetV1>;
  whatHasNotBeenChecked: readonly Readonly<{ nodeId: string; checks: readonly string[] }>[];
  priorCheckpointHash: string | null;
  stateEffects: readonly [];
  checkpointHash: string;
}

type CreateCheckpointInputV1 = Readonly<{
  checkpointId: string;
  planId: string;
  graph: Readonly<Stage25SchedulerGraphV1>;
  activeNodeId: string;
  completedNodeIds: readonly string[];
  resultHandles: readonly Readonly<Stage25OpaqueResultHandleV1>[];
  revisionOrigin: Stage25EpisodeCheckpointV1['revisionOrigin'];
  compactedContext: Readonly<CompactedContextV1>;
  budget: Readonly<EpisodeBudgetV1>;
  priorCheckpointHash: string | null;
}>;

/**
 * This receipt cannot own a plan or project. A compacted summary is only
 * context; the scheduler graph, opaque result store, and ProjectService
 * revision remain the authorities used to validate resume.
 */
export function createStage25EpisodeCheckpointV1(
  input: CreateCheckpointInputV1,
): Readonly<Stage25EpisodeCheckpointV1> {
  const schedule = scheduleStage25GraphV1(input.graph);
  if (schedule.disposition !== 'PASS') fail('GRAPH_NOT_RUNNABLE');
  validateProgress(input.graph, input.completedNodeIds, input.activeNodeId);
  validateResultHandles(input.graph, input.completedNodeIds, input.resultHandles);
  validateRevisionOrigin(input.graph, input.completedNodeIds, input.revisionOrigin, input.resultHandles);
  validateContext(input.compactedContext, input.graph);
  validateBudget(input.budget);
  requireText(input.checkpointId, 'CHECKPOINT_ID');
  requireText(input.planId, 'PLAN_ID');
  if (input.priorCheckpointHash !== null) sha(input.priorCheckpointHash, 'PRIOR_CHECKPOINT_HASH');
  const material = {
    schemaVersion: STAGE25_EPISODE_CHECKPOINT_VERSION_V1,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION_OR_PLAN_AUTHORITY' as const,
    checkpointId: input.checkpointId,
    planId: input.planId,
    graphHash: input.graph.graphHash,
    scheduleHash: schedule.scheduleHash,
    projectId: input.graph.projectId,
    baseProjectRevision: input.graph.baseProjectRevision,
    activeNodeId: input.activeNodeId,
    completedNodeIds: [...input.completedNodeIds],
    resultHandles: input.resultHandles.map((handle) => ({ ...handle })),
    revisionOrigin: { ...input.revisionOrigin },
    compactedContext: { ...input.compactedContext, includedNodeIds: [...input.compactedContext.includedNodeIds] },
    budget: { ...input.budget },
    whatHasNotBeenChecked: schedule.whatHasNotBeenChecked,
    priorCheckpointHash: input.priorCheckpointHash,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, checkpointHash: hashCanonicalJsonV1(material) });
}

export function resumeStage25EpisodeCheckpointV1(input: Readonly<{
  checkpoint: Readonly<Stage25EpisodeCheckpointV1>;
  graph: Readonly<Stage25SchedulerGraphV1>;
  currentProjectRevision: string;
  resolveOpaquePayload: (resultHandleId: string) => unknown;
}>): Readonly<Record<string, unknown>> {
  validateCheckpointHash(input.checkpoint);
  const rebuilt = createStage25EpisodeCheckpointV1({
    checkpointId: input.checkpoint.checkpointId,
    planId: input.checkpoint.planId,
    graph: input.graph,
    activeNodeId: input.checkpoint.activeNodeId,
    completedNodeIds: input.checkpoint.completedNodeIds,
    resultHandles: input.checkpoint.resultHandles,
    revisionOrigin: input.checkpoint.revisionOrigin,
    compactedContext: input.checkpoint.compactedContext,
    budget: input.checkpoint.budget,
    priorCheckpointHash: input.checkpoint.priorCheckpointHash,
  });
  if (rebuilt.checkpointHash !== input.checkpoint.checkpointHash) fail('GRAPH_OR_DERIVED_STATE_DRIFT');
  const expectedRevision = resolveRevision(input.checkpoint, input.resolveOpaquePayload);
  if (input.currentProjectRevision !== expectedRevision) fail('PROJECT_REVISION_STALE');
  const material = {
    schemaVersion: STAGE25_EPISODE_CHECKPOINT_VERSION_V1,
    authority: 'RESEARCH_VALIDATION_ONLY_NO_PROJECT_MUTATION' as const,
    checkpointHash: input.checkpoint.checkpointHash,
    graphHash: input.checkpoint.graphHash,
    scheduleHash: input.checkpoint.scheduleHash,
    activeNodeId: input.checkpoint.activeNodeId,
    resolvedProjectRevisionSha256: hashCanonicalJsonV1(expectedRevision),
    preservedResultHandleIds: input.checkpoint.resultHandles
      .map(({ resultHandleId }) => resultHandleId).sort(compareText),
    disposition: 'PASS' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptHash: hashCanonicalJsonV1(material) });
}

function validateCheckpointHash(checkpoint: Readonly<Stage25EpisodeCheckpointV1>): void {
  if (checkpoint.schemaVersion !== STAGE25_EPISODE_CHECKPOINT_VERSION_V1
    || checkpoint.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION_OR_PLAN_AUTHORITY'
    || checkpoint.stateEffects.length) fail('CHECKPOINT_ENVELOPE_INVALID');
  const material = { ...checkpoint };
  delete (material as Partial<Stage25EpisodeCheckpointV1>).checkpointHash;
  if (hashCanonicalJsonV1(material) !== checkpoint.checkpointHash) fail('CHECKPOINT_HASH_INVALID');
}

function validateProgress(
  graph: Readonly<Stage25SchedulerGraphV1>, completedIds: readonly string[], activeId: string,
): void {
  unique(completedIds, 'COMPLETED_NODES');
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const active = byId.get(activeId);
  if (!active || completedIds.includes(activeId)) fail('ACTIVE_NODE_INVALID');
  const completed = new Set(completedIds);
  for (const nodeId of completedIds) {
    const node = byId.get(nodeId);
    if (!node) fail(`COMPLETED_NODE_UNKNOWN:${nodeId}`);
    if (node.dependsOnNodeIds.some((id) => !completed.has(id))) {
      fail(`COMPLETED_NODE_DEPENDENCY_MISSING:${nodeId}`);
    }
  }
  if (active.dependsOnNodeIds.some((id) => !completed.has(id))) fail('ACTIVE_NODE_NOT_READY');
}

function validateResultHandles(
  graph: Readonly<Stage25SchedulerGraphV1>, completedIds: readonly string[],
  handles: readonly Readonly<Stage25OpaqueResultHandleV1>[],
): void {
  const completed = new Set(completedIds);
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  unique(handles.map(({ resultHandleId }) => resultHandleId), 'RESULT_HANDLES');
  unique(handles.map(({ artifactRef }) => artifactRef), 'RESULT_ARTIFACTS');
  for (const handle of handles) {
    sha(handle.payloadSha256, 'RESULT_PAYLOAD_HASH');
    const producer = nodes.get(handle.producerNodeId);
    if (!producer || !completed.has(handle.producerNodeId)
      || !producer.produces.includes(handle.artifactRef)) fail('RESULT_HANDLE_ORIGIN_INVALID');
  }
  const handled = new Set(handles.map(({ artifactRef }) => artifactRef));
  for (const nodeId of completedIds) for (const artifact of nodes.get(nodeId)?.produces ?? []) {
    if (!handled.has(artifact)) fail(`COMPLETED_RESULT_HANDLE_MISSING:${nodeId}:${artifact}`);
  }
}

function validateRevisionOrigin(
  graph: Readonly<Stage25SchedulerGraphV1>, completedIds: readonly string[],
  origin: Stage25EpisodeCheckpointV1['revisionOrigin'],
  handles: readonly Readonly<Stage25OpaqueResultHandleV1>[],
): void {
  const completed = new Set(completedIds);
  const mutations = graph.nodes.filter((node) => node.kind === 'MUTATION' && completed.has(node.nodeId));
  if (!mutations.length) {
    if (origin.origin !== 'GRAPH_BASE' || Object.keys(origin).length !== 1) fail('REVISION_ORIGIN_INVALID');
    return;
  }
  const latest = mutations.find((candidate) => !mutations.some((other) => (
    other.nodeId !== candidate.nodeId && dependsOn(graph, other.nodeId, candidate.nodeId)
  )));
  if (!latest || origin.origin !== 'WRITER_RECEIPT' || origin.producerNodeId !== latest.nodeId) {
    fail('REVISION_ORIGIN_INVALID');
  }
  const handle = handles.find(({ resultHandleId }) => resultHandleId === origin.resultHandleId);
  if (!handle || handle.producerNodeId !== latest.nodeId
    || handle.artifactRef !== `${latest.nodeId}.receipt`) fail('REVISION_HANDLE_INVALID');
}

function resolveRevision(
  checkpoint: Readonly<Stage25EpisodeCheckpointV1>, resolver: (id: string) => unknown,
): string {
  const origin = checkpoint.revisionOrigin;
  if (origin.origin === 'GRAPH_BASE') return checkpoint.baseProjectRevision;
  const handle = checkpoint.resultHandles.find(({ resultHandleId }) => (
    resultHandleId === origin.resultHandleId
  ));
  if (!handle) fail('REVISION_HANDLE_MISSING');
  const payload = resolver(handle.resultHandleId);
  if (hashCanonicalJsonV1(payload) !== handle.payloadSha256) fail('RESULT_PAYLOAD_HASH_INVALID');
  if (typeof payload !== 'string' || !payload) fail('REVISION_PAYLOAD_INVALID');
  return payload;
}

function validateContext(context: Readonly<CompactedContextV1>, graph: Readonly<Stage25SchedulerGraphV1>): void {
  sha(context.transcriptPrefixSha256, 'TRANSCRIPT_PREFIX_HASH');
  sha(context.summarySha256, 'SUMMARY_HASH');
  if (!Number.isSafeInteger(context.compactedMessageCount) || context.compactedMessageCount < 0) {
    fail('COMPACTED_MESSAGE_COUNT_INVALID');
  }
  unique(context.includedNodeIds, 'INCLUDED_NODE_IDS');
  const known = new Set(graph.nodes.map(({ nodeId }) => nodeId));
  if (context.includedNodeIds.some((nodeId) => !known.has(nodeId))) fail('INCLUDED_NODE_UNKNOWN');
}

function validateBudget(budget: Readonly<EpisodeBudgetV1>): void {
  let maximum: bigint; let consumed: bigint;
  try { maximum = BigInt(budget.maxSpendUsdMicros); consumed = BigInt(budget.spendConsumedUsdMicros); }
  catch { fail('BUDGET_INVALID'); }
  if (!Number.isSafeInteger(budget.maxTurns) || budget.maxTurns < 1
    || !Number.isSafeInteger(budget.turnsConsumed) || budget.turnsConsumed < 0
    || budget.turnsConsumed > budget.maxTurns || maximum < 0 || consumed < 0
    || consumed > maximum) fail('BUDGET_INVALID');
}

function dependsOn(graph: Readonly<Stage25SchedulerGraphV1>, nodeId: string, ancestorId: string): boolean {
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const pending = [...(byId.get(nodeId)?.dependsOnNodeIds ?? [])];
  const seen = new Set<string>();
  while (pending.length) {
    const next = pending.pop() as string;
    if (next === ancestorId) return true;
    if (seen.has(next)) continue;
    seen.add(next); pending.push(...(byId.get(next)?.dependsOnNodeIds ?? []));
  }
  return false;
}

function unique(values: readonly string[], label: string): void {
  if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) fail(`${label}_INVALID`);
}
function requireText(value: string, label: string): void { if (!value.trim()) fail(`${label}_INVALID`); }
function sha(value: string, label: string): void { if (!/^[a-f0-9]{64}$/.test(value)) fail(`${label}_INVALID`); }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message: string): never { throw new Error(`STAGE25_EPISODE_CHECKPOINT_${message}`); }
