
import { ClickatronR2Manager } from '@/lib/clickatron-r2';

/**
 * Defines the type of model.
 * - 'text-to-image': Generates an image from a text prompt.
 * - 'image-to-image': Generates an image from a text prompt and a source image.
 * - 'inpainting': Fills in selected areas of an image based on a prompt and mask.
 */
export type ModelType = 'text-to-image' | 'image-to-image' | 'inpainting';

/**
 * Defines the parameter mapping for a single AI model.
 */
export interface ParameterMapping {
  prompt: string;
  image_url?: string;
  image_urls?: string;
  mask_url?: string;
  aspect_ratio?: string;
  image_size?: string;
  max_images?: string;
  resolution?: string;
  num_images?: string;
  enable_safety_checker?: string;
  output_format?: string;
  resolution_mode?: string;
  guidance_scale?: string;
  num_inference_steps?: string;
  acceleration?: string;
  seed?: string;
  strength?: string;
}

/**
 * Defines the constraints for a single AI model.
 */
export interface ModelConstraints {
  promptMaxLength?: number;
  allowedAspectRatios?: string[];
  minImages?: number;
  maxImages?: number;
}

/**
 * Defines the configuration for a single AI model.
 */
export interface ModelConfig {
  id: string;
  name: string;
  types: ModelType[];
  isDefault?: boolean;
  isDeprecated?: boolean;
  isInpaintingCapable?: boolean;
  /** Marks this model as suitable for sketch-to-edit (annotation-guided editing) */
  isSketchToEdit?: boolean;
  parameterMapping: ParameterMapping;
  constraints: ModelConstraints;
}

export type ClickatronModelContext =
  | 'ideation'
  | 'newVariation'
  | 'edit'
  | 'generativeFill'
  | 'sketchToEdit';

export type ClickatronDefaultGenerationType = Extract<ModelType, 'text-to-image' | 'image-to-image'>;

export const DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/bytedance/seedream/v5/lite/text-to-image';
export const DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID = 'fal-ai/flux-kontext/dev';
export const IMAGEN4_PREVIEW_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
const CLICKATRON_PROMPT_TRUNCATION_NOTICE = '\n\n[Prompt compacted to fit the selected image model provider limit. Preserve the core visual request, brand constraints, and generation rules.]\n\n';

function compactTextToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= CLICKATRON_PROMPT_TRUNCATION_NOTICE.length + 40) {
    return text.slice(0, maxLength);
  }

  const available = maxLength - CLICKATRON_PROMPT_TRUNCATION_NOTICE.length;
  const headLength = Math.ceil(available * 0.65);
  const tailLength = available - headLength;
  return `${text.slice(0, headLength)}${CLICKATRON_PROMPT_TRUNCATION_NOTICE}${text.slice(-tailLength)}`;
}

export function getClickatronModelPromptMaxLength(modelId: string | undefined | null): number | undefined {
  if (!modelId) return undefined;
  return CLICKATRON_MODELS[modelId]?.constraints.promptMaxLength;
}

export function fitClickatronPromptToModelLimit(
  modelId: string | undefined | null,
  prompt: string,
  fallbackMaxLength = 5000,
): string {
  const normalizedPrompt = prompt.trim();
  const maxLength = getClickatronModelPromptMaxLength(modelId) ?? fallbackMaxLength;
  return compactTextToLength(normalizedPrompt, maxLength);
}

/**
 * A map of all available models, keyed by their unique ID.
 * Simplified configuration with clear parameter mappings.
 */
