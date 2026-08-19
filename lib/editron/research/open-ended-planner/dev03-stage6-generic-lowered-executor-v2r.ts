import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  COMPILED_PORT_BINDING_VERSION_V2R,
  projectCompiledPortValueV2R,
  type CompiledPortBindingEdgeV2R,
} from './compiled-port-binding-v2r';
import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  getCanonicalDev03NativeProxyFixtureV2,
  sha256Dev03FixtureBytesV2,
} from './dev03-native-proxy-fixture-v2';
import {
  DEV03_STAGE6_ARTIFACT_IDS_V2,
  DEV03_STAGE6_NATIVE_PROXY_V2,
  type Dev03Stage6ArtifactBindingV2,
  type Dev03Stage6ProjectSnapshotV2,
  type Dev03Stage6RendererV2,
} from './dev03-stage6-native-proxy-contract-v2';
import { executeDev03Stage6OperatorV2R } from './dev03-stage6-operator-adapters-v2r';
import { renderDev03Stage6NativeProxyV2 } from './dev03-stage6-native-proxy-renderer-v2';
import { assertValidDev03Stage6RenderProofV2 } from './dev03-stage6-render-proof-validator-v2';
import type { GenericLoweringResultV2R } from './generic-lowerer-v2r';
import {
  V2R_OPERATOR_CATALOG,
  v2rOperatorFieldSchema,
  v2rOperatorSpecRef,
} from './operator-catalog-v2r';
import { validateJsonSchemaV2 } from './stage4-compilation-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export interface Dev03Stage6GenericLoweredExecutionV2 {
  snapshots: {
    before: Dev03Stage6ProjectSnapshotV2;
    aligned: Dev03Stage6ProjectSnapshotV2;
    shaken: Dev03Stage6ProjectSnapshotV2;
  };
  receipt: JsonRecord;
  receiptPath: string;
}

interface CompiledExecutionV2R {
  before: Dev03Stage6ProjectSnapshotV2;
  aligned: Dev03Stage6ProjectSnapshotV2;
  shaken: Dev03Stage6ProjectSnapshotV2;
  changedPaths: readonly string[];
  trace: readonly JsonRecord[];
  observedProjectRevision: string | 'NOT_READ';
}

const REQUIRED_OPERATORS = [
  'read_project_file', 'get_timeline_view', 'find_audio_moment',
  'sync_cuts_to_beats', 'apply_camera_shake',
] as const;

const ARTIFACT_FILENAMES = {
  SOURCE_VIDEO: 'source-cards.mp4', SOURCE_AUDIO: 'source-beats.wav',
  CUT1_BEFORE: 'cut1-before-0118.png', CUT1_AFTER: 'cut1-after-0119.png',
  CUT2_BEFORE: 'cut2-before-0238.png', CUT2_AFTER: 'cut2-after-0239.png',
  CUT3_BEFORE: 'cut3-before-0478.png', CUT3_AFTER: 'cut3-after-0479.png',
  SHAKE_ACTIVE_BASELINE: 'shake-baseline-0480.png', SHAKE_ACTIVE: 'shake-active-0480.png',
  SHAKE_NEUTRAL_BASELINE: 'shake-baseline-0490.png', SHAKE_NEUTRAL: 'shake-neutral-0490.png',
  FULL_AV_PROXY: 'dev03-native-proxy.mp4',
  PROTECTED_AUDIO_BASELINE_WAV: 'dev03-protected-audio-baseline.wav',
  PROTECTED_AUDIO_WAV: 'dev03-protected-audio.wav',
} as const;

