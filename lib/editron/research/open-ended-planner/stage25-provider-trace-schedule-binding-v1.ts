import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildOpaqueResultReferenceToolSetV2R,
} from './provider-native-result-references-v2r';
import type {
  ProviderNativeEpisodeContextV2R,
  ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeToolSetV2R } from './provider-native-tool-catalog-v2r';
import {
  bindModelSelectedGraphToStage25ScheduleV1,
  type Stage25ModelScheduleBindingResultV1,
  type Stage25OperatorEffectResolutionRefV1,
} from './stage25-model-schedule-binding-v1';
import type {
  Stage25SchedulerGraphV1,
  Stage25StabilityRequirementV1,
} from './stage25-dependency-scheduler-v1';
import type { Stage25ProjectTimebaseRefV1 } from './stage25-proposal-reconciliation-v1';
import { validateJsonSchemaV2 } from './stage4-compilation-evaluator-v2';

export const STAGE25_PROVIDER_TRACE_SCHEDULE_BINDING_VERSION_V1 =
  'EDITRON_OE_STAGE25_PROVIDER_TRACE_SCHEDULE_BINDING_V1_2' as const;

type JsonRecord = Record<string, unknown>;

export interface Stage25ProviderTraceProjectionV1 {
  editorialIntent: Readonly<JsonRecord>;
  compiledGraph: Readonly<JsonRecord>;
  receipt: Readonly<JsonRecord>;
}

interface ProjectionInputV1 {
  taskId: string;
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  selectedOperationTrace: unknown;
  episodeContext: Readonly<ProviderNativeEpisodeContextV2R>;
  toolSet: Readonly<ProviderNativeToolSetV2R>;
}

// This is a lossless adapter, not a planner: opaque handoffs become DATA edges,
// while the selected operation list remains byte-for-byte the provider's list.
export function projectProviderTraceForStage25ScheduleV1(
  input: Readonly<ProjectionInputV1>,
): Readonly<Stage25ProviderTraceProjectionV1> {
  const trace = validateSourceArtifacts(input);
  const tools = new Map(input.toolSet.operators.map((tool) => [tool.operatorId, tool]));
  const traceNodes = records(trace.nodes).sort((left, right) => number(left.turn) - number(right.turn));
  const byTurn = new Map(traceNodes.map((node) => [number(node.turn), node]));
  const dependencies = new Map<string, string[]>();
  const dataEdges: JsonRecord[] = [];

  for (const node of traceNodes) {
    const targetId = text(node.nodeId);
    const targetOperatorId = text(node.selectedOperatorId);
    const targetTool = tools.get(targetOperatorId) ?? fail(`TRACE_TOOL_MISSING:${targetOperatorId}`);
    const args = record(node.normalizedArguments);
    const targetFields = new Set<string>();
    for (const binding of records(node.argumentReferenceBindings)) {
      const targetField = text(binding.targetField);
      if (!targetField || targetFields.has(targetField)) fail(`REFERENCE_TARGET_INVALID:${targetId}`);
      targetFields.add(targetField);
      const originTurn = number(binding.originTurn);
      const source = byTurn.get(originTurn) ?? fail(`REFERENCE_ORIGIN_MISSING:${targetId}`);
      if (originTurn >= number(node.turn)) fail(`REFERENCE_ORIGIN_NOT_PRIOR:${targetId}`);
      validateReferenceBinding(input, node, source, binding, targetTool);
      const sourceId = text(source.nodeId);
      dependencies.set(targetId, unique([...(dependencies.get(targetId) ?? []), sourceId]));
      dataEdges.push({
        edgeType: 'DATA', fromNodeId: `compile-${sourceId}`,
        fromPort: text(binding.sourceOutputField), toNodeId: `compile-${targetId}`,
        toPort: targetField,
      });
    }
  }
  validateWriterRevisionLineage(input, traceNodes, tools);

  const intentNodes = traceNodes.map((node) => ({
    intentNodeId: text(node.nodeId), selectedOperatorId: text(node.selectedOperatorId),
    alternativeOperatorIds: [] as const, requiresNodeIds: dependencies.get(text(node.nodeId)) ?? [],
  }));
  const editorialIntent = deepFreezeV1({
    artifactType: 'EditorialIntentV2R', taskId: input.taskId,
    sourceProviderEpisodeReceiptHash: input.providerEpisode.receiptSha256,
    sourceSelectedOperationTraceHash: text(trace.artifactSha256), nodes: intentNodes,
  });
  const compiledNodes = traceNodes.map((node) => {
    const nodeId = text(node.nodeId);
    const outgoing = dataEdges.filter((edge) => edge.fromNodeId === `compile-${nodeId}`)
      .map((edge) => `compile-${nodeId}.${text(edge.fromPort)}`);
    const kind = tools.get(text(node.selectedOperatorId))?.kind;
    return {
      nodeId: `compile-${nodeId}`, intentNodeId: nodeId,
      operatorId: text(node.selectedOperatorId), inputs: record(node.normalizedArguments),
      requires: (dependencies.get(nodeId) ?? []).map((dependency) => `compile-${dependency}`),
      produces: unique([
        ...outgoing,
        ...(kind === 'MUTATION' ? [`compile-${nodeId}.receipt`] : []),
      ]),
    };
  });
  const baseRevision = text(record(input.episodeContext.revisionBinding).expectedProjectRevision);
  const compiledGraph = deepFreezeV1({
    artifactType: 'CompiledOperationGraphV2', taskId: input.taskId,
    compileDisposition: 'COMPILED_RESEARCH_PROXY', executionEligibility: 'RESEARCH_PROXY_ONLY',
    sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent),
    sourceProviderEpisodeReceiptHash: input.providerEpisode.receiptSha256,
    sourceSelectedOperationTraceHash: text(trace.artifactSha256),
    projectId: text(record(input.episodeContext.revisionBinding).projectId),
    expectedProjectRevision: baseRevision, nodes: compiledNodes, edges: dataEdges,
    lowering: { zeroAdd: true, zeroDrop: true, dependencyOrigin: 'OPAQUE_RESULT_REFERENCES_ONLY' },
  });
  const receiptMaterial = {
    schemaVersion: STAGE25_PROVIDER_TRACE_SCHEDULE_BINDING_VERSION_V1,
    authority: 'RESEARCH_ONLY_NO_EXECUTION_OR_PROJECT_MUTATION', taskId: input.taskId,
    providerEpisodeReceiptHash: input.providerEpisode.receiptSha256,
    selectedOperationTraceHash: text(trace.artifactSha256),
    selectedOperatorIds: traceNodes.map((node) => text(node.selectedOperatorId)),
    compiledOperatorIds: compiledNodes.map((node) => text(node.operatorId)),
    dataEdgeHash: hashCanonicalJsonV1(dataEdges), zeroAdd: true, zeroDrop: true,
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({ ...receiptMaterial, receiptHash: hashCanonicalJsonV1(receiptMaterial) });
  return deepFreezeV1({ editorialIntent, compiledGraph, receipt });
}

