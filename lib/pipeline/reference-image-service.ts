/**
 * Reference Image Generation Service
 *
 * Generates reference images for key visual subjects identified by the LLM.
 * These references are used during storyboard generation (via IP-adapter)
 * to maintain visual consistency across scenes.
 */

import { fal } from '@fal-ai/client';
import { nanoid } from 'nanoid';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { saveReferenceImageSet, updateSubjectReference } from './reference-image-db';
import type { ReferenceImageSet, SubjectReference } from './schemas/reference-image';
import type { ExtractedSubject } from './llm-scene-parser';
import { IMAGE_MODELS, type ImageModelKey } from './storyboard-service';

// Configure fal.ai
let _falConfigured = false;
function ensureFalConfig() {
  if (_falConfigured) return;
  if (process.env.FAL_AI_API_KEY) {
    fal.config({ credentials: process.env.FAL_AI_API_KEY });
    _falConfigured = true;
  }
}

const DEFAULT_MODEL = 'fal-ai/flux/schnell';

// ─── Art-style–aware prompt tokens for reference images ─────────
// These match the storyboard prompt builder but are tailored for
// ISOLATED subject rendering (no scene/environment context).
const REF_STYLE_TOKENS: Record<string, string> = {
  cinematic: 'cinematic product/character photography, 35mm film stock, shallow depth of field, professional studio lighting, color graded',
  photorealistic: 'photorealistic DSLR photograph, studio lighting, razor sharp focus, RAW photo quality',
  documentary: 'documentary-style photograph, natural lighting, authentic detail, subtle film grain',
  noir: 'film noir style, high contrast black and white, dramatic directional lighting, deep shadows',
  anime: 'anime character sheet, studio quality cel-shaded illustration, clean precise linework, vibrant saturated colors',
  cartoon: 'cartoon character design, bold clean outlines, bright saturated flat colors, stylized proportions',
  'comic-book': 'comic book character art, bold ink outlines, halftone dot shading, graphic novel style',
  'pixel-art': 'pixel art sprite, retro 16-bit aesthetic, clean pixel edges, limited palette',
  watercolor: 'watercolor illustration, soft organic pigment washes, visible paper texture, luminous translucent layers',
  'oil-painting': 'oil painting portrait, rich impasto brushwork, classical studio composition, visible canvas texture',
  sketch: 'detailed pencil sketch, expressive linework, cross-hatching, hand-drawn on paper',
  'pop-art': 'pop art style, bold primary colors, Ben-Day dots, Roy Lichtenstein inspired',
  cyberpunk: 'cyberpunk design, neon-lit, holographic accents, chrome and glass materials',
  fantasy: 'fantasy concept art, magical atmospheric lighting, rich detail, painterly',
  horror: 'horror style, desaturated cold tones, unsettling detail, ominous lighting',
  '3d-render': '3D render, Octane quality, volumetric lighting, subsurface scattering, ray-traced',
  isometric: 'isometric 3D illustration, clean geometric shading, precise lines',
  minimalist: 'minimalist flat design, clean geometric lines, restrained palette',
  superhero: 'superhero concept art, dynamic composition, vivid saturated colors, dramatic rim lighting, Marvel style',
  'sci-fi': 'sci-fi concept art, futuristic design, volumetric lighting, advanced technology aesthetic',
  'concept-art': 'professional concept art, entertainment design quality, polished illustration',
  claymation: 'claymation figure, handmade clay texture, visible fingerprints, playful 3D stop-motion',
  storybook: 'storybook illustration, whimsical warmth, inviting hand-drawn detail',
  vaporwave: 'vaporwave aesthetic, pastel neon gradients, chrome reflections, 80s nostalgia',
  steampunk: 'steampunk design, ornate brass machinery, copper patina, intricate gear details',
  gothic: 'dark Gothic style, ornate details, deep shadows, dramatic lighting',
  'art-deco': 'Art Deco design, bold geometric patterns, gold and black, 1920s glamour',
  vintage: 'vintage photograph, warm faded tones, 70s analog film, nostalgic grain',
  pastel: 'soft pastel palette, dreamy ethereal quality, gentle gradients, delicate',
  'neon-noir': 'neon noir style, vivid neon lighting, dark atmosphere, moody contrast',
  'indie-film': 'indie film aesthetic, natural light, muted earth tones, A24 style',
};

