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
let _falConfigured = false;
function ensureFalConfig() {
  if (_falConfigured) return;
  const key = process.env.FAL_AI_API_KEY;
  if (!key) throw new Error('FAL_AI_API_KEY is not set');
  fal.config({ credentials: key });
  _falConfigured = true;
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
 * @param prompt   - Mood/style description (e.g. "epic cinematic orchestral, intense action")
 * @param userId   - For GCS upload path
 * @param durationSec - Target duration in seconds (5-240)
 */
export async function generateBackgroundMusic(
  prompt: string,
  userId: string,
  durationSec: number,
): Promise<BGMResult> {
  ensureFalConfig();

  const duration = Math.min(Math.max(durationSec, 5), 240);
  const assetId = `bgm_${nanoid(12)}`;

  const result = await fal.subscribe('fal-ai/stable-audio/v2.5', {
    input: {
      prompt: `${prompt}, instrumental, background music for video`,
      seconds_total: duration,
      steps: 100,
    },
  });

  // fal.ai subscribe returns { data, requestId }
  // Stable Audio response shape varies — try all known paths
  const data = (result as any).data || result;
  console.log('[BGM] fal.ai response keys:', Object.keys(data || {}), 'Full:', JSON.stringify(data).substring(0, 300));

  const audioUrl = data?.audio_file?.url    // fal-ai/stable-audio format
    || data?.audio?.url                      // alternative format
    || data?.audio?.[0]?.url                 // array format
    || data?.output?.url                     // generic output
    || data?.url;                            // direct URL
  if (!audioUrl) {
    throw new Error('Stable Audio returned no audio URL. Response: ' + JSON.stringify(data).substring(0, 300));
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
