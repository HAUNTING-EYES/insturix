/**
 * POST /api/internal/workers/pipeline/storyboard-image
 *
 * QStash worker that generates a SINGLE storyboard image (one scene + its
 * independent sub-shots). Each scene gets its own 300s Vercel timeout instead
 * of sharing one 300s budget across the whole storyboard.
 *
 * Bundle 4 (2026-04-09): architectural migration from inline generation to
 * QStash workers. Mirrors /api/internal/workers/pipeline/video/route.ts.
 *
 * Flow:
 *   1. Receive job payload (scene descriptor + refs + model)
 *   2. Mark job as processing in MongoDB
 *   3. Generate scene-level image via generateStoryboardImage()
 *   4. If sub-shots have independentGeneration:true, generate each in parallel
 *      (INNER_CONCURRENCY=3) — reuses the Bundle 2/3 per-sub-shot logic
 *   5. Update storyboard doc + job status + batch counters
 *   6. If this was the LAST job in the batch, optionally trigger consistency
 *      check as a fire-and-forget post-batch step (deferred, not in this commit)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { getDatabase } from '@/lib/editron/db/mongodb';
import {
  STORYBOARD_IMAGE_JOBS_COLLECTION,
  updateStoryboardImageBatchStatus,
  incrementStoryboardImageBatchCompleted,
  incrementStoryboardImageBatchFailed,
  markStoryboardImageBatchConsistencyDone,
  type StoryboardImageWorkerPayload,
} from '@/lib/pipeline/storyboard-image-queue';
import { generateStoryboardImage } from '@/lib/pipeline/storyboard-service';
import { selectBrandEvidenceReferencesForScene } from '@/lib/pipeline/storyboard-reference-priority';
import { updateStoryboardScene, updateSubShot, getStoryboard } from '@/lib/pipeline/storyboard-db';
import { scoreStoryboardConsistency } from '@/lib/pipeline/consistency-scoring-service';
import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function handler(request: NextRequest) {
  const startMs = Date.now();
  console.log(`[StoryboardImageWorker] Received request from ${request.headers.get('user-agent')?.substring(0, 50) || 'unknown'}`);

  let payload: StoryboardImageWorkerPayload | undefined;
  try {
    payload = (await request.json()) as StoryboardImageWorkerPayload;
    const {
      jobId,
      batchId,
      userId,
      storyboardId,
      sceneIndex,
      descriptor,
      referenceImages,
      styleGuide,
      modelId,
      aspectRatio,
      totalScenes,
    } = payload;

    if (!jobId || !batchId || !userId || !storyboardId || sceneIndex === undefined || !descriptor) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields in worker payload' },
        { status: 400 },
      );
    }

    console.log(`[StoryboardImageWorker] Processing job ${jobId}: scene ${sceneIndex}, model=${modelId || 'default'}`);

    const db = await getDatabase();

    // Mark job as processing
    await db.collection(STORYBOARD_IMAGE_JOBS_COLLECTION).updateOne(
      { _id: jobId } as any,
      {
        $set: { status: 'processing', startedAt: new Date() },
        $inc: { attempts: 1 },
      },
    );

    // Mark scene as 'generating' in storyboard doc for UI visibility
    await updateStoryboardScene(storyboardId, sceneIndex, { status: 'generating' });

    // ─── Generate scene-level image ─────────────────────────────────
    // Bundle 4: reuses the existing generateStoryboardImage helper. That function
    // already handles IP-adapter → fallback img2img → text-to-image strategy per
    // the reference-capability config in adapters/image-model-configs.ts.
    const result = await generateStoryboardImage(descriptor, userId, {
      styleGuide,
      modelId,
      aspectRatio,
      sceneIndex,
      totalScenes,
      referenceImages,
    });

    // Persist scene-level image to storyboard doc
    await updateStoryboardScene(storyboardId, sceneIndex, {
      imageAssetId: result.assetId,
      imageUrl: result.imageUrl,
      imageGcsPath: result.gcsPath,
      status: 'generated',
      generationHistory: [
        {
          assetId: result.assetId,
          imageUrl: result.imageUrl,
          timestamp: new Date(),
          modelUsed: result.modelUsed,
        } as any,
      ],
    });

    console.log(`[StoryboardImageWorker] Scene ${sceneIndex}: image SUCCESS (${result.assetId}, ${((Date.now() - startMs) / 1000).toFixed(1)}s)`);

    // ─── Per-sub-shot image generation (Bundle 2 architecture) ──────
    // Each sub-shot with independentGeneration:true needs its own image from
    // its own visualDescription. Without this the video worker falls back to
    // the parent scene image → "3 videos stitched to 11 shots" disaster.
    //
    // In Bundle 4 we no longer have to worry about the parent route's 300s
    // budget — this worker has its OWN 300s budget. But we still run sub-shots
    // in parallel with an inner concurrency cap to be nice to fal.ai.
    let subShotsGenerated = 0;
    let subShotsFailed = 0;

    const indepSubShots = (descriptor.subShots || [])
      .map((sub, idx) => ({ sub, idx }))
      .filter(({ sub }) => sub.independentGeneration && !sub.imageUrl && sub.visualDescription);

    if (indepSubShots.length > 0) {
      console.log(`[StoryboardImageWorker] Scene ${sceneIndex}: generating ${indepSubShots.length} per-sub-shot images in parallel`);

      // Inner concurrency: 3 parallel sub-shots at a time. Keeps fal.ai happy
      // and still completes a 5-sub-shot montage in ~60s worst case.
      const INNER_CONCURRENCY = 3;

      // Budget guard — if this worker has been running for > 240s already,
      // bail on sub-shots (leaves 60s for DB writes + response). Video worker
      // falls back to parent image, so this is a graceful degrade.
      const WORKER_BUDGET_MS = 280_000;

      const runOne = async ({ sub, idx }: typeof indepSubShots[number]) => {
        const nowBudgetMs = WORKER_BUDGET_MS - (Date.now() - startMs);
        if (nowBudgetMs < 30_000) {
          console.warn(`[StoryboardImageWorker] Scene ${sceneIndex} sub ${idx}: SKIPPED (budget exhausted, ${Math.round(nowBudgetMs / 1000)}s left)`);
          subShotsFailed++;
          return;
        }
        const subStart = Date.now();
        try {
          const subDescriptor: SceneDescriptor = {
            ...descriptor,
            visualDescription: sub.visualDescription!,
            imageQualityTokens: sub.imageQualityTokens || descriptor.imageQualityTokens,
            videoQualityTokens: sub.videoQualityTokens || descriptor.videoQualityTokens,
            videoMotionPrompt: sub.videoMotionPrompt || descriptor.videoMotionPrompt,
          };

          const subShotReferenceImages = selectBrandEvidenceReferencesForScene(subDescriptor, referenceImages);

          const subResult = await generateStoryboardImage(subDescriptor, userId, {
            styleGuide,
            modelId,
            aspectRatio,
            sceneIndex,
            totalScenes,
            // Generic sub-shots stay text-only for variety; owned logo/product sub-shots keep real brand evidence.
            referenceImages: subShotReferenceImages,
          });

          await updateSubShot(storyboardId, sceneIndex, idx, {
            imageUrl: subResult.imageUrl,
            imageAssetId: subResult.assetId,
          });

          subShotsGenerated++;
          console.log(`[StoryboardImageWorker] Scene ${sceneIndex} sub ${idx}: OK in ${((Date.now() - subStart) / 1000).toFixed(1)}s (${subResult.assetId})`);
        } catch (subErr: any) {
          console.warn(`[StoryboardImageWorker] Scene ${sceneIndex} sub ${idx}: FAILED (non-fatal): ${subErr.message}`);
          subShotsFailed++;
          // Don't throw — parent image is persisted, scene counts as generated
        }
      };

      // Sliding-window concurrency runner
      const queue = [...indepSubShots];
      const inFlight: Promise<void>[] = [];
      while (queue.length > 0 || inFlight.length > 0) {
        while (inFlight.length < INNER_CONCURRENCY && queue.length > 0) {
          const item = queue.shift()!;
          const p = runOne(item).then(() => {
            inFlight.splice(inFlight.indexOf(p), 1);
          });
          inFlight.push(p);
        }
        if (inFlight.length > 0) {
          await Promise.race(inFlight);
        }
      }
    }

    // ─── Mark job as completed + update batch counter ──────────────
    await db.collection(STORYBOARD_IMAGE_JOBS_COLLECTION).updateOne(
      { _id: jobId } as any,
      {
        $set: {
          status: 'completed',
          imageUrl: result.imageUrl,
          imageAssetId: result.assetId,
          subShotsGenerated,
          subShotsFailed,
          completedAt: new Date(),
        },
      },
    );

    await incrementStoryboardImageBatchCompleted(batchId);
    const updatedBatch = await updateStoryboardImageBatchStatus(batchId);

    console.log(`[StoryboardImageWorker] Job ${jobId} DONE (${((Date.now() - startMs) / 1000).toFixed(1)}s), batch ${batchId} status=${updatedBatch?.status}`);

    // ─── Post-batch consistency check (last job triggers it) ───────
    // Non-blocking: runs via dynamic import + fire-and-forget. If it fails,
    // the storyboard is still marked 'ready' by the batch status update.
    //
    // We detect "last job" by checking the updated batch counters. Two concurrent
    // workers could both think they're last (race), but markStoryboardImageBatchConsistencyDone
    // is idempotent so the second one just no-ops.
    if (updatedBatch && updatedBatch.status !== 'processing' && !updatedBatch.consistencyCheckDone) {
      // Mark early to avoid double-run on concurrent final workers
      await markStoryboardImageBatchConsistencyDone(batchId);

      // Fire-and-forget consistency check (doesn't block response)
      runPostBatchConsistencyCheck(storyboardId, userId).catch((err: any) => {
        console.warn(`[StoryboardImageWorker] Post-batch consistency check failed (non-fatal): ${err.message}`);
      });

      // Update storyboard top-level status to 'ready' or 'partial'
      await updateFinalStoryboardStatus(storyboardId, updatedBatch.status);
    }

    return NextResponse.json({
      success: true,
      jobId,
      sceneIndex,
      imageUrl: result.imageUrl,
      subShotsGenerated,
      subShotsFailed,
    });
  } catch (error: any) {
    console.error(`[StoryboardImageWorker] Error:`, error.message);

    // Best-effort: mark job + batch as failed
    if (payload?.jobId && payload?.batchId) {
      try {
        const db = await getDatabase();
        await db.collection(STORYBOARD_IMAGE_JOBS_COLLECTION).updateOne(
          { _id: payload.jobId } as any,
          {
            $set: {
              status: 'failed',
              error: error.message,
              completedAt: new Date(),
            },
          },
        );
        await incrementStoryboardImageBatchFailed(payload.batchId);
        const updatedBatch = await updateStoryboardImageBatchStatus(payload.batchId);

        // Also mark the scene as 'pending' (failed but not destroyed) so user can retry
        if (payload.storyboardId && payload.sceneIndex !== undefined) {
          await updateStoryboardScene(payload.storyboardId, payload.sceneIndex, {
            status: 'pending',
          });
        }

        if (updatedBatch && updatedBatch.status !== 'processing') {
          await updateFinalStoryboardStatus(payload.storyboardId, updatedBatch.status);
        }
      } catch (markErr: any) {
        console.error(`[StoryboardImageWorker] Failed to mark job as failed: ${markErr.message}`);
      }
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Update the storyboard top-level status after all jobs complete.
 * Maps batch status → storyboard status:
 *   completed → 'ready'
 *   partial → 'partial'
 *   failed → 'error'
 */
