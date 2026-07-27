import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStoryboard, updateStoryboardScene, updateStoryboardVoiceover } from '@/lib/pipeline/storyboard-db';
import { getCreditCost } from '@/lib/config/creditCosts';
import { generateVoiceover, isTTSAvailable, TTS_VOICES } from '@/lib/pipeline/tts-service';
import { CreditsService } from '@/lib/services/creditsService';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes — supports 60+ scenes with parallel TTS

type VoiceoverProvider = 'kokoro' | 'deepgram';

function getVoiceoverProvider(voice?: string): VoiceoverProvider {
  const voiceId = voice || 'kokoro-heart';
  const voiceConfig = TTS_VOICES.find((candidate) => candidate.id === voiceId);
  return voiceConfig?.provider || (voiceId.startsWith('kokoro-') ? 'kokoro' : 'deepgram');
}

function getBillableVoiceoverCharacterCount(
  scenes: Array<{ descriptor: { narration?: string | null } }>,
): number {
  const characterCount = scenes.reduce(
    (sum, scene) => sum + (scene.descriptor.narration?.trim().length || 0),
    0,
  );
  return Math.max(characterCount, 1);
}

async function refundVoiceoverCredits(userId: string, amount: number, reason: string): Promise<void> {
  if (amount <= 0) return;
  try {
    await CreditsService.refundCredits(userId, amount, reason, {
      service: 'pipeline',
      action: 'voiceover_generation',
    });
  } catch (refundErr: any) {
    console.error(`[Voiceover] Credit refund failed: ${refundErr.message}`);
  }
}
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
  let voiceoverCreditsDeducted = 0;
  let ttsWorkStarted = false;
  let creditUserId: string | null = null;

  try {
    const { userId } = await auth();
    creditUserId = userId || null;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isTTSAvailable()) {
      return NextResponse.json({ error: 'TTS service not configured' }, { status: 503 });
    }

    const { id } = await params;
    const body = await req.json();
    const { voice, language, contentType: bodyContentType } = body;
    const requestedSceneIndices = Array.isArray(body.sceneIndices)
      ? new Set(
        body.sceneIndices.filter(
          (value: unknown): value is number => Number.isInteger(value),
        ),
      )
      : null;

    const storyboard = await getStoryboard(id, userId);
    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    }

    // Determine contentType: body > global pacing > default
    let contentType = bodyContentType;
    if (!contentType && storyboard.globalEditDirections?.pacing) {
      const pacing = storyboard.globalEditDirections.pacing.toLowerCase();
      if (pacing.includes('fast') || pacing.includes('energy')) contentType = 'energetic';
      else if (pacing.includes('slow') || pacing.includes('building') || pacing.includes('dramatic')) contentType = 'dramatic';
      else if (pacing.includes('social')) contentType = 'social';
      else if (pacing.includes('conversation')) contentType = 'conversational';
    }
    // Default to 'narration' if still not set
    if (!contentType) contentType = 'narration';

    const scenesWithNarration = storyboard.scenes.filter(
      (s) => s.descriptor.narration?.trim()
        && (!requestedSceneIndices || requestedSceneIndices.has(s.sceneIndex)),
    );

    if (scenesWithNarration.length === 0) {
      return NextResponse.json({ error: 'No scenes have narration text' }, { status: 400 });
    }

    const voiceoverProvider = getVoiceoverProvider(voice);
    const billableCharacters = getBillableVoiceoverCharacterCount(scenesWithNarration);
    const requiredCredits = getCreditCost('pipeline', 'voiceover_generation', {
      characterCount: billableCharacters,
      requestType: voiceoverProvider,
    });

    const preCheck = await CreditsService.getBalance(userId);
    if (!preCheck || preCheck.totalCredits < requiredCredits) {
      return NextResponse.json(
        { error: 'Insufficient credits', required: requiredCredits, available: preCheck?.totalCredits || 0 },
        { status: 402 },
      );
    }

    const deductResult = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'voiceover_generation',
      { characterCount: billableCharacters, requestType: voiceoverProvider },
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { error: deductResult.error || 'Insufficient credits', required: requiredCredits },
        { status: 402 },
      );
    }
    voiceoverCreditsDeducted = deductResult.creditsDeducted;
    await updateStoryboardVoiceover(id, {
      voice: voice || 'aura-asteria-en',
      language: language || 'en',
      contentType,
      status: 'generating',
    });

    console.log(`[Voiceover] Generating for ${scenesWithNarration.length} scenes (parallel, batch=4, type=${contentType})`);

    // ─── Parallel TTS generation (batches of 4) ─────────────
    // F5.4: Reduced from 8 to 4 to avoid overwhelming TTS provider with 429s
    const BATCH_SIZE = 4;
    const results: Array<{ sceneIndex: number; audioUrl: string; durationMs: number }> = [];
    const errors: Array<{ sceneIndex: number; error: string }> = [];

    for (let i = 0; i < scenesWithNarration.length; i += BATCH_SIZE) {
      ttsWorkStarted = true;
      const batch = scenesWithNarration.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (scene) => {
          console.log(`[Voiceover] Scene ${scene.sceneIndex}: generating...`);
          const result = await generateVoiceover(
            scene.descriptor.narration,
            userId,
            { voice, language, contentType, mediaRole: 'voiceover' },
          );

          await updateStoryboardScene(id, scene.sceneIndex, {
            voiceover: {
              audioUrl: result.audioUrl,
              audioAssetId: result.audioAssetId,
              audioDurationMs: result.durationMs,
              gcsPath: result.gcsPath,
              r2Key: result.r2Key,
              audioRights: result.audioRights,
              generatedAudioReceipt: result.generatedAudioReceipt,
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
    if (creditUserId && voiceoverCreditsDeducted > 0 && !ttsWorkStarted) {
      await refundVoiceoverCredits(
        creditUserId,
        voiceoverCreditsDeducted,
        `voiceover failed before TTS work started: ${error.message}`,
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
