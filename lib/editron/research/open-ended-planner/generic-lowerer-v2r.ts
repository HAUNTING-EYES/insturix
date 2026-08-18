import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export const GENERIC_LOWERING_POLICY_VERSION_V2R = 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R_2' as const;

export type FieldBindingSourceV2R =
  | 'REVISION_PROJECT_ID'
  | 'REVISION_EXPECTED_REVISION'
  | 'FACT_FIELD'
  | 'NODE_OUTPUT'
  | 'EVIDENCE_IDS'
  | 'MODEL_INPUT'
  | 'STATIC';

export interface NodeOutputProducerV2R {
  operatorId: string;
  outputName: string;
}

export interface FieldBindingRuleV2R {
  source: FieldBindingSourceV2R;
  factKind?: string;
  factField?: string;
  nodeIntentNodeId?: string;
  outputName?: string;
  outputNames?: readonly string[];
  producers?: readonly NodeOutputProducerV2R[];
  // For MODEL_INPUT: which nodeInputs key to read (defaults to the bound field name).
  modelInputField?: string;
  staticValue?: unknown;
}

export interface GenericLoweringPolicyV2R {
  policyVersion: typeof GENERIC_LOWERING_POLICY_VERSION_V2R;
  taskId: string;
  fieldBindings: Record<string, FieldBindingRuleV2R>;
  operatorFieldBindings?: Record<string, Record<string, FieldBindingRuleV2R>>;
}

export interface GenericLowererInputV2R {
  taskId: string;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
  policy: GenericLoweringPolicyV2R;
}

export interface GenericLoweringResultV2R {
  compiled: Readonly<JsonRecord>;
  zeroAdd: boolean;
  zeroDrop: boolean;
  compiledOperatorIds: readonly string[];
  selectedOperatorIds: readonly string[];
  diagnostics: readonly string[];
}

const catalog = operatorCatalogJson as unknown as JsonRecord;
const operators = new Map<string, JsonRecord>(
  records(catalog.operators).map((operator) => [text(operator.operatorId), operator]),
);

const RESOURCE_POLICY_BY_KIND: Record<string, string> = {
  READ: 'OE_STAGE4_READ_V1',
  RESOLVER: 'OE_STAGE4_RESOLVER_V1',
  GENERATED_COMPOSITION: 'OE_STAGE4_GENERATED_SANDBOX_V1',
  MUTATION: 'OE_STAGE4_MUTATION_PROXY_V1',
};

const RETRY_BY_KIND: Record<string, string> = {
  READ: 'TRANSIENT_SAME_COMMAND',
  RESOLVER: 'TRANSIENT_SAME_COMMAND',
  MUTATION: 'NEVER_RETRY',
  GENERATED_COMPOSITION: 'NEVER_RETRY',
};

