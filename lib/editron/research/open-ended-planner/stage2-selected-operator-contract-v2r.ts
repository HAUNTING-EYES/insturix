import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R =
  'EDITRON_OE_STAGE2_SELECTED_OPERATOR_V2R_6' as const;

export const STAGE2_SELECTED_OPERATOR_INSTRUCTIONS_V2R = deepFreezeV1({
  stage2: [
    'Every executable intent node selects exactly one selectedOperatorId that will execute; record considered but non-executed options separately in alternativeOperatorIds and never mix executed and non-executed operators in one field.',
    'Select operators only from the provided operator catalog; an operatorId that is not in the catalog cannot execute and will be rejected.',
    'Catalog presence means an operator may describe the intended plan; it does not by itself prove end-to-end execution. modelInput.researchExecutionContract is the normative task-scoped execution truth. An operator marked EXECUTABLE_VIA_REGISTERED_RESEARCH_PROXY may be selected even when production certification is incomplete. An operator marked NOT_EXECUTABLE_* must not be selected for execution: represent the intent as a capability-gap node, set selectedOperatorId to null, omit nodeInputs, record catalog-known considered operators only in alternativeOperatorIds, and set failureDisposition to CAPABILITY_GAP.',
    'For each node, supply the semantic input values the selected operator needs in nodeInputs. Each nodeInputs key must exactly match one of the selected operator declared input field names from its input schema (for example `query` for find_* operators, `intent` for resolve_* operators, and the declared plan or effect field for mutation operators); do not invent alternative key names. These are your editorial decisions and must be produced by you, not left for the system to invent.',
    'A capability-gap node is an explicit non-executable intent: it keeps operationFamily, target claims, dependencies and alternatives, sets selectedOperatorId to null, and has no nodeInputs. Never invent an empty string, placeholder or pseudo operator. Clarification remains an unresolved requirement, not a capability-gap node.',
    'The deterministic lowerer adds zero operations and drops zero selected executable operations. Select every read, resolver, mutation, and proof operation the executable edit requires as its own node; no operator is inserted or completed for you. Capability-gap nodes are terminal non-executable evidence and are never lowered.',
  ],
  stage3: [
    'Preserve every Stage-2 selectedOperatorId (including null on a capability-gap node) and alternativeOperatorIds unchanged; Stage 3 binds evidence, rights, revision, preservation, and proof requirements and must not add, drop, or substitute operators.',
    'Do not return or retranscribe nodeInputs in Stage 3. The immutable Stage-2 artifact is the sole semantic-input source for deterministic lowering.',
    'Preserve the task-scoped research execution truth: production certification does not block a registered bounded proxy, but a capability-gap node remains unselected and requires the overall CAPABILITY_GAP disposition rather than READY_FOR_COMPILATION.',
  ],
});

const stringSchema = { type: 'string', minLength: 1 };
const stringArraySchema = { type: 'array', items: stringSchema, uniqueItems: true };
const nullableOperatorIdSchema = { anyOf: [stringSchema, { type: 'null' }] };

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
    selectedOperatorId: nullableOperatorIdSchema,
    alternativeOperatorIds: stringArraySchema,
    executionForm: { type: 'string', enum: ['NATIVE', 'GENERATED_COMPOSITION'] },
    requiresNodeIds: stringArraySchema,
    invalidates: stringArraySchema,
    evidenceIds: stringArraySchema,
    failureDisposition: { type: 'string', enum: ['NEEDS_REVIEW', 'FAIL', 'CAPABILITY_GAP'] },
    // Semantic input values the model itself must produce for the selected
    // operator (e.g. the search `query` for find_* operators, the edit `intent`
    // for resolve_* operators). These are the creative/editorial decisions and
    // must NOT be supplied by the lowering policy. Structural values (project
    // revision, overlay ids, ranges) remain bound by the lowerer from
    // revision/facts. Optional at the schema level because it is
    // operator-dependent; the lowerer enforces presence per operator.
    nodeInputs: { type: 'object', additionalProperties: true },
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
    selectedOperatorId: nullableOperatorIdSchema,
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
  if (!list.length) diagnostics.push('NODE_SET_EMPTY');
  list.forEach((entry, index) => {
    if (!isRecordV2R(entry)) { diagnostics.push(`NODE_NOT_RECORD:node[${index}]`); return; }
    const nodeId = nodeIdOfV2R(entry, index);
    const selected = typeof entry.selectedOperatorId === 'string' ? entry.selectedOperatorId : '';
    const isCapabilityGap = entry.failureDisposition === 'CAPABILITY_GAP';
    if (!selected && !isCapabilityGap) {
      diagnostics.push(`NODE_SELECTED_OPERATOR_MISSING:${nodeId}`);
    } else if (!catalogOperatorIds.has(selected)) {
      if (selected) diagnostics.push(`SELECTED_OPERATOR_UNKNOWN:${nodeId}:${selected}`);
    }
    if (selected && isCapabilityGap) {
      diagnostics.push(`GAP_DISPOSITION_ON_EXECUTABLE_NODE:${nodeId}`);
    }
    if (isCapabilityGap && 'nodeInputs' in entry) {
      diagnostics.push(`GAP_NODE_HAS_INPUTS:${nodeId}`);
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
    if (entry.failureDisposition === 'ASK_USER') {
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
    if (isRecordV2R(node) && typeof node.intentNodeId === 'string') {
      if (sourceById.has(node.intentNodeId)) diagnostics.push(`SOURCE_NODE_DUPLICATE:${node.intentNodeId}`);
      sourceById.set(node.intentNodeId, node);
    }
  }
  const boundById = new Map<string, JsonRecord>();
  for (const node of Array.isArray(boundNodes) ? boundNodes : []) {
    if (isRecordV2R(node) && typeof node.intentNodeId === 'string') {
      if (boundById.has(node.intentNodeId)) diagnostics.push(`BOUND_NODE_DUPLICATE:${node.intentNodeId}`);
      boundById.set(node.intentNodeId, node);
    }
  }
  for (const [intentNodeId, sourceNode] of sourceById) {
    const boundNode = boundById.get(intentNodeId);
    if (!boundNode) { diagnostics.push(`NODE_MISSING:${intentNodeId}`); continue; }
    const sourceOperators = new Set(referencedOperatorIdsV2R([sourceNode]));
    const boundOperators = new Set(referencedOperatorIdsV2R([boundNode]));
    const same = sourceOperators.size === boundOperators.size
      && [...sourceOperators].every((operatorId) => boundOperators.has(operatorId));
    if (!same) {
      diagnostics.push(`OPERATOR_SET_DRIFT:${intentNodeId}`);
      continue;
    }
    if (sourceNode.selectedOperatorId !== boundNode.selectedOperatorId) {
      diagnostics.push(`SELECTED_OPERATOR_ROLE_DRIFT:${intentNodeId}`);
    }
    if (hashCanonicalJsonV1(sourceNode.alternativeOperatorIds) !== hashCanonicalJsonV1(boundNode.alternativeOperatorIds)) {
      diagnostics.push(`ALTERNATIVE_OPERATOR_DRIFT:${intentNodeId}`);
    }
  }
  for (const intentNodeId of boundById.keys()) {
    if (!sourceById.has(intentNodeId)) diagnostics.push(`NODE_ADDED:${intentNodeId}`);
  }
  return deepFreezeV1(diagnostics);
}
