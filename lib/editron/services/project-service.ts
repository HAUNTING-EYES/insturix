/**
 * Project Service
 *
 * Service layer for project CRUD operations
 */

import { getDatabase, COLLECTIONS } from "../db/mongodb";
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

  constructor() {
    super("Project mutation did not produce exactly one durable update.");
    this.name = "ProjectMutationWriteError";
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
  createdAt: Date;
  updatedAt: Date;
  /** Durable optimistic-concurrency counter for ProjectService editor writes. */
  projectRevision?: number;
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
      templateId?: string;
      brandId?: string;
      orgId?: string | null;
      sourceSessionId?: string;
    },
  ): Promise<Project> {
    const projectId = `proj_${nanoid(12)}`;

    const project: Project = {
      projectId,
      userId,
      name,
      overlays: [],
      aspectRatio: "16:9",
      playerDimensions: {
        width: 1920,
        height: 1080,
      },
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
    } = {},
  ): Promise<ProjectMutationReceiptV1> {
    return this.persistEditorState({
      userId,
      projectId,
      state,
      expectedRevision: options.expectedRevision,
      overlayAuthority: options.overlayAuthority ?? "server",
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
    mode: "manual" | "autosave";
  }): Promise<ProjectMutationReceiptV1> {
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

    const lock = currentProject as Project & {
      directorLock?: boolean;
      directorLockAt?: Date | string;
    };
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
    if (input.mode === "autosave" && lock.directorLock === true) {
      update.$unset = { directorLock: "", directorLockAt: "" };
    }

    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      {
        projectId: input.projectId,
        userId: input.userId,
        ...projectRevisionPredicate(expectedRevision),
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

    return {
      schemaVersion: 1,
      projectId: input.projectId,
      revision: {
        schemaVersion: 1,
        value: expectedRevision.value + 1,
        compatibilityUpdatedAt: committedAt.toISOString(),
      },
      committedAt: committedAt.toISOString(),
    };
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
    const overlayWithReceipt = ensureAtomicOverlayReceipt(overlay, {
      source: "project-service-add-overlay",
      intent: `persist-${overlay.type}`,
      reason: "overlay persisted through ProjectService.addOverlay",
    });
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      {
        $push: { overlays: overlayWithReceipt } as any,
        $set: { updatedAt: new Date() },
      },
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
        { projection: { overlays: 1 } },
      )) as unknown as Pick<Project, "overlays"> | null;
    const currentOverlay = project?.overlays?.find(
      (overlay) => overlay.id === overlayId,
    );

    if (!currentOverlay) {
      console.warn(
        `[ProjectService] updateOverlay skipped: overlay ${overlayId} not found in ${projectId}`,
      );
      return;
    }

    const updatedOverlay = withAtomicOverlayUpdateReceipt(
      currentOverlay,
      updates,
      {
        source: "project-service-update-overlay",
        intent: `update-${currentOverlay.type}`,
        reason: "overlay mutated through ProjectService.updateOverlay",
      },
    );

    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      {
        $set: {
          "overlays.$[elem]": updatedOverlay,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ "elem.id": overlayId }] },
    );
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
    if (
      !(input.expectedUpdatedAt instanceof Date) ||
      Number.isNaN(input.expectedUpdatedAt.getTime())
    ) {
      throw new Error(
        "replaceOverlayFamilyAtomic requires a valid project revision timestamp",
      );
    }
    const cleanOverlays = stampPersistedOverlays(
      assetResolver.stripUrlsForLLM(input.overlays),
      "project-service-replace-overlay-family",
    );
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId, updatedAt: input.expectedUpdatedAt },
      {
        $set: {
          ...(input.projectUpdates ?? {}),
          overlays: cleanOverlays,
          updatedAt: new Date(),
        },
      },
    );
    return result.matchedCount === 1;
  }

  /**
   * Update project-level fields atomically (e.g., durationInFrames)
   */
  async updateProject(
    userId: string,
    projectId: string,
    updates: Record<string, any>,
  ): Promise<void> {
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
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      {
        $pull: { overlays: { id: overlayId } } as any,
        $set: { updatedAt: new Date() },
      },
    );
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

// Singleton instance
export const projectService = new ProjectService();
