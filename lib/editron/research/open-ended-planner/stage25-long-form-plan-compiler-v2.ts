import {
  createEditorialPlanRevisionV1,
  type EditorialPlanArtifactRefV1,
  type EditorialPlanNodeV1,
} from '../../services/editorial-plan-v1';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';
import {
  assertStage25LongFormPlanContextV2,
  assertStage25LongFormPlanProposalV2,
  STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V2,
  type Stage25LongFormPlanContextV2,
  type Stage25LongFormPlanProposalNodeV2,
} from './stage25-long-form-plan-holdout-v2';

export const STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PLAN_COMPILER_V2_1' as const;

type SelectorKind = 'SEMANTIC_SCOPE' | 'RANGE_CANDIDATE' | 'DIRECTION_REQUIREMENT';
interface EvidenceBindingV2 {
  selectorKind: SelectorKind;
  selectorId: string;
  evidenceRequirementId: string;
}
interface DerivedNodeV2 {
  node: Readonly<Stage25LongFormPlanProposalNodeV2>;
  effectiveSemanticScopeIds: readonly string[];
  requiredEvidenceRequirementIds: readonly string[];
  evidenceBindings: readonly EvidenceBindingV2[];
}

export function compileStage25LongFormPlanProposalV2(input: Readonly<{
  context: unknown;
  proposal: unknown;
}>): Readonly<{
  plan: ReturnType<typeof createEditorialPlanRevisionV1>;
  receipt: Readonly<Record<string, unknown>>;
}> {
  const context = assertStage25LongFormPlanContextV2(input.context);
  const proposal = assertStage25LongFormPlanProposalV2(input.proposal);
  const nodes = validateProposal(context, proposal.nodes);
  const ordered = [...nodes.values()].sort((left, right) => byNodeId(left.node, right.node));
  const plan = createEditorialPlanRevisionV1({
    version: 'EDITRON_EDITORIAL_PLAN_V1_1',
    tenantId: context.project.tenantId,
    userId: context.project.userId,
    orgId: context.project.orgId,
    projectId: context.project.projectId,
    planId: context.project.planId,
    planRevision: 1,
    previousRevisionSha256: null,
    directionRevisionRef: context.project.directionRevisionRef,
    baseProjectRevisionRef: context.project.baseProjectRevisionRef,
    nodes: ordered.map((derived) => compileNode(context, derived)),
    releasedLockRefs: [],
    acceptedBy: { actorId: 'stage25-editorial-model', actorKind: 'MODEL' },
    acceptedAt: context.acceptedAt,
    changeReason: `Research long-form V2 proposal ${proposal.proposalId}`,
  });
  const metrics = graphMetrics(new Map(ordered.map(({ node }) => [node.nodeId, node])));
  const derivedRangeScopeBindings = ordered.flatMap(({ node }) =>
    node.rangeCandidateIds.map((rangeCandidateId) => {
      const semanticScopeId = context.rangeCandidates.find(
        (range) => range.rangeCandidateId === rangeCandidateId,
      )!.semanticScopeId;
      return {
        nodeId: node.nodeId,
        rangeCandidateId,
        semanticScopeId,
        suppliedExplicitly: node.semanticScopeIds.includes(semanticScopeId),
      };
    }));
  const nodeDerivations = ordered.map((derived) => readinessReceipt(nodes, derived));
  const material = {
    version: STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V2,
    authority: 'RESEARCH_ONLY_COMPILED_TO_EXISTING_PLANSERVICE_NO_PROJECT_MUTATION' as const,
    fixtureVersion: STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V2,
    contextSha256: context.contextSha256,
    proposalSha256: proposal.proposalSha256,
    planRevisionSha256: plan.revisionSha256,
    nodeCount: nodes.size,
    sequenceNodeCount: ordered.filter(({ node }) => node.workKind === 'SEQUENCE').length,
    maxDepth: metrics.maxDepth,
    maxFanout: metrics.maxFanout,
    coveredDirectionRequirementIds: sortedUnique(ordered, 'directionRequirementIds'),
    coveredDeliverableIds: sortedUnique(ordered, 'deliverableIds'),
    derivedRangeScopeBindings,
    nodeDerivations,
    uncheckedClaims: ordered.flatMap(({ node }) => node.whatHasNotBeenChecked.map(
      (check) => ({ nodeId: node.nodeId, check }),
    )),
    unverifiedJudgments: [
      'EDITORIAL_TASTE', 'RANGE_SEMANTIC_ACCURACY', 'RENDERED_AUDIOVISUAL_QUALITY',
    ],
    assessment: 'PASS_STRUCTURAL_ONLY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeEditronJsonV1({
    plan,
    receipt: {
      ...material, receiptSha256: hashEditronCanonicalJsonV1(material),
    },
  });
}

