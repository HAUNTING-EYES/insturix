/**
 * Reference Image Generation Service — v2
 *
 * Generates reference images for key visual subjects identified by the LLM.
 * These references are used during storyboard generation (via IP-adapter)
 * to maintain visual consistency across scenes.
 *
 * KEY IMPROVEMENTS (v2):
 * - LLM prompt refinement: raw visual descriptions are rewritten by Gemini
 *   into optimized image-generation prompts before being sent to the model.
 * - Better default model: uses flux-dev instead of flux-schnell.
 * - Subject-first prompt structure: the subject description is the most
 *   prominent part of the prompt, not buried under generic tokens.
 * - Per-model input adaptation: different fal.ai models need different
 *   parameter shapes.
 */

import { fal } from '@fal-ai/client';
import { nanoid } from 'nanoid';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { saveReferenceImageSet, updateSubjectReference } from './reference-image-db';
import type { ReferenceImageSet, SubjectReference } from './schemas/reference-image';
import type { ExtractedSubject } from './llm-scene-parser';
import { IMAGE_MODELS, type ImageModelKey } from './storyboard-service';
import { DEFAULT_CONFIG } from '@/lib/editron/config/editron-config';
import { falRetry } from './fal-retry';

// Configure fal.ai
let _falConfigured = false;
function ensureFalConfig() {
  if (_falConfigured) return;
  if (process.env.FAL_AI_API_KEY) {
    fal.config({ credentials: process.env.FAL_AI_API_KEY });
    _falConfigured = true;
  }
}

// Better default — flux-dev is significantly higher quality than schnell
// for reference images where accuracy matters more than speed.
const DEFAULT_MODEL = 'fal-ai/flux/dev';
const FALLBACK_MODEL = 'fal-ai/flux/schnell';

// ─── LLM Prompt Refinement ─────────────────────────────────────

function getGeminiProvider() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
}

/**
 * Use Gemini to rewrite a raw visual description into a high-quality
 * image generation prompt. This is the key to dramatically better results.
 *
 * Cost: ~$0.00003 per subject (Gemini Flash, ~300 tokens)
 */
async function refineReferencePrompt(
  subjectName: string,
  rawDescription: string,
  category: string,
  artStyle?: string,
): Promise<string> {
  const google = getGeminiProvider();
  if (!google) {
    // No Gemini key — fall back to basic prompt building
    return buildBasicPrompt(rawDescription, category, artStyle);
  }

  try {
    const model = google(DEFAULT_CONFIG.aiModels.referencePromptModel);

    const { text } = await generateText({
      model,
      prompt: `You are ReferencePromptMaster — the world's best AI image prompt engineer.

Your job: take a raw subject description and rewrite it into a PERFECT image generation prompt for creating a reference sheet image of "${subjectName}".

=== RAW DESCRIPTION ===
${rawDescription}

=== SUBJECT CATEGORY ===
${category}

=== ART STYLE ===
${artStyle || 'cinematic / photorealistic'}

=== YOUR TASK ===
Write ONE optimized prompt (no explanations, no markdown, just the raw prompt text).

CRITICAL RULES:
1. SUBJECT FIRST — Start with the most important visual details of the subject: what it IS, its defining features, colors, materials, proportions, textures. This is 70% of the prompt.
2. ISOLATION — The subject must be rendered ALONE against a clean, simple background. No other objects, no scene, no environment clutter. For characters: full body, centered. For products: centered, studio lighting.
3. ACCURACY — Every specific detail from the raw description MUST be preserved. If the description mentions a specific color, material, shape, or feature, the prompt MUST include it verbatim. Do NOT generalize or abstract away details.
4. STYLE COHERENCE — End with 2-3 style tokens matching "${artStyle || 'cinematic'}". Examples:
   - cinematic → "cinematic studio photography, shallow depth of field, color graded"
   - anime → "anime character sheet, cel-shaded, clean linework"
   - 3d-render → "Octane render, volumetric lighting, subsurface scattering"
5. KEEP IT DENSE — Under 120 words. No filler. Every word earns its place.
6. NO META — No "A reference image of...", no "This shows...", no markdown. Just the description.

BAD PROMPT: "A beautiful subject, professional lighting, high quality, detailed" → too vague, no specifics
GOOD PROMPT: Lead with exact visual attributes (shape, materials, colors, textures, proportions, distinguishing features), then pose/composition, then background isolation, then style tokens. Every detail from the raw description must be present.

Write the optimized prompt now:`,
    });

    const refined = text.trim();
    if (refined.length > 30) {
      console.log(`[RefImage] LLM refined prompt for "${subjectName}": "${refined.substring(0, 100)}..."`);
      return refined;
    }
  } catch (err: any) {
    console.warn(`[RefImage] LLM refinement failed for "${subjectName}": ${err.message}. Using basic prompt.`);
  }

  return buildBasicPrompt(rawDescription, category, artStyle);
}

