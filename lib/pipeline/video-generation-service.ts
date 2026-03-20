/**
 * Video Generation Service
 *
 * Generates short video clips from storyboard images using AI video models.
 * Supports fal.ai (Kling, Runway, etc.) and Kie AI providers.
 *
 * Each scene's storyboard image is animated into a short video clip that
 * replaces the static image on the Editron timeline.
 */

import { fal } from '@fal-ai/client';
import { nanoid } from 'nanoid';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';

// Configure fal.ai if key exists
let _falConfigured = false;
function ensureFalConfig() {
  if (!_falConfigured && process.env.FAL_AI_API_KEY) {
    fal.config({ credentials: process.env.FAL_AI_API_KEY });
    _falConfigured = true;
  }
}

// ─── Timeout wrapper (same pattern as storyboard-service) ────────
const FAL_VIDEO_TIMEOUT_MS = 180_000; // 3 minutes — video models are slow

async function falSubscribeWithTimeout(
  modelId: string,
  options: any,
  timeoutMs: number = FAL_VIDEO_TIMEOUT_MS,
): Promise<any> {
  const timeout = setTimeout(() => {}, timeoutMs);
  try {
    const result = await Promise.race([
      fal.subscribe(modelId, options),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`fal.ai video call timed out after ${timeoutMs / 1000}s (model: ${modelId})`)),
          timeoutMs,
        ),
      ),
    ]);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convert a GCS signed URL (or any URL with query params) into a clean
 * publicly-accessible CDN URL by re-uploading to fal.ai storage.
 * This is needed because some models reject URLs with query parameters.
 */
async function getCleanImageUrl(imageUrl: string): Promise<string> {
  // If URL has no query params, it's already clean
  if (!imageUrl.includes('?')) return imageUrl;

  ensureFalConfig();

  try {
    // Download from GCS signed URL
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to download image for re-upload: ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], `storyboard_${nanoid(8)}.png`, { type: 'image/png' });

    // Upload to fal.ai CDN — returns a clean URL
    const cdnUrl = await fal.storage.upload(file);
    console.log(`[VideoGen] Re-uploaded to CDN: ${cdnUrl.substring(0, 80)}...`);
    return cdnUrl;
  } catch (err: any) {
    console.error(`[VideoGen] getCleanImageUrl failed: ${err.message}. Trying original URL as fallback.`);
    // Strip query params as last resort — some models handle bare URLs
    return imageUrl.split('?')[0];
  }
}

// ─── Models ─────────────────────────────────────────────────────

// fal.ai models for image-to-video
export const FAL_VIDEO_MODELS = {
  'kling-1.6': 'fal-ai/kling-video/v1.6/pro/image-to-video',
  'kling-1.5': 'fal-ai/kling-video/v1.5/pro/image-to-video',
  minimax: 'fal-ai/minimax-video/image-to-video',
  'runway-gen3': 'fal-ai/runway-gen3/turbo/image-to-video',
  'luma-ray2': 'fal-ai/luma-dream-machine/ray-2/image-to-video',
} as const;

export type FalVideoModel = keyof typeof FAL_VIDEO_MODELS;

// Human-readable labels for video models
export const FAL_VIDEO_MODEL_LABELS: Record<FalVideoModel, string> = {
  'kling-1.6': 'Kling 1.6 Pro',
  'kling-1.5': 'Kling 1.5 Pro',
  minimax: 'MiniMax Video',
  'runway-gen3': 'Runway Gen-3 Turbo',
  'luma-ray2': 'Luma Ray 2',
};

// ─── Types ──────────────────────────────────────────────────────

export type VideoProvider = 'fal-ai' | 'kie-ai';

export interface VideoGenerationRequest {
  /** Storyboard image URL to animate */
  imageUrl: string;
  /** Motion/action prompt describing what should happen in the clip */
  motionPrompt: string;
  /** Duration in seconds (default: scene duration, capped by provider limits) */
  durationSeconds?: number;
  /** Aspect ratio for output (default: 16:9) */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  /** Preferred provider */
  provider?: VideoProvider;
  /** Specific fal.ai video model key (kling-1.6, kling-1.5, minimax, runway-gen3, luma-ray2) */
  falVideoModel?: FalVideoModel;
}

export interface VideoGenerationResult {
  videoUrl: string;
  gcsPath: string;
  assetId: string;
  provider: VideoProvider;
  durationMs: number;
}

// ─── fal.ai Video Generation ────────────────────────────────────

/**
 * Build model-specific input for fal.ai video models.
 * Different models expect different field names and value types.
 */
