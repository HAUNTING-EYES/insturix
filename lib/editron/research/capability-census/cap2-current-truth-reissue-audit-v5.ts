import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V4,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V4,
  type Cap2CurrentTruthDomainV4,
  getCap2CurrentTruthDomainEvidencePathsV4,
  hashNormalizedCap2FileV4,
  hashNormalizedCap2SourceSnapshotV4,
} from './cap2-current-truth-reissue-audit-v4';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';
import { CAP2_RECONCILIATION_DOMAINS_V1 } from './cap2-owner-reconciliation-contract-v1';

const nonEmptyString = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const stableId = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);

// This is the last code checkpoint whose bound H03 and sandbox files are
// byte-identical to the evidence below. Later documentation commits are not a
// reason to rewrite this source identity.
const CURRENT_COMMIT_V5 = '82c7db926ea0e2e48c9a6cc7e4772396b5761acf';
const PRIOR_AUDIT_MANIFEST_HASH_V4 =
  'a24b394b2b69609bbeff4fed2c843cdf5915299f77e9f22720ce69ac721aaf24';
const CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V5 =
  'c68e1a33469c1ec5093bfa22b0e7cdf3e905622c4a8a637a6faee5014d456572';
const NORMALIZED_SNAPSHOT_ALGORITHM =
  'sha256(sorted(path + NUL + sha256(utf8FileTextWithCrlfNormalizedToLf)).join(LF))';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// V5 deliberately keeps the frozen source surface unchanged. H03 additions
// are supplemental semantic evidence, not permission to silently enlarge the
// CAP-2A catalog or claim that a new production operator exists.
export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V5 =
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V4;
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V5 = CAP2_CURRENT_TRUTH_SOURCE_PATHS_V4;

export function hashNormalizedCap2FileV5(
  relativePath: string,
  repositoryRoot = process.cwd(),
): string {
  return hashNormalizedCap2FileV4(relativePath, repositoryRoot);
}

export function hashNormalizedCap2SourceSnapshotV5(
  relativePaths: readonly string[],
  repositoryRoot = process.cwd(),
): string {
  return hashNormalizedCap2SourceSnapshotV4(relativePaths, repositoryRoot);
}

export type Cap2CurrentTruthDomainV5 = Cap2CurrentTruthDomainV4;

export function getCap2CurrentTruthDomainEvidencePathsV5(
  domain: Cap2CurrentTruthDomainV5,
): readonly string[] {
  return getCap2CurrentTruthDomainEvidencePathsV4(domain);
}

const expectedDomainBindings = deepFreeze(
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4.domainBindings.map((prior) => ({
    domain: prior.domain,
    historicalArtifactHash: prior.historicalArtifactHash,
    evidencePathCount: prior.evidencePathCount,
    priorNormalizedEvidenceHash: prior.normalizedEvidenceHash,
    normalizedEvidenceHash: prior.normalizedEvidenceHash,
    reissueStatus: 'RECONCILED_CURRENT_TRUTH_V5' as const,
  })),
);

