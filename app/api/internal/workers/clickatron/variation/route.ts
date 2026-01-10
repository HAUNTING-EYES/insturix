import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { getJob, completeJob, failJob, startJob } from '@/lib/clickatron-jobs';
import { ClickatronGCSManager } from '@/lib/clickatron-gcs';
import { z } from 'zod';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextResponse } from 'next/server';
import { Variation } from '@/types/clickatron';
import { fal } from "@fal-ai/client";
import { CLICKATRON_MODELS, generateModelPayload, processParentVariationImage, processReferenceImages, modelSupportsSeed } from '@/lib/config/clickatron-models';
import { processRefund } from '@/lib/services/tasks/simple-refund';
import sharp from 'sharp';

// Configure Fal AI client
if (process.env.FAL_AI_API_KEY) {
  fal.config({
    credentials: process.env.FAL_AI_API_KEY,
  });
}

const workerRequestSchema = z.object({
  jobId: z.string(),
  sessionId: z.string(),
  variationId: z.string(),
  prompt: z.string(),
  userId: z.string(),
  parentVariationId: z.string().optional(),
  modelId: z.string().optional(),
  fineTuning: z.object({
    brightness: z.number(),
    contrast: z.number(),
    saturation: z.number(),
  }).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  referenceImageRefs: z.array(z.string()).optional(), // GCS URIs of reference images
  aspectRatio: z.string().optional(),
  maskUrl: z.string().optional(), // GCS URI for generative fill mask
});

// Parse aspect ratio string to width and height
function parseAspectRatio(aspectRatio: string): { width: number; height: number; ratio: string } {
  const [widthStr, heightStr] = aspectRatio.split(':');
  let width = parseFloat(widthStr);
  let height = parseFloat(heightStr);

  // If we have decimal ratios, scale them to integers
  if (width % 1 !== 0 || height % 1 !== 0) {
    const maxMultiplier = 100; // Prevent extremely large numbers
    let multiplier = 1;
    while ((width * multiplier) % 1 !== 0 || (height * multiplier) % 1 !== 0) {
      multiplier++;
      if (multiplier > maxMultiplier) {
        // Fallback to standard sizes if we can't get clean integers
        break;
      }
    }
    width = Math.round(width * multiplier);
    height = Math.round(height * multiplier);
  }

  // Standardize common aspect ratios to known sizes and supported ratios
  if (width === 16 && height === 9) {
    return { width: 1024, height: 576, ratio: "16:9" };
  } else if (width === 1 && height === 1) {
    return { width: 1024, height: 1024, ratio: "1:1" };
  } else if (width === 9 && height === 16) {
    return { width: 576, height: 1024, ratio: "9:16" };
  } else if (width === 4 && height === 3) {
    return { width: 1024, height: 768, ratio: "4:3" };
  } else if (width === 3 && height === 4) {
    return { width: 768, height: 1024, ratio: "3:4" };
  } else if (width === 21 && height === 9) {
    return { width: 1024, height: 439, ratio: "21:9" };
  } else if (width === 9 && height === 21) {
    return { width: 439, height: 1024, ratio: "9:21" };
  }

  // For other ratios, maintain the aspect ratio but use reasonable dimensions
  const maxSize = 1024;
  const ratio = width / height;

  // Return the original ratio as a string for models that support it
  if (ratio >= 1) {
    // Landscape or square
    return { width: maxSize, height: Math.round(maxSize / ratio), ratio: `${width}:${height}` };
  } else {
    // Portrait
    return { width: Math.round(maxSize * ratio), height: maxSize, ratio: `${width}:${height}` };
  }
}

