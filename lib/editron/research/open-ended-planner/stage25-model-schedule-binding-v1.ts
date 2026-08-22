import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeToolSetV2R } from './provider-native-tool-catalog-v2r';
import {
  STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1,
  scheduleStage25GraphV1,
  type Stage25ConcurrencyClassV1,
  type Stage25SchedulableNodeV1,
  type Stage25ScheduledNodeKindV1,
  type Stage25SchedulerGraphV1,
  type Stage25StabilityRequirementV1,
} from './stage25-dependency-scheduler-v1';
import type {
  Stage25EffectRegionV1,
  Stage25ProjectTimebaseRefV1,
} from './stage25-proposal-reconciliation-v1';

export const STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1 =
  'EDITRON_OE_STAGE25_MODEL_SCHEDULE_BINDING_V1' as const;

type JsonRecord = Record<string, unknown>;
type EffectClassV1 = 'READ' | 'WRITE' | 'REQUIRE' | 'PRODUCE' | 'INVALIDATE';

export interface Stage25EffectBindingTraceV1 {
  effectClass: EffectClassV1;
  declaredEffectRef: string;
  boundRegionIds: readonly string[];
  boundArtifactRefs: readonly string[];
}

export interface Stage25OperatorEffectResolutionV1 {
  schemaVersion: typeof STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1;
  authority: 'OPERATOR_EFFECT_OWNER_ISSUED_RESEARCH_ONLY';
  nodeId: string;
  operatorId: string;
  compiledNodeHash: string;
  plannerRecordHash: string;
  effectContractHash: string;
  readRegions: readonly Stage25EffectRegionV1[];
  writeRegions: readonly Stage25EffectRegionV1[];
  requiredArtifactRefs: readonly string[];
  producedArtifactRefs: readonly string[];
  invalidatedArtifactRefs: readonly string[];
  traces: readonly Stage25EffectBindingTraceV1[];
  stabilityRequirement: Stage25StabilityRequirementV1;
  whatHasNotBeenChecked: readonly string[];
  stateEffects: readonly [];
  resolutionHash: string;
}

export interface Stage25OperatorEffectResolutionRefV1 {
  nodeId: string;
  opaqueResolutionRef: string;
  expectedResolutionHash: string;
}

export interface Stage25ModelScheduleBindingResultV1 {
  graph: Readonly<Stage25SchedulerGraphV1>;
  schedule: ReturnType<typeof scheduleStage25GraphV1>;
  receipt: Readonly<JsonRecord>;
}

