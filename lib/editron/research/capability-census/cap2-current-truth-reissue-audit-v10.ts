import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V9,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V9,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V9,
  getCap2CurrentTruthDomainEvidencePathsV9,
  hashNormalizedCap2FileV9,
  hashNormalizedCap2SourceSnapshotV9,
  type Cap2CurrentTruthDomainV9,
} from './cap2-current-truth-reissue-audit-v9';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const PRIOR_MANIFEST_SHA256 =
  '6cd10c6da599301f66370f631dbad2d639fc6ef7473ff0e6dcb1991bd861254c';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  'cbe2476f352082022f7fb6c4c5dc5703c551d3804d906f26c0b087eb5df08484';
const SOURCE_SNAPSHOT_SHA256 =
  '2cfb53bb39458f3c18c1f4cd79d4ca78a16a2bf3901ec51bca7b5907534f7290';
const CURRENT_COMMIT_V10 = 'a20f052a94438f22367dc8311dc77bd87264d380';

export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V10 =
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V9;
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V10 =
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V9;
export type Cap2CurrentTruthDomainV10 = Cap2CurrentTruthDomainV9;
export const getCap2CurrentTruthDomainEvidencePathsV10 =
  getCap2CurrentTruthDomainEvidencePathsV9;
export const hashNormalizedCap2FileV10 = hashNormalizedCap2FileV9;
export const hashNormalizedCap2SourceSnapshotV10 =
  hashNormalizedCap2SourceSnapshotV9;

const reconciledEvidence = deepFreeze([
  {
    path: 'lib/editron/services/project-service.ts',
    normalizedSha256: 'd33ca02fc72ae777ce015bb51bf1b2bfc02297f9c89517ddb3fa752feaca5b44',
  },
] as const);

const semanticDelta = deepFreeze({
  deltaId: 'core.director-lease-release-writer-receipt',
  disposition: 'LIVE_DIRECTOR_LEASE_RELEASE_RECEIPT_REPAIRED_CATALOG_STILL_EXCLUDED' as const,
  statement: 'Director lease cleanup no longer performs a raw token-only unset. ProjectService atomically requires the active matching lease token, clears it, advances the writer revision, and returns the writer-issued receipt; an old or absent lease returns an explicit no-write disposition.',
  evidence: reconciledEvidence,
  resolvedGaps: [
    'A successful Director lease cleanup now advances projectRevision and updatedAt together with the lease-state change.',
    'The cleanup publishes and returns the exact writer-issued ProjectMutationReceiptV1 instead of an unobservable boolean success.',
    'An old lease token cannot clear a newer active lease and receives an explicit no-write disposition.',
  ] as const,
  remainingGaps: [
    'This is a short token-bound Director coordination lease, not generic timeline range locking, range effects, safe rebase or undo.',
    'The current Director cleanup caller does not yet consume or expose the returned receipt to a user-facing lifecycle/proof surface.',
    'Director observer facts and other lifecycle metadata still have separately audited raw writer paths.',
    'The project coordinate remains numeric FPS; rational PTS, VFR, reel and timecode semantics are still absent from product consumers.',
    'No durable downstream invalidation artifact chain or rendered proof is materialized by a lease cleanup.',
  ] as const,
  catalogPromotion: false as const,
});

export const cap2CurrentTruthReissueAuditSchemaV10 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV10'),
  schemaVersion: z.literal(10),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV9'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V10),
    normalizedSourceSnapshotHash: z.literal(SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(231),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(486),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V10'),
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
    historicalV9Preserved: z.literal(true),
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

export type Cap2CurrentTruthReissueAuditV10 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV10
>;

export function parseCap2CurrentTruthReissueAuditV10(
  value: unknown,
): Cap2CurrentTruthReissueAuditV10 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV10.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v10 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v10 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV10(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V10.length !== 231
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V10.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V10.reduce(
      (total, observation) => total + observation.observedCount,
      0,
    ) !== 486
    || hashNormalizedCap2SourceSnapshotV10(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V10)
      !== SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v10 current source coverage drift.');
  }
  for (const evidence of reconciledEvidence) {
    if (hashNormalizedCap2FileV10(evidence.path) !== evidence.normalizedSha256) {
      throw new Error(`CAP-2 v10 reconciled evidence drift: ${evidence.path}.`);
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V9.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V9.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v9 changed beneath the v10 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV10' as const,
  schemaVersion: 10 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V9.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V10,
    normalizedSourceSnapshotHash: SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 231 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 486 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V10' as const,
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
    historicalV9Preserved: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    plannerProjectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V10 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV10({
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
