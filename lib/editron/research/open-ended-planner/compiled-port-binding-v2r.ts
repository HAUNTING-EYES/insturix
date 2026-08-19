import { deepFreezeV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export const COMPILED_PORT_BINDING_VERSION_V2R =
  'EDITRON_OE_COMPILED_PORT_BINDING_V2R_1' as const;

export interface CompiledPortBindingEdgeV2R {
  edgeId: string;
  edgeType: 'DATA';
  bindingVersion: typeof COMPILED_PORT_BINDING_VERSION_V2R;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
  projectionPath: readonly string[];
  expectedInputSchemaHash: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const SAFE_PORT = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DENIED_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export function createCompiledPortBindingEdgeV2R(input: {
  edgeId: string;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
  projectionPath?: readonly string[];
  expectedInputSchemaHash: string;
}): Readonly<CompiledPortBindingEdgeV2R> {
  if (!SAFE_ID.test(input.edgeId)) throw new Error('COMPILED_PORT_BINDING_EDGE_ID_INVALID');
  if (!SAFE_ID.test(input.fromNodeId) || !SAFE_ID.test(input.toNodeId)) {
    throw new Error('COMPILED_PORT_BINDING_NODE_ID_INVALID');
  }
  if (input.fromNodeId === input.toNodeId) throw new Error('COMPILED_PORT_BINDING_SELF_EDGE');
  if (!SAFE_PORT.test(input.fromPort) || !SAFE_PORT.test(input.toPort)) {
    throw new Error('COMPILED_PORT_BINDING_PORT_INVALID');
  }
  const projectionPath = [...(input.projectionPath ?? [])];
  if (projectionPath.some((segment) => !SAFE_PORT.test(segment) || DENIED_PATH_SEGMENTS.has(segment))) {
    throw new Error('COMPILED_PORT_BINDING_PROJECTION_INVALID');
  }
  if (!SHA256.test(input.expectedInputSchemaHash)) {
    throw new Error('COMPILED_PORT_BINDING_SCHEMA_HASH_INVALID');
  }
  return deepFreezeV1({
    edgeId: input.edgeId,
    edgeType: 'DATA' as const,
    bindingVersion: COMPILED_PORT_BINDING_VERSION_V2R,
    fromNodeId: input.fromNodeId,
    fromPort: input.fromPort,
    toNodeId: input.toNodeId,
    toPort: input.toPort,
    projectionPath,
    expectedInputSchemaHash: input.expectedInputSchemaHash,
  });
}

export function projectCompiledPortValueV2R(
  edge: Readonly<CompiledPortBindingEdgeV2R>,
  producerOutputs: unknown,
): unknown {
  let value: unknown = requireRecord(producerOutputs, 'COMPILED_PORT_OUTPUTS_INVALID')[edge.fromPort];
  if (value === undefined) throw new Error(`COMPILED_PORT_OUTPUT_MISSING:${edge.fromPort}`);
  for (const segment of edge.projectionPath) {
    const object = requireRecord(value, `COMPILED_PORT_PROJECTION_NOT_OBJECT:${segment}`);
    if (!Object.prototype.hasOwnProperty.call(object, segment)) {
      throw new Error(`COMPILED_PORT_PROJECTION_MISSING:${segment}`);
    }
    value = object[segment];
  }
  return value;
}

function requireRecord(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as JsonRecord;
}
