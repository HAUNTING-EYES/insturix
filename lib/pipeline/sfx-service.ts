/**
 * Sound Effects (SFX) Generation Service
 *
 * Uses the same fal.ai Stable Audio 2.5 model as the BGM service (and Musitron)
 * to generate per-scene sound effects from audioDescription prompts.
 *
 * Each scene with an audioDescription gets a short SFX clip that matches
 * the scene duration, uploaded to GCS and returned as an overlay-ready asset.
 */

import { fal } from '@fal-ai/client';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { nanoid } from 'nanoid';

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
  gcsPath: string;
  audioAssetId: string;
  durationMs: number;
}

export interface SFXSceneInput {
  sceneIndex: number;
  audioDescription: string;
  durationSeconds: number;
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
): Promise<SFXResult> {
  ensureFalConfig();

  // Beatoven sound-effect-generation supports 1-35 seconds.
  const duration = Math.min(Math.max(durationSec, 1), 35);
  const assetId = `sfx_${nanoid(12)}`;

  console.log(
    `[SFX] Generating: desc="${audioDescription.substring(0, 100)}", duration=${duration}s`,
  );

  // beatoven/sound-effect-generation — verified on fal.ai (March 2026)
  // If this returns 404, the fal.ai account may not have billing enabled for beatoven models.
  let result: any;
  try {
    result = await fal.subscribe('beatoven/sound-effect-generation', {
      input: {
        prompt: `${audioDescription}, sound effects, ambient audio, no music, no vocals`,
        duration,
        refinement: 40,
      },
      logs: true,
      pollInterval: 2000,
      onQueueUpdate: (update: any) => {
        console.log(`[SFX] Queue status: ${update?.status || 'unknown'}, position: ${update?.position ?? '?'}`);
      },
    });
  } catch (err: any) {
    const status = err?.status || err?.statusCode;
    if (status === 404) {
      console.error('[SFX] beatoven/sound-effect-generation returned 404. Check fal.ai billing: this model requires separate activation at https://fal.ai/models/beatoven/sound-effect-generation');
    }
    throw err;
  }

  // Extract audio URL
  const data = (result as any).data || result;
  console.log(
    '[SFX] fal.ai response keys:',
    Object.keys(data || {}),
  );

  const audioUrl =
    data?.audio?.url ||           // beatoven format
    data?.audio_file?.url ||      // legacy format
    data?.audio?.[0]?.url ||
    data?.output?.url ||
    data?.url;

  if (!audioUrl) {
    throw new Error(
      'SFX generation returned no audio URL. Response: ' +
        JSON.stringify(data).substring(0, 300),
    );
  }

  // Download the generated clip
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error('Failed to download generated SFX');
  const buffer = Buffer.from(await response.arrayBuffer());

  // Upload to GCS under the user's path
  const filename = `${assetId}.mp3`;
  const uploadResult = await uploadToGCS(buffer, userId, filename, 'audio/mpeg');

  return {
    audioUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath,
    audioAssetId: assetId,
    durationMs: duration * 1000,
  };
}

// ─── Batch Generation ───────────────────────────────────────────

/**
 * Generate SFX clips for every scene that has an audioDescription.
 *
 * Runs all generations in parallel (Promise.allSettled) so one failure
 * doesn't block the rest. Returns a map of sceneIndex → SFXResult.
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
  return !!process.env.FAL_AI_API_KEY;
}
