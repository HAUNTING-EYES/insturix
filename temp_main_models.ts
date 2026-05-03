
// /**
//  * Defines the type of model.
//  * - 'text-to-image': Generates an image from a text prompt.
//  * - 'image-to-image': Generates an image from a text prompt and a source image.
//  * - 'inpainting': Fills in selected areas of an image based on a prompt and mask.
//  */
// export type ModelType = 'text-to-image' | 'image-to-image' | 'inpainting';

// /**
//  * Defines the parameter mapping for a single AI model.
//  */
// export interface ParameterMapping {
//   prompt: string;
//   image_url?: string;
//   image_urls?: string;
//   mask_url?: string;
//   aspect_ratio?: string;
//   image_size?: string;
//   max_images?: string;
//   resolution?: string;
//   num_images?: string;
//   enable_safety_checker?: string;
//   output_format?: string;
//   resolution_mode?: string;
//   guidance_scale?: string;
//   num_inference_steps?: string;
//   acceleration?: string;
//   seed?: string;
//   strength?: string;
// }

// /**
//  * Defines the constraints for a single AI model.
//  */
// export interface ModelConstraints {
//   promptMaxLength?: number;
//   allowedAspectRatios?: string[];
//   minImages?: number;
//   maxImages?: number;
// }

// /**
//  * Defines the configuration for a single AI model.
//  */
// export interface ModelConfig {
//   id: string;
//   name: string;
//   type: ModelType;
//   isDefault?: boolean;
//   isInpaintingCapable?: boolean;
//   parameterMapping: ParameterMapping;
//   constraints: ModelConstraints;
// }

