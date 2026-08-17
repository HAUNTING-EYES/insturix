import { deepFreezeV1 } from './contracts-v1';
import type {
  DevelopmentCohortTaskIdV2,
  DevelopmentStageEvaluationV2,
} from './development-cohort-runner-v2';

type JsonRecord = Record<string, unknown>;
type ConnectedStageV2 = 1 | 2 | 3;

export function evaluateConnectedDevelopmentStageArtifactV2(input: {
  taskId: DevelopmentCohortTaskIdV2;
  stage: ConnectedStageV2;
  artifact: unknown;
  priorArtifact?: unknown;
  evidencePack?: unknown;
}): Readonly<DevelopmentStageEvaluationV2> {
  if (input.stage === 1) {
    return deepFreezeV1({
      disposition: 'HUMAN_REVIEW_REQUIRED',
      diagnostics: [`${input.taskId}_STAGE1_SEMANTIC_RECONSTRUCTION_REQUIRES_BLIND_REVIEW`],
      dimensions: {
        schemaAndPacketBinding: 'PASS',
        semanticFidelity: 'PENDING_BLIND_REVIEW',
      },
    });
  }
  return input.stage === 2
    ? evaluateStageTwo(input.taskId, input.priorArtifact, input.artifact)
    : evaluateStageThree(input.taskId, input.priorArtifact, input.evidencePack, input.artifact);
}

function evaluateStageTwo(
  taskId: DevelopmentCohortTaskIdV2,
  sourceValue: unknown,
  artifactValue: unknown,
): Readonly<DevelopmentStageEvaluationV2> {
  const source = record(sourceValue);
  const artifact = record(artifactValue);
  if (source.artifactType !== 'ReferenceBlueprintV2' || source.taskId !== taskId) {
    return result('UNVERIFIABLE', ['CONNECTED_STAGE2_SOURCE_BLUEPRINT_INVALID']);
  }
  if (artifact.artifactType !== 'EditorialIntentGraphV2' || artifact.taskId !== taskId) {
    return result('UNVERIFIABLE', ['CONNECTED_STAGE2_ARTIFACT_INVALID']);
  }

  const diagnostics: string[] = [];
  const claims = records(source.targetClaims);
  const claimIds = claims.map(({ claimId }) => text(claimId)).filter(Boolean);
  const sourceClaimIds = new Set(claimIds);
  if (!claimIds.length || sourceClaimIds.size !== claimIds.length) {
    diagnostics.push('CONNECTED_STAGE2_SOURCE_CLAIMS_INVALID');
  }
  const nodes = records(artifact.nodes);
  const route = record(artifact.routeDecision);
  const referencedClaimIds = new Set([
    ...nodes.flatMap(({ targetClaimIds }) => strings(targetClaimIds)),
    ...records(artifact.preservationIntents).map(({ claimId }) => text(claimId)).filter(Boolean),
    ...records(artifact.unresolvedRequirements).flatMap(({ targetClaimIds }) => strings(targetClaimIds)),
    ...strings(route.generatedIslandClaimIds),
    ...strings(route.nativeSurroundClaimIds),
  ]);
  for (const claimId of referencedClaimIds) {
    if (!sourceClaimIds.has(claimId)) diagnostics.push(`CONNECTED_STAGE2_UNKNOWN_CLAIM:${claimId}`);
  }
  const graphClaims = new Set(nodes.flatMap(({ targetClaimIds }) => strings(targetClaimIds)));
  for (const claimId of sourceClaimIds) {
    if (!graphClaims.has(claimId)) diagnostics.push(`CONNECTED_STAGE2_UNCOVERED_SOURCE_CLAIM:${claimId}`);
  }
  if (taskId !== 'DEV-04') {
    const selectedCandidate = records(route.candidateForms)
      .find(({ form }) => form === artifact.executionForm);
    if (!selectedCandidate) diagnostics.push('CONNECTED_STAGE2_SELECTED_CANDIDATE_MISSING');
    const candidateCoverage = new Map(records(selectedCandidate?.claimCoverage)
      .map((entry) => [text(entry.claimId), text(entry.status)]));
    for (const claim of claims.filter(({ criticality }) => criticality === 'HARD')) {
      const claimId = text(claim.claimId);
      if (candidateCoverage.get(claimId) !== 'COVERED') {
        diagnostics.push(`CONNECTED_STAGE2_HARD_CLAIM_NOT_COVERED:${claimId}`);
      }
    }
  }

  if (taskId === 'DEV-01') evaluateDev01StageTwo(diagnostics, claims, artifact, nodes, route);
  if (taskId === 'DEV-02') evaluateDev02StageTwo(diagnostics, claims, artifact, nodes, route);
  if (taskId === 'DEV-03') evaluateDev03StageTwo(diagnostics, claims, artifact, nodes, route);
  if (taskId === 'DEV-04') evaluateDev04StageTwo(diagnostics, artifact, nodes);

  const expectedGap = taskId === 'DEV-02' || taskId === 'DEV-04';
  return result(diagnostics.length ? 'FAIL' : expectedGap ? 'EXPECTED_CAPABILITY_GAP' : 'PASS', diagnostics, {
    sourceClaimIds: [...sourceClaimIds],
    graphClaimIds: [...graphClaims],
    evaluationMode: 'SOURCE_RELATIVE_CONNECTED',
  });
}

