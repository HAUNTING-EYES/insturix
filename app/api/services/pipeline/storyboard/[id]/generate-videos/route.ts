/**
 * POST /api/services/pipeline/storyboard/[id]/generate-videos
 *
 * Enqueue AI video clips for each approved scene in a storyboard.
 * Returns immediately with a batchId — frontend polls for progress.
 *
 * Architecture: Non-blocking async queue.
 * 1. Build motion prompts for all scenes (LLM refinement, ~5s total)
 * 2. Enqueue each scene as an independent job in Redis
 * 3. Return batchId immediately — frontend polls /status?batchId=xxx
 * 4. Cron (/api/cron/process-video-queue) processes scenes in parallel
 *
 * This replaces the old sequential blocking approach that timed out on 4+ scenes.
 *
 * Cost: 3 credits per scene
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
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
import {
  enqueueVideoBatch,
  type VideoJobScene,
} from '@/lib/pipeline/video-queue-service';

export const runtime = 'nodejs';
export const maxDuration = 60; // Only needs time for prompt building + enqueue (not video generation)

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

    // Build reference subject lookup for VideoPromptMaster
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

    console.log(`[generate-videos] Building prompts for ${targetScenes.length} scenes (LLM=${useLLMRefinement}, model=${lockedVideoModel})`);

    // ─── Build ALL motion prompts upfront (fast: ~1-2s per scene with LLM) ────
    const sortedScenes = [...targetScenes].sort(
      (a, b) => a.sceneIndex - b.sceneIndex,
    );

    const scenesForQueue: VideoJobScene[] = [];

    for (let i = 0; i < sortedScenes.length; i++) {
      const scene = sortedScenes[i];
      const nextScene = i < sortedScenes.length - 1 ? sortedScenes[i + 1] : null;

      // Build motion prompt (LLM refinement or fallback)
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
        } catch (llmErr: any) {
          console.warn(`[generate-videos] Scene ${scene.sceneIndex}: LLM failed, using fallback`);
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

      scenesForQueue.push({
        sceneIndex: scene.sceneIndex,
        imageUrl: scene.imageUrl!,
        motionPrompt,
        durationSeconds: Math.min(scene.descriptor.durationSeconds, 10),
        nextSceneImageUrl: nextScene?.imageUrl || undefined,
      });
    }

    // ─── Enqueue all scenes → returns immediately ────────────────
    const { batchId, totalScenes } = await enqueueVideoBatch(
      userId,
      storyboardId,
      scenesForQueue,
      {
        aspectRatio,
        videoModel: lockedVideoModel || 'kling-2.1',
      },
    );

    console.log(`[generate-videos] Enqueued batch ${batchId}: ${totalScenes} scenes for parallel processing`);

    return NextResponse.json({
      success: true,
      async: true, // Signal to frontend that this is async — poll for status
      batchId,
      storyboardId,
      totalScenes,
      videoModel: lockedVideoModel,
      creditsDeducted: creditCost,
      message: `${totalScenes} video scenes queued for parallel generation. Poll /status?batchId=${batchId} for progress.`,
    });
  } catch (error: any) {
    console.error('[generate-videos] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to enqueue videos' },
      { status: 500 },
    );
  }
}
