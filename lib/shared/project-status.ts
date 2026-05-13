/**
 * Project Lifecycle State Machine
 *
 * Tracks project status from creation through publication.
 * Any state can transition to 'failed' with error context.
 */

import { getDatabase } from '@/lib/editron/db/mongodb';
import { emitBrandEvent } from './brand-events';

// ==================== Types ====================

export type ProjectStatus =
  | 'draft'
  | 'scripting'
  | 'storyboarding'
  | 'generating'
  | 'editing'
  | 'reviewing'
  | 'rendering'
  | 'rendered'
  | 'published'
  | 'archived'
  | 'failed';

export interface StatusTransition {
  from: ProjectStatus;
  to: ProjectStatus;
  timestamp: Date;
  trigger: string;
}

export interface ProjectError {
  message: string;
  service: string;
  timestamp: Date;
}

const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ['scripting', 'generating', 'editing', 'failed'],
  scripting: ['storyboarding', 'failed'],
  storyboarding: ['generating', 'failed'],
  generating: ['editing', 'failed'],
  editing: ['reviewing', 'rendering', 'failed'],
  reviewing: ['rendering', 'editing', 'failed'],
  rendering: ['rendered', 'failed'],
  rendered: ['published', 'archived', 'editing', 'failed'],
  published: ['archived', 'failed'],
  archived: ['draft', 'failed'],
  failed: ['draft', 'editing'],
};

// ==================== Transition ====================

export async function transitionProjectStatus(
  projectId: string,
  userId: string,
  newStatus: ProjectStatus,
  trigger: string,
  error?: { message: string; service: string },
): Promise<{ success: boolean; previousStatus?: ProjectStatus; error?: string }> {
  const db = await getDatabase();
  const col = db.collection('projects');

  const project = await col.findOne({ projectId, userId });
  if (!project) return { success: false, error: 'Project not found' };

  const currentStatus: ProjectStatus = project.status || 'draft';
  const allowed = VALID_TRANSITIONS[currentStatus];

  if (!allowed?.includes(newStatus)) {
    return {
      success: false,
      previousStatus: currentStatus,
      error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
    };
  }

  const transition: StatusTransition = {
    from: currentStatus,
    to: newStatus,
    timestamp: new Date(),
    trigger,
  };

  const update: Record<string, unknown> = {
    $set: {
      status: newStatus,
      updatedAt: new Date(),
    },
    $push: {
      statusHistory: transition,
    },
  };

  if (newStatus === 'failed' && error) {
    (update.$set as Record<string, unknown>).lastError = {
      message: error.message,
      service: error.service,
      timestamp: new Date(),
    };
  }

  if (newStatus !== 'failed' && currentStatus === 'failed') {
    (update.$set as Record<string, unknown>).lastError = null;
  }

  await col.updateOne({ projectId, userId }, update);

  emitBrandEvent({
    userId,
    projectId,
    service: 'editron',
    type: 'status_changed',
    payload: {
      from: currentStatus,
      to: newStatus,
      trigger,
      error: error || null,
    },
  }).catch((err) => console.error('[ProjectStatus] Event emission failed:', err));

  return { success: true, previousStatus: currentStatus };
}

// ==================== Query ====================

export async function getProjectStatus(
  projectId: string,
  userId: string,
): Promise<{ status: ProjectStatus; statusHistory: StatusTransition[]; lastError?: ProjectError } | null> {
  const db = await getDatabase();
  const project = await db.collection('projects').findOne(
    { projectId, userId },
    { projection: { status: 1, statusHistory: 1, lastError: 1 } },
  );

  if (!project) return null;

  return {
    status: project.status || 'draft',
    statusHistory: project.statusHistory || [],
    lastError: project.lastError || undefined,
  };
}

export async function getProjectsByStatus(
  status: ProjectStatus | ProjectStatus[],
  options?: { userId?: string; limit?: number },
): Promise<Array<{ projectId: string; userId: string; name: string; status: ProjectStatus; updatedAt: Date; brandId?: string; lastError?: ProjectError }>> {
  const db = await getDatabase();
  const filter: Record<string, unknown> = {
    status: Array.isArray(status) ? { $in: status } : status,
  };
  if (options?.userId) filter.userId = options.userId;

  return db
    .collection('projects')
    .find(filter, {
      projection: { projectId: 1, userId: 1, name: 1, status: 1, updatedAt: 1, brandId: 1, lastError: 1 },
    })
    .sort({ updatedAt: -1 })
    .limit(options?.limit ?? 100)
    .toArray() as any;
}

export async function getStatusSummary(
  userId?: string,
): Promise<Array<{ status: ProjectStatus; count: number }>> {
  const db = await getDatabase();
  const pipeline: any[] = [
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $project: { _id: 0, status: '$_id', count: 1 } },
    { $sort: { count: -1 } },
  ];

  if (userId) {
    pipeline.unshift({ $match: { userId } });
  }

  return db.collection('projects').aggregate(pipeline).toArray() as any;
}