export async function bindProviderTraceToStage25ScheduleV1(input: Readonly<
  ProjectionInputV1 & {
    graphId: string;
    timebase: Stage25ProjectTimebaseRefV1;
    currentStability: Stage25StabilityRequirementV1;
    initialArtifactRefs: readonly string[];
    requiredFinalArtifactRefs: readonly string[];
    limits: Stage25SchedulerGraphV1['limits'];
    effectResolutionRefs: readonly Stage25OperatorEffectResolutionRefV1[];
    resolveEffectResolution: (opaqueRef: string) => unknown | Promise<unknown>;
  }
>): Promise<Readonly<Stage25ModelScheduleBindingResultV1 & {
  providerTraceProjectionReceipt: Readonly<JsonRecord>;
}>> {
  const projection = projectProviderTraceForStage25ScheduleV1(input);
  const bound = await bindModelSelectedGraphToStage25ScheduleV1({
    taskId: input.taskId, graphId: input.graphId,
    editorialIntent: projection.editorialIntent, compiledGraph: projection.compiledGraph,
    toolSet: input.toolSet, timebase: input.timebase,
    currentStability: input.currentStability, initialArtifactRefs: input.initialArtifactRefs,
    requiredFinalArtifactRefs: input.requiredFinalArtifactRefs, limits: input.limits,
    effectResolutionRefs: input.effectResolutionRefs,
    resolveEffectResolution: input.resolveEffectResolution,
  });
  return deepFreezeV1({ ...bound, providerTraceProjectionReceipt: projection.receipt });
}

