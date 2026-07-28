/**
 * Sound Effects (SFX) Generation Service
 *
 * Uses a rights-cleared library first, then purpose-built fal.ai sound models
 * to generate per-scene sound effects from audioDescription prompts.
 *
 * Each scene with an audioDescription gets a short SFX clip that matches
 * the scene duration, uploaded to GCS and returned as an overlay-ready asset.
 */

import { fal } from '@fal-ai/client';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import { isSFXLibraryAvailable } from '@/lib/pipeline/sfx-library-service';
import {
  assertCassetteSfxWav,
  buildCassetteSfxRequest,
  CASSETTE_SFX_LICENSE_ID,
  extractCassetteSfxAudioUrl,
} from '@/lib/pipeline/cassette-sfx-provider';
import { nanoid } from 'nanoid';
import { recordProviderCostEvent, type ProviderCostEventStatus } from '@/lib/financials/provider-cost-events';

// ─── Configuration ──────────────────────────────────────────────

// Configure fal.ai on every call — no module-level caching
function ensureFalConfig() {
  const key = process.env.FAL_AI_API_KEY;
  if (!key) throw new Error('FAL_AI_API_KEY is not set');
  fal.config({ credentials: key });
}

// ─── Types ──────────────────────────────────────────────────────

export interface SFXResult {
  audioUrl: string;
  gcsPath: string | null;
  audioAssetId: string;
  durationMs: number;
  audioRights: AudioRightsContract;
}

export interface SFXSceneInput {
  sceneIndex: number;
  audioDescription: string;
  durationSeconds: number;
  /** If provided, mirelo video-to-audio generates SFX synced to actual video */
  videoUrl?: string;
}

async function recordPipelineSFXProviderCost(input: {
  status: ProviderCostEventStatus;
  userId: string;
  providerBranch: 'mirelo_video_to_audio' | 'cassetteai_fallback';
  model: string;
  durationSec: number;
  bytesOut?: number;
  functionMs?: number;
  error?: unknown;
}): Promise<void> {
  await recordProviderCostEvent({
    eventId: `pce_pipeline_sfx_${input.userId}_${input.providerBranch}_${nanoid(10)}_${input.status}`,
    status: input.status,
    userId: input.userId,
    service: 'pipeline',
    action: 'sfx_generation',
    provider: 'fal-ai',
    model: input.model,
    operation: 'sfx_generation',
    units: {
      mediaSeconds: input.durationSec,
      bytesOut: input.bytesOut,
      requestCount: 1,
      functionMs: input.functionMs,
    },
    metadata: {
      providerBranch: input.providerBranch,
      requestedDurationSeconds: input.durationSec,
      errorClass: input.error instanceof Error ? input.error.name : undefined,
    },
  });
}
// ─── Core Generation ────────────────────────────────────────────

/**
 * Generate a sound-effects clip for a single scene.
 *
 * @param audioDescription - Natural-language SFX description
 *   (e.g. "gentle waves crashing, distant seagulls, soft wind")
 * @param userId         - For GCS upload path scoping
 * @param durationSec    - Target clip length in seconds (clamped to 5-47s
 *                         — Stable Audio max is 47s per clip)
 */