/**
 * Basic prompt building — fallback when LLM is not available.
 * Still much better structured than the old version.
 */
function buildBasicPrompt(
  visualDescription: string,
  category: string,
  artStyle?: string,
): string {
  // Subject description is ALWAYS first and most prominent
  const parts: string[] = [visualDescription.trim()];

  // Minimal isolation cue — don't overwhelm the subject with boilerplate
  switch (category) {
    case 'character':
      parts.push('full body, centered, clean neutral background, studio lighting');
      break;
    case 'product':
      parts.push('centered on white background, studio product photography');
      break;
    case 'vehicle':
      parts.push('three-quarter angle, clean background, automotive lighting');
      break;
    case 'location':
      parts.push('establishing shot, clear composition');
      break;
    default:
      parts.push('centered, clean background, studio lighting');
  }

  // Style — short and targeted
  if (artStyle) {
    const styleKey = artStyle.toLowerCase().replace(/\s+/g, '-');
    const SHORT_STYLE: Record<string, string> = {
      cinematic: 'cinematic photography, shallow depth of field, color graded',
      photorealistic: 'photorealistic, DSLR quality, razor sharp focus',
      anime: 'anime style, cel-shaded, clean linework',
      cartoon: 'cartoon style, bold outlines, flat colors',
      '3d-render': '3D render, Octane quality, volumetric lighting',
      fantasy: 'fantasy concept art, painterly, rich detail',
      cyberpunk: 'cyberpunk aesthetic, neon accents, high tech',
      'comic-book': 'comic book art, bold ink outlines, graphic novel style',
      watercolor: 'watercolor illustration, soft washes, paper texture',
      'oil-painting': 'oil painting, impasto brushwork, classical',
      sketch: 'pencil sketch, expressive linework, hand-drawn',
      noir: 'film noir, high contrast black and white, dramatic shadows',
      minimalist: 'minimalist flat design, clean geometric, restrained palette',
      superhero: 'superhero concept art, dynamic, vivid colors, Marvel style',
      'sci-fi': 'sci-fi concept art, futuristic, volumetric lighting',
    };
    parts.push(SHORT_STYLE[styleKey] || `${artStyle} style`);
  } else {
    parts.push('professional quality, sharp detail');
  }

  return parts.join(', ');
}

// ─── Per-model input adaptation ─────────────────────────────────
// Different fal.ai models expect different input shapes.

function buildModelInput(
  modelId: string,
  prompt: string,
): Record<string, any> {
  const base: Record<string, any> = {
    prompt,
    num_images: 1,
    enable_safety_checker: false,
  };

  // Flux models
  if (modelId.includes('flux')) {
    base.image_size = { width: 1024, height: 1024 };
    return base;
  }

  // Imagen 4
  if (modelId.includes('imagen')) {
    base.image_size = { width: 1024, height: 1024 };
    return base;
  }

  // Seedream
  if (modelId.includes('seedream')) {
    base.image_size = { width: 1024, height: 1024 };
    return base;
  }

  // Recraft V3
  if (modelId.includes('recraft')) {
    base.image_size = { width: 1024, height: 1024 };
    return base;
  }

  // Default
  base.image_size = { width: 1024, height: 1024 };
  return base;
}

// ─── Core Generation ────────────────────────────────────────────

/**
 * Generate a single reference image for a subject.
 *
 * Flow:
 * 1. Resolve model (user choice > default flux-dev)
 * 2. LLM-refine the visual description into an optimized prompt
 * 3. Build model-specific input
 * 4. Generate image via fal.ai
 * 5. Upload to GCS
 */