export const CLICKATRON_MODELS: Record<string, ModelConfig> = {
  /* 
   * NEW LEAN ROSTER (2026) 
   */
  'fal-ai/flux-2/flash': {
    id: 'fal-ai/flux-2/flash',
    name: 'FLUX 2 Flash',
    types: ['text-to-image'],
    isDefault: false,
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
    }
  },
  'fal-ai/bytedance/seedream/v5/lite/text-to-image': {
    id: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
    name: 'Seedream 5.0 Lite',
    types: ['text-to-image'],
    isDefault: true,
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      max_images: 'max_images',
      enable_safety_checker: 'enable_safety_checker'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
    }
  },
  'fal-ai/nano-banana-pro': {
    id: 'fal-ai/nano-banana-pro',
    name: 'Nanobanana Pro',
    types: ['text-to-image'],
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      seed: 'seed'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
    },
  },
  'fal-ai/ideogram/v3': {
    id: 'fal-ai/ideogram/v3',
    name: 'Ideogram v3',
    types: ['text-to-image'],
    parameterMapping: {
      prompt: 'prompt',
      aspect_ratio: 'aspect_ratio',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
    }
  },
  'fal-ai/recraft-v3': {
    id: 'fal-ai/recraft-v3',
    name: 'Recraft v3',
    types: ['text-to-image'],
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
    }
  },
  'fal-ai/flux-kontext/dev': {
    id: 'fal-ai/flux-kontext/dev',
    name: 'Flux Kontext Dev',
    types: ['image-to-image'],
    parameterMapping: {
      prompt: 'prompt',
      image_url: 'image_url',
      num_inference_steps: 'num_inference_steps',
      guidance_scale: 'guidance_scale',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      output_format: 'output_format',
      acceleration: 'acceleration',
      resolution_mode: 'resolution_mode'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 1,
      maxImages: 1,
    },
  },
  'fal-ai/bytedance/seedream/v5/lite/edit': {
    id: 'fal-ai/bytedance/seedream/v5/lite/edit',
    name: 'Seedream 5.0 Lite Edit',
    types: ['image-to-image', 'inpainting'],
    isInpaintingCapable: true,
    isSketchToEdit: true,
    parameterMapping: {
      prompt: 'prompt',
      image_urls: 'image_urls',
      mask_url: 'mask_url',
      num_images: 'num_images',
      max_images: 'max_images',
      enable_safety_checker: 'enable_safety_checker',
      output_format: 'output_format'
    },
    constraints: {
      promptMaxLength: 512,
      minImages: 1,
      maxImages: 4,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
    },
  },
  'fal-ai/nano-banana-pro/edit': {
    id: 'fal-ai/nano-banana-pro/edit',
    name: 'Nanobanana Pro Edit',
    types: ['image-to-image', 'inpainting'],
    isSketchToEdit: true,
    isDefault: true,
    isInpaintingCapable: true,
    parameterMapping: {
      prompt: 'prompt',
      image_urls: 'image_urls',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      seed: 'seed',
      mask_url: 'mask_url'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 1,
      maxImages: 10,
    },
  },
  'fal-ai/flux-pro/v1/fill': {
    id: 'fal-ai/flux-pro/v1/fill',
    name: 'FLUX Pro Fill',
    types: ['inpainting'],
    parameterMapping: {
      prompt: 'prompt',
      image_url: 'image_url',
      mask_url: 'mask_url',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      output_format: 'output_format',
      guidance_scale: 'guidance_scale',
      num_inference_steps: 'num_inference_steps'
    },
    constraints: {
      promptMaxLength: 1024,
      minImages: 1,
      maxImages: 1,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
    },
  },
  'fal-ai/flux-lora/inpainting': {
    id: 'fal-ai/flux-lora/inpainting',
    name: 'FLUX LoRA Inpainting',
    types: ['inpainting'],
    parameterMapping: {
      prompt: 'prompt',
      image_url: 'image_url',
      mask_url: 'mask_url',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      output_format: 'output_format',
      guidance_scale: 'guidance_scale',
      num_inference_steps: 'num_inference_steps'
    },
    constraints: {
      promptMaxLength: 1024,
      minImages: 1,
      maxImages: 1,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
    }
  },
  'fal-ai/flux-2-pro': {
    id: 'fal-ai/flux-2-pro',
    name: 'FLUX.2 Pro',
    types: ['text-to-image'],
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
    }
  },

  /*
   * OLD/EXTRA MODELS COMMENTED OUT (per lean roster requirement)
   *
  'fal-ai/imagen4/preview': { ... },
  'fal-ai/bytedance/seedream/v4/edit': { ... },
  'fal-ai/bytedance/seedream/v4/text-to-image': { ... },
  'fal-ai/flux/dev/inpainting': { ... },
  'fal-ai/flux-kontext/dev/inpainting': { ... },
  'fal-ai/nano-banana': { ... },
  'fal-ai/nano-banana/edit': { ... },
  'fal-ai/gemini-3-pro-image-preview': { ... },
  'fal-ai/bytedance/seedream/v4.5/text-to-image': { ... },
  'fal-ai/bytedance/seedream/v4.5/edit': { ... },
  'fal-ai/flux-2-pro/edit': { ... },
  'wan/v2.6/image-to-image': { ... },
  'fal-ai/stable-diffusion-inpainting': { ... },
   */
};