// Research-only causal interpreter. It executes the model-selected operators
// exactly as lowered, on an isolated clone, and cannot mutate ProjectService.
export async function executeDev03Stage6GenericLoweredV2(input: {
  lowering: Readonly<GenericLoweringResultV2R>;
  evidencePack?: unknown;
  executionId: string;
  createdAt: string;
  outputDir: string;
  renderer?: Dev03Stage6RendererV2;
}): Promise<Dev03Stage6GenericLoweredExecutionV2> {
  validateExecutionIdentity(input.executionId, input.createdAt);
  const evidencePack = requireEvidencePack(input.evidencePack, input.lowering);
  validateLoweredGraph(input.lowering);
  const executed = executeCompiledGraph(input.lowering, evidencePack);

  await mkdir(input.outputDir, { recursive: true });
  const rendered = await (input.renderer ?? renderDev03Stage6NativeProxyV2)({
    alignedProjectSnapshot: executed.aligned,
    shakenProjectSnapshot: executed.shaken,
    outputDir: input.outputDir,
  });
  const renderProofValidation = assertValidDev03Stage6RenderProofV2(rendered.proof);
  const artifacts = await bindArtifacts(rendered.artifactPaths, input.outputDir);
  const stateHashes = {
    before: hashCanonicalJsonV1(executed.before),
    aligned: hashCanonicalJsonV1(executed.aligned),
    shaken: hashCanonicalJsonV1(executed.shaken),
  };
  const unsigned = {
    schemaVersion: DEV03_STAGE6_NATIVE_PROXY_V2,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    executor: 'CAUSAL_COMPILED_GRAPH_INTERPRETER_V2R',
    taskId: 'DEV-03', executionId: input.executionId, createdAt: input.createdAt,
    loweredGraphHash: hashCanonicalJsonV1(input.lowering.compiled),
    evidencePackHash: hashCanonicalJsonV1(evidencePack),
    loweringInvariants: {
      zeroAdd: input.lowering.zeroAdd, zeroDrop: input.lowering.zeroDrop,
      compiledOperatorCount: input.lowering.compiledOperatorIds.length,
      selectedOperatorIds: [...input.lowering.selectedOperatorIds],
    },
    projectBinding: {
      projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
      observedProjectRevision: executed.observedProjectRevision, changedProjectPaths: [],
    },
    isolatedClone: {
      beforeStateHash: stateHashes.before, alignedStateHash: stateHashes.aligned,
      shakenStateHash: stateHashes.shaken, changedPaths: executed.changedPaths,
    },
    operations: executed.trace,
    artifacts,
    renderProof: rendered.proof,
    renderProofValidation,
    proof: {
      state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS',
      renderedAudio: 'PASS', projectMutation: 'NONE',
    },
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE', stateEffects: [],
  } as const;
  const receipt = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  const receiptPath = path.join(
    input.outputDir,
    `dev03-stage6-generic-lowered-receipt-${input.executionId}.json`,
  );
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return {
    snapshots: { before: executed.before, aligned: executed.aligned, shaken: executed.shaken },
    receipt,
    receiptPath,
  };
}