export async function bindModelSelectedGraphToStage25ScheduleV1(input: Readonly<{
  taskId: string;
  graphId: string;
  editorialIntent: unknown;
  compiledGraph: unknown;
  toolSet: Readonly<ProviderNativeToolSetV2R>;
  timebase: Stage25ProjectTimebaseRefV1;
  currentStability: Stage25StabilityRequirementV1;
  initialArtifactRefs: readonly string[];
  requiredFinalArtifactRefs: readonly string[];
  limits: Stage25SchedulerGraphV1['limits'];
  effectResolutionRefs: readonly Stage25OperatorEffectResolutionRefV1[];
  resolveEffectResolution: (opaqueRef: string) => unknown | Promise<unknown>;
}>): Promise<Readonly<Stage25ModelScheduleBindingResultV1>> {
  validateToolSet(input.toolSet);
  const compiled = record(input.compiledGraph);
  const editorial = record(input.editorialIntent);
  if (compiled.artifactType !== 'CompiledOperationGraphV2'
    || compiled.compileDisposition !== 'COMPILED_RESEARCH_PROXY'
    || compiled.executionEligibility !== 'RESEARCH_PROXY_ONLY') fail('COMPILED_GRAPH_NOT_ELIGIBLE');
  if (compiled.sourceEditorialIntentHash !== hashCanonicalJsonV1(input.editorialIntent)) fail('EDITORIAL_INTENT_HASH_DRIFT');
  const lowering = record(compiled.lowering);
  if (lowering.zeroAdd !== true || lowering.zeroDrop !== true) fail('LOWERING_NOT_ZERO_ADD_ZERO_DROP');

  const intentNodes = indexUnique(records(editorial.nodes), 'intentNodeId', 'INTENT_NODE');
  const compiledNodes = indexUnique(records(compiled.nodes), 'nodeId', 'COMPILED_NODE');
  if (intentNodes.size !== compiledNodes.size) fail('SELECTED_COMPILED_NODE_COUNT_DRIFT');
  validateSelectedCompilation(intentNodes, compiledNodes);

  const refs = indexUnique(input.effectResolutionRefs as unknown as JsonRecord[], 'nodeId', 'EFFECT_RESOLUTION_REF');
  if (refs.size !== compiledNodes.size) fail('EFFECT_RESOLUTION_REF_COUNT_DRIFT');
  const tools = new Map(input.toolSet.operators.map((tool) => [tool.operatorId, tool]));
  const resolutions = new Map<string, Stage25OperatorEffectResolutionV1>();
  for (const [nodeId, compiledNode] of compiledNodes) {
    const ref = refs.get(nodeId) ?? fail(`EFFECT_RESOLUTION_REF_MISSING:${nodeId}`);
    const opaqueRef = text(ref.opaqueResolutionRef);
    if (!opaqueRef) fail(`EFFECT_RESOLUTION_OPAQUE_REF_MISSING:${nodeId}`);
    const resolved = await input.resolveEffectResolution(opaqueRef);
    const resolution = resolved as Stage25OperatorEffectResolutionV1;
    validateEffectResolution(resolution, text(ref.expectedResolutionHash), compiledNode, tools);
    resolutions.set(nodeId, resolution);
  }

  const dataDependencies = compiledDataDependencies(compiled, compiledNodes);
  const preNodes = [...compiledNodes.values()].map((node) => {
    const nodeId = text(node.nodeId);
    const resolution = resolutions.get(nodeId) ?? fail(`EFFECT_RESOLUTION_MISSING:${nodeId}`);
    const intent = intentNodes.get(text(node.intentNodeId)) ?? fail(`INTENT_NODE_MISSING:${nodeId}`);
    const kind = schedulerKind(text(node.operatorId), tools);
    return {
      nodeId,
      kind,
      dependsOnNodeIds: unique([
        ...strings(intent.requiresNodeIds).map((id) => `compile-${id}`),
        ...(dataDependencies.get(nodeId) ?? []),
      ]),
      requires: unique([
        ...resolution.requiredArtifactRefs,
        ...dataRequirementsFor(nodeId, compiled, compiledNodes),
      ]),
      produces: unique([...strings(node.produces), ...resolution.producedArtifactRefs]),
      invalidates: [...resolution.invalidatedArtifactRefs],
      reads: [...resolution.readRegions],
      writes: [...resolution.writeRegions],
      stabilityRequirement: resolution.stabilityRequirement,
      concurrencyClass: concurrencyFor(kind),
      whatHasNotBeenChecked: [...resolution.whatHasNotBeenChecked],
    };
  });
  const nodes = preNodes.map((node) => ({
    ...node,
    revisionInput: revisionInputFor(node.nodeId, preNodes, text(compiled.expectedProjectRevision)),
  })) satisfies Stage25SchedulableNodeV1[];
  const unsignedGraph = {
    schemaVersion: STAGE25_DEPENDENCY_SCHEDULER_VERSION_V1,
    graphId: input.graphId,
    projectId: text(compiled.projectId),
    baseProjectRevision: text(compiled.expectedProjectRevision),
    timebase: { ...input.timebase },
    currentStability: input.currentStability,
    initialArtifactRefs: unique([...input.initialArtifactRefs]),
    requiredFinalArtifactRefs: unique([...input.requiredFinalArtifactRefs]),
    limits: { ...input.limits },
    nodes,
  };
  const graph = deepFreezeV1({ ...unsignedGraph, graphHash: hashCanonicalJsonV1(unsignedGraph) });
  const schedule = scheduleStage25GraphV1(graph);
  const receiptMaterial = {
    schemaVersion: STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1,
    authority: 'RESEARCH_ONLY_NO_EXECUTION_OR_PROJECT_MUTATION',
    taskId: input.taskId,
    sourceEditorialIntentHash: hashCanonicalJsonV1(input.editorialIntent),
    sourceCompiledGraphHash: hashCanonicalJsonV1(input.compiledGraph),
    sourceToolSetHash: input.toolSet.toolSetSha256,
    effectResolutionHashes: [...resolutions.values()].map(({ resolutionHash }) => resolutionHash),
    graphHash: graph.graphHash,
    scheduleHash: schedule.scheduleHash,
    selectedOperatorIds: [...intentNodes.values()].map((node) => text(node.selectedOperatorId)),
    compiledOperatorIds: [...compiledNodes.values()].map((node) => text(node.operatorId)),
    zeroAdd: true,
    zeroDrop: true,
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({ ...receiptMaterial, receiptHash: hashCanonicalJsonV1(receiptMaterial) });
  return deepFreezeV1({ graph, schedule, receipt });
}

function validateToolSet(toolSet: Readonly<ProviderNativeToolSetV2R>): void {
  const unsigned = { ...toolSet } as Record<string, unknown>;
  delete unsigned.toolSetSha256;
  if (toolSet.toolSetSha256 !== hashCanonicalJsonV1(unsigned)) fail('TOOL_SET_HASH_INVALID');
}

function validateSelectedCompilation(intents: Map<string, JsonRecord>, compiled: Map<string, JsonRecord>): void {
  for (const [intentNodeId, intent] of intents) {
    const selected = text(intent.selectedOperatorId);
    if (!selected) fail(`SELECTED_OPERATOR_MISSING:${intentNodeId}`);
    const compiledNode = compiled.get(`compile-${intentNodeId}`) ?? fail(`COMPILED_NODE_MISSING:${intentNodeId}`);
    if (compiledNode.intentNodeId !== intentNodeId || compiledNode.operatorId !== selected) fail(`COMPILED_OPERATOR_DRIFT:${intentNodeId}`);
    const expectedDependencies = strings(intent.requiresNodeIds).map((id) => `compile-${id}`);
    if (!sameSet(strings(compiledNode.requires), expectedDependencies)) fail(`COMPILED_DEPENDENCY_DRIFT:${intentNodeId}`);
  }
  for (const node of compiled.values()) if (!intents.has(text(node.intentNodeId))) fail(`COMPILED_NODE_ADDED:${text(node.nodeId)}`);
}

function validateEffectResolution(
  value: Stage25OperatorEffectResolutionV1,
  expectedHash: string,
  compiledNode: JsonRecord,
  tools: Map<string, ProviderNativeToolSetV2R['operators'][number]>,
): void {
  if (!value || value.schemaVersion !== STAGE25_MODEL_SCHEDULE_BINDING_VERSION_V1
    || value.authority !== 'OPERATOR_EFFECT_OWNER_ISSUED_RESEARCH_ONLY'
    || value.stateEffects?.length) fail('EFFECT_RESOLUTION_SCHEMA_INVALID');
  const unsigned = { ...value } as Record<string, unknown>; delete unsigned.resolutionHash;
  if (value.resolutionHash !== hashCanonicalJsonV1(unsigned) || value.resolutionHash !== expectedHash) fail(`EFFECT_RESOLUTION_HASH_INVALID:${text(compiledNode.nodeId)}`);
  if (value.nodeId !== compiledNode.nodeId || value.operatorId !== compiledNode.operatorId
    || value.compiledNodeHash !== hashCanonicalJsonV1(compiledNode)) fail(`EFFECT_RESOLUTION_NODE_DRIFT:${text(compiledNode.nodeId)}`);
  const tool = tools.get(value.operatorId) ?? fail(`EFFECT_RESOLUTION_TOOL_MISSING:${value.operatorId}`);
  if (value.plannerRecordHash !== hashCanonicalJsonV1(tool.plannerRecord)
    || value.effectContractHash !== hashCanonicalJsonV1(record(tool.plannerRecord.effects))) fail(`EFFECT_RESOLUTION_CONTRACT_DRIFT:${value.nodeId}`);
  validateTraceCoverage(value, record(tool.plannerRecord.effects));
}

function validateTraceCoverage(value: Stage25OperatorEffectResolutionV1, effects: JsonRecord): void {
  const expected: Record<EffectClassV1, string[]> = {
    READ: strings(effects.reads), WRITE: strings(effects.writes), REQUIRE: strings(effects.requires),
    PRODUCE: strings(effects.produces), INVALIDATE: strings(effects.invalidates),
  };
  const readIds = new Set(value.readRegions.map(({ regionId }) => regionId));
  const writeIds = new Set(value.writeRegions.map(({ regionId }) => regionId));
  const required = new Set(value.requiredArtifactRefs); const produced = new Set(value.producedArtifactRefs);
  const invalidated = new Set(value.invalidatedArtifactRefs);
  for (const effectClass of Object.keys(expected) as EffectClassV1[]) {
    const traces = value.traces.filter((trace) => trace.effectClass === effectClass);
    if (!sameSet(traces.map(({ declaredEffectRef }) => declaredEffectRef), expected[effectClass])) fail(`EFFECT_TRACE_COVERAGE_INVALID:${value.nodeId}:${effectClass}`);
    for (const trace of traces) {
      const regionSet = effectClass === 'READ' ? readIds : effectClass === 'WRITE' ? writeIds : new Set<string>();
      const artifactSet = effectClass === 'READ' || effectClass === 'REQUIRE' ? required
        : effectClass === 'PRODUCE' ? produced : effectClass === 'INVALIDATE' ? invalidated : new Set<string>();
      const requiresRegion = effectClass === 'WRITE' || (effectClass === 'READ' && /^(PROJECT_PATH|TIMELINE_RANGE)\|/.test(trace.declaredEffectRef));
      if (requiresRegion !== Boolean(trace.boundRegionIds.length) || (requiresRegion && trace.boundArtifactRefs.length)) fail(`EFFECT_TRACE_BINDING_KIND_INVALID:${value.nodeId}:${trace.declaredEffectRef}`);
      if (!requiresRegion && (!trace.boundArtifactRefs.length || trace.boundRegionIds.length)) fail(`EFFECT_TRACE_BINDING_KIND_INVALID:${value.nodeId}:${trace.declaredEffectRef}`);
      if (trace.boundRegionIds.some((id) => !regionSet.has(id)) || trace.boundArtifactRefs.some((ref) => !artifactSet.has(ref))) fail(`EFFECT_TRACE_TARGET_INVALID:${value.nodeId}:${trace.declaredEffectRef}`);
    }
  }
  const tracedRegions = new Set(value.traces.flatMap(({ boundRegionIds }) => boundRegionIds));
  const tracedArtifacts = new Set(value.traces.flatMap(({ boundArtifactRefs }) => boundArtifactRefs));
  if ([...readIds, ...writeIds].some((id) => !tracedRegions.has(id))
    || [...required, ...produced, ...invalidated].some((ref) => !tracedArtifacts.has(ref))) fail(`EFFECT_RESOLUTION_UNTRACED_BINDING:${value.nodeId}`);
}

function schedulerKind(operatorId: string, tools: Map<string, ProviderNativeToolSetV2R['operators'][number]>): Stage25ScheduledNodeKindV1 {
  const kind = tools.get(operatorId)?.kind;
  if (kind === 'READ') return 'READ';
  if (kind === 'RESOLVER') return 'ANALYSIS';
  if (kind === 'MUTATION') return 'MUTATION';
  if (kind === 'GENERATED_COMPOSITION') return 'RENDER';
  return fail(`SCHEDULER_KIND_UNSUPPORTED:${operatorId}:${kind ?? ''}`);
}

function concurrencyFor(kind: Stage25ScheduledNodeKindV1): Stage25ConcurrencyClassV1 {
  return kind === 'MUTATION' ? 'PROJECT_MUTATION_EXCLUSIVE'
    : kind === 'RENDER' ? 'RENDER_RESOURCE' : 'READ_SHARED';
}

function compiledDataDependencies(compiled: JsonRecord, nodes: Map<string, JsonRecord>): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const edge of records(compiled.edges).filter(({ edgeType }) => edgeType === 'DATA')) {
    const from = text(edge.fromNodeId); const to = text(edge.toNodeId); const port = text(edge.fromPort);
    if (!nodes.has(from) || !nodes.has(to) || !strings(nodes.get(from)?.produces).includes(`${from}.${port}`)) fail('COMPILED_DATA_EDGE_INVALID');
    result.set(to, unique([...(result.get(to) ?? []), from]));
  }
  return result;
}

