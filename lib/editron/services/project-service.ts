/**
 * Project Service
 * 
 * Service layer for project CRUD operations
 */

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { assetResolver } from './asset-resolver';
import type { Overlay, AspectRatio } from '@/components/editron/editor/version-7.0.0/types';
import { ensureAtomicOverlayReceipt, withAtomicOverlayUpdateReceipt } from '../engine/overlay-atomic-receipts';
import { nanoid } from 'nanoid';
import { orgMemberService } from '@/lib/services/orgMemberService';
import { removeProjectFromLinks } from '@/lib/shared/project-links';

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
  lastAutosaveAt?: Date;
  // Organization support
  orgId?: string;
  sharedWith?: string[];
  visibility: 'private' | 'org' | 'shared';
  // Dashboard fields (added for production floor dashboard)
  brand?: string | null;
  pipelineStage?: 'script' | 'edit' | 'analyze' | 'thumbnails' | 'publish' | 'complete';
  qualityScore?: number | null;
  projectStatus?: 'active' | 'needs-attention' | 'complete' | 'failed';
  // Brand Intelligence + Project Tracking
  status?: import('@/lib/shared/project-status').ProjectStatus;
  statusHistory?: import('@/lib/shared/project-status').StatusTransition[];
  brandId?: string;
  lastError?: import('@/lib/shared/project-status').ProjectError;
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
  pipelineStage?: 'script' | 'edit' | 'analyze' | 'thumbnails' | 'publish' | 'complete';
  qualityScore?: number | null;
  projectStatus?: 'active' | 'needs-attention' | 'complete' | 'failed';
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
    if (project.orgId && project.visibility === 'org') {
      const isMember = await orgMemberService.isMember(userId, project.orgId);
      if (isMember) return true;
    }
    
    // Check explicit sharing
    if (project.visibility === 'shared' && project.sharedWith?.includes(userId)) {
      return true;
    }
    
    return false;
  }

  /**
   * Create new personal project
   */
  async createProject(userId: string, name: string, options?: { templateId?: string; brandId?: string }): Promise<Project> {
    const projectId = `proj_${nanoid(12)}`;

    const project: Project = {
      projectId,
      userId,
      name,
      overlays: [],
      aspectRatio: '16:9',
      playerDimensions: {
        width: 1920,
        height: 1080,
      },
      fps: 30,
      durationInFrames: 0,
      visibility: 'private',
      pipelineStage: 'edit',
      projectStatus: 'active',
      ...(options?.brandId ? { brandId: options.brandId } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).insertOne(project);

    return project;
  }

  /**
   * Create new organization project
   */
  async createOrgProject(userId: string, orgId: string, name: string): Promise<Project> {
    // Verify user is member of org
    const isMember = await orgMemberService.isMember(userId, orgId);
    if (!isMember) {
      throw new Error('User is not a member of this organization');
    }

    const projectId = `proj_${nanoid(12)}`;
    
    const project: Project = {
      projectId,
      userId,
      orgId,
      name,
      overlays: [],
      aspectRatio: '16:9',
      playerDimensions: {
        width: 1920,
        height: 1080,
      },
      fps: 30,
      durationInFrames: 0,
      visibility: 'org',
      createdAt: new Date(),
      updatedAt: new Date(),
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
    options?: { brandId?: string; orgId?: string }
  ): Promise<Project | null> {
    const db = await getDatabase();

    // Idempotent: skip if a project already exists for this session
    const existing = await db.collection(COLLECTIONS.PROJECTS).findOne({
      userId,
      sourceSessionId: sessionId,
    }) as unknown as Project | null;
    if (existing) return null;

    const projectId = `proj_${nanoid(12)}`;

    const project: Project = {
      projectId,
      userId,
      name,
      overlays: [],
      aspectRatio: '16:9',
      playerDimensions: { width: 1920, height: 1080 },
      fps: 30,
      durationInFrames: 0,
      visibility: options?.orgId ? 'org' : 'private',
      pipelineStage: 'script',
      projectStatus: 'active',
      ...(options?.brandId ? { brandId: options.brandId } : {}),
      ...(options?.orgId ? { orgId: options.orgId } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store sourceSessionId as an extra field for linkage
    const doc = { ...project, sourceSessionId: sessionId };
    await db.collection(COLLECTIONS.PROJECTS).insertOne(doc);

    return project;
  }

  /**
   * Find existing project by source session ID (for reuse during finalize).
   */
  async findProjectBySessionId(userId: string, sessionId: string): Promise<Project | null> {
    const db = await getDatabase();
    return db.collection(COLLECTIONS.PROJECTS).findOne({
      userId,
      sourceSessionId: sessionId,
    }) as unknown as Project | null;
  }

  /**
   * Load project by ID
   */
  async loadProject(userId: string, projectId: string): Promise<Project | null> {
    const db = await getDatabase();
    const project = await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne({ projectId }) as unknown as Project | null;

    if (!project) {
      return null;
    }

    // Check access using org-aware access control
    const hasAccess = await this.canAccessProject(userId, project);
    if (!hasAccess) {
      console.warn(`User ${userId} attempted to access project ${projectId} without permission`);
      return null;
    }

    // Resolve asset IDs to signed URLs
    project.overlays = await assetResolver.resolveProjectAssets(project.overlays);

    return project;
  }

  /**
   * Save project (manual save)
   */
  async saveProject(userId: string, projectId: string, state: EditorState): Promise<void> {
    // Strip URLs before saving (keep only assetIds)
    const cleanOverlays = assetResolver.stripUrlsForLLM(state.overlays);

    // Validate playerDimensions
    const dimensions = (state.playerDimensions && 
                        typeof state.playerDimensions.width === 'number' && 
                        typeof state.playerDimensions.height === 'number')
                        ? state.playerDimensions
                        : { width: 1920, height: 1080 };

    const db = await getDatabase();

    // F6.6 FIX: Preserve worker-added overlays (BGM, SFX, captions from Director).
    // These have _workerAdded: true. The browser doesn't know about them yet
    // (they were pushed after the user loaded the project), so the browser's
    // save payload doesn't include them. We must merge them back.
    const currentProject = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId }) as any;
    const workerOverlays = (currentProject?.overlays || []).filter((o: any) => o._workerAdded === true);

    // Merge: browser overlays + any worker-added overlays not already in browser set
    const browserOverlayIds = new Set(cleanOverlays.map((o: any) => o.id));
    const missingWorkerOverlays = workerOverlays.filter((o: any) => !browserOverlayIds.has(o.id));
    const mergedOverlays = stampPersistedOverlays(
      [...cleanOverlays, ...missingWorkerOverlays],
      'project-service-save',
    );

    if (missingWorkerOverlays.length > 0) {
      console.log(`[saveProject] Preserved ${missingWorkerOverlays.length} worker-added overlays (BGM/SFX/captions)`);
    }

    // Update existing project only - project must exist
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId }, // Filter by unique projectId
      {
        $set: {
          overlays: mergedOverlays,
          aspectRatio: state.aspectRatio,
          playerDimensions: dimensions,
          fps: state.fps || 30,
          durationInFrames: state.durationInFrames || 0,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      throw new Error(`Project ${projectId} not found`);
    }
  }

  /**
   * Update pipeline metadata on a project (stage, score, status, brand).
   * Separate from saveProject which handles editor state (overlays, dimensions).
   */
  async updateProjectMetadata(
    projectId: string,
    metadata: Partial<Pick<Project, 'pipelineStage' | 'qualityScore' | 'projectStatus' | 'brand'>>
  ): Promise<void> {
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId },
      { $set: { ...metadata, updatedAt: new Date() } }
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
    projectId: string
  ): Promise<Project['projectStatus']> {
    const db = await getDatabase();

    // 1. Find storyboards that belong to this project
    const storyboards = await db.collection('storyboards')
      .find(
        { projectId },
        { projection: { storyboardId: 1 } }
      )
      .toArray();

    const storyboardIds = storyboards.map(s => s.storyboardId).filter(Boolean);

    // 2. Check for any failed or partial video batches
    //    Match on either: storyboardId in the set OR direct projectId on the batch.
    const failedBatchCount = await db.collection('pipeline_video_batches').countDocuments({
      $or: [
        ...(storyboardIds.length > 0
          ? [{ storyboardId: { $in: storyboardIds } }]
          : []),
        { projectId },
      ],
      status: { $in: ['failed', 'partial', 'partial_enqueue_failure'] },
    });

    if (failedBatchCount > 0) {
      return 'needs-attention';
    }

    // 3. Check the project's pipeline stage
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId },
      { projection: { pipelineStage: 1 } }
    ) as unknown as Pick<Project, 'pipelineStage'> | null;

    if (project?.pipelineStage === 'complete') {
      return 'complete';
    }

    return 'active';
  }

  /**
   * Derive and persist the project status in one call.
   * Convenience wrapper — derives the status then writes it to the document.
   */
  async refreshProjectStatus(projectId: string): Promise<Project['projectStatus']> {
    const status = await this.deriveProjectStatus(projectId);
    await this.updateProjectMetadata(projectId, { projectStatus: status });
    return status;
  }

  /**
   * Autosave project (background save)
   */
  async autosaveProject(userId: string, projectId: string, state: EditorState): Promise<void> {
    // Strip URLs before saving
    const cleanOverlays = assetResolver.stripUrlsForLLM(state.overlays);

    // Validate playerDimensions
    const dimensions = (state.playerDimensions && 
                        typeof state.playerDimensions.width === 'number' && 
                        typeof state.playerDimensions.height === 'number')
                        ? state.playerDimensions
                        : { width: 1920, height: 1080 };

    const db = await getDatabase();

    // E2 FIX: Skip autosave if Director Agent is currently executing.
    // Director sets directorLock=true during execution. Autosave would
    // clobber Director's in-progress changes.
    const currentProject = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId }) as any;
    if (currentProject?.directorLock) {
      const lockAge = Date.now() - new Date(currentProject.directorLockAt).getTime();
      if (lockAge < 5 * 60 * 1000) { // Lock valid for up to 5 minutes
        console.log(`[Autosave] Skipped — Director Agent is running (locked ${Math.round(lockAge / 1000)}s ago)`);
        return;
      }
      // Lock expired (>5 min) — Director probably crashed. Release and continue.
      console.warn(`[Autosave] Director lock expired (${Math.round(lockAge / 1000)}s), releasing`);
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { projectId },
        { $unset: { directorLock: '', directorLockAt: '' } },
      );
    }

    // A3 FIX: Preserve worker-added overlays on autosave.
    const workerOverlays = (currentProject?.overlays || []).filter((o: any) => o._workerAdded === true);
    const browserOverlayIds = new Set(cleanOverlays.map((o: any) => o.id));
    const missingWorkerOverlays = workerOverlays.filter((o: any) => !browserOverlayIds.has(o.id));
    const mergedOverlays = stampPersistedOverlays(
      [...cleanOverlays, ...missingWorkerOverlays],
      'project-service-autosave',
    );

    // Update existing project only (no upsert for autosave)
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId },
      {
        $set: {
          overlays: mergedOverlays,
          aspectRatio: state.aspectRatio,
          playerDimensions: dimensions,
          fps: state.fps || 30,
          durationInFrames: state.durationInFrames || 0,
          lastAutosaveAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      console.warn(`Autosave failed: Project ${projectId} not found`);
    }
  }

  /**
   * Delete project
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    const db = await getDatabase();
    
    // Verify ownership before deleting
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId });
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.userId !== userId) {
      throw new Error('Unauthorized: Cannot delete project owned by another user');
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
      console.error(`[deleteProject] Link cleanup failed for ${projectId}: ${linkErr.message}`);
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
    sortBy: 'createdAt' | 'updatedAt' | 'name' = 'updatedAt'
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
    sortOrder[sortBy] = sortBy === 'name' ? 1 : -1;

    const projects = await collection
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
      .toArray() as unknown as ProjectListItem[];

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
    sortBy: 'createdAt' | 'updatedAt' | 'name' = 'updatedAt'
  ): Promise<{
    projects: ProjectListItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    // Verify user is member of org
    const isMember = await orgMemberService.isMember(userId, orgId);
    if (!isMember) {
      throw new Error('User is not a member of this organization');
    }

    const db = await getDatabase();
    const collection = db.collection(COLLECTIONS.PROJECTS);

    const query = { orgId, visibility: 'org' };
    const total = await collection.countDocuments(query);
    const skip = (page - 1) * limit;

    const sortOrder: any = {};
    sortOrder[sortBy] = sortBy === 'name' ? 1 : -1;

    const projects = await collection
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
      })
      .sort(sortOrder)
      .allowDiskUse(true)
      .skip(skip)
      .limit(limit)
      .toArray() as unknown as ProjectListItem[];

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
  async updateProjectName(userId: string, projectId: string, name: string): Promise<void> {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      {
        $set: {
          name,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Add an overlay atomically
   */
  async addOverlay(userId: string, projectId: string, overlay: Overlay): Promise<void> {
    const db = await getDatabase();
    const overlayWithReceipt = ensureAtomicOverlayReceipt(overlay, {
      source: 'project-service-add-overlay',
      intent: `persist-${overlay.type}`,
      reason: 'overlay persisted through ProjectService.addOverlay',
    });
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      { 
        $push: { overlays: overlayWithReceipt } as any,
        $set: { updatedAt: new Date() }
      }
    );
  }

  /**
   * Update an overlay atomically
   */
  async updateOverlay(userId: string, projectId: string, overlayId: number, updates: Partial<Overlay>): Promise<void> {
    const db = await getDatabase();

    const project = await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
      { projection: { overlays: 1 } },
    ) as unknown as Pick<Project, 'overlays'> | null;
    const currentOverlay = project?.overlays?.find((overlay) => overlay.id === overlayId);

    if (!currentOverlay) {
      console.warn(`[ProjectService] updateOverlay skipped: overlay ${overlayId} not found in ${projectId}`);
      return;
    }

    const updatedOverlay = withAtomicOverlayUpdateReceipt(
      currentOverlay,
      updates,
      {
        source: 'project-service-update-overlay',
        intent: `update-${currentOverlay.type}`,
        reason: 'overlay mutated through ProjectService.updateOverlay',
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
      { arrayFilters: [{ "elem.id": overlayId }] }
    );
  }

  /**
   * Update project-level fields atomically (e.g., durationInFrames)
   */
  async updateProject(userId: string, projectId: string, updates: Record<string, any>): Promise<void> {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Delete an overlay atomically
   */
  async deleteOverlay(userId: string, projectId: string, overlayId: number): Promise<void> {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId },
      { 
        $pull: { overlays: { id: overlayId } } as any,
        $set: { updatedAt: new Date() }
      }
    );
  }
}

function stampPersistedOverlays(overlays: Overlay[], source: string): Overlay[] {
  return overlays.map((overlay) =>
    ensureAtomicOverlayReceipt(overlay, {
      source,
      intent: `persist-${overlay.type}`,
      reason: 'overlay persisted in project state',
    }),
  );
}

// Singleton instance
export const projectService = new ProjectService();
