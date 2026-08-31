import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V11,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V11,
  hashNormalizedCap2FileV11,
  hashNormalizedCap2SourceSnapshotV11,
} from './cap2-current-truth-reissue-audit-v11';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const CURRENT_COMMIT_V12 = '8656a5688d09f4cb155d189743677c357bc44929';
const PRIOR_MANIFEST_SHA256 =
  'a1cdfb8986b2a3e46f1a8cbf3ddc8d48a150d11b5a090c11de5d9674b6bdd54f';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  '597f43a3c9faf7ccd33adfdf7de87fe13efdca99facded3737447c20439b2cdd';
const CURRENT_SOURCE_SNAPSHOT_SHA256 =
  'f0c5137c263b9f89d9d106a93af12835d6e13b6d6be54407a846090e732f4cf6';
const PILOT_SOURCE_SNAPSHOT_SHA256 =
  '338fb07d5775aae0ace22ae0a8077df4b0a2fce13960d39b5e49402cff80f8ff';
const AGENCY_SUPPORT_CLASS_FREEZE_SHA256 =
  'b6ebe539aca225d2dd9ef9736c637d38ef8428d8a92d58cb81163567d3dc0ef5';
const VALID_SUCCESS_PATH_V12 =
  'Only a future real current-target/current-revision MATERIALIZED invalidation admission from the durable ProjectService owner can open a project-linked success path; this source currently has no such owner and therefore admits no project-linked success.';

export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V12 =
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V11;
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V12 = CAP2_CURRENT_TRUTH_SOURCE_PATHS_V11;

export const CAP2_PIPELINE_VIDEO_PILOT_SOURCE_PATHS_V12 = [
  'app/api/internal/workers/pipeline/video/route.ts',
  'app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts',
  'lib/editron/services/pipeline-video-project-delivery-v1.ts',
  'lib/editron/services/project-service.ts',
  'tests/editron/project-pipeline-video-delivery-v1.test.ts',
] as const;

const pilotSourceEvidence = [
  {
    path: 'app/api/internal/workers/pipeline/video/route.ts',
    normalizedSha256: '0e10231e5fe1065d96482cf8d72e0c3e56dbe7c13da307f583b52090a6715899',
  },
  {
    path: 'app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts',
    normalizedSha256: 'c80c7028e6baa278f92237a26c4eb05c5115a7b88e5f958501461bab27fbdf61',
  },
  {
    path: 'lib/editron/services/pipeline-video-project-delivery-v1.ts',
    normalizedSha256: '88a0edcb17a71023e9d6ee91ca4e00ff5fa5b840bb44531a89422afaa69afa5c',
  },
  {
    path: 'lib/editron/services/project-service.ts',
    normalizedSha256: 'caa0efa56782d1e865a668c21ff80ef1df6f1f3af86098243e1d7568f4eaf63d',
  },
  {
    path: 'tests/editron/project-pipeline-video-delivery-v1.test.ts',
    normalizedSha256: '37be0fa148f2d563bc86a6dfa69de478c150227bb6ccd210e546ccc632f75ef0',
  },
] as const;

