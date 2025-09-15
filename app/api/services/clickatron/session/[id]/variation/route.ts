import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { CreateVariationRequestSchema } from '@/types/clickatron';
import { createJob, setIdempotencyKey, getIdempotencyKey } from '@/lib/clickatron-jobs';
import { z } from 'zod';
import { enqueueQStashJob } from '@/lib/clickatron-qtask';
import { CLICKATRON_MODELS, getAvailableModels } from '@/lib/config/clickatron-models';
import { ClickatronGCSManager } from '@/lib/clickatron-gcs';

// POST /api/services/clickatron/session/:id/variation - Queue/generate a variation
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    // Find the task
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse multipart/form-data
    const formData = await request.formData();
    
    // Extract fields from formData
    const prompt = formData.get('prompt') as string;
    const modelId = formData.get('modelId') as string || undefined;
    const parentVariationId = formData.get('parentVariationId') as string || undefined;
    const fineTuning = JSON.parse(formData.get('fineTuning') as string || '{}');
    const metadata = JSON.parse(formData.get('metadata') as string || '{}');
    
    // Extract reference images
    const referenceImages = formData.getAll('referenceImages') as File[];
    
    // Check for idempotency key
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      const existingJobId = await getIdempotencyKey(idempotencyKey);
      if (existingJobId) {
        return NextResponse.json({
          success: true,
          variationId: `var_${existingJobId.split('_')[1]}_${existingJobId.split('_')[2]}`,
          jobId: existingJobId,
          status: 'queued',
          estimatedTime: 30, // seconds
        });
      }
    }

    // Upload reference images to GCS and get their URIs
    const referenceImageRefs: string[] = [];
    for (const file of referenceImages) {
      if (file instanceof File) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Upload to GCS
        const gcsUri = await ClickatronGCSManager.uploadImageBuffer(
          userId,
          id,
          `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          buffer,
          file.type
        );
        
        referenceImageRefs.push(gcsUri);
      }
    }

    // Validate request data (excluding referenceImages as they are now in referenceImageRefs)
    const validatedData = CreateVariationRequestSchema.parse({
      prompt,
      modelId,
      parentVariationId,
      fineTuning,
      metadata,
      sessionId: id,
    });

    // Initialize canvas if it doesn't exist
    if (!task.details?.canvas) {
      task.details.canvas = { variations: [] };
    }

    // Create new variation
    const variationId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date();
    
    // Determine the appropriate model based on reference images
    let selectedModelId = validatedData.modelId;
    
    // If no model is provided, select based on whether we have reference images
    if (!selectedModelId) {
      const hasReferenceImages = referenceImageRefs && referenceImageRefs.length > 0;
      
      // Determine context based on whether we're editing an existing variation
      const context = validatedData.parentVariationId ? 'edit' : 'newVariation';
      
      // Get available models for this context
      const availableModels = getAvailableModels(context, hasReferenceImages ? referenceImageRefs.length : 0);
      
      // Find an appropriate model based on context
      // First, try to find a default model that matches the requirements
      let suitableModel = availableModels.find((model: any) => {
        // Check if it's a default model and matches the type requirements
        if (model.isDefault) {
          // For image-to-image generation, we need reference images and an image-to-image model
          if (hasReferenceImages) {
            return model.type === 'image-to-image';
          }
          // For text-to-image generation, we don't want reference images and need a text-to-image model
          return model.type === 'text-to-image';
        }
        return false;
      });
      
      // If no default model is found, fall back to any suitable model
      if (!suitableModel) {
        suitableModel = availableModels.find((model: any) => {
          // For image-to-image generation, we need reference images and an image-to-image model
          if (hasReferenceImages) {
            return model.type === 'image-to-image';
          }
          // For text-to-image generation, we don't want reference images and need a text-to-image model
          return model.type === 'text-to-image';
        });
      }
      
      selectedModelId = suitableModel?.id || 'fal-ai/flux-kontext/dev'; // Fallback
    }
    
    const newVariation = {
      id: variationId,
      prompt: validatedData.prompt,
      status: 'generating' as const,
      imageRef: '',
      aspectRatio: validatedData.metadata?.aspectRatio || '16:9',
      fineTuning: validatedData.fineTuning || {
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
      createdAt: now,
      updatedAt: now,
      parentVariationId: validatedData.parentVariationId,
      referenceImageRefs: referenceImageRefs || [], // Use referenceImageRefs instead of referenceImages
      metadata: validatedData.metadata || {},
      modelId: selectedModelId, // Add modelId to variation
    };

    // Add variation to canvas (capping at 50)
    const currentVariations = task.details.canvas?.variations || [];
    currentVariations.unshift(newVariation); // Add to beginning

    // Keep only the 50 most recent variations
    task.details.canvas.variations = currentVariations.slice(0, 50);

    task.updatedAt = new Date();
    task.markModified('details');
    await task.save();

    // Use QStash for async processing
    const jobId = await createJob({
      sessionId: id,
      variationId,
      prompt: validatedData.prompt,
      userId,
      parentVariationId: validatedData.parentVariationId,
      fineTuning: validatedData.fineTuning || {
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
      metadata: validatedData.metadata,
      modelId: selectedModelId, // Use the selected modelId
      referenceImageRefs: referenceImageRefs || [], // Pass referenceImageRefs to the job
    });

    // Set idempotency key if provided
    if (idempotencyKey) {
      await setIdempotencyKey(idempotencyKey, jobId);
    }

    // Enqueue job with QStash
    try {
      const qstashResult = await enqueueQStashJob({
        jobId,
        sessionId: id,
        variationId,
        prompt: validatedData.prompt,
        userId,
        parentVariationId: validatedData.parentVariationId,
        fineTuning: validatedData.fineTuning || {
          brightness: 100,
          contrast: 100,
          saturation: 100,
        },
        metadata: validatedData.metadata,
        modelId: selectedModelId, // Use the selected modelId
        referenceImageRefs: referenceImageRefs || [], // Pass referenceImageRefs to the job
      });
      console.log('QStash job enqueued successfully:', qstashResult);
    } catch (qstashError) {
      console.error('Failed to enqueue QStash job:', qstashError);
      // Continue with the response even if QStash fails
      // The job will be created in Redis but won't be processed
    }

    return NextResponse.json({
      success: true,
      variationId,
      jobId,
      status: 'queued',
      estimatedTime: 30, // seconds
    });
  } catch (error) {
    console.error('Error creating variation:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

