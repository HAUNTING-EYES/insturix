import {
  createEditorialPlanRevisionV1,
  type EditorialPlanArtifactRefV1,
  type EditorialPlanNodeV1,
} from '../../services/editorial-plan-v1';
import { hashEditronCanonicalJsonV1 } from '../../services/canonical-json-v1';
import {
  assertStage25LongFormPlanContextV1,
  assertStage25LongFormPlanProposalV1,
  STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V1,
  type Stage25LongFormPlanContextV1,
  type Stage25LongFormPlanProposalNodeV1,
} from './stage25-long-form-plan-holdout-v1';

export const STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V1 =
  'EDITRON_STAGE25_LONG_FORM_PLAN_COMPILER_V1_1' as const;

export function compileStage25LongFormPlanProposalV1(input: Readonly<{
  context: unknown;
  proposal: unknown;
}>): Readonly<{
  plan: ReturnType<typeof createEditorialPlanRevisionV1>;
  receipt: Readonly<Record<string, unknown>>;
}> {
  const context = assertStage25LongFormPlanContextV1(input.context);
  const proposal = assertStage25LongFormPlanProposalV1(input.proposal);
  const nodes = validateProposal(context, proposal.nodes);
  const planNodes = [...nodes.values()].sort(byNodeId).map((node) => compileNode(context, node));
  const plan = createEditorialPlanRevisionV1({
    version: 'EDITRON_EDITORIAL_PLAN_V1_1',
    tenantId: context.project.tenantId, userId: context.project.userId,
    orgId: context.project.orgId, projectId: context.project.projectId,
    planId: context.project.planId, planRevision: 1, previousRevisionSha256: null,
    directionRevisionRef: context.project.directionRevisionRef,
    baseProjectRevisionRef: context.project.baseProjectRevisionRef,
    nodes: planNodes, releasedLockRefs: [],
    acceptedBy: { actorId: 'stage25-editorial-model', actorKind: 'MODEL' },
    acceptedAt: context.acceptedAt,
    changeReason: `Research long-form proposal ${proposal.proposalId}`,
  });
  const metrics = graphMetrics(nodes);
  const material = {
    version: STAGE25_LONG_FORM_PLAN_COMPILER_VERSION_V1,
    authority: 'RESEARCH_ONLY_COMPILED_TO_EXISTING_PLANSERVICE_NO_PROJECT_MUTATION' as const,
    fixtureVersion: STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V1,
    contextSha256: context.contextSha256,
    proposalSha256: proposal.proposalSha256,
    planRevisionSha256: plan.revisionSha256,
    nodeCount: nodes.size,
    sequenceNodeCount: [...nodes.values()].filter(({ workKind }) => workKind === 'SEQUENCE').length,
    maxDepth: metrics.maxDepth,
    maxFanout: metrics.maxFanout,
    coveredDirectionRequirementIds: sortedUnique(nodes, 'directionRequirementIds'),
    coveredDeliverableIds: sortedUnique(nodes, 'deliverableIds'),
    uncheckedClaims: [...nodes.values()].flatMap(({ nodeId, whatHasNotBeenChecked }) =>
      whatHasNotBeenChecked.map((check) => ({ nodeId, check }))),
    unverifiedJudgments: ['EDITORIAL_TASTE', 'RANGE_SEMANTIC_ACCURACY', 'RENDERED_AUDIOVISUAL_QUALITY'],
    assessment: 'PASS_STRUCTURAL_ONLY' as const,
    stateEffects: [] as const,
  };
  return Object.freeze({
    plan,
    receipt: Object.freeze({ ...material, receiptSha256: hashEditronCanonicalJsonV1(material) }),
  });
}

