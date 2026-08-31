import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V12,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V12,
  CAP2_PIPELINE_VIDEO_PILOT_SOURCE_PATHS_V12,
} from './cap2-current-truth-reissue-audit-v12';
import {
  hashNormalizedCap2FileV11,
  hashNormalizedCap2SourceSnapshotV11,
} from './cap2-current-truth-reissue-audit-v11';
import {
  CAP2_FROZEN_CATALOG_HASH_V1,
  hashCanonicalCap2ArtifactV1,
} from './cap2-current-truth-freeze-v1';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const CURRENT_COMMIT_V13 = '2e11e18e3032649a973b128c6bb06ab21b36a9d2';
const DURATION_PHASE_COMMIT_V13 = '8a786eb43e448c043aa1a385785d455c2f59e03a';
const PINNED_SOURCE_CONSUMER_PHASE_COMMIT_V13 = CURRENT_COMMIT_V13;
const PRIOR_MANIFEST_SHA256 =
  'cc600656aaa78e3f28e684a7c8b2068c18dcc6c7583c44dae5d29ad08ae3421d';
const PRIOR_SOURCE_SNAPSHOT_SHA256 =
  'f0c5137c263b9f89d9d106a93af12835d6e13b6d6be54407a846090e732f4cf6';
const CURRENT_SOURCE_SNAPSHOT_SHA256 =
  '05ea0e563a6611463de7227f1af6c62c7866f092a5f3ac50c777861d7402d00a';
const PIPELINE_VIDEO_PILOT_SOURCE_SNAPSHOT_SHA256 =
  '69a1614c0f1edf3d004278174a855a7da97838fd5dd85af70cfb7bfc58e3ca10';
const DURATION_PHASE_SOURCE_SNAPSHOT_SHA256 =
  'c088847bb6b4e6e29d4d3bcccdc1ce32102ceac908d167035c3bd9c930b75625';
const PINNED_SOURCE_CONSUMER_PHASE_SNAPSHOT_SHA256 =
  'c9c73588960e32a4a05f3a71c1149a44b454ce9496942c6e32a52b8d3ecdfacc';
const CURRENT_RECONCILIATION_SOURCE_SNAPSHOT_SHA256 =
  'c5af3edaf9a8c5f0c5d3ed85534e687764e37a99872f81f3c25554bf62d70fbf';
const AGENCY_SUPPORT_CLASS_FREEZE_SHA256 =
  'b6ebe539aca225d2dd9ef9736c637d38ef8428d8a92d58cb81163567d3dc0ef5';

export const CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13 =
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V12;
export const CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13 =
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V12;

export const CAP2_DURATION_AUTHORITY_PHASE_SOURCE_PATHS_V13 = [
  'components/editron/editor/version-7.0.0/hooks/use-composition-duration.tsx',
  'components/editron/editor/version-7.0.0/react-video-editor.tsx',
  'lib/editron/services/project-service.ts',
  'tests/e2e/editron-fast-user-qa.spec.ts',
  'tests/editron/project-save-payload.test.ts',
] as const;

export const CAP2_PINNED_SOURCE_CONSUMER_PHASE_SOURCE_PATHS_V13 = [
  'lib/editron/services/native-media-timestamp-preview-materializer-v1.ts',
  'lib/editron/services/project-timestamp-video-analysis-v1.ts',
  'tests/editron/native-media-timestamp-consumer-v1.test.ts',
  'tests/editron/native-media-timestamp-preview-paired-materializer-v1.test.ts',
  'tests/editron/project-five-track-analysis-v2.test.ts',
] as const;

const currentReconciliationSourcePaths = sortedUnique([
  ...CAP2_PIPELINE_VIDEO_PILOT_SOURCE_PATHS_V12,
  ...CAP2_DURATION_AUTHORITY_PHASE_SOURCE_PATHS_V13,
  ...CAP2_PINNED_SOURCE_CONSUMER_PHASE_SOURCE_PATHS_V13,
]);

export const CAP2_CURRENT_RECONCILIATION_SOURCE_PATHS_V13 =
  currentReconciliationSourcePaths;

const pipelineVideoPilotEvidence = [
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
    normalizedSha256: '202ba362b8bd85e2995b48a52abfae064b4c7593ce46353fb60289c0d267b877',
  },
  {
    path: 'tests/editron/project-pipeline-video-delivery-v1.test.ts',
    normalizedSha256: '37be0fa148f2d563bc86a6dfa69de478c150227bb6ccd210e546ccc632f75ef0',
  },
] as const;

