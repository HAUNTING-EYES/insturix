import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateSceneSequential } from '@/lib/pipeline/storyboard-interactive-service';
import { CreditsService } from '@/lib/services/creditsService';

// 2026-04-09: Bumped from 60s → 300s. Sequential scene gen runs
// generateSceneSequential which does fal.ai image gen (~30-60s) + optional
// IP-adapter retry + consistency check + GCS upload. Worst case 60-120s.
// Matching parent storyboard/generate route's 300s budget.
export const maxDuration = 300;

/**
 * POST /api/services/pipeline/storyboard/[id]/generate-sequential
 * Generate a single scene in the sequential workflow.
 * Cost: 2 credits per scene.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { sceneIndex, modelId, aspectRatio } = body;

    if (sceneIndex === undefined) {
      return NextResponse.json({ error: 'sceneIndex is required' }, { status: 400 });
    }

    // Deduct 2 credits
    const deductResult = await CreditsService.deductCredits(
      userId, 'pipeline', 'storyboard_image_generation',
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { error: 'Insufficient credits', required: 2 },
        { status: 402 },
      );
    }

    const scene = await generateSceneSequential(id, sceneIndex, userId, {
      modelId,
      aspectRatio,
    });

    return NextResponse.json({ success: true, scene });
  } catch (error: any) {
    console.error('[Generate Sequential]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
