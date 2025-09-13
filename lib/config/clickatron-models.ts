import { z } from 'zod';

/**
 * Defines the stages where a model can be used.
 * - 'ideation': For generating initial concepts.
 * - 'edit': For generative edits in the canvas.
 */
export const ModelStageSchema = z.enum(['ideation', 'edit']);
export type ModelStage = z.infer<typeof ModelStageSchema>;

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
  stages: z.array(ModelStageSchema).min(1),
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
  }),
  constraints: z.object({
    promptMaxLength: z.number().optional(),
    allowedAspectRatios: z.array(z.string()).optional(),
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
    stages: ['ideation'],
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
    },
  },
  'fal-ai/flux-kontext/dev': {
    id: 'fal-ai/flux-kontext/dev',
    name: 'Flux Kontext Dev',
    stages: ['edit'],
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
      maxImages: 1,
    },
  },
  'fal-ai/bytedance/seedream/v4/edit': {
    id: 'fal-ai/bytedance/seedream/v4/edit',
    name: 'Seedream V4 Edit',
    stages: ['edit'],
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
      maxImages: 4,
    },
  },
  'fal-ai/bytedance/seedream/v4/text-to-image': {
    id: 'fal-ai/bytedance/seedream/v4/text-to-image',
    name: 'Seedream V4 Text-to-Image',
    stages: ['ideation'],
    type: 'text-to-image',
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
    },
  },
};