const semanticDeltasSinceV4 = deepFreeze([{
  deltaId: 'proof.hold03-model-source-live-sandbox-research-only-v3r2',
  domain: 'RENDER_PROOF_DELIVERY_API_WORKERS',
  disposition: 'LIVE_SANDBOX_SYNTHETIC_SOURCE_PROOF_NO_PROMOTION',
  statement: 'HOLD-03 carries one owner-authorized synthetic source callback through a real deny-all Vercel microVM and the sole decoded hybrid-proof owner.',
  evidence: [
    { path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v2r.ts', normalizedSha256: 'e1cc280756a5a1ab66b1e9f8ed9b5a138cb31d5599919b5bc64c79b27d63cd16' },
    { path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-source-executor-v3r2.ts', normalizedSha256: 'b273311d6d7ef15f20db2df33f6c30738e514a85f94818907df4cd8fbcbbdb05' },
    { path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v3r2.ts', normalizedSha256: '5dfa3048b06b1512035fed2991d677ec2778b664cf2316c19a79d09f8ed69dd6' },
    { path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-rendered-mechanics-v2r.ts', normalizedSha256: 'ecc1170aac873edff7beae53060a30c3628d871e164f432a5d1736245b1607c5' },
    { path: 'tests/editron/sealed-holdout-h03-hybrid-proof-v3r2.test.ts', normalizedSha256: 'cd685e60e88f0893816f32efc88a2afc8888415a7399f50c6c7a6838bf4d11fe' },
    { path: 'scripts/run-sealed-holdout-h03-live-sandbox-v3r2.ts', normalizedSha256: '1355da7539372d270cd0a112161b3a31ae0000703c6d42b0aa349eea6dcc7888' },
    { path: 'infra/editron-generated-composition-sandbox/Dockerfile', normalizedSha256: '025f5994d9e2021df52d52a31307e12a6d8c386f0827d4801e6abe75597eb60e' },
    { path: 'infra/editron-generated-composition-sandbox/package.json', normalizedSha256: '1b97effc87c6f24d1eb11b985cebce503b26dce1c0b431880de1c1ec878a55ad' },
    { path: 'infra/editron-generated-composition-sandbox/package-lock.json', normalizedSha256: '61f396ba8b1302228477ecc6ce39a486128f474597621d5a9ce2daed2659fff3' },
  ],
  reconciledV4EvidenceDrift: {
    priorDeltaId: 'proof.hold03-hybrid-generated-program-research-only',
    path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v2r.ts',
    priorNormalizedSha256: '63f17e664ed80b8cbb249a2c0495039d30dce4c93b90c3e753813cd51110f59b',
    currentNormalizedSha256: 'e1cc280756a5a1ab66b1e9f8ed9b5a138cb31d5599919b5bc64c79b27d63cd16',
    disposition: 'V4_PRESERVED_V5_RECONCILED',
  },
  resolution: {
    status: 'CURRENT_TRUTH_RECONCILED',
    currentClaims: [
      'The exact accepted synthetic callback executed in a real Vercel Sandbox microVM with network denied and teardown verified.',
      'The decoded 420-frame proxy proves the bounded native/generated/native H03 mechanics and no project mutation.',
    ],
    remainingGaps: [
      'The source is not provider output and proves no planner or model performance.',
      'It does not prove ProjectService mutation, production renderer parity, mixed rates, interchange or blind editor quality.',
    ],
  },
  catalogPromotion: false,
}] as const);

const liveSandboxEvidence = deepFreeze({
  disposition: 'PASS_RESEARCH_MODEL_SOURCE_SANDBOX_RENDERED_HYBRID_PROXY',
  sourceOrigin: 'SYNTHETIC_CONTRACT_CALLBACK_NOT_PROVIDER_OUTPUT',
  modelPerformanceClaim: 'NONE',
  projectMutation: 'NONE',
  provider: 'VERCEL_SANDBOX',
  networkPolicy: 'DENY_ALL',
  persistent: false,
  sandboxDeleted: true,
  snapshotId: 'snap_CRyxD1vbg4meL6dm1SqXhdxbofnR',
  imageManifestDigest: '90328cd5426725635224528324d54cc38b3e0a812e904d9add81b0c4b3d6c9c1',
  receiptSha256: '17a81dc399d1c9dc0dbe30bc39b6f40d25e4798756271045c39469092d05722f',
  sandboxHostReceiptSha256: 'b4a6d03f71842cdf23f3cf21ed14f3ed5d230d0a7141d777e07297dcd72eed7c',
  outputSha256: '0abf6bc3dbb5f85398f6c3480b129a25bc569c900c449874d52add7a3d27ee4b',
});

const domainBindingSchema = z.object({
  domain: z.enum(CAP2_RECONCILIATION_DOMAINS_V1),
  historicalArtifactHash: sha256,
  evidencePathCount: z.number().int().positive(),
  priorNormalizedEvidenceHash: sha256,
  normalizedEvidenceHash: sha256,
  reissueStatus: z.literal('RECONCILED_CURRENT_TRUTH_V5'),
}).strict();

const semanticDeltaSchema = z.object({
  deltaId: stableId,
  domain: z.literal('RENDER_PROOF_DELIVERY_API_WORKERS'),
  disposition: z.literal('LIVE_SANDBOX_SYNTHETIC_SOURCE_PROOF_NO_PROMOTION'),
  statement: nonEmptyString,
  evidence: z.array(z.object({ path: nonEmptyString, normalizedSha256: sha256 }).strict()).min(1),
  reconciledV4EvidenceDrift: z.object({
    priorDeltaId: stableId,
    path: nonEmptyString,
    priorNormalizedSha256: sha256,
    currentNormalizedSha256: sha256,
    disposition: z.literal('V4_PRESERVED_V5_RECONCILED'),
  }).strict(),
  resolution: z.object({
    status: z.literal('CURRENT_TRUTH_RECONCILED'),
    currentClaims: z.array(nonEmptyString).min(1),
    remainingGaps: z.array(nonEmptyString).min(1),
  }).strict(),
  catalogPromotion: z.literal(false),
}).strict();

export const cap2CurrentTruthReissueAuditSchemaV5 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV5'),
  schemaVersion: z.literal(5),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    manifestHash: z.literal(PRIOR_AUDIT_MANIFEST_HASH_V4),
    normalizedSourceSnapshotHash: z.literal(CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V5),
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V5),
    normalizedSnapshotAlgorithm: z.literal(NORMALIZED_SNAPSHOT_ALGORITHM),
    normalizedSourceSnapshotHash: z.literal(CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V5),
    sourceSnapshotPathCount: z.literal(221),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(475),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    workingTreeEvidencePaths: z.tuple([]),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V5'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  domainBindings: z.array(domainBindingSchema).length(5),
  semanticDeltasSinceV4: z.array(semanticDeltaSchema).length(1),
  liveSandboxEvidence: z.object({
    disposition: z.literal(liveSandboxEvidence.disposition),
    sourceOrigin: z.literal(liveSandboxEvidence.sourceOrigin),
    modelPerformanceClaim: z.literal('NONE'),
    projectMutation: z.literal('NONE'),
    provider: z.literal('VERCEL_SANDBOX'),
    networkPolicy: z.literal('DENY_ALL'),
    persistent: z.literal(false),
    sandboxDeleted: z.literal(true),
    snapshotId: z.literal(liveSandboxEvidence.snapshotId),
    imageManifestDigest: sha256,
    receiptSha256: sha256,
    sandboxHostReceiptSha256: sha256,
    outputSha256: sha256,
  }).strict(),
  blockerIds: z.array(stableId).length(0),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    sourceSurfaceReconciled: z.literal(true),
    semanticDeltasReconciled: z.literal(true),
    liveSandboxEvidenceBound: z.literal(true),
    catalogAuthorityUnchanged: z.literal(true),
    runtimeAuthorityDenied: z.literal(true),
  }).strict(),
  runtimeAuthority: z.object({
    plannerRegistryWired: z.literal(false),
    projectMutationAuthorized: z.literal(false),
    productionCertificationGranted: z.literal(false),
  }).strict(),
  manifestHash: sha256,
}).strict();

