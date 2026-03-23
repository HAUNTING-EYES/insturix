/**
 * Background Music Generation Service
 *
 * Uses fal.ai MiniMax Music v2 to generate instrumental background music.
 * MiniMax is fast ($0.03/req) and doesn't queue forever like beatoven.
 */

import { fal } from '@fal-ai/client';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { nanoid } from 'nanoid';

// Configure fal.ai on every call — env vars may change between deployments
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
 *
 * Uses MiniMax Music v2 (fal-ai/minimax-music/v2) — fast, cheap ($0.03/req),
 * and doesn't sit in queue forever like beatoven.
 *
 * MiniMax generates complete songs with vocals. We prompt for instrumental only.
 * For videos longer than the generated clip, the timeline loops the audio.
 */
export async function generateBackgroundMusic(
  prompt: string,
  userId: string,
  durationSec: number,
): Promise<BGMResult> {
  ensureFalConfig();

  const assetId = `bgm_${nanoid(12)}`;

  // Build a music-specific prompt (instrumental, no vocals for BGM)
  const musicPrompt = `${prompt}, instrumental only, no vocals, background music for video`.substring(0, 300);

  console.log(`[BGM] Generating with MiniMax Music v2: prompt="${musicPrompt.substring(0, 100)}", targetDuration=${durationSec}s`);

  let result: any;
  try {
    // MiniMax Music v2 requires BOTH prompt AND lyrics_prompt (min 10 chars each).
    // For instrumental BGM, we use structural tags with la-la placeholder vocals.
    // Pure structural tags like [Instrumental] alone may cause 422.
    result = await fal.subscribe('fal-ai/minimax-music/v2', {
      input: {
        prompt: musicPrompt,
        lyrics_prompt: '[Intro]\nLa la la la la la\n[Verse]\nDa da da dum da da da dum\n[Chorus]\nLa la la la la la\n[Outro]\nMmm mmm mmm',
      },
      logs: true,
      pollInterval: 3000,
      onQueueUpdate: (update: any) => {
        console.log(`[BGM] MiniMax queue: ${update?.status || 'unknown'}`);
      },
    });
  } catch (err: any) {
    console.error(`[BGM] MiniMax Music v2 failed: ${err.message}`);
    // Fallback to beatoven if MiniMax fails
    console.log('[BGM] Falling back to beatoven/music-generation...');
    try {
      result = await fal.subscribe('beatoven/music-generation', {
        input: {
          prompt: `${prompt}, instrumental, background music for video`,
          duration: Math.min(Math.max(durationSec, 5), 150),
          refinement: 100,
        },
        logs: true,
        pollInterval: 2000,
      });
    } catch (fallbackErr: any) {
      console.error(`[BGM] Beatoven fallback also failed: ${fallbackErr.message}`);
      throw fallbackErr;
    }
  }

  // Extract audio URL — handle multiple response formats
  const data = (result as any).data || result;
  console.log('[BGM] Response keys:', Object.keys(data || {}));

  const audioUrl =
    data?.audio?.url              // standard format
    || data?.audio_file?.url      // legacy
    || data?.audio?.[0]?.url      // array format
    || data?.output?.url          // generic
    || data?.url                  // direct
    || data?.audio_url;           // minimax format

  if (!audioUrl) {
    throw new Error('BGM generation returned no audio URL. Response: ' + JSON.stringify(data).substring(0, 500));
  }

  console.log(`[BGM] Got audio URL, downloading...`);

  // Download and upload to GCS
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error(`Failed to download generated music (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const filename = `${assetId}.mp3`;
  const uploadResult = await uploadToGCS(buffer, userId, filename, 'audio/mpeg');

  console.log(`[BGM] Uploaded to GCS: ${uploadResult.gcsPath} (${buffer.length} bytes)`);

  return {
    audioUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath,
    audioAssetId: assetId,
    durationMs: durationSec * 1000, // Approximate — actual may differ
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