function evaluateDev01StageTwo(
  diagnostics: string[],
  claims: JsonRecord[],
  artifact: JsonRecord,
  nodes: JsonRecord[],
  route: JsonRecord,
): void {
  requireRoute(diagnostics, artifact, route, 'NATIVE', 'NATIVE_ONLY_PLAN', 'DEV01');
  forbidCapabilities(diagnostics, nodes, ['generated_composition_program'], 'DEV01');
  requireCapabilityGroups(diagnostics, nodes, [
    ['resolve_transcript_edit'], ['cut_section'],
    ['resolve_keyframe_edit', 'resolve_visual_edit'], ['set_keyframes'],
    ['find_audio_moment', 'resolve_audio_edit'], ['apply_audio_ducking'],
  ], 'DEV01');
  const cutClaims = claims.filter((claim) => strings(claim.evidenceIds).includes('EV-DEV01-T1')
    && /dead.?air|silence|speech.?preservation|spoken.?word.?preservation/i.test(JSON.stringify(claim)))
    .map(({ claimId }) => text(claimId));
  const pushClaims = claimIdsWithEvidence(claims, 'EV-DEV01-V1');
  const duckClaims = claims.filter((claim) => strings(claim.evidenceIds).includes('EV-DEV01-A1')
    && /music|duck|gain|level.?relationship|audio.?mix/i.test(JSON.stringify(claim)))
    .map(({ claimId }) => text(claimId));
  requireCapabilitiesCover(diagnostics, nodes, ['cut_section'], cutClaims, 'DEV01_CUT');
  requireCapabilitiesCover(diagnostics, nodes, ['set_keyframes'], pushClaims, 'DEV01_PUSH');
  requireCapabilitiesCover(diagnostics, nodes, ['apply_audio_ducking'], duckClaims, 'DEV01_DUCK');
  requireDependency(diagnostics, nodes, ['resolve_transcript_edit'], ['cut_section'], 'DEV01_RESOLVE_BEFORE_CUT');
  requireDependency(diagnostics, nodes, ['cut_section'], ['resolve_keyframe_edit', 'resolve_visual_edit'], 'DEV01_CUT_BEFORE_POSTCUT_TARGET');
  requireDependency(diagnostics, nodes, ['resolve_keyframe_edit', 'resolve_visual_edit'], ['set_keyframes'], 'DEV01_TARGET_BEFORE_PUSH');
  requireDependency(diagnostics, nodes, ['cut_section'], ['apply_audio_ducking'], 'DEV01_CUT_BEFORE_DUCK');
  if (!records(artifact.preservationIntents).some((entry) =>
    /spoken|speech|dialogue|word/i.test(`${text(entry.rule)} ${text(entry.proofKind)}`))) {
    diagnostics.push('DEV01_SPEECH_PRESERVATION_MISSING');
  }
}

