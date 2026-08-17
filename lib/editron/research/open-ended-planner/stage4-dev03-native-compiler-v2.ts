import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { Dev03MeasuredEvidenceReceiptV2 } from './dev03-measured-evidence-v2';
import { executeDev03BeatAlignmentV2, executeDev03FinalShakeV2, getCanonicalDev03NativeProxyFixtureV2 } from './dev03-native-proxy-fixture-v2';

type JsonRecord = Record<string, unknown>;

export interface Dev03Stage4CompilerInputV2 {
  measuredEvidence: Readonly<Dev03MeasuredEvidenceReceiptV2>;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
}

const catalog = operatorCatalogJson as unknown as JsonRecord;
const operators = new Map(records(catalog.operators).map((operator) => [text(operator.operatorId), operator]));
const fixture = getCanonicalDev03NativeProxyFixtureV2();

export function compileDev03Stage4NativeV2(input: Dev03Stage4CompilerInputV2): Readonly<JsonRecord> {
  const intent = record(input.editorialIntent);
  const bound = record(input.evidenceBoundIntent);
  const pack = record(input.evidencePack);
  const roles = resolveDev03IntentRolesV2({ intent, bound, pack, measuredEvidence: input.measuredEvidence });
  const facts = records(pack.facts);
  const factById = new Map(facts.map((fact) => [text(fact.factId), fact]));
  const revision = record(bound.revisionBinding);
  const projectId = requiredText(revision.projectId, 'PROJECT_ID');
  const initialRevision = requiredText(revision.expectedProjectRevision, 'PROJECT_REVISION');
  const timelineFact = requiredFact(factById, 'fact-timeline-boundaries');
  const handleFact = requiredFact(factById, 'fact-source-handles');
  const beatFact = requiredFact(factById, 'fact-measured-beats');
  const protectedFact = requiredFact(factById, 'fact-protected-audio');
  const timebaseFact = requiredFact(factById, 'fact-project-timebase');
  const revisionFact = requiredFact(factById, 'fact-project-revision');
  const rightsFact = requiredFact(factById, 'fact-rights-policy');
  const privacyFact = requiredFact(factById, 'fact-privacy-egress-policy');
  const policyFactIds = [text(rightsFact.factId), text(privacyFact.factId)];
  const projectRange = { startFrame: 0, endFrame: fixture.project.durationInFrames };
  const strongPeakFrames = numbers(beatFact.strongPeakFrames, 'STRONG_PEAK_FRAMES');
  const protectedRange = numberPair(protectedFact.range, 'PROTECTED_AUDIO_RANGE');
  const aligned = executeDev03BeatAlignmentV2(strongPeakFrames);
  const alignment = aligned.result;
  const finalHitFrame = safeInteger(beatFact.finalStrongPeakFrame, 'FINAL_HIT_FRAME');
  const shakePlan = executeDev03FinalShakeV2(aligned.project, finalHitFrame).plan;
  if (shakePlan.status !== 'changed' || shakePlan.updates.length !== 1) throw new Error('STAGE4_DEV03_SHAKE_OWNER_REJECTED_FIXTURE');
  const shake = shakePlan.updates[0];
  const syncRevision = '@compile-sync.receipt.revision';
  const shakeRevision = '@compile-shake.receipt.revision';
  const boundNodes = new Map(records(bound.nodes).map((node) => [text(node.intentNodeId), node]));
  const makeNode = (nodeInput: NodeInput): JsonRecord => compiledNode({ ...nodeInput, projectId, revisionFactId: text(revisionFact.factId), policyFactIds, boundIntent: requiredBoundNode(boundNodes, nodeInput.intentNodeId) });
  const coordinateBindings = [{ coordinateDomain: 'PROJECT_TICK', timebaseFactIds: [text(timebaseFact.factId)], rangeFactIds: ['fact-timeline-boundaries'], assetFactIds: ['fact-timeline-boundaries'] }];
  const nodes = [
    makeNode({ nodeId: 'compile-read-project', intentNodeId: roles.readProjectIntentNodeId, operatorId: 'read_project_file', expectedProjectRevision: initialRevision, inputs: { projectId, expectedProjectRevision: initialRevision, selector: { fields: ['overlays', 'durationInFrames', 'fps'] } }, reads: ['fact-project-revision', 'fact-project-timebase', 'fact-timeline-boundaries'], requires: [], coordinateBindings }),
    makeNode({ nodeId: 'compile-read-timeline', intentNodeId: roles.readTimelineIntentNodeId, operatorId: 'get_timeline_view', expectedProjectRevision: initialRevision, inputs: { projectId, expectedProjectRevision: initialRevision, targetRange: projectRange }, reads: ['fact-project-revision', 'fact-project-timebase', 'fact-timeline-boundaries'], requires: ['compile-read-project.result'], coordinateBindings }),
    makeNode({ nodeId: 'compile-find-impacts', intentNodeId: roles.audioIntentNodeId, operatorId: 'find_audio_moment', expectedProjectRevision: initialRevision, inputs: { projectId, query: 'strongest measured musical impacts', assetIds: ['dev03-beats'], targetRange: projectRange }, reads: ['fact-measured-beats', 'fact-protected-audio'], requires: ['compile-read-timeline.result'], coordinateBindings }),
    makeNode({ nodeId: 'compile-sync', intentNodeId: roles.syncIntentNodeId, operatorId: 'sync_cuts_to_beats', expectedProjectRevision: initialRevision, inputs: { projectId, expectedProjectRevision: initialRevision, overlayIds: strings(timelineFact.overlayIds), audioPlan: { assetId: 'dev03-beats', measuredEvidenceReceiptHash: text(beatFact.receiptHash), strongPeakFrames, finalStrongPeakFrame: finalHitFrame }, evidenceIds: ['EV-DEV03-B1', 'EV-DEV03-D1', 'EV-DEV03-T1'], constraints: { maxSnapFrames: 12, minClipFrames: 30, maxConsecutiveBeatCuts: 4, protectedAudioRange: protectedRange, requireSourceHandles: true, sourceDurationFramesByAssetId: numberRecord(handleFact.sourceDurationFramesByAssetId), expectedBoundaryMoves: alignment.changes } }, reads: ['fact-project-revision', 'fact-project-timebase', 'fact-timeline-boundaries', 'fact-source-handles', 'fact-measured-beats', 'fact-protected-audio'], requires: ['compile-find-impacts.result'], coordinateBindings, writes: [`project:${projectId}.overlays.visual-primary.timing-and-source-start`], invalidates: ['TIMELINE_PROJECTION_PROOF', 'RENDERED_BOUNDARY_TIMING_PROOF', 'STATE_RELOAD_PROOF'] }),
    makeNode({ nodeId: 'compile-shake', intentNodeId: roles.shakeIntentNodeId, operatorId: 'apply_camera_shake', expectedProjectRevision: syncRevision, inputs: { projectId, expectedProjectRevision: syncRevision, overlayId: String(shake.overlayId), targetRange: { startFrame: finalHitFrame, endFrame: finalHitFrame + shake.durationFrames + 2 }, effectPlan: { resolutionOwnerRef: 'lib/editron/agent/chat-visual-tools.ts#applyCameraShakeToProject', intent: 'RESTRAINED_FINAL_HIT', targetFrame: finalHitFrame, localFrame: shake.localFrame, intensity: shake.intensity, durationFrames: shake.durationFrames, maxOffset: shake.maxOffset, replacePositionKeyframes: false, requireNeutralReturn: true } }, reads: ['fact-project-revision', 'fact-project-timebase', 'fact-timeline-boundaries', 'fact-measured-beats'], requires: ['compile-sync.receipt'], coordinateBindings, writes: [`project:${projectId}.overlays.dev03-card-4.keyframeTracks.x-y`], invalidates: ['RENDERED_SHAKE_PROOF', 'STATE_RELOAD_PROOF'] }),
    makeNode({ nodeId: 'compile-proof-read', intentNodeId: roles.proofIntentNodeId, operatorId: 'read_project_file', expectedProjectRevision: shakeRevision, inputs: { projectId, expectedProjectRevision: shakeRevision, selector: { fields: ['overlays', 'durationInFrames', 'fps'] } }, reads: ['fact-project-revision', 'fact-project-timebase', 'fact-timeline-boundaries', 'fact-protected-audio'], requires: ['compile-shake.receipt'], coordinateBindings }),
    makeNode({ nodeId: 'compile-proof-timeline', intentNodeId: roles.proofIntentNodeId, operatorId: 'get_timeline_view', expectedProjectRevision: shakeRevision, inputs: { projectId, expectedProjectRevision: shakeRevision, targetRange: projectRange }, reads: ['fact-project-revision', 'fact-project-timebase', 'fact-timeline-boundaries', 'fact-protected-audio'], requires: ['compile-proof-read.result'], coordinateBindings }),
  ];
  const edge = (edgeId: string, fromNodeId: string, toNodeId: string, edgeType: string) => ({ edgeId, fromNodeId, toNodeId, edgeType });
  const edges = [edge('edge-read-timeline', 'compile-read-project', 'compile-read-timeline', 'DATA'), edge('edge-timeline-impacts', 'compile-read-timeline', 'compile-find-impacts', 'DATA'), edge('edge-impacts-sync', 'compile-find-impacts', 'compile-sync', 'DATA'), edge('edge-sync-shake', 'compile-sync', 'compile-shake', 'READ_AFTER_WRITE'), edge('edge-shake-proof-read', 'compile-shake', 'compile-proof-read', 'PROOF'), edge('edge-proof-read-timeline', 'compile-proof-read', 'compile-proof-timeline', 'PROOF')];
  return deepFreezeV1({
    artifactType: 'CompiledOperationGraphV2', taskId: 'DEV-03', compileDisposition: 'COMPILED_RESEARCH_PROXY', executionEligibility: 'RESEARCH_PROXY_ONLY',
    sourceEditorialIntentHash: hashCanonicalJsonV1(intent), sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(bound), evidencePackHash: hashCanonicalJsonV1(pack),
    measuredEvidenceReceiptHash: hashCanonicalJsonV1(input.measuredEvidence), operatorCatalogVersion: requiredText(catalog.version, 'CATALOG_VERSION'), projectId, expectedProjectRevision: initialRevision,
    nodes, edges, ownerResolution: { beatAlignment: 'lib/pipeline/scene-to-editron.ts#alignCutsToBeatsWithEvidence', cameraShake: 'lib/editron/agent/chat-visual-tools.ts#applyCameraShakeToProject' },
    proofPolicy: { proofVersion: 'OE_DEV03_STAGE4_PROOF_POLICY_V1', mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION', proofObligationIds: records(bound.proofPlan).map((proof) => text(proof.proofObligationId)), preservationIds: records(bound.preservationBindings).map((entry) => text(entry.preservationId)), onUnverifiable: 'BLOCK_EXECUTION' },
    diagnostics: [], unresolvedIntentNodeIds: [],
  });
}

interface Dev03IntentRolesV2 {
  readProjectIntentNodeId: string;
  readTimelineIntentNodeId: string;
  audioIntentNodeId: string;
  syncIntentNodeId: string;
  shakeIntentNodeId: string;
  proofIntentNodeId: string;
}

interface Dev03Stage2RoleResolutionV2 extends Dev03IntentRolesV2 {
  nodes: JsonRecord[];
  ids: string[];
  diagnostics: string[];
}

export function evaluateDev03Stage2RoleCompilabilityV2(editorialIntent: unknown): readonly string[] {
  return deepFreezeV1([...resolveDev03Stage2RolesV2(record(editorialIntent)).diagnostics]);
}

function resolveDev03IntentRolesV2(input: {
  intent: JsonRecord;
  bound: JsonRecord;
  pack: JsonRecord;
  measuredEvidence: Readonly<Dev03MeasuredEvidenceReceiptV2>;
}): Dev03IntentRolesV2 {
  const stage2 = resolveDev03Stage2RolesV2(input.intent);
  const diagnostics = [...stage2.diagnostics];
  if (input.bound.artifactType !== 'EvidenceBoundIntentGraphV2' || input.bound.taskId !== 'DEV-03'
    || input.bound.stageDisposition !== 'READY_FOR_COMPILATION') diagnostics.push('BOUND_HEADER');
  const { nodes, ids } = stage2;
  const boundNodes = records(input.bound.nodes);
  const boundIds = boundNodes.map(({ intentNodeId }) => text(intentNodeId));
  if (!sameSet(ids, boundIds)) diagnostics.push('BOUND_NODE_SET');
  const intentById = new Map(nodes.map((node) => [text(node.intentNodeId), node]));
  for (const node of boundNodes) {
    const intentNode = intentById.get(text(node.intentNodeId));
    if (!intentNode || !sameSet(strings(node.candidateCapabilityIds), strings(intentNode.candidateCapabilityIds))
      || node.bindingStatus !== 'BOUND' || strings(node.unresolvedRequirementIds).length) {
      diagnostics.push(`BOUND_NODE_DRIFT:${text(node.intentNodeId)}`);
    }
  }
  if (records(input.bound.unresolvedRequirements).length) diagnostics.push('BOUND_UNRESOLVED_REQUIREMENTS');
  requireBoundIds(diagnostics, records(input.pack.preservationRequirements), records(input.bound.preservationBindings), 'preservationId', 'BOUND', 'PRESERVATION');
  requireBoundIds(diagnostics, records(input.pack.proofRequirements), records(input.bound.proofPlan), 'proofObligationId', 'PLANNED', 'PROOF');
  const beatFact = records(input.pack.facts).find(({ factId }) => factId === 'fact-measured-beats');
  if (!beatFact || beatFact.receiptHash !== hashCanonicalJsonV1(input.measuredEvidence)) diagnostics.push('MEASURED_BEAT_BINDING');
  if (diagnostics.length) fail(`STAGE4_DEV03_SOURCE_NOT_COMPILABLE:${unique(diagnostics).sort().join(',')}`);
  return {
    readProjectIntentNodeId: stage2.readProjectIntentNodeId,
    readTimelineIntentNodeId: stage2.readTimelineIntentNodeId,
    audioIntentNodeId: stage2.audioIntentNodeId,
    syncIntentNodeId: stage2.syncIntentNodeId,
    shakeIntentNodeId: stage2.shakeIntentNodeId,
    proofIntentNodeId: stage2.proofIntentNodeId,
  };
}

function resolveDev03Stage2RolesV2(intent: JsonRecord): Dev03Stage2RoleResolutionV2 {
  const diagnostics: string[] = [];
  if (intent.artifactType !== 'EditorialIntentGraphV2' || intent.taskId !== 'DEV-03'
    || intent.executionForm !== 'NATIVE') diagnostics.push('INTENT_HEADER');
  const nodes = records(intent.nodes);
  const ids = nodes.map(({ intentNodeId }) => text(intentNodeId));
  if (!ids.length || new Set(ids).size !== ids.length) diagnostics.push('INTENT_NODE_SET');
  const forbiddenCapabilities = new Set([
    'generated_composition_program', 'add_sfx', 'apply_speed_ramp', 'add_transition',
    'cut_section', 'apply_audio_ducking',
  ]);
  for (const capabilityId of nodes.flatMap(({ candidateCapabilityIds }) => strings(candidateCapabilityIds))) {
    if (forbiddenCapabilities.has(capabilityId)) diagnostics.push(`CAPABILITY_FORBIDDEN:${capabilityId}`);
  }
  const byCapability = (capabilityId: string) => nodes.filter((node) => strings(node.candidateCapabilityIds).includes(capabilityId));
  const syncNodes = byCapability('sync_cuts_to_beats');
  const shakeNodes = byCapability('apply_camera_shake');
  if (syncNodes.length !== 1) diagnostics.push(`SYNC_ROLE_COUNT:${syncNodes.length}`);
  if (shakeNodes.length !== 1) diagnostics.push(`SHAKE_ROLE_COUNT:${shakeNodes.length}`);
  const syncId = text(syncNodes[0]?.intentNodeId);
  const shakeId = text(shakeNodes[0]?.intentNodeId);
  const dependencies = new Map(nodes.map((node) => [text(node.intentNodeId), new Set(strings(node.requiresNodeIds))]));
  for (const node of nodes) for (const dependencyId of strings(node.requiresNodeIds)) {
    if (!ids.includes(dependencyId)) diagnostics.push(`DEPENDENCY_UNKNOWN:${text(node.intentNodeId)}/${dependencyId}`);
  }
  const beforeSync = nodes.filter((node) => syncId
    && text(node.intentNodeId) !== syncId
    && dependsOn(syncId, text(node.intentNodeId), dependencies));
  const audioNodes = beforeSync.filter((node) => strings(node.candidateCapabilityIds)
    .some((capabilityId) => ['find_audio_moment', 'resolve_audio_edit'].includes(capabilityId)));
  if (audioNodes.length !== 1) diagnostics.push(`AUDIO_ROLE_COUNT:${audioNodes.length}`);
  const audioId = text(audioNodes[0]?.intentNodeId);
  if (syncId && shakeId && !dependsOn(shakeId, syncId, dependencies)) diagnostics.push('SYNC_BEFORE_SHAKE');

  const readSupportNodes = beforeSync.filter((node) => {
    const capabilities = strings(node.candidateCapabilityIds);
    return capabilities.includes('read_project_file') && capabilities.includes('get_timeline_view')
      && !capabilities.some((capabilityId) => ['find_audio_moment', 'resolve_audio_edit'].includes(capabilityId));
  });
  const initialReads = boundaryNodes(readSupportNodes, dependencies, 'EARLIEST');
  const timelineReads = boundaryNodes(readSupportNodes, dependencies, 'LATEST');
  if (initialReads.length !== 1) diagnostics.push(`READ_PROJECT_ROLE_COUNT:${initialReads.length}`);
  if (timelineReads.length !== 1) diagnostics.push(`READ_TIMELINE_ROLE_COUNT:${timelineReads.length}`);
  const downstreamProofReads = nodes.filter((node) => {
    const capabilities = strings(node.candidateCapabilityIds);
    return shakeId && capabilities.includes('read_project_file') && capabilities.includes('get_timeline_view')
      && dependsOn(text(node.intentNodeId), shakeId, dependencies);
  });
  const proofReads = boundaryNodes(downstreamProofReads, dependencies, 'LATEST');
  const shakeCanProve = Boolean(shakeNodes[0]
    && strings(shakeNodes[0].candidateCapabilityIds).includes('read_project_file')
    && strings(shakeNodes[0].candidateCapabilityIds).includes('get_timeline_view'));
  if (proofReads.length !== 1 && !(proofReads.length === 0 && shakeCanProve)) {
    diagnostics.push(`PROOF_READ_ROLE_COUNT:${proofReads.length}`);
  }
  const initialId = text(initialReads[0]?.intentNodeId);
  const timelineId = text(timelineReads[0]?.intentNodeId);
  const proofId = text(proofReads[0]?.intentNodeId) || (shakeCanProve ? shakeId : '');
  return {
    readProjectIntentNodeId: initialId,
    readTimelineIntentNodeId: timelineId,
    audioIntentNodeId: audioId,
    syncIntentNodeId: syncId,
    shakeIntentNodeId: shakeId,
    proofIntentNodeId: proofId,
    nodes,
    ids,
    diagnostics,
  };
}

function boundaryNodes(
  nodes: JsonRecord[], dependencies: Map<string, Set<string>>, boundary: 'EARLIEST' | 'LATEST',
): JsonRecord[] {
  return nodes.filter((node) => !nodes.some((other) => other !== node && (boundary === 'EARLIEST'
    ? dependsOn(text(node.intentNodeId), text(other.intentNodeId), dependencies)
    : dependsOn(text(other.intentNodeId), text(node.intentNodeId), dependencies))));
}

function dependsOn(nodeId: string, requiredNodeId: string, dependencies: Map<string, Set<string>>): boolean {
  const pending = [...(dependencies.get(nodeId) ?? [])];
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.pop() as string;
    if (current === requiredNodeId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(dependencies.get(current) ?? []));
  }
  return false;
}