function executeCompiledGraph(
  lowering: Readonly<GenericLoweringResultV2R>,
  evidencePack: Readonly<JsonRecord>,
): CompiledExecutionV2R {
  const fixture = getCanonicalDev03NativeProxyFixtureV2();
  const originalProject = clone(fixture.project) as Dev03Stage6ProjectSnapshotV2;
  let currentProject = clone(originalProject);
  let aligned: Dev03Stage6ProjectSnapshotV2 | undefined;
  let shaken: Dev03Stage6ProjectSnapshotV2 | undefined;
  const outputsByNodeId = new Map<string, JsonRecord>();
  const executedNodeIds = new Set<string>();
  const changedPaths = new Set<string>();
  const trace: JsonRecord[] = [];
  let observedProjectRevision: string | 'NOT_READ' = 'NOT_READ';
  const graph = record(lowering.compiled);
  const nodes = records(graph.nodes);
  const nodesById = new Map(nodes.map((node) => [requiredString(node.nodeId, 'NODE_ID'), node]));
  const edges = records(graph.edges);

  for (const node of nodes) {
    const nodeId = requiredString(node.nodeId, 'NODE_ID');
    const operatorId = requiredString(node.operatorId, 'OPERATOR_ID');
    assertNodeContract(node, operatorId, graph);
    for (const prerequisite of strings(node.requires)) {
      if (!executedNodeIds.has(prerequisite)) {
        throw new Error(`DEV03_STAGE6_PREREQUISITE_NOT_EXECUTED:${nodeId}:${prerequisite}`);
      }
    }
    for (const edge of edges.filter((candidate) => (
      candidate.toNodeId === nodeId && candidate.edgeType !== 'DATA'
    ))) {
      const producer = requiredString(edge.fromNodeId, 'CONTROL_EDGE_PRODUCER');
      if (!executedNodeIds.has(producer)) {
        throw new Error(`DEV03_STAGE6_CONTROL_EDGE_NOT_READY:${nodeId}:${producer}`);
      }
    }
    const resolvedInputs = clone(record(node.inputs));
    for (const edge of edges.filter((candidate) => (
      candidate.toNodeId === nodeId && candidate.edgeType === 'DATA'
    ))) bindDataEdge(edge, resolvedInputs, outputsByNodeId, nodesById, operatorId);
    validateOperatorInputs(operatorId, resolvedInputs);
    const result = executeDev03Stage6OperatorV2R({
      operatorId, inputs: resolvedInputs, currentProject, fixture, evidencePack,
    });
    validateOperatorOutputs(operatorId, result.outputs);
    if (operatorId === 'read_project_file') {
      observedProjectRevision = requiredString(
        record(result.outputs.evidence).projectRevision,
        'OBSERVED_PROJECT_REVISION',
      );
    }
    outputsByNodeId.set(nodeId, clone(result.outputs));
    if (result.nextProject) currentProject = clone(result.nextProject);
    for (const changedPath of result.changedPaths) changedPaths.add(changedPath);
    if (result.mutationStage === 'ALIGN') aligned = clone(currentProject);
    if (result.mutationStage === 'SHAKE') shaken = clone(currentProject);
    executedNodeIds.add(nodeId);
    trace.push({
      nodeId, intentNodeId: node.intentNodeId, operatorId, ownerRef: node.ownerRef,
      inputHash: hashCanonicalJsonV1(resolvedInputs), outputHash: hashCanonicalJsonV1(result.outputs),
      resultStateHash: hashCanonicalJsonV1(currentProject), changedPaths: [...result.changedPaths],
    });
  }
  if (!aligned) throw new Error('DEV03_STAGE6_ALIGNMENT_SNAPSHOT_MISSING');
  if (!shaken) throw new Error('DEV03_STAGE6_SHAKE_SNAPSHOT_MISSING');
  return {
    before: originalProject, aligned, shaken,
    changedPaths: [...changedPaths].sort(compareUtf16), trace, observedProjectRevision,
  };
}

function bindDataEdge(
  rawEdge: JsonRecord,
  resolvedInputs: JsonRecord,
  outputs: ReadonlyMap<string, JsonRecord>,
  nodesById: ReadonlyMap<string, JsonRecord>,
  targetOperatorId: string,
): void {
  const edge = rawEdge as unknown as CompiledPortBindingEdgeV2R;
  if (edge.bindingVersion !== COMPILED_PORT_BINDING_VERSION_V2R) {
    throw new Error(`DEV03_STAGE6_PORT_BINDING_VERSION_DRIFT:${String(edge.edgeId)}`);
  }
  if (Object.prototype.hasOwnProperty.call(resolvedInputs, edge.toPort)) {
    throw new Error(`DEV03_STAGE6_PORT_LITERAL_COLLISION:${edge.toNodeId}:${edge.toPort}`);
  }
  const producerNode = nodesById.get(edge.fromNodeId);
  if (!producerNode) throw new Error(`DEV03_STAGE6_PORT_PRODUCER_UNKNOWN:${edge.fromNodeId}`);
  const producerOperator = catalogOperator(requiredString(producerNode.operatorId, 'PRODUCER_OPERATOR'));
  if (!strings(record(producerOperator.output).fields).includes(edge.fromPort)) {
    throw new Error(`DEV03_STAGE6_PORT_OUTPUT_UNDECLARED:${edge.fromNodeId}:${edge.fromPort}`);
  }
  const producerOutputs = outputs.get(edge.fromNodeId);
  if (!producerOutputs) throw new Error(`DEV03_STAGE6_PORT_PRODUCER_NOT_EXECUTED:${edge.fromNodeId}`);
  const schema = operatorFieldSchema(targetOperatorId, edge.toPort);
  if (hashCanonicalJsonV1(schema) !== edge.expectedInputSchemaHash) {
    throw new Error(`DEV03_STAGE6_PORT_SCHEMA_HASH_DRIFT:${edge.edgeId}`);
  }
  const value = projectCompiledPortValueV2R(edge, producerOutputs);
  const diagnostics = validateJsonSchemaV2(value, schema, `$.ports.${edge.toPort}`);
  if (diagnostics.length) {
    throw new Error(`DEV03_STAGE6_PORT_SCHEMA_INVALID:${edge.edgeId}:${diagnostics.join('|')}`);
  }
  resolvedInputs[edge.toPort] = clone(value);
}

