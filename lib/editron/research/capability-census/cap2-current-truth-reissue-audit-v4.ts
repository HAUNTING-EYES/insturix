import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V3,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V3,
  type Cap2CurrentTruthDomainV3,
  getCap2CurrentTruthDomainEvidencePathsV3,
  hashNormalizedCap2FileV3,
  hashNormalizedCap2SourceSnapshotV3,
} from './cap2-current-truth-reissue-audit-v3';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';
import { CAP2_RECONCILIATION_DOMAINS_V1 } from './cap2-owner-reconciliation-contract-v1';

const nonEmptyString = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const stableId = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);

const CURRENT_COMMIT_V4 = '37342548073ff85896fe23c8879b4c8d98d7c65c';
const PRIOR_AUDIT_MANIFEST_HASH_V3 =
  '180e5699ee939b9514dfc50b41513361c525fb7a0b433bda4226b466553cbf2a';
const CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V4 =
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

// V4 observes the same source surfaces as V3. It rebinds their changed content
// and separately records research proof; neither action expands the catalog.
export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V4 =
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V3;
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V4 = CAP2_CURRENT_TRUTH_SOURCE_PATHS_V3;

export function hashNormalizedCap2FileV4(
  relativePath: string,
  repositoryRoot = process.cwd(),
): string {
  return hashNormalizedCap2FileV3(relativePath, repositoryRoot);
}

export function hashNormalizedCap2SourceSnapshotV4(
  relativePaths: readonly string[],
  repositoryRoot = process.cwd(),
): string {
  return hashNormalizedCap2SourceSnapshotV3(relativePaths, repositoryRoot);
}

export type Cap2CurrentTruthDomainV4 = Cap2CurrentTruthDomainV3;

export function getCap2CurrentTruthDomainEvidencePathsV4(
  domain: Cap2CurrentTruthDomainV4,
): readonly string[] {
  return getCap2CurrentTruthDomainEvidencePathsV3(domain);
}

const currentDomainEvidence = deepFreeze([
  ['CORE_PROJECT_TIMELINE_CHECKPOINT', 16, '1476f66f9b503f5528128083d7d26d7999c014bb34784dacaf337ab645a0b26e'],
  ['VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER', 27, 'f9e2f07789f3a96dc0bc18ffb909672208a823fdcad7e8d25edaa7bad0ddaf73'],
  ['MEDIA_AUDIO_MUSIC_SFX', 23, 'eb546770f464f98d1a394f644b50073c42285d159f50cb67fce982e4a0d5d22e'],
  ['DIRECTOR_GENERATED_ANALYSIS_JOBS', 38, '3c88b1ea6833367259c7a6e1ed8e1f5217c7a6080605530d5cd18bb5ad232b5e'],
  ['RENDER_PROOF_DELIVERY_API_WORKERS', 34, '6edd244e677a14dcf9748f053b3ec6e5e588116e99971d2b3f60c1858efde393'],
] as const);

const expectedDomainBindings = deepFreeze(currentDomainEvidence.map(([
  domain, evidencePathCount, normalizedEvidenceHash,
]) => {
  const prior = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.domainBindings
    .find((binding) => binding.domain === domain);
  if (!prior) throw new Error(`CAP-2 v4 cannot bind prior domain ${domain}.`);
  return {
    domain,
    historicalArtifactHash: prior.historicalArtifactHash,
    evidencePathCount,
    priorNormalizedEvidenceHash: prior.normalizedEvidenceHash,
    normalizedEvidenceHash,
    reissueStatus: 'RECONCILED_CURRENT_TRUTH_V4' as const,
  };
}));

