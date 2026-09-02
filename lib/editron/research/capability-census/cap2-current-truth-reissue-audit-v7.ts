import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6,
  getCap2CurrentTruthDomainEvidencePathsV6,
  hashNormalizedCap2FileV6,
  hashNormalizedCap2SourceSnapshotV6,
  type Cap2CurrentTruthDomainV6,
} from './cap2-current-truth-reissue-audit-v6';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const PRIOR_MANIFEST_SHA256 =
  '2549623eaca44feabf15aa53d8dd93c02804b37406db69879fd047981d2f9ce9';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  '705d4b3d5b8d51fc350af1828a5dea4b216cdb5f45d77c4828c409eb1c8d2060';
const SOURCE_SNAPSHOT_SHA256 =
  'd476471bda793c1857152036da47804668532a115e23cdd7c04cca474a24c1d8';
const CURRENT_COMMIT_V7 = '45b5785e3c12fd03296f02cb40ed7e0a3573ea4d';
const EDITORIAL_PLAN_ROUTE_PATH = 'app/api/internal/workers/editorial-plan/route.ts';
const EDITORIAL_PLAN_ROUTE_ID = 'POST /api/internal/workers/editorial-plan';
const DURABLE_WORKER_PATHS = [
  'lib/editron/security/internal-worker-auth.ts',
  'lib/editron/services/durable-workflow-job-store-v1.ts',
  'lib/editron/services/durable-workflow-job-v1.ts',
  'lib/editron/services/editorial-plan-durable-job-binding-v1.ts',
  'lib/editron/services/editorial-plan-durable-job-resolver-v1.ts',
  'lib/editron/services/editorial-plan-durable-worker-v1.ts',
  'lib/editron/services/editorial-plan-product-dispatch-v1.ts',
  'lib/editron/services/editorial-plan-product-worker-v1.ts',
] as const;

const historicalApiObservation = CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6.find(
  ({ sourceId }) => sourceId === 'api.editron-linked-route-exports',
);
if (!historicalApiObservation) {
  throw new Error('CAP-2 v7 cannot locate the V6 API route observation.');
}
export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V7 = deepFreeze(
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V6.map((observation) => {
    const additions = observation.sourceId === historicalApiObservation.sourceId
      ? [EDITORIAL_PLAN_ROUTE_PATH]
      : observation.sourceId === 'worker.job-module-candidates'
        ? DURABLE_WORKER_PATHS : [];
    if (additions.length === 0) return observation;
    const observedIds = [...observation.observedIds,
      ...(observation.sourceId === historicalApiObservation.sourceId
        ? [EDITORIAL_PLAN_ROUTE_ID] : additions)].sort(compareUtf16);
    const evidencePaths = [...observation.evidencePaths, ...additions].sort(compareUtf16);
    return { ...observation, observedCount: observedIds.length, observedIds, evidencePaths };
  }),
);
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V7 = deepFreeze(
  [...new Set(CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V7.flatMap(
    ({ evidencePaths }) => evidencePaths,
  ))].sort(compareUtf16),
);
export type Cap2CurrentTruthDomainV7 = Cap2CurrentTruthDomainV6;
export const getCap2CurrentTruthDomainEvidencePathsV7 =
  getCap2CurrentTruthDomainEvidencePathsV6;
export const hashNormalizedCap2FileV7 = hashNormalizedCap2FileV6;
export const hashNormalizedCap2SourceSnapshotV7 =
  hashNormalizedCap2SourceSnapshotV6;

