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

/**
 * Convert a GCS signed URL (or any URL with query params) into a clean
 * publicly-accessible CDN URL by re-uploading to fal.ai storage.
 * This is needed because Kie AI rejects URLs with query parameters.
 */
async function getCleanImageUrl(imageUrl: string): Promise<string> {
  // If URL has no query params, it's already clean
  if (!imageUrl.includes('?')) return imageUrl;

  ensureFalConfig();

  // Download from GCS signed URL
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download image for re-upload: ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `storyboard_${nanoid(8)}.png`, { type: 'image/png' });

  // Upload to fal.ai CDN — returns a clean URL
  const cdnUrl = await fal.storage.upload(file);
  return cdnUrl;
}

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
}

export interface VideoGenerationResult {
  videoUrl: string;
  gcsPath: string;
  assetId: string;
  provider: VideoProvider;
  durationMs: number;
}

// ─── fal.ai Video Generation ────────────────────────────────────

// fal.ai models for image-to-video
const FAL_VIDEO_MODELS = {
  'kling-1.6': 'fal-ai/kling-video/v1.6/pro/image-to-video',
  'kling-1.5': 'fal-ai/kling-video/v1.5/pro/image-to-video',
  minimax: 'fal-ai/minimax-video/image-to-video',
  'runway-gen3': 'fal-ai/runway-gen3/turbo/image-to-video',
  'luma-ray2': 'fal-ai/luma-dream-machine/ray-2/image-to-video',
} as const;

type FalVideoModel = keyof typeof FAL_VIDEO_MODELS;

async function generateVideoWithFal(
  request: VideoGenerationRequest,
  userId: string,
  modelKey: FalVideoModel = 'kling-1.6',
): Promise<VideoGenerationResult> {
  ensureFalConfig();

  const modelId = FAL_VIDEO_MODELS[modelKey];
  const duration = Math.min(request.durationSeconds || 5, 10); // most models cap at 5-10s

  const result = await fal.subscribe(modelId, {
    input: {
      image_url: request.imageUrl,
      prompt: request.motionPrompt,
      duration: String(duration),
      aspect_ratio: request.aspectRatio || '16:9',
    },
    logs: false,
  });

  const data = result.data as any;
  const videoUrl = data?.video?.url || data?.video_url;
  if (!videoUrl) {
    throw new Error(`No video generated from fal.ai (${modelKey})`);
  }

  // Download and upload to GCS
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error('Failed to download generated video');
  const buffer = Buffer.from(await response.arrayBuffer());

  const assetId = `video_${nanoid(12)}`;
  const filename = `${assetId}.mp4`;
  const uploadResult = await uploadToGCS(buffer, userId, filename, 'video/mp4');

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
  const provider = request.provider || detectBestProvider();

  if (provider === 'kie-ai') {
    return generateVideoWithKie(request, userId);
  }

  return generateVideoWithFal(request, userId);
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
 * Converts static visual descriptions into motion/action prompts.
 */
export function buildMotionPrompt(scene: {
  visualDescription: string;
  narration?: string;
  cameraDirection?: string;
  mood?: string;
}): string {
  const parts: string[] = [];

  if (scene.cameraDirection) {
    parts.push(`Camera movement: ${scene.cameraDirection}`);
  }

  if (scene.visualDescription) {
    // Extract action words and motion cues
    const visual = scene.visualDescription
      .replace(/\*{1,2}/g, '')
      .replace(/\d{2}:\d{2}(?::\d{2})?[-–—]\d{2}:\d{2}(?::\d{2})?\s*:?\s*/g, '')
      .trim();
    parts.push(visual.substring(0, 300));
  }

  if (scene.mood) {
    const moodToMotion: Record<string, string> = {
      energetic: 'Dynamic, fast-paced motion with intensity',
      calm: 'Slow, gentle movement with soft transitions',
      serious: 'Steady, deliberate movement with weight',
      playful: 'Bouncy, lively motion with energy',
      somber: 'Slow, heavy movement with stillness',
      neutral: 'Natural, smooth motion',
    };
    const motionHint = moodToMotion[scene.mood];
    if (motionHint) parts.push(motionHint);
  }

  return parts.join('. ').substring(0, 500);
}

/** Detect which provider is available based on env vars. */
function detectBestProvider(): VideoProvider {
  const kieKey = process.env.KIE_AI_API_KEY;
  const falKey = process.env.FAL_AI_API_KEY;

  // Validate keys are non-empty and reasonable length
  if (kieKey && kieKey.trim().length > 10) return 'kie-ai';
  if (falKey && falKey.trim().length > 10) return 'fal-ai';

  // If neither key looks valid, still try fal-ai (will fail with clear error)
  console.warn('[video-gen] No valid API key found for video generation. KIE_AI_API_KEY:', kieKey ? 'set but short/invalid' : 'missing', 'FAL_AI_API_KEY:', falKey ? 'set but short/invalid' : 'missing');
  return 'fal-ai';
}
