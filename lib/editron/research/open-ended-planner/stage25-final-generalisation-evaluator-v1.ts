import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { buildStage25FinalGeneralisationFinishSchemaV1,
  type Stage25FinalGeneralisationPublicTaskV1 }
  from './stage25-final-generalisation-protocol-v1';
import { validateJsonSchemaV2 } from './stage4-compilation-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export const STAGE25_FINAL_GENERALISATION_EVALUATOR_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_EVALUATOR_V1_1' as const;

export interface Stage25FinalGeneralisationEvaluationV1 {
  version: typeof STAGE25_FINAL_GENERALISATION_EVALUATOR_VERSION_V1;
  taskId: string;
  taskPacketSha256: string;
  disposition: 'PASS' | 'FAIL';
  outcomeClass: 'EDIT_PLAN' | 'SAFE_STOP' | null;
  schemaValid: boolean;
  publicRuleCoveragePass: boolean;
  evidenceDisciplinePass: boolean;
  operationSelectionPass: boolean | null;
  dependencyAndInvalidationPass: boolean | null;
  routeQualificationPass: boolean | null;
  ownerSafety: 'PASS' | 'FAIL';
  proofClass: 'STRUCTURAL_ONLY' | 'SAFE_STOP_OWNER_PROOF' | 'NO_PROOF';
  diagnostics: readonly string[];
  submissionSha256: string;
  receiptSha256: string;
}

type EvaluationAxesV1 = Pick<Stage25FinalGeneralisationEvaluationV1,
  'outcomeClass' | 'publicRuleCoveragePass' | 'evidenceDisciplinePass'
  | 'operationSelectionPass' | 'dependencyAndInvalidationPass'
  | 'routeQualificationPass' | 'ownerSafety' | 'proofClass'>;

