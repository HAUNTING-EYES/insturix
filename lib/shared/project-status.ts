/**
 * Project Lifecycle State Machine
 *
 * Tracks project status from creation through publication.
 * Any state can transition to 'failed' with error context.
 */

import { getDatabase } from '@/lib/editron/db/mongodb';
import { emitBrandEvent } from './brand-events';
import {
  ProjectMutationConflictError,
  ProjectNotFoundOrForbiddenError,
  projectService,
  type EditorState,
  type Project,
  type ProjectMutationReceiptV1,
} from '@/lib/editron/services/project-service';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-revision-v1';

const MAX_STATUS_HISTORY = 200;

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

export interface ProjectStatusMutationPortV1 {
  loadProjectForMutation(
    userId: string,
    projectId: string,
  ): Promise<{ project: Project; revision: ProjectRevisionV1 }>;
  saveProjectWithReceipt(
    userId: string,
    projectId: string,
    state: EditorState,
    options: {
      expectedRevision: ProjectRevisionV1;
      projectUpdates: Record<string, unknown>;
    },
  ): Promise<ProjectMutationReceiptV1>;
}

function nonEmptyString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && Object.hasOwn(VALID_TRANSITIONS, value);
}

function readStatusHistory(value: unknown): StatusTransition[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_STATUS_HISTORY) return null;
  const result: StatusTransition[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const candidate = item as Record<string, unknown>;
    const trigger = nonEmptyString(candidate.trigger, 500);
    const timestamp = candidate.timestamp instanceof Date
      ? candidate.timestamp
      : new Date(candidate.timestamp as string | number);
    if (
      !isProjectStatus(candidate.from)
      || !isProjectStatus(candidate.to)
      || !trigger
      || Number.isNaN(timestamp.getTime())
    ) return null;
    result.push({
      from: candidate.from,
      to: candidate.to,
      timestamp,
      trigger,
    });
  }
  return result;
}

// ==================== Transition ====================

export async function transitionProjectStatus(
  projectId: string,
  userId: string,
  newStatus: ProjectStatus,
  trigger: string,
  error?: { message: string; service: string },
  projectStore: ProjectStatusMutationPortV1 = projectService,
): Promise<{
  success: boolean;
  previousStatus?: ProjectStatus;
  error?: string;
  receipt?: ProjectMutationReceiptV1;
  disposition?: 'COMMITTED' | 'ALREADY_CURRENT';
}> {
  const normalizedProjectId = nonEmptyString(projectId, 500);
  const normalizedUserId = nonEmptyString(userId, 500);
  const normalizedTrigger = nonEmptyString(trigger, 500);
  if (!normalizedProjectId || !normalizedUserId || !isProjectStatus(newStatus) || !normalizedTrigger) {
    return { success: false, error: 'Invalid project status transition input' };
  }
  const normalizedError = error
    ? {
        message: nonEmptyString(error.message, 2_000),
        service: nonEmptyString(error.service, 200),
      }
    : null;
  if (error && (!normalizedError?.message || !normalizedError.service)) {
    return { success: false, error: 'Invalid project status error evidence' };
  }

  let snapshot: Awaited<ReturnType<ProjectStatusMutationPortV1['loadProjectForMutation']>>;
  try {
    snapshot = await projectStore.loadProjectForMutation(normalizedUserId, normalizedProjectId);
  } catch (loadError) {
    if (loadError instanceof ProjectNotFoundOrForbiddenError) {
      return { success: false, error: 'Project not found' };
    }
    throw loadError;
  }

  const currentStatus = snapshot.project.status ?? 'draft';
  if (!isProjectStatus(currentStatus)) {
    return { success: false, error: 'Project has an invalid current status' };
  }
  if (currentStatus === newStatus) {
    return {
      success: true,
      previousStatus: currentStatus,
      disposition: 'ALREADY_CURRENT',
    };
  }
  const allowed = VALID_TRANSITIONS[currentStatus];

  if (!allowed?.includes(newStatus)) {
    return {
      success: false,
      previousStatus: currentStatus,
      error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
    };
  }

  const history = readStatusHistory(snapshot.project.statusHistory);
  if (!history) {
    return {
      success: false,
      previousStatus: currentStatus,
      error: 'Project status history is malformed or unbounded',
    };
  }
  const transitionedAt = new Date();
  const transition: StatusTransition = {
    from: currentStatus,
    to: newStatus,
    timestamp: transitionedAt,
    trigger: normalizedTrigger,
  };
  const projectUpdates: Record<string, unknown> = {
    status: newStatus,
    statusHistory: [...history, transition].slice(-MAX_STATUS_HISTORY),
  };

  if (newStatus === 'failed' && normalizedError?.message && normalizedError.service) {
    projectUpdates.lastError = {
      message: normalizedError.message,
      service: normalizedError.service,
      timestamp: transitionedAt,
    };
  }
  if (newStatus !== 'failed' && currentStatus === 'failed') {
    projectUpdates.lastError = null;
  }

  let receipt: ProjectMutationReceiptV1;
  try {
    receipt = await projectStore.saveProjectWithReceipt(
      normalizedUserId,
      normalizedProjectId,
      snapshot.project,
      {
        expectedRevision: snapshot.revision,
        projectUpdates,
      },
    );
  } catch (saveError) {
    if (saveError instanceof ProjectMutationConflictError) {
      return {
        success: false,
        previousStatus: currentStatus,
        error: 'Status changed concurrently',
      };
    }
    if (saveError instanceof ProjectNotFoundOrForbiddenError) {
      return { success: false, previousStatus: currentStatus, error: 'Project not found' };
    }
    throw saveError;
  }

  emitBrandEvent({
    userId: normalizedUserId,
    projectId: normalizedProjectId,
    service: 'editron',
    type: 'status_changed',
    payload: {
      from: currentStatus,
      to: newStatus,
      trigger: normalizedTrigger,
      error: normalizedError || null,
    },
  }).catch((err) => console.error('[ProjectStatus] Event emission failed:', err));

  return {
    success: true,
    previousStatus: currentStatus,
    receipt,
    disposition: 'COMMITTED',
  };
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