const semanticDeltasSinceV3 = deepFreeze([
  {
    deltaId: 'visual.subject-reframe-source-geometry-owner-v2',
    domain: 'VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER',
    disposition: 'OWNER_GEOMETRY_REPAIRED_PRODUCTION_UNCERTIFIED',
    statement: 'Subject reframe now binds normalized detections to canonical source rasters before deriving cover geometry.',
    evidence: [
      { path: 'lib/editron/agent/chat-visual-tools.ts', normalizedSha256: '65dbce609a06eeb9ffd3ae3854d8b9564dab97dbdac68c7b6b2e8b09de6ae67b' },
      { path: 'lib/editron/services/subject-reframe-plan.ts', normalizedSha256: '2ae62220a995ab45026b42d257f4a9502a2df0637893aab9aea69e1a525260d4' },
      { path: 'tests/editron/subject-reframe-plan.test.ts', normalizedSha256: '8a9615cb21903834868ee6d7cbd513943ee1454d8d382cdcb13e43d4c383c482' },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      currentClaims: [
        'Source raster dimensions are explicit reframe inputs instead of being guessed from project canvas geometry.',
        'Layouts without sufficient authored-layout evidence are reported unresolved instead of silently rewritten.',
      ],
      remainingGaps: [
        'The live chat wrapper still performs non-atomic project writes and has no production proof/undo certification.',
      ],
    },
    catalogPromotion: false,
  },
  {
    deltaId: 'proof.hold05-native-reframe-research-only',
    domain: 'RENDER_PROOF_DELIVERY_API_WORKERS',
    disposition: 'BOUNDED_NATIVE_PROXY_PROOF_NO_PROMOTION',
    statement: 'HOLD-05 proves bounded fixed-rate reframe geometry only inside the isolated research proxy.',
    evidence: [
      { path: 'lib/editron/research/open-ended-planner/sealed-holdout-h05-native-proof-v2r.ts', normalizedSha256: '0a6c8d7c2b7785fd8918f447cff01c9bfc222f5669b7dea72c156b1730124dbb' },
      { path: 'lib/editron/research/open-ended-planner/sealed-holdout-h05-render-runtime-v2r.ts', normalizedSha256: '1d5e8aca51cccefec9c61ae2911bf8f49acfa56133bab77aa28988b3125bebc4' },
      { path: 'tests/editron/sealed-holdout-h05-native-proof-v2r.test.ts', normalizedSha256: 'ad96d27e99596972893a5e8f3b51d875ac4fbec23ae6c2011694e307bf0aa015' },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      currentClaims: ['The bounded proxy verifies subject containment and authored-layout preservation.'],
      remainingGaps: [
        'It does not prove ProjectService mutation, mixed rates, audio, real logo pixels or production renderer parity.',
      ],
    },
    catalogPromotion: false,
  },
  {
    deltaId: 'proof.hold03-hybrid-generated-program-research-only',
    domain: 'RENDER_PROOF_DELIVERY_API_WORKERS',
    disposition: 'BOUNDED_HYBRID_PROXY_PROOF_NO_PROMOTION',
    statement: 'HOLD-03 proves one bounded hybrid render using a human-authored generated-composition fixture.',
    evidence: [
      { path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r.ts', normalizedSha256: 'd307d4cb022dc4d1f660f17caac3e7c40f109589cb9759082f7d27fe0bc69312' },
      { path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v2r.ts', normalizedSha256: '63f17e664ed80b8cbb249a2c0495039d30dce4c93b90c3e753813cd51110f59b' },
      { path: 'tests/editron/sealed-holdout-h03-hybrid-proof-v2r.test.ts', normalizedSha256: 'e80ec2fa66023e7c6baa3df53d14870e4949a6870eb3a65914560ce5937ebf98' },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      currentClaims: ['The bounded proxy verifies panel/title geometry, motion, reference exclusion and return to native footage.'],
      remainingGaps: [
        'It does not prove model code generation, a production sandbox, ProjectService mutation, mixed rates or interchange.',
      ],
    },
    catalogPromotion: false,
  },
] as const);

const domainBindingSchema = z.object({
  domain: z.enum(CAP2_RECONCILIATION_DOMAINS_V1),
  historicalArtifactHash: sha256,
  evidencePathCount: z.number().int().positive(),
  priorNormalizedEvidenceHash: sha256,
  normalizedEvidenceHash: sha256,
  reissueStatus: z.literal('RECONCILED_CURRENT_TRUTH_V4'),
}).strict();

const semanticDeltaSchema = z.object({
  deltaId: stableId,
  domain: z.enum(CAP2_RECONCILIATION_DOMAINS_V1),
  disposition: z.enum([
    'OWNER_GEOMETRY_REPAIRED_PRODUCTION_UNCERTIFIED',
    'BOUNDED_NATIVE_PROXY_PROOF_NO_PROMOTION',
    'BOUNDED_HYBRID_PROXY_PROOF_NO_PROMOTION',
  ]),
  statement: nonEmptyString,
  evidence: z.array(z.object({ path: nonEmptyString, normalizedSha256: sha256 }).strict()).min(1),
  resolution: z.object({
    status: z.literal('CURRENT_TRUTH_RECONCILED'),
    currentClaims: z.array(nonEmptyString).min(1),
    remainingGaps: z.array(nonEmptyString),
  }).strict(),
  catalogPromotion: z.literal(false),
}).strict();

export const cap2CurrentTruthReissueAuditSchemaV4 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV4'),
  schemaVersion: z.literal(4),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    manifestHash: z.literal(PRIOR_AUDIT_MANIFEST_HASH_V3),
    normalizedSourceSnapshotHash: sha256,
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V4),
    normalizedSnapshotAlgorithm: z.literal(NORMALIZED_SNAPSHOT_ALGORITHM),
    normalizedSourceSnapshotHash: z.literal(CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V4),
    sourceSnapshotPathCount: z.literal(221),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(475),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    workingTreeEvidencePaths: z.tuple([]),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V4'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  domainBindings: z.array(domainBindingSchema).length(5),
  semanticDeltasSinceV3: z.array(semanticDeltaSchema).length(3),
  blockerIds: z.array(stableId).length(0),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    sourceSurfaceReconciled: z.literal(true),
    semanticDeltasReconciled: z.literal(true),
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

export type Cap2CurrentTruthReissueAuditV4 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV4
>;

export function parseCap2CurrentTruthReissueAuditV4(
  value: unknown,
): Cap2CurrentTruthReissueAuditV4 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV4.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v4 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.domainBindings)
    !== hashCanonicalCap2ArtifactV1(expectedDomainBindings)) {
    throw new Error('CAP-2 v4 domain binding drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDeltasSinceV3)
    !== hashCanonicalCap2ArtifactV1(semanticDeltasSinceV3)) {
    throw new Error('CAP-2 v4 semantic delta coverage drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV4(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V4.length !== 221
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V4.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V4.reduce(
      (total, observation) => total + observation.observedCount,
      0,
    ) !== 475) {
    throw new Error('CAP-2 v4 current source coverage drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV4(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V4)
    !== CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V4) {
    throw new Error('CAP-2 v4 current source snapshot drift.');
  }
  for (const binding of expectedDomainBindings) {
    const actual = hashNormalizedCap2SourceSnapshotV4(
      getCap2CurrentTruthDomainEvidencePathsV4(binding.domain),
    );
    if (actual !== binding.normalizedEvidenceHash) {
      throw new Error(`CAP-2 v4 ${binding.domain} evidence drift.`);
    }
  }
  for (const delta of semanticDeltasSinceV3) {
    for (const evidence of delta.evidence) {
      if (hashNormalizedCap2FileV4(evidence.path) !== evidence.normalizedSha256) {
        throw new Error(`CAP-2 v4 semantic evidence drift: ${evidence.path}.`);
      }
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.manifestHash !== PRIOR_AUDIT_MANIFEST_HASH_V3) {
  throw new Error('CAP-2 v3 changed beneath the v4 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV4' as const,
  schemaVersion: 4 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    manifestHash: PRIOR_AUDIT_MANIFEST_HASH_V3,
    normalizedSourceSnapshotHash:
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.sourceBinding.normalizedSourceSnapshotHash,
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V4,
    normalizedSnapshotAlgorithm: NORMALIZED_SNAPSHOT_ALGORITHM,
    normalizedSourceSnapshotHash: CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V4,
    sourceSnapshotPathCount: 221 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 475 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    workingTreeEvidencePaths: [] as const,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V4' as const,
  },
  catalogBinding: {
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    declaredOperationCount: 37 as const,
    certifiedOperationCount: 0 as const,
    productionEligibleOperationCount: 0 as const,
  },
  domainBindings: expectedDomainBindings,
  semanticDeltasSinceV3,
  blockerIds: [] as string[],
  reissueGate: {
    priorAuditChained: true as const,
    sourceSurfaceReconciled: true as const,
    semanticDeltasReconciled: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    projectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV4({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);
