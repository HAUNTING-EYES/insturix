import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { CreateVariationRequestSchema } from '@/types/clickatron';
import { createJob, setIdempotencyKey, getIdempotencyKey } from '@/lib/clickatron-jobs';
import { z } from 'zod';
import { enqueueClickatronJob } from '@/lib/clickatron-qtask';
import { resolveClickatronModelForGeneration } from '@/lib/config/clickatron-models';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import { checkCredits } from '@/lib/services/creditsMiddleware';

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

    // Idempotency check MUST happen before any credit deduction so a retried
    // request with the same Idempotency-Key returns the original job without
    // charging again (a double-click / client retry must not double-deduct).
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

    // Parse the request body once (form-data) so validation, model selection, and
    // credit checks use the same generation contract.
    const formData = await request.formData();
    const modelId = formData.get('modelId') as string || undefined;
    const prompt = formData.get('prompt') as string;
    const aspectRatio = formData.get('aspectRatio') as string || undefined;
    const parentVariationId = formData.get('parentVariationId') as string || undefined;
    const updateExistingBlank = formData.get('updateExistingBlank') === 'true';
    const fineTuning = JSON.parse(formData.get('fineTuning') as string || '{}');
    const metadata = JSON.parse(formData.get('metadata') as string || '{}');
    const referenceImages = formData.getAll('referenceImages') as File[];

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    // Find the task before charging so a missing session never deducts credits.
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const parentVariation = parentVariationId
      ? task.details.canvas?.variations?.find((v: any) => v.id === parentVariationId)
      : undefined;
    const parentVariationForGenerationId = parentVariation?.imageRef
      ? parentVariationId
      : undefined;

    const effectiveAspectRatio = aspectRatio || task.details.aspectRatio;
    const resolvedModel = resolveClickatronModelForGeneration({
      requestedModelId: modelId,
      context: parentVariationForGenerationId ? 'edit' : 'newVariation',
      referenceImageCount: referenceImages.length,
      hasParentImage: Boolean(parentVariationForGenerationId),
      aspectRatio: effectiveAspectRatio,
    });
    if (resolvedModel.reason === 'aspect-ratio-fallback') {
      console.warn('[Clickatron] Variation model switched for aspect-ratio compatibility:', {
        requestedModelId: resolvedModel.requestedModelId,
        selectedModelId: resolvedModel.modelId,
        aspectRatio: effectiveAspectRatio,
      });
    }

    const validatedData = CreateVariationRequestSchema.parse({
      prompt,
      modelId: resolvedModel.modelId,
      aspectRatio,
      parentVariationId,
      updateExistingBlank,
      fineTuning,
      metadata,
      sessionId: id,
    });

    // Check credits after model resolution so provider multipliers match the
    // actual model that will be enqueued.
    const creditCheck = await checkCredits(userId, 'clickatron', 'variation', { model: resolvedModel.modelId });
    if (!creditCheck.allowed) {
      return creditCheck.errorResponse;
    }

    await creditCheck.deduct();

    // Upload reference images to R2 and get their URLs
    const referenceImageRefs: string[] = [];
    for (const file of referenceImages) {
      if (file instanceof File) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Upload to R2
      const r2Url = await ClickatronR2Manager.uploadImageBuffer(
        userId,
        id,
        `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        buffer,
        file.type
      );
        
        // Store without query parameters for long-term storage
        const rawR2Url = r2Url.split('?')[0];
        referenceImageRefs.push(rawR2Url);
      }
    }


    // Initialize canvas if it doesn't exist
    if (!task.details?.canvas) {
      task.details.canvas = { variations: [] };
    }

    // Create new variation
    // If we're updating an existing blank variation, use its ID
    const variationId = validatedData.updateExistingBlank && validatedData.parentVariationId
        ? validatedData.parentVariationId
        : `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date();

    const selectedModelId = resolvedModel.modelId;
    // Inherit image + thumbnail from parent (important)
    let imageRef = '';
    let thumbnailRef = '';

    if (parentVariationForGenerationId) {
      const parent = task.details.canvas.variations.find(
        (v: any) => v.id === parentVariationForGenerationId
      );
      if (parent) {
        imageRef = parent.imageRef || '';
        thumbnailRef = parent.thumbnailRef || '';
      }
    }

    const newVariation = {
      id: variationId,
      prompt: validatedData.prompt,
      status: 'generating' as const,
      imageRef: imageRef,
      thumbnailRef: thumbnailRef,
      aspectRatio: effectiveAspectRatio,
      fineTuning: validatedData.fineTuning || {
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
      createdAt: now,
      updatedAt: now,
      parentVariationId: parentVariationForGenerationId,
      referenceImageRefs: referenceImageRefs || [], // Use referenceImageRefs instead of referenceImages
      metadata: validatedData.metadata || {},
      modelId: selectedModelId, // Add modelId to variation
    };

    // Add variation to canvas (capping at 50)
    const currentVariations = task.details.canvas?.variations || [];

    // If we're updating an existing blank variation, find and update it
    if (validatedData.updateExistingBlank && validatedData.parentVariationId) {
      const existingVariationIndex = currentVariations.findIndex((v: any) => v.id === validatedData.parentVariationId);
      if (existingVariationIndex !== -1) {
        // Update the existing variation
        currentVariations[existingVariationIndex] = newVariation;
      } else {
        // If not found, add as new variation
        currentVariations.unshift(newVariation);
      }
    } else {
      // Add new variation to the beginning
      currentVariations.unshift(newVariation);
    }

    // Keep only the 50 most recent variations
    task.details.canvas.variations = currentVariations.slice(0, 50);

    task.updatedAt = new Date();
    task.markModified('details');
    await task.save();

    // Use QStash for async processing
    const jobId = await createJob({
      sessionId: id,
      variationId: variationId,
      prompt: validatedData.prompt,
      userId,
      parentVariationId: parentVariationForGenerationId,
      fineTuning: validatedData.fineTuning || {
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
      metadata: validatedData.metadata,
      modelId: selectedModelId, // Use the selected modelId
      referenceImageRefs: referenceImageRefs || [], // Pass referenceImageRefs to the job
      aspectRatio: effectiveAspectRatio, // Use per-variation aspect ratio or fall back to global
    });

    // Set idempotency key if provided
    if (idempotencyKey) {
      try {
        await setIdempotencyKey(idempotencyKey, jobId);
      } catch (idemError) {
        // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md).
        // Runs AFTER deduct() but BEFORE enqueue — a throw here 500s the request with credits
        // already deducted, no job, and NO refund. Logged loud + re-thrown (behavior preserved);
        // the real fix (guard/refund) is in the audit doc's "Design fixes for later".
        console.error('[LOUDFAIL][Clickatron][VARIATION][IDEMPOTENCY-AFTER-DEDUCT][MONEY-LOSS] setIdempotencyKey threw after charge, before enqueue — user charged, no job, no refund:', { userId, sessionId: id, jobId, idempotencyKey, idemError });
        throw idemError;
      }
    }

    // Enqueue job with QStash
    try {
      const qstashResult = await enqueueClickatronJob({
        jobId,
        sessionId: id,
        variationId: variationId,
        prompt: validatedData.prompt,
        userId,
        parentVariationId: parentVariationForGenerationId,
        fineTuning: validatedData.fineTuning || {
          brightness: 100,
          contrast: 100,
          saturation: 100,
        },
        metadata: validatedData.metadata,
        modelId: selectedModelId, // Use the selected modelId
        referenceImageRefs: referenceImageRefs || [], // Pass referenceImageRefs to the job
        aspectRatio: effectiveAspectRatio, // Use per-variation aspect ratio or fall back to global
      });
      console.log('QStash job enqueued successfully:', qstashResult);
    } catch (qstashError) {
      console.error('Failed to enqueue QStash job:', qstashError);
      // Refund credits if QStash fails
      await creditCheck.refund('Failed to enqueue generation job');
      throw qstashError;
    }

    // Find the created/updated variation in the task
    const createdVariation = task.details.canvas.variations.find((v: any) => v.id === variationId);

    return NextResponse.json({
      success: true,
      variationId: variationId,
      jobId,
      status: 'queued',
      estimatedTime: 30, // seconds
      variation: createdVariation, // Return the full variation object
    });
  } catch (error) {
    console.error('Error creating variation:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

