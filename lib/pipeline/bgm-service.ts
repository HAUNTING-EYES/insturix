/**
 * Background Music Generation Service
 *
 * Uses fal.ai MiniMax Music v2 to generate instrumental background music.
 * MiniMax is fast ($0.03/req) and doesn't queue forever like beatoven.
 */

import { fal } from '@fal-ai/client';
import { uploadMedia } from '@/lib/editron/services/upload-service';
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
  // Primary: CassetteAI — simple prompt+duration, no lyrics needed, $0.02/min
  try {
    result = await fal.subscribe('cassetteai/music-generator', {
      input: {
        prompt: musicPrompt,
        duration: Math.round(Math.min(Math.max(durationSec, 10), 180)), // CassetteAI: integer 10-180s
      },
      logs: true,
      pollInterval: 3000,
      onQueueUpdate: (update: any) => {
        console.log(`[BGM] CassetteAI queue: ${update?.status || 'unknown'}`);
      },
    });
  } catch (err: any) {
    console.error(`[BGM] CassetteAI failed: ${err.message}`);
    throw new Error(`BGM generation failed: ${err.message}`);
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
  const uploadResult = await uploadMedia(buffer, userId, filename, 'audio/mpeg', { customAssetId: assetId });

  console.log(`[BGM] Uploaded: ${uploadResult.assetId} (${buffer.length} bytes)`);

  return {
    audioUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath!,
    audioAssetId: uploadResult.assetId,
    durationMs: durationSec * 1000, // Approximate — actual may differ
  };
}

/**
 * Build a music prompt from scene moods and audio descriptions.
 * If ThinkForge provided per-scene music direction, uses it as an energy arc.
 * Otherwise, infers from moods and pacing.
 */
export function buildMusicPrompt(
  scenes: Array<{
    mood?: string;
    musicDescription?: string;
    audioDescription?: string; // @deprecated — fallback for old projects
    editDirections?: { pacing?: string };
    narration?: string;
  }>,
  totalDurationSeconds?: number,
): string {
  // Prefer musicDescription (new, music-only), fall back to audioDescription (old, mixed)
  const musicDescriptions = scenes.map(s => s.musicDescription || s.audioDescription).filter(Boolean) as string[];
  const moods = [...new Set(scenes.map(s => s.mood).filter(Boolean))] as string[];
  const hasFast = scenes.some(s => s.editDirections?.pacing === 'fast');
  const hasVO = scenes.some(s => (s.narration?.length || 0) > 0);
  const duration = totalDurationSeconds || scenes.length * 5;

  // If ThinkForge provided detailed per-scene music direction, use it as energy arc
  if (musicDescriptions.length > 0) {
    return [
      `Per-scene energy arc: ${musicDescriptions.join(' → ')}`,
      `${duration} seconds`,
      'instrumental only, no vocals, no lyrics, no humming',
      hasVO ? 'leave mid-range clear for speech' : 'full-range mix OK',
      'clean production, gentle fade-out in final 3 seconds',
    ].join(', ');
  }

  // Fallback: infer from moods and pacing
  return [
    moods.length > 0 ? `${moods.join(' and ')} mood` : 'cinematic ambient',
    `${duration} seconds`,
    `energy: ${scenes.length > 4 ? 'builds to peak at 70% then resolves' : 'steady'}`,
    hasFast ? 'tempo 120-140 BPM, driving rhythm' : 'tempo 80-100 BPM, relaxed',
    'instrumental only, no vocals, no lyrics, no humming',
    hasVO ? 'leave mid-range clear for speech' : 'full-range mix OK',
    'clean production, gentle fade-out in final 3 seconds',
  ].join(', ');
}

/**
 * Check if BGM generation is available.
 */
export function isBGMAvailable(): boolean {
  return !!process.env.FAL_AI_API_KEY;
}
