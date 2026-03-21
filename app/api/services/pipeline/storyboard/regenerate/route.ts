/**
 * POST /api/services/pipeline/storyboard/regenerate
 *
 * Regenerate a single scene's storyboard image.
 * Credits: 2 per regeneration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { CreditsService } from '@/lib/services/creditsService';
import { regenerateWithContext } from '@/lib/pipeline/storyboard-interactive-service';

export const runtime = 'nodejs';
export const maxDuration = 120; // IP-adapter + img2img can be slow

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { storyboardId, sceneIndex, feedback, modelId } = body;

    if (!storyboardId || sceneIndex === undefined) {
      return NextResponse.json(
        { success: false, error: 'storyboardId and sceneIndex are required' },
        { status: 400 },
      );
    }

    // Deduct credits
    const deductResult = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'storyboard_image_regeneration',
    );

    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: deductResult.error || 'Insufficient credits' },
        { status: 402 },
      );
    }

    const scene = await regenerateWithContext(storyboardId, sceneIndex, userId, {
      feedback,
      modelId,
    });

    return NextResponse.json({
      success: true,
      scene: {
        sceneIndex: scene.sceneIndex,
        imageUrl: scene.imageUrl,
        status: scene.status,
        historyCount: scene.generationHistory.length,
      },
      creditsDeducted: 2,
    });
  } catch (error: any) {
    console.error('[storyboard/regenerate] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to regenerate scene' },
      { status: 500 },
    );
  }
}