// /**
//  * A map of all available models, keyed by their unique ID.
//  * Simplified configuration with clear parameter mappings.
//  */
// export const CLICKATRON_MODELS: Record<string, ModelConfig> = {
//   'fal-ai/imagen4/preview': {
//     id: 'fal-ai/imagen4/preview',
//     name: 'Google Imagen4',
//     type: 'text-to-image',
//     isDefault: true,
//     parameterMapping: {
//       prompt: 'prompt',
//       aspect_ratio: 'aspect_ratio',
//       num_images: 'num_images',
//       resolution: 'resolution'
//     },
//     constraints: {
//       promptMaxLength: 2048,
//       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
//       minImages: 0,
//       maxImages: 0,
//     },
//   },
//   'fal-ai/bytedance/seedream/v4/edit': {
//     id: 'fal-ai/bytedance/seedream/v4/edit',
//     name: 'Seedream V4 Edit',
//     type: 'inpainting',
//     isDefault: true, // Primary inpainting model (proven working on Fal AI)
//     isInpaintingCapable: true,
//     parameterMapping: {
//       prompt: 'prompt',
//       image_size: 'image_size',
//       num_images: 'num_images',
//       max_images: 'max_images',
//       enable_safety_checker: 'enable_safety_checker',
//       image_urls: 'image_urls',
//       mask_url: 'mask_url'
//     },
//     constraints: {
//       promptMaxLength: 512,
//       minImages: 1,
//       maxImages: 4,
//       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
//     },
//   },
//   'fal-ai/flux-kontext/dev': {
//     id: 'fal-ai/flux-kontext/dev',
//     name: 'Flux Kontext Dev',
//     type: 'image-to-image',
//     parameterMapping: {
//       prompt: 'prompt',
//       image_url: 'image_url',
//       num_inference_steps: 'num_inference_steps',
//       guidance_scale: 'guidance_scale',
//       num_images: 'num_images',
//       enable_safety_checker: 'enable_safety_checker',
//       output_format: 'output_format',
//       acceleration: 'acceleration',
//       resolution_mode: 'resolution_mode'
//     },
//     constraints: {
//       promptMaxLength: 1024,
//       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
//       minImages: 1,
//       maxImages: 1,
//     },
//   },
//   'fal-ai/bytedance/seedream/v4/text-to-image': {
//     id: 'fal-ai/bytedance/seedream/v4/text-to-image',
//     name: 'Seedream V4 Text-to-Image',
//     type: 'text-to-image',
//     isDefault: true,
//     parameterMapping: {
//       prompt: 'prompt',
//       image_size: 'image_size',
//       num_images: 'num_images',
//       max_images: 'max_images',
//       enable_safety_checker: 'enable_safety_checker'
//     },
//     constraints: {
//       promptMaxLength: 512,
//       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
//       minImages: 0,
//       maxImages: 0,
//     },
//   },
//   // FLUX Dev Inpainting (High Priority)
//   'fal-ai/flux/dev/inpainting': {
//     id: 'fal-ai/flux/dev/inpainting',
//     name: 'FLUX Dev Inpainting',
//     type: 'inpainting',
//     parameterMapping: {
//       prompt: 'prompt',
//       image_url: 'image_url',
//       mask_url: 'mask_url',
//       num_images: 'num_images',
//       enable_safety_checker: 'enable_safety_checker',
//       output_format: 'output_format',
//       guidance_scale: 'guidance_scale',
//       num_inference_steps: 'num_inference_steps',
//       strength: 'strength'
//     },
//     constraints: {
//       promptMaxLength: 1024,
//       minImages: 1,
//       maxImages: 1,
//       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
//     },
//   },
//   // FLUX Pro Fill (High Priority)
//   'fal-ai/flux-pro/v1/fill': {
//     id: 'fal-ai/flux-pro/v1/fill',
//     name: 'FLUX Pro Fill',
//     type: 'inpainting',
//     parameterMapping: {
//       prompt: 'prompt',
//       image_url: 'image_url',
//       mask_url: 'mask_url',
//       num_images: 'num_images',
//       enable_safety_checker: 'enable_safety_checker',
//       output_format: 'output_format',
//       guidance_scale: 'guidance_scale',
//       num_inference_steps: 'num_inference_steps'
//     },
//     constraints: {
//       promptMaxLength: 1024,
//       minImages: 1,
//       maxImages: 1,
//       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
//     },
//   },
//   // FLUX Kontext Inpainting with LoRA (Medium Priority)
//   'fal-ai/flux-kontext/dev/inpainting': {
//     id: 'fal-ai/flux-kontext/dev/inpainting',
//     name: 'Kontext Inpainting with LoRA',
//     type: 'inpainting',
//     parameterMapping: {
//       prompt: 'prompt',
//       image_url: 'image_url',
//       mask_url: 'mask_url',
//       num_images: 'num_images',
//       enable_safety_checker: 'enable_safety_checker',
//       output_format: 'output_format',
//       guidance_scale: 'guidance_scale',
//       num_inference_steps: 'num_inference_steps'
//     },
//     constraints: {
//       promptMaxLength: 1024,
//       minImages: 1,
//       maxImages: 1,
//       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
//     },
//   },
//   // DEPRECATED: Mapped to FLUX Pro Fill for backward compatibility
//   'fal-ai/stable-diffusion-inpainting': {
//     id: 'fal-ai/stable-diffusion-inpainting', // Keep origin ID to avoid duplicate key errors
//     name: 'Stable Diffusion Inpainting (Deprecated)',
//     type: 'inpainting',
//     parameterMapping: {
//       prompt: 'prompt',
//       image_url: 'image_url',
//       mask_url: 'mask_url',
//       num_images: 'num_images',
//       enable_safety_checker: 'enable_safety_checker',
//       output_format: 'output_format',
//       guidance_scale: 'guidance_scale',
//       num_inference_steps: 'num_inference_steps',
//       strength: 'strength'
//     },
//     constraints: {
//       promptMaxLength: 1024,
//       minImages: 1,
//       maxImages: 1,
//       allowedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '21:9', '3:2'],
//     },
//   },
// };

// /**
//  * Filter models based on the number of reference images
//  * @param models - The models to filter
//  * @param referenceImageCount - The number of reference images
//  * @returns The filtered models
//  */
// export function filterModelsByReferenceImageCount(
//   models: ModelConfig[],
//   referenceImageCount: number
// ): ModelConfig[] {
//   return models.filter(model => {
//     const minImages = model.constraints?.minImages ?? 0;
//     const maxImages = model.constraints?.maxImages ?? 0;
//     return referenceImageCount >= minImages && referenceImageCount <= maxImages;
//   });
// }

