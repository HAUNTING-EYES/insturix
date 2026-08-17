type JsonRecord = Record<string, unknown>;
type Dev01ConditionV2 = 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD';

export interface Dev01Stage123EvaluationV2 {
  assessment: 'PASS' | 'FAIL';
  expectedStageDisposition: 'READY_FOR_COMPILATION' | 'UNVERIFIABLE';
  diagnostics: string[];
}

const REQUIRED_CLAIMS = new Set([
  'claim-remove-dead-air',
  'claim-preserve-speech',
  'claim-product-push-in',
  'claim-dialogue-ducking',
]);
const PRODUCT_RESOLVERS = ['resolve_keyframe_edit', 'resolve_visual_edit'];
const AUDIO_RESOLVERS = ['find_audio_moment', 'resolve_audio_edit'];

export function evaluateDev01StagesOneToThreeV2(input: {
  conditionId: Dev01ConditionV2;
  referenceBlueprint: unknown;
  editorialIntent: unknown;
  evidencePack: unknown;
  evidenceBoundIntent: unknown;
}): Readonly<Dev01Stage123EvaluationV2> {
  const diagnostics: string[] = [];
  const blueprint = record(input.referenceBlueprint);
  const intent = record(input.editorialIntent);
  const pack = record(input.evidencePack);
  const bound = record(input.evidenceBoundIntent);
  const visualRequired = input.conditionId === 'BASELINE';
  const expectedEvidence = visualRequired
    ? ['EV-DEV01-T1', 'EV-DEV01-V1', 'EV-DEV01-A1']
    : ['EV-DEV01-T1', 'EV-DEV01-A1'];

  requireValue(diagnostics, blueprint.artifactType, 'ReferenceBlueprintV2', 'DEV01_STAGE1_ARTIFACT_TYPE');
  requireValue(diagnostics, blueprint.taskId, 'DEV-01', 'DEV01_STAGE1_TASK');
  requireSet(diagnostics, records(blueprint.targetClaims).map(({ claimId }) => String(claimId)), REQUIRED_CLAIMS, 'DEV01_STAGE1_TARGET_CLAIMS');
  requireSet(diagnostics, strings(blueprint.evidenceIds), new Set(expectedEvidence), 'DEV01_STAGE1_EVIDENCE_SCOPE');
  const blueprintText = JSON.stringify(blueprint);
  if (['cut_section', 'set_keyframes', 'apply_audio_ducking'].some((operator) => blueprintText.includes(operator))) {
    diagnostics.push('DEV01_STAGE1_OPERATOR_LEAK');
  }
  const visualClaim = records(blueprint.targetClaims).find(({ claimId }) => claimId === 'claim-product-push-in');
  if (visualRequired && (visualClaim?.ambiguity !== 'RESOLVED' || !strings(visualClaim.evidenceIds).includes('EV-DEV01-V1'))) {
    diagnostics.push('DEV01_STAGE1_VISUAL_TARGET_NOT_BOUND');
  }
  if (!visualRequired && visualClaim?.ambiguity !== 'ASK_USER') diagnostics.push('DEV01_STAGE1_WITHHELD_VISUAL_NOT_UNCERTAIN');

  requireValue(diagnostics, intent.artifactType, 'EditorialIntentGraphV2', 'DEV01_STAGE2_ARTIFACT_TYPE');
  requireValue(diagnostics, intent.taskId, 'DEV-01', 'DEV01_STAGE2_TASK');
  requireValue(diagnostics, intent.executionForm, 'NATIVE', 'DEV01_STAGE2_ROUTE_NOT_NATIVE');
  const intentNodes = records(intent.nodes);
  const capabilities = new Set(intentNodes.flatMap(({ candidateCapabilityIds }) => strings(candidateCapabilityIds)));
  const routeDecision = record(intent.routeDecision);
  if (capabilities.has('generated_composition_program')
    || strings(routeDecision.generatedIslandClaimIds).length
    || intentNodes.some(({ executionForm }) => executionForm === 'GENERATED_COMPOSITION')) {
    diagnostics.push('DEV01_STAGE2_GENERATED_SUBSTITUTION');
  }
  requireCapabilityGroups(diagnostics, capabilities, [
    ['resolve_transcript_edit'], ['cut_section'], PRODUCT_RESOLVERS, ['set_keyframes'],
    AUDIO_RESOLVERS, ['apply_audio_ducking'],
  ], 'DEV01_STAGE2_CAPABILITY_COVERAGE');
  requireCapabilityClaim(diagnostics, intentNodes, 'cut_section', ['claim-remove-dead-air', 'claim-preserve-speech'], 'DEV01_STAGE2_CUT_CLAIM_COVERAGE');
  requireCapabilityClaim(diagnostics, intentNodes, 'set_keyframes', ['claim-product-push-in'], 'DEV01_STAGE2_PUSH_CLAIM_COVERAGE');
  requireCapabilityClaim(diagnostics, intentNodes, 'apply_audio_ducking', ['claim-dialogue-ducking'], 'DEV01_STAGE2_DUCK_CLAIM_COVERAGE');
  requireValue(diagnostics, routeDecision.scopeClassification, 'NATIVE_ONLY_PLAN', 'DEV01_STAGE2_SCOPE');
  requireValue(diagnostics, routeDecision.coverageStatus, 'COMPLETE', 'DEV01_STAGE2_COVERAGE');
  const edges = records(intent.edges);
  requireDependency(diagnostics, intentNodes, edges, ['resolve_transcript_edit'], ['cut_section'], 'DEV01_ORDER_RESOLVE_BEFORE_CUT');
  requireDependency(diagnostics, intentNodes, edges, ['cut_section'], PRODUCT_RESOLVERS, 'DEV01_ORDER_CUT_BEFORE_POSTCUT_TARGET');
  requireDependency(diagnostics, intentNodes, edges, PRODUCT_RESOLVERS, ['set_keyframes'], 'DEV01_ORDER_TARGET_BEFORE_PUSH');
  requireDependency(diagnostics, intentNodes, edges, ['cut_section'], ['apply_audio_ducking'], 'DEV01_ORDER_CUT_BEFORE_DUCK');
  if (!records(intent.preservationIntents).some(({ claimId, rule, proofKind }) =>
    claimId === 'claim-preserve-speech'
    && /spoken|speech|word/i.test(`${String(rule)} ${String(proofKind)}`))) {
    diagnostics.push('DEV01_STAGE2_PRESERVATION_MISSING:spoken-content');
  }

  requireValue(diagnostics, pack.taskId, 'DEV-01', 'DEV01_STAGE3_PACK_TASK');
  requireValue(diagnostics, pack.conditionId, input.conditionId, 'DEV01_STAGE3_PACK_CONDITION');
  requireSet(diagnostics, strings(pack.visibleEvidenceIds), new Set(expectedEvidence), 'DEV01_STAGE3_VISIBLE_EVIDENCE');
  const facts = records(pack.facts);
  const factIds = new Set(facts.map(({ factId }) => String(factId)));
  for (const required of ['fact-project-revision', 'fact-project-timebase', 'fact-source-fixture', 'fact-transcript-cut', 'fact-audio-stems']) {
    if (!factIds.has(required)) diagnostics.push(`DEV01_STAGE3_FACT_MISSING:${required}`);
  }
  if (visualRequired !== factIds.has('fact-product-reveal')) diagnostics.push('DEV01_STAGE3_VISUAL_FACT_CONDITION_DRIFT');
  const audioFact = facts.find(({ factId }) => factId === 'fact-audio-stems');
  if (!audioFact || audioFact.dialogueAssetId === audioFact.bgmAssetId) diagnostics.push('DEV01_STAGE3_AUDIO_STEMS_NOT_SEPARATE');
  const revision = record(bound.revisionBinding);
  if (revision.projectId !== 'oe-dev-01' || revision.expectedProjectRevision !== 'R7' || revision.status !== 'BOUND') {
    diagnostics.push('DEV01_STAGE3_REVISION_NOT_BOUND');
  }
  requireValue(diagnostics, bound.artifactType, 'EvidenceBoundIntentGraphV2', 'DEV01_STAGE3_ARTIFACT_TYPE');
  requireValue(diagnostics, bound.taskId, 'DEV-01', 'DEV01_STAGE3_TASK');
  const expectedDisposition = visualRequired ? 'READY_FOR_COMPILATION' : 'UNVERIFIABLE';
  requireStageThreeDisposition(diagnostics, bound, factIds, visualRequired, 'DEV01_STAGE3');
  const boundNodes = records(bound.nodes);
  const productNodes = boundNodes.filter(({ candidateCapabilityIds }) => strings(candidateCapabilityIds).some((id) => id === 'resolve_keyframe_edit' || id === 'set_keyframes'));
  if (visualRequired && productNodes.some(({ bindingStatus }) => bindingStatus !== 'BOUND')) diagnostics.push('DEV01_STAGE3_PRODUCT_NOT_BOUND');
  if (!visualRequired && productNodes.some(({ bindingStatus }) => bindingStatus !== 'UNVERIFIABLE')) diagnostics.push('DEV01_STAGE3_WITHHELD_PRODUCT_FALSE_BOUND');
  const proofKinds = new Set(records(bound.proofPlan).map(({ kind }) => String(kind)));
  for (const required of ['SPEECH_PRESERVATION', 'RENDERED_AUDIO_MIX', 'RENDERED_GEOMETRY', 'STATE_RELOAD']) {
    if (!proofKinds.has(required)) diagnostics.push(`DEV01_STAGE3_PROOF_MISSING:${required}`);
  }
  if (!visualRequired && !records(bound.unresolvedRequirements).some(({ requirementId, disposition }) =>
    requirementId === 'req-product-visual-evidence' && disposition === 'UNVERIFIABLE')) {
    diagnostics.push('DEV01_STAGE3_WITHHELD_REQUIREMENT_MISSING');
  }

  return Object.freeze({
    assessment: diagnostics.length ? 'FAIL' : 'PASS',
    expectedStageDisposition: expectedDisposition,
    diagnostics,
  });
}

