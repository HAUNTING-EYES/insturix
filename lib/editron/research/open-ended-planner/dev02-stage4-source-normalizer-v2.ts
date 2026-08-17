import canonicalBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalReferenceJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';

import { resolveDev02Stage4RoleSymbolsV2 } from './dev02-stage4-role-resolver-v2';

type JsonRecord = Record<string, unknown>;

export interface Dev02Stage4SourceForNormalizationV2 {
  referenceBlueprint?: unknown;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
}

const canonicalBound = canonicalBoundJson as unknown as JsonRecord;
const canonicalNodes = new Map(records(canonicalBound.nodes)
  .map((node) => [text(node.intentNodeId), node] as const));
const canonicalRoleIds = {
  sourceResolutionIntentNodeId: 'node-source-resolution',
  generatedIslandIntentNodeId: 'node-generated-island',
  nativeContinuationIntentNodeId: 'node-native-continuation',
  proofIntentNodeId: 'node-proof',
} as const;

export function normalizeDev02Stage4SourceRelativeArtifactV2(
  value: unknown,
  source: Dev02Stage4SourceForNormalizationV2,
): Readonly<JsonRecord> {
  const roles = resolveDev02Stage4RoleSymbolsV2({
    ...source,
    referenceBlueprint: source.referenceBlueprint ?? canonicalReferenceJson,
  });
  const artifact = structuredClone(record(value));
  const evidenceBound = record(source.evidenceBoundIntent);
  const evidencePack = record(source.evidencePack);
  const boundNodes = new Map(records(evidenceBound.nodes)
    .map((node) => [text(node.intentNodeId), node] as const));
  const sourceBound = required(boundNodes, roles.sourceResolutionIntentNodeId, 'SOURCE_BOUND_NODE');
  const actualProofIds = strings(sourceBound.proofObligationIds);
  const actualProofSet = new Set(records(evidenceBound.proofPlan)
    .map((proof) => text(proof.proofObligationId)));
  const actualPreservationSet = new Set(records(evidenceBound.preservationBindings)
    .map((entry) => text(entry.preservationId)));
  const actualBindingSet = new Set(records(evidenceBound.evidenceBindings)
    .map((binding) => text(binding.bindingId)));
  const actualFactSet = new Set(records(evidencePack.facts).map((fact) => text(fact.factId)));
  const actualEvidenceSet = new Set(strings(evidencePack.visibleEvidenceIds));
  const actualRoleSet = new Set(Object.values(roles));
  const knownTraceRefs = new Set([
    ...actualRoleSet, ...actualProofSet, ...actualPreservationSet, ...actualBindingSet,
    ...actualFactSet, ...actualEvidenceSet,
  ]);

  const expectedUnresolved = [
    roles.generatedIslandIntentNodeId,
    roles.nativeContinuationIntentNodeId,
    roles.proofIntentNodeId,
  ];
  requireSameSet(strings(artifact.unresolvedIntentNodeIds), expectedUnresolved, 'UNRESOLVED_ROLE_SET');
  const proofPolicy = record(artifact.proofPolicy);
  requireSameSet(strings(proofPolicy.proofObligationIds), [...actualProofSet], 'ROOT_PROOF_SET');
  requireSameSet(strings(proofPolicy.preservationIds), [...actualPreservationSet], 'ROOT_PRESERVATION_SET');

  for (const node of records(artifact.nodes)) {
    if (node.intentNodeId !== roles.sourceResolutionIntentNodeId) fail('COMPILED_NON_SOURCE_NODE');
    requireSameSet(strings(node.proofObligationIds), actualProofIds, `NODE_PROOF_SET:${text(node.nodeId)}`);
    for (const traceRef of strings(node.traceRefs)) {
      if (!knownTraceRefs.has(traceRef)) fail(`UNKNOWN_TRACE_REF:${text(node.nodeId)}/${traceRef}`);
    }
    node.intentNodeId = canonicalRoleIds.sourceResolutionIntentNodeId;
    node.proofObligationIds = strings(required(canonicalNodes, 'node-source-resolution', 'CANONICAL_SOURCE').proofObligationIds);
    node.traceRefs = [canonicalRoleIds.sourceResolutionIntentNodeId];
  }
  for (const diagnostic of records(artifact.diagnostics)) {
    for (const intentNodeId of strings(diagnostic.intentNodeIds)) {
      if (!actualRoleSet.has(intentNodeId)) fail(`DIAGNOSTIC_ROLE_UNKNOWN:${intentNodeId}`);
    }
    diagnostic.intentNodeIds = strings(diagnostic.intentNodeIds).map((intentNodeId) =>
      mapRole(intentNodeId, roles));
  }
  artifact.unresolvedIntentNodeIds = expectedUnresolved.map((intentNodeId) => mapRole(intentNodeId, roles));
  proofPolicy.proofObligationIds = records(canonicalBound.proofPlan)
    .map((proof) => text(proof.proofObligationId));
  proofPolicy.preservationIds = records(canonicalBound.preservationBindings)
    .map((entry) => text(entry.preservationId));
  return artifact;
}

function mapRole(
  intentNodeId: string,
  roles: ReturnType<typeof resolveDev02Stage4RoleSymbolsV2>,
): string {
  for (const key of Object.keys(canonicalRoleIds) as Array<keyof typeof canonicalRoleIds>) {
    if (roles[key] === intentNodeId) return canonicalRoleIds[key];
  }
  fail(`ROLE_MAPPING_MISSING:${intentNodeId}`);
}

function required(map: Map<string, JsonRecord>, key: string, label: string): JsonRecord {
  const value = map.get(key);
  if (!value) fail(`${label}_MISSING:${key}`);
  return value;
}
function requireSameSet(left: string[], right: string[], label: string): void {
  if (left.length !== right.length || left.some((value) => !right.includes(value))) {
    fail(`${label}_DRIFT:${left.join('|')}`);
  }
}
function record(value: unknown): JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function fail(message: string): never { throw new Error(`DEV02_STAGE4_SOURCE_NORMALIZATION:${message}`); }
