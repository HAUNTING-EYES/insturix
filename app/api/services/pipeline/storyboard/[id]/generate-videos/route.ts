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
} from '@/lib/pipeline/video-generation-service';

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
    }: {
      sceneIndices?: number[];
      provider?: VideoProvider;
      aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
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
      creditCost,
      { storyboardId, sceneCount: targetScenes.length },
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: deductResult.error || 'Insufficient credits', creditCost },
        { status: 402 },
      );
    }

    // Generate videos for each scene
    const results: Array<{
      sceneIndex: number;
      videoUrl?: string;
      assetId?: string;
      error?: string;
    }> = [];

    for (const scene of targetScenes) {
      try {
        const motionPrompt = buildMotionPrompt({
          visualDescription: scene.descriptor.visualDescription,
          narration: scene.descriptor.narration,
          cameraDirection: scene.descriptor.cameraDirection,
          mood: scene.descriptor.mood,
        });

        const result = await generateVideoClip(
          {
            imageUrl: scene.imageUrl!,
            motionPrompt,
            durationSeconds: Math.min(scene.descriptor.durationSeconds, 10),
            aspectRatio,
            provider,
          },
          userId,
        );

        // Update storyboard scene with video info
        await updateStoryboardScene(storyboardId, scene.sceneIndex, {
          videoAssetId: result.assetId,
          videoUrl: result.videoUrl,
          videoProvider: result.provider,
          videoDurationMs: result.durationMs,
        });

        results.push({
          sceneIndex: scene.sceneIndex,
          videoUrl: result.videoUrl,
          assetId: result.assetId,
        });
      } catch (err: any) {
        console.error(`[generate-videos] Scene ${scene.sceneIndex} failed:`, err);
        results.push({
          sceneIndex: scene.sceneIndex,
          error: err.message || 'Video generation failed',
        });
      }
    }

    const succeeded = results.filter((r) => r.videoUrl).length;
    const failed = results.filter((r) => r.error).length;

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: targetScenes.length,
        succeeded,
        failed,
        creditsDeducted: creditCost,
      },
    });
  } catch (error: any) {
    console.error('[generate-videos] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate videos' },
      { status: 500 },
    );
  }
}