const durationPhaseEvidence = [
  {
    path: 'components/editron/editor/version-7.0.0/hooks/use-composition-duration.tsx',
    normalizedSha256: 'ab6446e39d9c0eabd44db685cb061f49906859dc5b906f2a5c090dbd1ed82a3f',
  },
  {
    path: 'components/editron/editor/version-7.0.0/react-video-editor.tsx',
    normalizedSha256: '44610391b167262aeb422ab79ff4312fc3f74a495ad2a4c28b0be1a691c02544',
  },
  {
    path: 'lib/editron/services/project-service.ts',
    normalizedSha256: '202ba362b8bd85e2995b48a52abfae064b4c7593ce46353fb60289c0d267b877',
  },
  {
    path: 'tests/e2e/editron-fast-user-qa.spec.ts',
    normalizedSha256: '160d13b767de5a407738a467298161cc0c70ce851b204f3be98d7240e048e561',
  },
  {
    path: 'tests/editron/project-save-payload.test.ts',
    normalizedSha256: '1ea6753df8ac5ffbb4acddb91fab3ef10d7fa5bea6980dfd266efca766fedb45',
  },
] as const;

const pinnedSourceConsumerPhaseEvidence = [
  {
    path: 'lib/editron/services/native-media-timestamp-preview-materializer-v1.ts',
    normalizedSha256: '32e5bf32c6f62284e3eba6499d4cb2f359a49e0a8122ff03bcf360d5c5dbb28a',
  },
  {
    path: 'lib/editron/services/project-timestamp-video-analysis-v1.ts',
    normalizedSha256: 'db41dcc83674c6fed22881a197cb7a5617f21e7d6e7cffbf3070f54e8ce2b838',
  },
  {
    path: 'tests/editron/native-media-timestamp-consumer-v1.test.ts',
    normalizedSha256: '8834ff066fd958530e798baaff5184892095138e4f850fbe1186d85c7b147c45',
  },
  {
    path: 'tests/editron/native-media-timestamp-preview-paired-materializer-v1.test.ts',
    normalizedSha256: 'f6a431f81d54e5a38313ca25943141200b3e8e9baa8d13f36647bef226951cff',
  },
  {
    path: 'tests/editron/project-five-track-analysis-v2.test.ts',
    normalizedSha256: '913905ca52854d95b394c7ce1c4feabd3aaae0a83dbc46fe0c6f182ba399cbfa',
  },
] as const;

const durationAuthorityDelta = {
  deltaId: 'current-source.project-duration-authority-v13',
  commit: DURATION_PHASE_COMMIT_V13,
  disposition: 'FAST_USER_QA_DURATION_AUTHORITY_RECONCILED' as const,
  activeProjectClass: 'AGENCY_100GB_4H_V1' as const,
  visibleJourney: 'EDITRON_FAST_USER_QA_TIMELINE_EDIT_CORRECTION_UNDO_REDO_RELOAD' as const,
  statement: 'Commit 8a786eb43 makes a loaded positive persisted project duration the editor timeline authority, preserves it through generic manual and autosave payloads when duration is omitted, and proves the visible 300-frame / 00:10.00 duration through edit, correction, undo, redo and reload.',
  authorityTrace: {
    loadedDurationOwner: 'components/editron/editor/version-7.0.0/hooks/use-composition-duration.tsx',
    editorCaller: 'components/editron/editor/version-7.0.0/react-video-editor.tsx',
    persistenceOwner: 'lib/editron/services/project-service.ts',
    visibleProof: 'tests/e2e/editron-fast-user-qa.spec.ts',
    genericSaveProof: 'tests/editron/project-save-payload.test.ts',
  },
  proof: {
    fastUserQaPath: 'tests/e2e/editron-fast-user-qa.spec.ts',
    fastUserQaStatus: 'PASS' as const,
    stages: ['EDIT', 'CORRECTION', 'UNDO', 'REDO', 'RELOAD'] as const,
    persistedDurationInFrames: 300 as const,
    visibleDurationDisplay: '00:10.00' as const,
    genericSavePreservation: 'PASS' as const,
  },
  sourceSnapshotHash: DURATION_PHASE_SOURCE_SNAPSHOT_SHA256,
  sourcePathCount: 5 as const,
  sourceEvidence: durationPhaseEvidence,
} as const;

