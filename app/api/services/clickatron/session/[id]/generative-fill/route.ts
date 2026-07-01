import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { Variation } from '@/types/clickatron';
import { createJob, setIdempotencyKey, getIdempotencyKey } from '@/lib/clickatron-jobs';
import { z } from 'zod';
import { enqueueClickatronJob } from '@/lib/clickatron-qtask';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';
import { checkCredits } from '@/lib/services/creditsMiddleware';

const GenerativeFillRequestSchema = z.object({
  prompt: z.string().min(1).max(2048),
  modelId: z.string(),
  variationId: z.string(),
  selectionBounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});

// POST /api/services/clickatron/session/:id/generative-fill - Create generative fill variation
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let creditCheck: Awaited<ReturnType<typeof checkCredits>> | null = null;

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
    
    // Extract fields
    const prompt = formData.get('prompt') as string;
    const modelId = formData.get('modelId') as string;
    const variationId = formData.get('variationId') as string;
    const selectionBoundsStr = formData.get('selectionBounds') as string;
    const maskFile = formData.get('mask') as File;
    
    // Parse selection bounds
    const selectionBounds = JSON.parse(selectionBoundsStr);
    
    // Validate request
    const validatedData = GenerativeFillRequestSchema.parse({
      prompt,
      modelId,
      variationId,
      selectionBounds,
    });

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
        });
      }
    }

    // Find the parent variation
    const parentVariation = task.details.canvas?.variations.find(
      (v: Variation) => v.id === variationId
    );

    if (!parentVariation) {
      return NextResponse.json({ error: 'Parent variation not found' }, { status: 404 });
    }

    // Validate that parent variation has an image
    if (!parentVariation.imageRef) {
      return NextResponse.json({ 
        error: 'Something went wrong. The parent variation has no image.' 
      }, { status: 400 });
    }

    creditCheck = await checkCredits(userId, 'clickatron', 'variation', {
      model: validatedData.modelId,
    });
    if (!creditCheck.allowed) {
      return creditCheck.errorResponse;
    }

    await creditCheck.deduct();

    // Upload mask to R2
    const maskArrayBuffer = await maskFile.arrayBuffer();
    const maskBuffer = Buffer.from(maskArrayBuffer);
    
    const newVariationId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const maskUrl = await ClickatronR2Manager.uploadMaskImage(
      userId,
      id,
      newVariationId,
      maskBuffer
    );

    // Store raw URL without query parameters
    const rawMaskUrl = maskUrl.split('?')[0];

    // Create new variation based on parent
    const newVariation: Variation = {
      id: newVariationId,
      prompt: validatedData.prompt,
      imageRef: '',
      status: 'generating',
      aspectRatio: parentVariation.aspectRatio,
      fineTuning: parentVariation.fineTuning || {
        curves: {
          master: [],
          red: [],
          green: [],
          blue: [],
        },
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      parentVariationId: variationId,
      modelId: validatedData.modelId,
      referenceImageRefs: [],
      metadata: {
        generativeFill: true,
        selectionBounds: validatedData.selectionBounds,
        maskUrl: rawMaskUrl,
      },
    };

    // Add variation to canvas
    if (!task.details.canvas) {
      task.details.canvas = {
        variations: [],
        chatHistory: [],
      };
    }

    task.details.canvas.variations.push(newVariation);
    task.markModified('details');
    await task.save();

    // Create job
    const jobId = await createJob({
      sessionId: id,
      variationId: newVariation.id,
      userId,
      prompt: validatedData.prompt,
      modelId: validatedData.modelId,
      aspectRatio: parentVariation.aspectRatio,
      parentVariationId: variationId,
      maskUrl: rawMaskUrl,
      referenceImageRefs: [],
    });

    // Store idempotency key if provided
    if (idempotencyKey) {
      await setIdempotencyKey(idempotencyKey, jobId);
    }

    console.log('Creating generative fill job with data:', {
      userId,
      sessionId: id,
      variationId: newVariation.id,
      prompt: validatedData.prompt,
      modelId: validatedData.modelId,
      aspectRatio: parentVariation.aspectRatio,
      parentVariationId: variationId,
      maskUrl: rawMaskUrl,
      referenceImageRefs: [],
    });

    // Enqueue job
    console.log(`Enqueuing generative fill job with ID: ${jobId}`);
    try {
      await enqueueClickatronJob({
        jobId,
        sessionId: id,
        variationId: newVariation.id,
        userId,
        prompt: validatedData.prompt,
        modelId: validatedData.modelId,
        aspectRatio: parentVariation.aspectRatio,
        parentVariationId: variationId,
        maskUrl: rawMaskUrl,
        referenceImageRefs: [],
      });
    } catch (enqueueErr) {
      console.error('Failed to enqueue job:', enqueueErr);
      await creditCheck.refund('Failed to enqueue generative fill job');
      creditCheck = null;
      throw enqueueErr;
    }

    return NextResponse.json({
      success: true,
      variationId: newVariation.id,
      jobId,
      status: 'queued',
      message: 'Generative fill queued successfully',
    });

  } catch (error) {
    console.error('Error creating generative fill:', error);
    if (creditCheck) {
      try {
        await creditCheck.refund(error instanceof Error ? error.message : 'Generative fill failed');
      } catch (refundError) {
        console.error('Failed to refund generative fill credits:', refundError);
      }
    }

    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create generative fill' },
      { status: 500 }
    );
  }
}
