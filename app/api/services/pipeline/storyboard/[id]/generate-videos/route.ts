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
  type VideoProvider,
  type FalVideoModel,
} from '@/lib/pipeline/video-generation-service';
import {
  refineVideoPrompt,
  isLLMParserAvailable,
  type VideoPromptContext,
} from '@/lib/pipeline/llm-scene-parser';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute timeout for video generation

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
      videoModel?: FalVideoModel;
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

    // ─── Build motion prompts for all scenes (can be concurrent) ────
    console.log(`[generate-videos] Building prompts for ${targetScenes.length} scenes (LLM=${useLLMRefinement})`);
    const promptStart = Date.now();

    const scenesWithPrompts = await Promise.all(
      targetScenes.map(async (scene) => {
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
            console.log(`[generate-videos] Scene ${scene.sceneIndex}: VideoPromptMaster refined (${motionPrompt.length} chars)`);
          } catch (llmErr: any) {
            console.warn(`[generate-videos] Scene ${scene.sceneIndex}: LLM failed, using fallback:`, llmErr.message);
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

        return { scene, motionPrompt };
      }),
    );
    console.log(`[generate-videos] All prompts built in ${Date.now() - promptStart}ms`);

    // ─── Generate videos concurrently (2 at a time) ─────────────────
    const CONCURRENCY = 2;
    const queue = [...scenesWithPrompts];
    const running: Promise<void>[] = [];
    const results: Array<{
      sceneIndex: number;
      videoUrl?: string;
      assetId?: string;
      error?: string;
    }> = [];

    const processScene = async ({ scene, motionPrompt }: typeof scenesWithPrompts[number]) => {
      try {
        const result = await generateVideoClip(
          {
            imageUrl: scene.imageUrl!,
            motionPrompt,
            durationSeconds: Math.min(scene.descriptor.durationSeconds, 10),
            aspectRatio,
            provider,
            falVideoModel: videoModel,
          },
          userId,
        );

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
      } catch (err: any) {
        console.error(`[generate-videos] Scene ${scene.sceneIndex} failed:`, err.message);
        results.push({
          sceneIndex: scene.sceneIndex,
          error: err.message || 'Video generation failed',
        });
      }
    };

    while (queue.length > 0 || running.length > 0) {
      while (running.length < CONCURRENCY && queue.length > 0) {
        const item = queue.shift()!;
        const p = processScene(item).then(() => {
          running.splice(running.indexOf(p), 1);
        });
        running.push(p);
      }
      if (running.length > 0) {
        await Promise.race(running);
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
