/**
 * POST /api/services/editron/auto-edit/cancel
 *
 * Director Mode (assist lane) ONLY: cancel a scan in flight.
 *
 *   scanning ──cancel──► scan_failed (terminal, refunded where deducted)
 *
 * Cancel WINS every race: the status write is atomic (only fires while the scan
 * is still cancellable), and every assist ready_for_chat writer filters on
 * autoEditStatus $ne scan_failed. Refund fires only when THIS request performed
 * the transition (matchedCount === 1) and a deduction was persisted — from-asset
 * deducts at intake (refund due); from-batch deducts at lay-down (cancelling
 * before that means nothing was charged, nothing to refund).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  ASSIST_STATUS_READY,
  ASSIST_STATUS_SCAN_FAILED,
  isAssistProject,
  settleAssistScanFailure,
} from '@/lib/editron/services/assist-lane';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const db = await getDatabase();
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
      {
        projection: {
          editMode: 1,
          autoEditStatus: 1,
          sourceUploadBatchId: 1,
          assistCreditTransactionId: 1,
          assistChargedCredits: 1,
        },
      },
    );
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }
    if (!isAssistProject(project)) {
      return NextResponse.json({ success: false, error: 'Only Director Mode scans can be cancelled.' }, { status: 400 });
    }

    const status = typeof project.autoEditStatus === 'string' ? project.autoEditStatus : null;
    if (status === ASSIST_STATUS_READY || status === 'complete') {
      return NextResponse.json(
        { success: false, error: 'The scan already finished — the project is ready.', code: 'already_ready' },
        { status: 409 },
      );
    }
    if (status === ASSIST_STATUS_SCAN_FAILED) {
      return NextResponse.json({ success: true, projectId, status, alreadyCancelled: true });
    }

    const txId = typeof project.assistCreditTransactionId === 'string'
      ? project.assistCreditTransactionId.trim()
      : '';
    let refunded = false;
    if (txId) {
      const settlement = await settleAssistScanFailure(db, {
        projectId,
        userId,
        reason: 'Director Mode scan cancelled — full refund',
        creditTransactionId: txId,
      });
      if (settlement === 'transition-lost') {
        return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_SCAN_FAILED, alreadyCancelled: true });
      }
      if (settlement === 'unverifiable-run' || settlement === 'not-assist') {
        return NextResponse.json(
          { success: false, error: 'The active scan changed before cancellation could be committed.', code: 'scan_identity_changed' },
          { status: 409 },
        );
      }
      refunded = settlement === 'refunded';
    } else {
      // Batch assist is intentionally charged only when composition begins. A
      // cancel before that point has no wallet operation, but still requires an
      // exact absence-of-charge transition so it cannot race a new deduction.
      const transition = await db.collection(COLLECTIONS.PROJECTS).updateOne(
        {
          projectId,
          userId,
          editMode: 'assist',
          autoEditStatus: { $nin: [ASSIST_STATUS_SCAN_FAILED, ASSIST_STATUS_READY, 'complete'] },
          $and: [
            { $or: [{ assistCreditTransactionId: { $exists: false } }, { assistCreditTransactionId: null }] },
            { $or: [{ assistChargedCredits: { $exists: false } }, { assistChargedCredits: null }] },
          ],
        },
        {
          $set: {
            autoEditStatus: ASSIST_STATUS_SCAN_FAILED,
            autoEditError: 'Cancelled by user',
            updatedAt: new Date(),
          },
        },
      );
      if (transition.matchedCount === 0) {
        return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_SCAN_FAILED, alreadyCancelled: true });
      }
      console.log(`[DirectorMode] Cancelled without refund — no deduction had occurred (project ${projectId}).`);
    }

    // Stop the batch orchestration loop from ever composing this project
    // ('failed' is outside the compose-claim $in set).
    if (typeof project.sourceUploadBatchId === 'string' && project.sourceUploadBatchId) {
      await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).updateOne(
        { uploadBatchId: project.sourceUploadBatchId, userId, projectId },
        {
          $set: { orchestrationStatus: 'failed', orchestrationError: 'Cancelled by user', updatedAt: new Date() },
          $unset: { orchestrationLeaseUntil: '' },
        },
      );
    }

    return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_SCAN_FAILED, refunded });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DirectorMode] Cancel failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
