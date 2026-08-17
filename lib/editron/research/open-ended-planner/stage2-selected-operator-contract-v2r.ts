import { deepFreezeV1 } from './contracts-v1';

export const STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R =
  'EDITRON_OE_STAGE2_SELECTED_OPERATOR_V2R' as const;

export const STAGE2_SELECTED_OPERATOR_INSTRUCTIONS_V2R = deepFreezeV1({
  stage2: [
    'Every executable intent node selects exactly one selectedOperatorId that will execute; record considered but non-executed options separately in alternativeOperatorIds and never mix executed and non-executed operators in one field.',
    'Express clarification or capability gap only through unresolvedRequirements dispositions, never through an empty, placeholder, or pseudo operator node.',
  ],
  stage3: [
    'Preserve every Stage-2 selectedOperatorId and alternativeOperatorIds unchanged; Stage 3 binds evidence, rights, revision, preservation, and proof requirements and must not add, drop, or substitute operators.',
  ],
});

const stringSchema = { type: 'string', minLength: 1 };
const stringArraySchema = { type: 'array', items: stringSchema, uniqueItems: true };

export const STAGE2_SELECTED_OPERATOR_NODE_SCHEMA_V2R = deepFreezeV1({
  type: 'object',
  required: [
    'intentNodeId', 'operationFamily', 'targetClaimIds', 'selectedOperatorId',
    'alternativeOperatorIds', 'executionForm', 'requiresNodeIds', 'invalidates',
    'evidenceIds', 'failureDisposition',
  ],
  properties: {
    intentNodeId: stringSchema,
    operationFamily: stringSchema,
    targetClaimIds: { ...stringArraySchema, minItems: 1 },
    selectedOperatorId: stringSchema,
    alternativeOperatorIds: stringArraySchema,
    executionForm: { type: 'string', enum: ['NATIVE', 'GENERATED_COMPOSITION'] },
    requiresNodeIds: stringArraySchema,
    invalidates: stringArraySchema,
    evidenceIds: stringArraySchema,
    failureDisposition: { type: 'string', enum: ['NEEDS_REVIEW', 'FAIL'] },
  },
  additionalProperties: false,
});

export const STAGE3_SELECTED_OPERATOR_NODE_SCHEMA_V2R = deepFreezeV1({
  type: 'object',
  required: [
    'intentNodeId', 'selectedOperatorId', 'alternativeOperatorIds',
    'evidenceBindingIds', 'preservationIds', 'proofObligationIds',
    'bindingStatus', 'unresolvedRequirementIds',
  ],
  properties: {
    intentNodeId: stringSchema,
    selectedOperatorId: stringSchema,
    alternativeOperatorIds: stringArraySchema,
    evidenceBindingIds: stringArraySchema,
    preservationIds: stringArraySchema,
    proofObligationIds: stringArraySchema,
    bindingStatus: { type: 'string', enum: ['BOUND', 'PARTIAL', 'UNVERIFIABLE'] },
    unresolvedRequirementIds: stringArraySchema,
  },
  additionalProperties: false,
});

type JsonRecord = Record<string, unknown>;

function isRecordV2R(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringsV2R(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function nodeIdOfV2R(node: JsonRecord, index: number): string {
  return typeof node.intentNodeId === 'string' && node.intentNodeId ? node.intentNodeId : `node[${index}]`;
}

export function referencedOperatorIdsV2R(nodes: unknown): string[] {
  const ids = new Set<string>();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    for (const operatorId of nodeCapabilityIdsV2R(node)) ids.add(operatorId);
  }
  return [...ids];
}

export function nodeCapabilityIdsV2R(node: unknown): string[] {
  if (!isRecordV2R(node)) return [];
  const ids: string[] = [];
  if (typeof node.selectedOperatorId === 'string' && node.selectedOperatorId) {
    ids.push(node.selectedOperatorId);
  }
  for (const alternative of stringsV2R(node.alternativeOperatorIds)) ids.push(alternative);
  return ids;
}

export function validateSelectedOperatorNodesV2R(
  nodes: unknown,
  catalogOperatorIds: ReadonlySet<string>,
): readonly string[] {
  const diagnostics: string[] = [];
  const list = Array.isArray(nodes) ? nodes : [];
  list.forEach((entry, index) => {
    if (!isRecordV2R(entry)) { diagnostics.push(`NODE_NOT_RECORD:node[${index}]`); return; }
    const nodeId = nodeIdOfV2R(entry, index);
    const selected = typeof entry.selectedOperatorId === 'string' ? entry.selectedOperatorId : '';
    if (!selected) {
      diagnostics.push(`NODE_SELECTED_OPERATOR_MISSING:${nodeId}`);
    } else if (!catalogOperatorIds.has(selected)) {
      diagnostics.push(`SELECTED_OPERATOR_UNKNOWN:${nodeId}:${selected}`);
    }
    const alternatives = stringsV2R(entry.alternativeOperatorIds);
    if (selected && alternatives.includes(selected)) {
      diagnostics.push(`ALTERNATIVE_INCLUDES_SELECTED:${nodeId}`);
    }
    for (const alternative of alternatives) {
      if (!catalogOperatorIds.has(alternative)) {
        diagnostics.push(`ALTERNATIVE_OPERATOR_UNKNOWN:${nodeId}:${alternative}`);
      }
    }
    if (entry.failureDisposition === 'CAPABILITY_GAP' || entry.failureDisposition === 'ASK_USER') {
      diagnostics.push(`GAP_DISPOSITION_ON_EXECUTABLE_NODE:${nodeId}`);
    }
  });
  return deepFreezeV1(diagnostics);
}

export function selectedOperatorDriftDiagnosticsV2R(
  sourceNodes: unknown,
  boundNodes: unknown,
): readonly string[] {
  const diagnostics: string[] = [];
  const sourceById = new Map<string, JsonRecord>();
  for (const node of Array.isArray(sourceNodes) ? sourceNodes : []) {
    if (isRecordV2R(node) && typeof node.intentNodeId === 'string') sourceById.set(node.intentNodeId, node);
  }
  const boundById = new Map<string, JsonRecord>();
  for (const node of Array.isArray(boundNodes) ? boundNodes : []) {
    if (isRecordV2R(node) && typeof node.intentNodeId === 'string') boundById.set(node.intentNodeId, node);
  }
  for (const [intentNodeId, sourceNode] of sourceById) {
    const boundNode = boundById.get(intentNodeId);
    if (!boundNode) { diagnostics.push(`NODE_MISSING:${intentNodeId}`); continue; }
    const sourceOperators = new Set(referencedOperatorIdsV2R([sourceNode]));
    const boundOperators = new Set(referencedOperatorIdsV2R([boundNode]));
    const same = sourceOperators.size === boundOperators.size
      && [...sourceOperators].every((operatorId) => boundOperators.has(operatorId));
    if (!same) diagnostics.push(`OPERATOR_SET_DRIFT:${intentNodeId}`);
  }
  for (const intentNodeId of boundById.keys()) {
    if (!sourceById.has(intentNodeId)) diagnostics.push(`NODE_ADDED:${intentNodeId}`);
  }
  return deepFreezeV1(diagnostics);
}