function assertNodeContract(node: JsonRecord, operatorId: string, graph: JsonRecord): void {
  if (node.operatorSpecRef !== v2rOperatorSpecRef(operatorId)) {
    throw new Error(`DEV03_STAGE6_OPERATOR_SPEC_DRIFT:${operatorId}`);
  }
  if (node.ownerRef !== catalogOperator(operatorId).ownerRef) {
    throw new Error(`DEV03_STAGE6_OWNER_DRIFT:${operatorId}`);
  }
  if (!same(node.revisionBinding, {
    projectId: graph.projectId,
    expectedProjectRevision: graph.expectedProjectRevision,
  })) throw new Error(`DEV03_STAGE6_NODE_REVISION_DRIFT:${operatorId}`);
}

function validateOperatorInputs(operatorId: string, inputs: JsonRecord): void {
  const input = record(catalogOperator(operatorId).input);
  const declared = strings(input.fields);
  for (const field of Object.keys(inputs)) {
    if (!declared.includes(field)) throw new Error(`DEV03_STAGE6_INPUT_UNDECLARED:${operatorId}:${field}`);
    const diagnostics = validateJsonSchemaV2(
      inputs[field], operatorFieldSchema(operatorId, field), `$.inputs.${field}`,
    );
    if (diagnostics.length) {
      throw new Error(`DEV03_STAGE6_INPUT_SCHEMA_INVALID:${operatorId}:${field}:${diagnostics.join('|')}`);
    }
  }
  for (const field of strings(input.required)) {
    if (!(field in inputs)) throw new Error(`DEV03_STAGE6_INPUT_REQUIRED:${operatorId}:${field}`);
  }
}

function validateOperatorOutputs(operatorId: string, outputs: JsonRecord): void {
  const output = record(catalogOperator(operatorId).output);
  const declared = strings(output.fields);
  for (const field of Object.keys(outputs)) {
    if (!declared.includes(field)) throw new Error(`DEV03_STAGE6_OUTPUT_UNDECLARED:${operatorId}:${field}`);
  }
  for (const field of strings(output.required)) {
    if (!(field in outputs)) throw new Error(`DEV03_STAGE6_OUTPUT_REQUIRED:${operatorId}:${field}`);
  }
}

function validateLoweredGraph(lowering: Readonly<GenericLoweringResultV2R>): void {
  if (!lowering.zeroAdd) throw new Error('DEV03_STAGE6_GENERIC_LOWERING_ZERO_ADD_VIOLATED');
  if (!lowering.zeroDrop) throw new Error('DEV03_STAGE6_GENERIC_LOWERING_ZERO_DROP_VIOLATED');
  const graph = record(lowering.compiled);
  if (graph.compileDisposition !== 'COMPILED_RESEARCH_PROXY') {
    throw new Error(`DEV03_STAGE6_GENERIC_LOWERING_NOT_COMPILED:${String(graph.compileDisposition)}`);
  }
  if (graph.taskId !== 'DEV-03' || graph.projectId !== 'oe-dev-03'
    || graph.expectedProjectRevision !== 'R11') {
    throw new Error('DEV03_STAGE6_GENERIC_LOWERING_PROJECT_BINDING_DRIFT');
  }
  const nodeOperatorIds = records(graph.nodes)
    .map(({ operatorId }) => requiredString(operatorId, 'NODE_OPERATOR'));
  if (!sameCounts(nodeOperatorIds, [...lowering.compiledOperatorIds])
    || !sameCounts(nodeOperatorIds, [...lowering.selectedOperatorIds])) {
    throw new Error('DEV03_STAGE6_GENERIC_LOWERING_OPERATOR_LINEAGE_DRIFT');
  }
  const compiled = new Set(nodeOperatorIds);
  for (const required of REQUIRED_OPERATORS) {
    if (!compiled.has(required)) {
      throw new Error(`DEV03_STAGE6_GENERIC_LOWERING_OPERATOR_MISSING:${required}`);
    }
  }
}