/**
 * Filter models based on the number of reference images
 * @param models - The models to filter
 * @param referenceImageCount - The number of reference images
 * @returns The filtered models
 */
export function filterModelsByReferenceImageCount(
  models: ModelConfig[],
  referenceImageCount: number
): ModelConfig[] {
  return models.filter(model => {
    const minImages = model.constraints?.minImages ?? 0;
    const maxImages = model.constraints?.maxImages ?? 0;
    return referenceImageCount >= minImages && referenceImageCount <= maxImages;
  });
}

/**
 * Get the preferred default model for a generation type.
 * Falls back through registry defaults so model IDs stay centralized here.
 */
export function getDefaultClickatronModelId(type: ClickatronDefaultGenerationType): string {
  const preferredModelId =
    type === 'text-to-image'
      ? DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID
      : DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID;
  const preferredModel = CLICKATRON_MODELS[preferredModelId];

  if (preferredModel && !preferredModel.isDeprecated && preferredModel.types.includes(type)) {
    return preferredModelId;
  }

  return (
    Object.values(CLICKATRON_MODELS).find((model) => !model.isDeprecated && model.isDefault && model.types.includes(type))?.id ||
    Object.values(CLICKATRON_MODELS).find((model) => !model.isDeprecated && model.types.includes(type))?.id ||
    preferredModelId
  );
}

/**
 * Select a default model from input shape.
 * Text-only ThinkForge handoffs must land on text-to-image models, while edits
 * and reference-image flows need image-to-image models.
 */
export function getDefaultClickatronModelIdForInput({
  context = 'newVariation',
  referenceImageCount = 0,
  hasParentImage = false,
}: {
  context?: ClickatronModelContext;
  referenceImageCount?: number;
  hasParentImage?: boolean;
} = {}): string {
  const generationType: ClickatronDefaultGenerationType =
    referenceImageCount > 0 || hasParentImage ? 'image-to-image' : 'text-to-image';
  const preferredModelId = getDefaultClickatronModelId(generationType);
  const availableModels = getAvailableModels(context, referenceImageCount);

  return (
    availableModels.find((model) => model.id === preferredModelId && model.types.includes(generationType))?.id ||
    availableModels.find((model) => model.isDefault && model.types.includes(generationType))?.id ||
    availableModels.find((model) => model.types.includes(generationType))?.id ||
    preferredModelId
  );
}

export interface ClickatronModelResolution {
  modelId: string;
  model: ModelConfig;
  requestedModelId?: string;
  reason: 'requested' | 'default' | 'aspect-ratio-fallback' | 'missing-model-fallback';
}

export function modelSupportsAspectRatio(model: ModelConfig | undefined, aspectRatio?: string | null): boolean {
  if (!model || !aspectRatio) return Boolean(model);
  const allowedAspectRatios = model.constraints.allowedAspectRatios;
  return !allowedAspectRatios || allowedAspectRatios.includes(aspectRatio);
}