export function lowerV2RBoundIntentGeneric(input: GenericLowererInputV2R): Readonly<GenericLoweringResultV2R> {
  const diagnostics: string[] = [];
  const boundIntent = record(input.evidenceBoundIntent);
  const editorialIntent = record(input.editorialIntent);
  const pack = record(input.evidencePack);
  const facts = records(pack.facts);
  const boundNodes = records(boundIntent.nodes);
  const intentNodes = records(editorialIntent.nodes);
  const intentNodesById = new Map(intentNodes.map((node) => [text(node.intentNodeId), node]));
  const bindingsByNodeId = indexBindings(records(boundIntent.evidenceBindings));

  const revision = record(boundIntent.revisionBinding);
  const projectId = text(revision.projectId);
  const expectedProjectRevision = text(revision.expectedProjectRevision);
  if (!projectId || !expectedProjectRevision) diagnostics.push('LOWERING_REVISION_BINDING_MISSING');

  // Hard-validate dependencies: every requiresNodeIds entry must reference an
  // existing intent node. A dangling dependency is a plan defect; the dependent
  // node is marked unresolved and excluded from compilation rather than lowered
  // against a missing producer.
  const intentNodeIdSet = new Set(intentNodes.map((node) => text(node.intentNodeId)));
  const danglingDependencyNodeIds = new Set<string>();
  for (const node of intentNodes) {
    const nodeId = text(node.intentNodeId);
    for (const required of strings(node.requiresNodeIds)) {
      if (!intentNodeIdSet.has(required)) {
        diagnostics.push(`LOWERING_DANGLING_DEPENDENCY:${nodeId}:${required}`);
        danglingDependencyNodeIds.add(nodeId);
      }
    }
  }

  const selectedOperatorIds: string[] = [];
  const compiledNodes: JsonRecord[] = [];
  const unresolvedIntentNodeIds: string[] = [];
  const compiledOperatorIds: string[] = [];

  // Process nodes in dependency (topological) order so a node-output producer is
  // always compiled before its consumer, regardless of the model's array order.
  const orderedBoundNodes = topoOrderBoundNodesV2R(boundNodes, intentNodesById);
  for (const boundNode of orderedBoundNodes) {
    const intentNodeId = text(boundNode.intentNodeId);
    const selectedOperatorId = typeof boundNode.selectedOperatorId === 'string' ? boundNode.selectedOperatorId : '';
    if (!selectedOperatorId) {
      diagnostics.push(`LOWERING_SELECTED_OPERATOR_MISSING:${intentNodeId}`);
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }
    selectedOperatorIds.push(selectedOperatorId);
    if (danglingDependencyNodeIds.has(intentNodeId)) {
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }
    const operator = operators.get(selectedOperatorId);
    if (!operator) {
      diagnostics.push(`LOWERING_OPERATOR_UNKNOWN:${intentNodeId}:${selectedOperatorId}`);
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }
    const eligibility = text(operator.compilerEligibility);
    const supportStatus = text(operator.supportStatus);
    if (eligibility === 'NOT_COMPILABLE' || supportStatus === 'RESEARCH_ONLY_NOT_IMPLEMENTED') {
      diagnostics.push(`LOWERING_OPERATOR_NOT_COMPILABLE:${intentNodeId}:${selectedOperatorId}`);
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }

    const kind = text(operator.kind);
    const inputSpec = record(operator.input);
    const requiredFields = strings(inputSpec.required);
    const declaredFields = strings(inputSpec.fields);
    const inputs: JsonRecord = {};
    const reads: string[] = [];
    for (const field of declaredFields) {
      const bound = bindField(field, {
        boundNode, intentNode: intentNodesById.get(intentNodeId),
        intentNodes,
        facts, bindingsByNodeId, projectId, expectedProjectRevision,
        policy: input.policy, compiledNodes,
      }, diagnostics, intentNodeId, requiredFields.includes(field), selectedOperatorId);
      if (bound.present) {
        inputs[field] = bound.value;
        if (bound.readFactId) reads.push(bound.readFactId);
      }
    }
    const missingRequired = requiredFields.filter((field) => !(field in inputs));
    if (missingRequired.length) {
      for (const field of missingRequired) diagnostics.push(`INPUT_BINDING_MISSING:${intentNodeId}:${field}`);
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }

    const nodeId = `compile-${intentNodeId}`;
    const outputNames = strings(record(operator.output).required);
    const produces = outputNames.map((outputName) => `${nodeId}.${outputName}`);
    const intentNode = intentNodesById.get(intentNodeId);
    const requires = strings(intentNode?.requiresNodeIds).map((requiredNodeId) => `compile-${requiredNodeId}`);
    compiledNodes.push(compiledNode({
      nodeId,
      intentNodeId,
      operatorId: selectedOperatorId,
      operatorSpecRef: `EDITRON_OPERATOR_SPECS_V2@${text(catalog.version)}#${selectedOperatorId}`,
      ownerRef: ownerRef(operator),
      inputs,
      reads,
      writes: kind === 'MUTATION' ? strings(operator.stateEffects) : [],
      requires,
      produces,
      invalidates: kind === 'READ' || kind === 'RESOLVER' ? [] : strings(intentNode?.invalidates),
      projectId,
      expectedProjectRevision,
      proofObligationIds: strings(boundNode.proofObligationIds),
      policyFactIds: policyFactIds(facts),
      resourcePolicyId: RESOURCE_POLICY_BY_KIND[kind] ?? 'OE_STAGE4_READ_V1',
      retryDisposition: RETRY_BY_KIND[kind] ?? 'NEVER_RETRY',
      concurrencyClass: kind === 'MUTATION' ? 'MUTATION_EXCLUSIVE' : kind === 'GENERATED_COMPOSITION' ? 'GENERATED_SANDBOX_ISOLATED' : kind === 'RESOLVER' ? 'RESOLVER_ISOLATED' : 'READ_SHARED',
      reversibility: kind === 'MUTATION' ? 'CHECKPOINT_REQUIRED' : 'NOT_APPLICABLE_READ_ONLY',
      traceRefs: [intentNodeId, ...strings(boundNode.evidenceBindingIds), ...strings(boundNode.proofObligationIds), ...strings(boundNode.preservationIds)],
    }));
    compiledOperatorIds.push(selectedOperatorId);
  }

  const edges = buildEdges(compiledNodes);
  const selectedSet = new Set(selectedOperatorIds);
  const zeroAdd = compiledOperatorIds.every((operatorId) => selectedSet.has(operatorId));
  const compiledIntentNodeIds = compiledNodes.map((node) => text(node.intentNodeId));
  const noDuplicateCompilation = new Set(compiledIntentNodeIds).size === compiledIntentNodeIds.length;
  const accountedIntentNodeIds = new Set([...compiledIntentNodeIds, ...unresolvedIntentNodeIds]);
  const noOverlap = compiledIntentNodeIds.every((intentNodeId) => !unresolvedIntentNodeIds.includes(intentNodeId));
  const zeroDrop = noDuplicateCompilation && noOverlap
    && accountedIntentNodeIds.size === selectedOperatorIds.length;
  if (!zeroAdd) diagnostics.push('LOWERING_ZERO_ADD_VIOLATED');
  if (!zeroDrop) diagnostics.push('LOWERING_ZERO_DROP_VIOLATED');

  const compileDisposition = diagnostics.some((diagnostic) => diagnostic.startsWith('LOWERING_ZERO_'))
    ? 'FAIL'
    : unresolvedIntentNodeIds.length
    ? (boundIntent.stageDisposition === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'CAPABILITY_GAP')
    // Honor an honestly-declared top-level graph gap/unverifiable disposition even
    // when every individually selected node compiled (e.g. DEV-04: the read nodes
    // compile, but the model declared the moving-matte capability gap at graph level).
    : boundIntent.stageDisposition === 'CAPABILITY_GAP'
    ? 'CAPABILITY_GAP'
    : boundIntent.stageDisposition === 'UNVERIFIABLE'
    ? 'UNVERIFIABLE'
    : 'COMPILED_RESEARCH_PROXY';

  const compiled = deepFreezeV1({
    artifactType: 'CompiledOperationGraphV2',
    taskId: input.taskId,
    compileDisposition,
    executionEligibility: compileDisposition === 'COMPILED_RESEARCH_PROXY' ? 'RESEARCH_PROXY_ONLY' : 'NOT_EXECUTABLE',
    sourceEditorialIntentHash: hashCanonicalJsonV1(input.editorialIntent),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(input.evidenceBoundIntent),
    evidencePackHash: hashCanonicalJsonV1(input.evidencePack),
    operatorCatalogVersion: text(catalog.version),
    projectId,
    expectedProjectRevision,
    nodes: compiledNodes,
    edges,
    proofPolicy: {
      proofVersion: 'OE_STAGE4_PROOF_POLICY_V1',
      mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION',
      proofObligationIds: uniqueStrings(boundNodes.flatMap((node) => strings(node.proofObligationIds))),
      preservationIds: uniqueStrings(boundNodes.flatMap((node) => strings(node.preservationIds))),
      onUnverifiable: 'BLOCK_EXECUTION',
    },
    diagnostics: uniqueStrings(diagnostics).map((message) => loweringDiagnostic(input.taskId, message)),
    unresolvedIntentNodeIds: uniqueStrings(unresolvedIntentNodeIds),
    lowering: {
      policyVersion: GENERIC_LOWERING_POLICY_VERSION_V2R,
      zeroAdd,
      zeroDrop,
      compiledOperatorCount: compiledOperatorIds.length,
      selectedOperatorCount: selectedOperatorIds.length,
    },
  });

  return deepFreezeV1({
    compiled,
    zeroAdd,
    zeroDrop,
    compiledOperatorIds: deepFreezeV1(compiledOperatorIds),
    selectedOperatorIds: deepFreezeV1(selectedOperatorIds),
    diagnostics: deepFreezeV1(uniqueStrings(diagnostics)),
  });
}