function requireEvidencePack(
  candidate: unknown,
  lowering: Readonly<GenericLoweringResultV2R>,
): Readonly<JsonRecord> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('DEV03_STAGE6_EVIDENCE_PACK_REQUIRED');
  }
  const evidencePack = candidate as JsonRecord;
  if (hashCanonicalJsonV1(evidencePack) !== lowering.compiled.evidencePackHash) {
    throw new Error('DEV03_STAGE6_EVIDENCE_PACK_HASH_DRIFT');
  }
  if (evidencePack.taskId !== 'DEV-03' || evidencePack.conditionId !== 'BASELINE') {
    throw new Error('DEV03_STAGE6_EVIDENCE_PACK_IDENTITY_DRIFT');
  }
  return evidencePack;
}

function catalogOperator(operatorId: string): JsonRecord {
  const operator = records(V2R_OPERATOR_CATALOG.operators)
    .find((candidate) => candidate.operatorId === operatorId);
  if (!operator) throw new Error(`DEV03_STAGE6_OPERATOR_UNKNOWN:${operatorId}`);
  return operator;
}

function operatorFieldSchema(operatorId: string, field: string): Readonly<JsonRecord> {
  const schema = v2rOperatorFieldSchema(operatorId, field);
  if (!schema) throw new Error(`DEV03_STAGE6_FIELD_SCHEMA_MISSING:${operatorId}:${field}`);
  return schema;
}

async function bindArtifacts(
  paths: Readonly<Record<string, string>>,
  outputDir: string,
): Promise<Dev03Stage6ArtifactBindingV2[]> {
  if (!sameCounts(Object.keys(paths), [...DEV03_STAGE6_ARTIFACT_IDS_V2])) {
    throw new Error('DEV03_STAGE6_ARTIFACT_SET_INVALID');
  }
  const root = path.resolve(outputDir);
  return Promise.all(DEV03_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
    const artifactPath = path.resolve(paths[artifactId]);
    if (path.dirname(artifactPath) !== root
      || path.basename(artifactPath) !== ARTIFACT_FILENAMES[artifactId]) {
      throw new Error(`DEV03_STAGE6_ARTIFACT_PATH_INVALID:${artifactId}`);
    }
    const bytes = await readFile(artifactPath);
    if (!bytes.length) throw new Error(`DEV03_STAGE6_ARTIFACT_EMPTY:${artifactId}`);
    return {
      artifactId, path: artifactPath,
      sha256: sha256Dev03FixtureBytesV2(bytes), byteLength: bytes.length,
    };
  }));
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`DEV03_STAGE6_${code}_INVALID`);
  return value;
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
function same(left: unknown, right: unknown): boolean {
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}
function sameCounts(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<string, number>();
  for (const value of left) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const value of right) counts.set(value, (counts.get(value) ?? 0) - 1);
  return [...counts.values()].every((count) => count === 0);
}
function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function validateExecutionIdentity(executionId: string, createdAt: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(executionId)) {
    throw new Error('DEV03_STAGE6_EXECUTION_ID_INVALID');
  }
  if (new Date(createdAt).toISOString() !== createdAt) {
    throw new Error('DEV03_STAGE6_CREATED_AT_INVALID');
  }
}
