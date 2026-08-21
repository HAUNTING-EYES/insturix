import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V2,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V2,
  type Cap2CurrentTruthDomainV2,
  getCap2CurrentTruthDomainEvidencePathsV2,
  hashNormalizedCap2FileV2,
  hashNormalizedCap2SourceSnapshotV2,
} from './cap2-current-truth-reissue-audit-v2';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';
import { CAP2_RECONCILIATION_DOMAINS_V1 } from './cap2-owner-reconciliation-contract-v1';

const nonEmptyString = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const stableId = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);

const CURRENT_COMMIT_V3 = '67f2eb48b8888550632c79b9f1133b2d85f8630d';
const PRIOR_AUDIT_MANIFEST_HASH_V2 =
  '3451770615e7313158b7fcb6e7d298cf7c5bd88db09287b4a9b07069b7c88276';
const CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V3 =
  'f9d7ed86323aa83605e491bb5d240235f4c228036fc69b9b9ade686e4b9b6655';
const NORMALIZED_SNAPSHOT_ALGORITHM =
  'sha256(sorted(path + NUL + sha256(utf8FileTextWithCrlfNormalizedToLf)).join(LF))';
const HASH_BOUND_UNCOMMITTED_EVIDENCE_PATHS_V3 = deepFreeze([
  'app/api/services/alyzitron/analyze/route.ts',
  'app/api/services/alyzitron/processor/route.ts',
  'lib/editron/agent/chat-visual-tools.ts',
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V3 =
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V2;
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V3 = CAP2_CURRENT_TRUTH_SOURCE_PATHS_V2;

export function hashNormalizedCap2FileV3(
  relativePath: string,
  repositoryRoot = process.cwd(),
): string {
  return hashNormalizedCap2FileV2(relativePath, repositoryRoot);
}

export function hashNormalizedCap2SourceSnapshotV3(
  relativePaths: readonly string[],
  repositoryRoot = process.cwd(),
): string {
  return hashNormalizedCap2SourceSnapshotV2(relativePaths, repositoryRoot);
}

export type Cap2CurrentTruthDomainV3 = Cap2CurrentTruthDomainV2;

export function getCap2CurrentTruthDomainEvidencePathsV3(
  domain: Cap2CurrentTruthDomainV3,
): readonly string[] {
  return getCap2CurrentTruthDomainEvidencePathsV2(domain);
}

const currentDomainEvidence = deepFreeze([
  {
    domain: 'CORE_PROJECT_TIMELINE_CHECKPOINT',
    evidencePathCount: 16,
    normalizedEvidenceHash: '1476f66f9b503f5528128083d7d26d7999c014bb34784dacaf337ab645a0b26e',
  },
  {
    domain: 'VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER',
    evidencePathCount: 27,
    normalizedEvidenceHash: '36ec2515a13dbda2194a04831af25d8a17f0a08be6d550e19a1f10759332c098',
  },
  {
    domain: 'MEDIA_AUDIO_MUSIC_SFX',
    evidencePathCount: 23,
    normalizedEvidenceHash: 'eb546770f464f98d1a394f644b50073c42285d159f50cb67fce982e4a0d5d22e',
  },
  {
    domain: 'DIRECTOR_GENERATED_ANALYSIS_JOBS',
    evidencePathCount: 38,
    normalizedEvidenceHash: '3c88b1ea6833367259c7a6e1ed8e1f5217c7a6080605530d5cd18bb5ad232b5e',
  },
  {
    domain: 'RENDER_PROOF_DELIVERY_API_WORKERS',
    evidencePathCount: 34,
    normalizedEvidenceHash: '6edd244e677a14dcf9748f053b3ec6e5e588116e99971d2b3f60c1858efde393',
  },
] as const);

const expectedDomainBindings = deepFreeze(currentDomainEvidence.map((current) => {
  const prior = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2.domainBindings
    .find(({ domain }) => domain === current.domain);
  if (!prior) throw new Error(`CAP-2 v3 cannot bind prior domain ${current.domain}.`);
  return {
    ...current,
    historicalArtifactHash: prior.historicalArtifactHash,
    priorNormalizedEvidenceHash: prior.normalizedEvidenceHash,
    reissueStatus: 'RECONCILED_CURRENT_TRUTH_V3' as const,
  };
}));

const semanticDeltasSinceV2 = deepFreeze([
  {
    deltaId: 'source.thinkforge-session-editron-detach-reaffirmed',
    domain: 'SOURCE_SURFACE',
    disposition: 'DETACHED_ROUTE_REVERIFIED',
    statement: 'ThinkForge session creation remains detached from Editron project creation and linking.',
    evidence: [{
      path: 'app/api/services/thinkforge/session/route.ts',
      normalizedSha256: 'b636d0886da326ccbb29522fb79d4fb1a448ec63d3281e20ae4254f11e0bf0d8',
    }],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      currentClaims: [
        'The route owns ThinkForge session persistence and brand metadata only.',
        'No current import, project creation call or project-link write reconnects the route to Editron.',
      ],
      remainingGaps: [],
    },
    catalogPromotion: false,
  },
  {
    deltaId: 'source.alyzitron-brand-org-scope',
    domain: 'SOURCE_SURFACE',
    disposition: 'ORGANIZATION_SCOPE_ADDED_NO_CAPABILITY_PROMOTION',
    statement: 'Alyzitron now carries organization identity into accepted Brand Vault profile resolution.',
    evidence: [
      {
        path: 'app/api/services/alyzitron/analyze/route.ts',
        normalizedSha256: 'fb83be2e8c58d9b8d5d163125b2736b92598e4028a4a2a9fd7d9d2ec4c84d3f9',
      },
      {
        path: 'app/api/services/alyzitron/processor/route.ts',
        normalizedSha256: 'cdfe35118f8bfd71159129f9b9b6ba74bd195742ccd84d47dc28532568d9fc77',
      },
      {
        path: 'lib/alyzitron/services/brand-vault-context.ts',
        normalizedSha256: '2b1b8e48cafbd826b95c92377ed05731de5c9e9ea646882364192f7c0fa57ce7',
      },
      {
        path: 'tests/alyzitron/brand-vault-context.test.ts',
        normalizedSha256: 'ce25a190ca308ef8e3d372b8854a22b0dbcc7cbf652c283017a56b0dfc62ee1c',
      },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      currentClaims: [
        'Analyze and processor paths pass the authenticated organization identifier to the Brand Vault resolver.',
        'Accepted-profile lookup is scoped by user, brand and organization identity.',
      ],
      remainingGaps: [
        'This context lookup is not an atomic Editron editing operation and receives no catalog promotion.',
      ],
    },
    catalogPromotion: false,
  },
  {
    deltaId: 'source.mg-review-internal-tools-gate',
    domain: 'SOURCE_SURFACE',
    disposition: 'DEPLOY_GATE_ADDED_OPERATOR_AUTHORIZATION_MISSING',
    statement: 'The MG review page and API now fail closed unless the deploy-wide internal-tools gate is enabled.',
    evidence: [
      {
        path: 'app/api/services/editron/mg-eval/review/route.ts',
        normalizedSha256: 'a0169a1aa224c4218df9b3613f6606f2c97dc942b0ad49d0d717a9f771cd3272',
      },
      {
        path: 'app/dashboard/editron/mg-review/page.tsx',
        normalizedSha256: 'c35081a2426e122c55b9a2f504c9f0dc572858ff55fd8c4b33cb73f623d9a59d',
      },
      {
        path: 'lib/editron/internal-tools.ts',
        normalizedSha256: '4a2b2a30653ec9298f449e68649ea2bc563df4f8763e3ec1b846e2866ca225bf',
      },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      currentClaims: [
        'Both API verbs and the page return not-found behavior when internal tools are disabled.',
      ],
      remainingGaps: [
        'A deploy-wide enablement flag is not per-operator authentication or authorization.',
      ],
    },
    catalogPromotion: false,
  },
  {
    deltaId: 'core.project-intake-script-aspect-persistence',
    domain: 'CORE_PROJECT_TIMELINE_CHECKPOINT',
    disposition: 'INTAKE_FIELDS_PERSISTED_WITH_FAIL_SOFT_GAPS',
    statement: 'Project intake now persists requested aspect ratio and initial script, but its boundary remains fail-soft.',
    evidence: [
      {
        path: 'app/api/services/editron/projects/create/route.ts',
        normalizedSha256: '52a5d894212779f020d4ec34bbe4db90bb224de4fde409cb36e64f1b917bd924',
      },
      {
        path: 'components/editron/project/new-project-flow.tsx',
        normalizedSha256: 'ef2c771c3c01d79514be2e055aff433bafb5549e2a718e98f2a7a085635270e0',
      },
      {
        path: 'lib/editron/services/project-service.ts',
        normalizedSha256: '20fd18626691b0712f2a4635ec06d9ad7e9c32277243bdc079fe2b8dc0c2d1b4',
      },
    ],
    resolution: {
      status: 'CURRENT_TRUTH_RECONCILED',
      currentClaims: [
        'The new-project flow sends aspect ratio and initial script to the create route.',
        'ProjectService stores accepted aspect ratio, derived canvas dimensions and a non-empty initial script.',
      ],
      remainingGaps: [
        'The route silently truncates scripts beyond 50,000 characters.',
        'An invalid aspect ratio silently falls back to the default instead of returning a structured input error.',
        'No downstream editorial consumer of Project.initialScript was found.',
        'No focused route-level acceptance test was found for these intake fields.',
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
  reissueStatus: z.literal('RECONCILED_CURRENT_TRUTH_V3'),
}).strict();

const semanticDeltaSchema = z.object({
  deltaId: stableId,
  domain: z.enum(['SOURCE_SURFACE', ...CAP2_RECONCILIATION_DOMAINS_V1]),
  disposition: z.enum([
    'DETACHED_ROUTE_REVERIFIED',
    'ORGANIZATION_SCOPE_ADDED_NO_CAPABILITY_PROMOTION',
    'DEPLOY_GATE_ADDED_OPERATOR_AUTHORIZATION_MISSING',
    'INTAKE_FIELDS_PERSISTED_WITH_FAIL_SOFT_GAPS',
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

export const cap2CurrentTruthReissueAuditSchemaV3 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV3'),
  schemaVersion: z.literal(3),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    manifestHash: z.literal(PRIOR_AUDIT_MANIFEST_HASH_V2),
    normalizedSourceSnapshotHash: sha256,
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V3),
    normalizedSnapshotAlgorithm: z.literal(NORMALIZED_SNAPSHOT_ALGORITHM),
    normalizedSourceSnapshotHash: z.literal(CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V3),
    sourceSnapshotPathCount: z.literal(221),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(475),
    workingTreeEvidenceStatus: z.literal('HASH_BOUND_UNCOMMITTED_PATHS_INCLUDED'),
    workingTreeEvidencePaths: z.tuple([
      z.literal('app/api/services/alyzitron/analyze/route.ts'),
      z.literal('app/api/services/alyzitron/processor/route.ts'),
      z.literal('lib/editron/agent/chat-visual-tools.ts'),
    ]),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V3'),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  domainBindings: z.array(domainBindingSchema).length(5),
  semanticDeltasSinceV2: z.array(semanticDeltaSchema).length(4),
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

export type Cap2CurrentTruthReissueAuditV3 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV3
>;

export function parseCap2CurrentTruthReissueAuditV3(
  value: unknown,
): Cap2CurrentTruthReissueAuditV3 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV3.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v3 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.domainBindings)
    !== hashCanonicalCap2ArtifactV1(expectedDomainBindings)) {
    throw new Error('CAP-2 v3 domain binding drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDeltasSinceV2)
    !== hashCanonicalCap2ArtifactV1(semanticDeltasSinceV2)) {
    throw new Error('CAP-2 v3 semantic delta coverage drift.');
  }
  if (parsed.blockerIds.length !== 0) throw new Error('CAP-2 v3 blocker coverage drift.');
  return parsed;
}

/**
 * Validates that today's mutable source tree still matches the immutable V3
 * observation. Historical consumers may parse V3 without making that claim;
 * current-truth consumers must call this guard explicitly.
 */
export function assertCap2CurrentTruthSourcesMatchV3(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V3.length !== 221
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V3.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V3.reduce(
      (total, observation) => total + observation.observedCount,
      0,
    ) !== 475) {
    throw new Error('CAP-2 v3 current source coverage drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV3(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V3)
    !== CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V3) {
    throw new Error('CAP-2 v3 current source snapshot drift.');
  }
  for (const binding of expectedDomainBindings) {
    const actual = hashNormalizedCap2SourceSnapshotV3(
      getCap2CurrentTruthDomainEvidencePathsV3(binding.domain),
    );
    if (actual !== binding.normalizedEvidenceHash) {
      throw new Error(`CAP-2 v3 ${binding.domain} evidence drift.`);
    }
  }
  for (const delta of semanticDeltasSinceV2) {
    for (const evidence of delta.evidence) {
      if (hashNormalizedCap2FileV3(evidence.path) !== evidence.normalizedSha256) {
        throw new Error(`CAP-2 v3 semantic evidence drift: ${evidence.path}.`);
      }
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2.manifestHash !== PRIOR_AUDIT_MANIFEST_HASH_V2) {
  throw new Error('CAP-2 v2 changed beneath the v3 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV3' as const,
  schemaVersion: 3 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    manifestHash: PRIOR_AUDIT_MANIFEST_HASH_V2,
    normalizedSourceSnapshotHash:
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2.sourceBinding.normalizedSourceSnapshotHash,
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V3,
    normalizedSnapshotAlgorithm: NORMALIZED_SNAPSHOT_ALGORITHM,
    normalizedSourceSnapshotHash: CURRENT_NORMALIZED_SOURCE_SNAPSHOT_HASH_V3,
    sourceSnapshotPathCount: 221 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 475 as const,
    workingTreeEvidenceStatus: 'HASH_BOUND_UNCOMMITTED_PATHS_INCLUDED' as const,
    workingTreeEvidencePaths: HASH_BOUND_UNCOMMITTED_EVIDENCE_PATHS_V3,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V3' as const,
  },
  catalogBinding: {
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    declaredOperationCount: 37 as const,
    certifiedOperationCount: 0 as const,
    productionEligibleOperationCount: 0 as const,
  },
  domainBindings: expectedDomainBindings,
  semanticDeltasSinceV2,
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

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV3({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);
