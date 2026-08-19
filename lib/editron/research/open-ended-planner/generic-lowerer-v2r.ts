import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import {
  createCompiledPortBindingEdgeV2R,
  type CompiledPortBindingEdgeV2R,
} from './compiled-port-binding-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { selectedOperatorDriftDiagnosticsV2R } from './stage2-selected-operator-contract-v2r';
import { validateJsonSchemaV2 } from './stage4-compilation-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export const GENERIC_LOWERING_POLICY_VERSION_V2R = 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R_3' as const;
export const PLANNER_INPUT_OWNERSHIP_VERSION_V2R = 'EDITRON_OE_PLANNER_INPUT_OWNERSHIP_V2R_1' as const;

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
  projectionPath?: readonly string[];
}

export type FieldValueAdapterV2R = 'FRAME_RANGE_V2R';

export interface FieldBindingRuleV2R {
  source: FieldBindingSourceV2R;
  factKind?: string;
  factField?: string;
  nodeIntentNodeId?: string;
  outputName?: string;
  outputNames?: readonly string[];
  producers?: readonly NodeOutputProducerV2R[];
  staticValue?: unknown;
  valueAdapter?: FieldValueAdapterV2R;
}

export interface GenericLoweringPolicyV2R {
  policyVersion: typeof GENERIC_LOWERING_POLICY_VERSION_V2R;
  taskId: string;
  fieldBindings: Record<string, FieldBindingRuleV2R>;
  operatorFieldBindings?: Record<string, Record<string, FieldBindingRuleV2R>>;
}

export interface PlannerInputFieldOwnershipV2R {
  field: string;
  required: boolean;
  jsonSchema: Readonly<JsonRecord> | null;
}

export interface PlannerCompilerBoundFieldV2R extends PlannerInputFieldOwnershipV2R {
  bindingSource: Exclude<FieldBindingSourceV2R, 'MODEL_INPUT'>;
}

export interface PlannerUnboundFieldV2R extends PlannerInputFieldOwnershipV2R {
  reason: 'NO_DECLARED_BINDING_RULE';
}

export interface PlannerOperatorInputOwnershipV2R {
  operatorId: string;
  modelOwnedInputFields: readonly Readonly<PlannerInputFieldOwnershipV2R>[];
  compilerBoundInputFields: readonly Readonly<PlannerCompilerBoundFieldV2R>[];
  unboundInputFields: readonly Readonly<PlannerUnboundFieldV2R>[];
}

export interface PlannerInputOwnershipV2R {
  ownershipVersion: typeof PLANNER_INPUT_OWNERSHIP_VERSION_V2R;
  policyVersion: typeof GENERIC_LOWERING_POLICY_VERSION_V2R;
  policySha256: string;
  taskId: string;
  operatorCatalogVersion: string;
  nodeInputsRule: 'NODE_INPUTS_CONTAIN_ONLY_MODEL_OWNED_FIELDS';
  unboundRequiredFieldsBlockSelection: true;
  operators: readonly Readonly<PlannerOperatorInputOwnershipV2R>[];
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
const fieldSchemas = record(catalog.fieldSchemas);

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

export function buildPlannerInputOwnershipV2R(
  policy: GenericLoweringPolicyV2R,
): Readonly<PlannerInputOwnershipV2R> {
  if (policy.policyVersion !== GENERIC_LOWERING_POLICY_VERSION_V2R) {
    throw new Error('PLANNER_INPUT_OWNERSHIP_POLICY_VERSION_DRIFT');
  }
  if (!policy.taskId) throw new Error('PLANNER_INPUT_OWNERSHIP_TASK_MISSING');

  const ownershipRows = records(catalog.operators).map((operator) => {
    const operatorId = text(operator.operatorId);
    const inputSpec = record(operator.input);
    const requiredFields = new Set(strings(inputSpec.required));
    const modelOwnedInputFields: PlannerInputFieldOwnershipV2R[] = [];
    const compilerBoundInputFields: PlannerCompilerBoundFieldV2R[] = [];
    const unboundInputFields: PlannerUnboundFieldV2R[] = [];

    for (const field of strings(inputSpec.fields)) {
      const schema = fieldSchemas[field];
      const fieldOwnership: PlannerInputFieldOwnershipV2R = {
        field,
        required: requiredFields.has(field),
        jsonSchema: schema && typeof schema === 'object' && !Array.isArray(schema)
          ? schema as JsonRecord
          : null,
      };
      const rule = policy.operatorFieldBindings?.[operatorId]?.[field]
        ?? policy.fieldBindings[field];
      if (!rule) {
        unboundInputFields.push({ ...fieldOwnership, reason: 'NO_DECLARED_BINDING_RULE' });
      } else if (rule.source === 'MODEL_INPUT') {
        modelOwnedInputFields.push(fieldOwnership);
      } else {
        compilerBoundInputFields.push({ ...fieldOwnership, bindingSource: rule.source });
      }
    }

    return {
      operatorId,
      modelOwnedInputFields,
      compilerBoundInputFields,
      unboundInputFields,
    };
  });

  return deepFreezeV1({
    ownershipVersion: PLANNER_INPUT_OWNERSHIP_VERSION_V2R,
    policyVersion: GENERIC_LOWERING_POLICY_VERSION_V2R,
    policySha256: hashCanonicalJsonV1(policy),
    taskId: policy.taskId,
    operatorCatalogVersion: text(catalog.version),
    nodeInputsRule: 'NODE_INPUTS_CONTAIN_ONLY_MODEL_OWNED_FIELDS',
    unboundRequiredFieldsBlockSelection: true,
    operators: ownershipRows,
  });
}

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
  diagnostics.push(...selectedOperatorDriftDiagnosticsV2R(intentNodes, boundNodes)
    .map((diagnostic) => `LOWERING_STAGE2_STAGE3_DRIFT:${diagnostic}`));
  for (const boundNode of boundNodes) {
    const intentNodeId = text(boundNode.intentNodeId);
    const selectedOperatorId = text(boundNode.selectedOperatorId);
    if (selectedOperatorId && !operators.has(selectedOperatorId)) {
      diagnostics.push(`LOWERING_OPERATOR_UNKNOWN:${intentNodeId}:${selectedOperatorId}`);
    }
  }

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

