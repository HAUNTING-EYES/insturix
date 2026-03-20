/**
 * Storyboard Database Operations
 *
 * Uses Editron's MongoDB connection for storyboard persistence.
 */

import { getDatabase } from '@/lib/editron/db/mongodb';
import type { Storyboard, StoryboardScene } from './schemas/storyboard';

const COLLECTION = 'storyboards';

/**
 * Save or upsert a storyboard document.
 */
export async function saveStoryboard(storyboard: Storyboard): Promise<void> {
  const db = await getDatabase();
  await db.collection(COLLECTION).updateOne(
    { storyboardId: storyboard.storyboardId },
    { $set: storyboard },
    { upsert: true },
  );
}

/**
 * Get a storyboard by ID. Checks user ownership.
 */
export async function getStoryboard(
  storyboardId: string,
  userId: string,
): Promise<Storyboard | null> {
  const db = await getDatabase();
  const doc = await db.collection(COLLECTION).findOne({
    storyboardId,
    userId,
  });
  return doc as unknown as Storyboard | null;
}

/**
 * Update a single scene within a storyboard.
 */
export async function updateStoryboardScene(
  storyboardId: string,
  sceneIndex: number,
  update: Partial<StoryboardScene>,
): Promise<void> {
  const db = await getDatabase();

  const setOps: Record<string, any> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(update)) {
    setOps[`scenes.$[elem].${key}`] = value;
  }

  await db.collection(COLLECTION).updateOne(
    { storyboardId },
    { $set: setOps },
    { arrayFilters: [{ 'elem.sceneIndex': sceneIndex }] },
  );
}

/**
 * List storyboards for a user, newest first.
 */
export async function listStoryboards(
  userId: string,
  limit = 20,
): Promise<Storyboard[]> {
  const db = await getDatabase();
  const docs = await db
    .collection(COLLECTION)
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs as unknown as Storyboard[];
}

/**
 * Update only a scene's status (lightweight operation for approve/reject).
 */
export async function updateSceneStatus(
  storyboardId: string,
  sceneIndex: number,
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected',
): Promise<void> {
  const db = await getDatabase();
  await db.collection(COLLECTION).updateOne(
    { storyboardId },
    {
      $set: {
        'scenes.$[elem].status': status,
        updatedAt: new Date(),
      },
    },
    { arrayFilters: [{ 'elem.sceneIndex': sceneIndex }] },
  );
}

/**
 * Update storyboard-level voiceover config.
 */
export async function updateStoryboardVoiceover(
  storyboardId: string,
  voiceoverConfig: {
    voice?: string;
    language?: string;
    status?: string;
  },
): Promise<void> {
  const db = await getDatabase();
  const setOps: Record<string, any> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(voiceoverConfig)) {
    setOps[`voiceoverConfig.${key}`] = value;
  }
  await db.collection(COLLECTION).updateOne(
    { storyboardId },
    { $set: setOps },
  );
}

/**
 * Delete a storyboard.
 */
export async function deleteStoryboard(
  storyboardId: string,
  userId: string,
): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.collection(COLLECTION).deleteOne({
    storyboardId,
    userId,
  });
  return result.deletedCount > 0;
}