function validateProposal(
  context: Readonly<Stage25LongFormPlanContextV1>,
  values: readonly Readonly<Stage25LongFormPlanProposalNodeV1>[],
): Map<string, Readonly<Stage25LongFormPlanProposalNodeV1>> {
  if (values.length > context.workflowPolicy.maxNodes) fail('NODE_LIMIT_EXCEEDED');
  const nodes = new Map<string, Readonly<Stage25LongFormPlanProposalNodeV1>>();
  for (const node of values) {
    if (nodes.has(node.nodeId)) fail('NODE_ID_DUPLICATED');
    nodes.set(node.nodeId, node);
    unique(node.dependsOnNodeIds, 'DEPENDENCY_DUPLICATED');
    for (const field of ['semanticScopeIds', 'rangeCandidateIds', 'deliverableIds', 'directionRequirementIds', 'evidenceRequirementIds', 'approvalRequirementIds'] as const) unique(node[field], `${field.toUpperCase()}_DUPLICATED`);
  }
  const roots = values.filter(({ parentNodeId }) => parentNodeId === null);
  if (roots.length !== 1 || roots[0].workKind !== 'DIRECTION') fail('ROOT_DIRECTION_INVALID');
  const known = <T extends { id: string }>(items: readonly T[]) => new Map(items.map((item) => [item.id, item]));
  const scopes = known(context.semanticScopes); const ranges = new Map(context.rangeCandidates.map((item) => [item.rangeCandidateId, item]));
  const deliverables = known(context.deliverables); const requirements = known(context.directionRequirements);
  const evidence = known(context.evidenceRequirements); const approvals = known(context.approvalRequirements); const budgets = known(context.budgetClasses);
  for (const node of values) {
    if (node.parentNodeId && !nodes.has(node.parentNodeId)) fail('PARENT_MISSING');
    if (node.dependsOnNodeIds.some((id) => id === node.nodeId || !nodes.has(id))) fail('DEPENDENCY_INVALID');
    requireKnown(node.semanticScopeIds, scopes, 'SEMANTIC_SCOPE_UNKNOWN');
    requireKnown(node.rangeCandidateIds, ranges, 'RANGE_CANDIDATE_UNKNOWN');
    requireKnown(node.deliverableIds, deliverables, 'DELIVERABLE_UNKNOWN');
    requireKnown(node.directionRequirementIds, requirements, 'DIRECTION_REQUIREMENT_UNKNOWN');
    requireKnown(node.evidenceRequirementIds, evidence, 'EVIDENCE_REQUIREMENT_UNKNOWN');
    requireKnown(node.approvalRequirementIds, approvals, 'APPROVAL_REQUIREMENT_UNKNOWN');
    if (!budgets.has(node.budgetClassId)) fail('BUDGET_CLASS_UNKNOWN');
    for (const rangeId of node.rangeCandidateIds) {
      if (!node.semanticScopeIds.includes(ranges.get(rangeId)!.semanticScopeId)) fail('RANGE_SCOPE_UNBOUND');
    }
    const unresolved = node.evidenceRequirementIds.some((id) => evidence.get(id)!.status !== 'AVAILABLE');
    if (node.status === 'READY' && unresolved) fail('FALSE_READY_WITH_UNRESOLVED_EVIDENCE');
  }
  assertAcyclic(nodes);
  const metrics = graphMetrics(nodes);
  if (metrics.maxDepth > context.workflowPolicy.maxDepth) fail('PLAN_DEPTH_EXCEEDED');
  if (metrics.maxFanout > context.workflowPolicy.maxFanout) fail('PLAN_FANOUT_EXCEEDED');
  const kinds = new Set(values.map(({ workKind }) => workKind));
  for (const kind of context.workflowPolicy.requiredWorkKinds) if (!kinds.has(kind)) fail(`WORK_KIND_MISSING:${kind}`);
  const sequences = values.filter(({ workKind }) => workKind === 'SEQUENCE');
  if (sequences.length < context.workflowPolicy.minSequenceNodes) fail('SEQUENCE_DECOMPOSITION_TOO_SHALLOW');
  const orders = sequences.map(({ narrativeOrder }) => narrativeOrder).sort((a, b) => Number(a) - Number(b));
  if (orders.some((value, index) => value !== index)
    || values.some(({ workKind, narrativeOrder }) => (workKind === 'SEQUENCE') !== (narrativeOrder !== null))) fail('NARRATIVE_ORDER_INVALID');
  requireCoverage(values, context.directionRequirements.map(({ id }) => id), 'directionRequirementIds', 'DIRECTION_REQUIREMENT_UNCOVERED');
  requireCoverage(values, context.deliverables.map(({ id }) => id), 'deliverableIds', 'DELIVERABLE_UNCOVERED');
  requireCoverage(values, context.evidenceRequirements.map(({ id }) => id), 'evidenceRequirementIds', 'EVIDENCE_REQUIREMENT_UNCOVERED');
  requireCoverage(values, context.approvalRequirements.map(({ id }) => id), 'approvalRequirementIds', 'APPROVAL_REQUIREMENT_UNCOVERED');
  assertWorkflowOrder(nodes);
  return nodes;
}

