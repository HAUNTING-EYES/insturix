import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';
import { SelectIdeaRequestSchema } from '@/types/clickatron';
import { createJob } from '@/lib/clickatron-jobs';
import { enqueueQStashJob } from '@/lib/clickatron-qtask';
import { CLICKATRON_MODELS } from '@/lib/config/clickatron-models';

// POST /api/services/clickatron/session/:id/ideas/select
// Marks an idea as selected, and creates the initial canvas.
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
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    const body = await request.json();
    const { selectedIdea, modelId } = SelectIdeaRequestSchema.parse(body);

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Persist selection
    task.details.selectedIdea = selectedIdea;

    // Initialize canvas with a "generating" variation
    const variationId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date();
    
    // Get default model if none provided
    let selectedModelId = modelId;
    
    // If no model is provided, find the default text-to-image model for ideation
    if (!selectedModelId) {
      const defaultModel = Object.values(CLICKATRON_MODELS).find(
        model => model.isDefault && model.stages.includes('ideation') && model.type === 'text-to-image'
      );
      selectedModelId = defaultModel?.id || 'fal-ai/imagen4/preview'; // Fallback to a known text-to-image model
    }
    
    task.details.canvas = {
      variations: [
        {
          id: variationId,
          prompt: selectedIdea.prompt,
          status: 'generating',
          imageRef: '',
          aspectRatio: task.details.aspectRatio,
          fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
          createdAt: now,
          updatedAt: now,
          modelId: selectedModelId, // Add modelId to variation
        },
      ],
      chatHistory: [],
    };

    task.markModified('details');
    await task.save();

    // Create and enqueue a job for the new variation
    const jobId = await createJob({
      sessionId: id,
      variationId,
      prompt: selectedIdea.prompt,
      userId,
      fineTuning: { brightness: 100, contrast: 100, saturation: 100 },
      metadata: { aspectRatio: task.details.aspectRatio },
    });

    await enqueueQStashJob({
      jobId,
      sessionId: id,
      variationId,
      prompt: selectedIdea.prompt,
      userId,
      modelId: selectedModelId, // Pass modelId to the job
    });

    return NextResponse.json({ success: true, message: 'Canvas initialization job queued' });
  } catch (error) {
    console.error('Error selecting idea:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
