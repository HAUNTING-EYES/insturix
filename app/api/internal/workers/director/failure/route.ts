import { NextRequest, NextResponse } from 'next/server';
import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';

import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import {
  buildDirectorDeliveryFailureAudit,
  parseDirectorDeliveryFailure,
} from '@/lib/editron/services/director-delivery-failure';
import { projectService } from '@/lib/editron/services/project-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function handler(request: NextRequest) {
  try {
    const failure = parseDirectorDeliveryFailure(await request.json());
    const failedAt = new Date();
    const audit = buildDirectorDeliveryFailureAudit(failure, failedAt);
    const outcome = await projectService.recordDirectorDeliveryFailureV1(
      failure.userId,
      failure.projectId,
      {
        sourceMessageId: failure.sourceMessageId,
        errorMessage: failure.errorMessage,
        audit,
      },
    );

    if (outcome.disposition !== 'RECORDED') {
      return NextResponse.json({
        success: true,
        skipped: {
          PROJECT_NOT_FOUND: 'project_not_found',
          STALE_SOURCE_MESSAGE: 'stale_message',
          PROJECT_ALREADY_TERMINAL: 'project_already_terminal',
          PROJECT_STATE_CHANGED: 'project_state_changed',
        }[outcome.disposition],
      });
    }

    if (!outcome.receipt || !outcome.beforeRevision) {
      throw new Error('Director delivery failure owner returned a recorded outcome without a receipt.');
    }

    if (outcome.sourceUploadBatchId) {
      const db = await getDatabase();
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        {
          uploadBatchId: outcome.sourceUploadBatchId,
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
    return NextResponse.json({
      success: true,
      projectId: failure.projectId,
      beforeProjectRevision: outcome.beforeRevision,
      mutationReceipt: outcome.receipt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[DirectorFailure] Invalid callback: ${message}`);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export const POST = withInternalQStashWorkerAuth(handler, 'director-failure');
