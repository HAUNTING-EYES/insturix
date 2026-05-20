/**
 * POST /api/services/editron/match-edit/generate-gap
 *
 * Step 2 of Match Edit: Generate AI video for a specific gap scene.
 * Called per-gap AFTER user reviews MatchPlan and confirms generation.
 *
 * Uses existing video generation pipeline (fal.ai) with the reference
 * scene's description + keyVisuals as the prompt.
 *
 * Cost: ~$0.60 per gap (1 fal.ai video gen call).
 * Credits deducted before generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const maxDuration = 180;

interface GenerateGapRequest {
  projectId: string;
  gapScene: {
    index: number;
    description: string;
    keyVisuals: string[];
    estimatedDurationSec: number;
  };
  aspectRatio?: string;
  videoModel?: string;
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: GenerateGapRequest = await request.json();
    const { projectId, gapScene, aspectRatio = '16:9', videoModel } = body;

    if (!projectId || !gapScene?.description) {
      return NextResponse.json({ success: false, error: 'projectId and gapScene.description required' }, { status: 400 });
    }

    console.log(`[match-edit/generate-gap] Gap scene ${gapScene.index}: "${gapScene.description.substring(0, 80)}"`);

    // Build video prompt from reference scene description + keyVisuals
    const videoPrompt = [
      gapScene.description,
      gapScene.keyVisuals.length > 0 ? `Key visuals: ${gapScene.keyVisuals.join(', ')}` : '',
      'cinematic, professional quality, smooth motion',
    ].filter(Boolean).join('. ');

    const durationSec = Math.min(Math.max(gapScene.estimatedDurationSec || 4, 2), 12);

    // Generate a storyboard image first (gap has no reference image)
    // Then use it for video generation. This keeps the same pipeline flow.
    let imageUrl = '';
    try {
      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: process.env.FAL_AI_API_KEY || '' });
      const imgResult = await fal.subscribe('fal-ai/flux/schnell', {
        input: { prompt: videoPrompt, image_size: 'landscape_16_9' },
      }) as any;
      imageUrl = imgResult?.data?.images?.[0]?.url || imgResult?.images?.[0]?.url || '';
    } catch {
      console.warn(`[match-edit/generate-gap] Storyboard image gen failed, attempting video-only`);
    }

    const { generateVideoClip } = await import('@/lib/pipeline/video-generation-service');

    const result = await generateVideoClip(
      {
        imageUrl: imageUrl || 'https://placehold.co/1920x1080/1a1a1a/666?text=Gap+Scene',
        motionPrompt: videoPrompt,
        durationSeconds: durationSec,
        aspectRatio: aspectRatio as '16:9' | '9:16' | '1:1',
        falVideoModel: (videoModel || 'kling-2.1') as any,
      },
      userId,
    );

    if (!result?.assetId) {
      return NextResponse.json({ success: false, error: 'Video generation returned no asset' }, { status: 500 });
    }

    const totalMs = Date.now() - startMs;
    console.log(`[match-edit/generate-gap] Gap ${gapScene.index} generated: ${result.assetId} (${totalMs}ms)`);

    return NextResponse.json({
      success: true,
      gapSceneIndex: gapScene.index,
      assetId: result.assetId,
      videoUrl: result.videoUrl,
      durationSec,
      generationTimeMs: totalMs,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[match-edit/generate-gap] Failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
