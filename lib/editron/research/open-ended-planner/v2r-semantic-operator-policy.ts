import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export const V2R_SEMANTIC_OPERATOR_POLICY_VERSION =
  'EDITRON_OE_V2R_SEMANTIC_OPERATOR_POLICY_V4' as const;

type StageDispositionV2R = 'READY_FOR_COMPILATION' | 'CAPABILITY_GAP' | 'UNVERIFIABLE';

interface EffectGroupV2R {
  groupId: string;
  operatorIds: readonly string[];
  minimum: number;
  maximum: number;
}

interface DependencyV2R {
  beforeGroupId: string;
  afterGroupId: string;
}

export interface SemanticOperatorCasePolicyV2R {
  caseId: string;
  expectedExecutionForm: 'NATIVE' | 'HYBRID' | 'CAPABILITY_GAP';
  expectedStageDisposition: StageDispositionV2R;
  allowedOperatorIds: readonly string[];
  requiredEffectGroups: readonly EffectGroupV2R[];
  requiredDependencies: readonly DependencyV2R[];
  requiredGapKind: 'CAPABILITY' | 'EVIDENCE' | null;
}

export interface SemanticOperatorPolicyV2R {
  version: typeof V2R_SEMANTIC_OPERATOR_POLICY_VERSION;
  authority: 'RESEARCH_ONLY_EVALUATOR_NOT_EXPOSED_TO_MODELS';
  cases: readonly Readonly<SemanticOperatorCasePolicyV2R>[];
  policySha256: string;
}

export interface SemanticOperatorEvaluationV2R {
  receiptVersion: 'EDITRON_OE_V2R_SEMANTIC_OPERATOR_EVALUATION_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  policySha256: string;
  caseId: string;
  disposition: 'PASS' | 'FAIL';
  selectedOperatorIds: readonly string[];
  diagnostics: readonly string[];
  receiptSha256: string;
}

const DEV01_OPERATORS = [
  'read_project_file', 'get_timeline_view', 'get_video_transcription',
  'find_transcript_moment', 'resolve_transcript_edit', 'cut_section',
  'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes',
  'find_audio_moment', 'apply_audio_ducking',
] as const;

const DEV01_GROUPS: readonly EffectGroupV2R[] = [
  effect('TRANSCRIPT_RESOLVE', ['resolve_transcript_edit']),
  effect('SILENCE_REMOVE', ['cut_section']),
  effect('VISUAL_FIND', ['find_visual_moment']),
  effect('KEYFRAME_RESOLVE', ['resolve_keyframe_edit']),
  effect('PUSH_IN', ['set_keyframes']),
  effect('DIALOGUE_DUCK', ['apply_audio_ducking']),
];

const POLICIES: readonly SemanticOperatorCasePolicyV2R[] = [
  casePolicy('DEV-01:BASELINE', 'NATIVE', 'READY_FOR_COMPILATION', DEV01_OPERATORS, DEV01_GROUPS, [
    dependency('TRANSCRIPT_RESOLVE', 'SILENCE_REMOVE'),
    dependency('SILENCE_REMOVE', 'KEYFRAME_RESOLVE'),
    dependency('VISUAL_FIND', 'KEYFRAME_RESOLVE'),
    dependency('KEYFRAME_RESOLVE', 'PUSH_IN'),
    dependency('SILENCE_REMOVE', 'DIALOGUE_DUCK'),
  ]),
  casePolicy(
    'DEV-01:VISUAL_EVIDENCE_WITHHELD', 'NATIVE', 'UNVERIFIABLE', DEV01_OPERATORS, [], [], 'EVIDENCE',
  ),
  casePolicy(
    'DEV-02:BASELINE', 'HYBRID', 'CAPABILITY_GAP',
    ['read_project_file', 'get_timeline_view', 'list_user_assets', 'search_user_assets',
      'inspect_user_asset', 'resolve_user_asset_overlay', 'generated_composition_program',
      'move_retime_overlay'],
    [effect('GENERATED_ISLAND', ['generated_composition_program'])], [], 'CAPABILITY',
  ),
  casePolicy(
    'DEV-03:BASELINE', 'NATIVE', 'READY_FOR_COMPILATION',
    ['read_project_file', 'get_timeline_view', 'find_audio_moment',
      'sync_cuts_to_beats', 'apply_camera_shake'],
    [
      effect('BEAT_FIND', ['find_audio_moment']),
      effect('BEAT_ALIGN', ['sync_cuts_to_beats']),
      effect('FINAL_SHAKE', ['apply_camera_shake']),
    ],
    [dependency('BEAT_FIND', 'BEAT_ALIGN'), dependency('BEAT_ALIGN', 'FINAL_SHAKE')],
  ),
  casePolicy(
    'DEV-03:BEAT_EVIDENCE_WITHHELD', 'NATIVE', 'UNVERIFIABLE',
    ['read_project_file', 'get_timeline_view', 'find_audio_moment',
      'sync_cuts_to_beats', 'apply_camera_shake'],
    [], [], 'EVIDENCE',
  ),
  casePolicy(
    'DEV-04:BASELINE', 'CAPABILITY_GAP', 'CAPABILITY_GAP',
    ['read_project_file', 'get_timeline_view', 'find_visual_moment', 'resolve_visual_edit',
      'reorder_layer', 'generated_composition_program'],
    [], [], 'CAPABILITY',
  ),
];