function validateProposal(
  context: Readonly<Stage25LongFormPlanContextV2>,
  values: readonly Readonly<Stage25LongFormPlanProposalNodeV2>[],
): Map<string, DerivedNodeV2> {
  if (values.length > context.workflowPolicy.maxNodes) fail('NODE_LIMIT_EXCEEDED');
  const rawNodes = new Map<string, Readonly<Stage25LongFormPlanProposalNodeV2>>();
  for (const node of values) {
    if (rawNodes.has(node.nodeId)) fail('NODE_ID_DUPLICATED');
    rawNodes.set(node.nodeId, node);
    unique(node.dependsOnNodeIds, 'DEPENDENCY_DUPLICATED');
    for (const field of [
      'semanticScopeIds', 'rangeCandidateIds', 'deliverableIds',
      'directionRequirementIds', 'evidenceRequirementIds', 'approvalRequirementIds',
    ] as const) unique(node[field], `${field.toUpperCase()}_DUPLICATED`);
  }
  const roots = values.filter(({ parentNodeId }) => parentNodeId === null);
  if (roots.length !== 1 || roots[0].workKind !== 'DIRECTION') fail('ROOT_DIRECTION_INVALID');
  const known = <T extends { id: string }>(items: readonly T[]) =>
    new Map(items.map((item) => [item.id, item]));
  const scopes = known(context.semanticScopes);
  const ranges = new Map(context.rangeCandidates.map((item) => [item.rangeCandidateId, item]));
  const deliverables = known(context.deliverables);
  const directions = known(context.directionRequirements);
  const evidence = known(context.evidenceRequirements);
  const approvals = known(context.approvalRequirements);
  const budgets = known(context.budgetClasses);
  const derivedNodes = new Map<string, DerivedNodeV2>();
  for (const node of values) {
    if (node.parentNodeId && !rawNodes.has(node.parentNodeId)) fail(`PARENT_MISSING:${node.nodeId}`);
    if (node.dependsOnNodeIds.some((id) => id === node.nodeId || !rawNodes.has(id))) {
      fail(`DEPENDENCY_INVALID:${node.nodeId}`);
    }
    requireKnown(node.semanticScopeIds, scopes, 'SEMANTIC_SCOPE_UNKNOWN');
    requireKnown(node.rangeCandidateIds, ranges, 'RANGE_CANDIDATE_UNKNOWN');
    requireKnown(node.deliverableIds, deliverables, 'DELIVERABLE_UNKNOWN');
    requireKnown(node.directionRequirementIds, directions, 'DIRECTION_REQUIREMENT_UNKNOWN');
    requireKnown(node.evidenceRequirementIds, evidence, 'EVIDENCE_REQUIREMENT_UNKNOWN');
    requireKnown(node.approvalRequirementIds, approvals, 'APPROVAL_REQUIREMENT_UNKNOWN');
    if (!budgets.has(node.budgetClassId)) fail(`BUDGET_CLASS_UNKNOWN:${node.budgetClassId}`);
    const selectedRanges = node.rangeCandidateIds.map((id) => ranges.get(id)!);
    const effectiveSemanticScopeIds = sorted(new Set([
      ...node.semanticScopeIds, ...selectedRanges.map(({ semanticScopeId }) => semanticScopeId),
    ]));
    if (!effectiveSemanticScopeIds.length) fail(`NODE_SCOPE_EMPTY:${node.nodeId}`);
    const evidenceBindings = deriveEvidenceBindings(
      effectiveSemanticScopeIds.map((id) => scopes.get(id)!),
      selectedRanges,
      node.directionRequirementIds.map((id) => directions.get(id)!),
    );
    const requiredEvidenceRequirementIds = sorted(new Set(
      evidenceBindings.map(({ evidenceRequirementId }) => evidenceRequirementId),
    ));
    for (const id of node.evidenceRequirementIds) {
      if (!requiredEvidenceRequirementIds.includes(id)) {
        fail(`EVIDENCE_NOT_RELEVANT_TO_NODE:${node.nodeId}:${id}`);
      }
    }
    const unresolved = requiredEvidenceRequirementIds.filter(
      (id) => evidence.get(id)!.status !== 'AVAILABLE',
    );
    if (node.status === 'READY' && unresolved.length) {
      fail(`LOCAL_READY_EVIDENCE_UNRESOLVED:${node.nodeId}:${unresolved.join(',')}`);
    }
    derivedNodes.set(node.nodeId, {
      node, effectiveSemanticScopeIds, requiredEvidenceRequirementIds, evidenceBindings,
    });
  }
  assertGraphAndCoverage(context, rawNodes, derivedNodes);
  return derivedNodes;
}

