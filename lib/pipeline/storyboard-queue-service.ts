/**
 * Storyboard Image Generation Queue Service
 *
 * Async parallel storyboard image generation using Upstash Redis queue + MongoDB.
 * Same architecture as video-queue-service.ts.
 *
 * Flow:
 * 1. POST /storyboard/generate → builds prompts, enqueues scenes, returns batchId
 * 2. Cron /api/cron/process-storyboard-queue → processes 4 scenes in parallel
 * 3. Frontend polls GET /storyboard/generate/status?batchId=xxx
 * 4. Each scene completes independently — partial results available immediately
 *
 * Supports 60+ scenes for 5-minute fully AI videos.
 */

import { Redis } from '@upstash/redis';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';

// ─── Redis Queue ─────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const STORYBOARD_QUEUE_KEY = 'pipeline:storyboard:queue';
const MAX_CONCURRENT_STORYBOARD_JOBS = 4;

// MongoDB collections
const SB_JOBS_COLLECTION = 'pipeline_storyboard_jobs';
const SB_BATCHES_COLLECTION = 'pipeline_storyboard_batches';

// ─── Types ───────────────────────────────────────────────────────

export type SbJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface SbQueueEntry {
  batchId: string;
  sceneIndex: number;
  userId: string;
  storyboardId: string;
  /** Pre-built prompt for this scene */
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  modelId: string;
  /** Reference images for IP-adapter */
  referenceImages?: Array<{
    subjectId: string;
    imageUrl: string;
    weight?: number;
    name?: string;
    visualDescription?: string;
  }>;
  /** Style anchor image URL from scene 0 */
  styleAnchorUrl?: string;
  queuedAt: number;
}

export interface SbJob {
  _id: string; // batchId_sceneIndex
  batchId: string;
  userId: string;
  storyboardId: string;
  sceneIndex: number;
  status: SbJobStatus;
  modelUsed?: string;
  imageUrl?: string;
  imageAssetId?: string;
  imageGcsPath?: string;
  usedIpAdapter?: boolean;
  error?: string;
  attempts: number;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

export interface SbBatch {
  _id: string; // batchId
  userId: string;
  storyboardId: string;
  totalScenes: number;
  completed: number;
  failed: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  /** URL of scene 0's image, used as style anchor for subsequent scenes */
  styleAnchorUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

// ─── Enqueue ─────────────────────────────────────────────────────

export async function enqueueStoryboardBatch(
  userId: string,
  storyboardId: string,
  scenes: Array<{
    sceneIndex: number;
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    modelId: string;
    referenceImages?: SbQueueEntry['referenceImages'];
  }>,
): Promise<{ batchId: string; totalScenes: number }> {
  const batchId = `sb_batch_${nanoid(12)}`;
  const db = await getDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Create batch
  const batch: SbBatch = {
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
  await db.collection(SB_BATCHES_COLLECTION).insertOne(batch);

  // Create jobs + enqueue
  for (const scene of scenes) {
    const jobId = `${batchId}_s${scene.sceneIndex}`;

    const job: SbJob = {
      _id: jobId,
      batchId,
      userId,
      storyboardId,
      sceneIndex: scene.sceneIndex,
      status: 'queued',
      attempts: 0,
      createdAt: now,
      expiresAt,
    };
    await db.collection(SB_JOBS_COLLECTION).insertOne(job);

    const entry: SbQueueEntry = {
      batchId,
      sceneIndex: scene.sceneIndex,
      userId,
      storyboardId,
      prompt: scene.prompt,
      negativePrompt: scene.negativePrompt,
      width: scene.width,
      height: scene.height,
      modelId: scene.modelId,
      referenceImages: scene.referenceImages,
      queuedAt: Date.now(),
    };
    await redis.rpush(STORYBOARD_QUEUE_KEY, JSON.stringify(entry));
  }

  console.log(`[SbQueue] Enqueued batch ${batchId}: ${scenes.length} scenes`);

  // Trigger immediate processing — don't wait for the next cron tick
  triggerImmediateProcessing('storyboard').catch((err) =>
    console.warn('[SbQueue] Immediate trigger failed (cron will pick it up):', err.message),
  );

  return { batchId, totalScenes: scenes.length };
}

// ─── Process Queue ───────────────────────────────────────────────

export async function processNextStoryboardJob(): Promise<{
  processed: boolean;
  jobId?: string;
  error?: string;
}> {
  const db = await getDatabase();

  const activeCount = await db.collection(SB_JOBS_COLLECTION).countDocuments({
    status: 'processing',
  });

  if (activeCount >= MAX_CONCURRENT_STORYBOARD_JOBS) {
    return { processed: false };
  }

  const entryJson = await redis.lpop<string>(STORYBOARD_QUEUE_KEY);
  if (!entryJson) {
    return { processed: false };
  }

  let entry: SbQueueEntry;
  try {
    entry = typeof entryJson === 'string' ? JSON.parse(entryJson) : entryJson;
  } catch {
    console.error('[SbQueue] Failed to parse queue entry');
    return { processed: false, error: 'Invalid queue entry' };
  }

  const jobId = `${entry.batchId}_s${entry.sceneIndex}`;

  await db.collection(SB_JOBS_COLLECTION).updateOne(
    { _id: jobId },
    { $set: { status: 'processing', attempts: 1 } },
  );

  try {
    const { generateStoryboardImage } = await import('./storyboard-service');
    const { updateStoryboardScene } = await import('./storyboard-db');

    // Check if we have a style anchor from scene 0
    const batch = await db.collection(SB_BATCHES_COLLECTION).findOne({ _id: entry.batchId }) as any;
    let referenceImages = entry.referenceImages;

    // If no IP-adapter refs and style anchor exists, use it
    if ((!referenceImages || referenceImages.length === 0) && batch?.styleAnchorUrl && entry.sceneIndex > 0) {
      referenceImages = [{
        subjectId: '__style_anchor__',
        imageUrl: batch.styleAnchorUrl,
        weight: 0.3,
      }];
    }

    // Build a minimal scene descriptor for generateStoryboardImage
    const sceneDescriptor = {
      sceneIndex: entry.sceneIndex,
      title: `Scene ${entry.sceneIndex}`,
      narration: '',
      visualDescription: entry.prompt, // The prompt IS the visual description (already built)
      durationSeconds: 5,
      mood: 'neutral',
    };

    const result = await generateStoryboardImage(sceneDescriptor, entry.userId, {
      modelId: entry.modelId,
      sceneIndex: entry.sceneIndex,
      referenceImages,
    });

    // If this is scene 0, save as style anchor
    if (entry.sceneIndex === 0 && result.imageUrl) {
      await db.collection(SB_BATCHES_COLLECTION).updateOne(
        { _id: entry.batchId },
        { $set: { styleAnchorUrl: result.imageUrl } },
      );
    }

    // Update job
    await db.collection(SB_JOBS_COLLECTION).updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          imageUrl: result.imageUrl,
          imageAssetId: result.assetId,
          imageGcsPath: result.gcsPath,
          modelUsed: result.modelUsed,
          usedIpAdapter: result.usedIpAdapter,
          completedAt: new Date(),
        },
      },
    );

