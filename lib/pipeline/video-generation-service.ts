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
import { uploadMedia } from '@/lib/editron/services/upload-service';

// Configure fal.ai if key exists
let _falConfigured = false;
function ensureFalConfig() {
  if (!_falConfigured && process.env.FAL_AI_API_KEY) {
    fal.config({ credentials: process.env.FAL_AI_API_KEY });
    _falConfigured = true;
  }
}

// ─── Timeout wrapper (same pattern as storyboard-service) ────────
// Video models (especially Kling 2.6 with chaining) can take 100-250s.
// Route has maxDuration=600s so we have plenty of budget.
// 180s was too tight — videos at 170s were racing the timeout.
const FAL_VIDEO_TIMEOUT_MS = 300_000; // 5 minutes per video call

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
// Endpoints verified against fal.ai model catalog (March 2026)
export const FAL_VIDEO_MODELS = {
  'kling-2.1': 'fal-ai/kling-video/v2.1/pro/image-to-video',
  'kling-1.5': 'fal-ai/kling-video/v1.5/pro/image-to-video',
  'kling-2.6': 'fal-ai/kling-video/v2.6/pro/image-to-video',
  minimax: 'fal-ai/minimax/video-01/image-to-video',
  'luma-ray2': 'fal-ai/luma-dream-machine/ray-2/image-to-video',
  'luma-dream-machine': 'fal-ai/luma-dream-machine/image-to-video',
  'veo-3.1': 'fal-ai/veo3.1/image-to-video',
  'veo-3': 'fal-ai/veo3/image-to-video',
  'veo-2': 'fal-ai/veo2/image-to-video',
  'wan-2.2': 'fal-ai/wan/v2.2-a14b/image-to-video',
  'ltx-2.3': 'fal-ai/ltx-2.3/image-to-video',
} as const;

export type FalVideoModel = keyof typeof FAL_VIDEO_MODELS;