function evaluateDev02StageTwo(
  diagnostics: string[],
  claims: JsonRecord[],
  artifact: JsonRecord,
  nodes: JsonRecord[],
  route: JsonRecord,
): void {
  requireRoute(diagnostics, artifact, route, 'HYBRID', 'HYBRID_FULL_PLAN', 'DEV02');
  const allClaimIds = claims.map(({ claimId }) => text(claimId));
  const generatedClaims = strings(route.generatedIslandClaimIds);
  const nativeClaims = strings(route.nativeSurroundClaimIds);
  const assignedClaims = new Set([...generatedClaims, ...nativeClaims]);
  for (const claimId of allClaimIds) if (!assignedClaims.has(claimId)) {
    diagnostics.push(`DEV02_ROUTE_CLAIM_UNASSIGNED:${claimId}`);
  }
  requireCapabilitiesCover(diagnostics, nodes, ['generated_composition_program'], generatedClaims, 'DEV02_GENERATED');
  const nativeCovered = new Set(nodes.filter(({ executionForm }) => executionForm === 'NATIVE')
    .flatMap(({ targetClaimIds }) => strings(targetClaimIds)));
  for (const claimId of nativeClaims) if (!nativeCovered.has(claimId)) {
    diagnostics.push(`DEV02_NATIVE_SURROUND_CLAIM_NOT_COVERED:${claimId}`);
  }
  const continuityClaims = claims.filter((claim) => claim.relation === 'CONTINUES_INTO'
    || /continuity|handoff|release|full.?screen/i.test(text(claim.claimKind)))
    .map(({ claimId }) => text(claimId));
  requireDev02HybridRoleChain(diagnostics, nodes, continuityClaims);
  const gaps = records(artifact.unresolvedRequirements).filter(({ kind, disposition }) =>
    kind === 'CAPABILITY' && disposition === 'CAPABILITY_GAP');
  if (!gaps.some((gap) => /generated|composition|compiler|executor|sandbox|proxy/i.test(JSON.stringify(gap)))) {
    diagnostics.push('DEV02_GENERATED_CAPABILITY_GAP_NOT_DECLARED');
  }
}

function requireDev02HybridRoleChain(
  diagnostics: string[], nodes: JsonRecord[], nativeClaimIds: string[],
): void {
  const dependencies = new Map(nodes.map((node) => [
    text(node.intentNodeId), new Set(strings(node.requiresNodeIds)),
  ]));
  const generatedIds = nodes.filter(({ candidateCapabilityIds }) =>
    strings(candidateCapabilityIds).includes('generated_composition_program'))
    .map(({ intentNodeId }) => text(intentNodeId));
  const sourceNodes = nodes.filter((node) => {
    const capabilities = strings(node.candidateCapabilityIds);
    return node.executionForm === 'NATIVE'
      && capabilities.includes('inspect_user_asset')
      && capabilities.includes('resolve_user_asset_overlay')
      && generatedIds.some((generatedId) => hasDependencyPath(
        text(node.intentNodeId), generatedId, dependencies,
      ));
  });
  if (!sourceNodes.length) diagnostics.push('DEV02_SOURCE_RESOLUTION_BEFORE_GENERATED_MISSING');

  const continuationNodes = nodes.filter((node) => node.executionForm === 'NATIVE'
    && strings(node.candidateCapabilityIds).some((capabilityId) => [
      'resolve_user_asset_overlay', 'move_retime_overlay', 'trim_overlay', 'update_overlay',
    ].includes(capabilityId))
    && generatedIds.some((generatedId) => hasDependencyPath(
      generatedId, text(node.intentNodeId), dependencies,
    )));
  if (!continuationNodes.length) diagnostics.push('DEV02_NATIVE_CONTINUATION_AFTER_GENERATED_MISSING');
  const continuationCoverage = new Set(continuationNodes
    .flatMap(({ targetClaimIds }) => strings(targetClaimIds)));
  for (const claimId of nativeClaimIds) if (!continuationCoverage.has(claimId)) {
    diagnostics.push(`DEV02_NATIVE_CONTINUATION_CLAIM_NOT_COVERED:${claimId}`);
  }

  const continuationIds = continuationNodes.map(({ intentNodeId }) => text(intentNodeId));
  const proofNodes = nodes.filter((node) => {
    const capabilities = strings(node.candidateCapabilityIds);
    return node.executionForm === 'NATIVE'
      && capabilities.includes('read_project_file')
      && capabilities.includes('get_timeline_view')
      && continuationIds.some((continuationId) => hasDependencyPath(
        continuationId, text(node.intentNodeId), dependencies,
      ));
  });
  if (!proofNodes.length) diagnostics.push('DEV02_NATIVE_CONTINUATION_BEFORE_PROOF_MISSING');
}