export async function generateSFX(
  audioDescription: string,
  userId: string,
  durationSec: number,
  videoUrl?: string,
  /** Explicit SFX cue from script editDirections (e.g., "chalk dust puff, fabric rustle") */
  sfxCue?: string,
): Promise<SFXResult> {
  // Beatoven sound-effect-generation supports 1-35 seconds.
  const duration = Math.min(Math.max(durationSec, 1), 35);
  const assetId = `sfx_${nanoid(12)}`;

  // Fix 20: Three-layer SFX prompt - ambient bed + spot effects in a single clip.
  // Feature SFX (whooshes, impacts) are handled separately by transition-sfx-placer.
  // The sfxDescription from the parser already categorizes into:
  //   "Ambient bed: X. Spot SFX: Y. Feature SFX: Z."
  // We include ambient + spot in the prompt so the AI generates a rich layered mix.
  const sfxPrompt = sfxCue || audioDescription;

  console.log(
    `[SFX] Generating: hasExplicitCue=${Boolean(sfxCue)}, descChars=${audioDescription.length}, duration=${duration}s`,
  );

  // Priority 1: SFX Library (Pixabay/Freesound).
  // Instant, free, royalty-free. Best for deterministic SFX.
  try {
    const { searchAndDownloadSFX, audioDescriptionToSearchQuery } = await import('./sfx-library-service');
    if (isSFXLibraryAvailable()) {
      const searchQuery = audioDescriptionToSearchQuery(sfxPrompt);
      console.log('[SFX] Searching free SFX library');
      const libResult = await searchAndDownloadSFX(searchQuery, userId, Math.round(duration));
      if (libResult) {
        console.log(`[SFX] Library hit (${libResult.source})`);
        return libResult;
      }
      console.log('[SFX] Library: no match, trying AI generation');
    }
  } catch (libErr: any) {
    console.warn(`[SFX] Library search failed: ${libErr.message}`);
  }

  if (!process.env.FAL_AI_API_KEY?.trim()) {
    throw new Error('SFX unavailable: no acceptable library asset and FAL_AI_API_KEY is not configured');
  }
  ensureFalConfig();

  // Priority 2: mirelo video-to-audio (if video URL available).
  // AI-generated SFX synced to actual video content.
  let result: any;
  if (videoUrl) {
    const mireloModel = 'mirelo-ai/sfx-v1.5/video-to-audio';
    const mireloStartMs = Date.now();
    const mireloDuration = Math.min(Math.max(Math.round(duration), 1), 10);
    try {
      console.log('[SFX] Using mirelo video-to-audio for synced SFX');
      const mireloInput: any = {
        video_url: videoUrl,
        text_prompt: `${sfxPrompt}. Clean recording, minimal reverb, suitable for mixing under dialogue. Primary sound source only.` || undefined,
        duration: mireloDuration,
        num_samples: 2,
      };
      console.log(`[SFX] mirelo input: duration=${mireloInput.duration}, promptChars=${String(mireloInput.text_prompt || '').length}`);
      result = await fal.subscribe(mireloModel, {
        input: mireloInput,
        logs: true,
        pollInterval: 2000,
      });
      const data = (result as any).data || result;
      const audioArr = data?.audio || data?.audio_files || data?.audios || [];
      if (audioArr.length > 0 && audioArr[0]?.url) {
        const audioUrl = audioArr[0].url;
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error('Failed to download mirelo SFX');
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 12) throw new Error('mirelo audio too small, likely corrupted');
        const isValidAudio = (buffer[0] === 0x52 && buffer[1] === 0x49) ||
                             (buffer[0] === 0x49 && buffer[1] === 0x44) ||
                             (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) ||
                             (buffer[0] === 0x4F && buffer[1] === 0x67);
        if (!isValidAudio) {
          console.error(`[SFX] mirelo returned invalid audio. First bytes: ${buffer.slice(0, 8).toString('hex')}`);
          throw new Error('mirelo returned invalid audio format');
        }
        const filename = `${assetId}.wav`;
        const uploadResult = await uploadMedia(buffer, userId, filename, 'audio/wav', { customAssetId: assetId });
        await recordPipelineSFXProviderCost({
          status: 'success',
          userId,
          providerBranch: 'mirelo_video_to_audio',
          model: mireloModel,
          durationSec: mireloDuration,
          bytesOut: buffer.length,
          functionMs: Date.now() - mireloStartMs,
        });
        return {
          audioUrl: uploadResult.signedUrl,
          gcsPath: uploadResult.gcsPath ?? null,
          audioAssetId: uploadResult.assetId,
          durationMs: duration * 1000,
          audioRights: generatedSfxRights(uploadResult.assetId, mireloModel),
        };
      }
      const noAudioError = new Error('mirelo returned no audio');
      await recordPipelineSFXProviderCost({
        status: 'failed',
        userId,
        providerBranch: 'mirelo_video_to_audio',
        model: mireloModel,
        durationSec: mireloDuration,
        functionMs: Date.now() - mireloStartMs,
        error: noAudioError,
      });
      console.warn('[SFX] mirelo returned no audio, trying SFX library');
    } catch (mireloErr: any) {
      console.warn(`[SFX] mirelo failed (${mireloErr.message}), trying SFX library`);
      await recordPipelineSFXProviderCost({
        status: 'failed',
        userId,
        providerBranch: 'mirelo_video_to_audio',
        model: mireloModel,
        durationSec: mireloDuration,
        functionMs: Date.now() - mireloStartMs,
        error: mireloErr,
      });
    }
  }

  // Priority 3: CassetteAI's purpose-built sound-effects model.
  const cassetteRequest = buildCassetteSfxRequest(
    layeredCassettePrompt(audioDescription),
    duration,
  );
  const cassetteModel = cassetteRequest.model;
  const cassetteDuration = cassetteRequest.input.duration;
  const cassetteStartMs = Date.now();
  try {
    result = await fal.subscribe(cassetteModel, {
      input: cassetteRequest.input,
      logs: true,
      pollInterval: 3000,
      onQueueUpdate: (update: any) => {
        console.log(`[SFX] CassetteAI queue: ${update?.status || 'unknown'}`);
      },
    });
  } catch (err: any) {
    console.error(`[SFX] CassetteAI failed: ${err.message}`);
    await recordPipelineSFXProviderCost({
      status: 'failed',
      userId,
      providerBranch: 'cassetteai_fallback',
      model: cassetteModel,
      durationSec: cassetteDuration,
      functionMs: Date.now() - cassetteStartMs,
      error: err,
    });
    throw err;
  }

  try {
    const data = (result as any).data || result;
    console.log('[SFX] fal.ai response keys:', Object.keys(data || {}));

    const audioUrl = extractCassetteSfxAudioUrl(result);

    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error('Failed to download generated SFX');
    const buffer = Buffer.from(await response.arrayBuffer());
    assertCassetteSfxWav(buffer);
    const uploadResult = await uploadMedia(
      buffer,
      userId,
      `${assetId}.wav`,
      'audio/wav',
      { customAssetId: assetId },
    );
    await recordPipelineSFXProviderCost({
      status: 'success',
      userId,
      providerBranch: 'cassetteai_fallback',
      model: cassetteModel,
      durationSec: cassetteDuration,
      bytesOut: buffer.length,
      functionMs: Date.now() - cassetteStartMs,
    });

    return {
      audioUrl: uploadResult.signedUrl,
      gcsPath: uploadResult.gcsPath ?? null,
      audioAssetId: uploadResult.assetId,
      durationMs: cassetteDuration * 1000,
      audioRights: generatedSfxRights(
        uploadResult.assetId,
        CASSETTE_SFX_LICENSE_ID,
      ),
    };
  } catch (err) {
    await recordPipelineSFXProviderCost({
      status: 'failed',
      userId,
      providerBranch: 'cassetteai_fallback',
      model: cassetteModel,
      durationSec: cassetteDuration,
      functionMs: Date.now() - cassetteStartMs,
      error: err,
    });
    throw err;
  }
}

