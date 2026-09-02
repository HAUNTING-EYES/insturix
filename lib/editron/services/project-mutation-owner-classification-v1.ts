export type ProjectMutationRenderEffectV1 =
  | "PROJECT_LIFECYCLE"
  | "ACTIVE_RENDER_STATE"
  | "CONDITIONAL_ACTIVE_RENDER_STATE"
  | "CANDIDATE_STATE_ONLY"
  | "COORDINATION_ONLY"
  | "METADATA_ONLY"
  | "PROOF_ONLY"
  | "LEASE_ONLY";

export type ProjectMutationSafeguardPolicyV1 =
  | "REQUIRED"
  | "CONDITIONAL"
  | "PRODUCED_BY_OWNER"
  | "NOT_APPLICABLE";

export type ProjectMutationOwnerClosureV1 =
  | "LOCAL_GUARDS_VERIFIED"
  | "QUEUE_3_4_DEPENDENCY"
  | "QUEUE_5_RETENTION_DEPENDENCY";

export interface ProjectMutationOwnerGroupV1 {
  methods: readonly string[];
  renderEffect: ProjectMutationRenderEffectV1;
  revisionFence: ProjectMutationSafeguardPolicyV1;
  rangeAndLockFence: ProjectMutationSafeguardPolicyV1;
  mediaEvidence: ProjectMutationSafeguardPolicyV1;
  rightsEvidence: ProjectMutationSafeguardPolicyV1;
  predecessorEvidence: ProjectMutationSafeguardPolicyV1;
  renderSnapshotInvalidation: ProjectMutationSafeguardPolicyV1;
  closure: ProjectMutationOwnerClosureV1;
  reason: string;
}

/**
 * Method-level Queue-5 classification for every ProjectService method that
 * currently performs a persistence write. This is an audit boundary, not a
 * creative-form owner. The paired source test fails when a new writer is not
 * deliberately classified.
 */
