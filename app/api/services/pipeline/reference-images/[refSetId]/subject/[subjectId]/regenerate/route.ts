/**
 * POST /api/services/pipeline/reference-images/[refSetId]/subject/[subjectId]/regenerate
 *
 * Regenerate an existing subject's reference image with optional feedback.
 * Cost: 1 credit.
 *
 * Bundle 4 (2026-04-09): Changed from inline generation to QStash dispatch.
 * Same motivation as add-subject/route.ts — inline fal.ai calls hit Vercel
 * timeouts under load.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Client } from '@upstash/qstash';
import { getReferenceImageSet, updateSubjectReference } from '@/lib/pipeline/reference-image-db';
import { CreditsService } from '@/lib/services/creditsService';
import {
  createReferenceImageBatch,
  type ReferenceImageWorkerPayload,
} from '@/lib/pipeline/reference-image-queue';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ refSetId: string; subjectId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { refSetId, subjectId } = await params;
    const body = await req.json();
    const { feedback, artStyle, modelId } = body;

    const refSet = await getReferenceImageSet(refSetId, userId);
    if (!refSet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const subject = refSet.subjects.find((s) => s.subjectId === subjectId);
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    if ((subject as any).requiresBrandEvidence) {
      return NextResponse.json(
        { error: 'Brand-owned references require Brand Vault, website screenshot, or uploaded evidence and cannot be regenerated generically.' },
        { status: 409 },
      );
    }

    // Deduct 1 credit
    const deduct = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'reference_image_regen',
    );
    if (!deduct.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // Mark subject as generating immediately so UI shows progress
    await updateSubjectReference(refSetId, subjectId, {
      status: 'generating',
      referenceProvenance: 'generated',
      referenceProvenanceLabel: 'Generated',
      requiresBrandEvidence: false,
      brandEvidenceStatus: 'not-required',
    });

    // Create 1-item batch + dispatch worker
    const { batchId } = await createReferenceImageBatch(
      userId,
      refSetId,
      [{ subjectId, name: subject.name }],
      'regenerate',
    );

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const workerUrl = `${baseUrl}/api/internal/workers/pipeline/reference-image`;

    // Build subject payload with feedback appended to visualDescription.
    // Worker uses this as the LLM-refined prompt input.
    const subjectForWorker = {
      subjectId: subject.subjectId,
      name: subject.name,
      category: subject.category as 'character' | 'product' | 'location' | 'object' | 'vehicle',
      visualDescription: feedback
        ? `${subject.visualDescription}. User feedback: ${feedback}`
        : subject.visualDescription,
      scenesAppearingIn: subject.scenesAppearingIn,
      previousImageUrl: subject.imageUrl,
    };

    const payload: ReferenceImageWorkerPayload = {
      jobId: `${batchId}_${subjectId}`,
      batchId,
      userId,
      refSetId,
      subjectId,
      intent: 'regenerate',
      subject: subjectForWorker,
      artStyle,
      modelId,
      feedback,
    };

    const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';

    if (isDev || !process.env.QSTASH_TOKEN) {
      fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error(`[regenerate-ref] Dispatch failed for subject ${subjectId}:`, err.message);
      });
    } else {
      try {
        const qstashClient = new Client({
          token: process.env.QSTASH_TOKEN,
          baseUrl: process.env.QSTASH_URL || undefined,
        });
        await qstashClient.publishJSON({
          url: workerUrl,
          body: payload,
          retries: 2,
        });
      } catch (qstashErr: any) {
        console.error(`[regenerate-ref] QStash publish failed:`, qstashErr.message);
        try {
          await CreditsService.refundCredits(
            userId,
            1,
            `regenerate dispatch failed: ${qstashErr.message}`,
            { service: 'pipeline', action: 'reference_image_regen' },
          );
        } catch {}
        return NextResponse.json(
          {
            error: `Failed to enqueue subject regeneration: ${qstashErr.message}. Credits refunded.`,
          },
          { status: 503 },
        );
      }
    }

    console.log(`[regenerate-ref] Dispatched subject ${subjectId} (batch ${batchId})`);

    return NextResponse.json({
      success: true,
      async: true,
      batchId,
      subjectId,
      status: 'generating',
      referenceProvenance: 'generated',
      referenceProvenanceLabel: 'Generated',
      brandEvidenceStatus: 'not-required',
      pollUrl: `/api/services/pipeline/reference-images/${refSetId}/generate-status?batchId=${batchId}`,
    });
  } catch (error: any) {
    console.error('[regenerate-ref]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
