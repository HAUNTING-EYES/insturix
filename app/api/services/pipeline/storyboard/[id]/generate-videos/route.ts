/**
 * POST /api/services/pipeline/storyboard/[id]/generate-videos
 *
 * Generate AI video clips for each approved scene in a storyboard.
 * Converts storyboard images into animated video clips using fal.ai or Kie AI.
 *
 * Cost: 3 credits per scene
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard, updateStoryboardScene } from '@/lib/pipeline/storyboard-db';
import { CreditsService } from '@/lib/services/creditsService';
import {
  generateVideoClip,
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

export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minute timeout — video models are slow + retry

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
      // Must have an image to animate
      if (!s.imageUrl) return false;
      // If specific indices requested, filter to those
      if (sceneIndices && sceneIndices.length > 0) {
        return sceneIndices.includes(s.sceneIndex);
      }
      // Default: generate for approved/generated scenes
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
    // Maps sceneIndex → subjects appearing in that scene
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

    // Consistency mode: when a specific model is chosen (not 'auto'), lock it for all scenes.
    // When 'auto', pick per-scene but lock to the first scene's selection for consistency.
    const isAutoModel = videoModel === 'auto' || !videoModel;
    let lockedVideoModel: FalVideoModel | undefined;
    if (!isAutoModel && videoModel) {
      // User chose a specific model — use it for all scenes (consistency mode)
      lockedVideoModel = videoModel;
      console.log(`[generate-videos] Consistency mode: locked to ${lockedVideoModel} for all scenes`);
    } else if (isAutoModel && targetScenes.length > 0) {
      // Auto mode: select based on first scene and lock for all scenes
      const firstScene = targetScenes[0];
      lockedVideoModel = selectBestModel({
        mood: firstScene.descriptor.mood,
        durationSeconds: firstScene.descriptor.durationSeconds,
        artStyle,
      });
      console.log(`[generate-videos] Auto mode: selected ${lockedVideoModel} from first scene, locking for all scenes`);
    }

    // ─── Build motion prompt for a single scene (inline, just-in-time) ────
    // Prompts are now built just before each scene's video generation,
    // avoiding wasted LLM calls if earlier scenes fail or the request is aborted.
    async function buildSceneMotionPrompt(scene: typeof targetScenes[number]): Promise<string> {
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
          const refined = await refineVideoPrompt(promptContext);
          console.log(`[generate-videos] Scene ${scene.sceneIndex}: VideoPromptMaster refined (${refined.length} chars)`);
          return refined;
        } catch (llmErr: any) {
          console.warn(`[generate-videos] Scene ${scene.sceneIndex}: LLM failed, using fallback:`, llmErr.message);
        }
      }
      return buildMotionPrompt({
        visualDescription: scene.descriptor.visualDescription,
        narration: scene.descriptor.narration,
        cameraDirection: scene.descriptor.cameraDirection,
        mood: scene.descriptor.mood,
        videoMotionPrompt: scene.descriptor.videoMotionPrompt,
        videoQualityTokens: (scene.descriptor as any).videoQualityTokens,
      });
    }

    console.log(`[generate-videos] Processing ${targetScenes.length} scenes sequentially (LLM=${useLLMRefinement}, model=${lockedVideoModel})`);

    // ─── Generate videos sequentially with cross-scene chaining ─────
    // Process scenes in order. For each scene, we pass the NEXT scene's
    // storyboard image as `nextSceneImageUrl` — models that support
    // tail/end frames (Kling, Luma) will make the video transition
    // smoothly toward the next scene's starting visual.
    const results: Array<{
      sceneIndex: number;
      videoUrl?: string;
      assetId?: string;
      error?: string;
    }> = [];

    const MAX_RETRIES = 1; // Retry failed scenes once

    // Sort by scene index for proper chaining order
    const sortedScenes = [...targetScenes].sort(
      (a, b) => a.sceneIndex - b.sceneIndex,
    );

    for (let i = 0; i < sortedScenes.length; i++) {
      const scene = sortedScenes[i];
      const nextScene = i < sortedScenes.length - 1 ? sortedScenes[i + 1] : null;

      // Build motion prompt just-in-time (avoids wasted LLM calls)
      const motionPrompt = await buildSceneMotionPrompt(scene);
      let lastError = '';

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[generate-videos] Scene ${scene.sceneIndex}: RETRY attempt ${attempt}`);
          }

          const sceneStart = Date.now();
          const result = await generateVideoClip(
            {
              imageUrl: scene.imageUrl!,
              motionPrompt,
              durationSeconds: Math.min(scene.descriptor.durationSeconds, 10),
              aspectRatio,
              provider,
              falVideoModel: lockedVideoModel,
              // Cross-scene chaining: pass next scene's storyboard image
              // so the video transitions toward the next scene's visual
              nextSceneImageUrl: nextScene?.imageUrl || undefined,
            },
            userId,
          );

          console.log(`[generate-videos] Scene ${scene.sceneIndex}: SUCCESS in ${Date.now() - sceneStart}ms (attempt ${attempt}, model=${lockedVideoModel}, chained=${!!nextScene?.imageUrl})`);

          await updateStoryboardScene(storyboardId, scene.sceneIndex, {
            videoAssetId: result.assetId,
            videoUrl: result.videoUrl,
            videoGcsPath: result.gcsPath,
            videoProvider: result.provider,
            videoDurationMs: result.durationMs,
          });

          results.push({
            sceneIndex: scene.sceneIndex,
            videoUrl: result.videoUrl,
            assetId: result.assetId,
          });

          break; // Success — exit retry loop
        } catch (err: any) {
          lastError = err.message || 'Video generation failed';
          console.error(`[generate-videos] Scene ${scene.sceneIndex} attempt ${attempt} failed:`, lastError);

          // Don't retry on non-transient errors
          if (lastError.includes('No video generated') || lastError.includes('Insufficient credits')) {
            break;
          }
        }
      }

      if (lastError && !results.find((r) => r.sceneIndex === scene.sceneIndex)) {
        results.push({
          sceneIndex: scene.sceneIndex,
          error: lastError,
        });
      }
    }

    const succeeded = results.filter((r) => r.videoUrl).length;
    const failed = results.filter((r) => r.error).length;

    return NextResponse.json({
      success: succeeded > 0,
      results,
      summary: {
        total: targetScenes.length,
        succeeded,
        failed,
        creditsDeducted: creditCost,
      },
      // Surface per-scene errors so the client can display them
      ...(failed > 0 && {
        error: results
          .filter((r) => r.error)
          .map((r) => `Scene ${r.sceneIndex}: ${r.error}`)
          .join('; '),
      }),
    });
  } catch (error: any) {
    console.error('[generate-videos] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate videos' },
      { status: 500 },
    );
  }
}
