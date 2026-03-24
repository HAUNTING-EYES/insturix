import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { regenerateWithContext } from '@/lib/pipeline/storyboard-interactive-service';
import { CreditsService } from '@/lib/services/creditsService';

export const maxDuration = 60;

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