export function resolveClickatronModelForGeneration({
  requestedModelId,
  context = 'newVariation',
  referenceImageCount = 0,
  hasParentImage = false,
  aspectRatio,
}: {
  requestedModelId?: string | null;
  context?: ClickatronModelContext;
  referenceImageCount?: number;
  hasParentImage?: boolean;
  aspectRatio?: string | null;
} = {}): ClickatronModelResolution {
  const generationType: ClickatronDefaultGenerationType =
    referenceImageCount > 0 || hasParentImage ? 'image-to-image' : 'text-to-image';
  const availableModels = getAvailableModels(context, referenceImageCount);
  const modelCanHandleRequest = (model: ModelConfig | undefined): model is ModelConfig =>
    Boolean(
      model &&
      !model.isDeprecated &&
      model.types.includes(generationType) &&
      availableModels.some((availableModel) => availableModel.id === model.id) &&
      modelSupportsAspectRatio(model, aspectRatio)
    );

  const requestedModel: ModelConfig | undefined = requestedModelId ? CLICKATRON_MODELS[requestedModelId] : undefined;
  if (modelCanHandleRequest(requestedModel)) {
    return {
      modelId: requestedModel.id,
      model: requestedModel,
      requestedModelId: requestedModelId ?? undefined,
      reason: 'requested',
    };
  }

  const defaultModelId = getDefaultClickatronModelIdForInput({
    context,
    referenceImageCount,
    hasParentImage,
  });
  const defaultModel: ModelConfig | undefined = CLICKATRON_MODELS[defaultModelId];
  if (modelCanHandleRequest(defaultModel)) {
    return {
      modelId: defaultModel.id,
      model: defaultModel,
      requestedModelId: requestedModelId ?? undefined,
      reason: requestedModel ? 'aspect-ratio-fallback' : 'default',
    };
  }

  const compatibleModel = availableModels.find((model) =>
    model.types.includes(generationType) && modelSupportsAspectRatio(model, aspectRatio)
  );
  if (compatibleModel) {
    return {
      modelId: compatibleModel.id,
      model: compatibleModel,
      requestedModelId: requestedModelId ?? undefined,
      reason: requestedModel ? 'aspect-ratio-fallback' : 'default',
    };
  }

  const fallbackCandidates: Array<ModelConfig | undefined> = [
    defaultModel,
    availableModels.find((model) => model.types.includes(generationType)),
    CLICKATRON_MODELS[getDefaultClickatronModelId(generationType)],
    Object.values(CLICKATRON_MODELS).find((model) => !model.isDeprecated),
  ];
  const fallbackModel = fallbackCandidates.find((model): model is ModelConfig => Boolean(model));

  if (!fallbackModel) {
    throw new Error('No Clickatron generation models are configured');
  }

  return {
    modelId: fallbackModel.id,
    model: fallbackModel,
    requestedModelId: requestedModelId ?? undefined,
    reason: requestedModel ? 'aspect-ratio-fallback' : 'missing-model-fallback',
  };
}
/**
 * Get available models for a specific context
 * @param context - The context ('ideation' | 'newVariation' | 'edit' | 'generativeFill' | 'sketchToEdit')
 * @param userAttachedImages - The number of images attached by the user
 * @returns The available models
 */
export function getAvailableModels(
  context: ClickatronModelContext,
  userAttachedImages: number = 0
): ModelConfig[] {
  const allModels = Object.values(CLICKATRON_MODELS).filter(model => !model.isDeprecated);

  // For sketch-to-edit, return only models flagged for sketch-to-edit
  if (context === 'sketchToEdit') {
    return allModels.filter(model => model.isSketchToEdit === true);
  }

  // For generative fill (mask-based inpainting), return ONLY models whose live Fal
  // endpoint actually accepts a mask_url. The previous list (seedream v5 lite/edit,
  // nano-banana-pro/edit, gemini-3-pro-image) are natural-language EDIT endpoints that
  // accept NO mask — so the mask was silently dropped and "fill" regenerated the whole
  // image instead of the masked region. [R2] These inpainting models take
  // image_url + mask_url and honor the masked region (verified against Fal API docs +
  // the generateFluxDevInpaintingPayload/FluxProFill/FluxKontextInpainting builders).
  if (context === 'generativeFill') {
    const allowedModels = [
      'fal-ai/flux-pro/v1/fill',
      'fal-ai/flux/dev/inpainting',
      'fal-ai/flux-kontext/dev/inpainting',
    ];
    return allModels.filter(model => allowedModels.includes(model.id));
  }

  // For regular variation flows, exclude strictly inpainting-only models (that require masks).
  // isSketchToEdit models (Seedream, Nanobanana Pro Edit) show in BOTH edit canvas and sketch-to-edit.
  // Flux 2 Pro and Wan are sketch-to-edit only — they are excluded here because they live only in
  // the 'sketchToEdit' branch above and are never returned for other contexts.
  const SKETCH_TO_EDIT_ONLY_IDS = ['fal-ai/flux-2-pro/edit', 'wan/v2.6/image-to-image'];
  const nonInpaintingModels = allModels.filter(model => {
    if (SKETCH_TO_EDIT_ONLY_IDS.includes(model.id)) return false; // sketch-to-edit exclusive
    return model.types.includes('image-to-image') || model.types.includes('text-to-image');
  });

  // Calculate total reference images based on context
  let referenceImageCount = userAttachedImages;
  if (context === 'edit') {
    // Edit context has 1 base image + user attached images
    referenceImageCount += 1;
  }
  // For ideation and newVariation, it's just user attached images (starting from 0)

  return filterModelsByReferenceImageCount(nonInpaintingModels, referenceImageCount);
}

/**
* Generate payload for a specific model based on generation parameters
 * @param modelConfig - The model configuration

/**
* Generate payload for Imagen4 Preview model
 */
