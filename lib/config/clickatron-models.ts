import { z } from 'zod';

/**
 * Defines the type of model.
 * - 'text-to-image': Generates an image from a text prompt.
 * - 'image-to-image': Generates an image from a text prompt and a source image.
 */
export const ModelTypeSchema = z.enum(['text-to-image', 'image-to-image']);
export type ModelType = z.infer<typeof ModelTypeSchema>;

/**
 * Defines the schema for a single AI model's configuration.
 */
export const ModelConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: ModelTypeSchema,
  isDefault: z.boolean().optional(),
  // Simplified parameter mapping for common model parameters
  parameterMapping: z.object({
    prompt: z.string(),
    image_url: z.string().optional(),
    image_urls: z.string().optional(),
    aspect_ratio: z.string().optional(),
    image_size: z.string().optional(),
    max_images: z.string().optional(),
    resolution: z.string().optional(),
    num_images: z.string().optional(),
    enable_safety_checker: z.string().optional(),
    output_format: z.string().optional(),
    resolution_mode: z.string().optional(),
    guidance_scale: z.string().optional(),
    num_inference_steps: z.string().optional(),
    acceleration: z.string().optional(),
    seed: z.string().optional(),
  }),
  constraints: z.object({
    promptMaxLength: z.number().optional(),
    allowedAspectRatios: z.array(z.string()).optional(),
    minImages: z.number().optional(),
    maxImages: z.number().optional(),
  }),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/**
 * A map of all available models, keyed by their unique ID.
 * Simplified configuration with clear parameter mappings.
 */
export const CLICKATRON_MODELS: Record<string, ModelConfig> = {
  'fal-ai/imagen4/preview': {
    id: 'fal-ai/imagen4/preview',
    name: 'Imagen4 Preview',
    type: 'text-to-image',
    isDefault: true,
    parameterMapping: {
      prompt: 'prompt',
      aspect_ratio: 'aspect_ratio',
      num_images: 'num_images',
      resolution: 'resolution'
    },
    constraints: {
      promptMaxLength: 2048,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      minImages: 0,
      maxImages: 0,
    },
  },
  'fal-ai/flux-kontext/dev': {
    id: 'fal-ai/flux-kontext/dev',
    name: 'Flux Kontext Dev',
    type: 'image-to-image',
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
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      minImages: 1,
      maxImages: 1,
    },
  },
  'fal-ai/bytedance/seedream/v4/edit': {
    id: 'fal-ai/bytedance/seedream/v4/edit',
    name: 'Seedream V4 Edit',
    type: 'image-to-image',
    parameterMapping: {
      prompt: 'prompt',
      image_size: 'image_size',
      num_images: 'num_images',
      max_images: 'max_images',
      enable_safety_checker: 'enable_safety_checker',
      image_urls: 'image_urls'
    },
    constraints: {
      promptMaxLength: 512,
      minImages: 1,
      maxImages: 4,
    },
  },
  'fal-ai/bytedance/seedream/v4/text-to-image': {
    id: 'fal-ai/bytedance/seedream/v4/text-to-image',
    name: 'Seedream V4 Text-to-Image',
    type: 'text-to-image',
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
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      minImages: 0,
      maxImages: 0,
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
 * Get available models for a specific context
 * @param context - The context ('ideation', 'newVariation', or 'edit')
 * @param userAttachedImages - The number of images attached by the user
 * @returns The available models
 */
export function getAvailableModels(
  context: 'ideation' | 'newVariation' | 'edit',
  userAttachedImages: number = 0
): ModelConfig[] {
  const allModels = Object.values(CLICKATRON_MODELS);
  
  // Calculate total reference images based on context
  let referenceImageCount = userAttachedImages;
  if (context === 'edit') {
    // Edit context has 1 base image + user attached images
    referenceImageCount += 1;
  }
  // For ideation and newVariation, it's just user attached images (starting from 0)
  
  return filterModelsByReferenceImageCount(allModels, referenceImageCount);
}