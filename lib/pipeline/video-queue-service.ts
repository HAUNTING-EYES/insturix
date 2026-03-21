/**
 * Video Generation Queue Service
 *
 * Manages async, parallel video generation using Upstash Redis queue + MongoDB job state.
 * Follows the same pattern as render-queue-service.ts but for fal.ai video generation.
 *
 * Architecture:
 * 1. Frontend calls POST /generate-videos → enqueues individual scene jobs
 * 2. Each scene is an independent Redis queue entry
 * 3. Cron (/api/cron/process-video-queue) pops jobs and processes them in parallel
 * 4. Frontend polls GET /generate-videos/status?batchId=xxx for progress
 * 5. Each scene completes independently — partial results are available immediately
 *
 * This replaces the old blocking sequential approach that timed out on 4+ scenes.
 */

import { Redis } from '@upstash/redis';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';

// ─── Redis Queue ─────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const VIDEO_QUEUE_KEY = 'pipeline:video:queue';
// Max scenes processing simultaneously across all users
const MAX_CONCURRENT_VIDEO_JOBS = 4;

// ─── Types ───────────────────────────────────────────────────────

export interface VideoJobScene {
  sceneIndex: number;
  imageUrl: string;
  motionPrompt: string;
  durationSeconds: number;
  /** Next scene's image URL for cross-scene chaining */
  nextSceneImageUrl?: string;
}

export interface VideoQueueEntry {
  batchId: string;
  sceneIndex: number;
  userId: string;
  storyboardId: string;
  imageUrl: string;
  motionPrompt: string;
  durationSeconds: number;
  nextSceneImageUrl?: string;
  aspectRatio?: string;
  videoModel?: string;
  queuedAt: number;
}

export type VideoJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface VideoJob {
  _id: string; // batchId_sceneIndex
  batchId: string;
  userId: string;
  storyboardId: string;
  sceneIndex: number;
  status: VideoJobStatus;
  videoModel: string;
  videoUrl?: string;
  videoAssetId?: string;
  videoGcsPath?: string;
  videoDurationMs?: number;
  error?: string;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  expiresAt: Date; // TTL — auto-delete after 24h
}