export function buildV2RSemanticOperatorPolicyV2R(): Readonly<SemanticOperatorPolicyV2R> {
  assertUniquePolicyCases(POLICIES);
  const material = {
    version: V2R_SEMANTIC_OPERATOR_POLICY_VERSION,
    authority: 'RESEARCH_ONLY_EVALUATOR_NOT_EXPOSED_TO_MODELS' as const,
    cases: POLICIES,
  };
  return deepFreezeV1({ ...material, policySha256: hashCanonicalJsonV1(material) });
}

export function evaluateV2RSemanticOperatorsV2R(input: {
  taskId: string;
  conditionId: string;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
}): Readonly<SemanticOperatorEvaluationV2R> {
  const policy = buildV2RSemanticOperatorPolicyV2R();
  const caseId = `${input.taskId}:${input.conditionId}`;
  const casePolicy = policy.cases.find((candidate) => candidate.caseId === caseId);
  if (!casePolicy) throw new Error(`V2R_SEMANTIC_POLICY_CASE_MISSING:${caseId}`);

  const editorial = record(input.editorialIntent);
  const evidenceBound = record(input.evidenceBoundIntent);
  const nodes = records(editorial.nodes);
  const diagnostics: string[] = [];
  const selectedOperatorIds = nodes.map((node) => text(node.selectedOperatorId)).filter(Boolean);
  const stageDisposition = text(evidenceBound.stageDisposition);

  if (editorial.executionForm !== casePolicy.expectedExecutionForm) {
    diagnostics.push(`EXECUTION_FORM:${text(editorial.executionForm) || 'MISSING'}:${casePolicy.expectedExecutionForm}`);
  }
  if (stageDisposition !== casePolicy.expectedStageDisposition) {
    diagnostics.push(`STAGE_DISPOSITION:${stageDisposition || 'MISSING'}:${casePolicy.expectedStageDisposition}`);
  }
  validateNodeIdentity(nodes, diagnostics);
  validateDependencyGraph(nodes, diagnostics);
  validateAllowedOperators(nodes, casePolicy, diagnostics);
  validateRequiredEffects(nodes, casePolicy, diagnostics);
  validateDependencies(nodes, casePolicy, diagnostics);
  validateExpectedGap(evidenceBound, casePolicy, diagnostics);
  validateStageReadiness(evidenceBound, diagnostics);

  const receiptMaterial = {
    receiptVersion: 'EDITRON_OE_V2R_SEMANTIC_OPERATOR_EVALUATION_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    policySha256: policy.policySha256,
    caseId,
    disposition: diagnostics.length ? 'FAIL' as const : 'PASS' as const,
    selectedOperatorIds: [...selectedOperatorIds],
    diagnostics: diagnostics.sort(compareUtf16),
  };
  return deepFreezeV1({
    ...receiptMaterial,
    receiptSha256: hashCanonicalJsonV1(receiptMaterial),
  });
}

function validateNodeIdentity(nodes: JsonRecord[], diagnostics: string[]): void {
  const ids = nodes.map((node) => text(node.intentNodeId));
  if (!ids.length) diagnostics.push('INTENT_NODES_EMPTY');
  if (ids.some((id) => !id)) diagnostics.push('INTENT_NODE_ID_MISSING');
  if (new Set(ids).size !== ids.length) diagnostics.push('INTENT_NODE_ID_DUPLICATE');
}