export function generateImagen4PreviewPayload(
  job: any,
  ratio: string,
  numImages: number
): Record<string, any> {
  if (!IMAGEN4_PREVIEW_ASPECT_RATIOS.includes(ratio as typeof IMAGEN4_PREVIEW_ASPECT_RATIOS[number])) {
    throw new Error(`Imagen4 Preview does not support aspect ratio ${ratio}. Supported ratios: ${IMAGEN4_PREVIEW_ASPECT_RATIOS.join(', ')}`);
  }

  return {
    prompt: fitClickatronPromptToModelLimit('fal-ai/imagen4/preview', job.prompt),
    aspect_ratio: ratio,
    num_images: numImages,
    resolution: "1K"
  };
}

/**
 * Generate payload for Flux Kontext Dev model
 */
export function generateFluxKontextDevPayload(
  job: any,
  numInferenceSteps: number,
  guidanceScale: number,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string,
  acceleration: string,
  imageUrls?: string[]
): Record<string, any> {
  // Add system prompt for image-to-image editing to preserve consistency
  const hasImage = imageUrls && imageUrls.length > 0;
  const fullPrompt = hasImage ? `${IMAGE_TO_IMAGE_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}` : job.prompt;

  const payload: Record<string, any> = {
    prompt: fullPrompt,
    num_inference_steps: numInferenceSteps,
    guidance_scale: guidanceScale,
    num_images: numImages,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat,
    acceleration: acceleration,
    resolution_mode: "match_input"
  };

  // Add image URL if it exists (Flux Kontext Dev expects a single image_url)
  if (imageUrls && imageUrls.length > 0) {
    payload.image_url = imageUrls[0];
  }

  return payload;
}

/**
* Generate payload for Seedream V4 Edit model (supports both image-to-image and inpainting)
 */
export function generateSeedreamV4EditPayload(
  job: any,
  width: number,
  height: number,
  numImages: number,
  enableSafetyChecker: boolean,
  imageUrls?: string[],
  maskUrl?: string
): Record<string, any> {
  // Handle mask URL for inpainting mode (use inpainting system prompt)
  if (maskUrl) {
    // Add system prompt for inpainting
    const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;
    const payload: Record<string, any> = {
      prompt: fullPrompt,
      image_size: { width, height },
      num_images: numImages,
      max_images: 1,
      enable_safety_checker: enableSafetyChecker
    };

    // Handle image URLs - Seedream V4 Edit model expects image_urls as an array
    if (imageUrls && imageUrls.length > 0) {
      payload.image_urls = imageUrls;
    }

    payload.mask_url = maskUrl;
    return payload;
  }

  // For image-to-image editing (no mask), use consistency system prompt
  const hasImage = imageUrls && imageUrls.length > 0;
  const fullPrompt = hasImage ? `${IMAGE_TO_IMAGE_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}` : job.prompt;

  const payload: Record<string, any> = {
    prompt: fullPrompt,
    image_size: { width, height },
    num_images: numImages,
    max_images: 1,
    enable_safety_checker: enableSafetyChecker
  };

  // Handle image URLs - Seedream V4 Edit model expects image_urls as an array
  if (imageUrls && imageUrls.length > 0) {
    payload.image_urls = imageUrls;
  }

  return payload;
}

/**
* Generate payload for Seedream V4 Text-to-Image model
*/
export function generateSeedreamV4TextToImagePayload(
  job: any,
  width: number,
  height: number,
  numImages: number,
  enableSafetyChecker: boolean
): Record<string, any> {
  return {
    prompt: job.prompt,
    image_size: { width, height },
    num_images: numImages,
    max_images: 1,
    enable_safety_checker: enableSafetyChecker
  };
}

/**
 * System prompt prepended to user prompts for generative fill
 */
/**
 * System prompt prepended to user prompts for generative fill
 */
export const GENERATIVE_FILL_SYSTEM_PROMPT = `
You are performing localized generative inpainting.

Your task is to edit ONLY the masked region while making the final image appear completely natural.

Priority Order:

1. Modify only the masked pixels.
2. Leave every unmasked pixel completely unchanged.
3. Blend the new content seamlessly into the surrounding image.
4. Match the existing lighting, perspective, shadows, depth, texture, colors, and camera characteristics.
5. Scale and position the generated content naturally inside the masked area.

Requirements:

- Preserve the original composition.
- Preserve framing and camera angle.
- Preserve image resolution and aspect ratio.
- Preserve artistic style and rendering quality.
- Generate content that appears as if it always belonged in the original image.
- Avoid visible seams, hard edges, repeated textures, or abrupt transitions.

Never:
- Modify areas outside the mask.
- Regenerate the entire image.
- Crop, rotate, resize, or reframe the canvas.
- Introduce unrelated objects or stylistic changes.
- Render any instruction text into the image.
`;