// /**
//  * Get available models for a specific context
//  * @param context - The context ('ideation', 'newVariation', 'edit', or 'generativeFill')
//  * @param userAttachedImages - The number of images attached by the user
//  * @returns The available models
//  */
// export function getAvailableModels(
//   context: 'ideation' | 'newVariation' | 'edit' | 'generativeFill',
//   userAttachedImages: number = 0
// ): ModelConfig[] {
//   const allModels = Object.values(CLICKATRON_MODELS);

//   // For generative fill, return specific approved models
//   if (context === 'generativeFill') {
//     const allowedModels = [
//       'fal-ai/flux/dev/inpainting',
//       'fal-ai/flux-pro/v1/fill',
//       'fal-ai/flux-kontext/dev/inpainting'
//     ];
//     return allModels.filter(model => allowedModels.includes(model.id));
//   }

//   // For regular variation flows, exclude inpainting models (they require masks)
//   const nonInpaintingModels = allModels.filter(model => model.type !== 'inpainting');

//   // Calculate total reference images based on context
//   let referenceImageCount = userAttachedImages;
//   if (context === 'edit') {
//     // Edit context has 1 base image + user attached images
//     referenceImageCount += 1;
//   }
//   // For ideation and newVariation, it's just user attached images (starting from 0)

//   return filterModelsByReferenceImageCount(nonInpaintingModels, referenceImageCount);
// }

// /**
// * Generate payload for a specific model based on generation parameters
//  * @param modelConfig - The model configuration

// /**
// * Generate payload for Imagen4 Preview model
//  */
// export function generateImagen4PreviewPayload(
//   job: any,
//   ratio: string,
//   numImages: number
// ): Record<string, any> {
//   return {
//     prompt: job.prompt,
//     aspect_ratio: ratio,
//     num_images: numImages,
//     resolution: "1K"
//   };
// }

// /**
//  * Generate payload for Flux Kontext Dev model
//  */
// export function generateFluxKontextDevPayload(
//   job: any,
//   numInferenceSteps: number,
//   guidanceScale: number,
//   numImages: number,
//   enableSafetyChecker: boolean,
//   outputFormat: string,
//   acceleration: string,
//   imageUrls?: string[]
// ): Record<string, any> {
//   const payload: Record<string, any> = {
//     prompt: job.prompt,
//     num_inference_steps: numInferenceSteps,
//     guidance_scale: guidanceScale,
//     num_images: numImages,
//     enable_safety_checker: enableSafetyChecker,
//     output_format: outputFormat,
//     acceleration: acceleration,
//     resolution_mode: "match_input"
//   };

//   // Add image URL if it exists (Flux Kontext Dev expects a single image_url)
//   if (imageUrls && imageUrls.length > 0) {
//     payload.image_url = imageUrls[0];
//   }

//   return payload;
// }

// /**
// * Generate payload for Seedream V4 Edit model (supports both image-to-image and inpainting)
//  */
// export function generateSeedreamV4EditPayload(
//   job: any,
//   width: number,
//   height: number,
//   numImages: number,
//   enableSafetyChecker: boolean,
//   imageUrls?: string[],
//   maskUrl?: string
// ): Record<string, any> {
//   const payload: Record<string, any> = {
//     prompt: job.prompt,
//     image_size: { width, height },
//     num_images: numImages,
//     max_images: 1,
//     enable_safety_checker: enableSafetyChecker
//   };

//   // Handle image URLs - Seedream V4 Edit model expects image_urls as an array
//   if (imageUrls && imageUrls.length > 0) {
//     payload.image_urls = imageUrls;
//   }

//   // Handle mask URL for inpainting mode
//   if (maskUrl) {
//     // Add system prompt for inpainting
//     const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;
//     payload.prompt = fullPrompt;
//     payload.mask_url = maskUrl;
//   }

//   return payload;
// }

// /**
// * Generate payload for Seedream V4 Text-to-Image model
// */
// export function generateSeedreamV4TextToImagePayload(
//   job: any,
//   width: number,
//   height: number,
//   numImages: number,
//   enableSafetyChecker: boolean
// ): Record<string, any> {
//   return {
//     prompt: job.prompt,
//     image_size: { width, height },
//     num_images: numImages,
//     max_images: 1,
//     enable_safety_checker: enableSafetyChecker
//   };
// }

