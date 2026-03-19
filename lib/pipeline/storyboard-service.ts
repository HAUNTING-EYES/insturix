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

interface GenerateImageOptions {
  styleGuide?: StyleGuide;
  modelId?: string;
  aspectRatio?: string;
  sceneIndex?: number;
  totalScenes?: number;
}

/**
 * Generate a single storyboard image for a scene.
 */
export async function generateStoryboardImage(
  scene: SceneDescriptor,
  userId: string,
  options: GenerateImageOptions = {},
): Promise<{ imageUrl: string; assetId: string; modelUsed: string }> {
  const modelId = options.modelId || DEFAULT_MODEL;
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

  // Call fal.ai
  const result = await fal.subscribe(modelId, {
    input: {
      prompt,
      negative_prompt: negativePrompt,
      image_size: { width, height },
      num_images: 1,
      enable_safety_checker: false,
    },
    logs: false,
  });

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
  const gcsPath = `storyboards/${userId}/${assetId}.png`;

  const uploadResult = await uploadToGCS(buffer, gcsPath, 'image/png');

  return {
    imageUrl: uploadResult.signedUrl,
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

      const result = await generateStoryboardImage(
        sbScene.descriptor,
        options.userId,
        {
          styleGuide: options.styleGuide,
          modelId: options.modelId,
          aspectRatio: options.aspectRatio,
          sceneIndex: sbScene.sceneIndex,
          totalScenes,
        },
      );

      sbScene.imageAssetId = result.assetId;
      sbScene.imageUrl = result.imageUrl;
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
