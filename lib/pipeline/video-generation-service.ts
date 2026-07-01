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
import {
  getVideoModelConfig,
  getVideoModelEndpoint,
  buildVideoInputFromConfig,
  modelHasNativeAudio,
  VIDEO_MODEL_REGISTRY,
  type VideoModelConfig,
} from './adapters/video-model-configs';
import { falRetry } from './fal-retry';

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
  // Bundle 4 Toyota A.fal.ai.1 fix: wrap in exponential-backoff retry for
  // transient errors (429, 5xx, fetch failed). Non-transient errors bail
  // immediately. Up to 3 retries total (4 attempts).
  return falRetry(
    () => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        fal.subscribe(modelId, options),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`fal.ai video call timed out after ${timeoutMs / 1000}s (model: ${modelId})`)),
            timeoutMs,
          );
        }),
      ]).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      });
    },
    { maxRetries: 3, label: `video gen (${modelId})` },
  );
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

// OLD: Hardcoded FAL_VIDEO_MODELS map + labels. Each model had its own switch case.
// NEW: Config-driven registry in adapters/video-model-configs.ts. Models, endpoints,
// param formats, and labels all derived from one registry.

// Backward-compatible exports — derived from the registry
export const FAL_VIDEO_MODELS: Record<string, string> = Object.fromEntries(
  Object.values(VIDEO_MODEL_REGISTRY).map(c => [c.key, c.endpoints.imageToVideo]),
);

export type FalVideoModel = string; // Was keyof typeof FAL_VIDEO_MODELS — now dynamic

export const FAL_VIDEO_MODEL_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(VIDEO_MODEL_REGISTRY).map(c => [c.key, c.label]),
);

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
  /** Specific fal.ai video model key (kling-2.1, kling-2.6, seedance-1.5, seedance-2.0, veo-3.1) */
  falVideoModel?: FalVideoModel;
  /** Next scene's storyboard image URL — used as tail/end frame for smooth cross-scene transitions */
  nextSceneImageUrl?: string;
  /** Reference subject images for IP-Adapter consistency (Kling 2.6 only) */
  referenceImageUrls?: Array<{ url: string; weight?: number }>;
  /** True if this scene has voiceover narration — disables native audio generation
   *  on Seedance models to prevent voiceover/native-audio overlap. */
  hasVoiceover?: boolean;
}

export interface VideoGenerationResult {
  videoUrl: string;
  gcsPath: string;
  r2Key?: string;
  assetId: string;
  provider: VideoProvider;
  durationMs: number;
  /** True if the model generated audio with the video (e.g., Seedance 1.5 Pro).
   *  When true, SFX generation should be skipped for this scene — audio is baked in.
   *  Remotion's <Video> component auto-plays embedded audio. */
  hasNativeAudio?: boolean;
}

type FalVideoErrorStage = 'generation' | 'post-generation';

class FalVideoGenerationError extends Error {
  readonly stage: FalVideoErrorStage;
  readonly modelKey: FalVideoModel;
  readonly status?: number | string;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      stage: FalVideoErrorStage;
      modelKey: FalVideoModel;
      status?: number | string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'FalVideoGenerationError';
    this.stage = options.stage;
    this.modelKey = options.modelKey;
    this.status = options.status;
    this.cause = options.cause;
    Object.setPrototypeOf(this, FalVideoGenerationError.prototype);
  }
}

function isFalVideoGenerationError(error: unknown): error is FalVideoGenerationError {
  return error instanceof FalVideoGenerationError;
}