interface FieldBindContextV2R {
  boundNode: JsonRecord;
  intentNode: JsonRecord | undefined;
  intentNodes: JsonRecord[];
  facts: JsonRecord[];
  bindingsByNodeId: Map<string, string[]>;
  projectId: string;
  expectedProjectRevision: string;
  policy: GenericLoweringPolicyV2R;
  compiledNodes: JsonRecord[];
}

function bindField(
  field: string,
  context: FieldBindContextV2R,
  diagnostics: string[],
  intentNodeId: string,
  required: boolean,
  operatorId: string,
): { present: boolean; value?: unknown; readFactId?: string } {
  const operatorOverride = context.policy.operatorFieldBindings?.[operatorId]?.[field];
  const rule = operatorOverride ?? context.policy.fieldBindings[field];
  if (!rule) {
    if (required) diagnostics.push(`LOWERING_FIELD_RULE_MISSING:${field}`);
    return { present: false };
  }
  switch (rule.source) {
    case 'REVISION_PROJECT_ID':
      return context.projectId ? { present: true, value: context.projectId } : { present: false };
    case 'REVISION_EXPECTED_REVISION':
      return context.expectedProjectRevision ? { present: true, value: context.expectedProjectRevision } : { present: false };
    case 'EVIDENCE_IDS': {
      const evidenceIds = strings(context.intentNode?.evidenceIds);
      return evidenceIds.length ? { present: true, value: evidenceIds } : { present: false };
    }
    case 'STATIC':
      return rule.staticValue === undefined ? { present: false } : { present: true, value: rule.staticValue };
    case 'FACT_FIELD': {
      const fact = findBoundFact(context, rule.factKind);
      if (!fact) return { present: false };
      const value = rule.factField ? fact[rule.factField] : fact;
      if (value === undefined) return { present: false };
      return { present: true, value, readFactId: text(fact.factId) };
    }
    case 'MODEL_INPUT': {
      const nodeInputs = record(context.boundNode.nodeInputs);
      const modelInputField = rule.modelInputField ?? field;
      const value = nodeInputs[modelInputField];
      if (value === undefined || value === null || value === '') return { present: false };
      return { present: true, value };
    }
    case 'NODE_OUTPUT': {
      if (rule.producers?.length) {
        for (const producer of rule.producers) {
          const producerNodeId = resolveProducerByOperatorV2R(
            intentNodeId, producer.operatorId, producer.outputName,
            context.intentNodes, context.compiledNodes,
          );
          if (producerNodeId) return { present: true, value: `${producerNodeId}.${producer.outputName}` };
        }
        return { present: false };
      }
      const candidateOutputs = rule.outputNames?.length
        ? [...rule.outputNames]
        : [rule.outputName ?? 'result'];
      for (const outputName of candidateOutputs) {
        const producerNodeId = resolveProducerByDependencyV2R(
          intentNodeId, outputName, context.intentNodes, context.compiledNodes,
        );
        if (producerNodeId) return { present: true, value: `${producerNodeId}.${outputName}` };
      }
      return { present: false };
    }
    default:
      return { present: false };
  }
}

