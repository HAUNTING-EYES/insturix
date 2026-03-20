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
// vs models that use a string like "landscape_16_9"
const USES_IMAGE_SIZE_OBJECT = new Set([
  'fal-ai/flux/schnell',
  'fal-ai/flux/dev',
  'fal-ai/flux-pro/v1.1',
  'fal-ai/flux/dev/ip-adapter',
  'fal-ai/recraft-v3',
]);

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

  // Use IP-adapter model when reference images are available for visual consistency
  const hasReferences = options.referenceImages && options.referenceImages.length > 0;
  const modelId = hasReferences
    ? 'fal-ai/flux/dev/ip-adapter'
    : (options.modelId || DEFAULT_MODEL);

  console.log(`[Storyboard] Scene ${options.sceneIndex}: model=${modelId}, ${width}x${height}, refs=${hasReferences ? options.referenceImages!.length : 0}`);

  let result;
  if (hasReferences) {
    const primaryRef = options.referenceImages![0];
    console.log(`[Storyboard] Scene ${options.sceneIndex}: Using IP-adapter with ref ${primaryRef.subjectId}`);
    result = await fal.subscribe(modelId, {
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
  } else {
    const input = buildModelInput(modelId, prompt, negativePrompt, width, height);
    result = await fal.subscribe(modelId, {
      input,
      logs: false,
    });
  }

  const data = result.data as any;
  // Different models return images in different structures
  const imageUrl = data?.images?.[0]?.url || data?.image?.url || data?.output?.url;
  if (!imageUrl) {
    console.error(`[Storyboard] Scene ${options.sceneIndex}: No image in response. Keys:`, Object.keys(data || {}));
    throw new Error(`No image generated from fal.ai (model: ${modelId})`);
  }

  // Download and upload to GCS
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
    modelUsed: modelId,
  };
}

/**
 * Generate a full storyboard for all scenes.
 * Runs up to 2 concurrent image generations with retry.
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

  // Generate images with concurrency limit of 2 (avoid fal.ai rate limits)
  const CONCURRENCY = 2;
  let completed = 0;
  let errors = 0;

  const MAX_RETRIES = 2;

  const generateForScene = async (sbScene: StoryboardScene) => {
    let lastError: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: retry ${attempt}/${MAX_RETRIES}`);
          // Brief delay before retry to avoid rate limits
          await new Promise((r) => setTimeout(r, 2000 * attempt));
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
        return; // Success — exit retry loop
      } catch (err: any) {
        lastError = err;
        console.error(`[Storyboard] Scene ${sbScene.sceneIndex} attempt ${attempt + 1} failed:`, err.message || err);
      }
    }

    // All retries exhausted
    console.error(`[Storyboard] Scene ${sbScene.sceneIndex} FAILED after ${MAX_RETRIES + 1} attempts:`, lastError?.message);
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