function evaluateDev03StageTwo(
  diagnostics: string[],
  claims: JsonRecord[],
  artifact: JsonRecord,
  nodes: JsonRecord[],
  route: JsonRecord,
): void {
  requireRoute(diagnostics, artifact, route, 'NATIVE', 'NATIVE_ONLY_PLAN', 'DEV03');
  forbidCapabilities(diagnostics, nodes, [
    'generated_composition_program', 'add_sfx', 'apply_speed_ramp', 'add_transition',
    'cut_section', 'apply_audio_ducking',
  ], 'DEV03');
  requireCapabilityGroups(diagnostics, nodes, [
    ['find_audio_moment', 'resolve_audio_edit'], ['sync_cuts_to_beats'], ['apply_camera_shake'],
  ], 'DEV03');
  const shakeClaims = claims.filter((claim) => /shake|impact.emphasis/i.test(JSON.stringify(claim)))
    .map(({ claimId }) => text(claimId));
  const structureClaims = claims.filter((claim) => claim.relation === 'PRESERVES'
    && /timeline.structure|clip count|clip order|asset identit|total duration|non-target state/i
      .test(JSON.stringify(claim)))
    .map(({ claimId }) => text(claimId));
  const protectedClaims = claimIdsWithEvidence(claims, 'EV-DEV03-D1');
  const syncClaims = claims.filter((claim) => !shakeClaims.includes(text(claim.claimId))
    && !structureClaims.includes(text(claim.claimId))
    && (strings(claim.evidenceIds).includes('EV-DEV03-B1')
      || strings(claim.evidenceIds).includes('EV-DEV03-T1')))
    .map(({ claimId }) => text(claimId));
  requireCapabilitiesCover(diagnostics, nodes, ['sync_cuts_to_beats'], [...new Set([...syncClaims, ...protectedClaims])], 'DEV03_SYNC');
  requireCapabilitiesCover(diagnostics, nodes, ['apply_camera_shake'], shakeClaims, 'DEV03_SHAKE');
  requireDependency(diagnostics, nodes, ['find_audio_moment', 'resolve_audio_edit'], ['sync_cuts_to_beats'], 'DEV03_AUDIO_BEFORE_SYNC');
  requireDependency(diagnostics, nodes, ['sync_cuts_to_beats'], ['apply_camera_shake'], 'DEV03_SYNC_BEFORE_SHAKE');
  const preservationText = records(artifact.preservationIntents)
    .map((entry) => `${text(entry.rule)} ${text(entry.proofKind)}`).join(' ');
  if (!/audio|dialogue|sentence|speech|timing/i.test(preservationText)) diagnostics.push('DEV03_AUDIO_PRESERVATION_MISSING');
  if (!/clip|order|asset|duration|speed|timeline|structure/i.test(preservationText)) diagnostics.push('DEV03_TIMELINE_PRESERVATION_MISSING');
}

function evaluateDev04StageTwo(
  diagnostics: string[],
  artifact: JsonRecord,
  nodes: JsonRecord[],
): void {
  if (artifact.executionForm !== 'CAPABILITY_GAP') diagnostics.push('DEV04_CAPABILITY_GAP_NOT_DECLARED');
  forbidCapabilities(diagnostics, nodes, [
    'add_overlay', 'update_overlay', 'reorder_layer', 'set_keyframes',
    'generated_composition_program', 'resolve_visual_edit',
  ], 'DEV04');
  if (!nodes.some((node) => node.failureDisposition === 'CAPABILITY_GAP'
    && strings(node.candidateCapabilityIds).length === 0
    && strings(node.targetClaimIds).length > 0)) diagnostics.push('DEV04_GAP_NODE_MISSING');
  if (!records(artifact.unresolvedRequirements).some(({ kind, disposition }) =>
    kind === 'CAPABILITY' && disposition === 'CAPABILITY_GAP')) {
    diagnostics.push('DEV04_CAPABILITY_REQUIREMENT_MISSING');
  }
}

