import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard, updateStoryboardScene, updateStoryboardVoiceover } from '@/lib/pipeline/storyboard-db';
import { generateVoiceover, isTTSAvailable } from '@/lib/pipeline/tts-service';
import { CreditsService } from '@/lib/services/creditsService';

export const maxDuration = 120;

/**
 * POST /api/services/pipeline/storyboard/[id]/voiceover
 * Generate AI voiceover for all narrations in the storyboard.
 * Cost: 1 credit per scene with narration.
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

    if (!isTTSAvailable()) {
      return NextResponse.json({ error: 'TTS service not configured' }, { status: 503 });
    }

    const { id } = await params;
    const body = await req.json();
    const { voice, language } = body;

    const storyboard = await getStoryboard(id, userId);
    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    }

    // Count scenes with narration
    const scenesWithNarration = storyboard.scenes.filter(
      (s) => s.descriptor.narration?.trim(),
    );

    if (scenesWithNarration.length === 0) {
      return NextResponse.json({ error: 'No scenes have narration text' }, { status: 400 });
    }

    // Deduct credits upfront (1 per scene)
    for (let i = 0; i < scenesWithNarration.length; i++) {
      const deductResult = await CreditsService.deductCredits(
        userId, 'pipeline', 'voiceover_generation',
      );
      if (!deductResult.success) {
        return NextResponse.json(
          { error: 'Insufficient credits', required: scenesWithNarration.length, charged: i },
          { status: 402 },
        );
      }
    }

    // Update voiceover status
    await updateStoryboardVoiceover(id, {
      voice: voice || 'aura-asteria-en',
      language: language || 'en',
      status: 'generating',
    });

    // Generate voiceover for each scene
    const results: Array<{ sceneIndex: number; audioUrl: string; durationMs: number }> = [];

    for (const scene of scenesWithNarration) {
      try {
        const result = await generateVoiceover(
          scene.descriptor.narration,
          userId,
          { voice, language },
        );

        await updateStoryboardScene(id, scene.sceneIndex, {
          voiceover: {
            audioUrl: result.audioUrl,
            audioAssetId: result.audioAssetId,
            audioDurationMs: result.durationMs,
            gcsPath: result.gcsPath,
          },
        });

        results.push({
          sceneIndex: scene.sceneIndex,
          audioUrl: result.audioUrl,
          durationMs: result.durationMs,
        });
      } catch (err) {
        console.error(`[Voiceover] Scene ${scene.sceneIndex} failed:`, err);
        // Continue with remaining scenes
      }
    }

    // Update final status
    await updateStoryboardVoiceover(id, {
      status: results.length === scenesWithNarration.length ? 'ready' : 'error',
    });

    return NextResponse.json({
      success: true,
      scenesProcessed: results.length,
      totalScenes: scenesWithNarration.length,
      results,
    });
  } catch (error: any) {
    console.error('[Voiceover]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
