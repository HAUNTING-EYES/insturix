import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { Types } from 'mongoose';
import { z } from 'zod';
import { buildClickatronThumbnailCommitContext } from '@/lib/clickatron/thumbnail-commit-context';
import {
  ClickatronProjectPublicationBlockedErrorV1,
  commitClickatronThumbnailProjectV1,
  resolveClickatronThumbnailProjectBindingV1,
} from '@/lib/editron/services/clickatron-project-publication-v1';
import { ProjectNotFoundOrForbiddenError } from '@/lib/editron/services/project-service';

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

    const previousCommittedThumbnail = variation.metadata?.committedThumbnail;
    let projectBinding;
    if (commitContext.projectId) {
      try {
        projectBinding = await resolveClickatronThumbnailProjectBindingV1({
          userId,
          projectId: commitContext.projectId,
          thumbnailId: commitContext.thumbnailId,
          sessionId: id,
          variationId: validatedData.variationId,
          thumbnailSource: validatedData.gcsPath,
          existingBinding: previousCommittedThumbnail?.projectBindingV1,
        });
      } catch (error) {
        if (error instanceof ProjectNotFoundOrForbiddenError) {
          return NextResponse.json({ error: 'Editron project not found' }, { status: 404 });
        }
        if (error instanceof ClickatronProjectPublicationBlockedErrorV1) {
          return NextResponse.json({
            error: 'Thumbnail project binding blocked',
            reason: error.reason,
          }, { status: 409 });
        }
        throw error;
      }
    }

    variation.metadata.committedThumbnail = {
      thumbnailId: commitContext.thumbnailId,
      universalId: commitContext.universalId,
      projectId: commitContext.projectId,
      brandId: commitContext.brandId,
      projectBindingV1: projectBinding,
      projectPublicationV1: projectBinding ? {
        schemaVersion: 1,
        status: 'PENDING',
      } : undefined,
    };

    // Update task timestamps (keep status as is for ongoing canvas work)
    task.updatedAt = new Date();

    // Save the updated task
    await task.save();

    let projectProjection: Record<string, unknown> = { status: 'NOT_LINKED' };
    if (projectBinding) {
      try {
        const result = await commitClickatronThumbnailProjectV1({
          userId,
          thumbnailSource: validatedData.gcsPath,
          binding: projectBinding,
        });
        projectProjection = {
          status: 'COMMITTED',
          replayed: result.replayed,
          publication: result.publication,
          observedProjectRevision: result.observedProjectRevision,
        };
      } catch (error) {
        projectProjection = error instanceof ClickatronProjectPublicationBlockedErrorV1
          ? { status: 'BLOCKED', reason: error.reason }
          : { status: 'UNVERIFIABLE' };
        variation.metadata.committedThumbnail.projectPublicationV1 = {
          schemaVersion: 1,
          ...projectProjection,
        };
        variation.updatedAt = new Date();
        task.updatedAt = new Date();
        await task.save();
        return NextResponse.json({
          error: error instanceof ClickatronProjectPublicationBlockedErrorV1
            ? 'Thumbnail project publication blocked'
            : 'Thumbnail project publication could not be verified',
          thumbnailCommitted: true,
          thumbnailId: commitContext.thumbnailId,
          projectProjection,
        }, { status: error instanceof ClickatronProjectPublicationBlockedErrorV1 ? 409 : 503 });
      }

      variation.metadata.committedThumbnail.projectPublicationV1 = {
        schemaVersion: 1,
        ...projectProjection,
      };
      variation.updatedAt = new Date();
      task.updatedAt = new Date();
      await task.save();
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
      projectProjection,
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