const pipelineVideoPilotDelta = {
  deltaId: 'pipeline-video.project-delivery-prerequisite-envelope-v1',
  disposition: 'WIRED_FAIL_CLOSED_PILOT_CURRENT_TRUTH' as const,
  statement: 'Commit 8656a5688 wires a typed, hash-bound project-delivery prerequisite from the exact ProjectService snapshot and target through the pipeline-video producer and unchanged worker relay to the ProjectService mutation owner. Project-linked regeneration remains fail-closed before credits or provider dispatch because no durable current-target invalidation admission owner exists; non-project generation is unaffected.',
  activeProjectClass: 'AGENCY_100GB_4H_V1' as const,
  visibleJourney: 'PROJECT_LINKED_PIPELINE_VIDEO_REGENERATION' as const,
  pathTrace: {
    producer: 'app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts',
    decisionOwner: 'lib/editron/services/project-service.ts',
    workerRelay: 'app/api/internal/workers/pipeline/video/route.ts',
    mutationOwner: 'lib/editron/services/project-service.ts',
    storedTruth: 'ProjectService project revision, exact overlay state, and pipelineVideoDeliveryReceipts',
    finalConsumer: 'ProjectService.commitPipelineVideoDeliveryV1 and the resulting project overlay when admission is available',
  },
  envelope: {
    status: 'TYPED_HASH_BOUND_PROJECTSERVICE_SNAPSHOT_RELAYED_UNCHANGED' as const,
    producerInput: 'Exact ProjectService project/revision snapshot and one resolved target overlay' as const,
    workerBehavior: 'Relays the prerequisite unchanged and never re-discovers a target or writes the project directly' as const,
    independentAdmissionChecks: [
      'PROJECT_AND_REVISION',
      'EXACT_TARGET_FINGERPRINT_AND_FRAME_RANGE',
      'ACTIVE_DIRECTOR_LEASE_ABSENCE',
      'OVERLAPPING_CUT_LOCK_ABSENCE',
      'SOURCE_AND_REPLACEMENT_EVIDENCE',
      'RIGHTS',
      'GENERATED_PREDECESSOR_RECEIPT',
      'CURRENT_TARGET_INVALIDATION_ADMISSION',
    ] as const,
  },
  admission: {
    projectLinkedRegeneration: 'FAIL_CLOSED_BEFORE_CREDITS_OR_PROVIDER_DISPATCH' as const,
    failureDisposition: 'UNVERIFIABLE_WHEN_REQUIRED_INVALIDATION_IS_UNMATERIALIZED' as const,
    nonProjectGeneration: 'UNAFFECTED_BY_PROJECT_PREREQUISITE_GATE' as const,
    validSuccessPath: VALID_SUCCESS_PATH_V12,
  },
  focusedProof: {
    pilotTestPath: 'tests/editron/project-pipeline-video-delivery-v1.test.ts' as const,
    baselineTestCommand: 'pnpm exec vitest run tests/editron/project-pipeline-video-delivery-v1.test.ts tests/editron/pipeline-video-project-delivery-target-v1.test.ts --maxWorkers=1 --minWorkers=1' as const,
    baselinePassedTestCount: 24 as const,
    repositoryTypecheck: 'PASS' as const,
    repositoryEslintQuiet: 'PASS' as const,
    diffCheck: 'PASS' as const,
  },
  limits: [
    'One pipeline-video project-delivery pilot only; no universal Queue 5 envelope enforcement.',
    'The pilot does not certify AGENCY_100GB_4H_V1, its VFX/finishing/relighting subclasses, or any CAP row.',
    'The pilot is not a Stage 2.5 GO, a successor readiness receipt, or Stage 3 authorization.',
    'No durable invalidation admission owner exists yet, so project-linked regeneration has no admitted success receipt.',
    'The 24 tests are focused pilot evidence; they do not prove full agency media, render, delivery, recovery, or human-review closure.',
  ] as const,
  authority: {
    implementation: 'PILOT_WIRED' as const,
    certification: false as const,
    productionEligible: false as const,
    runtimeMutationAuthorization: false as const,
    catalogPromotion: false as const,
    stage25Go: false as const,
    stage3Authorization: false as const,
  },
  sourceEvidence: pilotSourceEvidence,
} as const;

const sourceSurfaceDelta = {
  priorV11PathCount: 351 as const,
  currentPathCount: 351 as const,
  addedObservationPathCount: 0 as const,
  priorV11IdentifierOccurrences: 636 as const,
  currentIdentifierOccurrences: 636 as const,
  addedIdentifierOccurrences: 0 as const,
  v11ObservationShapePreserved: true as const,
  pilotPathsRehashed: 5 as const,
  pilotPathsAlreadyInV11Surface: 4 as const,
  pilotTestPathOutsideV11Surface: true as const,
} as const;

const semanticDelta = {
  deltaId: 'current-source.pipeline-video-project-delivery-pilot-v12',
  disposition: 'CURRENT_SOURCE_REHASHED_WITH_BOUND_PILOT_DELTA_CATALOG_STILL_EXCLUDED' as const,
  statement: 'V12 re-hashes the immutable V11 observation paths against committed source 8656a5688 and adds exact evidence for the five-file pipeline-video prerequisite pilot. It records the wired producer/worker/ProjectService path and its fail-closed invalidation boundary without promoting the pilot to universal enforcement, certification, readiness, or runtime authority.',
  sourceSurfaceDelta,
  pilot: pipelineVideoPilotDelta,
  resolvedGaps: [
    'The current V11-observed source surface is re-hashed at the committed pilot source snapshot rather than reusing the stale V11 snapshot hash.',
    'The five pilot files have fresh normalized content hashes; the existing pilot test remains the functional evidence boundary.',
    'The producer, worker relay, ProjectService decision/mutation owner, stored revision/receipt truth, and fail-closed project-linked disposition are recorded together.',
  ] as const,
  remainingGaps: [
    'Queue 5 still has eighteen authoritative project-collection writer paths outside this pilot envelope.',
    'No durable current-target/current-revision invalidation admission owner exists for project-linked regeneration.',
    'The AGENCY_100GB_4H_V1 supported subclass declaration remains V11 research truth with implementation and certification open.',
    'Full agency media, family, render, delivery, recovery, resource-envelope and qualified-human proof remains open.',
  ] as const,
  catalogPromotion: false as const,
} as const;