function validateDependencyGraph(nodes: JsonRecord[], diagnostics: string[]): void {
  const ids = nodes.map((node) => text(node.intentNodeId)).filter(Boolean);
  const known = new Set(ids);
  const inDegree = new Map(ids.map((id) => [id, 0]));
  const dependents = new Map(ids.map((id) => [id, [] as string[]]));
  for (const node of nodes) {
    const nodeId = text(node.intentNodeId);
    for (const requiredId of strings(node.requiresNodeIds)) {
      if (!known.has(requiredId)) {
        diagnostics.push(`DEPENDENCY_UNKNOWN:${nodeId || 'MISSING'}:${requiredId}`);
        continue;
      }
      if (!known.has(nodeId)) continue;
      inDegree.set(nodeId, (inDegree.get(nodeId) ?? 0) + 1);
      dependents.get(requiredId)?.push(nodeId);
    }
  }
  const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift() as string;
    visited += 1;
    for (const dependent of dependents.get(id) ?? []) {
      const next = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  if (ids.length && visited !== ids.length) diagnostics.push('DEPENDENCY_GRAPH_CYCLE');
}

function validateAllowedOperators(
  nodes: JsonRecord[],
  policy: Readonly<SemanticOperatorCasePolicyV2R>,
  diagnostics: string[],
): void {
  const allowed = new Set(policy.allowedOperatorIds);
  for (const node of nodes) {
    const nodeId = text(node.intentNodeId) || 'MISSING';
    const selected = text(node.selectedOperatorId);
    if (selected) {
      if (!allowed.has(selected)) diagnostics.push(`OPERATOR_NOT_ALLOWED:${selected}`);
      if (policy.expectedStageDisposition === 'CAPABILITY_GAP') {
        diagnostics.push(`CAPABILITY_GAP_SELECTED_OPERATOR:${nodeId}:${selected}`);
      }
      continue;
    }
    if (policy.expectedStageDisposition !== 'CAPABILITY_GAP') {
      diagnostics.push(`OPERATOR_NOT_ALLOWED:MISSING:${nodeId}`);
      continue;
    }
    if (node.failureDisposition !== 'CAPABILITY_GAP') {
      diagnostics.push(`CAPABILITY_GAP_NODE_DISPOSITION:${nodeId}`);
    }
    if ('nodeInputs' in node) diagnostics.push(`CAPABILITY_GAP_NODE_HAS_INPUTS:${nodeId}`);
    for (const alternative of strings(node.alternativeOperatorIds)) {
      if (!allowed.has(alternative)) diagnostics.push(`OPERATOR_NOT_ALLOWED:${alternative}`);
    }
  }
}

function validateRequiredEffects(
  nodes: JsonRecord[],
  policy: Readonly<SemanticOperatorCasePolicyV2R>,
  diagnostics: string[],
): void {
  for (const group of policy.requiredEffectGroups) {
    const count = nodes.filter((node) => operatorIdsForEvaluation(node, policy)
      .some((operatorId) => group.operatorIds.includes(operatorId))).length;
    if (count < group.minimum || count > group.maximum) {
      diagnostics.push(`EFFECT_GROUP_CARDINALITY:${group.groupId}:${count}:${group.minimum}:${group.maximum}`);
    }
  }
}

function validateDependencies(
  nodes: JsonRecord[],
  policy: Readonly<SemanticOperatorCasePolicyV2R>,
  diagnostics: string[],
): void {
  const groups = new Map(policy.requiredEffectGroups.map((group) => [group.groupId, group]));
  const byId = new Map(nodes.map((node) => [text(node.intentNodeId), node]));
  for (const edge of policy.requiredDependencies) {
    const before = groups.get(edge.beforeGroupId);
    const after = groups.get(edge.afterGroupId);
    if (!before || !after) {
      diagnostics.push(`DEPENDENCY_POLICY_GROUP_MISSING:${edge.beforeGroupId}:${edge.afterGroupId}`);
      continue;
    }
    const beforeIds = new Set(nodes
      .filter((node) => operatorIdsForEvaluation(node, policy)
        .some((operatorId) => before.operatorIds.includes(operatorId)))
      .map((node) => text(node.intentNodeId)));
    const afterNodes = nodes.filter((node) => operatorIdsForEvaluation(node, policy)
      .some((operatorId) => after.operatorIds.includes(operatorId)));
    if (!afterNodes.some((node) => dependsOnAny(text(node.intentNodeId), beforeIds, byId))) {
      diagnostics.push(`DEPENDENCY_MISSING:${edge.beforeGroupId}:${edge.afterGroupId}`);
    }
  }
}

function dependsOnAny(
  nodeId: string,
  targetIds: ReadonlySet<string>,
  byId: ReadonlyMap<string, JsonRecord>,
  visited = new Set<string>(),
): boolean {
  if (visited.has(nodeId)) return false;
  visited.add(nodeId);
  for (const requiredId of strings(byId.get(nodeId)?.requiresNodeIds)) {
    if (targetIds.has(requiredId)) return true;
    if (dependsOnAny(requiredId, targetIds, byId, visited)) return true;
  }
  return false;
}

function validateExpectedGap(
  evidenceBound: JsonRecord,
  policy: Readonly<SemanticOperatorCasePolicyV2R>,
  diagnostics: string[],
): void {
  if (!policy.requiredGapKind) return;
  const expectedDisposition = policy.expectedStageDisposition === 'CAPABILITY_GAP'
    ? 'CAPABILITY_GAP'
    : 'UNVERIFIABLE';
  const found = records(evidenceBound.unresolvedRequirements).some((requirement) => (
    requirement.kind === policy.requiredGapKind
    && requirement.disposition === expectedDisposition
  ));
  if (!found) diagnostics.push(`EXPECTED_GAP_MISSING:${policy.requiredGapKind}:${expectedDisposition}`);
}

function validateStageReadiness(evidenceBound: JsonRecord, diagnostics: string[]): void {
  const disposition = text(evidenceBound.stageDisposition);
  const unresolved = records(evidenceBound.unresolvedRequirements);
  const blockingIds = unresolved
    .filter((requirement) => requirement.failureDisposition === 'STOP_BEFORE_COMPILATION_OR_RENDER')
    .map((requirement, index) => text(requirement.requirementId) || `requirement[${index}]`);
  if (disposition === 'READY_FOR_COMPILATION' && blockingIds.length) {
    diagnostics.push(`READY_WITH_BLOCKING_REQUIREMENTS:${blockingIds.join(',')}`);
  }
  for (const requirement of unresolved) {
    const kind = text(requirement.kind);
    const requirementDisposition = text(requirement.disposition);
    if (requirementDisposition === 'CAPABILITY_GAP' && kind !== 'CAPABILITY') {
      diagnostics.push(`REQUIREMENT_DISPOSITION_KIND_MISMATCH:${kind || 'MISSING'}:CAPABILITY_GAP`);
    }
    if (requirementDisposition === 'UNVERIFIABLE'
      && kind !== 'EVIDENCE' && kind !== 'AMBIGUITY') {
      diagnostics.push(`REQUIREMENT_DISPOSITION_KIND_MISMATCH:${kind || 'MISSING'}:UNVERIFIABLE`);
    }
  }
}

function casePolicy(
  caseId: string,
  expectedExecutionForm: SemanticOperatorCasePolicyV2R['expectedExecutionForm'],
  expectedStageDisposition: StageDispositionV2R,
  allowedOperatorIds: readonly string[],
  requiredEffectGroups: readonly EffectGroupV2R[],
  requiredDependencies: readonly DependencyV2R[],
  requiredGapKind: SemanticOperatorCasePolicyV2R['requiredGapKind'] = null,
): SemanticOperatorCasePolicyV2R {
  return {
    caseId, expectedExecutionForm,
    expectedStageDisposition,
    allowedOperatorIds,
    requiredEffectGroups,
    requiredDependencies,
    requiredGapKind,
  };
}

function operatorIdsForEvaluation(
  node: JsonRecord,
  policy: Readonly<SemanticOperatorCasePolicyV2R>,
): string[] {
  const selected = text(node.selectedOperatorId);
  if (selected) return [selected];
  return policy.expectedStageDisposition === 'CAPABILITY_GAP'
    ? strings(node.alternativeOperatorIds)
    : [];
}

function effect(groupId: string, operatorIds: readonly string[]): EffectGroupV2R {
  return { groupId, operatorIds, minimum: 1, maximum: 1 };
}

function dependency(beforeGroupId: string, afterGroupId: string): DependencyV2R {
  return { beforeGroupId, afterGroupId };
}

function assertUniquePolicyCases(cases: readonly SemanticOperatorCasePolicyV2R[]): void {
  const ids = cases.map(({ caseId }) => caseId);
  if (ids.length !== 6 || new Set(ids).size !== ids.length) {
    throw new Error('V2R_SEMANTIC_POLICY_CASE_SET_INVALID');
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
