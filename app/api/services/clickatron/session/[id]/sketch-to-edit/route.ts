import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { CreateVariationRequestSchema } from '@/types/clickatron';
import { createJob, setIdempotencyKey, getIdempotencyKey } from '@/lib/clickatron-jobs';
import { z } from 'zod';
import { enqueueClickatronJob } from '@/lib/clickatron-qtask';
import { getAvailableModels } from '@/lib/config/clickatron-models';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import { checkCredits } from '@/lib/services/creditsMiddleware';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[SketchToEdit Route] === REQUEST RECEIVED ===');
  console.log('[SketchToEdit Route] URL:', request.url);
  console.log('[SketchToEdit Route] Method:', request.method);

  let creditCheck: Awaited<ReturnType<typeof checkCredits>> | null = null;
  try {
    const { userId } = await auth();
    console.log('[SketchToEdit Route] User ID:', userId);

    if (!userId) {
      console.error('[SketchToEdit Route] Unauthorized - no user ID');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    console.log('[SketchToEdit Route] Session ID:', id);

    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      console.error('[SketchToEdit Route] Invalid Session ID:', id);
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }


    // Parse multipart/form-data
    const formData = await request.formData();
    const prompt = formData.get('prompt') as string || '';
    const modelId = formData.get('modelId') as string || undefined;
    const parentVariationId = formData.get('parentVariationId') as string || undefined;
    const img2File = formData.get('img2') as File;

    if (!img2File) {
      return NextResponse.json({ error: 'Missing annotated image (img2)' }, { status: 400 });
    }

    if (!parentVariationId) {
      return NextResponse.json({ error: 'Missing original variation ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    // Find the task
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get original variation to inherit aspect ratio and other data
    const parentVariation = task.details.canvas?.variations.find((v: any) => v.id === parentVariationId);
    if (!parentVariation) {
       return NextResponse.json({ error: 'Original variation not found' }, { status: 404 });
    }

    const aspectRatio = parentVariation.aspectRatio || task.details.aspectRatio;

    // Internal prompt logic
    const systemPrompt = `<role>You are a precision image editor that applies sketch annotations to original images.</role>
<task>Apply the edits from the annotated image (img2) to the original image.</task>
<rules>
- Apply ONLY the changes indicated by annotations and instructions in img2
- Do NOT change other details, objects, quality, lighting, composition, or unrelated elements
- Preserve original quality and data
</rules>`;
    const finalPrompt = prompt ? `${prompt}\n\n${systemPrompt}` : systemPrompt;

    const variationId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date();

    // Use a model that supports multiple images for sketch-to-edit
    // Default to nano-banana-pro/edit which handles image_urls array
    let selectedModelId = modelId || 'fal-ai/nano-banana-pro/edit';

    // Validate that the selected model supports multiple images for sketch-to-edit
    const modelConfig = getAvailableModels('sketchToEdit', 0).find(m => m.id === selectedModelId);
    if (!modelConfig) {
      console.error('[SketchToEdit] Invalid model selected:', selectedModelId);
      return NextResponse.json({
        error: 'Invalid model selected. Please use a sketch-to-edit compatible model.',
        validModels: getAvailableModels('sketchToEdit', 0).map(m => m.id)
      }, { status: 400 });
    }

    creditCheck = await checkCredits(userId, 'clickatron', 'variation', {
      model: selectedModelId,
      requestType: 'sketch-to-edit',
    });
    if (!creditCheck.allowed) {
      return creditCheck.errorResponse;
    }

    await creditCheck.deduct();

    console.log('[SketchToEdit] Starting R2 upload, file size:', img2File.size, 'type:', img2File.type);

    // Upload img2 to R2
    const arrayBuffer = await img2File.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('[SketchToEdit] Buffer created, size:', buffer.length);

    let r2Url: string;
    try {
      // Use parentVariationId as the variationId for consistent path structure
      r2Url = await ClickatronR2Manager.uploadImageBuffer(
        userId,
        id,
        parentVariationId,
        buffer,
        img2File.type
      );
      console.log('[SketchToEdit] R2 upload successful:', r2Url);
    } catch (uploadError) {
      console.error('[SketchToEdit] R2 upload failed:', uploadError);
      await creditCheck?.refund('R2 upload failed');
      creditCheck = null;
      throw uploadError;
    }

    const rawImg2Ref = r2Url.split('?')[0];
    console.log('[SketchToEdit] Raw img2 ref:', rawImg2Ref);


    console.log('[SketchToEdit] Using model:', selectedModelId);

    const newVariation = {
      id: variationId,
      prompt: finalPrompt,
      status: 'generating' as const,
      imageRef: parentVariation.imageRef || '', // Inherit parent image as base
      thumbnailRef: parentVariation.thumbnailRef || '',
      aspectRatio,
      fineTuning: {
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
      createdAt: now,
      updatedAt: now,
      parentVariationId: parentVariationId,
      referenceImageRefs: [rawImg2Ref],
      metadata: {
        inputMode: 'sketchToEdit',
        originalPrompt: prompt
      },
      modelId: selectedModelId,
    };

    // Add to canvas
    if (!task.details.canvas) task.details.canvas = { variations: [] };
    task.details.canvas.variations.unshift(newVariation);
    task.details.canvas.variations = task.details.canvas.variations.slice(0, 50);
    task.updatedAt = new Date();
    task.markModified('details');
    await task.save();

    // Create job
    const jobId = await createJob({
      sessionId: id,
      variationId,
      prompt: finalPrompt,
      userId,
      parentVariationId,
      fineTuning: newVariation.fineTuning,
      metadata: newVariation.metadata,
      modelId: selectedModelId,
      referenceImageRefs: [rawImg2Ref],
      aspectRatio,
    });

    // Enqueue
    try {
      await enqueueClickatronJob({
        jobId,
        sessionId: id,
        variationId,
        prompt: finalPrompt,
        userId,
        parentVariationId,
        fineTuning: newVariation.fineTuning,
        metadata: newVariation.metadata,
        modelId: selectedModelId,
        referenceImageRefs: [rawImg2Ref],
        aspectRatio,
      });
    } catch (e) {
      console.error('Failed to enqueue job:', e);
      await creditCheck?.refund('Failed to enqueue generation job');
      creditCheck = null;
      throw e;
    }

    return NextResponse.json({
      success: true,
      variationId,
      jobId,
      status: 'queued',
      variation: newVariation,
    });

  } catch (error) {
    console.error('Error in sketch-to-edit:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    if (creditCheck) {
      try {
        await creditCheck.refund(error instanceof Error ? error.message : 'Sketch-to-edit failed');
      } catch (refundError) {
        console.error('Failed to refund sketch-to-edit credits:', refundError);
      }
    }

    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