function shouldFallbackFromFalModel(error: unknown): boolean {
  if (!isFalVideoGenerationError(error) || error.stage !== 'generation') return false;

  const status = Number(error.status);
  return status === 404 || status === 422;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

  // Text — ALWAYS suppress AI-generated text. Readable text is added as graphic overlays in post.
  base.push('text overlay, watermark, logo, subtitles, UI elements, readable text, legible writing');

  // Hands/anatomy — the #1 AI video artifact. Always suppress.
  base.push('melted hands, fused fingers, extra fingers, broken fingers, deformed hands');
  base.push('food phasing through face, objects passing through body, impossible physics');

  // Temporal consistency — critical for professional output
  base.push('face morphing, identity drift between frames, inconsistent facial features');

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

// OLD: 12-case switch statement, each case setting 3-8 params with different names.
// NEW: Config-driven builder in adapters/video-model-configs.ts.
// buildVideoInputFromConfig() reads any VideoModelConfig and produces the correct input.
// To add a new model: add a config entry. No switch cases needed.
function buildFalVideoInput(
  modelKey: FalVideoModel,
  imageUrl: string,
  prompt: string,
  duration: number,
  aspectRatio: string,
  nextSceneImageUrl?: string,
  referenceImageUrls?: Array<{ url: string; weight?: number }>,
  options?: { hasVoiceover?: boolean },
): Record<string, any> {
  // Fix 14: Veo 3.1 degrades with prompts > 300 chars. Enforce trim.
  // The LLM prompt already requests 150-300 chars, but Gemini sometimes exceeds it.
  if (modelKey === 'veo-3.1' && prompt.length > 300) {
    const original = prompt;
    prompt = prompt.substring(0, 297) + '...';
    console.log(`[VideoGen] Veo prompt trimmed: ${original.length} → ${prompt.length} chars`);
  }
  const config = getVideoModelConfig(modelKey);
  return buildVideoInputFromConfig(
    config,
    imageUrl,
    prompt,
    duration,
    aspectRatio,
    config.supportsNegativePrompt ? VIDEO_NEGATIVE_PROMPT : undefined,
    nextSceneImageUrl,
    referenceImageUrls?.map(r => r.url),
    { hasVoiceover: options?.hasVoiceover },
  );
}

/**
 * Extract the video URL from fal.ai response — different models nest it differently.
 */
// OLD: 12-case switch duplicating duration logic already in buildFalVideoInput.
// NEW: Uses config.duration.actualSeconds() from the registry.
function getActualModelDuration(modelKey: FalVideoModel, requestedDuration: number): number {
  const config = getVideoModelConfig(modelKey);
  return config.duration.actualSeconds(requestedDuration);
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

  const modelId = getVideoModelEndpoint(modelKey);
  const duration = Math.min(request.durationSeconds || 5, 10);

  // fal.ai video models need a clean image URL — GCS signed URLs with query
  // params cause failures. Re-upload to fal.ai CDN to get a clean URL.
  const startTime = Date.now();
  const imageUrl = await getCleanImageUrl(request.imageUrl.trim().replace(/\n/g, ''));
  // Also clean the next scene image URL if provided (for cross-scene chaining)
  const nextSceneImageUrl = request.nextSceneImageUrl
    ? await getCleanImageUrl(request.nextSceneImageUrl)
    : undefined;
  const cleanMs = Date.now() - startTime;
  console.log(`[VideoGen] Scene: model=${modelKey}, duration=${duration}s, cleanUrl=${cleanMs}ms, chained=${!!nextSceneImageUrl}, imageUrl=${imageUrl.substring(0, 80)}...`);

  // Clean reference image URLs if this model supports reference images (config-driven)
  const modelConfig = getVideoModelConfig(modelKey);
  let cleanedRefImages: Array<{ url: string; weight?: number }> | undefined;
  if (request.referenceImageUrls && request.referenceImageUrls.length > 0 && modelConfig.referenceParam) {
    cleanedRefImages = await Promise.all(
      request.referenceImageUrls.slice(0, modelConfig.maxReferenceImages || 4).map(async (r) => ({
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
    { hasVoiceover: request.hasVoiceover },
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
    throw new FalVideoGenerationError(`${modelKey}: ${errMsg}${statusHint}`, {
      stage: 'generation',
      modelKey,
      status: errStatus,
      cause: err,
    });
  }
  const genMs = Date.now() - genStart;
  console.log(`[VideoGen] fal.subscribe completed in ${genMs}ms for model=${modelKey}`);

  const data = result.data as any;
  const videoUrl = extractVideoUrl(data);
  if (!videoUrl) {
    console.error(`[VideoGen] No video URL in response. Model: ${modelKey}. Response keys:`, Object.keys(data || {}), 'Full data:', JSON.stringify(data).substring(0, 500));
    throw new FalVideoGenerationError(`No video generated from fal.ai (${modelKey}). Response keys: ${Object.keys(data || {}).join(', ')}`, {
      stage: 'post-generation',
      modelKey,
    });
  }

  // Download and upload to GCS
  let response: Response;
  try {
    response = await fetch(videoUrl);
  } catch (err) {
    throw new FalVideoGenerationError(`Failed to download generated video (${modelKey}): ${getErrorMessage(err)}`, {
      stage: 'post-generation',
      modelKey,
      cause: err,
    });
  }
  if (!response.ok) {
    throw new FalVideoGenerationError(`Failed to download generated video: ${response.status}`, {
      stage: 'post-generation',
      modelKey,
      status: response.status,
    });
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const assetId = `video_${nanoid(12)}`;
  const filename = `${assetId}.mp4`;
  // R2 primary (browser) + GCS secondary (Gemini 5-Track analysis needs gs:// URIs)
  let uploadResult: Awaited<ReturnType<typeof uploadMedia>>;
  try {
    uploadResult = await uploadMedia(buffer, userId, filename, 'video/mp4', { alsoUploadToGCS: true, customAssetId: assetId });
  } catch (err) {
    throw new FalVideoGenerationError(`Failed to persist generated video (${modelKey}): ${getErrorMessage(err)}`, {
      stage: 'post-generation',
      modelKey,
      cause: err,
    });
  }

  // Use the ACTUAL model output duration, not the requested duration.
  // Models snap to fixed enums (Kling: 5/10s, Veo: 4/6/8s, etc.)
  // Using requested duration causes scene stretching in the timeline.
  const actualDuration = getActualModelDuration(modelKey, duration);
  console.log(`[VideoGen] Scene complete: model=${modelKey}, requested=${duration}s, actual=${actualDuration}s, totalMs=${Date.now() - startTime}, assetId=${assetId}`);

  // hasNativeAudio must reflect whether native audio was enabled for this scene,
  // not just whether the model can produce it. For models with a documented
  // audio toggle, video-model-configs.ts sends false when the scene has
  // voiceover. For fixed native-audio models without a toggle, this flag stays
  // false on voiceover scenes so downstream SFX/BGM logic still treats TTS as
  // the primary audio authority.
  //
  // OLD: modelHasNativeAudio(modelKey) -> always true for Seedance, regardless of
  //      whether audio was disabled for this specific generation. Caused:
  //      - SFX skipped for voiceover scenes (finalize line 764 filters on hasNativeAudio)
  //      - BGM ducked under silence (audio-ducking runs on hasNativeAudio videos)
  // NEW: Check model config AND whether voiceover disabled it.
  const nativeAudioConfig = getVideoModelConfig(modelKey).nativeAudio;
  const audioWasRequested = nativeAudioConfig
    ? (nativeAudioConfig.default && !request.hasVoiceover)
    : false;

  return {
    videoUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath!,
    r2Key: uploadResult.r2Key ?? undefined,
    assetId,
    provider: 'fal-ai',
    durationMs: actualDuration * 1000,
    hasNativeAudio: audioWasRequested,
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
      const uploadResult = await uploadMedia(buffer, userId, filename, 'video/mp4', { alsoUploadToGCS: true, customAssetId: assetId });

      return {
        videoUrl: uploadResult.signedUrl,
        gcsPath: uploadResult.gcsPath!,
        r2Key: uploadResult.r2Key ?? undefined,
        assetId: uploadResult.assetId,
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

  // fal.ai provider: fallback only if the chosen endpoint rejects before it
  // returns a video. Download/upload failures after generation must surface,
  // otherwise we can spend on a second paid model call and hide storage bugs.
  try {
    return await generateVideoWithFal(request, userId, modelKey);
  } catch (falError: any) {
    if (modelKey !== 'kling-2.1' && shouldFallbackFromFalModel(falError)) {
      console.warn(`[VideoGen] ${modelKey} endpoint failed (${falError.message}), falling back to kling-2.1`);
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
          hasVoiceover: true, // Conservative default for batch path
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

  // Dreamy, artistic, or calm/mysterious scenes — Seedance 1.5 (good coherence + audio)
  if (
    mood === 'mysterious' || mood === 'calm' ||
    artStyle.includes('watercolor') ||
    artStyle.includes('illustration') ||
    artStyle.includes('anime') ||
    artStyle.includes('dream')
  ) {
    return 'seedance-1.5';
  }

  // Short clips or playful content — Seedance 2.0 (best audio-video sync)
  if (scene.durationSeconds && scene.durationSeconds <= 4) {
    return 'seedance-2.0';
  }

  // Default: Kling 2.1 Pro — reliable, good quality, best all-rounder
  return 'kling-2.1';
}

/**
 * Detect which provider to use based on the chosen model and available keys.
 *
 * IMPORTANT: fal.ai models (kling, seedance, veo-3.1)
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