export const cap2CurrentTruthReissueAuditSchemaV12 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV12'),
  schemaVersion: z.literal(12),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV11'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V12),
    normalizedSourceSnapshotHash: z.literal(CURRENT_SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(351),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(636),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_SOURCE_V12_PILOT_DELTA'),
    pilotSourceSnapshotHash: z.literal(PILOT_SOURCE_SNAPSHOT_SHA256),
    pilotSourcePathCount: z.literal(5),
  }).strict(),
  catalogBinding: z.object({
    catalogHash: z.literal(CAP2_FROZEN_CATALOG_HASH_V1),
    declaredOperationCount: z.literal(37),
    certifiedOperationCount: z.literal(0),
    productionEligibleOperationCount: z.literal(0),
  }).strict(),
  agencySupportClassBinding: z.object({
    classId: z.literal('AGENCY_100GB_4H_V1'),
    freezeHash: z.literal(AGENCY_SUPPORT_CLASS_FREEZE_SHA256),
    declarationStatus: z.literal('V11_DECLARED_SUPPORTED_SUBCLASSES_IMPLEMENTATION_OPEN'),
    certificationGranted: z.literal(false),
  }).strict(),
  semanticDelta: z.object({
    deltaId: z.literal('current-source.pipeline-video-project-delivery-pilot-v12'),
    disposition: z.literal('CURRENT_SOURCE_REHASHED_WITH_BOUND_PILOT_DELTA_CATALOG_STILL_EXCLUDED'),
    statement: z.string().min(1),
    sourceSurfaceDelta: z.object({
      priorV11PathCount: z.literal(351),
      currentPathCount: z.literal(351),
      addedObservationPathCount: z.literal(0),
      priorV11IdentifierOccurrences: z.literal(636),
      currentIdentifierOccurrences: z.literal(636),
      addedIdentifierOccurrences: z.literal(0),
      v11ObservationShapePreserved: z.literal(true),
      pilotPathsRehashed: z.literal(5),
      pilotPathsAlreadyInV11Surface: z.literal(4),
      pilotTestPathOutsideV11Surface: z.literal(true),
    }).strict(),
    pilot: z.object({
      deltaId: z.literal('pipeline-video.project-delivery-prerequisite-envelope-v1'),
      disposition: z.literal('WIRED_FAIL_CLOSED_PILOT_CURRENT_TRUTH'),
      statement: z.string().min(1),
      activeProjectClass: z.literal('AGENCY_100GB_4H_V1'),
      visibleJourney: z.literal('PROJECT_LINKED_PIPELINE_VIDEO_REGENERATION'),
      pathTrace: z.object({
        producer: z.literal('app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts'),
        decisionOwner: z.literal('lib/editron/services/project-service.ts'),
        workerRelay: z.literal('app/api/internal/workers/pipeline/video/route.ts'),
        mutationOwner: z.literal('lib/editron/services/project-service.ts'),
        storedTruth: z.string().min(1),
        finalConsumer: z.string().min(1),
      }).strict(),
      envelope: z.object({
        status: z.literal('TYPED_HASH_BOUND_PROJECTSERVICE_SNAPSHOT_RELAYED_UNCHANGED'),
        producerInput: z.string().min(1),
        workerBehavior: z.string().min(1),
        independentAdmissionChecks: z.array(z.string().min(1)).length(8),
      }).strict(),
      admission: z.object({
        projectLinkedRegeneration: z.literal('FAIL_CLOSED_BEFORE_CREDITS_OR_PROVIDER_DISPATCH'),
        failureDisposition: z.literal('UNVERIFIABLE_WHEN_REQUIRED_INVALIDATION_IS_UNMATERIALIZED'),
        nonProjectGeneration: z.literal('UNAFFECTED_BY_PROJECT_PREREQUISITE_GATE'),
        validSuccessPath: z.literal(VALID_SUCCESS_PATH_V12),
      }).strict(),
      focusedProof: z.object({
        pilotTestPath: z.literal('tests/editron/project-pipeline-video-delivery-v1.test.ts'),
        baselineTestCommand: z.string().min(1),
        baselinePassedTestCount: z.literal(24),
        repositoryTypecheck: z.literal('PASS'),
        repositoryEslintQuiet: z.literal('PASS'),
        diffCheck: z.literal('PASS'),
      }).strict(),
      limits: z.array(z.string().min(1)).length(5),
      authority: z.object({
        implementation: z.literal('PILOT_WIRED'),
        certification: z.literal(false),
        productionEligible: z.literal(false),
        runtimeMutationAuthorization: z.literal(false),
        catalogPromotion: z.literal(false),
        stage25Go: z.literal(false),
        stage3Authorization: z.literal(false),
      }).strict(),
      sourceEvidence: z.array(z.object({
        path: z.string().min(1),
        normalizedSha256: SHA256,
      }).strict()).length(5),
    }).strict(),
    resolvedGaps: z.array(z.string().min(1)).length(3),
    remainingGaps: z.array(z.string().min(1)).length(4),
    catalogPromotion: z.literal(false),
  }).strict(),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    currentSourceSnapshotRecomputed: z.literal(true),
    pilotPathEvidenceBound: z.literal(true),
    historicalV10AndV11Preserved: z.literal(true),
    catalogAuthorityUnchanged: z.literal(true),
    runtimeAuthorityDenied: z.literal(true),
  }).strict(),
  runtimeAuthority: z.object({
    plannerRegistryWired: z.literal(false),
    plannerProjectMutationAuthorized: z.literal(false),
    productionCertificationGranted: z.literal(false),
    stage25Go: z.literal(false),
    stage3Authorization: z.literal(false),
  }).strict(),
  manifestHash: SHA256,
}).strict();

