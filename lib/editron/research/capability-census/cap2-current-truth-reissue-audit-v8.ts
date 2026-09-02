import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V7,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V7,
  getCap2CurrentTruthDomainEvidencePathsV7,
  hashNormalizedCap2FileV7,
  hashNormalizedCap2SourceSnapshotV7,
  type Cap2CurrentTruthDomainV7,
} from './cap2-current-truth-reissue-audit-v7';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const PRIOR_MANIFEST_SHA256 =
  '939ec670b175b7dd8144afd7f065e2a5619315e3c98f191334a2c6dd4155f770';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  'd476471bda793c1857152036da47804668532a115e23cdd7c04cca474a24c1d8';
const SOURCE_SNAPSHOT_SHA256 =
  '139c77e7ddc0c29371281ec8c640335336185b58060e40ded08e6859dbf036be';
const CURRENT_COMMIT_V8 = '75860a1eaa27a543a0f7ca0ce0e8f109ddc06896';

export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V8 =
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V7;
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V8 =
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V7;
export type Cap2CurrentTruthDomainV8 = Cap2CurrentTruthDomainV7;
export const getCap2CurrentTruthDomainEvidencePathsV8 =
  getCap2CurrentTruthDomainEvidencePathsV7;
export const hashNormalizedCap2FileV8 = hashNormalizedCap2FileV7;
export const hashNormalizedCap2SourceSnapshotV8 =
  hashNormalizedCap2SourceSnapshotV7;

const reconciledEvidence = deepFreeze([
  {
    path: 'lib/editron/agent/tools.ts',
    normalizedSha256: '06a7b9ef67870b319c4cdd06cf2c1daf590fe5c6755aeb7808833021d0b2c1fd',
  },
  {
    path: 'tests/editron/chat-tool-mechanical-contracts.test.ts',
    normalizedSha256: 'c3af42fba92737f542470eea872843404979381a76bf53170c872883d95f02d9',
  },
] as const);

const semanticDelta = deepFreeze({
  deltaId: 'core.chat-cut-caller-pinned-project-cas',
  disposition: 'LIVE_CHAT_WRITER_CAS_REPAIRED_CATALOG_STILL_EXCLUDED' as const,
  statement: 'The active chat cut now carries the ProjectService-issued read revision into its canonical write and fails closed when a newer edit wins.',
  evidence: reconciledEvidence,
  resolvedGaps: [
    'The chat cut no longer discards the revision paired with its loaded project snapshot.',
    'A stale chat cut cannot overwrite a newer project edit through a newly sampled revision.',
    'The successful writer returns its ProjectService mutation receipt to the tool result.',
  ] as const,
  remainingGaps: [
    'The operation still has no ProjectService-issued range-aware rebase or durable range-lock command.',
    'The reported affected frame range describes only the cut seam, not the complete downstream ripple region.',
    'Changed paths, reload proof and rendered visual or audio proof are not issued by this live operation.',
    'The historical CAP-2 catalog row remains excluded and no planner mutation authority is granted.',
  ] as const,
  catalogPromotion: false as const,
});

export const cap2CurrentTruthReissueAuditSchemaV8 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV8'),
  schemaVersion: z.literal(8),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV7'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V8),
    normalizedSourceSnapshotHash: z.literal(SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(231),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(486),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V8'),
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
    }).strict()).length(2),
    resolvedGaps: z.array(z.string().min(1)).length(3),
    remainingGaps: z.array(z.string().min(1)).length(4),
    catalogPromotion: z.literal(false),
  }).strict(),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    sourceSurfaceReconciledAndReverified: z.literal(true),
    changedPathEvidenceBound: z.literal(true),
    historicalV7Preserved: z.literal(true),
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

export type Cap2CurrentTruthReissueAuditV8 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV8
>;

export function parseCap2CurrentTruthReissueAuditV8(
  value: unknown,
): Cap2CurrentTruthReissueAuditV8 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV8.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v8 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v8 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV8(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V8.length !== 231
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V8.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V8.reduce(
      (total, observation) => total + observation.observedCount,
      0,
    ) !== 486
    || hashNormalizedCap2SourceSnapshotV8(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V8)
      !== SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v8 current source coverage drift.');
  }
  for (const evidence of reconciledEvidence) {
    if (hashNormalizedCap2FileV8(evidence.path) !== evidence.normalizedSha256) {
      throw new Error(`CAP-2 v8 reconciled evidence drift: ${evidence.path}.`);
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v7 changed beneath the v8 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV8' as const,
  schemaVersion: 8 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V8,
    normalizedSourceSnapshotHash: SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 231 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 486 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V8' as const,
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
    historicalV7Preserved: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    plannerProjectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV8({
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