  const selectedOperatorIds = intentNodes.map((node) => text(node.selectedOperatorId));
  const compiledNodes: JsonRecord[] = [];
  const compiledPortBindings: CompiledPortBindingEdgeV2R[] = [];
  const unresolvedIntentNodeIds: string[] = [];
  const compiledOperatorIds: string[] = [];
  const blockingDisposition = executionBlockingDisposition(boundIntent);
  const stageContractDrift = diagnostics.some((diagnostic) => diagnostic.startsWith('LOWERING_STAGE2_STAGE3_DRIFT:'));

  // Process nodes in dependency (topological) order so a node-output producer is
  // always compiled before its consumer, regardless of the model's array order.
  const orderedBoundNodes = topoOrderBoundNodesV2R(boundNodes, intentNodesById);
  for (const boundNode of orderedBoundNodes) {
    const intentNodeId = text(boundNode.intentNodeId);
    if (blockingDisposition || stageContractDrift) {
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }
    const selectedOperatorId = typeof boundNode.selectedOperatorId === 'string' ? boundNode.selectedOperatorId : '';
    if (!selectedOperatorId) {
      diagnostics.push(`LOWERING_SELECTED_OPERATOR_MISSING:${intentNodeId}`);
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }
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
    const rawNodeInputs = record(boundNode.nodeInputs);
    for (const field of Object.keys(rawNodeInputs)) {
      if (!declaredFields.includes(field)) {
        diagnostics.push(`MODEL_INPUT_FIELD_UNDECLARED:${intentNodeId}:${field}`);
        continue;
      }
      const rule = input.policy.operatorFieldBindings?.[selectedOperatorId]?.[field]
        ?? input.policy.fieldBindings[field];
      if (rule?.source !== 'MODEL_INPUT') {
        diagnostics.push(`MODEL_INPUT_FIELD_NOT_MODEL_OWNED:${intentNodeId}:${field}`);
      }
      const fieldSchema = fieldSchemas[field];
      if (!fieldSchema) {
        diagnostics.push(`INPUT_FIELD_SCHEMA_MISSING:${intentNodeId}:${field}`);
        continue;
      }
      for (const schemaDiagnostic of validateJsonSchemaV2(rawNodeInputs[field], fieldSchema, `$.nodeInputs.${field}`)) {
        diagnostics.push(`MODEL_INPUT_SCHEMA_INVALID:${intentNodeId}:${field}:${schemaDiagnostic}`);
      }
    }
    if (diagnostics.some((diagnostic) => diagnostic.startsWith(`MODEL_INPUT_FIELD_UNDECLARED:${intentNodeId}:`)
      || diagnostic.startsWith(`MODEL_INPUT_FIELD_NOT_MODEL_OWNED:${intentNodeId}:`)
      || diagnostic.startsWith(`INPUT_FIELD_SCHEMA_MISSING:${intentNodeId}:`)
      || diagnostic.startsWith(`MODEL_INPUT_SCHEMA_INVALID:${intentNodeId}:`))) {
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }
    const inputs: JsonRecord = {};
    const reads: string[] = [];
    const nodePortBindings: CompiledPortBindingEdgeV2R[] = [];
    const portBoundFields = new Set<string>();
    const nodeId = `compile-${intentNodeId}`;
    for (const field of declaredFields) {
      const bound = bindField(field, {
        boundNode, intentNode: intentNodesById.get(intentNodeId),
        intentNodes,
        facts, bindingsByNodeId, projectId, expectedProjectRevision,
        policy: input.policy, compiledNodes,
      }, diagnostics, intentNodeId, requiredFields.includes(field), selectedOperatorId);
      if (bound.present) {
        if (bound.outputBinding) {
          const fieldSchema = fieldSchemas[field];
          if (!fieldSchema) {
            diagnostics.push(`INPUT_FIELD_SCHEMA_MISSING:${intentNodeId}:${field}`);
          } else {
            nodePortBindings.push(createCompiledPortBindingEdgeV2R({
              edgeId: `port-${nodeId}-${field}`,
              fromNodeId: bound.outputBinding.fromNodeId,
              fromPort: bound.outputBinding.fromPort,
              toNodeId: nodeId,
              toPort: field,
              projectionPath: bound.outputBinding.projectionPath,
              expectedInputSchemaHash: hashCanonicalJsonV1(fieldSchema),
            }));
            portBoundFields.add(field);
          }
        } else {
          inputs[field] = bound.value;
        }
        if (bound.readFactId) reads.push(bound.readFactId);
      }
    }
    for (const [field, value] of Object.entries(inputs)) {
      const fieldSchema = fieldSchemas[field];
      if (!fieldSchema) {
        diagnostics.push(`INPUT_FIELD_SCHEMA_MISSING:${intentNodeId}:${field}`);
        continue;
      }
      for (const schemaDiagnostic of validateJsonSchemaV2(value, fieldSchema, `$.inputs.${field}`)) {
        diagnostics.push(`COMPILED_INPUT_SCHEMA_INVALID:${intentNodeId}:${field}:${schemaDiagnostic}`);
      }
    }
    if (diagnostics.some((diagnostic) => diagnostic.startsWith(`INPUT_FIELD_SCHEMA_MISSING:${intentNodeId}:`)
      || diagnostic.startsWith(`COMPILED_INPUT_SCHEMA_INVALID:${intentNodeId}:`)
      || diagnostic.startsWith(`FIELD_ADAPTER_INVALID:${intentNodeId}:`))) {
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }
    const missingRequired = requiredFields.filter((field) => !(field in inputs) && !portBoundFields.has(field));
    if (missingRequired.length) {
      for (const field of missingRequired) diagnostics.push(`INPUT_BINDING_MISSING:${intentNodeId}:${field}`);
      unresolvedIntentNodeIds.push(intentNodeId);
      continue;
    }
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
    compiledPortBindings.push(...nodePortBindings);
    compiledOperatorIds.push(selectedOperatorId);
  }

