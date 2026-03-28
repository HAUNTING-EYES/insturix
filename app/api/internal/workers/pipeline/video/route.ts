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

    // Also update the Editron project overlay if this storyboard is linked to a project.
    // Without this, video regen updates the storyboard but the editor still shows the old clip.
    try {
      const { getStoryboard } = await import('@/lib/pipeline/storyboard-db');
      const sb = await getStoryboard(storyboardId, userId);
      const linkedProjectId = sb?.projectId;
      if (linkedProjectId) {
        // Find the video overlay for this scene (by matching assetId or from-frame position)
        const scene = sb.scenes?.find((s: any) => s.sceneIndex === sceneIndex);
        const oldAssetId = scene?.videoAssetId;

        // Register the new asset first
        await db.collection('media_assets').updateOne(
          { assetId: result.assetId },
          {
            $setOnInsert: {
              assetId: result.assetId, userId, type: 'video',
              filename: `${result.assetId}.mp4`, source: 'video-regen',
              gcsPath: result.gcsPath, cachedUrl: result.videoUrl,
              urlExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              uploadedAt: new Date(),
            },
          },
          { upsert: true },
        );

        // Update the overlay in the project that has the old assetId
        if (oldAssetId) {
          await db.collection('projects').updateOne(
            { projectId: linkedProjectId, 'overlays.assetId': oldAssetId },
            {
              $set: {
                'overlays.$.src': result.videoUrl,
                'overlays.$.content': result.videoUrl,
                'overlays.$.assetId': result.assetId,
                'overlays.$.videoDurationMs': result.durationMs || (durationSeconds * 1000),
                updatedAt: new Date(),
              },
            },
          );
          console.log(`[VideoWorker] Updated Editron project ${linkedProjectId} overlay: ${oldAssetId} → ${result.assetId}`);
        }
      }
    } catch (projErr: any) {
      // Non-fatal — user can still re-finalize
      console.warn(`[VideoWorker] Project overlay update failed (non-fatal): ${projErr.message}`);
    }

    // Run video quality check — detect AI slop before accepting the clip.
    // If quality is too low, log it and flag for potential regeneration.
    try {
      const { checkVideoQuality } = await import('@/lib/pipeline/consistency-scoring-service');
      const qualityResult = await checkVideoQuality(result.videoUrl, imageUrl);

      // Store quality score on the job
      await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
        { _id: jobId },
        { $set: { qualityScore: qualityResult.score, qualityIssues: qualityResult.issues } },
      );

      if (qualityResult.shouldRegenerate) {
        console.warn(`[VideoWorker] LOW QUALITY (${qualityResult.score}/100) for scene ${sceneIndex}: ${qualityResult.issues.join(', ')}`);
        // Store flag — the Director or UI can offer regeneration
        await db.collection(VIDEO_JOBS_COLLECTION).updateOne(
          { _id: jobId },
          { $set: { qualityFlag: 'low', qualityShouldRegenerate: true } },
        );
      } else {
        console.log(`[VideoWorker] Quality OK (${qualityResult.score}/100) for scene ${sceneIndex}`);
      }
    } catch (qualityErr: any) {
      console.warn(`[VideoWorker] Quality check failed (non-fatal): ${qualityErr.message}`);
    }

    // Run 5-Track analysis on the generated video immediately.
    // Analysis is cached in MongoDB — Director reads it instantly later.
    // This removes analysis from the Director's time budget entirely.
    try {
      const { runFullAnalysis, getAnalysis } = await import('@/lib/editron/services/five-track-analysis');

      // Only analyze if not already cached (e.g., from a previous generation)
      const existing = await getAnalysis(result.assetId);
      if (!existing) {
        const durationMs = result.durationMs || (durationSeconds * 1000);

        // Get storyboard scene for metadata enrichment
        const { getStoryboard } = await import('@/lib/pipeline/storyboard-db');
        const storyboard = await getStoryboard(storyboardId, userId);
        const scene = storyboard?.scenes?.find((s: any) => s.sceneIndex === sceneIndex);

        await runFullAnalysis(result.assetId, userId, {
          videoUrl: result.videoUrl,
          audioUrl: undefined, // Voiceover added later, not available yet
          durationMs,
          storyboardScene: scene?.descriptor,
          sourceType: 'ai-generated',
        });

        console.log(`[VideoWorker] 5-Track analysis cached for ${result.assetId}`);
      }
    } catch (analysisErr: any) {
      // Non-fatal — Director will run analysis if cache miss
      console.warn(`[VideoWorker] Analysis failed (non-fatal): ${analysisErr.message}`);
    }

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

// SECURITY: Always verify QStash signature in production.
// In dev, skip verification for local testing.
// If signing keys are missing in production, REJECT the request — don't leave endpoints open.
const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = !!process.env.QSTASH_CURRENT_SIGNING_KEY && !!process.env.QSTASH_NEXT_SIGNING_KEY;

async function secureHandler(request: NextRequest) {
  if (!isDev && !hasSigningKeys) {
    console.error('[VideoWorker] SECURITY: QSTASH signing keys not set in production. Rejecting request.');
    return NextResponse.json({ error: 'Worker not configured — missing signing keys' }, { status: 500 });
  }
  return handler(request);
}

export const POST = isDev ? handler : (hasSigningKeys ? verifySignatureAppRouter(handler) : secureHandler);