function evaluateStageThree(
  taskId: DevelopmentCohortTaskIdV2,
  sourceValue: unknown,
  packValue: unknown,
  artifactValue: unknown,
): Readonly<DevelopmentStageEvaluationV2> {
  const source = record(sourceValue);
  const pack = record(packValue);
  const artifact = record(artifactValue);
  if (source.artifactType !== 'EditorialIntentGraphV2' || source.taskId !== taskId
    || pack.taskId !== taskId) {
    return result('UNVERIFIABLE', ['CONNECTED_STAGE3_SOURCE_INVALID']);
  }
  if (artifact.artifactType !== 'EvidenceBoundIntentGraphV2' || artifact.taskId !== taskId) {
    return result('UNVERIFIABLE', ['CONNECTED_STAGE3_ARTIFACT_INVALID']);
  }

  const diagnostics: string[] = [];
  const sourceNodes = new Map(records(source.nodes)
    .map((node) => [text(node.intentNodeId), node] as const));
  const nodes = records(artifact.nodes);
  const nodeIds = new Set(nodes.map(({ intentNodeId }) => text(intentNodeId)));
  for (const nodeId of symmetricDifference(nodeIds, new Set(sourceNodes.keys()))) {
    diagnostics.push(`CONNECTED_STAGE3_NODE_SET_DRIFT:${nodeId}`);
  }
  const bindings = records(artifact.evidenceBindings);
  const bindingIds = new Set(bindings.map(({ bindingId }) => text(bindingId)));
  const preservationIds = new Set(records(artifact.preservationBindings)
    .map(({ preservationId }) => text(preservationId)));
  const proofIds = new Set(records(artifact.proofPlan)
    .map(({ proofObligationId }) => text(proofObligationId)));
  const unresolvedIds = new Set(records(artifact.unresolvedRequirements)
    .map(({ requirementId }) => text(requirementId)));
  const factIds = new Set(records(pack.facts).map(({ factId }) => text(factId)));
  for (const node of nodes) {
    const nodeId = text(node.intentNodeId);
    const expected = sourceNodes.get(nodeId);
    if (expected && !sameSet(strings(node.candidateCapabilityIds), strings(expected.candidateCapabilityIds))) {
      diagnostics.push(`CONNECTED_STAGE3_CAPABILITY_SET_DRIFT:${nodeId}`);
    }
    if (!['BOUND', 'UNVERIFIABLE'].includes(text(node.bindingStatus))) {
      diagnostics.push(`CONNECTED_STAGE3_NODE_STATUS_INVALID:${nodeId}`);
    }
    for (const bindingId of strings(node.evidenceBindingIds)) {
      if (!bindingIds.has(bindingId)) diagnostics.push(`CONNECTED_STAGE3_UNKNOWN_BINDING:${nodeId}/${bindingId}`);
    }
    for (const preservationId of strings(node.preservationIds)) {
      if (!preservationIds.has(preservationId)) {
        diagnostics.push(`CONNECTED_STAGE3_UNKNOWN_PRESERVATION_REF:${nodeId}/${preservationId}`);
      }
    }
    for (const proofId of strings(node.proofObligationIds)) {
      if (!proofIds.has(proofId)) {
        diagnostics.push(`CONNECTED_STAGE3_UNKNOWN_PROOF_REF:${nodeId}/${proofId}`);
      }
    }
    for (const requirementId of strings(node.unresolvedRequirementIds)) {
      if (!unresolvedIds.has(requirementId)) {
        diagnostics.push(`CONNECTED_STAGE3_UNKNOWN_UNRESOLVED_REF:${nodeId}/${requirementId}`);
      }
    }
  }
  for (const binding of bindings) {
    for (const nodeId of strings(binding.nodeIds)) if (!nodeIds.has(nodeId)) {
      diagnostics.push(`CONNECTED_STAGE3_BINDING_UNKNOWN_NODE:${nodeId}`);
    }
    for (const factId of strings(binding.factIds)) if (!factIds.has(factId)) {
      diagnostics.push(`CONNECTED_STAGE3_UNKNOWN_FACT:${factId}`);
    }
  }

  const revisionFact = records(pack.facts).find(({ factId }) => factId === 'fact-project-revision');
  const revision = record(artifact.revisionBinding);
  if (!revisionFact || revision.projectId !== revisionFact.projectId
    || revision.expectedProjectRevision !== revisionFact.expectedProjectRevision
    || revision.status !== 'BOUND') diagnostics.push('CONNECTED_STAGE3_REVISION_BINDING_DRIFT');
  requireBoundRequirements(diagnostics, values(pack.preservationRequirements),
    records(artifact.preservationBindings), factIds, 'preservationId', 'CONNECTED_STAGE3_PRESERVATION');
  requireBoundRequirements(diagnostics, values(pack.proofRequirements),
    records(artifact.proofPlan), factIds, 'proofObligationId', 'CONNECTED_STAGE3_PROOF');
  const expectedDisposition = taskId === 'DEV-02' || taskId === 'DEV-04'
    ? 'CAPABILITY_GAP' : 'READY_FOR_COMPILATION';
  if (artifact.stageDisposition !== expectedDisposition) {
    diagnostics.push(`CONNECTED_STAGE3_DISPOSITION:${text(artifact.stageDisposition)}/${expectedDisposition}`);
  }
  if (expectedDisposition === 'CAPABILITY_GAP'
    && !records(artifact.unresolvedRequirements).some(({ kind, disposition, factIds: refs }) =>
      kind === 'CAPABILITY' && disposition === 'CAPABILITY_GAP'
      && strings(refs).some((factId) => factIds.has(factId)))) {
    diagnostics.push('CONNECTED_STAGE3_CAPABILITY_GAP_UNBOUND');
  }
  return result(diagnostics.length ? 'FAIL'
    : expectedDisposition === 'CAPABILITY_GAP' ? 'EXPECTED_CAPABILITY_GAP' : 'PASS', diagnostics, {
    sourceNodeIds: [...sourceNodes.keys()],
    boundNodeIds: [...nodeIds],
    evaluationMode: 'SOURCE_RELATIVE_CONNECTED',
  });
}