export type Cap2CurrentTruthReissueAuditV5 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV5
>;

export function parseCap2CurrentTruthReissueAuditV5(
  value: unknown,
): Cap2CurrentTruthReissueAuditV5 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV5.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v5 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.domainBindings)
    !== hashCanonicalCap2ArtifactV1(expectedDomainBindings)) {
    throw new Error('CAP-2 v5 domain binding drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDeltasSinceV4)
    !== hashCanonicalCap2ArtifactV1(semanticDeltasSinceV4)) {
    throw new Error('CAP-2 v5 semantic delta coverage drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.liveSandboxEvidence)
    !== hashCanonicalCap2ArtifactV1(liveSandboxEvidence)) {
    throw new Error('CAP-2 v5 live sandbox evidence drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV5(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V5.length !== 221
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V5.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V5.reduce(
      (total, observation) => total + observation.observedCount,
      0,
    ) !== 475) {
    throw new Error('CAP-2 v5 current source coverage drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV5(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V5)
    !== CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V5) {
    throw new Error('CAP-2 v5 current source snapshot drift.');
  }
  for (const binding of expectedDomainBindings) {
    const actual = hashNormalizedCap2SourceSnapshotV5(
      getCap2CurrentTruthDomainEvidencePathsV5(binding.domain),
    );
    if (actual !== binding.normalizedEvidenceHash) {
      throw new Error(`CAP-2 v5 ${binding.domain} evidence drift.`);
    }
  }
  for (const delta of semanticDeltasSinceV4) {
    for (const evidence of delta.evidence) {
      if (hashNormalizedCap2FileV5(evidence.path) !== evidence.normalizedSha256) {
        throw new Error(`CAP-2 v5 semantic evidence drift: ${evidence.path}.`);
      }
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4.manifestHash !== PRIOR_AUDIT_MANIFEST_HASH_V4) {
  throw new Error('CAP-2 v4 changed beneath the v5 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV5' as const,
  schemaVersion: 5 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    manifestHash: PRIOR_AUDIT_MANIFEST_HASH_V4,
    normalizedSourceSnapshotHash: CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V5,
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V5,
    normalizedSnapshotAlgorithm: NORMALIZED_SNAPSHOT_ALGORITHM,
    normalizedSourceSnapshotHash: CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V5,
    sourceSnapshotPathCount: 221 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 475 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    workingTreeEvidencePaths: [] as const,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V5' as const,
  },
  catalogBinding: {
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    declaredOperationCount: 37 as const,
    certifiedOperationCount: 0 as const,
    productionEligibleOperationCount: 0 as const,
  },
  domainBindings: expectedDomainBindings,
  semanticDeltasSinceV4,
  liveSandboxEvidence,
  blockerIds: [] as string[],
  reissueGate: {
    priorAuditChained: true as const,
    sourceSurfaceReconciled: true as const,
    semanticDeltasReconciled: true as const,
    liveSandboxEvidenceBound: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    projectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV5({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);
