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
function parseAspectRatio(aspectRatio: string): { width: number; height: number } {
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
  
  // Standardize common aspect ratios to known sizes
  if (width === 16 && height === 9) {
    return { width: 1024, height: 576 };
  } else if (width === 1 && height === 1) {
    return { width: 1024, height: 1024 };
  } else if (width === 9 && height === 16) {
    return { width: 576, height: 1024 };
  } else if (width === 4 && height === 3) {
    return { width: 1024, height: 768 };
  } else if (width === 3 && height === 4) {
    return { width: 768, height: 1024 };
  } else if (width === 21 && height === 9) {
    return { width: 1024, height: 439 };
  } else if (width === 9 && height === 21) {
    return { width: 439, height: 1024 };
  }
  
  // For other ratios, maintain the aspect ratio but use reasonable dimensions
  const maxSize = 1024;
  const ratio = width / height;
  
  if (ratio >= 1) {
    // Landscape or square
    return { width: maxSize, height: Math.round(maxSize / ratio) };
  } else {
    // Portrait
    return { width: Math.round(maxSize * ratio), height: maxSize };
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
      const { width, height } = parseAspectRatio(variation.aspectRatio);
      console.log('Worker: Parsed aspect ratio:', variation.aspectRatio, '->', width, 'x', height);

      // Prepare generation parameters
      const generationParams: any = {
        prompt: job.prompt,
        image_size: {
          width,
          height
        },
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
          generationParams.image_url = parentVariation.imageRef;
        }
      }

      console.log('Worker: Starting image generation with params:', generationParams);

      // Generate image using Fal AI
      // Use different models for text-to-image vs image-to-image
      const isImageToImage = !!generationParams.image_url;
      const modelId = isImageToImage 
        ? "fal-ai/flux-1/dev/redux" 
        : "fal-ai/flux-1/dev";
      
      console.log('Worker: Using model:', modelId, 'for', isImageToImage ? 'image-to-image' : 'text-to-image');
      
      const result = await fal.subscribe(modelId, {
        input: generationParams,
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
      variation.modelUsed = "fal-ai/flux-1/dev/redux";
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
      if (generationError.status === 422) {
        errorMessage = 'Invalid generation parameters. This might be due to using the wrong model for text-to-image vs image-to-image generation.';
      }
      
      variation.status = 'failed';
      variation.updatedAt = new Date();
      
      task.markModified('details');
      await task.save();
      
      await failJob(jobId, { 
        code: 'GENERATION_FAILED', 
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