async function handler(req: Request) {
  let jobId: string | undefined;

  try {
    const body = await req.json();

    // Extract jobId early for error handling
    jobId = body.jobId;

    const { jobId: parsedJobId, sessionId, variationId } = workerRequestSchema.parse(body);
    jobId = parsedJobId; // Update jobId with parsed value
    jobId = parsedJobId; // Update jobId with parsed value
    console.log('Worker: Parsed data - jobId:', jobId, 'sessionId:', sessionId, 'variationId:', variationId);

    const job = await getJob(jobId);
    if (!job) {
      console.error('Worker: Job not found for jobId:', jobId);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Mark job as running
    await startJob(jobId, 'generating');
    console.log('Worker: Marked job as running');

    await getClickatronDb();
    const objectId = new Types.ObjectId(sessionId);
    const task = await ClickatronTask.findById(objectId);
    console.log('Worker: Found task:', task);

    if (!task || !task.details.canvas) {
      console.error('Worker: Task or canvas not found for sessionId:', sessionId);
      await failJob(jobId, { code: 'TASK_NOT_FOUND', message: 'Task or canvas not found' });
      return NextResponse.json({ error: 'Task or canvas not found' }, { status: 404 });
    }

    // Validate job ownership
    if (job.userId !== task.clerkUserId) {
      console.error('Worker: Job ownership validation failed', { jobUserId: job.userId, taskUserId: task.clerkUserId });
      await failJob(jobId, { code: 'UNAUTHORIZED', message: 'Job ownership validation failed' });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const variation = task.details.canvas.variations.find((v: Variation) => v.id === variationId);
    console.log('Worker: Found variation:', variation);

    if (!variation) {
      console.error('Worker: Variation not found - likely deleted');
      await failJob(jobId, { code: 'VARIATION_DELETED', message: 'Variation was deleted before processing' });
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }

    // Check if Fal AI is configured
    if (!process.env.FAL_AI_API_KEY) {
      console.error('Worker: Fal AI API key not configured');
      await failJob(jobId, { code: 'FAL_AI_NOT_CONFIGURED', message: 'Fal AI API key not configured. Please set FAL_AI_API_KEY in environment variables.' });

      // Ensure variation is updated with failed status even if Fal AI is not configured
      try {
        variation.status = 'failed';
        variation.updatedAt = new Date();

        task.markModified('details');
        await task.save();
        console.log('Worker: Updated variation status to failed due to missing API key');
      } catch (saveError) {
        console.error('Worker: Failed to save variation status:', saveError);
      }

      return NextResponse.json({ error: 'Fal AI not configured' }, { status: 500 });
    }

    try {
      // Parse aspect ratio
      const { width, height, ratio } = parseAspectRatio(variation.aspectRatio);

      // Prepare generation parameters
      const generationParams: any = {
        prompt: job.prompt,
        // Note: image_size is not added by default, it will be handled model-specifically
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        // CRITICAL: Ensure safety checker is explicitly false by default to avoid "Adjust Prompt" errors
        enable_safety_checker: false,
        output_format: "jpeg",
        seed: Math.floor(Math.random() * 1000000),
      };

      // Process parent variation image if it exists (for image-to-image)
      const parentImageUrl = await processParentVariationImage(body.parentVariationId, task.details.canvas.variations, ClickatronGCSManager);
      // Process reference images from job payload if they exist (for image-to-image)
      const referenceImageUrls = await processReferenceImages(body.referenceImageRefs, ClickatronGCSManager);

      // Process mask URL if it exists (for inpainting/generative fill)
      let maskUrl: string | null = null;
      if (body.maskUrl) {
        try {
          // If it's a raw GCS URL, get a fresh signed URL
          if (body.maskUrl.includes('storage.googleapis.com') &&
            !body.maskUrl.includes('GoogleAccessId') &&
            !body.maskUrl.includes('Signature')) {
            console.log('Worker: Getting fresh signed URL for mask:', body.maskUrl);
            maskUrl = await ClickatronGCSManager.getSignedUrl(body.maskUrl);
            console.log('Worker: Got signed URL for mask:', maskUrl);
          } else {
            maskUrl = body.maskUrl;
          }
          console.log('Worker: Mask URL processed successfully:', maskUrl);
        } catch (error) {
          console.error('Worker: Failed to process mask URL:', error);
          throw new Error(`Failed to process mask URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Combine parent image and reference images into generation parameters
      // Always use image_urls internally for consistency
      const imageUrls: string[] = [];
      if (parentImageUrl) {
        imageUrls.push(parentImageUrl);
        console.log('Worker: Added parent image URL:', parentImageUrl);
      }
      imageUrls.push(...referenceImageUrls);
      console.log('Worker: Total image URLs:', imageUrls.length);

      // Only add image_urls to generationParams if we have images
      if (imageUrls.length > 0) {
        generationParams.image_urls = imageUrls;
      }

      // Add mask URL for inpainting models
      if (maskUrl) {
        generationParams.mask_url = maskUrl;
        console.log('Worker: Added mask URL to generation params');
        // For Seedream inpainting, keep image_urls as array (don't convert to single image_url)
        // The payload generator will handle the array format
        if (imageUrls.length === 0) {
          console.error('Worker: Inpainting requires an image but no parent image was found!');
          throw new Error('Inpainting requires a parent image');
        }
        console.log('Worker: Inpainting mode - using image_urls array with mask_url');
      }


      console.log('Worker: Starting image generation with params:', generationParams);

      // Get the model configuration from the variation
      let selectedModelId = variation.modelId;
      const modelConfig = CLICKATRON_MODELS[selectedModelId];

      // Validate URLs before passing to Fal AI (especially for inpainting)
      if (generationParams.image_url) {
        console.log('Worker: Validating image_url:', generationParams.image_url);
        try {
          const imageResponse = await fetch(generationParams.image_url, { method: 'HEAD' });
          if (!imageResponse.ok) {
            console.warn(`Worker: Image URL returned non-200 status: ${imageResponse.status} ${imageResponse.statusText}. Fal AI might still be able to access it.`);
          } else {
            console.log('Worker: image_url is accessible');
          }
        } catch (error) {
          console.warn('Worker: Failed to validate image_url (network error?). Proceeding anyway.', error);
        }
      }

      if (generationParams.mask_url) {
        console.log('Worker: Validating mask_url:', generationParams.mask_url);
        try {
          const maskResponse = await fetch(generationParams.mask_url, { method: 'HEAD' });
          if (!maskResponse.ok) {
            console.warn(`Worker: Mask URL returned non-200 status: ${maskResponse.status} ${maskResponse.statusText}. Fal AI might still be able to access it.`);
          } else {
            console.log('Worker: mask_url is accessible');
          }
        } catch (error) {
          console.warn('Worker: Failed to validate mask_url (network error?). Proceeding anyway.', error);
        }
      }

      // Count the number of reference images
      let referenceImageCount = 0;
      if (generationParams.image_url) {
        // For single image URL
        referenceImageCount = 1;
      } else if (Array.isArray(generationParams.image_urls)) {
        // For array of image URLs
        referenceImageCount = generationParams.image_urls.length;
      }

      // Validate that the selected model supports the number of reference images
      const minImages = modelConfig.constraints?.minImages ?? 0;
      const maxImages = modelConfig.constraints?.maxImages ?? 0;

      if (referenceImageCount < minImages || referenceImageCount > maxImages) {
        console.error('Worker: Selected model does not support the number of reference images:', referenceImageCount);
        await failJob(jobId, { code: 'INVALID_MODEL', message: `Selected model ${selectedModelId} does not support ${referenceImageCount} reference images` });

        // Ensure variation is updated with failed status
        try {
          variation.status = 'failed';
          variation.updatedAt = new Date();

          task.markModified('details');
          await task.save();
          console.log('Worker: Updated variation status to failed due to invalid model');
        } catch (saveError) {
          console.error('Worker: Failed to save variation status:', saveError);
        }

        return NextResponse.json({ error: `Selected model ${selectedModelId} does not support ${referenceImageCount} reference images` }, { status: 400 });
      }

      if (!modelConfig) {
        console.error('Worker: Model configuration not found for modelId:', selectedModelId);
        await failJob(jobId, { code: 'MODEL_NOT_FOUND', message: `Model configuration not found for modelId: ${selectedModelId}` });

        // Ensure variation is updated with failed status
        try {
          variation.status = 'failed';
          variation.updatedAt = new Date();

          task.markModified('details');
          await task.save();
          console.log('Worker: Updated variation status to failed due to missing model config');
        } catch (saveError) {
          console.error('Worker: Failed to save variation status:', saveError);
        }

        return NextResponse.json({ error: 'Model configuration not found' }, { status: 400 });
      }

      // Use the model ID directly (already includes 'fal-ai/' prefix)
      let modelId = modelConfig.id;

      // Map legacy IDs to valid endpoints
      if (modelId === 'fal-ai/flux/dev/inpainting') {
        modelId = 'fal-ai/flux-general/inpainting';
      } else if (modelId === 'fal-ai/flux-kontext/dev/inpainting') {
        // Map to Flux General/Dev Inpainting which allows disabling safety checker
        modelId = 'fal-ai/flux-general/inpainting';
      } else if (modelId === 'fal-ai/stable-diffusion-inpainting') {
        // Explicitly map stable diffusion legacy ID to Flux Pro Fill for better results if desired, 
        // or keep it if it's handled. For now let's map it to Flux Pro Fill as done before.
        modelId = 'fal-ai/flux-pro/v1/fill';
      }



      console.log(`Worker: Using model: ${modelConfig.name} (${modelId})`);

      // Determine if this is an image-to-image generation
      const isImageToImage = !!generationParams.image_url;

      // Validate image URL accessibility before making the API call
      if (isImageToImage && generationParams.image_url) {
        try {
          const imageResponse = await fetch(generationParams.image_url, {
            method: 'HEAD'
          });

          if (!imageResponse.ok) {
            console.error('Worker: Image URL returned non-200 status:', imageResponse.status, imageResponse.statusText);

            // If this is a GCS URL that might have expired, try to regenerate the signed URL
            if (generationParams.image_url.includes('storage.googleapis.com')) {
              try {
                // Extract the base GCS URL (without signature parameters)
                const urlObj = new URL(generationParams.image_url);
                const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

                // Get a fresh signed URL
                const freshSignedUrl = await ClickatronGCSManager.getSignedUrl(baseUrl);

                // Update the generation parameters with the fresh URL
                generationParams.image_url = freshSignedUrl;

                // Test the fresh URL
                const freshResponse = await fetch(freshSignedUrl, { method: 'HEAD' });

                if (!freshResponse.ok) {
                  throw new Error(`Fresh image URL also returned status ${freshResponse.status}: ${freshResponse.statusText}`);
                }

                const contentType = freshResponse.headers.get('content-type');
              } catch (regenError) {
                console.error('Worker: Failed to regenerate signed URL:', regenError);
                throw new Error(`Cannot access reference image: ${regenError instanceof Error ? regenError.message : 'Unknown error'}`);
              }
            } else {
              throw new Error(`Image URL returned status ${imageResponse.status}: ${imageResponse.statusText}`);
            }
          } else {
            const contentType = imageResponse.headers.get('content-type');
          }

        } catch (error) {
          console.error('Worker: Failed to access image URL:', error);
          throw new Error(`Cannot access reference image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Validate image URLs accessibility for models that use image_urls array
      if (generationParams.image_urls && Array.isArray(generationParams.image_urls)) {
        try {
          for (let i = 0; i < generationParams.image_urls.length; i++) {
            const imageUrl = generationParams.image_urls[i];
            const imageResponse = await fetch(imageUrl, {
              method: 'HEAD'
            });

            if (!imageResponse.ok) {
              console.error(`Worker: Image URL ${i + 1} returned non-200 status:`, imageResponse.status, imageResponse.statusText);

              // If this is a GCS URL that might have expired, try to regenerate the signed URL
              if (imageUrl.includes('storage.googleapis.com')) {
                try {
                  // Extract the base GCS URL (without signature parameters)
                  const urlObj = new URL(imageUrl);
                  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

                  // Get a fresh signed URL
                  const freshSignedUrl = await ClickatronGCSManager.getSignedUrl(baseUrl);

                  // Update the generation parameters with the fresh URL
                  generationParams.image_urls[i] = freshSignedUrl;

                  // Test the fresh URL
                  const freshResponse = await fetch(freshSignedUrl, { method: 'HEAD' });

                  if (!freshResponse.ok) {
                    throw new Error(`Fresh image URL ${i + 1} also returned status ${freshResponse.status}: ${freshResponse.statusText}`);
                  }

                  const contentType = freshResponse.headers.get('content-type');
                } catch (regenError) {
                  console.error(`Worker: Failed to regenerate signed URL for image ${i + 1}:`, regenError);
                  throw new Error(`Cannot access reference image ${i + 1}: ${regenError instanceof Error ? regenError.message : 'Unknown error'}`);
                }
              } else {
                throw new Error(`Image URL ${i + 1} returned status ${imageResponse.status}: ${imageResponse.statusText}`);
              }
            } else {
              const contentType = imageResponse.headers.get('content-type');
            }
          }
        } catch (error) {
          console.error('Worker: Failed to access image URLs:', error);
          throw new Error(`Cannot access reference images: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Construct the payload dynamically based on the model configuration
      const payload = generateModelPayload(modelConfig.id, generationParams, job, ratio, width, height);

      // Debug logging to see the final payload
      console.log('Worker: Final payload for model', modelId, ':', JSON.stringify(payload, null, 2));

      let result;
      result = await fal.subscribe(modelId, {
        input: payload,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        },
      });

      console.log('Worker: Image generation complete.');

      if (!result.data || !result.data.images || result.data.images.length === 0) {
        throw new Error('No image generated');
      }

      const generatedImageUrl = result.data.images[0].url;

      // Upload image to GCS
      const gcsUrl = await ClickatronGCSManager.uploadImageFromUrl(
        job.userId,
        job.sessionId,
        job.variationId,
        generatedImageUrl
      );

      // Store the raw GCS URL without query parameters for long-term storage
      const rawGcsUrl = gcsUrl.split('?')[0];

      const imageResponse = await fetch(gcsUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to download image for thumbnail creation');
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(512, 512, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: 75,
          effort: 4, // good balance between speed & compression
        })
        .toBuffer();

      // Upload thumbnail to GCS
      const thumbnailGcsUrl = await ClickatronGCSManager.uploadThumbnailBuffer(
        job.userId,
        job.sessionId,
        job.variationId,
        thumbnailBuffer
      );

      // Update variation with generated image
      variation.status = 'completed';
      variation.imageRef = rawGcsUrl;
      variation.thumbnailRef = thumbnailGcsUrl;
      variation.updatedAt = new Date();
      variation.modelId = selectedModelId; // Use the (possibly updated) selected model ID
      // Only store seed for models that support it
      if (modelSupportsSeed(selectedModelId)) {
        variation.seed = generationParams.seed;
      }
      variation.generationParams = generationParams;


      task.markModified('details');
      await task.save();

      await completeJob(jobId, gcsUrl);
    } catch (generationError: any) {
      console.error('Worker: Image generation failed:', generationError);

      // Enhanced error logging
      if (generationError.body) {
        console.error('Worker: Error Body:', JSON.stringify(generationError.body, null, 2));
      }
      if (generationError.data) {
        console.error('Worker: Error Data:', JSON.stringify(generationError.data, null, 2));
      }
      // Inspect message for more clues
      console.error('Worker: Full error message:', generationError.message);


      // Provide more specific error message based on error type
      let errorMessage = generationError.message || generationError.body?.detail || 'Image generation failed';
      let errorCode = 'GENERATION_FAILED';

      // Handle different error types with specific messages
      if (generationError.status === 422) {
        errorCode = 'INVALID_PARAMETERS';

        // Check for specific 422 error patterns
        if (generationError.message?.includes('image') || generationError.message?.includes('url')) {
          errorMessage = 'Image processing error. The reference image may be corrupted, too large, or inaccessible. Please try with a different image.';
        } else if (generationError.message?.includes('size') || generationError.message?.includes('dimension')) {
          errorMessage = 'Image size error. The image dimensions may be too small or too large for the model requirements.';
        } else {
          errorMessage = 'Invalid generation parameters. This might be due to using the wrong model for text-to-image vs image-to-image generation, or the reference image format is not supported.';
        }
      } else if (generationError.status === 401) {
        errorCode = 'AUTHENTICATION_FAILED';
        errorMessage = 'Authentication failed with the image generation service. Please check the API configuration.';
      } else if (generationError.status === 403) {
        errorCode = 'FORBIDDEN';
        errorMessage = 'Access denied to the image generation service. The API key may be invalid or expired.';
      } else if (generationError.status === 429) {
        errorCode = 'RATE_LIMITED';
        errorMessage = 'Rate limit exceeded. Please wait and try again later.';
      } else if (generationError.code === 'ENOTFOUND' || generationError.code === 'ECONNREFUSED') {
        errorCode = 'NETWORK_ERROR';
        errorMessage = 'Network error connecting to the image generation service. Please check your internet connection and try again.';
      } else if (generationError.name === 'TimeoutError') {
        errorCode = 'TIMEOUT';
        errorMessage = 'The image generation request timed out. Please try again.';
      }

      console.error('Worker: Detailed error - Code:', errorCode, 'Message:', errorMessage);

      // Ensure variation is updated with failed status
      try {
        variation.status = 'failed';
        variation.error = errorMessage; // Save the specific error message
        variation.updatedAt = new Date();

        task.markModified('details');
        await task.save();
        console.log('Worker: Updated variation status to failed with message:', errorMessage);
      } catch (saveError) {
        console.error('Worker: Failed to save variation status:', saveError);
        // Even if we can't save to the database, we still need to fail the job
      }

      await failJob(jobId, {
        code: errorCode,
        message: errorMessage,
        details: generationError
      });
      console.log('Worker: Failed job in QStash');

      // Process refund for failed image generation
      try {
        await processRefund('clickatron', 'variation_gen', job.userId, 1);
        console.log('Refund processed successfully for user:', job.userId);
      } catch (refundError) {
        console.error('Failed to process refund for user:', job.userId, refundError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Worker error:', error);
    console.error('Worker error details - jobId:', jobId, 'error type:', (error as Error).constructor.name);

    // If we have a jobId, try to fail the job in the system
    if (jobId) {
      try {
        await failJob(jobId, {
          code: 'WORKER_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error occurred in worker',
          details: error
        });
        console.log('Worker: Marked job as failed in system');
      } catch (failError) {
        console.error('Worker: Failed to mark job as failed:', failError);
      }
    }

    // Also try to update the variation status to failed if we have the necessary data
    if (jobId) {
      try {
        const job = await getJob(jobId);
        if (job) {
          await getClickatronDb();
          const objectId = new Types.ObjectId(job.sessionId);
          const task = await ClickatronTask.findById(objectId);

          if (task && task.details.canvas) {
            const variation = task.details.canvas.variations.find((v: Variation) => v.id === job.variationId);
            if (variation) {
              variation.status = 'failed';
              variation.updatedAt = new Date();

              task.markModified('details');
              await task.save();
              console.log('Worker: Updated variation status to failed in outer catch block');
            }

            // Process refund for failed image generation
            try {
              await processRefund('clickatron', 'variation_gen', job.userId, 1);
              console.log('Refund processed successfully for user:', job.userId);
            } catch (refundError) {
              console.error('Failed to process refund for user:', job.userId, refundError);
            }
          }
        }
      } catch (updateError) {
        console.error('Worker: Failed to update variation status in outer catch block:', updateError);
      }
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Add error handling for signature verification
// Only enable signature verification in production (not in development)
const protectedHandler = (process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.APP_ENV !== 'development' && process.env.NODE_ENV !== 'development')
  ? verifySignatureAppRouter(handler)
  : handler;

export const POST = async (req: Request) => {
  try {
    return await protectedHandler(req);
  } catch (error) {
    console.error('Worker signature verification failed:', error);

    // Try to extract jobId from request for error reporting
    let jobId: string | undefined;
    try {
      const body = await req.json();
      jobId = body.jobId;
    } catch (bodyError) {
      console.error('Worker: Failed to parse request body for error reporting:', bodyError);
    }

    // If we have a jobId, try to fail the job
    if (jobId) {
      try {
        await failJob(jobId, {
          code: 'SIGNATURE_VERIFICATION_FAILED',
          message: 'Failed to verify QStash signature. Check your UPSTASH_QSTASH keys.',
          details: error
        });
        console.log('Worker: Marked job as failed due to signature verification failure');

        // Try to get job info for refund
        try {
          const job = await getJob(jobId);
          if (job) {
            try {
              await processRefund('clickatron', 'variation_gen', job.userId, 1);
              console.log('Refund processed successfully for user:', job.userId);
            } catch (refundError) {
              console.error('Failed to process refund for user:', job.userId, refundError);
            }
          }
        } catch (jobError) {
          console.error('Worker: Failed to get job info for refund:', jobError);
        }
      } catch (failError) {
        console.error('Worker: Failed to mark job as failed after signature verification:', failError);
      }
    }

    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }
};