    // Update storyboard scene
    await updateStoryboardScene(entry.storyboardId, entry.sceneIndex, {
      imageAssetId: result.assetId,
      imageUrl: result.imageUrl,
      imageGcsPath: result.gcsPath,
      status: 'generated',
      generationHistory: [{
        assetId: result.assetId,
        imageUrl: result.imageUrl,
        timestamp: new Date(),
        modelUsed: result.modelUsed,
        usedIpAdapter: result.usedIpAdapter,
      }],
    });

    // Update batch counters
    await db.collection(SB_BATCHES_COLLECTION).updateOne(
      { _id: entry.batchId },
      { $inc: { completed: 1 }, $set: { updatedAt: new Date() } },
    );
    await updateSbBatchStatus(entry.batchId);

    console.log(`[SbQueue] Job ${jobId} completed: model=${result.modelUsed}, ipAdapter=${result.usedIpAdapter}`);
    return { processed: true, jobId };
  } catch (err: any) {
    console.error(`[SbQueue] Job ${jobId} failed:`, err.message);

    await db.collection(SB_JOBS_COLLECTION).updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error: err.message, completedAt: new Date() } },
    );
    await db.collection(SB_BATCHES_COLLECTION).updateOne(
      { _id: entry.batchId },
      { $inc: { failed: 1 }, $set: { updatedAt: new Date() } },
    );
    await updateSbBatchStatus(entry.batchId);

    return { processed: true, jobId, error: err.message };
  }
}

async function updateSbBatchStatus(batchId: string): Promise<void> {
  const db = await getDatabase();
  const batch = await db.collection(SB_BATCHES_COLLECTION).findOne({ _id: batchId }) as any;
  if (!batch) return;

  const done = batch.completed + batch.failed;
  let status: SbBatch['status'] = 'processing';
  if (done >= batch.totalScenes) {
    if (batch.failed === 0) status = 'completed';
    else if (batch.completed === 0) status = 'failed';
    else status = 'partial';
  }

  await db.collection(SB_BATCHES_COLLECTION).updateOne(
    { _id: batchId },
    { $set: { status, updatedAt: new Date() } },
  );
}

// ─── Status Polling ──────────────────────────────────────────────

export async function getStoryboardBatchStatus(
  batchId: string,
  userId: string,
): Promise<{ batch: SbBatch | null; jobs: SbJob[] }> {
  const db = await getDatabase();
  const batch = await db.collection(SB_BATCHES_COLLECTION).findOne({
    _id: batchId,
    userId,
  }) as any;

  if (!batch) return { batch: null, jobs: [] };

  const jobs = await db
    .collection(SB_JOBS_COLLECTION)
    .find({ batchId, userId })
    .sort({ sceneIndex: 1 })
    .toArray() as any[];

  return { batch, jobs };
}

export async function getStoryboardQueueLength(): Promise<number> {
  return redis.llen(STORYBOARD_QUEUE_KEY);
}

/**
 * Fire-and-forget trigger to the cron endpoint for immediate processing.
 */
async function triggerImmediateProcessing(type: 'video' | 'storyboard'): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const path = type === 'video' ? '/api/cron/process-video-queue' : '/api/cron/process-storyboard-queue';

  fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: process.env.CRON_SECRET
      ? { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
      : {},
  }).catch(() => {});
}