export const IMAGE_TO_IMAGE_SYSTEM_PROMPT = `
You are performing controlled image-to-image editing.

Your goal is to apply only the user's requested modifications while preserving the identity and structure of the original image.

Priority Order:

1. Apply the user's requested edits.
2. Preserve everything else.
3. Maintain visual consistency.

Preserve whenever possible:

- Subject identity
- Pose
- Camera angle
- Composition
- Framing
- Lighting
- Color grading
- Environment
- Perspective
- Artistic style
- Image quality

If the user's request explicitly requires changing one of these attributes, modify only that attribute while preserving all others.

Requirements:

- Keep the original aspect ratio.
- Keep the original resolution.
- Maintain high visual fidelity.
- Produce edits that look professionally retouched rather than regenerated.
- Ensure all changes feel naturally integrated into the original image.

Never:
- Replace the entire scene unless explicitly requested.
- Invent unrelated subjects or objects.
- Change composition without instruction.
- Crop or resize the image.
- Render any instruction text into the output.
`;
/**
 * Generate payload for Seedream V4 Inpainting (used for generative fill)
 */
export function generateSeedreamInpaintingPayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string
): Record<string, any> {
  // Prepend system prompt for inpainting
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  return {
    prompt: fullPrompt,
    image_urls: [imageUrl],  // Seedream expects array
    mask_url: maskUrl,
    num_images: numImages,
    max_images: 1,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat
  };
}

/**
 * Generate payload for FLUX Dev Inpainting model
 */
export function generateFluxDevInpaintingPayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string,
  guidanceScale: number = 3.5,
  numInferenceSteps: number = 28,
  strength: number = 1.0
): Record<string, any> {
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  return {
    prompt: fullPrompt,
    image_url: imageUrl,
    mask_url: maskUrl,
    num_images: numImages,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat,
    guidance_scale: guidanceScale,
    num_inference_steps: numInferenceSteps,
    strength: strength
  };
}

/**
 * Generate payload for FLUX Pro Fill model
 */
export function generateFluxProFillPayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string,
  guidanceScale: number = 3.5,
  numInferenceSteps: number = 28
): Record<string, any> {
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  return {
    prompt: fullPrompt,
    image_url: imageUrl,
    mask_url: maskUrl,
    num_images: numImages,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat,
    guidance_scale: guidanceScale,
    num_inference_steps: numInferenceSteps
  };
}

/**
 * Generate payload for FLUX Kontext Inpainting model
 */
export function generateFluxKontextInpaintingPayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string,
  guidanceScale: number = 3.5,
  numInferenceSteps: number = 28
): Record<string, any> {
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  const payload: Record<string, any> = {
    prompt: fullPrompt,
    image_url: imageUrl,
    mask_url: maskUrl,
    strength: 0.9, // Often required for inpainting
    guidance_scale: guidanceScale,
    num_inference_steps: numInferenceSteps,
    num_images: numImages,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat
  };

  return payload;
}
export function generateFluxProInpaintingPayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numInferenceSteps: number,
  guidanceScale: number,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string,
  strength: number
): Record<string, any> {
  // Prepend system prompt for inpainting
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  return {
    prompt: fullPrompt,
    image_url: imageUrl,
    mask_url: maskUrl,
    num_inference_steps: numInferenceSteps,
    guidance_scale: guidanceScale,
    num_images: numImages,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat,
    strength: strength
  };
}

/**
 * Generate payload for FLUX Pro Ultra Inpainting model
 */
export function generateFluxProUltraInpaintingPayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string
): Record<string, any> {
  // Prepend system prompt for inpainting
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  return {
    prompt: fullPrompt,
    image_url: imageUrl,
    mask_url: maskUrl,
    num_images: numImages,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat
  };
}

/**
 * Generate payload for Seedream 5.0 Lite (Generative Fill)
 */
export function generateSeedream5LitePayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string
): Record<string, any> {
  // Prepend system prompt for inpainting
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  return {
    prompt: fullPrompt,
    image_urls: [imageUrl],  // Seedream expects array
    mask_url: maskUrl,
    num_images: numImages,
    max_images: 1,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat
  };
}

