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
  parameters: z.object({
    prompt: z.string().min(1),
    image_url: z.string().optional(),
    image_urls: z.string().optional(),
    aspect_ratio: z.string().optional(),
    image_size: z.string().optional(),
    max_images: z.string().optional(),
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
 */
export const CLICKATRON_MODELS: Record<string, ModelConfig> = {
  'flux-kontext/dev': {
    id: 'flux-kontext/dev',
    name: 'Flux Kontext Dev',
    stages: ['edit'],
    type: 'image-to-image',
    isDefault: true,
    parameters: {
      prompt: 'prompt',
      image_url: 'image_url',
      aspect_ratio: 'aspect_ratio',
    },
    constraints: {
      promptMaxLength: 1024,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      maxImages: 1,
    },
  },
  'bytedance/seedream/v4/edit': {
    id: 'bytedance/seedream/v4/edit',
    name: 'Seedream V4 Edit',
    stages: ['edit'],
    type: 'image-to-image',
    parameters: {
      prompt: 'prompt',
      image_urls: 'image_urls',
      image_size: 'image_size',
      max_images: 'max_images',
    },
    constraints: {
      promptMaxLength: 512,
      maxImages: 4,
    },
  },
  'bytedance/seedream/v4/text-to-image': {
    id: 'bytedance/seedream/v4/text-to-image',
    name: 'Seedream V4 Text-to-Image',
    stages: ['ideation'],
    type: 'text-to-image',
    parameters: {
      prompt: 'prompt',
      image_size: 'image_size',
      max_images: 'max_images',
    },
    constraints: {
      promptMaxLength: 512,
    },
  },
  'imagen4/preview': {
    id: 'imagen4/preview',
    name: 'Imagen4 Preview',
    stages: ['ideation'],
    type: 'text-to-image',
    parameters: {
      prompt: 'prompt',
      aspect_ratio: 'aspect_ratio',
    },
    constraints: {
      promptMaxLength: 2048,
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'],
    },
  },
};