function buildFalVideoInput(
  modelKey: FalVideoModel,
  imageUrl: string,
  prompt: string,
  duration: number,
  aspectRatio: string,
): Record<string, any> {
  const base: Record<string, any> = {
    prompt,
  };

  switch (modelKey) {
    case 'kling-1.6':
    case 'kling-1.5':
      // Kling models: image_url, duration as string "5" or "10"
      base.image_url = imageUrl;
      base.duration = String(Math.min(duration, 10));
      base.aspect_ratio = aspectRatio;
      break;

    case 'minimax':
      // MiniMax: image_url, prompt_optimizer (bool)
      base.image_url = imageUrl;
      base.prompt_optimizer = true;
      break;

    case 'runway-gen3':
      // Runway Gen-3 Turbo: image_url, duration as number (5 or 10), aspect_ratio
      base.image_url = imageUrl;
      base.duration = Math.min(duration, 10);
      base.aspect_ratio = aspectRatio;
      break;

    case 'luma-ray2':
      // Luma Ray2: image_url, aspect_ratio, loop (bool)
      base.image_url = imageUrl;
      base.aspect_ratio = aspectRatio;
      base.loop = false;
      break;

    default:
      // Generic fallback
      base.image_url = imageUrl;
      base.duration = String(duration);
      base.aspect_ratio = aspectRatio;
      break;
  }

  return base;
}

/**
 * Extract the video URL from fal.ai response — different models nest it differently.
 */
function extractVideoUrl(data: any): string | null {
  return (
    data?.video?.url ||
    data?.video_url ||
    data?.output?.url ||
    data?.output?.video?.url ||
    data?.result?.url ||
    // Some models return array of videos
    data?.videos?.[0]?.url ||
    null
  );
}

async function generateVideoWithFal(
  request: VideoGenerationRequest,
  userId: string,
  modelKey?: FalVideoModel,
): Promise<VideoGenerationResult> {
  modelKey = modelKey || request.falVideoModel || 'kling-1.6';
  ensureFalConfig();

  const modelId = FAL_VIDEO_MODELS[modelKey];
  const duration = Math.min(request.durationSeconds || 5, 10);

  // fal.ai video models need a clean image URL — GCS signed URLs with query
  // params cause failures. Re-upload to fal.ai CDN to get a clean URL.
  const startTime = Date.now();
  const imageUrl = await getCleanImageUrl(request.imageUrl);
  const cleanMs = Date.now() - startTime;
  console.log(`[VideoGen] Scene: model=${modelKey}, duration=${duration}s, cleanUrl=${cleanMs}ms, imageUrl=${imageUrl.substring(0, 80)}...`);

  const input = buildFalVideoInput(
    modelKey,
    imageUrl,
    request.motionPrompt,
    duration,
    request.aspectRatio || '16:9',
  );

  const genStart = Date.now();
  const result = await falSubscribeWithTimeout(modelId, {
    input,
    logs: false,
  });
  const genMs = Date.now() - genStart;
  console.log(`[VideoGen] fal.subscribe completed in ${genMs}ms for model=${modelKey}`);

  const data = result.data as any;
  const videoUrl = extractVideoUrl(data);
  if (!videoUrl) {
    console.error(`[VideoGen] No video URL in response. Model: ${modelKey}. Response keys:`, Object.keys(data || {}), 'Full data:', JSON.stringify(data).substring(0, 500));
    throw new Error(`No video generated from fal.ai (${modelKey}). Response keys: ${Object.keys(data || {}).join(', ')}`);
  }

  // Download and upload to GCS
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Failed to download generated video: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const assetId = `video_${nanoid(12)}`;
  const filename = `${assetId}.mp4`;
  const uploadResult = await uploadToGCS(buffer, userId, filename, 'video/mp4');

  console.log(`[VideoGen] Scene complete: model=${modelKey}, totalMs=${Date.now() - startTime}, assetId=${assetId}`);

  return {
    videoUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath,
    assetId,
    provider: 'fal-ai',
    durationMs: duration * 1000,
  };
}

// ─── Kie AI Video Generation ────────────────────────────────────

