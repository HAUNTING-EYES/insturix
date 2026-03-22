/**
 * POST /api/internal/workers/pipeline/video
 *
 * QStash worker that generates a SINGLE video clip for one scene.
 * Called by QStash with job data — each scene gets its own worker invocation
 * with its own 300s Vercel timeout.
 *
 * This is the same proven pattern used by Clickatron workers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import {
  generateVideoClip,
} from '@/lib/pipeline/video-generation-service';
import { updateStoryboardScene } from '@/lib/pipeline/storyboard-db';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Job tracking collection
const VIDEO_JOBS_COLLECTION = 'pipeline_video_jobs';

interface VideoWorkerPayload {
  jobId: string;
  batchId: string;
  userId: string;
  storyboardId: string;
  sceneIndex: number;
  imageUrl: string;
  motionPrompt: string;
  durationSeconds: number;
  aspectRatio?: string;
  videoModel: string;
  nextSceneImageUrl?: string;
}

async function handler(request: NextRequest) {
  console.log(`[VideoWorker] Received request from ${request.headers.get('user-agent')?.substring(0, 50) || 'unknown'}`);
  try {
    const payload: VideoWorkerPayload = await request.json();
    const {
      jobId,
      batchId,
      userId,
      storyboardId,
      sceneIndex,
      imageUrl,
      motionPrompt,
      durationSeconds,
      aspectRatio,
      videoModel,
      nextSceneImageUrl,
    } = payload;

    console.log(`[VideoWorker] Processing job ${jobId}: scene ${sceneIndex}, model=${videoModel}`);

    const db = await getDatabase();

    // Mark as processing
    await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
      { _id: jobId },
      { $set: { status: 'processing', startedAt: new Date() } },
    );

    // Generate the video clip
    const result = await generateVideoClip(
      {
        imageUrl,
        motionPrompt,
        durationSeconds,
        aspectRatio: aspectRatio as any,
        falVideoModel: videoModel as any,
        nextSceneImageUrl,
      },
      userId,
    );

    // Update storyboard scene — include videoDurationMs so finalize
    // uses the actual clip length (not the script's word-count estimate)
    await updateStoryboardScene(storyboardId, sceneIndex, {
      videoUrl: result.videoUrl,
      videoAssetId: result.assetId,
      videoGcsPath: result.gcsPath,
      videoProvider: result.provider || 'fal-ai',
      videoDurationMs: result.durationMs || (durationSeconds * 1000),
    });

    // Mark job complete
    await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          videoUrl: result.videoUrl,
          videoAssetId: result.assetId,
          videoGcsPath: result.gcsPath,
          modelUsed: result.modelUsed || videoModel,
          completedAt: new Date(),
        },
      },
    );

    // Update batch counters
    await db.collection('pipeline_video_batches').updateOne(
      { _id: batchId },
      { $inc: { completed: 1 }, $set: { updatedAt: new Date() } },
    );
    await updateBatchStatus(batchId);

    console.log(`[VideoWorker] Job ${jobId} completed: ${result.assetId}`);
    return NextResponse.json({ success: true, jobId, videoUrl: result.videoUrl });
  } catch (error: any) {
    console.error('[VideoWorker] Error:', error.message);

    // Try to mark job as failed
    try {
      const payload: VideoWorkerPayload = await request.clone().json().catch(() => ({} as any));
      if (payload.jobId) {
        const db = await getDatabase();
        await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
          { _id: payload.jobId },
          { $set: { status: 'failed', error: error.message, completedAt: new Date() } },
        );
        if (payload.batchId) {
          await db.collection('pipeline_video_batches').updateOne(
            { _id: payload.batchId },
            { $inc: { failed: 1 }, $set: { updatedAt: new Date() } },
          );
          await updateBatchStatus(payload.batchId);
        }
      }
    } catch {} // Best-effort

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function updateBatchStatus(batchId: string): Promise<void> {
  const db = await getDatabase();
  const batch = await db.collection('pipeline_video_batches').findOne({ _id: batchId }) as any;
  if (!batch) return;

  const done = (batch.completed || 0) + (batch.failed || 0);
  let status = 'processing';
  if (done >= batch.totalScenes) {
    if (batch.failed === 0) status = 'completed';
    else if (batch.completed === 0) status = 'failed';
    else status = 'partial';
  }

  await db.collection('pipeline_video_batches').updateOne(
    { _id: batchId },
    { $set: { status, updatedAt: new Date() } },
  );
}

// Verify QStash signature in production. Skip in dev or if signing keys aren't set.
const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = !!process.env.QSTASH_CURRENT_SIGNING_KEY && !!process.env.QSTASH_NEXT_SIGNING_KEY;
export const POST = (isDev || !hasSigningKeys) ? handler : verifySignatureAppRouter(handler);