export async function generateReferenceImage(
  subject: SubjectReference,
  userId: string,
  options: { artStyle?: string; modelId?: string } = {},
): Promise<{ imageUrl: string; assetId: string; gcsPath: string }> {
  ensureFalConfig();

  // Resolve model
  let modelId = DEFAULT_MODEL;
  if (options.modelId) {
    if (options.modelId in IMAGE_MODELS) {
      modelId = IMAGE_MODELS[options.modelId as ImageModelKey];
    } else {
      modelId = options.modelId;
    }
  }

  // LLM-refine the prompt (the biggest quality improvement)
  const prompt = await refineReferencePrompt(
    subject.name,
    subject.visualDescription,
    subject.category || 'object',
    options.artStyle,
  );

  console.log(`[RefImage] Subject "${subject.name}": model=${modelId}, prompt="${prompt.substring(0, 150)}..."`);

  const input = buildModelInput(modelId, prompt);

  let result: any;
  try {
    // Bundle 4 Toyota A.fal.ai.1 fix: retry transient errors (429/5xx/network)
    result = await falRetry(
      () => (fal as any).subscribe(modelId, { input, logs: false }),
      { maxRetries: 3, label: `ref-image ${subject.name} (${modelId})` },
    );
  } catch (err: any) {
    // If the chosen model fails (after retries), try fallback
    if (modelId !== FALLBACK_MODEL) {
      console.warn(`[RefImage] ${modelId} failed after retries (${err.message}), trying ${FALLBACK_MODEL}`);
      result = await falRetry(
        () =>
          (fal as any).subscribe(FALLBACK_MODEL, {
            input: buildModelInput(FALLBACK_MODEL, prompt),
            logs: false,
          }),
        { maxRetries: 2, label: `ref-image ${subject.name} (fallback ${FALLBACK_MODEL})` },
      );
    } else {
      throw err;
    }
  }

  const data = result.data as any;
  const imageUrl = data?.images?.[0]?.url || data?.image?.url || data?.output?.url;
  if (!imageUrl) {
    console.error(`[RefImage] No image in response. Keys:`, Object.keys(data || {}));
    throw new Error(`No reference image generated from fal.ai (model: ${modelId})`);
  }

  // Download and upload to GCS
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to download generated reference image');
  const buffer = Buffer.from(await response.arrayBuffer());

  const assetId = `ref_${nanoid(12)}`;
  const filename = `${assetId}.png`;
  const uploadResult = await uploadMedia(buffer, userId, filename, 'image/png', { customAssetId: assetId });

  return {
    imageUrl: uploadResult.signedUrl,
    assetId: uploadResult.assetId,
    gcsPath: uploadResult.gcsPath!,
  };
}

/**
 * Generate reference images for all subjects in a set.
 */
export async function generateAllReferenceImages(
  subjects: ExtractedSubject[],
  userId: string,
  options: { artStyle?: string; sourceScriptId?: string; modelId?: string } = {},
): Promise<ReferenceImageSet> {
  const refSetId = `refs_${nanoid(12)}`;

  const refSet: ReferenceImageSet = {
    refSetId,
    userId,
    sourceScriptId: options.sourceScriptId,
    subjects: subjects.map((s) => ({
      subjectId: s.id,
      name: s.name,
      category: s.category,
      visualDescription: s.visualDescription,
      scenesAppearingIn: s.scenesAppearingIn,
      status: 'pending' as const,
      generationHistory: [],
    })),
    status: 'generating',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveReferenceImageSet(refSet);

  // Generate with concurrency limit of 3
  const CONCURRENCY = 3;
  const queue = [...refSet.subjects];
  const running: Promise<void>[] = [];
  let completed = 0;
  let errors = 0;

  const generateForSubject = async (subject: SubjectReference) => {
    try {
      subject.status = 'generating';
      await updateSubjectReference(refSetId, subject.subjectId, { status: 'generating' });

      const result = await generateReferenceImage(subject, userId, {
        artStyle: options.artStyle,
        modelId: options.modelId,
      });

      subject.imageUrl = result.imageUrl;
      subject.imageAssetId = result.assetId;
      subject.imageGcsPath = result.gcsPath;
      subject.status = 'generated';
      subject.generationHistory.push({
        assetId: result.assetId,
        imageUrl: result.imageUrl,
        timestamp: new Date(),
      });

      await updateSubjectReference(refSetId, subject.subjectId, {
        imageUrl: result.imageUrl,
        imageAssetId: result.assetId,
        imageGcsPath: result.gcsPath,
        status: 'generated',
        generationHistory: subject.generationHistory,
      });

      completed++;
    } catch (err) {
      console.error(`[RefImage] Subject ${subject.subjectId} failed:`, err);
      subject.status = 'pending';
      errors++;
    }
  };

  while (queue.length > 0 || running.length > 0) {
    while (running.length < CONCURRENCY && queue.length > 0) {
      const subject = queue.shift()!;
      const p = generateForSubject(subject).then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  refSet.status = errors === 0 ? 'ready' : completed > 0 ? 'partial' : 'error';
  refSet.updatedAt = new Date();
  await saveReferenceImageSet(refSet);

  return refSet;
}