function validateSourceArtifacts(input: Readonly<ProjectionInputV1>): JsonRecord {
  const episode = input.providerEpisode;
  const trace = record(input.selectedOperationTrace);
  const unsignedEpisode = { ...episode } as JsonRecord; delete unsignedEpisode.receiptSha256;
  if (episode.receiptSha256 !== hashCanonicalJsonV1(unsignedEpisode)
    || episode.transcriptSha256 !== hashCanonicalJsonV1(episode.turns)
    || episode.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || episode.argumentHandoffMode !== 'OPAQUE_RESULT_REFERENCES'
    || episode.stateEffects.length) fail('PROVIDER_EPISODE_INVALID');
  if (!['READY_FOR_PROOF', 'PASS'].includes(episode.terminal.disposition)) fail('PROVIDER_EPISODE_NOT_PROOF_ELIGIBLE');
  if (episode.contextSha256 !== hashCanonicalJsonV1(input.episodeContext)
    || episode.episodeId !== input.episodeContext.episodeId) fail('PROVIDER_CONTEXT_DRIFT');
  const referencedToolSet = buildOpaqueResultReferenceToolSetV2R(input.toolSet);
  if (episode.toolSetSha256 !== referencedToolSet.toolSetSha256) fail('PROVIDER_TOOL_SET_DRIFT');
  const unsignedTrace = { ...trace }; delete unsignedTrace.artifactSha256;
  if (!text(trace.version).startsWith('EDITRON_OE_')
    || trace.authority !== 'LOSSLESS_MODEL_CALL_PROJECTION_NO_CREATIVE_LOWERING_NO_PROJECT_MUTATION'
    || trace.providerEpisodeReceiptSha256 !== episode.receiptSha256
    || trace.episodeId !== episode.episodeId || trace.contextSha256 !== episode.contextSha256
    || hashCanonicalJsonV1(trace.route) !== hashCanonicalJsonV1(episode.route)
    || trace.terminalDisposition !== episode.terminal.disposition
    || trace.traceSha256 !== hashCanonicalJsonV1(trace.nodes)
    || trace.artifactSha256 !== hashCanonicalJsonV1(unsignedTrace)
    || trace.assessment !== 'PASS' || !Array.isArray(trace.diagnostics) || trace.diagnostics.length
    || !Array.isArray(trace.stateEffects) || trace.stateEffects.length) fail('SELECTED_OPERATION_TRACE_INVALID');
  const nodes = records(trace.nodes);
  if (!nodes.length || new Set(nodes.map((node) => number(node.turn))).size !== nodes.length
    || new Set(nodes.map((node) => text(node.nodeId))).size !== nodes.length
    || trace.researchCloneMutationCount !== nodes.filter(({ researchCloneMutation }) => researchCloneMutation === true).length) {
    fail('SELECTED_OPERATION_TRACE_NODE_SET_INVALID');
  }
  if (!sameArray(nodes.map((node) => text(node.selectedOperatorId)), episode.selectedOperatorIds)) fail('SELECTED_OPERATOR_SEQUENCE_DRIFT');
  const episodeTurns = new Map(records(episode.turns).map((turn) => [number(turn.turn), turn]));
  for (const node of nodes) validateTraceNode(node, episodeTurns.get(number(node.turn)), input.toolSet);
  return trace;
}

function validateTraceNode(node: JsonRecord, turn: JsonRecord | undefined, toolSet: ProviderNativeToolSetV2R): void {
  const unsigned = { ...node }; delete unsigned.nodeSha256;
  const tool = toolSet.operators.find(({ operatorId }) => operatorId === node.selectedOperatorId);
  const execution = record(turn?.execution); const output = record(execution.output);
  const writerRevision = tool?.kind === 'MUTATION' ? text(record(output.receipt).projectRevision) : null;
  if (!turn || node.nodeId !== `turn-${number(node.turn)}` || node.nodeSha256 !== hashCanonicalJsonV1(unsigned)
    || text(record(turn.modelCall).name) !== node.selectedOperatorId || !tool
    || node.operatorKind !== tool.kind || node.executionDisposition !== 'OK'
    || execution.authority !== 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' || execution.disposition !== 'OK'
    || node.argumentSha256 !== hashCanonicalJsonV1(node.normalizedArguments)
    || node.outputSha256 !== hashCanonicalJsonV1(output)
    || node.writerIssuedProjectRevision !== writerRevision
    || node.researchCloneMutation !== (tool.kind === 'MUTATION')
    || !sameArray(strings(node.executionEvidenceRefs), strings(execution.evidenceIds).sort())
    || hashCanonicalJsonV1(node.normalizedArguments) !== hashCanonicalJsonV1(turn.normalizedArguments)
    || hashCanonicalJsonV1(node.argumentReferenceBindings) !== hashCanonicalJsonV1(turn.argumentReferenceBindings)
    || validateJsonSchemaV2(record(node.normalizedArguments), tool.exactInputSchema, '$.arguments').length
    || validateJsonSchemaV2(output, tool.exactOutputSchema, '$.output').length) fail(`TRACE_NODE_INVALID:${text(node.nodeId)}`);
}