function assertWorkflowOrder(nodes: Map<string, Readonly<Stage25LongFormPlanProposalNodeV1>>): void {
  const all = [...nodes.values()];
  const ofKind = (kind: Stage25LongFormPlanProposalNodeV1['workKind']) => all.filter((node) => node.workKind === kind);
  const ancestors = (nodeId: string): Set<string> => {
    const seen = new Set<string>(); const pending = [...(nodes.get(nodeId)?.dependsOnNodeIds ?? [])];
    while (pending.length) { const next = pending.pop()!; if (seen.has(next)) continue; seen.add(next); pending.push(...(nodes.get(next)?.dependsOnNodeIds ?? [])); }
    return seen;
  };
  const hasAncestorKind = (node: Stage25LongFormPlanProposalNodeV1, kind: Stage25LongFormPlanProposalNodeV1['workKind']) =>
    [...ancestors(node.nodeId)].some((id) => nodes.get(id)?.workKind === kind);
  for (const story of ofKind('STORY_ASSEMBLY')) for (const kind of ['SOURCE_ORGANIZATION', 'MUSIC_STRUCTURE'] as const) {
    if (!hasAncestorKind(story, kind)) fail(`WORKFLOW_ORDER_INVALID:${story.nodeId}:${kind}`);
  }
  const sequenceIds = new Set(ofKind('SEQUENCE').map(({ nodeId }) => nodeId));
  for (const stable of ofKind('PICTURE_STABILITY')) {
    const upstream = ancestors(stable.nodeId);
    if ([...sequenceIds].some((id) => !upstream.has(id))) fail(`WORKFLOW_ORDER_INVALID:${stable.nodeId}:ALL_SEQUENCES`);
  }
  for (const node of all.filter(({ workKind }) => ['FINAL_AUDIO', 'CAPTIONS', 'QUALITY_CONTROL', 'DELIVERY'].includes(workKind))) {
    if (!hasAncestorKind(node, 'PICTURE_STABILITY')) fail(`WORKFLOW_ORDER_INVALID:${node.nodeId}:PICTURE_STABILITY`);
  }
  for (const delivery of ofKind('DELIVERY')) for (const kind of ['FINAL_AUDIO', 'CAPTIONS', 'QUALITY_CONTROL'] as const) {
    if (!hasAncestorKind(delivery, kind)) fail(`WORKFLOW_ORDER_INVALID:${delivery.nodeId}:${kind}`);
  }
}

