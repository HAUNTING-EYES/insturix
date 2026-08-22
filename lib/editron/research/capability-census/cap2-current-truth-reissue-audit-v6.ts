import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V5,
  getCap2CurrentTruthDomainEvidencePathsV5,
  hashNormalizedCap2FileV5,
  hashNormalizedCap2SourceSnapshotV5,
  type Cap2CurrentTruthDomainV5,
} from './cap2-current-truth-reissue-audit-v5';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const PRIOR_MANIFEST_SHA256 =
  '0b18f216bb7a825eb607353f80dd34fbe00b661ea3dd439782fcf76dab27a4f0';
const SOURCE_SNAPSHOT_SHA256 =
  '705d4b3d5b8d51fc350af1828a5dea4b216cdb5f45d77c4828c409eb1c8d2060';
const CURRENT_COMMIT_V6 = 'd84b54159bbcb2f247e7688571a18ecba5ef3b36';
const CANARY_ROUTE_PATH = 'app/api/internal/thinkforge/canary-attestation/route.ts';
const CANARY_ROUTE_IDS = [
  'GET /api/internal/thinkforge/canary-attestation',
  'POST /api/internal/thinkforge/canary-attestation',
] as const;

const historicalApiObservation = CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V5.find(
  ({ sourceId }) => sourceId === 'api.editron-linked-route-exports',
);
if (!historicalApiObservation) {
  throw new Error('CAP-2 v6 cannot locate the V5 API route observation.');
}
export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6 = deepFreeze(
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V5.map((observation) => {
    if (observation.sourceId !== historicalApiObservation.sourceId) return observation;
    const observedIds = [...observation.observedIds, ...CANARY_ROUTE_IDS].sort(compareUtf16);
    const evidencePaths = [...observation.evidencePaths, CANARY_ROUTE_PATH].sort(compareUtf16);
    return { ...observation, observedCount: observedIds.length, observedIds, evidencePaths };
  }),
);
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6 = deepFreeze(
  [...new Set(CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6.flatMap(
    ({ evidencePaths }) => evidencePaths,
  ))].sort(compareUtf16),
);
export type Cap2CurrentTruthDomainV6 = Cap2CurrentTruthDomainV5;
export const getCap2CurrentTruthDomainEvidencePathsV6 =
  getCap2CurrentTruthDomainEvidencePathsV5;
export const hashNormalizedCap2FileV6 = hashNormalizedCap2FileV5;
export const hashNormalizedCap2SourceSnapshotV6 = hashNormalizedCap2SourceSnapshotV5;

const correctionEvidence = deepFreeze([
  {
    path: 'lib/editron/research/open-ended-planner/generated-composition-model-candidate-v1.ts',
    normalizedSha256: '2cfd5039f8dad8928bb21a6f2d32cdb48223e3d1597237c9168306ba54e99595',
  },
  {
    path: 'lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1.ts',
    normalizedSha256: '216aa1066844f8b8775ac14184b2685d451d7d5f257c874a53948517bcd9e8e9',
  },
  {
    path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-model-candidate-v3r.ts',
    normalizedSha256: '089e4af24c11676ff407290fb568df36067d8299441829a8e985d8a4ceb49776',
  },
  {
    path: 'lib/editron/research/open-ended-planner/sealed-holdout-h03-rendered-mechanics-v2r.ts',
    normalizedSha256: '4c457d243a64b523174dfa8670be20b9938bb9019b08b4aeb473be505c76a5b8',
  },
  {
    path: 'tests/editron/open-ended-planner-v2-generated-composition-model-candidate.test.ts',
    normalizedSha256: 'b82c21f73d6ccb21f9a23ec034bfef4ca60e010b02e69adc47131990203dbed1',
  },
  {
    path: 'tests/editron/open-ended-planner-v2-generated-composition-program.test.ts',
    normalizedSha256: '5a6561209c10a8966ee0e2fc5b8845ec5136ede2d69c66a13ffda55483ee8d56',
  },
  {
    path: 'tests/editron/sealed-holdout-h03-model-candidate-v3r.test.ts',
    normalizedSha256: '8562b91f3b28a6f85c01af44f228210f1ed569fd98649935b23f38acf0c64f6b',
  },
  {
    path: 'tests/editron/sealed-holdout-h03-rendered-mechanics-v2r.test.ts',
    normalizedSha256: '5d6bef9507470d60a1324233966b98e34286be424f4ad3d58baf56b60090555c',
  },
  {
    path: CANARY_ROUTE_PATH,
    normalizedSha256: '860bd400729e834d91b3e13385fa22dc85a01a7299612eb5c37efd412e8dbc05',
  },
] as const);