// Resolve a node-output reference to a specific producer operator: walk the
// current node's transitive dependencies and return the first compiled dependency
// whose operatorId matches and which produces the named output. Disambiguates the
// case where several resolvers all produce a same-named output (proposedOperation).
function resolveProducerByOperatorV2R(
  currentIntentNodeId: string,
  producerOperatorId: string,
  outputName: string,
  intentNodes: JsonRecord[],
  compiledNodes: JsonRecord[],
): string | null {
  const requiresMap = new Map<string, string[]>();
  for (const node of intentNodes) {
    requiresMap.set(text(node.intentNodeId), strings(node.requiresNodeIds));
  }
  const compiledByIntentId = new Map<string, JsonRecord>();
  for (const node of compiledNodes) {
    compiledByIntentId.set(text(node.intentNodeId), node);
  }
  const visited = new Set<string>();
  const queue = [...(requiresMap.get(currentIntentNodeId) ?? [])];
  while (queue.length) {
    const dependencyId = queue.shift() as string;
    if (visited.has(dependencyId)) continue;
    visited.add(dependencyId);
    const compiled = compiledByIntentId.get(dependencyId);
    if (compiled
      && compiled.operatorId === producerOperatorId
      && strings(compiled.produces).includes(`compile-${dependencyId}.${outputName}`)) {
      return `compile-${dependencyId}`;
    }
    queue.push(...(requiresMap.get(dependencyId) ?? []));
  }
  return null;
}

