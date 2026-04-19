/**
 * POST /api/services/pipeline/storyboard/[id]/generate-videos
 *
 * Enqueue AI video clips for each scene via QStash.
 * Each scene gets its own QStash job → its own worker invocation → its own 300s timeout.
 * All scenes process in parallel. Frontend polls /status?batchId=xxx for progress.
 *
 * Uses the same proven QStash pattern as Clickatron (clickatron-qtask.ts).
 * No Redis dependency — QStash handles queuing and delivery natively.
 *
 * Cost: 3 credits per scene
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Client } from '@upstash/qstash';
import { getStoryboard, updateStoryboardScene } from '@/lib/pipeline/storyboard-db';
import { CreditsService } from '@/lib/services/creditsService';
import {
  buildMotionPrompt,
  selectBestModel,
  type VideoProvider,
  type FalVideoModel,
} from '@/lib/pipeline/video-generation-service';
import {
  refineVideoPrompt,
  isLLMParserAvailable,
  type VideoPromptContext,
} from '@/lib/pipeline/llm-scene-parser';
import { getActualVideoDuration } from '@/lib/pipeline/adapters/video-model-configs';
import { getDatabase } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 300; // Builds prompts (LLM refinement ~7s each) + enqueues. With 21 sub-shots × 7s = 147s needed.

const VIDEO_JOBS_COLLECTION = 'pipeline_video_jobs';
const VIDEO_BATCHES_COLLECTION = 'pipeline_video_batches';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storyboardId } = await params;
    const body = await request.json();

    // Auth: prefer Clerk session, fallback to userId in body (for internal AI tool calls).
    // Rule 18N: fail-visible on real auth errors — a bare `catch {}` silently masked
    // Clerk middleware misconfiguration / key rotation / network failures, leaving
    // the caller with a confusing 401 "Unauthorized" instead of the real cause.
    // Log the error but continue (body.userId fallback is the legitimate internal path).
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch (authErr: any) {
      console.warn(`[generate-videos] Clerk auth() threw: ${authErr?.message || authErr} — falling back to body.userId`);
    }
    if (!userId && body.userId) {
      userId = body.userId;
    }
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const {
      sceneIndices,
      provider,
      aspectRatio,
      videoModel,
      enableChaining = false,
    }: {
      sceneIndices?: number[];
      provider?: VideoProvider;
      aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
      videoModel?: FalVideoModel | 'auto';
      /** Enable cross-scene chaining (next scene's image as end-frame). Default: false */
      enableChaining?: boolean;
    } = body;

    const storyboard = await getStoryboard(storyboardId, userId);
    if (!storyboard) {
      return NextResponse.json(
        { success: false, error: 'Storyboard not found' },
        { status: 404 },
      );
    }

    // E1 FIX: Check for active video generation batch — prevent concurrent runs
    const db0 = await getDatabase();
    const activeBatch = await db0.collection(VIDEO_BATCHES_COLLECTION).findOne({
      storyboardId,
      status: 'processing',
      createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) }, // Active within last 15 min
    } as any);
    if (activeBatch) {
      return NextResponse.json({
        success: false,
        error: `Video generation already in progress (batch ${(activeBatch as any)._id}). Wait for it to complete or check status.`,
        existingBatchId: (activeBatch as any)._id,
      }, { status: 409 });
    }

    // Determine which scenes to generate videos for
    const targetScenes = storyboard.scenes.filter((s) => {
      if (!s.imageUrl) return false;
      if (sceneIndices && sceneIndices.length > 0) {
        return sceneIndices.includes(s.sceneIndex);
      }
      return s.status === 'approved' || s.status === 'generated';
    });

    if (targetScenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No scenes with images available for video generation' },
        { status: 400 },
      );
    }

    // ─── Asset Type Classification: only generate AI video for hero shots ───
    // Scenes with assetRecommendation != 'ai-video' skip video gen entirely.
    // 'animated-still' scenes use Ken Burns on storyboard image (handled in finalize).
    // 'stock' scenes will eventually search Pixabay/Pexels; for now treated as animated-still.
    // 'graphics-only' scenes get motion graphics templates only (no video).
    const aiVideoScenes = targetScenes.filter(s => {
      const rec = (s.descriptor as any).assetRecommendation;
      return !rec || rec === 'ai-video'; // default to ai-video if field missing (backward compat)
    });
    const skippedScenes = targetScenes.filter(s => {
      const rec = (s.descriptor as any).assetRecommendation;
      return rec && rec !== 'ai-video';
    });
    if (skippedScenes.length > 0) {
      console.log(`[generate-videos] Asset strategy: ${aiVideoScenes.length} hero (ai-video) + ${skippedScenes.length} non-video (${skippedScenes.map(s => `scene ${s.sceneIndex}=${(s.descriptor as any).assetRecommendation}`).join(', ')})`);
      // Mark skipped scenes in storyboard so finalize knows to use Ken Burns / graphics
      for (const scene of skippedScenes) {
        await updateStoryboardScene(storyboardId, scene.sceneIndex, {
          videoSkipped: true,
          videoSkipReason: (scene.descriptor as any).assetRecommendation,
        });
      }
    }

    // Deduct credits (3 credits per video clip) — only for ai-video scenes
    // A1 FIX: Atomic credit deduction — single call for all scenes
    // Montage scenes with independent sub-shots count as N clips, not 1
    const costPerVideo = 3;
    let totalVideoClips = 0;
    for (const scene of aiVideoScenes) {
      const desc = scene.descriptor as any;
      const subShots = desc.subShots || [];
      const independentCount = subShots.filter((s: any) => s.independentGeneration).length;
      totalVideoClips += independentCount > 1 ? independentCount : 1;
    }
    const creditCost = totalVideoClips * costPerVideo;

    // If ALL scenes are non-video (animated-still / stock / graphics-only), skip video gen entirely
    // but still return success so finalize can proceed with Ken Burns / graphics
    if (totalVideoClips === 0) {
      console.log(`[generate-videos] All ${targetScenes.length} scenes are non-video assets — skipping video generation entirely`);
      return NextResponse.json({
        success: true,
        batchId: `skip_${nanoid(8)}`,
        totalScenes: targetScenes.length,
        videoScenes: 0,
        skippedScenes: skippedScenes.length,
        message: 'All scenes use animated storyboard or graphics — no AI video generation needed',
        creditCost: 0,
      });
    }

    const preCheck = await CreditsService.getBalance(userId);
    if (!preCheck || preCheck.totalCredits < creditCost) {
      return NextResponse.json(
        { success: false, error: `Insufficient credits. Need ${creditCost}, have ${preCheck?.totalCredits || 0}`, creditCost },
        { status: 402 },
      );
    }

    const deductResult = await CreditsService.deductCredits(userId, 'pipeline', 'video_generation', { quantity: totalVideoClips });
    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: 'Credit deduction failed', creditCost },
        { status: 402 },
      );
    }

    // Build reference subject lookup
    const sceneSubjectMap = new Map<number, Array<{ name: string; category: string; visualDescription: string }>>();
    if (storyboard.approvedReferences && storyboard.approvedReferences.length > 0) {
      for (const ref of storyboard.approvedReferences) {
        for (const sceneIdx of ref.scenesAppearingIn) {
          if (!sceneSubjectMap.has(sceneIdx)) sceneSubjectMap.set(sceneIdx, []);
          sceneSubjectMap.get(sceneIdx)!.push({
            name: ref.name,
            category: (ref as any).category || 'character',
            visualDescription: (ref as any).visualDescription || `${ref.name} — matching the approved reference image`,
          });
        }
      }
    }

    const artStyle = storyboard.styleGuide?.artStyle;
    const useLLMRefinement = isLLMParserAvailable();

    // Resolve video model
    const isAutoModel = videoModel === 'auto' || !videoModel;
    let lockedVideoModel: FalVideoModel | undefined;
    if (!isAutoModel && videoModel) {
      lockedVideoModel = videoModel;
    } else if (isAutoModel && targetScenes.length > 0) {
      lockedVideoModel = selectBestModel({
        mood: targetScenes[0].descriptor.mood,
        durationSeconds: targetScenes[0].descriptor.durationSeconds,
        artStyle,
      });
    }

    const resolvedModel = lockedVideoModel || 'kling-2.1';
    console.log(`[generate-videos] Building prompts for ${targetScenes.length} scenes (LLM=${useLLMRefinement}, model=${resolvedModel})`);

    // ─── Build ALL motion prompts upfront (fast: ~1-2s per scene with LLM) ────
    const sortedScenes = [...aiVideoScenes].sort((a, b) => a.sceneIndex - b.sceneIndex);

    interface SceneJob {
      sceneIndex: number;
      /** Sub-shot index within the scene (undefined for continuous scenes) */
      subShotIndex?: number;
      imageUrl: string;
      motionPrompt: string;
      durationSeconds: number;
      nextSceneImageUrl?: string;
      /** Scene context passed to worker for LLM prompt refinement.
       *  OLD: Route refined prompts sequentially (~15s each, caused 504 timeout on 14+ scenes).
       *  NEW: Worker refines in its own 300s budget. Quality identical, no timeout. */
      refinementContext?: Record<string, any>;
    }

    const sceneJobs: SceneJob[] = [];

    for (let i = 0; i < sortedScenes.length; i++) {
      const scene = sortedScenes[i];
      const nextScene = i < sortedScenes.length - 1 ? sortedScenes[i + 1] : null;
      const descriptor = scene.descriptor as any;
      // `|| []` handles undefined but NOT null — JSON deserialization can
      // produce literal `null` for optional array fields on some documents.
      // `Array.isArray` guards both cases. Toyota audit B.data.4.
      const subShots = Array.isArray(descriptor.subShots) ? descriptor.subShots : [];
      const isMontageWithIndependent = descriptor.sceneType === 'montage'
        && subShots.length > 1
        && subShots.some((s: any) => s.independentGeneration);

      // C7 FIX: Validate that montage actually has independent sub-shots after filtering.
      // If independentGeneration count is 0, fall through to normal scene path.
      const independentSubShots = isMontageWithIndependent
        ? subShots.filter((s: any) => s.independentGeneration)
        : [];
      if (isMontageWithIndependent && independentSubShots.length === 0) {
        console.warn(`[generate-videos] Scene ${scene.sceneIndex}: montage has subShots but 0 independent — falling through to normal path`);
      }

      if (isMontageWithIndependent && independentSubShots.length > 0) {
        // ─── Montage with independent sub-shots: one job per sub-shot ───
        for (let si = 0; si < subShots.length; si++) {
          const sub = subShots[si];
          if (!sub.independentGeneration) continue; // Skip non-independent sub-shots

          const subVisual = sub.visualDescription || descriptor.visualDescription;
          const subMotion = sub.videoMotionPrompt || descriptor.videoMotionPrompt;
          const rawDur = sub.targetDurationSeconds;
          // 2026-04-17: replaced hardcoded 3-10s cap with model-aware snap.
          // getActualVideoDuration(model, n) returns the nearest achievable duration
          // for the user's chosen video model (Kling {5,10}, Veo {4,6,8}, Seedance 4-15).
          // Honors Rule 8N (script duration is king) — we no longer forcibly chop 15s
          // scenes to 10s when the model (e.g., Seedance 2.0) could deliver 15s.
          // See pipeline_investigations.md "Hardcoded 10s video duration cap" entry.
          const requestedDur = (!rawDur || isNaN(rawDur)) ? 5 : Math.max(rawDur, 3);
          const subDuration = getActualVideoDuration(resolvedModel, requestedDur);
          // Contributor #3 visibility (pipeline_investigations.md): model
          // duration grids (Kling 5/10, Veo 4/6/8, Seedance integer) silently
          // snap. When snap delta exceeds 0.5s it's user-visible drift — log
          // so it's auditable in Vercel function logs + pipelineWarnings
          // downstream (still TODO for finalize/director consumers).
          if (Math.abs(subDuration - requestedDur) > 0.5) {
            console.warn(
              `[generate-videos] Scene ${scene.sceneIndex} sub-shot ${si}: duration SNAPPED ${requestedDur}s → ${subDuration}s ` +
              `(model=${resolvedModel} grid limitation). Timeline will use ${subDuration}s; consider switching model if duration fidelity matters.`
            );
          }

          // Use sub-shot's own image if available, otherwise parent scene image.
          // Both MUST be present at this point — parent scene was filtered at
          // targetScenes.filter (line ~100 requires s.imageUrl). But a stale
          // MongoDB document or partial deletion could leave scene.imageUrl
          // undefined. Fail-visible via explicit guard instead of `!` cast.
          // Toyota audit B.data.1.
          const subImageUrl = sub.imageUrl || scene.imageUrl;
          if (!subImageUrl) {
            console.error(`[generate-videos] Scene ${scene.sceneIndex} sub-shot ${si}: missing imageUrl on both sub-shot and parent — skipping dispatch`);
            continue;
          }

          // OLD: LLM refinement here (sequential, ~15s each, caused 504 on 14+ scenes).
          // NEW: Send basic prompt + refinement context to worker. Worker refines in its own 300s budget.
          const motionPrompt = buildMotionPrompt({
            visualDescription: subVisual, narration: sub.narration || descriptor.narration,
            cameraDirection: descriptor.cameraDirection, mood: descriptor.mood,
            videoMotionPrompt: subMotion, videoQualityTokens: sub.videoQualityTokens || descriptor.videoQualityTokens,
          });

          sceneJobs.push({
            sceneIndex: scene.sceneIndex,
            subShotIndex: si,
            imageUrl: subImageUrl,
            motionPrompt,
            durationSeconds: subDuration,
            refinementContext: useLLMRefinement ? {
              visualDescription: subVisual,
              narration: sub.narration || descriptor.narration,
              mood: descriptor.mood,
              artStyle,
              videoQualityTokens: sub.videoQualityTokens || descriptor.videoQualityTokens,
              cameraDirection: descriptor.cameraDirection,
              videoMotionPrompt: subMotion,
              referenceSubjects: sceneSubjectMap.get(scene.sceneIndex),
              transitionHint: descriptor.editDirections?.transition,
              // Script's SFX/ambient direction — Seedance weaves into native audio; others ignore
              sfxDescription: (descriptor as any).sfxDescription?.trim() || undefined,
            } : undefined,
          });
          console.log(`[generate-videos] Scene ${scene.sceneIndex} sub-shot ${si}: "${sub.description}" (${subDuration}s, independent)`);
        }
      } else {
        // ─── Continuous scene or montage from same clip: one job ───
        // OLD: LLM refinement here (sequential, ~15s each, caused 504 on 14+ scenes).
        // NEW: Basic prompt + refinement context sent to worker.
        // Guard imageUrl like the sub-shot path — targetScenes.filter
        // requires s.imageUrl but stale / partial docs can sneak through.
        // Toyota audit B.data.1.
        if (!scene.imageUrl) {
          console.error(`[generate-videos] Scene ${scene.sceneIndex}: missing imageUrl — skipping dispatch`);
          continue;
        }
        const motionPrompt = buildMotionPrompt({
          visualDescription: descriptor.visualDescription,
          narration: descriptor.narration,
          cameraDirection: descriptor.cameraDirection,
          mood: descriptor.mood,
          videoMotionPrompt: descriptor.videoMotionPrompt,
          videoQualityTokens: descriptor.videoQualityTokens,
        });

        const actualSceneDur = getActualVideoDuration(resolvedModel, descriptor.durationSeconds);
        // Contributor #3 snap-delta visibility (pipeline_investigations.md).
        // Kling/Veo/Seedance grids silently snap to discrete buckets; surface
        // when the delta is user-noticeable.
        if (Math.abs(actualSceneDur - descriptor.durationSeconds) > 0.5) {
          console.warn(
            `[generate-videos] Scene ${scene.sceneIndex}: duration SNAPPED ${descriptor.durationSeconds}s → ${actualSceneDur}s ` +
            `(model=${resolvedModel} grid limitation). Timeline drift of ${(actualSceneDur - descriptor.durationSeconds).toFixed(1)}s vs script.`
          );
        }
        sceneJobs.push({
          sceneIndex: scene.sceneIndex,
          imageUrl: scene.imageUrl,
          motionPrompt,
          // 2026-04-17: replaced hardcoded Math.min(x, 10) with model-aware snap.
          // Previously ALL scenes capped at 10s regardless of model capability —
          // violating Rule 8N for any model that can do longer (Seedance 1.5: 12s,
          // Seedance 2.0: 15s). Now respects user's chosen model's duration grid.
          durationSeconds: actualSceneDur,
          nextSceneImageUrl: enableChaining ? (nextScene?.imageUrl || undefined) : undefined,
          refinementContext: useLLMRefinement ? {
            visualDescription: descriptor.visualDescription,
            narration: descriptor.narration,
            mood: descriptor.mood,
            artStyle,
            videoQualityTokens: descriptor.videoQualityTokens,
            cameraDirection: descriptor.cameraDirection,
            videoMotionPrompt: descriptor.videoMotionPrompt,
            referenceSubjects: sceneSubjectMap.get(scene.sceneIndex),
            transitionHint: descriptor.editDirections?.transition,
            // Script's SFX/ambient direction — Seedance weaves into native audio; others ignore
            sfxDescription: (descriptor as any).sfxDescription?.trim() || undefined,
          } : undefined,
        });
      }
    }

    // ─── Create batch + jobs in MongoDB, then enqueue via QStash ──────
    const batchId = `vb_${nanoid(12)}`;
    const db = await getDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Create batch record
    await db.collection(VIDEO_BATCHES_COLLECTION).insertOne({
      _id: batchId,
      userId,
      storyboardId,
      totalScenes: sceneJobs.length,
      completed: 0,
      failed: 0,
      status: 'processing',
      videoModel: resolvedModel,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    } as any);

    // Create job records (unique ID includes sub-shot index for montage scenes)
    const jobDocs = sceneJobs.map(s => ({
      _id: s.subShotIndex !== undefined
        ? `${batchId}_s${s.sceneIndex}_sub${s.subShotIndex}`
        : `${batchId}_s${s.sceneIndex}`,
      batchId,
      userId,
      storyboardId,
      sceneIndex: s.sceneIndex,
      subShotIndex: s.subShotIndex,
      status: 'queued',
      createdAt: now,
      expiresAt,
    }));
    if (jobDocs.length > 0) {
      await db.collection(VIDEO_JOBS_COLLECTION).insertMany(jobDocs as any[]);
    }

    // ─── Enqueue each scene via QStash (all fire in parallel) ──────
    // CRITICAL: Use VERCEL_URL (the actual deployment URL) for worker target.
    // NEXT_PUBLIC_APP_URL points to production (www.insturix.com) which doesn't
    // have the worker route on preview branches. VERCEL_URL is the deployment-
    // specific URL that always has the correct code.
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    const workerUrl = `${baseUrl}/api/internal/workers/pipeline/video`;

    console.log(`[generate-videos] Worker URL: ${workerUrl}`);
    console.log(`[generate-videos] QSTASH_TOKEN set: ${!!process.env.QSTASH_TOKEN}, QSTASH_URL: ${process.env.QSTASH_URL || '(default)'}`);

    const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';

    let enqueueErrors = 0;

    // Helper to build job payload (same for dev, fetch-fallback, and QStash)
    const buildPayload = (scene: SceneJob) => ({
      jobId: scene.subShotIndex !== undefined
        ? `${batchId}_s${scene.sceneIndex}_sub${scene.subShotIndex}`
        : `${batchId}_s${scene.sceneIndex}`,
      batchId,
      userId,
      storyboardId,
      sceneIndex: scene.sceneIndex,
      subShotIndex: scene.subShotIndex,
      imageUrl: scene.imageUrl,
      motionPrompt: scene.motionPrompt,
      durationSeconds: scene.durationSeconds,
      aspectRatio,
      videoModel: resolvedModel,
      nextSceneImageUrl: scene.nextSceneImageUrl,
      refinementContext: scene.refinementContext,
    });

    if (isDev) {
      // In dev, call worker directly (fire-and-forget)
      for (const scene of sceneJobs) {
        fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(scene)),
        }).catch(err => console.error(`[generate-videos] Dev dispatch failed for scene ${scene.sceneIndex}:`, err.message));
      }
    } else if (!process.env.QSTASH_TOKEN) {
      console.warn('[generate-videos] QSTASH_TOKEN not set, using fire-and-forget fetch');
      for (const scene of sceneJobs) {
        fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(scene)),
        }).catch(err => console.error(`[generate-videos] Fetch dispatch failed for scene ${scene.sceneIndex}:`, err.message));
      }
    } else {
      // Production: Use QStash
      const qstashClient = new Client({
        token: process.env.QSTASH_TOKEN,
        baseUrl: process.env.QSTASH_URL || undefined,
      });

      const qstashResults = await Promise.allSettled(
        sceneJobs.map(scene =>
          qstashClient.publishJSON({
            url: workerUrl,
            body: buildPayload(scene),
            retries: 2,
          }),
        ),
      );

      for (let i = 0; i < qstashResults.length; i++) {
        const r = qstashResults[i];
        if (r.status === 'fulfilled') {
          console.log(`[generate-videos] QStash scene ${sceneJobs[i].sceneIndex}: messageId=${(r.value as any)?.messageId || 'ok'}`);
        } else {
          enqueueErrors++;
          console.error(`[generate-videos] QStash scene ${sceneJobs[i].sceneIndex} FAILED:`, (r.reason as any)?.message || r.reason);
        }
      }

      if (enqueueErrors > 0) {
        console.error(`[generate-videos] ${enqueueErrors}/${sceneJobs.length} QStash enqueue failed`);
      }
    }

    console.log(`[generate-videos] Batch ${batchId}: ${sceneJobs.length} scenes dispatched (${enqueueErrors} failures)`);

    // C1 FIX: Fail if ANY enqueues failed (not just all).
    // Partial failure = some scenes won't generate = broken output.
    if (enqueueErrors > 0 && enqueueErrors < sceneJobs.length) {
      // Mark batch as partial failure
      await db.collection(VIDEO_BATCHES_COLLECTION).updateOne(
        { _id: batchId } as any,
        { $set: { status: 'partial_enqueue_failure', updatedAt: new Date() } },
      );
      return NextResponse.json({
        success: false,
        error: `${enqueueErrors} of ${sceneJobs.length} video jobs failed to enqueue. Some scenes will not generate.`,
        partialFailure: true,
        batchId,
      }, { status: 503 });
    }

    if (enqueueErrors >= sceneJobs.length && sceneJobs.length > 0) {
      // Mark batch as failed
      await db.collection(VIDEO_BATCHES_COLLECTION).updateOne(
        { _id: batchId } as any,
        { $set: { status: 'failed', updatedAt: new Date() } },
      );
      return NextResponse.json({
        success: false,
        error: `All ${sceneJobs.length} video jobs failed to enqueue. Check QStash configuration.`,
        batchId,
      }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      async: true,
      batchId,
      storyboardId,
      totalScenes: sceneJobs.length,
      skippedScenes: skippedScenes.length,
      videoModel: resolvedModel,
      creditsDeducted: creditCost,
      enqueueErrors,
      message: `${sceneJobs.length} hero video scenes queued for generation.${skippedScenes.length > 0 ? ` ${skippedScenes.length} scenes use animated storyboard/graphics (no AI video).` : ''}`,
    });
  } catch (error: any) {
    const errMsg = error?.message || 'Failed to generate videos';
    console.error('[generate-videos] Error:', errMsg);
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 },
    );
  }
}
