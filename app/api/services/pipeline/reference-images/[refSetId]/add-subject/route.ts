/**
 * POST /api/services/pipeline/reference-images/[refSetId]/add-subject
 *
 * Add a new custom subject to an existing reference set. Generic subjects
 * queue image generation and cost 1 credit. Brand-backed references reuse
 * evidence or stop with a typed missing-evidence state without burning credits.
 *
 * Bundle 4 (2026-04-09): Changed from inline generation to QStash dispatch.
 * Previously this route called generateReferenceImage() inline and hit
 * 504s on 60s-capped runs even after I bumped to 300s. The proper fix is
 * the same as /storyboard/generate: dispatch to the async worker and
 * return immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Client } from '@upstash/qstash';
import { nanoid } from 'nanoid';
import {
  getReferenceImageSet,
  addSubjectToRefSet,
} from '@/lib/pipeline/reference-image-db';
import { CreditsService } from '@/lib/services/creditsService';
import type { SubjectReference } from '@/lib/pipeline/schemas/reference-image';
import {
  createReferenceImageBatch,
  type ReferenceImageWorkerPayload,
} from '@/lib/pipeline/reference-image-queue';
import {
  BRAND_EVIDENCE_REQUIRED_REASON,
  brandReferenceEvidenceForSubject,
  cleanOptionalString,
  resolveBrandReferenceContext,
  requiresBrandReferenceEvidence,
} from '@/lib/pipeline/reference-brand-evidence';

export const runtime = 'nodejs';
// Route only validates + dispatches now. <15s.
export const maxDuration = 60;

const validCategories = ['character', 'product', 'location', 'object', 'vehicle'] as const;
type ValidCategory = typeof validCategories[number];

function serializeSubject(subject: SubjectReference) {
  return {
    subjectId: subject.subjectId,
    name: subject.name,
    category: subject.category,
    visualDescription: subject.visualDescription,
    scenesAppearingIn: subject.scenesAppearingIn,
    imageUrl: subject.imageUrl,
    imageAssetId: subject.imageAssetId,
    status: subject.status,
    referenceProvenance: subject.referenceProvenance,
    referenceProvenanceLabel: subject.referenceProvenanceLabel,
    requiresBrandEvidence: subject.requiresBrandEvidence,
    brandEvidenceStatus: subject.brandEvidenceStatus,
    evidenceRequiredReason: subject.evidenceRequiredReason,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ refSetId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { refSetId } = await params;
    const body = await req.json();
    const { name, category, visualDescription, scenesAppearingIn, artStyle, modelId, brandId } = body;
    const subjectName = cleanOptionalString(name);
    const subjectDescription = cleanOptionalString(visualDescription);

    if (!subjectName || !subjectDescription) {
      return NextResponse.json(
        { error: 'name and visualDescription are required' },
        { status: 400 },
      );
    }

    const refSet = await getReferenceImageSet(refSetId, userId);
    if (!refSet) return NextResponse.json({ error: 'Reference set not found' }, { status: 404 });

    const subjectId = `sub_${nanoid(10)}`;
    const resolvedCategory: ValidCategory = validCategories.includes(category)
      ? category
      : 'object';
    const normalizedBrandId = cleanOptionalString(brandId) ?? cleanOptionalString(refSet.brandId);
    const normalizedScenes = Array.isArray(scenesAppearingIn) ? scenesAppearingIn : [];
    const brandContext = await resolveBrandReferenceContext(userId, normalizedBrandId, {
      logScope: 'reference-images/add-subject',
    });
    const subjectForBrandEvidence = {
      name: subjectName,
      category: resolvedCategory,
      visualDescription: subjectDescription,
    };
    const requiresBrandEvidence = requiresBrandReferenceEvidence(subjectForBrandEvidence, brandContext);
    const evidence = requiresBrandEvidence
      ? brandReferenceEvidenceForSubject(subjectForBrandEvidence, brandContext.evidence)[0]
      : undefined;

    if (requiresBrandEvidence) {
      const newSubject: SubjectReference = evidence
        ? {
            subjectId,
            name: subjectName,
            category: resolvedCategory,
            visualDescription: subjectDescription,
            scenesAppearingIn: normalizedScenes,
            imageUrl: evidence.imageUrl,
            source: evidence.source,
            status: 'generated',
            generationHistory: [],
            referenceProvenance: evidence.referenceProvenance,
            referenceProvenanceLabel: evidence.referenceProvenanceLabel,
            requiresBrandEvidence: true,
            brandEvidenceStatus: 'resolved',
          }
        : {
            subjectId,
            name: subjectName,
            category: resolvedCategory,
            visualDescription: subjectDescription,
            scenesAppearingIn: normalizedScenes,
            status: 'pending',
            generationHistory: [],
            referenceProvenance: 'missing-brand-evidence',
            referenceProvenanceLabel: 'Evidence required',
            requiresBrandEvidence: true,
            brandEvidenceStatus: 'missing',
            evidenceRequiredReason: BRAND_EVIDENCE_REQUIRED_REASON,
          };

      await addSubjectToRefSet(refSetId, newSubject);

      return NextResponse.json({
        success: true,
        async: false,
        subject: serializeSubject(newSubject),
        brandReferenceWarnings: evidence ? [] : [`Brand evidence required for ${newSubject.name}`],
      });
    }

    // Deduct 1 credit only for subjects that actually queue image generation.
    const deduct = await CreditsService.deductCredits(userId, 'pipeline', 'reference_image');
    if (!deduct.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const newSubject: SubjectReference = {
      subjectId,
      name: subjectName,
      category: resolvedCategory,
      visualDescription: subjectDescription,
      scenesAppearingIn: normalizedScenes,
      status: 'pending',
      generationHistory: [],
      referenceProvenance: 'generated',
      referenceProvenanceLabel: 'Generated',
      requiresBrandEvidence: false,
      brandEvidenceStatus: 'not-required',
    };

    // Persist to DB so frontend can poll it immediately.
    await addSubjectToRefSet(refSetId, newSubject);

    // Create 1-item batch + dispatch worker.
    const { batchId } = await createReferenceImageBatch(
      userId,
      refSetId,
      [{ subjectId, name: newSubject.name }],
      'add-subject',
    );

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const workerUrl = `${baseUrl}/api/internal/workers/pipeline/reference-image`;

    const payload: ReferenceImageWorkerPayload = {
      jobId: `${batchId}_${subjectId}`,
      batchId,
      userId,
      refSetId,
      subjectId,
      intent: 'add-subject',
      subject: {
        subjectId,
        name: newSubject.name,
        category: resolvedCategory,
        visualDescription: newSubject.visualDescription,
        scenesAppearingIn: newSubject.scenesAppearingIn,
      },
      artStyle,
      modelId,
    };

    const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';

    if (isDev || !process.env.QSTASH_TOKEN) {
      fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error(`[add-subject] Dispatch failed for subject ${subjectId}:`, err.message);
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
        console.error(`[add-subject] QStash publish failed:`, qstashErr.message);
        // Refund + fail.
        try {
          await CreditsService.refundCredits(
            userId,
            1,
            `add-subject dispatch failed: ${qstashErr.message}`,
            { service: 'pipeline', action: 'reference_image' },
          );
        } catch {}
        return NextResponse.json(
          { error: `Failed to enqueue subject generation: ${qstashErr.message}. Credits refunded.` },
          { status: 503 },
        );
      }
    }

    console.log(`[add-subject] Dispatched subject ${subjectId} (batch ${batchId})`);

    return NextResponse.json({
      success: true,
      async: true,
      batchId,
      subject: serializeSubject(newSubject),
      pollUrl: `/api/services/pipeline/reference-images/${refSetId}/generate-status?batchId=${batchId}`,
    });
  } catch (error: any) {
    console.error('[add-subject]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
