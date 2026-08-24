import { NextRequest, NextResponse } from 'next/server';
import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';

import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import {
  buildDirectorDeliveryFailureAudit,
  parseDirectorDeliveryFailure,
} from '@/lib/editron/services/director-delivery-failure';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function handler(request: NextRequest) {
  try {
    const failure = parseDirectorDeliveryFailure(await request.json());
    const db = await getDatabase();
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId: failure.projectId, userId: failure.userId },
      {
        projection: {
          _id: 0,
          autoEditStatus: 1,
          directorMessageId: 1,
          sourceUploadBatchId: 1,
        },
      },
    );

    if (!project) {
      console.warn(`[DirectorFailure] Project not found: ${failure.projectId}`);
      return NextResponse.json({ success: true, skipped: 'project_not_found' });
    }

    if (
      typeof project.directorMessageId === 'string'
      && project.directorMessageId !== failure.sourceMessageId
    ) {
      console.warn(
        `[DirectorFailure] Ignoring stale callback ${failure.sourceMessageId} for ${failure.projectId}; current message is ${project.directorMessageId}`,
      );
      return NextResponse.json({ success: true, skipped: 'stale_message' });
    }

    if (!['directing_queued', 'directing', 'analysis_complete'].includes(project.autoEditStatus)) {
      return NextResponse.json({ success: true, skipped: 'project_already_terminal' });
    }

    const failedAt = new Date();
    const audit = buildDirectorDeliveryFailureAudit(failure, failedAt);
    const projectFilter: Record<string, unknown> = {
      projectId: failure.projectId,
      userId: failure.userId,
      autoEditStatus: { $in: ['directing_queued', 'directing', 'analysis_complete'] },
    };
    if (project.directorMessageId) {
      projectFilter.directorMessageId = failure.sourceMessageId;
    }

    const projectUpdate = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      projectFilter,
      {
        $set: {
          autoEditStatus: 'failed',
          autoEditError: failure.errorMessage,
          autoEditFailedAt: failedAt,
          autoEditStageDesc: 'Director delivery failed',
          'intelligence.directorDeliveryFailure': audit,
          updatedAt: failedAt,
        },
      },
    );

    if (projectUpdate.modifiedCount === 0) {
      return NextResponse.json({ success: true, skipped: 'project_state_changed' });
    }

    if (typeof project.sourceUploadBatchId === 'string' && project.sourceUploadBatchId) {
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        {
          uploadBatchId: project.sourceUploadBatchId,
          userId: failure.userId,
          projectId: failure.projectId,
          orchestrationStatus: 'director_queued',
        },
        {
          $set: {
            orchestrationStatus: 'failed',
            orchestrationError: failure.errorMessage,
            directorFailure: audit,
            updatedAt: failedAt,
          },
        },
      );
    }

    console.error(`[DirectorFailure] ${failure.projectId}: ${failure.errorMessage}`);
    return NextResponse.json({ success: true, projectId: failure.projectId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[DirectorFailure] Invalid callback: ${message}`);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export const POST = withInternalQStashWorkerAuth(handler, 'director-failure');
