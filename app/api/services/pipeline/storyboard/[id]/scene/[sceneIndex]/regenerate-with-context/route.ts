import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { regenerateWithContext } from '@/lib/pipeline/storyboard-interactive-service';
import { CreditsService } from '@/lib/services/creditsService';

// 2026-04-09: Bumped from 60s → 300s after FUNCTION_INVOCATION_TIMEOUT on scene 2
// regeneration (proj_r8E_z9WVaBX9 follow-up test, log bom1::rl2r6-1775674225104).
// regenerateWithContext does TWO sequential fal.ai calls worst-case:
//   1. IP-adapter try (~30-60s if refs exist)
//   2. Fallback img2img (~30-60s if IP-adapter failed)
//   + image download + GCS upload + MongoDB writes
// Worst case: 60-120s. 60s limit was way too tight. Matching parent
// storyboard/generate route's 300s budget.
export const maxDuration = 300;

/**
 * POST /api/services/pipeline/storyboard/[id]/scene/[sceneIndex]/regenerate-with-context
 * Regenerate a scene using context-aware image-to-image.
 * Cost: 3 credits.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneIndex: string }> },
) {
  try {
    const { id, sceneIndex: sceneIndexStr } = await params;
    const sceneIndex = parseInt(sceneIndexStr, 10);
    const body = await req.json();
    const { feedback, modelId, referenceImageUrl } = body;

    // Auth: prefer Clerk session, fallback to userId in body (for internal tool calls)
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch {}
    if (!userId && body.userId) {
      userId = body.userId; // Internal call from AI tool
    }
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Deduct credits (3 for context-aware regeneration)
    const deductResult = await CreditsService.deductCredits(
      userId, 'pipeline', 'storyboard_context_regeneration',
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { error: 'Insufficient credits', required: 3 },
        { status: 402 },
      );
    }

    const scene = await regenerateWithContext(id, sceneIndex, userId, {
      feedback,
      modelId,
      referenceImageUrl,
    });

    return NextResponse.json({ success: true, scene });
  } catch (error: any) {
    console.error('[Scene Regenerate Context]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
