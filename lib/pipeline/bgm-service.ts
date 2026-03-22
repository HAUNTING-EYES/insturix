/**
 * Background Music Generation Service
 *
 * Uses fal.ai Stable Audio 2.5 to generate instrumental background music
 * for video scenes. Reuses the existing fal.ai client and API key.
 */

import { fal } from '@fal-ai/client';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { nanoid } from 'nanoid';

// Configure fal.ai client
// Configure fal.ai on every call — env vars may change between deployments
// and module-level caching was preventing new API keys from being picked up.
function ensureFalConfig() {
  const key = process.env.FAL_AI_API_KEY;
  if (!key) throw new Error('FAL_AI_API_KEY is not set');
  fal.config({ credentials: key });
}

interface BGMResult {
  audioUrl: string;
  gcsPath: string;
  audioAssetId: string;
  durationMs: number;
}

/**
 * Generate background music for the entire video.
 * For videos longer than 150s, generates the max 150s and lets the
 * timeline loop it. A future enhancement could generate multiple
 * segments with matching keys/tempo.
 *
 * @param prompt   - Mood/style description (e.g. "epic cinematic orchestral, intense action")
 * @param userId   - For GCS upload path
 * @param durationSec - Target duration in seconds (5-600). Capped at 150s per beatoven limit.
 */
export async function generateBackgroundMusic(
  prompt: string,
  userId: string,
  durationSec: number,
): Promise<BGMResult> {
  ensureFalConfig();

  // Beatoven supports 5-150 seconds per generation.
  // For longer videos, generate max length — timeline will loop the audio.
  const duration = Math.min(Math.max(durationSec, 5), 150);
  const assetId = `bgm_${nanoid(12)}`;

  console.log(`[BGM] Generating: prompt="${prompt.substring(0, 100)}", duration=${duration}s`);

  // beatoven/music-generation — verified on fal.ai (March 2026), $0.10/request
  // If this returns 404, the fal.ai account may not have billing enabled for beatoven models.
  let result: any;
  try {
    result = await fal.subscribe('beatoven/music-generation', {
      input: {
        prompt: `${prompt}, instrumental, background music for video`,
        duration,
        refinement: 100,
      },
      logs: false,
    });
  } catch (err: any) {
    const status = err?.status || err?.statusCode;
    if (status === 404) {
      console.error('[BGM] beatoven/music-generation returned 404. Check fal.ai billing: this model requires separate activation at https://fal.ai/models/beatoven/music-generation');
    }
    throw err;
  }

  // fal.ai subscribe returns { data, requestId }
  const data = (result as any).data || result;
  console.log('[BGM] fal.ai response keys:', Object.keys(data || {}), 'Full:', JSON.stringify(data).substring(0, 300));

  const audioUrl = data?.audio?.url          // beatoven format
    || data?.audio_file?.url                  // legacy format
    || data?.audio?.[0]?.url                  // array format
    || data?.output?.url                      // generic output
    || data?.url;                             // direct URL
  if (!audioUrl) {
    throw new Error('BGM generation returned no audio URL. Response: ' + JSON.stringify(data).substring(0, 300));
  }

  // Download and upload to GCS
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error('Failed to download generated music');
  const buffer = Buffer.from(await response.arrayBuffer());

  const filename = `${assetId}.mp3`;
  const uploadResult = await uploadToGCS(buffer, userId, filename, 'audio/mpeg');

  return {
    audioUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath,
    audioAssetId: assetId,
    durationMs: duration * 1000,
  };
}

/**
 * Build a music prompt from scene moods and audio descriptions.
 */
export function buildMusicPrompt(scenes: Array<{
  mood?: string;
  audioDescription?: string;
}>): string {
  const moods = new Set<string>();
  const descriptions: string[] = [];

  for (const scene of scenes) {
    if (scene.mood && scene.mood !== 'neutral') moods.add(scene.mood);
    if (scene.audioDescription) descriptions.push(scene.audioDescription);
  }

  const parts: string[] = [];
  if (moods.size > 0) parts.push([...moods].join(', '));
  if (descriptions.length > 0) parts.push(descriptions.slice(0, 3).join('; '));
  if (parts.length === 0) parts.push('cinematic ambient');

  return parts.join(', ');
}

/**
 * Check if BGM generation is available.
 */
export function isBGMAvailable(): boolean {
  return !!process.env.FAL_AI_API_KEY;
}
