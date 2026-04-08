/**
 * POST /api/services/pipeline/reference-images/generate
 *
 * Generate reference images for extracted subjects.
 * Cost: 1 credit per subject.
 *
 * Bundle 4 (2026-04-09) ARCHITECTURE CHANGE:
 *   OLD: Inline generateAllReferenceImages() ran all subjects in one 120s route.
 *   NEW: Dispatches one QStash worker per subject. Returns batchId immediately.
 *        Frontend polls GET /reference-images/[refSetId]/generate-status.
 *
 * Each worker has its own 300s budget — no more timeout pressure even on
 * 10+ subjects with slow models.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Client } from '@upstash/qstash';
import { nanoid } from 'nanoid';
import { CreditsService } from '@/lib/services/creditsService';
import { saveReferenceImageSet } from '@/lib/pipeline/reference-image-db';
import {
  createReferenceImageBatch,
  type ReferenceImageWorkerPayload,
} from '@/lib/pipeline/reference-image-queue';
import type { ReferenceImageSet, SubjectReference } from '@/lib/pipeline/schemas/reference-image';
import type { ExtractedSubject } from '@/lib/pipeline/llm-scene-parser';

export const runtime = 'nodejs';
// Route only validates + dispatches. Should complete in <15s.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { subjects, artStyle, sourceScriptId, modelId } = (await req.json()) as {
      subjects: ExtractedSubject[];
      artStyle?: string;
      sourceScriptId?: string;
      modelId?: string;
    };

    if (!subjects?.length) {
      return NextResponse.json({ error: 'subjects array required' }, { status: 400 });
    }

    // ─── Atomic credit deduction ───────────────────────────────────
    // Bundle 4: changed from loop to single deduction with quantity flag.
    const costPerSubject = 1;
    const totalCost = subjects.length * costPerSubject;

    const preCheck = await CreditsService.getBalance(userId);
    if (!preCheck || preCheck.totalCredits < totalCost) {
      return NextResponse.json(
        { error: `Insufficient credits. Need ${totalCost}, have ${preCheck?.totalCredits || 0}` },
        { status: 402 },
      );
    }

    const deductResult = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'reference_image',
      { quantity: subjects.length },
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { error: `Credit deduction failed. Need ${totalCost} credits.` },
        { status: 402 },
      );
    }

    // ─── Create ref set shell ──────────────────────────────────────
    const refSetId = `refs_${nanoid(12)}`;
    const refSet: ReferenceImageSet = {
      refSetId,
      userId,
      sourceScriptId,
      subjects: subjects.map(
        (s): SubjectReference => ({
          subjectId: s.id,
          name: s.name,
          category: s.category,
          visualDescription: s.visualDescription,
          scenesAppearingIn: s.scenesAppearingIn,
          status: 'pending',
          generationHistory: [],
        }),
      ),
      status: 'generating',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await saveReferenceImageSet(refSet);

    // ─── Create batch + dispatch workers ───────────────────────────
    const { batchId } = await createReferenceImageBatch(
      userId,
      refSetId,
      subjects.map((s) => ({ subjectId: s.id, name: s.name })),
      'initial-generation',
    );

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const workerUrl = `${baseUrl}/api/internal/workers/pipeline/reference-image`;

    const buildPayload = (subject: ExtractedSubject): ReferenceImageWorkerPayload => ({
      jobId: `${batchId}_${subject.id}`,
      batchId,
      userId,
      refSetId,
      subjectId: subject.id,
      intent: 'initial-generation',
      subject: {
        subjectId: subject.id,
        name: subject.name,
        category: subject.category,
        visualDescription: subject.visualDescription,
        scenesAppearingIn: subject.scenesAppearingIn,
      },
      artStyle,
      modelId,
    });

    const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
    let enqueueErrors = 0;

    if (isDev || !process.env.QSTASH_TOKEN) {
      if (!isDev) console.warn('[reference-images/generate] QSTASH_TOKEN not set, using fetch fallback');
      for (const subject of subjects) {
        fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(subject)),
        }).catch((err) => {
          console.error(`[reference-images/generate] Dispatch failed for subject ${subject.id}:`, err.message);
        });
      }
    } else {
      const qstashClient = new Client({
        token: process.env.QSTASH_TOKEN,
        baseUrl: process.env.QSTASH_URL || undefined,
      });

      const qstashResults = await Promise.allSettled(
        subjects.map((subject) =>
          qstashClient.publishJSON({
            url: workerUrl,
            body: buildPayload(subject),
            retries: 2,
          }),
        ),
      );

      for (let i = 0; i < qstashResults.length; i++) {
        if (qstashResults[i].status === 'rejected') {
          enqueueErrors++;
          console.error(
            `[reference-images/generate] QStash publish failed for subject ${subjects[i].id}:`,
            (qstashResults[i] as PromiseRejectedResult).reason,
          );
        }
      }

      // Fail hard on any enqueue error + refund
      if (enqueueErrors > 0) {
        try {
          await CreditsService.refundCredits(
            userId,
            totalCost,
            `reference-image dispatch failed (${enqueueErrors}/${subjects.length} enqueue errors)`,
            { service: 'pipeline', action: 'reference_image' },
          );
        } catch (refundErr: any) {
          console.error(`[reference-images/generate] Credit refund failed: ${refundErr.message}`);
        }

        return NextResponse.json(
          {
            error: `Failed to enqueue ${enqueueErrors} of ${subjects.length} subjects. Credits refunded. Please retry.`,
          },
          { status: 503 },
        );
      }
    }

    console.log(`[reference-images/generate] Dispatched ${subjects.length} subjects (batch ${batchId})`);

    return NextResponse.json({
      success: true,
      refSetId,
      batchId,
      status: 'generating',
      subjects: refSet.subjects.map((s) => ({
        subjectId: s.subjectId,
        name: s.name,
        category: s.category,
        imageUrl: undefined,
        status: 'pending',
        scenesAppearingIn: s.scenesAppearingIn,
        visualDescription: s.visualDescription,
      })),
      async: true,
      pollUrl: `/api/services/pipeline/reference-images/${refSetId}/generate-status?batchId=${batchId}`,
    });
  } catch (error: any) {
    console.error('[reference-images/generate]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
