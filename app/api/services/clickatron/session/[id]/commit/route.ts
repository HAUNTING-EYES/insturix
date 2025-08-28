import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { CommitVariationRequest } from '@/types/clickatron';
import { z } from 'zod';

// Enhanced commit request schema
const CommitVariationRequestSchema = z.object({
  variationId: z.string(),
  gcsPath: z.string(),
  metadata: z.object({
    fileSize: z.number(),
    contentType: z.string(),
    aspectRatio: z.string().optional(),
    dimensions: z.string().optional(),
  }).optional(),
});

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

    // Update variation with GCS metadata
    variation.metadata = {
      ...variation.metadata,
      gcsPath: validatedData.gcsPath,
      fileSize: validatedData.metadata?.fileSize,
      contentType: validatedData.metadata?.contentType,
      aspectRatio: validatedData.metadata?.aspectRatio,
      dimensions: validatedData.metadata?.dimensions,
    };
    variation.updatedAt = new Date();

    // Store committed variation in workflow
    if (!task.details.workflow) {
      task.details.workflow = {
        videoIdea: task.title || 'Untitled Session',
        stage: 'canvas',
        workflowVersion: 1,
      };
    }
    task.details.workflow.committedVariation = variation;
    // Keep stage as 'canvas' since users can continue working

    // Update canvas with committed variation ID
    task.details.canvas.committedVariationId = variation.id;

    // Update task with final results (legacy compatibility)
    task.results = {
      thumbnail: {
        prompt: variation.prompt,
        gcs_url: validatedData.gcsPath,
      },
      details: JSON.stringify({
        variationId: variation.id,
        timestamp: variation.timestamp,
        fineTuning: variation.fineTuning,
        metadata: variation.metadata,
        gcsPath: validatedData.gcsPath,
        fileSize: validatedData.metadata?.fileSize,
        contentType: validatedData.metadata?.contentType,
      }),
    };

    // Update task timestamps (keep status as is for ongoing canvas work)
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