function assertGraphAndCoverage(
  context: Readonly<Stage25LongFormPlanContextV2>,
  nodes: Map<string, Readonly<Stage25LongFormPlanProposalNodeV2>>,
  derivedNodes: Map<string, DerivedNodeV2>,
): void {
  assertAcyclic(nodes);
  const metrics = graphMetrics(nodes);
  if (metrics.maxDepth > context.workflowPolicy.maxDepth) fail('PLAN_DEPTH_EXCEEDED');
  if (metrics.maxFanout > context.workflowPolicy.maxFanout) fail('PLAN_FANOUT_EXCEEDED');
  const values = [...nodes.values()];
  const kinds = new Set(values.map(({ workKind }) => workKind));
  for (const kind of context.workflowPolicy.requiredWorkKinds) {
    if (!kinds.has(kind)) fail(`WORK_KIND_MISSING:${kind}`);
  }
  const sequences = values.filter(({ workKind }) => workKind === 'SEQUENCE');
  if (sequences.length < context.workflowPolicy.minSequenceNodes) {
    fail('SEQUENCE_DECOMPOSITION_TOO_SHALLOW');
  }
  const orders = sequences.map(({ narrativeOrder }) => narrativeOrder)
    .sort((left, right) => Number(left) - Number(right));
  if (orders.some((value, index) => value !== index)
    || values.some(({ workKind, narrativeOrder }) =>
      (workKind === 'SEQUENCE') !== (narrativeOrder !== null))) {
    fail('NARRATIVE_ORDER_INVALID');
  }
  requireCoverage(values, context.directionRequirements.map(({ id }) => id),
    'directionRequirementIds', 'DIRECTION_REQUIREMENT_UNCOVERED');
  requireCoverage(values, context.deliverables.map(({ id }) => id),
    'deliverableIds', 'DELIVERABLE_UNCOVERED');
  requireCoverage(values, context.approvalRequirements.map(({ id }) => id),
    'approvalRequirementIds', 'APPROVAL_REQUIREMENT_UNCOVERED');
  const derivedEvidence = new Set([...derivedNodes.values()].flatMap(
    ({ requiredEvidenceRequirementIds }) => requiredEvidenceRequirementIds,
  ));
  for (const { id } of context.evidenceRequirements) {
    if (!derivedEvidence.has(id)) fail(`EVIDENCE_REQUIREMENT_UNCOVERED:${id}`);
  }
  assertWorkflowOrder(nodes);
}

