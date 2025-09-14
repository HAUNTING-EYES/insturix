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
import { CLICKATRON_MODELS } from '@/lib/config/clickatron-models';

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
    console.log('Worker: Received request');
    const body = await req.json();
    console.log('Worker: Request body:', body);
    
    // Extract jobId early for error handling
    jobId = body.jobId;
    
    const { jobId: parsedJobId, sessionId, variationId } = workerRequestSchema.parse(body);
    jobId = parsedJobId; // Update jobId with parsed value
    console.log('Worker: Parsed data - jobId:', jobId, 'sessionId:', sessionId, 'variationId:', variationId);

    const job = await getJob(jobId);
    console.log('Worker: Found job:', job);
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
      console.error('Worker: Variation not found');
      await failJob(jobId, { code: 'VARIATION_NOT_FOUND', message: 'Variation not found in task' });
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }

    // Check if Fal AI is configured
    if (!process.env.FAL_AI_API_KEY) {
      console.error('Worker: Fal AI API key not configured');
      await failJob(jobId, { code: 'FAL_AI_NOT_CONFIGURED', message: 'Fal AI API key not configured. Please set FAL_AI_API_KEY in environment variables.' });
      
      variation.status = 'failed';
      variation.updatedAt = new Date();
      
      task.markModified('details');
      await task.save();
      
      return NextResponse.json({ error: 'Fal AI not configured' }, { status: 500 });
    }

    try {
      // Parse aspect ratio
      const { width, height, ratio } = parseAspectRatio(variation.aspectRatio);
      console.log('Worker: Parsed aspect ratio:', variation.aspectRatio, '->', width, 'x', height);

      // Prepare generation parameters
      const generationParams: any = {
        prompt: job.prompt,
        // Note: image_size is not added by default, it will be handled model-specifically
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: true,
        output_format: "jpeg",
        seed: Math.floor(Math.random() * 1000000),
      };

      // Add parent variation as reference image if it exists (for image-to-image)
      if (body.parentVariationId) {
        const parentVariation = task.details.canvas.variations.find((v: Variation) => v.id === body.parentVariationId);
        if (parentVariation && parentVariation.imageRef) {
          // Check if the imageRef is a raw GCS URL or potentially expired signed URL
          let imageUrl = parentVariation.imageRef;
          
          // If it's a raw GCS URL (not containing signature parameters), get a fresh signed URL
          if (imageUrl.includes('storage.googleapis.com') && !imageUrl.includes('GoogleAccessId') && !imageUrl.includes('Signature')) {
            try {
              console.log('Getting fresh signed URL for GCS image:', imageUrl);
              imageUrl = await ClickatronGCSManager.getSignedUrl(imageUrl);
              console.log('Got signed URL:', imageUrl);
            } catch (error) {
              console.error('Failed to get signed URL for parent image:', error);
              // Continue with the original URL if signed URL generation fails
            }
          }
          
          generationParams.image_url = imageUrl;
        }
      }

      console.log('Worker: Starting image generation with params:', generationParams);

      // Get the model configuration from the variation
      let selectedModelId = variation.modelId;
      let modelConfig = CLICKATRON_MODELS[selectedModelId];
      
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
        // Find an appropriate model that supports the number of reference images
        const availableModels = Object.values(CLICKATRON_MODELS).filter(model => {
          const modelMinImages = model.constraints?.minImages ?? 0;
          const modelMaxImages = model.constraints?.maxImages ?? 0;
          return referenceImageCount >= modelMinImages && referenceImageCount <= modelMaxImages;
        });
        
        if (availableModels.length > 0) {
          // Select the first available model
          const newModel = availableModels[0];
          selectedModelId = newModel.id;
          modelConfig = newModel;
          console.log(`Worker: Switching to model ${selectedModelId} that supports ${referenceImageCount} images`);
        } else {
          console.error('Worker: No model found that supports the number of reference images:', referenceImageCount);
          await failJob(jobId, { code: 'INVALID_MODEL', message: `No model found that supports ${referenceImageCount} reference images` });
          
          variation.status = 'failed';
          variation.updatedAt = new Date();
          
          task.markModified('details');
          await task.save();
          
          return NextResponse.json({ error: 'No model found that supports the number of reference images' }, { status: 400 });
        }
      }
      
      if (!modelConfig) {
        console.error('Worker: Model configuration not found for modelId:', selectedModelId);
        await failJob(jobId, { code: 'MODEL_NOT_FOUND', message: `Model configuration not found for modelId: ${selectedModelId}` });
        
        variation.status = 'failed';
        variation.updatedAt = new Date();
        
        task.markModified('details');
        await task.save();
        
        return NextResponse.json({ error: 'Model configuration not found' }, { status: 400 });
      }
      
      // Use the model ID directly (already includes 'fal-ai/' prefix)
      const modelId = modelConfig.id;
      console.log('Worker: Using model:', modelId, 'from configuration');
      
      // Determine if this is an image-to-image generation
      const isImageToImage = !!generationParams.image_url;
      
      // Validate image URL accessibility before making the API call
      if (isImageToImage && generationParams.image_url) {
        try {
          console.log('Worker: Testing image URL accessibility...');
          const imageResponse = await fetch(generationParams.image_url, {
            method: 'HEAD'
          });
          
          if (!imageResponse.ok) {
            console.error('Worker: Image URL returned non-200 status:', imageResponse.status, imageResponse.statusText);
            
            // If this is a GCS URL that might have expired, try to regenerate the signed URL
            if (generationParams.image_url.includes('storage.googleapis.com')) {
              try {
                console.log('Worker: Attempting to regenerate signed URL for expired image...');
                // Extract the base GCS URL (without signature parameters)
                const urlObj = new URL(generationParams.image_url);
                const baseUrl = `${urlObj.origin}${urlObj.pathname}`;
                
                // Get a fresh signed URL
                const freshSignedUrl = await ClickatronGCSManager.getSignedUrl(baseUrl);
                console.log('Worker: Got fresh signed URL:', freshSignedUrl);
                
                // Update the generation parameters with the fresh URL
                generationParams.image_url = freshSignedUrl;
                
                // Test the fresh URL
                console.log('Worker: Testing fresh signed URL...');
                const freshResponse = await fetch(freshSignedUrl, { method: 'HEAD' });
                
                if (!freshResponse.ok) {
                  throw new Error(`Fresh image URL also returned status ${freshResponse.status}: ${freshResponse.statusText}`);
                }
                
                const contentType = freshResponse.headers.get('content-type');
                console.log('Worker: Fresh image URL accessible. Content-Type:', contentType);
              } catch (regenError) {
                console.error('Worker: Failed to regenerate signed URL:', regenError);
                throw new Error(`Cannot access reference image: ${regenError instanceof Error ? regenError.message : 'Unknown error'}`);
              }
            } else {
              throw new Error(`Image URL returned status ${imageResponse.status}: ${imageResponse.statusText}`);
            }
          } else {
            const contentType = imageResponse.headers.get('content-type');
            console.log('Worker: Image URL accessible. Content-Type:', contentType);
          }
          
        } catch (error) {
          console.error('Worker: Failed to access image URL:', error);
          throw new Error(`Cannot access reference image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Construct the payload dynamically based on the model configuration
      const payload: Record<string, any> = {
        [modelConfig.parameterMapping.prompt]: job.prompt,
      };
      
      // Add image URL(s) if it's an image-to-image model
      if (modelConfig.type === 'image-to-image' && modelConfig.parameterMapping.image_url && generationParams.image_url) {
        payload[modelConfig.parameterMapping.image_url] = generationParams.image_url;
      } else if (modelConfig.type === 'image-to-image' && modelConfig.parameterMapping.image_urls && generationParams.image_url) {
        // For models that expect an array of image URLs, provide the single image URL as an array
        payload[modelConfig.parameterMapping.image_urls] = [generationParams.image_url];
      }
      
      // Helper function to find the closest supported aspect ratio
      function findClosestSupportedRatio(currentRatio: string, supportedRatios: string[]): string {
        // If the exact ratio is supported, return it
        if (supportedRatios.includes(currentRatio)) {
          return currentRatio;
        }
        
        // Parse the current ratio
        const [currentWidthStr, currentHeightStr] = currentRatio.split(':');
        const currentWidth = parseFloat(currentWidthStr);
        const currentHeight = parseFloat(currentHeightStr);
        const currentRatioValue = currentWidth / currentHeight;
        
        // Find the closest ratio
        let closestRatio = supportedRatios[0];
        let closestDiff = Math.abs(
          (parseFloat(supportedRatios[0].split(':')[0]) / parseFloat(supportedRatios[0].split(':')[1])) - currentRatioValue
        );
        
        for (const supportedRatio of supportedRatios) {
          const [supWidthStr, supHeightStr] = supportedRatio.split(':');
          const supWidth = parseFloat(supWidthStr);
          const supHeight = parseFloat(supHeightStr);
          const supRatioValue = supWidth / supHeight;
          const diff = Math.abs(supRatioValue - currentRatioValue);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestRatio = supportedRatio;
          }
       }
        
        return closestRatio;
      }
      
      // Handle model-specific parameters based on the parameter mapping
      if (modelConfig.parameterMapping.aspect_ratio) {
        // Add aspect ratio for models that support it
        // Validate that the aspect ratio is supported by the model
        if (modelConfig.constraints?.allowedAspectRatios) {
          payload[modelConfig.parameterMapping.aspect_ratio] = findClosestSupportedRatio(ratio, modelConfig.constraints.allowedAspectRatios);
        } else {
          payload[modelConfig.parameterMapping.aspect_ratio] = ratio;
        }
      }
      
      if (modelConfig.parameterMapping.image_size) {
        // Add image_size as an object for models that require it
        payload[modelConfig.parameterMapping.image_size] = { width, height };
      }
      
      if (modelConfig.parameterMapping.resolution) {
        // Add resolution for models that support it
        payload[modelConfig.parameterMapping.resolution] = "1K";
      }
      
      if (modelConfig.parameterMapping.resolution_mode) {
        // Add resolution_mode for models that support it
        payload[modelConfig.parameterMapping.resolution_mode] = "match_input";
      }
      
      // Add other generation parameters if they exist in the mapping
      if (modelConfig.parameterMapping.num_inference_steps) {
        payload[modelConfig.parameterMapping.num_inference_steps] = generationParams.num_inference_steps || 28;
      }
      
      if (modelConfig.parameterMapping.guidance_scale) {
        payload[modelConfig.parameterMapping.guidance_scale] = generationParams.guidance_scale || 3.5;
      }
      
      if (modelConfig.parameterMapping.num_images) {
        payload[modelConfig.parameterMapping.num_images] = generationParams.num_images || 1;
      }
      
      if (modelConfig.parameterMapping.enable_safety_checker) {
        payload[modelConfig.parameterMapping.enable_safety_checker] = generationParams.enable_safety_checker !== undefined ?
          generationParams.enable_safety_checker : false;
      }
      
      if (modelConfig.parameterMapping.output_format) {
        payload[modelConfig.parameterMapping.output_format] = generationParams.output_format || "jpeg";
      }
      
      if (modelConfig.parameterMapping.acceleration) {
        payload[modelConfig.parameterMapping.acceleration] = generationParams.acceleration || "none";
      }
      
      // Add max_images if the model configuration specifies it
      if (modelConfig.parameterMapping.max_images) {
        payload[modelConfig.parameterMapping.max_images] = 1; // Default to 1, can be made configurable
      }
      
      // Add seed
      payload.seed = generationParams.seed || Math.floor(Math.random() * 1000000);
      
      // Debug logging to see the final payload
      console.log('Worker: Final payload for model', modelId, ':', JSON.stringify(payload, null, 2));

      const result = await fal.subscribe(modelId, {
        input: payload,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        },
      });

      console.log('Worker: Image generation complete. Result:', result);

      if (!result.data || !result.data.images || result.data.images.length === 0) {
        throw new Error('No image generated');
      }

      const generatedImageUrl = result.data.images[0].url;
      console.log('Worker: Generated image URL:', generatedImageUrl);

      // Upload image to GCS
      console.log('Worker: Uploading image to GCS...');
      const gcsUrl = await ClickatronGCSManager.uploadImageFromUrl(
        job.userId,
        job.sessionId,
        job.variationId,
        generatedImageUrl
      );
      console.log('Worker: Image uploaded to GCS. URL:', gcsUrl);

      // Update variation with generated image
      variation.status = 'completed';
      variation.imageRef = gcsUrl;
      variation.updatedAt = new Date();
      variation.modelId = selectedModelId; // Use the selected model ID
      variation.seed = generationParams.seed;
      variation.generationParams = generationParams;
      
      console.log('Worker: Updated variation status, imageRef, and metadata');

      task.markModified('details');
      console.log('Worker: Marked task as modified');
      await task.save();
      console.log('Worker: Saved task to database');

      await completeJob(jobId, gcsUrl);
      console.log('Worker: Completed job in QStash');
    } catch (generationError: any) {
      console.error('Worker: Image generation failed:', generationError);
      
      // Provide more specific error message based on error type
      let errorMessage = generationError.message || 'Image generation failed';
      let errorCode = 'GENERATION_FAILED';
      
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
      }
      
      console.error('Worker: Detailed error - Code:', errorCode, 'Message:', errorMessage);
      
      variation.status = 'failed';
      variation.updatedAt = new Date();
      
      task.markModified('details');
      await task.save();
      
      await failJob(jobId, {
        code: errorCode,
        message: errorMessage,
        details: generationError
      });
      console.log('Worker: Failed job in QStash');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Worker error:', error);
    
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
    
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Add error handling for signature verification
const protectedHandler = verifySignatureAppRouter(handler);

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
      } catch (failError) {
        console.error('Worker: Failed to mark job as failed after signature verification:', failError);
      }
    }
    
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }
};