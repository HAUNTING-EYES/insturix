import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export interface Stage4DeterministicCompilerInputV2 {
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
}

const canonicalEditorialIntent = canonicalEditorialIntentJson as unknown as JsonRecord;
const canonicalEvidenceBoundIntent = canonicalEvidenceBoundIntentJson as unknown as JsonRecord;
const canonicalEvidencePack = evidencePackJson as unknown as JsonRecord;
const operatorCatalog = operatorCatalogJson as unknown as JsonRecord;
const operators = new Map(records(operatorCatalog.operators).map((operator) => [text(operator.operatorId), operator]));

export function compileCanonicalStage4DeterministicBaselineV2(): Readonly<JsonRecord> {
  return compileStage4DeterministicBaselineV2({
    editorialIntent: canonicalEditorialIntent,
    evidenceBoundIntent: canonicalEvidenceBoundIntent,
    evidencePack: canonicalEvidencePack,
  });
}

export function compileStage4DeterministicBaselineV2(input: Stage4DeterministicCompilerInputV2): Readonly<JsonRecord> {
  assertCanonicalSource('EDITORIAL_INTENT', input.editorialIntent, canonicalEditorialIntent);
  assertCanonicalSource('EVIDENCE_BOUND_INTENT', input.evidenceBoundIntent, canonicalEvidenceBoundIntent);
  assertCanonicalSource('EVIDENCE_PACK', input.evidencePack, canonicalEvidencePack);

  const editorialIntent = record(input.editorialIntent);
  const evidenceBoundIntent = record(input.evidenceBoundIntent);
  const evidencePack = record(input.evidencePack);
  const facts = records(evidencePack.facts);
  const factsById = new Map(facts.map((fact) => [text(fact.factId), fact]));
  const sourceNode = requiredById(records(evidenceBoundIntent.nodes), 'intentNodeId', 'node-source-resolution', 'SOURCE_INTENT');
  requireSetContains(strings(sourceNode.candidateCapabilityIds), ['inspect_user_asset', 'resolve_user_asset_overlay'], 'SOURCE_OPERATOR_SET');

  const revision = record(evidenceBoundIntent.revisionBinding);
  const projectId = requiredText(revision.projectId, 'PROJECT_ID');
  const expectedProjectRevision = requiredText(revision.expectedProjectRevision, 'PROJECT_REVISION');
  const timebaseFactId = requiredText(revision.timebaseFactId, 'PROJECT_TIMEBASE_FACT');
  requiredFact(factsById, timebaseFactId);
  const revisionFact = requiredFactByKind(facts, 'PROJECT_REVISION');
  const targetRangeFact = requiredFactByKind(facts, 'AUTHORIZED_TARGET_RANGE');
  const targetRange = {
    startFrame: safeInteger(targetRangeFact.start, 'TARGET_RANGE_START'),
    endFrame: safeInteger(targetRangeFact.endExclusive, 'TARGET_RANGE_END'),
  };
  if (targetRange.endFrame <= targetRange.startFrame) throw new Error('STAGE4_BASELINE_TARGET_RANGE_INVALID');

  const sourceWindowsFact = requiredFactByKind(facts, 'ALLOWED_SOURCE_WINDOWS');
  const rightsPolicyFact = requiredFactByKind(facts, 'RIGHTS_POLICY');
  const privacyPolicyFact = requiredFactByKind(facts, 'PRIVACY_EGRESS_POLICY');
  const rightsDecision = record(evidenceBoundIntent.rightsDecision);
  const allowedAssetIds = unique(strings(rightsDecision.allowedAssetIds)).sort(compareUtf16);
  if (!allowedAssetIds.length) throw new Error('STAGE4_BASELINE_ALLOWED_ASSET_SET_EMPTY');
  const sourceFactsByAsset = new Map(
    facts.filter((fact) => fact.kind === 'SOURCE_MEDIA_IDENTITY').map((fact) => [text(fact.assetId), fact]),
  );
  for (const assetId of allowedAssetIds) if (!sourceFactsByAsset.has(assetId)) throw new Error(`STAGE4_BASELINE_SOURCE_FACT_MISSING:${assetId}`);

  const sourceBindingIds = strings(sourceNode.evidenceBindingIds);
  const sourceProofIds = strings(sourceNode.proofObligationIds);
  const sourcePreservationIds = strings(sourceNode.preservationIds);
  const policyFactIds = [text(rightsPolicyFact.factId), text(privacyPolicyFact.factId)];
  const nodes: JsonRecord[] = [];
  const edges: JsonRecord[] = [];
  for (const assetId of allowedAssetIds) {
    const sourceFact = sourceFactsByAsset.get(assetId) as JsonRecord;
    const sourceFactId = requiredText(sourceFact.factId, `SOURCE_FACT_ID:${assetId}`);
    const inspectNodeId = `compile-inspect-${assetId}`;
    const resolveNodeId = `compile-resolve-${assetId}`;
    nodes.push(compiledNode({
      nodeId: inspectNodeId,
      intentNodeId: 'node-source-resolution',
      operatorId: 'inspect_user_asset',
      inputs: { projectId, assetId },
      reads: [sourceFactId, text(sourceWindowsFact.factId), text(rightsPolicyFact.factId)],
      requires: [],
      coordinateBindings: [{
        coordinateDomain: requiredText(sourceFact.coordinateDomain, `SOURCE_COORDINATE_DOMAIN:${assetId}`),
        timebaseFactIds: [sourceFactId], rangeFactIds: [text(sourceWindowsFact.factId)], assetFactIds: [sourceFactId],
      }],
      projectId, expectedProjectRevision, revisionFactId: text(revisionFact.factId),
      proofObligationIds: sourceProofIds, policyFactIds,
      traceRefs: ['node-source-resolution', ...sourceBindingIds, ...sourceProofIds, ...sourcePreservationIds],
    }));
    nodes.push(compiledNode({
      nodeId: resolveNodeId,
      intentNodeId: 'node-source-resolution',
      operatorId: 'resolve_user_asset_overlay',
      inputs: { projectId, expectedProjectRevision, assetId, targetRange },
      reads: [text(revisionFact.factId), timebaseFactId, text(targetRangeFact.factId), sourceFactId, text(sourceWindowsFact.factId), text(rightsPolicyFact.factId)],
      requires: [`${inspectNodeId}.result`],
      coordinateBindings: [
        { coordinateDomain: requiredText(sourceFact.coordinateDomain, `SOURCE_COORDINATE_DOMAIN:${assetId}`), timebaseFactIds: [sourceFactId], rangeFactIds: [text(sourceWindowsFact.factId)], assetFactIds: [sourceFactId] },
        { coordinateDomain: 'PROJECT_TICK', timebaseFactIds: [timebaseFactId], rangeFactIds: [text(targetRangeFact.factId)], assetFactIds: [sourceFactId] },
      ],
      projectId, expectedProjectRevision, revisionFactId: text(revisionFact.factId),
      proofObligationIds: sourceProofIds, policyFactIds,
      traceRefs: ['node-source-resolution', ...sourceBindingIds, ...sourceProofIds, ...sourcePreservationIds],
    }));
    edges.push({
      edgeId: `edge-${inspectNodeId}-${resolveNodeId}`,
      fromNodeId: inspectNodeId,
      toNodeId: resolveNodeId,
      edgeType: 'DATA',
    });
  }

  const proofIds = records(evidenceBoundIntent.proofPlan).map((proof) => requiredText(proof.proofObligationId, 'PROOF_ID'));
  const preservationIds = records(evidenceBoundIntent.preservationBindings).map((entry) => requiredText(entry.preservationId, 'PRESERVATION_ID'));
  const material: JsonRecord = {
    artifactType: 'CompiledOperationGraphV2',
    taskId: requiredText(editorialIntent.taskId, 'TASK_ID'),
    compileDisposition: 'CAPABILITY_GAP',
    executionEligibility: 'NOT_EXECUTABLE',
    sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent),
    evidencePackHash: hashCanonicalJsonV1(evidencePack),
    operatorCatalogVersion: requiredText(operatorCatalog.version, 'OPERATOR_CATALOG_VERSION'),
    projectId,
    expectedProjectRevision,
    nodes,
    edges,
    proofPolicy: {
      proofVersion: 'OE_STAGE4_PROOF_POLICY_V1',
      mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION',
      proofObligationIds: proofIds,
      preservationIds,
      onUnverifiable: 'BLOCK_EXECUTION',
    },
    diagnostics: [
      { diagnosticId: 'diag-generated-owner', code: 'CAPABILITY_NOT_IMPLEMENTED', intentNodeIds: ['node-generated-island'], operatorIds: ['generated_composition_program'], factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' },
      { diagnosticId: 'diag-continuation-blocked', code: 'DEPENDENCY_BLOCKED', intentNodeIds: ['node-native-continuation'], operatorIds: ['get_timeline_view', 'resolve_user_asset_overlay'], factIds: ['fact-support-generated-composition', 'fact-exit-continuity'], disposition: 'CAPABILITY_GAP' },
      { diagnosticId: 'diag-proof-blocked', code: 'DEPENDENCY_BLOCKED', intentNodeIds: ['node-proof'], operatorIds: ['read_project_file', 'get_timeline_view'], factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' },
    ],
    unresolvedIntentNodeIds: ['node-generated-island', 'node-native-continuation', 'node-proof'],
  };
  return deepFreezeV1(material);
}

function compiledNode(input: {
  nodeId: string;
  intentNodeId: string;
  operatorId: string;
  inputs: JsonRecord;
  reads: string[];
  requires: string[];
  coordinateBindings: JsonRecord[];
  projectId: string;
  expectedProjectRevision: string;
  revisionFactId: string;
  proofObligationIds: string[];
  policyFactIds: string[];
  traceRefs: string[];
}): JsonRecord {
  const operator = operators.get(input.operatorId);
  if (!operator || operator.compilerEligibility !== 'RESEARCH_READ_ONLY') throw new Error(`STAGE4_BASELINE_OPERATOR_FORBIDDEN:${input.operatorId}`);
  const kind = requiredText(operator.kind, `OPERATOR_KIND:${input.operatorId}`);
  if (!['READ', 'RESOLVER'].includes(kind)) throw new Error(`STAGE4_BASELINE_OPERATOR_KIND_FORBIDDEN:${input.operatorId}/${kind}`);
  const outputs = strings(record(operator.output).required).map((outputName) => `${input.nodeId}.${outputName}`);
  return {
    nodeId: input.nodeId,
    intentNodeId: input.intentNodeId,
    operatorId: input.operatorId,
    operatorSpecRef: `EDITRON_OPERATOR_SPECS_V2@${operatorCatalog.version}#${input.operatorId}`,
    ownerRef: requiredText(operator.ownerRef, `OPERATOR_OWNER:${input.operatorId}`),
    inputs: input.inputs,
    reads: unique(input.reads),
    writes: [],
    requires: unique(input.requires),
    produces: outputs,
    invalidates: [],
    coordinateBindings: input.coordinateBindings,
    revisionBinding: { projectId: input.projectId, expectedProjectRevision: input.expectedProjectRevision },
    stabilityRequirement: 'RANGE_STABLE',
    stateEffects: strings(operator.stateEffects),
    idempotency: { scope: 'PROJECT_REVISION', keyMaterialRefs: unique([input.intentNodeId, input.revisionFactId, ...input.reads]) },
    proofObligationIds: unique(input.proofObligationIds),
    failureDisposition: 'ABORT_GRAPH',
    retryDisposition: 'TRANSIENT_SAME_COMMAND',
    policyFactIds: unique(input.policyFactIds),
    concurrency: { class: kind === 'READ' ? 'READ_SHARED' : 'RESOLVER_ISOLATED', conflictDomainRefs: [] },
    resourcePolicyId: kind === 'READ' ? 'OE_STAGE4_READ_V1' : 'OE_STAGE4_RESOLVER_V1',
    reversibility: { disposition: 'NOT_APPLICABLE_READ_ONLY', undoBindingRefs: [] },
    traceRefs: unique(input.traceRefs),
  };
}

function assertCanonicalSource(label: string, value: unknown, canonical: unknown): void {
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(canonical)) throw new Error(`STAGE4_BASELINE_${label}_DRIFT`);
}

