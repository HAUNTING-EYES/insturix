/**
 * Image Model Config Registry + Luma API Client
 *
 * Replaces the scattered Set objects (SUPPORTS_NEGATIVE_PROMPT, USES_IMAGE_SIZE_OBJECT,
 * USES_ASPECT_RATIO_ONLY) and the 6-strategy reference system in storyboard-service.ts
 * with a single config-driven registry.
 *
 * Also provides a Luma REST API client for UNI-1 (not on fal.ai).
 *
 * To add a new model: add a config entry. Done.
 */

// ─── Types ───────────────────────────────────────────────────────

export type ImageProvider = 'fal' | 'luma';
export type SizeFormat = 'width-height-object' | 'aspect-ratio-only' | 'aspect-ratio-string';
export type ReferenceCapability =
  | 'character-ref'       // Luma-native identity reference (best for face consistency)
  | 'ip-adapter'          // fal.ai Flux General IP-adapter LoRA
  | 'image-to-image'      // fal.ai models that accept a /image-to-image sub-path endpoint
  | 'inline-image-urls'   // fal.ai models that accept image_urls array on their STANDARD endpoint (no sub-path). Nano Banana family works this way — added 2026-04-19 to replace the 'text-only' stop-gap that was disabling reference passthrough. See pipeline_investigations.md 2026-04-18 "Nano Banana 2 reference images hardcoded to text-only".
  | 'text-only';          // Model has no reference mechanism — descriptions in prompt

export interface ImageModelConfig {
  /** Unique key used in UI dropdown and API payload */
  key: string;
  /** Human-readable label */
  label: string;
  /** Sort order for dropdown (lower = higher in list) */
  sortOrder: number;
  /** Which API provider handles this model */
  provider: ImageProvider;
  /** fal.ai model ID (for fal) or Luma model ID (for luma) */
  endpoint: string;
  /** How this model accepts size parameters */
  sizeFormat: SizeFormat;
  /** Whether this model accepts negative_prompt */
  supportsNegativePrompt: boolean;
  /** How this model handles reference images for consistency */
  referenceCapability: ReferenceCapability;
  /** Reference-specific config (param names, limits) */
  referenceConfig?: {
    /** fal.ai param name for reference images */
    paramName: string;
    /** Maximum reference images accepted */
    maxRefs: number;
    /** Whether weights are supported per reference */
    weightSupport: boolean;
  };
  /** Static params always sent to this model */
  staticParams?: Record<string, any>;
}

// ─── Registry ────────────────────────────────────────────────────