function requireRoute(
  diagnostics: string[], artifact: JsonRecord, route: JsonRecord,
  executionForm: string, scope: string, prefix: string,
): void {
  if (artifact.executionForm !== executionForm) diagnostics.push(`${prefix}_EXECUTION_FORM:${text(artifact.executionForm)}`);
  if (route.scopeClassification !== scope) diagnostics.push(`${prefix}_SCOPE:${text(route.scopeClassification)}`);
  if (route.coverageStatus !== 'COMPLETE') diagnostics.push(`${prefix}_COVERAGE:${text(route.coverageStatus)}`);
}

function requireCapabilityGroups(
  diagnostics: string[], nodes: JsonRecord[], groups: string[][], prefix: string,
): void {
  const capabilities = new Set(nodes.flatMap(({ candidateCapabilityIds }) => strings(candidateCapabilityIds)));
  for (const group of groups) if (!group.some((capability) => capabilities.has(capability))) {
    diagnostics.push(`${prefix}_CAPABILITY_GROUP_MISSING:${group.join('|')}`);
  }
}

function forbidCapabilities(
  diagnostics: string[], nodes: JsonRecord[], forbidden: string[], prefix: string,
): void {
  const capabilities = new Set(nodes.flatMap(({ candidateCapabilityIds }) => strings(candidateCapabilityIds)));
  for (const capability of forbidden) if (capabilities.has(capability)) {
    diagnostics.push(`${prefix}_FORBIDDEN_CAPABILITY:${capability}`);
  }
}

