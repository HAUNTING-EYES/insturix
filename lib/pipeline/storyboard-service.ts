/**
 * Storyboard Service
 *
 * Generates storyboard images for scenes using fal.ai,
 * uploads results to GCS, and manages storyboard lifecycle.
 */

import { nanoid } from 'nanoid';
import { fal } from '@fal-ai/client';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { buildStoryboardPrompt, buildNegativePrompt } from './storyboard-prompt-builder';
import { saveStoryboard, updateStoryboardScene, getStoryboard } from './storyboard-db';
import type {
  SceneDescriptor,
  StyleGuide,
  Storyboard,
  StoryboardScene,
} from './schemas/storyboard';

// Configure fal.ai if key exists
if (process.env.FAL_AI_API_KEY) {
  fal.config({ credentials: process.env.FAL_AI_API_KEY });
}

// Available image generation models
export const IMAGE_MODELS = {
  'flux-schnell': 'fal-ai/flux/schnell',
  'flux-dev': 'fal-ai/flux/dev',
  'flux-pro': 'fal-ai/flux-pro/v1.1',
  'imagen4': 'fal-ai/imagen4/preview',
  'seedream-v4': 'fal-ai/bytedance/seedream/v4/text-to-image',
  'seedream-v4.5': 'fal-ai/bytedance/seedream/v4.5/text-to-image',
  'recraft-v3': 'fal-ai/recraft-v3',
} as const;

export type ImageModelKey = keyof typeof IMAGE_MODELS;

export const IMAGE_MODEL_LABELS: Record<ImageModelKey, string> = {
  'flux-schnell': 'FLUX Schnell (Fast)',
  'flux-dev': 'FLUX Dev (Quality)',
  'flux-pro': 'FLUX Pro 1.1',
  'imagen4': 'Google Imagen 4',
  'seedream-v4': 'Seedream V4',
  'seedream-v4.5': 'Seedream V4.5',
  'recraft-v3': 'Recraft V3',
};

// Default model for storyboard generation
const DEFAULT_MODEL = 'fal-ai/flux/schnell';

// Models that support negative_prompt
const SUPPORTS_NEGATIVE_PROMPT = new Set([
  'fal-ai/flux/schnell',
  'fal-ai/flux/dev',
  'fal-ai/flux-pro/v1.1',
  'fal-ai/flux/dev/ip-adapter',
]);

// Models that use { width, height } object for image_size
const USES_IMAGE_SIZE_OBJECT = new Set([
  'fal-ai/flux/schnell',
  'fal-ai/flux/dev',
  'fal-ai/flux-pro/v1.1',
  'fal-ai/flux/dev/ip-adapter',
  'fal-ai/recraft-v3',
]);

// Per-call timeout (ms) to prevent a single slow call from blocking everything
const FAL_CALL_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Build model-specific input parameters.
 * Different fal.ai models accept different input schemas.
 */
function buildModelInput(
  modelId: string,
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
): Record<string, any> {
  const input: Record<string, any> = {
    prompt,
    num_images: 1,
    enable_safety_checker: false,
  };

  // negative_prompt — only for models that support it
  if (SUPPORTS_NEGATIVE_PROMPT.has(modelId)) {
    input.negative_prompt = negativePrompt;
  }

  // image_size — object vs string
  if (USES_IMAGE_SIZE_OBJECT.has(modelId)) {
    input.image_size = { width, height };
  } else {
    // Models like Imagen4, Seedream use aspect ratio strings or width/height directly
    input.image_size = { width, height };
    // Also send aspect_ratio as some models prefer it
    if (width > height) input.aspect_ratio = '16:9';
    else if (height > width) input.aspect_ratio = '9:16';
    else input.aspect_ratio = '1:1';
  }

  return input;
}

/**
 * Wrap a fal.ai subscribe call with a timeout.
 * Returns the result or throws if the call takes too long.
 */
async function falSubscribeWithTimeout(
  modelId: string,
  options: any,
  timeoutMs: number = FAL_CALL_TIMEOUT_MS,
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      fal.subscribe(modelId, options),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`fal.ai call timed out after ${timeoutMs / 1000}s (model: ${modelId})`)),
          timeoutMs,
        ),
      ),
    ]);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

interface ReferenceImageInput {
  subjectId: string;
  imageUrl: string;
  weight?: number;
}

interface GenerateImageOptions {
  styleGuide?: StyleGuide;
  modelId?: string;
  aspectRatio?: string;
  sceneIndex?: number;
  totalScenes?: number;
  /** Reference images for IP-adapter consistency */
  referenceImages?: ReferenceImageInput[];
}

/**
 * Generate a single storyboard image for a scene.
 *
 * Strategy when reference images are provided:
 * 1. Try IP-adapter (flux/dev) with the reference image — best consistency
 * 2. If IP-adapter fails → fall back to user's chosen model (or default) with
 *    an enriched prompt describing the subject. Consistency is lower but the
 *    scene still gets an image.
 */
