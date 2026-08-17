import { deepFreezeV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export interface Dev04Stage4ResolvedRolesV2 {
  gapIntentNodeId: string;
  inspectionIntentNodeId: string;
  gapRequirementId: string;
  missingCapabilityId: string;
  missingCapabilityFactId: string;
  projectId: string;
  expectedProjectRevision: string;
  targetStartFrame: number;
  targetEndFrame: number;
  revisionFactId: string;
  timebaseFactId: string;
  targetRangeFactId: string;
  sourceFactId: string;
  visualFactId: string;
  policyFactIds: readonly string[];
  proofIds: readonly string[];
  preservationIds: readonly string[];
  traceBindingIds: readonly string[];
  tracePreservationIds: readonly string[];
}

export interface Dev04Stage4RoleResolutionV2 {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  diagnostics: readonly string[];
  roles: Readonly<Dev04Stage4ResolvedRolesV2> | null;
}

const forbiddenSubstitutions = new Set([
  'add_overlay', 'update_overlay', 'reorder_layer', 'set_keyframes',
  'generated_composition_program', 'resolve_visual_edit',
]);
const readCapabilities = new Set(['read_project_file', 'get_timeline_view']);

export function resolveDev04Stage4RolesV2(input: {
  referenceBlueprint: unknown;
  editorialIntent: unknown;
  evidencePack: unknown;
  evidenceBoundIntent: unknown;
}): Readonly<Dev04Stage4RoleResolutionV2> {
  const blueprint = record(input.referenceBlueprint);
  const intent = record(input.editorialIntent);
  const pack = record(input.evidencePack);
  const bound = record(input.evidenceBoundIntent);
  if (![blueprint, intent, pack, bound].every((value) => Object.keys(value).length)) {
    return resolution('UNVERIFIABLE', ['DEV04_STAGE123_ARTIFACT_MISSING']);
  }

  const diagnostics: string[] = [];
  const expectedTypes = [
    [blueprint, 'ReferenceBlueprintV2'],
    [intent, 'EditorialIntentGraphV2'],
    [bound, 'EvidenceBoundIntentGraphV2'],
  ] as const;
  for (const [artifact, artifactType] of expectedTypes) {
    if (artifact.artifactType !== artifactType) diagnostics.push(`DEV04_STAGE123_ARTIFACT_TYPE:${artifactType}`);
  }
  for (const artifact of [blueprint, intent, pack, bound]) {
    if (artifact.taskId !== 'DEV-04') diagnostics.push('DEV04_STAGE123_TASK_DRIFT');
  }

  const claims = records(blueprint.targetClaims);
  const claimIds = stringsFromRecords(claims, 'claimId');
  if (!claimIds.length || new Set(claimIds).size !== claimIds.length) {
    diagnostics.push('DEV04_TARGET_CLAIM_SET_INVALID');
  }

  const intentNodes = records(intent.nodes);
  const intentNodeIds = stringsFromRecords(intentNodes, 'intentNodeId');
  if (!intentNodeIds.length || new Set(intentNodeIds).size !== intentNodeIds.length) {
    diagnostics.push('DEV04_INTENT_NODE_SET_INVALID');
  }
  const claimIdSet = new Set(claimIds);
  const graphClaimIds = new Set(intentNodes.flatMap((node) => strings(node.targetClaimIds)));
  for (const claimId of graphClaimIds) {
    if (!claimIdSet.has(claimId)) diagnostics.push(`DEV04_UNKNOWN_TARGET_CLAIM:${claimId}`);
  }
  for (const claimId of claimIds) {
    if (!graphClaimIds.has(claimId)) diagnostics.push(`DEV04_TARGET_CLAIM_UNCOVERED:${claimId}`);
  }
  if (intent.executionForm !== 'CAPABILITY_GAP') diagnostics.push('DEV04_CAPABILITY_GAP_NOT_DECLARED');
  for (const capabilityId of intentNodes.flatMap((node) => strings(node.candidateCapabilityIds))) {
    if (forbiddenSubstitutions.has(capabilityId)) diagnostics.push(`DEV04_FORBIDDEN_SUBSTITUTION:${capabilityId}`);
  }

  const gapNodes = intentNodes.filter((node) => node.failureDisposition === 'CAPABILITY_GAP'
    && strings(node.candidateCapabilityIds).length === 0
    && strings(node.targetClaimIds).length > 0);
  if (gapNodes.length !== 1) diagnostics.push(`DEV04_GAP_NODE_COUNT:${gapNodes.length}`);
  const gapNode = gapNodes[0] ?? {};
  const gapIntentNodeId = text(gapNode.intentNodeId);

  const gapRequirements = records(intent.unresolvedRequirements).filter((entry) =>
    entry.kind === 'CAPABILITY' && entry.disposition === 'CAPABILITY_GAP');
  const matchingGapRequirements = gapRequirements.filter((entry) =>
    strings(gapNode.targetClaimIds).every((claimId) => strings(entry.targetClaimIds).includes(claimId)));
  if (matchingGapRequirements.length !== 1) {
    diagnostics.push(`DEV04_CAPABILITY_REQUIREMENT_COUNT:${matchingGapRequirements.length}`);
  }
  const gapRequirementId = text(matchingGapRequirements[0]?.requirementId);

  const facts = records(pack.facts);
  const factIds = stringsFromRecords(facts, 'factId');
  if (!factIds.length || new Set(factIds).size !== factIds.length) diagnostics.push('DEV04_FACT_SET_INVALID');
  const revisionFact = oneFact(facts, 'PROJECT_REVISION', diagnostics);
  const timebaseFact = oneFact(facts, 'PROJECT_TIMEBASE', diagnostics);
  const targetRangeFact = oneFact(facts, 'AUTHORIZED_TARGET_RANGE', diagnostics);
  const sourceFact = oneFact(facts, 'SOURCE_MEDIA_IDENTITY', diagnostics);
  const visualFact = oneFact(facts, 'VISUAL_OCCLUSION_OBSERVATION', diagnostics);
  const rightsFact = oneFact(facts, 'RIGHTS_POLICY', diagnostics);
  const privacyFact = oneFact(facts, 'PRIVACY_EGRESS_POLICY', diagnostics);
  const supportFacts = facts.filter((fact) => fact.kind === 'CAPABILITY_SUPPORT'
    && fact.supportStatus === 'MISSING' && fact.compilerEligibility === 'NOT_COMPILABLE');
  if (supportFacts.length !== 1) diagnostics.push(`DEV04_MISSING_SUPPORT_FACT_COUNT:${supportFacts.length}`);
  const supportFact = supportFacts[0] ?? {};
  const missingCapabilityId = text(supportFact.capabilityId);
  if (!missingCapabilityId) diagnostics.push('DEV04_MISSING_CAPABILITY_ID_INVALID');

  const boundNodes = records(bound.nodes);
  const boundNodeIds = stringsFromRecords(boundNodes, 'intentNodeId');
  if (!sameSet(boundNodeIds, intentNodeIds)) diagnostics.push('DEV04_BOUND_NODE_SET_DRIFT');
  if (bound.stageDisposition !== 'CAPABILITY_GAP') diagnostics.push('DEV04_BOUND_DISPOSITION_DRIFT');
  const boundGap = boundNodes.find((node) => node.intentNodeId === gapIntentNodeId) ?? {};
  if (!Object.keys(boundGap).length || strings(boundGap.candidateCapabilityIds).length
    || boundGap.bindingStatus !== 'BOUND'
    || !strings(boundGap.unresolvedRequirementIds).includes(gapRequirementId)) {
    diagnostics.push('DEV04_BOUND_GAP_DRIFT');
  }
  const boundGapRequirements = records(bound.unresolvedRequirements).filter((entry) =>
    entry.requirementId === gapRequirementId && entry.kind === 'CAPABILITY'
    && entry.disposition === 'CAPABILITY_GAP');
  if (boundGapRequirements.length !== 1
    || !strings(boundGapRequirements[0]?.factIds).includes(text(supportFact.factId))) {
    diagnostics.push('DEV04_BOUND_CAPABILITY_REQUIREMENT_DRIFT');
  }

  const preservationIds = stringsFromRecords(records(bound.preservationBindings), 'preservationId');
  const requiredPreservationIds = stringsFromRecords(records(pack.preservationRequirements), 'preservationId');
  if (!sameSet(preservationIds, requiredPreservationIds)
    || records(bound.preservationBindings).some((entry) => entry.status !== 'BOUND')) {
    diagnostics.push('DEV04_PRESERVATION_BINDING_DRIFT');
  }
  const proofIds = stringsFromRecords(records(bound.proofPlan), 'proofObligationId');
  const requiredProofIds = stringsFromRecords(records(pack.proofRequirements), 'proofObligationId');
  if (!sameSet(proofIds, requiredProofIds)
    || records(bound.proofPlan).some((entry) => entry.status !== 'PLANNED')) {
    diagnostics.push('DEV04_PROOF_BINDING_DRIFT');
  }

  const revisionBinding = record(bound.revisionBinding);
  if (!text(revisionFact.projectId) || !text(revisionFact.expectedProjectRevision)
    || revisionBinding.projectId !== revisionFact.projectId
    || revisionBinding.expectedProjectRevision !== revisionFact.expectedProjectRevision
    || revisionBinding.status !== 'BOUND') {
    diagnostics.push('DEV04_REVISION_BINDING_DRIFT');
  }
  const targetStartFrame = safeFrame(targetRangeFact.start);
  const targetEndFrame = safeFrame(targetRangeFact.endExclusive);
  if (targetStartFrame == null || targetEndFrame == null || targetEndFrame <= targetStartFrame) {
    diagnostics.push('DEV04_TARGET_RANGE_INVALID');
  }

  const inspectionCandidates = intentNodes.filter((node) => {
    const capabilities = strings(node.candidateCapabilityIds);
    return capabilities.length > 0 && capabilities.every((capability) => readCapabilities.has(capability));
  });
  if (inspectionCandidates.length > 1) diagnostics.push(`DEV04_INSPECTION_NODE_COUNT:${inspectionCandidates.length}`);
  const inspectionIntentNodeId = text(inspectionCandidates[0]?.intentNodeId) || gapIntentNodeId;
  const boundTraceNode = boundNodes.find((node) => node.intentNodeId === inspectionIntentNodeId) ?? boundGap;
  const traceBindingIds = strings(boundTraceNode.evidenceBindingIds);
  const bindingIds = new Set(stringsFromRecords(records(bound.evidenceBindings), 'bindingId'));
  if (!traceBindingIds.length || traceBindingIds.some((bindingId) => !bindingIds.has(bindingId))) {
    diagnostics.push('DEV04_TRACE_BINDING_INVALID');
  }
  const tracePreservationIds = strings(boundTraceNode.preservationIds);
  if (!tracePreservationIds.length
    || tracePreservationIds.some((preservationId) => !preservationIds.includes(preservationId))) {
    diagnostics.push('DEV04_TRACE_PRESERVATION_INVALID');
  }

  if (diagnostics.length) return resolution('FAIL', diagnostics);
  const noisy = Number(visualFact.confidence) < 0.8
    || visualFact.changingContour !== true
    || visualFact.staticBoxSufficient !== false
    || visualFact.segmentationTrackAvailable !== false;
  if (noisy) return resolution('UNVERIFIABLE', ['DEV04_VISUAL_EVIDENCE_INSUFFICIENT']);

  return resolution('PASS', [], {
    gapIntentNodeId,
    inspectionIntentNodeId,
    gapRequirementId,
    missingCapabilityId,
    missingCapabilityFactId: text(supportFact.factId),
    projectId: text(revisionFact.projectId),
    expectedProjectRevision: text(revisionFact.expectedProjectRevision),
    targetStartFrame: targetStartFrame as number,
    targetEndFrame: targetEndFrame as number,
    revisionFactId: text(revisionFact.factId),
    timebaseFactId: text(timebaseFact.factId),
    targetRangeFactId: text(targetRangeFact.factId),
    sourceFactId: text(sourceFact.factId),
    visualFactId: text(visualFact.factId),
    policyFactIds: [text(rightsFact.factId), text(privacyFact.factId)],
    proofIds,
    preservationIds,
    traceBindingIds,
    tracePreservationIds,
  });
}

function oneFact(facts: JsonRecord[], kind: string, diagnostics: string[]): JsonRecord {
  const matches = facts.filter((fact) => fact.kind === kind);
  if (matches.length !== 1 || !text(matches[0]?.factId)) diagnostics.push(`DEV04_FACT_KIND_COUNT:${kind}/${matches.length}`);
  return matches[0] ?? {};
}

function resolution(
  disposition: Dev04Stage4RoleResolutionV2['disposition'],
  diagnostics: string[],
  roles: Dev04Stage4ResolvedRolesV2 | null = null,
): Readonly<Dev04Stage4RoleResolutionV2> {
  return deepFreezeV1({ disposition, diagnostics: unique(diagnostics).sort(compareUtf16), roles });
}

function safeFrame(value: unknown): number | null {
  const frame = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(frame) && frame >= 0 ? frame : null;
}
function stringsFromRecords(values: JsonRecord[], field: string): string[] {
  return values.map((value) => text(value[field])).filter(Boolean);
}
function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