// /**
//  * System prompt prepended to user prompts for generative fill
//  */
// export const GENERATIVE_FILL_SYSTEM_PROMPT = `Fill the masked area naturally to match the surrounding image. Keep content within the selection.`;



// /**
//  * Generate payload for Seedream V4 Inpainting (used for generative fill)
//  */
// export function generateSeedreamInpaintingPayload(
//   job: any,
//   imageUrl: string,
//   maskUrl: string,
//   numImages: number,
//   enableSafetyChecker: boolean,
//   outputFormat: string
// ): Record<string, any> {
//   // Prepend system prompt for inpainting
//   const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

//   return {
//     prompt: fullPrompt,
//     image_urls: [imageUrl],  // Seedream expects array
//     mask_url: maskUrl,
//     num_images: numImages,
//     max_images: 1,
//     enable_safety_checker: enableSafetyChecker,
//     output_format: outputFormat
//   };
// }

// /**
//  * Generate payload for FLUX Dev Inpainting model
//  */
// export function generateFluxDevInpaintingPayload(
//   job: any,
//   imageUrl: string,
//   maskUrl: string,
//   numImages: number,
//   enableSafetyChecker: boolean,
//   outputFormat: string,
//   guidanceScale: number = 3.5,
//   numInferenceSteps: number = 28,
//   strength: number = 1.0
// ): Record<string, any> {
//   const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

//   return {
//     prompt: fullPrompt,
//     image_url: imageUrl,
//     mask_url: maskUrl,
//     num_images: numImages,
//     enable_safety_checker: enableSafetyChecker,
//     output_format: outputFormat,
//     guidance_scale: guidanceScale,
//     num_inference_steps: numInferenceSteps,
//     strength: strength
//   };
// }

// /**
//  * Generate payload for FLUX Pro Fill model
//  */
// export function generateFluxProFillPayload(
//   job: any,
//   imageUrl: string,
//   maskUrl: string,
//   numImages: number,
//   enableSafetyChecker: boolean,
//   outputFormat: string,
//   guidanceScale: number = 3.5,
//   numInferenceSteps: number = 28
// ): Record<string, any> {
//   const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

//   return {
//     prompt: fullPrompt,
//     image_url: imageUrl,
//     mask_url: maskUrl,
//     num_images: numImages,
//     enable_safety_checker: enableSafetyChecker,
//     output_format: outputFormat,
//     guidance_scale: guidanceScale,
//     num_inference_steps: numInferenceSteps
//   };
// }

// /**
//  * Generate payload for FLUX Kontext Inpainting model
//  */
// export function generateFluxKontextInpaintingPayload(
//   job: any,
//   imageUrl: string,
//   maskUrl: string,
//   numImages: number,
//   enableSafetyChecker: boolean,
//   outputFormat: string,
//   guidanceScale: number = 3.5,
//   numInferenceSteps: number = 28
// ): Record<string, any> {
//   const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

//   const payload: Record<string, any> = {
//     prompt: fullPrompt,
//     image_url: imageUrl,
//     mask_url: maskUrl,
//     strength: 0.9, // Often required for inpainting
//     guidance_scale: guidanceScale,
//     num_inference_steps: numInferenceSteps,
//     num_images: numImages,
//     enable_safety_checker: enableSafetyChecker,
//     output_format: outputFormat
//   };

//   return payload;
// }
// export function generateFluxProInpaintingPayload(
//   job: any,
//   imageUrl: string,
//   maskUrl: string,
//   numInferenceSteps: number,
//   guidanceScale: number,
//   numImages: number,
//   enableSafetyChecker: boolean,
//   outputFormat: string,
//   strength: number
// ): Record<string, any> {
//   // Prepend system prompt for inpainting
//   const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