function dataRequirementsFor(nodeId: string, compiled: JsonRecord, nodes: Map<string, JsonRecord>): string[] {
  return records(compiled.edges).filter((edge) => edge.edgeType === 'DATA' && edge.toNodeId === nodeId)
    .map((edge) => { const ref = `${text(edge.fromNodeId)}.${text(edge.fromPort)}`; if (!nodes.has(text(edge.fromNodeId))) fail('COMPILED_DATA_EDGE_INVALID'); return ref; });
}

function revisionInputFor(nodeId: string, nodes: readonly Omit<Stage25SchedulableNodeV1, 'revisionInput'>[], base: string): Stage25SchedulableNodeV1['revisionInput'] {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const ancestors = new Set<string>(); const pending = [...(byId.get(nodeId)?.dependsOnNodeIds ?? [])];
  while (pending.length) { const next = pending.pop() as string; if (ancestors.has(next)) continue; ancestors.add(next); pending.push(...(byId.get(next)?.dependsOnNodeIds ?? [])); }
  const mutations = [...ancestors].filter((id) => byId.get(id)?.kind === 'MUTATION');
  const latest = mutations.filter((candidate) => !mutations.some((other) => other !== candidate && isAncestor(candidate, other, byId)));
  if (latest.length > 1) fail(`REVISION_ORIGIN_AMBIGUOUS:${nodeId}`);
  return latest.length ? { origin: 'WRITER_RECEIPT', producerNodeId: latest[0], receiptRef: `${latest[0]}.receipt` }
    : { origin: 'GRAPH_BASE', expectedProjectRevision: base };
}

function isAncestor(candidate: string, nodeId: string, nodes: Map<string, Omit<Stage25SchedulableNodeV1, 'revisionInput'>>): boolean {
  const seen = new Set<string>(); const pending = [...(nodes.get(nodeId)?.dependsOnNodeIds ?? [])];
  while (pending.length) { const next = pending.pop() as string; if (next === candidate) return true; if (seen.has(next)) continue; seen.add(next); pending.push(...(nodes.get(next)?.dependsOnNodeIds ?? [])); }
  return false;
}

function indexUnique(values: JsonRecord[], field: string, label: string): Map<string, JsonRecord> {
  const result = new Map<string, JsonRecord>();
  for (const value of values) { const id = text(value[field]); if (!id || result.has(id)) fail(`${label}_IDENTITY_INVALID`); result.set(id, value); }
  return result;
}
function sameSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value)); }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(message: string): never { throw new Error(`STAGE25_MODEL_SCHEDULE_BINDING_${message}`); }
