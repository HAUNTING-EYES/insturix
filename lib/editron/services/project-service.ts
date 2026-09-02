/**
 * Project Service
 *
 * Service layer for project CRUD operations
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import type { ClientSession, Collection, Filter } from "mongodb";

import { connectToDatabase, getDatabase, COLLECTIONS } from "../db/mongodb";
import { assetResolver } from "./asset-resolver";
import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from "./canonical-json-v1";
import { buildProjectAnalysisAssetSet } from "./project-analysis-storage";
import { canRescueToDirectorMode } from "./assist-lane-predicates";
import {
  projectRevisionPredicate,
  readProjectRevisionV1,
  type ProjectRevisionV1,
} from "./project-revision-v1";
export type { ProjectRevisionV1 } from "./project-revision-v1";
import type { NativeAudioEvidence } from "./native-audio-evidence";
import {
  autoBgmDecisionEvidenceHashV1,
  type AutoBgmDecisionEvidence,
} from "./auto-bgm-decision";
import {
  assertDirectorAuditFactV1,
  type DirectorAuditFactV1,
} from "./director-audit-fact-v1";
import {
  assertPersistedDirectorDecisionLogV1,
  type PersistedDirectorDecisionLogV1,
} from "./director-decision-log-v1";
import type { EdlProjectEvidenceV1 } from "./edl-executor";
import { mgDeliveryRecordSchema } from "../motion-graphics/codegen/mg-delivery-record";
import { videoTasteContractSchema } from "../motion-graphics/codegen/taste/taste-schemas";
import {
  MAX_RENDER_FINALIZATION_ATTEMPTS,
  PROJECT_ARTIFACT_NOT_CURRENT,
  PROJECT_RENDER_JOBS_COLLECTION_V1,
  ProjectRenderJobAuthorizationSchema,
  createProjectRenderDispatchIdentityV1,
  claimFailedProjectRenderJobFinalizationRetryV1,
  claimProjectRenderCompletionEffectsV1,
  claimProjectRenderJobFinalizationV1,
  completeProjectRenderCompletionEffectsV1,
  completeProjectRenderJobFinalizationV1 as completeBoundProjectRenderJobFinalizationV1,
  failProjectRenderJobFromProviderV1,
  failProjectRenderJobFinalizationV1 as failBoundProjectRenderJobFinalizationV1,
  fenceStaleProjectRenderJobFinalizationV1,
  fenceStaleProjectRenderJobFinalizationWithCleanupV1,
  fenceStaleProjectRenderJobProviderOutputV1,
  fenceStaleProjectRenderJobProviderOutputWithCleanupV1,
  releaseFailedProjectRenderJobFinalizationRetryClaimV1,
  releaseProjectRenderCompletionEffectsV1,
  releaseProjectRenderJobFinalizationClaimV1,
  updateProjectRenderJobProgressV1,
  type ProjectRenderCompletionEffectsClaimV1,
  type ProjectRenderFinalizationClaimV1,
  type ProjectRenderJobAuthorizationV1,
  type ProjectRenderJobMutationResultV1,
  type ProjectRenderJobNotCurrentResultV1,
} from "./render-job-service";
import {
  CHAPTER_RENDER_CLEANUP_CHAPTERS_COLLECTION_V1,
  materializeChapterRenderCleanupV1,
  type ChapterRenderCleanupBoundaryV1,
  type ChapterRenderCleanupChapterDocumentV1,
  type ChapterRenderCleanupMaterializerResultV1,
  type ChapterRenderCleanupParentDocumentV1,
  type ChapterRenderCleanupProviderOutputV1,
} from "./chapter-render-cleanup-materializer-v1";
import {
  completeChapterParentOrchestrationV1,
  failChapterParentOrchestrationV1,
  reconcileStaleChapterParentOrchestrationV1,
} from "./chapter-parent-orchestration-v1";
import {
  RenderJobChapterOrchestrationSchema,
  RenderJobSchema,
  type RenderJob,
} from "../schemas/render-job";
import {
  PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
  ProjectRenderSourceCleanupAwsRegionSchemaV1,
  type ProjectRenderSourceCleanupOutboxV1,
} from "./project-render-source-cleanup-v1";
import {
  PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1,
  type ProjectChapterConcatCleanupOutboxV1,
} from "./chapter-concat-cleanup-v1";
import { assertProjectRenderSnapshotBindingV1 } from "./project-render-snapshot-binding-v1";
import type {
  Keyframe,
  KeyframeTrack,
  ClipOverlay,
  Overlay,
  AspectRatio,
} from "@/components/editron/editor/version-7.0.0/types";
import {
  ensureAtomicOverlayReceipt,
  ensureLiveAtomicOverlayReceipt,
  withAtomicOverlayUpdateReceipt,
} from "../engine/overlay-atomic-receipts";
import { nanoid } from "nanoid";
import {
  assertEditorTimelineMarkers,
  mergeServerOwnedOverlayDataForSave,
  type EditorTimelineMarker,
  type OverlaySaveAuthority,
} from "@/lib/editron/shared/project-save-payload";
import { orgMemberService } from "@/lib/services/orgMemberService";
import { removeProjectFromLinks } from "@/lib/shared/project-links";
import { isOrgWalletBillingEnabled } from "@/lib/services/org-wallet-flag";
import { resolveCreationVisibility } from "./project-ownership";
import type {
  ChatEditRenderVerificationLifecycleState,
  ChatEditRenderVerificationRecord,
} from "./chat-edit-render-verification-lifecycle";
import {
  getAudioRightsContractIssue,
  getGeneratedNativeVideoReceiptIssue,
  type AudioRightsContract,
} from "@/lib/editron/shared/render-request-payload";
import { sfxAcousticMeasurementSchema } from "@/lib/pipeline/sfx-acoustic-measurement";
import {
  createPendingProjectGeneratedCompositionStateV1,
  hasSamePreparedCompositionMaterialV1,
  parseProjectGeneratedCompositionDraftV1,
  parseProjectGeneratedCompositionEntryV1,
  parseProjectGeneratedCompositionStateTokenV1,
  type ProjectGeneratedCompositionDraftV1,
  type ProjectGeneratedCompositionEntryV1,
} from "./project-generated-composition-entry-v1";
import {
  parseProjectGeneratedCompositionStateV1,
} from "./project-generated-composition-state-verifier-v1";
import type { ProjectGeneratedCompositionStateV1 } from "./project-generated-composition-state-v1";
import {
  cutTimelineRange,
  type TimelineFrameRangeV1,
  type TimelineRangeCutCoordinateTransformV1,
  type TimelineRangeCutResult,
  type TimelineRangeCutSplitChildV1,
} from "./timeline-range-cut";
import {
  ROW,
  alignCutsToBeatsWithEvidence,
  type BeatAlignmentResult,
} from "@/lib/pipeline/scene-to-editron";
import { resolveBeatSyncMutationV1 } from "./beat-sync-mutation-v1";
import {
  clonePipelineAudioCanonicalValueV1,
  isPipelineAudioOverlayForKindV1,
  pipelineAudioDeliveryMaterialHashV1,
  preparePipelineAudioDeliveryOverlaysV1,
  projectPipelineAudioTimelineBindingHashV1,
  type PipelineAudioDeliveryBeatV1,
  type PipelineAudioDeliveryKindV1,
  type PipelineAudioDeliveryOutcomeV1,
} from "./pipeline-audio-project-delivery-v1";
import { assertMusicCoveragePlan } from "./music-coverage-runtime";
import {
  assertPipelineVideoDeliveryInvalidationAdmissionV1,
  assertPipelineVideoProjectDeliveryPrerequisiteV1,
  clonePipelineVideoCanonicalValueV1,
  materializePipelineVideoProjectDeliveryPrerequisiteV1,
  pipelineVideoDeliveryInvalidationAdmissionHashV1,
  pipelineVideoDeliveryInvalidationAdmissionKeyV1,
  pipelineVideoDeliveryExactFrameRangeV1,
  pipelineVideoDeliveryMaterialHashV1,
  pipelineVideoDeliveryTargetFingerprintV1,
  type PipelineVideoDeliveryInvalidationAdmissionV1,
  type PipelineVideoDeliveryMaterialV1,
  type PipelineVideoProjectDeliveryPrerequisiteV1,
} from "./pipeline-video-project-delivery-v1";
import {
  applyProjectArtifactInvalidationProgressV1,
  assertProjectArtifactInvalidationOutboxV1,
  assertProjectArtifactInvalidationReceiptV1,
  createProjectArtifactInvalidationOutboxV1,
  createProjectArtifactInvalidationReceiptV1,
  enqueueProjectArtifactInvalidationOutboxV1,
  PROJECT_ARTIFACT_INVALIDATION_OUTBOX_COLLECTION_V1,
  replaceProjectArtifactInvalidationOutboxV1,
  sameProjectArtifactRevisionV1,
  type ProjectArtifactInvalidationFenceV1,
  type ProjectArtifactInvalidationOutboxCollectionV1,
  type ProjectArtifactInvalidationOutboxV1,
  type ProjectArtifactInvalidationReceiptV1,
  type ProjectArtifactInvalidationDerivativeClassV1,
} from "./project-artifact-invalidation-v1";
import {
  createProjectRenderSnapshotInvalidationOutboxV1,
  createProjectRenderSnapshotInvalidationReceiptV1,
  enqueueProjectRenderSnapshotInvalidationOutboxV1,
  projectRenderSnapshotInvalidationLinkV1,
  PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
  type ProjectRenderSnapshotInvalidationLinkV1,
  type ProjectRenderSnapshotInvalidationOutboxCollectionV1,
} from "./project-render-snapshot-invalidation-v1";
import {
  materializeProjectWholeStateMediaPrerequisiteInMongoV1,
  projectWholeStateMediaPrerequisiteLinkV1,
  type ProjectWholeStateMediaPrerequisiteLinkV1,
} from "./project-whole-state-media-prerequisite-runtime-v1";
import {
  assertProjectVideoSpeedRampStateV1,
  classifyVerifiedVideoSourceRateCompatibilityV1,
  createProjectVideoSourceTimeTransformV1,
  rebindSourcePresentationTimestampV1,
  resolveVerifiedVideoSourceEpochTimeBindingV3,
  resolveVerifiedVideoSourceTimeBindingV1,
  type ProjectVideoSourceTimeTransformV1,
  type SourcePresentationTimestampRebindV1,
} from "./video-source-time-transform-v1";
import {
  retimeIsolatedVideoSourceRangeV1,
  type VideoSourceRangeRetimeEffectV1,
  type VideoSourceRangeRetimeSafeStopReasonV1,
} from "./video-source-range-retime-v1";
import {
  readMediaProxyMasterActiveMappingAssetStateV1,
  type MediaProxyMasterActiveMappingAssetInputV1,
  type MediaProxyMasterActiveMappingAssetStateV1,
} from "./media-proxy-master-active-mapping-asset-owner-v1";
import {
  assertMediaProxyMasterExactBoundaryResolutionReceiptV1,
  type MediaProxyMasterExactBoundaryResolutionReceiptV1,
} from "./media-proxy-master-exact-boundary-resolver-v1";
import type { MediaProxyMasterTimeMapReferenceV1 }
  from "./media-proxy-master-time-mapping-v1";
import {
  PROJECT_PROXY_MASTER_RELINK_POLICY_V1,
  assertProjectProxyMasterRelinkStateHistoryV1,
  assertProjectProxyMasterRelinkStateV1,
  assertProjectProxySourceBindingHistoryV1,
  createProjectProxySourceBindingAdmissionReceiptV1,
  createProjectProxySourceBindingCommitReceiptV1,
  createProjectProxySourceBindingV1,
  createProjectProxyMasterRelinkCommitReceiptV1,
  createProjectProxyMasterRelinkStateV1,
  type ProjectProxyMasterRelinkActorKindV1,
  type ProjectProxyMasterRelinkCommitReceiptV1,
  type ProjectProxyMasterRelinkOverlayChangeV1,
  type ProjectProxyMasterRelinkStateV1,
  type ProjectProxySourceBindingAdmissionReceiptV1,
  type ProjectProxySourceBindingCommitReceiptV1,
  type ProjectProxySourceBindingOverlayV1,
  type ProjectProxySourceBindingV1,
} from "./project-proxy-master-relink-contract-v1";
import {
  assertProjectVideoSourceVersionPinV1,
  createProjectVideoSourceVersionPinV1,
  type ProjectVideoSourceVersionPinAuthorityV1,
  type ProjectVideoSourceVersionPinV1,
} from "./project-video-source-version-pin-v1";

export interface EditorState {
  overlays: Overlay[];
  aspectRatio: AspectRatio;
  playerDimensions: {
    width: number;
    height: number;
  };
  fps?: number;
  durationInFrames?: number;
  /** User-authored named timeline markers; omitted means preserve legacy data. */
  markers?: EditorTimelineMarker[];
}

export interface ProjectMutationReceiptV1 {
  schemaVersion: 1;
  projectId: string;
  revision: ProjectRevisionV1;
  committedAt: string;
}

export interface ProjectProxyMasterRelinkCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectProxyMasterRelinkActorKindV1;
  assetId: string;
  boundaryResolution: MediaProxyMasterExactBoundaryResolutionReceiptV1;
}

export interface ProjectProxySourceBindingCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectProxyMasterRelinkActorKindV1;
  assetId: string;
}

export type ProjectProxySourceBindingBlockReasonV1 =
  | "SOURCE_ASSET_NOT_FOUND"
  | "ASSET_EVIDENCE_UNAVAILABLE"
  | "VERIFIED_V3_PROXY_SOURCE_REQUIRED"
  | "TARGET_OVERLAYS_NOT_FOUND"
  | "TARGET_OVERLAY_IDENTITY_INVALID"
  | "SOURCE_RANGE_INCOMPLETE"
  | "SOURCE_RANGE_INVALID"
  | "SOURCE_COORDINATE_CONFLICT"
  | "BINDING_HISTORY_INVALID"
  | "RELINK_ALREADY_PRESENT"
  | "ASSET_CHANGED_BEFORE_COMMIT";

export type ProjectProxySourceBindingResultV1 =
  | Readonly<{
      disposition: "APPLIED" | "UNCHANGED";
      commitReceipt: ProjectProxySourceBindingCommitReceiptV1;
      admissionReceipt: ProjectProxySourceBindingAdmissionReceiptV1;
    }>
  | Readonly<{
      disposition: "COMMITTED_REVALIDATION_REQUIRED";
      reason:
        | "ASSET_CHANGED_AFTER_COMMIT"
        | "ASSET_REVALIDATION_UNAVAILABLE";
      commitReceipt: ProjectProxySourceBindingCommitReceiptV1;
    }>;

export type ProjectProxyMasterRelinkBlockReasonV1 =
  | "SOURCE_ASSET_NOT_FOUND"
  | "ASSET_EVIDENCE_UNAVAILABLE"
  | "ACTIVE_MAPPING_NOT_FOUND"
  | "ACTIVE_MAPPING_INVALID"
  | "BOUNDARY_EVIDENCE_INVALID"
  | "TARGET_OVERLAYS_NOT_FOUND"
  | "TARGET_OVERLAY_IDENTITY_INVALID"
  | "SOURCE_RANGE_INCOMPLETE"
  | "SOURCE_RANGE_INVALID"
  | "SOURCE_COORDINATE_CONFLICT"
  | "SOURCE_COORDINATE_UNREPRESENTABLE"
  | "AUDIO_RIGHTS_REQUIRED_OR_INVALID"
  | "SOURCE_BINDING_NOT_FOUND"
  | "SOURCE_BINDING_STALE_OR_MISMATCHED"
  | "SOURCE_PIN_MISSING_OR_INVALID"
  | "RELINK_HISTORY_INVALID"
  | "EXISTING_MASTER_BINDING_REBASE_REQUIRED"
  | "EXISTING_MASTER_BINDING_DRIFTED"
  | "ASSET_CHANGED_BEFORE_COMMIT";

export type ProjectProxyMasterRelinkResultV1 =
  | Readonly<{
      disposition: "APPLIED" | "UNCHANGED";
      commitReceipt: ProjectProxyMasterRelinkCommitReceiptV1;
    }>
  | Readonly<{
      disposition: "COMMITTED_REVALIDATION_REQUIRED";
      reason:
        | "ASSET_CHANGED_AFTER_COMMIT"
        | "ASSET_REVALIDATION_UNAVAILABLE";
      commitReceipt: ProjectProxyMasterRelinkCommitReceiptV1;
    }>;

/**
 * Current product frame-coordinate vocabulary for ProjectService timeline
 * changes. This deliberately does not claim rational, PTS, VFR, reel or
 * timecode semantics; those belong to the later canonical media spine.
 */
export type ProjectTimelineChangeActorKindV1 =
  | "USER"
  | "AGENT"
  | "SYSTEM"
  /** Existing direct callers have not yet supplied reliable actor provenance. */
  | "UNKNOWN_LEGACY_CALLER";

/** Current mutation commands must always identify their real calling authority. */
export type ProjectTimelineMutationActorKindV1 = Exclude<
  ProjectTimelineChangeActorKindV1,
  "UNKNOWN_LEGACY_CALLER"
>;

export type ProjectTimelineRangeChangeOperationV1 =
  | "CUT_TIMELINE_RANGE"
  | "AUTO_EDIT_ASSEMBLY"
  | "REPLACE_EDITOR_STATE"
  | "RESTORE_CHECKPOINT_STATE"
  | "ADD_OVERLAY"
  | "UPDATE_OVERLAY"
  | "REPLACE_CAPTION_FAMILY"
  | "REPLACE_BACKGROUND_MUSIC"
  | "ALIGN_CUTS_TO_BEATS"
  | "APPLY_VIDEO_SPEED_RAMP"
  | "RETIME_VIDEO_SOURCE_RANGE"
  | "DELETE_OVERLAY"
  | "REPLACE_PIPELINE_VIDEO_DELIVERY"
  | "CORRECT_VIDEO_ANALYSIS_DURATION"
  | "RECONCILE_PROJECT_DURATION";

export type ProjectTimelineRippleEffectV1 =
  | {
      kind: "REMOVE_AND_SHIFT_LEFT";
      removedFrameRange: TimelineFrameRangeV1;
      shiftedBeforeFrameRange: TimelineFrameRangeV1 | null;
      shiftedAfterFrameRange: TimelineFrameRangeV1 | null;
      deltaFrames: number;
    }
  | {
      kind: "RETIME_AND_SHIFT_LEFT";
      retimedBeforeFrameRange: TimelineFrameRangeV1;
      retimedAfterFrameRange: TimelineFrameRangeV1;
      shiftedBeforeFrameRange: TimelineFrameRangeV1 | null;
      shiftedAfterFrameRange: TimelineFrameRangeV1 | null;
      deltaFrames: number;
    }
  | {
      kind: "REPLACE_SOURCE_WITH_ASSEMBLY";
      sourceBeforeFrameRange: TimelineFrameRangeV1;
      assemblyAfterFrameRange: TimelineFrameRangeV1;
      shiftedBeforeFrameRange: TimelineFrameRangeV1 | null;
      shiftedAfterFrameRange: TimelineFrameRangeV1 | null;
      deltaFrames: number;
    };

/**
 * The local timeline footprint of a direct overlay mutation. Its union is the
 * occupied range across whichever exact before/after intervals exist; it is
 * null only when legacy timing cannot be represented as project-frame
 * integers. Such a receipt is deliberately unusable for rebase.
 */
export interface ProjectTimelineOverlayTemporalChangeV1 {
  overlayRef: string;
  beforeFrameRange: TimelineFrameRangeV1 | null;
  afterFrameRange: TimelineFrameRangeV1 | null;
  unionFrameRange: TimelineFrameRangeV1 | null;
}

/**
 * A ProjectService-owned, durable account of one timeline mutation. The
 * invalidation status is intentionally non-passing until the Stage-2 media /
 * evidence owner can materialize actual artifact invalidations.
 */
export type ProjectTimelineDownstreamInvalidationV1 =
  | {
      status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN";
      affectedFrameRangesBefore: readonly TimelineFrameRangeV1[];
    }
  | {
      status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING";
      affectedFrameRangesBefore: readonly TimelineFrameRangeV1[];
      projectRenderSnapshotInvalidation: ProjectRenderSnapshotInvalidationLinkV1;
    };

export interface ProjectTimelineRangeChangeReceiptV1 {
  schemaVersion: 1;
  receiptId: string;
  projectId: string;
  operation: ProjectTimelineRangeChangeOperationV1;
  actorKind: ProjectTimelineChangeActorKindV1;
  coordinateDomain: "PROJECT_TIMELINE_FRAME_V1";
  fps: number;
  beforeProjectRevision: ProjectRevisionV1;
  afterProjectRevision: ProjectRevisionV1;
  committedAt: string;
  readFrameRangesBefore: readonly TimelineFrameRangeV1[];
  writeFrameRangesBefore: readonly TimelineFrameRangeV1[];
  affectedFrameRangesAfter: readonly TimelineFrameRangeV1[];
  affectedOverlayRefs: readonly string[];
  changedPaths: readonly string[];
  /** `EXACT` is required before this receipt can participate in a safe rebase. */
  rangeObservation: "EXACT" | "UNKNOWN_LEGACY_OVERLAY_TIMING";
  overlayTemporalChange: ProjectTimelineOverlayTemporalChangeV1 | null;
  timelineCoordinateTransform: TimelineRangeCutCoordinateTransformV1 | null;
  /** Present only for a ProjectService-issued video retime write. Historical
      receipts omit it; other current direct-overlay writes persist `null`. */
  sourceTimeTransform?: ProjectVideoSourceTimeTransformV1 | null;
  splitChildren: readonly TimelineRangeCutSplitChildV1[];
  ripple: ProjectTimelineRippleEffectV1 | null;
  downstreamInvalidation: ProjectTimelineDownstreamInvalidationV1;
  wholeStateMediaPrerequisite?: ProjectWholeStateMediaPrerequisiteLinkV1;
}

export interface ProjectTimelineRangeCutCommandV1 {
  /** Omit only for an interactive caller that asks ProjectService to take its
      own immediate snapshot. Background/planned work must carry this token. */
  expectedRevision?: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  startFrame: number;
  endFrame: number;
  /** Optional lease identity. When present, it must cover the cut's full ripple tail. */
  rangeCutLockId?: string;
}

export interface ProjectTimelineRangeCutRebaseV1 {
  disposition: "FRESH" | "SAFE_REBASED";
  requestedRevision: ProjectRevisionV1;
  appliedBaseRevision: ProjectRevisionV1;
  traversedReceiptIds: readonly string[];
}

export interface ProjectTimelineRangeCutResultV1 {
  cut: TimelineRangeCutResult;
  mutationReceipt: ProjectMutationReceiptV1;
  timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1;
  rebase: ProjectTimelineRangeCutRebaseV1;
}

export interface ProjectDirectOverlayMutationResultV1 {
  mutationReceipt: ProjectMutationReceiptV1;
  timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1;
}

export interface ProjectOverlayAddCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  overlay: Overlay;
}

export interface ProjectUploadedAudioAttachCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  overlay: Overlay;
}

export type ProjectUploadedAudioAttachResultV1 =
  | ({ disposition: "APPLIED" } & ProjectDirectOverlayMutationResultV1)
  | {
      disposition: "ALREADY_ATTACHED";
      currentRevision: ProjectRevisionV1;
      mutationReceipt: null;
      timelineChangeReceipt: null;
    };

export type ProjectOverlayIdentityV1 = number | string;

export interface ProjectOverlayUpdateCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  overlayId: ProjectOverlayIdentityV1;
  updates: Partial<Overlay>;
}

export interface ProjectOverlayDeleteCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  overlayId: ProjectOverlayIdentityV1;
}

export interface ProjectCaptionFamilyReplaceCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  candidateOverlays: readonly Overlay[];
}

export type ProjectCaptionFamilyReplaceResultV1 =
  | ({ disposition: "APPLIED" } & ProjectDirectOverlayMutationResultV1)
  | {
      disposition: "UNCHANGED";
      mutationReceipt: null;
      timelineChangeReceipt: null;
    };

export type ProjectBackgroundMusicEvidenceV1 =
  | {
      kind: "ASSIGNMENT";
      usageMode: "embedded" | "reference-only";
      receipt: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "CHAT_CHANGE";
      receipt: Readonly<Record<string, unknown>>;
    };

export interface ProjectBackgroundMusicReplaceCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  candidateOverlays: readonly Overlay[];
  musicCoveragePlan: unknown;
  evidence: ProjectBackgroundMusicEvidenceV1;
}

export type ProjectBackgroundMusicReplaceResultV1 =
  | ({ disposition: "APPLIED" } & ProjectDirectOverlayMutationResultV1)
  | {
      disposition: "UNCHANGED";
      mutationReceipt: null;
      timelineChangeReceipt: null;
    };

export type ProjectBeatSyncEvidenceSourceV1 =
  | "persisted-beat-grid"
  | "cached-beat-analysis"
  | "beat-analysis-route";

export interface ProjectBeatSyncCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  audioOverlayId: ProjectOverlayIdentityV1;
  targetOverlayId?: ProjectOverlayIdentityV1;
  beatFilter: "all" | "downbeats" | "strong";
  strengthThreshold: number;
  evidenceSource: ProjectBeatSyncEvidenceSourceV1;
}

export interface ProjectBeatSyncResolutionSummaryV1 {
  sourceBeatCount: number;
  timelineBeatCount: number;
  alignment: BeatAlignmentResult;
}

export type ProjectBeatSyncResultV1 =
  | ({
      disposition: "APPLIED";
      resolution: ProjectBeatSyncResolutionSummaryV1;
    } & ProjectDirectOverlayMutationResultV1)
  | {
      disposition: "UNCHANGED";
      reason:
        | "MISSING_LICENSED_BEATS"
        | "BEATS_OUTSIDE_ACTIVE_MUSIC"
        | "NO_SAFE_BOUNDARY_ALIGNMENT";
      resolution: ProjectBeatSyncResolutionSummaryV1;
      mutationReceipt: null;
      timelineChangeReceipt: null;
    };

export interface ProjectAutoEditAssemblyCutV1 {
  clipId: ProjectOverlayIdentityV1;
  sourceStartFrame: number;
  sourceEndFrame: number;
}

export interface ProjectAutoEditAssemblyCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  sourceOverlayId: ProjectOverlayIdentityV1;
  cuts: readonly ProjectAutoEditAssemblyCutV1[];
}

export interface ProjectAutoEditAssemblyResultV1
  extends ProjectDirectOverlayMutationResultV1 {
  clipIds: readonly ProjectOverlayIdentityV1[];
  clipsCreated: number;
  totalDurationInFrames: number;
}

export interface ProjectVideoSpeedRampCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  overlayId: number;
  speedCurve: readonly Keyframe[];
  keyframeTracks: readonly KeyframeTrack[];
}

export type ProjectVideoSpeedRampSafeStopReasonV1 =
  | "SOURCE_ASSET_NOT_FOUND"
  | "SOURCE_TIME_EVIDENCE_INCOMPLETE"
  | "SOURCE_HANDLES_INSUFFICIENT"
  | "SOURCE_EVENT_REBIND_UNSUPPORTED"
  | "PROJECT_RATIONAL_TIMEBASE_REQUIRED"
  | "SOURCE_PROJECT_RATE_MISMATCH";

export type ProjectVideoSpeedRampResultV1 =
  | ({ disposition: "APPLIED"; sourceTimeTransform: ProjectVideoSourceTimeTransformV1 }
      & ProjectDirectOverlayMutationResultV1)
  | {
      disposition: "SAFE_STOP";
      reason: ProjectVideoSpeedRampSafeStopReasonV1;
      currentRevision: ProjectRevisionV1;
    };

export interface ProjectVideoSourceRangeRetimeCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  overlayId: number;
  playbackRate: number;
}

export type ProjectVideoSourceRangeRetimeSafeStopReasonV1 =
  | ProjectVideoSpeedRampSafeStopReasonV1
  | VideoSourceRangeRetimeSafeStopReasonV1;

export type ProjectVideoSourceRangeRetimeResultV1 =
  | ({
      disposition: "APPLIED";
      sourceRangeRetimeEffect: VideoSourceRangeRetimeEffectV1;
      sourceTimeTransform: ProjectVideoSourceTimeTransformV1;
    } & ProjectDirectOverlayMutationResultV1)
  | {
      disposition: "SAFE_STOP";
      reason: ProjectVideoSourceRangeRetimeSafeStopReasonV1;
      currentRevision: ProjectRevisionV1;
    };

export type ProjectVideoSourceEventRebindResultV1 =
  | SourcePresentationTimestampRebindV1
  | Readonly<{
      disposition: "UNVERIFIABLE";
      reason:
        | "PROJECT_REVISION_STALE"
        | "SOURCE_TIME_TRANSFORM_NOT_CURRENT"
        | "OVERLAY_SOURCE_CHANGED"
        | "SOURCE_ASSET_NOT_FOUND"
        | "SOURCE_TIME_EVIDENCE_INCOMPLETE";
    }>;

/** A derived-duration reconciliation reads canonical overlay timing itself. */
export interface ProjectDurationReconciliationCommandV1 {
  actorKind: ProjectTimelineMutationActorKindV1;
}

export type ProjectDurationReconciliationNotEligibleReasonV1 =
  | "PROJECT_FPS_INVALID"
  | "PROJECT_DURATION_INVALID"
  | "OVERLAY_TIMING_UNREPRESENTABLE";

export type ProjectDurationReconciliationResultV1 =
  | {
      disposition: "APPLIED";
      durationInFrames: number;
      mutationReceipt: ProjectMutationReceiptV1;
      timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1;
    }
  | {
      disposition: "ALREADY_CURRENT";
      durationInFrames: number;
      currentRevision: ProjectRevisionV1;
    }
  | {
      disposition: "NOT_ELIGIBLE";
      reason: ProjectDurationReconciliationNotEligibleReasonV1;
      currentRevision: ProjectRevisionV1;
    };

/**
 * A short-lived ProjectService-owned lease for a ripple cut's complete
 * pre-cut tail. It is not a general range-locking system: only
 * `cutTimelineRangeV1` honors it in this first bounded slice.
 */
export interface ProjectTimelineRangeCutLockV1 {
  schemaVersion: 1;
  lockId: string;
  actorKind: ProjectTimelineMutationActorKindV1;
  frameRange: TimelineFrameRangeV1;
  acquiredAt: string;
  expiresAt: string;
}

export interface ProjectTimelineRangeCutLockAcquireCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  startFrame: number;
  endFrame: number;
  /** Bounded to keep a coordination lease from becoming a hidden project lock. */
  ttlMs?: number;
}

export interface ProjectTimelineRangeCutLockReleaseCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  lockId: string;
}

export interface ProjectTimelineRangeCutLockResultV1 {
  lock: ProjectTimelineRangeCutLockV1;
  mutationReceipt: ProjectMutationReceiptV1;
}

export type ProjectGeneratedCompositionPrepareCommandV1 =
  | {
      kind: "INSERT";
      expectedRevision: ProjectRevisionV1;
      draft: ProjectGeneratedCompositionDraftV1;
    }
  | {
      kind: "REVISE";
      expectedRevision: ProjectRevisionV1;
      expectedBaseStateToken: string;
      draft: ProjectGeneratedCompositionDraftV1;
    };

export interface ProjectGeneratedCompositionFinalizeCommandV1 {
  expectedRevision: ProjectRevisionV1;
  terminalState: ProjectGeneratedCompositionStateV1;
}

export interface ProjectGeneratedCompositionMutationResultV1 {
  entry: ProjectGeneratedCompositionEntryV1;
  receipt: ProjectMutationReceiptV1;
}

export type ProjectAudioRightsAttestationKindV1 =
  | "native-video"
  | "uploaded-export-audio";

export interface ProjectAudioRightsAttestationStoryboardUpdateV1 {
  storyboardId: string;
  scenes: unknown[];
}

/**
 * The one ProjectService command that binds legacy audio-rights evidence to
 * the project revision it changes. Asset and storyboard writes remain in the
 * same Mongo transaction as the timeline update.
 */
export interface ProjectAudioRightsAttestationCommitV1 {
  kind: ProjectAudioRightsAttestationKindV1;
  expectedRevision: ProjectRevisionV1;
  updatedAt: Date;
  overlays: Overlay[];
  rightsByAssetId: Record<string, AudioRightsContract>;
  storyboardUpdates?: ProjectAudioRightsAttestationStoryboardUpdateV1[];
}

/**
 * The durable MG worker's outcome ledger entry. This is deliberately a narrow
 * project mutation rather than a generic worker field-update port.
 */
export interface ProjectMgRenderGeneratedOutcomeV1 {
  jobId: string;
  status: "generated";
  candidateId: string;
  factKind: string;
  frame: number;
  sequenceId: string;
  completedAt: Date;
}

export interface ProjectMgRenderNonGeneratedOutcomeV1 {
  jobId: string;
  status: "declined" | "fallback";
  candidateId: string;
  factKind: string;
  frame: number;
  reason: string;
  completedAt: Date;
}

export type ProjectMgRenderDeliveryOutcomeV1 =
  | ProjectMgRenderGeneratedOutcomeV1
  | ProjectMgRenderNonGeneratedOutcomeV1;

/**
 * The one ProjectService command that lands an asynchronous MG result. The
 * rendered media asset and job lease remain owned by their existing services.
 */
export interface ProjectMgRenderDeliveryCommitV1 {
  expectedRevision: ProjectRevisionV1;
  jobId: string;
  overlays: Overlay[];
  outcome: ProjectMgRenderDeliveryOutcomeV1;
}

export interface ProjectMgDesignExecutionResultV1 {
  jobId: string;
  decisionsExecuted: number;
  decisionsSkipped: number;
  renderJobsQueued: number;
  approvedCount: number;
  declinedCount: number;
  unavailableCount: number;
  completedAt: string;
  projectEvidence: EdlProjectEvidenceV1;
}

export interface ProjectMgDesignCompletionCommandV1 {
  expectedRevision: ProjectRevisionV1;
  leaseId: string;
  result: ProjectMgDesignExecutionResultV1;
}

export type ProjectMgDesignCompletionResultV1 =
  | { disposition: "RECORDED"; receipt: ProjectMutationReceiptV1 }
  | { disposition: "ALREADY_COMPLETED" }
  | { disposition: "JOB_OWNERSHIP_LOST" }
  | { disposition: "PROJECT_NOT_FOUND" }
  | { disposition: "PROJECT_CONFLICT"; currentRevision: ProjectRevisionV1 };

/**
 * A signed asynchronous audio worker supplies already-generated material.
 * ProjectService alone decides whether it can land on the current project.
 */
export interface ProjectPipelineAudioDeliveryCommandV1 {
  expectedRevision: ProjectRevisionV1;
  planningTimelineBindingHash: string;
  deliveryId: string;
  kind: PipelineAudioDeliveryKindV1;
  outcome: PipelineAudioDeliveryOutcomeV1;
  overlays: Overlay[];
  musicCoveragePlan?: unknown;
  beatFrames?: readonly PipelineAudioDeliveryBeatV1[];
  warnings?: readonly Record<string, unknown>[];
}

export type ProjectPipelineAudioDeliveryRebaseV1 =
  | "FRESH"
  | "SAFE_REBASED_AUDIO_ONLY"
  | "WARNING_ONLY_REBASED";

export interface ProjectPipelineAudioDeliveryReceiptV1 {
  schemaVersion: 1;
  deliveryId: string;
  kind: PipelineAudioDeliveryKindV1;
  outcome: PipelineAudioDeliveryOutcomeV1;
  materialHash: string;
  planningTimelineBindingHash: string;
  beforeRevision: ProjectRevisionV1;
  afterRevision: ProjectRevisionV1;
  mutationReceipt: ProjectMutationReceiptV1;
  rebase: ProjectPipelineAudioDeliveryRebaseV1;
  attachedOverlayIds: readonly string[];
  beatAlignment: {
    snappedCount: number;
    changedOverlayIds: readonly string[];
    rejectedCount: number;
  } | null;
  changedPaths: readonly string[];
  proof: {
    required: boolean;
    status: "UNVERIFIABLE" | null;
    reason: string;
  };
  committedAt: string;
}

export type ProjectPipelineAudioDeliveryRebaseBlockReasonV1 =
  | "TIMELINE_BINDING_CHANGED"
  | "LEGACY_REVISION_DRIFT";

export class ProjectPipelineAudioDeliveryRebaseBlockedError extends Error {
  readonly code = "PROJECT_PIPELINE_AUDIO_DELIVERY_REBASE_BLOCKED";

  constructor(
    readonly currentRevision: ProjectRevisionV1,
    readonly reason: ProjectPipelineAudioDeliveryRebaseBlockReasonV1,
  ) {
    super("Pipeline audio delivery cannot safely rebase: " + reason + ".");
    this.name = "ProjectPipelineAudioDeliveryRebaseBlockedError";
  }
}

export interface ProjectPipelineAudioDeliveryResultV1 {
  disposition: "APPLIED" | "ALREADY_APPLIED";
  deliveryReceipt: ProjectPipelineAudioDeliveryReceiptV1;
}

/**
 * A generated-video worker may replace only the precise media asset it was
 * asked to regenerate. A revision drift may rebase only when that exact
 * target overlay still has the exact asset the worker was asked to replace.
 */
export interface ProjectPipelineVideoDeliveryCommandV1 extends PipelineVideoDeliveryMaterialV1 {
  expectedRevision: ProjectRevisionV1;
  prerequisite: PipelineVideoProjectDeliveryPrerequisiteV1;
}

export type ProjectPipelineVideoDeliveryRebaseV1 =
  | "FRESH"
  | "SAFE_REBASED_TARGET_UNCHANGED";

export interface ProjectPipelineVideoDeliveryReceiptV1 {
  schemaVersion: 1;
  deliveryId: string;
  materialHash: string;
  prerequisiteHash: string;
  target: Readonly<PipelineVideoDeliveryMaterialV1["target"]>;
  invalidationAdmissionId: string;
  invalidationAdmissionHash: string;
  replacementAssetId: string;
  requestedRevision: ProjectRevisionV1;
  beforeRevision: ProjectRevisionV1;
  afterRevision: ProjectRevisionV1;
  mutationReceipt: ProjectMutationReceiptV1;
  timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1;
  rebase: ProjectPipelineVideoDeliveryRebaseV1;
  changedPaths: readonly string[];
  proof: {
    required: true;
    status: "UNVERIFIABLE";
    reason: "NO_RENDERED_VIDEO_PROOF";
  };
  committedAt: string;
}

export type ProjectPipelineVideoDeliveryConflictReasonV1 =
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_VIDEO"
  | "TARGET_ASSET_CHANGED"
  | "WRONG_PROJECT"
  | "STALE_REVISION"
  | "TARGET_FINGERPRINT_CHANGED"
  | "TARGET_RANGE_CHANGED"
  | "DIRECTOR_LEASE_ACTIVE"
  | "TIMELINE_RANGE_LOCKED"
  | "SOURCE_EVIDENCE_MISMATCH"
  | "RIGHTS_EVIDENCE_INVALID"
  | "GENERATION_PREDECESSOR_MISSING"
  | "INVALIDATION_UNVERIFIABLE"
  | "CAS_LOST";

export class ProjectPipelineVideoDeliveryConflictError extends Error {
  readonly code = "PROJECT_PIPELINE_VIDEO_DELIVERY_CONFLICT";

  constructor(
    readonly currentRevision: ProjectRevisionV1,
    readonly reason: ProjectPipelineVideoDeliveryConflictReasonV1,
  ) {
    super("Pipeline video delivery cannot replace its planned target: " + reason + ".");
    this.name = "ProjectPipelineVideoDeliveryConflictError";
  }
}

export interface ProjectPipelineVideoDeliveryResultV1 {
  disposition: "APPLIED" | "ALREADY_APPLIED";
  deliveryReceipt: ProjectPipelineVideoDeliveryReceiptV1;
}

export interface ProjectPipelineVideoArtifactInvalidationResultV1 {
  disposition: "ENQUEUED" | "ALREADY_ENQUEUED";
  outbox: ProjectArtifactInvalidationOutboxV1;
}

export interface ProjectPipelineVideoArtifactInvalidationProgressInputV1 {
  outboxId: string;
  receiptHash: string;
  fences: readonly ProjectArtifactInvalidationFenceV1[];
  resolvedDerivativeClasses: readonly ProjectArtifactInvalidationDerivativeClassV1[];
}

export interface ProjectPipelineVideoArtifactInvalidationProgressResultV1 {
  disposition: "APPLIED" | "ALREADY_APPLIED";
  outbox: ProjectArtifactInvalidationOutboxV1;
}

export type ProjectPipelineVideoDeliveryInvalidationAdmissionResultV1 =
  | {
      disposition: "ADMITTED" | "ALREADY_ADMITTED";
      admission: PipelineVideoDeliveryInvalidationAdmissionV1;
      prerequisite: PipelineVideoProjectDeliveryPrerequisiteV1;
      beforeRevision: ProjectRevisionV1;
      afterRevision: ProjectRevisionV1;
    }
  | {
      /** A retry recovered a live reservation; no usable prerequisite exists yet. */
      disposition: "ALREADY_PENDING";
      admission: PipelineVideoDeliveryInvalidationAdmissionV1;
      prerequisite: null;
      beforeRevision: ProjectRevisionV1;
      afterRevision: ProjectRevisionV1;
    };

/**
 * A Video Analysis worker may correct only its exact initial source overlay.
 * This is deliberately not a generic duration or timeline updater.
 */
export interface ProjectVideoAnalysisDurationCorrectionCommandV1 {
  expectedRevision: ProjectRevisionV1;
  assetId: string;
  observedDurationMs: number;
  durationSource: "container" | "transcript";
  target: {
    overlayId: number;
    expectedAssetId: string;
    expectedFromFrame: 0;
    expectedSourceStartFrame: 0 | null;
    expectedDurationInFrames: number;
  };
}

export type ProjectVideoAnalysisDurationCorrectionNotEligibleReasonV1 =
  | "NO_UNIQUE_INITIAL_SOURCE_OVERLAY"
  | "TARGET_EXPECTATION_MISMATCH"
  | "PROJECT_DURATION_MISMATCH"
  | "PROJECT_FPS_INVALID";

export interface ProjectVideoAnalysisDurationCorrectionReceiptV1 {
  schemaVersion: 1;
  correctionId: string;
  materialHash: string;
  assetId: string;
  observedDurationMs: number;
  durationSource: "container" | "transcript";
  projectFps: number;
  target: Readonly<ProjectVideoAnalysisDurationCorrectionCommandV1["target"]>;
  requestedRevision: ProjectRevisionV1;
  beforeRevision: ProjectRevisionV1;
  afterRevision: ProjectRevisionV1;
  mutationReceipt: ProjectMutationReceiptV1;
  timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1;
  changedPaths: readonly [
    "durationInFrames",
    "overlays",
    "videoAnalysisDurationCorrectionReceipts",
    "timelineRangeChangeReceipts",
  ];
  proof: {
    required: true;
    status: "UNVERIFIABLE";
    reason: "NO_RENDERED_VIDEO_PROOF";
  };
  committedAt: string;
}

export type ProjectVideoAnalysisDurationCorrectionResultV1 =
  | {
      disposition: "APPLIED" | "ALREADY_APPLIED";
      correctionReceipt: ProjectVideoAnalysisDurationCorrectionReceiptV1;
    }
  | {
      disposition: "ALREADY_CURRENT";
      correctedDurationInFrames: number;
    }
  | {
      disposition: "NOT_ELIGIBLE";
      reason: ProjectVideoAnalysisDurationCorrectionNotEligibleReasonV1;
    };

/**
 * A low-quality result is derived by the pipeline analysis owner. ProjectService
 * records it as an additive fact but never decides whether a score is low.
 */
export interface ProjectPipelineVideoQualityWarningCommandV1 {
  expectedRevision: ProjectRevisionV1;
  batchId: string;
  jobId: string;
  storyboardId: string;
  sceneIndex: number;
  assetId: string;
  qualityScore: number;
  qualitySource: "hybrid-vision" | "deterministic-5track";
}

export type ProjectPipelineVideoQualityWarningRebaseV1 =
  | "FRESH"
  | "SAFE_REBASED_ADDITIVE_WARNING";

/**
 * This lives in the legacy-compatible `qualityWarnings` field so existing
 * warnings are preserved, while V1 entries carry their own replay receipt.
 */
export interface ProjectPipelineVideoQualityWarningV1 {
  schemaVersion: 1;
  warningId: string;
  materialHash: string;
  batchId: string;
  jobId: string;
  storyboardId: string;
  sceneIndex: number;
  assetId: string;
  qualityScore: number;
  qualitySource: "hybrid-vision" | "deterministic-5track";
  message: string;
  createdAt: Date;
  requestedRevision: ProjectRevisionV1;
  beforeRevision: ProjectRevisionV1;
  afterRevision: ProjectRevisionV1;
  mutationReceipt: ProjectMutationReceiptV1;
  rebase: ProjectPipelineVideoQualityWarningRebaseV1;
  changedPaths: readonly ["qualityWarnings"];
  proof: {
    required: false;
    status: null;
    reason: "DERIVED_ANALYSIS_WARNING_NOT_RENDERED_ACCEPTANCE_PROOF";
  };
  committedAt: string;
}

export interface ProjectPipelineVideoQualityWarningResultV1 {
  disposition: "APPLIED" | "ALREADY_APPLIED";
  qualityWarning: ProjectPipelineVideoQualityWarningV1;
}

export interface CapturedProjectMutationReceiptsV1<T> {
  value: T;
  receipts: ProjectMutationReceiptV1[];
}

export interface ProjectCheckpointRestoreInputV1 {
  checkpointId: string;
  actorKind: ProjectTimelineMutationActorKindV1;
  expectedRevision: ProjectRevisionV1;
  setFields: Record<string, unknown>;
  unsetFields: string[];
}

export interface ProjectCheckpointRestoreReceiptV1 {
  receipt: ProjectMutationReceiptV1;
  timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1;
  project: Record<string, unknown>;
}

/**
 * A short-lived coordination lease for one Director run. ProjectService owns
 * the lease and the snapshot it returns; Director never obtains a separate
 * project-write authority.
 */
export interface ProjectDirectorMutationLeaseV1 {
  leaseId: string;
  project: Project;
  revision: ProjectRevisionV1;
  acquiredAt: string;
}

/**
 * A cleanup release does not apply a caller snapshot. Its lease token is the
 * ownership predicate, but a successful release is still a ProjectService
 * state transition and must issue the revision its following observers see.
 */
export type ProjectDirectorMutationLeaseReleaseResultV1 =
  | {
      disposition: "RELEASED";
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "LEASE_NOT_OWNED_OR_PROJECT_NOT_FOUND";
    };

/**
 * A ProjectService-issued handoff token for the pipeline-video completion
 * worker. It is deliberately project state, not a second queue or job owner:
 * the token keeps the original pending signal durable until the signed
 * Director worker atomically claims it.
 */
export interface ProjectPipelineDirectorDispatchV1 {
  schemaVersion: 1;
  batchId: string;
  profileId: string;
  dispatchToken: string;
  preparedAt: string;
}

export type ProjectAnalysisRunStateV1 =
  | "queued"
  | "analyzing"
  | "transcribing"
  | "analyzing_visual_cuts"
  | "cleaning"
  | "computing_params"
  | "analysis_complete"
  | "analyzing_deep"
  | "directing_queued"
  | "failed";

export interface ProjectAnalysisRunV1 {
  schemaVersion: 1;
  runId: string;
  admissionHash: string;
  sourceAssetId: string;
  creditTransactionId: string;
  chargedCredits: number;
  lane: "auto" | "assist";
  state: ProjectAnalysisRunStateV1;
  admittedRevision: ProjectRevisionV1;
  admittedAt: string;
  updatedAt: string;
  intakeDispatch?: ProjectAnalysisIntakeDispatchV1;
  phase1EvidenceHash?: string;
  phase1EvidenceCommittedAt?: string;
  deepAnalysisDispatch?: ProjectAnalysisDeepDispatchV1;
  deepAnalysisLease?: ProjectAnalysisDeepLeaseV1;
  phase2EvidenceHash?: string;
  phase2EvidenceCommittedAt?: string;
  directorDispatch?: ProjectAnalysisDirectorDispatchV1;
}

export interface ProjectAnalysisIntakeDispatchV1 {
  schemaVersion: 1;
  deduplicationId: string;
  status: "pending" | "published" | "inline_ready";
  preparedAt: string;
  publishedAt?: string;
  providerMessageId?: string;
  inlineReadyAt?: string;
}

export interface ProjectAnalysisDeepLeaseV1 {
  schemaVersion: 1;
  leaseId: string;
  claimedAt: string;
  expiresAt: string;
}

export interface ProjectAnalysisDirectorDispatchV1 {
  schemaVersion: 1;
  deduplicationId: string;
  status: "pending" | "published" | "inline_ready";
  preparedAt: string;
  publishedAt?: string;
  providerMessageId?: string;
  inlineReadyAt?: string;
}

export interface ProjectAnalysisDeepDispatchV1 {
  schemaVersion: 1;
  deduplicationId: string;
  status: "pending" | "published" | "inline_ready";
  preparedAt: string;
  publishedAt?: string;
  providerMessageId?: string;
  inlineReadyAt?: string;
}

export interface ProjectAnalysisQueueFactsV1 {
  referenceAssetId?: string;
  referenceVideoSource?: {
    kind: "remote-url" | "youtube-url" | "instagram-url";
    sourceLabel: string;
    sourceFingerprint: string;
  };
  referenceImageAssetIds?: string[];
  editorialPreferences?: Record<string, unknown>;
}

export interface ProjectAnalysisRunAdmissionCommandV1 {
  expectedRevision: ProjectRevisionV1;
  sourceAssetId: string;
  creditTransactionId: string;
  chargedCredits: number;
  lane: "auto" | "assist";
  queueFacts?: ProjectAnalysisQueueFactsV1;
}

export type ProjectAnalysisRunAdmissionResultV1 =
  | {
      disposition: "ADMITTED";
      run: ProjectAnalysisRunV1;
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "ALREADY_ADMITTED";
      run: ProjectAnalysisRunV1;
      currentRevision: ProjectRevisionV1;
    }
  | { disposition: "PROJECT_NOT_FOUND" }
  | { disposition: "NOT_ELIGIBLE" };

export interface ProjectAnalysisRunAdvanceCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  fromState: Exclude<ProjectAnalysisRunStateV1, "failed">;
  toState: Exclude<ProjectAnalysisRunStateV1, "queued" | "failed">;
}

export interface ProjectAnalysisIntakeDispatchPublicationCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  deduplicationId: string;
  providerMessageId: string;
}

export interface ProjectAnalysisIntakeDispatchInlineReadyCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  deduplicationId: string;
}

export type ProjectAnalysisRunAdvanceResultV1 =
  | {
      disposition: "ADVANCED";
      run: ProjectAnalysisRunV1;
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "ALREADY_ADVANCED";
      run: ProjectAnalysisRunV1;
      currentRevision: ProjectRevisionV1;
    }
  | { disposition: "PROJECT_NOT_FOUND" }
  | { disposition: "OWNERSHIP_LOST" };

export interface ProjectAnalysisRunFailureCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  errorMessage: string;
}

export type ProjectAnalysisRunFailureResultV1 =
  | {
      disposition: "RECORDED";
      run: ProjectAnalysisRunV1;
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "ALREADY_RECORDED";
      run: ProjectAnalysisRunV1;
      currentRevision: ProjectRevisionV1;
    }
  | { disposition: "PROJECT_NOT_FOUND" }
  | { disposition: "OWNERSHIP_LOST" };

export interface ProjectAnalysisPhase1EvidenceV1 {
  nativeAudioEvidence?: NativeAudioEvidence;
  musicPreference?: string;
  editorialPreferences?: Record<string, unknown>;
  syntheticStoryboard?: unknown;
  geminiFileUri?: string;
  referenceEditDNA?: unknown;
  referenceVideoAnalysis?: unknown;
  rawFootageAnalysis?: unknown;
  vjepaAnalysis?: unknown;
  visualCutIntelligence?: unknown;
  genreParameters?: unknown;
  genreParametersSignalComputed?: unknown;
}

export interface ProjectAnalysisPhase1CommitCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  fromState: "transcribing" | "analyzing_visual_cuts" | "cleaning" | "computing_params";
  evidence: ProjectAnalysisPhase1EvidenceV1;
}

export interface ProjectAnalysisDeepClaimCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  deepAnalysisDispatchId?: string;
}

export type ProjectAnalysisDeepClaimResultV1 =
  | {
      disposition: "CLAIMED";
      run: ProjectAnalysisRunV1;
      lease: ProjectAnalysisDeepLeaseV1;
      reclaimed: boolean;
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition:
        | "DUPLICATE_ACTIVE"
        | "DEEP_DISPATCH_PENDING"
        | "DIRECTOR_DISPATCH_PENDING"
        | "DIRECTOR_DISPATCH_PUBLISHED";
      run: ProjectAnalysisRunV1;
      currentRevision: ProjectRevisionV1;
    }
  | { disposition: "PROJECT_NOT_FOUND" }
  | { disposition: "OWNERSHIP_LOST" };

export interface ProjectAnalysisPhase2EvidenceV1 {
  vjepaAnalysis?: unknown;
  wav2vecAnalysis?: unknown;
  musicAnalysis?: unknown;
  momentWeightMap?: unknown;
  segmentAnalysis?: unknown;
}

export interface ProjectAnalysisPhase2CommitCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  leaseId: string;
  evidence: ProjectAnalysisPhase2EvidenceV1;
}

export interface ProjectAnalysisDeepDispatchPrepareCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
}

export interface ProjectAnalysisDeepDispatchPublicationCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  deduplicationId: string;
  providerMessageId: string;
}

export interface ProjectAnalysisDeepDispatchInlineReadyCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  deduplicationId: string;
}

export interface ProjectAnalysisDirectorDispatchPublicationCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  deduplicationId: string;
  providerMessageId: string;
}

export interface ProjectAnalysisDirectorDispatchPrepareCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
}

export interface ProjectAnalysisDirectorDispatchInlineReadyCommandV1 {
  expectedRevision: ProjectRevisionV1;
  runId: string;
  sourceAssetId: string;
  deduplicationId: string;
}

export interface ProjectPipelineDirectorDispatchPrepareCommandV1 {
  expectedRevision: ProjectRevisionV1;
  batchId: string;
}

export type ProjectPipelineDirectorDispatchPrepareResultV1 =
  | {
      disposition: "PREPARED";
      dispatch: ProjectPipelineDirectorDispatchV1;
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "ALREADY_PREPARED";
      dispatch: ProjectPipelineDirectorDispatchV1;
      currentRevision: ProjectRevisionV1;
    }
  | { disposition: "PROJECT_NOT_FOUND" }
  | { disposition: "NOT_ELIGIBLE" };

/**
 * Pipeline finalize records an intent only. A later pipeline-video completion
 * still owns the batch-bound signed-worker dispatch preparation.
 */
export interface ProjectPipelineDirectorIntentCommandV1 {
  expectedRevision: ProjectRevisionV1;
  profileId: string;
}

export type ProjectPipelineDirectorIntentResultV1 =
  | {
      disposition: "RECORDED";
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "ALREADY_RECORDED";
      currentRevision: ProjectRevisionV1;
    }
  | { disposition: "PROJECT_NOT_FOUND" }
  | { disposition: "NOT_ELIGIBLE" };

export interface ProjectDirectorRunClaimOptionsV1 {
  /** Required only when ProjectService prepared a pipeline-video dispatch. */
  pipelineDirectorDispatchToken?: string;
  /** Exact analysis run that authorized this Director execution. */
  analysisRunId?: string;
  /** Exact prepared analysis dispatch; omitted only by legacy run-bound messages. */
  analysisDirectorDispatchId?: string;
}

/**
 * A bounded, lease-owned progress update for one active Director execution.
 * Progress is project state, so worker callbacks must submit it through the
 * same compare-and-swap and receipt protocol as every other project write.
 */
export interface ProjectDirectorProgressCommandV1 {
  expectedRevision: ProjectRevisionV1;
  directorLeaseId: string;
  stagePercent: number;
  stageDescription: string;
}

export interface ProjectDirectorAutoBgmDecisionCommandV1 {
  expectedRevision: ProjectRevisionV1;
  directorLeaseId: string;
  evidence: AutoBgmDecisionEvidence;
  evidenceHash: string;
}

export interface ProjectDirectorAuditFactCommandV1 {
  expectedRevision: ProjectRevisionV1;
  directorLeaseId: string;
  fact: DirectorAuditFactV1;
}

export interface ProjectDirectorDecisionLogCommandV1 {
  expectedRevision: ProjectRevisionV1;
  directorLeaseId: string;
  decisionLog: PersistedDirectorDecisionLogV1;
}

/**
 * A Director run token identifies the automatic-worker lifecycle across the
 * Director's shorter-lived writer lease. It is issued, consumed and cleared
 * only by ProjectService; it is not a second job or project authority.
 */
export type ProjectDirectorRunClaimDispositionV1 =
  | "CLAIMED"
  | "ASSIST_PROJECT"
  | "DISPATCH_PENDING"
  | "PROJECT_NOT_FOUND"
  | "NOT_ELIGIBLE";

export type ProjectDirectorRunClaimResultV1 =
  | {
      disposition: "CLAIMED";
      project: Project;
      runToken: string;
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "ASSIST_PROJECT";
      project: Project;
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "DISPATCH_PENDING";
    }
  | {
      disposition: "PROJECT_NOT_FOUND";
    }
  | {
      disposition: "NOT_ELIGIBLE";
    };

export interface ProjectAssistRescueCommandV1 {
  expectedRevision: ProjectRevisionV1;
}

export type ProjectAssistRescueResultV1 =
  | {
      disposition: "RESCUED";
      project: Project;
      receipt: ProjectMutationReceiptV1;
    }
  | {
      disposition: "ALREADY_RESCUED";
      project: Project;
      currentRevision: ProjectRevisionV1;
    }
  | { disposition: "PROJECT_NOT_FOUND" }
  | { disposition: "NOT_ELIGIBLE" };

export interface ProjectDirectorRunCompletionCommandV1 {
  directorRunToken: string;
  expectedRevision: ProjectRevisionV1;
  terminalReceipt: ProjectMutationReceiptV1;
  totalPipelineMs: number;
  directorMs: number;
  profileId: string;
  autoEditStatus: "complete" | "needs_review";
  needsQualityAttention: boolean;
  autoEditWarning?: string;
  decisionAuthority?: Record<string, unknown>;
}

export interface ProjectDirectorRunFailureCommandV1 {
  directorRunToken: string;
  errorMessage: string;
}

export type ProjectDirectorRunTerminalDispositionV1 =
  | "RECORDED"
  | "PROJECT_NOT_FOUND"
  | "OWNERSHIP_LOST";

export interface ProjectDirectorRunTerminalResultV1 {
  disposition: ProjectDirectorRunTerminalDispositionV1;
  receipt?: ProjectMutationReceiptV1;
}

/**
 * The bounded worker-owned fact that a queued Director delivery failed. The
 * callback supplies the failure observation; ProjectService alone decides
 * whether it is still current enough to mutate the project.
 */
export interface ProjectDirectorDeliveryFailureCommandV1 {
  sourceMessageId: string;
  pipelineDirectorDispatchToken: string;
  errorMessage: string;
  audit: Record<string, unknown>;
}

export type ProjectDirectorDeliveryFailureDispositionV1 =
  | "RECORDED"
  | "PROJECT_NOT_FOUND"
  | "STALE_SOURCE_MESSAGE"
  | "PROJECT_ALREADY_TERMINAL"
  | "PROJECT_STATE_CHANGED";

export interface ProjectDirectorDeliveryFailureResultV1 {
  disposition: ProjectDirectorDeliveryFailureDispositionV1;
  sourceUploadBatchId: string | null;
  beforeRevision?: ProjectRevisionV1;
  receipt?: ProjectMutationReceiptV1;
}

export type ProjectBatchAutoEditLifecycleEventV1 =
  | {
      kind: "COVERAGE_RESUME_STARTED";
      sourceAssetIds: readonly string[];
      previousScriptCoverage: Record<string, unknown> | null;
    }
  | {
      kind: "COVERAGE_RESUME_DISPATCH_FAILED";
      errorMessage: string;
      scriptCoverage: Record<string, unknown> | null;
    }
  | {
      kind:
        | "NO_USABLE_VISUAL_ASSETS"
        | "ANALYSIS_DEADLINE_EXHAUSTED"
        | "INSUFFICIENT_CREDITS"
        | "ORCHESTRATION_FAILED";
      errorMessage: string;
    }
  | {
      kind: "SCRIPT_GROUNDING_NEEDS_INPUT" | "SCRIPT_GROUNDING_FAILED";
      errorMessage: string;
      scriptCoverage: Record<string, unknown>;
    }
  | {
      kind: "PRE_DIRECTOR_REFUND_PENDING";
      creditTransactionId: string;
      chargedCredits: number;
      reason: string;
    }
  | {
      kind: "PRE_DIRECTOR_REFUND_RECORDED";
      creditTransactionId: string;
      chargedCredits: number;
      reason: string;
    };

export interface ProjectBatchAutoEditLifecycleCommandV1 {
  expectedRevision: ProjectRevisionV1;
  uploadBatchId: string;
  transitionId: string;
  event: ProjectBatchAutoEditLifecycleEventV1;
}

export type ProjectBatchAutoEditLifecycleResultV1 =
  | {
      disposition: "RECORDED";
      beforeRevision: ProjectRevisionV1;
      receipt: ProjectMutationReceiptV1;
    }
  | { disposition: "PROJECT_NOT_FOUND" }
  | {
      disposition: "NOT_ELIGIBLE" | "PROJECT_STATE_CHANGED";
      currentRevision: ProjectRevisionV1;
    };

/**
 * Director's deterministic, pre-render proof facts. They are persisted only
 * against the writer receipt for the edit they describe.
 */
export interface ProjectPhase0ProofFactsV1 {
  qualityReview: Record<string, unknown>;
  liveTruth: Record<string, unknown>;
  renderedQualityEvidence: Record<string, unknown>;
  fixtureArtifact: Record<string, unknown>;
}

/**
 * The exact ProjectService-owned facts written after an asynchronous Phase-0
 * still render. The worker may produce these facts, but it never writes a
 * project document directly.
 */
export interface ProjectPhase0RenderedEvidenceFactsV1 {
  renderedStillEvidence: object;
  fixtureArtifact: {
    materialization: string;
    renderedStillEvidenceStatus: string;
    renderedStillEvidenceReason: string | null;
    renderedStillFrameCount: number;
    renderedStillFailedFrameCount: number;
    renderedStillCompletedAt: string | null;
    renderedAestheticStatus: string;
    renderedAestheticScore: number | null;
    renderedAestheticIssueCount: number;
    renderedAestheticFailFrameCount: number;
    renderedAestheticWarnFrameCount: number;
    renderedAestheticSampledFrames: number;
  };
  renderedQualityEvidence: object;
  renderedQualityGate: object;
  renderedAestheticReport?: object;
  liveTruth?: object;
  reviewDisposition?: {
    autoEditStatus: "needs_review";
    projectStatus: "needs-attention";
    autoEditHealth: "needs_review";
    autoEditWarning: string | null;
  };
}

export interface ProjectPhase0RenderedEvidenceClaimV1 {
  project: Project;
  targetReceipt: ProjectMutationReceiptV1;
  claimReceipt: ProjectMutationReceiptV1;
}

/**
 * A receipt-guarded UI projection of checkpoint-owned chat proof. This is not
 * a second proof store and does not advance the canonical editor revision.
 */
export interface ProjectChatRenderVerificationProjectionInputV1 {
  subjectReceipt: ProjectMutationReceiptV1;
  record: ChatEditRenderVerificationRecord;
  expectedLifecycleStates: ChatEditRenderVerificationLifecycleState[];
  /** The persisted worker-attempt token required before this derived projection may advance. */
  expectedAttemptToken?: string | null;
  allowReplacePriorSubject?: boolean;
  appendHistory?: boolean;
}

const projectMutationReceiptStorage = new AsyncLocalStorage<ProjectMutationReceiptV1[]>();
const DIRECTOR_LEASE_DURATION_MS = 5 * 60 * 1000;
const TIMELINE_RANGE_CUT_LOCK_DEFAULT_TTL_MS = 2 * 60 * 1000;
const TIMELINE_RANGE_CUT_LOCK_MIN_TTL_MS = 1_000;
const TIMELINE_RANGE_CUT_LOCK_MAX_TTL_MS = 5 * 60 * 1000;
const MAX_TIMELINE_RANGE_CUT_LOCK_RECORDS_V1 = 200;
const MAX_PIPELINE_AUDIO_DELIVERY_RECEIPTS_V1 = 200;
const MAX_PIPELINE_AUDIO_DELIVERY_CAS_ATTEMPTS_V1 = 2;
const MAX_PIPELINE_VIDEO_DELIVERY_RECEIPTS_V1 = 200;
const PIPELINE_VIDEO_DELIVERY_INVALIDATION_ADMISSION_TTL_MS_V1 = 15 * 60 * 1000;
const MAX_VIDEO_ANALYSIS_DURATION_CORRECTION_RECEIPTS_V1 = 200;

export class ProjectMutationConflictError extends Error {
  readonly code = "PROJECT_REVISION_CONFLICT";

  constructor(
    readonly currentRevision: ProjectRevisionV1,
    message = "The project changed before this write could be committed.",
  ) {
    super(message);
    this.name = "ProjectMutationConflictError";
  }
}

export class ProjectNotFoundOrForbiddenError extends Error {
  readonly code = "PROJECT_NOT_FOUND_OR_FORBIDDEN";

  constructor() {
    super("Project not found.");
    this.name = "ProjectNotFoundOrForbiddenError";
  }
}

export class ProjectMutationWriteError extends Error {
  readonly code = "PROJECT_MUTATION_WRITE_FAILED";

  constructor(
    message = "Project mutation did not produce exactly one durable update.",
  ) {
    super(message);
    this.name = "ProjectMutationWriteError";
  }
}

export class ProjectProxyMasterRelinkBlockedErrorV1 extends Error {
  readonly code = "PROJECT_PROXY_MASTER_RELINK_BLOCKED";

  constructor(
    readonly reason: ProjectProxyMasterRelinkBlockReasonV1,
    readonly currentRevision: ProjectRevisionV1,
    message = `Proxy-to-master relink blocked: ${reason}.`,
  ) {
    super(message);
    this.name = "ProjectProxyMasterRelinkBlockedErrorV1";
  }
}

export class ProjectProxySourceBindingBlockedErrorV1 extends Error {
  readonly code = "PROJECT_PROXY_SOURCE_BINDING_BLOCKED";

  constructor(
    readonly reason: ProjectProxySourceBindingBlockReasonV1,
    readonly currentRevision: ProjectRevisionV1,
    message = `Proxy source binding blocked: ${reason}.`,
  ) {
    super(message);
    this.name = "ProjectProxySourceBindingBlockedErrorV1";
  }
}

export type ProjectTimelineRangeRebaseBlockReasonV1 =
  | "EXPECTED_REVISION_NOT_OLDER"
  | "HISTORY_INCOMPLETE"
  | "UNKNOWN_OPERATION"
  | "COORDINATE_TRANSFORM"
  | "UNKNOWN_OVERLAY_TIMING"
  | "SAME_OBJECT_UPDATE"
  | "OVERLAPPING_UPDATE";

export class ProjectTimelineRangeRebaseBlockedError extends Error {
  readonly code = "PROJECT_TIMELINE_REBASE_BLOCKED";

  constructor(
    readonly currentRevision: ProjectRevisionV1,
    readonly reason: ProjectTimelineRangeRebaseBlockReasonV1,
    message = "The stale timeline cut cannot be safely rebased onto the current project.",
  ) {
    super(message);
    this.name = "ProjectTimelineRangeRebaseBlockedError";
  }
}

export class ProjectTimelineRangeCutLockConflictError extends Error {
  readonly code = "PROJECT_TIMELINE_RANGE_LOCKED";

  constructor(
    readonly currentRevision: ProjectRevisionV1,
    readonly blockingLockIds: readonly string[],
    message = "The requested timeline range is locked by another active cut operation.",
  ) {
    super(message);
    this.name = "ProjectTimelineRangeCutLockConflictError";
  }
}

export class ProjectGeneratedCompositionStateConflictErrorV1 extends Error {
  readonly code = "PROJECT_GENERATED_COMPOSITION_STATE_CONFLICT";

  constructor(
    readonly compositionId: string,
    readonly currentStateToken: string | null,
    readonly currentRevision: ProjectRevisionV1,
    message = "The generated composition changed before this write could be committed.",
  ) {
    super(message);
    this.name = "ProjectGeneratedCompositionStateConflictErrorV1";
  }
}

class ProjectAudioRightsAttestationConflictError extends Error {
  constructor() {
    super("The project changed before audio rights could be committed.");
    this.name = "ProjectAudioRightsAttestationConflictError";
  }
}

export interface Project {
  _id?: any;
  projectId: string;
  userId: string;
  name: string;
  overlays: Overlay[];
  aspectRatio: AspectRatio;
  playerDimensions: {
    width: number;
    height: number;
  };
  fps: number;
  durationInFrames: number;
  /** User-authored named timeline markers persisted with editor state. */
  markers?: EditorTimelineMarker[];
  thumbnail?: string;
  /** Script pasted at intake (Script door). Never silently dropped; the
      in-editor AI / Mode-1 generation is its consumer. */
  initialScript?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Durable optimistic-concurrency counter for ProjectService editor writes. */
  projectRevision?: number;
  /** ProjectService-owned active and in-flight generated composition revisions. */
  generatedCompositions?: ProjectGeneratedCompositionEntryV1[];
  /** Sole ProjectService-owned proxy-to-qualified-master binding per asset. */
  proxyMasterRelinkStatesV1?: ProjectProxyMasterRelinkStateV1[];
  /** ProjectService-issued proof of the exact proxy basis before promotion. */
  proxySourceBindingsV1?: ProjectProxySourceBindingV1[];
  /** Bounded ProjectService-owned history for timeline-range reconciliation. */
  timelineRangeChangeReceipts?: ProjectTimelineRangeChangeReceiptV1[];
  /** Bounded idempotency/receipt history for signed BGM and SFX worker deliveries. */
  pipelineAudioDeliveryReceipts?: ProjectPipelineAudioDeliveryReceiptV1[];
  /** Bounded idempotency/receipt history for signed generated-video deliveries. */
  pipelineVideoDeliveryReceipts?: ProjectPipelineVideoDeliveryReceiptV1[];
  /** ProjectService-issued current-target invalidation admissions consumed by delivery CAS. */
  pipelineVideoDeliveryInvalidationAdmissionsV1?: PipelineVideoDeliveryInvalidationAdmissionV1[];
  /** Bounded replay history for source-bound Video Analysis duration corrections. */
  videoAnalysisDurationCorrectionReceipts?: ProjectVideoAnalysisDurationCorrectionReceiptV1[];
  /** Exact paid source-analysis identity; worker stages may not infer or replace it. */
  autoEditAnalysisRunV1?: ProjectAnalysisRunV1;
  /** Legacy-compatible warning records; V1 entries are issued only by ProjectService. */
  qualityWarnings?: unknown[];
  /** Bounded cut-specific coordination leases; no other command honors them yet. */
  timelineRangeCutLocks?: ProjectTimelineRangeCutLockV1[];
  lastAutosaveAt?: Date;
  // Organization support
  orgId?: string | null;
  sharedWith?: string[];
  visibility: "private" | "org" | "shared";
  // Dashboard fields (added for production floor dashboard)
  brand?: string | null;
  pipelineStage?:
    | "script"
    | "edit"
    | "analyze"
    | "thumbnails"
    | "publish"
    | "complete";
  qualityScore?: number | null;
  projectStatus?: "active" | "needs-attention" | "complete" | "failed";
  // Brand Intelligence + Project Tracking
  status?: import("@/lib/shared/project-status").ProjectStatus;
  statusHistory?: import("@/lib/shared/project-status").StatusTransition[];
  brandId?: string;
  sourceSessionId?: string;
  lastError?: import("@/lib/shared/project-status").ProjectError;
  directorLock?: boolean;
  directorLockAt?: Date | string;
  directorLockToken?: string;
  /** Durable automatic-Director lifecycle identity. Distinct from the short
       writer lease, which is intentionally cleared by the final editor save. */
  directorRunToken?: string;
  /** Pipeline-finalize signal, retained until the signed Director worker claims it. */
  pendingDirectorProfileId?: string;
  pendingDirectorUserId?: string;
  /** ProjectService-issued signed-worker handoff; it is never a queue authority. */
  pipelineDirectorDispatch?: ProjectPipelineDirectorDispatchV1;
}

export interface ProjectRenderSnapshotReadV1 {
  project: Project;
  revision: ProjectRevisionV1;
  ownerId: string;
}

export type ProjectRenderDispatchBindingRecoveryResultV1 =
  | ProjectRenderJobNotCurrentResultV1
  | {
      ok: true;
      status: "BOUND" | "ALREADY_BOUND";
    };

type ProjectRenderFinalizationTransactionCommandV1 =
  | {
      kind: "complete";
      authorization: unknown;
      claimToken: string;
      result: unknown;
      now?: Date;
    }
  | {
      kind: "failure";
      authorization: unknown;
      claimToken: string;
      error: unknown;
      now?: Date;
    };

type ProjectRenderJobTransactionKindV1 =
  | ProjectRenderFinalizationTransactionCommandV1["kind"]
  | "provider-failure"
  | "initial-finalization-claim"
  | "initial-finalization-release"
  | "failed-finalization-retry-claim"
  | "failed-finalization-retry-release"
  | "progress"
  | "completion-effects-claim"
  | "completion-effects-complete"
  | "completion-effects-release"
  | "dispatch-recovery-bind"
  | "stale-finalization";

interface ProjectRenderJobTransactionContextV1 {
  authorization: ProjectRenderJobAuthorizationV1;
  currentProjectRevision: ProjectRevisionV1;
  renderJobs: Collection<RenderJob>;
  renderSourceCleanupOutbox: Collection<ProjectRenderSourceCleanupOutboxV1>;
  chapterRenderJobs?: Collection<ChapterRenderCleanupChapterDocumentV1>;
  chapterConcatCleanupOutbox?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  session: ClientSession;
  transactionAt: Date;
}

interface StaleProjectRenderJobTransactionContextV1 {
  authorization: ProjectRenderJobAuthorizationV1;
  observedProjectRevision: ProjectRevisionV1 | null;
  renderJobs: Collection<RenderJob>;
  renderSourceCleanupOutbox: Collection<ProjectRenderSourceCleanupOutboxV1>;
  chapterRenderJobs?: Collection<ChapterRenderCleanupChapterDocumentV1>;
  chapterConcatCleanupOutbox?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  session: ClientSession;
  transactionAt: Date;
}

type ProjectRenderFinalizationTransactionResultV1 =
  | ProjectRenderJobMutationResultV1
  | {
      ok: true;
      status: "STALE" | "ALREADY_STALE" | "CLAIM_REPLACED" | "ALREADY_TERMINAL";
    };

const PROJECT_RENDER_FINALIZATION_TRANSACTION_FENCE_V1 =
  "renderFinalizationTransactionFenceV1";

function nonCurrentProjectRenderJobResultV1(
  reason: ProjectRenderJobNotCurrentResultV1["reason"],
): ProjectRenderJobNotCurrentResultV1 {
  return {
    ok: false,
    status: "NON_CURRENT",
    code: PROJECT_ARTIFACT_NOT_CURRENT,
    reason,
  };
}

function isChapterRenderAuthorizationV1(
  authorization: ProjectRenderJobAuthorizationV1,
): boolean {
  return /^chr_[A-Za-z0-9_-]{12}$/.test(authorization.jobId);
}

function isProviderFreeChapterFinalizationInputV1(input: {
  providerRenderId?: string;
  bucketName?: string;
  region?: string;
}, authorization: ProjectRenderJobAuthorizationV1): boolean {
  return isChapterRenderAuthorizationV1(authorization)
    && input.providerRenderId === undefined
    && input.bucketName === undefined
    && input.region === undefined;
}

function isProviderFreeChapterFinalizationStateV1(parent: RenderJob): boolean {
  const state = parent.chapterOrchestration?.state;
  return state === "READY_FOR_FINALIZATION" || state === "FINALIZING";
}

/**
 * A provider-free aggregate is still a strict project render admission. The
 * parent orchestration is the only aggregate identity; child/provider tuples
 * are validated later by the cleanup materializer and never synthesized here.
 */
function parseProviderFreeChapterParentV1(
  value: unknown,
  authorization: ProjectRenderJobAuthorizationV1,
): RenderJob | null {
  const parsed = RenderJobSchema.safeParse(value);
  if (!parsed.success || !isChapterRenderAuthorizationV1(authorization)) return null;
  const parent = parsed.data;
  const binding = parent.projectRenderSnapshotBinding;
  const orchestration = RenderJobChapterOrchestrationSchema.safeParse(
    parent.chapterOrchestration,
  );
  if (!binding || !orchestration.success) return null;
  try {
    assertProjectRenderSnapshotBindingV1(binding);
  } catch {
    return null;
  }
  const dispatch = parent.dispatch;
  if (
    parent._id !== authorization.jobId
    || parent.userId !== authorization.ownerId
    || parent.requestedByUserId !== authorization.requestedByUserId
    || parent.projectId !== authorization.projectId
    || binding.scope !== "PROJECT_SNAPSHOT"
    || binding.artifactId !== authorization.jobId
    || binding.ownerId !== authorization.ownerId
    || binding.projectId !== authorization.projectId
    || binding.bindingHash !== authorization.bindingHash
    || !sameProjectArtifactRevisionV1(
      binding.projectRevision,
      authorization.projectRevision,
    )
    || orchestration.data.scope !== "CHAPTER_ORCHESTRATION"
    || orchestration.data.aggregateJobId !== authorization.jobId
    || orchestration.data.bindingHash !== authorization.bindingHash
    || orchestration.data.selectedRegion !== parent.region
    || parent.deliveryManifest?.primaryArtifact.renderId !== authorization.jobId
    || parent.providerRenderId !== undefined
    || parent.bucketName !== undefined
    || !dispatch
    || dispatch.version !== 1
    || dispatch.phase !== "NOT_ATTEMPTED"
    || dispatch.providerRenderId !== undefined
    || dispatch.providerBucketName !== undefined
    || dispatch.providerRegion !== undefined
    || dispatch.providerBoundAt !== undefined
    || parent.artifactBinding !== undefined
    || parent.artifactInvalidation !== undefined
  ) {
    return null;
  }
  return parent;
}

function chapterAggregateOutputMatchesV1(
  parent: RenderJob,
  sourceOutputUrl: string,
  sourceOutputSize: number,
): boolean {
  const output = parent.chapterOrchestration?.aggregateOutput;
  return output !== undefined
    && output.url === sourceOutputUrl
    && output.sizeBytes === sourceOutputSize;
}

function providerFreeChapterStaleReplayMatchesV1(
  parent: RenderJob,
  authorization: ProjectRenderJobAuthorizationV1,
  sourceOutputUrl: string,
  sourceOutputSize: number,
): boolean {
  const orchestration = parent.chapterOrchestration;
  const finalization = parent.finalization;
  const failure = orchestration?.failure;
  const pendingArtifactIds = parent.artifactCleanup?.pendingArtifactIds;
  const completedAt = parent.completedAt;
  return parent.status === "error"
    && parent.artifactState === "STALE"
    && parent.artifactCleanup?.state === "PENDING"
    && pendingArtifactIds?.length === 1
    && pendingArtifactIds[0] === authorization.jobId
    && orchestration?.state === "STALE"
    && orchestration.staleAt instanceof Date
    && completedAt instanceof Date
    && parent.artifactInvalidatedAt instanceof Date
    && finalization?.completedAt instanceof Date
    && completedAt.getTime() === orchestration.staleAt.getTime()
    && completedAt.getTime() === parent.artifactInvalidatedAt.getTime()
    && completedAt.getTime() === finalization.completedAt.getTime()
    && failure?.code === "CHAPTER_ORCHESTRATION_STALE"
    && typeof parent.error === "string"
    && failure.message === parent.error
    && orchestration.chapterCount !== undefined
    && orchestration.completedChapterCount === orchestration.chapterCount
    && orchestration.progress === 1
    && orchestration.chapterLayoutManifestHash !== undefined
    && orchestration.aggregateOutput !== undefined
    && finalization?.state === "failed"
    && finalization.claimToken === undefined
    && finalization.attempts === 0
    && finalization.error === parent.error
    && chapterAggregateOutputMatchesV1(parent, sourceOutputUrl, sourceOutputSize)
    && finalization.sourceOutputUrl === sourceOutputUrl
    && finalization.sourceOutputSize === sourceOutputSize;
}

function providerFreeChapterTerminalReplayMatchesV1(
  parent: RenderJob,
  sourceOutputUrl: string,
  sourceOutputSize: number,
): boolean {
  const finalization = parent.finalization;
  if (!finalization) return false;
  return chapterAggregateOutputMatchesV1(parent, sourceOutputUrl, sourceOutputSize)
    && finalization.claimToken === undefined
    && (
      (
        parent.status === "done"
        && finalization.state === "done"
        && parent.chapterOrchestration?.state === "COMPLETED"
      )
      || (
        parent.status === "error"
        && finalization.state === "failed"
        && parent.chapterOrchestration?.state === "FAILED"
        && Number.isInteger(finalization.attempts)
        && finalization.attempts >= MAX_RENDER_FINALIZATION_ATTEMPTS
      )
    );
}

async function reconcileProviderFreeChapterTerminalLifecycleV1(input: {
  authorization: ProjectRenderJobAuthorizationV1;
  currentProjectRevision: ProjectRevisionV1;
  kind: ProjectRenderFinalizationTransactionCommandV1["kind"];
  renderJobs: Collection<RenderJob>;
  session: ClientSession;
  now: Date;
}): Promise<void> {
  if (!isChapterRenderAuthorizationV1(input.authorization)) return;
  const current = await input.renderJobs.findOne(
    { _id: input.authorization.jobId },
    { session: input.session },
  );
  if (current?.chapterOrchestration === undefined) return;
  const parent = parseProviderFreeChapterParentV1(current, input.authorization);
  if (!parent?.chapterOrchestration) {
    throw new Error("CHAPTER_PARENT_TERMINAL_IDENTITY_NOT_PROVABLE");
  }
  const orchestration = parent.chapterOrchestration;
  const aggregateOutput = orchestration.aggregateOutput;
  const finalization = parent.finalization;
  if (
    orchestration.chapterCount === undefined
    || orchestration.chapterLayoutManifestHash === undefined
    || aggregateOutput === undefined
    || finalization === undefined
    || finalization.sourceOutputUrl !== aggregateOutput.url
    || finalization.sourceOutputSize !== aggregateOutput.sizeBytes
  ) {
    throw new Error("CHAPTER_PARENT_TERMINAL_OUTPUT_NOT_PROVABLE");
  }

  if (input.kind === "complete") {
    if (
      parent.status !== "done"
      || finalization.state !== "done"
      || finalization.outputUrl === undefined
      || finalization.outputSize === undefined
    ) {
      throw new Error("CHAPTER_PARENT_COMPLETION_NOT_PROVABLE");
    }
    const completed = await completeChapterParentOrchestrationV1({
      authorization: input.authorization,
      currentProjectRevision: input.currentProjectRevision,
      selectedRegion: orchestration.selectedRegion,
      chapterCount: orchestration.chapterCount,
      chapterLayoutManifestHash: orchestration.chapterLayoutManifestHash,
      aggregateOutput,
      finalizedOutput: {
        url: finalization.outputUrl,
        sizeBytes: finalization.outputSize,
      },
      collection: input.renderJobs,
      session: input.session,
      now: input.now,
    });
    if (!completed.ok || completed.state !== "COMPLETED") {
      throw new Error("CHAPTER_PARENT_COMPLETION_WRITE_NOT_PROVED");
    }
    return;
  }

  if (
    parent.status !== "error"
    || finalization.state !== "failed"
    || !Number.isInteger(finalization.attempts)
    || finalization.attempts < MAX_RENDER_FINALIZATION_ATTEMPTS
  ) {
    return;
  }
  const failed = await failChapterParentOrchestrationV1({
    authorization: input.authorization,
    currentProjectRevision: input.currentProjectRevision,
    selectedRegion: orchestration.selectedRegion,
    chapterCount: orchestration.chapterCount,
    chapterLayoutManifestHash: orchestration.chapterLayoutManifestHash,
    aggregateOutput,
    terminalFinalization: true,
    error: finalization.error ?? parent.error ?? "Chapter finalization failed.",
    collection: input.renderJobs,
    session: input.session,
    now: input.now,
  });
  if (!failed.ok || failed.state !== "FAILED") {
    throw new Error("CHAPTER_PARENT_FAILURE_WRITE_NOT_PROVED");
  }
}

async function reconcileProviderFreeChapterStaleLifecycleV1(input: {
  authorization: ProjectRenderJobAuthorizationV1;
  renderJobs: Collection<RenderJob>;
  session: ClientSession;
  now: Date;
}): Promise<void> {
  if (!isChapterRenderAuthorizationV1(input.authorization)) return;
  const current = await input.renderJobs.findOne(
    { _id: input.authorization.jobId },
    { session: input.session },
  );
  if (current?.chapterOrchestration === undefined) return;
  const parent = parseProviderFreeChapterParentV1(current, input.authorization);
  if (!parent?.chapterOrchestration) {
    throw new Error("CHAPTER_PARENT_STALE_IDENTITY_NOT_PROVABLE");
  }
  const orchestration = parent.chapterOrchestration;
  const aggregateOutput = orchestration.aggregateOutput;
  const finalization = parent.finalization;
  if (
    orchestration.chapterCount === undefined
    || orchestration.chapterLayoutManifestHash === undefined
    || aggregateOutput === undefined
    || parent.status !== "error"
    || parent.artifactState !== "STALE"
    || finalization?.state !== "failed"
    || finalization.claimToken !== undefined
    || finalization.sourceOutputUrl !== aggregateOutput.url
    || finalization.sourceOutputSize !== aggregateOutput.sizeBytes
  ) {
    throw new Error("CHAPTER_PARENT_STALE_OUTPUT_NOT_PROVABLE");
  }
  const stale = await reconcileStaleChapterParentOrchestrationV1({
    authorization: input.authorization,
    currentProjectRevision: input.authorization.projectRevision,
    selectedRegion: orchestration.selectedRegion,
    chapterCount: orchestration.chapterCount,
    chapterLayoutManifestHash: orchestration.chapterLayoutManifestHash,
    aggregateOutput,
    error: finalization.error ?? parent.error ?? "Chapter finalization became stale.",
    collection: input.renderJobs,
    session: input.session,
    now: input.now,
  });
  if (!stale.ok || stale.state !== "STALE") {
    throw new Error("CHAPTER_PARENT_STALE_WRITE_NOT_PROVED");
  }
}

async function fenceStaleProviderFreeChapterAggregateV1(input: {
  authorization: ProjectRenderJobAuthorizationV1;
  observedProjectRevision: ProjectRevisionV1 | null;
  sourceOutputUrl: string;
  sourceOutputSize: number;
  error: unknown;
  now: Date;
  collection: Collection<RenderJob>;
  session: ClientSession;
}): Promise<ProjectRenderFinalizationTransactionResultV1> {
  if (input.observedProjectRevision !== null) {
    if (
      !sameProjectArtifactRevisionV1(
        input.authorization.projectRevision,
        input.observedProjectRevision,
      )
    ) {
      // The transaction owner has already proven the project changed. Keep
      // this branch explicit so an invalid observer cannot stale a live row.
    } else {
      return nonCurrentProjectRenderJobResultV1("INPUT_INVALID");
    }
  }
  if (
    typeof input.sourceOutputUrl !== "string"
    || !Number.isSafeInteger(input.sourceOutputSize)
    || input.sourceOutputSize < 0
  ) {
    return nonCurrentProjectRenderJobResultV1("INPUT_INVALID");
  }
  const current = await input.collection.findOne(
    { _id: input.authorization.jobId },
    { session: input.session },
  );
  const parsedCurrent = parseProviderFreeChapterParentV1(current, input.authorization);
  if (!parsedCurrent) return nonCurrentProjectRenderJobResultV1("JOB_NOT_CURRENT");
  if (providerFreeChapterStaleReplayMatchesV1(
    parsedCurrent,
    input.authorization,
    input.sourceOutputUrl,
    input.sourceOutputSize,
  )) {
    return { ok: true, status: "ALREADY_STALE" };
  }
  if (providerFreeChapterTerminalReplayMatchesV1(
    parsedCurrent,
    input.sourceOutputUrl,
    input.sourceOutputSize,
  )) {
    return { ok: true, status: "ALREADY_TERMINAL" };
  }
  const orchestration = parsedCurrent.chapterOrchestration;
  if (
    parsedCurrent.artifactState !== "ACTIVE"
    || parsedCurrent.status !== "rendering"
    || !orchestration
    || !isProviderFreeChapterFinalizationStateV1(parsedCurrent)
    || !chapterAggregateOutputMatchesV1(
      parsedCurrent,
      input.sourceOutputUrl,
      input.sourceOutputSize,
    )
  ) {
    return nonCurrentProjectRenderJobResultV1("JOB_STATE_NOT_ACTIVE");
  }

  const errorMessage = (input.error instanceof Error
    ? input.error.message
    : String(input.error)).trim().slice(0, 500) || "Chapter aggregate output became stale.";
  const fenced = await input.collection.updateOne(
    {
      _id: input.authorization.jobId,
      userId: input.authorization.ownerId,
      requestedByUserId: input.authorization.requestedByUserId,
      projectId: input.authorization.projectId,
      status: "rendering",
      artifactState: "ACTIVE",
      artifactBinding: { $exists: false },
      artifactInvalidation: { $exists: false },
      providerRenderId: { $exists: false },
      bucketName: { $exists: false },
      finalization: { $exists: false },
      "projectRenderSnapshotBinding.scope": "PROJECT_SNAPSHOT",
      "projectRenderSnapshotBinding.artifactId": input.authorization.jobId,
      "projectRenderSnapshotBinding.ownerId": input.authorization.ownerId,
      "projectRenderSnapshotBinding.projectId": input.authorization.projectId,
      "projectRenderSnapshotBinding.projectRevision.schemaVersion": 1,
      "projectRenderSnapshotBinding.projectRevision.value":
        input.authorization.projectRevision.value,
      "projectRenderSnapshotBinding.projectRevision.compatibilityUpdatedAt":
        input.authorization.projectRevision.compatibilityUpdatedAt,
      "projectRenderSnapshotBinding.bindingHash": input.authorization.bindingHash,
      "chapterOrchestration.version": 1,
      "chapterOrchestration.scope": "CHAPTER_ORCHESTRATION",
      "chapterOrchestration.aggregateJobId": input.authorization.jobId,
      "chapterOrchestration.bindingHash": input.authorization.bindingHash,
      "chapterOrchestration.selectedRegion": orchestration.selectedRegion,
      "chapterOrchestration.state": {
        $in: ["READY_FOR_FINALIZATION", "FINALIZING"],
      },
      "chapterOrchestration.chapterCount": orchestration.chapterCount,
      "chapterOrchestration.completedChapterCount": orchestration.completedChapterCount,
      "chapterOrchestration.progress": orchestration.progress,
      "chapterOrchestration.chapterLayoutManifestHash": orchestration.chapterLayoutManifestHash,
      "chapterOrchestration.aggregateOutput.url": input.sourceOutputUrl,
      "chapterOrchestration.aggregateOutput.sizeBytes": input.sourceOutputSize,
      "dispatch.version": 1,
      "dispatch.phase": "NOT_ATTEMPTED",
      "dispatch.providerRenderId": { $exists: false },
      "dispatch.providerBucketName": { $exists: false },
      "dispatch.providerRegion": { $exists: false },
      "dispatch.providerBoundAt": { $exists: false },
    } as Filter<RenderJob>,
    {
      $set: {
        status: "error",
        progress: 0.99,
        error: errorMessage,
        completedAt: input.now,
        artifactState: "STALE",
        artifactCleanup: {
          state: "PENDING",
          pendingArtifactIds: [input.authorization.jobId],
        },
        artifactInvalidatedAt: input.now,
        "chapterOrchestration.state": "STALE",
        "chapterOrchestration.staleAt": input.now,
        "chapterOrchestration.failure": {
          code: "CHAPTER_ORCHESTRATION_STALE",
          message: errorMessage,
        },
        finalization: {
          version: "editron-render-finalization-v1",
          state: "failed",
          sourceOutputUrl: input.sourceOutputUrl,
          sourceOutputSize: input.sourceOutputSize,
          attempts: 0,
          completedAt: input.now,
          error: errorMessage,
        },
      },
    },
    { session: input.session },
  );
  if (fenced.modifiedCount === 1) return { ok: true, status: "STALE" };

  const latest = await input.collection.findOne(
    { _id: input.authorization.jobId },
    { session: input.session },
  );
  const parsedLatest = parseProviderFreeChapterParentV1(latest, input.authorization);
  if (!parsedLatest) return nonCurrentProjectRenderJobResultV1("JOB_NOT_CURRENT");
  if (providerFreeChapterStaleReplayMatchesV1(
    parsedLatest,
    input.authorization,
    input.sourceOutputUrl,
    input.sourceOutputSize,
  )) {
    return { ok: true, status: "ALREADY_STALE" };
  }
  if (providerFreeChapterTerminalReplayMatchesV1(
    parsedLatest,
    input.sourceOutputUrl,
    input.sourceOutputSize,
  )) {
    return { ok: true, status: "ALREADY_TERMINAL" };
  }
  return nonCurrentProjectRenderJobResultV1("JOB_STATE_NOT_ACTIVE");
}

async function materializeChapterCleanupAtBoundaryV1(input: {
  authorization: ProjectRenderJobAuthorizationV1;
  chapterRenderJobs?: Collection<ChapterRenderCleanupChapterDocumentV1>;
  chapterConcatCleanupOutbox?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  renderSourceCleanupOutbox: Collection<ProjectRenderSourceCleanupOutboxV1>;
  renderJobs: Collection<RenderJob>;
  session: ClientSession;
  boundary: ChapterRenderCleanupBoundaryV1;
  expectedProviderOutput?: ChapterRenderCleanupProviderOutputV1;
  now: Date;
}): Promise<ChapterRenderCleanupMaterializerResultV1 | null> {
  if (!isChapterRenderAuthorizationV1(input.authorization)) return null;
  if (!input.chapterRenderJobs || !input.chapterConcatCleanupOutbox) {
    throw new Error("CHAPTER_RENDER_CLEANUP_COLLECTIONS_UNAVAILABLE");
  }
  return materializeChapterRenderCleanupV1({
    authorization: input.authorization,
    chapterCollection: input.chapterRenderJobs,
    childCleanupCollection: input.renderSourceCleanupOutbox,
    concatCleanupCollection: input.chapterConcatCleanupOutbox,
    parentRenderJobs: input.renderJobs as unknown as Collection<ChapterRenderCleanupParentDocumentV1>,
    session: input.session,
    boundary: input.boundary,
    expectedProviderOutput: input.expectedProviderOutput,
    now: input.now,
  });
}

async function materializeTerminalChapterCleanupV1(input: {
  authorization: ProjectRenderJobAuthorizationV1;
  chapterRenderJobs?: Collection<ChapterRenderCleanupChapterDocumentV1>;
  chapterConcatCleanupOutbox?: Collection<ProjectChapterConcatCleanupOutboxV1>;
  renderSourceCleanupOutbox: Collection<ProjectRenderSourceCleanupOutboxV1>;
  renderJobs: Collection<RenderJob>;
  session: ClientSession;
  now: Date;
}): Promise<boolean> {
  const latest = await input.renderJobs.findOne(
    { _id: input.authorization.jobId },
    { session: input.session },
  );
  const finalization = latest?.finalization;
  let boundary: ChapterRenderCleanupBoundaryV1 | undefined;
  if (latest?.status === "done" && finalization?.state === "done") {
    boundary = "CURRENT_SUCCESS";
  } else if (
    latest?.status === "error"
    && finalization?.state === "failed"
    && Number.isInteger(finalization.attempts)
    && finalization.attempts >= MAX_RENDER_FINALIZATION_ATTEMPTS
  ) {
    boundary = "TERMINAL_FINALIZATION_FAILURE";
  }
  if (!boundary) return false;
  await materializeChapterCleanupAtBoundaryV1({
    authorization: input.authorization,
    chapterRenderJobs: input.chapterRenderJobs,
    chapterConcatCleanupOutbox: input.chapterConcatCleanupOutbox,
    renderSourceCleanupOutbox: input.renderSourceCleanupOutbox,
    renderJobs: input.renderJobs,
    session: input.session,
    boundary,
    now: input.now,
  });
  return true;
}

export interface ProjectListItem {
  projectId: string;
  name: string;
  thumbnail?: string;
  updatedAt: Date;
  durationInFrames: number;
  aspectRatio: AspectRatio;
  // Dashboard fields
  brand?: string | null;
  pipelineStage?:
    | "script"
    | "edit"
    | "analyze"
    | "thumbnails"
    | "publish"
    | "complete";
  qualityScore?: number | null;
  projectStatus?: "active" | "needs-attention" | "complete" | "failed";
  // Cross-service linkage
  sourceSessionId?: string;
}

export class ProjectService {
  /**
   * Check if user can access a project (owner, org member, or explicitly shared)
   */
  async canAccessProject(userId: string, project: Project): Promise<boolean> {
    // Owner always has access
    if (project.userId === userId) return true;

    // Check org membership if project belongs to org
    if (project.orgId && project.visibility === "org") {
      const isMember = await orgMemberService.isMember(userId, project.orgId);
      if (isMember) return true;
    }

    // Check explicit sharing
    if (
      project.visibility === "shared" &&
      project.sharedWith?.includes(userId)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Create new personal project
   */
  async createProject(
    userId: string,
    name: string,
    options?: {
      brandId?: string;
      orgId?: string | null;
      sourceSessionId?: string;
      /** Chosen at intake (Script door / dialogs). Was silently dropped and
          every project hardcoded 16:9 regardless of the user's pick. */
      aspectRatio?: AspectRatio;
      /** The user's pasted script from the Script door. Persisted so intake
          can never silently destroy it; consumed by the in-editor AI /
          script-driven generation (the remaining Mode-1 gap). */
      initialScript?: string;
    },
  ): Promise<Project> {
    const projectId = `proj_${nanoid(12)}`;

    // Long edge pinned to 1080, matching lib/editron/storyline ASPECT_DIMENSIONS.
    const ASPECT_TO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
      "16:9": { width: 1920, height: 1080 },
      "9:16": { width: 1080, height: 1920 },
      "1:1": { width: 1080, height: 1080 },
      "4:5": { width: 1080, height: 1350 },
    };
    const aspectRatio: AspectRatio =
      options?.aspectRatio && ASPECT_TO_DIMENSIONS[options.aspectRatio]
        ? options.aspectRatio
        : "16:9";

    const project: Project = {
      projectId,
      userId,
      name,
      overlays: [],
      aspectRatio,
      playerDimensions: ASPECT_TO_DIMENSIONS[aspectRatio],
      ...(options?.initialScript ? { initialScript: options.initialScript } : {}),
      fps: 30,
      durationInFrames: 0,
      // P0/D9: orgId present ⇒ explicit org context (OrgSwitcher setActive) ⇒ org-owned
      // when the flag is on; else personal. Flag off = the legacy hardcoded 'private'.
      visibility: resolveCreationVisibility(
        options?.orgId,
        isOrgWalletBillingEnabled(),
      ),
      orgId: options?.orgId ?? null,
      pipelineStage: "edit",
      projectStatus: "active",
      ...(options?.brandId ? { brandId: options.brandId } : {}),
      ...(options?.sourceSessionId
        ? { sourceSessionId: options.sourceSessionId }
        : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
      projectRevision: 0,
    };

    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).insertOne(project);

    return project;
  }

  /**
   * Create new organization project
   */
  async createOrgProject(
    userId: string,
    orgId: string,
    name: string,
  ): Promise<Project> {
    // Verify user is member of org
    const isMember = await orgMemberService.isMember(userId, orgId);
    if (!isMember) {
      throw new Error("User is not a member of this organization");
    }

    const projectId = `proj_${nanoid(12)}`;

    const project: Project = {
      projectId,
      userId,
      orgId,
      name,
      overlays: [],
      aspectRatio: "16:9",
      playerDimensions: {
        width: 1920,
        height: 1080,
      },
      fps: 30,
      durationInFrames: 0,
      visibility: "org",
      createdAt: new Date(),
      updatedAt: new Date(),
      projectRevision: 0,
    };

    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).insertOne(project);

    return project;
  }

  /**
   * Create a lightweight project at "script" stage for ThinkForge sessions.
   * This makes the session visible on the Production Floor dashboard before
   * storyboard generation or finalize runs.
   * Returns null if a project already exists for this sessionId (idempotent).
   */
  async createScriptStageProject(
    userId: string,
    sessionId: string,
    name: string,
    options?: { brandId?: string; orgId?: string },
  ): Promise<Project | null> {
    const db = await getDatabase();

    // Idempotent: skip if a project already exists for this session
    const existing = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      userId,
      sourceSessionId: sessionId,
    })) as unknown as Project | null;
    if (existing) return null;

    const projectId = `proj_${nanoid(12)}`;

    const project: Project = {
      projectId,
      userId,
      name,
      overlays: [],
      aspectRatio: "16:9",
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 0,
      visibility: options?.orgId ? "org" : "private",
      pipelineStage: "script",
      projectStatus: "active",
      sourceSessionId: sessionId,
      ...(options?.brandId ? { brandId: options.brandId } : {}),
      ...(options?.orgId ? { orgId: options.orgId } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
      projectRevision: 0,
    };

    // Store sourceSessionId as an extra field for linkage
    const doc = { ...project, sourceSessionId: sessionId };
    await db.collection(COLLECTIONS.PROJECTS).insertOne(doc);

    return project;
  }

  /**
   * Find existing project by source session ID (for reuse during finalize).
   */
  async findProjectBySessionId(
    userId: string,
    sessionId: string,
  ): Promise<Project | null> {
    const db = await getDatabase();
    return db.collection(COLLECTIONS.PROJECTS).findOne({
      userId,
      sourceSessionId: sessionId,
    }) as unknown as Project | null;
  }

  /**
   * Load project by ID
   */
  async loadProject(
    userId: string,
    projectId: string,
  ): Promise<Project | null> {
    const db = await getDatabase();
    const project = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne({ projectId })) as unknown as Project | null;

    if (!project) {
      return null;
    }

    // Check access using org-aware access control
    const hasAccess = await this.canAccessProject(userId, project);
    if (!hasAccess) {
      console.warn(
        `User ${userId} attempted to access project ${projectId} without permission`,
      );
      return null;
    }

    // Resolve asset IDs to signed URLs
    project.overlays = await assetResolver.resolveProjectAssets(
      project.overlays,
      { projectId },
    );
    project.projectRevision = projectRevisionFor(project).value;

    return project;
  }

  /**
   * Load one access-authorized raw project snapshot for a render admission.
   * Asset URL hydration is deliberately left to the caller after the
   * pre-hydration binding has been created. The revision and owner are paired
   * with this exact persisted document read.
   */
  async loadProjectForRenderSnapshot(
    userId: string,
    projectId: string,
  ): Promise<ProjectRenderSnapshotReadV1 | null> {
    const db = await getDatabase();
    const project = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne({ projectId })) as unknown as Project | null;

    if (!project) return null;

    const hasAccess = await this.canAccessProject(userId, project);
    if (!hasAccess) {
      console.warn(
        `User ${userId} attempted to access project ${projectId} without permission`,
      );
      return null;
    }

    return {
      project: structuredClone(project),
      revision: projectRevisionFor(project),
      ownerId: project.userId,
    };
  }

  /**
   * Receipt-bearing manual save for browser clients that participate in the
   * ProjectService optimistic-concurrency protocol.
   */
  async saveProjectWithReceipt(
    userId: string,
    projectId: string,
    state: EditorState,
    options: {
      expectedRevision: ProjectRevisionV1;
      overlayAuthority?: OverlaySaveAuthority;
      projectUpdates?: Record<string, unknown>;
      projectUnsets?: readonly string[];
      directorLeaseId?: string;
    },
  ): Promise<ProjectMutationReceiptV1> {
    return this.persistEditorState({
      userId,
      projectId,
      state,
      expectedRevision: options.expectedRevision,
      overlayAuthority: options.overlayAuthority ?? "server",
      projectUpdates: options.projectUpdates,
      projectUnsets: options.projectUnsets,
      directorLeaseId: options.directorLeaseId,
      mode: "manual",
    });
  }

  /**
   * Autosave project (background save)
   */
  async autosaveProject(
    userId: string,
    projectId: string,
    state: EditorState,
    options: { expectedRevision: ProjectRevisionV1 },
  ): Promise<ProjectMutationReceiptV1> {
    return this.persistEditorState({
      userId,
      projectId,
      state,
      expectedRevision: options.expectedRevision,
      overlayAuthority: "server",
      mode: "autosave",
    });
  }

  /**
   * Return the current opaque ProjectService revision only when the caller is
   * the project owner. Checkpoint authorization uses this before every
   * checkpoint-store operation.
   */
  async getProjectRevision(
    userId: string,
    projectId: string,
  ): Promise<ProjectRevisionV1> {
    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
      { projection: { projectRevision: 1, updatedAt: 1 } },
    )) as Pick<Project, "projectRevision" | "updatedAt"> | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    return projectRevisionFor(project);
  }

  /**
   * Bind provider evidence only under an explicit signed-callback or exact
   * persisted-tuple proof source. This is deliberately a ProjectService
   * transaction so the live project revision fence and dispatch CAS cannot
   * be observed as separate decisions by recovery or a signed webhook.
   */
  async bindProjectRenderDispatchRecoveryTransactionV1(input: {
    authorization: unknown;
    attemptToken: string;
    providerRenderId: string;
    bucketName: string;
    region: string;
    proofSource: "SIGNED_CALLBACK" | "PERSISTED_PROVIDER_TUPLE";
    now?: Date;
  }): Promise<ProjectRenderDispatchBindingRecoveryResultV1> {
    const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
    if (!parsedAuthorization.success) {
      return {
        ok: false,
        status: "NON_CURRENT",
        code: PROJECT_ARTIFACT_NOT_CURRENT,
        reason: "AUTHORIZATION_INVALID",
      };
    }
    if (
      !isBoundedNonEmptyStringV1(input.attemptToken, 200)
      || !isBoundedNonEmptyStringV1(input.providerRenderId, 500)
      || !isBoundedNonEmptyStringV1(input.bucketName, 500)
      || !isBoundedNonEmptyStringV1(input.region, 100)
    ) {
      return {
        ok: false,
        status: "NON_CURRENT",
        code: PROJECT_ARTIFACT_NOT_CURRENT,
        reason: "INPUT_INVALID",
      };
    }
    const region = input.region.trim();
    if (!ProjectRenderSourceCleanupAwsRegionSchemaV1.safeParse(region).success) {
      return {
        ok: false,
        status: "NON_CURRENT",
        code: PROJECT_ARTIFACT_NOT_CURRENT,
        reason: "INPUT_INVALID",
      };
    }
    const authorization = parsedAuthorization.data;
    const attemptToken = input.attemptToken.trim();
    const providerRenderId = input.providerRenderId.trim();
    const bucketName = input.bucketName.trim();
    const identity = createProjectRenderDispatchIdentityV1({
      jobId: authorization.jobId,
      bindingHash: authorization.bindingHash,
    });
    if (attemptToken !== identity.attemptToken) {
      return {
        ok: false,
        status: "NON_CURRENT",
        code: PROJECT_ARTIFACT_NOT_CURRENT,
        reason: "INPUT_INVALID",
      };
    }
    if (
      input.proofSource !== "SIGNED_CALLBACK"
      && input.proofSource !== "PERSISTED_PROVIDER_TUPLE"
    ) {
      return {
        ok: false,
        status: "NON_CURRENT",
        code: PROJECT_ARTIFACT_NOT_CURRENT,
        reason: "INPUT_INVALID",
      };
    }
    const providerProofFilter: Filter<RenderJob> = input.proofSource === "SIGNED_CALLBACK"
      ? {
          $or: [
            {
              providerRenderId: { $exists: false },
              bucketName: { $exists: false },
              "dispatch.providerRenderId": { $exists: false },
              "dispatch.providerBucketName": { $exists: false },
              "dispatch.providerRegion": { $exists: false },
            },
            {
              providerRenderId,
              bucketName,
              "dispatch.providerRenderId": providerRenderId,
              "dispatch.providerBucketName": bucketName,
              "dispatch.providerRegion": region,
            },
          ],
        }
      : {
          providerRenderId,
          bucketName,
          "dispatch.providerRenderId": providerRenderId,
          "dispatch.providerBucketName": bucketName,
          "dispatch.providerRegion": region,
        };

    return this.runProjectRenderJobTransactionV1(
      {
        authorization,
        kind: "dispatch-recovery-bind",
        now: input.now,
      },
      async ({ authorization: currentAuthorization, renderJobs, session, transactionAt }) => {
        const exactDispatchFilter: Filter<RenderJob> = {
          _id: currentAuthorization.jobId,
          userId: currentAuthorization.ownerId,
          requestedByUserId: currentAuthorization.requestedByUserId,
          projectId: currentAuthorization.projectId,
          artifactState: "ACTIVE",
          artifactInvalidation: { $exists: false },
          artifactBinding: { $exists: false },
          "projectRenderSnapshotBinding.scope": "PROJECT_SNAPSHOT",
          "projectRenderSnapshotBinding.artifactId": currentAuthorization.jobId,
          "projectRenderSnapshotBinding.ownerId": currentAuthorization.ownerId,
          "projectRenderSnapshotBinding.projectId": currentAuthorization.projectId,
          "projectRenderSnapshotBinding.projectRevision.schemaVersion": 1,
          "projectRenderSnapshotBinding.projectRevision.value":
            currentAuthorization.projectRevision.value,
          "projectRenderSnapshotBinding.projectRevision.compatibilityUpdatedAt":
            currentAuthorization.projectRevision.compatibilityUpdatedAt,
          "projectRenderSnapshotBinding.bindingHash": currentAuthorization.bindingHash,
          "deliveryManifest.version": "editron-render-delivery-manifest-v1",
          "deliveryManifest.primaryArtifact.renderId": currentAuthorization.jobId,
          status: { $in: ["pending", "queued", "rendering"] },
          region,
          "dispatch.version": 1,
          "dispatch.phase": { $in: ["ATTEMPTING", "UNKNOWN"] },
          "dispatch.attemptToken": identity.attemptToken,
          "dispatch.creditIdempotencyKey": identity.creditIdempotencyKey,
          "dispatch.billingState": "RECORDED",
          "dispatch.creditTransactionId": { $exists: true },
          "dispatch.attemptStartedAt": { $type: "date" },
          ...providerProofFilter,
        };
        const bound = await renderJobs.updateOne(
          exactDispatchFilter,
          {
            $set: {
              status: "rendering",
              providerRenderId,
              bucketName,
              region,
              "dispatch.phase": "BOUND",
              "dispatch.providerBoundAt": transactionAt,
              "dispatch.providerRenderId": providerRenderId,
              "dispatch.providerBucketName": bucketName,
              "dispatch.providerRegion": region,
            },
            $unset: {
              "dispatch.unknownReason": "",
            },
          },
          { session },
        );
        if (bound.matchedCount === 1) {
          return { ok: true as const, status: "BOUND" as const };
        }

        const latest = await renderJobs.findOne(
          { _id: currentAuthorization.jobId },
          { session },
        );
        const parsedLatest = RenderJobSchema.safeParse(latest);
        const latestBinding = parsedLatest.success
          ? parsedLatest.data.projectRenderSnapshotBinding
          : undefined;
        const latestDispatch = parsedLatest.success ? parsedLatest.data.dispatch : undefined;
        if (
          parsedLatest.success
          && latestBinding?.scope === "PROJECT_SNAPSHOT"
          && latestBinding.artifactId === currentAuthorization.jobId
          && latestBinding.ownerId === currentAuthorization.ownerId
          && latestBinding.projectId === currentAuthorization.projectId
          && latestBinding.bindingHash === currentAuthorization.bindingHash
          && parsedLatest.data.userId === currentAuthorization.ownerId
          && parsedLatest.data.requestedByUserId === currentAuthorization.requestedByUserId
          && parsedLatest.data.projectId === currentAuthorization.projectId
          && parsedLatest.data.providerRenderId === providerRenderId
          && parsedLatest.data.bucketName === bucketName
          && parsedLatest.data.region === region
          && latestDispatch?.version === 1
          && latestDispatch.phase === "BOUND"
          && latestDispatch.attemptToken === identity.attemptToken
          && latestDispatch.billingState === "RECORDED"
          && latestDispatch.creditTransactionId !== undefined
          && latestDispatch.providerRenderId === providerRenderId
          && latestDispatch.providerBucketName === bucketName
          && latestDispatch.providerRegion === region
        ) {
          return { ok: true as const, status: "ALREADY_BOUND" as const };
        }
        return {
          ok: false as const,
          status: "NON_CURRENT" as const,
          code: PROJECT_ARTIFACT_NOT_CURRENT,
          reason: "JOB_STATE_NOT_ACTIVE" as const,
        };
      },
    );
  }

  /**
   * Publish one receipt-verified final render only while its bound project
   * revision is still current. The temporary project write fence makes the
   * project read and render-job CAS one serializable transaction boundary.
   */
  async completeProjectRenderJobFinalizationTransactionV1(input: {
    authorization: unknown;
    claimToken: string;
    result: unknown;
    now?: Date;
  }): Promise<ProjectRenderFinalizationTransactionResultV1> {
    return this.reconcileProjectRenderJobFinalizationTransactionV1({
      kind: "complete",
      ...input,
    });
  }

  /** Fail an exact finalization claim under the same project revision fence. */
  async failProjectRenderJobFinalizationTransactionV1(input: {
    authorization: unknown;
    claimToken: string;
    error: unknown;
    now?: Date;
  }): Promise<ProjectRenderFinalizationTransactionResultV1> {
    return this.reconcileProjectRenderJobFinalizationTransactionV1({
      kind: "failure",
      ...input,
    });
  }

  /**
   * Fence a finalizer callback whose project snapshot is no longer current.
   * The route-facing owner is deliberately transactional; chapter admissions
   * also require their child/concat cleanup outboxes before this can succeed.
   */
  async fenceStaleProjectRenderJobFinalizationTransactionV1(input: {
    authorization: unknown;
    observedProjectRevision: unknown | null;
    claimToken: string;
    error: unknown;
    now?: Date;
  }): Promise<ProjectRenderFinalizationTransactionResultV1> {
    return this.runProjectRenderJobTransactionV1(
      { authorization: input.authorization, kind: "stale-finalization", now: input.now },
      async ({
        authorization,
        renderJobs,
        renderSourceCleanupOutbox,
        chapterRenderJobs,
        chapterConcatCleanupOutbox,
        session,
        transactionAt,
      }) => {
        if (
          isChapterRenderAuthorizationV1(authorization)
          && await materializeTerminalChapterCleanupV1({
            authorization,
            chapterRenderJobs,
            chapterConcatCleanupOutbox,
            renderSourceCleanupOutbox,
            renderJobs,
            session,
            now: transactionAt,
          })
        ) {
          return { ok: true as const, status: "ALREADY_TERMINAL" as const };
        }
        return {
          ok: false as const,
          status: "NON_CURRENT" as const,
          code: PROJECT_ARTIFACT_NOT_CURRENT,
          reason: "JOB_STATE_NOT_ACTIVE" as const,
        };
      },
      async ({
        authorization,
        observedProjectRevision,
        renderJobs,
        renderSourceCleanupOutbox,
        chapterRenderJobs,
        chapterConcatCleanupOutbox,
        session,
        transactionAt,
      }) => {
        const fenced = isChapterRenderAuthorizationV1(authorization)
          ? await fenceStaleProjectRenderJobFinalizationV1({
              authorization,
              observedProjectRevision,
              claimToken: input.claimToken,
              error: input.error,
              now: transactionAt,
              collection: renderJobs,
              session,
            })
          : await fenceStaleProjectRenderJobFinalizationWithCleanupV1({
              authorization,
              observedProjectRevision,
              claimToken: input.claimToken,
              error: input.error,
              now: transactionAt,
              collection: renderJobs,
              cleanupCollection: renderSourceCleanupOutbox,
              session,
            });
        if (!fenced.ok) return fenced;
        if (isChapterRenderAuthorizationV1(authorization)) {
          if (fenced.status === "STALE" || fenced.status === "ALREADY_STALE") {
            await reconcileProviderFreeChapterStaleLifecycleV1({
              authorization,
              renderJobs,
              session,
              now: transactionAt,
            });
            await materializeChapterCleanupAtBoundaryV1({
              authorization,
              chapterRenderJobs,
              chapterConcatCleanupOutbox,
              renderSourceCleanupOutbox,
              renderJobs,
              session,
              boundary: "STALE_FINALIZATION",
              now: transactionAt,
            });
          } else if (
            fenced.status === "ALREADY_TERMINAL"
            && !await materializeTerminalChapterCleanupV1({
              authorization,
              chapterRenderJobs,
              chapterConcatCleanupOutbox,
              renderSourceCleanupOutbox,
              renderJobs,
              session,
              now: transactionAt,
            })
          ) {
            throw new Error("CHAPTER_RENDER_TERMINAL_CLEANUP_NOT_PROVABLE");
          }
        }
        return fenced;
      },
    );
  }

  /** Reconcile one signed provider failure only while its project is current. */
  async failProjectRenderJobFromProviderTransactionV1(input: {
    authorization: unknown;
    providerRenderId: string;
    bucketName: string;
    region: string;
    error: unknown;
    now?: Date;
  }): Promise<ProjectRenderJobMutationResultV1> {
    return this.runProjectRenderJobTransactionV1(
      {
        authorization: input.authorization,
        kind: "provider-failure",
        now: input.now,
      },
      ({ authorization, currentProjectRevision, renderJobs, session, transactionAt }) =>
        failProjectRenderJobFromProviderV1({
          authorization,
          currentProjectRevision,
          providerRenderId: input.providerRenderId,
          bucketName: input.bucketName,
          region: input.region,
          error: input.error,
          now: transactionAt,
          collection: renderJobs,
          session,
        }),
    );
  }

  /** Persist provider progress only while the bound project revision is current. */
  async updateProjectRenderJobProgressTransactionV1(input: {
    authorization: unknown;
    providerRenderId: string;
    bucketName: string;
    region: string;
    progress: number;
    now?: Date;
  }): Promise<ProjectRenderJobMutationResultV1> {
    return this.runProjectRenderJobTransactionV1(
      { authorization: input.authorization, kind: "progress", now: input.now },
      ({ authorization, currentProjectRevision, renderJobs, session }) =>
        updateProjectRenderJobProgressV1({
          authorization,
          currentProjectRevision,
          providerRenderId: input.providerRenderId,
          bucketName: input.bucketName,
          region: input.region,
          progress: input.progress,
          collection: renderJobs,
          session,
        }),
    );
  }

  /** Lease verified post-render effects under the same project revision fence. */
  async claimProjectRenderCompletionEffectsTransactionV1(input: {
    authorization: unknown;
    claimToken?: string;
    leaseMs?: number;
    now?: Date;
  }): Promise<ProjectRenderCompletionEffectsClaimV1 | ProjectRenderJobNotCurrentResultV1> {
    return this.runProjectRenderJobTransactionV1(
      { authorization: input.authorization, kind: "completion-effects-claim", now: input.now },
      ({ authorization, currentProjectRevision, renderJobs, session, transactionAt }) =>
        claimProjectRenderCompletionEffectsV1({
          authorization,
          currentProjectRevision,
          claimToken: input.claimToken,
          leaseMs: input.leaseMs,
          now: transactionAt,
          collection: renderJobs,
          session,
        }),
    );
  }

  /** Complete only the exact current completion-effects lease. */
  async completeProjectRenderCompletionEffectsTransactionV1(input: {
    authorization: unknown;
    claimToken: string;
    now?: Date;
  }): Promise<ProjectRenderJobMutationResultV1> {
    return this.runProjectRenderJobTransactionV1(
      { authorization: input.authorization, kind: "completion-effects-complete", now: input.now },
      ({ authorization, currentProjectRevision, renderJobs, session, transactionAt }) =>
        completeProjectRenderCompletionEffectsV1({
          authorization,
          currentProjectRevision,
          claimToken: input.claimToken,
          now: transactionAt,
          collection: renderJobs,
          session,
        }),
    );
  }

  /** Release only the exact current completion-effects lease. */
  async releaseProjectRenderCompletionEffectsTransactionV1(input: {
    authorization: unknown;
    claimToken: string;
    now?: Date;
  }): Promise<ProjectRenderJobMutationResultV1> {
    return this.runProjectRenderJobTransactionV1(
      { authorization: input.authorization, kind: "completion-effects-release", now: input.now },
      ({ authorization, currentProjectRevision, renderJobs, session }) =>
        releaseProjectRenderCompletionEffectsV1({
          authorization,
          currentProjectRevision,
          claimToken: input.claimToken,
          collection: renderJobs,
          session,
        }),
    );
  }

  /** Lease provider output for strict finalization under one project fence. */
  async claimProjectRenderJobFinalizationTransactionV1(input: {
    authorization: unknown;
    providerRenderId?: string;
    bucketName?: string;
    region?: string;
    sourceOutputUrl: string;
    sourceOutputSize: number;
    claimToken?: string;
    leaseMs?: number;
    now?: Date;
  }): Promise<ProjectRenderFinalizationClaimV1 | ProjectRenderJobNotCurrentResultV1> {
    const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
    if (!parsedAuthorization.success) {
      return nonCurrentProjectRenderJobResultV1("AUTHORIZATION_INVALID");
    }
    const hasProviderRenderId = input.providerRenderId !== undefined;
    const hasBucketName = input.bucketName !== undefined;
    const hasRegion = input.region !== undefined;
    const hasAnyProviderIdentity = hasProviderRenderId || hasBucketName || hasRegion;
    const hasCompleteProviderIdentity = hasProviderRenderId && hasBucketName && hasRegion;
    if (
      hasAnyProviderIdentity !== hasCompleteProviderIdentity
      || (!hasAnyProviderIdentity
        && !isProviderFreeChapterFinalizationInputV1(input, parsedAuthorization.data))
    ) {
      return nonCurrentProjectRenderJobResultV1("INPUT_INVALID");
    }
    const providerFreeChapter = isProviderFreeChapterFinalizationInputV1(
      input,
      parsedAuthorization.data,
    );
    return this.runProjectRenderJobTransactionV1(
      {
        authorization: input.authorization,
        kind: "initial-finalization-claim",
        now: input.now,
      },
      async ({ authorization, currentProjectRevision, renderJobs, session, transactionAt }) => {
        if (providerFreeChapter) {
          const current = await renderJobs.findOne(
            { _id: authorization.jobId },
            { session },
          );
          const parsedCurrent = parseProviderFreeChapterParentV1(current, authorization);
          if (
            !parsedCurrent
            || parsedCurrent.artifactState !== "ACTIVE"
            || (parsedCurrent.status !== "rendering" && parsedCurrent.status !== "finalizing")
            || !isProviderFreeChapterFinalizationStateV1(parsedCurrent)
            || !chapterAggregateOutputMatchesV1(
              parsedCurrent,
              input.sourceOutputUrl,
              input.sourceOutputSize,
            )
          ) {
            return nonCurrentProjectRenderJobResultV1("JOB_STATE_NOT_ACTIVE");
          }
        }
        return claimProjectRenderJobFinalizationV1({
          authorization,
          currentProjectRevision,
          providerRenderId: input.providerRenderId,
          bucketName: input.bucketName,
          region: input.region,
          sourceOutputUrl: input.sourceOutputUrl,
          sourceOutputSize: input.sourceOutputSize,
          claimToken: input.claimToken,
          leaseMs: input.leaseMs,
          now: transactionAt,
          collection: renderJobs,
          session,
        });
      },
      providerFreeChapter
        ? async ({
            authorization,
            observedProjectRevision,
            renderJobs,
            renderSourceCleanupOutbox,
            chapterRenderJobs,
            chapterConcatCleanupOutbox,
            session,
            transactionAt,
          }) => {
            const stale = await fenceStaleProviderFreeChapterAggregateV1({
              authorization,
              observedProjectRevision,
              sourceOutputUrl: input.sourceOutputUrl,
              sourceOutputSize: input.sourceOutputSize,
              error: "Project changed before provider-free chapter output finalization.",
              now: transactionAt,
              collection: renderJobs,
              session,
            });
            if (!stale.ok) return stale;
            if (stale.status === "STALE" || stale.status === "ALREADY_STALE") {
              await materializeChapterCleanupAtBoundaryV1({
                authorization,
                chapterRenderJobs,
                chapterConcatCleanupOutbox,
                renderSourceCleanupOutbox,
                renderJobs,
                session,
                boundary: "STALE_PROVIDER_OUTPUT",
                now: transactionAt,
              });
            } else if (
              stale.status === "ALREADY_TERMINAL"
              && !await materializeTerminalChapterCleanupV1({
                authorization,
                chapterRenderJobs,
                chapterConcatCleanupOutbox,
                renderSourceCleanupOutbox,
                renderJobs,
                session,
                now: transactionAt,
              })
            ) {
              throw new Error("CHAPTER_RENDER_TERMINAL_CLEANUP_NOT_PROVABLE");
            }
            return nonCurrentProjectRenderJobResultV1("PROJECT_REVISION_STALE");
          }
        : input.providerRenderId !== undefined
        && input.bucketName !== undefined
        && input.region !== undefined
        ? async ({
            authorization,
            observedProjectRevision,
            renderJobs,
            renderSourceCleanupOutbox,
            chapterRenderJobs,
            chapterConcatCleanupOutbox,
            session,
            transactionAt,
          }) => {
            const stale = isChapterRenderAuthorizationV1(authorization)
              ? await fenceStaleProjectRenderJobProviderOutputV1({
                  authorization,
                  observedProjectRevision,
                  providerRenderId: input.providerRenderId!,
                  bucketName: input.bucketName!,
                  region: input.region!,
                  sourceOutputUrl: input.sourceOutputUrl,
                  sourceOutputSize: input.sourceOutputSize,
                  error: "Project changed before provider output finalization.",
                  now: transactionAt,
                  collection: renderJobs,
                  session,
                })
              : await fenceStaleProjectRenderJobProviderOutputWithCleanupV1({
                  authorization,
                  observedProjectRevision,
                  providerRenderId: input.providerRenderId!,
                  bucketName: input.bucketName!,
                  region: input.region!,
                  sourceOutputUrl: input.sourceOutputUrl,
                  sourceOutputSize: input.sourceOutputSize,
                  error: "Project changed before provider output finalization.",
                  now: transactionAt,
                  collection: renderJobs,
                  cleanupCollection: renderSourceCleanupOutbox,
                  session,
                });
            if (!stale.ok) return stale;
            if (isChapterRenderAuthorizationV1(authorization)) {
              await materializeChapterCleanupAtBoundaryV1({
                authorization,
                chapterRenderJobs,
                chapterConcatCleanupOutbox,
                renderSourceCleanupOutbox,
                renderJobs,
                session,
                boundary: "STALE_PROVIDER_OUTPUT",
                expectedProviderOutput: {
                  providerRenderId: input.providerRenderId!,
                  bucketName: input.bucketName!,
                  region: input.region!,
                  sourceOutputUrl: input.sourceOutputUrl,
                  sourceOutputSize: input.sourceOutputSize,
                },
                now: transactionAt,
              });
            }
            return {
              ok: false as const,
              status: "NON_CURRENT" as const,
              code: PROJECT_ARTIFACT_NOT_CURRENT,
              reason: "PROJECT_REVISION_STALE" as const,
            };
          }
        : undefined,
    );
  }

  /** Release only the current strict claim after initial queue dispatch fails. */
  async releaseProjectRenderJobFinalizationClaimTransactionV1(input: {
    authorization: unknown;
    claimToken: string;
    now?: Date;
  }): Promise<ProjectRenderJobMutationResultV1> {
    return this.runProjectRenderJobTransactionV1(
      {
        authorization: input.authorization,
        kind: "initial-finalization-release",
        now: input.now,
      },
      ({ authorization, currentProjectRevision, renderJobs, session }) =>
        releaseProjectRenderJobFinalizationClaimV1({
          authorization,
          currentProjectRevision,
          claimToken: input.claimToken,
          collection: renderJobs,
          session,
        }),
    );
  }

  /** Re-lease preserved provider output without a second render purchase. */
  async claimFailedProjectRenderJobFinalizationRetryTransactionV1(input: {
    authorization: unknown;
    claimToken?: string;
    leaseMs?: number;
    now?: Date;
  }): Promise<ProjectRenderFinalizationClaimV1 | ProjectRenderJobNotCurrentResultV1> {
    return this.runProjectRenderJobTransactionV1(
      {
        authorization: input.authorization,
        kind: "failed-finalization-retry-claim",
        now: input.now,
      },
      ({ authorization, currentProjectRevision, renderJobs, session, transactionAt }) =>
        claimFailedProjectRenderJobFinalizationRetryV1({
          authorization,
          currentProjectRevision,
          claimToken: input.claimToken,
          leaseMs: input.leaseMs,
          now: transactionAt,
          collection: renderJobs,
          session,
        }),
    );
  }

  /** Restore only the current failed-retry claim after queue dispatch fails. */
  async releaseFailedProjectRenderJobFinalizationRetryClaimTransactionV1(input: {
    authorization: unknown;
    claimToken: string;
    error: unknown;
    now?: Date;
  }): Promise<ProjectRenderJobMutationResultV1> {
    return this.runProjectRenderJobTransactionV1(
      {
        authorization: input.authorization,
        kind: "failed-finalization-retry-release",
        now: input.now,
      },
      ({ authorization, currentProjectRevision, renderJobs, session, transactionAt }) =>
        releaseFailedProjectRenderJobFinalizationRetryClaimV1({
          authorization,
          currentProjectRevision,
          claimToken: input.claimToken,
          error: input.error,
          now: transactionAt,
          collection: renderJobs,
          session,
        }),
    );
  }

  private async reconcileProjectRenderJobFinalizationTransactionV1(
    input: ProjectRenderFinalizationTransactionCommandV1,
  ): Promise<ProjectRenderFinalizationTransactionResultV1> {
    return this.runProjectRenderJobTransactionV1(
      { authorization: input.authorization, kind: input.kind, now: input.now },
      async ({
        authorization,
        currentProjectRevision,
        renderJobs,
        renderSourceCleanupOutbox,
        chapterRenderJobs,
        chapterConcatCleanupOutbox,
        session,
        transactionAt,
      }) => {
        const result = input.kind === "complete"
          ? await completeBoundProjectRenderJobFinalizationV1({
              authorization,
              currentProjectRevision,
              claimToken: input.claimToken,
              result: input.result,
              now: transactionAt,
              collection: renderJobs,
              session,
            })
          : await failBoundProjectRenderJobFinalizationV1({
              authorization,
              currentProjectRevision,
              claimToken: input.claimToken,
              error: input.error,
              now: transactionAt,
              collection: renderJobs,
              session,
            });
        if (result.ok && result.status === "CURRENT") {
          await reconcileProviderFreeChapterTerminalLifecycleV1({
            authorization,
            currentProjectRevision,
            kind: input.kind,
            renderJobs,
            session,
            now: transactionAt,
          });
          if (input.kind === "complete") {
            await materializeChapterCleanupAtBoundaryV1({
              authorization,
              chapterRenderJobs,
              chapterConcatCleanupOutbox,
              renderSourceCleanupOutbox,
              renderJobs,
              session,
              boundary: "CURRENT_SUCCESS",
              now: transactionAt,
            });
          } else {
            const latest = await renderJobs.findOne(
              { _id: authorization.jobId },
              { session },
            );
            const finalization = latest?.finalization;
            if (
              Number.isInteger(finalization?.attempts)
              && (finalization?.attempts as number) >= MAX_RENDER_FINALIZATION_ATTEMPTS
            ) {
              await materializeChapterCleanupAtBoundaryV1({
                authorization,
                chapterRenderJobs,
                chapterConcatCleanupOutbox,
                renderSourceCleanupOutbox,
                renderJobs,
                session,
                boundary: "TERMINAL_FINALIZATION_FAILURE",
                now: transactionAt,
              });
            }
          }
        }
        return result;
      },
      async ({
        authorization,
        observedProjectRevision,
        renderJobs,
        renderSourceCleanupOutbox,
        chapterRenderJobs,
        chapterConcatCleanupOutbox,
        session,
        transactionAt,
      }) => {
        const fenced = isChapterRenderAuthorizationV1(authorization)
          ? await fenceStaleProjectRenderJobFinalizationV1({
              authorization,
              observedProjectRevision,
              claimToken: input.claimToken,
              error: input.kind === "failure"
                ? input.error
                : "Project changed before final render publication.",
              now: transactionAt,
              collection: renderJobs,
              session,
            })
          : await fenceStaleProjectRenderJobFinalizationWithCleanupV1({
              authorization,
              observedProjectRevision,
              claimToken: input.claimToken,
              error: input.kind === "failure"
                ? input.error
                : "Project changed before final render publication.",
              now: transactionAt,
              collection: renderJobs,
              cleanupCollection: renderSourceCleanupOutbox,
              session,
            });
        if (!fenced.ok) return fenced;
        if (isChapterRenderAuthorizationV1(authorization)) {
          if (fenced.status === "STALE" || fenced.status === "ALREADY_STALE") {
            await reconcileProviderFreeChapterStaleLifecycleV1({
              authorization,
              renderJobs,
              session,
              now: transactionAt,
            });
            await materializeChapterCleanupAtBoundaryV1({
              authorization,
              chapterRenderJobs,
              chapterConcatCleanupOutbox,
              renderSourceCleanupOutbox,
              renderJobs,
              session,
              boundary: "STALE_FINALIZATION",
              now: transactionAt,
            });
          } else if (
            fenced.status === "ALREADY_TERMINAL"
            && !await materializeTerminalChapterCleanupV1({
              authorization,
              chapterRenderJobs,
              chapterConcatCleanupOutbox,
              renderSourceCleanupOutbox,
              renderJobs,
              session,
              now: transactionAt,
            })
          ) {
            throw new Error("CHAPTER_RENDER_TERMINAL_CLEANUP_NOT_PROVABLE");
          }
        }
        return fenced;
      },
    );
  }

  private async runProjectRenderJobTransactionV1<TCurrent, TStale = never>(
    input: {
      authorization: unknown;
      kind: ProjectRenderJobTransactionKindV1;
      now?: Date;
    },
    currentOwner: (context: ProjectRenderJobTransactionContextV1) => Promise<TCurrent>,
    staleOwner?: (context: StaleProjectRenderJobTransactionContextV1) => Promise<TStale>,
  ): Promise<TCurrent | TStale | ProjectRenderJobNotCurrentResultV1> {
    const parsedAuthorization = ProjectRenderJobAuthorizationSchema.safeParse(input.authorization);
    if (!parsedAuthorization.success) {
      return {
        ok: false,
        status: "NON_CURRENT",
        code: PROJECT_ARTIFACT_NOT_CURRENT,
        reason: "AUTHORIZATION_INVALID",
      };
    }

    const transactionAt = input.now ?? new Date();
    if (!(transactionAt instanceof Date) || Number.isNaN(transactionAt.getTime())) {
      return {
        ok: false,
        status: "NON_CURRENT",
        code: PROJECT_ARTIFACT_NOT_CURRENT,
        reason: "INPUT_INVALID",
      };
    }
    const authorization = parsedAuthorization.data;
    const transactionToken = randomBytes(16).toString("hex");
    const { client, db } = await connectToDatabase();
    const session = client.startSession();
    const renderJobs = db.collection<RenderJob>(PROJECT_RENDER_JOBS_COLLECTION_V1);
    const renderSourceCleanupOutbox = db.collection<ProjectRenderSourceCleanupOutboxV1>(
      PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
    );
    const chapterRenderJobs = isChapterRenderAuthorizationV1(authorization)
      ? db.collection<ChapterRenderCleanupChapterDocumentV1>(
          CHAPTER_RENDER_CLEANUP_CHAPTERS_COLLECTION_V1,
        )
      : undefined;
    const chapterConcatCleanupOutbox = chapterRenderJobs
      ? db.collection<ProjectChapterConcatCleanupOutboxV1>(
          PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1,
        )
      : undefined;
    try {
      const result = await session.withTransaction(async () => {
        const projects = db.collection(COLLECTIONS.PROJECTS);
        const lockedProject = (await projects.findOneAndUpdate(
          {
            projectId: authorization.projectId,
            userId: authorization.ownerId,
            ...projectRevisionPredicate(authorization.projectRevision),
          },
          {
            $set: {
              [PROJECT_RENDER_FINALIZATION_TRANSACTION_FENCE_V1]: {
                schemaVersion: 1,
                transactionToken,
                jobId: authorization.jobId,
                kind: input.kind,
                acquiredAt: transactionAt,
              },
            },
          },
          {
            projection: { projectRevision: 1, updatedAt: 1 },
            returnDocument: "after",
            session,
          },
        )) as Pick<Project, "projectRevision" | "updatedAt"> | null;

        if (!lockedProject) {
          const observedProject = (await projects.findOne(
            {
              projectId: authorization.projectId,
              userId: authorization.ownerId,
            },
            {
              projection: { projectRevision: 1, updatedAt: 1 },
              session,
            },
          )) as Pick<Project, "projectRevision" | "updatedAt"> | null;
          const observedProjectRevision = observedProject
            ? projectRevisionFor(observedProject)
            : null;
          if (staleOwner) {
            return staleOwner({
              authorization,
              observedProjectRevision,
              renderJobs,
              renderSourceCleanupOutbox,
              chapterRenderJobs,
              chapterConcatCleanupOutbox,
              session,
              transactionAt,
            });
          }
          return {
            ok: false as const,
            status: "NON_CURRENT" as const,
            code: PROJECT_ARTIFACT_NOT_CURRENT,
            reason: "PROJECT_REVISION_STALE" as const,
          };
        }

        const currentProjectRevision = projectRevisionFor(lockedProject);
        const jobResult = await currentOwner({
          authorization,
          currentProjectRevision,
          renderJobs,
          renderSourceCleanupOutbox,
          chapterRenderJobs,
          chapterConcatCleanupOutbox,
          session,
          transactionAt,
        });

        const released = await projects.updateOne(
          {
            projectId: authorization.projectId,
            userId: authorization.ownerId,
            [`${PROJECT_RENDER_FINALIZATION_TRANSACTION_FENCE_V1}.transactionToken`]:
              transactionToken,
          },
          {
            $unset: {
              [PROJECT_RENDER_FINALIZATION_TRANSACTION_FENCE_V1]: "",
            },
          },
          { session },
        );
        if (released.matchedCount !== 1 || released.modifiedCount !== 1) {
          throw new ProjectMutationWriteError(
            "Render finalization transaction fence could not be released.",
          );
        }
        return jobResult;
      }, {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      });
      if (result === undefined) {
        throw new ProjectMutationWriteError(
          "Render finalization transaction returned no result.",
        );
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Returns one owner-scoped project snapshot paired with the exact revision
   * that describes it. A writer must carry this revision into its later CAS
   * instead of separately sampling a newer revision for an older snapshot.
   */
  async loadProjectForMutation(
    userId: string,
    projectId: string,
  ): Promise<{ project: Project; revision: ProjectRevisionV1 }> {
    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
    )) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    return {
      project: structuredClone(project),
      revision: projectRevisionFor(project),
    };
  }

  /**
   * Snapshot every explicit project source range for one current proxy asset
   * against the verified V3 timestamp owner before proxy/master activation.
   * The binding and the revision it describes share one Project document CAS.
   * Media evidence is re-read before and after that CAS because project and
   * media collections do not share a transaction boundary.
   */
  async bindProjectOverlaysToVerifiedProxySourceV1(
    userId: string,
    projectId: string,
    input: ProjectProxySourceBindingCommandV1,
  ): Promise<ProjectProxySourceBindingResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectProxyMasterRelinkActorAndAssetV1(
      input.actorKind,
      input.assetId,
    );
    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    const block = (
      reason: ProjectProxySourceBindingBlockReasonV1,
      message?: string,
    ): ProjectProxySourceBindingBlockedErrorV1 =>
      new ProjectProxySourceBindingBlockedErrorV1(
        reason,
        currentRevision,
        message,
      );
    const mediaAssets = db.collection(COLLECTIONS.MEDIA_ASSETS);
    const loadAssetEvidence = async (): Promise<
    ProjectProxySourceBindingAssetEvidenceV1
    > => {
      let asset: ProjectProxySourceBindingAssetRecordV1 | null;
      try {
        asset = (await mediaAssets.findOne({
          assetId: input.assetId,
          userId,
        })) as ProjectProxySourceBindingAssetRecordV1 | null;
      } catch {
        throw block(
          "ASSET_EVIDENCE_UNAVAILABLE",
          "The proxy asset could not be reloaded for source-binding verification.",
        );
      }
      if (!asset) {
        throw block(
          "SOURCE_ASSET_NOT_FOUND",
          "The proxy source asset no longer exists for this owner.",
        );
      }
      try {
        return readProjectProxySourceBindingAssetEvidenceV1(
          asset,
          input.assetId,
        );
      } catch (error) {
        if (error instanceof ProjectProxySourceBindingPreparationErrorV1) {
          throw block(error.reason, error.message);
        }
        throw block(
          "VERIFIED_V3_PROXY_SOURCE_REQUIRED",
          "The current asset is not a complete verified V3 proxy source.",
        );
      }
    };

    const initialAssetEvidence = await loadAssetEvidence();
    let relinkStates: readonly ProjectProxyMasterRelinkStateV1[];
    let sourceBindings: readonly ProjectProxySourceBindingV1[];
    try {
      relinkStates = assertProjectProxyMasterRelinkStateHistoryV1(
        project.proxyMasterRelinkStatesV1,
        projectId,
        PROJECT_PROXY_MASTER_RELINK_POLICY_V1.maxProjectRelinkStates,
      );
      sourceBindings = assertProjectProxySourceBindingHistoryV1(
        project.proxySourceBindingsV1,
        projectId,
        PROJECT_PROXY_MASTER_RELINK_POLICY_V1.maxProjectRelinkStates,
      );
    } catch {
      throw block(
        "BINDING_HISTORY_INVALID",
        "The server-owned proxy binding or relink history is invalid.",
      );
    }
    if (relinkStates.some((state) => state.assetId === input.assetId)) {
      throw block(
        "RELINK_ALREADY_PRESENT",
        "A project already relinked to a master cannot be rebound as a proxy.",
      );
    }

    let overlays: readonly ProjectProxySourceBindingOverlayV1[];
    try {
      overlays = prepareProjectProxySourceBindingOverlaysV1({
        project,
        assetId: input.assetId,
        totalSourceFrameCount:
          initialAssetEvidence.verifiedBinding.totalSourceFrameCount,
      });
    } catch (error) {
      if (error instanceof ProjectProxySourceBindingPreparationErrorV1) {
        throw block(error.reason, error.message);
      }
      throw block(
        "SOURCE_RANGE_INVALID",
        "The project proxy source ranges cannot be bound safely.",
      );
    }

    const existingBinding = sourceBindings.find(
      (binding) => binding.assetId === input.assetId,
    );
    if (existingBinding
      && projectProxySourceBindingMatchesCurrentEvidenceV1({
        binding: existingBinding,
        currentRevision,
        evidence: initialAssetEvidence,
        overlays,
      })
      && projectOverlaysMatchSourceVersionPinsV1({
        projectId,
        overlays: project.overlays,
        assetId: input.assetId,
        targetOverlayIds: existingBinding.overlays.map(
          (overlay) => overlay.overlayId,
        ),
        sourceRole: "PROXY",
        sourceVersionSha256:
          initialAssetEvidence.verifiedBinding.sourceVersionSha256,
        storageVersionSha256:
          initialAssetEvidence.verifiedBinding.storageVersionSha256,
        authority: {
          kind: "PROJECT_PROXY_SOURCE_BINDING",
          bindingSha256: existingBinding.bindingSha256,
          proxyTimeMapReferenceSha256:
            existingBinding.proxyTimeMapReferenceSha256,
        },
        issuedAt: new Date(existingBinding.boundAt),
      })) {
      const commitReceipt = createProjectProxySourceBindingCommitReceiptV1({
        binding: existingBinding,
        mutationReceipt:
          projectProxySourceBindingMutationReceiptFromBindingV1(
            existingBinding,
          ),
      });
      return {
        disposition: "UNCHANGED",
        commitReceipt,
        admissionReceipt: createProjectProxySourceBindingAdmissionReceiptV1({
          commitReceipt,
          currentVerifiedSourceBindingSha256:
            initialAssetEvidence.verifiedBinding.bindingSha256,
          admittedAt: new Date(),
        }),
      };
    }

    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before retrying.",
      );
    }

    const preCommitAssetEvidence = await loadAssetEvidence();
    if (!sameProjectProxySourceBindingAssetEvidenceV1(
      initialAssetEvidence,
      preCommitAssetEvidence,
    )) {
      throw block(
        "ASSET_CHANGED_BEFORE_COMMIT",
        "The verified proxy source changed before the project binding CAS.",
      );
    }

    const committedAt = new Date();
    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: currentRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    const binding = createProjectProxySourceBindingV1({
      projectId,
      assetId: input.assetId,
      actorKind: input.actorKind,
      proxySourceVersionSha256:
        initialAssetEvidence.verifiedBinding.sourceVersionSha256,
      verifiedSourceBindingSha256:
        initialAssetEvidence.verifiedBinding.bindingSha256,
      proxyTimeMapReferenceSha256:
        initialAssetEvidence.proxyTimeMapReferenceSha256,
      projectRevision: mutationReceipt.revision,
      overlays,
      boundAt: committedAt,
    });
    const nextBindings = assertProjectProxySourceBindingHistoryV1(
      [
        ...sourceBindings.filter((entry) => entry.assetId !== input.assetId),
        binding,
      ].sort((left, right) => left.assetId.localeCompare(right.assetId)),
      projectId,
      PROJECT_PROXY_MASTER_RELINK_POLICY_V1.maxProjectRelinkStates,
    );
    const persistedOverlays = assetResolver.stripUrlsForLLM(
      applyProjectVideoSourceVersionPinsV1({
        projectId,
        overlays: project.overlays,
        assetId: input.assetId,
        targetOverlayIds: binding.overlays.map(
          (overlay) => overlay.overlayId,
        ),
        sourceRole: "PROXY",
        sourceVersionSha256: binding.proxySourceVersionSha256,
        storageVersionSha256:
          initialAssetEvidence.verifiedBinding.storageVersionSha256,
        authority: {
          kind: "PROJECT_PROXY_SOURCE_BINDING",
          bindingSha256: binding.bindingSha256,
          proxyTimeMapReferenceSha256:
            binding.proxyTimeMapReferenceSha256,
        },
        issuedAt: committedAt,
      }),
    );
    const update = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(currentRevision),
      },
      {
        $set: {
          overlays: persistedOverlays,
          proxySourceBindingsV1: nextBindings,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (update.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (update.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const commitReceipt = createProjectProxySourceBindingCommitReceiptV1({
      binding,
      mutationReceipt,
    });
    this.publishMutationReceipt(mutationReceipt);

    let postCommitAssetEvidence: ProjectProxySourceBindingAssetEvidenceV1;
    try {
      postCommitAssetEvidence = await loadAssetEvidence();
    } catch {
      return {
        disposition: "COMMITTED_REVALIDATION_REQUIRED",
        reason: "ASSET_REVALIDATION_UNAVAILABLE",
        commitReceipt,
      };
    }
    if (!sameProjectProxySourceBindingAssetEvidenceV1(
      initialAssetEvidence,
      postCommitAssetEvidence,
    )) {
      return {
        disposition: "COMMITTED_REVALIDATION_REQUIRED",
        reason: "ASSET_CHANGED_AFTER_COMMIT",
        commitReceipt,
      };
    }
    return {
      disposition: "APPLIED",
      commitReceipt,
      admissionReceipt: createProjectProxySourceBindingAdmissionReceiptV1({
        commitReceipt,
        currentVerifiedSourceBindingSha256:
          postCommitAssetEvidence.verifiedBinding.bindingSha256,
        admittedAt: new Date(),
      }),
    };
  }

  /**
   * Relink every explicitly source-bounded video overlay for one logical asset
   * from its ProjectService-proved proxy basis to the currently qualified
   * master. Project coordinates and the durable relink state share one CAS.
   * Media evidence is re-read before and after that CAS; a post-commit race is
   * reported as requiring revalidation and is never represented as success.
   */
  async relinkProjectProxyToQualifiedMasterV1(
    userId: string,
    projectId: string,
    input: ProjectProxyMasterRelinkCommandV1,
  ): Promise<ProjectProxyMasterRelinkResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectProxyMasterRelinkActorAndAssetV1(
      input.actorKind,
      input.assetId,
    );
    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    const block = (
      reason: ProjectProxyMasterRelinkBlockReasonV1,
      message?: string,
    ): ProjectProxyMasterRelinkBlockedErrorV1 =>
      new ProjectProxyMasterRelinkBlockedErrorV1(
        reason,
        currentRevision,
        message,
      );
    const mediaAssets = db.collection(COLLECTIONS.MEDIA_ASSETS);
    const loadAssetEvidence = async (): Promise<
    ProjectProxyMasterRelinkAssetEvidenceV1
    > => {
      let asset: ProjectProxyMasterRelinkAssetRecordV1 | null;
      try {
        asset = (await mediaAssets.findOne({
          assetId: input.assetId,
          userId,
        })) as ProjectProxyMasterRelinkAssetRecordV1 | null;
      } catch {
        throw block(
          "ASSET_EVIDENCE_UNAVAILABLE",
          "The media asset could not be reloaded for relink verification.",
        );
      }
      if (!asset) {
        throw block(
          "SOURCE_ASSET_NOT_FOUND",
          "The relink source asset no longer exists for this owner.",
        );
      }
      try {
        return readProjectProxyMasterRelinkAssetEvidenceV1(
          asset,
          input.assetId,
        );
      } catch (error) {
        if (error instanceof ProjectProxyMasterRelinkPreparationErrorV1) {
          throw block(error.reason, error.message);
        }
        throw block(
          "ACTIVE_MAPPING_INVALID",
          "The current proxy/master asset evidence is invalid.",
        );
      }
    };

    const initialAssetEvidence = await loadAssetEvidence();
    let boundaryResolution: MediaProxyMasterExactBoundaryResolutionReceiptV1;
    try {
      boundaryResolution =
        assertMediaProxyMasterExactBoundaryResolutionReceiptV1(
          input.boundaryResolution,
          initialAssetEvidence.activeMappingState,
        );
    } catch {
      throw block(
        "BOUNDARY_EVIDENCE_INVALID",
        "The exact proxy/master boundary receipt is missing, stale or invalid.",
      );
    }

    let relinkStates: readonly ProjectProxyMasterRelinkStateV1[];
    try {
      relinkStates = assertProjectProxyMasterRelinkStateHistoryV1(
        project.proxyMasterRelinkStatesV1,
        projectId,
        PROJECT_PROXY_MASTER_RELINK_POLICY_V1.maxProjectRelinkStates,
      );
    } catch {
      throw block(
        "RELINK_HISTORY_INVALID",
        "The server-owned project relink history is invalid.",
      );
    }
    const existingState = relinkStates.find(
      (state) => state.assetId === input.assetId,
    );
    if (existingState) {
      let validatedState: ProjectProxyMasterRelinkStateV1;
      try {
        validatedState = assertProjectProxyMasterRelinkStateV1(
          existingState,
          initialAssetEvidence.activeMappingState,
        );
      } catch {
        throw block(
          "EXISTING_MASTER_BINDING_REBASE_REQUIRED",
          "This project is already bound through a different active master mapping.",
        );
      }
      if (validatedState.boundaryResolution.resolutionSha256
          !== boundaryResolution.resolutionSha256) {
        throw block(
          "EXISTING_MASTER_BINDING_REBASE_REQUIRED",
          "The replayed boundary evidence differs from the committed master binding.",
        );
      }
      if (!projectMatchesCommittedProxyMasterRelinkStateV1(
        project,
        validatedState,
        initialAssetEvidence.activeMappingState,
      )) {
        throw block(
          "EXISTING_MASTER_BINDING_DRIFTED",
          "The committed master coordinates no longer match the current project.",
        );
      }
      return {
        disposition: "UNCHANGED",
        commitReceipt: createProjectProxyMasterRelinkCommitReceiptV1({
          state: validatedState,
          activeMappingState: initialAssetEvidence.activeMappingState,
          mutationReceipt:
            projectProxyMasterRelinkMutationReceiptFromStateV1(validatedState),
        }),
      };
    }

    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before retrying.",
      );
    }

    let sourceBindings: readonly ProjectProxySourceBindingV1[];
    try {
      sourceBindings = assertProjectProxySourceBindingHistoryV1(
        project.proxySourceBindingsV1,
        projectId,
        PROJECT_PROXY_MASTER_RELINK_POLICY_V1.maxProjectRelinkStates,
      );
    } catch {
      throw block(
        "RELINK_HISTORY_INVALID",
        "The server-owned proxy source-binding history is invalid.",
      );
    }
    const sourceBinding = sourceBindings.find(
      (binding) => binding.assetId === input.assetId,
    );
    if (!sourceBinding) {
      throw block(
        "SOURCE_BINDING_NOT_FOUND",
        "The project has no durable proof that these coordinates belong to the proxy source.",
      );
    }

    let prepared: ProjectProxyMasterPreparedRelinkV1;
    try {
      prepared = prepareProjectProxyMasterRelinkV1({
        project,
        currentRevision,
        sourceBinding,
        activeMappingState: initialAssetEvidence.activeMappingState,
        boundaryResolution,
      });
    } catch (error) {
      if (error instanceof ProjectProxyMasterRelinkPreparationErrorV1) {
        throw block(error.reason, error.message);
      }
      throw block(
        "SOURCE_RANGE_INVALID",
        "The project source ranges cannot be relinked safely.",
      );
    }

    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => prepared.overlayChanges.some((change) =>
      frameRangesOverlapHalfOpenV1(lock.frameRange, {
        startFrame: change.timelineStartFrame,
        endFrame: change.timelineEndFrameExclusive,
      })));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps the proxy/master relink.",
      );
    }

    const committedAt = new Date();
    let relinkState: ProjectProxyMasterRelinkStateV1;
    try {
      relinkState = createProjectProxyMasterRelinkStateV1({
        projectId,
        assetId: input.assetId,
        actorKind: input.actorKind,
        activeMappingState: initialAssetEvidence.activeMappingState,
        beforeSourceBinding: sourceBinding,
        boundaryResolution,
        sourceInvalidationPlanSha256:
          initialAssetEvidence.activeMappingState.proxyMasterActiveMappingV1
            .sourceInvalidationPlanSha256,
        audioRightsEvidenceSha256:
          initialAssetEvidence.audioRightsEvidenceSha256,
        beforeProjectRevision: currentRevision,
        overlayChanges: prepared.overlayChanges,
        policy: PROJECT_PROXY_MASTER_RELINK_POLICY_V1,
        relinkedAt: committedAt,
      });
    } catch {
      throw block(
        "BOUNDARY_EVIDENCE_INVALID",
        "The relink state could not be bound to the current project and media evidence.",
      );
    }
    const nextRelinkStates = assertProjectProxyMasterRelinkStateHistoryV1(
      [...relinkStates, relinkState].sort((left, right) =>
        left.assetId.localeCompare(right.assetId)),
      projectId,
      PROJECT_PROXY_MASTER_RELINK_POLICY_V1.maxProjectRelinkStates,
    );

    const preCommitAssetEvidence = await loadAssetEvidence();
    if (!sameProjectProxyMasterRelinkAssetEvidenceV1(
      initialAssetEvidence,
      preCommitAssetEvidence,
    )) {
      throw block(
        "ASSET_CHANGED_BEFORE_COMMIT",
        "The active media mapping or audio-rights evidence changed before the project CAS.",
      );
    }

    const activeRelation = initialAssetEvidence.activeMappingState
      .proxyMasterActiveMappingV1.qualification.relation;
    const persistedOverlays = assetResolver.stripUrlsForLLM(
      applyProjectVideoSourceVersionPinsV1({
        projectId,
        overlays: prepared.overlays,
        assetId: input.assetId,
        targetOverlayIds: relinkState.overlayChanges.map(
          (change) => change.overlayId,
        ),
        sourceRole: "MASTER",
        sourceVersionSha256: activeRelation.master.sourceVersionSha256,
        storageVersionSha256: activeRelation.master.storageVersionSha256,
        authority: {
          kind: "PROJECT_PROXY_MASTER_RELINK",
          relinkStateSha256: relinkState.stateSha256,
          relationSha256: relinkState.relationSha256,
          activeMappingStateSha256: relinkState.activeMappingStateSha256,
        },
        issuedAt: committedAt,
      }),
    );
    const update = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(currentRevision),
      },
      {
        $set: {
          overlays: persistedOverlays,
          proxyMasterRelinkStatesV1: nextRelinkStates,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (update.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (update.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: currentRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    const commitReceipt = createProjectProxyMasterRelinkCommitReceiptV1({
      state: relinkState,
      activeMappingState: initialAssetEvidence.activeMappingState,
      mutationReceipt,
    });
    this.publishMutationReceipt(mutationReceipt);

    let postCommitAssetEvidence: ProjectProxyMasterRelinkAssetEvidenceV1;
    try {
      postCommitAssetEvidence = await loadAssetEvidence();
    } catch {
      return {
        disposition: "COMMITTED_REVALIDATION_REQUIRED",
        reason: "ASSET_REVALIDATION_UNAVAILABLE",
        commitReceipt,
      };
    }
    if (!sameProjectProxyMasterRelinkAssetEvidenceV1(
      initialAssetEvidence,
      postCommitAssetEvidence,
    )) {
      return {
        disposition: "COMMITTED_REVALIDATION_REQUIRED",
        reason: "ASSET_CHANGED_AFTER_COMMIT",
        commitReceipt,
      };
    }
    return { disposition: "APPLIED", commitReceipt };
  }

  /**
   * Acquire a short-lived lock for the full pre-cut ripple tail. This is
   * intentionally cut-specific; it is not yet a generic range collaboration
   * primitive for every project writer.
   */
  async acquireTimelineRangeCutLockV1(
    userId: string,
    projectId: string,
    input: ProjectTimelineRangeCutLockAcquireCommandV1,
  ): Promise<ProjectTimelineRangeCutLockResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    const frameRange = assertTimelineFrameRangeV1(
      input.startFrame,
      input.endFrame,
      "Timeline cut lock range must be a non-empty project-frame interval.",
    );
    const ttlMs = assertTimelineRangeCutLockTtlMsV1(input.ttlMs);
    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();

    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before retrying.",
      );
    }

    const existingLocks = readTimelineRangeCutLocksV1(project);
    if (existingLocks.length >= MAX_TIMELINE_RANGE_CUT_LOCK_RECORDS_V1) {
      throw new ProjectMutationWriteError(
        "Timeline cut lock history has reached its bounded limit; reconcile the project before acquiring another lock.",
      );
    }
    const now = new Date();
    const activeOverlaps = activeTimelineRangeCutLocksV1(existingLocks, now)
      .filter((lock) => frameRangesOverlapHalfOpenV1(lock.frameRange, frameRange));
    if (activeOverlaps.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        activeOverlaps.map((lock) => lock.lockId),
      );
    }

    const lock: ProjectTimelineRangeCutLockV1 = {
      schemaVersion: 1,
      lockId: `timeline-cut-lock_${nanoid(18)}`,
      actorKind: input.actorKind,
      frameRange,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $set: { updatedAt: now },
        $push: { timelineRangeCutLocks: lock } as never,
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: now.toISOString(),
      },
      committedAt: now.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return { lock, mutationReceipt };
  }

  /** Release one exact cut lease. Expired leases may be released, but never authorize a cut. */
  async releaseTimelineRangeCutLockV1(
    userId: string,
    projectId: string,
    input: ProjectTimelineRangeCutLockReleaseCommandV1,
  ): Promise<ProjectMutationReceiptV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    assertTimelineRangeCutLockIdV1(input.lockId);
    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();

    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    const matchingLocks = readTimelineRangeCutLocksV1(project).filter((lock) => (
      lock.lockId === input.lockId && lock.actorKind === input.actorKind
    ));
    if (matchingLocks.length !== 1) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        matchingLocks.map((lock) => lock.lockId),
        "The requested timeline cut lock is missing, forged, or no longer owned by this actor.",
      );
    }

    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        timelineRangeCutLocks: {
          $elemMatch: { lockId: input.lockId, actorKind: input.actorKind },
        },
      },
      {
        $set: { updatedAt: committedAt },
        $pull: { timelineRangeCutLocks: { lockId: input.lockId } } as never,
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return mutationReceipt;
  }

  /**
   * The single live ProjectService owner for a ripple timeline cut. It binds
   * the pure coordinate transform, complete pre-cut effect region and split
   * lineage to the same CAS write that persists the new timeline state.
   */
  async cutTimelineRangeV1(
    userId: string,
    projectId: string,
    input: ProjectTimelineRangeCutCommandV1,
  ): Promise<ProjectTimelineRangeCutResultV1> {
    if (input.expectedRevision) assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    if (input.rangeCutLockId !== undefined) assertTimelineRangeCutLockIdV1(input.rangeCutLockId);

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();

    const currentRevision = projectRevisionFor(project);
    const requestedRevision = input.expectedRevision ?? currentRevision;
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before retrying.",
      );
    }

    const fps = project.fps || 30;
    const cut = cutTimelineRange({
      overlays: project.overlays || [],
      startFrame: input.startFrame,
      endFrame: input.endFrame,
      fps,
      durationInFrames: project.durationInFrames,
    });
    const beforeDurationInFrames = cut.timelineCoordinateTransform.beforeDurationInFrames;
    const removedRange = cut.timelineCoordinateTransform.removedRange;
    const affectedRangeBefore: TimelineFrameRangeV1 = {
      startFrame: removedRange.startFrame,
      endFrame: beforeDurationInFrames,
    };
    const affectedOverlayRefs = collectAffectedTimelineCutOverlayRefsV1(
      project.overlays || [],
      affectedRangeBefore.startFrame,
    );
    let rebase: ProjectTimelineRangeCutRebaseV1 = {
      disposition: "FRESH",
      requestedRevision,
      appliedBaseRevision: currentRevision,
      traversedReceiptIds: [],
    };
    if (!sameProjectRevisionV1(requestedRevision, currentRevision)) {
      if (requestedRevision.value >= currentRevision.value) {
        throw new ProjectTimelineRangeRebaseBlockedError(
          currentRevision,
          "EXPECTED_REVISION_NOT_OLDER",
        );
      }
      rebase = reconcileSafeTimelineRangeCutRebaseV1({
        project,
        projectId,
        requestedRevision,
        currentRevision,
        cutWriteRange: affectedRangeBefore,
        cutAffectedOverlayRefs: affectedOverlayRefs,
      });
    }
    const committedAt = new Date();
    const authorizedLock = resolveTimelineRangeCutLockAuthorizationV1({
      project,
      currentRevision,
      actorKind: input.actorKind,
      requestedLockId: input.rangeCutLockId,
      cutWriteRange: affectedRangeBefore,
      now: committedAt,
    });
    const appliedBaseRevision = rebase.appliedBaseRevision;
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: appliedBaseRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const shiftedBeforeFrameRange = removedRange.endFrame < beforeDurationInFrames
      ? { startFrame: removedRange.endFrame, endFrame: beforeDurationInFrames }
      : null;
    const shiftedAfterFrameRange = removedRange.endFrame < beforeDurationInFrames
      ? {
          startFrame: removedRange.startFrame,
          endFrame: cut.newDurationInFrames,
        }
      : null;
    const timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1 = {
      schemaVersion: 1,
      receiptId: `timeline-cut_${nanoid(18)}`,
      projectId,
      operation: "CUT_TIMELINE_RANGE",
      actorKind: input.actorKind,
      coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
      fps,
      beforeProjectRevision: appliedBaseRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      readFrameRangesBefore: [{ startFrame: 0, endFrame: beforeDurationInFrames }],
      writeFrameRangesBefore: [affectedRangeBefore],
      affectedFrameRangesAfter: shiftedAfterFrameRange ? [shiftedAfterFrameRange] : [],
      affectedOverlayRefs,
      changedPaths: ["overlays", "durationInFrames", "timelineRangeChangeReceipts"],
      rangeObservation: "EXACT",
      overlayTemporalChange: null,
      timelineCoordinateTransform: cut.timelineCoordinateTransform,
      splitChildren: cut.splitChildren,
      ripple: {
        kind: "REMOVE_AND_SHIFT_LEFT",
        removedFrameRange: removedRange,
        shiftedBeforeFrameRange,
        shiftedAfterFrameRange,
        deltaFrames: cut.timelineCoordinateTransform.shiftAfterRemovedRangeFrames,
      },
      downstreamInvalidation: {
        status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
        affectedFrameRangesBefore: [affectedRangeBefore],
      },
    };
    const persistedOverlays = stampPersistedOverlays(
      assetResolver.stripUrlsForLLM(cut.overlays as Overlay[]),
      "project-service-timeline-range-cut",
    );
    const filter: Record<string, unknown> = {
      projectId,
      userId,
      ...projectRevisionPredicate(appliedBaseRevision),
    };
    if (authorizedLock) {
      filter.timelineRangeCutLocks = {
        $elemMatch: {
          lockId: authorizedLock.lockId,
          actorKind: input.actorKind,
          "frameRange.startFrame": { $lte: affectedRangeBefore.startFrame },
          "frameRange.endFrame": { $gte: affectedRangeBefore.endFrame },
          expiresAt: { $gt: committedAt.toISOString() },
        },
      };
    }
    const update: Record<string, unknown> = {
        $set: {
          overlays: persistedOverlays,
          durationInFrames: cut.newDurationInFrames,
          updatedAt: committedAt,
        },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
    };
    if (authorizedLock) {
      update.$pull = { timelineRangeCutLocks: { lockId: authorizedLock.lockId } };
    }
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(filter, update);
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(projectRevisionFor(latest));
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return { cut, mutationReceipt, timelineChangeReceipt, rebase };
  }

  /**
   * Creates a ProjectService-issued PENDING generated-composition candidate.
   * A revision keeps its last passing active state while this candidate is
   * rendered and proved outside the project mutation boundary.
   */
  async prepareProjectGeneratedCompositionV1(
    userId: string,
    projectId: string,
    command: ProjectGeneratedCompositionPrepareCommandV1,
  ): Promise<ProjectGeneratedCompositionMutationResultV1> {
    assertProjectRevision(command.expectedRevision);
    const draft = parseProjectGeneratedCompositionDraftV1(command.draft);
    const expectedBaseStateToken = command.kind === "REVISE"
      ? parseProjectGeneratedCompositionStateTokenV1(
        command.expectedBaseStateToken,
      )
      : null;
    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();

    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(command.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    const entries = parseProjectGeneratedCompositionEntriesForProjectV1(
      projectId,
      project.generatedCompositions,
    );
    const entryIndex = entries.findIndex(
      ({ compositionId }) => compositionId === draft.compositionId,
    );
    const currentEntry = entryIndex >= 0 ? entries[entryIndex] : null;
    const currentStateToken = currentEntry
      ? currentProjectGeneratedCompositionStateTokenV1(currentEntry)
      : null;
    if (command.kind === "INSERT" && currentEntry) {
      throw new ProjectGeneratedCompositionStateConflictErrorV1(
        draft.compositionId,
        currentStateToken,
        currentRevision,
        "The generated composition already exists; revise its current state token instead.",
      );
    }
    if (command.kind === "REVISE"
      && (!currentEntry || currentStateToken !== expectedBaseStateToken)) {
      throw new ProjectGeneratedCompositionStateConflictErrorV1(
        draft.compositionId,
        currentStateToken,
        currentRevision,
      );
    }

    const pendingState = createPendingProjectGeneratedCompositionStateV1(
      projectId,
      `gcp-state-v1:${randomBytes(32).toString("hex")}`,
      draft,
    );
    const nextEntry = parseProjectGeneratedCompositionEntryV1({
      schemaVersion: 1,
      compositionId: draft.compositionId,
      activeState: currentEntry?.activeState ?? null,
      candidateState: pendingState,
    });
    const committedAt = new Date();
    const update: Record<string, unknown> = command.kind === "INSERT"
      ? {
          $push: { generatedCompositions: nextEntry },
          $set: { updatedAt: committedAt },
          $inc: { projectRevision: 1 },
        }
      : {
          $set: {
            "generatedCompositions.$[composition]": nextEntry,
            updatedAt: committedAt,
          },
          $inc: { projectRevision: 1 },
        };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(command.expectedRevision),
        ...(command.kind === "INSERT"
          ? {
              generatedCompositions: {
                $not: { $elemMatch: { compositionId: draft.compositionId } },
              },
            }
          : generatedCompositionEntryStatePredicateV1(
            draft.compositionId,
            currentEntry!,
          )),
      },
      update,
      command.kind === "REVISE"
        ? {
            arrayFilters: [generatedCompositionEntryArrayFilterV1(
              draft.compositionId,
              currentEntry!,
            )],
          }
        : undefined,
    );
    if (result.matchedCount === 0) {
      return this.throwProjectGeneratedCompositionConflictV1(
        userId,
        projectId,
        draft.compositionId,
        command.expectedRevision,
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: command.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { entry: nextEntry, receipt };
  }

  /**
   * Commits only the terminal render/proof outcome for the exact candidate
   * ProjectService prepared. PASS promotes it; FAIL and UNVERIFIABLE preserve
   * the last passing active state and retain the failed candidate for review.
   */
  async finalizeProjectGeneratedCompositionV1(
    userId: string,
    projectId: string,
    command: ProjectGeneratedCompositionFinalizeCommandV1,
  ): Promise<ProjectGeneratedCompositionMutationResultV1> {
    assertProjectRevision(command.expectedRevision);
    const terminalState = parseProjectGeneratedCompositionStateV1(
      command.terminalState,
    );
    if (terminalState.projectId !== projectId) {
      throw new ProjectMutationWriteError(
        "A generated composition cannot be finalized into another project.",
      );
    }
    if (terminalState.verificationDisposition === "PENDING") {
      throw new ProjectMutationWriteError(
        "A generated composition must have a terminal proof disposition before finalization.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(command.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const entries = parseProjectGeneratedCompositionEntriesForProjectV1(
      projectId,
      project.generatedCompositions,
    );
    const entryIndex = entries.findIndex(
      ({ compositionId }) => compositionId === terminalState.compositionId,
    );
    const currentEntry = entryIndex >= 0 ? entries[entryIndex] : null;
    const pendingState = currentEntry?.candidateState ?? null;
    if (!pendingState
      || pendingState.verificationDisposition !== "PENDING"
      || pendingState.stateIdentity.token !== terminalState.stateIdentity.token
      || !hasSamePreparedCompositionMaterialV1(pendingState, terminalState)) {
      throw new ProjectGeneratedCompositionStateConflictErrorV1(
        terminalState.compositionId,
        currentEntry
          ? currentProjectGeneratedCompositionStateTokenV1(currentEntry)
          : null,
        currentRevision,
        "The terminal outcome does not bind the exact prepared generated-composition state.",
      );
    }

    const nextEntry = parseProjectGeneratedCompositionEntryV1({
      schemaVersion: 1,
      compositionId: terminalState.compositionId,
      activeState: terminalState.verificationDisposition === "PASS"
        ? terminalState
        : currentEntry?.activeState ?? null,
      candidateState: terminalState.verificationDisposition === "PASS"
        ? null
        : terminalState,
    });
    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(command.expectedRevision),
        generatedCompositions: {
          $elemMatch: {
            compositionId: terminalState.compositionId,
            "candidateState.stateIdentity.token": terminalState.stateIdentity.token,
            "candidateState.verificationDisposition": "PENDING",
          },
        },
      },
      {
        $set: {
          "generatedCompositions.$[composition]": nextEntry,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
      {
        arrayFilters: [{
          "composition.compositionId": terminalState.compositionId,
          "composition.candidateState.stateIdentity.token": terminalState.stateIdentity.token,
          "composition.candidateState.verificationDisposition": "PENDING",
        }],
      },
    );
    if (result.matchedCount === 0) {
      return this.throwProjectGeneratedCompositionConflictV1(
        userId,
        projectId,
        terminalState.compositionId,
        command.expectedRevision,
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: command.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { entry: nextEntry, receipt };
  }

  private async throwProjectGeneratedCompositionConflictV1(
    userId: string,
    projectId: string,
    compositionId: string,
    expectedRevision: ProjectRevisionV1,
  ): Promise<never> {
    const db = await getDatabase();
    const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!latest) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(latest);
    if (!sameProjectRevisionV1(expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    const entry = parseProjectGeneratedCompositionEntriesForProjectV1(
      projectId,
      latest.generatedCompositions,
    ).find((candidate) => candidate.compositionId === compositionId);
    throw new ProjectGeneratedCompositionStateConflictErrorV1(
      compositionId,
      entry ? currentProjectGeneratedCompositionStateTokenV1(entry) : null,
      currentRevision,
    );
  }

  /**
   * Acquires a token-bound Director lease while returning the exact project
   * snapshot/revision that the Director must carry into its final save. The
   * lease acquisition itself advances the project revision, so stale browser
   * snapshots cannot silently apply around a Director run.
   */
  async acquireDirectorMutationLease(
    userId: string,
    projectId: string,
    input: {
      kineticSfxPolicy: string;
      profileId: string;
    },
  ): Promise<ProjectDirectorMutationLeaseV1> {
    const db = await getDatabase();
    const acquiredAt = new Date();
    const leaseId = `director_${nanoid(20)}`;
    const staleBefore = new Date(
      acquiredAt.getTime() - DIRECTOR_LEASE_DURATION_MS,
    );
    const leasedProject = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
      {
        projectId,
        userId,
        $or: [
          { directorLock: { $ne: true } },
          { directorLockAt: { $exists: false } },
          { directorLockAt: null },
          { directorLockAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          directorLock: true,
          directorLockAt: acquiredAt,
          directorLockToken: leaseId,
          "intelligence.kineticSfxPolicy": {
            version: "kinetic-sfx-policy-v1",
            policy: input.kineticSfxPolicy,
            profileId: input.profileId,
            source: "director-effective-profile",
            resolvedAt: acquiredAt,
          },
          updatedAt: acquiredAt,
        },
        $inc: { projectRevision: 1 },
      },
      { returnDocument: "after", includeResultMetadata: false },
    )) as Project | null;

    if (!leasedProject) {
      const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!current) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(
        projectRevisionFor(current),
        "The project is already being edited by an active Director mutation.",
      );
    }

    const revision = projectRevisionFor(leasedProject);
    this.publishMutationReceipt({
      schemaVersion: 1,
      projectId,
      revision,
      committedAt: acquiredAt.toISOString(),
    });

    const project = structuredClone(leasedProject);
    project.overlays = await assetResolver.resolveProjectAssets(
      project.overlays ?? [],
      { projectId },
    );
    return {
      leaseId,
      project,
      revision,
      acquiredAt: acquiredAt.toISOString(),
    };
  }

  /**
   * Records one visible Director stage only while the original Director still
   * owns the project. The returned receipt is the only revision that the
   * running Director may carry into its following action or final save.
   */
  async recordDirectorProgressV1(
    userId: string,
    projectId: string,
    input: ProjectDirectorProgressCommandV1,
  ): Promise<ProjectMutationReceiptV1> {
    assertProjectDirectorProgressCommandV1(input);

    const db = await getDatabase();
    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        directorLock: true,
        directorLockToken: input.directorLeaseId,
        autoEditStatus: "directing",
      },
      {
        $set: {
          autoEditStagePercent: input.stagePercent,
          autoEditStageDesc: input.stageDescription,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );

    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(
        projectRevisionFor(latest),
        "Director progress is stale or no longer owns this project.",
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return receipt;
  }

  /**
   * Records one Auto-BGM decision while the originating Director still owns
   * the exact project revision. This is non-renderable decision metadata: it
   * neither attaches audio nor licenses a later audio delivery.
   */
  async recordDirectorAutoBgmDecisionV1(
    userId: string,
    projectId: string,
    input: ProjectDirectorAutoBgmDecisionCommandV1,
  ): Promise<ProjectMutationReceiptV1> {
    assertProjectDirectorAutoBgmDecisionCommandV1(input);

    const db = await getDatabase();
    const committedAt = new Date();
    const evidence = structuredClone(input.evidence);
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        directorLock: true,
        directorLockToken: input.directorLeaseId,
        autoEditStatus: "directing",
      },
      {
        $set: {
          "intelligence.autoBgmDecision": evidence,
          "intelligence.audio.autoBgmDecision": evidence,
          "intelligence.autoBgmDecisionBinding": {
            schemaVersion: 1,
            evidenceHash: input.evidenceHash,
            sourceProjectRevision: structuredClone(input.expectedRevision),
            predecessor: "ACTIVE_DIRECTOR_LEASE",
            affectedRange: null,
            affectedRangeReason: "PROJECT_WIDE_NON_RENDERABLE_DECISION_METADATA",
            rightsRequirement: "NOT_APPLICABLE_NO_MEDIA_ATTACHED",
            invalidationRequirement: "NOT_REQUIRED_NO_RENDERABLE_STATE_CHANGE",
            recordedAt: committedAt,
          },
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );

    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(
        projectRevisionFor(latest),
        "Auto-BGM decision evidence is stale or its Director lease is no longer active.",
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return receipt;
  }

  /**
   * Persists one closed Director provenance/policy fact while the same edit
   * still owns the project. The payload is audit state only and cannot add or
   * modify timeline media.
   */
  async recordDirectorAuditFactV1(
    userId: string,
    projectId: string,
    input: ProjectDirectorAuditFactCommandV1,
  ): Promise<ProjectMutationReceiptV1> {
    assertProjectDirectorAuditFactCommandV1(input);

    const payload = structuredClone(input.fact.payload);
    let bindingPath: string;
    let factSet: Record<string, unknown>;
    switch (input.fact.kind) {
      case "UNIFIED_DECISION_BUNDLE":
        bindingPath = "intelligence.directorAuditFactBindings.unifiedDecisionBundle";
        factSet = { "intelligence.unifiedDecisionBundle": payload };
        break;
      case "POST_BUNDLE_PROFILE_ACTION_POLICY":
        bindingPath = "intelligence.directorAuditFactBindings.postBundleProfileActionPolicy";
        factSet = { "intelligence.postBundleProfileActionPolicy": payload };
        break;
      case "INTELLIGENCE_RUN_SUMMARY":
        bindingPath = "intelligence.directorAuditFactBindings.intelligenceRunSummary";
        factSet = {
          "intelligence.directorRunSummary": payload,
          "intelligence.status": payload.status,
          "intelligence.assetsAnalyzed": payload.assetsAnalyzed,
          "intelligence.assetsFailed": payload.assetsFailed,
          "intelligence.failedAssets": structuredClone(payload.failedAssets),
          "intelligence.decisionsGenerated": payload.decisionsGenerated,
          "intelligence.decisionsExecuted": payload.decisionsExecuted,
          "intelligence.cinematicMoments": payload.cinematicMoments,
          "intelligence.lastRun": new Date(String(payload.completedAt)),
        };
        break;
      case "INTELLIGENCE_SKIP_SUMMARY":
        bindingPath = "intelligence.directorAuditFactBindings.intelligenceSkipSummary";
        factSet = {
          "intelligence.directorSkipSummary": payload,
          "intelligence.status": payload.status,
          "intelligence.reason": payload.reason,
          "intelligence.failedAssets": structuredClone(payload.failedAssets),
          "intelligence.lastAttempt": new Date(String(payload.attemptedAt)),
          "intelligence.message": payload.message,
        };
        break;
      case "VJEPA_COVERAGE_AUDIT":
        bindingPath = "intelligence.directorAuditFactBindings.vjepaCoverageAudit";
        factSet = { "intelligence.vjepaCoverageAudit": payload };
        break;
    }
    const db = await getDatabase();
    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        directorLock: true,
        directorLockToken: input.directorLeaseId,
        autoEditStatus: "directing",
      },
      {
        $set: {
          ...factSet,
          [bindingPath]: {
            schemaVersion: 1,
            kind: input.fact.kind,
            payloadHash: input.fact.payloadHash,
            sourceProjectRevision: structuredClone(input.expectedRevision),
            predecessor: "ACTIVE_DIRECTOR_LEASE",
            affectedRange: null,
            affectedRangeReason: "PROJECT_WIDE_NON_RENDERABLE_AUDIT_FACT",
            rightsRequirement: "NOT_APPLICABLE_NO_MEDIA_ATTACHED",
            invalidationRequirement: "NOT_REQUIRED_NO_RENDERABLE_STATE_CHANGE",
            recordedAt: committedAt,
          },
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );

    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(
        projectRevisionFor(latest),
        "Director audit fact is stale or its Director lease is no longer active.",
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return receipt;
  }

  /**
   * Persists bounded calibration evidence without allowing the full in-memory
   * decision graph to grow the project document without limit.
   */
  async recordDirectorDecisionLogV1(
    userId: string,
    projectId: string,
    input: ProjectDirectorDecisionLogCommandV1,
  ): Promise<ProjectMutationReceiptV1> {
    assertProjectDirectorDecisionLogCommandV1(userId, projectId, input);

    const db = await getDatabase();
    const committedAt = new Date();
    const decisionLogHash = hashEditronCanonicalJsonV1(input.decisionLog);
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        directorLock: true,
        directorLockToken: input.directorLeaseId,
        autoEditStatus: "directing",
      },
      {
        $set: {
          "intelligence.decisionLog": structuredClone(input.decisionLog),
          "intelligence.directorDecisionLogBinding": {
            schemaVersion: 1,
            decisionLogHash,
            sourceSnapshotIdentityHash: input.decisionLog.sourceSnapshotIdentityHash,
            sourceProjectRevision: structuredClone(input.expectedRevision),
            predecessor: "ACTIVE_DIRECTOR_LEASE",
            affectedRange: null,
            affectedRangeReason: "PROJECT_WIDE_NON_RENDERABLE_CALIBRATION_EVIDENCE",
            rightsRequirement: "NOT_APPLICABLE_NO_MEDIA_ATTACHED",
            invalidationRequirement: "NOT_REQUIRED_NO_RENDERABLE_STATE_CHANGE",
            recordedAt: committedAt,
          },
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );

    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(
        projectRevisionFor(latest),
        "Director decision-log evidence is stale or its Director lease is no longer active.",
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return receipt;
  }

  /**
   * Admits one newly-saved source project to the paid analysis lifecycle. This
   * is project state rather than queue state: the queue publication occurs
   * only after this exact user/source/charge/revision receipt is durable.
   */
  async admitProjectAnalysisRunV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisRunAdmissionCommandV1,
  ): Promise<ProjectAnalysisRunAdmissionResultV1> {
    assertProjectAnalysisRunAdmissionCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    const admissionHash = projectAnalysisRunAdmissionHashV1(projectId, userId, input);
    const existing = readProjectAnalysisRunV1(
      projectRecordValueV1(current, "autoEditAnalysisRunV1"),
    );
    if (existing) {
      if (
        existing.admissionHash === admissionHash
        && existing.sourceAssetId === input.sourceAssetId
        && existing.creditTransactionId === input.creditTransactionId
        && existing.chargedCredits === input.chargedCredits
        && existing.lane === input.lane
        && existing.state === "queued"
        && projectRecordValueV1(current, "autoEditStatus") === "queued"
      ) {
        return {
          disposition: "ALREADY_ADMITTED",
          run: structuredClone(existing),
          currentRevision,
        };
      }
      return { disposition: "NOT_ELIGIBLE" };
    }
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const ownsSource = current.overlays.some((overlay) => (
      overlay.type === "video" && overlay.assetId === input.sourceAssetId
    ));
    const laneEligible = input.lane === "assist"
      ? (
          isAssistProjectRecordV1(current)
          && projectRecordValueV1(current, "assistCreditTransactionId") === input.creditTransactionId
          && projectRecordValueV1(current, "assistChargedCredits") === input.chargedCredits
        )
      : !isAssistProjectRecordV1(current);
    if (
      !ownsSource
      || !laneEligible
      || projectRecordValueV1(current, "autoEditStatus") !== undefined
      || projectRecordValueV1(current, "directorRunToken") !== undefined
      || projectRecordValueV1(current, "pipelineDirectorDispatch") !== undefined
      || projectRecordValueV1(current, "pendingDirectorProfileId") !== undefined
      || projectRecordValueV1(current, "pendingDirectorUserId") !== undefined
    ) {
      return { disposition: "NOT_ELIGIBLE" };
    }

    const admittedAt = new Date();
    const runId = `analysis_run_${nanoid(20)}`;
    const run: ProjectAnalysisRunV1 = {
      schemaVersion: 1,
      runId,
      admissionHash,
      sourceAssetId: input.sourceAssetId,
      creditTransactionId: input.creditTransactionId,
      chargedCredits: input.chargedCredits,
      lane: input.lane,
      state: "queued",
      admittedRevision: structuredClone(input.expectedRevision),
      admittedAt: admittedAt.toISOString(),
      updatedAt: admittedAt.toISOString(),
      intakeDispatch: createProjectAnalysisIntakeDispatchV1({
        projectId,
        runId,
        sourceAssetId: input.sourceAssetId,
        admissionHash,
        preparedAt: admittedAt,
      }),
    };
    const queueFacts = input.queueFacts ?? {};
    const admittedProject = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: { $exists: false },
        autoEditAnalysisRunV1: { $exists: false },
        directorRunToken: { $exists: false },
        pipelineDirectorDispatch: { $exists: false },
        pendingDirectorProfileId: { $exists: false },
        pendingDirectorUserId: { $exists: false },
        overlays: { $elemMatch: { type: "video", assetId: input.sourceAssetId } },
        ...(input.lane === "assist"
          ? {
              editMode: "assist",
              assistCreditTransactionId: input.creditTransactionId,
              assistChargedCredits: input.chargedCredits,
            }
          : { editMode: { $ne: "assist" } }),
      },
      {
        $set: {
          autoEditMode: "asset",
          autoEditStatus: "queued",
          autoEditAnalysisRunV1: run,
          sourceAssetId: input.sourceAssetId,
          ...(queueFacts.referenceAssetId && { referenceAssetId: queueFacts.referenceAssetId }),
          ...(queueFacts.referenceVideoSource && {
            referenceVideoSource: structuredClone(queueFacts.referenceVideoSource),
          }),
          ...(queueFacts.referenceImageAssetIds?.length && {
            referenceImageAssetIds: [...queueFacts.referenceImageAssetIds],
          }),
          ...(queueFacts.editorialPreferences && {
            editorialPreferences: structuredClone(queueFacts.editorialPreferences),
          }),
          updatedAt: admittedAt,
        },
        $inc: { projectRevision: 1 },
      },
      { returnDocument: "after", includeResultMetadata: false },
    )) as Project | null;
    if (!admittedProject) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) return { disposition: "PROJECT_NOT_FOUND" };
      throw new ProjectMutationConflictError(projectRevisionFor(latest));
    }

    const returnedRun = readProjectAnalysisRunV1(
      projectRecordValueV1(admittedProject, "autoEditAnalysisRunV1"),
    );
    const revision = projectRevisionFor(admittedProject);
    if (
      !returnedRun
      || returnedRun.runId !== run.runId
      || returnedRun.admissionHash !== admissionHash
      || projectRecordValueV1(admittedProject, "autoEditStatus") !== "queued"
      || revision.value !== input.expectedRevision.value + 1
      || revision.compatibilityUpdatedAt !== admittedAt.toISOString()
    ) {
      throw new ProjectMutationWriteError(
        "Analysis admission did not return its exact writer-issued run and revision.",
      );
    }
    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision,
      committedAt: admittedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { disposition: "ADMITTED", run: structuredClone(returnedRun), receipt };
  }

  /** Records the provider receipt for the exact initial analysis dispatch. */
  async recordProjectAnalysisIntakeDispatchPublishedV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisIntakeDispatchPublicationCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisIntakeDispatchPublicationCommandV1(input);
    return this.recordProjectAnalysisIntakeDispatchStateV1(userId, projectId, input, {
      status: "published",
      providerMessageId: input.providerMessageId,
    });
  }

  /** Records trusted development execution for the exact initial dispatch. */
  async recordProjectAnalysisIntakeDispatchInlineReadyV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisIntakeDispatchInlineReadyCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisIntakeDispatchInlineReadyCommandV1(input);
    return this.recordProjectAnalysisIntakeDispatchStateV1(userId, projectId, input, {
      status: "inline_ready",
    });
  }

  private async recordProjectAnalysisIntakeDispatchStateV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisIntakeDispatchInlineReadyCommandV1,
    target: { status: "published"; providerMessageId: string } | { status: "inline_ready" },
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    const dispatch = currentRun?.intakeDispatch;
    const alreadyRecorded = target.status === "published"
      ? dispatch?.status === "published" && dispatch.providerMessageId === target.providerMessageId
      : dispatch?.status === "inline_ready";
    if (
      currentRun
      && currentRun.runId === input.runId
      && currentRun.sourceAssetId === input.sourceAssetId
      && currentRun.state === "queued"
      && dispatch?.deduplicationId === input.deduplicationId
      && alreadyRecorded
    ) return { disposition: "ALREADY_ADVANCED", run: structuredClone(currentRun), currentRevision };
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
      || currentRun.state !== "queued"
      || projectRecordValueV1(current, "autoEditStatus") !== "queued"
      || dispatch?.status !== "pending"
      || dispatch.deduplicationId !== input.deduplicationId
    ) return { disposition: "OWNERSHIP_LOST" };
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const recordedAt = new Date();
    const nextDispatch: ProjectAnalysisIntakeDispatchV1 = target.status === "published"
      ? {
          ...dispatch,
          status: "published",
          publishedAt: recordedAt.toISOString(),
          providerMessageId: target.providerMessageId,
        }
      : {
          ...dispatch,
          status: "inline_ready",
          inlineReadyAt: recordedAt.toISOString(),
        };
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      updatedAt: recordedAt.toISOString(),
      intakeDispatch: nextDispatch,
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: "queued",
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": "queued",
        "autoEditAnalysisRunV1.intakeDispatch.status": "pending",
        "autoEditAnalysisRunV1.intakeDispatch.deduplicationId": input.deduplicationId,
      },
      {
        $set: { autoEditAnalysisRunV1: nextRun, updatedAt: recordedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, recordedAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /**
   * Advances only the exact admitted analysis run through the public lifecycle
   * graph. The caller supplies the last ProjectService revision it observed;
   * unrelated user, rescue or worker writes therefore invalidate the command.
   */
  async advanceProjectAnalysisRunV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisRunAdvanceCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisRunAdvanceCommandV1(input);

    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(
      projectRecordValueV1(current, "autoEditAnalysisRunV1"),
    );
    if (
      currentRun
      && currentRun.runId === input.runId
      && currentRun.sourceAssetId === input.sourceAssetId
      && currentRun.state === input.toState
      && projectRecordValueV1(current, "autoEditStatus") === input.toState
    ) {
      return {
        disposition: "ALREADY_ADVANCED",
        run: structuredClone(currentRun),
        currentRevision,
      };
    }
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
      || currentRun.state !== input.fromState
      || projectRecordValueV1(current, "autoEditStatus") !== input.fromState
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const committedAt = new Date();
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      state: input.toState,
      updatedAt: committedAt.toISOString(),
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: input.fromState,
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": input.fromState,
      },
      {
        $set: {
          autoEditStatus: input.toState,
          autoEditAnalysisRunV1: nextRun,
          ...(input.toState === "analyzing" ? { autoEditStartedAt: committedAt } : {}),
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /**
   * Terminalizes only an automatic analysis run that still owns the project.
   * Assist failures retain their separate refund-and-status transaction owner.
   */
  async failProjectAnalysisRunV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisRunFailureCommandV1,
  ): Promise<ProjectAnalysisRunFailureResultV1> {
    assertProjectAnalysisRunFailureCommandV1(input);

    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(
      projectRecordValueV1(current, "autoEditAnalysisRunV1"),
    );
    if (
      currentRun
      && currentRun.runId === input.runId
      && currentRun.sourceAssetId === input.sourceAssetId
      && currentRun.lane === "auto"
      && currentRun.state === "failed"
      && projectRecordValueV1(current, "autoEditStatus") === "failed"
    ) {
      return {
        disposition: "ALREADY_RECORDED",
        run: structuredClone(currentRun),
        currentRevision,
      };
    }
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
      || currentRun.lane !== "auto"
      || currentRun.state === "failed"
      || projectRecordValueV1(current, "autoEditStatus") !== currentRun.state
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const committedAt = new Date();
    const failedRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      state: "failed",
      updatedAt: committedAt.toISOString(),
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: currentRun.state,
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": currentRun.state,
        editMode: { $ne: "assist" },
      },
      {
        $set: {
          autoEditStatus: "failed",
          autoEditError: input.errorMessage,
          autoEditFailedAt: committedAt,
          autoEditAnalysisRunV1: failedRun,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { disposition: "RECORDED", run: structuredClone(failedRun), receipt };
  }

  /**
   * Commits the fixed Phase-1 analysis evidence and its lifecycle transition in
   * one project revision. The separate per-asset collection is a derived
   * retrieval snapshot; this project mutation is the authoritative run write.
   */
  async commitProjectAnalysisPhase1V1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisPhase1CommitCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisPhase1CommitCommandV1(input);

    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(
      projectRecordValueV1(current, "autoEditAnalysisRunV1"),
    );
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }

    const boundNativeAudioEvidence = input.evidence.nativeAudioEvidence
      ? bindProjectAnalysisNativeAudioEvidenceV1(currentRun, input.evidence.nativeAudioEvidence)
      : undefined;
    const evidenceMaterial = {
      schemaVersion: 1,
      projectId,
      userId,
      runId: input.runId,
      sourceAssetId: input.sourceAssetId,
      evidence: {
        ...structuredClone(input.evidence),
        ...(boundNativeAudioEvidence ? { nativeAudioEvidence: boundNativeAudioEvidence } : {}),
      },
    };
    const phase1EvidenceHash = hashEditronCanonicalJsonV1(evidenceMaterial);
    if (
      currentRun.state === "analysis_complete"
      && currentRun.phase1EvidenceHash === phase1EvidenceHash
      && projectRecordValueV1(current, "autoEditStatus") === "analysis_complete"
    ) {
      return {
        disposition: "ALREADY_ADVANCED",
        run: structuredClone(currentRun),
        currentRevision,
      };
    }
    if (
      currentRun.state !== input.fromState
      || projectRecordValueV1(current, "autoEditStatus") !== input.fromState
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const committedAt = new Date();
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      state: "analysis_complete",
      updatedAt: committedAt.toISOString(),
      phase1EvidenceHash,
      phase1EvidenceCommittedAt: committedAt.toISOString(),
    };
    const evidence = input.evidence;
    const perAssetSet = buildProjectAnalysisAssetSet(input.sourceAssetId, {
      rawFootageAnalysis: evidence.rawFootageAnalysis,
      vjepaAnalysis: evidence.vjepaAnalysis,
    }, committedAt);
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: input.fromState,
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": input.fromState,
        overlays: { $elemMatch: { type: "video", assetId: input.sourceAssetId } },
      },
      {
        $set: {
          autoEditStatus: "analysis_complete",
          autoEditAnalysisRunV1: nextRun,
          ...(evidence.syntheticStoryboard !== undefined
            ? { syntheticStoryboard: structuredClone(evidence.syntheticStoryboard) }
            : {}),
          ...(evidence.geminiFileUri !== undefined ? { geminiFileUri: evidence.geminiFileUri } : {}),
          ...(evidence.referenceEditDNA !== undefined
            ? { referenceEditDNA: structuredClone(evidence.referenceEditDNA) }
            : {}),
          ...(evidence.referenceVideoAnalysis !== undefined
            ? { referenceVideoAnalysis: structuredClone(evidence.referenceVideoAnalysis) }
            : {}),
          ...(evidence.rawFootageAnalysis !== undefined
            ? { rawFootageAnalysis: structuredClone(evidence.rawFootageAnalysis) }
            : {}),
          ...(evidence.vjepaAnalysis !== undefined
            ? { vjepaAnalysis: structuredClone(evidence.vjepaAnalysis) }
            : {}),
          ...perAssetSet,
          ...(evidence.visualCutIntelligence !== undefined
            ? { "intelligence.visualCutIntelligence": structuredClone(evidence.visualCutIntelligence) }
            : {}),
          ...(evidence.genreParameters !== undefined
            ? { genreParameters: structuredClone(evidence.genreParameters) }
            : {}),
          ...(evidence.genreParametersSignalComputed !== undefined
            ? { genreParametersSignalComputed: structuredClone(evidence.genreParametersSignalComputed) }
            : {}),
          ...(boundNativeAudioEvidence
            ? {
                "overlays.$[analysisSource].hasNativeAudio": boundNativeAudioEvidence.hasNativeAudio,
                "overlays.$[analysisSource].metadata.nativeAudioEvidence": boundNativeAudioEvidence,
              }
            : {}),
          ...(evidence.musicPreference !== undefined
            ? { musicPreference: evidence.musicPreference }
            : {}),
          ...(evidence.editorialPreferences !== undefined
            ? { editorialPreferences: structuredClone(evidence.editorialPreferences) }
            : {}),
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
      boundNativeAudioEvidence
        ? { arrayFilters: [{ "analysisSource.type": "video", "analysisSource.assetId": input.sourceAssetId }] }
        : undefined,
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /** Prepares one evidence-bound delivery identity for the TRIBE worker. */
  async prepareProjectAnalysisDeepDispatchV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisDeepDispatchPrepareCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisDeepDispatchPrepareCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
    ) return { disposition: "OWNERSHIP_LOST" };
    if (
      currentRun.state === "analysis_complete"
      && currentRun.deepAnalysisDispatch
      && projectRecordValueV1(current, "autoEditStatus") === "analysis_complete"
    ) return { disposition: "ALREADY_ADVANCED", run: structuredClone(currentRun), currentRevision };
    if (
      currentRun.state !== "analysis_complete"
      || projectRecordValueV1(current, "autoEditStatus") !== "analysis_complete"
      || currentRun.deepAnalysisDispatch !== undefined
      || !currentRun.phase1EvidenceHash
    ) return { disposition: "OWNERSHIP_LOST" };
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const preparedAt = new Date();
    const deepAnalysisDispatch = createProjectAnalysisDeepDispatchV1({
      projectId,
      runId: input.runId,
      sourceAssetId: input.sourceAssetId,
      phase1EvidenceHash: currentRun.phase1EvidenceHash,
      preparedAt,
    });
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      updatedAt: preparedAt.toISOString(),
      deepAnalysisDispatch,
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: "analysis_complete",
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": "analysis_complete",
        "autoEditAnalysisRunV1.deepAnalysisDispatch": { $exists: false },
      },
      {
        $set: { autoEditAnalysisRunV1: nextRun, updatedAt: preparedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, preparedAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /** Activates an exact prepared TRIBE dispatch for trusted development execution. */
  async recordProjectAnalysisDeepDispatchInlineReadyV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisDeepDispatchInlineReadyCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisDeepDispatchInlineReadyCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    const dispatch = currentRun?.deepAnalysisDispatch;
    if (
      currentRun
      && currentRun.runId === input.runId
      && currentRun.sourceAssetId === input.sourceAssetId
      && currentRun.state === "analysis_complete"
      && dispatch?.status === "inline_ready"
      && dispatch.deduplicationId === input.deduplicationId
    ) return { disposition: "ALREADY_ADVANCED", run: structuredClone(currentRun), currentRevision };
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
      || currentRun.state !== "analysis_complete"
      || projectRecordValueV1(current, "autoEditStatus") !== "analysis_complete"
      || dispatch?.status !== "pending"
      || dispatch.deduplicationId !== input.deduplicationId
    ) return { disposition: "OWNERSHIP_LOST" };
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const inlineReadyAt = new Date();
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      updatedAt: inlineReadyAt.toISOString(),
      deepAnalysisDispatch: {
        ...dispatch,
        status: "inline_ready",
        inlineReadyAt: inlineReadyAt.toISOString(),
      },
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: "analysis_complete",
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": "analysis_complete",
        "autoEditAnalysisRunV1.deepAnalysisDispatch.status": "pending",
        "autoEditAnalysisRunV1.deepAnalysisDispatch.deduplicationId": input.deduplicationId,
      },
      {
        $set: { autoEditAnalysisRunV1: nextRun, updatedAt: inlineReadyAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, inlineReadyAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /** Records the provider receipt for one exact prepared TRIBE dispatch. */
  async recordProjectAnalysisDeepDispatchPublishedV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisDeepDispatchPublicationCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisDeepDispatchPublicationCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    const dispatch = currentRun?.deepAnalysisDispatch;
    if (
      currentRun
      && currentRun.runId === input.runId
      && currentRun.sourceAssetId === input.sourceAssetId
      && currentRun.state === "analysis_complete"
      && dispatch?.status === "published"
      && dispatch.deduplicationId === input.deduplicationId
      && dispatch.providerMessageId === input.providerMessageId
    ) return { disposition: "ALREADY_ADVANCED", run: structuredClone(currentRun), currentRevision };
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
      || currentRun.state !== "analysis_complete"
      || projectRecordValueV1(current, "autoEditStatus") !== "analysis_complete"
      || dispatch?.status !== "pending"
      || dispatch.deduplicationId !== input.deduplicationId
    ) return { disposition: "OWNERSHIP_LOST" };
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const publishedAt = new Date();
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      updatedAt: publishedAt.toISOString(),
      deepAnalysisDispatch: {
        ...dispatch,
        status: "published",
        publishedAt: publishedAt.toISOString(),
        providerMessageId: input.providerMessageId,
      },
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: "analysis_complete",
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": "analysis_complete",
        "autoEditAnalysisRunV1.deepAnalysisDispatch.status": "pending",
        "autoEditAnalysisRunV1.deepAnalysisDispatch.deduplicationId": input.deduplicationId,
      },
      {
        $set: { autoEditAnalysisRunV1: nextRun, updatedAt: publishedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, publishedAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /** Claims or reclaims the exact Phase-2 GPU analysis lease. */
  async claimProjectAnalysisDeepRunV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisDeepClaimCommandV1,
  ): Promise<ProjectAnalysisDeepClaimResultV1> {
    assertProjectAnalysisDeepClaimCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }
    const deepAnalysisDispatch = currentRun.deepAnalysisDispatch;
    if (
      (deepAnalysisDispatch && deepAnalysisDispatch.deduplicationId !== input.deepAnalysisDispatchId)
      || (!deepAnalysisDispatch && input.deepAnalysisDispatchId !== undefined)
    ) return { disposition: "OWNERSHIP_LOST" };
    if (deepAnalysisDispatch?.status === "pending") {
      return {
        disposition: "DEEP_DISPATCH_PENDING",
        run: structuredClone(currentRun),
        currentRevision,
      };
    }
    if (currentRun.state === "directing_queued" && currentRun.directorDispatch) {
      return {
        disposition: currentRun.directorDispatch.status === "pending"
          ? "DIRECTOR_DISPATCH_PENDING"
          : "DIRECTOR_DISPATCH_PUBLISHED",
        run: structuredClone(currentRun),
        currentRevision,
      };
    }
    if (
      (currentRun.state !== "analysis_complete" && currentRun.state !== "analyzing_deep")
      || projectRecordValueV1(current, "autoEditStatus") !== currentRun.state
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }

    const claimedAt = new Date();
    const activeLease = currentRun.deepAnalysisLease;
    if (
      currentRun.state === "analyzing_deep"
      && activeLease
      && new Date(activeLease.expiresAt).getTime() > claimedAt.getTime()
    ) {
      return {
        disposition: "DUPLICATE_ACTIVE",
        run: structuredClone(currentRun),
        currentRevision,
      };
    }
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const reclaimed = currentRun.state === "analyzing_deep";
    const lease: ProjectAnalysisDeepLeaseV1 = {
      schemaVersion: 1,
      leaseId: `analysis_deep_lease_${nanoid(20)}`,
      claimedAt: claimedAt.toISOString(),
      expiresAt: new Date(claimedAt.getTime() + 15 * 60 * 1000).toISOString(),
    };
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      state: "analyzing_deep",
      updatedAt: claimedAt.toISOString(),
      deepAnalysisLease: lease,
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: currentRun.state,
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": currentRun.state,
        ...(deepAnalysisDispatch
          ? {
              "autoEditAnalysisRunV1.deepAnalysisDispatch.status": deepAnalysisDispatch.status,
              "autoEditAnalysisRunV1.deepAnalysisDispatch.deduplicationId": deepAnalysisDispatch.deduplicationId,
            }
          : { "autoEditAnalysisRunV1.deepAnalysisDispatch": { $exists: false } }),
        ...(activeLease ? { "autoEditAnalysisRunV1.deepAnalysisLease.leaseId": activeLease.leaseId } : {}),
      },
      {
        $set: {
          autoEditStatus: "analyzing_deep",
          autoEditAnalysisRunV1: nextRun,
          updatedAt: claimedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, claimedAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "CLAIMED", run: structuredClone(nextRun), lease, reclaimed, receipt };
  }

  /** Atomically stores Phase-2 evidence and prepares one Director dispatch. */
  async commitProjectAnalysisPhase2V1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisPhase2CommitCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisPhase2CommitCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }
    const evidenceMaterial = {
      schemaVersion: 1,
      projectId,
      userId,
      runId: input.runId,
      sourceAssetId: input.sourceAssetId,
      evidence: structuredClone(input.evidence),
    };
    const phase2EvidenceHash = hashEditronCanonicalJsonV1(evidenceMaterial);
    if (
      currentRun.state === "directing_queued"
      && currentRun.phase2EvidenceHash === phase2EvidenceHash
      && currentRun.directorDispatch
      && projectRecordValueV1(current, "autoEditStatus") === "directing_queued"
    ) {
      return {
        disposition: "ALREADY_ADVANCED",
        run: structuredClone(currentRun),
        currentRevision,
      };
    }
    if (
      currentRun.state !== "analyzing_deep"
      || currentRun.deepAnalysisLease?.leaseId !== input.leaseId
      || projectRecordValueV1(current, "autoEditStatus") !== "analyzing_deep"
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const committedAt = new Date();
    const { deepAnalysisLease: _deepAnalysisLease, ...runWithoutLease } = currentRun;
    const directorDispatch = createProjectAnalysisDirectorDispatchV1({
      projectId,
      runId: input.runId,
      sourceAssetId: input.sourceAssetId,
      evidenceHash: phase2EvidenceHash,
      preparedAt: committedAt,
    });
    const nextRun: ProjectAnalysisRunV1 = {
      ...runWithoutLease,
      state: "directing_queued",
      updatedAt: committedAt.toISOString(),
      phase2EvidenceHash,
      phase2EvidenceCommittedAt: committedAt.toISOString(),
      directorDispatch,
    };
    const evidence = input.evidence;
    const perAssetSet = buildProjectAnalysisAssetSet(input.sourceAssetId, {
      vjepaAnalysis: evidence.vjepaAnalysis,
      wav2vecAnalysis: evidence.wav2vecAnalysis,
      musicAnalysis: evidence.musicAnalysis,
      momentWeightMap: evidence.momentWeightMap,
      segmentAnalysis: evidence.segmentAnalysis,
    }, committedAt);
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: "analyzing_deep",
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": "analyzing_deep",
        "autoEditAnalysisRunV1.deepAnalysisLease.leaseId": input.leaseId,
      },
      {
        $set: {
          autoEditStatus: "directing_queued",
          autoEditAnalysisRunV1: nextRun,
          ...(evidence.vjepaAnalysis !== undefined ? { vjepaAnalysis: structuredClone(evidence.vjepaAnalysis) } : {}),
          ...(evidence.wav2vecAnalysis !== undefined ? { wav2vecAnalysis: structuredClone(evidence.wav2vecAnalysis) } : {}),
          ...(evidence.musicAnalysis !== undefined ? { musicAnalysis: structuredClone(evidence.musicAnalysis) } : {}),
          ...(evidence.momentWeightMap !== undefined ? { momentWeightMap: structuredClone(evidence.momentWeightMap) } : {}),
          ...(evidence.segmentAnalysis !== undefined ? { segmentAnalysis: structuredClone(evidence.segmentAnalysis) } : {}),
          ...perAssetSet,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, committedAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /** Prepares one Director dispatch when Phase 2 is intentionally skipped. */
  async prepareProjectAnalysisDirectorDispatchV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisDirectorDispatchPrepareCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisDirectorDispatchPrepareCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
    ) return { disposition: "OWNERSHIP_LOST" };
    if (
      currentRun.state === "directing_queued"
      && currentRun.directorDispatch
      && projectRecordValueV1(current, "autoEditStatus") === "directing_queued"
    ) {
      return { disposition: "ALREADY_ADVANCED", run: structuredClone(currentRun), currentRevision };
    }
    if (
      (currentRun.state !== "analysis_complete" && currentRun.state !== "directing_queued")
      || projectRecordValueV1(current, "autoEditStatus") !== currentRun.state
      || currentRun.directorDispatch !== undefined
    ) return { disposition: "OWNERSHIP_LOST" };
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const preparedAt = new Date();
    const directorDispatch = createProjectAnalysisDirectorDispatchV1({
      projectId,
      runId: input.runId,
      sourceAssetId: input.sourceAssetId,
      evidenceHash: currentRun.phase2EvidenceHash
        ?? currentRun.phase1EvidenceHash
        ?? currentRun.admissionHash,
      preparedAt,
    });
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      state: "directing_queued",
      updatedAt: preparedAt.toISOString(),
      directorDispatch,
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: currentRun.state,
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": currentRun.state,
        "autoEditAnalysisRunV1.directorDispatch": { $exists: false },
      },
      {
        $set: {
          autoEditStatus: "directing_queued",
          autoEditAnalysisRunV1: nextRun,
          updatedAt: preparedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, preparedAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /** Activates a prepared dispatch for the trusted development inline path. */
  async recordProjectAnalysisDirectorDispatchInlineReadyV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisDirectorDispatchInlineReadyCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisDirectorDispatchInlineReadyCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    const dispatch = currentRun?.directorDispatch;
    if (
      currentRun
      && currentRun.runId === input.runId
      && currentRun.sourceAssetId === input.sourceAssetId
      && currentRun.state === "directing_queued"
      && dispatch?.status === "inline_ready"
      && dispatch.deduplicationId === input.deduplicationId
    ) return { disposition: "ALREADY_ADVANCED", run: structuredClone(currentRun), currentRevision };
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
      || currentRun.state !== "directing_queued"
      || projectRecordValueV1(current, "autoEditStatus") !== "directing_queued"
      || dispatch?.status !== "pending"
      || dispatch.deduplicationId !== input.deduplicationId
    ) return { disposition: "OWNERSHIP_LOST" };
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const inlineReadyAt = new Date();
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      updatedAt: inlineReadyAt.toISOString(),
      directorDispatch: { ...dispatch, status: "inline_ready", inlineReadyAt: inlineReadyAt.toISOString() },
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: "directing_queued",
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.sourceAssetId": input.sourceAssetId,
        "autoEditAnalysisRunV1.state": "directing_queued",
        "autoEditAnalysisRunV1.directorDispatch.status": "pending",
        "autoEditAnalysisRunV1.directorDispatch.deduplicationId": input.deduplicationId,
      },
      {
        $set: { autoEditAnalysisRunV1: nextRun, updatedAt: inlineReadyAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, inlineReadyAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /** Records the exact QStash publication that consumed a prepared dispatch. */
  async recordProjectAnalysisDirectorDispatchPublishedV1(
    userId: string,
    projectId: string,
    input: ProjectAnalysisDirectorDispatchPublicationCommandV1,
  ): Promise<ProjectAnalysisRunAdvanceResultV1> {
    assertProjectAnalysisDirectorDispatchPublicationCommandV1(input);
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    const currentRevision = projectRevisionFor(current);
    const currentRun = readProjectAnalysisRunV1(projectRecordValueV1(current, "autoEditAnalysisRunV1"));
    const dispatch = currentRun?.directorDispatch;
    if (
      currentRun
      && currentRun.runId === input.runId
      && currentRun.sourceAssetId === input.sourceAssetId
      && currentRun.state === "directing_queued"
      && dispatch?.status === "published"
      && dispatch.deduplicationId === input.deduplicationId
      && dispatch.providerMessageId === input.providerMessageId
    ) {
      return { disposition: "ALREADY_ADVANCED", run: structuredClone(currentRun), currentRevision };
    }
    if (
      !currentRun
      || currentRun.runId !== input.runId
      || currentRun.sourceAssetId !== input.sourceAssetId
      || currentRun.state !== "directing_queued"
      || projectRecordValueV1(current, "autoEditStatus") !== "directing_queued"
      || dispatch?.status !== "pending"
      || dispatch.deduplicationId !== input.deduplicationId
    ) {
      return { disposition: "OWNERSHIP_LOST" };
    }
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const committedAt = new Date();
    const nextRun: ProjectAnalysisRunV1 = {
      ...currentRun,
      updatedAt: committedAt.toISOString(),
      directorDispatch: {
        ...dispatch,
        status: "published",
        publishedAt: committedAt.toISOString(),
        providerMessageId: input.providerMessageId,
      },
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: "directing_queued",
        "autoEditAnalysisRunV1.runId": input.runId,
        "autoEditAnalysisRunV1.state": "directing_queued",
        "autoEditAnalysisRunV1.directorDispatch.status": "pending",
        "autoEditAnalysisRunV1.directorDispatch.deduplicationId": input.deduplicationId,
      },
      {
        $set: { autoEditAnalysisRunV1: nextRun, updatedAt: committedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, committedAt);
    this.publishMutationReceipt(receipt);
    return { disposition: "ADVANCED", run: structuredClone(nextRun), receipt };
  }

  /**
   * Records the pipeline-finalize Director intent under the sole project
   * revision owner. This is intentionally not a queue publication or a
   * Director-run claim: the later batch completion owns those transitions.
   */
  async recordPipelineDirectorIntentV1(
    userId: string,
    projectId: string,
    input: ProjectPipelineDirectorIntentCommandV1,
  ): Promise<ProjectPipelineDirectorIntentResultV1> {
    assertProjectPipelineDirectorIntentCommandV1(input);

    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const rawPendingProfileId = projectRecordValueV1(current, "pendingDirectorProfileId");
    const rawPendingUserId = projectRecordValueV1(current, "pendingDirectorUserId");
    const rawDispatch = projectRecordValueV1(current, "pipelineDirectorDispatch");
    if (
      isAssistProjectRecordV1(current)
      || projectRecordValueV1(current, "directorRunToken") !== undefined
      || rawDispatch !== undefined
      || !isPipelineDirectorDispatchPreparationEligibleStatusV1(
        projectRecordValueV1(current, "autoEditStatus"),
      )
    ) {
      return { disposition: "NOT_ELIGIBLE" };
    }
    if (rawPendingProfileId !== undefined || rawPendingUserId !== undefined) {
      if (rawPendingProfileId === input.profileId && rawPendingUserId === userId) {
        return { disposition: "ALREADY_RECORDED", currentRevision };
      }
      return { disposition: "NOT_ELIGIBLE" };
    }

    const committedAt = new Date();
    const recorded = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
      {
        projectId,
        userId,
        pendingDirectorProfileId: { $exists: false },
        pendingDirectorUserId: { $exists: false },
        directorRunToken: { $exists: false },
        pipelineDirectorDispatch: { $exists: false },
        editMode: { $ne: "assist" },
        $and: [
          projectRevisionPredicate(input.expectedRevision),
          {
            $or: [
              { autoEditStatus: { $exists: false } },
              { autoEditStatus: "analysis_complete" },
            ],
          },
        ],
      },
      {
        $set: {
          pendingDirectorProfileId: input.profileId,
          pendingDirectorUserId: userId,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
      { returnDocument: "after", includeResultMetadata: false },
    )) as Project | null;

    if (recorded) {
      const revision = projectRevisionFor(recorded);
      if (
        revision.value !== input.expectedRevision.value + 1
        || revision.compatibilityUpdatedAt !== committedAt.toISOString()
        || projectRecordValueV1(recorded, "pendingDirectorProfileId") !== input.profileId
        || projectRecordValueV1(recorded, "pendingDirectorUserId") !== userId
      ) {
        throw new ProjectMutationWriteError(
          "Pipeline Director intent did not return its exact writer-issued state.",
        );
      }
      const receipt: ProjectMutationReceiptV1 = {
        schemaVersion: 1,
        projectId,
        revision,
        committedAt: committedAt.toISOString(),
      };
      this.publishMutationReceipt(receipt);
      return { disposition: "RECORDED", receipt };
    }

    const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!latest) return { disposition: "PROJECT_NOT_FOUND" };
    if (
      !isAssistProjectRecordV1(latest)
      && projectRecordValueV1(latest, "directorRunToken") === undefined
      && projectRecordValueV1(latest, "pipelineDirectorDispatch") === undefined
      && isPipelineDirectorDispatchPreparationEligibleStatusV1(
        projectRecordValueV1(latest, "autoEditStatus"),
      )
      && projectRecordValueV1(latest, "pendingDirectorProfileId") === input.profileId
      && projectRecordValueV1(latest, "pendingDirectorUserId") === userId
    ) {
      return {
        disposition: "ALREADY_RECORDED",
        currentRevision: projectRevisionFor(latest),
      };
    }
    throw new ProjectMutationConflictError(projectRevisionFor(latest));
  }

  /**
   * Makes a pipeline-video completion eligible for one signed Director-worker
   * claim without erasing the original finalize signal. QStash publication is
   * intentionally outside this mutation. If publication fails, the same
   * dispatch token remains recoverable; only a matching worker claim consumes
   * the signal.
   */
  async preparePipelineDirectorDispatchV1(
    userId: string,
    projectId: string,
    input: ProjectPipelineDirectorDispatchPrepareCommandV1,
  ): Promise<ProjectPipelineDirectorDispatchPrepareResultV1> {
    assertProjectPipelineDirectorDispatchPrepareCommandV1(input);

    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const pendingProfileId = projectOptionalNonEmptyStringFieldV1(
      current,
      "pendingDirectorProfileId",
    );
    const pendingUserId = projectOptionalNonEmptyStringFieldV1(
      current,
      "pendingDirectorUserId",
    );
    const rawExistingDispatch = projectRecordValueV1(current, "pipelineDirectorDispatch");
    const existingDispatch = readProjectPipelineDirectorDispatchV1(rawExistingDispatch);
    if (rawExistingDispatch !== undefined && !existingDispatch) {
      return { disposition: "NOT_ELIGIBLE" };
    }
    if (existingDispatch) {
      if (
        existingDispatch.batchId === input.batchId
        && pendingProfileId === existingDispatch.profileId
        && pendingUserId === userId
        && projectRecordValueV1(current, "autoEditStatus") === "directing_queued"
        && projectRecordValueV1(current, "directorRunToken") === undefined
      ) {
        return {
          disposition: "ALREADY_PREPARED",
          dispatch: structuredClone(existingDispatch),
          currentRevision,
        };
      }
      return { disposition: "NOT_ELIGIBLE" };
    }
    if (
      !pendingProfileId
      || !isBoundedNonEmptyStringV1(pendingProfileId, 200)
      || pendingUserId !== userId
      || projectRecordValueV1(current, "directorRunToken") !== undefined
      || !isPipelineDirectorDispatchPreparationEligibleStatusV1(
        projectRecordValueV1(current, "autoEditStatus"),
      )
    ) {
      return { disposition: "NOT_ELIGIBLE" };
    }

    const committedAt = new Date();
    const dispatch: ProjectPipelineDirectorDispatchV1 = {
      schemaVersion: 1,
      batchId: input.batchId,
      profileId: pendingProfileId,
      dispatchToken: `pipeline_director_dispatch_${nanoid(20)}`,
      preparedAt: committedAt.toISOString(),
    };
    const preparedProject = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
      {
        projectId,
        userId,
        pendingDirectorProfileId: pendingProfileId,
        pendingDirectorUserId: userId,
        directorRunToken: { $exists: false },
        pipelineDirectorDispatch: { $exists: false },
        editMode: { $ne: "assist" },
        $and: [
          projectRevisionPredicate(input.expectedRevision),
          {
            $or: [
              { autoEditStatus: { $exists: false } },
              { autoEditStatus: "analysis_complete" },
            ],
          },
        ],
      },
      {
        $set: {
          autoEditStatus: "directing_queued",
          pipelineDirectorDispatch: dispatch,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
      { returnDocument: "after", includeResultMetadata: false },
    )) as Project | null;

    if (!preparedProject) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) return { disposition: "PROJECT_NOT_FOUND" };
      const latestDispatch = readProjectPipelineDirectorDispatchV1(
        projectRecordValueV1(latest, "pipelineDirectorDispatch"),
      );
      if (
        latestDispatch
        && latestDispatch.batchId === input.batchId
        && latestDispatch.profileId === pendingProfileId
        && projectOptionalNonEmptyStringFieldV1(latest, "pendingDirectorProfileId")
          === pendingProfileId
        && projectOptionalNonEmptyStringFieldV1(latest, "pendingDirectorUserId") === userId
        && projectRecordValueV1(latest, "autoEditStatus") === "directing_queued"
        && projectRecordValueV1(latest, "directorRunToken") === undefined
      ) {
        return {
          disposition: "ALREADY_PREPARED",
          dispatch: structuredClone(latestDispatch),
          currentRevision: projectRevisionFor(latest),
        };
      }
      return { disposition: "NOT_ELIGIBLE" };
    }

    const revision = projectRevisionFor(preparedProject);
    const returnedDispatch = readProjectPipelineDirectorDispatchV1(
      projectRecordValueV1(preparedProject, "pipelineDirectorDispatch"),
    );
    if (
      revision.value !== input.expectedRevision.value + 1
      || revision.compatibilityUpdatedAt !== committedAt.toISOString()
      || projectRecordValueV1(preparedProject, "autoEditStatus") !== "directing_queued"
      || !returnedDispatch
      || returnedDispatch.dispatchToken !== dispatch.dispatchToken
      || returnedDispatch.batchId !== dispatch.batchId
      || returnedDispatch.profileId !== dispatch.profileId
    ) {
      throw new ProjectMutationWriteError(
        "Pipeline Director dispatch preparation did not return its exact writer-issued state.",
      );
    }

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return {
      disposition: "PREPARED",
      dispatch: structuredClone(returnedDispatch),
      receipt,
    };
  }

  /** Reopens one paid failed auto edit as an Assist project without re-running analysis. */
  async rescueFailedAutoEditToAssistV1(
    userId: string,
    projectId: string,
    input: ProjectAssistRescueCommandV1,
  ): Promise<ProjectAssistRescueResultV1> {
    if (
      !isBoundedNonEmptyStringV1(userId, 500)
      || !isBoundedNonEmptyStringV1(projectId, 500)
      || !isPlainRecord(input)
      || !input.expectedRevision
    ) {
      throw new ProjectMutationWriteError(
        "Assist rescue requires one exact user, project and revision.",
      );
    }
    assertProjectRevision(input.expectedRevision);

    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(current);
    if (
      projectRecordValueV1(current, "editMode") === "assist"
      && projectRecordValueV1(current, "autoEditStatus") === "ready_for_chat"
    ) {
      return {
        disposition: "ALREADY_RESCUED",
        project: structuredClone(current),
        currentRevision,
      };
    }
    if (!canRescueToDirectorMode(current)) return { disposition: "NOT_ELIGIBLE" };
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const rescuedAt = new Date();
    const rescuedProject = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        editMode: { $ne: "assist" },
        autoEditStatus: "failed",
        autoEditRefunded: { $ne: true },
        overlays: { $elemMatch: { type: { $in: ["video", "image"] } } },
        $or: [
          { rawFootageAnalysis: { $exists: true, $ne: null } },
          { segmentAnalysis: { $exists: true, $ne: null } },
        ],
      },
      {
        $set: {
          editMode: "assist",
          autoEditStatus: "ready_for_chat",
          assistRescuedFrom: "failed",
          assistRescuedAt: rescuedAt,
          updatedAt: rescuedAt,
        },
        $unset: {
          autoEditError: "",
          autoEditFailedAt: "",
          autoEditStageDesc: "",
          "intelligence.directorDeliveryFailure": "",
        },
        $inc: { projectRevision: 1 },
      },
      { returnDocument: "after", includeResultMetadata: false },
    )) as Project | null;
    if (!rescuedProject) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) return { disposition: "PROJECT_NOT_FOUND" };
      const latestRevision = projectRevisionFor(latest);
      if (
        projectRecordValueV1(latest, "editMode") === "assist"
        && projectRecordValueV1(latest, "autoEditStatus") === "ready_for_chat"
      ) {
        return {
          disposition: "ALREADY_RESCUED",
          project: structuredClone(latest),
          currentRevision: latestRevision,
        };
      }
      if (canRescueToDirectorMode(latest)) throw new ProjectMutationConflictError(latestRevision);
      return { disposition: "NOT_ELIGIBLE" };
    }

    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, rescuedAt);
    const returnedRevision = projectRevisionFor(rescuedProject);
    if (
      !sameProjectRevisionV1(receipt.revision, returnedRevision)
      || projectRecordValueV1(rescuedProject, "editMode") !== "assist"
      || projectRecordValueV1(rescuedProject, "autoEditStatus") !== "ready_for_chat"
      || projectRecordValueV1(rescuedProject, "assistRescuedFrom") !== "failed"
    ) {
      throw new ProjectMutationWriteError(
        "Assist rescue did not return its exact writer-issued state and revision.",
      );
    }
    this.publishMutationReceipt(receipt);
    return {
      disposition: "RESCUED",
      project: structuredClone(rescuedProject),
      receipt,
    };
  }

  /**
   * Claims one automatic Director lifecycle through the canonical project
   * writer. The durable run token remains after the Director's short writer
   * lease is cleared by its final save, so later completion/failure can prove
   * it still owns this particular run.
   */
  async claimDirectorRunV1(
    userId: string,
    projectId: string,
    options: ProjectDirectorRunClaimOptionsV1 | undefined = undefined,
  ): Promise<ProjectDirectorRunClaimResultV1> {
    if (
      options !== undefined
      && (
        !isPlainRecord(options)
        || (
          options.pipelineDirectorDispatchToken !== undefined
          && !isProjectPipelineDirectorDispatchTokenV1(
            options.pipelineDirectorDispatchToken,
          )
        )
        || (options.analysisRunId !== undefined
          && !isBoundedNonEmptyStringV1(options.analysisRunId, 200))
        || (options.analysisDirectorDispatchId !== undefined
          && !isBoundedNonEmptyStringV1(options.analysisDirectorDispatchId, 200))
        || (options.analysisDirectorDispatchId !== undefined && options.analysisRunId === undefined)
        || (options.pipelineDirectorDispatchToken !== undefined
          && options.analysisRunId !== undefined)
      )
    ) {
      return { disposition: "NOT_ELIGIBLE" };
    }
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    const suppliedDispatchToken = options?.pipelineDirectorDispatchToken;
    const suppliedAnalysisRunId = options?.analysisRunId;
    const suppliedAnalysisDispatchId = options?.analysisDirectorDispatchId;
    const rawPipelineDispatch = projectRecordValueV1(current, "pipelineDirectorDispatch");
    const pipelineDispatch = readProjectPipelineDirectorDispatchV1(rawPipelineDispatch);
    if (
      (rawPipelineDispatch !== undefined && !pipelineDispatch)
      || (pipelineDispatch !== null && (
        suppliedDispatchToken !== pipelineDispatch.dispatchToken
        || projectOptionalNonEmptyStringFieldV1(current, "pendingDirectorProfileId")
          !== pipelineDispatch.profileId
        || projectOptionalNonEmptyStringFieldV1(current, "pendingDirectorUserId") !== userId
      ))
      || (pipelineDispatch === null && suppliedDispatchToken !== undefined)
    ) {
      return { disposition: "NOT_ELIGIBLE" };
    }
    const rawAnalysisRun = projectRecordValueV1(current, "autoEditAnalysisRunV1");
    const analysisRun = readProjectAnalysisRunV1(rawAnalysisRun);
    if (rawAnalysisRun !== undefined && !analysisRun) return { disposition: "NOT_ELIGIBLE" };
    let analysisClaimPredicate: Record<string, unknown> = {};
    if (!pipelineDispatch && analysisRun) {
      if (suppliedAnalysisRunId !== analysisRun.runId) return { disposition: "NOT_ELIGIBLE" };
      const analysisDispatch = analysisRun.directorDispatch;
      if (
        suppliedAnalysisDispatchId !== undefined
        && suppliedAnalysisDispatchId !== analysisDispatch?.deduplicationId
      ) return { disposition: "NOT_ELIGIBLE" };
      if (analysisDispatch?.status === "pending") return { disposition: "DISPATCH_PENDING" };
      if (
        analysisDispatch !== undefined
        && analysisDispatch.status !== "published"
        && analysisDispatch.status !== "inline_ready"
      ) return { disposition: "NOT_ELIGIBLE" };
      if (suppliedAnalysisDispatchId !== undefined && !analysisDispatch) {
        return { disposition: "NOT_ELIGIBLE" };
      }
      analysisClaimPredicate = {
        "autoEditAnalysisRunV1.runId": analysisRun.runId,
        "autoEditAnalysisRunV1.sourceAssetId": analysisRun.sourceAssetId,
        "autoEditAnalysisRunV1.state": analysisRun.state,
        ...(analysisDispatch
          ? {
              "autoEditAnalysisRunV1.directorDispatch.status": analysisDispatch.status,
              "autoEditAnalysisRunV1.directorDispatch.deduplicationId": analysisDispatch.deduplicationId,
            }
          : { "autoEditAnalysisRunV1.directorDispatch": { $exists: false } }),
      };
    } else if (suppliedAnalysisRunId !== undefined || suppliedAnalysisDispatchId !== undefined) {
      return { disposition: "NOT_ELIGIBLE" };
    }
    const pipelineClaimPredicate = pipelineDispatch
      ? {
          "pipelineDirectorDispatch.schemaVersion": 1,
          "pipelineDirectorDispatch.batchId": pipelineDispatch.batchId,
          "pipelineDirectorDispatch.profileId": pipelineDispatch.profileId,
          "pipelineDirectorDispatch.dispatchToken": pipelineDispatch.dispatchToken,
          "pipelineDirectorDispatch.preparedAt": pipelineDispatch.preparedAt,
          pendingDirectorProfileId: pipelineDispatch.profileId,
          pendingDirectorUserId: userId,
        }
      : {};
    if (isAssistProjectRecordV1(current)) {
      if (
        !isDirectorRunClaimableStatusV1(projectRecordValueV1(current, "autoEditStatus"))
        || projectRecordValueV1(current, "directorRunToken") !== undefined
      ) {
        return { disposition: "NOT_ELIGIBLE" };
      }
      const beforeRevision = projectRevisionFor(current);
      const completedAt = new Date();
      const readyProject = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
        {
          projectId,
          userId,
          ...projectRevisionPredicate(beforeRevision),
          editMode: "assist",
          autoEditStatus: { $in: ["analysis_complete", "directing_queued"] },
          directorRunToken: { $exists: false },
          ...pipelineClaimPredicate,
          ...analysisClaimPredicate,
        },
        {
          $set: {
            autoEditStatus: "ready_for_chat",
            autoEditCompletedAt: completedAt,
            updatedAt: completedAt,
          },
          ...(pipelineDispatch
            ? {
                $unset: {
                  pendingDirectorProfileId: "",
                  pendingDirectorUserId: "",
                  pipelineDirectorDispatch: "",
                },
              }
            : {}),
          $inc: { projectRevision: 1 },
        },
        { returnDocument: "after", includeResultMetadata: false },
      )) as Project | null;
      if (!readyProject) {
        const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
          projectId,
          userId,
        })) as Project | null;
        return latest
          ? { disposition: "NOT_ELIGIBLE" }
          : { disposition: "PROJECT_NOT_FOUND" };
      }
      const revision = projectRevisionFor(readyProject);
      if (
        revision.value !== beforeRevision.value + 1
        || revision.compatibilityUpdatedAt !== completedAt.toISOString()
        || projectRecordValueV1(readyProject, "autoEditStatus") !== "ready_for_chat"
      ) {
        throw new ProjectMutationWriteError(
          "Assist completion did not return the writer-issued ready state and revision.",
        );
      }
      const receipt: ProjectMutationReceiptV1 = {
        schemaVersion: 1,
        projectId,
        revision,
        committedAt: completedAt.toISOString(),
      };
      this.publishMutationReceipt(receipt);
      return {
        disposition: "ASSIST_PROJECT",
        project: structuredClone(readyProject),
        receipt,
      };
    }
    if (
      !isDirectorRunClaimableStatusV1(projectRecordValueV1(current, "autoEditStatus"))
      || projectRecordValueV1(current, "directorRunToken") !== undefined
    ) {
      return { disposition: "NOT_ELIGIBLE" };
    }

    const beforeRevision = projectRevisionFor(current);
    const claimedAt = new Date();
    const runToken = `director_run_${nanoid(20)}`;
    const claimUpdate = {
      $set: {
        autoEditStatus: "directing",
        directorRunToken: runToken,
        updatedAt: claimedAt,
      },
      ...(pipelineDispatch
        ? {
            $unset: {
              pendingDirectorProfileId: "",
              pendingDirectorUserId: "",
              pipelineDirectorDispatch: "",
            },
          }
        : {}),
      $inc: { projectRevision: 1 },
    };
    const claimedProject = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(beforeRevision),
        editMode: { $ne: "assist" },
        autoEditStatus: { $in: ["analysis_complete", "directing_queued"] },
        directorRunToken: { $exists: false },
        ...pipelineClaimPredicate,
        ...analysisClaimPredicate,
      },
      claimUpdate,
      { returnDocument: "after", includeResultMetadata: false },
    )) as Project | null;

    if (!claimedProject) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) return { disposition: "PROJECT_NOT_FOUND" };
      return { disposition: "NOT_ELIGIBLE" };
    }

    const revision = projectRevisionFor(claimedProject);
    if (
      revision.value !== beforeRevision.value + 1
      || revision.compatibilityUpdatedAt !== claimedAt.toISOString()
      || claimedProject.directorRunToken !== runToken
    ) {
      throw new ProjectMutationWriteError(
        "Director run claim did not return the writer-issued run identity and revision.",
      );
    }

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision,
      committedAt: claimedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return {
      disposition: "CLAIMED",
      project: structuredClone(claimedProject),
      runToken,
      receipt,
    };
  }

  /**
   * Completes an owned automatic Director run only against its exact terminal
   * writer receipt. If a rescue, cancellation or newer mutation won first,
   * this returns a no-write disposition instead of resurrecting the project.
   */
  async completeDirectorRunV1(
    userId: string,
    projectId: string,
    input: ProjectDirectorRunCompletionCommandV1,
  ): Promise<ProjectDirectorRunTerminalResultV1> {
    assertProjectDirectorRunCompletionCommandV1(projectId, input);

    const db = await getDatabase();
    const committedAt = new Date();
    const setFields: Record<string, unknown> = {
      autoEditStatus: input.autoEditStatus,
      autoEditCompletedAt: committedAt,
      autoEditDurationMs: input.totalPipelineMs,
      directorDurationMs: input.directorMs,
      directorProfileUsed: input.profileId,
      updatedAt: committedAt,
    };
    if (input.decisionAuthority) {
      setFields["intelligence.decisionAuthority"] = structuredClone(input.decisionAuthority);
    }
    if (input.needsQualityAttention) {
      setFields.projectStatus = "needs-attention";
      setFields.autoEditHealth = "needs_review";
      setFields.autoEditWarning = input.autoEditWarning!;
    }

    const update: Record<string, unknown> = {
      $set: setFields,
      $unset: {
        directorRunToken: "",
        ...(input.needsQualityAttention
          ? {}
          : { autoEditHealth: "", autoEditWarning: "" }),
      },
      $inc: { projectRevision: 1 },
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        autoEditStatus: "directing",
        directorRunToken: input.directorRunToken,
      },
      update,
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { disposition: "RECORDED", receipt };
  }

  /**
   * Fails only the automatic Director run that still owns the project. The
   * read supplies the exact revision for the CAS; an old worker can therefore
   * never terminalize a rescue or newer run with a different token.
   */
  async failDirectorRunV1(
    userId: string,
    projectId: string,
    input: ProjectDirectorRunFailureCommandV1,
  ): Promise<ProjectDirectorRunTerminalResultV1> {
    assertProjectDirectorRunFailureCommandV1(input);

    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) return { disposition: "PROJECT_NOT_FOUND" };
    if (!isActiveDirectorRunV1(current, input.directorRunToken)) {
      return { disposition: "OWNERSHIP_LOST" };
    }

    const beforeRevision = projectRevisionFor(current);
    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(beforeRevision),
        autoEditStatus: "directing",
        directorRunToken: input.directorRunToken,
      },
      {
        $set: {
          autoEditStatus: "failed",
          autoEditError: input.errorMessage,
          autoEditFailedAt: committedAt,
          updatedAt: committedAt,
        },
        $unset: { directorRunToken: "" },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      return { disposition: latest ? "OWNERSHIP_LOST" : "PROJECT_NOT_FOUND" };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: beforeRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { disposition: "RECORDED", receipt };
  }

  /**
   * Releases only the lease identified by its unguessable token. A successful
   * Director save clears the lease atomically, so this is only the failure or
   * cancellation cleanup path.
   */
  async releaseDirectorMutationLease(
    userId: string,
    projectId: string,
    leaseId: string,
  ): Promise<ProjectDirectorMutationLeaseReleaseResultV1> {
    const db = await getDatabase();
    const committedAt = new Date();
    const releasedProject = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
      {
        projectId,
        userId,
        directorLock: true,
        directorLockToken: leaseId,
      },
      {
        $set: { updatedAt: committedAt },
        $unset: {
          directorLock: "",
          directorLockAt: "",
          directorLockToken: "",
        },
        $inc: { projectRevision: 1 },
      },
      { returnDocument: "after", includeResultMetadata: false },
    )) as Project | null;
    if (!releasedProject) {
      return { disposition: "LEASE_NOT_OWNED_OR_PROJECT_NOT_FOUND" };
    }

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: projectRevisionFor(releasedProject),
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { disposition: "RELEASED", receipt };
  }

  /**
   * Records a QStash Director delivery failure through the canonical project
   * writer. A callback never owns a raw project update: it must still match
   * the current Director message, an active Director state, and the exact
   * revision observed by this method before terminal state can advance.
   *
   * The related upload-batch status is intentionally not changed here. It is
   * a separate aggregate with its own future owner and transaction boundary.
   */
  async recordDirectorDeliveryFailureV1(
    userId: string,
    projectId: string,
    input: ProjectDirectorDeliveryFailureCommandV1,
  ): Promise<ProjectDirectorDeliveryFailureResultV1> {
    assertProjectDirectorDeliveryFailureCommandV1(input);

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) {
      return {
        disposition: "PROJECT_NOT_FOUND",
        sourceUploadBatchId: null,
      };
    }

    const beforeRevision = projectRevisionFor(project);
    const noOpDisposition = directorDeliveryFailureNoopDispositionV1(
      project,
      input.sourceMessageId,
      input.pipelineDirectorDispatchToken,
    );
    if (noOpDisposition) {
      return {
        disposition: noOpDisposition,
        sourceUploadBatchId: null,
      };
    }

    const directorMessageId = projectOptionalNonEmptyStringFieldV1(
      project,
      "directorMessageId",
    );
    const pipelineDirectorDispatch = readProjectPipelineDirectorDispatchV1(
      projectRecordValueV1(project, "pipelineDirectorDispatch"),
    );
    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(beforeRevision),
        autoEditStatus: {
          $in: ["directing_queued", "directing", "analysis_complete"],
        },
        ...(directorMessageId
          ? { directorMessageId: input.sourceMessageId }
          : {}),
        ...(pipelineDirectorDispatch
          ? {
              "pipelineDirectorDispatch.schemaVersion": 1,
              "pipelineDirectorDispatch.batchId": pipelineDirectorDispatch.batchId,
              "pipelineDirectorDispatch.profileId": pipelineDirectorDispatch.profileId,
              "pipelineDirectorDispatch.dispatchToken": input.pipelineDirectorDispatchToken,
              "pipelineDirectorDispatch.preparedAt": pipelineDirectorDispatch.preparedAt,
            }
          : {}),
      },
      {
        $set: {
          autoEditStatus: "failed",
          autoEditError: input.errorMessage,
          autoEditFailedAt: committedAt,
          autoEditStageDesc: "Director delivery failed",
          "intelligence.directorDeliveryFailure": structuredClone(input.audit),
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );

    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) {
        return {
          disposition: "PROJECT_NOT_FOUND",
          sourceUploadBatchId: null,
        };
      }
      return {
        disposition: directorDeliveryFailureNoopDispositionV1(
          latest,
          input.sourceMessageId,
          input.pipelineDirectorDispatchToken,
        ) ?? "PROJECT_STATE_CHANGED",
        sourceUploadBatchId: null,
      };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: beforeRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return {
      disposition: "RECORDED",
      sourceUploadBatchId: projectOptionalNonEmptyStringFieldV1(
        project,
        "sourceUploadBatchId",
      ),
      beforeRevision,
      receipt,
    };
  }

  /**
   * Owns project-side lifecycle facts for the multi-upload auto-edit route.
   * Upload-batch state is a separate aggregate and is deliberately not changed
   * here; callers must pair it with an exact claim/compensation contract.
   */
  async recordBatchAutoEditLifecycleV1(
    userId: string,
    projectId: string,
    input: ProjectBatchAutoEditLifecycleCommandV1,
  ): Promise<ProjectBatchAutoEditLifecycleResultV1> {
    assertProjectBatchAutoEditLifecycleCommandV1(input);

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) return { disposition: "PROJECT_NOT_FOUND" };

    const currentRevision = projectRevisionFor(project);
    if (
      currentRevision.value !== input.expectedRevision.value
      || currentRevision.compatibilityUpdatedAt !== input.expectedRevision.compatibilityUpdatedAt
    ) {
      return { disposition: "PROJECT_STATE_CHANGED", currentRevision };
    }
    if (
      isAssistProjectRecordV1(project)
      || projectOptionalNonEmptyStringFieldV1(project, "sourceUploadBatchId") !== input.uploadBatchId
    ) {
      return { disposition: "NOT_ELIGIBLE", currentRevision };
    }

    const currentStatus = projectOptionalNonEmptyStringFieldV1(project, "autoEditStatus");
    const eligibleStatuses = batchAutoEditLifecycleEligibleStatusesV1(input.event.kind);
    if (!currentStatus || !eligibleStatuses.has(currentStatus)) {
      return { disposition: "NOT_ELIGIBLE", currentRevision };
    }

    const committedAt = new Date();
    const transition = batchAutoEditLifecycleUpdateV1(
      input.uploadBatchId,
      input.transitionId,
      currentStatus,
      input.event,
      committedAt,
    );
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        sourceUploadBatchId: input.uploadBatchId,
        autoEditStatus: currentStatus,
        editMode: { $ne: "assist" },
        ...transition.filter,
      },
      {
        $set: transition.set,
        ...(Object.keys(transition.unset).length > 0 ? { $unset: transition.unset } : {}),
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) return { disposition: "PROJECT_NOT_FOUND" };
      return {
        disposition: "PROJECT_STATE_CHANGED",
        currentRevision: projectRevisionFor(latest),
      };
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return {
      disposition: "RECORDED",
      beforeRevision: input.expectedRevision,
      receipt,
    };
  }

  /**
   * Persists Director's deterministic pre-render proof facts only if the
   * project is still at the final edit receipt. A newer mutation makes the
   * proof facts unrecordable rather than attaching them to the wrong state.
   */
  async recordPhase0ProofFacts(
    userId: string,
    projectId: string,
    input: {
      expectedRevision: ProjectRevisionV1;
      targetReceipt: ProjectMutationReceiptV1;
      facts: ProjectPhase0ProofFactsV1;
    },
  ): Promise<ProjectMutationReceiptV1> {
    assertProjectRevision(input.expectedRevision);
    if (
      input.targetReceipt.schemaVersion !== 1 ||
      input.targetReceipt.projectId !== projectId ||
      input.targetReceipt.revision.schemaVersion !== input.expectedRevision.schemaVersion ||
      input.targetReceipt.revision.value !== input.expectedRevision.value ||
      input.targetReceipt.revision.compatibilityUpdatedAt !== input.expectedRevision.compatibilityUpdatedAt ||
      !Object.values(input.facts).every(
        (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value),
      )
    ) {
      throw new ProjectMutationWriteError("Phase-0 proof facts must bind one valid writer receipt.");
    }

    const committedAt = new Date();
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $set: {
          qualityReview: input.facts.qualityReview,
          "intelligence.phase0LiveTruth": input.facts.liveTruth,
          "intelligence.renderedQualityEvidence": input.facts.renderedQualityEvidence,
          "intelligence.phase0FixtureArtifact": input.facts.fixtureArtifact,
          "intelligence.phase0ProofTargetReceipt": structuredClone(input.targetReceipt),
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(projectRevisionFor(latest));
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return receipt;
  }

  /**
   * Claims exactly the project revision named by a Director-issued receipt.
   * Claiming itself advances the revision, so duplicate QStash deliveries and
   * any concurrent editor mutation both fail closed before a Lambda render is
   * started.
   */
  async claimPhase0RenderedEvidence(
    userId: string,
    projectId: string,
    input: {
      targetReceipt: ProjectMutationReceiptV1;
      requestedAt: string;
    },
  ): Promise<ProjectPhase0RenderedEvidenceClaimV1> {
    assertReceiptForProjectRevision(projectId, input.targetReceipt, input.targetReceipt.revision);
    if (Number.isNaN(new Date(input.requestedAt).getTime())) {
      throw new ProjectMutationWriteError("Phase-0 rendered evidence requires a valid request time.");
    }

    const claimedAt = new Date();
    const claimReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.targetReceipt.revision.value + 1,
        compatibilityUpdatedAt: claimedAt.toISOString(),
      },
      committedAt: claimedAt.toISOString(),
    };
    const db = await getDatabase();
    const claimedProject = (await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.targetReceipt.revision),
      },
      {
        $set: {
          "intelligence.phase0RenderedEvidenceTargetReceipt": structuredClone(input.targetReceipt),
          "intelligence.phase0RenderedEvidenceClaim": {
            version: "editron-phase0-rendered-evidence-claim-v1",
            requestedAt: input.requestedAt,
            claimedAt: claimedAt.toISOString(),
          },
          "intelligence.phase0RenderedEvidenceClaimReceipt": structuredClone(claimReceipt),
          updatedAt: claimedAt,
        },
        $inc: { projectRevision: 1 },
      },
      { returnDocument: "after", includeResultMetadata: false },
    )) as Project | null;

    if (!claimedProject) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(projectRevisionFor(latest));
    }

    if (
      claimedProject.projectRevision !== claimReceipt.revision.value
      || new Date(claimedProject.updatedAt).toISOString() !== claimReceipt.revision.compatibilityUpdatedAt
    ) {
      throw new ProjectMutationWriteError("Phase-0 rendered evidence claim did not return its writer revision.");
    }
    this.publishMutationReceipt(claimReceipt);
    return {
      project: structuredClone(claimedProject),
      targetReceipt: structuredClone(input.targetReceipt),
      claimReceipt,
    };
  }

  /**
   * Attaches rendered evidence only to the snapshot previously claimed by
   * `claimPhase0RenderedEvidence`. A newer edit wins: stale evidence is
   * rejected instead of being written onto newer project state.
   */
  async recordPhase0RenderedEvidence(
    userId: string,
    projectId: string,
    input: {
      expectedRevision: ProjectRevisionV1;
      targetReceipt: ProjectMutationReceiptV1;
      claimReceipt: ProjectMutationReceiptV1;
      facts: ProjectPhase0RenderedEvidenceFactsV1;
    },
  ): Promise<ProjectMutationReceiptV1> {
    assertReceiptForProjectRevision(projectId, input.targetReceipt, input.targetReceipt.revision);
    assertReceiptForProjectRevision(projectId, input.claimReceipt, input.expectedRevision);
    assertPhase0RenderedEvidenceFacts(input.facts);

    const committedAt = new Date();
    const setFields: Record<string, unknown> = {
      "intelligence.phase0RenderedStillEvidence": structuredClone(input.facts.renderedStillEvidence),
      "intelligence.phase0FixtureArtifact.materialization": input.facts.fixtureArtifact.materialization,
      "intelligence.phase0FixtureArtifact.renderedStillEvidenceStatus": input.facts.fixtureArtifact.renderedStillEvidenceStatus,
      "intelligence.phase0FixtureArtifact.renderedStillEvidenceReason": input.facts.fixtureArtifact.renderedStillEvidenceReason,
      "intelligence.phase0FixtureArtifact.renderedStillFrameCount": input.facts.fixtureArtifact.renderedStillFrameCount,
      "intelligence.phase0FixtureArtifact.renderedStillFailedFrameCount": input.facts.fixtureArtifact.renderedStillFailedFrameCount,
      "intelligence.phase0FixtureArtifact.renderedStillCompletedAt": input.facts.fixtureArtifact.renderedStillCompletedAt,
      "intelligence.phase0FixtureArtifact.renderedAestheticStatus": input.facts.fixtureArtifact.renderedAestheticStatus,
      "intelligence.phase0FixtureArtifact.renderedAestheticScore": input.facts.fixtureArtifact.renderedAestheticScore,
      "intelligence.phase0FixtureArtifact.renderedAestheticIssueCount": input.facts.fixtureArtifact.renderedAestheticIssueCount,
      "intelligence.phase0FixtureArtifact.renderedAestheticFailFrameCount": input.facts.fixtureArtifact.renderedAestheticFailFrameCount,
      "intelligence.phase0FixtureArtifact.renderedAestheticWarnFrameCount": input.facts.fixtureArtifact.renderedAestheticWarnFrameCount,
      "intelligence.phase0FixtureArtifact.renderedAestheticSampledFrames": input.facts.fixtureArtifact.renderedAestheticSampledFrames,
      "intelligence.renderedQualityEvidence": structuredClone(input.facts.renderedQualityEvidence),
      "intelligence.phase0RenderedQualityGate": structuredClone(input.facts.renderedQualityGate),
      "intelligence.phase0RenderedEvidenceTargetReceipt": structuredClone(input.targetReceipt),
      "intelligence.phase0RenderedEvidenceClaimReceipt": structuredClone(input.claimReceipt),
      updatedAt: committedAt,
    };
    if (input.facts.renderedAestheticReport) {
      setFields["intelligence.phase0RenderedAestheticReport"] = structuredClone(input.facts.renderedAestheticReport);
    }
    if (input.facts.liveTruth) {
      setFields["intelligence.phase0LiveTruth"] = structuredClone(input.facts.liveTruth);
    }
    if (input.facts.reviewDisposition) {
      setFields.autoEditStatus = input.facts.reviewDisposition.autoEditStatus;
      setFields.projectStatus = input.facts.reviewDisposition.projectStatus;
      setFields.autoEditHealth = input.facts.reviewDisposition.autoEditHealth;
      setFields.autoEditWarning = input.facts.reviewDisposition.autoEditWarning;
    }

    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
        "intelligence.phase0RenderedEvidenceTargetReceipt.revision.value": input.targetReceipt.revision.value,
        "intelligence.phase0RenderedEvidenceTargetReceipt.revision.compatibilityUpdatedAt": input.targetReceipt.revision.compatibilityUpdatedAt,
        "intelligence.phase0RenderedEvidenceClaimReceipt.revision.value": input.claimReceipt.revision.value,
        "intelligence.phase0RenderedEvidenceClaimReceipt.revision.compatibilityUpdatedAt": input.claimReceipt.revision.compatibilityUpdatedAt,
      },
      {
        $set: setFields,
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(projectRevisionFor(latest));
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return receipt;
  }

  /**
   * Mirrors checkpoint-owned chat-proof state only while the editor revision
   * named by `subjectReceipt` remains current. This is intentionally a
   * revision-preserving derived projection: a proof lifecycle update is not a
   * new timeline mutation and must not manufacture a receipt for one.
   */
  async recordChatRenderVerificationProjection(
    userId: string,
    projectId: string,
    input: ProjectChatRenderVerificationProjectionInputV1,
  ): Promise<void> {
    assertReceiptForProjectRevision(projectId, input.subjectReceipt, input.subjectReceipt.revision);
    assertChatRenderVerificationProjection(input, projectId);

    const currentProjection = {
      "intelligence.latestChatEditRenderVerification.operationId": input.record.operationId,
      "intelligence.latestChatEditRenderVerification.sessionId": input.record.sessionId,
      "intelligence.latestChatEditRenderVerification.beforeCheckpointId": input.record.beforeCheckpointId,
      "intelligence.latestChatEditRenderVerification.afterCheckpointId": input.record.afterCheckpointId,
      "intelligence.latestChatEditRenderVerification.subjectReceipt.projectId": projectId,
      "intelligence.latestChatEditRenderVerification.subjectReceipt.revision.value": input.subjectReceipt.revision.value,
      "intelligence.latestChatEditRenderVerification.subjectReceipt.revision.compatibilityUpdatedAt": input.subjectReceipt.revision.compatibilityUpdatedAt,
      "intelligence.latestChatEditRenderVerification.lifecycle.state": {
        $in: input.expectedLifecycleStates,
      },
      ...(input.expectedAttemptToken !== undefined
        ? {
            "intelligence.latestChatEditRenderVerification.lifecycle.attemptToken": input.expectedAttemptToken,
          }
        : {}),
    };
    const projectionScope = input.allowReplacePriorSubject
      ? {
          $or: [
            { "intelligence.latestChatEditRenderVerification": { $exists: false } },
            {
              "intelligence.latestChatEditRenderVerification.subjectReceipt.revision.value": {
                $ne: input.subjectReceipt.revision.value,
              },
            },
            currentProjection,
          ],
        }
      : currentProjection;
    const update: Record<string, unknown> = {
      $set: {
        "intelligence.latestChatEditRenderVerification": structuredClone(input.record),
      },
    };
    if (input.appendHistory) {
      update.$push = {
        "intelligence.chatEditRenderVerificationHistory": {
          $each: [structuredClone(input.record)],
          $slice: -20,
        },
      };
    }

    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        $and: [
          projectRevisionPredicate(input.subjectReceipt.revision),
          projectionScope,
        ],
      },
      update,
    );
    if (result.matchedCount === 1) return;

    const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!latest) throw new ProjectNotFoundOrForbiddenError();
    throw new ProjectMutationConflictError(
      projectRevisionFor(latest),
      "The chat render-verification projection is stale for this project revision.",
    );
  }

  /**
   * Captures receipts emitted by ProjectService writers while one async
   * operation runs. The receipt is produced by the writer itself, so callers
   * do not need a post-write current-revision read to bind a rollback.
   */
  async captureMutationReceipts<T>(
    callback: () => Promise<T> | T,
    onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
  ): Promise<CapturedProjectMutationReceiptsV1<T>> {
    const activeReceipts = projectMutationReceiptStorage.getStore();
    if (activeReceipts) {
      const receiptOffset = activeReceipts.length;
      try {
        const value = await callback();
        return { value, receipts: activeReceipts.slice(receiptOffset) };
      } finally {
        onSettled?.(activeReceipts.slice(receiptOffset).map((receipt) => structuredClone(receipt)));
      }
    }

    return projectMutationReceiptStorage.run([], async () => {
      const receipts = projectMutationReceiptStorage.getStore();
      if (!receipts) throw new ProjectMutationWriteError();
      try {
        const value = await callback();
        return { value, receipts: [...receipts] };
      } finally {
        onSettled?.(receipts.map((receipt) => structuredClone(receipt)));
      }
    });
  }

  private async enqueueProjectRenderSnapshotInvalidationBeforeCommitV1(input: {
    ownerId: string;
    projectId: string;
    operation: "REPLACE_EDITOR_STATE" | "RESTORE_CHECKPOINT_STATE";
    beforeRevision: ProjectRevisionV1;
    afterRevision: ProjectRevisionV1;
    committedAt: Date;
    db: Awaited<ReturnType<typeof getDatabase>>;
  }): Promise<ProjectRenderSnapshotInvalidationLinkV1> {
    const receipt = createProjectRenderSnapshotInvalidationReceiptV1({
      ownerId: input.ownerId,
      projectId: input.projectId,
      operation: input.operation,
      beforeRevision: input.beforeRevision,
      afterRevision: input.afterRevision,
      issuedAt: input.committedAt,
    });
    const outbox = createProjectRenderSnapshotInvalidationOutboxV1(receipt);
    const collection = input.db.collection(
      PROJECT_RENDER_SNAPSHOT_INVALIDATION_OUTBOX_COLLECTION_V1,
    ) as unknown as ProjectRenderSnapshotInvalidationOutboxCollectionV1;
    try {
      await enqueueProjectRenderSnapshotInvalidationOutboxV1({
        outbox,
        collection,
      });
    } catch (error) {
      throw new ProjectMutationWriteError(
        "Project render invalidation could not be durably enqueued before mutation: "
          + (error instanceof Error ? error.message : "UNKNOWN"),
      );
    }
    return projectRenderSnapshotInvalidationLinkV1(receipt);
  }

  /**
   * Checkpoint-only exact-state restore. The checkpoint store owns state
   * capture and hashing; ProjectService alone owns the final project write.
   * Its returned postimage is the state that must be fingerprinted as proof.
   */
  async restoreCheckpointState(
    userId: string,
    projectId: string,
    input: ProjectCheckpointRestoreInputV1,
  ): Promise<ProjectCheckpointRestoreReceiptV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    if (!isBoundedNonEmptyStringV1(input.checkpointId, 200)) {
      throw new ProjectMutationWriteError("Checkpoint restore requires one bounded checkpoint identity.");
    }
    assertCheckpointRestoreFields(input.setFields, input.unsetFields);
    assertProjectGeneratedCompositionCheckpointRestoreV1(
      projectId,
      input.setFields,
      input.unsetFields,
    );

    const db = await getDatabase();
    const currentProject = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!currentProject) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(currentProject);
    if (
      currentRevision.value !== input.expectedRevision.value
      || currentRevision.compatibilityUpdatedAt !== input.expectedRevision.compatibilityUpdatedAt
    ) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (hasActiveDirectorMutationLeaseV1(currentProject)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "Checkpoint restore cannot run while a Director mutation lease is active.",
      );
    }
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(currentProject),
      new Date(),
    );
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "Checkpoint restore cannot run while timeline range locks are active.",
      );
    }

    const prospectiveProject = structuredClone(currentProject) as unknown as Record<string, unknown>;
    Object.assign(prospectiveProject, structuredClone(input.setFields));
    for (const field of input.unsetFields) delete prospectiveProject[field];
    const fps = prospectiveProject.fps;
    const durationInFrames = prospectiveProject.durationInFrames;
    const dimensions = prospectiveProject.playerDimensions as EditorState["playerDimensions"] | undefined;
    const aspectRatio = prospectiveProject.aspectRatio;
    const prospectiveOverlays = prospectiveProject.overlays;
    if (
      !isProjectTimelineFpsV1(fps)
      || !Number.isSafeInteger(durationInFrames)
      || (durationInFrames as number) < 0
      || !validDimensions(dimensions)
      || dimensions.width <= 0
      || dimensions.height <= 0
      || !["16:9", "9:16", "1:1", "4:5"].includes(String(aspectRatio))
      || !Array.isArray(prospectiveOverlays)
      || prospectiveOverlays.length > 100_000
    ) {
      throw new ProjectMutationWriteError(
        "Checkpoint restore requires one exact supported project timeline.",
      );
    }
    const exactDurationInFrames = durationInFrames as number;
    indexOverlaySetForFamilyReplacementV1(prospectiveOverlays, "candidate");
    const restoredFrameRanges = overlayFamilyFrameRangesV1(
      prospectiveOverlays,
      "checkpoint restore",
    );
    if (restoredFrameRanges.some((range) => range.endFrame > exactDurationInFrames)) {
      throw new ProjectMutationWriteError(
        "Checkpoint restore overlays must remain inside the project duration.",
      );
    }

    const committedAt = new Date();
    const afterRevision = projectMutationReceiptAfterV1(
      projectId,
      input.expectedRevision,
      committedAt,
    ).revision;
    const projectRenderSnapshotInvalidation =
      await this.enqueueProjectRenderSnapshotInvalidationBeforeCommitV1({
        ownerId: userId,
        projectId,
        operation: "RESTORE_CHECKPOINT_STATE",
        beforeRevision: currentRevision,
        afterRevision,
        committedAt,
        db,
      });
    const timelineChangeReceipt = createOverlayFamilyTimelineChangeReceiptV1({
      receiptId: `timeline-checkpoint-restore_${nanoid(18)}`,
      projectId,
      operation: "RESTORE_CHECKPOINT_STATE",
      actorKind: input.actorKind,
      fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlays: currentProject.overlays ?? [],
      afterOverlays: prospectiveOverlays,
      projectRenderSnapshotInvalidation,
      changedPaths: [
        ...Object.keys(input.setFields),
        ...input.unsetFields,
        "timelineRangeChangeReceipts",
      ],
    });
    const update: Record<string, unknown> = {
      $set: { ...input.setFields, updatedAt: committedAt },
      $push: {
        timelineRangeChangeReceipts: {
          $each: [timelineChangeReceipt],
          $slice: -200,
        },
      },
      $inc: { projectRevision: 1 },
    };
    if (input.unsetFields.length > 0) {
      update.$unset = Object.fromEntries(
        input.unsetFields.map((field) => [field, ""]),
      );
    }

    const restoredProject = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOneAndUpdate(
        {
          projectId,
          userId,
          ...projectRevisionPredicate(input.expectedRevision),
        },
        update,
        { returnDocument: "after", includeResultMetadata: false },
      )) as Record<string, unknown> | null;

    if (!restoredProject) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(projectRevisionFor(latest));
    }

    const receipt = projectMutationReceiptAfterV1(projectId, input.expectedRevision, committedAt);
    this.publishMutationReceipt(receipt);
    return { receipt, timelineChangeReceipt, project: restoredProject };
  }

  /**
   * The only manual/autosave write path. The final predicate binds the
   * authenticated owner and the ProjectService revision in one Mongo update.
   * Legacy documents without a counter are deliberately treated as revision 0
   * only for their first compare-and-swap. The temporary compatibilityUpdatedAt
   * guard prevents a stale browser from overwriting an existing writer that has
   * not yet been migrated to increment projectRevision.
   */
  private async persistEditorState(input: {
    userId: string;
    projectId: string;
    state: EditorState;
    expectedRevision?: ProjectRevisionV1;
    overlayAuthority: OverlaySaveAuthority;
    projectUpdates?: Record<string, unknown>;
    projectUnsets?: readonly string[];
    directorLeaseId?: string;
    mode: "manual" | "autosave";
  }): Promise<ProjectMutationReceiptV1> {
    if (!input.expectedRevision) {
      throw new ProjectMutationWriteError(
        "Whole-state persistence requires the caller's observed project revision.",
      );
    }
    // Validate before any resolver or database work so route casts cannot
    // bypass the durable marker contract.
    assertEditorTimelineMarkers(
      input.state.markers,
      input.state.durationInFrames,
    );
    assertGenericProjectUpdateFields(
      input.projectUpdates ?? {},
      [...(input.projectUnsets ?? [])],
    );
    if (!Array.isArray(input.state.overlays)
      || input.state.overlays.length > 100_000) {
      throw new ProjectMutationWriteError(
        "Whole-state persistence requires a bounded overlay array.",
      );
    }
    if (!validDimensions(input.state.playerDimensions)) {
      throw new ProjectMutationWriteError(
        "Whole-state persistence requires valid positive player dimensions.",
      );
    }
    if (!["16:9", "9:16", "1:1", "4:5"].includes(input.state.aspectRatio)) {
      throw new ProjectMutationWriteError(
        "Whole-state persistence requires a supported project aspect ratio.",
      );
    }
    const cleanOverlays = assetResolver.stripUrlsForLLM(input.state.overlays);
    const dimensions = input.state.playerDimensions;
    const db = await getDatabase();
    const currentProject = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId: input.projectId,
      userId: input.userId,
    })) as Project | null;

    if (!currentProject) throw new ProjectNotFoundOrForbiddenError();

    // Legacy or partial editor payloads may omit the root duration. Preserve
    // the durable project value in that case; only an explicit duration
    // command owner should intentionally change the project duration.
    const durationInFrames = input.state.durationInFrames
      ?? currentProject.durationInFrames;
    const fps = input.state.fps ?? currentProject.fps;
    if (!isProjectTimelineFpsV1(fps)
      || !Number.isSafeInteger(durationInFrames)
      || durationInFrames < 0) {
      throw new ProjectMutationWriteError(
        "Whole-state persistence requires an exact supported frame timeline.",
      );
    }

    // A direct caller may omit duration while supplying markers. Bind those
    // markers to the durable project duration before any write so the route
    // layer is never the sole range authority.
    assertEditorTimelineMarkers(
      input.state.markers,
      input.state.durationInFrames ?? currentProject.durationInFrames,
    );

    const currentRevision = projectRevisionFor(currentProject);
    const expectedRevision = input.expectedRevision;
    assertProjectRevision(expectedRevision);
    if (
      expectedRevision.value !== currentRevision.value ||
      expectedRevision.compatibilityUpdatedAt !==
        currentRevision.compatibilityUpdatedAt
    ) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const lock = currentProject;
    const directorLockIsActive = hasActiveDirectorMutationLeaseV1(lock);
    if (directorLockIsActive
      && input.directorLeaseId !== currentProject.directorLockToken) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before retrying.",
      );
    }

    const workerOverlays = (currentProject.overlays || []).filter(
      (overlay: any) => overlay._workerAdded === true,
    );
    const browserOverlayIds = new Set(
      cleanOverlays.map((overlay: any) => overlay.id),
    );
    const missingWorkerOverlays = workerOverlays.filter(
      (overlay: any) => !browserOverlayIds.has(overlay.id),
    );
    const overlaysWithServerData = mergeServerOwnedOverlayDataForSave(
      cleanOverlays,
      currentProject.overlays,
      input.overlayAuthority,
    );
    const mergedOverlays = stampPersistedOverlays(
      [...overlaysWithServerData, ...missingWorkerOverlays],
      `project-service-${input.mode}`,
    );
    indexOverlaySetForFamilyReplacementV1(mergedOverlays, "candidate");
    const mergedFrameRanges = overlayFamilyFrameRangesV1(
      mergedOverlays,
      "whole-state candidate",
    );
    if (mergedFrameRanges.some((frameRange) => (
      frameRange.endFrame > durationInFrames
    ))) {
      throw new ProjectMutationWriteError(
        "Whole-state overlays must remain inside the project duration.",
      );
    }
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(currentProject),
      new Date(),
    );
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((rangeLock) => rangeLock.lockId))].sort(),
        "A whole-state write cannot run while timeline range locks are active.",
      );
    }
    const wholeStateMediaPrerequisite =
      await materializeProjectWholeStateMediaPrerequisiteInMongoV1({
        operation: "REPLACE_EDITOR_STATE",
        tenantId: currentProject.orgId ?? currentProject.userId,
        userId: input.userId,
        projectOwnerId: currentProject.userId,
        orgId: currentProject.orgId ?? null,
        projectId: input.projectId,
        projectRevision: currentRevision,
        overlays: mergedOverlays,
      }, db, COLLECTIONS.MEDIA_ASSETS);
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: expectedRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const projectRenderSnapshotInvalidation =
      await this.enqueueProjectRenderSnapshotInvalidationBeforeCommitV1({
        ownerId: input.userId,
        projectId: input.projectId,
        operation: "REPLACE_EDITOR_STATE",
        beforeRevision: currentRevision,
        afterRevision,
        committedAt,
        db,
      });
    const timelineChangeReceipt = createOverlayFamilyTimelineChangeReceiptV1({
      receiptId: `timeline-editor-state_${nanoid(18)}`,
      projectId: input.projectId,
      operation: "REPLACE_EDITOR_STATE",
      actorKind: input.overlayAuthority === "client" ? "USER" : "SYSTEM",
      fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlays: currentProject.overlays ?? [],
      afterOverlays: mergedOverlays,
      projectRenderSnapshotInvalidation,
      wholeStateMediaPrerequisite:
        projectWholeStateMediaPrerequisiteLinkV1(wholeStateMediaPrerequisite),
      changedPaths: [
        "overlays",
        "aspectRatio",
        "playerDimensions",
        "fps",
        "durationInFrames",
        ...(input.state.markers !== undefined ? ["markers"] : []),
        ...Object.keys(input.projectUpdates ?? {}),
        ...(input.projectUnsets ?? []),
        "timelineRangeChangeReceipts",
      ],
    });
    const update: Record<string, unknown> = {
      $set: {
        ...(input.projectUpdates ?? {}),
        overlays: mergedOverlays,
        aspectRatio: input.state.aspectRatio,
        playerDimensions: dimensions,
        fps,
        durationInFrames,
        ...(input.state.markers !== undefined
          ? { markers: input.state.markers }
          : {}),
        ...(input.mode === "autosave" ? { lastAutosaveAt: committedAt } : {}),
        updatedAt: committedAt,
      },
      $push: {
        timelineRangeChangeReceipts: {
          $each: [timelineChangeReceipt],
          $slice: -200,
        },
      },
      $inc: { projectRevision: 1 },
    };
    const unsetFields = Object.fromEntries(
      (input.projectUnsets ?? []).map((field) => [field, ""]),
    ) as Record<string, "">;
    if (input.mode === "autosave" && lock.directorLock === true) {
      unsetFields.directorLock = "";
      unsetFields.directorLockAt = "";
      unsetFields.directorLockToken = "";
    }
    if (input.directorLeaseId) {
      unsetFields.directorLock = "";
      unsetFields.directorLockAt = "";
      unsetFields.directorLockToken = "";
    }
    if (Object.keys(unsetFields).length > 0) {
      update.$unset = unsetFields;
    }

    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId: input.projectId,
        userId: input.userId,
        ...projectRevisionPredicate(expectedRevision),
        ...(input.directorLeaseId
          ? { directorLockToken: input.directorLeaseId }
          : {}),
      },
      update,
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId: input.projectId,
        userId: input.userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(projectRevisionFor(latest));
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: input.projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return receipt;
  }

  private publishMutationReceipt(receipt: ProjectMutationReceiptV1): void {
    projectMutationReceiptStorage.getStore()?.push(receipt);
  }

  /**
   * Delete project
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    const db = await getDatabase();

    // Verify ownership before deleting
    const project = await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne({ projectId });
    if (!project) {
      throw new Error("Project not found");
    }
    if (project.userId !== userId) {
      throw new Error(
        "Unauthorized: Cannot delete project owned by another user",
      );
    }

    // Delete project
    await db.collection(COLLECTIONS.PROJECTS).deleteOne({ projectId });

    // Delete associated checkpoints
    await db.collection(COLLECTIONS.CHECKPOINTS).deleteMany({ projectId });

    // Delete associated chat sessions
    await db.collection(COLLECTIONS.CHAT_SESSIONS).deleteMany({ projectId });

    // Clean up project links (fail-open — link cleanup failure must not block delete)
    try {
      await removeProjectFromLinks(userId, projectId);
    } catch (linkErr: any) {
      console.error(
        `[deleteProject] Link cleanup failed for ${projectId}: ${linkErr.message}`,
      );
    }

    // Note: We don't delete media assets as they might be shared across projects
  }

  /**
   * List user's projects
   */
  async listProjects(
    userId: string,
    page = 1,
    limit = 20,
    sortBy: "createdAt" | "updatedAt" | "name" = "updatedAt",
  ): Promise<{
    projects: ProjectListItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const db = await getDatabase();
    const collection = db.collection(COLLECTIONS.PROJECTS);

    const total = await collection.countDocuments({ userId });
    const skip = (page - 1) * limit;

    const sortOrder: any = {};
    sortOrder[sortBy] = sortBy === "name" ? 1 : -1;

    const projects = (await collection
      .find({ userId })
      .project({
        projectId: 1,
        name: 1,
        thumbnail: 1,
        updatedAt: 1,
        durationInFrames: 1,
        aspectRatio: 1,
        brand: 1,
        pipelineStage: 1,
        qualityScore: 1,
        projectStatus: 1,
        sourceSessionId: 1,
      })
      .sort(sortOrder)
      .allowDiskUse(true)
      .skip(skip)
      .limit(limit)
      .toArray()) as unknown as ProjectListItem[];

    return {
      projects,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List organization's projects
   */
  async listOrgProjects(
    userId: string,
    orgId: string,
    page = 1,
    limit = 20,
    sortBy: "createdAt" | "updatedAt" | "name" = "updatedAt",
  ): Promise<{
    projects: ProjectListItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    // Verify user is member of org
    const isMember = await orgMemberService.isMember(userId, orgId);
    if (!isMember) {
      throw new Error("User is not a member of this organization");
    }

    const db = await getDatabase();
    const collection = db.collection(COLLECTIONS.PROJECTS);

    const query = { orgId, visibility: "org" };
    const total = await collection.countDocuments(query);
    const skip = (page - 1) * limit;

    const sortOrder: any = {};
    sortOrder[sortBy] = sortBy === "name" ? 1 : -1;

    const projects = (await collection
      .find(query)
      .project({
        projectId: 1,
        name: 1,
        thumbnail: 1,
        updatedAt: 1,
        durationInFrames: 1,
        aspectRatio: 1,
        orgId: 1,
        visibility: 1,
        userId: 1,
        // Same display fields listProjects projects (P2 org UX) — the dashboard renders these,
        // so an org-scoped list must not show blank brand/status chips.
        brand: 1,
        pipelineStage: 1,
        qualityScore: 1,
        projectStatus: 1,
        sourceSessionId: 1,
      })
      .sort(sortOrder)
      .allowDiskUse(true)
      .skip(skip)
      .limit(limit)
      .toArray()) as unknown as ProjectListItem[];

    return {
      projects,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Add one overlay only at the caller's exact project snapshot. Unlike the
   * retired legacy method, this owner never converts a stale editing decision
   * into a fresh write by loading the latest revision on the caller's behalf.
   */
  async addOverlayAtRevisionV1(
    userId: string,
    projectId: string,
    input: ProjectOverlayAddCommandV1,
  ): Promise<ProjectDirectOverlayMutationResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    const overlayFrameRange = overlayTimelineFrameRangeV1(input.overlay);
    if (!overlayFrameRange) {
      throw new ProjectMutationWriteError(
        "Overlay addition requires an exact positive project-frame range.",
      );
    }
    if (!Number.isSafeInteger(input.overlay.id) || input.overlay.id < 0) {
      throw new ProjectMutationWriteError(
        "Overlay addition requires a non-negative integer identity.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (!isProjectTimelineFpsV1(project.fps)) {
      throw new ProjectMutationWriteError(
        "Overlay addition requires a supported project frame rate.",
      );
    }
    if (project.overlays?.some((overlay) => overlay.id === input.overlay.id)) {
      throw new ProjectMutationWriteError(
        `Overlay ${input.overlay.id} already exists in project ${projectId}.`,
      );
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before adding the overlay.",
      );
    }
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => frameRangesOverlapHalfOpenV1(
      lock.frameRange,
      overlayFrameRange,
    ));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps the overlay addition.",
      );
    }

    const overlayWithReceipt = ensureAtomicOverlayReceipt(input.overlay, {
      source: "project-service-add-overlay-at-revision-v1",
      intent: `persist-${input.overlay.type}`,
      reason: "overlay persisted through a caller-bound ProjectService command",
    });
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-overlay-add_${nanoid(18)}`,
      projectId,
      operation: "ADD_OVERLAY",
      actorKind: input.actorKind,
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlay: null,
      afterOverlay: overlayWithReceipt,
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": { $ne: input.overlay.id },
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $push: {
          overlays: overlayWithReceipt,
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          },
        } as any,
        $set: { updatedAt: committedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      const latestRevision = projectRevisionFor(latest);
      if (sameProjectRevisionV1(input.expectedRevision, latestRevision)
        && latest.overlays?.some((overlay) => overlay.id === input.overlay.id)) {
        throw new ProjectMutationWriteError(
          `Overlay ${input.overlay.id} already exists in project ${projectId}.`,
        );
      }
      throw new ProjectMutationConflictError(latestRevision);
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return { mutationReceipt, timelineChangeReceipt };
  }

  /**
   * Attach one server-assigned uploaded-audio derivative at the caller's
   * project snapshot. The stored MEDIA_ASSETS receipt is authoritative; a
   * caller cannot forge rights, role, placement, or acoustic evidence.
   */
  async attachUploadedAudioAtRevisionV1(
    userId: string,
    projectId: string,
    input: ProjectUploadedAudioAttachCommandV1,
  ): Promise<ProjectUploadedAudioAttachResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    const requestedMaterial = readUploadedAudioTimelineMaterialV1(input.overlay);
    const overlayFrameRange = overlayTimelineFrameRangeV1(input.overlay);
    if (!overlayFrameRange) {
      throw new ProjectMutationWriteError(
        "Uploaded audio requires an exact positive project-frame range.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    const projectDurationInFrames = project.durationInFrames;
    if (!isProjectTimelineFpsV1(project.fps)
      || !Number.isSafeInteger(projectDurationInFrames)
      || projectDurationInFrames <= 0
      || overlayFrameRange.endFrame > projectDurationInFrames) {
      throw new ProjectMutationWriteError(
        "Uploaded audio requires a supported in-project frame range.",
      );
    }

    const derivativeAsset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({
      assetId: requestedMaterial.derivativeAssetId,
      userId,
      projectId,
    });
    assertUploadedAudioDerivativeAssetV1(
      derivativeAsset,
      requestedMaterial,
      userId,
      projectId,
      project.fps,
    );

    const existing = project.overlays?.find((overlay) => (
      String(overlay.id) === String(input.overlay.id)
    ));
    if (existing) {
      const existingMaterial = readUploadedAudioTimelineMaterialV1(existing);
      if (!sameCanonicalProjectMutationValueV1(existingMaterial, requestedMaterial)) {
        throw new ProjectMutationWriteError(
          `Uploaded-audio overlay ${String(input.overlay.id)} already exists with different material.`,
        );
      }
      return {
        disposition: "ALREADY_ATTACHED",
        currentRevision,
        mutationReceipt: null,
        timelineChangeReceipt: null,
      };
    }
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before attaching uploaded audio.",
      );
    }
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => frameRangesOverlapHalfOpenV1(
      lock.frameRange,
      overlayFrameRange,
    ));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps the uploaded-audio attachment.",
      );
    }

    const overlayWithReceipt = ensureAtomicOverlayReceipt(input.overlay, {
      source: "project-service-attach-uploaded-audio-v1",
      intent: `attach-uploaded-${requestedMaterial.mediaRole}`,
      reason: "stored assignment, rights, source handles, revision, and range locks validated",
    });
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-overlay-add_${nanoid(18)}`,
      projectId,
      operation: "ADD_OVERLAY",
      actorKind: input.actorKind,
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlay: null,
      afterOverlay: overlayWithReceipt,
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": { $ne: input.overlay.id },
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $push: {
          overlays: overlayWithReceipt,
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          },
        } as any,
        $set: { updatedAt: committedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      const latestRevision = projectRevisionFor(latest);
      const racedExisting = latest.overlays?.find((overlay) => (
        String(overlay.id) === String(input.overlay.id)
      ));
      if (racedExisting) {
        const racedMaterial = readUploadedAudioTimelineMaterialV1(racedExisting);
        if (sameCanonicalProjectMutationValueV1(racedMaterial, requestedMaterial)) {
          return {
            disposition: "ALREADY_ATTACHED",
            currentRevision: latestRevision,
            mutationReceipt: null,
            timelineChangeReceipt: null,
          };
        }
        throw new ProjectMutationWriteError(
          `Uploaded-audio overlay ${String(input.overlay.id)} raced with different material.`,
        );
      }
      throw new ProjectMutationConflictError(latestRevision);
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return { disposition: "APPLIED", mutationReceipt, timelineChangeReceipt };
  }

  /**
   * Atomically land one MG worker outcome at the caller's project snapshot.
   * Generated outcomes also land their overlays; declined and fallback
   * outcomes are evidence-only. A replay that has already landed the same job
   * is idempotent; a different concurrent project write is a real conflict.
   */
  async commitMgRenderDelivery(
    userId: string,
    projectId: string,
    input: ProjectMgRenderDeliveryCommitV1,
  ): Promise<{
    delivered: boolean;
    receipt?: ProjectMutationReceiptV1;
  }> {
    assertProjectRevision(input.expectedRevision);
    const hasExactlyOneDeliveryOverlay = input.overlays.filter((overlay) => (
      (overlay as { metadata?: { mgRenderJobId?: unknown } }).metadata?.mgRenderJobId === input.jobId
    )).length === 1;
    const overlayIds = input.overlays.map((overlay) => String(overlay.id));
    if (
      !input.jobId.trim()
      || new Set(overlayIds).size !== overlayIds.length
      || input.outcome.jobId !== input.jobId
      || !input.outcome.candidateId.trim()
      || !input.outcome.factKind.trim()
      || !Number.isSafeInteger(input.outcome.frame)
      || !(input.outcome.completedAt instanceof Date)
      || Number.isNaN(input.outcome.completedAt.getTime())
    ) {
      throw new ProjectMutationWriteError("MG render delivery input is invalid.");
    }
    if (input.outcome.status === "generated") {
      if (input.overlays.length === 0 || !hasExactlyOneDeliveryOverlay || !input.outcome.sequenceId.trim()) {
        throw new ProjectMutationWriteError("MG render delivery input is invalid.");
      }
    } else if (
      input.overlays.length !== 0
      || !input.outcome.reason.trim()
      || input.outcome.reason.length > 8_000
    ) {
      throw new ProjectMutationWriteError("MG render delivery input is invalid.");
    }
    const generated = input.outcome.status === "generated";

    const db = await getDatabase();
    const committedAt = new Date();
    const persistedOverlays = input.overlays.map((overlay) => (
      ensureAtomicOverlayReceipt(overlay, {
        source: "project-service-mg-render-delivery",
        intent: `persist-${overlay.type}`,
        reason: "generated MG delivery was attached through ProjectService",
      })
    ));
    const outcomePush = {
      $each: [input.outcome],
      $slice: -100,
    } as never;
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "intelligence.mgCodegenRun.asyncOutcomes.jobId": { $ne: input.jobId },
        ...(generated ? { "overlays.metadata.mgRenderJobId": { $ne: input.jobId } } : {}),
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $push: generated
          ? {
            overlays: { $each: persistedOverlays } as never,
            "intelligence.mgCodegenRun.asyncOutcomes": outcomePush,
          }
          : { "intelligence.mgCodegenRun.asyncOutcomes": outcomePush },
        $set: { updatedAt: committedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const current = (await db.collection(COLLECTIONS.PROJECTS).findOne(
        { projectId, userId },
        { projection: { overlays: 1, intelligence: 1, projectRevision: 1, updatedAt: 1 } },
      )) as (
        Pick<Project, "overlays" | "projectRevision" | "updatedAt">
        & { intelligence?: { mgCodegenRun?: { asyncOutcomes?: Array<{ jobId?: unknown }> } } }
      ) | null;
      if (!current) throw new ProjectNotFoundOrForbiddenError();
      const overlayAlreadyDelivered = current.overlays?.some((overlay) => (
        (overlay as { metadata?: { mgRenderJobId?: unknown } }).metadata?.mgRenderJobId === input.jobId
      ));
      const outcomeAlreadyDelivered = current.intelligence?.mgCodegenRun?.asyncOutcomes
        ?.some((outcome) => outcome.jobId === input.jobId) ?? false;
      if (generated && overlayAlreadyDelivered !== outcomeAlreadyDelivered) {
        throw new ProjectMutationWriteError("MG render delivery is partially persisted.");
      }
      if (outcomeAlreadyDelivered) return { delivered: false };
      throw new ProjectMutationConflictError(projectRevisionFor(current));
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { delivered: true, receipt };
  }

  /**
   * Complete a durable MG design job and commit the EDL evidence it produced in
   * one transaction. Neither collection may advance without the other.
   */
  async completeMgDesignExecutionV1(
    userId: string,
    projectId: string,
    input: ProjectMgDesignCompletionCommandV1,
  ): Promise<ProjectMgDesignCompletionResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectMgDesignCompletionCommandV1(input);
    const completedAt = new Date(input.result.completedAt);
    const { projectEvidence } = input.result;
    const { client, db } = await connectToDatabase();
    const session = client.startSession();
    try {
      const transactionResult = await session.withTransaction(async () => {
        const jobs = db.collection<{
          _id: string;
          projectId: string;
          userId: string;
          status: string;
          leaseId: string | null;
        }>(COLLECTIONS.MG_DESIGN_JOBS);
        const job = await jobs.findOne(
          { _id: input.result.jobId, projectId, userId },
          { projection: { status: 1, leaseId: 1 }, session },
        ) as { status?: unknown; leaseId?: unknown } | null;
        if (!job) return { disposition: "JOB_OWNERSHIP_LOST" } as const;
        if (job.status === "completed") return { disposition: "ALREADY_COMPLETED" } as const;
        if (job.status !== "running" || job.leaseId !== input.leaseId) {
          return { disposition: "JOB_OWNERSHIP_LOST" } as const;
        }

        const projects = db.collection(COLLECTIONS.PROJECTS);
        const project = await projects.findOne(
          { projectId, userId },
          { projection: { intelligence: 1, projectRevision: 1, updatedAt: 1 }, session },
        ) as (
          Pick<Project, "projectRevision" | "updatedAt">
          & { intelligence?: Record<string, unknown> }
        ) | null;
        if (!project) return { disposition: "PROJECT_NOT_FOUND" } as const;
        const currentRevision = projectRevisionFor(project);
        if (!sameProjectRevisionV1(currentRevision, input.expectedRevision)) {
          return { disposition: "PROJECT_CONFLICT", currentRevision } as const;
        }

        const intelligence = project.intelligence ?? {};
        const setFields: Record<string, unknown> = {
          updatedAt: completedAt,
        };
        if (projectEvidence.mgCodegenRun) {
          const run = projectEvidence.mgCodegenRun;
          setFields["intelligence.mgCodegenRun.version"] = run.version;
          setFields["intelligence.mgCodegenRun.queuedCount"] = run.queuedCount;
          setFields["intelligence.mgCodegenRun.generatedCount"] = run.generatedCount;
          setFields["intelligence.mgCodegenRun.failedCount"] = run.failedCount;
          setFields["intelligence.mgCodegenRun.outcomes"] = structuredClone(run.outcomes);
          setFields["intelligence.mgCodegenRun.truncated"] = run.truncated;
          setFields["intelligence.mgCodegenRun.completedAt"] = run.completedAt;
        }
        if (projectEvidence.mgKineticSfxContexts.length > 0) {
          setFields["intelligence.mgKineticSfxContexts"] = mergeBoundedMgEvidenceByMomentIdV1(
            (intelligence as { mgKineticSfxContexts?: unknown }).mgKineticSfxContexts,
            projectEvidence.mgKineticSfxContexts,
            100,
          );
        }
        if (projectEvidence.mgDeliveryRecords.length > 0) {
          setFields["intelligence.mgDeliveryRecords"] = mergeBoundedMgEvidenceByMomentIdV1(
            (intelligence as { mgDeliveryRecords?: unknown }).mgDeliveryRecords,
            projectEvidence.mgDeliveryRecords,
            200,
          );
        }
        if (projectEvidence.mgTasteContract) {
          setFields["intelligence.mgTasteContract"] = structuredClone(projectEvidence.mgTasteContract.contract);
        }

        const projectWrite = await projects.updateOne(
          { projectId, userId, ...projectRevisionPredicate(input.expectedRevision) },
          { $set: setFields, $inc: { projectRevision: 1 } },
          { session },
        );
        if (projectWrite.matchedCount !== 1 || projectWrite.modifiedCount !== 1) {
          throw new ProjectMutationWriteError("MG design project evidence changed during completion.");
        }
        const jobWrite = await jobs.updateOne(
          { _id: input.result.jobId, projectId, userId, status: "running", leaseId: input.leaseId },
          {
            $set: {
              status: "completed",
              result: structuredClone(input.result),
              leaseId: null,
              leaseExpiresAt: null,
              updatedAt: completedAt,
              completedAt,
            },
          },
          { session },
        );
        if (jobWrite.matchedCount !== 1 || jobWrite.modifiedCount !== 1) {
          throw new ProjectMutationWriteError("MG design job ownership changed during completion.");
        }

        return {
          disposition: "RECORDED",
          receipt: {
            schemaVersion: 1,
            projectId,
            revision: {
              schemaVersion: 1,
              value: input.expectedRevision.value + 1,
              compatibilityUpdatedAt: completedAt.toISOString(),
            },
            committedAt: completedAt.toISOString(),
          },
        } as const;
      });
      if (!transactionResult) {
        throw new ProjectMutationWriteError("MG design completion transaction returned no result.");
      }
      if (transactionResult.disposition === "RECORDED") {
        this.publishMutationReceipt(transactionResult.receipt);
      }
      return transactionResult;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Attach an already-generated BGM/SFX worker outcome through the canonical
   * project revision owner. BGM alignment re-runs only against the current CAS
   * snapshot, never against an earlier full-overlay read.
   */
  async commitPipelineAudioDeliveryV1(
    userId: string,
    projectId: string,
    input: ProjectPipelineAudioDeliveryCommandV1,
  ): Promise<ProjectPipelineAudioDeliveryResultV1> {
    assertProjectPipelineAudioDeliveryCommandV1(input);
    const materialHash = pipelineAudioDeliveryMaterialHashV1(input);
    const preparedOverlays = preparePipelineAudioDeliveryOverlaysV1(input, materialHash)
      .map((overlay) => ensureAtomicOverlayReceipt(overlay, {
        source: "project-service-pipeline-audio-delivery",
        intent: "persist-" + input.kind.toLowerCase(),
        reason: "signed pipeline audio delivery attached through ProjectService",
      }));
    const canonicalWarnings = (input.warnings ?? []).map((warning) => (
      clonePipelineAudioCanonicalValueV1(warning) as Record<string, unknown>
    ));
    const canonicalMusicCoveragePlan = input.musicCoveragePlan === undefined
      ? undefined
      : clonePipelineAudioCanonicalValueV1(input.musicCoveragePlan);
    const requiresTimelineBinding = input.outcome === "ATTACHED"
      || canonicalMusicCoveragePlan !== undefined;
    const db = await getDatabase();

    for (let attempt = 0; attempt < MAX_PIPELINE_AUDIO_DELIVERY_CAS_ATTEMPTS_V1; attempt++) {
      const current = (await db.collection(COLLECTIONS.PROJECTS).findOne(
        { projectId, userId },
      )) as Project | null;
      if (!current) throw new ProjectNotFoundOrForbiddenError();

      const existing = findPipelineAudioDeliveryReceiptV1(current, input.deliveryId);
      if (existing) {
        if (
          existing.materialHash !== materialHash
          || existing.kind !== input.kind
          || existing.outcome !== input.outcome
        ) {
          throw new ProjectMutationWriteError(
            "Pipeline audio delivery identity was reused with different material.",
          );
        }
        return {
          disposition: "ALREADY_APPLIED",
          deliveryReceipt: structuredClone(existing),
        };
      }

      const beforeRevision = projectRevisionFor(current);
      const sameRevision = sameProjectRevisionV1(input.expectedRevision, beforeRevision);
      const currentBindingHash = projectPipelineAudioTimelineBindingHashV1(current);
      if (requiresTimelineBinding && !sameRevision) {
        if (beforeRevision.value === input.expectedRevision.value) {
          throw new ProjectPipelineAudioDeliveryRebaseBlockedError(
            beforeRevision,
            "LEGACY_REVISION_DRIFT",
          );
        }
        if (currentBindingHash !== input.planningTimelineBindingHash) {
          throw new ProjectPipelineAudioDeliveryRebaseBlockedError(
            beforeRevision,
            "TIMELINE_BINDING_CHANGED",
          );
        }
      }

      const rebase: ProjectPipelineAudioDeliveryRebaseV1 = sameRevision
        ? "FRESH"
        : requiresTimelineBinding
          ? "SAFE_REBASED_AUDIO_ONLY"
          : "WARNING_ONLY_REBASED";
      const nextOverlays = structuredClone(current.overlays || []);
      let beatAlignment: ProjectPipelineAudioDeliveryReceiptV1["beatAlignment"] = null;
      if (input.outcome === "ATTACHED") {
        nextOverlays.push(...preparedOverlays);
        if (input.kind === "BGM" && input.beatFrames && input.beatFrames.length > 0) {
          const alignment = alignCutsToBeatsWithEvidence(
            nextOverlays,
            [...input.beatFrames],
            current.fps || 30,
          );
          beatAlignment = {
            snappedCount: alignment.snappedCount,
            changedOverlayIds: [...new Set(
              alignment.changes.flatMap((change) => [
                String(change.clipAId),
                String(change.clipBId),
                ...change.transitionOverlayIds.map(String),
              ]),
            )],
            rejectedCount: alignment.rejections.length,
          };
        }
      }

      const committedAt = new Date();
      const afterRevision: ProjectRevisionV1 = {
        schemaVersion: 1,
        value: beforeRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      };
      const mutationReceipt: ProjectMutationReceiptV1 = {
        schemaVersion: 1,
        projectId,
        revision: afterRevision,
        committedAt: committedAt.toISOString(),
      };
      const changedPaths = pipelineAudioDeliveryChangedPathsV1(
        input,
        canonicalWarnings.length,
        canonicalMusicCoveragePlan !== undefined,
      );
      const deliveryReceipt: ProjectPipelineAudioDeliveryReceiptV1 = {
        schemaVersion: 1,
        deliveryId: input.deliveryId,
        kind: input.kind,
        outcome: input.outcome,
        materialHash,
        planningTimelineBindingHash: input.planningTimelineBindingHash,
        beforeRevision,
        afterRevision,
        mutationReceipt,
        rebase,
        attachedOverlayIds: preparedOverlays.map((overlay) => String(overlay.id)),
        beatAlignment,
        changedPaths,
        proof: input.outcome === "ATTACHED"
          ? {
            required: true,
            status: "UNVERIFIABLE",
            reason: "NO_RENDERED_AUDIO_OR_MIX_PROOF",
          }
          : {
            required: false,
            status: null,
            reason: "NO_AUDIO_OVERLAY_ATTACHED",
          },
        committedAt: committedAt.toISOString(),
      };
      const push: Record<string, unknown> = {
        pipelineAudioDeliveryReceipts: {
          $each: [deliveryReceipt],
          $slice: -MAX_PIPELINE_AUDIO_DELIVERY_RECEIPTS_V1,
        },
      };
      if (canonicalWarnings.length > 0) {
        push.pipelineWarnings = { $each: canonicalWarnings };
      }
      const set: Record<string, unknown> = { updatedAt: committedAt };
      if (input.outcome === "ATTACHED" && input.kind === "BGM") {
        set.overlays = nextOverlays;
      } else if (input.outcome === "ATTACHED") {
        push.overlays = { $each: preparedOverlays };
      }
      if (canonicalMusicCoveragePlan !== undefined) {
        set.musicCoveragePlan = canonicalMusicCoveragePlan;
        set["intelligence.audio.musicCoveragePlan"] = canonicalMusicCoveragePlan;
      }

      const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
        {
          projectId,
          userId,
          "pipelineAudioDeliveryReceipts.deliveryId": { $ne: input.deliveryId },
          ...projectRevisionPredicate(beforeRevision),
        },
        {
          $set: set,
          // Mongo's generic Document does not model validated dynamic $push
          // fields. Keep the cast at this driver boundary only.
          $push: push as never,
          $inc: { projectRevision: 1 },
        },
      );
      if (result.matchedCount === 1) {
        if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
        this.publishMutationReceipt(mutationReceipt);
        return { disposition: "APPLIED", deliveryReceipt };
      }
    }

    throw new ProjectMutationConflictError(
      await this.getProjectRevision(userId, projectId),
      "Pipeline audio delivery lost the final compare-and-swap race.",
    );
  }

  /**
   * Issue the only durable current-target invalidation admission for the
   * pipeline-video pilot. The admission advances the ProjectService revision
   * once, but does not prove that downstream artifacts were invalidated and
   * cannot authorize delivery until that consumer-enforced chain exists.
   */
  async admitPipelineVideoDeliveryInvalidationV1(
    userId: string,
    projectId: string,
    prerequisite: PipelineVideoProjectDeliveryPrerequisiteV1,
  ): Promise<ProjectPipelineVideoDeliveryInvalidationAdmissionResultV1> {
    try {
      assertPipelineVideoProjectDeliveryPrerequisiteV1(prerequisite);
    } catch (error) {
      throw new ProjectMutationWriteError(
        "Pipeline video invalidation prerequisite is invalid: "
          + (error instanceof Error ? error.message : "UNKNOWN"),
      );
    }
    if (
      prerequisite.projectId !== projectId
      || prerequisite.invalidation.status !== "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN"
      || typeof userId !== "string"
      || userId.trim() !== userId
      || userId.length === 0
      || userId.length > 200
    ) {
      throw new ProjectMutationWriteError(
        "Pipeline video invalidation admission must start from one unmaterialized owner-bound prerequisite.",
      );
    }

    const admissionKey = pipelineVideoDeliveryInvalidationAdmissionKeyV1({
      projectId,
      ownerId: userId,
      expectedRevision: prerequisite.expectedRevision,
      target: prerequisite.target,
    });
    const admissionId = `pipeline-video-invalidation_${admissionKey}`;
    const db = await getDatabase();
    let current = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!current) throw new ProjectNotFoundOrForbiddenError();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const beforeRevision = projectRevisionFor(current);
      const existing = findPipelineVideoDeliveryInvalidationAdmissionV1(
        current,
        admissionId,
      );
      if (existing) {
        if (
          existing.ownerId !== userId
          || existing.projectId !== projectId
          || !sameProjectRevisionV1(existing.beforeRevision, prerequisite.expectedRevision)
          || !sameProjectRevisionV1(existing.afterRevision, beforeRevision)
          || Date.now() >= new Date(existing.expiresAt).getTime()
        ) {
          throw new ProjectPipelineVideoDeliveryConflictError(
            beforeRevision,
            "INVALIDATION_UNVERIFIABLE",
          );
        }
        let materializedPrerequisite: PipelineVideoProjectDeliveryPrerequisiteV1;
        try {
          materializedPrerequisite = materializePipelineVideoProjectDeliveryPrerequisiteV1(
            prerequisite,
            existing,
          );
        } catch (error) {
          throw new ProjectMutationWriteError(
            "Pipeline video invalidation admission does not match its prerequisite: "
              + (error instanceof Error ? error.message : "UNKNOWN"),
          );
        }
        return {
          disposition: "ALREADY_ADMITTED",
          admission: structuredClone(existing),
          prerequisite: materializedPrerequisite,
          beforeRevision: structuredClone(existing.beforeRevision),
          afterRevision: structuredClone(existing.afterRevision),
        };
      }

      if (!sameProjectRevisionV1(prerequisite.expectedRevision, beforeRevision)) {
        throw new ProjectMutationConflictError(
          beforeRevision,
          "Pipeline video invalidation admission is stale. Reload before retrying.",
        );
      }

      assertPipelineVideoDeliveryTargetAndLocksAgainstCurrentV1(
        projectId,
        current,
        {
          expectedRevision: prerequisite.expectedRevision,
          target: {
            overlayId: prerequisite.target.overlayId,
            expectedAssetId: prerequisite.target.expectedAssetId,
          },
          prerequisite,
        },
        beforeRevision,
      );

      const recoverableAdmission = findRecoverablePipelineVideoDeliveryInvalidationAdmissionV1(
        current,
        projectId,
        userId,
        prerequisite.target,
        beforeRevision,
      );
      if (recoverableAdmission) {
        return {
          disposition: "ALREADY_PENDING",
          admission: structuredClone(recoverableAdmission),
          prerequisite: null,
          // No write occurred for this retry; both values remain the current
          // ProjectService revision rather than manufacturing a new fence.
          beforeRevision: structuredClone(beforeRevision),
          afterRevision: structuredClone(beforeRevision),
        };
      }

      const admittedAt = new Date();
      const expiresAt = new Date(
        admittedAt.getTime() + PIPELINE_VIDEO_DELIVERY_INVALIDATION_ADMISSION_TTL_MS_V1,
      );
      const unsignedAdmission = {
        required: true as const,
        status: "ADMITTED_ARTIFACT_CHAIN_PENDING" as const,
        admissionId,
        projectId,
        ownerId: userId,
        beforeRevision: structuredClone(beforeRevision),
        afterRevision: {
          schemaVersion: 1 as const,
          value: beforeRevision.value + 1,
          compatibilityUpdatedAt: admittedAt.toISOString(),
        },
        target: clonePipelineVideoCanonicalValueV1(prerequisite.target),
        affectedDerivativeClasses: ["RENDERED_PREVIEW", "DELIVERY_PROOF"] as const,
        admittedAt: admittedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      const admission: PipelineVideoDeliveryInvalidationAdmissionV1 = {
        ...unsignedAdmission,
        admissionHash: pipelineVideoDeliveryInvalidationAdmissionHashV1(unsignedAdmission),
      };
      assertPipelineVideoDeliveryInvalidationAdmissionV1(admission);
      const afterRevision = admission.afterRevision;
      const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
        {
          projectId,
          userId,
          "pipelineVideoDeliveryInvalidationAdmissionsV1.admissionId": { $ne: admissionId },
          ...projectRevisionPredicate(beforeRevision),
        },
        {
          $set: { updatedAt: admittedAt },
          $push: {
            pipelineVideoDeliveryInvalidationAdmissionsV1: {
              $each: [admission],
              $slice: -MAX_PIPELINE_VIDEO_DELIVERY_RECEIPTS_V1,
            },
          } as never,
          $inc: { projectRevision: 1 },
        },
      );
      if (result.matchedCount === 1) {
        if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
        this.publishMutationReceipt({
          schemaVersion: 1,
          projectId,
          revision: afterRevision,
          committedAt: admittedAt.toISOString(),
        });
        return {
          disposition: "ADMITTED",
          admission,
          prerequisite: materializePipelineVideoProjectDeliveryPrerequisiteV1(
            prerequisite,
            admission,
          ),
          beforeRevision: structuredClone(beforeRevision),
          afterRevision: structuredClone(afterRevision),
        };
      }

      const afterConflict = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!afterConflict) throw new ProjectNotFoundOrForbiddenError();
      current = afterConflict;
    }

    throw new ProjectMutationConflictError(
      projectRevisionFor(current),
      "Pipeline video invalidation admission lost the final compare-and-swap race.",
    );
  }

  /**
   * Convert a persisted ProjectService admission into one durable artifact
   * invalidation outbox item.  This boundary intentionally remains pending:
   * no caller may authorize delivery until each synchronous artifact owner
   * reports an exact fence through advancePipelineVideoArtifactInvalidationV1.
   */
  async enqueuePipelineVideoArtifactInvalidationV1(
    userId: string,
    projectId: string,
    admission: PipelineVideoDeliveryInvalidationAdmissionV1,
  ): Promise<ProjectPipelineVideoArtifactInvalidationResultV1> {
    try {
      assertPipelineVideoDeliveryInvalidationAdmissionV1(admission);
    } catch (error) {
      throw new ProjectMutationWriteError(
        "Pipeline video artifact invalidation admission is invalid: "
          + (error instanceof Error ? error.message : "UNKNOWN"),
      );
    }
    if (admission.ownerId !== userId || admission.projectId !== projectId) {
      throw new ProjectPipelineVideoDeliveryConflictError(
        admission.afterRevision,
        "INVALIDATION_UNVERIFIABLE",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    const persistedAdmission = findPipelineVideoDeliveryInvalidationAdmissionV1(
      project,
      admission.admissionId,
    );
    if (
      !persistedAdmission
      || persistedAdmission.admissionHash !== admission.admissionHash
      || !sameProjectRevisionV1(currentRevision, admission.afterRevision)
    ) {
      throw new ProjectPipelineVideoDeliveryConflictError(
        currentRevision,
        "INVALIDATION_UNVERIFIABLE",
      );
    }

    const receipt: ProjectArtifactInvalidationReceiptV1 =
      createProjectArtifactInvalidationReceiptV1({
        admissionId: admission.admissionId,
        admissionHash: admission.admissionHash,
        ownerId: userId,
        projectId,
        beforeRevision: admission.beforeRevision,
        afterRevision: admission.afterRevision,
        target: admission.target,
        affectedDerivativeClasses: admission.affectedDerivativeClasses,
      });
    assertProjectArtifactInvalidationReceiptV1(receipt);
    const outbox = createProjectArtifactInvalidationOutboxV1({ receipt });
    const collection = db.collection(
      PROJECT_ARTIFACT_INVALIDATION_OUTBOX_COLLECTION_V1,
    ) as unknown as ProjectArtifactInvalidationOutboxCollectionV1;
    return enqueueProjectArtifactInvalidationOutboxV1({ outbox, collection });
  }

  /**
   * Persist an owner-reported invalidation checkpoint with an outbox CAS.
   * ProjectService rechecks the admission and current revision before
   * accepting progress; a later project edit leaves the outbox pending.
   */
  async advancePipelineVideoArtifactInvalidationV1(
    userId: string,
    projectId: string,
    input: ProjectPipelineVideoArtifactInvalidationProgressInputV1,
  ): Promise<ProjectPipelineVideoArtifactInvalidationProgressResultV1> {
    if (
      typeof input.outboxId !== "string"
      || typeof input.receiptHash !== "string"
      || !Array.isArray(input.fences)
      || !Array.isArray(input.resolvedDerivativeClasses)
    ) {
      throw new ProjectMutationWriteError(
        "Pipeline video artifact invalidation progress is invalid.",
      );
    }
    const db = await getDatabase();
    const collection = db.collection(
      PROJECT_ARTIFACT_INVALIDATION_OUTBOX_COLLECTION_V1,
    ) as unknown as ProjectArtifactInvalidationOutboxCollectionV1;
    const stored = await collection.findOne({ _id: input.outboxId });
    if (!stored) {
      throw new ProjectMutationWriteError(
        "Pipeline video artifact invalidation outbox is missing.",
      );
    }
    assertProjectArtifactInvalidationOutboxV1(stored);
    const receipt = stored.receipt;
    if (
      receipt.ownerId !== userId
      || receipt.projectId !== projectId
      || receipt.receiptHash !== input.receiptHash
    ) {
      throw new ProjectPipelineVideoDeliveryConflictError(
        receipt.afterRevision,
        "INVALIDATION_UNVERIFIABLE",
      );
    }

    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    const persistedAdmission = findPipelineVideoDeliveryInvalidationAdmissionV1(
      project,
      receipt.admissionId,
    );
    if (
      !persistedAdmission
      || persistedAdmission.admissionHash !== receipt.admissionHash
      || !sameProjectRevisionV1(currentRevision, receipt.afterRevision)
    ) {
      throw new ProjectPipelineVideoDeliveryConflictError(
        currentRevision,
        "INVALIDATION_UNVERIFIABLE",
      );
    }

    const next = applyProjectArtifactInvalidationProgressV1({
      outbox: stored,
      fences: input.fences,
      resolvedDerivativeClasses: input.resolvedDerivativeClasses,
    });
    const disposition = next.outboxHash === stored.outboxHash
      ? "ALREADY_APPLIED" as const
      : await replaceProjectArtifactInvalidationOutboxV1({
          expected: stored,
          next,
          collection,
        });
    if (disposition === "CAS_LOST") {
      throw new ProjectMutationConflictError(
        currentRevision,
        "Pipeline video artifact invalidation progress lost its outbox CAS.",
      );
    }
    return { disposition, outbox: disposition === "ALREADY_APPLIED" ? stored : next };
  }

  /**
   * Replace exactly one previously identified generated-video overlay through
   * ProjectService. A delivery never rebinds by a broad asset query. The
   * producer prerequisite is re-derived against the current project and must
   * still be fresh before the one compare-and-swap write.
   */
  async commitPipelineVideoDeliveryV1(
    userId: string,
    projectId: string,
    input: ProjectPipelineVideoDeliveryCommandV1,
  ): Promise<ProjectPipelineVideoDeliveryResultV1> {
    assertProjectPipelineVideoDeliveryCommandV1(input);
    if (input.prerequisite.projectId !== projectId) {
      throw new ProjectMutationWriteError(
        "Pipeline video delivery prerequisite is bound to a different project.",
      );
    }
    const materialHash = pipelineVideoDeliveryMaterialHashV1(input);
    const canonicalTarget = clonePipelineVideoCanonicalValueV1({
      overlayId: input.target.overlayId,
      expectedAssetId: input.target.expectedAssetId,
    });
    const canonicalReplacement = clonePipelineVideoCanonicalValueV1(input.replacement);
    const db = await getDatabase();
    let current = (await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
    )) as Project | null;
    if (!current) throw new ProjectNotFoundOrForbiddenError();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const beforeRevision = projectRevisionFor(current);
      const targetOverlay = assertPipelineVideoDeliveryPrerequisiteAgainstCurrentV1(
        userId,
        projectId,
        current,
        input,
        beforeRevision,
      );
      // The prerequisite helper has already strictly validated and matched
      // the persisted pending admission; narrow it for this owner-level gate.
      const admission = input.prerequisite.invalidation as
        PipelineVideoDeliveryInvalidationAdmissionV1;
      if (admission.status === "ADMITTED_ARTIFACT_CHAIN_PENDING") {
        throw new ProjectPipelineVideoDeliveryConflictError(
          beforeRevision,
          "INVALIDATION_UNVERIFIABLE",
        );
      }
      const existing = findPipelineVideoDeliveryReceiptV1(current, input.deliveryId);
      if (existing) {
        if (existing.materialHash !== materialHash) {
          throw new ProjectMutationWriteError(
            "Pipeline video delivery identity was reused with different material.",
          );
        }
        return {
          disposition: "ALREADY_APPLIED",
          deliveryReceipt: structuredClone(existing),
        };
      }

      const rebase: ProjectPipelineVideoDeliveryRebaseV1 = "FRESH";

      const beforeFrameRange = overlayTimelineFrameRangeV1(targetOverlay);
      if (!beforeFrameRange) {
        throw new ProjectMutationWriteError(
          "Pipeline video delivery requires an exactly representable target timeline range.",
        );
      }

      const replacementOverlay = buildPipelineVideoReplacementOverlayV1(
        targetOverlay,
        canonicalReplacement,
        input.deliveryId,
        materialHash,
      );
      const afterFrameRange = overlayTimelineFrameRangeV1(replacementOverlay);
      if (!afterFrameRange) {
        throw new ProjectMutationWriteError(
          "Pipeline video delivery produced an unrepresentable target timeline range.",
        );
      }
      const unionFrameRange = unionTimelineFrameRangesV1(beforeFrameRange, afterFrameRange);
      if (!unionFrameRange) {
        throw new ProjectMutationWriteError(
          "Pipeline video delivery could not derive its exact affected timeline range.",
        );
      }

      const committedAt = new Date();
      const afterRevision: ProjectRevisionV1 = {
        schemaVersion: 1,
        value: beforeRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      };
      const mutationReceipt: ProjectMutationReceiptV1 = {
        schemaVersion: 1,
        projectId,
        revision: afterRevision,
        committedAt: committedAt.toISOString(),
      };
      const overlayRef = overlayReferenceForTimelineChangeV1(targetOverlay);
      const changedPaths = [
        "overlays",
        "pipelineVideoDeliveryReceipts",
        "timelineRangeChangeReceipts",
        "pipelineVideoDeliveryInvalidationAdmissionsV1",
      ] as const;
      const timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1 = {
        schemaVersion: 1,
        receiptId: `timeline-pipeline-video_${nanoid(18)}`,
        projectId,
        operation: "REPLACE_PIPELINE_VIDEO_DELIVERY",
        actorKind: "SYSTEM",
        coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
        fps: current.fps || 30,
        beforeProjectRevision: beforeRevision,
        afterProjectRevision: afterRevision,
        committedAt: committedAt.toISOString(),
        readFrameRangesBefore: [beforeFrameRange],
        writeFrameRangesBefore: [unionFrameRange],
        affectedFrameRangesAfter: [afterFrameRange],
        affectedOverlayRefs: [overlayRef],
        changedPaths,
        rangeObservation: "EXACT",
        overlayTemporalChange: {
          overlayRef,
          beforeFrameRange,
          afterFrameRange,
          unionFrameRange,
        },
        timelineCoordinateTransform: null,
        splitChildren: [],
        ripple: null,
        downstreamInvalidation: {
          status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
          affectedFrameRangesBefore: [unionFrameRange],
        },
      };
      const deliveryReceipt: ProjectPipelineVideoDeliveryReceiptV1 = {
        schemaVersion: 1,
        deliveryId: input.deliveryId,
        materialHash,
        prerequisiteHash: input.prerequisite.envelopeHash,
        target: canonicalTarget,
        invalidationAdmissionId: admission.admissionId,
        invalidationAdmissionHash: admission.admissionHash,
        replacementAssetId: canonicalReplacement.assetId,
        requestedRevision: structuredClone(input.expectedRevision),
        beforeRevision,
        afterRevision,
        mutationReceipt,
        timelineChangeReceipt,
        rebase,
        changedPaths,
        proof: {
          required: true,
          status: "UNVERIFIABLE",
          reason: "NO_RENDERED_VIDEO_PROOF",
        },
        committedAt: committedAt.toISOString(),
      };
      const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
        {
          projectId,
          userId,
          overlays: {
            $elemMatch: {
              id: canonicalTarget.overlayId,
              type: "video",
              assetId: canonicalTarget.expectedAssetId,
            },
          },
          "pipelineVideoDeliveryReceipts.deliveryId": { $ne: input.deliveryId },
          "pipelineVideoDeliveryInvalidationAdmissionsV1": {
            $elemMatch: {
              admissionId: admission.admissionId,
              admissionHash: admission.admissionHash,
              status: "ADMITTED_ARTIFACT_CHAIN_PENDING",
              ownerId: userId,
            },
          },
          ...projectRevisionPredicate(beforeRevision),
        },
        {
          $set: {
            "overlays.$[target]": replacementOverlay,
            updatedAt: committedAt,
          },
          $push: {
            pipelineVideoDeliveryReceipts: {
              $each: [deliveryReceipt],
              $slice: -MAX_PIPELINE_VIDEO_DELIVERY_RECEIPTS_V1,
            },
            timelineRangeChangeReceipts: {
              $each: [timelineChangeReceipt],
              $slice: -MAX_PIPELINE_VIDEO_DELIVERY_RECEIPTS_V1,
            },
          } as never,
          $pull: {
            pipelineVideoDeliveryInvalidationAdmissionsV1: {
              admissionId: admission.admissionId,
            },
          } as never,
          $inc: { projectRevision: 1 },
        },
        {
          arrayFilters: [{
            "target.id": canonicalTarget.overlayId,
            "target.type": "video",
            "target.assetId": canonicalTarget.expectedAssetId,
          }],
        },
      );
      if (result.matchedCount === 1) {
        if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
        this.publishMutationReceipt(mutationReceipt);
        return { disposition: "APPLIED", deliveryReceipt };
      }

      const afterConflict = (await db.collection(COLLECTIONS.PROJECTS).findOne(
        { projectId, userId },
      )) as Project | null;
      if (!afterConflict) throw new ProjectNotFoundOrForbiddenError();
      const replay = findPipelineVideoDeliveryReceiptV1(afterConflict, input.deliveryId);
      if (replay) {
        if (replay.materialHash !== materialHash) {
          throw new ProjectMutationWriteError(
            "Pipeline video delivery identity was reused with different material.",
          );
        }
        return { disposition: "ALREADY_APPLIED", deliveryReceipt: structuredClone(replay) };
      }
      const conflictRevision = projectRevisionFor(afterConflict);
      if (attempt === 0 && sameProjectRevisionV1(conflictRevision, beforeRevision)) {
        current = afterConflict;
        continue;
      }
      throw new ProjectPipelineVideoDeliveryConflictError(conflictRevision, "CAS_LOST");
    }

    throw new ProjectMutationWriteError(
      "Pipeline video delivery exhausted its bounded compare-and-swap attempts.",
    );
  }

  /**
   * Correct duration evidence from Video Analysis only when it still belongs
   * to one untouched initial source overlay. Unlike generated-video delivery,
   * this command never rebases: a concurrent editor change wins.
   */
  async commitVideoAnalysisDurationCorrectionV1(
    userId: string,
    projectId: string,
    input: ProjectVideoAnalysisDurationCorrectionCommandV1,
  ): Promise<ProjectVideoAnalysisDurationCorrectionResultV1> {
    assertProjectVideoAnalysisDurationCorrectionCommandV1(input);
    const materialHash = videoAnalysisDurationCorrectionMaterialHashV1(projectId, input);
    const correctionId = `video-analysis-duration_${materialHash}`;
    const db = await getDatabase();
    const current = (await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
    )) as Project | null;
    if (!current) throw new ProjectNotFoundOrForbiddenError();

    const existing = findVideoAnalysisDurationCorrectionReceiptV1(
      current,
      projectId,
      correctionId,
    );
    if (existing) {
      if (existing.materialHash !== materialHash) {
        throw new ProjectMutationWriteError(
          "Video Analysis duration correction identity was reused with different material.",
        );
      }
      return {
        disposition: "ALREADY_APPLIED",
        correctionReceipt: structuredClone(existing),
      };
    }

    const beforeRevision = projectRevisionFor(current);
    if (!sameProjectRevisionV1(input.expectedRevision, beforeRevision)) {
      throw new ProjectMutationConflictError(
        beforeRevision,
        "Video Analysis duration evidence is stale. Reload before correcting the timeline.",
      );
    }

    const eligibility = resolveVideoAnalysisDurationCorrectionTargetV1(
      current,
      input.assetId,
    );
    if ("reason" in eligibility) {
      return { disposition: "NOT_ELIGIBLE", reason: eligibility.reason };
    }
    if (!sameVideoAnalysisDurationCorrectionTargetV1(eligibility.target, input.target)) {
      return { disposition: "NOT_ELIGIBLE", reason: "TARGET_EXPECTATION_MISMATCH" };
    }
    if (!isProjectTimelineFpsV1(current.fps)) {
      return { disposition: "NOT_ELIGIBLE", reason: "PROJECT_FPS_INVALID" };
    }

    const correctedDurationInFrames = Math.round(
      (input.observedDurationMs / 1_000) * current.fps,
    );
    if (!Number.isSafeInteger(correctedDurationInFrames) || correctedDurationInFrames <= 0) {
      throw new ProjectMutationWriteError(
        "Video Analysis duration evidence cannot be represented in this project frame coordinate.",
      );
    }
    if (correctedDurationInFrames === input.target.expectedDurationInFrames) {
      return { disposition: "ALREADY_CURRENT", correctedDurationInFrames };
    }

    const overlaysWithTargetId = current.overlays.filter(
      (overlay) => overlay.id === input.target.overlayId,
    );
    if (overlaysWithTargetId.length !== 1) {
      return { disposition: "NOT_ELIGIBLE", reason: "TARGET_EXPECTATION_MISMATCH" };
    }
    const targetOverlay = overlaysWithTargetId[0];
    const beforeFrameRange = overlayTimelineFrameRangeV1(targetOverlay);
    if (!beforeFrameRange) {
      return { disposition: "NOT_ELIGIBLE", reason: "TARGET_EXPECTATION_MISMATCH" };
    }
    const correctedOverlay = withAtomicOverlayUpdateReceipt(
      targetOverlay,
      { durationInFrames: correctedDurationInFrames } as Partial<Overlay>,
      {
        source: "project-service-video-analysis-duration-correction",
        intent: "correct-initial-video-duration",
        reason: "Video Analysis corrected one verified initial source overlay through ProjectService",
      },
    );
    const afterFrameRange = overlayTimelineFrameRangeV1(correctedOverlay);
    const unionFrameRange = unionTimelineFrameRangesV1(
      beforeFrameRange,
      afterFrameRange,
    );
    if (!afterFrameRange || !unionFrameRange) {
      throw new ProjectMutationWriteError(
        "Video Analysis duration correction could not derive its exact local timeline effect.",
      );
    }

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: beforeRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    const overlayRef = overlayReferenceForTimelineChangeV1(targetOverlay);
    const changedPaths = [
      "durationInFrames",
      "overlays",
      "videoAnalysisDurationCorrectionReceipts",
      "timelineRangeChangeReceipts",
    ] as const;
    const timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1 = {
      schemaVersion: 1,
      receiptId: `timeline-video-analysis-duration_${nanoid(18)}`,
      projectId,
      operation: "CORRECT_VIDEO_ANALYSIS_DURATION",
      actorKind: "SYSTEM",
      coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
      fps: current.fps,
      beforeProjectRevision: beforeRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      readFrameRangesBefore: [beforeFrameRange],
      writeFrameRangesBefore: [unionFrameRange],
      affectedFrameRangesAfter: [afterFrameRange],
      affectedOverlayRefs: [overlayRef],
      changedPaths,
      rangeObservation: "EXACT",
      overlayTemporalChange: {
        overlayRef,
        beforeFrameRange,
        afterFrameRange,
        unionFrameRange,
      },
      timelineCoordinateTransform: null,
      splitChildren: [],
      ripple: null,
      downstreamInvalidation: {
        status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
        affectedFrameRangesBefore: [unionFrameRange],
      },
    };
    const correctionReceipt: ProjectVideoAnalysisDurationCorrectionReceiptV1 = {
      schemaVersion: 1,
      correctionId,
      materialHash,
      assetId: input.assetId,
      observedDurationMs: input.observedDurationMs,
      durationSource: input.durationSource,
      projectFps: current.fps,
      target: structuredClone(input.target),
      requestedRevision: structuredClone(input.expectedRevision),
      beforeRevision,
      afterRevision,
      mutationReceipt,
      timelineChangeReceipt,
      changedPaths,
      proof: {
        required: true,
        status: "UNVERIFIABLE",
        reason: "NO_RENDERED_VIDEO_PROOF",
      },
      committedAt: committedAt.toISOString(),
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        durationInFrames: beforeFrameRange.endFrame,
        overlays: {
          $elemMatch: {
            id: input.target.overlayId,
            type: "video",
            assetId: input.target.expectedAssetId,
            from: 0,
            durationInFrames: input.target.expectedDurationInFrames,
            $or: [
              { sourceStartFrame: { $exists: false } },
              { sourceStartFrame: 0 },
            ],
          },
        },
        "videoAnalysisDurationCorrectionReceipts.correctionId": { $ne: correctionId },
        ...projectRevisionPredicate(beforeRevision),
      },
      {
        $set: {
          durationInFrames: correctedDurationInFrames,
          "overlays.$[target]": correctedOverlay,
          updatedAt: committedAt,
        },
        $push: {
          videoAnalysisDurationCorrectionReceipts: {
            $each: [correctionReceipt],
            $slice: -MAX_VIDEO_ANALYSIS_DURATION_CORRECTION_RECEIPTS_V1,
          },
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -MAX_VIDEO_ANALYSIS_DURATION_CORRECTION_RECEIPTS_V1,
          },
        } as never,
        $inc: { projectRevision: 1 },
      },
      {
        arrayFilters: [{
          "target.id": input.target.overlayId,
          "target.type": "video",
          "target.assetId": input.target.expectedAssetId,
          "target.from": 0,
          "target.durationInFrames": input.target.expectedDurationInFrames,
        }],
      },
    );
    if (result.matchedCount === 1) {
      if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
      this.publishMutationReceipt(mutationReceipt);
      return { disposition: "APPLIED", correctionReceipt };
    }

    const afterConflict = (await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
    )) as Project | null;
    if (!afterConflict) throw new ProjectNotFoundOrForbiddenError();
    const replay = findVideoAnalysisDurationCorrectionReceiptV1(
      afterConflict,
      projectId,
      correctionId,
    );
    if (replay) {
      if (replay.materialHash !== materialHash) {
        throw new ProjectMutationWriteError(
          "Video Analysis duration correction identity was reused with different material.",
        );
      }
      return {
        disposition: "ALREADY_APPLIED",
        correctionReceipt: structuredClone(replay),
      };
    }
    const conflictRevision = projectRevisionFor(afterConflict);
    if (!sameProjectRevisionV1(beforeRevision, conflictRevision)) {
      throw new ProjectMutationConflictError(
        conflictRevision,
        "Video Analysis duration correction lost its exact compare-and-swap race.",
      );
    }
    const afterEligibility = resolveVideoAnalysisDurationCorrectionTargetV1(
      afterConflict,
      input.assetId,
    );
    if ("reason" in afterEligibility) {
      return { disposition: "NOT_ELIGIBLE", reason: afterEligibility.reason };
    }
    throw new ProjectMutationWriteError(
      "Video Analysis duration correction did not produce exactly one durable update.",
    );
  }

  /**
   * Persist one signed worker's low-quality observation. The mutation is
   * additive, so a stale worker snapshot can rebase only by preserving all
   * newer project state and appending the same job-bound warning once.
   */
  async recordPipelineVideoQualityWarningV1(
    userId: string,
    projectId: string,
    input: ProjectPipelineVideoQualityWarningCommandV1,
  ): Promise<ProjectPipelineVideoQualityWarningResultV1> {
    assertProjectPipelineVideoQualityWarningCommandV1(input);
    const warningId = pipelineVideoQualityWarningIdV1(projectId, input.jobId);
    const materialHash = pipelineVideoQualityWarningMaterialHashV1(input);
    const db = await getDatabase();
    let current = (await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
    )) as Project | null;
    if (!current) throw new ProjectNotFoundOrForbiddenError();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const existing = findPipelineVideoQualityWarningV1(current, projectId, warningId);
      if (existing) {
        if (existing.materialHash !== materialHash) {
          throw new ProjectMutationWriteError(
            "Pipeline video quality warning identity was reused with different material.",
          );
        }
        return { disposition: "ALREADY_APPLIED", qualityWarning: structuredClone(existing) };
      }

      const beforeRevision = projectRevisionFor(current);
      if (input.expectedRevision.value > beforeRevision.value) {
        throw new ProjectMutationConflictError(
          beforeRevision,
          "Pipeline video quality warning cannot be based on a future project revision.",
        );
      }
      const committedAt = new Date();
      const afterRevision: ProjectRevisionV1 = {
        schemaVersion: 1,
        value: beforeRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      };
      const mutationReceipt: ProjectMutationReceiptV1 = {
        schemaVersion: 1,
        projectId,
        revision: afterRevision,
        committedAt: committedAt.toISOString(),
      };
      const qualityWarning: ProjectPipelineVideoQualityWarningV1 = {
        schemaVersion: 1,
        warningId,
        materialHash,
        batchId: input.batchId,
        jobId: input.jobId,
        storyboardId: input.storyboardId,
        sceneIndex: input.sceneIndex,
        assetId: input.assetId,
        qualityScore: input.qualityScore,
        qualitySource: input.qualitySource,
        message: pipelineVideoQualityWarningMessageV1(input.sceneIndex, input.qualityScore),
        createdAt: committedAt,
        requestedRevision: structuredClone(input.expectedRevision),
        beforeRevision,
        afterRevision,
        mutationReceipt,
        rebase: sameProjectRevisionV1(input.expectedRevision, beforeRevision)
          ? "FRESH"
          : "SAFE_REBASED_ADDITIVE_WARNING",
        changedPaths: ["qualityWarnings"],
        proof: {
          required: false,
          status: null,
          reason: "DERIVED_ANALYSIS_WARNING_NOT_RENDERED_ACCEPTANCE_PROOF",
        },
        committedAt: committedAt.toISOString(),
      };
      const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
        {
          projectId,
          userId,
          "qualityWarnings.warningId": { $ne: warningId },
          ...projectRevisionPredicate(beforeRevision),
        },
        {
          $set: { updatedAt: committedAt },
          $push: { qualityWarnings: { $each: [qualityWarning] } } as never,
          $inc: { projectRevision: 1 },
        },
      );
      if (result.matchedCount === 1) {
        if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();
        this.publishMutationReceipt(mutationReceipt);
        return { disposition: "APPLIED", qualityWarning };
      }

      const afterConflict = (await db.collection(COLLECTIONS.PROJECTS).findOne(
        { projectId, userId },
      )) as Project | null;
      if (!afterConflict) throw new ProjectNotFoundOrForbiddenError();
      const replay = findPipelineVideoQualityWarningV1(afterConflict, projectId, warningId);
      if (replay) {
        if (replay.materialHash !== materialHash) {
          throw new ProjectMutationWriteError(
            "Pipeline video quality warning identity was reused with different material.",
          );
        }
        return { disposition: "ALREADY_APPLIED", qualityWarning: structuredClone(replay) };
      }
      if (attempt === 0) {
        current = afterConflict;
        continue;
      }
      throw new ProjectMutationConflictError(
        projectRevisionFor(afterConflict),
        "Pipeline video quality warning lost the final compare-and-swap race.",
      );
    }

    throw new ProjectMutationWriteError(
      "Pipeline video quality warning exhausted its bounded compare-and-swap attempts.",
    );
  }

  /**
   * Commit source-audio rights, any linked storyboard copies, and the project
   * timeline in one transaction. A stale project revision rolls back all
   * companion writes and returns no receipt.
   */
  async commitAudioRightsAttestation(
    userId: string,
    projectId: string,
    input: ProjectAudioRightsAttestationCommitV1,
  ): Promise<ProjectMutationReceiptV1 | null> {
    assertProjectRevision(input.expectedRevision);
    if (
      !(input.updatedAt instanceof Date)
      || Number.isNaN(input.updatedAt.getTime())
      || Object.keys(input.rightsByAssetId).length === 0
      || input.storyboardUpdates?.some((update) => (
        typeof update.storyboardId !== "string"
        || !update.storyboardId.trim()
        || !Array.isArray(update.scenes)
      ))
    ) {
      throw new ProjectMutationWriteError("Audio rights attestation input is invalid.");
    }

    const { client, db } = await connectToDatabase();
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const assetOperations = Object.entries(input.rightsByAssetId).map(
          ([assetId, audioRights]) => ({
            updateOne: {
              filter: {
                assetId,
                type: input.kind === "native-video" ? "video" : "audio",
                source: "user-upload",
                ...(input.kind === "uploaded-export-audio"
                  ? {
                      audioRights: { $exists: false },
                      musicRights: { $exists: false },
                    }
                  : {}),
                $or: [{ userId }, { projectId }],
              },
              update: {
                $set: {
                  audioRights,
                  rightsUpdatedAt: input.updatedAt,
                },
              },
            },
          }),
        );
        const assetResult = await db.collection(COLLECTIONS.MEDIA_ASSETS)
          .bulkWrite(assetOperations, { ordered: true, session });
        if (assetResult.matchedCount !== assetOperations.length) {
          throw new ProjectMutationWriteError(
            "One or more audio-rights source assets changed before the commit.",
          );
        }

        for (const storyboard of input.storyboardUpdates ?? []) {
          const result = await db.collection("storyboards").updateOne(
            { storyboardId: storyboard.storyboardId, userId, projectId },
            { $set: { scenes: storyboard.scenes, updatedAt: input.updatedAt } },
            { session },
          );
          if (result.matchedCount !== 1) {
            throw new ProjectMutationWriteError(
              "A linked storyboard changed before audio rights could be committed.",
            );
          }
        }

        const cleanOverlays = assetResolver.stripUrlsForLLM(input.overlays);
        const projectResult = await db.collection(COLLECTIONS.PROJECTS).updateOne(
          {
            projectId,
            userId,
            ...projectRevisionPredicate(input.expectedRevision),
          },
          {
            $set: { overlays: cleanOverlays, updatedAt: input.updatedAt },
            $inc: { projectRevision: 1 },
          },
          { session },
        );
        if (projectResult.matchedCount === 0) {
          throw new ProjectAudioRightsAttestationConflictError();
        }
        if (projectResult.modifiedCount !== 1) {
          throw new ProjectMutationWriteError();
        }
      });
    } catch (error) {
      if (error instanceof ProjectAudioRightsAttestationConflictError) {
        return null;
      }
      throw error;
    } finally {
      await session.endSession();
    }

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: input.expectedRevision.value + 1,
        compatibilityUpdatedAt: input.updatedAt.toISOString(),
      },
      committedAt: input.updatedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return receipt;
  }

  /**
   * Persist a form-owner-selected video speed ramp and its source-time
   * transform in one ProjectService CAS. The caller supplies only renderer
   * state and a project revision; ProjectService derives source identity and
   * timing evidence from the current media asset.
   */
  async applyVideoSpeedRampV1(
    userId: string,
    projectId: string,
    input: ProjectVideoSpeedRampCommandV1,
  ): Promise<ProjectVideoSpeedRampResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    if (!Number.isSafeInteger(input.overlayId)
      || input.overlayId < 0) {
      throw new ProjectMutationWriteError(
        "A video speed-ramp write requires an explicit actor and stable numeric overlay ID.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
      {
        projection: {
          overlays: 1,
          fps: 1,
          projectRevision: 1,
          updatedAt: 1,
        },
      },
    )) as unknown as Pick<
      Project,
      "overlays" | "fps" | "projectRevision" | "updatedAt"
    > | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const currentOverlay = project.overlays?.find(
      (overlay) => overlay.id === input.overlayId,
    );
    if (!currentOverlay || currentOverlay.type !== "video") {
      throw new ProjectMutationWriteError(
        `Video overlay ${input.overlayId} was not found in project ${projectId}.`,
      );
    }
    const assetId = (currentOverlay as { assetId?: unknown }).assetId;
    if (typeof assetId !== "string" || !assetId.trim()) {
      throw new ProjectMutationWriteError(
        "A video speed ramp requires one stable media asset identity.",
      );
    }
    const sourceStartFrame = projectVideoSourceStartFrameV1(currentOverlay);
    const validatedState = assertProjectVideoSpeedRampStateV1({
      durationInFrames: currentOverlay.durationInFrames,
      speedCurve: input.speedCurve,
      keyframeTracks: input.keyframeTracks,
    });

    const asset = await assetResolver.getAsset(assetId, userId);
    if (!asset) {
      return {
        disposition: "SAFE_STOP",
        reason: "SOURCE_ASSET_NOT_FOUND",
        currentRevision,
      };
    }
    const sourceBinding = resolveVerifiedVideoSourceTimeBindingV1(asset);
    if (!sourceBinding) {
      return {
        disposition: "SAFE_STOP",
        reason: "SOURCE_TIME_EVIDENCE_INCOMPLETE",
        currentRevision,
      };
    }
    if (sourceBinding.assetId !== assetId) {
      throw new ProjectMutationWriteError(
        "The verified source-time binding does not match the overlay asset.",
      );
    }
    const rateCompatibility = classifyVerifiedVideoSourceRateCompatibilityV1(
      sourceBinding,
      project.fps,
    );
    if (rateCompatibility.disposition === "UNSUPPORTED") {
      return {
        disposition: "SAFE_STOP",
        reason: rateCompatibility.reason === "VFR_INDEX_REQUIRED"
          ? "SOURCE_EVENT_REBIND_UNSUPPORTED"
          : rateCompatibility.reason,
        currentRevision,
      };
    }

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    let sourceTimeTransform: ProjectVideoSourceTimeTransformV1;
    try {
      sourceTimeTransform = createProjectVideoSourceTimeTransformV1({
        projectId,
        overlayId: input.overlayId,
        beforeProjectRevision: currentRevision,
        afterProjectRevision: afterRevision,
        projectFps: project.fps,
        timelineStartFrame: currentOverlay.from,
        sourceStartFrame,
        durationInFrames: currentOverlay.durationInFrames,
        speedCurve: validatedState.speedCurve,
        sourceBinding,
      });
    } catch (error) {
      if (error instanceof Error
        && error.message === "VIDEO_SOURCE_TIME_TRANSFORM_SOURCE_HANDLES_INSUFFICIENT") {
        return {
          disposition: "SAFE_STOP",
          reason: "SOURCE_HANDLES_INSUFFICIENT",
          currentRevision,
        };
      }
      throw error;
    }

    const updatedOverlay = withAtomicOverlayUpdateReceipt(
      currentOverlay,
      {
        speedCurve: validatedState.speedCurve,
        keyframeTracks: validatedState.keyframeTracks,
      } as Partial<Overlay>,
      {
        source: "project-service-apply-video-speed-ramp-v1",
        intent: "apply-video-speed-ramp",
        reason: "verified video retime persisted through ProjectService",
      },
    );
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-video-retime_${nanoid(18)}`,
      projectId,
      operation: "APPLY_VIDEO_SPEED_RAMP",
      actorKind: input.actorKind,
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlay: currentOverlay,
      afterOverlay: updatedOverlay,
      sourceTimeTransform,
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": input.overlayId,
        ...projectRevisionPredicate(currentRevision),
      },
      {
        $set: {
          "overlays.$[elem]": updatedOverlay,
          updatedAt: committedAt,
        },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
      },
      { arrayFilters: [{ "elem.id": input.overlayId }] },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return {
      disposition: "APPLIED",
      mutationReceipt,
      timelineChangeReceipt,
      sourceTimeTransform,
    };
  }

  /**
   * Atomically preserve one isolated video's complete source range while
   * shortening its project duration and rippling later non-overlapping state.
   * This bounded owner refuses mixed-track reconform instead of guessing it.
   */
  async applyVideoSourceRangeRetimeV1(
    userId: string,
    projectId: string,
    input: ProjectVideoSourceRangeRetimeCommandV1,
  ): Promise<ProjectVideoSourceRangeRetimeResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    if (!Number.isSafeInteger(input.overlayId)
      || input.overlayId < 0
      || !Number.isFinite(input.playbackRate)
      || input.playbackRate <= 1
      || input.playbackRate > 4) {
      throw new ProjectMutationWriteError(
        "A source-range retime requires an explicit actor, stable overlay ID and playback rate above 1x through 4x.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before retrying.",
      );
    }

    const currentOverlay = project.overlays?.find(
      (overlay) => overlay.id === input.overlayId,
    );
    if (!currentOverlay || currentOverlay.type !== "video") {
      return {
        disposition: "SAFE_STOP",
        reason: "TARGET_VIDEO_NOT_FOUND",
        currentRevision,
      };
    }
    const assetId = currentOverlay.assetId;
    if (typeof assetId !== "string" || !assetId.trim()) {
      throw new ProjectMutationWriteError(
        "A source-range retime requires one stable media asset identity.",
      );
    }
    const sourceStartFrame = projectVideoSourceStartFrameV1(currentOverlay);
    const explicitSourceEndFrame = currentOverlay.sourceEndFrame;
    if (explicitSourceEndFrame !== undefined
      && (!Number.isSafeInteger(explicitSourceEndFrame)
        || explicitSourceEndFrame <= sourceStartFrame)) {
      return {
        disposition: "SAFE_STOP",
        reason: "SOURCE_RANGE_MISMATCH",
        currentRevision,
      };
    }
    const sourceEndFrameExclusive = explicitSourceEndFrame
      ?? sourceStartFrame + currentOverlay.durationInFrames;

    const asset = await assetResolver.getAsset(assetId, userId);
    if (!asset) {
      return {
        disposition: "SAFE_STOP",
        reason: "SOURCE_ASSET_NOT_FOUND",
        currentRevision,
      };
    }
    const sourceBinding = resolveVerifiedVideoSourceTimeBindingV1(asset);
    if (!sourceBinding) {
      return {
        disposition: "SAFE_STOP",
        reason: "SOURCE_TIME_EVIDENCE_INCOMPLETE",
        currentRevision,
      };
    }
    if (sourceBinding.assetId !== assetId) {
      throw new ProjectMutationWriteError(
        "The verified source-time binding does not match the overlay asset.",
      );
    }
    const rateCompatibility = classifyVerifiedVideoSourceRateCompatibilityV1(
      sourceBinding,
      project.fps,
    );
    if (rateCompatibility.disposition === "UNSUPPORTED") {
      return {
        disposition: "SAFE_STOP",
        reason: rateCompatibility.reason === "VFR_INDEX_REQUIRED"
          ? "SOURCE_EVENT_REBIND_UNSUPPORTED"
          : rateCompatibility.reason,
        currentRevision,
      };
    }
    const totalSourceFrames = Number(BigInt(sourceBinding.totalSourceFrameCount));
    if (!Number.isSafeInteger(totalSourceFrames)
      || sourceEndFrameExclusive > totalSourceFrames) {
      return {
        disposition: "SAFE_STOP",
        reason: "SOURCE_HANDLES_INSUFFICIENT",
        currentRevision,
      };
    }

    const retime = retimeIsolatedVideoSourceRangeV1({
      overlays: project.overlays || [],
      projectDurationInFrames: project.durationInFrames,
      overlayId: input.overlayId,
      verifiedSourceStartFrame: sourceStartFrame,
      verifiedSourceEndFrameExclusive: sourceEndFrameExclusive,
      playbackRate: input.playbackRate,
    });
    if (retime.disposition === "SAFE_STOP") {
      return {
        disposition: "SAFE_STOP",
        reason: retime.reason,
        currentRevision,
      };
    }

    const activeOverlappingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => frameRangesOverlapHalfOpenV1(
      lock.frameRange,
      {
        startFrame: retime.effect.beforeTimelineRange.startFrame,
        endFrame: retime.effect.beforeProjectDurationInFrames,
      },
    ));
    if (activeOverlappingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        activeOverlappingLocks.map((lock) => lock.lockId),
        "An active timeline range lock overlaps the source-range retime ripple tail.",
      );
    }

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const afterTarget = retime.overlays.find(
      (overlay) => overlay.id === input.overlayId,
    );
    if (!afterTarget
      || afterTarget.type !== "video"
      || !Array.isArray(afterTarget.speedCurve)) {
      throw new ProjectMutationWriteError(
        "The source-range retime owner did not return its target renderer state.",
      );
    }
    const validatedState = assertProjectVideoSpeedRampStateV1({
      durationInFrames: afterTarget.durationInFrames,
      speedCurve: afterTarget.speedCurve,
      keyframeTracks: afterTarget.keyframeTracks ?? [],
    });
    const sourceTimeTransform = createProjectVideoSourceTimeTransformV1({
      projectId,
      overlayId: input.overlayId,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      projectFps: project.fps,
      timelineStartFrame: afterTarget.from,
      sourceStartFrame,
      sourceEndFrameExclusive,
      durationInFrames: afterTarget.durationInFrames,
      speedCurve: validatedState.speedCurve,
      sourceBinding,
    });
    const affectedOverlayRefs = (project.overlays || [])
      .filter((overlay) => retime.effect.affectedOverlayIds.includes(overlay.id))
      .map((overlay) => overlayReferenceForTimelineChangeV1(overlay))
      .sort();
    const writeRangeBefore = {
      startFrame: retime.effect.beforeTimelineRange.startFrame,
      endFrame: retime.effect.beforeProjectDurationInFrames,
    };
    const timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1 = {
      schemaVersion: 1,
      receiptId: `timeline-video-source-retime_${nanoid(18)}`,
      projectId,
      operation: "RETIME_VIDEO_SOURCE_RANGE",
      actorKind: input.actorKind,
      coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      readFrameRangesBefore: [writeRangeBefore],
      writeFrameRangesBefore: [writeRangeBefore],
      affectedFrameRangesAfter: [{
        startFrame: retime.effect.afterTimelineRange.startFrame,
        endFrame: retime.effect.afterProjectDurationInFrames,
      }],
      affectedOverlayRefs,
      changedPaths: ["overlays", "durationInFrames", "timelineRangeChangeReceipts"],
      rangeObservation: "EXACT",
      overlayTemporalChange: {
        overlayRef: overlayReferenceForTimelineChangeV1(currentOverlay),
        beforeFrameRange: retime.effect.beforeTimelineRange,
        afterFrameRange: retime.effect.afterTimelineRange,
        unionFrameRange: retime.effect.beforeTimelineRange,
      },
      timelineCoordinateTransform: null,
      sourceTimeTransform,
      splitChildren: [],
      ripple: {
        kind: "RETIME_AND_SHIFT_LEFT",
        retimedBeforeFrameRange: retime.effect.beforeTimelineRange,
        retimedAfterFrameRange: retime.effect.afterTimelineRange,
        shiftedBeforeFrameRange: retime.effect.shiftedBeforeRange,
        shiftedAfterFrameRange: retime.effect.shiftedAfterRange,
        deltaFrames: retime.effect.deltaFrames,
      },
      downstreamInvalidation: {
        status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
        affectedFrameRangesBefore: [writeRangeBefore],
      },
    };
    const persistedOverlays = stampPersistedOverlays(
      assetResolver.stripUrlsForLLM(retime.overlays),
      "project-service-video-source-range-retime-v1",
    );
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(currentRevision),
      },
      {
        $set: {
          overlays: persistedOverlays,
          durationInFrames: retime.effect.afterProjectDurationInFrames,
          updatedAt: committedAt,
        },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return {
      disposition: "APPLIED",
      mutationReceipt,
      timelineChangeReceipt,
      sourceRangeRetimeEffect: retime.effect,
      sourceTimeTransform,
    };
  }

  /**
   * Rebind a source event only while both the project revision and the media
   * owner's source-time binding still match the transform that was issued by
   * the retime write.
   */
  async rebindVideoSourceEventAfterRetimeV1(
    userId: string,
    projectId: string,
    input: Readonly<{
      sourceTimeTransform: ProjectVideoSourceTimeTransformV1;
      sourcePresentationTimestampTicks: string;
    }>,
  ): Promise<ProjectVideoSourceEventRebindResultV1> {
    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
      {
        projection: {
          overlays: 1,
          projectRevision: 1,
          updatedAt: 1,
          timelineRangeChangeReceipts: 1,
        },
      },
    )) as unknown as Pick<
      Project,
      "overlays" | "projectRevision" | "updatedAt" | "timelineRangeChangeReceipts"
    > | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(
      input.sourceTimeTransform.afterProjectRevision,
      currentRevision,
    )) {
      return { disposition: "UNVERIFIABLE", reason: "PROJECT_REVISION_STALE" };
    }
    const matchingReceipts = (project.timelineRangeChangeReceipts ?? []).filter(
      (receipt) => (receipt.operation === "APPLY_VIDEO_SPEED_RAMP"
          || receipt.operation === "RETIME_VIDEO_SOURCE_RANGE")
        && receipt.projectId === projectId
        && receipt.sourceTimeTransform?.transformSha256
          === input.sourceTimeTransform.transformSha256
        && sameProjectRevisionV1(receipt.afterProjectRevision, currentRevision),
    );
    if (matchingReceipts.length !== 1
      || !matchingReceipts[0]!.sourceTimeTransform) {
      return {
        disposition: "UNVERIFIABLE",
        reason: "SOURCE_TIME_TRANSFORM_NOT_CURRENT",
      };
    }
    // Resolve the transform from ProjectService-owned history. The caller's
    // hash is an opaque lookup key, not permission to supply executable math.
    const transform = matchingReceipts[0]!.sourceTimeTransform;
    const currentOverlay = project.overlays.find(
      (overlay) => String(overlay.id) === transform.overlayId,
    );
    const currentAssetId = (currentOverlay as { assetId?: unknown } | undefined)?.assetId;
    if (typeof currentAssetId !== "string" || currentAssetId !== transform.assetId) {
      return { disposition: "UNVERIFIABLE", reason: "OVERLAY_SOURCE_CHANGED" };
    }
    const asset = await assetResolver.getAsset(currentAssetId, userId);
    if (!asset) {
      return { disposition: "UNVERIFIABLE", reason: "SOURCE_ASSET_NOT_FOUND" };
    }
    const currentSourceBinding = resolveVerifiedVideoSourceTimeBindingV1(asset);
    if (!currentSourceBinding) {
      return {
        disposition: "UNVERIFIABLE",
        reason: "SOURCE_TIME_EVIDENCE_INCOMPLETE",
      };
    }
    return rebindSourcePresentationTimestampV1(
      transform,
      currentSourceBinding,
      input.sourcePresentationTimestampTicks,
    );
  }

  async updateOverlayAtRevisionV1(
    userId: string,
    projectId: string,
    input: ProjectOverlayUpdateCommandV1,
  ): Promise<ProjectDirectOverlayMutationResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    assertProjectOverlayIdentityV1(input.overlayId, "update");
    if (!isPlainRecord(input.updates)
      || Object.prototype.hasOwnProperty.call(input.updates, "id")
      || Object.prototype.hasOwnProperty.call(input.updates, "type")) {
      throw new ProjectMutationWriteError(
        "Overlay update cannot replace the overlay identity or family.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (!isProjectTimelineFpsV1(project.fps)) {
      throw new ProjectMutationWriteError(
        "Overlay update requires a supported project frame rate.",
      );
    }
    const currentOverlay = project.overlays?.find(
      (overlay) => (overlay as { id?: unknown }).id === input.overlayId,
    );
    if (!currentOverlay) {
      throw new ProjectMutationWriteError(
        `Overlay ${input.overlayId} was not found in project ${projectId}.`,
      );
    }
    const updatedOverlay = withAtomicOverlayUpdateReceipt(
      currentOverlay,
      input.updates,
      {
        source: "project-service-update-overlay-at-revision-v1",
        intent: `update-${currentOverlay.type}`,
        reason: "overlay mutated through a caller-bound ProjectService command",
      },
    );
    const beforeFrameRange = overlayTimelineFrameRangeV1(currentOverlay);
    const afterFrameRange = overlayTimelineFrameRangeV1(updatedOverlay);
    if (!beforeFrameRange || !afterFrameRange) {
      throw new ProjectMutationWriteError(
        "Overlay update requires exact positive before and after project-frame ranges.",
      );
    }
    const writeFrameRange = unionTimelineFrameRangesV1(
      beforeFrameRange,
      afterFrameRange,
    )!;
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before updating the overlay.",
      );
    }
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => frameRangesOverlapHalfOpenV1(
      lock.frameRange,
      writeFrameRange,
    ));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps the overlay update.",
      );
    }

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-overlay_${nanoid(18)}`,
      projectId,
      operation: "UPDATE_OVERLAY",
      actorKind: input.actorKind,
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlay: currentOverlay,
      afterOverlay: updatedOverlay,
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": input.overlayId,
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $set: {
          "overlays.$[elem]": updatedOverlay,
          updatedAt: committedAt,
        },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
      },
      { arrayFilters: [{ "elem.id": input.overlayId }] },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return { mutationReceipt, timelineChangeReceipt };
  }

  /**
   * Replace only the caption family at one exact project revision. The caller
   * may submit the complete ordered overlay array so caption z-order remains
   * expressible, but every non-caption entry must match the stored sequence and
   * canonical value. ProjectService reuses the stored non-caption objects in
   * the write, so this command cannot smuggle an unrelated track mutation.
   */
  async replaceCaptionFamilyAtRevisionV1(
    userId: string,
    projectId: string,
    input: ProjectCaptionFamilyReplaceCommandV1,
  ): Promise<ProjectCaptionFamilyReplaceResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    if (
      !Array.isArray(input.candidateOverlays)
      || input.candidateOverlays.length > 100_000
    ) {
      throw new ProjectMutationWriteError(
        "Caption-family replacement requires a bounded overlay array.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (!isProjectTimelineFpsV1(project.fps)) {
      throw new ProjectMutationWriteError(
        "Caption-family replacement requires a supported project frame rate.",
      );
    }
    if (!Array.isArray(project.overlays) || project.overlays.length > 100_000) {
      throw new ProjectMutationWriteError(
        "Stored overlay state is invalid or exceeds the caption-family owner bound.",
      );
    }

    const currentOverlays = project.overlays;
    const cleanCandidateOverlays = assetResolver.stripUrlsForLLM([
      ...input.candidateOverlays,
    ]);
    const comparableCurrentOverlays = assetResolver.stripUrlsForLLM([
      ...currentOverlays,
    ]);
    const currentByIdentity = indexOverlaySetForFamilyReplacementV1(
      currentOverlays,
      "stored",
    );
    indexOverlaySetForFamilyReplacementV1(cleanCandidateOverlays, "candidate");

    const currentNonCaption = comparableCurrentOverlays.filter(
      (overlay) => overlay.type !== "caption",
    );
    const candidateNonCaption = cleanCandidateOverlays.filter(
      (overlay) => overlay.type !== "caption",
    );
    if (
      canonicalProjectMutationValueHashV1(currentNonCaption)
      !== canonicalProjectMutationValueHashV1(candidateNonCaption)
    ) {
      throw new ProjectMutationWriteError(
        "Caption-family replacement cannot alter or reorder non-caption overlays.",
      );
    }

    const beforeCaptions = currentOverlays.filter(
      (overlay) => overlay.type === "caption",
    );
    const candidateCaptions = cleanCandidateOverlays.filter(
      (overlay) => overlay.type === "caption",
    );
    const beforeFrameRanges = captionFamilyFrameRangesV1(beforeCaptions, "stored");
    const afterFrameRanges = captionFamilyFrameRangesV1(candidateCaptions, "candidate");
    const persistedOverlays = cleanCandidateOverlays.map((overlay) => {
      if (overlay.type === "caption") {
        return ensureLiveAtomicOverlayReceipt(overlay, {
          source: "project-service-replace-caption-family-at-revision-v1",
          intent: "persist-caption",
          reason: "caption family persisted through a caller-bound ProjectService command",
        });
      }
      const stored = currentByIdentity.get(overlayIdentityKeyForFamilyReplacementV1(overlay));
      if (!stored) {
        throw new ProjectMutationWriteError(
          "Caption-family replacement lost a stored non-caption overlay identity.",
        );
      }
      return stored;
    });

    if (
      canonicalProjectMutationValueHashV1(currentOverlays)
      === canonicalProjectMutationValueHashV1(persistedOverlays)
    ) {
      return {
        disposition: "UNCHANGED",
        mutationReceipt: null,
        timelineChangeReceipt: null,
      };
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before replacing captions.",
      );
    }
    const writeFrameRanges = canonicalTimelineFrameRangesV1([
      ...beforeFrameRanges,
      ...afterFrameRanges,
    ]);
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => writeFrameRanges.some((frameRange) => (
      frameRangesOverlapHalfOpenV1(lock.frameRange, frameRange)
    )));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps the caption-family replacement.",
      );
    }

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createCaptionFamilyTimelineChangeReceiptV1({
      receiptId: `timeline-caption-family_${nanoid(18)}`,
      projectId,
      actorKind: input.actorKind,
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeCaptions,
      afterCaptions: persistedOverlays.filter((overlay) => overlay.type === "caption"),
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $set: { overlays: persistedOverlays, updatedAt: committedAt },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return {
      disposition: "APPLIED",
      mutationReceipt,
      timelineChangeReceipt,
    };
  }

  /**
   * Replace the complete background-music bed at one exact project revision.
   * Music coverage and assignment/change evidence commit with the overlays;
   * all non-BGM overlays are verified and reused from stored state. Cut timing
   * is deliberately excluded and belongs to the beat-sync mutation owner.
   */
  async replaceBackgroundMusicAtRevisionV1(
    userId: string,
    projectId: string,
    input: ProjectBackgroundMusicReplaceCommandV1,
  ): Promise<ProjectBackgroundMusicReplaceResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    if (!Array.isArray(input.candidateOverlays) || input.candidateOverlays.length > 100_000) {
      throw new ProjectMutationWriteError(
        "Background-music replacement requires a bounded overlay array.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (!isProjectTimelineFpsV1(project.fps) || !Number.isSafeInteger(project.durationInFrames)
      || project.durationInFrames <= 0) {
      throw new ProjectMutationWriteError(
        "Background-music replacement requires a supported project timeline.",
      );
    }
    if (!Array.isArray(project.overlays) || project.overlays.length > 100_000) {
      throw new ProjectMutationWriteError(
        "Stored overlay state is invalid or exceeds the background-music owner bound.",
      );
    }

    const currentOverlays = project.overlays;
    const cleanCandidateOverlays = assetResolver.stripUrlsForLLM([
      ...input.candidateOverlays,
    ]);
    const comparableCurrentOverlays = assetResolver.stripUrlsForLLM([
      ...currentOverlays,
    ]);
    const currentByIdentity = indexOverlaySetForFamilyReplacementV1(
      currentOverlays,
      "stored",
    );
    indexOverlaySetForFamilyReplacementV1(cleanCandidateOverlays, "candidate");

    const currentNonBgm = comparableCurrentOverlays.filter(
      (overlay) => !isBackgroundMusicOverlayV1(overlay),
    );
    const candidateNonBgm = cleanCandidateOverlays.filter(
      (overlay) => !isBackgroundMusicOverlayV1(overlay),
    );
    if (
      canonicalProjectMutationValueHashV1(currentNonBgm)
      !== canonicalProjectMutationValueHashV1(candidateNonBgm)
    ) {
      throw new ProjectMutationWriteError(
        "Background-music replacement cannot alter or reorder non-BGM overlays.",
      );
    }

    const beforeBgm = currentOverlays.filter(isBackgroundMusicOverlayV1);
    const candidateBgm = cleanCandidateOverlays.filter(isBackgroundMusicOverlayV1);
    const preparedEvidence = prepareBackgroundMusicEvidenceV1(
      project,
      input,
      candidateBgm,
    );
    const persistedBgmByIdentity = new Map(candidateBgm.map((overlay) => [
      overlayIdentityKeyForFamilyReplacementV1(overlay),
      ensureLiveAtomicOverlayReceipt(overlay, {
        source: "project-service-replace-background-music-at-revision-v1",
        intent: "persist-background-music",
        reason: "background-music family persisted with rights and coverage evidence",
      }),
    ]));
    const persistedOverlays = cleanCandidateOverlays.map((overlay) => {
      const identity = overlayIdentityKeyForFamilyReplacementV1(overlay);
      if (isBackgroundMusicOverlayV1(overlay)) {
        const persistedBgm = persistedBgmByIdentity.get(identity);
        if (!persistedBgm) {
          throw new ProjectMutationWriteError(
            "Background-music replacement lost a validated BGM identity.",
          );
        }
        return persistedBgm;
      }
      const stored = currentByIdentity.get(identity);
      if (!stored) {
        throw new ProjectMutationWriteError(
          "Background-music replacement lost a stored non-BGM identity.",
        );
      }
      return stored;
    });

    const evidenceUnchanged = Object.entries(preparedEvidence.setFields).every(
      ([path, value]) => sameCanonicalProjectMutationValueV1(
        readProjectDottedValueV1(project, path),
        value,
      ),
    );
    if (
      evidenceUnchanged
      && sameCanonicalProjectMutationValueV1(currentOverlays, persistedOverlays)
    ) {
      return {
        disposition: "UNCHANGED",
        mutationReceipt: null,
        timelineChangeReceipt: null,
      };
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before replacing music.",
      );
    }
    const beforeFrameRanges = overlayFamilyFrameRangesV1(beforeBgm, "stored BGM");
    const afterBgm = persistedOverlays.filter(isBackgroundMusicOverlayV1);
    const afterFrameRanges = overlayFamilyFrameRangesV1(afterBgm, "candidate BGM");
    const writeFrameRanges = canonicalTimelineFrameRangesV1([
      ...beforeFrameRanges,
      ...afterFrameRanges,
    ]);
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => writeFrameRanges.some((frameRange) => (
      frameRangesOverlapHalfOpenV1(lock.frameRange, frameRange)
    )));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps the background-music replacement.",
      );
    }

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createOverlayFamilyTimelineChangeReceiptV1({
      receiptId: `timeline-background-music_${nanoid(18)}`,
      projectId,
      operation: "REPLACE_BACKGROUND_MUSIC",
      actorKind: input.actorKind,
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlays: beforeBgm,
      afterOverlays: afterBgm,
      changedPaths: [
        "overlays",
        ...Object.keys(preparedEvidence.setFields),
        "timelineRangeChangeReceipts",
      ],
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $set: {
          ...preparedEvidence.setFields,
          overlays: persistedOverlays,
          updatedAt: committedAt,
        },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return {
      disposition: "APPLIED",
      mutationReceipt,
      timelineChangeReceipt,
    };
  }

  /**
   * Align existing visual cut boundaries to current, rights-bound music beat
   * evidence. The caller supplies intent only: this owner reloads project and
   * asset evidence, recomputes the physical form, enforces locks, and commits
   * the exact result under one project-revision compare-and-swap.
   */
  async alignCutsToBeatsAtRevisionV1(
    userId: string,
    projectId: string,
    input: ProjectBeatSyncCommandV1,
  ): Promise<ProjectBeatSyncResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    if (!["all", "downbeats", "strong"].includes(input.beatFilter)
      || typeof input.strengthThreshold !== "number"
      || !Number.isFinite(input.strengthThreshold)
      || input.strengthThreshold < 0
      || input.strengthThreshold > 1
      || ![
        "persisted-beat-grid",
        "cached-beat-analysis",
        "beat-analysis-route",
      ].includes(input.evidenceSource)) {
      throw new ProjectMutationWriteError(
        "Beat-sync requires a supported filter, evidence source, and strength threshold.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (!isProjectTimelineFpsV1(project.fps)
      || !Number.isSafeInteger(project.durationInFrames)
      || project.durationInFrames <= 0
      || !Array.isArray(project.overlays)
      || project.overlays.length > 100_000) {
      throw new ProjectMutationWriteError(
        "Beat-sync requires a bounded project with a supported frame timeline.",
      );
    }

    const currentOverlays = project.overlays;
    const audioOverlay = currentOverlays.find((overlay) => (
      overlay.type === "sound"
      && String(overlay.id) === String(input.audioOverlayId)
    ));
    const audioAssetId = audioOverlay?.assetId;
    if (!audioOverlay || !isBoundedNonEmptyStringV1(audioAssetId, 500)) {
      throw new ProjectMutationWriteError(
        "Beat-sync requires one current sound overlay with a durable asset identity.",
      );
    }
    const audioShape = audioOverlay as Overlay & {
      beatGrid?: unknown;
      metadata?: unknown;
      audioRights?: unknown;
      musicRights?: unknown;
    };
    const audioRights = audioShape.musicRights ?? audioShape.audioRights;
    const rightsIssue = getAudioRightsContractIssue(audioRights);
    if (rightsIssue || !isPlainRecord(audioRights) || audioRights.mediaRole !== "music") {
      throw new ProjectMutationWriteError(
        "Beat-sync requires valid music-role rights evidence: "
          + (rightsIssue ?? "MUSIC_ROLE_REQUIRED"),
      );
    }
    if (input.targetOverlayId !== undefined && !currentOverlays.some((overlay) => (
      overlay.type === "video"
      && String(overlay.id) === String(input.targetOverlayId)
    ))) {
      throw new ProjectMutationWriteError(
        "Beat-sync target must be a current video overlay.",
      );
    }

    const mediaAssets = db.collection(COLLECTIONS.MEDIA_ASSETS);
    const audioAsset = await mediaAssets.findOne({ assetId: audioAssetId, userId });
    if (!audioAsset || !["audio", "video"].includes(String(audioAsset.type))) {
      throw new ProjectMutationWriteError(
        "Beat-sync audio evidence is not bound to a current owned media asset.",
      );
    }
    const metadata = isPlainRecord(audioShape.metadata) ? audioShape.metadata : {};
    const rawSourceEvidence = input.evidenceSource === "persisted-beat-grid"
      ? audioShape.beatGrid ?? metadata.beatGrid
      : audioAsset.beatAnalysis;
    let sourceBeatEvidence: Record<string, unknown>;
    try {
      sourceBeatEvidence = clonePipelineAudioCanonicalValueV1(
        rawSourceEvidence,
      ) as Record<string, unknown>;
    } catch (error) {
      throw new ProjectMutationWriteError(
        "Beat-sync evidence is not canonical: "
          + (error instanceof Error ? error.message : "INVALID_BEAT_EVIDENCE"),
      );
    }
    if (!isPlainRecord(sourceBeatEvidence)
      || !Array.isArray(sourceBeatEvidence.beats)
      || sourceBeatEvidence.beats.length === 0
      || sourceBeatEvidence.beats.length > 100_000) {
      throw new ProjectMutationWriteError(
        "Beat-sync requires one bounded current beat-evidence array.",
      );
    }

    const visualAssetIds = [...new Set(currentOverlays
      .filter((overlay) => overlay.type === "video"
        && isBoundedNonEmptyStringV1(overlay.assetId, 500))
      .map((overlay) => String(overlay.assetId)))];
    if (visualAssetIds.length > 10_000) {
      throw new ProjectMutationWriteError(
        "Beat-sync visual source set exceeds the supported owner bound.",
      );
    }
    const sourceDurationFramesByAssetId: Record<string, number> = {};
    for (const assetId of visualAssetIds) {
      const asset = await mediaAssets.findOne({ assetId, userId });
      const durationSeconds = asset?.duration;
      if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
        && durationSeconds > 0) {
        sourceDurationFramesByAssetId[assetId] = Math.round(
          durationSeconds * project.fps,
        );
      }
    }

    const resolution = resolveBeatSyncMutationV1({
      overlays: currentOverlays,
      fps: project.fps,
      audioAssetId,
      sourceBeatEvidence,
      beatFilter: input.beatFilter,
      strengthThreshold: input.strengthThreshold,
      ...(input.targetOverlayId === undefined
        ? {}
        : { targetOverlayId: input.targetOverlayId }),
      sourceDurationFramesByAssetId,
    });
    const resolutionSummary: ProjectBeatSyncResolutionSummaryV1 = {
      sourceBeatCount: resolution.sourceBeatCount,
      timelineBeatCount: resolution.timelineBeatCount,
      alignment: resolution.alignment,
    };
    const unchangedReason = resolution.sourceBeatCount === 0
      ? "MISSING_LICENSED_BEATS" as const
      : resolution.timelineBeatCount === 0
        ? "BEATS_OUTSIDE_ACTIVE_MUSIC" as const
        : resolution.alignment.snappedCount === 0
          ? "NO_SAFE_BOUNDARY_ALIGNMENT" as const
          : null;
    if (unchangedReason) {
      return {
        disposition: "UNCHANGED",
        reason: unchangedReason,
        resolution: resolutionSummary,
        mutationReceipt: null,
        timelineChangeReceipt: null,
      };
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before beat-sync.",
      );
    }

    const affectedIdentityKeys = new Set<string>();
    for (const change of resolution.alignment.changes) {
      affectedIdentityKeys.add(`id:${String(change.clipAId)}`);
      affectedIdentityKeys.add(`id:${String(change.clipBId)}`);
      for (const transitionId of change.transitionOverlayIds) {
        affectedIdentityKeys.add(`id:${String(transitionId)}`);
      }
    }
    const persistedOverlays = resolution.candidateOverlays.map((candidate, index) => {
      const stored = currentOverlays[index];
      if (!stored || String(stored.id) !== String(candidate.id)) {
        throw new ProjectMutationWriteError(
          "Beat-sync form changed overlay identity or ordering.",
        );
      }
      if (!affectedIdentityKeys.has(`id:${String(candidate.id)}`)) return stored;
      return ensureLiveAtomicOverlayReceipt(candidate, {
        source: "project-service-align-cuts-to-beats-v1",
        intent: "align-existing-cut-boundary",
        reason: "rights-bound beat evidence and source handles validated",
      });
    });
    const writeFrameRanges = canonicalTimelineFrameRangesV1(
      resolution.alignment.changes.map((change) => ({
        startFrame: Math.max(0, Math.min(change.originalFrame, change.alignedFrame) - 1),
        endFrame: Math.max(change.originalFrame, change.alignedFrame) + 2,
      })),
    );
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => writeFrameRanges.some((frameRange) => (
      frameRangesOverlapHalfOpenV1(lock.frameRange, frameRange)
    )));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps a beat-synced cut boundary.",
      );
    }

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const affectedBefore = currentOverlays.filter((overlay) => (
      affectedIdentityKeys.has(`id:${String(overlay.id)}`)
    ));
    const affectedAfter = persistedOverlays.filter((overlay) => (
      affectedIdentityKeys.has(`id:${String(overlay.id)}`)
    ));
    const beatSyncReceipt = {
      version: "project-beat-sync-v1",
      evidenceSource: input.evidenceSource,
      sourceEvidenceHash: canonicalProjectMutationValueHashV1(sourceBeatEvidence),
      audioOverlayId: input.audioOverlayId,
      audioAssetId,
      beatFilter: input.beatFilter,
      strengthThreshold: input.strengthThreshold,
      ...(input.targetOverlayId === undefined
        ? {}
        : { targetOverlayId: input.targetOverlayId }),
      sourceDurationFramesByAssetId,
      sourceBeatCount: resolution.sourceBeatCount,
      timelineBeatCount: resolution.timelineBeatCount,
      changes: resolution.alignment.changes,
      rejections: resolution.alignment.rejections.slice(0, 100),
      alignedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createOverlayFamilyTimelineChangeReceiptV1({
      receiptId: `timeline-beat-sync_${nanoid(18)}`,
      projectId,
      operation: "ALIGN_CUTS_TO_BEATS",
      actorKind: input.actorKind,
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlays: affectedBefore,
      afterOverlays: affectedAfter,
      changedPaths: ["overlays", "latestBeatSync", "timelineRangeChangeReceipts"],
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $set: {
          overlays: persistedOverlays,
          latestBeatSync: beatSyncReceipt,
          updatedAt: committedAt,
        },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return {
      disposition: "APPLIED",
      resolution: resolutionSummary,
      mutationReceipt,
      timelineChangeReceipt,
    };
  }

  /**
   * Recompute the project duration from the current canonical overlay state.
   * It deliberately carries no caller-supplied project snapshot: this is a
   * derived correction, not a generic timeline mutation or a safe rebase of
   * another caller's intent.
   */
  async reconcileProjectDurationFromOverlaysV1(
    userId: string,
    projectId: string,
    input: ProjectDurationReconciliationCommandV1,
  ): Promise<ProjectDurationReconciliationResultV1> {
    if (
      !isPlainRecord(input)
      || Object.keys(input).some((key) => key !== "actorKind")
      || typeof input.actorKind !== "string"
    ) {
      throw new ProjectMutationWriteError(
        "Project duration reconciliation input is invalid.",
      );
    }
    assertProjectTimelineMutationActorKindV1(input.actorKind);

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();

    const beforeRevision = projectRevisionFor(project);
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        beforeRevision,
        "The project is locked by an active Director mutation. Reload before reconciling duration.",
      );
    }
    if (!isProjectTimelineFpsV1(project.fps)) {
      return {
        disposition: "NOT_ELIGIBLE",
        reason: "PROJECT_FPS_INVALID",
        currentRevision: beforeRevision,
      };
    }
    if (
      !Number.isSafeInteger(project.durationInFrames)
      || project.durationInFrames < 0
    ) {
      return {
        disposition: "NOT_ELIGIBLE",
        reason: "PROJECT_DURATION_INVALID",
        currentRevision: beforeRevision,
      };
    }
    if (!Array.isArray(project.overlays)) {
      return {
        disposition: "NOT_ELIGIBLE",
        reason: "OVERLAY_TIMING_UNREPRESENTABLE",
        currentRevision: beforeRevision,
      };
    }

    const overlayRanges = project.overlays.map(overlayTimelineFrameRangeV1);
    if (overlayRanges.some((range) => range === null)) {
      return {
        disposition: "NOT_ELIGIBLE",
        reason: "OVERLAY_TIMING_UNREPRESENTABLE",
        currentRevision: beforeRevision,
      };
    }
    const reconciledDurationInFrames = overlayRanges.reduce(
      (maximum, range) => Math.max(maximum, range!.endFrame),
      0,
    );
    if (reconciledDurationInFrames === project.durationInFrames) {
      return {
        disposition: "ALREADY_CURRENT",
        durationInFrames: reconciledDurationInFrames,
        currentRevision: beforeRevision,
      };
    }

    const readEndFrame = Math.max(
      project.durationInFrames,
      reconciledDurationInFrames,
    );
    const boundaryChangeRange = assertTimelineFrameRangeV1(
      Math.min(project.durationInFrames, reconciledDurationInFrames),
      readEndFrame,
      "Project duration reconciliation could not derive its changed timeline boundary.",
    );
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: beforeRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1 = {
      schemaVersion: 1,
      receiptId: `timeline-duration-reconcile_${nanoid(18)}`,
      projectId,
      operation: "RECONCILE_PROJECT_DURATION",
      actorKind: input.actorKind,
      coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
      fps: project.fps,
      beforeProjectRevision: beforeRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      readFrameRangesBefore: readEndFrame > 0
        ? [{ startFrame: 0, endFrame: readEndFrame }]
        : [],
      writeFrameRangesBefore: [boundaryChangeRange],
      affectedFrameRangesAfter: reconciledDurationInFrames > 0
        ? [{ startFrame: 0, endFrame: reconciledDurationInFrames }]
        : [],
      affectedOverlayRefs: [],
      changedPaths: ["durationInFrames", "timelineRangeChangeReceipts"],
      rangeObservation: "EXACT",
      overlayTemporalChange: null,
      timelineCoordinateTransform: null,
      splitChildren: [],
      ripple: null,
      downstreamInvalidation: {
        status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
        affectedFrameRangesBefore: [boundaryChangeRange],
      },
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(beforeRevision),
      },
      {
        $set: {
          durationInFrames: reconciledDurationInFrames,
          updatedAt: committedAt,
        },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const latest = (await db.collection(COLLECTIONS.PROJECTS).findOne({
        projectId,
        userId,
      })) as Project | null;
      if (!latest) throw new ProjectNotFoundOrForbiddenError();
      throw new ProjectMutationConflictError(projectRevisionFor(latest));
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    this.publishMutationReceipt(mutationReceipt);
    return {
      disposition: "APPLIED",
      durationInFrames: reconciledDurationInFrames,
      mutationReceipt,
      timelineChangeReceipt,
    };
  }

  /** Compatibility tombstone. Generic project updates have no write authority. */
  async updateProject(
    _userId: string,
    _projectId: string,
    _updates: Record<string, unknown>,
  ): Promise<void> {
    throw new ProjectMutationWriteError(
      "Generic project updates are disabled; use a ProjectService command boundary.",
    );
  }

  async deleteOverlayAtRevisionV1(
    userId: string,
    projectId: string,
    input: ProjectOverlayDeleteCommandV1,
  ): Promise<ProjectDirectOverlayMutationResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    assertProjectOverlayIdentityV1(input.overlayId, "deletion");

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (!isProjectTimelineFpsV1(project.fps)) {
      throw new ProjectMutationWriteError(
        "Overlay deletion requires a supported project frame rate.",
      );
    }
    const currentOverlay = project.overlays?.find(
      (overlay) => (overlay as { id?: unknown }).id === input.overlayId,
    );
    if (!currentOverlay) {
      throw new ProjectMutationWriteError(
        `Overlay ${input.overlayId} was not found in project ${projectId}.`,
      );
    }
    const writeFrameRange = overlayTimelineFrameRangeV1(currentOverlay);
    if (!writeFrameRange) {
      throw new ProjectMutationWriteError(
        "Overlay deletion requires an exact positive project-frame range.",
      );
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before deleting the overlay.",
      );
    }
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => frameRangesOverlapHalfOpenV1(
      lock.frameRange,
      writeFrameRange,
    ));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps the overlay deletion.",
      );
    }

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-overlay-delete_${nanoid(18)}`,
      projectId,
      operation: "DELETE_OVERLAY",
      actorKind: input.actorKind,
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlay: currentOverlay,
      afterOverlay: null,
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": input.overlayId,
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $pull: { overlays: { id: input.overlayId } } as any,
        $set: { updatedAt: committedAt },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          },
        } as never,
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return { mutationReceipt, timelineChangeReceipt };
  }

  async applyAutoEditAssemblyV1(
    userId: string,
    projectId: string,
    input: ProjectAutoEditAssemblyCommandV1,
  ): Promise<ProjectAutoEditAssemblyResultV1> {
    assertProjectRevision(input.expectedRevision);
    assertProjectTimelineMutationActorKindV1(input.actorKind);
    assertProjectOverlayIdentityV1(input.sourceOverlayId, "update");
    if (!Array.isArray(input.cuts) || input.cuts.length < 1 || input.cuts.length > 10_000) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly requires between one and 10,000 exact source cuts.",
      );
    }
    const clipIds = input.cuts.map((cut) => cut.clipId);
    for (const cut of input.cuts) {
      assertProjectOverlayIdentityV1(cut.clipId, "update");
      if (!Number.isSafeInteger(cut.sourceStartFrame)
        || !Number.isSafeInteger(cut.sourceEndFrame)
        || cut.sourceStartFrame < 0
        || cut.sourceEndFrame <= cut.sourceStartFrame) {
        throw new ProjectMutationWriteError(
          "Auto-edit assembly cuts require exact positive half-open source-frame ranges.",
        );
      }
    }
    if (new Set(clipIds.map((id) => `${typeof id}:${String(id)}`)).size !== clipIds.length
      || clipIds.some((id) => id === input.sourceOverlayId)) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly clip identities must be unique and distinct from the source overlay.",
      );
    }

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentRevision = projectRevisionFor(project);
    if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
    if (!isProjectTimelineFpsV1(project.fps)
      || !Number.isSafeInteger(project.durationInFrames)
      || project.durationInFrames < 1
      || !Array.isArray(project.overlays)) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly requires an exact supported project timeline.",
      );
    }
    const sourceOverlay = project.overlays.find(
      (overlay) => (overlay as { id?: unknown }).id === input.sourceOverlayId,
    );
    if (!sourceOverlay || sourceOverlay.type !== "video") {
      throw new ProjectMutationWriteError(
        `Auto-edit source video ${String(input.sourceOverlayId)} was not found.`,
      );
    }
    const sourceBeforeFrameRange = overlayTimelineFrameRangeV1(sourceOverlay);
    if (!sourceBeforeFrameRange || sourceBeforeFrameRange.endFrame > project.durationInFrames) {
      throw new ProjectMutationWriteError(
        "Auto-edit source video requires an exact in-bounds project-frame range.",
      );
    }
    const sourceStartFrame = projectVideoSourceStartFrameV1(sourceOverlay);
    const sourceEndFrame = sourceStartFrame + sourceOverlay.durationInFrames;
    if (input.cuts.some((cut) => (
      cut.sourceStartFrame < sourceStartFrame
      || cut.sourceEndFrame > sourceEndFrame
    ))) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly requested source frames outside the exposed source handles.",
      );
    }

    const existingIdentityKeys = new Set(project.overlays.map((overlay) => (
      `${typeof (overlay as { id?: unknown }).id}:${String((overlay as { id?: unknown }).id)}`
    )));
    if (clipIds.some((id) => existingIdentityKeys.has(`${typeof id}:${String(id)}`))) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly clip identity collides with an existing overlay.",
      );
    }
    const sourceIdentity = String(input.sourceOverlayId);
    const otherOverlayRanges = project.overlays
      .filter((overlay) => overlay !== sourceOverlay)
      .map((overlay) => ({ overlay, range: overlayTimelineFrameRangeV1(overlay) }));
    if (otherOverlayRanges.some(({ range }) => !range)) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly cannot safely ripple an overlay with unknown timing.",
      );
    }
    if (otherOverlayRanges.some(({ overlay }) => {
      const candidate = overlay as unknown as Record<string, unknown>;
      return [candidate.sourceVideoId, candidate.clipAId, candidate.clipBId]
        .some((value) => value !== undefined && String(value) === sourceIdentity);
    })) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly is blocked while another overlay depends on the source video.",
      );
    }
    if (otherOverlayRanges.some(({ range }) => (
      frameRangesOverlapHalfOpenV1(range!, sourceBeforeFrameRange)
    ))) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly is blocked by another overlay that overlaps the source range.",
      );
    }
    if (hasActiveDirectorMutationLeaseV1(project)) {
      throw new ProjectMutationConflictError(
        currentRevision,
        "The project is locked by an active Director mutation. Reload before applying auto-edit.",
      );
    }

    const totalDurationInFrames = input.cuts.reduce(
      (sum, cut) => sum + (cut.sourceEndFrame - cut.sourceStartFrame),
      0,
    );
    const assemblyAfterFrameRange: TimelineFrameRangeV1 = {
      startFrame: sourceBeforeFrameRange.startFrame,
      endFrame: sourceBeforeFrameRange.startFrame + totalDurationInFrames,
    };
    const deltaFrames = totalDurationInFrames
      - (sourceBeforeFrameRange.endFrame - sourceBeforeFrameRange.startFrame);
    const afterDurationInFrames = project.durationInFrames + deltaFrames;
    if (!Number.isSafeInteger(afterDurationInFrames) || afterDurationInFrames < 1) {
      throw new ProjectMutationWriteError(
        "Auto-edit assembly produced an invalid project duration.",
      );
    }
    const writeFrameRange: TimelineFrameRangeV1 = {
      startFrame: sourceBeforeFrameRange.startFrame,
      endFrame: project.durationInFrames,
    };
    const blockingLocks = activeTimelineRangeCutLocksV1(
      readTimelineRangeCutLocksV1(project),
      new Date(),
    ).filter((lock) => frameRangesOverlapHalfOpenV1(lock.frameRange, writeFrameRange));
    if (blockingLocks.length > 0) {
      throw new ProjectTimelineRangeCutLockConflictError(
        currentRevision,
        [...new Set(blockingLocks.map((lock) => lock.lockId))].sort(),
        "An active timeline range lock overlaps the auto-edit ripple range.",
      );
    }

    let nextTimelineFrame = sourceBeforeFrameRange.startFrame;
    const assembledOverlays = input.cuts.map((cut) => {
      const durationInFrames = cut.sourceEndFrame - cut.sourceStartFrame;
      const next = withAtomicOverlayUpdateReceipt(
        sourceOverlay,
        {
          id: cut.clipId,
          from: nextTimelineFrame,
          durationInFrames,
          sourceStartFrame: cut.sourceStartFrame,
          sourceEndFrame: cut.sourceEndFrame,
          videoStartTime: cut.sourceStartFrame,
          metadata: {
            ...((sourceOverlay as unknown as Record<string, any>).metadata ?? {}),
            autoEditAssembly: {
              sourceOverlayId: input.sourceOverlayId,
              sourceStartFrame: cut.sourceStartFrame,
              sourceEndFrame: cut.sourceEndFrame,
            },
          },
        } as Partial<Overlay>,
        {
          source: "project-service-auto-edit-assembly-v1",
          intent: "materialize-auto-edit-cut",
          reason: "source cut materialized by one caller-bound atomic assembly",
        },
      );
      nextTimelineFrame += durationInFrames;
      return next;
    });
    const shiftedOverlays: Overlay[] = [];
    const nextOverlays = project.overlays.flatMap((overlay) => {
      if (overlay === sourceOverlay) return assembledOverlays;
      const range = overlayTimelineFrameRangeV1(overlay)!;
      if (range.startFrame < sourceBeforeFrameRange.endFrame) return [overlay];
      const shifted = withAtomicOverlayUpdateReceipt(
        overlay,
        { from: overlay.from + deltaFrames },
        {
          source: "project-service-auto-edit-assembly-v1",
          intent: "ripple-overlay-after-auto-edit",
          reason: "later overlay shifted by the exact auto-edit assembly delta",
        },
      );
      shiftedOverlays.push(shifted);
      return [shifted];
    });
    const cleanOverlays = stampPersistedOverlays(
      assetResolver.stripUrlsForLLM(nextOverlays),
      "project-service-auto-edit-assembly-v1",
    );
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: currentRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const shiftedBeforeFrameRange = otherOverlayRanges.some(
      ({ range }) => range!.startFrame >= sourceBeforeFrameRange.endFrame,
    ) ? {
        startFrame: sourceBeforeFrameRange.endFrame,
        endFrame: project.durationInFrames,
      } : null;
    const shiftedAfterFrameRange = shiftedBeforeFrameRange ? {
      startFrame: assemblyAfterFrameRange.endFrame,
      endFrame: afterDurationInFrames,
    } : null;
    const affectedOverlayRefs = [
      overlayReferenceForTimelineChangeV1(sourceOverlay),
      ...assembledOverlays.map(overlayReferenceForTimelineChangeV1),
      ...shiftedOverlays.map(overlayReferenceForTimelineChangeV1),
    ];
    const timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1 = {
      schemaVersion: 1,
      receiptId: `timeline-auto-edit_${nanoid(18)}`,
      projectId,
      operation: "AUTO_EDIT_ASSEMBLY",
      actorKind: input.actorKind,
      coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
      fps: project.fps,
      beforeProjectRevision: currentRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      readFrameRangesBefore: [writeFrameRange],
      writeFrameRangesBefore: [writeFrameRange],
      affectedFrameRangesAfter: [{
        startFrame: assemblyAfterFrameRange.startFrame,
        endFrame: afterDurationInFrames,
      }],
      affectedOverlayRefs: [...new Set(affectedOverlayRefs)],
      changedPaths: ["overlays", "durationInFrames", "timelineRangeChangeReceipts"],
      rangeObservation: "EXACT",
      overlayTemporalChange: null,
      timelineCoordinateTransform: null,
      sourceTimeTransform: null,
      splitChildren: [],
      ripple: {
        kind: "REPLACE_SOURCE_WITH_ASSEMBLY",
        sourceBeforeFrameRange,
        assemblyAfterFrameRange,
        shiftedBeforeFrameRange,
        shiftedAfterFrameRange,
        deltaFrames,
      },
      downstreamInvalidation: {
        status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
        affectedFrameRangesBefore: [writeFrameRange],
      },
    };
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": input.sourceOverlayId,
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $set: {
          overlays: cleanOverlays,
          durationInFrames: afterDurationInFrames,
          updatedAt: committedAt,
        },
        $push: {
          timelineRangeChangeReceipts: {
            $each: [timelineChangeReceipt],
            $slice: -200,
          } as never,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return {
      clipIds,
      clipsCreated: clipIds.length,
      totalDurationInFrames,
      mutationReceipt,
      timelineChangeReceipt,
    };
  }
}

function stampPersistedOverlays(
  overlays: Overlay[],
  source: string,
): Overlay[] {
  return overlays.map((overlay) =>
    ensureAtomicOverlayReceipt(overlay, {
      source,
      intent: `persist-${overlay.type}`,
      reason: "overlay persisted in project state",
    }),
  );
}

function projectRevisionFor(
  project: Pick<Project, "projectRevision" | "updatedAt">,
): ProjectRevisionV1 {
  const revision = readProjectRevisionV1(project);
  if (!revision) throw new ProjectMutationWriteError();
  return revision;
}

function sameProjectRevisionV1(
  left: ProjectRevisionV1,
  right: ProjectRevisionV1,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function assertProjectPipelineAudioDeliveryCommandV1(
  input: ProjectPipelineAudioDeliveryCommandV1,
): void {
  assertProjectRevision(input.expectedRevision);
  if (
    !/^audio-delivery_[A-Za-z0-9_-]{18}$/.test(input.deliveryId)
    || !/^[a-f0-9]{64}$/.test(input.planningTimelineBindingHash)
    || (input.kind !== "BGM" && input.kind !== "SFX")
    || (input.outcome !== "ATTACHED" && input.outcome !== "SKIPPED" && input.outcome !== "FAILED")
    || !Array.isArray(input.overlays)
    || !Array.isArray(input.warnings ?? [])
    || !Array.isArray(input.beatFrames ?? [])
  ) {
    throw new ProjectMutationWriteError("Pipeline audio delivery input is invalid.");
  }
  if (
    input.warnings?.some((warning) => !isPlainRecord(warning))
    || input.beatFrames?.some((beat) => (
      !Number.isSafeInteger(beat.frame)
      || beat.frame < 0
      || typeof beat.isDownbeat !== "boolean"
    ))
  ) {
    throw new ProjectMutationWriteError("Pipeline audio delivery evidence is invalid.");
  }
  const overlayIds = input.overlays.map((overlay) => String(overlay.id));
  if (
    new Set(overlayIds).size !== overlayIds.length
    || input.overlays.some((overlay) => (
      !isPipelineAudioOverlayForKindV1(overlay, input.kind)
      || typeof (overlay as { assetId?: unknown }).assetId !== "string"
      || !(overlay as { assetId?: string }).assetId?.trim()
    ))
    || (input.outcome === "ATTACHED" && input.overlays.length === 0)
    || (input.outcome !== "ATTACHED" && input.overlays.length !== 0)
    || (input.kind === "SFX" && (
      input.musicCoveragePlan !== undefined
      || (input.beatFrames?.length ?? 0) > 0
    ))
    || (input.kind === "BGM"
      && input.outcome === "ATTACHED"
      && input.musicCoveragePlan === undefined)
  ) {
    throw new ProjectMutationWriteError("Pipeline audio delivery material is invalid.");
  }
  try {
    if (input.musicCoveragePlan !== undefined) {
      clonePipelineAudioCanonicalValueV1(input.musicCoveragePlan);
    }
    for (const warning of input.warnings ?? []) {
      clonePipelineAudioCanonicalValueV1(warning);
    }
  } catch {
    throw new ProjectMutationWriteError("Pipeline audio delivery material is not canonical JSON.");
  }
}

function findPipelineAudioDeliveryReceiptV1(
  project: Pick<Project, "pipelineAudioDeliveryReceipts">,
  deliveryId: string,
): ProjectPipelineAudioDeliveryReceiptV1 | null {
  const receipts = project.pipelineAudioDeliveryReceipts;
  if (receipts === undefined) return null;
  if (!Array.isArray(receipts)) {
    throw new ProjectMutationWriteError("Pipeline audio delivery receipt history is invalid.");
  }
  const matching = receipts.filter((receipt) => receipt?.deliveryId === deliveryId);
  if (matching.length > 1) {
    throw new ProjectMutationWriteError("Pipeline audio delivery identity is not unique.");
  }
  return matching[0] ?? null;
}

function pipelineAudioDeliveryChangedPathsV1(
  input: ProjectPipelineAudioDeliveryCommandV1,
  warningCount: number,
  hasMusicCoveragePlan: boolean,
): string[] {
  const paths = ["pipelineAudioDeliveryReceipts"];
  if (input.outcome === "ATTACHED") paths.push("overlays");
  if (warningCount > 0) paths.push("pipelineWarnings");
  if (hasMusicCoveragePlan) {
    paths.push("musicCoveragePlan", "intelligence.audio.musicCoveragePlan");
  }
  return paths;
}

type PipelineVideoDeliveryTargetValidationInputV1 = Pick<
  ProjectPipelineVideoDeliveryCommandV1,
  "expectedRevision" | "target" | "prerequisite"
>;

function assertPipelineVideoDeliveryTargetAndLocksAgainstCurrentV1(
  projectId: string,
  current: Project,
  input: PipelineVideoDeliveryTargetValidationInputV1,
  currentRevision: ProjectRevisionV1,
): Overlay {
  const prerequisite = input.prerequisite;
  if (
    prerequisite.projectId !== projectId
    || prerequisite.projectId !== current.projectId
    || prerequisite.expectedRevision.schemaVersion !== input.expectedRevision.schemaVersion
    || prerequisite.expectedRevision.value !== input.expectedRevision.value
    || prerequisite.expectedRevision.compatibilityUpdatedAt
      !== input.expectedRevision.compatibilityUpdatedAt
  ) {
    throw new ProjectPipelineVideoDeliveryConflictError(currentRevision, "WRONG_PROJECT");
  }
  if (!sameProjectRevisionV1(input.expectedRevision, currentRevision)) {
    throw new ProjectPipelineVideoDeliveryConflictError(currentRevision, "STALE_REVISION");
  }
  if (
    prerequisite.target.overlayId !== input.target.overlayId
    || prerequisite.target.expectedAssetId !== input.target.expectedAssetId
    || prerequisite.source.expectedAssetId !== input.target.expectedAssetId
  ) {
    throw new ProjectPipelineVideoDeliveryConflictError(currentRevision, "SOURCE_EVIDENCE_MISMATCH");
  }

  const targetOverlay = current.overlays?.find(
    (overlay) => overlay.id === input.target.overlayId,
  );
  assertPipelineVideoDeliveryTargetV1(
    targetOverlay,
    input.target.expectedAssetId,
    currentRevision,
  );
  const beforeFrameRange = overlayTimelineFrameRangeV1(targetOverlay);
  if (!beforeFrameRange) {
    throw new ProjectMutationWriteError(
      "Pipeline video delivery requires an exactly representable target timeline range.",
    );
  }
  const expectedFrameRange = pipelineVideoDeliveryExactFrameRangeV1({
    from: prerequisite.target.exactFrameRange.startFrame,
    durationInFrames: prerequisite.target.exactFrameRange.endFrame
      - prerequisite.target.exactFrameRange.startFrame,
  });
  if (!sameTimelineFrameRangeV1(beforeFrameRange, expectedFrameRange)) {
    throw new ProjectPipelineVideoDeliveryConflictError(currentRevision, "TARGET_RANGE_CHANGED");
  }
  if (
    Number.isSafeInteger(current.durationInFrames)
    && current.durationInFrames > 0
    && beforeFrameRange.endFrame > current.durationInFrames
  ) {
    throw new ProjectPipelineVideoDeliveryConflictError(currentRevision, "TARGET_RANGE_CHANGED");
  }

  const targetFingerprint = pipelineVideoDeliveryTargetFingerprintV1(targetOverlay);
  if (
    targetFingerprint !== prerequisite.target.targetFingerprint
    || prerequisite.source.sourceFingerprint !== targetFingerprint
  ) {
    throw new ProjectPipelineVideoDeliveryConflictError(
      currentRevision,
      "TARGET_FINGERPRINT_CHANGED",
    );
  }

  if (hasActiveDirectorMutationLeaseV1(current)) {
    throw new ProjectPipelineVideoDeliveryConflictError(currentRevision, "DIRECTOR_LEASE_ACTIVE");
  }
  const activeCutLocks = activeTimelineRangeCutLocksV1(
    readTimelineRangeCutLocksV1(current),
    new Date(),
  );
  const overlappingCutLocks = activeCutLocks.filter((lock) => (
    frameRangesOverlapHalfOpenV1(lock.frameRange, beforeFrameRange)
  ));
  if (overlappingCutLocks.length > 0) {
    throw new ProjectPipelineVideoDeliveryConflictError(
      currentRevision,
      "TIMELINE_RANGE_LOCKED",
    );
  }

  return targetOverlay;
}

function assertPipelineVideoDeliveryPrerequisiteAgainstCurrentV1(
  userId: string,
  projectId: string,
  current: Project,
  input: ProjectPipelineVideoDeliveryCommandV1,
  currentRevision: ProjectRevisionV1,
): Overlay {
  const targetOverlay = assertPipelineVideoDeliveryTargetAndLocksAgainstCurrentV1(
    projectId,
    current,
    input,
    currentRevision,
  );
  const invalidation = input.prerequisite.invalidation;
  if (invalidation.status !== "ADMITTED_ARTIFACT_CHAIN_PENDING") {
    throw new ProjectPipelineVideoDeliveryConflictError(
      currentRevision,
      "INVALIDATION_UNVERIFIABLE",
    );
  }
  try {
    assertPipelineVideoDeliveryInvalidationAdmissionV1(invalidation);
  } catch {
    throw new ProjectPipelineVideoDeliveryConflictError(
      currentRevision,
      "INVALIDATION_UNVERIFIABLE",
    );
  }
  const expectedAdmissionId = `pipeline-video-invalidation_${pipelineVideoDeliveryInvalidationAdmissionKeyV1({
    projectId,
    ownerId: userId,
    expectedRevision: invalidation.beforeRevision,
    target: invalidation.target,
  })}`;
  const admissionTargetMatches = samePipelineVideoDeliveryAdmissionTargetV1(
    invalidation.target,
    input.prerequisite.target,
  );
  if (
    invalidation.projectId !== projectId
    || invalidation.ownerId !== userId
    || invalidation.admissionId !== expectedAdmissionId
    || !sameProjectRevisionV1(invalidation.afterRevision, currentRevision)
    || !admissionTargetMatches
    || Date.now() >= new Date(invalidation.expiresAt).getTime()
  ) {
    throw new ProjectPipelineVideoDeliveryConflictError(
      currentRevision,
      "INVALIDATION_UNVERIFIABLE",
    );
  }
  const persistedAdmission = findPipelineVideoDeliveryInvalidationAdmissionV1(
    current,
    invalidation.admissionId,
  );
  if (
    !persistedAdmission
    || persistedAdmission.admissionHash !== invalidation.admissionHash
    || persistedAdmission.ownerId !== userId
    || !sameProjectRevisionV1(persistedAdmission.afterRevision, currentRevision)
    || !samePipelineVideoDeliveryAdmissionTargetV1(
      persistedAdmission.target,
      input.prerequisite.target,
    )
  ) {
    throw new ProjectPipelineVideoDeliveryConflictError(
      currentRevision,
      "INVALIDATION_UNVERIFIABLE",
    );
  }

  // This helper proves only the owner/revision/target admission. The mutation
  // owner applies the pending-admission rejection after this validation and
  // before any receipt lookup, replacement construction, or CAS write.
  return targetOverlay;
}

function samePipelineVideoDeliveryAdmissionTargetV1(
  left: PipelineVideoDeliveryInvalidationAdmissionV1["target"],
  right: PipelineVideoProjectDeliveryPrerequisiteV1["target"],
): boolean {
  return left.overlayId === right.overlayId
    && left.expectedAssetId === right.expectedAssetId
    && left.exactFrameRange.startFrame === right.exactFrameRange.startFrame
    && left.exactFrameRange.endFrame === right.exactFrameRange.endFrame
    && left.targetFingerprint === right.targetFingerprint;
}

function assertProjectPipelineVideoDeliveryCommandV1(
  input: ProjectPipelineVideoDeliveryCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !isPlainRecord(input.target)
    || !isPlainRecord(input.replacement)
    || !isPlainRecord(input.prerequisite)
    || !input.expectedRevision
    || !/^video-delivery_[A-Za-z0-9_-]{18,200}$/.test(input.deliveryId)
    || Object.keys(input.target).some((key) => (
      key !== "overlayId" && key !== "expectedAssetId"
    ))
    || Object.keys(input.replacement).some((key) => (
      key !== "assetId"
      && key !== "sourceUrl"
      && key !== "durationMs"
      && key !== "hasNativeAudio"
      && key !== "audioRights"
      && key !== "generatedVideoReceipt"
    ))
    || !Number.isSafeInteger(input.target.overlayId)
    || input.target.overlayId < 0
    || !isBoundedNonEmptyStringV1(input.target.expectedAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.replacement.assetId, 500)
    || !isBoundedNonEmptyStringV1(input.replacement.sourceUrl, 16_384)
    || !Number.isSafeInteger(input.replacement.durationMs)
    || input.replacement.durationMs <= 0
    || typeof input.replacement.hasNativeAudio !== "boolean"
    || (input.replacement.audioRights !== null && !isPlainRecord(input.replacement.audioRights))
    || !isPlainRecord(input.replacement.generatedVideoReceipt)
  ) {
    throw new ProjectMutationWriteError("Pipeline video delivery input is invalid.");
  }
  assertProjectRevision(input.expectedRevision);
  try {
    assertPipelineVideoProjectDeliveryPrerequisiteV1(input.prerequisite);
  } catch (error) {
    throw new ProjectMutationWriteError(
      "Pipeline video delivery prerequisite is invalid: "
        + (error instanceof Error ? error.message : "UNKNOWN"),
    );
  }
  if (
    input.prerequisite.expectedRevision.schemaVersion !== input.expectedRevision.schemaVersion
    || input.prerequisite.expectedRevision.value !== input.expectedRevision.value
    || input.prerequisite.expectedRevision.compatibilityUpdatedAt
      !== input.expectedRevision.compatibilityUpdatedAt
  ) {
    throw new ProjectMutationWriteError(
      "Pipeline video delivery prerequisite revision does not match the command.",
    );
  }

  if (input.replacement.audioRights !== null) {
    const rightsIssue = getAudioRightsContractIssue(input.replacement.audioRights);
    if (rightsIssue) {
      throw new ProjectMutationWriteError(
        "Pipeline video delivery audio rights are invalid: " + rightsIssue,
      );
    }
  }
  if (!isPipelineVideoReceiptForReplacementV1(
    input.replacement.generatedVideoReceipt,
    input.replacement.assetId,
    input.replacement.hasNativeAudio,
  )
  ) {
    throw new ProjectMutationWriteError(
      "Pipeline video delivery generation receipt is invalid or mismatched.",
    );
  }
  if (!input.replacement.hasNativeAudio) {
    if (input.replacement.audioRights !== null) {
      throw new ProjectMutationWriteError(
        "A video without native audio cannot carry native-audio rights material.",
      );
    }
  } else {
    const audioRights = input.replacement.audioRights;
    const generatedVideoReceipt = input.replacement.generatedVideoReceipt;
    if (
      !audioRights
      || audioRights.mediaRole !== "native-video"
      || audioRights.source !== "generated"
      || !generatedVideoReceipt
    ) {
      throw new ProjectMutationWriteError(
        "Generated native audio requires matching rights and a generation receipt.",
      );
    }
    const receiptIssue = getGeneratedNativeVideoReceiptIssue(
      generatedVideoReceipt,
      {
        assetId: input.replacement.assetId,
        licenseId: audioRights.evidence?.licenseId,
      },
    );
    if (receiptIssue) {
      throw new ProjectMutationWriteError(
        "Pipeline video native-audio receipt is invalid: " + receiptIssue,
      );
    }
  }

  try {
    clonePipelineVideoCanonicalValueV1(input.target);
    clonePipelineVideoCanonicalValueV1(input.replacement);
  } catch {
    throw new ProjectMutationWriteError(
      "Pipeline video delivery material is not canonical JSON.",
    );
  }
}

function isPipelineVideoReceiptForReplacementV1(
  receipt: unknown,
  expectedAssetId: string,
  nativeAudioExpected: boolean,
): boolean {
  if (!isPlainRecord(receipt) || !isPlainRecord(receipt.nativeAudio)) return false;
  const nativeAudio = receipt.nativeAudio;
  return receipt.version === "editron-generated-video-receipt-v1"
    && (receipt.provider === "fal-ai" || receipt.provider === "kie-ai")
    && isBoundedNonEmptyStringV1(receipt.model, 500)
    && receipt.assetId === expectedAssetId
    && isValidDateValueV1(receipt.generatedAt)
    && (
      receipt.providerJobId === undefined
      || isBoundedNonEmptyStringV1(receipt.providerJobId, 500)
    )
    && (
      nativeAudio.requestMode === "enabled"
      || nativeAudio.requestMode === "disabled"
      || nativeAudio.requestMode === "provider-fixed"
      || nativeAudio.requestMode === "not-supported"
    )
    && nativeAudio.present === nativeAudioExpected
    && nativeAudio.probe === "ffmpeg-audio-stream-decode"
    && isValidDateValueV1(nativeAudio.probedAt)
    && (
      !nativeAudioExpected
      || isBoundedNonEmptyStringV1(nativeAudio.licenseId, 500)
    );
}

function assertPipelineVideoDeliveryTargetV1(
  target: Overlay | undefined,
  expectedAssetId: string,
  currentRevision: ProjectRevisionV1,
): asserts target is Overlay {
  if (!target) {
    throw new ProjectPipelineVideoDeliveryConflictError(currentRevision, "TARGET_NOT_FOUND");
  }
  if (target.type !== "video") {
    throw new ProjectPipelineVideoDeliveryConflictError(currentRevision, "TARGET_NOT_VIDEO");
  }
  if (target.assetId !== expectedAssetId) {
    throw new ProjectPipelineVideoDeliveryConflictError(
      currentRevision,
      "TARGET_ASSET_CHANGED",
    );
  }
}

function buildPipelineVideoReplacementOverlayV1(
  target: Overlay,
  replacement: ProjectPipelineVideoDeliveryCommandV1["replacement"],
  deliveryId: string,
  materialHash: string,
): Overlay {
  const next = structuredClone(target) as Overlay & Record<string, unknown>;
  const existingMetadata = isPlainRecord(next.metadata) ? next.metadata : {};
  next.src = replacement.sourceUrl;
  next.content = replacement.sourceUrl;
  next.assetId = replacement.assetId;
  next.videoDurationMs = replacement.durationMs;
  next.hasNativeAudio = replacement.hasNativeAudio;
  if (replacement.audioRights === null) {
    delete next.audioRights;
  } else {
    next.audioRights = clonePipelineVideoCanonicalValueV1(replacement.audioRights);
  }
  if (replacement.generatedVideoReceipt === null) {
    delete next.generatedVideoReceipt;
  } else {
    next.generatedVideoReceipt = clonePipelineVideoCanonicalValueV1(
      replacement.generatedVideoReceipt,
    );
  }
  next.metadata = {
    ...existingMetadata,
    pipelineVideoDeliveryV1: {
      schemaVersion: 1,
      deliveryId,
      materialHash,
      replacementAssetId: replacement.assetId,
    },
  };
  return withAtomicOverlayUpdateReceipt(next, {}, {
    source: "project-service-pipeline-video-delivery",
    intent: "replace-generated-video",
    reason: "signed pipeline video delivery replaced one exact overlay through ProjectService",
  });
}

function findPipelineVideoDeliveryReceiptV1(
  project: Pick<Project, "pipelineVideoDeliveryReceipts">,
  deliveryId: string,
): ProjectPipelineVideoDeliveryReceiptV1 | null {
  const receipts = project.pipelineVideoDeliveryReceipts;
  if (receipts === undefined) return null;
  if (!Array.isArray(receipts)) {
    throw new ProjectMutationWriteError("Pipeline video delivery receipt history is invalid.");
  }
  const matching = receipts.filter((receipt) => receipt?.deliveryId === deliveryId);
  if (matching.length > 1) {
    throw new ProjectMutationWriteError("Pipeline video delivery identity is not unique.");
  }
  return matching[0] ?? null;
}

function listPipelineVideoDeliveryInvalidationAdmissionsV1(
  project: Pick<Project, "pipelineVideoDeliveryInvalidationAdmissionsV1">,
): PipelineVideoDeliveryInvalidationAdmissionV1[] {
  const admissions = project.pipelineVideoDeliveryInvalidationAdmissionsV1;
  if (admissions === undefined) return [];
  if (!Array.isArray(admissions)) {
    throw new ProjectMutationWriteError(
      "Pipeline video invalidation admission history is invalid.",
    );
  }
  return admissions.map((admission) => {
    try {
      assertPipelineVideoDeliveryInvalidationAdmissionV1(admission);
    } catch {
      throw new ProjectMutationWriteError(
        "Pipeline video invalidation admission history is invalid.",
      );
    }
    return admission;
  });
}

function findPipelineVideoDeliveryInvalidationAdmissionV1(
  project: Pick<Project, "pipelineVideoDeliveryInvalidationAdmissionsV1">,
  admissionId: string,
): PipelineVideoDeliveryInvalidationAdmissionV1 | null {
  const matching = listPipelineVideoDeliveryInvalidationAdmissionsV1(project)
    .filter((admission) => admission.admissionId === admissionId);
  if (matching.length > 1) {
    throw new ProjectMutationWriteError(
      "Pipeline video invalidation admission identity is not unique.",
    );
  }
  return matching[0] ?? null;
}

function findRecoverablePipelineVideoDeliveryInvalidationAdmissionV1(
  project: Pick<Project, "pipelineVideoDeliveryInvalidationAdmissionsV1">,
  projectId: string,
  ownerId: string,
  target: PipelineVideoProjectDeliveryPrerequisiteV1["target"],
  currentRevision: ProjectRevisionV1,
): PipelineVideoDeliveryInvalidationAdmissionV1 | null {
  const now = Date.now();
  const matching = listPipelineVideoDeliveryInvalidationAdmissionsV1(project)
    .filter((admission) => (
      admission.status === "ADMITTED_ARTIFACT_CHAIN_PENDING"
      && admission.projectId === projectId
      && admission.ownerId === ownerId
      && sameProjectRevisionV1(admission.afterRevision, currentRevision)
      && now < new Date(admission.expiresAt).getTime()
      && samePipelineVideoDeliveryAdmissionTargetV1(admission.target, target)
    ));
  if (matching.length > 1) {
    throw new ProjectMutationWriteError(
      "Pipeline video invalidation admission identity is not unique.",
    );
  }
  return matching[0] ?? null;
}

type VideoAnalysisDurationCorrectionTargetResolutionV1 =
  | { target: ProjectVideoAnalysisDurationCorrectionCommandV1["target"] }
  | { reason: ProjectVideoAnalysisDurationCorrectionNotEligibleReasonV1 };

/**
 * The producer may ask ProjectService which exact initial source overlay is
 * eligible, but this helper never mutates state and the command repeats the
 * same check under its compare-and-swap predicate.
 */
export function selectVideoAnalysisDurationCorrectionTargetV1(
  project: Pick<Project, "overlays" | "durationInFrames">,
  assetId: string,
): ProjectVideoAnalysisDurationCorrectionCommandV1["target"] | null {
  const resolution = resolveVideoAnalysisDurationCorrectionTargetV1(project, assetId);
  return "target" in resolution ? resolution.target : null;
}

function resolveVideoAnalysisDurationCorrectionTargetV1(
  project: Pick<Project, "overlays" | "durationInFrames">,
  assetId: string,
): VideoAnalysisDurationCorrectionTargetResolutionV1 {
  if (!Array.isArray(project.overlays) || !isBoundedNonEmptyStringV1(assetId, 500)) {
    return { reason: "NO_UNIQUE_INITIAL_SOURCE_OVERLAY" };
  }
  const candidates = project.overlays
    .map((overlay) => videoAnalysisDurationCorrectionTargetForOverlayV1(overlay, assetId))
    .filter((target): target is ProjectVideoAnalysisDurationCorrectionCommandV1["target"] => (
      target !== null
    ));
  if (candidates.length !== 1) {
    return { reason: "NO_UNIQUE_INITIAL_SOURCE_OVERLAY" };
  }
  const target = candidates[0];
  const expectedProjectDuration = target.expectedFromFrame + target.expectedDurationInFrames;
  if (project.durationInFrames !== expectedProjectDuration) {
    return { reason: "PROJECT_DURATION_MISMATCH" };
  }
  return { target };
}

function videoAnalysisDurationCorrectionTargetForOverlayV1(
  overlay: Overlay,
  assetId: string,
): ProjectVideoAnalysisDurationCorrectionCommandV1["target"] | null {
  if (overlay.type !== "video" || overlay.assetId !== assetId) return null;
  const frameRange = overlayTimelineFrameRangeV1(overlay);
  if (!frameRange || frameRange.startFrame !== 0) return null;
  const rawSourceStartFrame = (overlay as { sourceStartFrame?: unknown }).sourceStartFrame;
  if (rawSourceStartFrame !== undefined && rawSourceStartFrame !== 0) return null;
  if (!Number.isSafeInteger(overlay.id) || overlay.id < 0) return null;
  return {
    overlayId: overlay.id,
    expectedAssetId: assetId,
    expectedFromFrame: 0,
    expectedSourceStartFrame: rawSourceStartFrame === 0 ? 0 : null,
    expectedDurationInFrames: frameRange.endFrame,
  };
}

function sameVideoAnalysisDurationCorrectionTargetV1(
  left: ProjectVideoAnalysisDurationCorrectionCommandV1["target"],
  right: ProjectVideoAnalysisDurationCorrectionCommandV1["target"],
): boolean {
  return left.overlayId === right.overlayId
    && left.expectedAssetId === right.expectedAssetId
    && left.expectedFromFrame === right.expectedFromFrame
    && left.expectedSourceStartFrame === right.expectedSourceStartFrame
    && left.expectedDurationInFrames === right.expectedDurationInFrames;
}

function isProjectTimelineFpsV1(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function assertProjectVideoAnalysisDurationCorrectionCommandV1(
  input: ProjectVideoAnalysisDurationCorrectionCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || Object.keys(input).some((key) => ![
      "expectedRevision",
      "assetId",
      "observedDurationMs",
      "durationSource",
      "target",
    ].includes(key))
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.assetId, 500)
    || !Number.isSafeInteger(input.observedDurationMs)
    || input.observedDurationMs <= 0
    || (input.durationSource !== "container" && input.durationSource !== "transcript")
    || !isPlainRecord(input.target)
    || Object.keys(input.target).some((key) => ![
      "overlayId",
      "expectedAssetId",
      "expectedFromFrame",
      "expectedSourceStartFrame",
      "expectedDurationInFrames",
    ].includes(key))
    || !Number.isSafeInteger(input.target.overlayId)
    || input.target.overlayId < 0
    || input.target.expectedAssetId !== input.assetId
    || input.target.expectedFromFrame !== 0
    || (input.target.expectedSourceStartFrame !== 0
      && input.target.expectedSourceStartFrame !== null)
    || !Number.isSafeInteger(input.target.expectedDurationInFrames)
    || input.target.expectedDurationInFrames <= 0
  ) {
    throw new ProjectMutationWriteError(
      "Video Analysis duration correction must carry one exact source-bound target and measured duration.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function videoAnalysisDurationCorrectionMaterialHashV1(
  projectId: string,
  input: ProjectVideoAnalysisDurationCorrectionCommandV1,
): string {
  return createHash("sha256")
    .update(JSON.stringify([
      projectId,
      input.assetId,
      input.observedDurationMs,
      input.durationSource,
      input.target.overlayId,
      input.target.expectedAssetId,
      input.target.expectedFromFrame,
      input.target.expectedSourceStartFrame,
      input.target.expectedDurationInFrames,
    ]))
    .digest("hex");
}

function findVideoAnalysisDurationCorrectionReceiptV1(
  project: Pick<Project, "videoAnalysisDurationCorrectionReceipts">,
  projectId: string,
  correctionId: string,
): ProjectVideoAnalysisDurationCorrectionReceiptV1 | null {
  const receipts = project.videoAnalysisDurationCorrectionReceipts;
  if (receipts === undefined) return null;
  if (!Array.isArray(receipts)) {
    throw new ProjectMutationWriteError(
      "Video Analysis duration correction receipt history is invalid.",
    );
  }
  const matching = receipts.filter((receipt) => (
    isPlainRecord(receipt) && receipt.correctionId === correctionId
  ));
  if (matching.length > 1) {
    throw new ProjectMutationWriteError(
      "Video Analysis duration correction identity is not unique.",
    );
  }
  const existing = matching[0];
  if (!existing) return null;
  if (!isProjectVideoAnalysisDurationCorrectionReceiptV1(existing, projectId, correctionId)) {
    throw new ProjectMutationWriteError(
      "Video Analysis duration correction receipt is invalid.",
    );
  }
  return existing;
}

function isProjectVideoAnalysisDurationCorrectionReceiptV1(
  value: unknown,
  projectId: string,
  correctionId: string,
): value is ProjectVideoAnalysisDurationCorrectionReceiptV1 {
  if (
    !isPlainRecord(value)
    || value.schemaVersion !== 1
    || value.correctionId !== correctionId
    || value.correctionId !== `video-analysis-duration_${value.materialHash}`
    || !/^[a-f0-9]{64}$/.test(String(value.materialHash))
    || !isBoundedNonEmptyStringV1(value.assetId, 500)
    || !Number.isSafeInteger(value.observedDurationMs)
    || (value.observedDurationMs as number) <= 0
    || (value.durationSource !== "container" && value.durationSource !== "transcript")
    || !isProjectTimelineFpsV1(value.projectFps)
    || !isPlainRecord(value.target)
    || !isPlainRecord(value.requestedRevision)
    || !isPlainRecord(value.beforeRevision)
    || !isPlainRecord(value.afterRevision)
    || !isPlainRecord(value.mutationReceipt)
    || !isPlainRecord(value.timelineChangeReceipt)
    || !Array.isArray(value.changedPaths)
    || value.changedPaths.join("|") !== [
      "durationInFrames",
      "overlays",
      "videoAnalysisDurationCorrectionReceipts",
      "timelineRangeChangeReceipts",
    ].join("|")
    || !isPlainRecord(value.proof)
    || value.proof.required !== true
    || value.proof.status !== "UNVERIFIABLE"
    || value.proof.reason !== "NO_RENDERED_VIDEO_PROOF"
    || !isValidDateValueV1(value.committedAt)
  ) {
    return false;
  }
  try {
    const input: ProjectVideoAnalysisDurationCorrectionCommandV1 = {
      expectedRevision: value.requestedRevision as unknown as ProjectRevisionV1,
      assetId: value.assetId as string,
      observedDurationMs: value.observedDurationMs as number,
      durationSource: value.durationSource as "container" | "transcript",
      target: value.target as unknown as ProjectVideoAnalysisDurationCorrectionCommandV1["target"],
    };
    assertProjectVideoAnalysisDurationCorrectionCommandV1(input);
    if (
      value.materialHash !== videoAnalysisDurationCorrectionMaterialHashV1(projectId, input)
      || !sameProjectRevisionV1(
        value.beforeRevision as unknown as ProjectRevisionV1,
        value.requestedRevision as unknown as ProjectRevisionV1,
      )
      || !isProjectTimelineRangeChangeReceiptForRevisionV1(
        value.timelineChangeReceipt,
        projectId,
        value.beforeRevision as unknown as ProjectRevisionV1,
      )
      || value.timelineChangeReceipt.operation !== "CORRECT_VIDEO_ANALYSIS_DURATION"
    ) {
      return false;
    }
    assertProjectRevision(value.afterRevision as unknown as ProjectRevisionV1);
    assertReceiptForProjectRevision(
      projectId,
      value.mutationReceipt as unknown as ProjectMutationReceiptV1,
      value.afterRevision as unknown as ProjectRevisionV1,
    );
    return sameProjectRevisionV1(
      value.timelineChangeReceipt.afterProjectRevision as ProjectRevisionV1,
      value.afterRevision as unknown as ProjectRevisionV1,
    );
  } catch {
    return false;
  }
}

function assertProjectPipelineVideoQualityWarningCommandV1(
  input: ProjectPipelineVideoQualityWarningCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || Object.keys(input).some((key) => ![
      "expectedRevision",
      "batchId",
      "jobId",
      "storyboardId",
      "sceneIndex",
      "assetId",
      "qualityScore",
      "qualitySource",
    ].includes(key))
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.batchId, 200)
    || !isBoundedNonEmptyStringV1(input.jobId, 300)
    || !isBoundedNonEmptyStringV1(input.storyboardId, 200)
    || !Number.isSafeInteger(input.sceneIndex)
    || input.sceneIndex < 0
    || !isBoundedNonEmptyStringV1(input.assetId, 500)
    || !Number.isSafeInteger(input.qualityScore)
    || input.qualityScore < 0
    || input.qualityScore > 100
    || (input.qualitySource !== "hybrid-vision"
      && input.qualitySource !== "deterministic-5track")
  ) {
    throw new ProjectMutationWriteError("Pipeline video quality warning input is invalid.");
  }
  assertProjectRevision(input.expectedRevision);
}

function pipelineVideoQualityWarningIdV1(projectId: string, jobId: string): string {
  return "pipeline-video-quality_" + createHash("sha256")
    .update(JSON.stringify([projectId, jobId]))
    .digest("hex");
}

function pipelineVideoQualityWarningMaterialHashV1(
  input: ProjectPipelineVideoQualityWarningCommandV1,
): string {
  return createHash("sha256")
    .update(JSON.stringify([
      input.batchId,
      input.jobId,
      input.storyboardId,
      input.sceneIndex,
      input.assetId,
      input.qualityScore,
      input.qualitySource,
    ]))
    .digest("hex");
}

function pipelineVideoQualityWarningMessageV1(
  sceneIndex: number,
  qualityScore: number,
): string {
  return `Scene ${sceneIndex}: Low quality video (${qualityScore}/100). Consider regenerating this scene.`;
}

function findPipelineVideoQualityWarningV1(
  project: Pick<Project, "qualityWarnings">,
  projectId: string,
  warningId: string,
): ProjectPipelineVideoQualityWarningV1 | null {
  const warnings = project.qualityWarnings;
  if (warnings === undefined) return null;
  if (!Array.isArray(warnings)) {
    throw new ProjectMutationWriteError("Pipeline video quality warning history is invalid.");
  }
  const matching = warnings.filter((warning) => (
    isPlainRecord(warning) && warning.warningId === warningId
  ));
  if (matching.length > 1) {
    throw new ProjectMutationWriteError("Pipeline video quality warning identity is not unique.");
  }
  const existing = matching[0];
  if (!existing) return null;
  if (!isProjectPipelineVideoQualityWarningV1(existing, projectId, warningId)) {
    throw new ProjectMutationWriteError("Pipeline video quality warning receipt is invalid.");
  }
  return existing;
}

function isProjectPipelineVideoQualityWarningV1(
  value: unknown,
  projectId: string,
  warningId: string,
): value is ProjectPipelineVideoQualityWarningV1 {
  if (
    !isPlainRecord(value)
    || value.schemaVersion !== 1
    || value.warningId !== warningId
    || !/^[a-f0-9]{64}$/.test(String(value.materialHash))
    || !isBoundedNonEmptyStringV1(value.batchId, 200)
    || !isBoundedNonEmptyStringV1(value.jobId, 300)
    || !isBoundedNonEmptyStringV1(value.storyboardId, 200)
    || !Number.isSafeInteger(value.sceneIndex)
    || (value.sceneIndex as number) < 0
    || !isBoundedNonEmptyStringV1(value.assetId, 500)
    || !Number.isSafeInteger(value.qualityScore)
    || (value.qualityScore as number) < 0
    || (value.qualityScore as number) > 100
    || (value.qualitySource !== "hybrid-vision"
      && value.qualitySource !== "deterministic-5track")
    || value.message !== pipelineVideoQualityWarningMessageV1(
      value.sceneIndex as number,
      value.qualityScore as number,
    )
    || !isValidDateValueV1(value.createdAt)
    || !isPlainRecord(value.requestedRevision)
    || !isPlainRecord(value.beforeRevision)
    || !isPlainRecord(value.afterRevision)
    || !isPlainRecord(value.mutationReceipt)
    || (value.rebase !== "FRESH" && value.rebase !== "SAFE_REBASED_ADDITIVE_WARNING")
    || !Array.isArray(value.changedPaths)
    || value.changedPaths.length !== 1
    || value.changedPaths[0] !== "qualityWarnings"
    || !isPlainRecord(value.proof)
    || value.proof.required !== false
    || value.proof.status !== null
    || value.proof.reason !== "DERIVED_ANALYSIS_WARNING_NOT_RENDERED_ACCEPTANCE_PROOF"
    || !isValidDateValueV1(value.committedAt)
  ) {
    return false;
  }
  try {
    assertProjectRevision(value.requestedRevision as unknown as ProjectRevisionV1);
    assertProjectRevision(value.beforeRevision as unknown as ProjectRevisionV1);
    assertProjectRevision(value.afterRevision as unknown as ProjectRevisionV1);
    assertReceiptForProjectRevision(
      projectId,
      value.mutationReceipt as unknown as ProjectMutationReceiptV1,
      value.afterRevision as unknown as ProjectRevisionV1,
    );
  } catch {
    return false;
  }
  return true;
}

function assertProjectDirectorDeliveryFailureCommandV1(
  input: ProjectDirectorDeliveryFailureCommandV1,
): void {
  if (
    !isBoundedNonEmptyStringV1(input.sourceMessageId, 200)
    || !isProjectPipelineDirectorDispatchTokenV1(input.pipelineDirectorDispatchToken)
    || !isBoundedNonEmptyStringV1(input.errorMessage, 500)
    || !isPlainRecord(input.audit)
    || input.audit.source !== "qstash-failure-callback"
    || input.audit.sourceMessageId !== input.sourceMessageId
    || input.audit.pipelineDirectorDispatchToken !== input.pipelineDirectorDispatchToken
    || input.audit.error !== input.errorMessage
    || !isValidDateValueV1(input.audit.failedAt)
  ) {
    throw new ProjectMutationWriteError(
      "Director delivery failure input must be a bounded callback audit for its source message.",
    );
  }
}

function assertProjectDirectorProgressCommandV1(
  input: ProjectDirectorProgressCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.directorLeaseId, 200)
    || !Number.isSafeInteger(input.stagePercent)
    || input.stagePercent < 0
    || input.stagePercent > 99
    || !isBoundedNonEmptyStringV1(input.stageDescription, 1000)
  ) {
    throw new ProjectMutationWriteError(
      "Director progress must carry one bounded stage and an active lease-bound revision.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function assertProjectDirectorAutoBgmDecisionCommandV1(
  input: ProjectDirectorAutoBgmDecisionCommandV1,
): void {
  let computedEvidenceHash = "";
  try {
    computedEvidenceHash = autoBgmDecisionEvidenceHashV1(input.evidence);
  } catch {
    throw new ProjectMutationWriteError(
      "Auto-BGM decision evidence must be one valid bounded V1 record.",
    );
  }
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.directorLeaseId, 200)
    || !/^[a-f0-9]{64}$/.test(input.evidenceHash)
    || input.evidenceHash !== computedEvidenceHash
  ) {
    throw new ProjectMutationWriteError(
      "Auto-BGM decision evidence must carry its exact revision, lease, and canonical hash.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function assertProjectDirectorAuditFactCommandV1(
  input: ProjectDirectorAuditFactCommandV1,
): void {
  if (!isPlainRecord(input)) {
    throw new ProjectMutationWriteError(
      "Director audit fact must carry one exact revision and active lease.",
    );
  }
  try {
    assertDirectorAuditFactV1(input.fact);
  } catch {
    throw new ProjectMutationWriteError(
      "Director audit fact must be one valid hash-bound V1 provenance or policy record.",
    );
  }
  if (
    !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.directorLeaseId, 200)
  ) {
    throw new ProjectMutationWriteError(
      "Director audit fact must carry one exact revision and active lease.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function assertProjectDirectorDecisionLogCommandV1(
  userId: string,
  projectId: string,
  input: ProjectDirectorDecisionLogCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.directorLeaseId, 200)
  ) {
    throw new ProjectMutationWriteError(
      "Director decision log must carry one exact revision and active lease.",
    );
  }
  try {
    assertPersistedDirectorDecisionLogV1(input.decisionLog, { projectId, userId });
  } catch {
    throw new ProjectMutationWriteError(
      "Director decision log must be bounded and bound to the exact project and user.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function assertProjectPipelineDirectorDispatchPrepareCommandV1(
  input: ProjectPipelineDirectorDispatchPrepareCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.batchId, 200)
  ) {
    throw new ProjectMutationWriteError(
      "Pipeline Director dispatch preparation must carry one exact project revision and batch identity.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function assertProjectPipelineDirectorIntentCommandV1(
  input: ProjectPipelineDirectorIntentCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.profileId, 200)
  ) {
    throw new ProjectMutationWriteError(
      "Pipeline Director intent must carry one exact project revision and bounded profile identity.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function assertProjectDirectorRunCompletionCommandV1(
  projectId: string,
  input: ProjectDirectorRunCompletionCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !isProjectDirectorRunTokenV1(input.directorRunToken)
    || !input.expectedRevision
    || !isPlainRecord(input.terminalReceipt)
    || !isPlainRecord(input.terminalReceipt.revision)
    || !Number.isSafeInteger(input.totalPipelineMs)
    || input.totalPipelineMs < 0
    || !Number.isSafeInteger(input.directorMs)
    || input.directorMs < 0
    || !isBoundedNonEmptyStringV1(input.profileId, 200)
    || (input.autoEditStatus !== "complete" && input.autoEditStatus !== "needs_review")
    || input.needsQualityAttention !== (input.autoEditStatus === "needs_review")
    || (
      input.needsQualityAttention
      && !isBoundedNonEmptyStringV1(input.autoEditWarning, 1000)
    )
    || (!input.needsQualityAttention && input.autoEditWarning !== undefined)
    || (
      input.decisionAuthority !== undefined
      && !isPlainRecord(input.decisionAuthority)
    )
  ) {
    throw new ProjectMutationWriteError(
      "Director completion must carry bounded facts, one active run token, and one terminal receipt.",
    );
  }

  try {
    assertProjectRevision(input.expectedRevision);
    assertReceiptForProjectRevision(projectId, input.terminalReceipt, input.expectedRevision);
  } catch {
    throw new ProjectMutationWriteError(
      "Director completion must bind the exact terminal writer receipt.",
    );
  }
}

function assertProjectDirectorRunFailureCommandV1(
  input: ProjectDirectorRunFailureCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !isProjectDirectorRunTokenV1(input.directorRunToken)
    || !isBoundedNonEmptyStringV1(input.errorMessage, 1000)
  ) {
    throw new ProjectMutationWriteError(
      "Director failure must carry one active run token and a bounded error message.",
    );
  }
}

function isProjectDirectorRunTokenV1(value: unknown): value is string {
  return typeof value === "string" && /^director_run_[A-Za-z0-9_-]{20}$/.test(value);
}

function isProjectPipelineDirectorDispatchTokenV1(value: unknown): value is string {
  return typeof value === "string"
    && /^pipeline_director_dispatch_[A-Za-z0-9_-]{20}$/.test(value);
}

function readProjectPipelineDirectorDispatchV1(
  value: unknown,
): ProjectPipelineDirectorDispatchV1 | null {
  if (
    !isPlainRecord(value)
    || value.schemaVersion !== 1
    || !isBoundedNonEmptyStringV1(value.batchId, 200)
    || !isBoundedNonEmptyStringV1(value.profileId, 200)
    || !isProjectPipelineDirectorDispatchTokenV1(value.dispatchToken)
    || !isBoundedNonEmptyStringV1(value.preparedAt, 100)
    || !isValidDateValueV1(value.preparedAt)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    batchId: value.batchId,
    profileId: value.profileId,
    dispatchToken: value.dispatchToken,
    preparedAt: new Date(value.preparedAt).toISOString(),
  };
}

function isPipelineDirectorDispatchPreparationEligibleStatusV1(value: unknown): boolean {
  return value === undefined || value === "analysis_complete";
}

function isDirectorRunClaimableStatusV1(value: unknown): boolean {
  return value === "analysis_complete" || value === "directing_queued";
}

function isAssistProjectRecordV1(project: Project): boolean {
  return projectRecordValueV1(project, "editMode") === "assist";
}

function isActiveDirectorRunV1(project: Project, runToken: string): boolean {
  return projectRecordValueV1(project, "autoEditStatus") === "directing"
    && project.directorRunToken === runToken;
}

function directorDeliveryFailureNoopDispositionV1(
  project: Project,
  sourceMessageId: string,
  pipelineDirectorDispatchToken: string,
): Exclude<ProjectDirectorDeliveryFailureDispositionV1, "RECORDED" | "PROJECT_NOT_FOUND"> | null {
  const directorMessageId = projectRecordValueV1(project, "directorMessageId");
  if (
    directorMessageId !== undefined
    && (typeof directorMessageId !== "string" || !directorMessageId.trim())
  ) {
    return "PROJECT_STATE_CHANGED";
  }
  if (
    typeof directorMessageId === "string"
    && directorMessageId !== sourceMessageId
  ) {
    return "STALE_SOURCE_MESSAGE";
  }
  const rawPipelineDirectorDispatch = projectRecordValueV1(
    project,
    "pipelineDirectorDispatch",
  );
  const pipelineDirectorDispatch = readProjectPipelineDirectorDispatchV1(
    rawPipelineDirectorDispatch,
  );
  if (rawPipelineDirectorDispatch !== undefined && !pipelineDirectorDispatch) {
    return "PROJECT_STATE_CHANGED";
  }
  if (
    pipelineDirectorDispatch
    && pipelineDirectorDispatch.dispatchToken !== pipelineDirectorDispatchToken
  ) {
    return "STALE_SOURCE_MESSAGE";
  }
  if (!pipelineDirectorDispatch && typeof directorMessageId !== "string") {
    return "PROJECT_STATE_CHANGED";
  }
  return isDirectorDeliveryFailureActiveStatusV1(
    projectRecordValueV1(project, "autoEditStatus"),
  )
    ? null
    : "PROJECT_ALREADY_TERMINAL";
}

function isDirectorDeliveryFailureActiveStatusV1(value: unknown): boolean {
  return value === "directing_queued"
    || value === "directing"
    || value === "analysis_complete";
}

function projectRecordValueV1(project: Project, field: string): unknown {
  return (project as unknown as Record<string, unknown>)[field];
}

function projectOptionalNonEmptyStringFieldV1(
  project: Project,
  field: string,
): string | null {
  const value = projectRecordValueV1(project, field);
  return typeof value === "string" && value.trim() ? value : null;
}

function isBoundedNonEmptyStringV1(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isValidDateValueV1(value: unknown): boolean {
  return !Number.isNaN(new Date(value as Date | string | number).getTime());
}

function parseProjectGeneratedCompositionEntriesForProjectV1(
  projectId: string,
  value: unknown,
): ProjectGeneratedCompositionEntryV1[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ProjectMutationWriteError(
      "Project generated-composition state must be an array.",
    );
  }
  const entries = value.map(parseProjectGeneratedCompositionEntryV1);
  if (new Set(entries.map(({ compositionId }) => compositionId)).size
    !== entries.length) {
    throw new ProjectMutationWriteError(
      "Project generated-composition IDs must be unique.",
    );
  }
  const containsCrossProjectState = entries.some((entry) =>
    [entry.activeState, entry.candidateState]
      .filter((state): state is ProjectGeneratedCompositionStateV1 => Boolean(state))
      .some((state) => state.projectId !== projectId));
  if (containsCrossProjectState) {
    throw new ProjectMutationWriteError(
      "Project generated-composition state cannot cross project boundaries.",
    );
  }
  return entries;
}

function currentProjectGeneratedCompositionStateTokenV1(
  entry: ProjectGeneratedCompositionEntryV1,
): string {
  const state = entry.candidateState ?? entry.activeState;
  if (!state) {
    throw new ProjectMutationWriteError(
      "Project generated-composition entry has no current state.",
    );
  }
  return state.stateIdentity.token;
}

function assertProjectGeneratedCompositionCheckpointRestoreV1(
  projectId: string,
  setFields: Record<string, unknown>,
  unsetFields: string[],
): void {
  const compositionFields = [...Object.keys(setFields), ...unsetFields]
    .filter((field) => field === "generatedCompositions"
      || field.startsWith("generatedCompositions."));
  if (compositionFields.some((field) => field !== "generatedCompositions")) {
    throw new ProjectMutationWriteError(
      "Checkpoint restore must replace generated composition state as one whole field.",
    );
  }
  if (Object.prototype.hasOwnProperty.call(setFields, "generatedCompositions")) {
    if (!Array.isArray(setFields.generatedCompositions)) {
      throw new ProjectMutationWriteError(
        "Checkpoint generated-composition state must be an array.",
      );
    }
    parseProjectGeneratedCompositionEntriesForProjectV1(
      projectId,
      setFields.generatedCompositions,
    );
  }
}

function generatedCompositionEntryStatePredicateV1(
  compositionId: string,
  entry: ProjectGeneratedCompositionEntryV1,
): Record<string, unknown> {
  if (entry.candidateState) {
    return {
      generatedCompositions: {
        $elemMatch: {
          compositionId,
          "candidateState.stateIdentity.token": entry.candidateState.stateIdentity.token,
        },
      },
    };
  }
  if (entry.activeState) {
    return {
      generatedCompositions: {
        $elemMatch: {
          compositionId,
          "activeState.stateIdentity.token": entry.activeState.stateIdentity.token,
          candidateState: null,
        },
      },
    };
  }
  throw new ProjectMutationWriteError(
    "Project generated-composition entry has no state to compare.",
  );
}

function generatedCompositionEntryArrayFilterV1(
  compositionId: string,
  entry: ProjectGeneratedCompositionEntryV1,
): Record<string, unknown> {
  if (entry.candidateState) {
    return {
      "composition.compositionId": compositionId,
      "composition.candidateState.stateIdentity.token": entry.candidateState.stateIdentity.token,
    };
  }
  if (entry.activeState) {
    return {
      "composition.compositionId": compositionId,
      "composition.activeState.stateIdentity.token": entry.activeState.stateIdentity.token,
      "composition.candidateState": null,
    };
  }
  throw new ProjectMutationWriteError(
    "Project generated-composition entry has no state to compare.",
  );
}

function assertProjectRevision(revision: ProjectRevisionV1): void {
  if (
    revision.schemaVersion !== 1 ||
    !Number.isSafeInteger(revision.value) ||
    revision.value < 0 ||
    Number.isNaN(new Date(revision.compatibilityUpdatedAt).getTime())
  ) {
    throw new Error(
      "Project revision must be a non-negative ProjectRevisionV1 value.",
    );
  }
}

function assertReceiptForProjectRevision(
  projectId: string,
  receipt: ProjectMutationReceiptV1,
  expectedRevision: ProjectRevisionV1,
): void {
  assertProjectRevision(expectedRevision);
  if (
    receipt.schemaVersion !== 1
    || receipt.projectId !== projectId
    || receipt.revision.schemaVersion !== expectedRevision.schemaVersion
    || receipt.revision.value !== expectedRevision.value
    || receipt.revision.compatibilityUpdatedAt !== expectedRevision.compatibilityUpdatedAt
    || Number.isNaN(new Date(receipt.committedAt).getTime())
  ) {
    throw new ProjectMutationWriteError("Phase-0 rendered evidence must bind one valid writer receipt.");
  }
}

function assertChatRenderVerificationProjection(
  input: ProjectChatRenderVerificationProjectionInputV1,
  projectId: string,
): void {
  const recordReceipt = input.record.subjectReceipt;
  const expectedStates = new Set([
    "requested",
    "dispatched",
    "delivered",
    "rendering",
    "completed",
    "failed",
  ] satisfies ChatEditRenderVerificationLifecycleState[]);
  if (
    input.record.version !== "editron-chat-render-verification-result-v1"
    || !input.record.operationId.trim()
    || !recordReceipt
    || recordReceipt.schemaVersion !== input.subjectReceipt.schemaVersion
    || recordReceipt.projectId !== projectId
    || recordReceipt.revision.value !== input.subjectReceipt.revision.value
    || recordReceipt.revision.compatibilityUpdatedAt
      !== input.subjectReceipt.revision.compatibilityUpdatedAt
    || !Array.isArray(input.expectedLifecycleStates)
    || input.expectedLifecycleStates.length === 0
    || input.expectedLifecycleStates.some((state) => !expectedStates.has(state))
    || (
      input.expectedAttemptToken !== undefined
      && input.expectedAttemptToken !== null
      && (typeof input.expectedAttemptToken !== "string" || !input.expectedAttemptToken.trim())
    )
    || (
      input.record.lifecycle.attemptToken !== null
      && (typeof input.record.lifecycle.attemptToken !== "string" || !input.record.lifecycle.attemptToken.trim())
    )
  ) {
    throw new ProjectMutationWriteError(
      "Chat render-verification projection must bind one valid writer receipt and lifecycle state.",
    );
  }
}

function assertPhase0RenderedEvidenceFacts(
  facts: ProjectPhase0RenderedEvidenceFactsV1,
): void {
  const fixture = facts.fixtureArtifact;
  const nonNegativeIntegerFields = [
    fixture.renderedStillFrameCount,
    fixture.renderedStillFailedFrameCount,
    fixture.renderedAestheticIssueCount,
    fixture.renderedAestheticFailFrameCount,
    fixture.renderedAestheticWarnFrameCount,
    fixture.renderedAestheticSampledFrames,
  ];
  const optionalRecordFields = [facts.renderedAestheticReport, facts.liveTruth]
    .filter((value) => value !== undefined);
  if (
    !isPlainRecord(facts.renderedStillEvidence)
    || !isPlainRecord(facts.renderedQualityEvidence)
    || !isPlainRecord(facts.renderedQualityGate)
    || optionalRecordFields.some((value) => !isPlainRecord(value))
    || [
      fixture.materialization,
      fixture.renderedStillEvidenceStatus,
      fixture.renderedAestheticStatus,
    ].some((value) => typeof value !== "string" || value.length === 0)
    || ![fixture.renderedStillEvidenceReason, fixture.renderedStillCompletedAt]
      .every((value) => value === null || typeof value === "string")
    || (fixture.renderedAestheticScore !== null && !Number.isFinite(fixture.renderedAestheticScore))
    || nonNegativeIntegerFields.some((value) => !Number.isSafeInteger(value) || value < 0)
    || (facts.reviewDisposition !== undefined && (
      facts.reviewDisposition.autoEditStatus !== "needs_review"
      || facts.reviewDisposition.projectStatus !== "needs-attention"
      || facts.reviewDisposition.autoEditHealth !== "needs_review"
      || (facts.reviewDisposition.autoEditWarning !== null && typeof facts.reviewDisposition.autoEditWarning !== "string")
    ))
  ) {
    throw new ProjectMutationWriteError("Phase-0 rendered evidence facts are invalid.");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertProjectMgDesignCompletionCommandV1(
  input: ProjectMgDesignCompletionCommandV1,
): void {
  const result = input.result;
  const evidence = result?.projectEvidence;
  const completedAt = new Date(result?.completedAt ?? "");
  const countFields = [
    result?.decisionsExecuted,
    result?.decisionsSkipped,
    result?.renderJobsQueued,
    result?.approvedCount,
    result?.declinedCount,
    result?.unavailableCount,
  ];
  if (
    !isBoundedNonEmptyStringV1(input.leaseId, 200)
    || !isBoundedNonEmptyStringV1(result?.jobId, 200)
    || countFields.some((value) => !Number.isSafeInteger(value) || (value as number) < 0)
    || Number.isNaN(completedAt.getTime())
    || !isPlainRecord(evidence)
    || evidence.schemaVersion !== 1
    || !Array.isArray(evidence.mgKineticSfxContexts)
    || evidence.mgKineticSfxContexts.length > 100
    || !Array.isArray(evidence.mgDeliveryRecords)
    || evidence.mgDeliveryRecords.length > 200
    || Buffer.byteLength(JSON.stringify(input), "utf8") > 512 * 1024
  ) {
    throw new ProjectMutationWriteError("MG design completion input is invalid.");
  }

  const validKineticContext = evidence.mgKineticSfxContexts.every((context) => (
    isPlainRecord(context)
    && context.version === "mg-kinetic-sfx-context-v1"
    && isBoundedNonEmptyStringV1(context.momentId, 500)
    && (context.policy === null || context.policy === "full" || context.policy === "subtle" || context.policy === "off")
    && (context.profileId === null || isBoundedNonEmptyStringV1(context.profileId, 200))
    && (context.policySource === "director-effective-profile" || context.policySource === "unavailable")
    && (context.speechEnergy === null || (
      typeof context.speechEnergy === "number"
      && Number.isFinite(context.speechEnergy)
      && context.speechEnergy >= 0
      && context.speechEnergy <= 1
    ))
    && (context.speechSource === "moment-signals"
      || context.speechSource === "wav2vec-segment"
      || context.speechSource === "unavailable")
    && context.writtenAt instanceof Date
    && !Number.isNaN(context.writtenAt.getTime())
  ));
  const validDeliveryRecords = evidence.mgDeliveryRecords.every((record) => (
    mgDeliveryRecordSchema.safeParse(record).success
  ));
  const run = evidence.mgCodegenRun;
  const validRun = run === undefined || (
    isPlainRecord(run)
    && run.version === "mg-codegen-run-v2"
    && [run.queuedCount, run.generatedCount, run.failedCount]
      .every((value) => Number.isSafeInteger(value) && (value as number) >= 0)
    && Array.isArray(run.outcomes)
    && run.outcomes.length <= 100
    && typeof run.truncated === "boolean"
    && run.completedAt instanceof Date
    && !Number.isNaN(run.completedAt.getTime())
    && run.outcomes.every((outcome) => (
      isPlainRecord(outcome)
      && (outcome.status === "queued"
        || outcome.status === "generated"
        || outcome.status === "declined"
        || outcome.status === "fallback")
      && Number.isSafeInteger(outcome.frame)
      && isBoundedNonEmptyStringV1(outcome.candidateId, 500)
      && isBoundedNonEmptyStringV1(outcome.factKind, 200)
      && (outcome.reason === undefined || isBoundedNonEmptyStringV1(outcome.reason, 8_000))
      && (outcome.jobId === undefined || isBoundedNonEmptyStringV1(outcome.jobId, 200))
      && (outcome.messageId === undefined
        || outcome.messageId === null
        || isBoundedNonEmptyStringV1(outcome.messageId, 500))
    ))
    && (run.truncated || (
      (run.queuedCount as number) + (run.generatedCount as number) + (run.failedCount as number)
      === run.outcomes.length
    ))
  );
  const taste = evidence.mgTasteContract;
  const validTaste = taste === undefined || (
    isPlainRecord(taste)
    && videoTasteContractSchema.safeParse(taste.contract).success
    && isBoundedNonEmptyStringV1(taste.hash, 128)
    && (taste.contract as { contractHash?: unknown }).contractHash === taste.hash
    && Array.isArray(taste.sourcePrecedenceApplied)
    && taste.sourcePrecedenceApplied.length <= 32
    && Array.isArray(taste.conflicts)
    && taste.conflicts.length <= 100
    && taste.conflicts.every((conflict) => typeof conflict === "string" && conflict.length <= 2_000)
  );
  if (!validKineticContext || !validDeliveryRecords || !validRun || !validTaste) {
    throw new ProjectMutationWriteError("MG design completion evidence is invalid.");
  }
}

function mergeBoundedMgEvidenceByMomentIdV1<T extends { momentId: string }>(
  existing: unknown,
  incoming: readonly T[],
  maximum: number,
): Array<Record<string, unknown> | T> {
  const incomingIds = new Set(incoming.map((entry) => entry.momentId));
  const retained = Array.isArray(existing)
    ? existing.filter((entry): entry is Record<string, unknown> => (
      isPlainRecord(entry)
      && typeof entry.momentId === "string"
      && !incomingIds.has(entry.momentId)
    ))
    : [];
  return [...retained, ...structuredClone(incoming)].slice(-maximum);
}

function assertProjectAnalysisRunAdmissionCommandV1(
  input: ProjectAnalysisRunAdmissionCommandV1,
): void {
  const facts = input.queueFacts;
  const source = facts?.referenceVideoSource;
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.creditTransactionId, 500)
    || !Number.isFinite(input.chargedCredits)
    || input.chargedCredits < 0
    || (input.lane !== "auto" && input.lane !== "assist")
    || (facts !== undefined && !isPlainRecord(facts))
    || (facts?.referenceAssetId !== undefined
      && !isBoundedNonEmptyStringV1(facts.referenceAssetId, 500))
    || (source !== undefined && (
      !isPlainRecord(source)
      || !["remote-url", "youtube-url", "instagram-url"].includes(source.kind)
      || !isBoundedNonEmptyStringV1(source.sourceLabel, 1_000)
      || !isBoundedNonEmptyStringV1(source.sourceFingerprint, 500)
    ))
    || (facts?.referenceImageAssetIds !== undefined && (
      !Array.isArray(facts.referenceImageAssetIds)
      || facts.referenceImageAssetIds.length > 100
      || facts.referenceImageAssetIds.some((id) => !isBoundedNonEmptyStringV1(id, 500))
    ))
    || (facts?.editorialPreferences !== undefined
      && !isPlainRecord(facts.editorialPreferences))
  ) {
    throw new ProjectMutationWriteError(
      "Analysis admission requires one exact revision, source, charge, lane and bounded queue facts.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function projectAnalysisRunAdmissionHashV1(
  projectId: string,
  userId: string,
  input: ProjectAnalysisRunAdmissionCommandV1,
): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    projectId,
    userId,
    sourceAssetId: input.sourceAssetId,
    creditTransactionId: input.creditTransactionId,
    chargedCredits: input.chargedCredits,
    lane: input.lane,
    queueFacts: input.queueFacts ?? {},
  });
}

function readProjectAnalysisRunV1(value: unknown): ProjectAnalysisRunV1 | null {
  if (
    !isPlainRecord(value)
    || value.schemaVersion !== 1
    || !isBoundedNonEmptyStringV1(value.runId, 200)
    || !isBoundedNonEmptyStringV1(value.admissionHash, 128)
    || !isBoundedNonEmptyStringV1(value.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(value.creditTransactionId, 500)
    || !Number.isFinite(value.chargedCredits)
    || (value.chargedCredits as number) < 0
    || (value.lane !== "auto" && value.lane !== "assist")
    || !isProjectAnalysisRunStateV1(value.state)
    || !isPlainRecord(value.admittedRevision)
    || !isBoundedNonEmptyStringV1(value.admittedAt, 100)
    || !isBoundedNonEmptyStringV1(value.updatedAt, 100)
    || (value.phase1EvidenceHash !== undefined
      && !isBoundedNonEmptyStringV1(value.phase1EvidenceHash, 128))
    || (value.phase1EvidenceCommittedAt !== undefined
      && !isBoundedNonEmptyStringV1(value.phase1EvidenceCommittedAt, 100))
    || (value.intakeDispatch !== undefined
      && !isProjectAnalysisIntakeDispatchV1(value.intakeDispatch))
    || (value.deepAnalysisDispatch !== undefined
      && !isProjectAnalysisDeepDispatchV1(value.deepAnalysisDispatch))
    || (value.deepAnalysisLease !== undefined && !isProjectAnalysisDeepLeaseV1(value.deepAnalysisLease))
    || (value.phase2EvidenceHash !== undefined
      && !isBoundedNonEmptyStringV1(value.phase2EvidenceHash, 128))
    || (value.phase2EvidenceCommittedAt !== undefined
      && !isBoundedNonEmptyStringV1(value.phase2EvidenceCommittedAt, 100))
    || (value.directorDispatch !== undefined
      && !isProjectAnalysisDirectorDispatchV1(value.directorDispatch))
  ) {
    return null;
  }
  try {
    assertProjectRevision(value.admittedRevision as unknown as ProjectRevisionV1);
    if (
      Number.isNaN(new Date(value.admittedAt as string).getTime())
      || Number.isNaN(new Date(value.updatedAt as string).getTime())
      || (value.phase1EvidenceCommittedAt !== undefined
        && Number.isNaN(new Date(value.phase1EvidenceCommittedAt as string).getTime()))
      || (value.phase2EvidenceCommittedAt !== undefined
        && Number.isNaN(new Date(value.phase2EvidenceCommittedAt as string).getTime()))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return structuredClone(value) as unknown as ProjectAnalysisRunV1;
}

const PROJECT_ANALYSIS_RUN_TRANSITIONS_V1: Readonly<
  Record<Exclude<ProjectAnalysisRunStateV1, "failed">, readonly ProjectAnalysisRunStateV1[]>
> = {
  queued: ["analyzing"],
  analyzing: ["transcribing"],
  transcribing: ["analyzing_visual_cuts", "cleaning", "computing_params", "analysis_complete"],
  analyzing_visual_cuts: ["cleaning", "computing_params", "analysis_complete"],
  cleaning: ["computing_params", "analysis_complete"],
  computing_params: ["analysis_complete"],
  analysis_complete: ["analyzing_deep", "directing_queued"],
  analyzing_deep: ["directing_queued"],
  directing_queued: [],
};

function isProjectAnalysisRunStateV1(value: unknown): value is ProjectAnalysisRunStateV1 {
  return typeof value === "string" && [
    "queued",
    "analyzing",
    "transcribing",
    "analyzing_visual_cuts",
    "cleaning",
    "computing_params",
    "analysis_complete",
    "analyzing_deep",
    "directing_queued",
    "failed",
  ].includes(value);
}

function assertProjectAnalysisRunAdvanceCommandV1(
  input: ProjectAnalysisRunAdvanceCommandV1,
): void {
  const fromState: unknown = input.fromState;
  const toState: unknown = input.toState;
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isProjectAnalysisRunStateV1(fromState)
    || fromState === "failed"
    || !isProjectAnalysisRunStateV1(toState)
    || toState === "queued"
    || toState === "failed"
    || !PROJECT_ANALYSIS_RUN_TRANSITIONS_V1[fromState].includes(toState)
  ) {
    throw new ProjectMutationWriteError(
      "Analysis advancement requires one exact revision, run, source and legal state transition.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

function assertProjectAnalysisRunFailureCommandV1(
  input: ProjectAnalysisRunFailureCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.errorMessage, 2_000)
  ) {
    throw new ProjectMutationWriteError(
      "Analysis failure requires one exact revision, run, source and bounded error.",
    );
  }
  assertProjectRevision(input.expectedRevision);
}

const PROJECT_ANALYSIS_PHASE1_EVIDENCE_FIELDS_V1 = new Set([
  "nativeAudioEvidence",
  "musicPreference",
  "editorialPreferences",
  "syntheticStoryboard",
  "geminiFileUri",
  "referenceEditDNA",
  "referenceVideoAnalysis",
  "rawFootageAnalysis",
  "vjepaAnalysis",
  "visualCutIntelligence",
  "genreParameters",
  "genreParametersSignalComputed",
]);

function assertProjectAnalysisPhase1CommitCommandV1(
  input: ProjectAnalysisPhase1CommitCommandV1,
): void {
  const fromState: unknown = input.fromState;
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !["transcribing", "analyzing_visual_cuts", "cleaning", "computing_params"].includes(
      String(fromState),
    )
    || !isPlainRecord(input.evidence)
    || Object.keys(input.evidence).some((key) => !PROJECT_ANALYSIS_PHASE1_EVIDENCE_FIELDS_V1.has(key))
    || Object.values(input.evidence).some((value) => value === undefined)
    || (input.evidence.musicPreference !== undefined
      && !isBoundedNonEmptyStringV1(input.evidence.musicPreference, 100))
    || (input.evidence.editorialPreferences !== undefined
      && !isPlainRecord(input.evidence.editorialPreferences))
    || (input.evidence.geminiFileUri !== undefined
      && !isBoundedNonEmptyStringV1(input.evidence.geminiFileUri, 2_000))
    || (input.evidence.nativeAudioEvidence !== undefined
      && !isValidProjectAnalysisNativeAudioEvidenceV1(input.evidence.nativeAudioEvidence))
  ) {
    throw new ProjectMutationWriteError(
      "Phase-1 analysis commit requires one exact run, source, revision, state and bounded evidence bundle.",
    );
  }
  assertProjectRevision(input.expectedRevision);
  try {
    const canonicalEvidence = canonicalizeEditronJsonV1(input.evidence);
    if (Buffer.byteLength(canonicalEvidence, "utf8") > 8_000_000) {
      throw new Error("PROJECT_ANALYSIS_EVIDENCE_TOO_LARGE");
    }
  } catch {
    throw new ProjectMutationWriteError(
      "Phase-1 analysis evidence must be canonical JSON below the project storage limit.",
    );
  }
}

function isValidProjectAnalysisNativeAudioEvidenceV1(value: unknown): value is NativeAudioEvidence {
  if (!isPlainRecord(value)) return false;
  const regions = value.speechRegions;
  return typeof value.hasNativeAudio === "boolean"
    && typeof value.hasSpeech === "boolean"
    && (value.source === "transcription" || value.source === "none")
    && Number.isInteger(value.wordCount)
    && (value.wordCount as number) >= 0
    && Number.isFinite(value.speechCoverage)
    && (value.speechCoverage as number) >= 0
    && (value.speechCoverage as number) <= 1
    && Array.isArray(regions)
    && regions.length <= 180
    && Number.isInteger(value.regionCount)
    && value.regionCount === regions.length
    && regions.every((region) => (
      isPlainRecord(region)
      && Number.isFinite(region.sourceStartFrame)
      && Number.isFinite(region.sourceEndFrame)
      && Number.isFinite(region.startMs)
      && Number.isFinite(region.endMs)
      && (region.sourceStartFrame as number) >= 0
      && (region.sourceEndFrame as number) > (region.sourceStartFrame as number)
      && (region.startMs as number) >= 0
      && (region.endMs as number) > (region.startMs as number)
    ));
}

function bindProjectAnalysisNativeAudioEvidenceV1(
  run: ProjectAnalysisRunV1,
  evidence: NativeAudioEvidence,
): NativeAudioEvidence {
  const material = {
    ...structuredClone(evidence),
    sourceAssetId: run.sourceAssetId,
    sourceVersion: run.admissionHash,
  };
  return {
    ...material,
    evidenceId: `native_audio_${hashEditronCanonicalJsonV1(material)}`,
  };
}

function isProjectAnalysisDeepLeaseV1(value: unknown): value is ProjectAnalysisDeepLeaseV1 {
  return isPlainRecord(value)
    && value.schemaVersion === 1
    && isBoundedNonEmptyStringV1(value.leaseId, 200)
    && isBoundedNonEmptyStringV1(value.claimedAt, 100)
    && isBoundedNonEmptyStringV1(value.expiresAt, 100)
    && !Number.isNaN(new Date(value.claimedAt).getTime())
    && !Number.isNaN(new Date(value.expiresAt).getTime())
    && new Date(value.expiresAt).getTime() > new Date(value.claimedAt).getTime();
}

function isProjectAnalysisDirectorDispatchV1(value: unknown): value is ProjectAnalysisDirectorDispatchV1 {
  if (
    !isPlainRecord(value)
    || value.schemaVersion !== 1
    || !isBoundedNonEmptyStringV1(value.deduplicationId, 200)
    || (value.status !== "pending" && value.status !== "published" && value.status !== "inline_ready")
    || !isBoundedNonEmptyStringV1(value.preparedAt, 100)
    || Number.isNaN(new Date(value.preparedAt).getTime())
  ) return false;
  if (value.status === "pending") {
    return value.publishedAt === undefined
      && value.providerMessageId === undefined
      && value.inlineReadyAt === undefined;
  }
  if (value.status === "inline_ready") {
    return value.publishedAt === undefined
      && value.providerMessageId === undefined
      && isBoundedNonEmptyStringV1(value.inlineReadyAt, 100)
      && !Number.isNaN(new Date(value.inlineReadyAt).getTime());
  }
  return isBoundedNonEmptyStringV1(value.publishedAt, 100)
    && !Number.isNaN(new Date(value.publishedAt).getTime())
    && isBoundedNonEmptyStringV1(value.providerMessageId, 500)
    && value.inlineReadyAt === undefined;
}

function isProjectAnalysisDeepDispatchV1(value: unknown): value is ProjectAnalysisDeepDispatchV1 {
  return isProjectAnalysisDirectorDispatchV1(value);
}

function isProjectAnalysisIntakeDispatchV1(value: unknown): value is ProjectAnalysisIntakeDispatchV1 {
  return isProjectAnalysisDirectorDispatchV1(value);
}

function createProjectAnalysisIntakeDispatchV1(input: {
  projectId: string;
  runId: string;
  sourceAssetId: string;
  admissionHash: string;
  preparedAt: Date;
}): ProjectAnalysisIntakeDispatchV1 {
  return {
    schemaVersion: 1,
    deduplicationId: `editron_analysis_${hashEditronCanonicalJsonV1({
      projectId: input.projectId,
      runId: input.runId,
      sourceAssetId: input.sourceAssetId,
      admissionHash: input.admissionHash,
    }).slice(0, 48)}`,
    status: "pending",
    preparedAt: input.preparedAt.toISOString(),
  };
}

function createProjectAnalysisDeepDispatchV1(input: {
  projectId: string;
  runId: string;
  sourceAssetId: string;
  phase1EvidenceHash: string;
  preparedAt: Date;
}): ProjectAnalysisDeepDispatchV1 {
  return {
    schemaVersion: 1,
    deduplicationId: `editron_tribe_${hashEditronCanonicalJsonV1({
      projectId: input.projectId,
      runId: input.runId,
      sourceAssetId: input.sourceAssetId,
      phase1EvidenceHash: input.phase1EvidenceHash,
    }).slice(0, 48)}`,
    status: "pending",
    preparedAt: input.preparedAt.toISOString(),
  };
}

function createProjectAnalysisDirectorDispatchV1(input: {
  projectId: string;
  runId: string;
  sourceAssetId: string;
  evidenceHash: string;
  preparedAt: Date;
}): ProjectAnalysisDirectorDispatchV1 {
  return {
    schemaVersion: 1,
    deduplicationId: `editron_director_${hashEditronCanonicalJsonV1({
      projectId: input.projectId,
      runId: input.runId,
      sourceAssetId: input.sourceAssetId,
      phase2EvidenceHash: input.evidenceHash,
    }).slice(0, 48)}`,
    status: "pending",
    preparedAt: input.preparedAt.toISOString(),
  };
}

function assertProjectAnalysisDeepClaimCommandV1(input: ProjectAnalysisDeepClaimCommandV1): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || (input.deepAnalysisDispatchId !== undefined
      && !isBoundedNonEmptyStringV1(input.deepAnalysisDispatchId, 200))
  ) throw new ProjectMutationWriteError("Deep-analysis claim requires one exact revision, run, source and optional dispatch.");
  assertProjectRevision(input.expectedRevision);
}

function assertProjectAnalysisDeepDispatchPrepareCommandV1(
  input: ProjectAnalysisDeepDispatchPrepareCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
  ) throw new ProjectMutationWriteError("Deep-analysis dispatch preparation requires one exact run, source and revision.");
  assertProjectRevision(input.expectedRevision);
}

function assertProjectAnalysisIntakeDispatchPublicationCommandV1(
  input: ProjectAnalysisIntakeDispatchPublicationCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.deduplicationId, 200)
    || !isBoundedNonEmptyStringV1(input.providerMessageId, 500)
  ) throw new ProjectMutationWriteError("Analysis intake publication requires one exact run, source, dispatch and provider message.");
  assertProjectRevision(input.expectedRevision);
}

function assertProjectAnalysisIntakeDispatchInlineReadyCommandV1(
  input: ProjectAnalysisIntakeDispatchInlineReadyCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.deduplicationId, 200)
  ) throw new ProjectMutationWriteError("Inline analysis intake activation requires one exact run, source, dispatch and revision.");
  assertProjectRevision(input.expectedRevision);
}

function assertProjectAnalysisDeepDispatchPublicationCommandV1(
  input: ProjectAnalysisDeepDispatchPublicationCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.deduplicationId, 200)
    || !isBoundedNonEmptyStringV1(input.providerMessageId, 500)
  ) throw new ProjectMutationWriteError("Deep-analysis publication requires one exact run, source, dispatch and provider message.");
  assertProjectRevision(input.expectedRevision);
}

function assertProjectAnalysisDeepDispatchInlineReadyCommandV1(
  input: ProjectAnalysisDeepDispatchInlineReadyCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.deduplicationId, 200)
  ) throw new ProjectMutationWriteError("Inline deep-analysis activation requires one exact run, source, dispatch and revision.");
  assertProjectRevision(input.expectedRevision);
}

const PROJECT_ANALYSIS_PHASE2_EVIDENCE_FIELDS_V1 = new Set([
  "vjepaAnalysis",
  "wav2vecAnalysis",
  "musicAnalysis",
  "momentWeightMap",
  "segmentAnalysis",
]);

function assertProjectAnalysisPhase2CommitCommandV1(input: ProjectAnalysisPhase2CommitCommandV1): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.leaseId, 200)
    || !isPlainRecord(input.evidence)
    || Object.keys(input.evidence).some((key) => !PROJECT_ANALYSIS_PHASE2_EVIDENCE_FIELDS_V1.has(key))
    || Object.values(input.evidence).some((value) => value === undefined)
  ) throw new ProjectMutationWriteError("Phase-2 analysis commit requires one exact lease and bounded evidence.");
  assertProjectRevision(input.expectedRevision);
  try {
    if (Buffer.byteLength(canonicalizeEditronJsonV1(input.evidence), "utf8") > 8_000_000) throw new Error();
  } catch {
    throw new ProjectMutationWriteError("Phase-2 analysis evidence must be canonical JSON below the project storage limit.");
  }
}

function assertProjectAnalysisDirectorDispatchPublicationCommandV1(
  input: ProjectAnalysisDirectorDispatchPublicationCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.deduplicationId, 200)
    || !isBoundedNonEmptyStringV1(input.providerMessageId, 500)
  ) throw new ProjectMutationWriteError("Director publication requires one exact run, source, revision and provider message.");
  assertProjectRevision(input.expectedRevision);
}

function assertProjectAnalysisDirectorDispatchPrepareCommandV1(
  input: ProjectAnalysisDirectorDispatchPrepareCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
  ) throw new ProjectMutationWriteError("Director dispatch preparation requires one exact run, source and revision.");
  assertProjectRevision(input.expectedRevision);
}

function assertProjectAnalysisDirectorDispatchInlineReadyCommandV1(
  input: ProjectAnalysisDirectorDispatchInlineReadyCommandV1,
): void {
  if (
    !isPlainRecord(input)
    || !input.expectedRevision
    || !isBoundedNonEmptyStringV1(input.runId, 200)
    || !isBoundedNonEmptyStringV1(input.sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(input.deduplicationId, 200)
  ) throw new ProjectMutationWriteError("Inline Director activation requires one exact run, source, dispatch and revision.");
  assertProjectRevision(input.expectedRevision);
}

function projectMutationReceiptAfterV1(
  projectId: string,
  expectedRevision: ProjectRevisionV1,
  committedAt: Date,
): ProjectMutationReceiptV1 {
  return {
    schemaVersion: 1,
    projectId,
    revision: {
      schemaVersion: 1,
      value: expectedRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    },
    committedAt: committedAt.toISOString(),
  };
}

function assertCheckpointRestoreFields(
  setFields: Record<string, unknown>,
  unsetFields: string[],
): void {
  const protectedFields = new Set([
    "_id",
    "projectId",
    "userId",
    "orgId",
    "sharedWith",
    "visibility",
    "createdAt",
    "updatedAt",
    "projectRevision",
    "timelineRangeChangeReceipts",
    "timelineRangeCutLocks",
    "lastAutosaveAt",
  ]);
  const fieldNames = [...Object.keys(setFields), ...unsetFields];
  if (
    fieldNames.some((field) => protectedFields.has(field)) ||
    new Set(fieldNames).size !== fieldNames.length
  ) {
    throw new ProjectMutationWriteError();
  }
}

function assertGenericProjectUpdateFields(
  setFields: Record<string, unknown>,
  unsetFields: string[],
): void {
  assertCheckpointRestoreFields(setFields, unsetFields);
  const fields = [...Object.keys(setFields), ...unsetFields];
  if (fields.some((field) => (
    typeof field !== "string"
    || field.length === 0
    || field.length > 500
    || field.trim() !== field
    || field.startsWith("$")
    || field.includes("\0")
  ))) {
    throw new ProjectMutationWriteError("Project metadata field path is invalid.");
  }
  if (fields.some((field) =>
    field === "generatedCompositions"
    || field.startsWith("generatedCompositions."))) {
    throw new ProjectMutationWriteError(
      "Generated composition state must use its ProjectService command boundary.",
    );
  }
  if (fields.some((field) =>
    field === "proxySourceBindingsV1"
    || field.startsWith("proxySourceBindingsV1.")
    || field === "proxyMasterRelinkStatesV1"
    || field.startsWith("proxyMasterRelinkStatesV1."))) {
    throw new ProjectMutationWriteError(
      "Proxy source bindings and relink state must use their ProjectService command boundaries.",
    );
  }
}

function assertProjectBatchAutoEditLifecycleCommandV1(
  input: ProjectBatchAutoEditLifecycleCommandV1,
): void {
  assertProjectRevision(input.expectedRevision);
  if (
    !isBoundedNonEmptyStringV1(input.uploadBatchId, 256)
    || !isBoundedNonEmptyStringV1(input.transitionId, 256)
  ) {
    throw new ProjectMutationWriteError(
      "Batch auto-edit lifecycle requires upload-batch and transition identities.",
    );
  }
  if (input.event.kind === "COVERAGE_RESUME_STARTED") {
    if (
      input.event.sourceAssetIds.length === 0
      || input.event.sourceAssetIds.length > 10_000
      || new Set(input.event.sourceAssetIds).size !== input.event.sourceAssetIds.length
      || input.event.sourceAssetIds.some((assetId) => !isBoundedNonEmptyStringV1(assetId, 256))
      || (input.event.previousScriptCoverage !== null
        && (!input.event.previousScriptCoverage
          || typeof input.event.previousScriptCoverage !== "object"
          || Array.isArray(input.event.previousScriptCoverage)))
    ) {
      throw new ProjectMutationWriteError("Coverage resume facts are malformed.");
    }
    return;
  }
  if (
    input.event.kind === "COVERAGE_RESUME_DISPATCH_FAILED"
    || input.event.kind === "SCRIPT_GROUNDING_NEEDS_INPUT"
    || input.event.kind === "SCRIPT_GROUNDING_FAILED"
  ) {
    if (
      !isBoundedNonEmptyStringV1(input.event.errorMessage, 4_000)
      || (input.event.scriptCoverage !== null
        && (!input.event.scriptCoverage
          || typeof input.event.scriptCoverage !== "object"
          || Array.isArray(input.event.scriptCoverage)))
    ) {
      throw new ProjectMutationWriteError("Script-coverage lifecycle facts are malformed.");
    }
    return;
  }
  if (
    input.event.kind === "PRE_DIRECTOR_REFUND_PENDING"
    || input.event.kind === "PRE_DIRECTOR_REFUND_RECORDED"
  ) {
    if (
      !isBoundedNonEmptyStringV1(input.event.creditTransactionId, 256)
      || !Number.isFinite(input.event.chargedCredits)
      || input.event.chargedCredits < 0
      || !isBoundedNonEmptyStringV1(input.event.reason, 4_000)
    ) {
      throw new ProjectMutationWriteError("Auto-edit refund facts are malformed.");
    }
    return;
  }
  if (!isBoundedNonEmptyStringV1(input.event.errorMessage, 4_000)) {
    throw new ProjectMutationWriteError("Batch auto-edit failure requires a bounded error.");
  }
}

function batchAutoEditLifecycleEligibleStatusesV1(
  kind: ProjectBatchAutoEditLifecycleEventV1["kind"],
): ReadonlySet<string> {
  switch (kind) {
    case "COVERAGE_RESUME_STARTED":
      return new Set(["needs_input"]);
    case "COVERAGE_RESUME_DISPATCH_FAILED":
      return new Set(["analyzing"]);
    case "PRE_DIRECTOR_REFUND_PENDING":
    case "PRE_DIRECTOR_REFUND_RECORDED":
      return new Set(["analyzing", "analysis_complete", "directing_queued"]);
    case "ORCHESTRATION_FAILED":
      return new Set(["analyzing", "analysis_complete", "directing_queued"]);
    default:
      return new Set(["analyzing"]);
  }
}

function batchAutoEditLifecycleUpdateV1(
  uploadBatchId: string,
  transitionId: string,
  previousStatus: string,
  event: ProjectBatchAutoEditLifecycleEventV1,
  committedAt: Date,
): {
  set: Record<string, unknown>;
  unset: Record<string, "">;
  filter: Record<string, unknown>;
} {
  const audit = {
    schemaVersion: 1,
    uploadBatchId,
    transitionId,
    event: event.kind,
    previousStatus,
    committedAt: committedAt.toISOString(),
  };
  switch (event.kind) {
    case "COVERAGE_RESUME_STARTED":
      return {
        set: {
          autoEditStatus: "analyzing",
          autoEditStageDesc: "Analyzing additional footage",
          sourceAssetIds: [...event.sourceAssetIds],
          "storylinePlan.previousScriptCoverage": structuredClone(event.previousScriptCoverage),
          "intelligence.batchAutoEditLifecycle": audit,
          updatedAt: committedAt,
        },
        unset: {
          autoEditError: "",
          autoEditFailedAt: "",
          "storylinePlan.scriptCoverage": "",
        },
        filter: {},
      };
    case "COVERAGE_RESUME_DISPATCH_FAILED":
      return {
        set: {
          autoEditStatus: "needs_input",
          autoEditError: event.errorMessage,
          autoEditStageDesc: "More footage needed",
          "storylinePlan.scriptCoverage": structuredClone(event.scriptCoverage),
          "intelligence.batchAutoEditLifecycle": audit,
          updatedAt: committedAt,
        },
        unset: {},
        filter: {},
      };
    case "SCRIPT_GROUNDING_NEEDS_INPUT":
    case "SCRIPT_GROUNDING_FAILED": {
      const needsInput = event.kind === "SCRIPT_GROUNDING_NEEDS_INPUT";
      return {
        set: {
          autoEditStatus: needsInput ? "needs_input" : "failed",
          autoEditError: event.errorMessage,
          autoEditStageDesc: needsInput ? "More footage needed" : "Script grounding failed",
          ...(needsInput ? {} : { autoEditFailedAt: committedAt }),
          "storylinePlan.scriptCoverage": structuredClone(event.scriptCoverage),
          "intelligence.batchAutoEditLifecycle": audit,
          updatedAt: committedAt,
        },
        unset: {},
        filter: {},
      };
    }
    case "PRE_DIRECTOR_REFUND_PENDING":
      return {
        set: {
          autoEditRefundPending: {
            schemaVersion: 1,
            uploadBatchId,
            creditTransactionId: event.creditTransactionId,
            chargedCredits: event.chargedCredits,
            reason: event.reason,
            requestedAt: committedAt.toISOString(),
          },
          "intelligence.batchAutoEditLifecycle": audit,
          updatedAt: committedAt,
        },
        unset: {},
        filter: {
          autoEditRefunded: { $ne: true },
          autoEditRefundPending: null,
        },
      };
    case "PRE_DIRECTOR_REFUND_RECORDED":
      return {
        set: {
          autoEditRefunded: true,
          autoEditRefundedAt: committedAt,
          autoEditRefundReceipt: {
            schemaVersion: 1,
            uploadBatchId,
            creditTransactionId: event.creditTransactionId,
            chargedCredits: event.chargedCredits,
            reason: event.reason,
            committedAt: committedAt.toISOString(),
          },
          "intelligence.batchAutoEditLifecycle": audit,
          updatedAt: committedAt,
        },
        unset: { autoEditRefundPending: "" },
        filter: {
          "autoEditRefundPending.schemaVersion": 1,
          "autoEditRefundPending.uploadBatchId": uploadBatchId,
          "autoEditRefundPending.creditTransactionId": event.creditTransactionId,
          "autoEditRefundPending.chargedCredits": event.chargedCredits,
          "autoEditRefundPending.reason": event.reason,
          autoEditRefunded: { $ne: true },
        },
      };
    default: {
      const stage = event.kind === "NO_USABLE_VISUAL_ASSETS"
        ? "No usable media"
        : event.kind === "ANALYSIS_DEADLINE_EXHAUSTED"
          ? "Analysis failed"
          : event.kind === "INSUFFICIENT_CREDITS"
            ? "Insufficient credits"
            : "Auto-edit failed";
      return {
        set: {
          autoEditStatus: "failed",
          autoEditError: event.errorMessage,
          autoEditFailedAt: committedAt,
          autoEditStageDesc: stage,
          "intelligence.batchAutoEditLifecycle": audit,
          updatedAt: committedAt,
        },
        unset: {},
        filter: {},
      };
    }
  }
}

type ProjectProxySourceBindingAssetRecordV1 =
  Parameters<typeof resolveVerifiedVideoSourceEpochTimeBindingV3>[0]
  & Readonly<{ isProxy?: unknown }>;

type ProjectProxySourceBindingVerifiedV3 = NonNullable<
ReturnType<typeof resolveVerifiedVideoSourceEpochTimeBindingV3>
>;

type ProjectProxySourceBindingAssetEvidenceV1 = Readonly<{
  verifiedBinding: ProjectProxySourceBindingVerifiedV3;
  proxyTimeMapReference: MediaProxyMasterTimeMapReferenceV1;
  proxyTimeMapReferenceSha256: string;
}>;

class ProjectProxySourceBindingPreparationErrorV1 extends Error {
  constructor(
    readonly reason: ProjectProxySourceBindingBlockReasonV1,
    message: string,
  ) {
    super(message);
    this.name = "ProjectProxySourceBindingPreparationErrorV1";
  }
}

function readProjectProxySourceBindingAssetEvidenceV1(
  asset: ProjectProxySourceBindingAssetRecordV1,
  assetId: string,
): ProjectProxySourceBindingAssetEvidenceV1 {
  if (asset.isProxy !== true) {
    throw new ProjectProxySourceBindingPreparationErrorV1(
      "VERIFIED_V3_PROXY_SOURCE_REQUIRED",
      "The current source must still be explicitly identified as the proxy.",
    );
  }
  let verifiedBinding: ProjectProxySourceBindingVerifiedV3 | null;
  try {
    verifiedBinding = resolveVerifiedVideoSourceEpochTimeBindingV3(asset);
  } catch {
    verifiedBinding = null;
  }
  if (!verifiedBinding || verifiedBinding.assetId !== assetId) {
    throw new ProjectProxySourceBindingPreparationErrorV1(
      "VERIFIED_V3_PROXY_SOURCE_REQUIRED",
      "A complete current verified V3 proxy-source binding is required.",
    );
  }
  const proxyTimeMapReference = {
    sourceVersionSha256: verifiedBinding.sourceVersionSha256,
    storageVersionSha256: verifiedBinding.storageVersionSha256,
    sourceBindingSha256: verifiedBinding.sourceBindingSha256,
    technicalObservationSha256:
      verifiedBinding.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3:
      verifiedBinding.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: verifiedBinding.mapBindingSha256,
    terminalReceiptSha256: verifiedBinding.terminalReceiptSha256,
    verificationSha256: verifiedBinding.verificationSha256,
    epochIndexContentSha256: verifiedBinding.epochIndexContentSha256,
    streamId: verifiedBinding.streamId,
    videoStreamIndex: verifiedBinding.videoStreamIndex,
    totalFrameCount: verifiedBinding.totalSourceFrameCount,
  } satisfies MediaProxyMasterTimeMapReferenceV1;
  return {
    verifiedBinding,
    proxyTimeMapReference,
    proxyTimeMapReferenceSha256:
      hashEditronCanonicalJsonV1(proxyTimeMapReference),
  };
}

function prepareProjectProxySourceBindingOverlaysV1(input: Readonly<{
  project: Project;
  assetId: string;
  totalSourceFrameCount: string;
}>): readonly ProjectProxySourceBindingOverlayV1[] {
  let totalSourceFrameCount: bigint;
  try {
    totalSourceFrameCount = BigInt(input.totalSourceFrameCount);
  } catch {
    throw new ProjectProxySourceBindingPreparationErrorV1(
      "VERIFIED_V3_PROXY_SOURCE_REQUIRED",
      "The verified V3 proxy frame count is invalid.",
    );
  }
  if (totalSourceFrameCount <= BigInt(0)) {
    throw new ProjectProxySourceBindingPreparationErrorV1(
      "VERIFIED_V3_PROXY_SOURCE_REQUIRED",
      "The verified V3 proxy frame count must be positive.",
    );
  }
  const targets = input.project.overlays.filter(
    (overlay): overlay is ClipOverlay =>
      overlay.type === "video" && overlay.assetId === input.assetId,
  );
  if (targets.length === 0) {
    throw new ProjectProxySourceBindingPreparationErrorV1(
      "TARGET_OVERLAYS_NOT_FOUND",
      "No video overlay uses the current verified proxy source.",
    );
  }
  if (targets.length
    > PROJECT_PROXY_MASTER_RELINK_POLICY_V1.maxTargetOverlays) {
    throw new ProjectProxySourceBindingPreparationErrorV1(
      "SOURCE_RANGE_INVALID",
      "The proxy source-binding overlay limit was exceeded.",
    );
  }
  const overlays = targets.map((overlay) => {
    if (!Number.isSafeInteger(overlay.id) || overlay.id < 0) {
      throw new ProjectProxySourceBindingPreparationErrorV1(
        "TARGET_OVERLAY_IDENTITY_INVALID",
        "Proxy source bindings require non-negative numeric overlay IDs.",
      );
    }
    const sourceStartFrameWasExplicit = overlay.sourceStartFrame !== undefined;
    const videoStartTimeWasExplicit = overlay.videoStartTime !== undefined;
    const sourceEndFrameWasExplicit = overlay.sourceEndFrame !== undefined;
    if ((!sourceStartFrameWasExplicit && !videoStartTimeWasExplicit)
      || !sourceEndFrameWasExplicit) {
      throw new ProjectProxySourceBindingPreparationErrorV1(
        "SOURCE_RANGE_INCOMPLETE",
        "Every proxy target requires an explicit source start alias and exclusive source end.",
      );
    }
    const sourceStartFrame = sourceStartFrameWasExplicit
      ? overlay.sourceStartFrame
      : overlay.videoStartTime;
    const sourceEndFrameExclusive = overlay.sourceEndFrame;
    if (!Number.isSafeInteger(sourceStartFrame)
      || !Number.isSafeInteger(sourceEndFrameExclusive)
      || (sourceStartFrame as number) < 0
      || (sourceEndFrameExclusive as number) <= (sourceStartFrame as number)
      || BigInt(sourceEndFrameExclusive as number) > totalSourceFrameCount
      || !Number.isSafeInteger(overlay.from) || overlay.from < 0
      || !Number.isSafeInteger(overlay.durationInFrames)
      || overlay.durationInFrames <= 0
      || !Number.isSafeInteger(overlay.from + overlay.durationInFrames)) {
      throw new ProjectProxySourceBindingPreparationErrorV1(
        "SOURCE_RANGE_INVALID",
        "Proxy source and timeline ranges must be bounded safe-integer intervals.",
      );
    }
    if (sourceStartFrameWasExplicit && videoStartTimeWasExplicit
      && overlay.sourceStartFrame !== overlay.videoStartTime) {
      throw new ProjectProxySourceBindingPreparationErrorV1(
        "SOURCE_COORDINATE_CONFLICT",
        "sourceStartFrame and videoStartTime disagree for a proxy target.",
      );
    }
    return {
      overlayId: overlay.id,
      timelineStartFrame: overlay.from,
      timelineEndFrameExclusive: overlay.from + overlay.durationInFrames,
      proxySourceStartFrame: sourceStartFrame as number,
      proxySourceEndFrameExclusive: sourceEndFrameExclusive as number,
      sourceStartFrameWasExplicit,
      sourceEndFrameWasExplicit: true as const,
      videoStartTimeWasExplicit,
    };
  }).sort((left, right) => left.overlayId - right.overlayId);
  if (overlays.some((overlay, index) =>
    index > 0 && overlay.overlayId === overlays[index - 1]!.overlayId)) {
    throw new ProjectProxySourceBindingPreparationErrorV1(
      "TARGET_OVERLAY_IDENTITY_INVALID",
      "Proxy source bindings require unique numeric overlay IDs.",
    );
  }
  return overlays;
}

function projectProxySourceBindingMatchesCurrentEvidenceV1(input: Readonly<{
  binding: ProjectProxySourceBindingV1;
  currentRevision: ProjectRevisionV1;
  evidence: ProjectProxySourceBindingAssetEvidenceV1;
  overlays: readonly ProjectProxySourceBindingOverlayV1[];
}>): boolean {
  return sameProjectRevisionV1(
    input.binding.projectRevision,
    input.currentRevision,
  )
    && input.binding.proxySourceVersionSha256
      === input.evidence.verifiedBinding.sourceVersionSha256
    && input.binding.verifiedSourceBindingSha256
      === input.evidence.verifiedBinding.bindingSha256
    && input.binding.proxyTimeMapReferenceSha256
      === input.evidence.proxyTimeMapReferenceSha256
    && hashEditronCanonicalJsonV1(input.binding.overlays)
      === hashEditronCanonicalJsonV1(input.overlays);
}

function sameProjectProxySourceBindingAssetEvidenceV1(
  left: ProjectProxySourceBindingAssetEvidenceV1,
  right: ProjectProxySourceBindingAssetEvidenceV1,
): boolean {
  return left.verifiedBinding.bindingSha256
      === right.verifiedBinding.bindingSha256
    && left.proxyTimeMapReferenceSha256
      === right.proxyTimeMapReferenceSha256;
}

function projectProxySourceBindingMutationReceiptFromBindingV1(
  binding: ProjectProxySourceBindingV1,
): ProjectMutationReceiptV1 {
  return {
    schemaVersion: 1,
    projectId: binding.projectId,
    revision: binding.projectRevision,
    committedAt: binding.boundAt,
  };
}

type ProjectVideoSourceVersionPinAssignmentV1 = Readonly<{
  projectId: string;
  assetId: string;
  targetOverlayIds: readonly number[];
  sourceRole: ProjectVideoSourceVersionPinV1["sourceRole"];
  sourceVersionSha256: string;
  storageVersionSha256: string;
  authority: ProjectVideoSourceVersionPinAuthorityV1;
  issuedAt: Date;
}>;

function applyProjectVideoSourceVersionPinsV1(
  input: ProjectVideoSourceVersionPinAssignmentV1
    & Readonly<{ overlays: readonly Overlay[] }>,
): Overlay[] {
  const targetIds = projectVideoSourceVersionPinTargetIdsV1(
    input.targetOverlayIds,
  );
  if (!targetIds) {
    throw new ProjectMutationWriteError(
      "Project video source pins require unique numeric target overlays.",
    );
  }
  let appliedCount = 0;
  const overlays = input.overlays.map((overlay) => {
    if (overlay.type !== "video" || overlay.assetId !== input.assetId
      || !targetIds.has(overlay.id)) return overlay;
    appliedCount += 1;
    return {
      ...overlay,
      sourceVersionPinV1: createProjectVideoSourceVersionPinV1({
        projectId: input.projectId,
        overlayId: overlay.id,
        assetId: input.assetId,
        sourceRole: input.sourceRole,
        sourceVersionSha256: input.sourceVersionSha256,
        storageVersionSha256: input.storageVersionSha256,
        authority: input.authority,
        issuedAt: input.issuedAt,
      }),
    };
  });
  if (appliedCount !== targetIds.size) {
    throw new ProjectMutationWriteError(
      "Project video source pin targets changed before persistence.",
    );
  }
  return overlays;
}

function projectOverlaysMatchSourceVersionPinsV1(
  input: ProjectVideoSourceVersionPinAssignmentV1
    & Readonly<{ overlays: readonly Overlay[] }>,
): boolean {
  const targetIds = projectVideoSourceVersionPinTargetIdsV1(
    input.targetOverlayIds,
  );
  if (!targetIds) return false;
  let matchedCount = 0;
  for (const overlay of input.overlays) {
    if (overlay.type !== "video" || overlay.assetId !== input.assetId) {
      continue;
    }
    if (!targetIds.has(overlay.id)) return false;
    matchedCount += 1;
    const expected = createProjectVideoSourceVersionPinV1({
      projectId: input.projectId,
      overlayId: overlay.id,
      assetId: input.assetId,
      sourceRole: input.sourceRole,
      sourceVersionSha256: input.sourceVersionSha256,
      storageVersionSha256: input.storageVersionSha256,
      authority: input.authority,
      issuedAt: input.issuedAt,
    });
    if (!projectVideoSourceVersionPinMatchesV1(
      overlay.sourceVersionPinV1,
      expected,
    )) return false;
  }
  return matchedCount === targetIds.size;
}

function projectVideoSourceVersionPinMatchesV1(
  value: unknown,
  expected: ProjectVideoSourceVersionPinV1,
): boolean {
  try {
    return assertProjectVideoSourceVersionPinV1(value).pinSha256
      === expected.pinSha256;
  } catch {
    return false;
  }
}

function projectVideoSourceVersionPinTargetIdsV1(
  value: readonly number[],
): ReadonlySet<number> | null {
  if (value.length === 0
    || value.some((overlayId) =>
      !Number.isSafeInteger(overlayId) || overlayId < 0)) return null;
  const ids = new Set(value);
  return ids.size === value.length ? ids : null;
}

type ProjectProxyMasterRelinkAssetRecordV1 =
  MediaProxyMasterActiveMappingAssetInputV1 & Readonly<{
    audioRights?: unknown;
  }>;

type ProjectProxyMasterRelinkAssetEvidenceV1 = Readonly<{
  activeMappingState: MediaProxyMasterActiveMappingAssetStateV1;
  audioRightsEvidenceSha256: string | null;
}>;

type ProjectProxyMasterPreparedRelinkV1 = Readonly<{
  overlays: Overlay[];
  overlayChanges: readonly ProjectProxyMasterRelinkOverlayChangeV1[];
}>;

class ProjectProxyMasterRelinkPreparationErrorV1 extends Error {
  constructor(
    readonly reason: ProjectProxyMasterRelinkBlockReasonV1,
    message: string,
  ) {
    super(message);
    this.name = "ProjectProxyMasterRelinkPreparationErrorV1";
  }
}

function assertProjectProxyMasterRelinkActorAndAssetV1(
  actorKind: ProjectProxyMasterRelinkActorKindV1,
  assetId: string,
): void {
  if (actorKind !== "USER" && actorKind !== "AGENT"
    && actorKind !== "SYSTEM") {
    throw new ProjectMutationWriteError(
      "A proxy/master relink requires an explicit actor.",
    );
  }
  if (typeof assetId !== "string" || assetId.trim() !== assetId
    || assetId.length === 0 || assetId.length > 512
    || /[^\x21-\x7E]/.test(assetId)) {
    throw new ProjectMutationWriteError(
      "A proxy/master relink requires one stable ASCII asset identity.",
    );
  }
}

function readProjectProxyMasterRelinkAssetEvidenceV1(
  asset: ProjectProxyMasterRelinkAssetRecordV1,
  assetId: string,
): ProjectProxyMasterRelinkAssetEvidenceV1 {
  let activeMappingState: MediaProxyMasterActiveMappingAssetStateV1 | null;
  try {
    activeMappingState = readMediaProxyMasterActiveMappingAssetStateV1(asset);
  } catch {
    throw new ProjectProxyMasterRelinkPreparationErrorV1(
      "ACTIVE_MAPPING_INVALID",
      "The active proxy/master mapping does not match the current media asset.",
    );
  }
  if (!activeMappingState) {
    throw new ProjectProxyMasterRelinkPreparationErrorV1(
      "ACTIVE_MAPPING_NOT_FOUND",
      "The media asset has no qualified active proxy/master mapping.",
    );
  }
  const mapping = activeMappingState.proxyMasterActiveMappingV1
    .qualification.mapping;
  if (mapping.audio.disposition === "NO_AUDIO_IN_EITHER_SOURCE") {
    return { activeMappingState, audioRightsEvidenceSha256: null };
  }
  const issue = getAudioRightsContractIssue(asset.audioRights);
  const rights = asset.audioRights as AudioRightsContract | undefined;
  if (issue || !rights || rights.licensed !== true
    || rights.userChoice !== "attested"
    || rights.mediaRole !== "native-video"
    || rights.evidence?.sourceAssetId !== assetId) {
    throw new ProjectProxyMasterRelinkPreparationErrorV1(
      "AUDIO_RIGHTS_REQUIRED_OR_INVALID",
      "Playable native audio requires current source-bound rights evidence before relink.",
    );
  }
  return {
    activeMappingState,
    audioRightsEvidenceSha256: hashEditronCanonicalJsonV1(rights),
  };
}

function prepareProjectProxyMasterRelinkV1(input: Readonly<{
  project: Project;
  currentRevision: ProjectRevisionV1;
  sourceBinding: ProjectProxySourceBindingV1;
  activeMappingState: MediaProxyMasterActiveMappingAssetStateV1;
  boundaryResolution: MediaProxyMasterExactBoundaryResolutionReceiptV1;
}>): ProjectProxyMasterPreparedRelinkV1 {
  const active = input.activeMappingState.proxyMasterActiveMappingV1;
  const relation = active.qualification.relation;
  const binding = input.sourceBinding;
  if (!sameProjectRevisionV1(binding.projectRevision, input.currentRevision)
    || binding.assetId !== relation.assetId
    || binding.projectId !== input.project.projectId
    || binding.proxySourceVersionSha256
      !== relation.proxy.sourceVersionSha256
    || binding.proxyTimeMapReferenceSha256
      !== hashEditronCanonicalJsonV1(
        active.qualification.mapping.proxyTimeMap,
      )
    || Date.parse(binding.boundAt) >= Date.parse(active.activatedAt)) {
    throw new ProjectProxyMasterRelinkPreparationErrorV1(
      "SOURCE_BINDING_STALE_OR_MISMATCHED",
      "The proxy source binding is not current for this project and mapping.",
    );
  }
  const targets = input.project.overlays
    .filter((overlay): overlay is ClipOverlay =>
      overlay.type === "video" && overlay.assetId === relation.assetId)
    .sort((left, right) => left.id - right.id);
  if (targets.length === 0) {
    throw new ProjectProxyMasterRelinkPreparationErrorV1(
      "TARGET_OVERLAYS_NOT_FOUND",
      "No video overlay uses the qualified proxy/master asset.",
    );
  }
  if (targets.length !== binding.overlays.length) {
    throw new ProjectProxyMasterRelinkPreparationErrorV1(
      "SOURCE_BINDING_STALE_OR_MISMATCHED",
      "The current asset-backed overlay set differs from its proxy binding.",
    );
  }
  const bindingById = new Map(
    binding.overlays.map((entry) => [entry.overlayId, entry]),
  );
  const masterByProxyBoundary = new Map(
    input.boundaryResolution.resolvedBoundaries.map((entry) => [
      entry.proxyBoundaryOrdinal,
      entry.masterBoundaryOrdinal,
    ]),
  );
  const updates = new Map<Overlay, Overlay>();
  const overlayChanges: ProjectProxyMasterRelinkOverlayChangeV1[] = [];
  let previousOverlayId = -1;
  for (const overlay of targets) {
    if (!Number.isSafeInteger(overlay.id) || overlay.id < 0
      || overlay.id <= previousOverlayId) {
      throw new ProjectProxyMasterRelinkPreparationErrorV1(
        "TARGET_OVERLAY_IDENTITY_INVALID",
        "Relink targets require unique non-negative numeric overlay IDs.",
      );
    }
    previousOverlayId = overlay.id;
    const sourceStartFrameWasExplicit = overlay.sourceStartFrame !== undefined;
    const videoStartTimeWasExplicit = overlay.videoStartTime !== undefined;
    const sourceEndFrameWasExplicit = overlay.sourceEndFrame !== undefined;
    if ((!sourceStartFrameWasExplicit && !videoStartTimeWasExplicit)
      || !sourceEndFrameWasExplicit) {
      throw new ProjectProxyMasterRelinkPreparationErrorV1(
        "SOURCE_RANGE_INCOMPLETE",
        "Every relink target requires an explicit source start alias and exclusive source end.",
      );
    }
    const sourceStartFrame = sourceStartFrameWasExplicit
      ? overlay.sourceStartFrame
      : overlay.videoStartTime;
    const sourceEndFrameExclusive = overlay.sourceEndFrame;
    if (!Number.isSafeInteger(sourceStartFrame)
      || !Number.isSafeInteger(sourceEndFrameExclusive)
      || (sourceStartFrame as number) < 0
      || (sourceEndFrameExclusive as number) <= (sourceStartFrame as number)
      || !Number.isSafeInteger(overlay.from) || overlay.from < 0
      || !Number.isSafeInteger(overlay.durationInFrames)
      || overlay.durationInFrames <= 0
      || !Number.isSafeInteger(overlay.from + overlay.durationInFrames)) {
      throw new ProjectProxyMasterRelinkPreparationErrorV1(
        "SOURCE_RANGE_INVALID",
        "Relink source and timeline ranges must be positive safe-integer intervals.",
      );
    }
    if (sourceStartFrameWasExplicit && videoStartTimeWasExplicit
      && overlay.sourceStartFrame !== overlay.videoStartTime) {
      throw new ProjectProxyMasterRelinkPreparationErrorV1(
        "SOURCE_COORDINATE_CONFLICT",
        "sourceStartFrame and videoStartTime disagree for a relink target.",
      );
    }
    const bound = bindingById.get(overlay.id);
    if (!bound
      || bound.timelineStartFrame !== overlay.from
      || bound.timelineEndFrameExclusive
        !== overlay.from + overlay.durationInFrames
      || bound.proxySourceStartFrame !== sourceStartFrame
      || bound.proxySourceEndFrameExclusive !== sourceEndFrameExclusive
      || bound.sourceStartFrameWasExplicit !== sourceStartFrameWasExplicit
      || bound.sourceEndFrameWasExplicit !== true
      || bound.videoStartTimeWasExplicit !== videoStartTimeWasExplicit) {
      throw new ProjectProxyMasterRelinkPreparationErrorV1(
        "SOURCE_BINDING_STALE_OR_MISMATCHED",
        "A current overlay no longer matches its proxy source-binding receipt.",
      );
    }
    const expectedProxyPin = createProjectVideoSourceVersionPinV1({
      projectId: input.project.projectId,
      overlayId: overlay.id,
      assetId: relation.assetId,
      sourceRole: "PROXY",
      sourceVersionSha256: relation.proxy.sourceVersionSha256,
      storageVersionSha256: relation.proxy.storageVersionSha256,
      authority: {
        kind: "PROJECT_PROXY_SOURCE_BINDING",
        bindingSha256: binding.bindingSha256,
        proxyTimeMapReferenceSha256:
          binding.proxyTimeMapReferenceSha256,
      },
      issuedAt: new Date(binding.boundAt),
    });
    if (!projectVideoSourceVersionPinMatchesV1(
      overlay.sourceVersionPinV1,
      expectedProxyPin,
    )) {
      throw new ProjectProxyMasterRelinkPreparationErrorV1(
        "SOURCE_PIN_MISSING_OR_INVALID",
        "Every relink target must carry its current ProjectService proxy source pin.",
      );
    }
    const masterStartText = masterByProxyBoundary.get(
      String(sourceStartFrame),
    );
    const masterEndText = masterByProxyBoundary.get(
      String(sourceEndFrameExclusive),
    );
    if (!masterStartText || !masterEndText) {
      throw new ProjectProxyMasterRelinkPreparationErrorV1(
        "BOUNDARY_EVIDENCE_INVALID",
        "The boundary receipt does not resolve every target source in/out.",
      );
    }
    const masterSourceStartFrame = safeProjectSourceOrdinalV1(masterStartText);
    const masterSourceEndFrameExclusive = safeProjectSourceOrdinalV1(
      masterEndText,
    );
    if (masterSourceEndFrameExclusive <= masterSourceStartFrame) {
      throw new ProjectProxyMasterRelinkPreparationErrorV1(
        "SOURCE_RANGE_INVALID",
        "The exact master source interval is empty or reversed.",
      );
    }
    const change: ProjectProxyMasterRelinkOverlayChangeV1 = {
      overlayId: overlay.id,
      timelineStartFrame: overlay.from,
      timelineEndFrameExclusive: overlay.from + overlay.durationInFrames,
      proxySourceStartFrame: sourceStartFrame as number,
      proxySourceEndFrameExclusive: sourceEndFrameExclusive as number,
      masterSourceStartFrame,
      masterSourceEndFrameExclusive,
      sourceStartFrameWasExplicit,
      sourceEndFrameWasExplicit: true,
      videoStartTimeWasExplicit,
    };
    overlayChanges.push(change);
    updates.set(overlay, withAtomicOverlayUpdateReceipt(
      overlay,
      {
        sourceStartFrame: masterSourceStartFrame,
        sourceEndFrame: masterSourceEndFrameExclusive,
        ...(videoStartTimeWasExplicit
          ? { videoStartTime: masterSourceStartFrame }
          : {}),
      } as Partial<Overlay>,
      {
        source: "project-service-proxy-master-relink-v1",
        intent: "relink-proxy-to-qualified-master",
        reason: "exact qualified proxy/master boundaries persisted through ProjectService",
      },
    ));
  }
  return {
    overlays: input.project.overlays.map((overlay) =>
      updates.get(overlay) ?? overlay),
    overlayChanges,
  };
}

function projectMatchesCommittedProxyMasterRelinkStateV1(
  project: Project,
  state: ProjectProxyMasterRelinkStateV1,
  activeMappingState: MediaProxyMasterActiveMappingAssetStateV1,
): boolean {
  const relation = activeMappingState.proxyMasterActiveMappingV1
    .qualification.relation;
  const targets = project.overlays.filter((overlay): overlay is ClipOverlay =>
    overlay.type === "video" && overlay.assetId === state.assetId);
  if (targets.length !== state.overlayChanges.length) return false;
  const targetsById = new Map<number, ClipOverlay>();
  for (const overlay of targets) {
    if (targetsById.has(overlay.id)) return false;
    targetsById.set(overlay.id, overlay);
  }
  return state.overlayChanges.every((change) => {
    const overlay = targetsById.get(change.overlayId);
    const expectedMasterPin = createProjectVideoSourceVersionPinV1({
      projectId: state.projectId,
      overlayId: change.overlayId,
      assetId: state.assetId,
      sourceRole: "MASTER",
      sourceVersionSha256: relation.master.sourceVersionSha256,
      storageVersionSha256: relation.master.storageVersionSha256,
      authority: {
        kind: "PROJECT_PROXY_MASTER_RELINK",
        relinkStateSha256: state.stateSha256,
        relationSha256: state.relationSha256,
        activeMappingStateSha256: state.activeMappingStateSha256,
      },
      issuedAt: new Date(state.relinkedAt),
    });
    return Boolean(overlay
      && overlay.from === change.timelineStartFrame
      && overlay.from + overlay.durationInFrames
        === change.timelineEndFrameExclusive
      && overlay.sourceStartFrame === change.masterSourceStartFrame
      && overlay.sourceEndFrame === change.masterSourceEndFrameExclusive
      && (change.videoStartTimeWasExplicit
        ? overlay.videoStartTime === change.masterSourceStartFrame
        : overlay.videoStartTime === undefined)
      && projectVideoSourceVersionPinMatchesV1(
        overlay.sourceVersionPinV1,
        expectedMasterPin,
      ));
  });
}

function projectProxyMasterRelinkMutationReceiptFromStateV1(
  state: ProjectProxyMasterRelinkStateV1,
): ProjectMutationReceiptV1 {
  return {
    schemaVersion: 1,
    projectId: state.projectId,
    revision: {
      schemaVersion: 1,
      value: state.expectedAfterProjectRevisionValue,
      compatibilityUpdatedAt: state.relinkedAt,
    },
    committedAt: state.relinkedAt,
  };
}

function sameProjectProxyMasterRelinkAssetEvidenceV1(
  left: ProjectProxyMasterRelinkAssetEvidenceV1,
  right: ProjectProxyMasterRelinkAssetEvidenceV1,
): boolean {
  return left.activeMappingState.proxyMasterActiveMappingStateSha256V1
      === right.activeMappingState.proxyMasterActiveMappingStateSha256V1
    && left.audioRightsEvidenceSha256 === right.audioRightsEvidenceSha256;
}

function safeProjectSourceOrdinalV1(value: string): number {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new ProjectProxyMasterRelinkPreparationErrorV1(
      "SOURCE_COORDINATE_UNREPRESENTABLE",
      "A resolved master source ordinal is not an integer.",
    );
  }
  if (parsed < BigInt(0) || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ProjectProxyMasterRelinkPreparationErrorV1(
      "SOURCE_COORDINATE_UNREPRESENTABLE",
      "A resolved master source ordinal exceeds the current Project overlay model.",
    );
  }
  return Number(parsed);
}

function validDimensions(
  value: EditorState["playerDimensions"] | undefined,
): value is EditorState["playerDimensions"] {
  return Boolean(
    value &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      Number.isFinite(value.width) &&
      Number.isFinite(value.height),
  );
}

function assertProjectTimelineMutationActorKindV1(
  actorKind: unknown,
): asserts actorKind is ProjectTimelineMutationActorKindV1 {
  if (
    actorKind !== "USER"
    && actorKind !== "AGENT"
    && actorKind !== "SYSTEM"
  ) {
    throw new ProjectMutationWriteError(
      "Current timeline mutations require an explicit USER, AGENT, or SYSTEM actor.",
    );
  }
}

function assertTimelineFrameRangeV1(
  startFrame: number,
  endFrame: number,
  message: string,
): TimelineFrameRangeV1 {
  if (
    !Number.isSafeInteger(startFrame)
    || !Number.isSafeInteger(endFrame)
    || startFrame < 0
    || endFrame <= startFrame
  ) {
    throw new ProjectMutationWriteError(message);
  }
  return { startFrame, endFrame };
}

function isTimelineFrameRangeV1(value: unknown): value is TimelineFrameRangeV1 {
  if (!isPlainRecord(value)) return false;
  const { startFrame, endFrame } = value;
  return typeof startFrame === "number"
    && typeof endFrame === "number"
    && Number.isSafeInteger(startFrame)
    && Number.isSafeInteger(endFrame)
    && startFrame >= 0
    && endFrame > startFrame;
}

function frameRangesOverlapHalfOpenV1(
  left: TimelineFrameRangeV1,
  right: TimelineFrameRangeV1,
): boolean {
  return left.startFrame < right.endFrame && right.startFrame < left.endFrame;
}

function frameRangeContainsHalfOpenV1(
  container: TimelineFrameRangeV1,
  contained: TimelineFrameRangeV1,
): boolean {
  return container.startFrame <= contained.startFrame
    && container.endFrame >= contained.endFrame;
}

function assertTimelineRangeCutLockIdV1(lockId: string): void {
  if (
    typeof lockId !== "string"
    || !/^timeline-cut-lock_[A-Za-z0-9_-]{18}$/.test(lockId)
  ) {
    throw new ProjectMutationWriteError("Timeline cut lock identity is invalid.");
  }
}

function assertTimelineRangeCutLockTtlMsV1(ttlMs: number | undefined): number {
  const resolved = ttlMs ?? TIMELINE_RANGE_CUT_LOCK_DEFAULT_TTL_MS;
  if (
    !Number.isSafeInteger(resolved)
    || resolved < TIMELINE_RANGE_CUT_LOCK_MIN_TTL_MS
    || resolved > TIMELINE_RANGE_CUT_LOCK_MAX_TTL_MS
  ) {
    throw new ProjectMutationWriteError(
      "Timeline cut lock TTL must be an integer between one second and five minutes.",
    );
  }
  return resolved;
}

function readTimelineRangeCutLocksV1(
  project: Pick<Project, "timelineRangeCutLocks">,
): readonly ProjectTimelineRangeCutLockV1[] {
  if (project.timelineRangeCutLocks === undefined) return [];
  if (!Array.isArray(project.timelineRangeCutLocks)) {
    throw new ProjectMutationWriteError("Timeline cut lock state is invalid.");
  }
  const lockIds = new Set<string>();
  for (const lock of project.timelineRangeCutLocks) {
    if (
      !isPlainRecord(lock)
      || lock.schemaVersion !== 1
      || typeof lock.lockId !== "string"
      || typeof lock.actorKind !== "string"
      || !isTimelineFrameRangeV1(lock.frameRange)
      || typeof lock.acquiredAt !== "string"
      || Number.isNaN(new Date(lock.acquiredAt).getTime())
      || typeof lock.expiresAt !== "string"
      || Number.isNaN(new Date(lock.expiresAt).getTime())
    ) {
      throw new ProjectMutationWriteError("Timeline cut lock state is invalid.");
    }
    assertTimelineRangeCutLockIdV1(lock.lockId);
    assertProjectTimelineMutationActorKindV1(lock.actorKind);
    if (new Date(lock.expiresAt).getTime() <= new Date(lock.acquiredAt).getTime()) {
      throw new ProjectMutationWriteError("Timeline cut lock expiry must follow acquisition.");
    }
    if (lockIds.has(lock.lockId)) {
      throw new ProjectMutationWriteError("Timeline cut lock identities must be unique.");
    }
    lockIds.add(lock.lockId);
  }
  return project.timelineRangeCutLocks;
}

function activeTimelineRangeCutLocksV1(
  locks: readonly ProjectTimelineRangeCutLockV1[],
  now: Date,
): readonly ProjectTimelineRangeCutLockV1[] {
  return locks.filter((lock) => new Date(lock.expiresAt).getTime() > now.getTime());
}

function resolveTimelineRangeCutLockAuthorizationV1(input: {
  project: Pick<Project, "timelineRangeCutLocks">;
  currentRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineMutationActorKindV1;
  requestedLockId: string | undefined;
  cutWriteRange: TimelineFrameRangeV1;
  now: Date;
}): ProjectTimelineRangeCutLockV1 | null {
  const locks = readTimelineRangeCutLocksV1(input.project);
  const activeLocks = activeTimelineRangeCutLocksV1(locks, input.now);
  const matchingLocks = input.requestedLockId === undefined
    ? []
    : locks.filter((lock) => lock.lockId === input.requestedLockId);
  if (matchingLocks.length > 1) {
    throw new ProjectMutationWriteError("Timeline cut lock identity is not unique.");
  }
  const matchingLock = matchingLocks[0] ?? null;
  if (
    input.requestedLockId !== undefined
    && (
      !matchingLock
      || !activeLocks.some((lock) => lock.lockId === matchingLock.lockId)
      || matchingLock.actorKind !== input.actorKind
      || !frameRangeContainsHalfOpenV1(matchingLock.frameRange, input.cutWriteRange)
    )
  ) {
    throw new ProjectTimelineRangeCutLockConflictError(
      input.currentRevision,
      matchingLock ? [matchingLock.lockId] : [],
      "The supplied timeline cut lock is missing, expired, forged, or too narrow for the ripple tail.",
    );
  }

  const blockingLocks = activeLocks.filter((lock) => (
    lock.lockId !== matchingLock?.lockId
    && frameRangesOverlapHalfOpenV1(lock.frameRange, input.cutWriteRange)
  ));
  if (blockingLocks.length > 0) {
    throw new ProjectTimelineRangeCutLockConflictError(
      input.currentRevision,
      blockingLocks.map((lock) => lock.lockId),
    );
  }
  return matchingLock;
}

function overlayReferenceForTimelineChangeV1(overlay: Overlay): string {
  const id = (overlay as { id?: unknown }).id;
  if (typeof id === "string" && id.trim()) return `overlay:${id}`;
  if (typeof id === "number" && Number.isSafeInteger(id)) return `overlay:${id}`;
  throw new ProjectMutationWriteError(
    "A timeline range change cannot issue a durable affected-object reference for an overlay without a stable ID.",
  );
}

function assertProjectOverlayIdentityV1(
  value: unknown,
  operation: "update" | "deletion",
): asserts value is ProjectOverlayIdentityV1 {
  const validNumber = typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
  const validString = typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= 256;
  if (!validNumber && !validString) {
    throw new ProjectMutationWriteError(
      `Overlay ${operation} requires an exact stable numeric or string identity.`,
    );
  }
}

function overlayTimelineFrameRangeV1(
  overlay: Overlay,
): TimelineFrameRangeV1 | null {
  const rawStartFrame = (overlay as { from?: unknown }).from;
  const rawDurationInFrames = (overlay as { durationInFrames?: unknown }).durationInFrames;
  if (
    typeof rawStartFrame !== "number"
    || typeof rawDurationInFrames !== "number"
    || !Number.isSafeInteger(rawStartFrame)
    || !Number.isSafeInteger(rawDurationInFrames)
    || rawStartFrame < 0
    || rawDurationInFrames <= 0
  ) {
    return null;
  }
  const endFrame = rawStartFrame + rawDurationInFrames;
  if (!Number.isSafeInteger(endFrame)) return null;
  return { startFrame: rawStartFrame, endFrame };
}

function overlayIdentityKeyForFamilyReplacementV1(overlay: Overlay): string {
  const identity = (overlay as { id?: unknown }).id;
  const validNumber = typeof identity === "number"
    && Number.isSafeInteger(identity)
    && identity >= 0;
  const validString = typeof identity === "string"
    && identity === identity.trim()
    && identity.length > 0
    && identity.length <= 256;
  if (!validNumber && !validString) {
    throw new ProjectMutationWriteError(
      "Overlay-family replacement requires exact stable overlay identities.",
    );
  }
  return `${typeof identity}:${identity}`;
}

function indexOverlaySetForFamilyReplacementV1(
  overlays: readonly Overlay[],
  label: "stored" | "candidate",
): ReadonlyMap<string, Overlay> {
  const indexed = new Map<string, Overlay>();
  for (const overlay of overlays) {
    const key = overlayIdentityKeyForFamilyReplacementV1(overlay);
    if (indexed.has(key)) {
      throw new ProjectMutationWriteError(
        `Overlay-family replacement requires unique ${label} overlay identities.`,
      );
    }
    indexed.set(key, overlay);
  }
  return indexed;
}

function captionFamilyFrameRangesV1(
  captions: readonly Overlay[],
  label: "stored" | "candidate",
): readonly TimelineFrameRangeV1[] {
  return canonicalTimelineFrameRangesV1(captions.map((caption) => {
    const frameRange = overlayTimelineFrameRangeV1(caption);
    if (!frameRange) {
      throw new ProjectMutationWriteError(
        `Caption-family replacement requires exact positive ${label} caption frame ranges.`,
      );
    }
    return frameRange;
  }));
}

function overlayFamilyFrameRangesV1(
  overlays: readonly Overlay[],
  label: string,
): readonly TimelineFrameRangeV1[] {
  return canonicalTimelineFrameRangesV1(overlays.map((overlay) => {
    const frameRange = overlayTimelineFrameRangeV1(overlay);
    if (!frameRange) {
      throw new ProjectMutationWriteError(
        `Overlay-family replacement requires exact positive ${label} frame ranges.`,
      );
    }
    return frameRange;
  }));
}

function canonicalTimelineFrameRangesV1(
  ranges: readonly TimelineFrameRangeV1[],
): readonly TimelineFrameRangeV1[] {
  const unique = new Map<string, TimelineFrameRangeV1>();
  for (const frameRange of ranges) {
    unique.set(`${frameRange.startFrame}:${frameRange.endFrame}`, frameRange);
  }
  return [...unique.values()].sort((left, right) => (
    left.startFrame - right.startFrame || left.endFrame - right.endFrame
  ));
}

function canonicalProjectMutationValueHashV1(value: unknown): string {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("NOT_JSON");
    return hashEditronCanonicalJsonV1(JSON.parse(encoded));
  } catch {
    throw new ProjectMutationWriteError(
      "Overlay-family replacement material must be canonical JSON.",
    );
  }
}

function sameCanonicalProjectMutationValueV1(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalProjectMutationValueHashV1(left)
    === canonicalProjectMutationValueHashV1(right);
}

const PROJECT_UPLOADED_AUDIO_ASSIGNMENT_VERSION_V1 =
  "editron-uploaded-audio-assignment-v1";
const PROJECT_UPLOADED_AUDIO_TIMELINE_VERSION_V1 =
  "editron-uploaded-audio-timeline-v1";
const PROJECT_UPLOADED_AUDIO_ROLES_V1 = new Set([
  "sfx",
  "voiceover",
  "dubbing",
  "other",
]);

type ProjectUploadedAudioTimelineMaterialV1 = Readonly<{
  overlayId: number;
  derivativeAssetId: string;
  sourceAssetId: string;
  idempotencyKey: string;
  mediaRole: "sfx" | "voiceover" | "dubbing" | "other";
  from: number;
  durationInFrames: number;
  row: number;
  requestedRow: number;
  startFromSound: number;
  content: string;
  audioRights: Readonly<Record<string, unknown>>;
  sfxAcousticMeasurement: unknown;
}>;

function readUploadedAudioTimelineMaterialV1(
  overlay: Overlay,
): ProjectUploadedAudioTimelineMaterialV1 {
  const shape = overlay as Overlay & {
    assetId?: unknown;
    audioRights?: unknown;
    content?: unknown;
    startFromSound?: unknown;
    styles?: unknown;
    metadata?: unknown;
  };
  const metadata = isPlainRecord(shape.metadata) ? shape.metadata : null;
  const receipt = metadata && isPlainRecord(metadata.uploadedAudioAssignment)
    ? metadata.uploadedAudioAssignment
    : null;
  const placement = receipt && isPlainRecord(receipt.placement)
    ? receipt.placement
    : null;
  const rights = isPlainRecord(shape.audioRights) ? shape.audioRights : null;
  const mediaRole = receipt?.mediaRole;
  const derivativeAssetId = receipt?.derivativeAssetId;
  const sourceAssetId = receipt?.sourceAssetId;
  const idempotencyKey = receipt?.idempotencyKey;
  const requestedRow = placement?.requestedRow;
  const resolvedRow = placement?.resolvedRow;
  const startFromSound = placement?.startFromSound;
  const styles = isPlainRecord(shape.styles)
    ? shape.styles as Record<string, unknown>
    : null;
  const rightsIssue = getAudioRightsContractIssue(rights);
  const expectedRow = mediaRole === "sfx"
    ? ROW.SFX
    : mediaRole === "voiceover" || mediaRole === "dubbing"
      ? ROW.VOICEOVER
      : requestedRow === ROW.BGM
        ? ROW.SFX
        : requestedRow;
  const commonInvalid = overlay.type !== "sound"
    || !Number.isSafeInteger(overlay.id)
    || overlay.id < 0
    || !isBoundedNonEmptyStringV1(derivativeAssetId, 500)
    || !isBoundedNonEmptyStringV1(sourceAssetId, 500)
    || !isBoundedNonEmptyStringV1(idempotencyKey, 128)
    || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)
    || !PROJECT_UPLOADED_AUDIO_ROLES_V1.has(String(mediaRole))
    || receipt?.version !== PROJECT_UPLOADED_AUDIO_TIMELINE_VERSION_V1
    || shape.assetId !== derivativeAssetId
    || metadata?.source !== "uploaded-audio-assignment"
    || metadata.audioRole !== mediaRole
    || metadata.sourceAssetId !== sourceAssetId
    || !Number.isSafeInteger(shape.from)
    || shape.from < 0
    || !Number.isSafeInteger(shape.durationInFrames)
    || shape.durationInFrames <= 0
    || !Number.isSafeInteger(shape.row)
    || shape.row < 0
    || shape.row > 63
    || typeof requestedRow !== "number"
    || !Number.isSafeInteger(requestedRow)
    || requestedRow < 0
    || requestedRow > 63
    || resolvedRow !== shape.row
    || expectedRow !== shape.row
    || typeof startFromSound !== "number"
    || !Number.isSafeInteger(startFromSound)
    || startFromSound < 0
    || shape.startFromSound !== startFromSound
    || placement?.from !== shape.from
    || placement.durationInFrames !== shape.durationInFrames
    || typeof shape.content !== "string"
    || shape.content.trim().length === 0
    || shape.content.length > 200
    || styles?.volume !== 1
    || rightsIssue !== null
    || rights?.source !== "user-upload"
    || rights.userChoice !== "attested"
    || rights.licensed !== true
    || rights.mediaRole !== mediaRole
    || !isPlainRecord(rights.evidence)
    || rights.evidence.sourceAssetId !== sourceAssetId;
  if (commonInvalid) {
    throw new ProjectMutationWriteError(
      "Uploaded-audio overlay material is malformed or not bound to its assignment receipt.",
    );
  }

  const sfxMeasurement = metadata.sfxAcousticMeasurement;
  if (mediaRole === "sfx" && !sfxAcousticMeasurementSchema.safeParse(sfxMeasurement).success) {
    throw new ProjectMutationWriteError(
      "Uploaded SFX requires current server-measured acoustic evidence.",
    );
  }
  if (mediaRole !== "sfx" && sfxMeasurement !== undefined) {
    throw new ProjectMutationWriteError(
      "Non-SFX uploaded audio cannot claim SFX acoustic evidence.",
    );
  }

  return {
    overlayId: overlay.id,
    derivativeAssetId: derivativeAssetId as string,
    sourceAssetId: sourceAssetId as string,
    idempotencyKey: idempotencyKey as string,
    mediaRole: mediaRole as ProjectUploadedAudioTimelineMaterialV1["mediaRole"],
    from: shape.from,
    durationInFrames: shape.durationInFrames,
    row: shape.row,
    requestedRow: requestedRow as number,
    startFromSound: startFromSound as number,
    content: shape.content as string,
    audioRights: rights,
    sfxAcousticMeasurement: sfxMeasurement,
  };
}

function assertUploadedAudioDerivativeAssetV1(
  value: unknown,
  material: ProjectUploadedAudioTimelineMaterialV1,
  userId: string,
  projectId: string,
  fps: number,
): void {
  const asset = isPlainRecord(value) ? value : null;
  const receipt = asset && isPlainRecord(asset.audioAssignmentReceipt)
    ? asset.audioAssignmentReceipt
    : null;
  const assetRights = asset && isPlainRecord(asset.audioRights)
    ? asset.audioRights
    : null;
  const durationSeconds = asset?.duration;
  const sourceDurationInFrames = typeof durationSeconds === "number"
    && Number.isFinite(durationSeconds)
    && durationSeconds > 0
    ? Math.ceil(durationSeconds * fps)
    : null;
  const invalid = !asset
    || asset.assetId !== material.derivativeAssetId
    || asset.userId !== userId
    || asset.projectId !== projectId
    || asset.type !== "audio"
    || asset.source !== "user-upload"
    || asset.parentAssetId !== material.sourceAssetId
    || asset.assignmentStatus !== "attached"
    || receipt?.version !== PROJECT_UPLOADED_AUDIO_ASSIGNMENT_VERSION_V1
    || receipt.idempotencyKey !== material.idempotencyKey
    || receipt.sourceAssetId !== material.sourceAssetId
    || receipt.derivativeAssetId !== material.derivativeAssetId
    || receipt.mediaRole !== material.mediaRole
    || receipt.userId !== userId
    || receipt.projectId !== projectId
    || getAudioRightsContractIssue(assetRights) !== null
    || !sameCanonicalProjectMutationValueV1(assetRights, material.audioRights)
    || sourceDurationInFrames === null
    || material.startFromSound + material.durationInFrames > sourceDurationInFrames;
  if (invalid) {
    throw new ProjectMutationWriteError(
      "Uploaded-audio derivative evidence is missing, stale, or lacks source handles.",
    );
  }

  if (material.mediaRole === "sfx") {
    const parsed = sfxAcousticMeasurementSchema.safeParse(
      asset.sfxAcousticMeasurement,
    );
    if (!parsed.success || !sameCanonicalProjectMutationValueV1(
      parsed.data,
      material.sfxAcousticMeasurement,
    )) {
      throw new ProjectMutationWriteError(
        "Uploaded SFX acoustic evidence does not match the stored derivative.",
      );
    }
  }
}

function readProjectDottedValueV1(project: Project, path: string): unknown {
  let current: unknown = project;
  for (const segment of path.split(".")) {
    if (!isPlainRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function isBackgroundMusicOverlayV1(overlay: Overlay): boolean {
  return overlay.type === "sound" && overlay.row === ROW.BGM;
}

function prepareBackgroundMusicEvidenceV1(
  project: Project,
  input: ProjectBackgroundMusicReplaceCommandV1,
  candidateBgm: readonly Overlay[],
): { setFields: Readonly<Record<string, unknown>> } {
  let musicCoveragePlan: ReturnType<typeof assertMusicCoveragePlan>;
  let receipt: Record<string, unknown>;
  try {
    musicCoveragePlan = assertMusicCoveragePlan(
      clonePipelineAudioCanonicalValueV1(input.musicCoveragePlan),
      project.durationInFrames,
    );
    receipt = clonePipelineAudioCanonicalValueV1(input.evidence.receipt) as Record<string, unknown>;
  } catch (error) {
    throw new ProjectMutationWriteError(
      "Background-music replacement requires canonical coverage and audit evidence: "
        + (error instanceof Error ? error.message : "INVALID_EVIDENCE"),
    );
  }
  if (!isPlainRecord(receipt)) {
    throw new ProjectMutationWriteError(
      "Background-music replacement evidence must be a canonical object.",
    );
  }
  if (musicCoveragePlan.mode === "none" || candidateBgm.length === 0
    || candidateBgm.length !== musicCoveragePlan.sections.length) {
    throw new ProjectMutationWriteError(
      "Background-music replacement requires one BGM overlay per non-empty coverage section.",
    );
  }

  const candidateAssetIds = candidateBgm.map((overlay) => (
    isBoundedNonEmptyStringV1(overlay.assetId, 500) ? overlay.assetId : null
  ));
  if (candidateAssetIds.some((assetId) => assetId === null)
    || new Set(candidateAssetIds).size !== 1) {
    throw new ProjectMutationWriteError(
      "Background-music coverage overlays must share one exact source asset identity.",
    );
  }
  const assetId = candidateAssetIds[0] as string;
  let canonicalRights: Record<string, unknown> | null = null;
  for (const [index, overlay] of candidateBgm.entries()) {
    const shape = overlay as Overlay & {
      audioRights?: unknown;
      musicRights?: unknown;
      startFromSound?: unknown;
      metadata?: unknown;
    };
    const audioRights = shape.audioRights;
    const musicRights = shape.musicRights;
    const rightsIssue = getAudioRightsContractIssue(audioRights)
      ?? getAudioRightsContractIssue(musicRights);
    if (rightsIssue || !isPlainRecord(audioRights) || !isPlainRecord(musicRights)
      || audioRights.mediaRole !== "music" || musicRights.mediaRole !== "music"
      || !sameCanonicalProjectMutationValueV1(audioRights, musicRights)) {
      throw new ProjectMutationWriteError(
        "Background-music overlays require matching music-role rights evidence: "
          + (rightsIssue ?? "RIGHTS_MISMATCH"),
      );
    }
    if (canonicalRights === null) {
      canonicalRights = audioRights;
    } else if (!sameCanonicalProjectMutationValueV1(canonicalRights, audioRights)) {
      throw new ProjectMutationWriteError(
        "Background-music coverage overlays must share identical rights evidence.",
      );
    }

    const section = musicCoveragePlan.sections[index];
    const metadata = isPlainRecord(shape.metadata) ? shape.metadata : null;
    const coverage = metadata && isPlainRecord(metadata.musicCoverage)
      ? metadata.musicCoverage
      : null;
    if (
      !coverage
      || coverage.version !== musicCoveragePlan.version
      || coverage.mode !== musicCoveragePlan.mode
      || coverage.sectionIndex !== index
      || !sameCanonicalProjectMutationValueV1(coverage.section, section)
      || overlay.from !== section.startFrame
      || overlay.durationInFrames !== section.endFrame - section.startFrame
      || shape.startFromSound !== section.startFrame
    ) {
      throw new ProjectMutationWriteError(
        "Background-music overlay ranges must exactly match the canonical coverage plan.",
      );
    }
  }
  if (!canonicalRights) {
    throw new ProjectMutationWriteError("Background-music rights evidence is missing.");
  }

  const usageMode = input.evidence.kind === "ASSIGNMENT"
    ? input.evidence.usageMode
    : "embedded";
  if (usageMode === "embedded") {
    if (canonicalRights.licensed !== true || canonicalRights.source === "preview-only") {
      throw new ProjectMutationWriteError(
        "Embedded background music requires licensed, non-preview rights evidence.",
      );
    }
  } else if (
    canonicalRights.licensed !== false
    || canonicalRights.source !== "preview-only"
    || canonicalRights.userChoice !== "no-music"
  ) {
    throw new ProjectMutationWriteError(
      "Reference-only background music requires preview-only, non-licensed evidence.",
    );
  }

  const candidateIds = candidateBgm.map((overlay) => (
    (overlay as { id: ProjectOverlayIdentityV1 }).id
  ));
  const commonEvidenceValid = receipt.snappedCutCount === 0
    && receipt.beatRealignEnabled === false;
  if (input.evidence.kind === "ASSIGNMENT") {
    if (
      receipt.version !== "background-music-assignment-v1"
      || !isBoundedNonEmptyStringV1(receipt.idempotencyKey, 128)
      || !isBoundedNonEmptyStringV1(receipt.sourceAssetId, 500)
      || receipt.derivativeAssetId !== assetId
      || receipt.usageMode !== usageMode
      || !sameCanonicalProjectMutationValueV1(receipt.musicRights, canonicalRights)
      || !sameCanonicalProjectMutationValueV1(receipt.musicCoveragePlan, musicCoveragePlan)
      || !isValidDateValueV1(receipt.assignedAt)
      || !commonEvidenceValid
    ) {
      throw new ProjectMutationWriteError(
        "Background-music assignment evidence does not match the replacement material.",
      );
    }
    return {
      setFields: {
        musicCoveragePlan,
        "intelligence.audio.musicUsageMode": usageMode,
        "intelligence.audio.musicCoveragePlan": musicCoveragePlan,
        "intelligence.audio.lastMusicAssignment": receipt,
      },
    };
  }

  if (
    receipt.version !== "chat-music-change-v1"
    || receipt.assetId !== assetId
    || !sameCanonicalProjectMutationValueV1(receipt.replacementOverlayIds, candidateIds)
    || !isValidDateValueV1(receipt.generatedAt)
    || !commonEvidenceValid
  ) {
    throw new ProjectMutationWriteError(
      "Chat background-music change evidence does not match the replacement material.",
    );
  }
  return {
    setFields: {
      musicCoveragePlan,
      "intelligence.audio.musicCoveragePlan": musicCoveragePlan,
      "intelligence.audio.lastMusicChange": receipt,
    },
  };
}

function unionTimelineFrameRangesV1(
  beforeFrameRange: TimelineFrameRangeV1 | null,
  afterFrameRange: TimelineFrameRangeV1 | null,
): TimelineFrameRangeV1 | null {
  if (!beforeFrameRange) return afterFrameRange;
  if (!afterFrameRange) return beforeFrameRange;
  return {
    startFrame: Math.min(beforeFrameRange.startFrame, afterFrameRange.startFrame),
    endFrame: Math.max(beforeFrameRange.endFrame, afterFrameRange.endFrame),
  };
}

function projectVideoSourceStartFrameV1(overlay: Overlay): number {
  const shape = overlay as {
    sourceStartFrame?: unknown;
    videoStartTime?: unknown;
  };
  const sourceStartFrame = shape.sourceStartFrame;
  const videoStartTime = shape.videoStartTime;
  const values = [sourceStartFrame, videoStartTime].filter(
    (value) => value !== undefined,
  );
  if (values.some((value) => (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
  ))) {
    throw new ProjectMutationWriteError(
      "Video source-start coordinates must be non-negative source-frame integers.",
    );
  }
  if (sourceStartFrame !== undefined
    && videoStartTime !== undefined
    && sourceStartFrame !== videoStartTime) {
    throw new ProjectMutationWriteError(
      "Conflicting sourceStartFrame and videoStartTime coordinates cannot be retimed.",
    );
  }
  return (sourceStartFrame ?? videoStartTime ?? 0) as number;
}

function createCaptionFamilyTimelineChangeReceiptV1(input: {
  receiptId: string;
  projectId: string;
  actorKind: ProjectTimelineMutationActorKindV1;
  fps: number;
  beforeProjectRevision: ProjectRevisionV1;
  afterProjectRevision: ProjectRevisionV1;
  committedAt: string;
  beforeCaptions: readonly Overlay[];
  afterCaptions: readonly Overlay[];
}): ProjectTimelineRangeChangeReceiptV1 {
  return createOverlayFamilyTimelineChangeReceiptV1({
    ...input,
    operation: "REPLACE_CAPTION_FAMILY",
    beforeOverlays: input.beforeCaptions,
    afterOverlays: input.afterCaptions,
    changedPaths: ["overlays", "timelineRangeChangeReceipts"],
  });
}

function createOverlayFamilyTimelineChangeReceiptV1(input: {
  receiptId: string;
  projectId: string;
  operation:
    | "REPLACE_CAPTION_FAMILY"
    | "REPLACE_BACKGROUND_MUSIC"
    | "ALIGN_CUTS_TO_BEATS"
    | "REPLACE_EDITOR_STATE"
    | "RESTORE_CHECKPOINT_STATE";
  actorKind: ProjectTimelineMutationActorKindV1;
  fps: number;
  beforeProjectRevision: ProjectRevisionV1;
  afterProjectRevision: ProjectRevisionV1;
  committedAt: string;
  beforeOverlays: readonly Overlay[];
  afterOverlays: readonly Overlay[];
  projectRenderSnapshotInvalidation?: ProjectRenderSnapshotInvalidationLinkV1;
  wholeStateMediaPrerequisite?: ProjectWholeStateMediaPrerequisiteLinkV1;
  changedPaths: readonly string[];
}): ProjectTimelineRangeChangeReceiptV1 {
  const beforeFrameRanges = overlayFamilyFrameRangesV1(input.beforeOverlays, "stored family");
  const afterFrameRanges = overlayFamilyFrameRangesV1(input.afterOverlays, "candidate family");
  const writeFrameRanges = canonicalTimelineFrameRangesV1([
    ...beforeFrameRanges,
    ...afterFrameRanges,
  ]);
  const affectedOverlayRefs = [...new Set([
    ...input.beforeOverlays,
    ...input.afterOverlays,
  ].map(overlayReferenceForTimelineChangeV1))].sort();
  return {
    schemaVersion: 1,
    receiptId: input.receiptId,
    projectId: input.projectId,
    operation: input.operation,
    actorKind: input.actorKind,
    coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
    fps: input.fps,
    beforeProjectRevision: input.beforeProjectRevision,
    afterProjectRevision: input.afterProjectRevision,
    committedAt: input.committedAt,
    readFrameRangesBefore: beforeFrameRanges,
    writeFrameRangesBefore: writeFrameRanges,
    affectedFrameRangesAfter: afterFrameRanges,
    affectedOverlayRefs,
    changedPaths: input.changedPaths,
    rangeObservation: "EXACT",
    overlayTemporalChange: null,
    timelineCoordinateTransform: null,
    sourceTimeTransform: null,
    splitChildren: [],
    ripple: null,
    downstreamInvalidation: input.projectRenderSnapshotInvalidation
      ? {
          status: "DURABLE_PROJECT_SNAPSHOT_INVALIDATION_PENDING",
          affectedFrameRangesBefore: writeFrameRanges,
          projectRenderSnapshotInvalidation:
            structuredClone(input.projectRenderSnapshotInvalidation),
        }
      : {
          status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
          affectedFrameRangesBefore: writeFrameRanges,
        },
    ...(input.wholeStateMediaPrerequisite
      ? { wholeStateMediaPrerequisite: structuredClone(input.wholeStateMediaPrerequisite) }
      : {}),
  };
}

function createDirectOverlayTimelineChangeReceiptV1(input: {
  receiptId: string;
  projectId: string;
  operation:
    | "ADD_OVERLAY"
    | "UPDATE_OVERLAY"
    | "APPLY_VIDEO_SPEED_RAMP"
    | "DELETE_OVERLAY";
  actorKind: ProjectTimelineMutationActorKindV1;
  fps: number;
  beforeProjectRevision: ProjectRevisionV1;
  afterProjectRevision: ProjectRevisionV1;
  committedAt: string;
  beforeOverlay: Overlay | null;
  afterOverlay: Overlay | null;
  sourceTimeTransform?: ProjectVideoSourceTimeTransformV1 | null;
}): ProjectTimelineRangeChangeReceiptV1 {
  const representativeOverlay = input.afterOverlay ?? input.beforeOverlay;
  if (!representativeOverlay) {
    throw new ProjectMutationWriteError(
      "A direct overlay change must retain one affected overlay identity.",
    );
  }
  const beforeFrameRange = input.beforeOverlay
    ? overlayTimelineFrameRangeV1(input.beforeOverlay)
    : null;
  const afterFrameRange = input.afterOverlay
    ? overlayTimelineFrameRangeV1(input.afterOverlay)
    : null;
  const unionFrameRange = unionTimelineFrameRangesV1(
    beforeFrameRange,
    afterFrameRange,
  );
  const overlayRef = overlayReferenceForTimelineChangeV1(representativeOverlay);
  const rangeObservation = unionFrameRange
    ? "EXACT" as const
    : "UNKNOWN_LEGACY_OVERLAY_TIMING" as const;
  assertProjectTimelineMutationActorKindV1(input.actorKind);

  return {
    schemaVersion: 1,
    receiptId: input.receiptId,
    projectId: input.projectId,
    operation: input.operation,
    actorKind: input.actorKind,
    coordinateDomain: "PROJECT_TIMELINE_FRAME_V1",
    fps: input.fps,
    beforeProjectRevision: input.beforeProjectRevision,
    afterProjectRevision: input.afterProjectRevision,
    committedAt: input.committedAt,
    readFrameRangesBefore: beforeFrameRange ? [beforeFrameRange] : [],
    writeFrameRangesBefore: unionFrameRange ? [unionFrameRange] : [],
    affectedFrameRangesAfter: afterFrameRange ? [afterFrameRange] : [],
    affectedOverlayRefs: [overlayRef],
    changedPaths: ["overlays", "timelineRangeChangeReceipts"],
    rangeObservation,
    overlayTemporalChange: {
      overlayRef,
      beforeFrameRange,
      afterFrameRange,
      unionFrameRange,
    },
    timelineCoordinateTransform: null,
    sourceTimeTransform: input.sourceTimeTransform ?? null,
    splitChildren: [],
    ripple: null,
    downstreamInvalidation: {
      status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN",
      affectedFrameRangesBefore: unionFrameRange ? [unionFrameRange] : [],
    },
  };
}

function reconcileSafeTimelineRangeCutRebaseV1(input: {
  project: Pick<Project, "timelineRangeChangeReceipts">;
  projectId: string;
  requestedRevision: ProjectRevisionV1;
  currentRevision: ProjectRevisionV1;
  cutWriteRange: TimelineFrameRangeV1;
  cutAffectedOverlayRefs: readonly string[];
}): ProjectTimelineRangeCutRebaseV1 {
  const receipts = input.project.timelineRangeChangeReceipts;
  if (!Array.isArray(receipts)) {
    throw new ProjectTimelineRangeRebaseBlockedError(
      input.currentRevision,
      "HISTORY_INCOMPLETE",
    );
  }
  let cursor = input.requestedRevision;
  const traversedReceiptIds: string[] = [];
  while (!sameProjectRevisionV1(cursor, input.currentRevision)) {
    const matchingReceipts = receipts.filter((receipt) => (
      isProjectTimelineRangeChangeReceiptForRevisionV1(
        receipt,
        input.projectId,
        cursor,
      )
    ));
    if (matchingReceipts.length !== 1) {
      throw new ProjectTimelineRangeRebaseBlockedError(
        input.currentRevision,
        "HISTORY_INCOMPLETE",
      );
    }
    const receipt = matchingReceipts[0];
    if (receipt.afterProjectRevision.value !== cursor.value + 1) {
      throw new ProjectTimelineRangeRebaseBlockedError(
        input.currentRevision,
        "HISTORY_INCOMPLETE",
      );
    }
    if (receipt.operation === "CUT_TIMELINE_RANGE") {
      throw new ProjectTimelineRangeRebaseBlockedError(
        input.currentRevision,
        "COORDINATE_TRANSFORM",
      );
    }
    if (receipt.operation !== "UPDATE_OVERLAY") {
      throw new ProjectTimelineRangeRebaseBlockedError(
        input.currentRevision,
        "UNKNOWN_OPERATION",
      );
    }
    if (
      receipt.rangeObservation !== "EXACT"
      || !receipt.overlayTemporalChange
      || !receipt.overlayTemporalChange.unionFrameRange
      || receipt.timelineCoordinateTransform !== null
      || receipt.ripple !== null
      || receipt.splitChildren.length !== 0
      || receipt.writeFrameRangesBefore.length !== 1
      || !sameTimelineFrameRangeV1(
        receipt.writeFrameRangesBefore[0],
        receipt.overlayTemporalChange.unionFrameRange,
      )
    ) {
      throw new ProjectTimelineRangeRebaseBlockedError(
        input.currentRevision,
        "UNKNOWN_OVERLAY_TIMING",
      );
    }
    if (input.cutAffectedOverlayRefs.includes(receipt.overlayTemporalChange.overlayRef)) {
      throw new ProjectTimelineRangeRebaseBlockedError(
        input.currentRevision,
        "SAME_OBJECT_UPDATE",
      );
    }
    if (frameRangesOverlapHalfOpenV1(
      receipt.overlayTemporalChange.unionFrameRange,
      input.cutWriteRange,
    )) {
      throw new ProjectTimelineRangeRebaseBlockedError(
        input.currentRevision,
        "OVERLAPPING_UPDATE",
      );
    }
    traversedReceiptIds.push(receipt.receiptId);
    cursor = receipt.afterProjectRevision;
  }
  return {
    disposition: "SAFE_REBASED",
    requestedRevision: input.requestedRevision,
    appliedBaseRevision: input.currentRevision,
    traversedReceiptIds,
  };
}

function isProjectTimelineRangeChangeReceiptForRevisionV1(
  receipt: unknown,
  projectId: string,
  expectedBeforeRevision: ProjectRevisionV1,
): receipt is ProjectTimelineRangeChangeReceiptV1 {
  if (
    !isPlainRecord(receipt)
    || receipt.schemaVersion !== 1
    || receipt.projectId !== projectId
    || typeof receipt.receiptId !== "string"
    || !receipt.receiptId.trim()
    || !isProjectRevisionV1(receipt.beforeProjectRevision)
    || !isProjectRevisionV1(receipt.afterProjectRevision)
    || !sameProjectRevisionV1(receipt.beforeProjectRevision, expectedBeforeRevision)
    || !Array.isArray(receipt.writeFrameRangesBefore)
    || receipt.writeFrameRangesBefore.some((range) => !isTimelineFrameRangeV1(range))
    || !Array.isArray(receipt.affectedOverlayRefs)
    || receipt.affectedOverlayRefs.some((reference) => typeof reference !== "string")
    || !Array.isArray(receipt.splitChildren)
  ) {
    return false;
  }
  return true;
}

function isProjectRevisionV1(value: unknown): value is ProjectRevisionV1 {
  if (!isPlainRecord(value)) return false;
  return value.schemaVersion === 1
    && typeof value.value === "number"
    && Number.isSafeInteger(value.value)
    && value.value >= 0
    && typeof value.compatibilityUpdatedAt === "string"
    && !Number.isNaN(new Date(value.compatibilityUpdatedAt).getTime());
}

function sameTimelineFrameRangeV1(
  left: TimelineFrameRangeV1,
  right: TimelineFrameRangeV1,
): boolean {
  return left.startFrame === right.startFrame && left.endFrame === right.endFrame;
}

function collectAffectedTimelineCutOverlayRefsV1(
  overlays: readonly Overlay[],
  cutStartFrame: number,
): string[] {
  const refs = new Set<string>();
  for (const overlay of overlays) {
    const rawStartFrame = Number((overlay as { from?: unknown }).from);
    const rawDurationInFrames = Number((overlay as { durationInFrames?: unknown }).durationInFrames);
    const startFrame = Number.isFinite(rawStartFrame) ? Math.round(rawStartFrame) : 0;
    const durationInFrames = Math.max(
      0,
      Number.isFinite(rawDurationInFrames) ? Math.round(rawDurationInFrames) : 0,
    );
    const endFrame = startFrame + durationInFrames;
    if (durationInFrames <= 0 || endFrame <= cutStartFrame) {
      continue;
    }
    const id = (overlay as { id?: unknown }).id;
    const reference = typeof id === "string" && id.trim()
      ? `overlay:${id}`
      : typeof id === "number" && Number.isSafeInteger(id)
        ? `overlay:${id}`
        : null;
    if (!reference) {
      throw new ProjectMutationWriteError(
        "A timeline range change cannot issue durable affected-object references for an overlay without a stable ID.",
      );
    }
    if (refs.has(reference)) {
      throw new ProjectMutationWriteError(
        `A timeline range change requires unique affected overlay IDs; found ${reference}.`,
      );
    }
    refs.add(reference);
  }
  return [...refs].sort();
}

function hasActiveDirectorMutationLeaseV1(
  project: Pick<Project, "directorLock" | "directorLockAt">,
): boolean {
  if (project.directorLock !== true) return false;
  const startedAt = project.directorLockAt ? new Date(project.directorLockAt) : null;
  if (!startedAt || Number.isNaN(startedAt.getTime())) return true;
  return Date.now() - startedAt.getTime() < DIRECTOR_LEASE_DURATION_MS;
}

// Singleton instance
export const projectService = new ProjectService();