// Resolve a node-output reference by dependency dataflow: walk the current node's
// transitive requiresNodeIds and return the first compiled dependency that
// produces the named output. This works for any model plan shape because it keys
// on the model's own dependency edges, not on canonical node identifiers.
function resolveProducerByDependencyV2R(
  currentIntentNodeId: string,
  outputName: string,
  intentNodes: JsonRecord[],
  compiledNodes: JsonRecord[],
): string | null {
  const requiresMap = new Map<string, string[]>();
  for (const node of intentNodes) {
    requiresMap.set(text(node.intentNodeId), strings(node.requiresNodeIds));
  }
  const compiledByIntentId = new Map<string, JsonRecord>();
  for (const node of compiledNodes) {
    compiledByIntentId.set(text(node.intentNodeId), node);
  }
  const visited = new Set<string>();
  const queue = [...(requiresMap.get(currentIntentNodeId) ?? [])];
  while (queue.length) {
    const dependencyId = queue.shift() as string;
    if (visited.has(dependencyId)) continue;
    visited.add(dependencyId);
    const compiled = compiledByIntentId.get(dependencyId);
    if (compiled && strings(compiled.produces).includes(`compile-${dependencyId}.${outputName}`)) {
      return `compile-${dependencyId}`;
    }
    queue.push(...(requiresMap.get(dependencyId) ?? []));
  }
  return null;
}

// Topologically order bound nodes by the intent graph's requiresNodeIds so that
// a node-output producer is compiled before its consumer. Falls back to the
// model's original array order if the graph has a cycle.
function topoOrderBoundNodesV2R(
  boundNodes: JsonRecord[],
  intentNodesById: Map<string, JsonRecord>,
): JsonRecord[] {
  const nodeIds = boundNodes.map((node) => text(node.intentNodeId));
  const nodeIdSet = new Set(nodeIds);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }
  for (const id of nodeIds) {
    const requires = strings(intentNodesById.get(id)?.requiresNodeIds).filter((required) => nodeIdSet.has(required));
    inDegree.set(id, requires.length);
    for (const required of requires) (dependents.get(required) ?? []).push(id);
  }
  const queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  if (order.length !== nodeIds.length) return boundNodes;
  const byId = new Map(boundNodes.map((node) => [text(node.intentNodeId), node]));
  return order.map((id) => byId.get(id) as JsonRecord);
}

function findBoundFact(context: FieldBindContextV2R, factKind: string | undefined): JsonRecord | undefined {
  if (!factKind) return undefined;
  const boundFactIds = new Set(
    strings(context.boundNode.evidenceBindingIds)
      .flatMap((bindingId) => context.bindingsByNodeId.get(bindingId) ?? []),
  );
  const directlyBound = context.facts.find((fact) => text(fact.kind) === factKind && boundFactIds.has(text(fact.factId)));
  if (directlyBound) return directlyBound;
  return context.facts.find((fact) => text(fact.kind) === factKind);
}

function indexBindings(bindings: JsonRecord[]): Map<string, string[]> {
  const factIdsByBindingId = new Map<string, string[]>();
  for (const binding of bindings) {
    factIdsByBindingId.set(text(binding.bindingId), strings(binding.factIds));
  }
  return factIdsByBindingId;
}

