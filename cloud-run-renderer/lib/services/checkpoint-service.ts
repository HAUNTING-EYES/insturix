/**
 * Checkpoint Service
 * 
 * Service layer for checkpoint operations
 */

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { assetResolver } from './asset-resolver';
import type { Overlay } from '@/components/editor/version-7.0.0/types';
import { nanoid } from 'nanoid';

export type CheckpointType = 'initial' | 'before-llm' | 'after-llm' | 'user-edit';

export interface Checkpoint {
  _id?: any;
  checkpointId: string;
  sessionId: string;
  projectId: string;
  userId: string;
  overlays: Overlay[];
  timestamp: Date;
  description: string;
  type: CheckpointType;
  createdAt: Date;
}

export interface CheckpointInput {
  sessionId: string;
  projectId: string;
  userId: string;
  overlays: Overlay[];
  description: string;
  type: CheckpointType;
}

/**
 * Generate a simple hash of overlays array for comparison
 */
const hashOverlays = (overlays: Overlay[]): string => {
  const data = overlays.map((o) => ({
    id: o.id,
    type: o.type,
    from: o.from,
    duration: o.durationInFrames,
    content: (o as any).content || (o as any).assetId,
  }));
  return JSON.stringify(data);
};

export class CheckpointService {
  /**
   * Create checkpoint (only if overlays changed)
   */
  async createCheckpoint(input: CheckpointInput): Promise<Checkpoint | null> {
    const db = await getDatabase();

    // Check if we need to create a checkpoint (compare with last checkpoint)
    const lastCheckpoint = await db
      .collection(COLLECTIONS.CHECKPOINTS)
      .find({ sessionId: input.sessionId })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray() as unknown as Checkpoint[];

    if (lastCheckpoint.length > 0) {
      const prevHash = hashOverlays(lastCheckpoint[0].overlays);
      const currentHash = hashOverlays(input.overlays);

      if (prevHash === currentHash) {
        console.log(`[CHECKPOINT] Skipped "${input.description}" - no changes detected`);
        return null;
      }
    }

    // Strip URLs before saving
    const cleanOverlays = assetResolver.stripUrlsForLLM(input.overlays);

    const checkpoint: Checkpoint = {
      checkpointId: `ckpt_${nanoid(12)}`,
      sessionId: input.sessionId,
      projectId: input.projectId,
      userId: input.userId,
      overlays: cleanOverlays,
      timestamp: new Date(),
      description: input.description,
      type: input.type,
      createdAt: new Date(),
    };

    await db.collection(COLLECTIONS.CHECKPOINTS).insertOne(checkpoint);

    console.log(`[CHECKPOINT] ✅ Created "${input.description}" (${input.type})`);

    return checkpoint;
  }

  /**
   * Get all checkpoints for a session
   */
  async getCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    const db = await getDatabase();
    const checkpoints = await db
      .collection(COLLECTIONS.CHECKPOINTS)
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .toArray() as unknown as Checkpoint[];

    return checkpoints;
  }

  /**
   * Get checkpoint by ID
   */
  async getCheckpoint(checkpointId: string, userId: string): Promise<Checkpoint | null> {
    const db = await getDatabase();
    const checkpoint = await db
      .collection(COLLECTIONS.CHECKPOINTS)
      .findOne({ checkpointId, userId }) as unknown as Checkpoint | null;

    return checkpoint;
  }

  /**
   * Restore checkpoint (returns overlays with URLs resolved)
   */
  async restoreCheckpoint(checkpointId: string, userId: string): Promise<Overlay[] | null> {
    const checkpoint = await this.getCheckpoint(checkpointId, userId);
    
    if (!checkpoint) {
      return null;
    }

    // Resolve asset IDs to URLs
    const overlaysWithUrls = await assetResolver.resolveProjectAssets(checkpoint.overlays);

    return overlaysWithUrls;
  }

  /**
   * Clear checkpoints for a session
   */
  async clearCheckpoints(sessionId: string): Promise<void> {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.CHECKPOINTS).deleteMany({ sessionId });
  }

  /**
   * Prune old checkpoints (keep last N per session)
   */
  async pruneCheckpoints(sessionId: string, keepLast = 50): Promise<void> {
    const db = await getDatabase();
    
    const checkpoints = await db
      .collection(COLLECTIONS.CHECKPOINTS)
      .find({ sessionId })
      .sort({ timestamp: -1 })
      .skip(keepLast)
      .toArray();

    if (checkpoints.length > 0) {
      const ids = checkpoints.map((c: any) => c._id);
      await db.collection(COLLECTIONS.CHECKPOINTS).deleteMany({
        _id: { $in: ids },
      });

      console.log(`[CHECKPOINT] Pruned ${checkpoints.length} old checkpoints for session ${sessionId}`);
    }
  }
}

// Singleton instance
export const checkpointService = new CheckpointService();
