import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { UpdateVariationRequestSchema } from '@/types/clickatron';
import { z } from 'zod';

// PATCH /api/services/clickatron/session/:id/variation/:varId - Fine-tuning metadata update
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; varId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, varId } = params;
    
    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }

    if (!varId || typeof varId !== 'string') {
      return NextResponse.json({ error: 'Invalid Variation ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);

    // Find the task
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check if canvas and variations exist
    if (!task.details?.canvas?.variations) {
      return NextResponse.json({ error: 'No variations found' }, { status: 404 });
    }

    // Find the specific variation
    const variationIndex = task.details.canvas.variations.findIndex(
      (v: any) => v.id === varId
    );
    
    if (variationIndex === -1) {
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }

    const body = await request.json();
    
    // Validate request body
    const validatedData = UpdateVariationRequestSchema.parse(body);

    // Update the variation
    const variation = task.details.canvas.variations[variationIndex];
    
    if (validatedData.fineTuning) {
      variation.fineTuning = {
        ...variation.fineTuning,
        ...validatedData.fineTuning,
      };
    }
    
    if (validatedData.metadata) {
      variation.metadata = {
        ...variation.metadata,
        ...validatedData.metadata,
      };
    }

    // Update task timestamp and save
    task.updatedAt = new Date();
    await task.save();

    return NextResponse.json({
      success: true,
      variationId: varId,
      updatedFields: Object.keys(validatedData),
    });
  } catch (error) {
    console.error('Error updating variation:', error);
    
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

// GET /api/services/clickatron/session/:id/variation/:varId - Fetch variation status
export async function GET(
  request: Request,
  { params }: { params: { id: string; varId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, varId } = params;
    if (!id || typeof id !== 'string' || !id.match(/^[a-f\d]{24}$/i)) {
      return NextResponse.json({ error: 'Invalid Session ID' }, { status: 400 });
    }
    if (!varId) {
      return NextResponse.json({ error: 'Invalid Variation ID' }, { status: 400 });
    }

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });
    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const variations = task.details?.canvas?.variations || [];
    const variation = variations.find((v: any) => v.id === varId);
    if (!variation) {
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }
    return NextResponse.json({
      id: variation.id,
      status: variation.status || 'generating',
      imageRef: variation.imageRef,
      prompt: variation.prompt,
      timestamp: variation.timestamp,
      fineTuning: variation.fineTuning,
    });
  } catch (error) {
    console.error('Error fetching variation status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}