//   return {
//     prompt: fullPrompt,
//     image_url: imageUrl,
//     mask_url: maskUrl,
//     num_inference_steps: numInferenceSteps,
//     guidance_scale: guidanceScale,
//     num_images: numImages,
//     enable_safety_checker: enableSafetyChecker,
//     output_format: outputFormat,
//     strength: strength
//   };
// }

// /**
//  * Generate payload for FLUX Pro Ultra Inpainting model
//  */
// export function generateFluxProUltraInpaintingPayload(
//   job: any,
//   imageUrl: string,
//   maskUrl: string,
//   numImages: number,
//   enableSafetyChecker: boolean,
//   outputFormat: string
// ): Record<string, any> {
//   // Prepend system prompt for inpainting
//   const fullPrompt = `${GENERATIVE_FILL_SYSTEM_PROMPT}\n\nUser Request: ${job.prompt}`;

//   return {
//     prompt: fullPrompt,
//     image_url: imageUrl,
//     mask_url: maskUrl,
//     num_images: numImages,
//     enable_safety_checker: enableSafetyChecker,
//     output_format: outputFormat
//   };
// }

// /**
// * Generate model-specific payload based on model ID
//  */
// export function generateModelPayload(
//   modelId: string,
//   generationParams: Record<string, any>,
//   job: any,
//   ratio: string,
//   width: number,
//   height: number
// ): Record<string, any> {
//   switch (modelId) {
//     case 'fal-ai/imagen4/preview':
//       return generateImagen4PreviewPayload(job, ratio, generationParams.num_images || 1);
//     case 'fal-ai/flux-kontext/dev':
//       return generateFluxKontextDevPayload(
//         job,
//         generationParams.num_inference_steps || 28,
//         generationParams.guidance_scale || 3.5,
//         generationParams.num_images || 1,
//         generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
//         generationParams.output_format || "jpeg",
//         generationParams.acceleration || "none",
//         generationParams.image_urls
//       );
//     case 'fal-ai/bytedance/seedream/v4/edit':
//       return generateSeedreamV4EditPayload(
//         job,
//         width,
//         height,
//         generationParams.num_images || 1,
//         generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
//         generationParams.image_urls,
//         generationParams.mask_url // Pass mask_url for inpainting
//       );
//     case 'fal-ai/bytedance/seedream/v4/text-to-image':
//       return generateSeedreamV4TextToImagePayload(
//         job,
//         width,
//         height,
//         generationParams.num_images || 1,
//         generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false
//       );
//     case 'fal-ai/flux/dev/inpainting':
//     case 'fal-ai/flux-pro/v1/fill':
//     case 'fal-ai/flux-kontext/dev/inpainting':
//     case 'fal-ai/flux-pro/v1.1-ultra-inpainting':
//     case 'fal-ai/stable-diffusion-inpainting': // Legacy support
//       // Robust parameter normalization for inpainting
//       let imageUrl = generationParams.image_url;
//       if (!imageUrl && generationParams.image_urls && generationParams.image_urls.length > 0) {
//         imageUrl = generationParams.image_urls[0];
//       }

//       if (!imageUrl || !generationParams.mask_url) {
//         // Log error but don't throw to avoid crashing the entire worker before it can log
//         console.error(`[generateModelPayload] Missing required parameters for ${modelId}: image_url=${!!imageUrl}, mask_url=${!!generationParams.mask_url}`);
//         throw new Error(`Inpainting requires both image_url and mask_url. Got params: ${JSON.stringify(generationParams)}`);
//       }