export const PROJECT_MUTATION_OWNER_GROUPS_V1 = {
  PROJECT_CREATION: {
    methods: [
      "createOrgProject",
      "createProject",
      "createScriptStageProject",
    ],
    renderEffect: "PROJECT_LIFECYCLE",
    revisionFence: "CONDITIONAL",
    rangeAndLockFence: "NOT_APPLICABLE",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "NOT_APPLICABLE",
    renderSnapshotInvalidation: "NOT_APPLICABLE",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "Creation has no prior render state and issues a new server-owned project identity.",
  },
  PROJECT_DELETION: {
    methods: ["deleteProject"],
    renderEffect: "PROJECT_LIFECYCLE",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "NOT_APPLICABLE",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "REQUIRED",
    closure: "QUEUE_5_RETENTION_DEPENDENCY",
    reason: "Deletion still requires an atomic tombstone plus durable render, checkpoint, chat, link and source-cleanup recovery.",
  },
  RENDER_JOB_COORDINATION: {
    methods: [
      "bindProjectRenderDispatchRecoveryTransactionV1",
      "reconcileProjectRenderJobFinalizationTransactionV1",
    ],
    renderEffect: "COORDINATION_ONLY",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "NOT_APPLICABLE",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "NOT_APPLICABLE",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "These owners reconcile a previously admitted render under one project-revision transaction fence.",
  },
  TIMELINE_RANGE_LEASE: {
    methods: [
      "acquireTimelineRangeCutLockV1",
      "releaseTimelineRangeCutLockV1",
    ],
    renderEffect: "LEASE_ONLY",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "REQUIRED",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "NOT_APPLICABLE",
    renderSnapshotInvalidation: "NOT_APPLICABLE",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "A range lease coordinates later writes but does not itself change playable project state.",
  },
  DIRECTOR_LIFECYCLE_AND_METADATA: {
    methods: [
      "acquireDirectorMutationLease",
      "claimDirectorRunV1",
      "completeDirectorRunV1",
      "failDirectorRunV1",
      "preparePipelineDirectorDispatchV1",
      "recordBatchAutoEditLifecycleV1",
      "recordDirectorAuditFactV1",
      "recordDirectorAutoBgmDecisionV1",
      "recordDirectorDecisionLogV1",
      "recordDirectorDeliveryFailureV1",
      "recordDirectorProgressV1",
      "recordPipelineDirectorIntentV1",
      "releaseDirectorMutationLease",
      "rescueFailedAutoEditToAssistV1",
    ],
    renderEffect: "METADATA_ONLY",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "NOT_APPLICABLE",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "NOT_APPLICABLE",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "These methods own Director lifecycle, dispatch, progress or audit state; final timeline writes use separate owners.",
  },
  ANALYSIS_LIFECYCLE_AND_METADATA: {
    methods: [
      "admitProjectAnalysisRunV1",
      "advanceProjectAnalysisRunV1",
      "claimProjectAnalysisDeepRunV1",
      "commitProjectAnalysisPhase2V1",
      "failProjectAnalysisRunV1",
      "prepareProjectAnalysisDeepDispatchV1",
      "prepareProjectAnalysisDirectorDispatchV1",
      "recordProjectAnalysisDeepDispatchInlineReadyV1",
      "recordProjectAnalysisDeepDispatchPublishedV1",
      "recordProjectAnalysisDirectorDispatchInlineReadyV1",
      "recordProjectAnalysisDirectorDispatchPublishedV1",
      "recordProjectAnalysisIntakeDispatchStateV1",
    ],
    renderEffect: "METADATA_ONLY",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "NOT_APPLICABLE",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "NOT_APPLICABLE",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "These methods advance a source-bound analysis state machine but do not change active playable state.",
  },
  ANALYSIS_NATIVE_AUDIO_EVIDENCE: {
    methods: ["commitProjectAnalysisPhase1V1"],
    renderEffect: "CONDITIONAL_ACTIVE_RENDER_STATE",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "CONDITIONAL",
    mediaEvidence: "PRODUCED_BY_OWNER",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "CONDITIONAL",
    closure: "QUEUE_3_4_DEPENDENCY",
    reason: "Phase-1 is metadata-only unless it changes render-consumed native-audio evidence on current video overlays.",
  },
  PROOF_AND_WARNING_PROJECTION: {
    methods: [
      "claimPhase0RenderedEvidence",
      "completeMgDesignExecutionV1",
      "recordChatRenderVerificationProjection",
      "recordPhase0ProofFacts",
      "recordPhase0RenderedEvidence",
      "recordPipelineVideoQualityWarningV1",
    ],
    renderEffect: "PROOF_ONLY",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "NOT_APPLICABLE",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "NOT_APPLICABLE",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "These owners attach outcomes, warnings or review projections and cannot alter the rendered timeline.",
  },
  GENERATED_CANDIDATE_PREPARATION: {
    methods: ["prepareProjectGeneratedCompositionV1"],
    renderEffect: "CANDIDATE_STATE_ONLY",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "REQUIRED",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "NOT_APPLICABLE",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "Preparation records a non-playable candidate while the last passing active state remains authoritative.",
  },
  GENERATED_CANDIDATE_FINALIZATION: {
    methods: ["finalizeProjectGeneratedCompositionV1"],
    renderEffect: "CONDITIONAL_ACTIVE_RENDER_STATE",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "CONDITIONAL",
    mediaEvidence: "CONDITIONAL",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "CONDITIONAL",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "PASS promotes active visual state and requires full admission; FAIL or UNVERIFIABLE retain only candidate evidence.",
  },
  PIPELINE_VIDEO_INVALIDATION_ADMISSION: {
    methods: ["admitPipelineVideoDeliveryInvalidationV1"],
    renderEffect: "COORDINATION_ONLY",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "REQUIRED",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "NOT_APPLICABLE",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "PRODUCED_BY_OWNER",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "Admission reserves one exact target and produces the invalidation prerequisite required before generation spend.",
  },
  PROXY_MASTER_ACTIVE_SOURCE: {
    methods: [
      "bindProjectOverlaysToVerifiedProxySourceV1",
      "relinkProjectProxyToQualifiedMasterV1",
    ],
    renderEffect: "ACTIVE_RENDER_STATE",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "REQUIRED",
    mediaEvidence: "REQUIRED",
    rightsEvidence: "REQUIRED",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "REQUIRED",
    closure: "QUEUE_3_4_DEPENDENCY",
    reason: "A source cutover changes active media and remains dependent on Queue 3-4 timestamp/source qualification and relinking closure.",
  },
  ACTIVE_TIMELINE_AND_DELIVERY: {
    methods: [
      "addOverlayAtRevisionV1",
      "alignCutsToBeatsAtRevisionV1",
      "applyAutoEditAssemblyV1",
      "applyVideoSourceRangeRetimeV1",
      "applyVideoSpeedRampV1",
      "attachUploadedAudioAtRevisionV1",
      "commitMgRenderDelivery",
      "commitPipelineAudioDeliveryV1",
      "commitPipelineVideoDeliveryV1",
      "commitVideoAnalysisDurationCorrectionV1",
      "cutTimelineRangeV1",
      "deleteOverlayAtRevisionV1",
      "persistEditorState",
      "reconcileProjectDurationFromOverlaysV1",
      "replaceBackgroundMusicAtRevisionV1",
      "replaceCaptionFamilyAtRevisionV1",
      "restoreCheckpointState",
      "updateOverlayAtRevisionV1",
    ],
    renderEffect: "ACTIVE_RENDER_STATE",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "REQUIRED",
    mediaEvidence: "REQUIRED",
    rightsEvidence: "REQUIRED",
    predecessorEvidence: "REQUIRED",
    renderSnapshotInvalidation: "REQUIRED",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "These owners change active playable state and enforce operation-specific prerequisites before revision CAS.",
  },
  AUDIO_RIGHTS_POLICY: {
    methods: ["commitAudioRightsAttestation"],
    renderEffect: "ACTIVE_RENDER_STATE",
    revisionFence: "REQUIRED",
    rangeAndLockFence: "REQUIRED",
    mediaEvidence: "NOT_APPLICABLE",
    rightsEvidence: "PRODUCED_BY_OWNER",
    predecessorEvidence: "NOT_APPLICABLE",
    renderSnapshotInvalidation: "REQUIRED",
    closure: "LOCAL_GUARDS_VERIFIED",
    reason: "The owner creates user-bound rights evidence, so requiring that same evidence as an input prerequisite would be circular.",
  },
} as const satisfies Record<string, ProjectMutationOwnerGroupV1>;

export function classifiedProjectMutationOwnerMethodsV1(): string[] {
  return Object.values(PROJECT_MUTATION_OWNER_GROUPS_V1)
    .flatMap((group) => [...group.methods])
    .sort();
}