function buildEdges(compiledNodes: JsonRecord[]): JsonRecord[] {
  const nodeIds = new Set(compiledNodes.map((node) => text(node.nodeId)));
  const edges: JsonRecord[] = [];
  let index = 0;
  for (const node of compiledNodes) {
    for (const required of strings(node.requires)) {
      if (!nodeIds.has(required)) continue;
      edges.push({
        edgeId: `lowered-edge-${index}`,
        fromNodeId: required,
        toNodeId: text(node.nodeId),
        edgeType: 'DATA',
      });
      index += 1;
    }
  }
  return edges;
}

function policyFactIds(facts: JsonRecord[]): string[] {
  return facts
    .filter((fact) => ['RIGHTS_POLICY', 'PRIVACY_EGRESS_POLICY'].includes(text(fact.kind)))
    .map((fact) => text(fact.factId));
}

function loweringDiagnostic(taskId: string, message: string): JsonRecord {
  const [code, detail] = message.split(':');
  return {
    diagnosticId: `lowering-${message.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`,
    code: loweringDiagnosticCode(code ?? message),
    intentNodeIds: detail ? [detail.split(':')[0]] : [taskId],
    operatorIds: [],
    factIds: [],
    disposition: code === 'LOWERING_OPERATOR_NOT_COMPILABLE' ? 'CAPABILITY_GAP' : 'FAIL',
  };
}

function loweringDiagnosticCode(code: string): string {
  if (code === 'LOWERING_OPERATOR_NOT_COMPILABLE') return 'OPERATOR_NOT_COMPILABLE';
  if (code === 'LOWERING_OPERATOR_UNKNOWN') return 'OPERATOR_SELECTION_AMBIGUOUS';
  if (code === 'INPUT_BINDING_MISSING' || code === 'LOWERING_FIELD_RULE_MISSING') return 'INPUT_BINDING_MISSING';
  if (code === 'LOWERING_REVISION_BINDING_MISSING') return 'REVISION_CONFLICT';
  return 'SCHEMA_UNVERIFIABLE';
}

function compiledNode(input: {
  nodeId: string; intentNodeId: string; operatorId: string; operatorSpecRef: string; ownerRef: string;
  inputs: JsonRecord; reads: string[]; writes: string[]; requires: string[]; produces: string[];
  invalidates: string[]; projectId: string; expectedProjectRevision: string; proofObligationIds: string[];
  policyFactIds: string[]; resourcePolicyId: string; retryDisposition: string; concurrencyClass: string;
  reversibility: string; traceRefs: string[];
}): JsonRecord {
  return {
    nodeId: input.nodeId,
    intentNodeId: input.intentNodeId,
    operatorId: input.operatorId,
    operatorSpecRef: input.operatorSpecRef,
    ownerRef: input.ownerRef,
    inputs: input.inputs,
    reads: input.reads,
    writes: input.writes,
    requires: input.requires,
    produces: input.produces,
    invalidates: input.invalidates,
    coordinateBindings: [],
    revisionBinding: { projectId: input.projectId, expectedProjectRevision: input.expectedProjectRevision },
    stabilityRequirement: 'NONE',
    stateEffects: input.writes,
    idempotency: { scope: 'PROJECT_REVISION', keyMaterialRefs: [input.nodeId] },
    proofObligationIds: input.proofObligationIds,
    failureDisposition: 'ABORT_GRAPH',
    retryDisposition: input.retryDisposition,
    policyFactIds: input.policyFactIds,
    concurrency: { class: input.concurrencyClass, conflictDomainRefs: input.concurrencyClass === 'MUTATION_EXCLUSIVE' ? [input.intentNodeId] : [] },
    resourcePolicyId: input.resourcePolicyId,
    reversibility: { disposition: input.reversibility, undoBindingRefs: input.reversibility === 'CHECKPOINT_REQUIRED' ? [input.nodeId] : [] },
    traceRefs: input.traceRefs,
  };
}

function ownerRef(operator: JsonRecord): string {
  if (typeof operator.ownerRef === 'string' && operator.ownerRef) return operator.ownerRef;
  const owner = record(operator.owner);
  if (typeof owner.path === 'string' && typeof owner.symbol === 'string') return `${owner.path}#${owner.symbol}`;
  return `v1:${text(operator.operatorId)}`;
}

function record(value: unknown): JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