async function updateFinalStoryboardStatus(
  storyboardId: string,
  batchStatus: 'processing' | 'completed' | 'partial' | 'failed',
): Promise<void> {
  const db = await getDatabase();
  let storyboardStatus: 'generating' | 'ready' | 'partial' | 'error';
  if (batchStatus === 'completed') storyboardStatus = 'ready';
  else if (batchStatus === 'partial') storyboardStatus = 'partial';
  else if (batchStatus === 'failed') storyboardStatus = 'error';
  else return; // Still processing — don't touch

  await db.collection('storyboards').updateOne(
    { storyboardId },
    { $set: { status: storyboardStatus, updatedAt: new Date() } },
  );
  console.log(`[StoryboardImageWorker] Storyboard ${storyboardId} marked as '${storyboardStatus}' (batch ${batchStatus})`);
}

/**
 * Post-batch consistency check. Fires after all scenes are generated.
 * This is the Gemini Vision-based consistency scoring that USED to run inline
 * in generateFullStoryboard. Moving it here gives it its own time budget and
 * doesn't block individual scene workers.
 *
 * Failure is non-fatal — storyboard is still usable.
 */
async function runPostBatchConsistencyCheck(
  storyboardId: string,
  userId: string,
): Promise<void> {
  try {
    // Use the dummy userId for read since we don't have the caller userId here.
    // Actually we do — it's in the worker payload. Pass it in.
    const storyboard = await getStoryboard(storyboardId, userId);
    if (!storyboard) {
      console.warn(`[StoryboardImageWorker] Consistency check: storyboard ${storyboardId} not found`);
      return;
    }

    const completedScenes = storyboard.scenes.filter((s) => s.imageUrl).length;
    if (completedScenes < 2) {
      console.log(`[StoryboardImageWorker] Consistency check: only ${completedScenes} scenes generated, skipping`);
      return;
    }

    console.log(`[StoryboardImageWorker] Running post-batch consistency check for ${storyboardId}`);
    const report = await scoreStoryboardConsistency(storyboard, 0.6);

    // Persist the report to the storyboard doc
    const db = await getDatabase();
    await db.collection('storyboards').updateOne(
      { storyboardId },
      { $set: { consistencyReport: report, updatedAt: new Date() } },
    );

    console.log(`[StoryboardImageWorker] Consistency check done: ${report.flaggedScenes.length} flagged scenes`);
  } catch (err: any) {
    console.error(`[StoryboardImageWorker] Consistency check threw:`, err.message);
  }
}

// SECURITY: Always verify QStash signature in production.
const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = !!process.env.QSTASH_CURRENT_SIGNING_KEY && !!process.env.QSTASH_NEXT_SIGNING_KEY;

async function secureHandler(request: NextRequest) {
  if (!isDev && !hasSigningKeys) {
    console.error('[StoryboardImageWorker] SECURITY: QSTASH signing keys not set in production. Rejecting.');
    return NextResponse.json({ error: 'Worker not configured — missing signing keys' }, { status: 500 });
  }
  return handler(request);
}

export const POST = isDev ? handler : (hasSigningKeys ? verifySignatureAppRouter(handler) : secureHandler);