const pinnedSourceConsumerDelta = {
  deltaId: 'current-source.selected-pinned-timestamp-consumers-v13',
  commit: PINNED_SOURCE_CONSUMER_PHASE_COMMIT_V13,
  disposition: 'WIRED_SELECTED_SOURCE_PIN_CONSUMER_CURRENT_TRUTH' as const,
  activeProjectClass: 'AGENCY_100GB_4H_V1' as const,
  visibleJourney: 'PROJECT_SELECTED_PROXY_MASTER_TIMESTAMP_PREVIEW_AND_ANALYSIS' as const,
  statement: 'Commit 2e11e18e3 binds timestamp preview materialization and project-coordinate timestamp analysis to the ProjectService-selected source pin. Managed overlays without a valid pin fail before decoder admission; exact source-version evidence, binding hashes and post-decode source/audio/revision drift checks remain fail-closed.',
  pathTrace: {
    sourceSelectionOwner: 'lib/editron/services/project-selected-video-source-time-binding-v1.ts',
    previewConsumer: 'lib/editron/services/native-media-timestamp-preview-materializer-v1.ts',
    timestampAnalysisConsumer: 'lib/editron/services/project-timestamp-video-analysis-v1.ts',
    projectAnalysisCaller: 'lib/editron/services/project-five-track-analysis-v2.ts',
    authenticatedFinalConsumer: 'app/api/services/editron/analysis/route.ts',
    storedEvidence: 'source-version evidence, V3 binding/PTS cadence hashes, timestamp analysis/materialization receipts and ProjectService revision reads',
    mutationOwner: 'NONE_IN_THIS_SLICE; project-coordinate analysis remains read-only and its legacy timeline admission remains blocked',
  },
  safetyBoundary: {
    managedOverlayWithoutPin: 'FAILS_CLOSED_BEFORE_DECODER_ADMISSION' as const,
    sourceEvidence: 'EXACT_SOURCE_VERSION_EVIDENCE_AND_HASHED_V3_BINDING_REQUIRED' as const,
    postDecodeDrift: 'RE_RESOLVES_SELECTED_SOURCE_AND_CHECKS_BINDING_AUDIO_STATE_AND_PROJECT_REVISION_WITH_CLEANUP' as const,
    unpinnedManagedDecode: 'NOT_ALLOWED' as const,
  },
  focusedProof: {
    testCommand: 'pnpm exec vitest run tests/editron/native-media-timestamp-consumer-v1.test.ts tests/editron/native-media-timestamp-preview-paired-materializer-v1.test.ts tests/editron/native-media-timestamp-preview-session-server-v1.test.ts tests/editron/project-five-track-analysis-v2.test.ts tests/editron/project-timestamp-video-analysis-v1.test.ts --maxWorkers=1 --minWorkers=1',
    testPaths: [
      'tests/editron/native-media-timestamp-consumer-v1.test.ts',
      'tests/editron/native-media-timestamp-preview-paired-materializer-v1.test.ts',
      'tests/editron/native-media-timestamp-preview-session-server-v1.test.ts',
      'tests/editron/project-five-track-analysis-v2.test.ts',
      'tests/editron/project-timestamp-video-analysis-v1.test.ts',
    ] as const,
    passedTestCount: 43 as const,
    status: 'PASS' as const,
  },
  sourceSnapshotHash: PINNED_SOURCE_CONSUMER_PHASE_SNAPSHOT_SHA256,
  sourcePathCount: 5 as const,
  sourceEvidence: pinnedSourceConsumerPhaseEvidence,
} as const;

const sourceSurfaceDelta = {
  priorV12PathCount: 351 as const,
  currentPathCount: 351 as const,
  priorV12ObservationCount: 11 as const,
  currentObservationCount: 11 as const,
  priorV12IdentifierOccurrences: 636 as const,
  currentIdentifierOccurrences: 636 as const,
  addedObservationPathCount: 0 as const,
  addedIdentifierOccurrences: 0 as const,
  v12ObservationShapePreserved: true as const,
  currentSourceSnapshotHash: CURRENT_SOURCE_SNAPSHOT_SHA256,
  reconciliationPathCount: 14 as const,
  reconciliationSourceSnapshotHash: CURRENT_RECONCILIATION_SOURCE_SNAPSHOT_SHA256,
  pipelineVideoPilotSourceSnapshotHash: PIPELINE_VIDEO_PILOT_SOURCE_SNAPSHOT_SHA256,
} as const;

