/**
 * POST /api/internal/workers/pipeline/reference-image
 *
 * QStash worker that generates a SINGLE reference image for one subject.
 * Each subject gets its own 300s Vercel timeout.
 *
 * Bundle 4 (2026-04-09): architectural migration from inline
 * generateAllReferenceImages + 60s-capped routes (add-subject, subject regenerate)
 * to per-subject QStash workers.
 *
 * Handles 3 intents:
 *   - initial-generation: first-time gen for a subject in a new ref set
 *   - add-subject: new manual subject added to existing ref set
 *   - regenerate: regenerate existing subject with feedback
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { getDatabase } from '@/lib/editron/db/mongodb';
import {
  REFERENCE_IMAGE_JOBS_COLLECTION,
  updateReferenceImageBatchStatus,
  incrementReferenceImageBatchCompleted,
  incrementReferenceImageBatchFailed,
  type ReferenceImageWorkerPayload,
} from '@/lib/pipeline/reference-image-queue';
import { generateReferenceImage } from '@/lib/pipeline/reference-image-service';
import { updateSubjectReference } from '@/lib/pipeline/reference-image-db';
import type { SubjectReference } from '@/lib/pipeline/schemas/reference-image';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function handler(request: NextRequest) {
  const startMs = Date.now();
  console.log(`[ReferenceImageWorker] Received request from ${request.headers.get('user-agent')?.substring(0, 50) || 'unknown'}`);

  let payload: ReferenceImageWorkerPayload | undefined;
  try {
    payload = (await request.json()) as ReferenceImageWorkerPayload;
    const {
      jobId,
      batchId,
      userId,
      refSetId,
      subjectId,
      intent,
      subject,
      artStyle,
      modelId,
    } = payload;

    if (!jobId || !batchId || !userId || !refSetId || !subjectId || !subject) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields in worker payload' },
        { status: 400 },
      );
    }

    console.log(`[ReferenceImageWorker] Processing job ${jobId}: subject "${subject.name}" (${intent}), model=${modelId || 'default'}`);

    const db = await getDatabase();

    // Mark job as processing
    await db.collection(REFERENCE_IMAGE_JOBS_COLLECTION).updateOne(
      { _id: jobId } as any,
      {
        $set: { status: 'processing', startedAt: new Date() },
        $inc: { attempts: 1 },
      },
    );

    // Mark subject as 'generating' in ref set doc for UI visibility
    await updateSubjectReference(refSetId, subjectId, { status: 'generating' });

    // Build a proper SubjectReference for the generator
    const subjectInput: SubjectReference = {
      subjectId: subject.subjectId,
      name: subject.name,
      category: subject.category,
      visualDescription: subject.visualDescription,
      scenesAppearingIn: subject.scenesAppearingIn,
      status: 'generating',
      generationHistory: [],
    };

    // ─── Generate the reference image ───────────────────────────────
    // Reuses the existing generateReferenceImage helper. That function handles
    // LLM prompt refinement + model-specific input + fallback chain.
    const result = await generateReferenceImage(subjectInput, userId, {
      artStyle,
      modelId,
    });

    const historyEntry = {
      assetId: result.assetId,
      imageUrl: result.imageUrl,
      timestamp: new Date(),
      feedback: payload.feedback,
      intent,
    };

    // Read the current subject to append (not replace) history
    const currentSet = (await db
      .collection('referenceImages')
      .findOne({ refSetId, 'subjects.subjectId': subjectId })) as any;
    const currentSubject = currentSet?.subjects?.find((s: any) => s.subjectId === subjectId);
    const existingHistory = currentSubject?.generationHistory || [];

    // Persist image to subject
    await updateSubjectReference(refSetId, subjectId, {
      imageUrl: result.imageUrl,
      imageAssetId: result.assetId,
      imageGcsPath: result.gcsPath,
      status: 'generated',
      generationHistory: [...existingHistory, historyEntry as any],
    });

    console.log(`[ReferenceImageWorker] Subject "${subject.name}": image SUCCESS (${result.assetId}, ${((Date.now() - startMs) / 1000).toFixed(1)}s)`);

    // ─── Mark job as completed + update batch counter ──────────────
    await db.collection(REFERENCE_IMAGE_JOBS_COLLECTION).updateOne(
      { _id: jobId } as any,
      {
        $set: {
          status: 'completed',
          imageUrl: result.imageUrl,
          imageAssetId: result.assetId,
          completedAt: new Date(),
        },
      },
    );

    await incrementReferenceImageBatchCompleted(batchId);
    const updatedBatch = await updateReferenceImageBatchStatus(batchId);

    // Update ref set top-level status when batch finishes
    if (updatedBatch && updatedBatch.status !== 'processing') {
      let refSetStatus: 'generating' | 'ready' | 'partial' | 'error';
      if (updatedBatch.status === 'completed') refSetStatus = 'ready';
      else if (updatedBatch.status === 'partial') refSetStatus = 'partial';
      else refSetStatus = 'error';

      await db.collection('referenceImages').updateOne(
        { refSetId },
        { $set: { status: refSetStatus, updatedAt: new Date() } },
      );
      console.log(`[ReferenceImageWorker] RefSet ${refSetId} marked as '${refSetStatus}' (batch ${updatedBatch.status})`);
    }

    console.log(`[ReferenceImageWorker] Job ${jobId} DONE (${((Date.now() - startMs) / 1000).toFixed(1)}s)`);

    return NextResponse.json({
      success: true,
      jobId,
      subjectId,
      imageUrl: result.imageUrl,
    });
  } catch (error: any) {
    console.error(`[ReferenceImageWorker] Error:`, error.message);

    // Best-effort: mark job + batch as failed
    if (payload?.jobId && payload?.batchId) {
      try {
        const db = await getDatabase();
        await db.collection(REFERENCE_IMAGE_JOBS_COLLECTION).updateOne(
          { _id: payload.jobId } as any,
          {
            $set: {
              status: 'failed',
              error: error.message,
              completedAt: new Date(),
            },
          },
        );
        await incrementReferenceImageBatchFailed(payload.batchId);
        const updatedBatch = await updateReferenceImageBatchStatus(payload.batchId);

        // Mark subject as 'pending' (failed but retryable)
        if (payload.refSetId && payload.subjectId) {
          await updateSubjectReference(payload.refSetId, payload.subjectId, {
            status: 'pending',
          });
        }

        if (updatedBatch && updatedBatch.status !== 'processing') {
          let refSetStatus: 'generating' | 'ready' | 'partial' | 'error';
          if (updatedBatch.status === 'completed') refSetStatus = 'ready';
          else if (updatedBatch.status === 'partial') refSetStatus = 'partial';
          else refSetStatus = 'error';
          await db.collection('referenceImages').updateOne(
            { refSetId: payload.refSetId },
            { $set: { status: refSetStatus, updatedAt: new Date() } },
          );
        }
      } catch (markErr: any) {
        console.error(`[ReferenceImageWorker] Failed to mark job as failed: ${markErr.message}`);
      }
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = !!process.env.QSTASH_CURRENT_SIGNING_KEY && !!process.env.QSTASH_NEXT_SIGNING_KEY;

async function secureHandler(request: NextRequest) {
  if (!isDev && !hasSigningKeys) {
    console.error('[ReferenceImageWorker] SECURITY: QSTASH signing keys not set in production. Rejecting.');
    return NextResponse.json({ error: 'Worker not configured — missing signing keys' }, { status: 500 });
  }
  return handler(request);
}

export const POST = isDev ? handler : (hasSigningKeys ? verifySignatureAppRouter(handler) : secureHandler);