function compileNode(context: Readonly<Stage25LongFormPlanContextV1>, node: Readonly<Stage25LongFormPlanProposalNodeV1>): EditorialPlanNodeV1 {
  const scopeById = new Map(context.semanticScopes.map((item) => [item.id, item]));
  const rangeById = new Map(context.rangeCandidates.map((item) => [item.rangeCandidateId, item]));
  const deliverableById = new Map(context.deliverables.map((item) => [item.id, item.artifactRef]));
  const evidenceById = new Map(context.evidenceRequirements.map((item) => [item.id, item.artifactRef]));
  const requirementById = new Map(context.directionRequirements.map((item) => [item.id, item.artifactRef]));
  const approvalById = new Map(context.approvalRequirements.map((item) => [item.id, item.artifactRef]));
  const budgetById = new Map(context.budgetClasses.map((item) => [item.id, item.artifactRef]));
  const ranges = node.rangeCandidateIds.map((id) => rangeById.get(id)!);
  const scopeAuthorityRefs = dedupeRefs([
    ...node.semanticScopeIds.map((id) => scopeById.get(id)!.authorityRef),
    ...ranges.map(({ authorityRef }) => authorityRef),
  ]);
  return {
    nodeId: node.nodeId, nodeVersion: 1, parentNodeId: node.parentNodeId, supersedesNodeId: null,
    objective: { authority: 'MODEL', targetClaims: node.targetClaims, preservationClaims: node.preservationClaims, successConditions: node.successConditions, stopConditions: node.stopConditions },
    scope: {
      semanticScopes: node.semanticScopeIds,
      scopeAuthorityRefs,
      ranges: ranges.map(({ rangeCandidateId: _id, semanticScopeId: _scope, ...range }) => range),
      deliverableRefs: node.deliverableIds.map((id) => deliverableById.get(id)!),
    },
    dependsOnNodeIds: node.dependsOnNodeIds,
    reads: [...node.semanticScopeIds.map((id) => `scope:${id}`), ...node.evidenceRequirementIds.map((id) => `evidence:${id}`)],
    writes: [],
    requires: [...node.dependsOnNodeIds.map((id) => `plan-node-result:${id}`), ...node.evidenceRequirementIds.map((id) => `evidence:${id}`)],
    produces: [`plan-node-result:${node.nodeId}`], invalidates: [], status: node.status,
    executionDefinitionRef: null, eligibleOperationSetRef: null,
    evidenceRequirementRefs: node.evidenceRequirementIds.map((id) => evidenceById.get(id)!),
    preservationLockRefs: node.directionRequirementIds.map((id) => requirementById.get(id)!),
    approvalRequirementRefs: node.approvalRequirementIds.map((id) => approvalById.get(id)!),
    budgetReservationRefs: [budgetById.get(node.budgetClassId)!],
    whatHasNotBeenChecked: node.whatHasNotBeenChecked,
    previewRefs: [], proofRefs: [], receiptRefs: [], finalDisposition: null,
  };
}

function assertAcyclic(nodes: Map<string, Readonly<Stage25LongFormPlanProposalNodeV1>>): void {
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail('PLAN_GRAPH_CYCLE'); if (visited.has(id)) return;
    visiting.add(id); const node = nodes.get(id)!;
    for (const dependency of [node.parentNodeId, ...node.dependsOnNodeIds]) if (dependency) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const id of nodes.keys()) visit(id);
}
function graphMetrics(nodes: Map<string, Readonly<Stage25LongFormPlanProposalNodeV1>>) {
  const children = new Map<string, number>(); let maxDepth = 0;
  for (const node of nodes.values()) if (node.parentNodeId) children.set(node.parentNodeId, (children.get(node.parentNodeId) ?? 0) + 1);
  for (const node of nodes.values()) { let depth = 1; let parent = node.parentNodeId; while (parent) { depth += 1; parent = nodes.get(parent)?.parentNodeId ?? null; } maxDepth = Math.max(maxDepth, depth); }
  return { maxDepth, maxFanout: Math.max(0, ...children.values()) };
}
function requireCoverage(nodes: readonly Stage25LongFormPlanProposalNodeV1[], required: readonly string[], field: 'directionRequirementIds' | 'deliverableIds' | 'evidenceRequirementIds' | 'approvalRequirementIds', code: string) {
  const covered = new Set(nodes.flatMap((node) => node[field])); for (const id of required) if (!covered.has(id)) fail(`${code}:${id}`);
}
function requireKnown<T>(ids: readonly string[], values: Map<string, T>, code: string) { for (const id of ids) if (!values.has(id)) fail(`${code}:${id}`); }
function sortedUnique(nodes: Map<string, Readonly<Stage25LongFormPlanProposalNodeV1>>, field: 'directionRequirementIds' | 'deliverableIds') { return [...new Set([...nodes.values()].flatMap((node) => node[field]))].sort(); }
function unique(values: readonly string[], code: string) { if (new Set(values).size !== values.length) fail(code); }
function dedupeRefs(values: readonly EditorialPlanArtifactRefV1[]) { const seen = new Set<string>(); return values.filter((ref) => { const key = `${ref.ownerId}:${ref.artifactId}:${ref.artifactVersion}:${ref.artifactSha256}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function byNodeId(left: Stage25LongFormPlanProposalNodeV1, right: Stage25LongFormPlanProposalNodeV1) { return left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0; }
function fail(code: string): never { throw new Error(`STAGE25_LONG_FORM_PLAN_${code}`); }