const semanticDelta = {
  deltaId: 'current-source.duration-and-selected-pinned-timestamp-consumers-v13',
  disposition: 'CURRENT_SOURCE_REHASHED_WITH_DURATION_AND_PINNED_CONSUMER_DELTAS_CATALOG_STILL_EXCLUDED' as const,
  statement: 'V13 re-hashes the immutable V12 observation surface at committed source 2e11e18e3 and binds the landed duration-authority correction plus the selected proxy/master timestamp consumer slice. It records current consumer and proof boundaries without claiming universal Queue 5 enforcement, agency certification, readiness, or runtime authority.',
  sourceSurfaceDelta,
  durationAuthority: durationAuthorityDelta,
  pinnedSourceConsumer: pinnedSourceConsumerDelta,
  queueStatus: {
    queue3: {
      status: 'ACTIVE_PARTIAL' as const,
      remaining: 'Other downstream/live/browser/R2, mixed-rate/VFR and delivery consumers remain open.',
    },
    queue4: {
      status: 'ACTIVE_PARTIAL' as const,
      remaining: 'Other proxy/master, live private-storage, invalidation, rerender, delivery and recovery consumers remain open.',
    },
    queue5: {
      status: 'OPEN' as const,
      remaining: 'Durable current-target/current-revision invalidation admission and remaining authoritative project-collection writers remain open.',
    },
  },
  resolvedGaps: [
    'The editor now uses a positive loaded persisted duration as timeline authority and preserves it through generic save payloads.',
    'The selected proxy/master timestamp preview and analysis paths carry exact ProjectService source-pin identity, evidence and binding hashes.',
    'Managed overlays without a source pin and post-decode source/evidence/audio/revision drift fail closed with cleanup rather than yielding unbound media.',
  ] as const,
  remainingGaps: [
    'Queue 3 remains ACTIVE_PARTIAL for other downstream/live/browser/R2, mixed-rate/VFR and delivery consumers.',
    'Queue 4 remains ACTIVE_PARTIAL for other proxy/master, live private-storage, invalidation, rerender, delivery and recovery consumers.',
    'No durable current-target/current-revision invalidation admission owner exists; project-linked regeneration remains fail-closed before credits/provider dispatch.',
    'Queue 5 still has remaining authoritative project-collection writers outside the prior pipeline-video pilot.',
    'AGENCY_100GB_4H_V1 remains a V11 declaration-only supported subclass boundary with implementation and certification open.',
  ] as const,
  catalogPromotion: false as const,
} as const;

