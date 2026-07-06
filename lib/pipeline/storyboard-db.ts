/**
 * Storyboard Database Operations
 *
 * Uses Editron's MongoDB connection for storyboard persistence.
 */

import { getDatabase } from '@/lib/editron/db/mongodb';
import type { Storyboard, StoryboardScene } from './schemas/storyboard';

const COLLECTION = 'storyboards';

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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
 * Phase A3.2: Update a single sub-shot within a scene's descriptor.
 *
 * Used by per-sub-shot image generation so each independentGeneration sub-shot gets
 * its own imageUrl / imageAssetId set on the storyboard doc BEFORE video gen runs.
 * Without this the video worker falls back to the parent scene image for all sub-shots,
 * producing 5 near-identical Seedance clips (the "3 videos stitched to 11 shots" bug).
 */
export async function updateSubShot(
  storyboardId: string,
  sceneIndex: number,
  subShotIndex: number,
  update: Partial<import('./schemas/storyboard').SubShot>,
): Promise<void> {
  const db = await getDatabase();

  // Build $set ops with the nested path. We use arrayFilters for the scene match;
  // the sub-shot index is a literal array position inside descriptor.subShots.
  const setOps: Record<string, any> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(update)) {
    setOps[`scenes.$[elem].descriptor.subShots.${subShotIndex}.${key}`] = value;
  }

  await db.collection(COLLECTION).updateOne(
    { storyboardId },
    { $set: setOps },
    { arrayFilters: [{ 'elem.sceneIndex': sceneIndex }] },
  );
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
    contentType?: string;
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
 * Find a storyboard linked to a specific Editron project.
 * Storyboards store projectId when exported to Editron.
 */
export async function getStoryboardByProjectId(
  projectId: string,
  userId: string,
): Promise<Storyboard | null> {
  const db = await getDatabase();
  const doc = await db.collection(COLLECTION).findOne({
    projectId,
    userId,
  });
  return doc as unknown as Storyboard | null;
}

/**
 * Resolve storyboard context for an Editron project.
 * New projects store sourceStoryboardId directly; older/reused projects may only
 * have the reverse storyboards.projectId link or sourceSessionId lineage.
 */
export async function getStoryboardForProjectContext(
  project: { projectId?: string; sourceStoryboardId?: string; sourceSessionId?: string },
  userId: string,
): Promise<Storyboard | null> {
  const db = await getDatabase();
  const sourceStoryboardId = cleanString(project.sourceStoryboardId);
  if (sourceStoryboardId) {
    const bySourceId = await db.collection(COLLECTION).findOne({
      storyboardId: sourceStoryboardId,
      userId,
    });
    if (bySourceId) return bySourceId as unknown as Storyboard;
  }

  const projectId = cleanString(project.projectId);
  if (projectId) {
    const byProjectId = await db.collection(COLLECTION).findOne({
      projectId,
      userId,
    });
    if (byProjectId) return byProjectId as unknown as Storyboard;
  }

  const sourceSessionId = cleanString(project.sourceSessionId);
  if (!sourceSessionId) return null;

  const bySourceSessionId = await db.collection(COLLECTION).findOne({
    userId,
    $or: [
      { sourceSessionId },
      { projectId: sourceSessionId },
    ],
  });
  return bySourceSessionId as unknown as Storyboard | null;
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