function deriveEvidenceBindings(
  scopes: readonly Stage25LongFormPlanContextV2['semanticScopes'][number][],
  ranges: readonly Stage25LongFormPlanContextV2['rangeCandidates'][number][],
  directions: readonly Stage25LongFormPlanContextV2['directionRequirements'][number][],
): EvidenceBindingV2[] {
  const values: EvidenceBindingV2[] = [];
  const add = (selectorKind: SelectorKind, selectorId: string, ids: readonly string[]) => {
    for (const evidenceRequirementId of ids) {
      values.push({ selectorKind, selectorId, evidenceRequirementId });
    }
  };
  for (const scope of scopes) add('SEMANTIC_SCOPE', scope.id, scope.requiredEvidenceRequirementIds);
  for (const range of ranges) add('RANGE_CANDIDATE', range.rangeCandidateId, range.requiredEvidenceRequirementIds);
  for (const direction of directions) add('DIRECTION_REQUIREMENT', direction.id, direction.requiredEvidenceRequirementIds);
  return values.sort(compareEvidenceBindings);
}

function compareEvidenceBindings(left: EvidenceBindingV2, right: EvidenceBindingV2): number {
  return compareCodePointText(left.selectorKind, right.selectorKind)
    || compareCodePointText(left.selectorId, right.selectorId)
    || compareCodePointText(left.evidenceRequirementId, right.evidenceRequirementId);
}

function compareCodePointText(left: string, right: string): number {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftPoint = left.codePointAt(leftIndex)!;
    const rightPoint = right.codePointAt(rightIndex)!;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
    leftIndex += leftPoint > 0xFFFF ? 2 : 1;
    rightIndex += rightPoint > 0xFFFF ? 2 : 1;
  }
  return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0;
}

function compileNode(
  context: Readonly<Stage25LongFormPlanContextV2>, derived: DerivedNodeV2,
): EditorialPlanNodeV1 {
  const { node, effectiveSemanticScopeIds, requiredEvidenceRequirementIds } = derived;
  const scopeById = new Map(context.semanticScopes.map((item) => [item.id, item]));
  const rangeById = new Map(context.rangeCandidates.map((item) => [item.rangeCandidateId, item]));
  const artifactMap = <T extends { id: string; artifactRef: EditorialPlanArtifactRefV1 }>(
    items: readonly T[],
  ) => new Map(items.map(({ id, artifactRef }) => [id, artifactRef]));
  const deliverables = artifactMap(context.deliverables);
  const evidence = artifactMap(context.evidenceRequirements);
  const directions = artifactMap(context.directionRequirements);
  const approvals = artifactMap(context.approvalRequirements);
  const budgets = artifactMap(context.budgetClasses);
  const ranges = node.rangeCandidateIds.map((id) => rangeById.get(id)!);
  return {
    nodeId: node.nodeId, nodeVersion: 1, parentNodeId: node.parentNodeId,
    supersedesNodeId: null,
    objective: {
      authority: 'MODEL', targetClaims: node.targetClaims,
      preservationClaims: node.preservationClaims,
      successConditions: node.successConditions, stopConditions: node.stopConditions,
    },
    scope: {
      semanticScopes: [...effectiveSemanticScopeIds],
      scopeAuthorityRefs: dedupeRefs([
        ...effectiveSemanticScopeIds.map((id) => scopeById.get(id)!.authorityRef),
        ...ranges.map(({ authorityRef }) => authorityRef),
      ]),
      ranges: ranges.map(({
        rangeCandidateId: _id, semanticScopeId: _scope,
        requiredEvidenceRequirementIds: _evidence, ...range
      }) => range),
      deliverableRefs: node.deliverableIds.map((id) => deliverables.get(id)!),
    },
    dependsOnNodeIds: node.dependsOnNodeIds,
    reads: [
      ...effectiveSemanticScopeIds.map((id) => `scope:${id}`),
      ...requiredEvidenceRequirementIds.map((id) => `evidence:${id}`),
    ],
    writes: [],
    requires: [
      ...node.dependsOnNodeIds.map((id) => `plan-node-result:${id}`),
      ...requiredEvidenceRequirementIds.map((id) => `evidence:${id}`),
    ],
    produces: [`plan-node-result:${node.nodeId}`], invalidates: [],
    status: canonicalStatus(node),
    executionDefinitionRef: null, eligibleOperationSetRef: null,
    evidenceRequirementRefs: requiredEvidenceRequirementIds.map((id) => evidence.get(id)!),
    preservationLockRefs: node.directionRequirementIds.map((id) => directions.get(id)!),
    approvalRequirementRefs: node.approvalRequirementIds.map((id) => approvals.get(id)!),
    budgetReservationRefs: [budgets.get(node.budgetClassId)!],
    whatHasNotBeenChecked: node.whatHasNotBeenChecked,
    previewRefs: [], proofRefs: [], receiptRefs: [], finalDisposition: null,
  };
}

