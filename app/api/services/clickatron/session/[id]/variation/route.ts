import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { CreateVariationRequestSchema } from '@/types/clickatron';
import { createJob, setIdempotencyKey, getIdempotencyKey } from '@/lib/clickatron-jobs';
import { z } from 'zod';
import { enqueueQStashJob } from '@/lib/clickatron-qtask';

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

    const body = await request.json();

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

    // Validate request body
    const validatedData = CreateVariationRequestSchema.parse({
      ...body,
      sessionId: id,
    });

    // Initialize canvas if it doesn't exist
    if (!task.details?.canvas) {
      task.details.canvas = { variations: [], chatHistory: [] };
    }


    // Create new variation
    const variationId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date();
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
      referenceImages: validatedData.referenceImages || [],
      metadata: validatedData.metadata || {},
    };

    // Add variation to canvas (capping at 50)
    const currentVariations = task.details.canvas?.variations || [];
    currentVariations.unshift(newVariation); // Add to beginning

    // Keep only the 50 most recent variations
    task.details.canvas.variations = currentVariations.slice(0, 50);



    // Add user message to chat history
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const userMessage = {
      id: messageId,
      role: 'user' as const,
      content: validatedData.prompt,
      timestamp: now,
      variationId: variationId,
      referenceImages: validatedData.referenceImages || [],
    };

    task.details.canvas.chatHistory.unshift(userMessage);
    // Keep last 100 messages
    task.details.canvas.chatHistory = task.details.canvas.chatHistory.slice(0, 100);

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
      fineTuning: validatedData.fineTuning,
      metadata: validatedData.metadata,
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
        fineTuning: validatedData.fineTuning,
        metadata: validatedData.metadata,
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