export function evaluateStage25FinalGeneralisationSubmissionV1(input: {
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>;
  submission: unknown;
}): Readonly<Stage25FinalGeneralisationEvaluationV1> {
  assertTaskHash(input.task);
  const diagnostics = validateJsonSchemaV2(
    input.submission,
    buildStage25FinalGeneralisationFinishSchemaV1(input.task.lane),
    '$',
  );
  const schemaValid = diagnostics.length === 0;
  const submission = record(input.submission);
  const proposal = isRecord(submission.proposal) ? submission.proposal : null;
  const safeStop = proposal === null && ['UNVERIFIABLE', 'CAPABILITY_GAP',
    'CLARIFICATION_REQUIRED'].includes(String(submission.disposition));
  let result: EvaluationAxesV1 = emptyAxes();
  if (schemaValid && safeStop) result = evaluateSafeStop(input.task, submission, diagnostics);
  else if (schemaValid && proposal) result = input.task.lane === 'DEPENDENCY_PLAN'
    ? evaluateDependency(input.task, submission, proposal, diagnostics)
    : evaluateRoute(input.task, submission, proposal, diagnostics);
  else if (schemaValid) diagnostics.push('PROPOSAL_DISPOSITION_INCONSISTENT');
  const material = {
    version: STAGE25_FINAL_GENERALISATION_EVALUATOR_VERSION_V1,
    taskId: input.task.taskId,
    taskPacketSha256: input.task.taskPacketSha256,
    disposition: diagnostics.length ? 'FAIL' as const : 'PASS' as const,
    ...result,
    schemaValid,
    diagnostics,
    submissionSha256: hashCanonicalJsonV1(input.submission),
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function evaluateDependency(
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>,
  submission: JsonRecord, proposal: JsonRecord, diagnostics: string[],
) {
  const nodes = records(proposal.planNodes);
  const byId = new Map(nodes.map((node) => [String(node.nodeId), node]));
  if (byId.size !== nodes.length) diagnostics.push('NODE_ID_DUPLICATED');
  if (proposal.taskId !== task.taskId || proposal.lane !== task.lane) {
    diagnostics.push('PROPOSAL_TASK_IDENTITY_DRIFT');
  }
  const rulePass = exactSet(strings(proposal.publicRuleCoverageIds), task.publicRuleIds);
  if (!rulePass) diagnostics.push('PUBLIC_RULE_COVERAGE_INVALID');
  for (const node of nodes) {
    const nodeId = String(node.nodeId);
    if (!task.eligibleOperatorIds.includes(String(node.selectedOperatorId))) {
      diagnostics.push(`OPERATOR_NOT_ELIGIBLE:${nodeId}`);
    }
    for (const dependency of strings(node.dependsOnNodeIds)) {
      if (!byId.has(dependency) || dependency === nodeId) {
        diagnostics.push(`DEPENDENCY_INVALID:${nodeId}:${dependency}`);
      }
    }
    for (const evidenceId of strings(node.evidenceIds)) {
      if (!task.evidenceIds.includes(evidenceId)) diagnostics.push(`EVIDENCE_UNKNOWN:${nodeId}:${evidenceId}`);
    }
    for (const ruleId of strings(node.publicRuleIds)) {
      if (!task.publicRuleIds.includes(ruleId)) diagnostics.push(`PUBLIC_RULE_UNKNOWN:${nodeId}:${ruleId}`);
    }
  }
  const adjacency = new Map(nodes.map((node) => [
    String(node.nodeId), new Set(strings(node.dependsOnNodeIds)),
  ]));
  if (hasCycle(adjacency)) diagnostics.push('DEPENDENCY_CYCLE');
  const policy = record(record(task.publicTask).publicMachinePolicy);
  validateOperatorGroups(nodes, records(policy.requiredOperatorGroups), diagnostics);
  validatePrecedence(nodes, records(policy.requiredPrecedence), adjacency, diagnostics);
  const evidencePass = validateEvidenceBarrier(task, nodes, adjacency, diagnostics);
  validateWriterChain(nodes, adjacency, diagnostics);
  const operationPass = !diagnostics.some((entry) => /OPERATOR|TASK_IDENTITY/.test(entry));
  const dependencyPass = !diagnostics.some((entry) =>
    /DEPENDENCY|PRECEDENCE|WRITER|REVISION/.test(entry));
  return {
    outcomeClass: 'EDIT_PLAN' as const,
    publicRuleCoveragePass: rulePass,
    evidenceDisciplinePass: evidencePass,
    operationSelectionPass: operationPass,
    dependencyAndInvalidationPass: dependencyPass,
    routeQualificationPass: null,
    ownerSafety: diagnostics.length ? 'FAIL' as const : 'PASS' as const,
    proofClass: 'STRUCTURAL_ONLY' as const,
  };
}

function evaluateRoute(
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>,
  submission: JsonRecord, proposal: JsonRecord, diagnostics: string[],
) {
  const candidates = records(proposal.candidateForms);
  const expectedRoutes = ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'];
  if (proposal.taskId !== task.taskId || proposal.lane !== task.lane) {
    diagnostics.push('PROPOSAL_TASK_IDENTITY_DRIFT');
  }
  if (!exactSet(candidates.map(({ route }) => String(route)), expectedRoutes)) {
    diagnostics.push('ROUTE_CANDIDATE_SET_INVALID');
  }
  const rulePass = exactSet(strings(proposal.publicRuleCoverageIds), task.publicRuleIds);
  if (!rulePass) diagnostics.push('PUBLIC_RULE_COVERAGE_INVALID');
  const ownerQualifications = new Map(records(task.currentOwnerEvidence.routeQualifications)
    .map(({ route, qualification }) => [String(route), String(qualification)]));
  const targetIds = strings(record(record(task.publicTask).publicMachinePolicy).exactTargetPredicateIds);
  const preservationIds = strings(
    record(record(task.publicTask).publicMachinePolicy).exactPreservationPredicateIds,
  );
  for (const candidate of candidates) {
    const route = String(candidate.route);
    const expected = ownerQualifications.get(route);
    if (candidate.qualification !== expected) diagnostics.push(`ROUTE_QUALIFICATION_DRIFT:${route}`);
    if (expected === 'RESEARCH_PREVIEW_AVAILABLE') {
      if (!exactSet(strings(candidate.targetPredicateIds), targetIds)) {
        diagnostics.push(`ROUTE_TARGET_COVERAGE_INVALID:${route}`);
      }
      if (!exactSet(strings(candidate.preservationPredicateIds), preservationIds)) {
        diagnostics.push(`ROUTE_PRESERVATION_COVERAGE_INVALID:${route}`);
      }
    } else if (!strings(candidate.blockers).length) {
      diagnostics.push(`ROUTE_GAP_BLOCKER_MISSING:${route}`);
    }
    for (const operatorId of strings(candidate.selectedOperatorIds)) {
      if (!task.eligibleOperatorIds.includes(operatorId)) diagnostics.push(`ROUTE_OPERATOR_UNKNOWN:${route}`);
    }
  }
  const selectedRoute = proposal.selectedRoute === null ? null : String(proposal.selectedRoute);
  const available = [...ownerQualifications.entries()]
    .filter(([, value]) => value === 'RESEARCH_PREVIEW_AVAILABLE').map(([route]) => route);
  if (selectedRoute !== null && !available.includes(selectedRoute)) {
    diagnostics.push('SELECTED_ROUTE_UNAVAILABLE');
  }
  if (available.length && selectedRoute === null) diagnostics.push('AVAILABLE_ROUTE_NOT_SELECTED');
  if (!available.length && selectedRoute !== null) diagnostics.push('GAP_TASK_SELECTED_ROUTE');
  if ((selectedRoute === 'GENERATED_COMPOSITION' || selectedRoute === 'HYBRID')
    && strings(proposal.boundaryHandoffs).length < 3) diagnostics.push('BOUNDARY_HANDOFFS_INCOMPLETE');
  const evidencePass = exactSet(strings(submission.evidenceIds), task.evidenceIds);
  if (!evidencePass) diagnostics.push('SUBMISSION_EVIDENCE_SET_INVALID');
  return {
    outcomeClass: available.length ? 'EDIT_PLAN' as const : 'SAFE_STOP' as const,
    publicRuleCoveragePass: rulePass,
    evidenceDisciplinePass: evidencePass,
    operationSelectionPass: null,
    dependencyAndInvalidationPass: null,
    routeQualificationPass: available.length ? diagnostics.length === 0 : null,
    ownerSafety: diagnostics.length ? 'FAIL' as const : 'PASS' as const,
    proofClass: available.length ? 'STRUCTURAL_ONLY' as const : 'SAFE_STOP_OWNER_PROOF' as const,
  };
}

function evaluateSafeStop(
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>,
  submission: JsonRecord, diagnostics: string[],
) {
  const routeGaps = records(task.currentOwnerEvidence.routeQualifications)
    .every(({ qualification }) => qualification === 'OWNER_OR_FIXTURE_GAP');
  if (task.lane !== 'ROUTE_DECISION' || !routeGaps) diagnostics.push('SAFE_STOP_NOT_OWNER_SUPPORTED');
  const evidencePass = strings(submission.reasonCodes).length > 0
    && exactSet(strings(submission.evidenceIds), task.evidenceIds);
  if (!strings(submission.reasonCodes).length) diagnostics.push('SAFE_STOP_REASON_MISSING');
  if (!exactSet(strings(submission.evidenceIds), task.evidenceIds)) {
    diagnostics.push('SAFE_STOP_EVIDENCE_SET_INVALID');
  }
  return {
    outcomeClass: 'SAFE_STOP' as const,
    publicRuleCoveragePass: true,
    evidenceDisciplinePass: evidencePass,
    operationSelectionPass: null,
    dependencyAndInvalidationPass: null,
    routeQualificationPass: null,
    ownerSafety: diagnostics.length ? 'FAIL' as const : 'PASS' as const,
    proofClass: 'SAFE_STOP_OWNER_PROOF' as const,
  };
}

function validateOperatorGroups(nodes: JsonRecord[], groups: JsonRecord[], diagnostics: string[]): void {
  for (const group of groups) {
    const ids = strings(group.operatorIds);
    const count = nodes.filter(({ selectedOperatorId }) => ids.includes(String(selectedOperatorId))).length;
    if (count < Number(group.minimumCount) || count > Number(group.maximumCount)) {
      diagnostics.push(`OPERATOR_GROUP_COUNT_INVALID:${String(group.groupId)}`);
    }
  }
}
function validatePrecedence(nodes: JsonRecord[], rules: JsonRecord[], graph: Map<string, Set<string>>, diagnostics: string[]): void {
  for (const rule of rules) {
    const before = nodes.filter(({ selectedOperatorId }) => selectedOperatorId === rule.before);
    const after = nodes.filter(({ selectedOperatorId }) => selectedOperatorId === rule.after);
    if (after.some((later) => !before.some((earlier) => reachable(String(later.nodeId), String(earlier.nodeId), graph)))) {
      diagnostics.push(`PRECEDENCE_INVALID:${String(rule.before)}:${String(rule.after)}`);
    }
  }
}
function validateEvidenceBarrier(task: Readonly<Stage25FinalGeneralisationPublicTaskV1>, nodes: JsonRecord[], graph: Map<string, Set<string>>, diagnostics: string[]): boolean {
  const writers = nodes.filter(({ role }) => role === 'MUTATION');
  for (const evidenceId of task.evidenceIds) {
    const producers = nodes.filter((node) => strings(node.evidenceIds).includes(evidenceId));
    if (!producers.length || writers.some((writer) => !producers.some((producer) =>
      reachable(String(writer.nodeId), String(producer.nodeId), graph)))) {
      diagnostics.push(`EVIDENCE_BARRIER_INVALID:${evidenceId}`);
    }
  }
  return !diagnostics.some((entry) => entry.startsWith('EVIDENCE_'));
}
function validateWriterChain(nodes: JsonRecord[], graph: Map<string, Set<string>>, diagnostics: string[]): void {
  const writers = nodes.filter(({ role }) => role === 'MUTATION');
  if (!writers.length) { diagnostics.push('WRITER_MISSING'); return; }
  const roots = writers.filter((writer) => !writers.some((other) => other !== writer
    && reachable(String(writer.nodeId), String(other.nodeId), graph)));
  if (roots.length !== 1 || roots[0]?.expectedRevisionOrigin !== 'INITIAL_PROJECT_SNAPSHOT') {
    diagnostics.push('WRITER_INITIAL_REVISION_INVALID');
  }
  for (const writer of writers.filter((entry) => entry !== roots[0])) {
    const prior = writers.filter((other) => other !== writer
      && reachable(String(writer.nodeId), String(other.nodeId), graph));
    const outputs = new Set(prior.flatMap((entry) => strings(entry.producesOwnerOutputRefs)));
    if (writer.expectedRevisionOrigin !== 'PRIOR_WRITER_RECEIPT'
      || !strings(writer.consumesOwnerOutputRefs).some((reference) => outputs.has(reference))) {
      diagnostics.push(`WRITER_RECEIPT_CHAIN_INVALID:${String(writer.nodeId)}`);
    }
  }
}
function emptyAxes(): EvaluationAxesV1 { return { outcomeClass: null, publicRuleCoveragePass: false, evidenceDisciplinePass: false, operationSelectionPass: null, dependencyAndInvalidationPass: null, routeQualificationPass: null, ownerSafety: 'FAIL', proofClass: 'NO_PROOF' }; }
function assertTaskHash(task: Readonly<Stage25FinalGeneralisationPublicTaskV1>): void {
  const { taskPacketSha256, ...material } = task;
  if (hashCanonicalJsonV1(material) !== taskPacketSha256) throw new Error('STAGE25_FINAL_GENERALISATION_EVALUATOR_TASK_HASH_INVALID');
}
function hasCycle(graph: Map<string, Set<string>>): boolean { const active = new Set<string>(); const done = new Set<string>(); const visit = (id: string): boolean => { if (active.has(id)) return true; if (done.has(id)) return false; active.add(id); for (const next of graph.get(id) ?? []) if (visit(next)) return true; active.delete(id); done.add(id); return false; }; return [...graph.keys()].some(visit); }
function reachable(start: string, target: string, graph: Map<string, Set<string>>): boolean { const pending = [start]; const seen = new Set<string>(); while (pending.length) { const id = pending.pop()!; if (id === target && id !== start) return true; if (seen.has(id)) continue; seen.add(id); pending.push(...(graph.get(id) ?? [])); } return false; }
function exactSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === left.length && right.every((value) => left.includes(value)); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
