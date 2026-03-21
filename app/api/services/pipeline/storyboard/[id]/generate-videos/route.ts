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
import { getStoryboard } from '@/lib/pipeline/storyboard-db';
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
import { getDatabase } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 60; // Only builds prompts + enqueues (no video gen here)

const VIDEO_JOBS_COLLECTION = 'pipeline_video_jobs';
const VIDEO_BATCHES_COLLECTION = 'pipeline_video_batches';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: storyboardId } = await params;
    const body = await request.json();
    const {
      sceneIndices,
      provider,
      aspectRatio,
      videoModel,
    }: {
      sceneIndices?: number[];
      provider?: VideoProvider;
      aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
      videoModel?: FalVideoModel | 'auto';
    } = body;

    const storyboard = await getStoryboard(storyboardId, userId);
    if (!storyboard) {
      return NextResponse.json(
        { success: false, error: 'Storyboard not found' },
        { status: 404 },
      );
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

    // Deduct credits (3 credits per video clip)
    const creditCost = targetScenes.length * 3;
    const deductResult = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'video_generation',
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: deductResult.error || 'Insufficient credits', creditCost },
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
    const sortedScenes = [...targetScenes].sort((a, b) => a.sceneIndex - b.sceneIndex);

    interface SceneJob {
      sceneIndex: number;
      imageUrl: string;
      motionPrompt: string;
      durationSeconds: number;
      nextSceneImageUrl?: string;
    }

    const sceneJobs: SceneJob[] = [];

    for (let i = 0; i < sortedScenes.length; i++) {
      const scene = sortedScenes[i];
      const nextScene = i < sortedScenes.length - 1 ? sortedScenes[i + 1] : null;

      let motionPrompt: string;
      if (useLLMRefinement) {
        try {
          const promptContext: VideoPromptContext = {
            visualDescription: scene.descriptor.visualDescription,
            videoMotionPrompt: scene.descriptor.videoMotionPrompt,
            narration: scene.descriptor.narration,
            mood: scene.descriptor.mood,
            durationSeconds: Math.min(scene.descriptor.durationSeconds, 10),
            artStyle,
            aspectRatio,
            referenceSubjects: sceneSubjectMap.get(scene.sceneIndex),
            videoQualityTokens: (scene.descriptor as any).videoQualityTokens,
          };
          motionPrompt = await refineVideoPrompt(promptContext);
          console.log(`[generate-videos] Scene ${scene.sceneIndex}: prompt refined (${motionPrompt.length} chars)`);
        } catch {
          motionPrompt = buildMotionPrompt({
            visualDescription: scene.descriptor.visualDescription,
            narration: scene.descriptor.narration,
            cameraDirection: scene.descriptor.cameraDirection,
            mood: scene.descriptor.mood,
            videoMotionPrompt: scene.descriptor.videoMotionPrompt,
            videoQualityTokens: (scene.descriptor as any).videoQualityTokens,
          });
        }
      } else {
        motionPrompt = buildMotionPrompt({
          visualDescription: scene.descriptor.visualDescription,
          narration: scene.descriptor.narration,
          cameraDirection: scene.descriptor.cameraDirection,
          mood: scene.descriptor.mood,
          videoMotionPrompt: scene.descriptor.videoMotionPrompt,
          videoQualityTokens: (scene.descriptor as any).videoQualityTokens,
        });
      }

      sceneJobs.push({
        sceneIndex: scene.sceneIndex,
        imageUrl: scene.imageUrl!,
        motionPrompt,
        durationSeconds: Math.min(scene.descriptor.durationSeconds, 10),
        nextSceneImageUrl: nextScene?.imageUrl || undefined,
      });
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

    // Create job records
    const jobDocs = sceneJobs.map(s => ({
      _id: `${batchId}_s${s.sceneIndex}`,
      batchId,
      userId,
      storyboardId,
      sceneIndex: s.sceneIndex,
      status: 'queued',
      createdAt: now,
      expiresAt,
    }));
    if (jobDocs.length > 0) {
      await db.collection(VIDEO_JOBS_COLLECTION).insertMany(jobDocs as any[]);
    }

    // ─── Enqueue each scene via QStash (all fire in parallel) ──────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const workerUrl = `${baseUrl}/api/internal/workers/pipeline/video`;

    console.log(`[generate-videos] Worker URL: ${workerUrl}`);
    console.log(`[generate-videos] QSTASH_TOKEN set: ${!!process.env.QSTASH_TOKEN}, QSTASH_URL: ${process.env.QSTASH_URL || '(default)'}`);

    const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';

    let enqueueErrors = 0;

    if (isDev) {
      // In dev, call worker directly (fire-and-forget)
      for (const scene of sceneJobs) {
        fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: `${batchId}_s${scene.sceneIndex}`,
            batchId,
            userId,
            storyboardId,
            sceneIndex: scene.sceneIndex,
            imageUrl: scene.imageUrl,
            motionPrompt: scene.motionPrompt,
            durationSeconds: scene.durationSeconds,
            aspectRatio,
            videoModel: resolvedModel,
            nextSceneImageUrl: scene.nextSceneImageUrl,
          }),
        }).catch(err => console.error(`[generate-videos] Dev dispatch failed for scene ${scene.sceneIndex}:`, err.message));
      }
    } else if (!process.env.QSTASH_TOKEN) {
      // QStash not configured — fall back to fire-and-forget fetch
      console.warn('[generate-videos] QSTASH_TOKEN not set, using fire-and-forget fetch');
      for (const scene of sceneJobs) {
        fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: `${batchId}_s${scene.sceneIndex}`,
            batchId,
            userId,
            storyboardId,
            sceneIndex: scene.sceneIndex,
            imageUrl: scene.imageUrl,
            motionPrompt: scene.motionPrompt,
            durationSeconds: scene.durationSeconds,
            aspectRatio,
            videoModel: resolvedModel,
            nextSceneImageUrl: scene.nextSceneImageUrl,
          }),
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
            body: {
              jobId: `${batchId}_s${scene.sceneIndex}`,
              batchId,
              userId,
              storyboardId,
              sceneIndex: scene.sceneIndex,
              imageUrl: scene.imageUrl,
              motionPrompt: scene.motionPrompt,
              durationSeconds: scene.durationSeconds,
              aspectRatio,
              videoModel: resolvedModel,
              nextSceneImageUrl: scene.nextSceneImageUrl,
            },
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

    return NextResponse.json({
      success: true,
      async: true,
      batchId,
      storyboardId,
      totalScenes: sceneJobs.length,
      videoModel: resolvedModel,
      creditsDeducted: creditCost,
      enqueueErrors,
      message: `${sceneJobs.length} video scenes queued for parallel generation.`,
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
