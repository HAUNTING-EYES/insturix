
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

export const DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID = 'fal-ai/imagen4/preview';
export const DEFAULT_CLICKATRON_IMAGE_TO_IMAGE_MODEL_ID = 'fal-ai/flux-kontext/dev';
export const IMAGEN4_PREVIEW_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;

/**
 * A map of all available models, keyed by their unique ID.
 * Simplified configuration with clear parameter mappings.
 */
export const CLICKATRON_MODELS: Record<string, ModelConfig> = {
  'fal-ai/imagen4/preview': {
    id: 'fal-ai/imagen4/preview',
    name: 'Google Imagen4',
    types: ['text-to-image'],
    isDefault: true,
    parameterMapping: {
      prompt: 'prompt',
      aspect_ratio: 'aspect_ratio',
      num_images: 'num_images',
      resolution: 'resolution'
    },
    constraints: {
      promptMaxLength: 2048,
      allowedAspectRatios: [...IMAGEN4_PREVIEW_ASPECT_RATIOS],
      minImages: 0,
      maxImages: 0,
    },
  },
  'fal-ai/bytedance/seedream/v4/edit': {
    id: 'fal-ai/bytedance/seedream/v4/edit',
    name: 'Seedream V4 Edit',
    types: ['inpainting', 'image-to-image'],
    isDefault: true, // Primary inpainting model (proven working on Fal AI)
    isInpaintingCapable: true,
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      max_images: 'max_images',
      enable_safety_checker: 'enable_safety_checker',
      image_urls: 'image_urls',
      mask_url: 'mask_url'
    },
    constraints: {
      promptMaxLength: 512,
      minImages: 1,
      maxImages: 4,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
    },
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
  'fal-ai/bytedance/seedream/v4/text-to-image': {
    id: 'fal-ai/bytedance/seedream/v4/text-to-image',
    name: 'Seedream V4',
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
      promptMaxLength: 512,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
    },
  },
  // FLUX Dev Inpainting (High Priority)
  'fal-ai/flux/dev/inpainting': {
    id: 'fal-ai/flux/dev/inpainting',
    name: 'FLUX Dev Inpainting',
    types: ['inpainting'],
    parameterMapping: {
      prompt: 'prompt',
      image_url: 'image_url',
      mask_url: 'mask_url',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      output_format: 'output_format',
      guidance_scale: 'guidance_scale',
      num_inference_steps: 'num_inference_steps',
      strength: 'strength'
    },
    constraints: {
      promptMaxLength: 1024,
      minImages: 1,
      maxImages: 1,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
    },
  },
  // FLUX Pro Fill (High Priority)
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
  // FLUX Kontext Inpainting with LoRA (Medium Priority)
  'fal-ai/flux-kontext/dev/inpainting': {
    id: 'fal-ai/flux-kontext/dev/inpainting',
    name: 'Kontext Inpainting with LoRA',
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
  // Nanobanana (Text-to-Image)
  'fal-ai/nano-banana': {
    id: 'fal-ai/nano-banana',
    name: 'Nanobanana',
    types: ['text-to-image'],
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      seed: 'seed'
    },
    constraints: {
      promptMaxLength: 2048,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
    },
  },
  // Nanobanana (Edit)
  'fal-ai/nano-banana/edit': {
    id: 'fal-ai/nano-banana/edit',
    name: 'Nanobanana Edit',
    types: ['image-to-image'],
    parameterMapping: {
      prompt: 'prompt',
      image_urls: 'image_urls',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      seed: 'seed'
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 1,
      maxImages: 1,
    },
  },
  // Nanobanana Pro (Text-to-Image)
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
  // Nanobanana Pro (Edit) — also used for sketch-to-edit
  'fal-ai/nano-banana-pro/edit': {
    id: 'fal-ai/nano-banana-pro/edit',
    name: 'Nanobanana Pro Edit',
    types: ['image-to-image', 'inpainting'],
    isSketchToEdit: true,
    isDefault: true, // default for sketch-to-edit
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
  // Gemini 3 Pro Image Preview (Generative Fill)
  'fal-ai/gemini-3-pro-image-preview': {
    id: 'fal-ai/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image Preview',
    types: ['inpainting'],
    isInpaintingCapable: true,
    parameterMapping: {
      prompt: 'prompt',
      image_urls: 'image_urls',
      mask_url: 'mask_url',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      output_format: 'output_format'
    },
    constraints: {
      promptMaxLength: 1024,
      minImages: 1,
      maxImages: 1,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
    },
  },
  // Seedream 4.5 (Text-to-Image)
  'fal-ai/bytedance/seedream/v4.5/text-to-image': {
    id: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    name: 'Seedream 4.5',
    types: ['text-to-image'],
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
    },
  },
  // Seedream 4.5 (Edit)
  'fal-ai/bytedance/seedream/v4.5/edit': {
    id: 'fal-ai/bytedance/seedream/v4.5/edit',
    name: 'Seedream 4.5 Edit',
    types: ['image-to-image', 'inpainting'],
    isInpaintingCapable: true,
    isSketchToEdit: true, // also shown in sketch-to-edit
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      max_images: 'max_images',
      enable_safety_checker: 'enable_safety_checker',
      image_urls: 'image_urls',
      mask_url: 'mask_url'
    },
    constraints: {
       promptMaxLength: 1024,
       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
       minImages: 1,
       maxImages: 4,
    },
  },
  // ── Sketch-to-Edit Models ──────────────────────────────────────────────────
 
  // Flux 2 Pro (Edit) - High quality instruction-based editing
  'fal-ai/flux-2-pro/edit': {
    id: 'fal-ai/flux-2-pro/edit',
    name: 'Flux 2 Pro Edit',
    types: ['image-to-image'],
    isSketchToEdit: true,
    parameterMapping: {
      prompt: 'prompt',
      image_urls: 'image_urls',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 1,
      maxImages: 5,
    },
  },

  // Wan 2.6 Image  (array-based, up to 10+)
  'wan/v2.6/image-to-image': {
    id: 'wan/v2.6/image-to-image',
    name: 'Wan 2.6',
    types: ['image-to-image'],
    isSketchToEdit: true,
    parameterMapping: {
      prompt: 'prompt',
      image_urls: 'image_urls',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 1,
      maxImages: 10,
    },
  },

  // DEPRECATED: Mapped to FLUX Pro Fill for backward compatibility
  'fal-ai/stable-diffusion-inpainting': {
    id: 'fal-ai/stable-diffusion-inpainting', // Keep origin ID to avoid duplicate key errors
    name: 'Stable Diffusion Inpainting (Deprecated)',
    types: ['inpainting'],
    parameterMapping: {
      prompt: 'prompt',
      image_url: 'image_url',
      mask_url: 'mask_url',
      num_images: 'num_images',
      enable_safety_checker: 'enable_safety_checker',
      output_format: 'output_format',
      guidance_scale: 'guidance_scale',
      num_inference_steps: 'num_inference_steps',
      strength: 'strength'
    },
    constraints: {
      promptMaxLength: 1024,
      minImages: 1,
      maxImages: 1,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
    },
  },

  // NEW: Seedream 5.0 Lite (Inpainting/Generative Fill)
  'fal-ai/bytedance/seedream/v5/lite/edit': {
    id: 'fal-ai/bytedance/seedream/v5/lite/edit',
    name: 'Seedream 5.0 Lite',
    types: ['inpainting'],
    isInpaintingCapable: true,
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
      maxImages: 1,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
    },
  },



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

  if (preferredModel?.types.includes(type)) {
    return preferredModelId;
  }

  return (
    Object.values(CLICKATRON_MODELS).find((model) => model.isDefault && model.types.includes(type))?.id ||
    Object.values(CLICKATRON_MODELS).find((model) => model.types.includes(type))?.id ||
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
  const allModels = Object.values(CLICKATRON_MODELS);

  // For sketch-to-edit, return only models flagged for sketch-to-edit
  if (context === 'sketchToEdit') {
    return allModels.filter(model => model.isSketchToEdit === true);
  }

  // For generative fill, return specific approved models
  if (context === 'generativeFill') {
    const allowedModels = [
      'fal-ai/bytedance/seedream/v5/lite/edit',
      'fal-ai/nano-banana-pro/edit',
      'fal-ai/gemini-3-pro-image-preview'
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
    prompt: job.prompt,
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
export const GENERATIVE_FILL_SYSTEM_PROMPT = `<role>You are an inpainting model. Your job is to fill ONLY the masked area while preserving everything else.</role>

<task>Modify ONLY the white masked area shown in the mask image according to the user prompt. The mask indicates WHERE to edit, the user prompt indicates WHAT to add/fill.</task>

<rules>
1. ONLY modify the white masked area shown in the mask image
2. Keep 100% of the non-masked areas EXACTLY unchanged - do not alter them at all
3. Blend the generated content seamlessly with the surrounding pixels
4. Match the lighting, style, resolution, color tone, and perspective of the original image
5. Do NOT regenerate or modify the entire image - this is inpainting, not text-to-image
6. Preserve all objects, people, and details outside the masked region
</rules>

<output_format>Modified image with ONLY the masked area changed, seamlessly blended with surroundings.</output_format>`;

/**
 * System prompt prepended to user prompts for image-to-image editing (variations)
 */
export const IMAGE_TO_IMAGE_SYSTEM_PROMPT = `<role>You are an image editing model. Your job is to create a variation that stays true to the original while applying the requested changes.</role>

<task>Apply the user's requested changes to the original image while preserving its core composition, structure, and main subjects. The original image is the foundation - build upon it, don't replace it.</task>

<rules>
1. Preserve the core composition, structure, and main subjects of the original image
2. Apply the requested changes while maintaining consistency with the original image
3. Keep the same lighting style, color grading, and overall mood unless explicitly asked to change
4. Do NOT completely regenerate or reinterpret the entire image
5. Maintain the same level of detail, quality, and artistic style
6. Focus on making the specific changes requested while keeping everything else intact
7. CRITICAL: Maintain the EXACT aspect ratio and dimensions of the original image - do NOT change the image size or crop
</rules>

<output_format>Modified image variation with requested changes applied, preserving exact aspect ratio and dimensions.</output_format>`;



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
    case 'fal-ai/imagen4/preview':
      return generateImagen4PreviewPayload(job, ratio, generationParams.num_images || 1);
    case 'fal-ai/flux-kontext/dev':
      return generateFluxKontextDevPayload(
        job,
        generationParams.num_inference_steps || 28,
        generationParams.guidance_scale || 3.5,
        generationParams.num_images || 1,
        generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
        generationParams.output_format || "jpeg",
        generationParams.acceleration || "none",
        generationParams.image_urls
      );
    case 'fal-ai/bytedance/seedream/v4/edit':
      return generateSeedreamV4EditPayload(
        job,
        width,
        height,
        generationParams.num_images || 1,
        generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
        generationParams.image_urls,
        generationParams.mask_url // Pass mask_url for inpainting
      );
    case 'fal-ai/bytedance/seedream/v4/text-to-image':
    case 'fal-ai/bytedance/seedream/v4.5/text-to-image':
      return generateSeedreamV4TextToImagePayload(
        job,
        width,
        height,
        generationParams.num_images || 1,
        generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false
      );
    case 'fal-ai/nano-banana':
    case 'fal-ai/nano-banana-pro':
       return {
          prompt: job.prompt,
          image_size: { width, height },
          num_images: generationParams.num_images || 1,
          enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
          seed: generationParams.seed
       };
    case 'fal-ai/nano-banana-pro/edit':
    case 'fal-ai/nano-banana/edit':
        // Add system prompt for image-to-image editing to preserve consistency
        const hasImageNano = generationParams.image_urls || (generationParams.image_url ? [generationParams.image_url] : []);
        const nanoFullPrompt = hasImageNano.length > 0 ? `${IMAGE_TO_IMAGE_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}` : job.prompt;
        return {
            prompt: nanoFullPrompt,
            image_urls: hasImageNano,
            image_size: { width, height }, // Preserve aspect ratio
            num_images: generationParams.num_images || 1,
            enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
            seed: generationParams.seed,
            // strength parameter is not supported by Nanobanana models (instruction-based editing)
        };
    case 'fal-ai/bytedance/seedream/v4/edit':
    case 'fal-ai/bytedance/seedream/v4.5/edit':
      return generateSeedreamV4EditPayload(
        job,
        width,
        height,
        generationParams.num_images || 1,
        generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
        generationParams.image_urls,
        generationParams.mask_url // Pass mask_url for inpainting
      );
    case 'fal-ai/flux-2-pro/edit':
      // Add system prompt for image-to-image editing to preserve consistency
      const hasImageFlux2 = generationParams.image_urls || [];
      const flux2FullPrompt = hasImageFlux2.length > 0 ? `${IMAGE_TO_IMAGE_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}` : job.prompt;
      // Flux 2 Pro expects image_urls array
      return {
        prompt: flux2FullPrompt,
        image_urls: hasImageFlux2,
        image_size: { width, height }, // Preserve aspect ratio
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
      };
    case 'wan/v2.6/image-to-image':
      // Add system prompt for image-to-image editing to preserve consistency
      const hasImageWan = generationParams.image_urls || [];
      const wanFullPrompt = hasImageWan.length > 0 ? `${IMAGE_TO_IMAGE_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}` : job.prompt;
      // Wan 2.6 expects image_urls array and supports multiple images
      return {
        prompt: wanFullPrompt,
        image_urls: hasImageWan,
        image_size: { width, height }, // Preserve aspect ratio
        num_images: generationParams.num_images || 1,
        enable_safety_checker: generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
      };
    case 'fal-ai/flux/dev/inpainting':
    case 'fal-ai/flux-pro/v1/fill':
    case 'fal-ai/flux-kontext/dev/inpainting':
    case 'fal-ai/flux-pro/v1.1-ultra-inpainting':
    case 'fal-ai/stable-diffusion-inpainting': // Legacy support
    case 'fal-ai/bytedance/seedream/v5/lite/edit':
    case 'fal-ai/nano-banana-pro/edit':
    case 'fal-ai/gemini-3-pro-image-preview':
      // Robust parameter normalization for inpainting
      let imageUrl = generationParams.image_url;
      if (!imageUrl && generationParams.image_urls && generationParams.image_urls.length > 0) {
        imageUrl = generationParams.image_urls[0];
      }

      if (!imageUrl || !generationParams.mask_url) {
        // Log error but don't throw to avoid crashing the entire worker before it can log
        console.error(`[generateModelPayload] Missing required parameters for ${modelId}: image_url=${!!imageUrl}, mask_url=${!!generationParams.mask_url}`);
        throw new Error(`Inpainting requires both image_url and mask_url. Got params: ${JSON.stringify(generationParams)}`);
      }

      // Select the correct generator based on model ID
      if (modelId === 'fal-ai/flux/dev/inpainting' || modelId === 'fal-ai/stable-diffusion-inpainting') {
        return generateFluxDevInpaintingPayload(
          job,
          imageUrl,
          generationParams.mask_url,
          generationParams.num_images || 1,
          generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
          generationParams.output_format || "jpeg",
          generationParams.guidance_scale || 3.5,
          generationParams.num_inference_steps || 28
        );
      } else if (modelId === 'fal-ai/flux-pro/v1/fill') {
        return generateFluxProFillPayload(
          job,
          imageUrl,
          generationParams.mask_url,
          generationParams.num_images || 1,
          generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
          generationParams.output_format || "jpeg",
          generationParams.guidance_scale || 3.5,
          generationParams.num_inference_steps || 28
        );
      } else if (modelId === 'fal-ai/flux-kontext/dev/inpainting') {
        return generateFluxKontextInpaintingPayload(
          job,
          imageUrl,
          generationParams.mask_url,
          generationParams.num_images || 1,
          generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
          generationParams.output_format || "jpeg",
          generationParams.guidance_scale || 3.5,
          generationParams.num_inference_steps || 28
        );
      } else if (modelId === 'fal-ai/bytedance/seedream/v5/lite/edit') {
        return generateSeedream5LitePayload(
          job,
          imageUrl,
          generationParams.mask_url,
          generationParams.num_images || 1,
          generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
          generationParams.output_format || "jpeg"
        );
      } else if (modelId === 'fal-ai/nano-banana-pro/edit') {
        return generateNanoBananaProEditPayload(
          job,
          imageUrl,
          generationParams.mask_url,
          generationParams.num_images || 1,
          generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
          generationParams.output_format || "jpeg",
          generationParams.seed
        );
      } else if (modelId === 'fal-ai/gemini-3-pro-image-preview') {
        return generateGemini3ProImagePreviewPayload(
          job,
          imageUrl,
          generationParams.mask_url,
          generationParams.num_images || 1,
          generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
          generationParams.output_format || "jpeg"
        );
      } else {
        return generateFluxProUltraInpaintingPayload(
          job,
          imageUrl,
          generationParams.mask_url,
          generationParams.num_images || 1,
          generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
          generationParams.output_format || "jpeg"
        );
      }
    // Legacy support for Stable Diffusion Inpainting -> Flux

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
