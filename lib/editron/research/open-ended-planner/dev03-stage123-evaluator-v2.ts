import { hashCanonicalJsonV1 } from './contracts-v1';
import type { Dev03MeasuredEvidenceReceiptV2 } from './dev03-measured-evidence-v2';
import type { Dev03ConditionV2 } from './dev03-stage123-canonical-v2';
import { getCanonicalDev03NativeProxyFixtureV2 } from './dev03-native-proxy-fixture-v2';

type JsonRecord = Record<string, unknown>;

export interface Dev03Stage123EvaluationV2 {
  assessment: 'PASS' | 'FAIL';
  expectedStageDisposition: 'READY_FOR_COMPILATION' | 'UNVERIFIABLE';
  diagnostics: string[];
}

const requiredClaims = new Set(['claim-align-existing-boundaries', 'claim-protect-audio-range', 'claim-final-hit-shake', 'claim-preserve-timeline-structure']);
const audioResolvers = ['find_audio_moment', 'resolve_audio_edit'];
const fixture = getCanonicalDev03NativeProxyFixtureV2();

export function evaluateDev03StagesOneToThreeV2(input: {
  conditionId: Dev03ConditionV2;
  measuredEvidence: Readonly<Dev03MeasuredEvidenceReceiptV2>;
  referenceBlueprint: unknown;
  editorialIntent: unknown;
  evidencePack: unknown;
  evidenceBoundIntent: unknown;
}): Readonly<Dev03Stage123EvaluationV2> {
  const diagnostics: string[] = [];
  const baseline = input.conditionId === 'BASELINE';
  const blueprint = record(input.referenceBlueprint);
  const intent = record(input.editorialIntent);
  const pack = record(input.evidencePack);
  const bound = record(input.evidenceBoundIntent);
  const expectedEvidenceIds = baseline ? ['EV-DEV03-B1', 'EV-DEV03-D1', 'EV-DEV03-T1'] : ['EV-DEV03-D1', 'EV-DEV03-T1'];

  requireValue(diagnostics, blueprint.artifactType, 'ReferenceBlueprintV2', 'DEV03_STAGE1_ARTIFACT_TYPE');
  requireValue(diagnostics, blueprint.taskId, 'DEV-03', 'DEV03_STAGE1_TASK');
  requireSet(diagnostics, records(blueprint.targetClaims).map(({ claimId }) => text(claimId)), requiredClaims, 'DEV03_STAGE1_TARGET_CLAIMS');
  requireSet(diagnostics, strings(blueprint.evidenceIds), new Set(expectedEvidenceIds), 'DEV03_STAGE1_EVIDENCE_SCOPE');
  if (['sync_cuts_to_beats', 'apply_camera_shake'].some((operatorId) => JSON.stringify(blueprint).includes(operatorId))) {
    diagnostics.push('DEV03_STAGE1_OPERATOR_LEAK');
  }
  for (const claimId of ['claim-align-existing-boundaries', 'claim-final-hit-shake']) {
    const claim = records(blueprint.targetClaims).find((entry) => entry.claimId === claimId);
    if (baseline && (claim?.ambiguity !== 'RESOLVED' || !strings(claim.evidenceIds).includes('EV-DEV03-B1'))) diagnostics.push(`DEV03_STAGE1_BEAT_CLAIM_NOT_BOUND:${claimId}`);
    if (!baseline && claim?.ambiguity !== 'ASK_USER') diagnostics.push(`DEV03_STAGE1_WITHHELD_BEAT_NOT_UNCERTAIN:${claimId}`);
  }

  requireValue(diagnostics, intent.artifactType, 'EditorialIntentGraphV2', 'DEV03_STAGE2_ARTIFACT_TYPE');
  requireValue(diagnostics, intent.taskId, 'DEV-03', 'DEV03_STAGE2_TASK');
  requireValue(diagnostics, intent.executionForm, 'NATIVE', 'DEV03_STAGE2_ROUTE_NOT_NATIVE');
  const nodes = records(intent.nodes);
  const selectedCapabilities = new Set(nodes.flatMap(({ candidateCapabilityIds }) => strings(candidateCapabilityIds)));
  for (const forbidden of ['generated_composition_program', 'add_sfx', 'apply_speed_ramp', 'add_transition']) {
    if (selectedCapabilities.has(forbidden)) diagnostics.push(`DEV03_STAGE2_FORBIDDEN_SUBSTITUTION:${forbidden}`);
  }
  requireCapabilityGroups(diagnostics, selectedCapabilities, [audioResolvers, ['sync_cuts_to_beats'], ['apply_camera_shake']], 'DEV03_STAGE2_CAPABILITY_COVERAGE');
  requireCapabilityClaim(diagnostics, nodes, 'sync_cuts_to_beats', ['claim-align-existing-boundaries', 'claim-protect-audio-range'], 'DEV03_STAGE2_ALIGNMENT_CLAIM_COVERAGE');
  requireCapabilityClaim(diagnostics, nodes, 'apply_camera_shake', ['claim-final-hit-shake'], 'DEV03_STAGE2_SHAKE_CLAIM_COVERAGE');
  const routeDecision = record(intent.routeDecision);
  requireValue(diagnostics, routeDecision.scopeClassification, 'NATIVE_ONLY_PLAN', 'DEV03_STAGE2_SCOPE');
  requireValue(diagnostics, routeDecision.coverageStatus, 'COMPLETE', 'DEV03_STAGE2_COVERAGE');
  if (strings(routeDecision.generatedIslandClaimIds).length
    || nodes.some(({ executionForm }) => executionForm === 'GENERATED_COMPOSITION')) {
    diagnostics.push('DEV03_STAGE2_FORBIDDEN_SUBSTITUTION:generated_composition_program');
  }
  const edges = records(intent.edges);
  requireDependency(diagnostics, nodes, edges, audioResolvers, ['sync_cuts_to_beats'], 'DEV03_ORDER_IMPACTS_BEFORE_ALIGNMENT');
  requireDependency(diagnostics, nodes, edges, ['sync_cuts_to_beats'], ['apply_camera_shake'], 'DEV03_ORDER_ALIGNMENT_BEFORE_SHAKE');
  const preservations = records(intent.preservationIntents);
  if (!preservations.some(({ claimId, rule, proofKind }) => claimId === 'claim-protect-audio-range'
    && /audio|dialogue|sentence|byte|timing/i.test(`${text(rule)} ${text(proofKind)}`))) {
    diagnostics.push('DEV03_STAGE2_PRESERVATION_MISSING:protected-audio');
  }
  if (!preservations.some(({ claimId, rule, proofKind }) => claimId === 'claim-preserve-timeline-structure'
    && /clip|order|asset|duration|speed|timeline|state/i.test(`${text(rule)} ${text(proofKind)}`))) {
    diagnostics.push('DEV03_STAGE2_PRESERVATION_MISSING:timeline-structure');
  }

  requireValue(diagnostics, pack.artifactType, 'EvidencePackV2', 'DEV03_STAGE3_PACK_TYPE');
  requireValue(diagnostics, pack.taskId, 'DEV-03', 'DEV03_STAGE3_PACK_TASK');
  requireValue(diagnostics, pack.conditionId, input.conditionId, 'DEV03_STAGE3_PACK_CONDITION');
  requireSet(diagnostics, strings(pack.visibleEvidenceIds), new Set(expectedEvidenceIds), 'DEV03_STAGE3_VISIBLE_EVIDENCE');
  const facts = records(pack.facts);
  const factIds = new Set(facts.map(({ factId }) => text(factId)));
  for (const required of ['fact-project-revision', 'fact-project-timebase', 'fact-timeline-boundaries', 'fact-source-handles', 'fact-protected-audio']) {
    if (!factIds.has(required)) diagnostics.push(`DEV03_STAGE3_FACT_MISSING:${required}`);
  }
  const measuredFact = facts.find(({ factId }) => factId === 'fact-measured-beats');
  if (baseline) evaluateMeasuredFact(diagnostics, measuredFact, input.measuredEvidence);
  else if (measuredFact) diagnostics.push('DEV03_STAGE3_WITHHELD_BEATS_FALSE_BOUND');
  const protectedAudio = facts.find(({ factId }) => factId === 'fact-protected-audio');
  if (!protectedAudio || !equalJson(protectedAudio.range, fixture.evidence.protectedAudioRange) || protectedAudio.requiredPreservation !== 'BYTES_AND_TIMING') diagnostics.push('DEV03_STAGE3_PROTECTED_AUDIO_DRIFT');
  const timeline = facts.find(({ factId }) => factId === 'fact-timeline-boundaries');
  if (!timeline || !equalJson(timeline.initialBoundaryFrames, fixture.evidence.initialBoundaryFrames) || timeline.clipCount !== 4 || timeline.totalDurationFrames !== fixture.project.durationInFrames) diagnostics.push('DEV03_STAGE3_TIMELINE_FACT_DRIFT');
  const handles = facts.find(({ factId }) => factId === 'fact-source-handles');
  if (!handles
    || handles.sourceArtifactSha256 !== fixture.assets.cards.sha256
    || !equalJson(handles.sourceRate, { numerator: String(fixture.assets.cards.fpsNumerator), denominator: String(fixture.assets.cards.fpsDenominator) })
    || !equalJson(handles.sourceDurationFramesByAssetId, { [fixture.assets.cards.assetId]: fixture.assets.cards.durationInFrames })
    || !equalJson(handles.sourceStartFrames, fixture.evidence.sourceStartFrames)
    || handles.maxBoundaryShiftFrames !== fixture.evidence.maxBoundaryShiftFrames) diagnostics.push('DEV03_STAGE3_SOURCE_HANDLE_FACT_DRIFT');
  const revision = record(bound.revisionBinding);
  if (revision.projectId !== fixture.project.projectId || revision.expectedProjectRevision !== fixture.project.projectRevision || revision.status !== 'BOUND') diagnostics.push('DEV03_STAGE3_REVISION_NOT_BOUND');
  requireValue(diagnostics, bound.artifactType, 'EvidenceBoundIntentGraphV2', 'DEV03_STAGE3_ARTIFACT_TYPE');
  requireValue(diagnostics, bound.taskId, 'DEV-03', 'DEV03_STAGE3_TASK');
  const expectedDisposition = baseline ? 'READY_FOR_COMPILATION' : 'UNVERIFIABLE';
  requireStageThreeDisposition(diagnostics, bound, factIds, baseline);
  const beatNodes = records(bound.nodes).filter(({ candidateCapabilityIds }) => strings(candidateCapabilityIds).some((id) => ['find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake'].includes(id)));
  if (baseline && beatNodes.some(({ bindingStatus }) => bindingStatus !== 'BOUND')) diagnostics.push('DEV03_STAGE3_BEAT_NODE_NOT_BOUND');
  if (!baseline && beatNodes.some(({ bindingStatus }) => bindingStatus !== 'UNVERIFIABLE')) diagnostics.push('DEV03_STAGE3_WITHHELD_BEAT_NODE_FALSE_BOUND');
  const proofKinds = new Set(records(bound.proofPlan).map(({ kind }) => text(kind)));
  for (const kind of ['MEASURED_BEAT_PROVENANCE', 'SOURCE_HANDLE_LEGALITY', 'PROTECTED_AUDIO_BYTES_AND_TIMING', 'RENDERED_BOUNDARY_TIMING', 'RENDERED_SHAKE_AND_NEUTRAL_RETURN', 'STATE_RELOAD']) {
    if (!proofKinds.has(kind)) diagnostics.push(`DEV03_STAGE3_PROOF_MISSING:${kind}`);
  }
  if (!baseline && !records(bound.unresolvedRequirements).some(({ requirementId, disposition, failureDisposition }) => requirementId === 'req-measured-beat-evidence' && disposition === 'UNVERIFIABLE' && failureDisposition === 'STOP_BEFORE_COMPILATION_OR_RENDER')) diagnostics.push('DEV03_STAGE3_WITHHELD_REQUIREMENT_MISSING');

  return Object.freeze({ assessment: diagnostics.length ? 'FAIL' : 'PASS', expectedStageDisposition: expectedDisposition, diagnostics });
}