async function generateVideoWithKie(
  request: VideoGenerationRequest,
  userId: string,
): Promise<VideoGenerationResult> {
  const apiKey = process.env.KIE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('KIE_AI_API_KEY environment variable is not set');
  }

  const baseUrl = 'https://api.kie.ai';

  // Kie AI supports 5s or 10s durations. 10s cannot use 1080p.
  const duration = request.durationSeconds && request.durationSeconds >= 8 ? 10 : 5;
  // Use 720p for 10s videos, 1080p for 5s
  const quality = duration === 10 ? '720p' : '1080p';

  // Kie AI rejects URLs with query params (like GCS signed URLs).
  // Re-upload to fal.ai CDN to get a clean URL.
  const cleanImageUrl = await getCleanImageUrl(request.imageUrl);

  // Submit generation request via Runway endpoint
  // Docs: https://docs.kie.ai/runway-api/generate-ai-video
  const submitRes = await fetch(`${baseUrl}/api/v1/runway/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: request.motionPrompt,
      imageUrl: cleanImageUrl,
      duration,
      quality,
      aspectRatio: request.aspectRatio || '16:9',
      waterMark: '',
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Kie AI generation failed: ${err}`);
  }

  const submitData = await submitRes.json();
  if (submitData.code !== 200) {
    throw new Error(`Kie AI error: ${submitData.msg || 'Unknown error'}`);
  }

  const taskId = submitData.data?.taskId;
  if (!taskId) {
    throw new Error('No task ID returned from Kie AI');
  }

  // Poll for completion using record-detail endpoint
  // Docs: https://docs.kie.ai/runway-api/get-ai-video-details
  // States: wait → queueing → generating → success | fail
  const maxAttempts = 60; // up to 5 minutes
  const pollInterval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const statusRes = await fetch(
      `${baseUrl}/api/v1/runway/record-detail?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } },
    );

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    const state = statusData.data?.state;

    if (state === 'success') {
      const videoUrl = statusData.data?.videoInfo?.videoUrl;
      if (!videoUrl) throw new Error('Kie AI completed but no video URL in response');

      // Download and upload to GCS (Kie AI URLs expire after 14 days)
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error('Failed to download Kie AI video');
      const buffer = Buffer.from(await response.arrayBuffer());

      const assetId = `video_${nanoid(12)}`;
      const filename = `${assetId}.mp4`;
      const uploadResult = await uploadToGCS(buffer, userId, filename, 'video/mp4');

      return {
        videoUrl: uploadResult.signedUrl,
        gcsPath: uploadResult.gcsPath,
        assetId,
        provider: 'kie-ai',
        durationMs: duration * 1000,
      };
    }

    if (state === 'fail') {
      throw new Error(`Kie AI generation failed: ${statusData.data?.failMsg || 'Unknown error'}`);
    }

    // wait, queueing, generating — keep polling
  }

  throw new Error('Kie AI generation timed out after 5 minutes');
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Generate a video clip from a storyboard image.
 * Tries the preferred provider first, falls back to the other.
 */
export async function generateVideoClip(
  request: VideoGenerationRequest,
  userId: string,
): Promise<VideoGenerationResult> {
  const modelKey = request.falVideoModel || 'kling-1.6';
  const provider = request.provider || detectBestProvider(request.falVideoModel);

  console.log(`[VideoGen] generateVideoClip: provider=${provider}, model=${modelKey}, imageUrl=${request.imageUrl?.substring(0, 60)}...`);

  if (provider === 'kie-ai') {
    try {
      return await generateVideoWithKie(request, userId);
    } catch (kieError: any) {
      // Fallback to fal.ai if available
      if (process.env.FAL_AI_API_KEY) {
        console.warn(`[VideoGen] Kie AI failed (${kieError.message}), falling back to fal.ai`);
        return generateVideoWithFal(request, userId);
      }
      throw kieError;
    }
  }

  // fal.ai provider — try user's chosen model, fallback to kling-1.6 if different
  try {
    return await generateVideoWithFal(request, userId, modelKey);
  } catch (falError: any) {
    // If the user chose a specific model and it failed, try kling-1.6 as fallback
    if (modelKey !== 'kling-1.6') {
      console.warn(`[VideoGen] ${modelKey} failed (${falError.message}), falling back to kling-1.6`);
      return generateVideoWithFal(request, userId, 'kling-1.6');
    }
    throw falError;
  }
}

/**
 * Generate video clips for all scenes in a storyboard.
 * Returns results indexed by scene index.
 */
export async function generateVideosForScenes(
  scenes: Array<{
    sceneIndex: number;
    imageUrl: string;
    motionPrompt: string;
    durationSeconds: number;
  }>,
  userId: string,
  options: {
    provider?: VideoProvider;
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
    concurrency?: number;
  } = {},
): Promise<Map<number, VideoGenerationResult>> {
  const results = new Map<number, VideoGenerationResult>();
  const concurrency = options.concurrency || 2; // video gen is expensive, limit concurrency
  const queue = [...scenes];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (running.length < concurrency && queue.length > 0) {
      const scene = queue.shift()!;
      const p = (async () => {
        try {
          const result = await generateVideoClip(
            {
              imageUrl: scene.imageUrl,
              motionPrompt: scene.motionPrompt,
              durationSeconds: scene.durationSeconds,
              aspectRatio: options.aspectRatio,
              provider: options.provider,
            },
            userId,
          );
          results.set(scene.sceneIndex, result);
        } catch (err) {
          console.error(`[VideoGen] Scene ${scene.sceneIndex} failed:`, err);
        }
      })().then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  return results;
}

/**
 * Build a motion prompt from scene descriptor for video generation.
 *
 * The video model already SEES the storyboard image as the starting frame.
 * This prompt only needs to describe WHAT CHANGES — motion, camera movement,
 * atmospheric shifts. It should NOT repeat the visual description.
 *
 * Quality tokens are dynamic from the LLM, not hardcoded.
 */
export function buildMotionPrompt(scene: {
  visualDescription: string;
  narration?: string;
  cameraDirection?: string;
  mood?: string;
  videoMotionPrompt?: string;
  videoQualityTokens?: string;
}): string {
  const parts: string[] = [];

  // Prefer LLM-generated motion prompt (already optimized for video AI)
  if (scene.videoMotionPrompt) {
    parts.push(scene.videoMotionPrompt);
  } else {
    // Fallback: build a basic motion prompt from available data
    if (scene.cameraDirection) {
      parts.push(scene.cameraDirection);
    } else {
      // Default subtle camera movement based on mood
      const moodToCamera: Record<string, string> = {
        energetic: 'Slow tracking shot with subtle dynamic energy',
        calm: 'Gentle, barely perceptible push-in',
        serious: 'Steady measured dolly forward',
        playful: 'Light floating camera drift',
        mysterious: 'Slow creeping push-in with atmospheric haze',
        dramatic: 'Deliberate slow dolly with building intensity',
        inspirational: 'Graceful rising camera movement',
        neutral: 'Subtle slow push-in',
      };
      parts.push(moodToCamera[scene.mood || 'neutral'] || 'Subtle slow push-in');
    }

    // Add one atmospheric detail instead of dumping the visual description
    if (scene.mood) {
      const moodAtmosphere: Record<string, string> = {
        energetic: 'light particles catching motion, subtle energy in the air',
        calm: 'soft ambient light shifting gently, peaceful stillness',
        serious: 'shadows deepening subtly, weighted atmosphere',
        playful: 'warm light dancing softly, gentle movement in details',
        mysterious: 'fog wisps drifting slowly, light filtering through haze',
        dramatic: 'volumetric light rays shifting, atmospheric tension building',
        inspirational: 'golden light gradually intensifying, uplifting atmosphere',
        neutral: 'natural ambient light, gentle environmental movement',
      };
      const atmo = moodAtmosphere[scene.mood];
      if (atmo) parts.push(atmo);
    }
  }

  // Append LLM-generated video quality tokens (dynamic per art style)
  if (scene.videoQualityTokens) {
    parts.push(scene.videoQualityTokens);
  }

  return parts.join(', ').substring(0, 500);
}

/**
 * Detect which provider to use based on the chosen model and available keys.
 *
 * IMPORTANT: fal.ai models (kling, minimax, runway-gen3, luma-ray2) MUST
 * route through fal-ai even if KIE_AI_API_KEY is set. Kie AI only wraps
 * Runway's native API — it can't proxy arbitrary fal.ai models.
 */
function detectBestProvider(falVideoModel?: FalVideoModel): VideoProvider {
  const kieKey = process.env.KIE_AI_API_KEY;
  const falKey = process.env.FAL_AI_API_KEY;

  // If a specific fal.ai model is selected, ALWAYS use fal-ai provider
  if (falVideoModel) {
    if (falKey && falKey.trim().length > 10) return 'fal-ai';
    console.warn(`[video-gen] fal.ai model "${falVideoModel}" selected but FAL_AI_API_KEY is missing/invalid. Trying anyway.`);
    return 'fal-ai';
  }

  // No specific model — pick best available provider
  if (kieKey && kieKey.trim().length > 10) return 'kie-ai';
  if (falKey && falKey.trim().length > 10) return 'fal-ai';

  console.warn('[video-gen] No valid API key found for video generation. KIE_AI_API_KEY:', kieKey ? 'set but short/invalid' : 'missing', 'FAL_AI_API_KEY:', falKey ? 'set but short/invalid' : 'missing');
  return 'fal-ai';
}
