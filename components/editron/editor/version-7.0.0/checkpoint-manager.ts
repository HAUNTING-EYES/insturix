import { Overlay } from "./types";
import { getUserId } from "./utils/user-id";

export type CheckpointType = "initial" | "before-llm" | "after-llm" | "user-edit";

export interface Checkpoint {
  id: string;
  checkpointId: string;
  sessionId: string;
  overlays: Overlay[];
  timestamp: number;
  description: string;
  type: CheckpointType;
}

export interface RestoredCheckpoint {
  checkpointId: string;
  projectId: string;
  project: Record<string, unknown> & { overlays: Overlay[] };
  restoredFields: string[];
  verification: {
    expectedStateHash: string;
    actualStateHash?: string;
  };
}

/**
 * Create a checkpoint via API
 * Returns the checkpoint if created, or null if skipped (no changes)
 * 
 * @param sessionId - AI session ID
 * @param projectId - Project ID (if not provided, uses sessionId as fallback)
 * @param overlays - Current overlays state
 * @param description - Checkpoint description
 * @param type - Checkpoint type
 */
export const createCheckpoint = async (
  sessionId: string,
  projectIdOrOverlays: string | Overlay[],
  overlaysOrDescription: Overlay[] | string,
  descriptionOrType: string | CheckpointType,
  typeOrUndefined?: CheckpointType
): Promise<Checkpoint | null> => {
  // Handle both old and new signatures for backward compatibility
  let projectId: string;
  let overlays: Overlay[];
  let description: string;
  let type: CheckpointType;

  if (Array.isArray(projectIdOrOverlays)) {
    // Old signature: createCheckpoint(sessionId, overlays, description, type)
    projectId = sessionId; // Use sessionId as projectId fallback
    overlays = projectIdOrOverlays;
    description = overlaysOrDescription as string;
    type = descriptionOrType as CheckpointType;
  } else {
    // New signature: createCheckpoint(sessionId, projectId, overlays, description, type)
    projectId = projectIdOrOverlays;
    overlays = overlaysOrDescription as Overlay[];
    description = descriptionOrType as string;
    type = typeOrUndefined!;
  }

  // Validate inputs
  if (!sessionId || !projectId || !overlays || !Array.isArray(overlays)) {
    console.warn('createCheckpoint: Invalid inputs', { sessionId, projectId, overlays });
    return null;
  }

  try {
    const userId = getUserId();
    
    // Check if running server-side
    if (typeof window === 'undefined') {
      // Server-side: Use checkpoint service directly
      const { checkpointService } = await import('@/lib/editron/services/checkpoint-service');
      
      const checkpoint = await checkpointService.createCheckpoint({
        sessionId,
        projectId,
        userId,
        overlays,
        description,
        type,
      });

      if (!checkpoint) {
        return null;
      }
      
      // Convert to frontend format
      return {
        id: checkpoint.checkpointId,
        checkpointId: checkpoint.checkpointId,
        sessionId: checkpoint.sessionId,
        overlays: checkpoint.overlays,
        timestamp: new Date(checkpoint.timestamp).getTime(),
        description: checkpoint.description,
        type: checkpoint.type,
      };
    }
    
    // Client-side: Use fetch API
    const response = await fetch('/api/services/editron/checkpoints/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        projectId,
        userId,
        overlays,
        description,
        type,
      }),
    });

    if (!response.ok) {
      console.error('Failed to create checkpoint:', await response.text());
      return null;
    }

    const data = await response.json();
    
    if (!data.created) {
      return null;
    }
    
    // Convert to frontend format
    const checkpoint: Checkpoint = {
      id: data.checkpoint.checkpointId,
      checkpointId: data.checkpoint.checkpointId,
      sessionId: data.checkpoint.sessionId,
      overlays: data.checkpoint.overlays,
      timestamp: new Date(data.checkpoint.timestamp).getTime(),
      description: data.checkpoint.description,
      type: data.checkpoint.type,
    };

    return checkpoint;
  } catch (error) {
    console.error('Error creating checkpoint:', error);
    return null;
  }
};

/**
 * Get all checkpoints for a session via API
 */