function evaluateMeasuredFact(diagnostics: string[], fact: JsonRecord | undefined, receipt: Readonly<Dev03MeasuredEvidenceReceiptV2>): void {
  if (!fact) { diagnostics.push('DEV03_STAGE3_MEASURED_BEATS_MISSING'); return; }
  const expectedFrames = receipt.analysis.strongPeaks.map(({ projectFrame }) => projectFrame);
  if (fact.receiptHash !== hashCanonicalJsonV1(receipt)) diagnostics.push('DEV03_STAGE3_MEASURED_RECEIPT_HASH_DRIFT');
  if (fact.sourceArtifactSha256 !== receipt.sourceBinding.artifactSha256) diagnostics.push('DEV03_STAGE3_AUDIO_HASH_DRIFT');
  if (fact.analyzerImplementationSha256 !== receipt.analyzerBinding.implementationSha256 || fact.analyzerOptionsHash !== receipt.analyzerBinding.optionsHash) diagnostics.push('DEV03_STAGE3_ANALYZER_BINDING_DRIFT');
  if (!equalJson(fact.strongPeakFrames, expectedFrames) || fact.finalStrongPeakFrame !== receipt.analysis.finalStrongPeakFrame) diagnostics.push('DEV03_STAGE3_MEASURED_PEAK_DRIFT');
  if (fact.bpmConfidence !== receipt.analysis.bpmConfidence || fact.frameRounding !== 'NEAREST_PROJECT_TICK') diagnostics.push('DEV03_STAGE3_MEASUREMENT_POLICY_DRIFT');
}