export const IMAGE_MODEL_REGISTRY: Record<string, ImageModelConfig> = {
  'flux-schnell': {
    key: 'flux-schnell',
    label: 'FLUX Schnell (Fast)',
    sortOrder: 3,
    provider: 'fal',
    endpoint: 'fal-ai/flux/schnell',
    sizeFormat: 'width-height-object',
    supportsNegativePrompt: true,
    referenceCapability: 'text-only',
  },
  'flux-dev': {
    key: 'flux-dev',
    label: 'FLUX Dev (Quality)',
    sortOrder: 4,
    provider: 'fal',
    endpoint: 'fal-ai/flux/dev',
    sizeFormat: 'width-height-object',
    supportsNegativePrompt: true,
    referenceCapability: 'text-only',
  },
  'flux-pro': {
    key: 'flux-pro',
    label: 'FLUX Pro 1.1',
    sortOrder: 5,
    provider: 'fal',
    endpoint: 'fal-ai/flux-pro/v1.1',
    sizeFormat: 'width-height-object',
    supportsNegativePrompt: true,
    referenceCapability: 'text-only',
  },
  'imagen4': {
    key: 'imagen4',
    label: 'Google Imagen 4',
    sortOrder: 2,
    provider: 'fal',
    endpoint: 'fal-ai/imagen4/preview',
    sizeFormat: 'aspect-ratio-string',
    supportsNegativePrompt: false,
    referenceCapability: 'text-only',
  },
  'seedream-v4': {
    key: 'seedream-v4',
    label: 'Seedream V4',
    sortOrder: 7,
    provider: 'fal',
    endpoint: 'fal-ai/bytedance/seedream/v4/text-to-image',
    sizeFormat: 'aspect-ratio-string',
    supportsNegativePrompt: false,
    referenceCapability: 'text-only',
  },
  'seedream-v4.5': {
    key: 'seedream-v4.5',
    label: 'Seedream V4.5',
    sortOrder: 6,
    provider: 'fal',
    endpoint: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    sizeFormat: 'aspect-ratio-string',
    supportsNegativePrompt: false,
    referenceCapability: 'text-only',
  },
  'recraft-v3': {
    key: 'recraft-v3',
    label: 'Recraft V3',
    sortOrder: 8,
    provider: 'fal',
    endpoint: 'fal-ai/recraft-v3',
    sizeFormat: 'width-height-object',
    supportsNegativePrompt: false,
    referenceCapability: 'text-only',
  },
  'nano-banana': {
    key: 'nano-banana',
    label: 'Nano Banana (Fast)',
    sortOrder: 11,
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana',
    sizeFormat: 'aspect-ratio-only',
    supportsNegativePrompt: false,
    // 2026-04-19 (Batch 3): was 'text-only' as a 404-workaround. Now uses the
    // real mechanism — image_urls array on the STANDARD endpoint (no
    // /image-to-image suffix). Per pipeline_investigations.md entry, the
    // dispatch branch for 'inline-image-urls' at storyboard-service.ts
    // passes the refs without touching the endpoint URL.
    referenceCapability: 'inline-image-urls',
    referenceConfig: {
      paramName: 'image_urls',
      maxRefs: 4,
      weightSupport: false,
    },
    staticParams: { resolution: '1K' },
  },
  'nano-banana-2': {
    key: 'nano-banana-2',
    label: 'Nano Banana 2 (Quality)',
    sortOrder: 10,
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana-2',
    sizeFormat: 'aspect-ratio-only',
    supportsNegativePrompt: false,
    // 2026-04-19 (Batch 3): was 'text-only' stop-gap after 'image-to-image'
    // returned 404 (fal.ai doesn't host /image-to-image sub-paths for NB2).
    // NB2 actually accepts up to 14 reference images via image_urls on the
    // standard endpoint — this config caps at 4 for bandwidth. Scene images
    // will now visually match the user's approved reference subjects
    // instead of drifting style-independently.
    referenceCapability: 'inline-image-urls',
    referenceConfig: {
      paramName: 'image_urls',
      maxRefs: 4,
      weightSupport: false,
    },
    staticParams: { resolution: '1K' },
  },
  'nano-banana-pro': {
    key: 'nano-banana-pro',
    label: 'Nano Banana Pro (Best)',
    sortOrder: 9,
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana-pro',
    sizeFormat: 'aspect-ratio-only',
    supportsNegativePrompt: false,
    // 2026-04-19 (Batch 3): same capability flip as nano-banana-2.
    referenceCapability: 'inline-image-urls',
    referenceConfig: {
      paramName: 'image_urls',
      maxRefs: 4,
      weightSupport: false,
    },
    staticParams: { resolution: '1K' },
  },

  // ─── UNI-1 by Luma Labs ───────────────────────────────────────
  // Docs: https://docs.lumalabs.ai/docs/image-generation
  // #1 Elo for human image preference. Native character_ref = consistent faces.
  // Uses direct Luma REST API (NOT fal.ai).
  'uni-1': {
    key: 'uni-1',
    label: 'UNI-1 by Luma (Best Quality)',
    sortOrder: 0, // Top of list — best image model
    provider: 'luma',
    endpoint: 'photon-1', // Luma model ID sent in body
    sizeFormat: 'aspect-ratio-string',
    supportsNegativePrompt: false,
    referenceCapability: 'character-ref',
    referenceConfig: {
      paramName: 'character_ref', // Luma's identity-based reference (better than IP-adapter)
      maxRefs: 4,
      weightSupport: false,
    },
  },
};

// ─── Exports ─────────────────────────────────────────────────────

export function getImageModelConfig(key: string): ImageModelConfig {
  return IMAGE_MODEL_REGISTRY[key] || IMAGE_MODEL_REGISTRY['flux-schnell'];
}

/** Get all model keys sorted by sortOrder (for UI dropdowns). */
export function getImageModelKeys(): string[] {
  return Object.values(IMAGE_MODEL_REGISTRY)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(c => c.key);
}

