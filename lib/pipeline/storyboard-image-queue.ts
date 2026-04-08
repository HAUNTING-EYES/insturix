/**
 * Storyboard Image Generation Queue (QStash-direct pattern)
 *
 * Bundle 4 (2026-04-09): Moves storyboard image generation from inline
 * `generateFullStoryboard` (which regularly hit Vercel 300s timeouts) to
 * a per-scene QStash worker architecture. Each scene gets its own 300s
 * Vercel function budget instead of sharing one.
 *
 * Pattern matches /pipeline/storyboard/[id]/generate-videos/route.ts:
 *   - MongoDB batch + job docs for status tracking
 *   - Deterministic jobId: `${batchId}_s${sceneIndex}`
 *   - QStash publishJSON with 2 retries per message
 *   - Worker marks processing → completed/failed + increments batch counters
 *   - Frontend polls GET /storyboard/[id]/generate-status?batchId=xxx
 *
 * Why NOT the Redis queue + cron pattern (video-queue-service.ts):
 *   - Simpler — no cron tick delay, no Redis dependency
 *   - Same architecture as generate-videos/route.ts (which is the newer pattern)
 *   - QStash handles delivery retry + backoff natively
 */

import { nanoid } from 'nanoid';
import { getDatabase } from '@/lib/editron/db/mongodb';
import type { SceneDescriptor } from './schemas/storyboard';

export const STORYBOARD_IMAGE_BATCHES_COLLECTION = 'pipeline_storyboard_image_batches';
export const STORYBOARD_IMAGE_JOBS_COLLECTION = 'pipeline_storyboard_image_jobs';

export type StoryboardImageJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface StoryboardImageJob {
  _id: string; // `${batchId}_s${sceneIndex}`
  batchId: string;
  storyboardId: string;
  userId: string;
  sceneIndex: number;
  status: StoryboardImageJobStatus;
  imageUrl?: string;
  imageAssetId?: string;
  error?: string;
  /** Number of sub-shots in this scene that ALSO needed their own image.
   *  Populated by the worker so the status endpoint can show richer progress. */
  subShotsGenerated?: number;
  subShotsFailed?: number;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  expiresAt: Date;
}