function requireDependency(
  diagnostics: string[],
  nodes: JsonRecord[],
  edges: JsonRecord[],
  beforeCapabilities: string[],
  afterCapabilities: string[],
  diagnostic: string,
): void {
  const beforeIds = nodes.filter(({ candidateCapabilityIds }) =>
    strings(candidateCapabilityIds).some((id) => beforeCapabilities.includes(id))).map(({ intentNodeId }) => String(intentNodeId));
  const afterIds = nodes.filter(({ candidateCapabilityIds }) =>
    strings(candidateCapabilityIds).some((id) => afterCapabilities.includes(id))).map(({ intentNodeId }) => String(intentNodeId));
  if (!beforeIds.some((beforeId) => afterIds.some((afterId) => hasDependencyPath(nodes, edges, beforeId, afterId)))) {
    diagnostics.push(diagnostic);
  }
}

function hasDependencyPath(nodes: JsonRecord[], edges: JsonRecord[], from: string, to: string): boolean {
  const adjacency = new Map<string, Set<string>>();
  const connect = (before: string, after: string) => {
    if (!before || !after) return;
    const outgoing = adjacency.get(before) ?? new Set<string>();
    outgoing.add(after);
    adjacency.set(before, outgoing);
  };
  for (const { fromNodeId, toNodeId } of edges) connect(String(fromNodeId), String(toNodeId));
  for (const node of nodes) for (const required of strings(node.requiresNodeIds)) {
    connect(required, String(node.intentNodeId));
  }
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

function requireCapabilityGroups(
  diagnostics: string[],
  capabilities: Set<string>,
  groups: string[][],
  diagnostic: string,
): void {
  if (groups.some((group) => !group.some((capability) => capabilities.has(capability)))) diagnostics.push(diagnostic);
}

function requireCapabilityClaim(
  diagnostics: string[],
  nodes: JsonRecord[],
  capability: string,
  claims: string[],
  diagnostic: string,
): void {
  if (!nodes.some(({ candidateCapabilityIds, targetClaimIds }) =>
    strings(candidateCapabilityIds).includes(capability)
    && claims.every((claim) => strings(targetClaimIds).includes(claim)))) diagnostics.push(diagnostic);
}

function requireStageThreeDisposition(
  diagnostics: string[],
  bound: JsonRecord,
  factIds: Set<string>,
  baseline: boolean,
  prefix: string,
): void {
  if (!baseline) {
    if (bound.stageDisposition !== 'UNVERIFIABLE') diagnostics.push(`${prefix}_DISPOSITION`);
    return;
  }
  if (bound.stageDisposition === 'READY_FOR_COMPILATION') return;
  if (bound.stageDisposition !== 'CAPABILITY_GAP') {
    diagnostics.push(`${prefix}_DISPOSITION`);
    return;
  }
  const gaps = records(bound.unresolvedRequirements).filter(({ kind, disposition }) =>
    kind === 'CAPABILITY' && disposition === 'CAPABILITY_GAP');
  if (!gaps.length || gaps.some(({ factIds: refs, failureDisposition }) =>
    failureDisposition !== 'STOP_BEFORE_COMPILATION_OR_RENDER'
    || !strings(refs).length
    || strings(refs).some((id) => !factIds.has(id) || !id.startsWith('fact-support-')))) {
    diagnostics.push(`${prefix}_CAPABILITY_GAP_UNBOUND`);
  }
}

function requireValue(diagnostics: string[], actual: unknown, expected: unknown, diagnostic: string): void {
  if (actual !== expected) diagnostics.push(diagnostic);
}

function requireSet(diagnostics: string[], actual: string[], expected: Set<string>, diagnostic: string): void {
  const received = new Set(actual);
  if (received.size !== expected.size || [...expected].some((value) => !received.has(value))) diagnostics.push(diagnostic);
}

function record(value: unknown): JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
