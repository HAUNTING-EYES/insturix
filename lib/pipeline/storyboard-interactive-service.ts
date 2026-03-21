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
const IP_ADAPTER_MODEL = 'fal-ai/flux/dev/ip-adapter';

/**
 * Clean a GCS signed URL for use with fal.ai models.
 * GCS URLs with query params (X-Goog-...) cause failures in IP-adapter.
 * Re-uploads to fal.ai CDN to get a clean URL.
 */
async function cleanUrlForFal(url: string): Promise<string> {
  if (!url.includes('?')) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    const file = new File([blob], `ref_${nanoid(8)}.png`, { type: 'image/png' });
    const cleanUrl = await fal.storage.upload(file);
    console.log(`[StoryboardInteractive] Re-uploaded ref to CDN: ${cleanUrl.substring(0, 60)}...`);
    return cleanUrl;
  } catch (err: any) {
    console.warn(`[StoryboardInteractive] URL cleanup failed (${err.message}), using original`);
    return url;
  }
}

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
    const basePrompt = buildStoryboardPrompt(
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
    let usedIpAdapter = false;

    // ─── Try IP-adapter with approved reference images first ──────
    const seqSceneRefs = storyboard.approvedReferences?.filter(
      (ref) => ref.scenesAppearingIn.includes(sceneIndex),
    );

    // Build reference subject descriptions for prompt enrichment.
    // Ensures fallback images still describe the reference subjects textually.
    let refDescriptionSuffix = '';
    if (seqSceneRefs && seqSceneRefs.length > 0) {
      const refDescs = seqSceneRefs
        .filter((r) => r.visualDescription || r.name)
        .map((r) => {
          if (r.visualDescription) return `${r.name}: ${r.visualDescription}`;
          return `featuring ${r.name}`;
        });
      if (refDescs.length > 0) {
        refDescriptionSuffix = `. Key subjects: ${refDescs.join('; ')}`;
      }
    }
    const prompt = refDescriptionSuffix ? `${basePrompt}${refDescriptionSuffix}` : basePrompt;

    if (seqSceneRefs && seqSceneRefs.length > 0) {
      const primaryRef = seqSceneRefs[0];
      console.log(`[StoryboardSeq] Scene ${sceneIndex}: Trying IP-adapter with ref "${primaryRef.name}"`);

      try {
        const cleanRefUrl = await cleanUrlForFal(primaryRef.imageUrl);
        result = await (fal as any).subscribe(IP_ADAPTER_MODEL, {
          input: {
            prompt: `${prompt}. Maintain exact visual consistency with the reference image for ${primaryRef.name}.`,
            ip_adapter_image_url: cleanRefUrl,
            ip_adapter_scale: 0.6,
            image_size: { width, height },
            num_images: 1,
            enable_safety_checker: false,
          },
          logs: false,
        });

        const ipData = result.data as any;
        if (ipData?.images?.[0]?.url) {
          console.log(`[StoryboardSeq] Scene ${sceneIndex}: IP-adapter SUCCESS`);
          usedIpAdapter = true;
        } else {
          console.warn(`[StoryboardSeq] Scene ${sceneIndex}: IP-adapter returned no image, falling back`);
        }
      } catch (ipErr: any) {
        console.warn(`[StoryboardSeq] Scene ${sceneIndex}: IP-adapter FAILED (${ipErr.message}), falling back`);
      }
    }

    // ─── Fallback: previous-scene img2img or text-to-image ────────
    if (!usedIpAdapter) {
      // Scene 0: text-to-image. Scene 1+: use previous approved image as reference
      const previousScene = sceneIndex > 0
        ? storyboard.scenes.find((s) => s.sceneIndex === sceneIndex - 1)
        : null;
      const hasPreviousImage = previousScene?.status === 'approved' && previousScene.imageUrl;

      if (hasPreviousImage) {
        const cleanPrevUrl = await cleanUrlForFal(previousScene!.imageUrl!);
        result = await (fal as any).subscribe(options.modelId || IMAGE_TO_IMAGE_MODEL, {
          input: {
            prompt: `${prompt}. Maintain visual consistency with the reference image — same characters, art style, and color palette.`,
            image_url: cleanPrevUrl,
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

    const modelUsed = usedIpAdapter
      ? IP_ADAPTER_MODEL
      : (options.modelId || TEXT_TO_IMAGE_MODEL);

    // Update scene
    const historyEntry = {
      assetId,
      imageUrl: uploadResult.signedUrl,
      timestamp: new Date(),
      modelUsed,
      usedIpAdapter,
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
    const REPLACE_SIGNALS = /\b(change\s+to|replace\s+with|make\s+it\s+a\b|switch\s+to|instead\s+of|new\s+(subject|item|object|product|person|character|vehicle|car|watch|phone|device|thing)|not\s+a\b|don'?t\s+want|remove\s+the|get\s+rid\s+of|completely\s+different|something\s+else|use\s+a\s+different)\b/i;
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

    // ─── Attempt IP-adapter with approved reference images ─────────
    // If the storyboard has approved references for this scene, try IP-adapter first
    // for visual consistency. Falls back to REPLACE/EDIT img2img if IP-adapter fails.
    const sceneRefs = storyboard.approvedReferences?.filter(
      (ref) => ref.scenesAppearingIn.includes(sceneIndex),
    );
    const hasApprovedRefs = sceneRefs && sceneRefs.length > 0;
    let ipAdapterSucceeded = false;

    // Enrich prompt with reference subject descriptions for consistency.
    // This helps both IP-adapter (reinforces visual cues) and fallback (textual guidance).
    if (hasApprovedRefs) {
      const refDescs = sceneRefs
        .filter((r) => r.visualDescription || r.name)
        .map((r) => {
          if (r.visualDescription) return `${r.name}: ${r.visualDescription}`;
          return `featuring ${r.name}`;
        });
      if (refDescs.length > 0) {
        prompt += `. Key subjects: ${refDescs.join('; ')}`;
      }
    }

    if (hasApprovedRefs) {
      const primaryRef = sceneRefs[0];
      console.log(`[StoryboardRegen] Scene ${sceneIndex}: Trying IP-adapter with ref "${primaryRef.name}" (${primaryRef.imageUrl.substring(0, 60)}...)`);

      try {
        const cleanRefUrl = await cleanUrlForFal(primaryRef.imageUrl);

        result = await (fal as any).subscribe(IP_ADAPTER_MODEL, {
          input: {
            prompt: `${prompt}. Maintain exact visual consistency with the reference image for ${primaryRef.name}.`,
            ip_adapter_image_url: cleanRefUrl,
            ip_adapter_scale: 0.6,
            image_size: { width: 1280, height: 720 },
            num_images: 1,
            enable_safety_checker: false,
          },
          logs: false,
        });

        const ipData = result.data as any;
        if (ipData?.images?.[0]?.url) {
          console.log(`[StoryboardRegen] Scene ${sceneIndex}: IP-adapter SUCCESS`);
          ipAdapterSucceeded = true;
        } else {
          console.warn(`[StoryboardRegen] Scene ${sceneIndex}: IP-adapter returned no image, falling back`);
        }
      } catch (ipErr: any) {
        console.warn(`[StoryboardRegen] Scene ${sceneIndex}: IP-adapter FAILED (${ipErr.message}), falling back to img2img`);
      }
    }

    // ─── Fallback: REPLACE/EDIT img2img or text-to-image ──────────
    if (!ipAdapterSucceeded) {
      if (useReference && referenceUrl) {
        // Image-to-image: use reference with guidance_scale to control prompt adherence
        // Higher guidance_scale = follow prompt more (important when editing)
        // For REPLACE mode with prev scene ref: very high guidance so it follows the NEW prompt
        const guidanceScale = isReplaceMode ? 7.0 : 5.0;

        // Clean the reference URL for fal.ai compatibility
        const cleanRef = await cleanUrlForFal(referenceUrl);

        result = await (fal as any).subscribe(modelId, {
          input: {
            prompt,
            image_url: cleanRef,
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
    }

    const data = result.data as any;
    if (!data?.images?.[0]?.url) throw new Error('No image generated');

    const imageResponse = await fetch(data.images[0].url);
    if (!imageResponse.ok) throw new Error('Failed to download');
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const assetId = `sb_regen_${nanoid(12)}`;
    const filename = `${assetId}.png`;
    const uploadResult = await uploadToGCS(buffer, userId, filename, 'image/png');

    const actualModelUsed = ipAdapterSucceeded
      ? IP_ADAPTER_MODEL
      : (useReference ? modelId : TEXT_TO_IMAGE_MODEL);

    const historyEntry = {
      assetId,
      imageUrl: uploadResult.signedUrl,
      timestamp: new Date(),
      feedback: options.feedback,
      modelUsed: actualModelUsed,
      usedIpAdapter: ipAdapterSucceeded,
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
