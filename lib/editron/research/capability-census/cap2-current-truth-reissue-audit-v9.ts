import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V8,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V8,
  getCap2CurrentTruthDomainEvidencePathsV8,
  hashNormalizedCap2FileV8,
  hashNormalizedCap2SourceSnapshotV8,
  type Cap2CurrentTruthDomainV8,
} from './cap2-current-truth-reissue-audit-v8';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const PRIOR_MANIFEST_SHA256 =
  '9bbc1ab7632f9c17466cf4d7b5469b17cad3f45876b5ed2af4a700163215edf7';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  '139c77e7ddc0c29371281ec8c640335336185b58060e40ded08e6859dbf036be';
const SOURCE_SNAPSHOT_SHA256 =
  'cbe2476f352082022f7fb6c4c5dc5703c551d3804d906f26c0b087eb5df08484';
const CURRENT_COMMIT_V9 = 'd8e61f0609ddae35e86baf1649bb243913376b87';

export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V9 =
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V8;
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V9 =
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V8;
export type Cap2CurrentTruthDomainV9 = Cap2CurrentTruthDomainV8;
export const getCap2CurrentTruthDomainEvidencePathsV9 =
  getCap2CurrentTruthDomainEvidencePathsV8;
export const hashNormalizedCap2FileV9 = hashNormalizedCap2FileV8;
export const hashNormalizedCap2SourceSnapshotV9 =
  hashNormalizedCap2SourceSnapshotV8;

const reconciledEvidence = deepFreeze([
  {
    path: 'lib/editron/services/project-service.ts',
    normalizedSha256: '0dd3a3cdf9ce14fc0ad38a92fb6442c4a476f2fd0e80586cb592aa5d948d1a92',
  },
] as const);

const semanticDelta = deepFreeze({
  deltaId: 'core.project-duration-legacy-bridge-cas',
  disposition: 'LIVE_LEGACY_DURATION_WRITER_CAS_REPAIRED_CATALOG_STILL_EXCLUDED' as const,
  statement: 'The active legacy duration bridge no longer performs a raw generic update. ProjectService derives the exact current overlay extent, rejects a mismatched caller assertion, and persists the duration through one revision-bound receipt-bearing CAS write.',
  evidence: reconciledEvidence,
  resolvedGaps: [
    'The two direct legacy duration callers cannot use ProjectService.updateProject to write arbitrary project fields.',
    'Duration is derived from exact current overlay ranges rather than trusted from a caller snapshot.',
    'A successful duration correction advances the project revision and emits a durable timeline-range receipt.',
  ] as const,
  remainingGaps: [
    'The two callers still use the compatibility bridge and therefore do not yet provide actor provenance or consume the returned receipt.',
    'Auto Edit remains a multi-write delete/add sequence; reconciling its final duration does not make the sequence atomic.',
    'A duration reconciliation conservatively blocks cut rebase until that rebase policy explicitly models the new receipt operation.',
    'The project coordinate remains numeric FPS; rational PTS, VFR, reel and timecode semantics are still absent from product consumers.',
    'No durable downstream invalidation artifact chain or rendered proof is materialized by this correction.',
  ] as const,
  catalogPromotion: false as const,
});

export const cap2CurrentTruthReissueAuditSchemaV9 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV9'),
  schemaVersion: z.literal(9),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV8'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V9),
    normalizedSourceSnapshotHash: z.literal(SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(231),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(486),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V9'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  semanticDelta: z.object({
    deltaId: z.literal(semanticDelta.deltaId),
    disposition: z.literal(semanticDelta.disposition),
    statement: z.string().min(1),
    evidence: z.array(z.object({
      path: z.string().min(1),
      normalizedSha256: SHA256,
    }).strict()).length(1),
    resolvedGaps: z.array(z.string().min(1)).length(3),
    remainingGaps: z.array(z.string().min(1)).length(5),
    catalogPromotion: z.literal(false),
  }).strict(),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    sourceSurfaceReconciledAndReverified: z.literal(true),
    changedPathEvidenceBound: z.literal(true),
    historicalV8Preserved: z.literal(true),
    catalogAuthorityUnchanged: z.literal(true),
    runtimeAuthorityDenied: z.literal(true),
  }).strict(),
  runtimeAuthority: z.object({
    plannerRegistryWired: z.literal(false),
    plannerProjectMutationAuthorized: z.literal(false),
    productionCertificationGranted: z.literal(false),
  }).strict(),
  manifestHash: SHA256,
}).strict();

export type Cap2CurrentTruthReissueAuditV9 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV9
>;

export function parseCap2CurrentTruthReissueAuditV9(
  value: unknown,
): Cap2CurrentTruthReissueAuditV9 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV9.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v9 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v9 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV9(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V9.length !== 231
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V9.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V9.reduce(
      (total, observation) => total + observation.observedCount,
      0,
    ) !== 486
    || hashNormalizedCap2SourceSnapshotV9(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V9)
      !== SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v9 current source coverage drift.');
  }
  for (const evidence of reconciledEvidence) {
    if (hashNormalizedCap2FileV9(evidence.path) !== evidence.normalizedSha256) {
      throw new Error(`CAP-2 v9 reconciled evidence drift: ${evidence.path}.`);
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v8 changed beneath the v9 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV9' as const,
  schemaVersion: 9 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V9,
    normalizedSourceSnapshotHash: SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 231 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 486 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V9' as const,
  },
  catalogBinding: {
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    declaredOperationCount: 37 as const,
    certifiedOperationCount: 0 as const,
    productionEligibleOperationCount: 0 as const,
  },
  semanticDelta,
  reissueGate: {
    priorAuditChained: true as const,
    sourceSurfaceReconciledAndReverified: true as const,
    changedPathEvidenceBound: true as const,
    historicalV8Preserved: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    plannerProjectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V9 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV9({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