export async function generateStoryboardImage(
  scene: SceneDescriptor,
  userId: string,
  options: GenerateImageOptions = {},
): Promise<{ imageUrl: string; assetId: string; modelUsed: string; gcsPath: string }> {
  const prompt = buildStoryboardPrompt(
    scene,
    options.styleGuide,
    options.sceneIndex,
    options.totalScenes,
  );
  const negativePrompt = buildNegativePrompt(options.styleGuide);

  // Determine dimensions from aspect ratio
  let width = 1280;
  let height = 720;
  if (options.aspectRatio === '9:16') {
    width = 720;
    height = 1280;
  } else if (options.aspectRatio === '1:1') {
    width = 1024;
    height = 1024;
  } else if (options.aspectRatio === '4:5') {
    width = 1080;
    height = 1350;
  }

  const hasReferences = options.referenceImages && options.referenceImages.length > 0;
  const fallbackModelId = options.modelId || DEFAULT_MODEL;

  // ─── Attempt 1: IP-adapter if we have reference images ──────────
  if (hasReferences) {
    const primaryRef = options.referenceImages![0];
    console.log(`[Storyboard] Scene ${options.sceneIndex}: Trying IP-adapter with ref ${primaryRef.subjectId} (${primaryRef.imageUrl.substring(0, 60)}...)`);

    try {
      const ipAdapterModelId = 'fal-ai/flux/dev/ip-adapter';
      const result = await falSubscribeWithTimeout(ipAdapterModelId, {
        input: {
          prompt: `${prompt}. Maintain exact visual consistency with the reference image for the main subject.`,
          ip_adapter_image_url: primaryRef.imageUrl,
          ip_adapter_scale: primaryRef.weight ?? 0.6,
          image_size: { width, height },
          num_images: 1,
          enable_safety_checker: false,
        },
        logs: false,
      });

      const data = result.data as any;
      const imageUrl = data?.images?.[0]?.url || data?.image?.url || data?.output?.url;
      if (imageUrl) {
        console.log(`[Storyboard] Scene ${options.sceneIndex}: IP-adapter SUCCESS`);
        return await downloadAndUpload(imageUrl, userId, ipAdapterModelId);
      }
      console.warn(`[Storyboard] Scene ${options.sceneIndex}: IP-adapter returned no image, falling back`);
    } catch (ipErr: any) {
      console.warn(`[Storyboard] Scene ${options.sceneIndex}: IP-adapter FAILED (${ipErr.message}), falling back to ${fallbackModelId}`);
    }
  }

  // ─── Attempt 2: Standard model (user's choice or default) ───────
  const modelId = fallbackModelId;
  console.log(`[Storyboard] Scene ${options.sceneIndex}: model=${modelId}, ${width}x${height}`);

  const input = buildModelInput(modelId, prompt, negativePrompt, width, height);
  const result = await falSubscribeWithTimeout(modelId, {
    input,
    logs: false,
  });

  const data = result.data as any;
  const imageUrl = data?.images?.[0]?.url || data?.image?.url || data?.output?.url;
  if (!imageUrl) {
    console.error(`[Storyboard] Scene ${options.sceneIndex}: No image in response. Keys:`, Object.keys(data || {}));
    throw new Error(`No image generated from fal.ai (model: ${modelId})`);
  }

  return await downloadAndUpload(imageUrl, userId, modelId);
}

/**
 * Download a generated image from fal.ai and upload to GCS.
 */
async function downloadAndUpload(
  imageUrl: string,
  userId: string,
  modelUsed: string,
): Promise<{ imageUrl: string; assetId: string; modelUsed: string; gcsPath: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to download generated image');
  const buffer = Buffer.from(await response.arrayBuffer());

  const assetId = `storyboard_${nanoid(12)}`;
  const filename = `${assetId}.png`;

  const uploadResult = await uploadToGCS(buffer, userId, filename, 'image/png');

  return {
    imageUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath,
    assetId,
    modelUsed,
  };
}

/**
 * Generate a full storyboard for all scenes.
 *
 * Concurrency: 3 for fast models, 2 when IP-adapter scenes are present.
 * Retry: 1 retry per scene (total 2 attempts) to stay within timeout.
 */