export const getCheckpoints = async (sessionId: string): Promise<Checkpoint[]> => {
  try {
    // Check if running server-side
    if (typeof window === 'undefined') {
      // Server-side: Use checkpoint service directly
      const { checkpointService } = await import('@/lib/editron/services/checkpoint-service');
      
      const checkpoints = await checkpointService.getCheckpoints(sessionId);
      
      // Convert to frontend format
      return checkpoints.map((cp: any) => ({
        id: cp.checkpointId,
        checkpointId: cp.checkpointId,
        sessionId: cp.sessionId,
        overlays: cp.overlays,
        timestamp: new Date(cp.timestamp).getTime(),
        description: cp.description,
        type: cp.type,
      }));
    }
    
    // Client-side: Use fetch API
    const response = await fetch(`/api/services/editron/checkpoints/list?sessionId=${sessionId}`);
    
    if (!response.ok) {
      console.error('Failed to get checkpoints:', await response.text());
      return [];
    }

    const data = await response.json();
    
    // Convert to frontend format
    return data.checkpoints.map((cp: any) => ({
      id: cp.checkpointId,
      checkpointId: cp.checkpointId,
      sessionId: cp.sessionId,
      overlays: cp.overlays,
      timestamp: new Date(cp.timestamp).getTime(),
      description: cp.description,
      type: cp.type,
    }));
  } catch (error) {
    console.error('Error getting checkpoints:', error);
    return [];
  }
};

/**
 * Restore a verified checkpoint and reload the complete canonical project.
 */
export const restoreCheckpoint = async (
  projectId: string,
  checkpointId: string,
): Promise<RestoredCheckpoint | null> => {
  try {
    // Check if running server-side
    if (typeof window === 'undefined') {
      // Server-side: use the same verified full-state owner as automatic rollback.
      const { checkpointService } = await import('@/lib/editron/services/checkpoint-service');
      const { projectService } = await import('@/lib/editron/services/project-service');
      const userId = getUserId();

      const checkpoint = await checkpointService.getCheckpoint(checkpointId, userId);
      if (!checkpoint || checkpoint.projectId !== projectId) return null;
      const verification = await checkpointService.restoreProjectCheckpoint(checkpointId, userId);
      if (!verification.restored) return null;
      const project = await projectService.loadProject(userId, projectId);
      if (!project) return null;
      return {
        checkpointId,
        projectId,
        project: project as unknown as RestoredCheckpoint['project'],
        restoredFields: checkpoint.projectState?.presentFields ?? [],
        verification: {
          expectedStateHash: verification.expectedStateHash,
          actualStateHash: verification.actualStateHash,
        },
      };
    }

    // Client-side: restore first, then reload the canonical project separately.
    const response = await fetch('/api/services/editron/checkpoints/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ checkpointId, projectId }),
    });

    if (!response.ok) {
      console.error('Failed to restore checkpoint:', await response.text());
      return null;
    }

    const receipt = await response.json() as Omit<RestoredCheckpoint, 'project'> & {
      success: boolean;
      reloadProject: boolean;
    };
    if (!receipt.success || !receipt.reloadProject || receipt.projectId !== projectId) return null;

    const projectResponse = await fetch(
      `/api/services/editron/projects/${encodeURIComponent(projectId)}`,
      { cache: 'no-store' },
    );
    if (!projectResponse.ok) {
      console.error('Checkpoint restored but canonical project reload failed:', await projectResponse.text());
      return null;
    }
    const projectPayload = await projectResponse.json() as {
      success: boolean;
      project?: RestoredCheckpoint['project'];
    };
    if (!projectPayload.success || !projectPayload.project) return null;

    return {
      checkpointId: receipt.checkpointId,
      projectId: receipt.projectId,
      project: projectPayload.project,
      restoredFields: receipt.restoredFields,
      verification: receipt.verification,
    };
  } catch (error) {
    console.error('Error restoring checkpoint:', error);
    return null;
  }
};

/**
 * Get the most recent checkpoint for a session
 */
export const getLatestCheckpoint = async (sessionId: string): Promise<Checkpoint | null> => {
  const checkpoints = await getCheckpoints(sessionId);
  return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
};

/**
 * Get count of checkpoints for a session
 */
export const getCheckpointCount = async (sessionId: string): Promise<number> => {
  const checkpoints = await getCheckpoints(sessionId);
  return checkpoints.length;
};
