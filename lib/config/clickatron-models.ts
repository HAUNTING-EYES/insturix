
/**
 * Defines the type of model.
 * - 'text-to-image': Generates an image from a text prompt.
 * - 'image-to-image': Generates an image from a text prompt and a source image.
 */
export type ModelType = 'text-to-image' | 'image-to-image';

/**
 * Defines the parameter mapping for a single AI model.
 */
export interface ParameterMapping {
  prompt: string;
  image_url?: string;
  image_urls?: string;
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
  type: ModelType;
  isDefault?: boolean;
  parameterMapping: ParameterMapping;
  constraints: ModelConstraints;
}

/**
 * A map of all available models, keyed by their unique ID.
 * Simplified configuration with clear parameter mappings.
 */
export const CLICKATRON_MODELS: Record<string, ModelConfig> = {
  'fal-ai/imagen4/preview': {
    id: 'fal-ai/imagen4/preview',
    name: 'Google Imagen4',
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
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 0,
      maxImages: 0,
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
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
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
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
      minImages: 1,
      maxImages: 1,
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
      allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
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
  const payload: Record<string, any> = {
    prompt: job.prompt,
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
* Generate payload for Seedream V4 Edit model
 */
export function generateSeedreamV4EditPayload(
  job: any,
  width: number,
  height: number,
  numImages: number,
  enableSafetyChecker: boolean,
  imageUrls?: string[]
): Record<string, any> {
  const payload: Record<string, any> = {
    prompt: job.prompt,
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
        generationParams.image_urls
      );
    case 'fal-ai/bytedance/seedream/v4/text-to-image':
      return generateSeedreamV4TextToImagePayload(
        job,
        width,
        height,
        generationParams.num_images || 1,
        generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false
      );
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
 * @param ClickatronGCSManager - The GCS manager instance
 * @returns The processed image URL or null
 */
export async function processParentVariationImage(
  parentVariationId: string | undefined,
  variations: any[],
  ClickatronGCSManager: any
): Promise<string | null> {
  if (!parentVariationId) return null;
  
  const parentVariation = variations.find((v: any) => v.id === parentVariationId);
  if (!parentVariation || !parentVariation.imageRef) return null;
  
  // Check if the imageRef is a raw GCS URL or potentially expired signed URL
  let imageUrl = parentVariation.imageRef;
  
  // If it's a raw GCS URL (not containing signature parameters), get a fresh signed URL
  if (imageUrl.includes('storage.googleapis.com') &&
      !imageUrl.includes('GoogleAccessId') &&
      !imageUrl.includes('Signature')) {
    try {
      console.log('Getting fresh signed URL for GCS image:', imageUrl);
      imageUrl = await ClickatronGCSManager.getSignedUrl(imageUrl);
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
* @param ClickatronGCSManager - The GCS manager instance
* @returns Array of processed image URLs
 */
export async function processReferenceImages(
  referenceImageRefs: string[] | undefined,
  ClickatronGCSManager: any
): Promise<string[]> {
  if (!referenceImageRefs || referenceImageRefs.length === 0) return [];
  
  // Get fresh signed URLs for all reference images
  const signedImageUrls = await Promise.all(
    referenceImageRefs.map(async (gcsUri: string) => {
      try {
        // If it's a raw GCS URL (not containing signature parameters), get a fresh signed URL
        if (gcsUri.includes('storage.googleapis.com') &&
            !gcsUri.includes('GoogleAccessId') &&
            !gcsUri.includes('Signature')) {
          console.log('Getting fresh signed URL for GCS image:', gcsUri);
          const signedUrl = await ClickatronGCSManager.getSignedUrl(gcsUri);
          console.log('Got signed URL:', signedUrl);
          return signedUrl;
        }
        // If it's already a signed URL, use it as is
        return gcsUri;
      } catch (error) {
        console.error('Failed to get signed URL for reference image:', error);
        // Return the original URL if signed URL generation fails
        return gcsUri;
      }
    })
  );
  
  return signedImageUrls;
}