function requireCapabilitiesCover(
  diagnostics: string[], nodes: JsonRecord[], capabilities: string[],
  requiredClaimIds: string[], prefix: string,
): void {
  const covered = new Set(nodes.filter(({ candidateCapabilityIds }) =>
    strings(candidateCapabilityIds).some((capability) => capabilities.includes(capability)))
    .flatMap(({ targetClaimIds }) => strings(targetClaimIds)));
  for (const claimId of requiredClaimIds) if (!covered.has(claimId)) {
    diagnostics.push(`${prefix}_CLAIM_NOT_COVERED:${claimId}`);
  }
}

function requireDependency(
  diagnostics: string[], nodes: JsonRecord[], beforeCapabilities: string[],
  afterCapabilities: string[], diagnostic: string,
): void {
  const before = nodes.filter(({ candidateCapabilityIds }) => strings(candidateCapabilityIds)
    .some((capability) => beforeCapabilities.includes(capability)))
    .map(({ intentNodeId }) => text(intentNodeId));
  const after = nodes.filter(({ candidateCapabilityIds }) => strings(candidateCapabilityIds)
    .some((capability) => afterCapabilities.includes(capability)))
    .map(({ intentNodeId }) => text(intentNodeId));
  const dependencies = new Map(nodes.map((node) => [
    text(node.intentNodeId), new Set(strings(node.requiresNodeIds)),
  ]));
  const hasPath = (from: string, to: string): boolean => {
    const pending = [to];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.shift();
      if (!current || visited.has(current)) continue;
      if (current === from) return true;
      visited.add(current);
      pending.push(...(dependencies.get(current) ?? []));
    }
    return false;
  };
  if (!before.some((from) => after.some((to) => hasPath(from, to)))) diagnostics.push(diagnostic);
}

function hasDependencyPath(
  from: string, to: string, dependencies: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const pending = [to];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    if (current === from) return true;
    visited.add(current);
    pending.push(...(dependencies.get(current) ?? []));
  }
  return false;
}

function requireBoundRequirements(
  diagnostics: string[], expected: unknown[], actual: JsonRecord[], factIds: Set<string>,
  idField: 'preservationId' | 'proofObligationId', prefix: string,
): void {
  for (const rawRequirement of expected) {
    const requirement = record(rawRequirement);
    const id = typeof rawRequirement === 'string'
      ? rawRequirement : text(requirement[idField]);
    const match = actual.find((entry) => entry[idField] === id);
    if (!match) {
      diagnostics.push(`${prefix}_MISSING:${id}`);
      continue;
    }
    const expectedStatus = idField === 'preservationId' ? 'BOUND' : 'PLANNED';
    if (match.status !== expectedStatus) diagnostics.push(`${prefix}_STATUS:${id}`);
    const requiredFacts = strings(requirement.requiredFactIds);
    const actualFacts = strings(match.factIds).length
      ? strings(match.factIds) : strings(match.requiredFactIds);
    if (!actualFacts.length || actualFacts.some((factId) => !factIds.has(factId))) {
      diagnostics.push(`${prefix}_FACT_REFS_INVALID:${id}`);
    }
    if (idField === 'proofObligationId'
      && (!requiredFacts.every((factId) => actualFacts.includes(factId))
        || (requirement.kind && match.kind !== requirement.kind))) {
      diagnostics.push(`${prefix}_FACTS_INCOMPLETE:${id}`);
    }
  }
}

function claimIdsWithEvidence(claims: JsonRecord[], evidenceId: string): string[] {
  return claims.filter((claim) => strings(claim.evidenceIds).includes(evidenceId))
    .map(({ claimId }) => text(claimId));
}

function result(
  disposition: DevelopmentStageEvaluationV2['disposition'],
  diagnostics: string[],
  dimensions: JsonRecord = {},
): Readonly<DevelopmentStageEvaluationV2> {
  return deepFreezeV1({ disposition, diagnostics, dimensions });
}

function symmetricDifference(left: Set<string>, right: Set<string>): string[] {
  return [...new Set([...left].filter((id) => !right.has(id))
    .concat([...right].filter((id) => !left.has(id))))];
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function record(value: unknown): JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