export type Cap2CurrentTruthReissueAuditV12 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV12
>;

export function parseCap2CurrentTruthReissueAuditV12(
  value: unknown,
): Cap2CurrentTruthReissueAuditV12 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV12.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v12 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v12 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV12(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V12.length !== 351
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V12.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V12.reduce(
      (total, observation) => total + observation.observedCount,
      0,
    ) !== 636) {
    throw new Error('CAP-2 v12 current source coverage drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV11(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V12)
    !== CURRENT_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v12 current source snapshot drift.');
  }
  if (hashNormalizedCap2SourceSnapshotV11(CAP2_PIPELINE_VIDEO_PILOT_SOURCE_PATHS_V12)
    !== PILOT_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v12 pipeline-video pilot source snapshot drift.');
  }
  for (const evidence of pilotSourceEvidence) {
    if (hashNormalizedCap2FileV11(evidence.path) !== evidence.normalizedSha256) {
      throw new Error('CAP-2 v12 pipeline-video pilot source drift: ' + evidence.path + '.');
    }
  }
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v11 changed beneath the v12 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV12' as const,
  schemaVersion: 12 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V11.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V12,
    normalizedSourceSnapshotHash: CURRENT_SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 351 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 636 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    reconciliationStatus: 'RECONCILED_CURRENT_SOURCE_V12_PILOT_DELTA' as const,
    pilotSourceSnapshotHash: PILOT_SOURCE_SNAPSHOT_SHA256,
    pilotSourcePathCount: 5 as const,
  },
  catalogBinding: {
    catalogHash: CAP2_FROZEN_CATALOG_HASH_V1,
    declaredOperationCount: 37 as const,
    certifiedOperationCount: 0 as const,
    productionEligibleOperationCount: 0 as const,
  },
  agencySupportClassBinding: {
    classId: 'AGENCY_100GB_4H_V1' as const,
    freezeHash: AGENCY_SUPPORT_CLASS_FREEZE_SHA256,
    declarationStatus: 'V11_DECLARED_SUPPORTED_SUBCLASSES_IMPLEMENTATION_OPEN' as const,
    certificationGranted: false as const,
  },
  semanticDelta,
  reissueGate: {
    priorAuditChained: true as const,
    currentSourceSnapshotRecomputed: true as const,
    pilotPathEvidenceBound: true as const,
    historicalV10AndV11Preserved: true as const,
    catalogAuthorityUnchanged: true as const,
    runtimeAuthorityDenied: true as const,
  },
  runtimeAuthority: {
    plannerRegistryWired: false as const,
    plannerProjectMutationAuthorized: false as const,
    productionCertificationGranted: false as const,
    stage25Go: false as const,
    stage3Authorization: false as const,
  },
};

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12 = Object.freeze(
  parseCap2CurrentTruthReissueAuditV12({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);