// Human-readable labels for video models
export const FAL_VIDEO_MODEL_LABELS: Record<FalVideoModel, string> = {
  'kling-2.1': 'Kling 2.1 Pro',
  'kling-1.5': 'Kling 1.5 Pro',
  'kling-2.6': 'Kling 2.6 Pro',
  minimax: 'MiniMax Hailuo',
  'luma-ray2': 'Luma Ray 2',
  'luma-dream-machine': 'Luma Dream Machine',
  'veo-3.1': 'Google Veo 3.1 (4K)',
  'veo-3': 'Google Veo 3',
  'veo-2': 'Google Veo 2',
  'wan-2.2': 'Wan 2.2 (Fast)',
  'ltx-2.3': 'LTX 2.3 (4K + Audio)',
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
  /** Specific fal.ai video model key (kling-2.1, kling-1.5, kling-2.6, minimax, luma-ray2, luma-dream-machine, veo-3, veo-2) */
  falVideoModel?: FalVideoModel;
  /** Next scene's storyboard image URL — used as tail/end frame for smooth cross-scene transitions */
  nextSceneImageUrl?: string;
  /** Reference subject images for IP-Adapter consistency (Kling 2.6 only) */
  referenceImageUrls?: Array<{ url: string; weight?: number }>;
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
 *
 * IMPORTANT: Each model has DIFFERENT parameter names and types.
 * These are verified against the actual fal.ai API docs (March 2026).
 * Do NOT change these without checking the model's API page first:
 *   https://fal.ai/models/{model-id}/api
 */
// Dynamic negative prompt builder — adapts to scene content and model
function buildVideoNegativePrompt(scene?: { editDirections?: { pacing?: string }; artStyle?: string; hasTextOverlay?: boolean }, model?: string): string {
  const base = [
    'blur, out of focus, low quality, low resolution, pixelated',
    'distorted, deformed, disfigured, bad anatomy',
    'extra limbs, extra fingers, missing fingers, fused fingers',
    'duplicate subject, clone artifacts, ghost images',
    'inconsistent lighting, sudden exposure change',
    'aspect ratio distortion, temporal flickering, color banding',
    'depth-of-field collapse, background replacement artifacts',
  ];

  // Only add text negatives if the scene doesn't intentionally have text
  if (!scene?.hasTextOverlay) {
    base.push('text overlay, watermark, logo, subtitles, UI elements');
  }

  // Don't suppress rapid movement if the scene is fast-paced
  if (scene?.editDirections?.pacing !== 'fast') {
    base.push('jittery, strobing, rapid movement');
  }

  // Don't suppress uncanny valley for surreal/dreamlike styles
  if (scene?.artStyle !== 'surreal') {
    base.push('uncanny valley, plastic skin, dead eyes, mannequin-like');
  }

  // Model-specific negatives
  const modelNeg: Record<string, string> = {
    kling: 'face morphing, identity drift between frames',
    minimax: 'color banding in gradients, flat lighting',
    luma: 'overexposure bloom, washed out highlights',
    veo: 'texture swimming, edge warping',
    wan: 'motion blur bleeding, subject doubling',
    ltx: 'frame stuttering, temporal inconsistency',
  };
  if (model && modelNeg[model]) base.push(modelNeg[model]);

  return base.join(', ');
}

// Backward-compatible static fallback
const VIDEO_NEGATIVE_PROMPT = buildVideoNegativePrompt();

function buildFalVideoInput(
  modelKey: FalVideoModel,
  imageUrl: string,
  prompt: string,
  duration: number,
  aspectRatio: string,
  nextSceneImageUrl?: string,
  referenceImageUrls?: Array<{ url: string; weight?: number }>,
): Record<string, any> {
  const base: Record<string, any> = {
    prompt,
  };

  switch (modelKey) {
    // ─── Kling 2.6 Pro ─────────────────────────────────────────
    // Docs: https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video/api
    // DIFFERENT from 2.1/1.5: uses `start_image_url` (NOT `image_url`)
    // and does NOT accept `aspect_ratio`.
    // Duration: ENUM string — ONLY "5" or "10" (no other values accepted!)
    case 'kling-2.6':
      base.start_image_url = imageUrl;
      base.duration = duration >= 8 ? '10' : '5'; // Snap to nearest valid enum
      base.negative_prompt = VIDEO_NEGATIVE_PROMPT;
      base.generate_audio = false; // we handle audio separately
      // Cross-scene chaining: end frame transitions toward next scene
      if (nextSceneImageUrl) base.end_image_url = nextSceneImageUrl;
      // IP-Adapter for subject consistency — only Kling 2.6 supports this.
      // Reference images anchor character/product appearance across scenes.
      if (referenceImageUrls && referenceImageUrls.length > 0) {
        base.subject_reference_image_urls = referenceImageUrls
          .slice(0, 4) // Kling supports up to 4 reference images
          .map(r => r.url);
      }
      break;

    // ─── Kling 2.1 Pro / 1.5 Pro ──────────────────────────────
    // Docs: https://fal.ai/models/fal-ai/kling-video/v2.1/pro/image-to-video/api
    // Uses `image_url`, accepts `aspect_ratio`, `cfg_scale`, `duration`
    // Duration: ENUM string — ONLY "5" or "10" (no other values accepted!)
    case 'kling-2.1':
    case 'kling-1.5':
      base.image_url = imageUrl;
      base.duration = duration >= 8 ? '10' : '5'; // Snap to nearest valid enum
      base.aspect_ratio = aspectRatio;
      base.cfg_scale = 0.5;
      base.negative_prompt = VIDEO_NEGATIVE_PROMPT;
      // Cross-scene chaining: tail frame transitions toward next scene
      if (nextSceneImageUrl) base.tail_image_url = nextSceneImageUrl;
      break;

    // ─── MiniMax Hailuo Video 01 ───────────────────────────────
    // Docs: https://fal.ai/models/fal-ai/minimax/video-01/image-to-video/api
    // Only accepts: prompt, image_url, prompt_optimizer
    // No duration, no aspect_ratio parameters.
    case 'minimax':
      base.image_url = imageUrl;
      base.prompt_optimizer = true;
      break;

    // ─── Luma Ray 2 / Dream Machine ────────────────────────────
    // Docs: https://fal.ai/models/fal-ai/luma-dream-machine/ray-2/image-to-video/api
    // Duration: enum string "5s" or "9s" (WITH 's' suffix)
    // Aspect ratio: "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"
    // Resolution: "540p", "720p", "1080p"
    case 'luma-ray2':
    case 'luma-dream-machine':
      base.image_url = imageUrl;
      base.aspect_ratio = aspectRatio;
      base.loop = false;
      base.resolution = '720p';
      base.duration = duration >= 7 ? '9s' : '5s';
      // Cross-scene chaining: end frame transitions toward next scene
      if (nextSceneImageUrl) base.end_image_url = nextSceneImageUrl;
      break;

    // ─── Google Veo 3 / Veo 2 ──────────────────────────────────
    // Docs: https://fal.ai/models/fal-ai/veo3/image-to-video/api
    // Duration: enum string "4s", "6s", or "8s" (WITH 's' suffix)
    // Aspect ratio: "auto", "16:9", "9:16"
    // Resolution: "720p", "1080p"
    // image_url must be 720p+ in 16:9 or 9:16
    case 'veo-3.1':
    case 'veo-3':
    case 'veo-2':
      base.image_url = imageUrl;
      // Veo only accepts "auto", "16:9", "9:16" — map unsupported ratios
      base.aspect_ratio = (aspectRatio === '16:9' || aspectRatio === '9:16')
        ? aspectRatio : 'auto';
      base.resolution = '720p';
      base.generate_audio = false; // we handle audio separately
      base.negative_prompt = VIDEO_NEGATIVE_PROMPT;
      // Map duration to nearest Veo enum: 4s, 6s, or 8s
      if (duration <= 4) base.duration = '4s';
      else if (duration <= 6) base.duration = '6s';
      else base.duration = '8s';
      break;

    // ─── Wan 2.2 ──────────────────────────────────────────────
    // Docs: https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video/api
    // Supports end_image_url for chaining. num_frames controls duration.
    case 'wan-2.2':
      base.image_url = imageUrl;
      base.num_frames = Math.min(Math.max(Math.round(duration * 16), 17), 161); // 16fps, 17-161 frames
      base.frames_per_second = 16;
      base.resolution = '720p';
      base.aspect_ratio = (aspectRatio === '16:9' || aspectRatio === '9:16') ? aspectRatio : 'auto';
      base.video_quality = 'high';
      base.negative_prompt = VIDEO_NEGATIVE_PROMPT;
      if (nextSceneImageUrl) base.end_image_url = nextSceneImageUrl;
      break;

    // ─── LTX 2.3 ─────────────────────────────────────────────
    // Docs: https://fal.ai/models/fal-ai/ltx-2.3/image-to-video/api
    // Fast, up to 4K, includes audio. $0.06/sec at 1080p.
    case 'ltx-2.3':
      base.image_url = imageUrl;
      base.duration = Math.min(Math.max(Math.round(duration), 6), 10); // 6, 8, or 10 seconds
      base.resolution = '1080p';
      base.aspect_ratio = (aspectRatio === '16:9' || aspectRatio === '9:16') ? aspectRatio : 'auto';
      base.fps = 25;
      base.generate_audio = false; // we handle audio separately
      base.negative_prompt = VIDEO_NEGATIVE_PROMPT;
      if (nextSceneImageUrl) base.end_image_url = nextSceneImageUrl;
      break;

    default:
      // Safe generic fallback — use Kling 2.1 parameter format
      base.image_url = imageUrl;
      base.duration = duration >= 8 ? '10' : '5'; // Snap to valid Kling enum
      base.aspect_ratio = aspectRatio;
      break;
  }

  return base;
}

/**
 * Extract the video URL from fal.ai response — different models nest it differently.
 */
/**
 * Compute the ACTUAL duration the model will produce, given requested duration.
 * Each model snaps to fixed enum values — this returns what the model actually generates.
 */
function getActualModelDuration(modelKey: FalVideoModel, requestedDuration: number): number {
  switch (modelKey) {
    case 'kling-2.6':
    case 'kling-2.1':
    case 'kling-1.5':
      return requestedDuration >= 8 ? 10 : 5;
    case 'veo-3.1':
    case 'veo-3':
    case 'veo-2':
      if (requestedDuration <= 4) return 4;
      if (requestedDuration <= 6) return 6;
      return 8;
    case 'luma-ray2':
    case 'luma-dream-machine':
      return requestedDuration >= 7 ? 9 : 5;
    case 'wan-2.2':
      // Wan uses num_frames at 16fps, 17-161 frames → 1.06s-10.06s
      return Math.min(Math.max(Math.round(requestedDuration * 16), 17), 161) / 16;
    case 'ltx-2.3':
      return Math.min(Math.max(Math.round(requestedDuration), 6), 10);
    case 'minimax':
      return requestedDuration; // MiniMax doesn't expose duration control
    default:
      return requestedDuration >= 8 ? 10 : 5;
  }
}

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
  modelKey = modelKey || request.falVideoModel || 'kling-2.1';
  ensureFalConfig();

  const modelId = FAL_VIDEO_MODELS[modelKey];
  const duration = Math.min(request.durationSeconds || 5, 10);

  // fal.ai video models need a clean image URL — GCS signed URLs with query
  // params cause failures. Re-upload to fal.ai CDN to get a clean URL.
  const startTime = Date.now();
  const imageUrl = await getCleanImageUrl(request.imageUrl);
  // Also clean the next scene image URL if provided (for cross-scene chaining)
  const nextSceneImageUrl = request.nextSceneImageUrl
    ? await getCleanImageUrl(request.nextSceneImageUrl)
    : undefined;
  const cleanMs = Date.now() - startTime;
  console.log(`[VideoGen] Scene: model=${modelKey}, duration=${duration}s, cleanUrl=${cleanMs}ms, chained=${!!nextSceneImageUrl}, imageUrl=${imageUrl.substring(0, 80)}...`);

  // Clean reference image URLs too (for IP-Adapter on Kling 2.6)
  let cleanedRefImages: Array<{ url: string; weight?: number }> | undefined;
  if (request.referenceImageUrls && request.referenceImageUrls.length > 0 && modelKey === 'kling-2.6') {
    cleanedRefImages = await Promise.all(
      request.referenceImageUrls.slice(0, 4).map(async (r) => ({
        url: await getCleanImageUrl(r.url),
        weight: r.weight,
      })),
    );
  }

  const input = buildFalVideoInput(
    modelKey,
    imageUrl,
    request.motionPrompt,
    duration,
    request.aspectRatio || '16:9',
    nextSceneImageUrl,
    cleanedRefImages,
  );

  // Log the exact input being sent to fal.ai for debugging
  const inputKeys = Object.keys(input);
  const safeInput = { ...input, prompt: input.prompt?.substring(0, 80) + '...' };
  console.log(`[VideoGen] fal.subscribe input for ${modelKey} (${modelId}):`, JSON.stringify(safeInput));

  const genStart = Date.now();
  let result: any;
  try {
    result = await falSubscribeWithTimeout(modelId, {
      input,
      logs: false,
    });
  } catch (err: any) {
    // Surface the FULL fal.ai error — don't truncate, these are critical for debugging
    const errBody = err?.body || {};
    const errStatus = err?.status || err?.statusCode || 'unknown';
    const errDetail = errBody?.detail || errBody?.message || errBody?.error || '';
    const errMsg = errDetail || err?.message || 'Unknown fal.ai error';

    // Log everything for server-side debugging
    console.error(`[VideoGen] fal.ai FAILED for ${modelKey} (${modelId})`);
    console.error(`[VideoGen]   HTTP status: ${errStatus}`);
    console.error(`[VideoGen]   Error: ${errMsg}`);
    console.error(`[VideoGen]   Full body: ${JSON.stringify(errBody).substring(0, 2000)}`);
    console.error(`[VideoGen]   Input params sent: ${inputKeys.join(', ')}`);
    console.error(`[VideoGen]   Prompt (full): ${input.prompt?.substring(0, 200)}`);

    // Include status in the thrown error so the client can see if it's a rate limit, auth issue, etc.
    const statusHint = errStatus === 422 ? ' (invalid parameters)'
      : errStatus === 429 ? ' (rate limited — try again shortly)'
      : errStatus === 401 ? ' (auth failed — check FAL_AI_API_KEY)'
      : errStatus === 404 ? ' (model not found — endpoint may have changed)'
      : '';
    throw new Error(`${modelKey}: ${errMsg}${statusHint}`);
  }
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
  // R2 primary (browser) + GCS secondary (Gemini 5-Track analysis needs gs:// URIs)
  const uploadResult = await uploadMedia(buffer, userId, filename, 'video/mp4', { alsoUploadToGCS: true });

  // Use the ACTUAL model output duration, not the requested duration.
  // Models snap to fixed enums (Kling: 5/10s, Veo: 4/6/8s, etc.)
  // Using requested duration causes scene stretching in the timeline.
  const actualDuration = getActualModelDuration(modelKey, duration);
  console.log(`[VideoGen] Scene complete: model=${modelKey}, requested=${duration}s, actual=${actualDuration}s, totalMs=${Date.now() - startTime}, assetId=${assetId}`);

  return {
    videoUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath,
    assetId,
    provider: 'fal-ai',
    durationMs: actualDuration * 1000,
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
      // R2 primary (browser) + GCS secondary (Gemini 5-Track analysis needs gs:// URIs)
  const uploadResult = await uploadMedia(buffer, userId, filename, 'video/mp4', { alsoUploadToGCS: true });

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
  const modelKey = request.falVideoModel || 'kling-2.1';
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

  // fal.ai provider — try user's chosen model, fallback to kling-2.1 if different
  try {
    return await generateVideoWithFal(request, userId, modelKey);
  } catch (falError: any) {
    // If the user chose a specific model and it failed, try kling-2.1 as fallback
    if (modelKey !== 'kling-2.1') {
      console.warn(`[VideoGen] ${modelKey} failed (${falError.message}), falling back to kling-2.1`);
      return generateVideoWithFal(request, userId, 'kling-2.1');
    }
    throw falError;
  }
}

/**
 * Generate video clips for all scenes in a storyboard.
 * Processes scenes IN ORDER so each scene can receive the previous scene's
 * storyboard image as a visual continuity reference.
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
    /** Enable sequential last-frame chaining for visual continuity */
    enableChaining?: boolean;
  } = {},
): Promise<Map<number, VideoGenerationResult>> {
  const results = new Map<number, VideoGenerationResult>();

  // Sort scenes by index to ensure proper ordering for chaining
  const sortedScenes = [...scenes].sort((a, b) => a.sceneIndex - b.sceneIndex);

  // Sequential processing with cross-scene chaining:
  // Each scene gets the NEXT scene's storyboard image as end-frame target
  for (let i = 0; i < sortedScenes.length; i++) {
    const scene = sortedScenes[i];
    const nextScene = i < sortedScenes.length - 1 ? sortedScenes[i + 1] : null;

    try {
      const result = await generateVideoClip(
        {
          imageUrl: scene.imageUrl,
          motionPrompt: scene.motionPrompt,
          durationSeconds: scene.durationSeconds,
          aspectRatio: options.aspectRatio,
          provider: options.provider,
          nextSceneImageUrl: options.enableChaining && nextScene ? nextScene.imageUrl : undefined,
        },
        userId,
      );
      results.set(scene.sceneIndex, result);
    } catch (err) {
      console.error(`[VideoGen] Scene ${scene.sceneIndex} failed:`, err);
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
  artStyle?: string;
}): string {
  const parts: string[] = [];
  const style = (scene.artStyle || 'cinematic').toLowerCase();

  // Prefer LLM-generated motion prompt (already optimized for video AI)
  if (scene.videoMotionPrompt) {
    parts.push(scene.videoMotionPrompt);
  } else {
    // Fallback: build a basic motion prompt from available data
    if (scene.cameraDirection) {
      parts.push(scene.cameraDirection);
    } else {
      // Style-aware camera movements — anime gets animation language, etc.
      const styleCamera: Record<string, Record<string, string>> = {
        anime: {
          energetic: 'Dynamic camera pan with speed lines, high-energy composition shift',
          calm: 'Gentle parallax scroll, floating composition drift',
          serious: 'Slow dramatic zoom, weight in every frame',
          dramatic: 'Intense camera shake into rapid zoom, manga-style impact',
          neutral: 'Subtle floating camera movement, soft parallax',
        },
        'pixel-art': {
          energetic: 'Smooth pixel-perfect horizontal scroll with screen shake',
          calm: 'Gentle sub-pixel drift, retro-style slow pan',
          dramatic: 'Flash white impact frame, screen shake, zoom-in',
          neutral: 'Slow tile-aligned camera drift',
        },
        watercolor: {
          energetic: 'Colors bleeding and shifting with motion, wet paint flowing',
          calm: 'Soft pigment diffusion, gentle watercolor bleeding between areas',
          dramatic: 'Bold ink strokes appearing, wet-on-wet color intensifying',
          neutral: 'Subtle paper texture shift, gentle watercolor breathing',
        },
        '3d-render': {
          energetic: 'Dynamic orbit around subject, depth of field shifting',
          calm: 'Slow smooth dolly with realistic depth blur',
          dramatic: 'Dramatic crane shot with volumetric lighting shift',
          neutral: 'Subtle push-in with ambient occlusion, realistic physics',
        },
      };

      // Default cinematic fallback
      const defaultCamera: Record<string, string> = {
        energetic: 'Slow tracking shot with subtle dynamic energy',
        calm: 'Gentle, barely perceptible push-in',
        serious: 'Steady measured dolly forward',
        playful: 'Light floating camera drift',
        mysterious: 'Slow creeping push-in with atmospheric haze',
        dramatic: 'Deliberate slow dolly with building intensity',
        inspirational: 'Graceful rising camera movement',
        neutral: 'Subtle slow push-in',
      };

      const mood = scene.mood || 'neutral';
      const styleMap = styleCamera[style];
      const camera = styleMap?.[mood] || styleMap?.neutral || defaultCamera[mood] || 'Subtle slow push-in';
      parts.push(camera);
    }

    // Style-aware atmospheric detail
    const styleAtmosphere: Record<string, Record<string, string>> = {
      anime: {
        energetic: 'impact frames, motion blur streaks, dynamic composition',
        calm: 'cherry blossom petals floating, soft ambient glow',
        dramatic: 'dramatic backlighting, wind-swept hair and clothing',
        neutral: 'soft cel-shaded lighting, gentle hair and cloth movement',
      },
      'pixel-art': {
        energetic: 'pixel particles scattering, screen flash effects',
        calm: 'ambient pixel dust floating, soft palette cycling',
        dramatic: 'dramatic pixel-art lighting, dithered shadow shift',
        neutral: 'subtle sprite animation, ambient pixel movement',
      },
      watercolor: {
        energetic: 'splashes of color expanding, pigment flowing with energy',
        calm: 'gentle color bleeding at edges, watercolor wash settling',
        dramatic: 'bold strokes appearing, ink intensity building',
        neutral: 'soft paper texture movement, gentle pigment drift',
      },
    };

    const defaultAtmosphere: Record<string, string> = {
      energetic: 'light particles catching motion, subtle energy in the air',
      calm: 'soft ambient light shifting gently, peaceful stillness',
      serious: 'shadows deepening subtly, weighted atmosphere',
      playful: 'warm light dancing softly, gentle movement in details',
      mysterious: 'fog wisps drifting slowly, light filtering through haze',
      dramatic: 'volumetric light rays shifting, atmospheric tension building',
      inspirational: 'golden light gradually intensifying, uplifting atmosphere',
      neutral: 'natural ambient light, gentle environmental movement',
    };

    const mood = scene.mood || 'neutral';
    const styleAtmo = styleAtmosphere[style];
    const atmo = styleAtmo?.[mood] || styleAtmo?.neutral || defaultAtmosphere[mood];
    if (atmo) parts.push(atmo);
  }

  // Validate and append quality tokens — strip invalid Midjourney/SD flags
  if (scene.videoQualityTokens) {
    const cleaned = scene.videoQualityTokens
      .replace(/--\w+\s*\S*/g, '')           // Remove --ar, --stylize, etc.
      .replace(/\b(steps|cfg|seed)\s*[:=]\s*\d+/gi, '') // Remove steps:50, cfg:7, etc.
      .replace(/\b(sd|sdxl|midjourney|mj|niji)\b/gi, '') // Remove model names
      .replace(/\s{2,}/g, ' ')               // Collapse whitespace
      .trim();
    if (cleaned.length > 5) parts.push(cleaned);
  }

  return parts.join(', ').substring(0, 500);
}

/**
 * Smart model selector: pick the best video model based on scene requirements.
 *
 * Scoring heuristic:
 * - High motion / energetic scenes    -> Kling 2.6 (best motion fidelity)
 * - Cinematic / dramatic scenes       -> Veo 3.1 (Google's best quality)
 * - Short / fast-turnaround scenes    -> Runway Gen-4.5 Turbo (fastest)
 * - Dreamy / artistic scenes          -> Luma Dream Machine (stylised)
 * - Default / general purpose         -> Kling 1.6 (reliable, good quality)
 *
 * @param consistencyMode When true, returns the locked model instead of per-scene selection.
 *                        Use this to enforce the same model across all scenes.
 * @param lockedModel     The model to use when consistencyMode is true.
 */
export function selectBestModel(scene: {
  mood?: string;
  durationSeconds?: number;
  artStyle?: string;
  motionIntensity?: 'low' | 'medium' | 'high';
}, consistencyMode?: boolean, lockedModel?: FalVideoModel): FalVideoModel {
  // Consistency mode: return the locked model for all scenes
  if (consistencyMode && lockedModel) {
    return lockedModel;
  }
  const mood = scene.mood || 'neutral';
  const artStyle = (scene.artStyle || '').toLowerCase();
  const motionIntensity = scene.motionIntensity || 'medium';

  // All endpoints verified against fal.ai model catalog (March 2026)

  // High-motion scenes benefit from Kling 2.6's superior motion handling
  if (motionIntensity === 'high' || mood === 'energetic') {
    return 'kling-2.6';
  }

  // Cinematic / dramatic / serious scenes — Veo 3.1 for premium quality
  if (mood === 'dramatic' || mood === 'serious' || mood === 'inspirational') {
    return 'veo-3.1';
  }

  // Dreamy, artistic, or watercolor/illustration styles — Luma Dream Machine
  if (
    mood === 'mysterious' ||
    artStyle.includes('watercolor') ||
    artStyle.includes('illustration') ||
    artStyle.includes('anime') ||
    artStyle.includes('dream')
  ) {
    return 'luma-dream-machine';
  }

  // Short clips where speed matters — Wan 2.2 (fast, cheap)
  if (scene.durationSeconds && scene.durationSeconds <= 4) {
    return 'wan-2.2';
  }

  // Default: Kling 2.1 Pro — reliable, good quality, best all-rounder
  return 'kling-2.1';
}

/**
 * Detect which provider to use based on the chosen model and available keys.
 *
 * IMPORTANT: fal.ai models (kling, minimax, runway-gen3, luma-ray2, veo-3, etc.)
 * MUST route through fal-ai even if KIE_AI_API_KEY is set. Kie AI only wraps
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
