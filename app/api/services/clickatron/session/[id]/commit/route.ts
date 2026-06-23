import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';
import { buildClickatronThumbnailCommitContext } from '@/lib/clickatron/thumbnail-commit-context';

// Enhanced commit request schema
const CommitVariationRequestSchema = z.object({
  variationId: z.string(),
  gcsPath: z.string(),
  editronProjectId: z.string().optional(),
  metadata: z.object({
    fileSize: z.number(),
    contentType: z.string(),
    aspectRatio: z.string().optional(),
    dimensions: z.string().optional(),
  }).optional(),
});

// POST /api/services/clickatron/session/:id/commit - Mark final variation
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

    const commitContext = buildClickatronThumbnailCommitContext(
      {
        brandId: task.brandId,
        projectId: task.projectId,
        universalId: task.universalId,
        sourceService: task.sourceService,
        sourceSessionId: task.sourceSessionId,
        sourceScriptId: task.sourceScriptId,
        metadata: task.metadata,
      },
      {
        id: variation.id,
        prompt: variation.prompt,
        imageRef: variation.imageRef,
        thumbnailRef: variation.thumbnailRef,
        aspectRatio: variation.aspectRatio,
        modelId: variation.modelId,
        metadata: variation.metadata,
      },
      {
        sessionId: id,
        variationId: validatedData.variationId,
        thumbnailUrl: validatedData.gcsPath,
        editronProjectId: validatedData.editronProjectId,
        metadata: validatedData.metadata,
      },
    );

    variation.metadata.committedThumbnail = {
      thumbnailId: commitContext.thumbnailId,
      universalId: commitContext.universalId,
      projectId: commitContext.projectId,
      brandId: commitContext.brandId,
    };

    // Update task timestamps (keep status as is for ongoing canvas work)
    task.updatedAt = new Date();

    // Save the updated task
    await task.save();

    // If linked to an Editron project, update its pipeline stage to "thumbnails"
    if (commitContext.projectId) {
      try {
        const { projectService } = await import('@/lib/editron/services/project-service');
        await projectService.updateProjectMetadata(commitContext.projectId, {
          pipelineStage: 'thumbnails',
        });
      } catch (e) {
        console.warn('[clickatron/commit] Failed to update project pipeline stage:', e);
      }
    }

    if (commitContext.universalId) {
      try {
        const { recordThumbnailOnLink } = await import('@/lib/shared/project-links');
        const linked = await recordThumbnailOnLink(
          userId,
          commitContext.universalId,
          commitContext.linkRecord,
        );
        if (!linked) {
          console.warn('[clickatron/commit] Project link not found for thumbnail commit:', {
            universalId: commitContext.universalId,
            thumbnailId: commitContext.thumbnailId,
          });
        }
      } catch (e) {
        console.warn('[clickatron/commit] Failed to record thumbnail on project link:', e);
      }
    }

    try {
      const { emitBrandEvent } = await import('@/lib/shared/brand-events');
      await emitBrandEvent({
        userId,
        brandId: commitContext.brandId,
        projectId: commitContext.projectId,
        service: 'clickatron',
        type: 'thumbnail_created',
        payload: commitContext.brandEventPayload,
      });
    } catch (e) {
      console.warn('[clickatron/commit] Failed to emit thumbnail_created brand event:', e);
    }

    if (commitContext.brandId && commitContext.brandLearningEvents.length > 0) {
      try {
        const { writeBrandSignalLearningEventsToBrandVault } = await import('@/lib/shared/brand-vault-learning-events');
        const vaultWrite = await writeBrandSignalLearningEventsToBrandVault({
          userId,
          brandId: commitContext.brandId,
          projectId: commitContext.projectId,
          sourceEventId: commitContext.thumbnailId,
          learningEvents: commitContext.brandLearningEvents,
          actorId: userId,
        });
        if (!vaultWrite.ok) {
          console.warn('[clickatron/commit] Failed to stage thumbnail learning in Brand Vault:', vaultWrite.error);
        }
      } catch (e) {
        console.warn('[clickatron/commit] Failed to stage thumbnail learning in Brand Vault:', e);
      }
    }

    return NextResponse.json({
      success: true,
      thumbnailUrl: validatedData.gcsPath,
      thumbnailId: commitContext.thumbnailId,
      universalId: commitContext.universalId,
      taskId: id,
      committedVariation: {
        id: variation.id,
        prompt: variation.prompt,
        thumbnailId: commitContext.thumbnailId,
        timestamp: variation.timestamp,
      },
    });
  } catch (error) {
    console.error('Error committing variation:', error);
    
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
