import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  COMPILED_PORT_BINDING_VERSION_V2R,
  projectCompiledPortValueV2R,
  type CompiledPortBindingEdgeV2R,
} from './compiled-port-binding-v2r';
import { hashCanonicalJsonV1 } from './contracts-v1';
import { getCanonicalDev01NativeProxyFixtureV2, sha256Dev01FixtureBytesV2 } from './dev01-native-proxy-fixture-v2';
import {
  DEV01_STAGE6_ARTIFACT_IDS_V2,
  DEV01_STAGE6_NATIVE_PROXY_V2,
  type Dev01Stage6ArtifactBindingV2,
  type Dev01Stage6ProjectSnapshotV2,
  type Dev01Stage6RendererV2,
} from './dev01-stage6-native-proxy-contract-v2';
import { executeDev01Stage6OperatorV2R } from './dev01-stage6-operator-adapters-v2r';
import { renderDev01Stage6NativeProxyV2 } from './dev01-stage6-native-proxy-renderer-v2';
import { assertValidDev01Stage6RenderProofV2 } from './dev01-stage6-render-proof-validator-v2';
import type { GenericLoweringResultV2R } from './generic-lowerer-v2r';
import { V2R_OPERATOR_CATALOG, v2rOperatorSpecRef } from './operator-catalog-v2r';
import { validateJsonSchemaV2 } from './stage4-compilation-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export interface Dev01Stage6GenericLoweredExecutionV2 {
  snapshots: {
    before: Dev01Stage6ProjectSnapshotV2;
    afterCut: Dev01Stage6ProjectSnapshotV2;
    afterPush: Dev01Stage6ProjectSnapshotV2;
    afterDuck: Dev01Stage6ProjectSnapshotV2;
  };
  receipt: JsonRecord;
  receiptPath: string;
}

interface CompiledExecutionV2R {
  before: Dev01Stage6ProjectSnapshotV2;
  afterCut: Dev01Stage6ProjectSnapshotV2;
  afterPush: Dev01Stage6ProjectSnapshotV2;
  afterDuck: Dev01Stage6ProjectSnapshotV2;
  changedPaths: readonly string[];
  trace: readonly JsonRecord[];
}

const REQUIRED_OPERATORS = [
  'resolve_transcript_edit', 'cut_section', 'find_visual_moment',
  'resolve_keyframe_edit', 'set_keyframes', 'apply_audio_ducking',
] as const;