const reconciledEvidence = deepFreeze([
  { path: 'app/api/internal/workers/director/route.ts',
    normalizedSha256: 'c0b5cebb5fda34b8bff957c66a6cc8d489c743ca1857b3d781e7afbb2d699258' },
  { path: EDITORIAL_PLAN_ROUTE_PATH,
    normalizedSha256: '0241fe65901f756019793b795894109c26c65313bedd7e24240bc5f11fe25540' },
  { path: 'lib/editron/security/internal-worker-auth.ts',
    normalizedSha256: 'b462693227de0dfbb887dac43dd228abf7bee5797d4bcfe8a2a4aacae13197be' },
  { path: 'lib/editron/services/durable-workflow-job-store-v1.ts',
    normalizedSha256: 'fcd335b3a2845ce1c20ee0c77578206668db26bd9345ac7ee93fa4cad70c59ef' },
  { path: 'lib/editron/services/durable-workflow-job-v1.ts',
    normalizedSha256: '8ae79b9f3df8a2bff0a78b05427c547a18bff9ab4520a4fb575b3604ade0df6c' },
  { path: 'lib/editron/services/editorial-plan-durable-job-binding-v1.ts',
    normalizedSha256: '7bf75fbc9a39f5b91e8194d0937998da35ca6fa61190d14ee1231ca6334efb93' },
  { path: 'lib/editron/services/editorial-plan-durable-job-resolver-v1.ts',
    normalizedSha256: '8e30799142afd528d25dc862ccebe91e9b720dc8ca7adaa6a3be4af35f643a6c' },
  { path: 'lib/editron/services/editorial-plan-durable-worker-v1.ts',
    normalizedSha256: '26746bd7a5f8825760cbd8836dab4844ed6eb4ee16f4bcff2e29bb3b332fd416' },
  { path: 'lib/editron/services/editorial-plan-product-dispatch-v1.ts',
    normalizedSha256: '8ceea3b27ab3e933112c593cf021712e2157c3512da7c023ddf456355e5278fa' },
  { path: 'lib/editron/services/editorial-plan-product-worker-v1.ts',
    normalizedSha256: 'abc6028129b2a806c8780191e83e04f05d0f0d77843797659b6ed064d2e744db' },
  { path: 'app/api/internal/workers/phase0-rendered-evidence/route.ts',
    normalizedSha256: 'dbcac9ecc67e465d8f2ad7952d323ce456057ec29e2cbb4a57386d65b6ed477a' },
  { path: 'app/api/internal/workers/thinkforge/trend-analysis/route.ts',
    normalizedSha256: '1133c6f9d85b9d7db5ac0fb74bcfa4e0d398f12596ca1fd5c6158c9e35ad5606' },
  { path: 'app/api/internal/workers/tribe-analysis/route.ts',
    normalizedSha256: 'eb0a61bf43da9096c2aa5ac77cdcf2d6a01d4dafbad63aac435ea4ec5ce0c3e9' },
  { path: 'app/api/internal/workers/video-analysis/route.ts',
    normalizedSha256: '93c4ce9c24d948f4befe433270f2b2b1e77e25995c06f777f7de3193aee6c19a' },
  { path: 'app/api/services/editron/auto-edit/from-asset/route.ts',
    normalizedSha256: '5683f465acc26495a4fd619ca35539c22b0f4525c816beb6913c9f9a76ca17a8' },
  { path: 'app/api/services/editron/match-edit/analyze/route.ts',
    normalizedSha256: 'fe6cd0a1bb07694b2f385e4a32adbaba0569f1376bceb79f0799852ddbe00598' },
  { path: 'app/api/services/editron/match-edit/generate-gap/route.ts',
    normalizedSha256: '439e6c4f042bf9fedcadbd04362002e7ea55b1895c3efdd85521637d674ac96c' },
  { path: 'app/api/services/editron/saas-explainer/ingest-reference/route.ts',
    normalizedSha256: 'a6a803973c2b87523e3954c08951a3329d92743d678899557e0c66a3aeb1f45f' },
  { path: 'lib/editron/services/phase0-rendered-aesthetic-scoring.ts',
    normalizedSha256: 'a4ff54165750b2a5bcd7d643ba62c8da98d4601133f80bc0e1c42b2a36ec4db3' },
  { path: 'lib/editron/services/phase0-rendered-evidence-worker.ts',
    normalizedSha256: '24afb0ab1a172feceb481e7933026260e5a07dc0f320ddab0376a86ef7a5b2ba' },
] as const);

const semanticDelta = deepFreeze({
  deltaId: 'runtime.source-reconciliation-after-v6',
  disposition: 'CURRENT_SOURCE_DRIFT_RECONCILED_NO_CATALOG_PROMOTION' as const,
  statement: 'V7 adds the signed editorial-plan route and durable worker/job surface, then binds the eleven prior CAP-2A paths changed by worker-auth hardening, canonical-reference convergence, Match Edit fail-closed work and cut/focal proof wiring after V6.',
  evidence: reconciledEvidence,
  changedAreas: [
    'WORKER_AUTH_FAIL_CLOSED',
    'CANONICAL_REFERENCE_MEDIA_CONVERGENCE',
    'UNSAFE_MATCH_GAP_DISABLED',
    'CUT_FOCAL_PROOF_WIRING',
    'DURABLE_EDITORIAL_ORCHESTRATION_SURFACE',
  ] as const,
  remainingGaps: [
    'The 37-operation catalog remains research-only with zero certified operations.',
    'No corrected H03 provider cohort has run against this identity.',
    'No canonical ProjectService mutation is authorized.',
    'No model or Adobe-class capability is production-certified.',
  ] as const,
  catalogPromotion: false as const,
});

export const cap2CurrentTruthReissueAuditSchemaV7 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV7'),
  schemaVersion: z.literal(7),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV6'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V7),
    normalizedSourceSnapshotHash: z.literal(SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(231),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(486),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_TRUTH_V7'),
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
      path: z.string().min(1), normalizedSha256: SHA256,
    }).strict()).length(20),
    changedAreas: z.tuple([
      z.literal('WORKER_AUTH_FAIL_CLOSED'),
      z.literal('CANONICAL_REFERENCE_MEDIA_CONVERGENCE'),
      z.literal('UNSAFE_MATCH_GAP_DISABLED'),
      z.literal('CUT_FOCAL_PROOF_WIRING'),
      z.literal('DURABLE_EDITORIAL_ORCHESTRATION_SURFACE'),
    ]),
    remainingGaps: z.array(z.string().min(1)).length(4),
    catalogPromotion: z.literal(false),
  }).strict(),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    sourceSurfaceReconciledAndReverified: z.literal(true),
    changedPathEvidenceBound: z.literal(true),
    historicalV6Preserved: z.literal(true),
    newCohortIdentityRequired: z.literal(true),
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

export type Cap2CurrentTruthReissueAuditV7 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV7
>;

export function parseCap2CurrentTruthReissueAuditV7(
  value: unknown,
): Cap2CurrentTruthReissueAuditV7 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV7.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v7 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v7 reconciled evidence drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV7(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V7.length !== 231
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V7.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V7.reduce(
      (total, observation) => total + observation.observedCount, 0,
    ) !== 486
    || hashNormalizedCap2SourceSnapshotV7(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V7)
      !== SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v7 current source coverage drift.');
  }
  for (const evidence of reconciledEvidence) {
    if (hashNormalizedCap2FileV7(evidence.path) !== evidence.normalizedSha256) {
      throw new Error(`CAP-2 v7 reconciled evidence drift: ${evidence.path}.`);
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v6 changed beneath the v7 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV7' as const,
  schemaVersion: 7 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V7,
    normalizedSourceSnapshotHash: SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 231 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 486 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V7' as const,
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
    historicalV6Preserved: true as const,
    newCohortIdentityRequired: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    projectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV7({
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