const semanticDelta = deepFreeze({
  deltaId: 'proof.hold03-provider-contract-and-directional-motion-v6',
  disposition: 'BENCHMARK_CONFOUND_CORRECTED_RERUN_REQUIRED' as const,
  statement: 'The provider language now states runtime layer kinds and CSS-pixel units, decoded proof checks all six declared motion directions, and the committed ThinkForge canary route is reconciled into the source surface.',
  evidence: correctionEvidence,
  correctedDefects: [
    'TEXT_LAYER_ACCEPTED_AS_SOURCE_PANEL',
    'TRANSLATION_UNIT_UNDECLARED',
    'TWO_EDGE_MOTION_PROBE_INCOMPLETE',
    'MOTION_THRESHOLD_HIDDEN_FROM_PROVIDER_PACKET',
    'CURRENT_ROUTE_SURFACE_STALE',
  ] as const,
  remainingGaps: [
    'No corrected paid provider row has run under this identity.',
    'No model, catalog operation or ProjectService mutation is production-certified.',
    'Gemini remains unevaluated until a generation call is not rate-limited.',
  ] as const,
  catalogPromotion: false as const,
});

export const cap2CurrentTruthReissueAuditSchemaV6 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV6'),
  schemaVersion: z.literal(6),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV5'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V6),
    normalizedSourceSnapshotHash: z.literal(SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(222),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(477),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V6'),
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
    evidence: z.array(z.object({ path: z.string().min(1), normalizedSha256: SHA256 }).strict()).length(9),
    correctedDefects: z.tuple([
      z.literal('TEXT_LAYER_ACCEPTED_AS_SOURCE_PANEL'),
      z.literal('TRANSLATION_UNIT_UNDECLARED'),
      z.literal('TWO_EDGE_MOTION_PROBE_INCOMPLETE'),
      z.literal('MOTION_THRESHOLD_HIDDEN_FROM_PROVIDER_PACKET'),
      z.literal('CURRENT_ROUTE_SURFACE_STALE'),
    ]),
    remainingGaps: z.array(z.string().min(1)).length(3),
    catalogPromotion: z.literal(false),
  }).strict(),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    sourceSurfaceReconciledAndReverified: z.literal(true),
    correctedEvidenceBound: z.literal(true),
    historicalV3R3Preserved: z.literal(true),
    correctedCohortRequired: z.literal(true),
    catalogAuthorityUnchanged: z.literal(true),
    runtimeAuthorityDenied: z.literal(true),
  }).strict(),
  runtimeAuthority: z.object({
    plannerRegistryWired: z.literal(false),
    projectMutationAuthorized: z.literal(false),
    productionCertificationGranted: z.literal(false),
  }).strict(),
  manifestHash: SHA256,
}).strict();

export type Cap2CurrentTruthReissueAuditV6 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV6
>;

export function parseCap2CurrentTruthReissueAuditV6(
  value: unknown,
): Cap2CurrentTruthReissueAuditV6 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV6.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v6 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v6 corrected evidence drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV6(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6.length !== 222
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6.reduce(
      (total, observation) => total + observation.observedCount, 0,
    ) !== 477
    || hashNormalizedCap2SourceSnapshotV6(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6)
      !== SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v6 current source coverage drift.');
  }
  for (const evidence of correctionEvidence) {
    if (hashNormalizedCap2FileV6(evidence.path) !== evidence.normalizedSha256) {
      throw new Error(`CAP-2 v6 corrected evidence drift: ${evidence.path}.`);
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5.manifestHash !== PRIOR_MANIFEST_SHA256) {
  throw new Error('CAP-2 v5 changed beneath the v6 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV6' as const,
  schemaVersion: 6 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V6,
    normalizedSourceSnapshotHash: SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 222 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 477 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V6' as const,
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
    correctedEvidenceBound: true as const,
    historicalV3R3Preserved: true as const,
    correctedCohortRequired: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    projectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV6({
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
function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