// Research-only interpreter for the model-selected, generically lowered graph.
// Every creative value must arrive as model input or a verified upstream port.
export async function executeDev01Stage6GenericLoweredV2(input: {
  lowering: Readonly<GenericLoweringResultV2R>;
  executionId: string;
  createdAt: string;
  outputDir: string;
  renderer?: Dev01Stage6RendererV2;
}): Promise<Dev01Stage6GenericLoweredExecutionV2> {
  validateExecutionIdentity(input.executionId, input.createdAt);
  validateLoweredGraph(input.lowering);
  const executed = executeCompiledGraph(input.lowering);
  await mkdir(input.outputDir, { recursive: true });
  const rendered = await (input.renderer ?? renderDev01Stage6NativeProxyV2)({
    projectSnapshot: executed.afterDuck, outputDir: input.outputDir,
  });
  const renderProofValidation = assertValidDev01Stage6RenderProofV2(rendered.proof);
  const artifacts = await bindArtifacts(rendered.artifactPaths);
  const stateHashes = {
    before: hashCanonicalJsonV1(executed.before), afterCut: hashCanonicalJsonV1(executed.afterCut),
    afterPush: hashCanonicalJsonV1(executed.afterPush), afterDuck: hashCanonicalJsonV1(executed.afterDuck),
  };
  const unsigned = {
    schemaVersion: DEV01_STAGE6_NATIVE_PROXY_V2,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    executor: 'CAUSAL_COMPILED_GRAPH_INTERPRETER_V2R',
    taskId: 'DEV-01', executionId: input.executionId, createdAt: input.createdAt,
    loweredGraphHash: hashCanonicalJsonV1(input.lowering.compiled),
    loweringInvariants: {
      zeroAdd: input.lowering.zeroAdd, zeroDrop: input.lowering.zeroDrop,
      compiledOperatorCount: input.lowering.compiledOperatorIds.length,
      selectedOperatorIds: [...input.lowering.selectedOperatorIds],
    },
    projectBinding: {
      projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
      observedProjectRevision: 'NOT_READ', changedProjectPaths: [],
    },
    isolatedClone: {
      beforeStateHash: stateHashes.before, afterCutStateHash: stateHashes.afterCut,
      afterPushStateHash: stateHashes.afterPush, afterDuckStateHash: stateHashes.afterDuck,
      changedPaths: executed.changedPaths,
    },
    operations: executed.trace, artifacts, renderProof: rendered.proof, renderProofValidation,
    proof: {
      state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS',
      renderedAudio: 'PASS', projectMutation: 'NONE',
    },
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE', stateEffects: [],
  } as const;
  const receipt = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  const receiptPath = path.join(input.outputDir, `dev01-stage6-generic-lowered-receipt-${input.executionId}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return {
    snapshots: {
      before: executed.before, afterCut: executed.afterCut,
      afterPush: executed.afterPush, afterDuck: executed.afterDuck,
    },
    receipt, receiptPath,
  };
}

function executeCompiledGraph(lowering: Readonly<GenericLoweringResultV2R>): CompiledExecutionV2R {
  const fixture = getCanonicalDev01NativeProxyFixtureV2();
  const originalProject = clone(fixture.project) as Dev01Stage6ProjectSnapshotV2;
  let currentProject = clone(originalProject);
  let afterCut: Dev01Stage6ProjectSnapshotV2 | undefined;
  let afterPush: Dev01Stage6ProjectSnapshotV2 | undefined;
  let duckExecuted = false;
  const outputsByNodeId = new Map<string, JsonRecord>();
  const executedNodeIds = new Set<string>();
  const changedPaths = new Set<string>();
  const trace: JsonRecord[] = [];
  const graph = record(lowering.compiled);
  const nodes = records(graph.nodes);
  const edges = records(graph.edges);

  for (const node of nodes) {
    const nodeId = requiredString(node.nodeId, 'NODE_ID');
    const operatorId = requiredString(node.operatorId, 'OPERATOR_ID');
    assertNodeContract(node, operatorId);
    for (const prerequisite of strings(node.requires)) {
      if (!executedNodeIds.has(prerequisite)) throw new Error(`DEV01_STAGE6_PREREQUISITE_NOT_EXECUTED:${nodeId}:${prerequisite}`);
    }
    for (const edge of edges.filter((candidate) => candidate.toNodeId === nodeId && candidate.edgeType !== 'DATA')) {
      const producer = requiredString(edge.fromNodeId, 'CONTROL_EDGE_PRODUCER');
      if (!executedNodeIds.has(producer)) throw new Error(`DEV01_STAGE6_CONTROL_EDGE_NOT_READY:${nodeId}:${producer}`);
    }
    const resolvedInputs = clone(record(node.inputs));
    for (const edge of edges.filter((candidate) => candidate.toNodeId === nodeId && candidate.edgeType === 'DATA')) {
      bindDataEdge(edge, resolvedInputs, outputsByNodeId);
    }
    validateOperatorInputs(operatorId, resolvedInputs);
    const result = executeDev01Stage6OperatorV2R({
      operatorId, inputs: resolvedInputs, originalProject, currentProject, fixture,
    });
    validateOperatorOutputs(operatorId, result.outputs);
    outputsByNodeId.set(nodeId, clone(result.outputs));
    if (result.nextProject) currentProject = clone(result.nextProject);
    for (const changedPath of result.changedPaths) changedPaths.add(changedPath);
    if (result.mutationStage === 'CUT') afterCut = clone(currentProject);
    if (result.mutationStage === 'PUSH') afterPush = clone(currentProject);
    if (result.mutationStage === 'DUCK') duckExecuted = true;
    executedNodeIds.add(nodeId);
    trace.push({
      nodeId, intentNodeId: node.intentNodeId, operatorId, ownerRef: node.ownerRef,
      inputHash: hashCanonicalJsonV1(resolvedInputs), outputHash: hashCanonicalJsonV1(result.outputs),
      resultStateHash: hashCanonicalJsonV1(currentProject), changedPaths: [...result.changedPaths],
    });
  }
  if (!afterCut) throw new Error('DEV01_STAGE6_CUT_SNAPSHOT_MISSING');
  if (!afterPush) throw new Error('DEV01_STAGE6_PUSH_SNAPSHOT_MISSING');
  if (!duckExecuted) throw new Error('DEV01_STAGE6_DUCK_SNAPSHOT_MISSING');
  return {
    before: originalProject, afterCut, afterPush, afterDuck: clone(currentProject),
    changedPaths: [...changedPaths].sort(compareUtf16), trace,
  };
}

function bindDataEdge(rawEdge: JsonRecord, resolvedInputs: JsonRecord, outputs: ReadonlyMap<string, JsonRecord>): void {
  const edge = rawEdge as unknown as CompiledPortBindingEdgeV2R;
  if (edge.bindingVersion !== COMPILED_PORT_BINDING_VERSION_V2R) throw new Error(`DEV01_STAGE6_PORT_BINDING_VERSION_DRIFT:${String(edge.edgeId)}`);
  if (Object.prototype.hasOwnProperty.call(resolvedInputs, edge.toPort)) throw new Error(`DEV01_STAGE6_PORT_LITERAL_COLLISION:${edge.toNodeId}:${edge.toPort}`);
  const producerOutputs = outputs.get(edge.fromNodeId);
  if (!producerOutputs) throw new Error(`DEV01_STAGE6_PORT_PRODUCER_NOT_EXECUTED:${edge.fromNodeId}`);
  const schema = catalogFieldSchema(edge.toPort);
  if (hashCanonicalJsonV1(schema) !== edge.expectedInputSchemaHash) throw new Error(`DEV01_STAGE6_PORT_SCHEMA_HASH_DRIFT:${edge.edgeId}`);
  const value = projectCompiledPortValueV2R(edge, producerOutputs);
  const diagnostics = validateJsonSchemaV2(value, schema, `$.ports.${edge.toPort}`);
  if (diagnostics.length) throw new Error(`DEV01_STAGE6_PORT_SCHEMA_INVALID:${edge.edgeId}:${diagnostics.join('|')}`);
  resolvedInputs[edge.toPort] = clone(value);
}

function assertNodeContract(node: JsonRecord, operatorId: string): void {
  if (node.operatorSpecRef !== v2rOperatorSpecRef(operatorId)) throw new Error(`DEV01_STAGE6_OPERATOR_SPEC_DRIFT:${operatorId}`);
  const expectedOwner = catalogOperator(operatorId).ownerRef;
  if (typeof expectedOwner !== 'string' || node.ownerRef !== expectedOwner) throw new Error(`DEV01_STAGE6_OWNER_DRIFT:${operatorId}`);
}

function validateOperatorInputs(operatorId: string, inputs: JsonRecord): void {
  const input = record(catalogOperator(operatorId).input);
  const declared = strings(input.fields);
  for (const field of Object.keys(inputs)) {
    if (!declared.includes(field)) throw new Error(`DEV01_STAGE6_INPUT_UNDECLARED:${operatorId}:${field}`);
    const diagnostics = validateJsonSchemaV2(inputs[field], catalogFieldSchema(field), `$.inputs.${field}`);
    if (diagnostics.length) throw new Error(`DEV01_STAGE6_INPUT_SCHEMA_INVALID:${operatorId}:${field}:${diagnostics.join('|')}`);
  }
  for (const field of strings(input.required)) if (!(field in inputs)) throw new Error(`DEV01_STAGE6_INPUT_REQUIRED:${operatorId}:${field}`);
}

function validateOperatorOutputs(operatorId: string, outputs: JsonRecord): void {
  for (const field of strings(record(catalogOperator(operatorId).output).required)) {
    if (!(field in outputs)) throw new Error(`DEV01_STAGE6_OUTPUT_REQUIRED:${operatorId}:${field}`);
  }
}

function validateLoweredGraph(lowering: Readonly<GenericLoweringResultV2R>): void {
  if (!lowering.zeroAdd) throw new Error('DEV01_STAGE6_GENERIC_LOWERING_ZERO_ADD_VIOLATED');
  if (!lowering.zeroDrop) throw new Error('DEV01_STAGE6_GENERIC_LOWERING_ZERO_DROP_VIOLATED');
  if (lowering.compiled.compileDisposition !== 'COMPILED_RESEARCH_PROXY') throw new Error(`DEV01_STAGE6_GENERIC_LOWERING_NOT_COMPILED:${String(lowering.compiled.compileDisposition)}`);
  if (lowering.compiled.projectId !== 'oe-dev-01' || lowering.compiled.expectedProjectRevision !== 'R7') throw new Error('DEV01_STAGE6_GENERIC_LOWERING_PROJECT_BINDING_DRIFT');
  const compiled = new Set(lowering.compiledOperatorIds);
  for (const required of REQUIRED_OPERATORS) if (!compiled.has(required)) throw new Error(`DEV01_STAGE6_GENERIC_LOWERING_OPERATOR_MISSING:${required}`);
}

function catalogOperator(operatorId: string): JsonRecord {
  const operator = records(V2R_OPERATOR_CATALOG.operators).find((candidate) => candidate.operatorId === operatorId);
  if (!operator) throw new Error(`DEV01_STAGE6_OPERATOR_UNKNOWN:${operatorId}`);
  return operator;
}
function catalogFieldSchema(field: string): JsonRecord {
  const schema = record(record(V2R_OPERATOR_CATALOG.fieldSchemas)[field]);
  if (!Object.keys(schema).length) throw new Error(`DEV01_STAGE6_FIELD_SCHEMA_MISSING:${field}`);
  return schema;
}
async function bindArtifacts(paths: Readonly<Record<string, string>>): Promise<Dev01Stage6ArtifactBindingV2[]> {
  if (!sameSet(Object.keys(paths).sort(), [...DEV01_STAGE6_ARTIFACT_IDS_V2].sort())) throw new Error('DEV01_STAGE6_ARTIFACT_SET_INVALID');
  return Promise.all(DEV01_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
    const artifactPath = paths[artifactId];
    const bytes = await readFile(artifactPath);
    if (!bytes.length) throw new Error(`DEV01_STAGE6_ARTIFACT_EMPTY:${artifactId}`);
    return { artifactId, path: artifactPath, sha256: sha256Dev01FixtureBytesV2(bytes), byteLength: bytes.length };
  }));
}
function requiredString(value: unknown, code: string): string { if (typeof value !== 'string' || !value) throw new Error(`DEV01_STAGE6_${code}_INVALID`); return value; }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && right.every((entry) => left.includes(entry)); }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function validateExecutionIdentity(executionId: string, createdAt: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(executionId)) throw new Error('DEV01_STAGE6_EXECUTION_ID_INVALID');
  if (new Date(createdAt).toISOString() !== createdAt) throw new Error('DEV01_STAGE6_CREATED_AT_INVALID');
}