function readinessReceipt(nodes: Map<string, DerivedNodeV2>, derived: DerivedNodeV2) {
  const { node } = derived;
  const dependencyBlockers = node.status === 'READY'
    ? node.dependsOnNodeIds.map((dependencyNodeId) => ({
      dependencyNodeId,
      observedCanonicalStatus: canonicalStatus(nodes.get(dependencyNodeId)!.node),
      observedFinalDisposition: null,
      requiredCanonicalStatus: 'VERIFIED' as const,
      requiredFinalDisposition: 'PASS' as const,
    })) : [];
  return {
    nodeId: node.nodeId,
    explicitSemanticScopeIds: node.semanticScopeIds,
    effectiveSemanticScopeIds: derived.effectiveSemanticScopeIds,
    declaredEvidenceRequirementIds: node.evidenceRequirementIds,
    requiredEvidenceRequirementIds: derived.requiredEvidenceRequirementIds,
    evidenceBindings: derived.evidenceBindings,
    modelReadiness: node.status === 'READY' ? 'LOCAL_READY' : node.status,
    canonicalStatus: canonicalStatus(node),
    dependencyBlockers,
  };
}

function canonicalStatus(node: Stage25LongFormPlanProposalNodeV2): EditorialPlanNodeV1['status'] {
  if (node.status !== 'READY') return node.status;
  return node.dependsOnNodeIds.length ? 'PROPOSED' : 'READY';
}

