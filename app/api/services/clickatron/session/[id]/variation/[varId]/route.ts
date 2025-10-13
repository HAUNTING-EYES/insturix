import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { UpdateVariationRequestSchema } from '@/types/clickatron';
import { z } from 'zod';
import { ClickatronGCSManager } from '@/lib/clickatron-gcs';

// GET /api/services/clickatron/session/:id/variation/:varId - Get single variation
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; varId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, varId } = await params;

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

    const variation = task.details?.canvas?.variations?.find((v: any) => v.id === varId);

    if (!variation) {
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      variation: {
        ...variation,
        timestamp: variation.updatedAt || variation.createdAt || new Date(),
      },
    });
  } catch (error) {
    console.error('Error fetching variation:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PATCH /api/services/clickatron/session/:id/variation/:varId - Update single variation
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; varId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, varId } = await params;

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
    const validatedData = UpdateVariationRequestSchema.parse(body);

    const variation = task.details?.canvas?.variations?.find((v: any) => v.id === varId);

    if (!variation) {
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }

    // Update variation fields
    if (validatedData.status !== undefined) {
      variation.status = validatedData.status;
    }
    if (validatedData.imageRef !== undefined) {
      variation.imageRef = validatedData.imageRef;
    }
    if (validatedData.fineTuning !== undefined) {
      variation.fineTuning = { ...variation.fineTuning, ...validatedData.fineTuning };
    }
    if (validatedData.metadata !== undefined) {
      variation.metadata = { ...variation.metadata, ...validatedData.metadata };
    }

    variation.updatedAt = new Date();
    task.updatedAt = new Date();
    task.markModified('details');
    await task.save();

    return NextResponse.json({
      success: true,
      variation: {
        ...variation,
        timestamp: variation.updatedAt,
      },
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

// DELETE /api/services/clickatron/session/:id/variation/:varId - Delete variation and associated GCS image
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; varId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, varId } = await params;

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

    const variationIndex = task.details?.canvas?.variations?.findIndex((v: any) => v.id === varId);

    if (variationIndex === -1) {
      return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
    }

    const variation = task.details.canvas.variations[variationIndex];

    // Delete associated GCS image if it exists
    if (variation.imageRef) {
      try {
        // Extract raw GCS path (without query params)
        const rawGcsPath = variation.imageRef.split('?')[0];
        await ClickatronGCSManager.deleteImage(rawGcsPath);
        console.log(`Deleted GCS image for variation ${varId}: ${rawGcsPath}`);
      } catch (gcsError) {
        console.error(`Failed to delete GCS image for variation ${varId}:`, gcsError);
        // Don't fail the entire deletion if GCS delete fails
      }
    }

    // Remove variation from array
    task.details.canvas.variations.splice(variationIndex, 1);

    task.updatedAt = new Date();
    task.markModified('details');
    await task.save();

    return NextResponse.json({
      success: true,
      message: 'Variation deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting variation:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}