/** Build fal.ai input from config (for fal provider models). */
export function buildImageInputFromConfig(
  config: ImageModelConfig,
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
): Record<string, any> {
  const input: Record<string, any> = {
    prompt,
    num_images: 1,
  };

  if (config.supportsNegativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  switch (config.sizeFormat) {
    case 'width-height-object':
      input.image_size = { width, height };
      input.enable_safety_checker = false;
      break;
    case 'aspect-ratio-only':
      // Nano Banana style: aspect_ratio + resolution
      if (width > height) input.aspect_ratio = '16:9';
      else if (height > width) input.aspect_ratio = '9:16';
      else input.aspect_ratio = '1:1';
      break;
    case 'aspect-ratio-string':
      // Imagen, Seedream, UNI-1 style
      input.image_size = { width, height };
      if (width > height) input.aspect_ratio = '16:9';
      else if (height > width) input.aspect_ratio = '9:16';
      else input.aspect_ratio = '1:1';
      break;
  }

  // Static params LAST
  if (config.staticParams) {
    Object.assign(input, config.staticParams);
  }

  return input;
}

// ─── Luma REST API Client ────────────────────────────────────────
// Direct REST integration for UNI-1 (not available on fal.ai).
// Follows async poll pattern: POST to create → GET to poll → extract URL.
// Same pattern as existing generateVideoWithKie() in video-generation-service.ts.

const LUMA_API_BASE = 'https://api.lumalabs.ai';
const LUMA_POLL_INTERVAL_MS = 2_000;
const LUMA_MAX_POLLS = 60; // 60 polls * 2s = 2 minutes max

function getLumaApiKey(): string {
  const key = process.env.LUMA_API_KEY;
  if (!key) throw new Error('LUMA_API_KEY environment variable is not set. Required for UNI-1 image generation.');
  return key;
}

export interface LumaGenerationResult {
  imageUrl: string;
  generationId: string;
  model: string;
}

/**
 * Generate an image using Luma's REST API (UNI-1 / Photon).
 *
 * Supports character_ref for identity-consistent generation (better than IP-adapter
 * for face consistency across scenes).
 *
 * @param prompt - Text description of desired image
 * @param options - Model, aspect ratio, reference images
 */
export async function generateWithLuma(
  prompt: string,
  options: {
    model?: string;
    aspectRatio?: string;
    characterRefs?: Array<{ identity: string; images: string[] }>;
    imageRefs?: Array<{ url: string; weight?: number }>;
    styleRefs?: Array<{ url: string; weight?: number }>;
  } = {},
): Promise<LumaGenerationResult> {
  const apiKey = getLumaApiKey();
  const model = options.model || 'photon-1';

  // Build request body
  const body: Record<string, any> = {
    prompt,
    model,
  };

  if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }

  // Character reference: identity-based consistency (faces, characters)
  if (options.characterRefs && options.characterRefs.length > 0) {
    body.character_ref = {};
    for (const ref of options.characterRefs) {
      body.character_ref[ref.identity] = { images: ref.images.slice(0, 4) };
    }
  }

  // Image reference: general visual guidance
  if (options.imageRefs && options.imageRefs.length > 0) {
    body.image_ref = options.imageRefs.slice(0, 4).map(r => ({
      url: r.url,
      weight: r.weight ?? 0.85,
    }));
  }

  // Style reference: style transfer
  if (options.styleRefs && options.styleRefs.length > 0) {
    body.style_ref = options.styleRefs.slice(0, 4).map(r => ({
      url: r.url,
      weight: r.weight ?? 0.8,
    }));
  }

  // POST to create generation
  console.log(`[Luma] Creating image generation: model=${model}, prompt="${prompt.substring(0, 80)}...", refs=${options.characterRefs?.length || 0} char, ${options.imageRefs?.length || 0} image`);

  const createRes = await fetch(`${LUMA_API_BASE}/dream-machine/v1/generations/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Luma API creation failed (${createRes.status}): ${errText}`);
  }

  const createData = await createRes.json();
  const generationId = createData.id;
  if (!generationId) {
    throw new Error('Luma API returned no generation ID');
  }

  console.log(`[Luma] Generation created: id=${generationId}, polling...`);

  // Poll until completed or failed
  for (let poll = 0; poll < LUMA_MAX_POLLS; poll++) {
    await new Promise(resolve => setTimeout(resolve, LUMA_POLL_INTERVAL_MS));

    const statusRes = await fetch(`${LUMA_API_BASE}/dream-machine/v1/generations/${generationId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    const state = statusData.state;

    if (state === 'completed') {
      const imageUrl = statusData.assets?.image;
      if (!imageUrl) throw new Error('Luma generation completed but no image URL in response');

      console.log(`[Luma] Generation complete: id=${generationId}, polls=${poll + 1}`);
      return {
        imageUrl,
        generationId,
        model: statusData.model || model,
      };
    }

    if (state === 'failed') {
      const failReason = statusData.failure_reason || statusData.error || 'Unknown failure';
      throw new Error(`Luma generation failed: ${failReason}`);
    }

    // state === 'dreaming' or other — keep polling
  }

  throw new Error(`Luma generation timed out after ${LUMA_MAX_POLLS * LUMA_POLL_INTERVAL_MS / 1000}s (id=${generationId})`);
}

/** Check if Luma API is available (key exists). */
export function isLumaAvailable(): boolean {
  return !!process.env.LUMA_API_KEY;
}