function requireBoundIds(
  diagnostics: string[], expected: JsonRecord[], actual: JsonRecord[], idField: string,
  status: string, prefix: string,
): void {
  for (const requirement of expected) {
    const id = text(requirement[idField]);
    const binding = actual.find((entry) => entry[idField] === id);
    if (!binding || binding.status !== status) diagnostics.push(`${prefix}:${id}`);
  }
}

interface NodeInput { nodeId: string; intentNodeId: string; operatorId: string; expectedProjectRevision: string; inputs: JsonRecord; reads: string[]; requires: string[]; coordinateBindings: JsonRecord[]; writes?: string[]; invalidates?: string[]; }
function compiledNode(input: NodeInput & { projectId: string; revisionFactId: string; policyFactIds: string[]; boundIntent: JsonRecord }): JsonRecord {
  const operator = operators.get(input.operatorId) ?? fail(`STAGE4_DEV03_OPERATOR_MISSING:${input.operatorId}`);
  if (!strings(input.boundIntent.candidateCapabilityIds).includes(input.operatorId)) {
    fail(`STAGE4_DEV03_OPERATOR_NOT_SELECTED:${input.intentNodeId}/${input.operatorId}`);
  }
  if (!['RESEARCH_READ_ONLY', 'ISOLATED_PROXY_ONLY'].includes(text(operator.compilerEligibility))) fail(`STAGE4_DEV03_OPERATOR_FORBIDDEN:${input.operatorId}`);
  const mutating = operator.kind === 'MUTATION'; const writes = unique(input.writes ?? []); const invalidates = unique(input.invalidates ?? []);
  if (mutating !== Boolean(writes.length && invalidates.length)) fail(`STAGE4_DEV03_EFFECT_CONTRACT_INVALID:${input.nodeId}`);
  const produces = strings(record(operator.output).required).map((field) => `${input.nodeId}.${field}`);
  return { nodeId: input.nodeId, intentNodeId: input.intentNodeId, operatorId: input.operatorId, operatorSpecRef: `EDITRON_OPERATOR_SPECS_V2@${catalog.version}#${input.operatorId}`, ownerRef: text(operator.ownerRef), inputs: input.inputs, reads: unique(input.reads), writes, requires: unique(input.requires), produces, invalidates, coordinateBindings: input.coordinateBindings, revisionBinding: { projectId: input.projectId, expectedProjectRevision: input.expectedProjectRevision }, stabilityRequirement: 'RANGE_STABLE', stateEffects: strings(operator.stateEffects), idempotency: { scope: 'PROJECT_REVISION', keyMaterialRefs: unique([input.intentNodeId, input.expectedProjectRevision, input.revisionFactId, ...input.reads, ...input.requires]) }, proofObligationIds: strings(input.boundIntent.proofObligationIds), failureDisposition: 'ABORT_GRAPH', retryDisposition: mutating ? 'REBASE_REQUIRED' : 'TRANSIENT_SAME_COMMAND', policyFactIds: input.policyFactIds, concurrency: mutating ? { class: 'MUTATION_EXCLUSIVE', conflictDomainRefs: writes } : { class: operator.kind === 'READ' ? 'READ_SHARED' : 'RESOLVER_ISOLATED', conflictDomainRefs: [] }, resourcePolicyId: mutating ? 'OE_STAGE4_MUTATION_PROXY_V1' : operator.kind === 'READ' ? 'OE_STAGE4_READ_V1' : 'OE_STAGE4_RESOLVER_V1', reversibility: mutating ? { disposition: 'CHECKPOINT_REQUIRED', undoBindingRefs: [`${input.nodeId}.receipt`] } : { disposition: 'NOT_APPLICABLE_READ_ONLY', undoBindingRefs: [] }, traceRefs: unique([input.intentNodeId, ...strings(input.boundIntent.evidenceBindingIds), ...strings(input.boundIntent.proofObligationIds), ...strings(input.boundIntent.preservationIds)]) };
}
function requiredBoundNode(nodes: Map<string, JsonRecord>, id: string): JsonRecord { return nodes.get(id) ?? fail(`STAGE4_DEV03_BOUND_NODE_MISSING:${id}`); }
function requiredFact(facts: Map<string, JsonRecord>, id: string): JsonRecord { return facts.get(id) ?? fail(`STAGE4_DEV03_FACT_MISSING:${id}`); }
function requiredText(value: unknown, label: string): string { return text(value) || fail(`STAGE4_DEV03_${label}_MISSING`); }
function safeInteger(value: unknown, label: string): number { return Number.isSafeInteger(Number(value)) ? Number(value) : fail(`STAGE4_DEV03_${label}_INVALID`); }
function numberPair(value: unknown, label: string): [number, number] { const values = numbers(value, label); return values.length === 2 && values[1] > values[0] ? [values[0], values[1]] : fail(`STAGE4_DEV03_${label}_INVALID`); }
function numbers(value: unknown, label: string): number[] { return Array.isArray(value) && value.every((entry) => Number.isSafeInteger(Number(entry))) ? value.map(Number) : fail(`STAGE4_DEV03_${label}_INVALID`); }
function numberRecord(value: unknown): Record<string, number> { const source = record(value); const result: Record<string, number> = {}; for (const [key, entry] of Object.entries(source)) result[key] = safeInteger(entry, `SOURCE_DURATION_${key}`); return result; }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function sameSet(left: string[], right: string[]): boolean { return new Set(left).size === left.length && new Set(right).size === right.length && left.length === right.length && left.every((value) => right.includes(value)); }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function fail(message: string): never { throw new Error(message); }
