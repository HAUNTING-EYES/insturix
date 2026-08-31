/**
 * Project Service
 *
 * Service layer for project CRUD operations
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";

import { connectToDatabase, getDatabase, COLLECTIONS } from "../db/mongodb";
import { assetResolver } from "./asset-resolver";
import { hashEditronCanonicalJsonV1 } from "./canonical-json-v1";
import type {
  Keyframe,
  KeyframeTrack,
  ClipOverlay,
  Overlay,
  AspectRatio,
} from "@/components/editron/editor/version-7.0.0/types";
import {
  ensureAtomicOverlayReceipt,
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
import { alignCutsToBeatsWithEvidence } from "@/lib/pipeline/scene-to-editron";
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

/**
 * The ProjectService-issued optimistic-concurrency token for editor-state
 * writes. Callers treat this as an opaque receipt field; PostCommandIR is not
 * coupled to this storage implementation.
 */
export interface ProjectRevisionV1 {
  schemaVersion: 1;
  value: number;
  /**
   * Temporary compatibility guard for existing writers that still advance
   * updatedAt without advancing projectRevision. It is part of this write's
   * atomic predicate and will be retired after all writers use the counter.
   */
  compatibilityUpdatedAt: string;
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

export type ProjectTimelineRangeChangeOperationV1 =
  | "CUT_TIMELINE_RANGE"
  | "ADD_OVERLAY"
  | "UPDATE_OVERLAY"
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
  downstreamInvalidation: {
    status: "UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN";
    affectedFrameRangesBefore: readonly TimelineFrameRangeV1[];
  };
}

export interface ProjectTimelineRangeCutCommandV1 {
  /** Omit only for an interactive caller that asks ProjectService to take its
      own immediate snapshot. Background/planned work must carry this token. */
  expectedRevision?: ProjectRevisionV1;
  actorKind: ProjectTimelineChangeActorKindV1;
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

export interface ProjectVideoSpeedRampCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineChangeActorKindV1;
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
  actorKind: ProjectTimelineChangeActorKindV1;
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

/**
 * A derived-duration reconciliation reads the current canonical overlay
 * timings itself. `assertedDurationInFrames` exists only for the temporary
 * legacy bridge and must exactly match the owner-derived result.
 */
export interface ProjectDurationReconciliationCommandV1 {
  actorKind: ProjectTimelineChangeActorKindV1;
  assertedDurationInFrames?: number;
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
  actorKind: ProjectTimelineChangeActorKindV1;
  frameRange: TimelineFrameRangeV1;
  acquiredAt: string;
  expiresAt: string;
}

export interface ProjectTimelineRangeCutLockAcquireCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineChangeActorKindV1;
  startFrame: number;
  endFrame: number;
  /** Bounded to keep a coordination lease from becoming a hidden project lock. */
  ttlMs?: number;
}

export interface ProjectTimelineRangeCutLockReleaseCommandV1 {
  expectedRevision: ProjectRevisionV1;
  actorKind: ProjectTimelineChangeActorKindV1;
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
 * The durable MG worker's generated-result ledger entry. This is deliberately
 * a narrow project mutation rather than a generic worker field-update port.
 */
export interface ProjectMgRenderDeliveryOutcomeV1 {
  jobId: string;
  status: "generated";
  candidateId: string;
  factKind: string;
  frame: number;
  sequenceId: string;
  completedAt: Date;
}

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
  expectedRevision: ProjectRevisionV1;
  setFields: Record<string, unknown>;
  unsetFields: string[];
}

