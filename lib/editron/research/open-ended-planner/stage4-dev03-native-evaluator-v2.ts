import { deepFreezeV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;
type Dimension = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface Dev03Stage4EvaluationV2 {
  assessment: Dimension;
  sourceAndProvenance: Dimension;
  operationResolution: Dimension;
  dependencyAndRevision: Dimension;
  preservationAndProof: Dimension;
  diagnostics: readonly string[];
}

const expectedOperators = new Map([
  ['compile-read-project', 'read_project_file'], ['compile-read-timeline', 'get_timeline_view'],
  ['compile-find-impacts', 'find_audio_moment'], ['compile-sync', 'sync_cuts_to_beats'],
  ['compile-shake', 'apply_camera_shake'], ['compile-proof-read', 'read_project_file'],
  ['compile-proof-timeline', 'get_timeline_view'],
]);
const requiredNodeFields = ['nodeId', 'intentNodeId', 'operatorId', 'operatorSpecRef', 'ownerRef', 'inputs', 'reads', 'writes', 'requires', 'produces', 'invalidates', 'coordinateBindings', 'revisionBinding', 'stabilityRequirement', 'stateEffects', 'idempotency', 'proofObligationIds', 'failureDisposition', 'retryDisposition', 'policyFactIds', 'concurrency', 'resourcePolicyId', 'reversibility', 'traceRefs'];
const expectedReceiptHash = 'dfe00f0f8fa03e2a8ab6fe9c909233ece8daa7a92b7efe0cc5c06b330f6bbb94';

export function evaluateDev03Stage4CompiledGraphV2(value: unknown): Readonly<Dev03Stage4EvaluationV2> {
  const graph = record(value);
  if (!Object.keys(graph).length) return empty();
  const diagnostics: string[] = [];
  if (graph.artifactType !== 'CompiledOperationGraphV2' || graph.taskId !== 'DEV-03') diagnostics.push('SOURCE_ARTIFACT_OR_TASK_DRIFT');
  if (graph.compileDisposition !== 'COMPILED_RESEARCH_PROXY' || graph.executionEligibility !== 'RESEARCH_PROXY_ONLY') diagnostics.push('SOURCE_FALSE_EXECUTION_ELIGIBILITY');
  if (graph.projectId !== 'oe-dev-03' || graph.expectedProjectRevision !== 'R11') diagnostics.push('SOURCE_PROJECT_REVISION_DRIFT');
  if (graph.measuredEvidenceReceiptHash !== expectedReceiptHash) diagnostics.push('SOURCE_MEASURED_RECEIPT_DRIFT');
  for (const field of ['sourceEditorialIntentHash', 'sourceEvidenceBoundIntentHash', 'evidencePackHash']) if (!hex64(graph[field])) diagnostics.push(`SOURCE_${field.toUpperCase()}_INVALID`);
  const owners = record(graph.ownerResolution);
  if (owners.beatAlignment !== 'lib/pipeline/scene-to-editron.ts#alignCutsToBeatsWithEvidence' || owners.cameraShake !== 'lib/editron/agent/chat-visual-tools.ts#applyCameraShakeToProject') diagnostics.push('OPERATION_FORM_OWNER_DRIFT');

  const nodes = records(graph.nodes); const nodeById = new Map(nodes.map((node) => [text(node.nodeId), node]));
  if (!sameSet([...nodeById.keys()], [...expectedOperators.keys()])) diagnostics.push('OPERATION_NODE_SET_DRIFT');
  for (const [nodeId, operatorId] of expectedOperators) {
    const node = nodeById.get(nodeId);
    if (!node || node.operatorId !== operatorId) { diagnostics.push(`OPERATION_NODE_BINDING_DRIFT:${nodeId}`); continue; }
    for (const field of requiredNodeFields) if (!(field in node)) diagnostics.push(`OPERATION_NODE_FIELD_MISSING:${nodeId}/${field}`);
    if (node.failureDisposition !== 'ABORT_GRAPH' || node.stabilityRequirement !== 'RANGE_STABLE') diagnostics.push(`OPERATION_NODE_SAFETY_DRIFT:${nodeId}`);
    const mutation = ['compile-sync', 'compile-shake'].includes(nodeId);
    if (mutation) {
      if (!strings(node.writes).length || !strings(node.invalidates).length || record(node.concurrency).class !== 'MUTATION_EXCLUSIVE' || record(node.reversibility).disposition !== 'CHECKPOINT_REQUIRED' || node.retryDisposition !== 'REBASE_REQUIRED') diagnostics.push(`OPERATION_MUTATION_CONTRACT_DRIFT:${nodeId}`);
    } else if (strings(node.writes).length || strings(node.invalidates).length || record(node.reversibility).disposition !== 'NOT_APPLICABLE_READ_ONLY') diagnostics.push(`OPERATION_READ_EFFECT_DRIFT:${nodeId}`);
  }
  validateSync(nodeById.get('compile-sync'), diagnostics);
  validateShake(nodeById.get('compile-shake'), diagnostics);

  const edges = records(graph.edges); const adjacency = adjacencyFor(nodes, edges, diagnostics);
  for (const [from, to, code] of [['compile-read-project', 'compile-read-timeline', 'READ_ORDER'], ['compile-read-timeline', 'compile-find-impacts', 'EVIDENCE_ORDER'], ['compile-find-impacts', 'compile-sync', 'SYNC_ORDER'], ['compile-sync', 'compile-shake', 'SHAKE_ORDER'], ['compile-shake', 'compile-proof-timeline', 'PROOF_ORDER']]) if (!reachable(from, to, adjacency)) diagnostics.push(`DEPENDENCY_${code}_MISSING`);
  const syncRevision = record(nodeById.get('compile-sync')?.revisionBinding).expectedProjectRevision;
  const shakeRevision = record(nodeById.get('compile-shake')?.revisionBinding).expectedProjectRevision;
  const proofRevision = record(nodeById.get('compile-proof-timeline')?.revisionBinding).expectedProjectRevision;
  if (syncRevision !== 'R11' || shakeRevision !== '@compile-sync.receipt.revision' || proofRevision !== '@compile-shake.receipt.revision') diagnostics.push('DEPENDENCY_REVISION_CHAIN_DRIFT');
  const proofPolicy = record(graph.proofPolicy);
  const proofIds = new Set(strings(proofPolicy.proofObligationIds));
  for (const id of ['proof-revision', 'proof-measured-beats', 'proof-source-handles', 'proof-protected-audio', 'proof-boundary-timing', 'proof-shake', 'proof-state']) if (!proofIds.has(id)) diagnostics.push(`PRESERVATION_PROOF_MISSING:${id}`);
  const preservationIds = new Set(strings(proofPolicy.preservationIds));
  for (const id of ['preserve-protected-audio', 'preserve-clip-count-order-assets', 'preserve-duration-and-speed', 'preserve-non-target-motion']) if (!preservationIds.has(id)) diagnostics.push(`PRESERVATION_BINDING_MISSING:${id}`);
  if (proofPolicy.mode !== 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION' || proofPolicy.onUnverifiable !== 'BLOCK_EXECUTION') diagnostics.push('PRESERVATION_PROOF_POLICY_DRIFT');
  if (records(graph.diagnostics).length || strings(graph.unresolvedIntentNodeIds).length) diagnostics.push('SOURCE_UNEXPECTED_GAP');
  if (nodes.some((node) => ['generated_composition_program', 'add_sfx', 'apply_speed_ramp'].includes(text(node.operatorId)))) diagnostics.push('OPERATION_FORBIDDEN_SUBSTITUTION');

  const uniqueDiagnostics = unique(diagnostics).sort(compareUtf16);
  return deepFreezeV1({
    assessment: uniqueDiagnostics.length ? 'FAIL' : 'PASS',
    sourceAndProvenance: dimension(uniqueDiagnostics, /^SOURCE_/), operationResolution: dimension(uniqueDiagnostics, /^OPERATION_/),
    dependencyAndRevision: dimension(uniqueDiagnostics, /^DEPENDENCY_/), preservationAndProof: dimension(uniqueDiagnostics, /^PRESERVATION_/),
    diagnostics: uniqueDiagnostics,
  });
}

function validateSync(node: JsonRecord | undefined, diagnostics: string[]): void {
  const inputs = record(node?.inputs); const audio = record(inputs.audioPlan); const constraints = record(inputs.constraints);
  if (!same(audio.strongPeakFrames, [119, 239, 359, 479]) || audio.finalStrongPeakFrame !== 479 || audio.measuredEvidenceReceiptHash !== expectedReceiptHash) diagnostics.push('OPERATION_SYNC_MEASURED_BINDING_DRIFT');
  if (!same(inputs.overlayIds, ['dev03-card-1', 'dev03-card-2', 'dev03-card-3', 'dev03-card-4'])) diagnostics.push('OPERATION_SYNC_OVERLAY_SET_DRIFT');
  if (constraints.maxSnapFrames !== 12 || constraints.requireSourceHandles !== true || !same(constraints.protectedAudioRange, [250, 350])) diagnostics.push('PRESERVATION_SYNC_CONSTRAINT_DRIFT');
  const moves = records(constraints.expectedBoundaryMoves);
  const expected = [[114, 119, 5], [246, 239, -7], [472, 479, 7]];
  if (!same(moves.map(({ originalFrame, alignedFrame, shiftFrames }) => [originalFrame, alignedFrame, shiftFrames]), expected)) diagnostics.push('OPERATION_SYNC_OWNER_RESULT_DRIFT');
}
function validateShake(node: JsonRecord | undefined, diagnostics: string[]): void {
  const inputs = record(node?.inputs); const plan = record(inputs.effectPlan);
  if (inputs.overlayId !== 'dev03-card-4' || !same(inputs.targetRange, { startFrame: 479, endFrame: 491 })) diagnostics.push('OPERATION_SHAKE_TARGET_DRIFT');
  if (plan.resolutionOwnerRef !== 'lib/editron/agent/chat-visual-tools.ts#applyCameraShakeToProject' || plan.targetFrame !== 479 || plan.localFrame !== 0 || plan.intensity !== 0.3 || plan.durationFrames !== 10 || plan.requireNeutralReturn !== true || plan.replacePositionKeyframes !== false) diagnostics.push('OPERATION_SHAKE_FORM_DRIFT');
}
function adjacencyFor(nodes: JsonRecord[], edges: JsonRecord[], diagnostics: string[]): Map<string, Set<string>> { const ids = new Set(nodes.map(({ nodeId }) => text(nodeId))); const result = new Map([...ids].map((id) => [id, new Set<string>()])); for (const edge of edges) { const from = text(edge.fromNodeId); const to = text(edge.toNodeId); if (!ids.has(from) || !ids.has(to) || from === to) diagnostics.push('DEPENDENCY_EDGE_INVALID'); else result.get(from)?.add(to); } return result; }
function reachable(start: string, target: string, adjacency: Map<string, Set<string>>): boolean { const pending = [start]; const seen = new Set<string>(); while (pending.length) { const id = pending.pop() as string; if (id === target && id !== start) return true; if (seen.has(id)) continue; seen.add(id); pending.push(...(adjacency.get(id) ?? [])); } return false; }
function empty(): Readonly<Dev03Stage4EvaluationV2> { return deepFreezeV1({ assessment: 'UNVERIFIABLE', sourceAndProvenance: 'UNVERIFIABLE', operationResolution: 'UNVERIFIABLE', dependencyAndRevision: 'UNVERIFIABLE', preservationAndProof: 'UNVERIFIABLE', diagnostics: ['SOURCE_ARTIFACT_MISSING'] }); }
function dimension(diagnostics: string[], prefix: RegExp): Dimension { return diagnostics.some((entry) => prefix.test(entry)) ? 'FAIL' : 'PASS'; }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && right.every((entry) => left.includes(entry)); }
function hex64(value: unknown): boolean { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
