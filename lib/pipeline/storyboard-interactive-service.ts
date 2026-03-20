/**
 * Interactive Storyboard Service
 *
 * Handles the sequential, context-aware storyboard workflow:
 * - Scene-by-scene generation with approval gates
 * - Context-aware image-to-image generation (using previous scene as reference)
 * - Approve/reject/regenerate per scene
 */

import { nanoid } from 'nanoid';
import { fal } from '@fal-ai/client';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { buildStoryboardPrompt, buildNegativePrompt } from './storyboard-prompt-builder';
import {
  getStoryboard,
  updateStoryboardScene,
  updateSceneStatus,
  saveStoryboard,
} from './storyboard-db';
import type { Storyboard, StoryboardScene, StyleGuide } from './schemas/storyboard';

// Configure fal.ai
if (process.env.FAL_AI_API_KEY) {
  fal.config({ credentials: process.env.FAL_AI_API_KEY });
}

// Models
const TEXT_TO_IMAGE_MODEL = 'fal-ai/flux/schnell';
const IMAGE_TO_IMAGE_MODEL = 'fal-ai/flux-kontext/dev';

/**
 * Generate a single scene in the sequential flow.
 * If sceneIndex > 0, uses the previous approved scene's image as reference.
 */
export async function generateSceneSequential(
  storyboardId: string,
  sceneIndex: number,
  userId: string,
  options: {
    modelId?: string;
    aspectRatio?: string;
  } = {},
): Promise<StoryboardScene> {
  const storyboard = await getStoryboard(storyboardId, userId);
  if (!storyboard) throw new Error('Storyboard not found');

  const scene = storyboard.scenes.find((s) => s.sceneIndex === sceneIndex);
  if (!scene) throw new Error(`Scene ${sceneIndex} not found`);

  // Mark as generating
  await updateSceneStatus(storyboardId, sceneIndex, 'generating');

  try {
    const prompt = buildStoryboardPrompt(
      scene.descriptor,
      storyboard.styleGuide,
      sceneIndex,
      storyboard.scenes.length,
    );
    const negativePrompt = buildNegativePrompt(storyboard.styleGuide);

    let width = 1280;
    let height = 720;
    if (options.aspectRatio === '9:16') { width = 720; height = 1280; }
    else if (options.aspectRatio === '1:1') { width = 1024; height = 1024; }

    let result: any;

    // Scene 0: text-to-image. Scene 1+: use previous approved image as reference
    const previousScene = sceneIndex > 0
      ? storyboard.scenes.find((s) => s.sceneIndex === sceneIndex - 1)
      : null;
    const hasPreviousImage = previousScene?.status === 'approved' && previousScene.imageUrl;

    if (hasPreviousImage) {
      // Image-to-image with context
      result = await fal.subscribe(options.modelId || IMAGE_TO_IMAGE_MODEL, {
        input: {
          prompt: `${prompt}. Maintain visual consistency with the reference image — same characters, art style, and color palette.`,
          image_url: previousScene!.imageUrl,
          num_images: 1,
          enable_safety_checker: false,
        },
        logs: false,
      });
    } else {
      // Text-to-image
      result = await fal.subscribe(options.modelId || TEXT_TO_IMAGE_MODEL, {
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
      throw new Error('No image generated');
    }

    // Download and upload to GCS
    const imageResponse = await fetch(data.images[0].url);
    if (!imageResponse.ok) throw new Error('Failed to download image');
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const assetId = `sb_seq_${nanoid(12)}`;
    const filename = `${assetId}.png`;
    const uploadResult = await uploadToGCS(buffer, userId, filename, 'image/png');

    const modelUsed = hasPreviousImage
      ? (options.modelId || IMAGE_TO_IMAGE_MODEL)
      : (options.modelId || TEXT_TO_IMAGE_MODEL);

    // Update scene
    const historyEntry = {
      assetId,
      imageUrl: uploadResult.publicUrl,
      timestamp: new Date(),
      modelUsed,
    };

    await updateStoryboardScene(storyboardId, sceneIndex, {
      imageAssetId: assetId,
      imageUrl: uploadResult.publicUrl,
      status: 'generated',
      generationHistory: [...scene.generationHistory, historyEntry],
    });

    return {
      ...scene,
      imageAssetId: assetId,
      imageUrl: uploadResult.publicUrl,
      status: 'generated',
      generationHistory: [...scene.generationHistory, historyEntry],
    };
  } catch (err) {
    await updateSceneStatus(storyboardId, sceneIndex, 'pending');
    throw err;
  }
}

/**
 * Regenerate a scene with context (image-to-image using previous approved scene).
 * Accepts user feedback to modify the prompt.
 */
export async function regenerateWithContext(
  storyboardId: string,
  sceneIndex: number,
  userId: string,
  options: {
    feedback?: string;
    modelId?: string;
    referenceImageUrl?: string; // Override: use a specific reference image
  } = {},
): Promise<StoryboardScene> {
  const storyboard = await getStoryboard(storyboardId, userId);
  if (!storyboard) throw new Error('Storyboard not found');

  const scene = storyboard.scenes.find((s) => s.sceneIndex === sceneIndex);
  if (!scene) throw new Error(`Scene ${sceneIndex} not found`);

  await updateSceneStatus(storyboardId, sceneIndex, 'generating');

  try {
    // Build enhanced prompt with feedback
    const descriptor = { ...scene.descriptor };
    if (options.feedback) {
      descriptor.visualDescription =
        `${descriptor.visualDescription}. User feedback: ${options.feedback}`;
    }

    const prompt = buildStoryboardPrompt(
      descriptor,
      storyboard.styleGuide,
      sceneIndex,
      storyboard.scenes.length,
    );

    // Find reference image: explicit override > previous approved scene > current scene
    let referenceUrl = options.referenceImageUrl;
    if (!referenceUrl) {
      const prevScene = storyboard.scenes.find(
        (s) => s.sceneIndex === sceneIndex - 1 && s.status === 'approved',
      );
      referenceUrl = prevScene?.imageUrl || scene.imageUrl;
    }

    let result: any;
    const modelId = options.modelId || IMAGE_TO_IMAGE_MODEL;

    if (referenceUrl) {
      result = await fal.subscribe(modelId, {
        input: {
          prompt: `${prompt}. Maintain visual consistency with the reference.`,
          image_url: referenceUrl,
          num_images: 1,
          enable_safety_checker: false,
        },
        logs: false,
      });
    } else {
      result = await fal.subscribe(TEXT_TO_IMAGE_MODEL, {
        input: {
          prompt,
          negative_prompt: buildNegativePrompt(storyboard.styleGuide),
          image_size: { width: 1280, height: 720 },
          num_images: 1,
          enable_safety_checker: false,
        },
        logs: false,
      });
    }

    const data = result.data as any;
    if (!data?.images?.[0]?.url) throw new Error('No image generated');

    const imageResponse = await fetch(data.images[0].url);
    if (!imageResponse.ok) throw new Error('Failed to download');
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const assetId = `sb_regen_${nanoid(12)}`;
    const filename = `${assetId}.png`;
    const uploadResult = await uploadToGCS(buffer, userId, filename, 'image/png');

    const historyEntry = {
      assetId,
      imageUrl: uploadResult.publicUrl,
      timestamp: new Date(),
      feedback: options.feedback,
      modelUsed: referenceUrl ? modelId : TEXT_TO_IMAGE_MODEL,
    };

    await updateStoryboardScene(storyboardId, sceneIndex, {
      imageAssetId: assetId,
      imageUrl: uploadResult.publicUrl,
      status: 'generated',
      generationHistory: [...scene.generationHistory, historyEntry],
    });

    return {
      ...scene,
      imageAssetId: assetId,
      imageUrl: uploadResult.publicUrl,
      status: 'generated',
      generationHistory: [...scene.generationHistory, historyEntry],
    };
  } catch (err) {
    await updateSceneStatus(storyboardId, sceneIndex, 'pending');
    throw err;
  }
}

/**
 * Approve a scene.
 */
export async function approveScene(
  storyboardId: string,
  sceneIndex: number,
  userId: string,
): Promise<void> {
  const storyboard = await getStoryboard(storyboardId, userId);
  if (!storyboard) throw new Error('Storyboard not found');
  await updateSceneStatus(storyboardId, sceneIndex, 'approved');
}

/**
 * Reject a scene.
 */
export async function rejectScene(
  storyboardId: string,
  sceneIndex: number,
  userId: string,
): Promise<void> {
  const storyboard = await getStoryboard(storyboardId, userId);
  if (!storyboard) throw new Error('Storyboard not found');
  await updateSceneStatus(storyboardId, sceneIndex, 'rejected');
}