function assertWorkflowOrder(
  nodes: Map<string, Readonly<Stage25LongFormPlanProposalNodeV2>>,
): void {
  const all = [...nodes.values()];
  const ofKind = (kind: Stage25LongFormPlanProposalNodeV2['workKind']) =>
    all.filter((node) => node.workKind === kind);
  const ancestors = (nodeId: string): Set<string> => {
    const seen = new Set<string>();
    const pending = [...(nodes.get(nodeId)?.dependsOnNodeIds ?? [])];
    while (pending.length) {
      const next = pending.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      pending.push(...(nodes.get(next)?.dependsOnNodeIds ?? []));
    }
    return seen;
  };
  const hasAncestorKind = (
    node: Stage25LongFormPlanProposalNodeV2,
    kind: Stage25LongFormPlanProposalNodeV2['workKind'],
  ) => [...ancestors(node.nodeId)].some((id) => nodes.get(id)?.workKind === kind);
  for (const story of ofKind('STORY_ASSEMBLY')) {
    for (const kind of ['SOURCE_ORGANIZATION', 'MUSIC_STRUCTURE'] as const) {
      if (!hasAncestorKind(story, kind)) fail(`WORKFLOW_ORDER_INVALID:${story.nodeId}:${kind}`);
    }
  }
  const sequenceIds = new Set(ofKind('SEQUENCE').map(({ nodeId }) => nodeId));
  for (const stable of ofKind('PICTURE_STABILITY')) {
    const upstream = ancestors(stable.nodeId);
    if ([...sequenceIds].some((id) => !upstream.has(id))) {
      fail(`WORKFLOW_ORDER_INVALID:${stable.nodeId}:ALL_SEQUENCES`);
    }
  }
  for (const node of all.filter(({ workKind }) =>
    ['FINAL_AUDIO', 'CAPTIONS', 'QUALITY_CONTROL', 'DELIVERY'].includes(workKind))) {
    if (!hasAncestorKind(node, 'PICTURE_STABILITY')) {
      fail(`WORKFLOW_ORDER_INVALID:${node.nodeId}:PICTURE_STABILITY`);
    }
  }
  for (const delivery of ofKind('DELIVERY')) {
    for (const kind of ['FINAL_AUDIO', 'CAPTIONS', 'QUALITY_CONTROL'] as const) {
      if (!hasAncestorKind(delivery, kind)) {
        fail(`WORKFLOW_ORDER_INVALID:${delivery.nodeId}:${kind}`);
      }
    }
  }
}

function assertAcyclic(nodes: Map<string, Readonly<Stage25LongFormPlanProposalNodeV2>>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail('PLAN_GRAPH_CYCLE');
    if (visited.has(id)) return;
    visiting.add(id);
    const node = nodes.get(id)!;
    for (const dependency of [node.parentNodeId, ...node.dependsOnNodeIds]) {
      if (dependency) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of nodes.keys()) visit(id);
}

function graphMetrics(nodes: Map<string, Readonly<Stage25LongFormPlanProposalNodeV2>>) {
  const children = new Map<string, number>();
  let maxDepth = 0;
  for (const node of nodes.values()) {
    if (node.parentNodeId) {
      children.set(node.parentNodeId, (children.get(node.parentNodeId) ?? 0) + 1);
    }
  }
  for (const node of nodes.values()) {
    let depth = 1;
    let parent = node.parentNodeId;
    while (parent) {
      depth += 1;
      parent = nodes.get(parent)?.parentNodeId ?? null;
    }
    maxDepth = Math.max(maxDepth, depth);
  }
  return { maxDepth, maxFanout: Math.max(0, ...children.values()) };
}

function requireCoverage(
  nodes: readonly Stage25LongFormPlanProposalNodeV2[], required: readonly string[],
  field: 'directionRequirementIds' | 'deliverableIds' | 'approvalRequirementIds',
  code: string,
): void {
  const covered = new Set(nodes.flatMap((node) => node[field]));
  for (const id of required) if (!covered.has(id)) fail(`${code}:${id}`);
}
function requireKnown<T>(ids: readonly string[], values: Map<string, T>, code: string): void {
  for (const id of ids) if (!values.has(id)) fail(`${code}:${id}`);
}
function sortedUnique(
  nodes: readonly DerivedNodeV2[], field: 'directionRequirementIds' | 'deliverableIds',
) {
  return sorted(new Set(nodes.flatMap(({ node }) => node[field])));
}
function sorted(values: Set<string>): string[] { return [...values].sort(); }
function unique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) fail(code);
}
function dedupeRefs(values: readonly EditorialPlanArtifactRefV1[]) {
  const seen = new Set<string>();
  return values.filter((ref) => {
    const key = `${ref.ownerId}:${ref.artifactId}:${ref.artifactVersion}:${ref.artifactSha256}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function byNodeId(
  left: Stage25LongFormPlanProposalNodeV2,
  right: Stage25LongFormPlanProposalNodeV2,
) { return left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0; }
function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_PLAN_${code}`);
}