/**
 * Generate SFX clips for every scene that has an audioDescription.
 *
 * Runs all generations in parallel (Promise.allSettled) so one failure
 * doesn't block the rest. Returns a map of sceneIndex -> SFXResult.
 */
export async function generateSFXForScenes(
  scenes: SFXSceneInput[],
  userId: string,
): Promise<Map<number, SFXResult>> {
  const results = new Map<number, SFXResult>();

  if (scenes.length === 0) return results;

  console.log(`[SFX] Generating SFX for ${scenes.length} scene(s)`);

  const settled = await Promise.allSettled(
    scenes.map(async (scene) => {
      const sfx = await generateSFX(
        scene.audioDescription,
        userId,
        scene.durationSeconds,
        scene.videoUrl,
      );
      return { sceneIndex: scene.sceneIndex, sfx };
    }),
  );

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.set(outcome.value.sceneIndex, outcome.value.sfx);
    } else {
      console.error('[SFX] Scene generation failed:', outcome.reason);
    }
  }

  console.log(`[SFX] Successfully generated ${results.size}/${scenes.length} SFX clips`);
  return results;
}

/**
 * Check if SFX generation is available (same key as BGM).
 */
export function isSFXAvailable(): boolean {
  return isSFXLibraryAvailable() || Boolean(process.env.FAL_AI_API_KEY?.trim());
}

function generatedSfxRights(assetId: string, modelOrLicenseId: string): AudioRightsContract {
  const licenseId = modelOrLicenseId.startsWith('fal-ai:')
    ? modelOrLicenseId
    : `fal-ai:${modelOrLicenseId}:commercial-use`;
  return {
    mediaRole: 'sfx',
    source: 'generated',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'generated-provider',
      sourceAssetId: assetId,
      licenseId,
    },
  };
}

function layeredCassettePrompt(audioDescription: string): string {
  return [
    audioDescription,
    'layered audio design: continuous ambient bed underneath',
    'with spot sound effects at natural moments on top',
    'atmospheric, immersive, clean recording, no vocals, no music',
  ].join(', ');
}