  const edges = buildEdges(compiledNodes, compiledPortBindings);
  const zeroAdd = compiledNodes.every((node) => {
    const source = intentNodesById.get(text(node.intentNodeId));
    return text(source?.selectedOperatorId) === text(node.operatorId);
  });
  const compiledIntentNodeIds = compiledNodes.map((node) => text(node.intentNodeId));
  const noDuplicateCompilation = new Set(compiledIntentNodeIds).size === compiledIntentNodeIds.length;
  const noOverlap = compiledIntentNodeIds.every((intentNodeId) => !unresolvedIntentNodeIds.includes(intentNodeId));
  const selectedIntentNodeIds = intentNodes.map((node) => text(node.intentNodeId));
  const zeroDrop = noDuplicateCompilation && noOverlap
    && compiledIntentNodeIds.length === selectedIntentNodeIds.length
    && selectedIntentNodeIds.every((intentNodeId) => compiledIntentNodeIds.includes(intentNodeId));
  if (!zeroAdd) diagnostics.push('LOWERING_ZERO_ADD_VIOLATED');
  if (!zeroDrop) diagnostics.push('LOWERING_ZERO_DROP_VIOLATED');

  const compileDisposition = blockingDisposition
    ?? (stageContractDrift ? 'FAIL'
    : diagnostics.some((diagnostic) => diagnostic.startsWith('LOWERING_ZERO_'))
    ? 'FAIL'
    : unresolvedIntentNodeIds.length
    ? (boundIntent.stageDisposition === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'CAPABILITY_GAP')
    : 'COMPILED_RESEARCH_PROXY');

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
): {
  present: boolean;
  value?: unknown;
  readFactId?: string;
  outputBinding?: { fromNodeId: string; fromPort: string; projectionPath: readonly string[] };
} {
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
      return rule.staticValue === undefined
        ? { present: false }
        : adaptFieldValueV2R(rule.staticValue, rule, diagnostics, intentNodeId, field);
    case 'FACT_FIELD': {
      const fact = findBoundFact(context, rule.factKind);
      if (!fact) return { present: false };
      const value = rule.factField ? fact[rule.factField] : fact;
      if (value === undefined) return { present: false };
      const adapted = adaptFieldValueV2R(value, rule, diagnostics, intentNodeId, field);
      return adapted.present ? { ...adapted, readFactId: text(fact.factId) } : adapted;
    }
    case 'MODEL_INPUT': {
      const nodeInputs = record(context.boundNode.nodeInputs);
      const value = nodeInputs[field];
      if (value === undefined || value === null || value === '') return { present: false };
      return adaptFieldValueV2R(value, rule, diagnostics, intentNodeId, field);
    }
    case 'NODE_OUTPUT': {
      if (rule.producers?.length) {
        for (const producer of rule.producers) {
          const producerNodeId = resolveProducerByOperatorV2R(
            intentNodeId, producer.operatorId, producer.outputName,
            context.intentNodes, context.compiledNodes,
          );
          if (producerNodeId) return {
            present: true,
            outputBinding: {
              fromNodeId: producerNodeId,
              fromPort: producer.outputName,
              projectionPath: producer.projectionPath ?? [],
            },
          };
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
        if (producerNodeId) return {
          present: true,
          outputBinding: { fromNodeId: producerNodeId, fromPort: outputName, projectionPath: [] },
        };
      }
      return { present: false };
    }
    default:
      return { present: false };
  }
}