function validateReferenceBinding(
  input: Readonly<ProjectionInputV1>, target: JsonRecord, source: JsonRecord,
  binding: JsonRecord, targetTool: ProviderNativeToolSetV2R['operators'][number],
): void {
  const sourceTurn = records(input.providerEpisode.turns).find((turn) => number(turn.turn) === number(source.turn));
  const issued = records(sourceTurn?.issuedResultReferences).find((candidate) => candidate.resultReferenceId === binding.resultReferenceId);
  const sourcePath = strings(binding.sourceOutputPath);
  const sourceOutput = record(record(sourceTurn?.execution).output);
  const value = valueAtPath(sourceOutput, sourcePath);
  const targetField = text(binding.targetField);
  if (!issued || !sourcePath.length || binding.sourceOperatorId !== source.selectedOperatorId
    || binding.sourceOutputField !== sourcePath.join('.') || issued.originTurn !== source.turn
    || issued.sourceOperatorId !== binding.sourceOperatorId
    || issued.sourceOutputField !== binding.sourceOutputField
    || hashCanonicalJsonV1(issued.sourceOutputPath) !== hashCanonicalJsonV1(sourcePath)
    || issued.valueSha256 !== binding.valueSha256 || value === undefined
    || hashCanonicalJsonV1(value) !== binding.valueSha256
    || hashCanonicalJsonV1(record(target.normalizedArguments)[targetField]) !== binding.valueSha256
    || !(targetField in record(targetTool.exactInputSchema.properties))
    || !declaredOutputOrigin(input.episodeContext, text(target.selectedOperatorId), targetField, text(binding.sourceOperatorId), text(binding.sourceOutputField))) {
    fail(`REFERENCE_BINDING_INVALID:${text(target.nodeId)}:${targetField}`);
  }
}

function validateWriterRevisionLineage(
  input: Readonly<ProjectionInputV1>, nodes: JsonRecord[],
  tools: Map<string, ProviderNativeToolSetV2R['operators'][number]>,
): void {
  const base = text(record(input.episodeContext.revisionBinding).expectedProjectRevision);
  const mutations: JsonRecord[] = [];
  for (const node of nodes) {
    const tool = tools.get(text(node.selectedOperatorId)) ?? fail('TRACE_TOOL_MISSING');
    const args = record(node.normalizedArguments); const latest = mutations[mutations.length - 1];
    const acceptsProjectRevision = 'expectedProjectRevision'
      in record(tool.exactInputSchema.properties);
    if (latest && acceptsProjectRevision) {
      const latestRevision = text(latest.writerIssuedProjectRevision);
      const binding = records(node.argumentReferenceBindings).find((candidate) => candidate.targetField === 'expectedProjectRevision');
      if (args.expectedProjectRevision !== latestRevision || !binding
        || binding.originTurn !== latest.turn || binding.sourceOperatorId !== latest.selectedOperatorId
        || binding.sourceOutputField !== 'receipt.projectRevision') fail(`WRITER_REVISION_HANDOFF_INVALID:${text(node.nodeId)}`);
    } else if (!latest && acceptsProjectRevision
      && args.expectedProjectRevision !== base) {
      fail(`BASE_REVISION_INPUT_INVALID:${text(node.nodeId)}`);
    }
    if (tool.kind === 'MUTATION') {
      const writerRevision = text(node.writerIssuedProjectRevision);
      const expectedRevision = text(args.expectedProjectRevision);
      if (!writerRevision || !expectedRevision || writerRevision === expectedRevision) fail(`WRITER_REVISION_NOT_ADVANCED:${text(node.nodeId)}`);
      mutations.push(node);
    } else if (node.writerIssuedProjectRevision !== null) fail(`NON_WRITER_REVISION_REPORTED:${text(node.nodeId)}`);
  }
}

function declaredOutputOrigin(context: ProviderNativeEpisodeContextV2R, targetOperatorId: string, targetField: string, sourceOperatorId: string, sourceOutputField: string): boolean {
  const dossier = record(record(context.authorityAndPolicy).completeCapabilityDossier);
  return records(dossier.plannerRecordSupplements).some((supplement) => (
    supplement.selectableOperatorId === targetOperatorId
    && records(record(supplement.inputOrigins)[targetField]).some((origin) => (
      origin.origin === 'OPERATOR_OUTPUT' && origin.operatorId === sourceOperatorId
      && origin.outputField === sourceOutputField
    ))
  ));
}

function valueAtPath(value: JsonRecord, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !(segment in current)) return undefined;
    current = (current as JsonRecord)[segment];
  }
  return current;
}

function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function sameArray(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0; }
function fail(message: string): never { throw new Error(`STAGE25_PROVIDER_TRACE_SCHEDULE_BINDING_${message}`); }
