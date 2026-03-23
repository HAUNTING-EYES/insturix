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
  /** If provided, mirelo video-to-audio generates SFX synced to actual video */
  videoUrl?: string;
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
): Promise<SFXResult> {
  ensureFalConfig();

  // Beatoven sound-effect-generation supports 1-35 seconds.
  const duration = Math.min(Math.max(durationSec, 1), 35);
  const assetId = `sfx_${nanoid(12)}`;

  console.log(
    `[SFX] Generating: desc="${audioDescription.substring(0, 100)}", duration=${duration}s`,
  );

  // Try mirelo (video-to-audio) first if videoUrl provided — it generates
  // SFX synced to actual video content (way better than text-only beatoven).
  // Falls back to beatoven/sound-effect-generation for text-only SFX.
  let result: any;
  if (videoUrl) {
    try {
      console.log(`[SFX] Using mirelo video-to-audio for synced SFX, videoUrl=${videoUrl.substring(0, 80)}...`);
      // Mirelo requires: video_url (accessible URL), duration (1-10 integer), num_samples (2-8)
      const mireloInput: any = {
        video_url: videoUrl,
        text_prompt: audioDescription || undefined,
        duration: Math.min(Math.max(Math.round(duration), 1), 10),
        num_samples: 2,
      };
      console.log(`[SFX] mirelo input: duration=${mireloInput.duration}, prompt=${(mireloInput.text_prompt || '').substring(0, 60)}`);
      result = await fal.subscribe('mirelo-ai/sfx-v1.5/video-to-audio', {
        input: mireloInput,
        logs: true,
        pollInterval: 2000,
      });
      // mirelo returns { audio: [{url, file_name, content_type}] }
      const data = (result as any).data || result;
      const audioArr = data?.audio || data?.audio_files || data?.audios || [];
      if (audioArr.length > 0 && audioArr[0]?.url) {
        const audioUrl = audioArr[0].url;
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error('Failed to download mirelo SFX');
        const buffer = Buffer.from(await response.arrayBuffer());
        const filename = `${assetId}.wav`;
        const uploadResult = await uploadToGCS(buffer, userId, filename, 'audio/wav');
        return {
          audioUrl: uploadResult.signedUrl,
          gcsPath: uploadResult.gcsPath,
          audioAssetId: assetId,
          durationMs: duration * 1000,
        };
      }
      console.warn('[SFX] mirelo returned no audio, trying SFX library');
    } catch (mireloErr: any) {
      console.warn(`[SFX] mirelo failed (${mireloErr.message}), trying SFX library`);
    }
  }

  // Tier 2: SFX Library (Pixabay / Freesound) — deterministic, fast, royalty-free
  try {
    const { searchAndDownloadSFX, audioDescriptionToSearchQuery, isSFXLibraryAvailable } = await import('./sfx-library-service');
    if (isSFXLibraryAvailable()) {
      const searchQuery = audioDescriptionToSearchQuery(audioDescription);
      console.log(`[SFX] Trying SFX library: "${searchQuery}"`);
      const libResult = await searchAndDownloadSFX(searchQuery, userId, Math.round(duration));
      if (libResult) {
        console.log(`[SFX] Library hit (${libResult.source}): "${libResult.originalTitle}" → ${libResult.audioAssetId}`);
        return libResult;
      }
      console.warn('[SFX] Library returned no results, falling back to CassetteAI');
    }
  } catch (libErr: any) {
    console.warn(`[SFX] Library search failed (${libErr.message}), falling back to CassetteAI`);
  }

  // CassetteAI fallback — generates ambient/SFX audio from text prompt
  // $0.02/min, 10-180s, reliable (unlike beatoven which queues forever)
  try {
    result = await fal.subscribe('cassetteai/music-generator', {
      input: {
        prompt: `${audioDescription}, ambient sound effects, atmospheric audio, no vocals`,
        duration: Math.min(Math.max(Math.round(duration), 10), 180),
      },
      logs: true,
      pollInterval: 3000,
      onQueueUpdate: (update: any) => {
        console.log(`[SFX] CassetteAI queue: ${update?.status || 'unknown'}`);
      },
    });
  } catch (err: any) {
    console.error(`[SFX] CassetteAI failed: ${err.message}`);
    throw err;
  }

  // Extract audio URL
  const data = (result as any).data || result;
  console.log(
    '[SFX] fal.ai response keys:',
    Object.keys(data || {}),
  );

  const audioUrl =
    data?.audio_file?.url ||      // CassetteAI format
    data?.audio?.url ||           // standard format
    data?.audio?.[0]?.url ||      // array format
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
  return !!process.env.FAL_AI_API_KEY;
}
