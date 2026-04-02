import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';
import { SyncCanvasRequestSchema } from '@/types/clickatron';

// GET /api/services/clickatron/session/:id - Fetch a single session
export async function GET(
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

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session: task });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH /api/services/clickatron/session/:id - Sync canvas data with intelligent merging
export async function PATCH(
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
    const { canvas } = SyncCanvasRequestSchema.parse(body);

    await getClickatronDb();
    const objectId = new Types.ObjectId(id);
    const task = await ClickatronTask.findOne({ _id: objectId, clerkUserId: userId });

    if (!task) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Intelligent merging: preserve backend-controlled fields while updating frontend-controlled fields
    if (task.details.canvas && task.details.canvas.variations) {
      const mergedVariations = canvas.variations.map((frontendVariation: any) => {
        const backendVariation = task.details.canvas?.variations.find(
          (v: any) => v.id === frontendVariation.id
        );

        if (backendVariation) {
          // Preserve backend-controlled fields (status, imageRef) if they indicate completion
          const preserveBackendFields =
            backendVariation.status === 'completed' &&
            backendVariation.imageRef &&
            frontendVariation.status !== 'completed';
        
          return {
            ...frontendVariation,
            // Preserve backend status and imageRef if backend has completed the generation
            ...(preserveBackendFields && {
              status: backendVariation.status,
              imageRef: backendVariation.imageRef,
              thumbnailRef: backendVariation.thumbnailRef,
            }),
            // Always preserve thumbnailRef if backend already has it
            ...(backendVariation.thumbnailRef && {
              thumbnailRef: backendVariation.thumbnailRef,
            }),
          };
        }
        
        return frontendVariation;
      });

      canvas.variations = mergedVariations;
    }

    task.details.canvas = canvas;
    task.markModified('details');
    await task.save();

    return NextResponse.json({ success: true, session: task });
  } catch (error) {
    console.error('Error syncing canvas:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}