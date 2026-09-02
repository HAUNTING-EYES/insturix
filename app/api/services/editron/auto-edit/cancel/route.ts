/**
 * POST /api/services/editron/auto-edit/cancel
 *
 * Director Mode (assist lane) ONLY: cancel a scan in flight.
 *
 *   scanning ──cancel──► scan_failed (terminal, refunded where deducted)
 *
 * Cancellation and charge registration are serialized by the project revision.
 * A confirmed cancellation blocks every assist ready_for_chat writer through
 * `scan_failed`; an unrelated project change returns conflict rather than false
 * success. From-asset deducts at intake (refund due), while from-batch deducts at
 * lay-down (cancelling before that means no wallet operation).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  ASSIST_STATUS_READY,
  ASSIST_STATUS_SCAN_FAILED,
  cancelUnchargedAssistScan,
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
        const latest = await db.collection(COLLECTIONS.PROJECTS).findOne(
          { projectId, userId },
          { projection: { autoEditStatus: 1 } },
        );
        if (latest?.autoEditStatus === ASSIST_STATUS_SCAN_FAILED) {
          return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_SCAN_FAILED, alreadyCancelled: true });
        }
        return NextResponse.json(
          { success: false, error: 'The project changed before cancellation could be committed.', code: 'project_revision_changed' },
          { status: 409 },
        );
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
      const cancellation = await cancelUnchargedAssistScan(db, {
        projectId,
        userId,
        reason: 'Cancelled by user',
      });
      if (cancellation === 'already-cancelled') {
        return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_SCAN_FAILED, alreadyCancelled: true });
      }
      if (cancellation === 'already-ready') {
        return NextResponse.json(
          { success: false, error: 'The scan already finished — the project is ready.', code: 'already_ready' },
          { status: 409 },
        );
      }
      if (cancellation === 'charge-present') {
        const latest = await db.collection(COLLECTIONS.PROJECTS).findOne(
          { projectId, userId },
          { projection: { assistCreditTransactionId: 1, autoEditStatus: 1 } },
        );
        const latestTransactionId = typeof latest?.assistCreditTransactionId === 'string'
          ? latest.assistCreditTransactionId.trim()
          : '';
        if (!latestTransactionId) {
          return NextResponse.json(
            { success: false, error: 'The scan accounting changed before cancellation could be committed.', code: 'scan_identity_changed' },
            { status: 409 },
          );
        }
        const settlement = await settleAssistScanFailure(db, {
          projectId,
          userId,
          reason: 'Director Mode scan cancelled — full refund',
          creditTransactionId: latestTransactionId,
        });
        if (settlement === 'transition-lost') {
          const postSettlement = await db.collection(COLLECTIONS.PROJECTS).findOne(
            { projectId, userId },
            { projection: { autoEditStatus: 1 } },
          );
          if (postSettlement?.autoEditStatus === ASSIST_STATUS_SCAN_FAILED) {
            return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_SCAN_FAILED, alreadyCancelled: true });
          }
          return NextResponse.json(
            { success: false, error: 'The project changed before cancellation could be committed.', code: 'project_revision_changed' },
            { status: 409 },
          );
        }
        if (settlement === 'unverifiable-run' || settlement === 'not-assist') {
          return NextResponse.json(
            { success: false, error: 'The active scan changed before cancellation could be committed.', code: 'scan_identity_changed' },
            { status: 409 },
          );
        }
        refunded = settlement === 'refunded';
      } else if (cancellation !== 'cancelled') {
        return NextResponse.json(
          { success: false, error: 'The project changed before cancellation could be committed.', code: 'project_revision_changed' },
          { status: 409 },
        );
      }
      if (cancellation === 'cancelled') {
        console.log(`[DirectorMode] Cancelled without refund — no deduction had occurred (project ${projectId}).`);
      }
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
