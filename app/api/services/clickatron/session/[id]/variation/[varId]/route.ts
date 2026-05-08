import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { UpdateVariationRequestSchema } from '@/types/clickatron';
import { z } from 'zod';
import { ClickatronR2Manager } from '@/lib/clickatron-r2';

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

    if ((validatedData as any)?.thumbnailRef !== undefined) {
      variation.thumbnailRef = (validatedData as any)?.thumbnailRef;
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

// DELETE /api/services/clickatron/session/:id/variation/:varId - Delete variation and associated R2 image
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

    // Delete Variation image + thumbnail
    const r2Refs = [
      variation.imageRef,
      variation.thumbnailRef,
    ].filter(Boolean);

    for (const ref of r2Refs) {
      try {
        // Extract raw R2 path (without query params)
        const rawPath = ref.split('?')[0];
        await ClickatronR2Manager.deleteImage(rawPath);
        console.log(`Deleted R2 image for variation ${varId}: ${rawPath}`);
      } catch (r2Error) {
        console.error(`Failed to delete R2 image for variation ${varId}:`, r2Error);
        // Don't fail the entire deletion if R2 delete fails
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