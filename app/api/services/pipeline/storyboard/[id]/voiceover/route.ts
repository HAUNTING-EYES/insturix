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
    const errors: Array<{ sceneIndex: number; error: string }> = [];

    for (const scene of scenesWithNarration) {
      try {
        console.log(`[Voiceover] Scene ${scene.sceneIndex}: generating for "${scene.descriptor.narration.substring(0, 60)}..."`);
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
        console.log(`[Voiceover] Scene ${scene.sceneIndex}: success (${result.durationMs}ms, ${result.audioAssetId})`);
      } catch (err: any) {
        const errMsg = err.message || 'Unknown TTS error';
        console.error(`[Voiceover] Scene ${scene.sceneIndex} failed:`, errMsg);
        errors.push({ sceneIndex: scene.sceneIndex, error: errMsg });
        // Continue with remaining scenes
      }
    }

    // Update final status
    const finalStatus = results.length === scenesWithNarration.length ? 'ready' : results.length > 0 ? 'ready' : 'error';
    await updateStoryboardVoiceover(id, { status: finalStatus });

    return NextResponse.json({
      success: results.length > 0,
      scenesProcessed: results.length,
      totalScenes: scenesWithNarration.length,
      results,
      ...(errors.length > 0 && {
        errors,
        error: errors.map(e => `Scene ${e.sceneIndex}: ${e.error}`).join('; '),
      }),
    });
  } catch (error: any) {
    console.error('[Voiceover]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