export async function generateFullStoryboard(
  scenes: SceneDescriptor[],
  options: {
    userId: string;
    styleGuide?: StyleGuide;
    modelId?: string;
    projectId?: string;
    sourceScriptId?: string;
    title?: string;
    aspectRatio?: string;
    overallMusicPrompt?: string;
    /** Map of sceneIndex → reference images for IP-adapter consistency */
    referenceImageMap?: Record<number, ReferenceImageInput[]>;
  },
): Promise<Storyboard> {
  const storyboardId = `sb_${nanoid(12)}`;
  const totalScenes = scenes.length;

  // Initialize storyboard
  const storyboard: Storyboard = {
    storyboardId,
    projectId: options.projectId,
    userId: options.userId,
    sourceScriptId: options.sourceScriptId,
    title: options.title,
    styleGuide: options.styleGuide,
    overallMusicPrompt: options.overallMusicPrompt,
    scenes: scenes.map((s) => ({
      sceneIndex: s.sceneIndex,
      descriptor: s,
      status: 'pending' as const,
      generationHistory: [],
    })),
    status: 'generating',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveStoryboard(storyboard);

  // Determine concurrency: higher when we're NOT using IP-adapter
  const hasAnyRefs = options.referenceImageMap && Object.keys(options.referenceImageMap).length > 0;
  const CONCURRENCY = hasAnyRefs ? 2 : 3;
  let completed = 0;
  let errors = 0;

  // Only 1 retry (total 2 attempts) — IP-adapter is slow, more retries risk timeout
  const MAX_RETRIES = 1;

  console.log(`[Storyboard] Starting: ${totalScenes} scenes, concurrency=${CONCURRENCY}, hasRefs=${!!hasAnyRefs}, model=${options.modelId || DEFAULT_MODEL}`);

  const generateForScene = async (sbScene: StoryboardScene) => {
    let lastError: any;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: retry ${attempt}/${MAX_RETRIES}`);
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }

        sbScene.status = 'generating';
        await updateStoryboardScene(storyboardId, sbScene.sceneIndex, {
          status: 'generating',
        });

        // Look up reference images for this scene from the referenceImageMap
        const sceneRefs = options.referenceImageMap?.[sbScene.sceneIndex];

        const result = await generateStoryboardImage(
          sbScene.descriptor,
          options.userId,
          {
            styleGuide: options.styleGuide,
            modelId: options.modelId,
            aspectRatio: options.aspectRatio,
            sceneIndex: sbScene.sceneIndex,
            totalScenes,
            referenceImages: sceneRefs,
          },
        );

        sbScene.imageAssetId = result.assetId;
        sbScene.imageUrl = result.imageUrl;
        (sbScene as any).imageGcsPath = result.gcsPath;
        sbScene.status = 'generated';
        sbScene.generationHistory.push({
          assetId: result.assetId,
          imageUrl: result.imageUrl,
          timestamp: new Date(),
          modelUsed: result.modelUsed,
        });

        await updateStoryboardScene(storyboardId, sbScene.sceneIndex, {
          imageAssetId: result.assetId,
          imageUrl: result.imageUrl,
          imageGcsPath: result.gcsPath,
          status: 'generated',
          generationHistory: sbScene.generationHistory,
        });

        completed++;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: SUCCESS in ${elapsed}s (model: ${result.modelUsed})`);
        return; // Success — exit retry loop
      } catch (err: any) {
        lastError = err;
        console.error(`[Storyboard] Scene ${sbScene.sceneIndex} attempt ${attempt + 1} failed (${((Date.now() - startTime) / 1000).toFixed(1)}s):`, err.message || err);
      }
    }

    // All retries exhausted
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Storyboard] Scene ${sbScene.sceneIndex} FAILED after ${MAX_RETRIES + 1} attempts (${elapsed}s):`, lastError?.message);
    sbScene.status = 'pending';
    errors++;
  };

  // Run with concurrency limit
  const queue = [...storyboard.scenes];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (running.length < CONCURRENCY && queue.length > 0) {
      const scene = queue.shift()!;
      const p = generateForScene(scene).then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  // Update final status
  storyboard.status = errors === 0 ? 'ready' : completed > 0 ? 'partial' : 'error';
  storyboard.updatedAt = new Date();
  await saveStoryboard(storyboard);

  console.log(`[Storyboard] Complete: ${completed} succeeded, ${errors} failed out of ${totalScenes}`);

  return storyboard;
}

/**
 * Regenerate a single scene's image with optional feedback.
 */
export async function regenerateScene(
  storyboardId: string,
  sceneIndex: number,
  userId: string,
  options: {
    feedback?: string;
    modelId?: string;
    styleGuide?: StyleGuide;
    aspectRatio?: string;
  } = {},
): Promise<StoryboardScene> {
  const storyboard = await getStoryboard(storyboardId, userId);
  if (!storyboard) throw new Error('Storyboard not found');

  const scene = storyboard.scenes.find((s) => s.sceneIndex === sceneIndex);
  if (!scene) throw new Error(`Scene ${sceneIndex} not found`);

  // Build enhanced descriptor with feedback
  const descriptor = { ...scene.descriptor };
  if (options.feedback) {
    descriptor.visualDescription =
      `${descriptor.visualDescription}. Feedback: ${options.feedback}`;
  }

  const totalScenes = storyboard.scenes.length;
  const result = await generateStoryboardImage(descriptor, userId, {
    styleGuide: options.styleGuide || storyboard.styleGuide,
    modelId: options.modelId,
    aspectRatio: options.aspectRatio,
    sceneIndex,
    totalScenes,
  });

  scene.imageAssetId = result.assetId;
  scene.imageUrl = result.imageUrl;
  scene.status = 'generated';
  scene.generationHistory.push({
    assetId: result.assetId,
    imageUrl: result.imageUrl,
    timestamp: new Date(),
    feedback: options.feedback,
    modelUsed: result.modelUsed,
  });

  await updateStoryboardScene(storyboardId, sceneIndex, {
    imageAssetId: result.assetId,
    imageUrl: result.imageUrl,
    status: 'generated',
    generationHistory: scene.generationHistory,
  });

  return scene;
}