export interface StoryboardImageBatch {
  _id: string; // batchId
  userId: string;
  storyboardId: string;
  totalScenes: number;
  completed: number;
  failed: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  /** Set to true after the post-batch consistency check ran (or was skipped). */
  consistencyCheckDone?: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Create a batch + per-scene job records. Does NOT dispatch to QStash —
 * the caller (route) handles dispatch because it needs access to the
 * runtime base URL and QSTASH_TOKEN.
 *
 * Returns the batchId and the list of job IDs in order (for dispatch).
 */
export async function createStoryboardImageBatch(
  userId: string,
  storyboardId: string,
  sceneIndices: number[],
): Promise<{ batchId: string; jobIds: string[] }> {
  const batchId = `sbib_${nanoid(12)}`;
  const db = await getDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h TTL

  const batch: StoryboardImageBatch = {
    _id: batchId,
    userId,
    storyboardId,
    totalScenes: sceneIndices.length,
    completed: 0,
    failed: 0,
    status: 'processing',
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
  await db.collection(STORYBOARD_IMAGE_BATCHES_COLLECTION).insertOne(batch as any);

  const jobIds: string[] = [];
  const jobDocs: StoryboardImageJob[] = sceneIndices.map((sceneIndex) => {
    const jobId = `${batchId}_s${sceneIndex}`;
    jobIds.push(jobId);
    return {
      _id: jobId,
      batchId,
      storyboardId,
      userId,
      sceneIndex,
      status: 'queued' as const,
      attempts: 0,
      createdAt: now,
      expiresAt,
    };
  });

  if (jobDocs.length > 0) {
    await db.collection(STORYBOARD_IMAGE_JOBS_COLLECTION).insertMany(jobDocs as any[]);
  }

  console.log(`[StoryboardImageQueue] Created batch ${batchId}: ${sceneIndices.length} scenes for ${storyboardId}`);

  return { batchId, jobIds };
}

/**
 * Re-evaluate batch status based on job counters. Called by the worker
 * after each job completes or fails.
 */
export async function updateStoryboardImageBatchStatus(batchId: string): Promise<StoryboardImageBatch | null> {
  const db = await getDatabase();
  const batch = (await db
    .collection(STORYBOARD_IMAGE_BATCHES_COLLECTION)
    .findOne({ _id: batchId } as any)) as any;
  if (!batch) return null;

  const done = (batch.completed || 0) + (batch.failed || 0);
  let status: StoryboardImageBatch['status'] = 'processing';
  if (done >= batch.totalScenes) {
    if (batch.failed === 0) status = 'completed';
    else if (batch.completed === 0) status = 'failed';
    else status = 'partial';
  }

  await db.collection(STORYBOARD_IMAGE_BATCHES_COLLECTION).updateOne(
    { _id: batchId } as any,
    { $set: { status, updatedAt: new Date() } },
  );

  return { ...batch, status } as StoryboardImageBatch;
}

/**
 * Increment a batch's completed counter after a worker succeeds.
 */
export async function incrementStoryboardImageBatchCompleted(batchId: string): Promise<void> {
  const db = await getDatabase();
  await db.collection(STORYBOARD_IMAGE_BATCHES_COLLECTION).updateOne(
    { _id: batchId } as any,
    { $inc: { completed: 1 }, $set: { updatedAt: new Date() } },
  );
}

/**
 * Increment a batch's failed counter after a worker fails (after retries).
 */
export async function incrementStoryboardImageBatchFailed(batchId: string): Promise<void> {
  const db = await getDatabase();
  await db.collection(STORYBOARD_IMAGE_BATCHES_COLLECTION).updateOne(
    { _id: batchId } as any,
    { $inc: { failed: 1 }, $set: { updatedAt: new Date() } },
  );
}

/**
 * Mark batch's consistencyCheckDone flag. Idempotent.
 */
export async function markStoryboardImageBatchConsistencyDone(batchId: string): Promise<void> {
  const db = await getDatabase();
  await db.collection(STORYBOARD_IMAGE_BATCHES_COLLECTION).updateOne(
    { _id: batchId } as any,
    { $set: { consistencyCheckDone: true, updatedAt: new Date() } },
  );
}

/**
 * Get batch + all jobs for polling.
 */
export async function getStoryboardImageBatchStatus(
  batchId: string,
  userId: string,
): Promise<{ batch: StoryboardImageBatch | null; jobs: StoryboardImageJob[] }> {
  const db = await getDatabase();
  const batch = (await db
    .collection(STORYBOARD_IMAGE_BATCHES_COLLECTION)
    .findOne({ _id: batchId, userId } as any)) as any;
  if (!batch) return { batch: null, jobs: [] };

  const jobs = (await db
    .collection(STORYBOARD_IMAGE_JOBS_COLLECTION)
    .find({ batchId, userId } as any)
    .sort({ sceneIndex: 1 })
    .toArray()) as any[];

  return { batch, jobs };
}

/**
 * Payload passed from the generate route to the worker via QStash.
 * Worker has everything it needs to generate the scene independently.
 */
export interface StoryboardImageWorkerPayload {
  jobId: string;
  batchId: string;
  userId: string;
  storyboardId: string;
  sceneIndex: number;
  /** Full scene descriptor — the worker uses visualDescription + subShots */
  descriptor: SceneDescriptor;
  /** Reference images for IP-adapter (from the caller's referenceImageMap[sceneIndex]) */
  referenceImages?: Array<{
    subjectId: string;
    imageUrl: string;
    weight?: number;
    name?: string;
    visualDescription?: string;
  }>;
  /** Optional style anchor URL from scene 0 (for cross-scene consistency).
   *  Dropped in Bundle 4 because it required serialization; kept as optional
   *  for future re-enablement. */
  styleAnchorImageUrl?: string;
  /** Style guide + model choice + aspect ratio (all passed through to generateStoryboardImage) */
  styleGuide?: any;
  modelId?: string;
  aspectRatio?: string;
  totalScenes: number;
  /** When the batch dispatcher wants consistency check to run after the last scene. */
  runConsistencyCheck?: boolean;
  consistencyThreshold?: number;
}