// Background/isolation tokens per category
const CATEGORY_TOKENS: Record<string, string> = {
  character: 'full body character portrait, centered in frame, clean neutral background, professional studio lighting, multiple-angle consistency',
  product: 'product photography, centered on clean white/neutral background, professional studio lighting, sharp focus on all details, commercial quality',
  vehicle: 'vehicle photography, three-quarter angle view, clean neutral background, professional automotive lighting, sharp detail',
  object: 'object photography, centered on clean neutral background, studio lighting, sharp focus, detailed texture capture',
  location: 'establishing shot, key architectural details, clean composition, professional photography',
};

/**
 * Build a proper reference image prompt that respects the art style.
 */
function buildReferencePrompt(
  visualDescription: string,
  category: string,
  artStyle?: string,
): string {
  const parts: string[] = [];

  // 1. The subject description (the most important part)
  parts.push(visualDescription.trim());

  // 2. Category-specific isolation/composition tokens
  const catTokens = CATEGORY_TOKENS[category] || CATEGORY_TOKENS['object'];
  parts.push(catTokens);

  // 3. Art-style–specific quality tokens (NOT generic "highly detailed sharp focus")
  if (artStyle) {
    const styleKey = artStyle.toLowerCase().replace(/\s+/g, '-');
    const styleTokens = REF_STYLE_TOKENS[styleKey];
    if (styleTokens) {
      parts.push(styleTokens);
    } else {
      parts.push(`${artStyle} style, professional quality`);
    }
  } else {
    parts.push('professional studio photography, sharp focus, high detail');
  }

  return parts.join('. ');
}

/**
 * Build a negative prompt for reference images.
 */
function buildReferenceNegativePrompt(artStyle?: string): string {
  const base = 'blurry, low quality, distorted, deformed, watermark, text overlay, logo, bad anatomy, extra limbs, cropped, out of frame, multiple subjects, busy background, cluttered';

  // Add style-specific negatives
  const styleKey = artStyle?.toLowerCase().replace(/\s+/g, '-') || '';
  if (['anime', 'cartoon', 'comic-book', 'pixel-art'].includes(styleKey)) {
    return `${base}, photorealistic, 3d render`;
  }
  if (['photorealistic', 'cinematic', 'documentary'].includes(styleKey)) {
    return `${base}, cartoon, anime, illustration, drawing`;
  }
  return base;
}

// ─── Models that support negative_prompt ────────────────────────
const SUPPORTS_NEGATIVE_PROMPT = new Set([
  'fal-ai/flux/schnell',
  'fal-ai/flux/dev',
  'fal-ai/flux-pro/v1.1',
]);

/**
 * Generate a single reference image for a subject.
 * Uses the user's chosen image model (not hardcoded flux/schnell).
 */
export async function generateReferenceImage(
  subject: SubjectReference,
  userId: string,
  options: { artStyle?: string; modelId?: string } = {},
): Promise<{ imageUrl: string; assetId: string; gcsPath: string }> {
  ensureFalConfig();

  // Resolve model — use user's chosen model, not always flux/schnell
  let modelId = DEFAULT_MODEL;
  if (options.modelId) {
    // Could be a key like 'flux-dev' or a full ID like 'fal-ai/flux/dev'
    if (options.modelId in IMAGE_MODELS) {
      modelId = IMAGE_MODELS[options.modelId as ImageModelKey];
    } else {
      modelId = options.modelId;
    }
  }

  const prompt = buildReferencePrompt(
    subject.visualDescription,
    subject.category || 'object',
    options.artStyle,
  );

  console.log(`[RefImage] Subject "${subject.name}": model=${modelId}, prompt="${prompt.substring(0, 120)}..."`);

  const input: Record<string, any> = {
    prompt,
    image_size: { width: 1024, height: 1024 },
    num_images: 1,
    enable_safety_checker: false,
  };

  // Add negative prompt for models that support it
  if (SUPPORTS_NEGATIVE_PROMPT.has(modelId)) {
    input.negative_prompt = buildReferenceNegativePrompt(options.artStyle);
  }

  const result = await fal.subscribe(modelId, {
    input,
    logs: false,
  });

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
  const uploadResult = await uploadToGCS(buffer, userId, filename, 'image/png');

  return {
    imageUrl: uploadResult.signedUrl,
    assetId,
    gcsPath: uploadResult.gcsPath,
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
