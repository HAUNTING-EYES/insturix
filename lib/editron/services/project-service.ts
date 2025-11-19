/**
 * Project Service
 * 
 * Service layer for project CRUD operations
 */

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { assetResolver } from './asset-resolver';
import type { Overlay, AspectRatio } from '@/components/editron/editor/version-7.0.0/types';
import { nanoid } from 'nanoid';

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
}

export interface ProjectListItem {
  projectId: string;
  name: string;
  thumbnail?: string;
  updatedAt: Date;
  durationInFrames: number;
  aspectRatio: AspectRatio;
}

export class ProjectService {
  /**
   * Create new project
   */
  async createProject(userId: string, name: string, templateId?: string): Promise<Project> {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await getDatabase();
    await db.collection(COLLECTIONS.PROJECTS).insertOne(project);

    return project;
  }

  /**
   * Load project by ID
   */
  async loadProject(userId: string, projectId: string): Promise<Project | null> {
    const db = await getDatabase();
    const project = await db
      .collection(COLLECTIONS.PROJECTS)
      .findOne({ projectId }) as unknown as Project | null; // Filter by unique projectId only

    if (!project) {
      return null;
    }

    // Verify userId matches (security check)
    if (project.userId !== userId) {
      console.warn(`User ${userId} attempted to access project ${projectId} owned by ${project.userId}`);
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

    const db = await getDatabase();
    
    // Update existing project only - project must exist
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId }, // Filter by unique projectId
      {
        $set: {
          overlays: cleanOverlays,
          aspectRatio: state.aspectRatio,
          playerDimensions: state.playerDimensions,
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
   * Autosave project (background save)
   */
  async autosaveProject(userId: string, projectId: string, state: EditorState): Promise<void> {
    // Strip URLs before saving
    const cleanOverlays = assetResolver.stripUrlsForLLM(state.overlays);

    const db = await getDatabase();
    
    // Update existing project only (no upsert for autosave)
    // If project doesn't exist, autosave should fail silently
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId }, // Filter by unique projectId
      {
        $set: {
          overlays: cleanOverlays,
          aspectRatio: state.aspectRatio,
          playerDimensions: state.playerDimensions,
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
      })
      .sort(sortOrder)
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
}

// Singleton instance
export const projectService = new ProjectService();
