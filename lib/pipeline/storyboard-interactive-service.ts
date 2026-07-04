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
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { buildStoryboardPrompt, buildNegativePrompt } from './storyboard-prompt-builder';
import {
  getStoryboard,
  updateStoryboardScene,
  updateSceneStatus,
  saveStoryboard,
} from './storyboard-db';
import { prioritizeStoryboardReferencesForScene } from './storyboard-reference-priority';
import type { Storyboard, StoryboardScene, StyleGuide } from './schemas/storyboard';

// Configure fal.ai
if (process.env.FAL_AI_API_KEY) {
  fal.config({ credentials: process.env.FAL_AI_API_KEY });
}

// Models
const TEXT_TO_IMAGE_MODEL = 'fal-ai/flux/schnell';
const IMAGE_TO_IMAGE_MODEL = 'fal-ai/flux-kontext/dev';
// The old fal-ai/flux/dev/ip-adapter endpoint was removed.
// flux-general supports reference_image_url + reference_strength natively.
const IP_ADAPTER_MODEL = 'fal-ai/flux-general';

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
    const seqSceneRefs = prioritizeStoryboardReferencesForScene(
      scene.descriptor,
      storyboard.approvedReferences?.filter((ref) => ref.scenesAppearingIn.includes(sceneIndex)) ?? [],
    );

    // Build reference subject descriptions for prompt enrichment.
    // Ensures fallback images still describe the reference subjects textually.
    let refDescriptionSuffix = '';
    if (seqSceneRefs.length > 0) {
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

    if (seqSceneRefs.length > 0) {
      const primaryRef = seqSceneRefs[0];
      // Use reference weight from the reference object, default 0.7 for stronger product consistency
      const seqIpWeight = primaryRef.weight ?? 0.7;
      console.log(`[StoryboardSeq] Scene ${sceneIndex}: Trying IP-adapter with ref "${primaryRef.name}" (weight=${seqIpWeight})`);

      try {
        const cleanRefUrl = await cleanUrlForFal(primaryRef.imageUrl);
        result = await (fal as any).subscribe(IP_ADAPTER_MODEL, {
          input: {
            prompt: `${prompt}. Maintain exact visual consistency with the reference image for ${primaryRef.name}. The ${primaryRef.name} must match the reference precisely.`,
            reference_image_url: cleanRefUrl,
            reference_strength: seqIpWeight,
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
    const uploadResult = await uploadMedia(buffer, userId, filename, 'image/png', { customAssetId: assetId });

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
 * THREE MODES based on feedback intent:
 *
 * 1. REFERENCE_MATCH MODE (feedback wants stricter reference adherence):
 *    Boosts IP-adapter weight to 0.85 for tighter subject matching.
 *    Detected via generic consistency signals + approved reference name mentions.
 *
 * 2. REPLACE MODE (feedback describes a fundamentally different subject):
 *    Uses text-to-image from scratch — the old image would fight the new prompt.
 *    The feedback REPLACES the visual description, it doesn't append to it.
 *
 * 3. EDIT MODE (feedback is a tweak: "make it darker", "change lighting"):
 *    Uses img2img with the current scene as reference + modified prompt.
 *    Lower guidance_scale so the reference image still anchors the result.
 *
 * Intent detection is generic — no hardcoded product/subject names.
 * Subject names are pulled from the storyboard's approved references at runtime.
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

    // ─── Detect feedback intent ────────────────────────────────────
    // Three modes based on user intent — NO hardcoded subject/product names.
    // The actual subject name comes from the storyboard's approved references.
    //
    //   REFERENCE_MATCH — user wants stricter adherence to approved reference images
    //     Intent signals: matching, consistency, sameness, correctness complaints
    //   REPLACE — user wants a fundamentally different subject
    //     Intent signals: change to, replace with, switch to, something else
    //   EDIT — user wants a tweak to the existing image (default)
    //     Intent signals: everything else (darker, brighter, more contrast, etc.)

    // Also check if any approved reference name appears in the feedback — if the user
    // mentions a reference subject by name + a consistency word, that's a match signal.
    const sceneRefsForDetection = prioritizeStoryboardReferencesForScene(
      scene.descriptor,
      storyboard.approvedReferences?.filter((ref) => ref.scenesAppearingIn.includes(sceneIndex)) ?? [],
    );
    const refNameMentioned = sceneRefsForDetection.some(
      (ref) => ref.name && feedback.toLowerCase().includes(ref.name.toLowerCase()),
    );

    // Generic consistency-intent signals — works for any subject type
    const REFERENCE_MATCH_SIGNALS = /\b(match\s+(the\s+)?reference|like\s+(the\s+)?(other|rest|remaining)\s+(scene|image|frame)s?|consistent\s+with|use\s+(the\s+)?reference|match\s+(the\s+)?(other|rest)|similar\s+to\s+(the\s+)?(other|rest|reference)|keep\s+(it\s+)?(consistent|same)|make\s+(it\s+)?match|doesn'?t?\s+match|not\s+matching|wrong\s+\w+|same\s+as\s+(the\s+)?(other|rest|reference)|should\s+(be|look)\s+(the\s+)?same|looks?\s+different|doesn'?t?\s+look\s+(right|correct|like)|fix\s+(the\s+)?(consistency|mismatch)|inconsistent)\b/i;
    const isReferenceMatchMode = feedback
      ? REFERENCE_MATCH_SIGNALS.test(feedback) || (!!refNameMentioned && /\b(match|same|consistent|fix|correct|wrong|like)\b/i.test(feedback))
      : false;

    const REPLACE_SIGNALS = /\b(change\s+to|replace\s+with|make\s+it\s+a\b|switch\s+to|instead\s+of|not\s+a\b|don'?t\s+want|remove\s+the|get\s+rid\s+of|completely\s+different|something\s+else|use\s+a\s+different|swap\s+(it|out|for))\b/i;
    const isReplaceMode = !isReferenceMatchMode && feedback ? REPLACE_SIGNALS.test(feedback) : false;

    let prompt: string;
    let useReference = false;
    let referenceUrl: string | undefined;
    // IP-adapter weight: 0.6 default, boosted to 0.85 when user explicitly wants reference matching
    let ipAdapterWeight = isReferenceMatchMode ? 0.85 : 0.6;

    if (isReferenceMatchMode && feedback) {
      // ─── REFERENCE MATCH MODE ──────────────────────────────
      // User wants stricter adherence to the approved reference image.
      // Use HIGHER IP-adapter weight (0.85) and explicit matching language.
      // Subject names come from the storyboard's approved references — never hardcoded.
      const refNames = sceneRefsForDetection.map((r) => r.name).filter(Boolean);
      const refSubjectLabel = refNames.length > 0 ? refNames.join(', ') : 'the main subject';

      console.log(`[StoryboardRegen] Scene ${sceneIndex}: REFERENCE_MATCH mode (ipWeight=${ipAdapterWeight}, subjects=[${refSubjectLabel}]) — "${feedback.substring(0, 80)}"`);

      const descriptor = { ...scene.descriptor };
      // Reinforce reference matching using the actual subject name(s) from approved references
      descriptor.visualDescription = `[CRITICAL: ${refSubjectLabel} must EXACTLY match the approved reference image — ${feedback}] ${descriptor.visualDescription}`;

      prompt = buildStoryboardPrompt(
        descriptor,
        storyboard.styleGuide,
        sceneIndex,
        storyboard.scenes.length,
      );

      // Use current scene for composition reference, but IP-adapter will override the subject
      referenceUrl = options.referenceImageUrl || scene.imageUrl;
      useReference = !!referenceUrl;
    } else if (isReplaceMode && feedback) {
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
        // Rewrite the visual description to incorporate feedback directly.
        // Text-to-image models don't understand instruction formats like "[APPLY CHANGES: ...]"
        // They need the FINAL desired visual description, not editing instructions.
        descriptor.visualDescription = `${descriptor.visualDescription}. Important: ${feedback}.`;
      }

      prompt = buildStoryboardPrompt(
        descriptor,
        storyboard.styleGuide,
        sceneIndex,
        storyboard.scenes.length,
      );

      // Check if feedback changes composition (people count, subject, layout).
      // If so, DON'T use original image as reference — it has the WRONG composition
      // and IP-adapter will reproduce it regardless of text prompt.
      const changesComposition = feedback ? /\b(\d+\s+people|\d+\s+person|fewer|more|less|remove|add|only\s+\d+|just\s+\d+|single|alone|group|crowd)\b/i.test(feedback) : false;
      if (changesComposition) {
        console.log(`[StoryboardRegen] Scene ${sceneIndex}: EDIT mode, composition change detected — NOT using original as reference`);
        referenceUrl = undefined;
        useReference = false;
      } else {
        referenceUrl = options.referenceImageUrl || scene.imageUrl;
        useReference = !!referenceUrl;
      }
    }

    let result: any;
    const modelId = options.modelId || IMAGE_TO_IMAGE_MODEL;

    // ─── Attempt IP-adapter with approved reference images ─────────
    // If the storyboard has approved references for this scene, try IP-adapter first
    // for visual consistency. Falls back to REPLACE/EDIT img2img if IP-adapter fails.
    // Re-use the refs already fetched for intent detection above.
    const sceneRefs = sceneRefsForDetection;
    const hasApprovedRefs = sceneRefs.length > 0;
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
      console.log(`[StoryboardRegen] Scene ${sceneIndex}: Trying IP-adapter with ref "${primaryRef.name}" (weight=${ipAdapterWeight}, refMatch=${isReferenceMatchMode})`);

      try {
        const cleanRefUrl = await cleanUrlForFal(primaryRef.imageUrl);

        // Reference match mode: stronger prompt + higher weight for strict adherence
        const ipPromptSuffix = isReferenceMatchMode
          ? `. CRITICAL: The ${primaryRef.name} in this scene MUST exactly match the reference image. Same design, same proportions, same visual details. Maintain perfect visual consistency.`
          : `. Maintain exact visual consistency with the reference image for ${primaryRef.name}.`;

        result = await (fal as any).subscribe(IP_ADAPTER_MODEL, {
          input: {
            prompt: `${prompt}${ipPromptSuffix}`,
            reference_image_url: cleanRefUrl,
            reference_strength: ipAdapterWeight,
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
    const uploadResult = await uploadMedia(buffer, userId, filename, 'image/png', { customAssetId: assetId });

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