function adaptFieldValueV2R(
  value: unknown,
  rule: FieldBindingRuleV2R,
  diagnostics: string[],
  intentNodeId: string,
  field: string,
): { present: boolean; value?: unknown } {
  if (!rule.valueAdapter) return { present: true, value };
  if (rule.valueAdapter === 'FRAME_RANGE_V2R') {
    const object = record(value);
    const pair = Array.isArray(value) ? value : null;
    const start = exactSafeInteger(pair?.[0] ?? object.startFrame ?? object.start);
    const end = exactSafeInteger(pair?.[1] ?? object.endFrame ?? object.endExclusive);
    if (start === null || end === null || start < 0 || end <= start) {
      diagnostics.push(`FIELD_ADAPTER_INVALID:${intentNodeId}:${field}:FRAME_RANGE_V2R`);
      return { present: false };
    }
    return { present: true, value: { startFrame: start, endFrame: end } };
  }
  diagnostics.push(`FIELD_ADAPTER_INVALID:${intentNodeId}:${field}:UNKNOWN`);
  return { present: false };
}

function exactSafeInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
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
  return directlyBound;
}

function executionBlockingDisposition(boundIntent: JsonRecord): string | null {
  const disposition = text(boundIntent.stageDisposition);
  if (['CAPABILITY_GAP', 'UNVERIFIABLE', 'POLICY_BLOCKED', 'CONFLICT'].includes(disposition)) {
    return disposition;
  }
  const stopRequirements = records(boundIntent.unresolvedRequirements)
    .filter((requirement) => requirement.failureDisposition === 'STOP_BEFORE_COMPILATION_OR_RENDER');
  if (!stopRequirements.length) return null;
  const requirementDispositions = stopRequirements.map((requirement) => text(requirement.disposition));
  if (requirementDispositions.includes('POLICY_BLOCKED')) return 'POLICY_BLOCKED';
  if (requirementDispositions.includes('CONFLICT')) return 'CONFLICT';
  if (requirementDispositions.includes('CAPABILITY_GAP')) return 'CAPABILITY_GAP';
  return 'UNVERIFIABLE';
}

function indexBindings(bindings: JsonRecord[]): Map<string, string[]> {
  const factIdsByBindingId = new Map<string, string[]>();
  for (const binding of bindings) {
    factIdsByBindingId.set(text(binding.bindingId), strings(binding.factIds));
  }
  return factIdsByBindingId;
}

function buildEdges(
  compiledNodes: JsonRecord[],
  portBindings: readonly CompiledPortBindingEdgeV2R[],
): JsonRecord[] {
  const nodeIds = new Set(compiledNodes.map((node) => text(node.nodeId)));
  const edges: JsonRecord[] = portBindings.map((binding) => ({ ...binding }));
  const orderedPairs = new Set(portBindings.map(({ fromNodeId, toNodeId }) => `${fromNodeId}\0${toNodeId}`));
  let index = 0;
  for (const node of compiledNodes) {
    for (const required of strings(node.requires)) {
      if (!nodeIds.has(required)) continue;
      const pair = `${required}\0${text(node.nodeId)}`;
      if (orderedPairs.has(pair)) continue;
      edges.push({
        edgeId: `control-edge-${index}`,
        fromNodeId: required,
        fromPort: '$control',
        toNodeId: text(node.nodeId),
        toPort: '$control',
        edgeType: 'CONTROL',
      });
      orderedPairs.add(pair);
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