export interface VideoBatch {
  _id: string; // batchId
  userId: string;
  storyboardId: string;
  totalScenes: number;
  completed: number;
  failed: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

// MongoDB collection for video generation jobs
const VIDEO_JOBS_COLLECTION = 'pipeline_video_jobs';
const VIDEO_BATCHES_COLLECTION = 'pipeline_video_batches';

// ─── Enqueue ─────────────────────────────────────────────────────

/**
 * Enqueue a batch of scenes for parallel video generation.
 * Returns a batchId that can be polled for progress.
 */
export async function enqueueVideoBatch(
  userId: string,
  storyboardId: string,
  scenes: VideoJobScene[],
  options: {
    aspectRatio?: string;
    videoModel?: string;
  } = {},
): Promise<{ batchId: string; totalScenes: number }> {
  const batchId = `vb_${nanoid(12)}`;
  const db = await getDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h TTL

  // Create batch record
  const batch: VideoBatch = {
    _id: batchId,
    userId,
    storyboardId,
    totalScenes: scenes.length,
    completed: 0,
    failed: 0,
    status: 'processing',
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
  await db.collection(VIDEO_BATCHES_COLLECTION).insertOne(batch);

  // Create individual job records + enqueue to Redis
  for (const scene of scenes) {
    const jobId = `${batchId}_s${scene.sceneIndex}`;

    const job: VideoJob = {
      _id: jobId,
      batchId,
      userId,
      storyboardId,
      sceneIndex: scene.sceneIndex,
      status: 'queued',
      videoModel: options.videoModel || 'auto',
      attempts: 0,
      createdAt: now,
      expiresAt,
    };
    await db.collection(VIDEO_JOBS_COLLECTION).insertOne(job);

    const queueEntry: VideoQueueEntry = {
      batchId,
      sceneIndex: scene.sceneIndex,
      userId,
      storyboardId,
      imageUrl: scene.imageUrl,
      motionPrompt: scene.motionPrompt,
      durationSeconds: scene.durationSeconds,
      nextSceneImageUrl: scene.nextSceneImageUrl,
      aspectRatio: options.aspectRatio,
      videoModel: options.videoModel,
      queuedAt: Date.now(),
    };
    await redis.rpush(VIDEO_QUEUE_KEY, JSON.stringify(queueEntry));
  }

  console.log(`[VideoQueue] Enqueued batch ${batchId}: ${scenes.length} scenes for storyboard ${storyboardId}`);
  return { batchId, totalScenes: scenes.length };
}

// ─── Process Queue ───────────────────────────────────────────────

/**
 * Pop and process the next job from the queue.
 * Called by the cron route. Returns whether a job was processed.
 */
export async function processNextVideoJob(): Promise<{
  processed: boolean;
  jobId?: string;
  error?: string;
}> {
  const db = await getDatabase();

  // Check concurrent limit
  const activeCount = await db.collection(VIDEO_JOBS_COLLECTION).countDocuments({
    status: 'processing',
  });

  if (activeCount >= MAX_CONCURRENT_VIDEO_JOBS) {
    return { processed: false };
  }

  // Pop next job from Redis queue
  const entryJson = await redis.lpop<string>(VIDEO_QUEUE_KEY);
  if (!entryJson) {
    return { processed: false };
  }

  let entry: VideoQueueEntry;
  try {
    entry = typeof entryJson === 'string' ? JSON.parse(entryJson) : entryJson;
  } catch {
    console.error('[VideoQueue] Failed to parse queue entry:', entryJson);
    return { processed: false, error: 'Invalid queue entry' };
  }

  const jobId = `${entry.batchId}_s${entry.sceneIndex}`;

  // Mark as processing
  await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
    { _id: jobId },
    { $set: { status: 'processing', startedAt: new Date(), attempts: 1 } },
  );

  try {
    // Import video generation service dynamically to avoid circular deps
    const { generateVideoClip, buildMotionPrompt, selectBestModel } = await import('./video-generation-service');
    const { refineVideoPrompt, isLLMParserAvailable } = await import('./llm-scene-parser');
    const { updateStoryboardScene } = await import('./storyboard-db');

    // Determine model
    let modelKey = entry.videoModel;
    if (!modelKey || modelKey === 'auto') {
      modelKey = 'kling-2.1'; // Safe default for async processing
    }

    // Generate video
    const result = await generateVideoClip(
      {
        imageUrl: entry.imageUrl,
        motionPrompt: entry.motionPrompt,
        durationSeconds: Math.min(entry.durationSeconds || 5, 10),
        aspectRatio: (entry.aspectRatio as any) || '16:9',
        falVideoModel: modelKey as any,
        nextSceneImageUrl: entry.nextSceneImageUrl,
      },
      entry.userId,
    );

    // Update job as completed
    await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          videoUrl: result.videoUrl,
          videoAssetId: result.assetId,
          videoGcsPath: result.gcsPath,
          videoDurationMs: result.durationMs,
          completedAt: new Date(),
        },
      },
    );

    // Update storyboard scene with video data
    await updateStoryboardScene(entry.storyboardId, entry.sceneIndex, {
      videoAssetId: result.assetId,
      videoUrl: result.videoUrl,
      videoGcsPath: result.gcsPath,
      videoProvider: result.provider,
      videoDurationMs: result.durationMs,
    });

    // Update batch counters
    await db.collection(VIDEO_BATCHES_COLLECTION).updateOne(
      { _id: entry.batchId },
      { $inc: { completed: 1 }, $set: { updatedAt: new Date() } },
    );
    await updateBatchStatus(entry.batchId);

    console.log(`[VideoQueue] Job ${jobId} completed: model=${modelKey}, asset=${result.assetId}`);
    return { processed: true, jobId };
  } catch (err: any) {
    console.error(`[VideoQueue] Job ${jobId} failed:`, err.message);

    // Mark as failed
    await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error: err.message, completedAt: new Date() } },
    );

    // Update batch counters
    await db.collection(VIDEO_BATCHES_COLLECTION).updateOne(
      { _id: entry.batchId },
      { $inc: { failed: 1 }, $set: { updatedAt: new Date() } },
    );
    await updateBatchStatus(entry.batchId);

    return { processed: true, jobId, error: err.message };
  }
}

/**
 * Update batch status based on job completion counts.
 */
async function updateBatchStatus(batchId: string): Promise<void> {
  const db = await getDatabase();
  const batch = await db.collection(VIDEO_BATCHES_COLLECTION).findOne({ _id: batchId }) as any;
  if (!batch) return;

  const total = batch.totalScenes;
  const done = batch.completed + batch.failed;

  let status: VideoBatch['status'] = 'processing';
  if (done >= total) {
    if (batch.failed === 0) status = 'completed';
    else if (batch.completed === 0) status = 'failed';
    else status = 'partial';
  }

  await db.collection(VIDEO_BATCHES_COLLECTION).updateOne(
    { _id: batchId },
    { $set: { status, updatedAt: new Date() } },
  );
}

// ─── Status Polling ──────────────────────────────────────────────

/**
 * Get batch status + per-scene job details for frontend polling.
 */
export async function getVideoBatchStatus(
  batchId: string,
  userId: string,
): Promise<{
  batch: VideoBatch | null;
  jobs: VideoJob[];
}> {
  const db = await getDatabase();
  const batch = await db.collection(VIDEO_BATCHES_COLLECTION).findOne({
    _id: batchId,
    userId,
  }) as any;

  if (!batch) return { batch: null, jobs: [] };

  const jobs = await db
    .collection(VIDEO_JOBS_COLLECTION)
    .find({ batchId, userId })
    .sort({ sceneIndex: 1 })
    .toArray() as any[];

  return { batch, jobs };
}

/**
 * Get the queue length (for monitoring).
 */
export async function getVideoQueueLength(): Promise<number> {
  return redis.llen(VIDEO_QUEUE_KEY);
}
