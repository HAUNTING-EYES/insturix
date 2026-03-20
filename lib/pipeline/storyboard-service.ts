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

// Default model for storyboard generation
const DEFAULT_MODEL = 'fal-ai/flux/schnell';

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
  }

  // Use IP-adapter model when reference images are available for visual consistency
  const hasReferences = options.referenceImages && options.referenceImages.length > 0;
  const modelId = hasReferences
    ? 'fal-ai/flux/dev/ip-adapter'
    : (options.modelId || DEFAULT_MODEL);

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
    result = await fal.subscribe(modelId, {
      input: {
        prompt,
        negative_prompt: negativePrompt,
        image_size: { width, height },
        num_images: 1,
        enable_safety_checker: false,
      },
      logs: false,
    });
  }

  const data = result.data as any;
  if (!data?.images?.[0]?.url) {
    throw new Error('No image generated from fal.ai');
  }

  const generatedUrl = data.images[0].url;

  // Download and upload to GCS
  const response = await fetch(generatedUrl);
  if (!response.ok) throw new Error('Failed to download generated image');
  const buffer = Buffer.from(await response.arrayBuffer());

  const assetId = `storyboard_${nanoid(12)}`;
  const filename = `${assetId}.png`;

  // uploadToGCS signature: (file, userId, filename, contentType)
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
 * Runs up to 3 concurrent image generations.
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

  // Generate images with concurrency limit of 3
  const CONCURRENCY = 3;
  let completed = 0;
  let errors = 0;

  const generateForScene = async (sbScene: StoryboardScene) => {
    try {
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
    } catch (err) {
      console.error(`[Storyboard] Scene ${sbScene.sceneIndex} failed:`, err);
      sbScene.status = 'pending'; // can retry later
      errors++;
    }
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
