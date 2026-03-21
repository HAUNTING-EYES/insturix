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
      // Image-to-image with context — use guidance_scale to balance
      // prompt adherence vs reference image similarity
      result = await (fal as any).subscribe(options.modelId || IMAGE_TO_IMAGE_MODEL, {
        input: {
          prompt: `${prompt}. Maintain visual consistency with the reference image — same characters, art style, and color palette.`,
          image_url: previousScene!.imageUrl,
          guidance_scale: 4.0,
          num_images: 1,
          enable_safety_checker: false,
        },
        logs: false,
      });
    } else {
      // Text-to-image
      result = await (fal as any).subscribe(options.modelId || TEXT_TO_IMAGE_MODEL, {
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
      imageUrl: uploadResult.signedUrl,
      timestamp: new Date(),
      modelUsed,
    };

    await updateStoryboardScene(storyboardId, sceneIndex, {
      imageAssetId: assetId,
      imageUrl: uploadResult.signedUrl,
      status: 'generated',
      generationHistory: [...scene.generationHistory, historyEntry],
    });

    return {
      ...scene,
      imageAssetId: assetId,
      imageUrl: uploadResult.signedUrl,
      status: 'generated',
      generationHistory: [...scene.generationHistory, historyEntry],
    };
  } catch (err) {
    await updateSceneStatus(storyboardId, sceneIndex, 'pending');
    throw err;
  }
}

/**
 * Regenerate a scene with context.
 *
 * TWO MODES based on whether feedback requests a fundamentally different subject:
 *
 * 1. EDIT MODE (feedback is a tweak: "make it darker", "change lighting"):
 *    Uses img2img with the current scene as reference + modified prompt.
 *    Lower guidance_scale so the reference image still anchors the result.
 *
 * 2. REPLACE MODE (feedback describes a NEW subject: "change to gold Apple Watch",
 *    "make it a red car instead"):
 *    Uses text-to-image from scratch — the old image would fight the new prompt.
 *    The feedback REPLACES the visual description, it doesn't append to it.
 *
 * Heuristic: if feedback contains "change to", "replace with", "make it a",
 * "switch to", "instead", "different", "new" → REPLACE mode.
 * Otherwise → EDIT mode.
 */
export async function regenerateWithContext(
  storyboardId: string,
  sceneIndex: number,
  userId: string,
  options: {
    feedback?: string;
    modelId?: string;
    referenceImageUrl?: string;
  } = {},
): Promise<StoryboardScene> {
  const storyboard = await getStoryboard(storyboardId, userId);
  if (!storyboard) throw new Error('Storyboard not found');

  const scene = storyboard.scenes.find((s) => s.sceneIndex === sceneIndex);
  if (!scene) throw new Error(`Scene ${sceneIndex} not found`);

  await updateSceneStatus(storyboardId, sceneIndex, 'generating');

  try {
    const feedback = options.feedback?.trim() || '';

    // Detect whether user wants to EDIT the existing image or REPLACE the subject entirely
    const REPLACE_SIGNALS = /\b(change\s+to|replace\s+with|make\s+it\s+a\b|switch\s+to|instead\s+of|different|swap|new\s+\w+|not\s+a\b|don'?t\s+want|remove\s+the|get\s+rid\s+of)\b/i;
    const isReplaceMode = feedback ? REPLACE_SIGNALS.test(feedback) : false;

    let prompt: string;
    let useReference = false;
    let referenceUrl: string | undefined;

    if (isReplaceMode && feedback) {
      // ─── REPLACE MODE ──────────────────────────────────────
      // Feedback describes a fundamentally new subject. Build a fresh prompt
      // where the feedback IS the primary visual description, with scene
      // context (mood, style, composition) carried over.
      console.log(`[StoryboardRegen] Scene ${sceneIndex}: REPLACE mode — "${feedback.substring(0, 80)}"`);

      const descriptor = { ...scene.descriptor };
      // Use feedback as the primary visual description, keeping scene context
      descriptor.visualDescription = `${feedback}. Scene context: ${scene.descriptor.mood} mood, ${scene.descriptor.title}`;

      prompt = buildStoryboardPrompt(
        descriptor,
        storyboard.styleGuide,
        sceneIndex,
        storyboard.scenes.length,
      );

      // In replace mode, use previous scene for style consistency (NOT current scene)
      // but only if it's a different scene — don't anchor to what we're trying to replace
      const prevScene = storyboard.scenes.find(
        (s) => s.sceneIndex === sceneIndex - 1 && (s.status === 'approved' || s.status === 'generated'),
      );
      if (prevScene?.imageUrl) {
        referenceUrl = prevScene.imageUrl;
        useReference = true;
      }
    } else {
      // ─── EDIT MODE ─────────────────────────────────────────
      // Feedback is a tweak to the existing image. Use img2img with the
      // current scene as reference, but tell the model what to change.
      console.log(`[StoryboardRegen] Scene ${sceneIndex}: EDIT mode — "${feedback.substring(0, 80)}"`);

      const descriptor = { ...scene.descriptor };
      if (feedback) {
        // Put the feedback FIRST so the model prioritizes it over the original description
        descriptor.visualDescription = `[APPLY THESE CHANGES: ${feedback}] — Original scene: ${descriptor.visualDescription}`;
      }

      prompt = buildStoryboardPrompt(
        descriptor,
        storyboard.styleGuide,
        sceneIndex,
        storyboard.scenes.length,
      );

      // Use the current scene image as reference for editing
      referenceUrl = options.referenceImageUrl || scene.imageUrl;
      useReference = !!referenceUrl;
    }

    let result: any;
    const modelId = options.modelId || IMAGE_TO_IMAGE_MODEL;

    if (useReference && referenceUrl) {
      // Image-to-image: use reference with guidance_scale to control prompt adherence
      // Higher guidance_scale = follow prompt more (important when editing)
      // For REPLACE mode with prev scene ref: very high guidance so it follows the NEW prompt
      const guidanceScale = isReplaceMode ? 7.0 : 5.0;

      result = await (fal as any).subscribe(modelId, {
        input: {
          prompt,
          image_url: referenceUrl,
          guidance_scale: guidanceScale,
          num_images: 1,
          enable_safety_checker: false,
        },
        logs: false,
      });
    } else {
      // Text-to-image from scratch (no reference available)
      result = await (fal as any).subscribe(TEXT_TO_IMAGE_MODEL, {
        input: {
          prompt,
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
      imageUrl: uploadResult.signedUrl,
      timestamp: new Date(),
      feedback: options.feedback,
      modelUsed: useReference ? modelId : TEXT_TO_IMAGE_MODEL,
    };

    await updateStoryboardScene(storyboardId, sceneIndex, {
      imageAssetId: assetId,
      imageUrl: uploadResult.signedUrl,
      status: 'generated',
      generationHistory: [...scene.generationHistory, historyEntry],
    });

    return {
      ...scene,
      imageAssetId: assetId,
      imageUrl: uploadResult.signedUrl,
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