function requireDependency(diagnostics: string[], nodes: JsonRecord[], edges: JsonRecord[], beforeCapabilities: string[], afterCapabilities: string[], diagnostic: string): void {
  const before = nodes.filter(({ candidateCapabilityIds }) => strings(candidateCapabilityIds).some((id) => beforeCapabilities.includes(id))).map(({ intentNodeId }) => text(intentNodeId));
  const after = nodes.filter(({ candidateCapabilityIds }) => strings(candidateCapabilityIds).some((id) => afterCapabilities.includes(id))).map(({ intentNodeId }) => text(intentNodeId));
  if (!before.some((beforeId) => after.some((afterId) => hasDependencyPath(nodes, edges, beforeId, afterId)))) diagnostics.push(diagnostic);
}
function hasDependencyPath(nodes: JsonRecord[], edges: JsonRecord[], from: string, to: string): boolean {
  const adjacency = new Map<string, Set<string>>();
  const connect = (before: string, after: string) => {
    if (!before || !after) return;
    const outgoing = adjacency.get(before) ?? new Set<string>();
    outgoing.add(after);
    adjacency.set(before, outgoing);
  };
  for (const edge of edges) connect(text(edge.fromNodeId), text(edge.toNodeId));
  for (const node of nodes) for (const required of strings(node.requiresNodeIds)) connect(required, text(node.intentNodeId));
  const pending = [from];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    if (current === to && current !== from) return true;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}