export interface ProjectCheckpointRestoreReceiptV1 {
  receipt: ProjectMutationReceiptV1;
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

/**
 * A Director run token identifies the automatic-worker lifecycle across the
 * Director's shorter-lived writer lease. It is issued, consumed and cleared
 * only by ProjectService; it is not a second job or project authority.
 */
export type ProjectDirectorRunClaimDispositionV1 =
  | "CLAIMED"
  | "ASSIST_PROJECT"
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
    }
  | {
      disposition: "PROJECT_NOT_FOUND";
    }
  | {
      disposition: "NOT_ELIGIBLE";
    };

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
   * Save project (manual save)
   */
  async saveProject(
    userId: string,
    projectId: string,
    state: EditorState,
    options: { overlayAuthority?: OverlaySaveAuthority } = {},
  ): Promise<void> {
    await this.saveProjectWithReceipt(userId, projectId, state, options);
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
      expectedRevision?: ProjectRevisionV1;
      overlayAuthority?: OverlaySaveAuthority;
      projectUpdates?: Record<string, unknown>;
      directorLeaseId?: string;
    } = {},
  ): Promise<ProjectMutationReceiptV1> {
    return this.persistEditorState({
      userId,
      projectId,
      state,
      expectedRevision: options.expectedRevision,
      overlayAuthority: options.overlayAuthority ?? "server",
      projectUpdates: options.projectUpdates,
      directorLeaseId: options.directorLeaseId,
      mode: "manual",
    });
  }

  /**
   * Update pipeline metadata on a project (stage, score, status, brand).
   * Separate from saveProject which handles editor state (overlays, dimensions).
   */
  async updateProjectMetadata(
    projectId: string,
    metadata: Partial<
      Pick<
        Project,
        "pipelineStage" | "qualityScore" | "projectStatus" | "brand"
      >
    >,
  ): Promise<void> {
    const db = await getDatabase();
    const result = await db
      .collection(COLLECTIONS.PROJECTS)
      .updateOne(
        { projectId },
        { $set: { ...metadata, updatedAt: new Date() } },
      );
    if (result.matchedCount === 0) {
      throw new Error(`Project ${projectId} not found`);
    }
  }

  /**
   * Derive the project status from pipeline state.
   *
   * Rules:
   *  - Any failed or partial video batch → "needs-attention"
   *  - pipelineStage is "complete" → "complete"
   *  - Otherwise → "active"
   *
   * Batches link to projects via storyboards (storyboardId → storyboards.projectId).
   * Some batches also carry a direct `projectId` field.
   */
  async deriveProjectStatus(
    projectId: string,
  ): Promise<Project["projectStatus"]> {
    const db = await getDatabase();

    // 1. Find storyboards that belong to this project
    const storyboards = await db
      .collection("storyboards")
      .find({ projectId }, { projection: { storyboardId: 1 } })
      .toArray();

    const storyboardIds = storyboards
      .map((s) => s.storyboardId)
      .filter(Boolean);

    // 2. Check for any failed or partial video batches
    //    Match on either: storyboardId in the set OR direct projectId on the batch.
    const failedBatchCount = await db
      .collection("pipeline_video_batches")
      .countDocuments({
        $or: [
          ...(storyboardIds.length > 0
            ? [{ storyboardId: { $in: storyboardIds } }]
            : []),
          { projectId },
        ],
        status: { $in: ["failed", "partial", "partial_enqueue_failure"] },
      });

    if (failedBatchCount > 0) {
      return "needs-attention";
    }

    // 3. Check the project's pipeline stage
    const project = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne(
        { projectId },
        { projection: { pipelineStage: 1 } },
      )) as unknown as Pick<Project, "pipelineStage"> | null;

    if (project?.pipelineStage === "complete") {
      return "complete";
    }

    return "active";
  }

  /**
   * Derive and persist the project status in one call.
   * Convenience wrapper — derives the status then writes it to the document.
   */
  async refreshProjectStatus(
    projectId: string,
  ): Promise<Project["projectStatus"]> {
    const status = await this.deriveProjectStatus(projectId);
    await this.updateProjectMetadata(projectId, { projectStatus: status });
    return status;
  }

  /**
   * Autosave project (background save)
   */
  async autosaveProject(
    userId: string,
    projectId: string,
    state: EditorState,
    options: { expectedRevision?: ProjectRevisionV1 } = {},
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
    assertProjectTimelineChangeActorKindV1(input.actorKind);
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
    assertProjectTimelineChangeActorKindV1(input.actorKind);
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
    assertProjectTimelineChangeActorKindV1(input.actorKind);
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
    if (isAssistProjectRecordV1(current)) {
      return { disposition: "ASSIST_PROJECT", project: structuredClone(current) };
    }
    const suppliedDispatchToken = options?.pipelineDirectorDispatchToken;
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
    if (
      !isDirectorRunClaimableStatusV1(projectRecordValueV1(current, "autoEditStatus"))
      || projectRecordValueV1(current, "directorRunToken") !== undefined
    ) {
      return { disposition: "NOT_ELIGIBLE" };
    }

    const beforeRevision = projectRevisionFor(current);
    const claimedAt = new Date();
    const runToken = `director_run_${nanoid(20)}`;
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
      if (isAssistProjectRecordV1(latest)) {
        return { disposition: "ASSIST_PROJECT", project: structuredClone(latest) };
      }
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
    assertCheckpointRestoreFields(input.setFields, input.unsetFields);
    assertProjectGeneratedCompositionCheckpointRestoreV1(
      projectId,
      input.setFields,
      input.unsetFields,
    );

    const committedAt = new Date();
    const update: Record<string, unknown> = {
      $set: { ...input.setFields, updatedAt: committedAt },
      $inc: { projectRevision: 1 },
    };
    if (input.unsetFields.length > 0) {
      update.$unset = Object.fromEntries(
        input.unsetFields.map((field) => [field, ""]),
      );
    }

    const db = await getDatabase();
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
    return { receipt, project: restoredProject };
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
    directorLeaseId?: string;
    mode: "manual" | "autosave";
  }): Promise<ProjectMutationReceiptV1> {
    // Validate before any resolver or database work so route casts cannot
    // bypass the durable marker contract.
    assertEditorTimelineMarkers(
      input.state.markers,
      input.state.durationInFrames,
    );
    assertGenericProjectUpdateFields(input.projectUpdates ?? {}, []);
    const cleanOverlays = assetResolver.stripUrlsForLLM(input.state.overlays);
    const dimensions = validDimensions(input.state.playerDimensions)
      ? input.state.playerDimensions
      : { width: 1920, height: 1080 };
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
      ?? currentProject.durationInFrames
      ?? 0;

    // A direct caller may omit duration while supplying markers. Bind those
    // markers to the durable project duration before any write so the route
    // layer is never the sole range authority.
    assertEditorTimelineMarkers(
      input.state.markers,
      input.state.durationInFrames ?? currentProject.durationInFrames,
    );

    const currentRevision = projectRevisionFor(currentProject);
    const expectedRevision = input.expectedRevision ?? currentRevision;
    assertProjectRevision(expectedRevision);
    if (
      expectedRevision.value !== currentRevision.value ||
      expectedRevision.compatibilityUpdatedAt !==
        currentRevision.compatibilityUpdatedAt
    ) {
      throw new ProjectMutationConflictError(currentRevision);
    }

    const lock = currentProject;
    const directorLockStartedAt = lock.directorLockAt
      ? new Date(lock.directorLockAt)
      : null;
    const directorLockIsActive =
      lock.directorLock === true &&
      directorLockStartedAt !== null &&
      !Number.isNaN(directorLockStartedAt.getTime()) &&
      Date.now() - directorLockStartedAt.getTime() < 5 * 60 * 1000;
    if (input.mode === "autosave" && directorLockIsActive) {
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
    const committedAt = new Date();
    const update: Record<string, unknown> = {
      $set: {
        ...(input.projectUpdates ?? {}),
        overlays: mergedOverlays,
        aspectRatio: input.state.aspectRatio,
        playerDimensions: dimensions,
        fps: input.state.fps || 30,
        durationInFrames,
        ...(input.state.markers !== undefined
          ? { markers: input.state.markers }
          : {}),
        ...(input.mode === "autosave" ? { lastAutosaveAt: committedAt } : {}),
        updatedAt: committedAt,
      },
      $inc: { projectRevision: 1 },
    };
    const unsetFields: Record<string, ""> = {};
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
      revision: {
        schemaVersion: 1,
        value: expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
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
   * Update project name
   */
  async updateProjectName(
    userId: string,
    projectId: string,
    name: string,
  ): Promise<void> {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      {
        $set: {
          name,
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Add an overlay atomically
   */
  async addOverlay(
    userId: string,
    projectId: string,
    overlay: Overlay,
  ): Promise<void> {
    const db = await getDatabase();
    const project = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne(
        { projectId, userId },
        { projection: { fps: 1, projectRevision: 1, updatedAt: 1 } },
      )) as unknown as Pick<
        Project,
        "fps" | "projectRevision" | "updatedAt"
      > | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const expectedRevision = projectRevisionFor(project);
    const overlayWithReceipt = ensureAtomicOverlayReceipt(overlay, {
      source: "project-service-add-overlay",
      intent: `persist-${overlay.type}`,
      reason: "overlay persisted through ProjectService.addOverlay",
    });
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: expectedRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-overlay-add_${nanoid(18)}`,
      projectId,
      operation: "ADD_OVERLAY",
      fps: project.fps || 30,
      beforeProjectRevision: expectedRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlay: null,
      afterOverlay: overlayWithReceipt,
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(expectedRevision),
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
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
  }

  /**
   * Attach one stable overlay identity only if the project is still at the
   * caller's snapshot revision. A repeat delivery of the same command returns
   * without a second write or a manufactured receipt.
   */
  async addOverlayIfAbsent(
    userId: string,
    projectId: string,
    input: {
      expectedRevision: ProjectRevisionV1;
      overlay: Overlay;
    },
  ): Promise<{
    attached: boolean;
    receipt?: ProjectMutationReceiptV1;
  }> {
    assertProjectRevision(input.expectedRevision);
    const db = await getDatabase();
    const project = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne(
        { projectId, userId },
        { projection: { fps: 1, projectRevision: 1, updatedAt: 1 } },
      )) as unknown as Pick<
        Project,
        "fps" | "projectRevision" | "updatedAt"
      > | null;
    if (!project || !sameProjectRevisionV1(input.expectedRevision, projectRevisionFor(project))) {
      return { attached: false };
    }
    const overlayWithReceipt = ensureAtomicOverlayReceipt(input.overlay, {
      source: "project-service-add-overlay-if-absent",
      intent: `persist-${input.overlay.type}`,
      reason: "overlay was attached through ProjectService at one project revision",
    });
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: input.expectedRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-overlay-add_${nanoid(18)}`,
      projectId,
      operation: "ADD_OVERLAY",
      fps: project.fps || 30,
      beforeProjectRevision: input.expectedRevision,
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
    if (result.matchedCount === 0) return { attached: false };
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return { attached: true, receipt };
  }

  /**
   * Atomically land one generated MG delivery and its worker outcome at the
   * caller's project snapshot. A replay that has already landed the same job
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
      || input.overlays.length === 0
      || new Set(overlayIds).size !== overlayIds.length
      || !hasExactlyOneDeliveryOverlay
      || input.outcome.jobId !== input.jobId
      || input.outcome.status !== "generated"
      || !input.outcome.candidateId.trim()
      || !input.outcome.factKind.trim()
      || !Number.isSafeInteger(input.outcome.frame)
      || !input.outcome.sequenceId.trim()
      || !(input.outcome.completedAt instanceof Date)
      || Number.isNaN(input.outcome.completedAt.getTime())
    ) {
      throw new ProjectMutationWriteError("MG render delivery input is invalid.");
    }

    const db = await getDatabase();
    const committedAt = new Date();
    const persistedOverlays = input.overlays.map((overlay) => (
      ensureAtomicOverlayReceipt(overlay, {
        source: "project-service-mg-render-delivery",
        intent: `persist-${overlay.type}`,
        reason: "generated MG delivery was attached through ProjectService",
      })
    ));
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.metadata.mgRenderJobId": { $ne: input.jobId },
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $push: {
          overlays: { $each: persistedOverlays } as never,
          "intelligence.mgCodegenRun.asyncOutcomes": {
            $each: [input.outcome],
            $slice: -100,
          } as never,
        },
        $set: { updatedAt: committedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) {
      const current = (await db.collection(COLLECTIONS.PROJECTS).findOne(
        { projectId, userId },
        { projection: { overlays: 1, projectRevision: 1, updatedAt: 1 } },
      )) as Pick<Project, "overlays" | "projectRevision" | "updatedAt"> | null;
      if (!current) throw new ProjectNotFoundOrForbiddenError();
      const alreadyDelivered = current.overlays?.some((overlay) => (
        (overlay as { metadata?: { mgRenderJobId?: unknown } }).metadata?.mgRenderJobId === input.jobId
      ));
      if (alreadyDelivered) return { delivered: false };
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
    assertProjectTimelineChangeActorKindV1(input.actorKind);
    if (input.actorKind === "UNKNOWN_LEGACY_CALLER"
      || !Number.isSafeInteger(input.overlayId)
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
    assertProjectTimelineChangeActorKindV1(input.actorKind);
    if (input.actorKind === "UNKNOWN_LEGACY_CALLER"
      || !Number.isSafeInteger(input.overlayId)
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

  /**
   * Update an overlay atomically
   */
  async updateOverlay(
    userId: string,
    projectId: string,
    overlayId: number,
    updates: Partial<Overlay>,
  ): Promise<void> {
    const db = await getDatabase();

    const project = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne(
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
    const currentOverlay = project?.overlays?.find(
      (overlay) => overlay.id === overlayId,
    );

    if (!currentOverlay) {
      throw new ProjectMutationWriteError(
        `Overlay ${overlayId} was not found in project ${projectId}.`,
      );
    }

    const expectedRevision = projectRevisionFor(project);

    const updatedOverlay = withAtomicOverlayUpdateReceipt(
      currentOverlay,
      updates,
      {
        source: "project-service-update-overlay",
        intent: `update-${currentOverlay.type}`,
        reason: "overlay mutated through ProjectService.updateOverlay",
      },
    );

    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: expectedRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-overlay_${nanoid(18)}`,
      projectId,
      operation: "UPDATE_OVERLAY",
      fps: project.fps || 30,
      beforeProjectRevision: expectedRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlay: currentOverlay,
      afterOverlay: updatedOverlay,
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": overlayId,
        ...projectRevisionPredicate(expectedRevision),
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
      { arrayFilters: [{ "elem.id": overlayId }] },
    );
    if (result.matchedCount === 0) {
      throw new ProjectMutationConflictError(
        await this.getProjectRevision(userId, projectId),
      );
    }
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
  }

  /**
   * Replace a complete overlay family and related project evidence in one
   * compare-and-swap write. A concurrent editor save wins; callers must retry
   * from fresh project state instead of overwriting it.
   */
  async replaceOverlayFamilyAtomic(
    userId: string,
    projectId: string,
    input: {
      expectedUpdatedAt: Date;
      overlays: Overlay[];
      projectUpdates?: Record<string, any>;
    },
  ): Promise<boolean> {
    assertGenericProjectUpdateFields(input.projectUpdates ?? {}, []);
    if (
      !(input.expectedUpdatedAt instanceof Date) ||
      Number.isNaN(input.expectedUpdatedAt.getTime())
    ) {
      throw new Error(
        "replaceOverlayFamilyAtomic requires a valid project revision timestamp",
      );
    }
    const db = await getDatabase();
    const currentProject = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne(
        { projectId, userId },
        { projection: { projectRevision: 1, updatedAt: 1 } },
      )) as unknown as Pick<
      Project,
      "projectRevision" | "updatedAt"
    > | null;
    if (!currentProject) return false;

    const expectedRevision = projectRevisionFor(currentProject);
    if (
      expectedRevision.compatibilityUpdatedAt !==
      input.expectedUpdatedAt.toISOString()
    ) {
      return false;
    }

    const cleanOverlays = stampPersistedOverlays(
      assetResolver.stripUrlsForLLM(input.overlays),
      "project-service-replace-overlay-family",
    );
    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(expectedRevision),
      },
      {
        $set: {
          ...(input.projectUpdates ?? {}),
          overlays: cleanOverlays,
          updatedAt: committedAt,
        },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) return false;
    if (result.modifiedCount !== 1) throw new ProjectMutationWriteError();

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: {
        schemaVersion: 1,
        value: expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
    return true;
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
      || Object.keys(input).some((key) => (
        key !== "actorKind" && key !== "assertedDurationInFrames"
      ))
      || typeof input.actorKind !== "string"
      || (
        input.assertedDurationInFrames !== undefined
        && (
          !Number.isSafeInteger(input.assertedDurationInFrames)
          || input.assertedDurationInFrames < 0
        )
      )
    ) {
      throw new ProjectMutationWriteError(
        "Project duration reconciliation input is invalid.",
      );
    }
    assertProjectTimelineChangeActorKindV1(input.actorKind);

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
    if (input.assertedDurationInFrames !== undefined
      && input.assertedDurationInFrames !== reconciledDurationInFrames) {
      throw new ProjectMutationWriteError(
        "The caller-supplied duration does not match the ProjectService-derived overlay duration.",
      );
    }
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

  /**
   * Compatibility bridge for the two remaining legacy duration callers. It
   * rejects every generic field update and refuses a duration assertion that
   * differs from the owner-derived value. New callers must use
   * `reconcileProjectDurationFromOverlaysV1` directly.
   */
  async updateProject(
    userId: string,
    projectId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    if (
      !isPlainRecord(updates)
      || Object.keys(updates).length !== 1
      || !Object.prototype.hasOwnProperty.call(updates, "durationInFrames")
      || !Number.isSafeInteger(updates.durationInFrames)
      || (updates.durationInFrames as number) < 0
    ) {
      throw new ProjectMutationWriteError(
        "Generic project updates are disabled; use a ProjectService command boundary.",
      );
    }
    await this.reconcileProjectDurationFromOverlaysV1(userId, projectId, {
      actorKind: "UNKNOWN_LEGACY_CALLER",
      assertedDurationInFrames: updates.durationInFrames as number,
    });
  }

  /**
   * Delete an overlay atomically
   */
  async deleteOverlay(
    userId: string,
    projectId: string,
    overlayId: number,
  ): Promise<void> {
    const db = await getDatabase();
    const project = (await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne(
        { projectId, userId },
        { projection: { overlays: 1, fps: 1, projectRevision: 1, updatedAt: 1 } },
      )) as unknown as Pick<
      Project,
      "overlays" | "fps" | "projectRevision" | "updatedAt"
    > | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    const currentOverlay = project.overlays?.find((overlay) => overlay.id === overlayId);
    if (!currentOverlay) {
      throw new ProjectMutationWriteError(
        `Overlay ${overlayId} was not found in project ${projectId}.`,
      );
    }

    const expectedRevision = projectRevisionFor(project);
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: expectedRevision.value + 1,
      compatibilityUpdatedAt: committedAt.toISOString(),
    };
    const timelineChangeReceipt = createDirectOverlayTimelineChangeReceiptV1({
      receiptId: `timeline-overlay-delete_${nanoid(18)}`,
      projectId,
      operation: "DELETE_OVERLAY",
      fps: project.fps || 30,
      beforeProjectRevision: expectedRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      beforeOverlay: currentOverlay,
      afterOverlay: null,
    });
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": overlayId,
        ...projectRevisionPredicate(expectedRevision),
      },
      {
        $pull: { overlays: { id: overlayId } } as any,
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

    const receipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(receipt);
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
  const value = project.projectRevision;
  const updatedAt =
    project.updatedAt instanceof Date
      ? project.updatedAt
      : new Date(project.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new ProjectMutationWriteError();
  }
  return {
    schemaVersion: 1,
    value:
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : 0,
    compatibilityUpdatedAt: updatedAt.toISOString(),
  };
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
    || !isBoundedNonEmptyStringV1(input.errorMessage, 500)
    || !isPlainRecord(input.audit)
    || input.audit.source !== "qstash-failure-callback"
    || input.audit.sourceMessageId !== input.sourceMessageId
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

function projectRevisionPredicate(
  expectedRevision: ProjectRevisionV1,
): Record<string, unknown> {
  const revisionCounterPredicate =
    expectedRevision.value === 0
      ? {
          $or: [
            { projectRevision: 0 },
            { projectRevision: { $exists: false } },
          ],
        }
      : { projectRevision: expectedRevision.value };

  return {
    ...revisionCounterPredicate,
    updatedAt: new Date(expectedRevision.compatibilityUpdatedAt),
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

function assertProjectTimelineChangeActorKindV1(
  actorKind: ProjectTimelineChangeActorKindV1,
): void {
  if (
    actorKind !== "USER"
    && actorKind !== "AGENT"
    && actorKind !== "SYSTEM"
    && actorKind !== "UNKNOWN_LEGACY_CALLER"
  ) {
    throw new ProjectMutationWriteError("Timeline change actor kind is invalid.");
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
    assertProjectTimelineChangeActorKindV1(
      lock.actorKind as ProjectTimelineChangeActorKindV1,
    );
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
  actorKind: ProjectTimelineChangeActorKindV1;
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

function createDirectOverlayTimelineChangeReceiptV1(input: {
  receiptId: string;
  projectId: string;
  operation:
    | "ADD_OVERLAY"
    | "UPDATE_OVERLAY"
    | "APPLY_VIDEO_SPEED_RAMP"
    | "DELETE_OVERLAY";
  actorKind?: ProjectTimelineChangeActorKindV1;
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
  const actorKind = input.actorKind ?? "UNKNOWN_LEGACY_CALLER";
  assertProjectTimelineChangeActorKindV1(actorKind);

  return {
    schemaVersion: 1,
    receiptId: input.receiptId,
    projectId: input.projectId,
    operation: input.operation,
    actorKind,
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
