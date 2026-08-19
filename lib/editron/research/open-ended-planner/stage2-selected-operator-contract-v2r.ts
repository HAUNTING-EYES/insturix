import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE2_SELECTED_OPERATOR_CONTRACT_VERSION_V2R =
  'EDITRON_OE_STAGE2_SELECTED_OPERATOR_V2R_5' as const;

export const STAGE2_SELECTED_OPERATOR_INSTRUCTIONS_V2R = deepFreezeV1({
  stage2: [
    'Every executable intent node selects exactly one selectedOperatorId that will execute; record considered but non-executed options separately in alternativeOperatorIds and never mix executed and non-executed operators in one field.',
    'Select operators only from the provided operator catalog; an operatorId that is not in the catalog cannot execute and will be rejected.',
    'Catalog presence means an operator may describe the intended plan; it does not by itself prove end-to-end execution. modelInput.researchExecutionContract is the normative task-scoped execution truth. A selected operator marked EXECUTABLE_VIA_REGISTERED_RESEARCH_PROXY must not be rejected merely because production certification is incomplete. A selected operator marked NOT_EXECUTABLE_* requires an explicit capability-gap disposition and must never be presented as ready to execute.',
    'For each node, supply the semantic input values the selected operator needs in nodeInputs. Each nodeInputs key must exactly match one of the selected operator declared input field names from its input schema (for example `query` for find_* operators, `intent` for resolve_* operators, and the declared plan or effect field for mutation operators); do not invent alternative key names. These are your editorial decisions and must be produced by you, not left for the system to invent.',
    'Express clarification or capability gap only through unresolvedRequirements dispositions, never through an empty, placeholder, or pseudo operator node.',
    'The deterministic lowerer adds zero operations and drops zero selected operations. Select every read, resolver, mutation, and proof operation the edit requires as its own node; no operator is inserted or completed for you.',
  ],
  stage3: [
    'Preserve every Stage-2 selectedOperatorId and alternativeOperatorIds unchanged; Stage 3 binds evidence, rights, revision, preservation, and proof requirements and must not add, drop, or substitute operators.',
    'Do not return or retranscribe nodeInputs in Stage 3. The immutable Stage-2 artifact is the sole semantic-input source for deterministic lowering.',
    'Preserve the task-scoped research execution truth: production certification does not block a registered bounded proxy, but any selected NOT_EXECUTABLE_* operator requires CAPABILITY_GAP rather than READY_FOR_COMPILATION.',
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
