import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { CommitVariationRequestSchema } from '@/types/clickatron';
import { z } from 'zod';

// POST /api/services/clickatron/session/:id/commit - Mark final variation → populate results.thumbnail
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    
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
    
    // Validate request body
    const validatedData = CommitVariationRequestSchema.parse(body);

    // Check if canvas and variations exist
    if (!task.details?.canvas?.variations) {
      return NextResponse.json({ error: 'No variations found' }, { status: 404 });
    }

    // Find the specific variation
    const variation = task.details.canvas.variations.find(
      (v: any) => v.id === validatedData.variationId
    );
    
    if (!variation) {
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }

    // Check if variation is completed
    if (variation.status !== 'completed') {
      return NextResponse.json({ 
        error: 'Variation must be completed before committing',
        details: { currentStatus: variation.status }
      }, { status: 400 });
    }

    // Update task with final results
    task.results = {
      thumbnail: {
        prompt: validatedData.finalPrompt || variation.prompt,
        gcs_url: variation.imageRef || `gs://bucket/${variation.imageRef}`,
      },
      details: JSON.stringify({
        variationId: variation.id,
        timestamp: variation.timestamp,
        fineTuning: variation.fineTuning,
        metadata: variation.metadata,
      }),
    };

    // Update task status and timestamps
    task.status = 'completed';
    task.completedAt = new Date();
    task.updatedAt = new Date();

    // Save the updated task
    await task.save();

    return NextResponse.json({
      success: true,
      thumbnailUrl: task.results.thumbnail.gcs_url,
      taskId: id,
      committedVariation: {
        id: variation.id,
        prompt: variation.prompt,
        timestamp: variation.timestamp,
      },
    });
  } catch (error) {
    console.error('Error committing variation:', error);
    
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