export const cap2CurrentTruthReissueAuditSchemaV13 = z.object({
  artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV13'),
  schemaVersion: z.literal(13),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY'),
  priorAuditBinding: z.object({
    artifactType: z.literal('EditronCapabilityCurrentTruthReissueAuditV12'),
    manifestHash: z.literal(PRIOR_MANIFEST_SHA256),
    normalizedSourceSnapshotHash: z.literal(PRIOR_SOURCE_SNAPSHOT_SHA256),
  }).strict(),
  sourceBinding: z.object({
    branch: z.literal('infrastructure-improvs-+Editron'),
    commit: z.literal(CURRENT_COMMIT_V13),
    normalizedSourceSnapshotHash: z.literal(CURRENT_SOURCE_SNAPSHOT_SHA256),
    sourceSnapshotPathCount: z.literal(351),
    sourceObservationCount: z.literal(11),
    observedIdentifierOccurrences: z.literal(636),
    workingTreeEvidenceStatus: z.literal('CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE'),
    reconciliationStatus: z.literal('RECONCILED_CURRENT_SOURCE_V13_DURATION_AND_PINNED_CONSUMER_DELTAS'),
    durationPhaseCommit: z.literal(DURATION_PHASE_COMMIT_V13),
    durationPhaseSnapshotHash: z.literal(DURATION_PHASE_SOURCE_SNAPSHOT_SHA256),
    durationPhaseSourcePathCount: z.literal(5),
    pinnedSourceConsumerPhaseCommit: z.literal(PINNED_SOURCE_CONSUMER_PHASE_COMMIT_V13),
    pinnedSourceConsumerPhaseSnapshotHash: z.literal(PINNED_SOURCE_CONSUMER_PHASE_SNAPSHOT_SHA256),
    pinnedSourceConsumerPhaseSourcePathCount: z.literal(5),
    reconciliationSourceSnapshotHash: z.literal(CURRENT_RECONCILIATION_SOURCE_SNAPSHOT_SHA256),
    reconciliationSourcePathCount: z.literal(14),
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
    deltaId: z.literal('current-source.duration-and-selected-pinned-timestamp-consumers-v13'),
    disposition: z.literal('CURRENT_SOURCE_REHASHED_WITH_DURATION_AND_PINNED_CONSUMER_DELTAS_CATALOG_STILL_EXCLUDED'),
    statement: z.string().min(1),
    sourceSurfaceDelta: z.object({
      priorV12PathCount: z.literal(351),
      currentPathCount: z.literal(351),
      priorV12ObservationCount: z.literal(11),
      currentObservationCount: z.literal(11),
      priorV12IdentifierOccurrences: z.literal(636),
      currentIdentifierOccurrences: z.literal(636),
      addedObservationPathCount: z.literal(0),
      addedIdentifierOccurrences: z.literal(0),
      v12ObservationShapePreserved: z.literal(true),
      currentSourceSnapshotHash: z.literal(CURRENT_SOURCE_SNAPSHOT_SHA256),
      reconciliationPathCount: z.literal(14),
      reconciliationSourceSnapshotHash: z.literal(CURRENT_RECONCILIATION_SOURCE_SNAPSHOT_SHA256),
      pipelineVideoPilotSourceSnapshotHash: z.literal(PIPELINE_VIDEO_PILOT_SOURCE_SNAPSHOT_SHA256),
    }).strict(),
    durationAuthority: z.object({
      deltaId: z.literal('current-source.project-duration-authority-v13'),
      commit: z.literal(DURATION_PHASE_COMMIT_V13),
      disposition: z.literal('FAST_USER_QA_DURATION_AUTHORITY_RECONCILED'),
      activeProjectClass: z.literal('AGENCY_100GB_4H_V1'),
      visibleJourney: z.literal('EDITRON_FAST_USER_QA_TIMELINE_EDIT_CORRECTION_UNDO_REDO_RELOAD'),
      statement: z.string().min(1),
      authorityTrace: z.object({
        loadedDurationOwner: z.string().min(1),
        editorCaller: z.string().min(1),
        persistenceOwner: z.string().min(1),
        visibleProof: z.string().min(1),
        genericSaveProof: z.string().min(1),
      }).strict(),
      proof: z.object({
        fastUserQaPath: z.literal('tests/e2e/editron-fast-user-qa.spec.ts'),
        fastUserQaStatus: z.literal('PASS'),
        stages: z.array(z.enum(['EDIT', 'CORRECTION', 'UNDO', 'REDO', 'RELOAD'])).length(5),
        persistedDurationInFrames: z.literal(300),
        visibleDurationDisplay: z.literal('00:10.00'),
        genericSavePreservation: z.literal('PASS'),
      }).strict(),
      sourceSnapshotHash: z.literal(DURATION_PHASE_SOURCE_SNAPSHOT_SHA256),
      sourcePathCount: z.literal(5),
      sourceEvidence: z.array(z.object({ path: z.string().min(1), normalizedSha256: SHA256 }).strict()).length(5),
    }).strict(),
    pinnedSourceConsumer: z.object({
      deltaId: z.literal('current-source.selected-pinned-timestamp-consumers-v13'),
      commit: z.literal(PINNED_SOURCE_CONSUMER_PHASE_COMMIT_V13),
      disposition: z.literal('WIRED_SELECTED_SOURCE_PIN_CONSUMER_CURRENT_TRUTH'),
      activeProjectClass: z.literal('AGENCY_100GB_4H_V1'),
      visibleJourney: z.literal('PROJECT_SELECTED_PROXY_MASTER_TIMESTAMP_PREVIEW_AND_ANALYSIS'),
      statement: z.string().min(1),
      pathTrace: z.object({
        sourceSelectionOwner: z.string().min(1),
        previewConsumer: z.string().min(1),
        timestampAnalysisConsumer: z.string().min(1),
        projectAnalysisCaller: z.string().min(1),
        authenticatedFinalConsumer: z.string().min(1),
        storedEvidence: z.string().min(1),
        mutationOwner: z.string().min(1),
      }).strict(),
      safetyBoundary: z.object({
        managedOverlayWithoutPin: z.literal('FAILS_CLOSED_BEFORE_DECODER_ADMISSION'),
        sourceEvidence: z.literal('EXACT_SOURCE_VERSION_EVIDENCE_AND_HASHED_V3_BINDING_REQUIRED'),
        postDecodeDrift: z.literal('RE_RESOLVES_SELECTED_SOURCE_AND_CHECKS_BINDING_AUDIO_STATE_AND_PROJECT_REVISION_WITH_CLEANUP'),
        unpinnedManagedDecode: z.literal('NOT_ALLOWED'),
      }).strict(),
      focusedProof: z.object({
        testCommand: z.string().min(1),
        testPaths: z.array(z.string().min(1)).length(5),
        passedTestCount: z.literal(43),
        status: z.literal('PASS'),
      }).strict(),
      sourceSnapshotHash: z.literal(PINNED_SOURCE_CONSUMER_PHASE_SNAPSHOT_SHA256),
      sourcePathCount: z.literal(5),
      sourceEvidence: z.array(z.object({ path: z.string().min(1), normalizedSha256: SHA256 }).strict()).length(5),
    }).strict(),
    queueStatus: z.object({
      queue3: z.object({ status: z.literal('ACTIVE_PARTIAL'), remaining: z.string().min(1) }).strict(),
      queue4: z.object({ status: z.literal('ACTIVE_PARTIAL'), remaining: z.string().min(1) }).strict(),
      queue5: z.object({ status: z.literal('OPEN'), remaining: z.string().min(1) }).strict(),
    }).strict(),
    resolvedGaps: z.array(z.string().min(1)).length(3),
    remainingGaps: z.array(z.string().min(1)).length(5),
    catalogPromotion: z.literal(false),
  }).strict(),
  reissueGate: z.object({
    priorAuditChained: z.literal(true),
    currentSourceSnapshotRecomputed: z.literal(true),
    durationPhaseEvidenceBound: z.literal(true),
    pinnedSourceConsumerPhaseEvidenceBound: z.literal(true),
    historicalV10ThroughV12Preserved: z.literal(true),
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

export type Cap2CurrentTruthReissueAuditV13 = z.infer<
  typeof cap2CurrentTruthReissueAuditSchemaV13
>;

export function parseCap2CurrentTruthReissueAuditV13(
  value: unknown,
): Cap2CurrentTruthReissueAuditV13 {
  const parsed = cap2CurrentTruthReissueAuditSchemaV13.parse(value);
  const { manifestHash, ...material } = parsed;
  if (hashCanonicalCap2ArtifactV1(material) !== manifestHash) {
    throw new Error('CAP-2 v13 manifest hash drift.');
  }
  if (hashCanonicalCap2ArtifactV1(parsed.semanticDelta)
    !== hashCanonicalCap2ArtifactV1(semanticDelta)) {
    throw new Error('CAP-2 v13 semantic delta drift.');
  }
  return parsed;
}

export function assertCap2CurrentTruthSourcesMatchV13(): void {
  if (CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13.length !== 351
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.length !== 11
    || CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13.reduce(
      (total, observation) => total + observation.observedCount,
      0,
    ) !== 636) {
    throw new Error('CAP-2 v13 current source coverage drift.');
  }
  // Bind the inherited census to the declared commit. The shared worktree may
  // carry unrelated ThinkForge edits while this Editron checkpoint is issued.
  if (hashNormalizedCap2SourceSnapshotAtCommitV13(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13)
    !== CURRENT_SOURCE_SNAPSHOT_SHA256) {
    throw new Error('CAP-2 v13 current source snapshot drift.');
  }
  assertSourceSnapshot(
    CAP2_PIPELINE_VIDEO_PILOT_SOURCE_PATHS_V12,
    PIPELINE_VIDEO_PILOT_SOURCE_SNAPSHOT_SHA256,
    'pipeline-video pilot',
  );
  assertSourceSnapshot(
    CAP2_DURATION_AUTHORITY_PHASE_SOURCE_PATHS_V13,
    DURATION_PHASE_SOURCE_SNAPSHOT_SHA256,
    'duration authority phase',
  );
  assertSourceSnapshot(
    CAP2_PINNED_SOURCE_CONSUMER_PHASE_SOURCE_PATHS_V13,
    PINNED_SOURCE_CONSUMER_PHASE_SNAPSHOT_SHA256,
    'pinned source consumer phase',
  );
  assertSourceSnapshot(
    CAP2_CURRENT_RECONCILIATION_SOURCE_PATHS_V13,
    CURRENT_RECONCILIATION_SOURCE_SNAPSHOT_SHA256,
    'current reconciliation',
  );
  for (const evidence of [
    ...pipelineVideoPilotEvidence,
    ...durationPhaseEvidence,
    ...pinnedSourceConsumerPhaseEvidence,
  ]) {
    if (hashNormalizedCap2FileV11(evidence.path) !== evidence.normalizedSha256) {
      throw new Error('CAP-2 v13 source evidence drift: ' + evidence.path + '.');
    }
  }
}

function assertSourceSnapshot(
  paths: readonly string[],
  expectedHash: string,
  label: string,
): void {
  if (hashNormalizedCap2SourceSnapshotV11(paths) !== expectedHash) {
    throw new Error('CAP-2 v13 ' + label + ' source snapshot drift.');
  }
}

function hashNormalizedCap2SourceSnapshotAtCommitV13(
  relativePaths: readonly string[],
): string {
  const rows = [...relativePaths]
    .sort(compareCodeUnits)
    .map((relativePath) => (
      `${relativePath}\0${hashNormalizedCap2FileAtCommitV13(relativePath)}`
    ));
  return createHash('sha256').update(rows.join('\n'), 'utf8').digest('hex');
}

function hashNormalizedCap2FileAtCommitV13(relativePath: string): string {
  const committedText = execFileSync(
    'git',
    ['show', `${CURRENT_COMMIT_V13}:${relativePath}`],
    { encoding: 'utf8' },
  );
  return createHash('sha256')
    .update(committedText.replaceAll('\r\n', '\n'), 'utf8')
    .digest('hex');
}

if (CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12.manifestHash !== PRIOR_MANIFEST_SHA256
  || CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12.sourceBinding.normalizedSourceSnapshotHash
    !== PRIOR_SOURCE_SNAPSHOT_SHA256) {
  throw new Error('CAP-2 v12 changed beneath the v13 reissue audit.');
}

const auditMaterial = {
  artifactType: 'EditronCapabilityCurrentTruthReissueAuditV13' as const,
  schemaVersion: 13 as const,
  authority: 'RESEARCH_CENSUS_NO_RUNTIME_MUTATION' as const,
  status: 'REISSUED_CURRENT_TRUTH_RESEARCH_ONLY' as const,
  priorAuditBinding: {
    artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12.artifactType,
    manifestHash: PRIOR_MANIFEST_SHA256,
    normalizedSourceSnapshotHash: PRIOR_SOURCE_SNAPSHOT_SHA256,
  },
  sourceBinding: {
    branch: 'infrastructure-improvs-+Editron' as const,
    commit: CURRENT_COMMIT_V13,
    normalizedSourceSnapshotHash: CURRENT_SOURCE_SNAPSHOT_SHA256,
    sourceSnapshotPathCount: 351 as const,
    sourceObservationCount: 11 as const,
    observedIdentifierOccurrences: 636 as const,
    workingTreeEvidenceStatus: 'CLEAN_BOUND_SOURCE_PATHS_AT_ISSUANCE' as const,
    reconciliationStatus: 'RECONCILED_CURRENT_SOURCE_V13_DURATION_AND_PINNED_CONSUMER_DELTAS' as const,
    durationPhaseCommit: DURATION_PHASE_COMMIT_V13,
    durationPhaseSnapshotHash: DURATION_PHASE_SOURCE_SNAPSHOT_SHA256,
    durationPhaseSourcePathCount: 5 as const,
    pinnedSourceConsumerPhaseCommit: PINNED_SOURCE_CONSUMER_PHASE_COMMIT_V13,
    pinnedSourceConsumerPhaseSnapshotHash: PINNED_SOURCE_CONSUMER_PHASE_SNAPSHOT_SHA256,
    pinnedSourceConsumerPhaseSourcePathCount: 5 as const,
    reconciliationSourceSnapshotHash: CURRENT_RECONCILIATION_SOURCE_SNAPSHOT_SHA256,
    reconciliationSourcePathCount: 14 as const,
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
    durationPhaseEvidenceBound: true as const,
    pinnedSourceConsumerPhaseEvidenceBound: true as const,
    historicalV10ThroughV12Preserved: true as const,
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

export const CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13 = deepFreeze(
  parseCap2CurrentTruthReissueAuditV13({
    ...auditMaterial,
    manifestHash: hashCanonicalCap2ArtifactV1(auditMaterial),
  }),
);

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareCodeUnits));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