function requiredById(values: JsonRecord[], field: string, id: string, label: string): JsonRecord {
  return values.find((value) => value[field] === id) ?? fail(`STAGE4_BASELINE_${label}_MISSING`);
}
function requiredFact(factsById: Map<string, JsonRecord>, factId: string): JsonRecord { return factsById.get(factId) ?? fail(`STAGE4_BASELINE_FACT_MISSING:${factId}`); }
function requiredFactByKind(facts: JsonRecord[], kind: string): JsonRecord { return facts.find((fact) => fact.kind === kind) ?? fail(`STAGE4_BASELINE_FACT_KIND_MISSING:${kind}`); }
function requireSetContains(values: string[], required: string[], label: string): void { for (const value of required) if (!values.includes(value)) throw new Error(`STAGE4_BASELINE_${label}_MISSING:${value}`); }
function requiredText(value: unknown, label: string): string { const result = text(value); return result || fail(`STAGE4_BASELINE_${label}_MISSING`); }
function safeInteger(value: unknown, label: string): number { const result = Number(value); return Number.isSafeInteger(result) && result >= 0 ? result : fail(`STAGE4_BASELINE_${label}_INVALID`); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record).filter((entry) => Object.keys(entry).length > 0) : []; }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message: string): never { throw new Error(message); }