//       // Select the correct generator based on model ID
//       if (modelId === 'fal-ai/flux/dev/inpainting' || modelId === 'fal-ai/stable-diffusion-inpainting') {
//         return generateFluxDevInpaintingPayload(
//           job,
//           imageUrl,
//           generationParams.mask_url,
//           generationParams.num_images || 1,
//           generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
//           generationParams.output_format || "jpeg",
//           generationParams.guidance_scale || 3.5,
//           generationParams.num_inference_steps || 28
//         );
//       } else if (modelId === 'fal-ai/flux-pro/v1/fill') {
//         return generateFluxProFillPayload(
//           job,
//           imageUrl,
//           generationParams.mask_url,
//           generationParams.num_images || 1,
//           generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
//           generationParams.output_format || "jpeg",
//           generationParams.guidance_scale || 3.5,
//           generationParams.num_inference_steps || 28
//         );
//       } else if (modelId === 'fal-ai/flux-kontext/dev/inpainting') {
//         return generateFluxKontextInpaintingPayload(
//           job,
//           imageUrl,
//           generationParams.mask_url,
//           generationParams.num_images || 1,
//           generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
//           generationParams.output_format || "jpeg",
//           generationParams.guidance_scale || 3.5,
//           generationParams.num_inference_steps || 28
//         );
//       } else {
//         return generateFluxProUltraInpaintingPayload(
//           job,
//           imageUrl,
//           generationParams.mask_url,
//           generationParams.num_images || 1,
//           generationParams.enable_safety_checker !== undefined ? generationParams.enable_safety_checker : false,
//           generationParams.output_format || "jpeg"
//         );
//       }
//     // Legacy support for Stable Diffusion Inpainting -> Flux

//     default:
//       throw new Error(`Unsupported model ID: ${modelId}`);
//   }
// }

// /**
//  * Check if a model supports the seed parameter
//  * @param modelId - The model ID
//  * @returns True if the model supports the seed parameter, false otherwise
//  */
// export function modelSupportsSeed(modelId: string): boolean {
//   const modelConfig = CLICKATRON_MODELS[modelId];
//   if (!modelConfig) return false;
//   return !!modelConfig.parameterMapping.seed;
// }

// /**
//  * Process parent variation image URL
//  * @param parentVariationId - The parent variation ID
//  * @param variations - The variations array
//  * @param ClickatronR2Manager - The 
//  * 
//  *  manager instance
//  * @returns The processed image URL or null
//  */
// export async function processParentVariationImage(
//   parentVariationId: string | undefined,
//   variations: any[],
//   ClickatronR2Manager: any
// ): Promise<string | null> {
//   if (!parentVariationId) return null;

//   const parentVariation = variations.find((v: any) => v.id === parentVariationId);
//   if (!parentVariation || !parentVariation.imageRef) return null;

//   // Check if the imageRef is a raw GCS URL or potentially expired signed URL
//   let imageUrl = parentVariation.imageRef;

//   // If it's a raw GCS URL (not containing signature parameters), get a fresh signed URL
//   if (imageUrl && !imageUrl.includes('GoogleAccessId') &&
//     !imageUrl.includes('Signature')) {
//     try {
//       console.log('Getting fresh signed URL for R2 image:', imageUrl);
//       imageUrl = await ClickatronR2Manager.getSignedUrl(imageUrl);
//       console.log('Got signed URL:', imageUrl);
//     } catch (error) {
//       console.error('Failed to get signed URL for parent image:', error);
//       // Continue with the original URL if signed URL generation fails
//     }
//   }

//   return imageUrl;
// }

// /**
//  * Process reference images from job payload
//  * @param referenceImageRefs - The reference image URIs
//  * @param ClickatronR2Manager - The R2 manager instance
//  * @returns Array of processed image URLs
//  */
// export async function processReferenceImages(
//   referenceImageRefs: string[] | undefined,
//   ClickatronR2Manager: any
// ): Promise<string[]> {
//   if (!referenceImageRefs || referenceImageRefs.length === 0) return [];

//   // Get fresh signed URLs for all reference images
//   const signedImageUrls = await Promise.all(
//     referenceImageRefs.map(async (uri: string) => {
//       try {
//         // If it's a raw R2 URL (not containing signature parameters), get a fresh signed URL
//         if (uri && !uri.includes('GoogleAccessId') &&
//           !uri.includes('Signature')) {
//           console.log('Getting fresh signed URL for R2 image:', uri);
//           const signedUrl = await ClickatronR2Manager.getSignedUrl(uri);
//           console.log('Got signed URL:', signedUrl);
//           return signedUrl;
//         }
//         // If it's already a signed URL, use it as is
//         return rawR2Url;
//       } catch (error) {
//         console.error('Failed to get signed URL for reference image:', error);
//         // Return the original URL if signed URL generation fails
//         return rawR2Url;
//       }
//     })
//   );

//   return signedImageUrls;
// }
