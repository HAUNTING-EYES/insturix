/**
 * Project Service
 *
 * Service layer for project CRUD operations
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

import { connectToDatabase, getDatabase, COLLECTIONS } from "../db/mongodb";
import { assetResolver } from "./asset-resolver";
import type {
  Overlay,
  AspectRatio,
} from "@/components/editron/editor/version-7.0.0/types";
import {
  ensureAtomicOverlayReceipt,
  withAtomicOverlayUpdateReceipt,
} from "../engine/overlay-atomic-receipts";
import { nanoid } from "nanoid";
import {
  mergeServerOwnedOverlayDataForSave,
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
import type { AudioRightsContract } from "@/lib/editron/shared/render-request-payload";
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

export interface EditorState {
  overlays: Overlay[];
  aspectRatio: AspectRatio;
  playerDimensions: {
    width: number;
    height: number;
  };
  fps?: number;
  durationInFrames?: number;
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

/**
 * Current product frame-coordinate vocabulary for ProjectService timeline
 * changes. This deliberately does not claim rational, PTS, VFR, reel or
 * timecode semantics; those belong to the later canonical media spine.
 */
export type ProjectTimelineChangeActorKindV1 = "USER" | "AGENT" | "SYSTEM";

export interface ProjectTimelineRippleEffectV1 {
  kind: "REMOVE_AND_SHIFT_LEFT";
  removedFrameRange: TimelineFrameRangeV1;
  shiftedBeforeFrameRange: TimelineFrameRangeV1 | null;
  shiftedAfterFrameRange: TimelineFrameRangeV1 | null;
  deltaFrames: number;
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
  operation: "CUT_TIMELINE_RANGE";
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
  changedPaths: readonly ["overlays", "durationInFrames", "timelineRangeChangeReceipts"];
  timelineCoordinateTransform: TimelineRangeCutCoordinateTransformV1;
  splitChildren: readonly TimelineRangeCutSplitChildV1[];
  ripple: ProjectTimelineRippleEffectV1;
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
}

export interface ProjectTimelineRangeCutResultV1 {
  cut: TimelineRangeCutResult;
  mutationReceipt: ProjectMutationReceiptV1;
  timelineChangeReceipt: ProjectTimelineRangeChangeReceiptV1;
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
  /** Bounded ProjectService-owned history for timeline-range reconciliation. */
  timelineRangeChangeReceipts?: ProjectTimelineRangeChangeReceiptV1[];
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

    const db = await getDatabase();
    const project = (await db.collection(COLLECTIONS.PROJECTS).findOne({
      projectId,
      userId,
    })) as Project | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();

    const currentRevision = projectRevisionFor(project);
    const expectedRevision = input.expectedRevision ?? currentRevision;
    if (!sameProjectRevisionV1(expectedRevision, currentRevision)) {
      throw new ProjectMutationConflictError(currentRevision);
    }
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
    const committedAt = new Date();
    const afterRevision: ProjectRevisionV1 = {
      schemaVersion: 1,
      value: expectedRevision.value + 1,
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
      beforeProjectRevision: expectedRevision,
      afterProjectRevision: afterRevision,
      committedAt: committedAt.toISOString(),
      readFrameRangesBefore: [{ startFrame: 0, endFrame: beforeDurationInFrames }],
      writeFrameRangesBefore: [affectedRangeBefore],
      affectedFrameRangesAfter: shiftedAfterFrameRange ? [shiftedAfterFrameRange] : [],
      affectedOverlayRefs,
      changedPaths: ["overlays", "durationInFrames", "timelineRangeChangeReceipts"],
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
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(expectedRevision),
      },
      {
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

    const mutationReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId,
      revision: afterRevision,
      committedAt: committedAt.toISOString(),
    };
    this.publishMutationReceipt(mutationReceipt);
    return { cut, mutationReceipt, timelineChangeReceipt };
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
    project.overlays = await assetResolver.resolveProjectAssets(project.overlays ?? []);
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
   * Releases only the lease identified by its unguessable token. A successful
   * Director save clears the lease atomically, so this is only the failure or
   * cancellation cleanup path.
   */
  async releaseDirectorMutationLease(
    userId: string,
    projectId: string,
    leaseId: string,
  ): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId, directorLockToken: leaseId },
      {
        $unset: {
          directorLock: "",
          directorLockAt: "",
          directorLockToken: "",
        },
      },
    );
    return result.modifiedCount === 1;
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
        durationInFrames: input.state.durationInFrames || 0,
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
    const expectedRevision = await this.getProjectRevision(userId, projectId);
    const overlayWithReceipt = ensureAtomicOverlayReceipt(overlay, {
      source: "project-service-add-overlay",
      intent: `persist-${overlay.type}`,
      reason: "overlay persisted through ProjectService.addOverlay",
    });
    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        ...projectRevisionPredicate(expectedRevision),
      },
      {
        $push: { overlays: overlayWithReceipt } as any,
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
      revision: {
        schemaVersion: 1,
        value: expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
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
    const overlayWithReceipt = ensureAtomicOverlayReceipt(input.overlay, {
      source: "project-service-add-overlay-if-absent",
      intent: `persist-${input.overlay.type}`,
      reason: "overlay was attached through ProjectService at one project revision",
    });
    const committedAt = new Date();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId,
        userId,
        "overlays.id": { $ne: input.overlay.id },
        ...projectRevisionPredicate(input.expectedRevision),
      },
      {
        $push: { overlays: overlayWithReceipt } as any,
        $set: { updatedAt: committedAt },
        $inc: { projectRevision: 1 },
      },
    );
    if (result.matchedCount === 0) return { attached: false };
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
        { projection: { overlays: 1, projectRevision: 1, updatedAt: 1 } },
      )) as unknown as Pick<
      Project,
      "overlays" | "projectRevision" | "updatedAt"
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
      revision: {
        schemaVersion: 1,
        value: expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
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
   * Update project-level fields atomically (e.g., durationInFrames)
   */
  async updateProject(
    userId: string,
    projectId: string,
    updates: Record<string, any>,
  ): Promise<void> {
    assertGenericProjectUpdateFields(updates, []);
    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
    );
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
        { projection: { overlays: 1, projectRevision: 1, updatedAt: 1 } },
      )) as unknown as Pick<
      Project,
      "overlays" | "projectRevision" | "updatedAt"
    > | null;
    if (!project) throw new ProjectNotFoundOrForbiddenError();
    if (!project.overlays?.some((overlay) => overlay.id === overlayId)) {
      throw new ProjectMutationWriteError(
        `Overlay ${overlayId} was not found in project ${projectId}.`,
      );
    }

    const expectedRevision = projectRevisionFor(project);
    const committedAt = new Date();
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
      revision: {
        schemaVersion: 1,
        value: expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
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

function isBoundedNonEmptyStringV1(value: unknown, maxLength: number): boolean {
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
  if (actorKind !== "USER" && actorKind !== "AGENT" && actorKind !== "SYSTEM") {
    throw new ProjectMutationWriteError("Timeline change actor kind is invalid.");
  }
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