/**
 * Generate payload for Gemini 3 Pro Image Preview (Generative Fill)
 */
export function generateGemini3ProImagePreviewPayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string
): Record<string, any> {
  // Prepend system prompt for inpainting
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  return {
    prompt: fullPrompt,
    image_urls: [imageUrl],
    mask_url: maskUrl,
    num_images: numImages,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat
  };
}

/**
 * Generate payload for Nano Bananas Pro Edit (Generative Fill / Inpainting)
 */
export function generateNanoBananaProEditPayload(
  job: any,
  imageUrl: string,
  maskUrl: string,
  numImages: number,
  enableSafetyChecker: boolean,
  outputFormat: string,
  seed?: number
): Record<string, any> {
  // Prepend system prompt for inpainting
  const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

  const payload: Record<string, any> = {
    prompt: fullPrompt,
    image_urls: [imageUrl],
    mask_url: maskUrl,
    num_images: numImages,
    enable_safety_checker: enableSafetyChecker,
    output_format: outputFormat
  };

  if (seed !== undefined) {
    payload.seed = seed;
  }

  return payload;
}

/**
* Generate model-specific payload based on model ID
 */
export function generateModelPayload(
  modelId: string,
  generationParams: Record<string, any>,
  job: any,
  ratio: string,
  width: number,
  height: number
): Record<string, any> {
  switch (modelId) {
    case 'fal-ai/flux-2/flash':
    case 'fal-ai/flux-2-pro':
    case 'fal-ai/bytedance/seedream/v5/lite/text-to-image':
    case 'fal-ai/recraft-v3':
      return {
        prompt: job.prompt,
        image_size: { width, height },
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false
      };
    case 'fal-ai/ideogram/v3':
      return {
        prompt: job.prompt,
        aspect_ratio: ratio,
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false
      };
    case 'fal-ai/nano-banana-pro':
      return {
        prompt: job.prompt,
        image_size: { width, height },
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
        seed: generationParams.seed
      };
    case 'fal-ai/nano-banana-pro/edit':
      const hasImageNano = generationParams.image_urls || (generationParams.image_url ? [generationParams.image_url] : []);
      const nanoFullPrompt = hasImageNano.length > 0 ? `${IMAGE_TO_IMAGE_SYSTEM_PROMPT}

User Request: ${job.prompt}` : job.prompt;
      const payload: any = {
        prompt: nanoFullPrompt,
        image_urls: hasImageNano,
        image_size: { width, height },
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
        seed: generationParams.seed,
      };
      if (generationParams.mask_url) payload.mask_url = generationParams.mask_url;
      return payload;
    case 'fal-ai/bytedance/seedream/v5/lite/edit':
      const hasImageSd = generationParams.image_urls || (generationParams.image_url ? [generationParams.image_url] : []);
      const sdFullPrompt = hasImageSd.length > 0 ? `${IMAGE_TO_IMAGE_SYSTEM_PROMPT}

User Request: ${job.prompt}` : job.prompt;
      const sdPayload: any = {
        prompt: sdFullPrompt,
        image_urls: hasImageSd,
        image_size: { width, height },
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
      };
      if (generationParams.mask_url) sdPayload.mask_url = generationParams.mask_url;
      return sdPayload;
    case 'fal-ai/flux-kontext/dev':
      const hasImage = generationParams.image_urls && generationParams.image_urls.length > 0;
      const fullPrompt = hasImage ? `${IMAGE_TO_IMAGE_SYSTEM_PROMPT}

User Request: ${job.prompt}` : job.prompt;
      const kPayload: Record<string, any> = {
        prompt: fullPrompt,
        image_size: { width, height },
        num_inference_steps: generationParams.num_inference_steps || 28,
        guidance_scale: generationParams.guidance_scale || 3.5,
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
        output_format: generationParams.output_format || "jpeg",
        acceleration: generationParams.acceleration || "none",
        resolution_mode: "match_input"
      };
      if (hasImage) {
        kPayload.image_url = generationParams.image_urls[0];
      }
      return kPayload;
    case 'fal-ai/flux-pro/v1/fill':
    case 'fal-ai/flux-lora/inpainting':
      let imageUrl = generationParams.image_url;
      if (!imageUrl && generationParams.image_urls && generationParams.image_urls.length > 0) {
        imageUrl = generationParams.image_urls[0];
      }
      if (!imageUrl || !generationParams.mask_url) {
        throw new Error(`Inpainting requires both image_url and mask_url. Got params: ${JSON.stringify(generationParams)}`);
      }
      const fillPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}

User Request: ${job.prompt}`;
      return {
        prompt: fillPrompt,
        image_url: imageUrl,
        mask_url: generationParams.mask_url,
        image_size: { width, height },
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
        output_format: generationParams.output_format || "jpeg",
        guidance_scale: generationParams.guidance_scale || 3.5,
        num_inference_steps: generationParams.num_inference_steps || 28
      };
    default:
      throw new Error(`Unsupported model ID: ${modelId}`);
  }
}

/**
 * Check if a model supports the seed parameter
 * @param modelId - The model ID
 * @returns True if the model supports the seed parameter, false otherwise
 */
export function modelSupportsSeed(modelId: string): boolean {
  const modelConfig = CLICKATRON_MODELS[modelId];
  if (!modelConfig) return false;
  return !!modelConfig.parameterMapping.seed;
}

/**
 * Whether a model renders legible in-image text well enough to bake copy into the raster,
 * instead of keeping the image text-free for editable overlays (the suppress-text default).
 * Text-strong families only: Nano Banana (Gemini-based) / Seedream / Gemini 3 Pro Image.
 * Imagen4 + Flux render words as gibberish, so they stay in suppress-text mode.
 * ponytail: family substring match so new Seedream / Nano-Banana variants are covered
 * without editing a hardcoded id list.
 * @param modelId - The model ID the user picked
 * @returns True if the model can render readable text in the image
 */
export function modelSupportsTextRendering(modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  return (
    modelId.includes('nano-banana') ||
    modelId.includes('seedream') ||
    modelId.includes('gemini-3-pro-image')
  );
}

/**
 * Process parent variation image URL
 * @param parentVariationId - The parent variation ID
 * @param variations - The variations array
 * @param r2Manager - R2 manager with getSignedUrl
 * @returns The processed image URL or null
 */
export async function processParentVariationImage(
  parentVariationId: string | undefined,
  variations: any[],
  r2Manager: { getSignedUrl: (url: string) => Promise<string> } = ClickatronR2Manager
): Promise<string | null> {
  if (!parentVariationId) return null;

  const parentVariation = variations.find((v: any) => v.id === parentVariationId);
  if (!parentVariation || !parentVariation.imageRef) return null;

  // Refresh signed URLs when needed (private R2 or already-signed URLs)
  let imageUrl = parentVariation.imageRef;

  if (imageUrl && (imageUrl.includes('r2.cloudflarestorage.com') || imageUrl.includes('X-Amz-Algorithm=') || imageUrl.includes('X-Amz-Signature='))) {
    try {
      console.log('Getting fresh signed URL for R2 image:', imageUrl);
      imageUrl = await r2Manager.getSignedUrl(imageUrl);
      console.log('Got signed URL:', imageUrl);
    } catch (error) {
      console.error('Failed to get signed URL for parent image:', error);
      // Continue with the original URL if signed URL generation fails
    }
  }

  return imageUrl;
}

/**
 * Process reference images from job payload
 * @param referenceImageRefs - The reference image URIs
 * @param ClickatronR2Manager - The R2 manager instance
 * @returns Array of processed image URLs
 */
export async function processReferenceImages(
  referenceImageRefs: string[] | undefined,
  r2Manager: { getSignedUrl: (url: string) => Promise<string> } = ClickatronR2Manager
): Promise<string[]> {
  if (!referenceImageRefs || referenceImageRefs.length === 0) return [];

  // Get fresh signed URLs for all reference images
  const signedImageUrls = await Promise.all(
    referenceImageRefs.map(async (uri: string) => {
      try {
        if (uri && (uri.includes('r2.cloudflarestorage.com') || uri.includes('X-Amz-Algorithm=') || uri.includes('X-Amz-Signature='))) {
          console.log('Getting fresh signed URL for R2 image:', uri);
          const signedUrl = await r2Manager.getSignedUrl(uri);
          console.log('Got signed URL:', signedUrl);
          return signedUrl;
        }
        return uri;
      } catch (error) {
        console.error('Failed to get signed URL for reference image:', error);
        // Return the original URL if signed URL generation fails
        return uri;
      }
    })
  );

  return signedImageUrls;
}
