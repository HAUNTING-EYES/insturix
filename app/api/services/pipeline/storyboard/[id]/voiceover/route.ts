import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard, updateStoryboardScene, updateStoryboardVoiceover } from '@/lib/pipeline/storyboard-db';
import { generateVoiceover, isTTSAvailable } from '@/lib/pipeline/tts-service';
import { CreditsService } from '@/lib/services/creditsService';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes — supports 60+ scenes with parallel TTS

/**
 * POST /api/services/pipeline/storyboard/[id]/voiceover
 * Generate AI voiceover for all narrations in the storyboard.
 * Now runs in parallel batches (8 concurrent) for fast processing.
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

    const scenesWithNarration = storyboard.scenes.filter(
      (s) => s.descriptor.narration?.trim(),
    );

    if (scenesWithNarration.length === 0) {
      return NextResponse.json({ error: 'No scenes have narration text' }, { status: 400 });
    }

    // A1 FIX: Atomic credit deduction — single call for all scenes
    const deductResult = await CreditsService.deductCredits(
      userId, 'pipeline', 'voiceover_generation', { quantity: scenesWithNarration.length },
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { error: 'Insufficient credits', required: scenesWithNarration.length },
        { status: 402 },
      );
    }

    await updateStoryboardVoiceover(id, {
      voice: voice || 'aura-asteria-en',
      language: language || 'en',
      status: 'generating',
    });

    console.log(`[Voiceover] Generating for ${scenesWithNarration.length} scenes (parallel, batch=4)`);

    // ─── Parallel TTS generation (batches of 4) ─────────────
    // F5.4: Reduced from 8 to 4 to avoid overwhelming TTS provider with 429s
    const BATCH_SIZE = 4;
    const results: Array<{ sceneIndex: number; audioUrl: string; durationMs: number }> = [];
    const errors: Array<{ sceneIndex: number; error: string }> = [];

    for (let i = 0; i < scenesWithNarration.length; i += BATCH_SIZE) {
      const batch = scenesWithNarration.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (scene) => {
          console.log(`[Voiceover] Scene ${scene.sceneIndex}: generating...`);
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

          console.log(`[Voiceover] Scene ${scene.sceneIndex}: success (${result.durationMs}ms)`);
          return {
            sceneIndex: scene.sceneIndex,
            audioUrl: result.audioUrl,
            durationMs: result.durationMs,
          };
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const r = batchResults[j];
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          const sceneIndex = batch[j].sceneIndex;
          const errMsg = (r.reason as any)?.message || 'TTS failed';
          console.error(`[Voiceover] Scene ${sceneIndex} failed:`, errMsg);
          errors.push({ sceneIndex, error: errMsg });
        }
      }
    }

    // F5.5: Use 'partial' status when some scenes failed, not 'ready'
    const finalStatus = errors.length === 0 ? 'ready'
      : results.length > 0 ? 'partial'
      : 'error';
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