function requireCapabilityGroups(diagnostics: string[], capabilities: Set<string>, groups: string[][], diagnostic: string): void {
  if (groups.some((group) => !group.some((capability) => capabilities.has(capability)))) diagnostics.push(diagnostic);
}
function requireCapabilityClaim(diagnostics: string[], nodes: JsonRecord[], capability: string, claims: string[], diagnostic: string): void {
  if (!nodes.some(({ candidateCapabilityIds, targetClaimIds }) => strings(candidateCapabilityIds).includes(capability)
    && claims.every((claim) => strings(targetClaimIds).includes(claim)))) diagnostics.push(diagnostic);
}
function requireStageThreeDisposition(diagnostics: string[], bound: JsonRecord, factIds: Set<string>, baseline: boolean): void {
  if (!baseline) {
    if (bound.stageDisposition !== 'UNVERIFIABLE') diagnostics.push('DEV03_STAGE3_DISPOSITION');
    return;
  }
  if (bound.stageDisposition === 'READY_FOR_COMPILATION') return;
  if (bound.stageDisposition !== 'CAPABILITY_GAP') {
    diagnostics.push('DEV03_STAGE3_DISPOSITION');
    return;
  }
  const gaps = records(bound.unresolvedRequirements).filter(({ kind, disposition }) => kind === 'CAPABILITY' && disposition === 'CAPABILITY_GAP');
  if (!gaps.length || gaps.some(({ factIds: refs, failureDisposition }) =>
    failureDisposition !== 'STOP_BEFORE_COMPILATION_OR_RENDER'
    || !strings(refs).length
    || strings(refs).some((id) => !factIds.has(id) || !id.startsWith('fact-support-')))) {
    diagnostics.push('DEV03_STAGE3_CAPABILITY_GAP_UNBOUND');
  }
}
function requireValue(diagnostics: string[], actual: unknown, expected: unknown, diagnostic: string): void { if (actual !== expected) diagnostics.push(diagnostic); }
function requireSet(diagnostics: string[], actual: string[], expected: Set<string>, diagnostic: string): void { const received = new Set(actual); if (received.size !== expected.size || [...expected].some((value) => !received.has(value))) diagnostics.push(diagnostic); }
function equalJson(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function record(value: unknown): JsonRecord { return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
