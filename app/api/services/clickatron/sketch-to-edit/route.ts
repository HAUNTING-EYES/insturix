import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { SketchToEditRequestSchema } from '@/types/sketch-to-edit';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { z } from 'zod';
import { createJob } from '@/lib/clickatron-jobs';
import { enqueueClickatronJob } from '@/lib/clickatron-qtask';
import { getAvailableModels } from '@/lib/config/clickatron-models';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { ClickatronTask } from '@/schemas/Clickatron';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';

/**
 * Convert a data URL (base64) to a Buffer
 */
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const matches = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid data URL format');
  }
  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  return { buffer, mimeType };
}

/**
 * POST /api/services/clickatron/sketch-to-edit
 * 
 * Queues a sketch-to-edit job for async processing via QStash.
 * Returns immediately with job ID for polling.
 */
export async function POST(request: Request) {
  let creditCheck: any = null;

  try {
    // 1. Authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and Validate Request
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = SketchToEditRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validation.error.format() 
      }, { status: 400 });
    }

    const { originalImage, annotatedImage, model, prompt, sessionId } = validation.data;

    // 2.5 Validate image data
    if (!originalImage || originalImage.length < 100) {
      return NextResponse.json({ 
        error: 'Invalid image data',
        details: 'Original image is too small or empty' 
      }, { status: 400 });
    }

    if (!annotatedImage || annotatedImage.length < 100) {
      return NextResponse.json({ 
        error: 'Invalid image data',
        details: 'Annotated image is too small or empty' 
      }, { status: 400 });
    }

    // Check if images are data URLs or valid base64
    const isValidImageData = (data: string, name: string) => {
      if (data.startsWith('data:image')) {
        return { valid: true, error: null };
      }
      
      try {
        const cleaned = data.replace(/\s/g, '');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
          return { 
            valid: false, 
            error: `${name} contains invalid base64 characters` 
          };
        }
        return { valid: true, error: null };
      } catch {
        return { 
          valid: false, 
          error: `${name} is not valid base64 data` 
        };
      }
    };

    const originalValidation = isValidImageData(originalImage, 'Original image');
    if (!originalValidation.valid) {
      return NextResponse.json({ 
        error: 'Invalid image format',
        details: originalValidation.error,
        hint: 'Images should be data URLs (starting with data:image) or valid base64'
      }, { status: 400 });
    }

    const annotatedValidation = isValidImageData(annotatedImage, 'Annotated image');
    if (!annotatedValidation.valid) {
      return NextResponse.json({ 
        error: 'Invalid image format',
        details: annotatedValidation.error,
        hint: 'Images should be data URLs (starting with data:image) or valid base64'
      }, { status: 400 });
    }

    console.log(`[SketchToEdit] Image validation passed. Original: ${(originalImage.length / 1024 / 1024).toFixed(2)}MB, Annotated: ${(annotatedImage.length / 1024 / 1024).toFixed(2)}MB`);

    // 5. Select Model (auto-select if not provided)
    let selectedModelId = model;
    if (!selectedModelId) {
      const availableModels = getAvailableModels('sketchToEdit', 2); // 2 images (original + annotated)
      const suitableModel = availableModels.find((m: any) => m.isDefault) || availableModels[0];
      selectedModelId = suitableModel?.id || 'fal-ai/nano-banana-pro/sketch-to-edit';
    }

    // 3. Credit Check after model auto-selection so omitted-model requests are charged correctly.
    creditCheck = await checkCredits(userId, 'clickatron', 'variation', {
      model: selectedModelId,
      requestType: 'sketch-to-edit'
    });

    if (!creditCheck.allowed) {
      return creditCheck.errorResponse;
    }

    // 4. Deduct Credits BEFORE queueing
    await creditCheck.deduct();

    // 6. Create or update Clickatron task + variation so the worker can update it later
    await getClickatronDb();

    // Ensure we have a session (task) to attach the variation to. If none provided, create a lightweight task.
    let taskId: string = sessionId || '';
    let task: any = null;
    if (taskId) {
      try {
        const objectId = new Types.ObjectId(taskId);
        task = await ClickatronTask.findById(objectId);
      } catch (e) {
        task = null;
      }
    }

    if (!task) {
      // Create a minimal ClickatronTask for this user to hold the variation
      const newTask = new ClickatronTask({
        clerkUserId: userId,
        title: 'Sketch-to-Edit Session',
        details: {
          videoIdea: '',
          aspectRatio: '16:9',
          canvas: { variations: [] }
        }
      });
      await newTask.save();
      task = newTask;
      taskId = String(newTask._id);
    }

    // At this point, taskId is guaranteed to be a non-empty string
    const finalTaskId: string = taskId;

    const variationId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const newVariation: any = {
      id: variationId,
      prompt: prompt || 'Sketch-to-edit modification',
      status: 'generating',
      imageRef: '',
      thumbnailRef: '',
      aspectRatio: task.details?.aspectRatio || '16:9',
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      createdAt: new Date(),
      updatedAt: new Date(),
      modelId: selectedModelId,
      generationParams: { sketchToEdit: true, originalPrompt: prompt || '' }
    };

    // Add variation to the beginning of the canvas variations array
    if (!task.details) task.details = { videoIdea: '', aspectRatio: '16:9', canvas: { variations: [] } };
    if (!task.details.canvas) task.details.canvas = { variations: [] };
    task.details.canvas.variations.unshift(newVariation);
    // Trim to a reasonable limit
    task.details.canvas.variations = task.details.canvas.variations.slice(0, 50);
    task.updatedAt = new Date();
    task.markModified('details');
    await task.save();

    // 6.5 Upload images to R2 instead of storing base64 in metadata (prevents Redis/QStash bloat)
    console.log('[SketchToEdit] Uploading images to R2...');
    
    let originalImageRef: string;
    let annotatedImageRef: string;
    
    try {
      // Convert data URLs to buffers and upload to R2
      const originalImageData = dataUrlToBuffer(originalImage);
      const annotatedImageData = dataUrlToBuffer(annotatedImage);
      
      const originalR2Url = await ClickatronR2Manager.uploadImageBuffer(
        userId,
        finalTaskId,
        `sketch_original_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        originalImageData.buffer,
        originalImageData.mimeType
      );
      originalImageRef = originalR2Url.split('?')[0]; // Strip query params for storage
      
      const annotatedR2Url = await ClickatronR2Manager.uploadImageBuffer(
        userId,
        finalTaskId,
        `sketch_annotated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        annotatedImageData.buffer,
        annotatedImageData.mimeType
      );
      annotatedImageRef = annotatedR2Url.split('?')[0]; // Strip query params for storage
      
      console.log('[SketchToEdit] Images uploaded to R2:', { originalImageRef, annotatedImageRef });
    } catch (uploadError) {
      console.error('[SketchToEdit] Failed to upload images to R2:', uploadError);
      await creditCheck.refund('Failed to upload images');
      return NextResponse.json({ 
        error: 'Failed to upload images', 
        details: uploadError instanceof Error ? uploadError.message : 'Unknown error' 
      }, { status: 500 });
    }

    const jobMetadata = {
      sketchToEdit: true,
      originalImageRef,
      annotatedImageRef,
      sessionId: finalTaskId,
    };

    // 7. Create Job in Redis
    const aspectRatio = task.details?.aspectRatio || '16:9';
    const jobId = await createJob({
      sessionId: finalTaskId,
      variationId,
      prompt: prompt || 'Apply the sketch modifications shown',
      userId,
      metadata: jobMetadata,
      modelId: selectedModelId,
      aspectRatio,
    });

    // 8. Enqueue to QStash
    try {
      await enqueueClickatronJob({
        jobId,
        sessionId: finalTaskId,
        variationId,
        prompt: prompt || 'Apply the sketch modifications shown',
        userId,
        metadata: jobMetadata,
        modelId: selectedModelId,
        aspectRatio,
      });
      console.log('[SketchToEdit] QStash job enqueued successfully:', jobId);
    } catch (qstashError) {
      console.error('[SketchToEdit] Failed to enqueue QStash job:', qstashError);
      // Refund credits if QStash fails
      await creditCheck.refund('Failed to enqueue sketch-to-edit job');
      throw qstashError;
    }

    // 9. Return Success
    return NextResponse.json({
      success: true,
      variationId,
      jobId,
      status: 'queued',
      estimatedTime: 30, // seconds
      model: selectedModelId,
    });

  } catch (error: any) {
    console.error('[API SketchToEdit] Error:', error);

    // Try to refund credits on any error
    if (creditCheck) {
      try {
        await creditCheck.refund(`Error: ${error.message}`);
      } catch (refundError) {
        console.error('[API SketchToEdit] Failed to refund credits:', refundError);
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
