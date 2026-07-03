/**
 * POST /api/services/pipeline/reference-images/generate
 *
 * Generate reference images for extracted subjects.
 * Cost: 1 credit per generated subject. Brand-backed references do not burn generation credits.
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
import { resolveEffectiveBrandWithProfile } from '@/lib/shared/brand-effective-resolver';
import { isBrandSignalActionable, type BrandSignalProfile } from '@/lib/shared/brand-signal-profile';

export const runtime = 'nodejs';
// Route only validates + dispatches. Should complete in <15s.
export const maxDuration = 60;
type ReferenceProvenance = 'brand-vault' | 'generated' | 'missing-brand-evidence';
type BrandEvidenceStatus = 'resolved' | 'missing' | 'not-required';

type ProvenancedSubjectReference = SubjectReference & {
  referenceProvenance?: ReferenceProvenance;
  referenceProvenanceLabel?: string;
  requiresBrandEvidence?: boolean;
  brandEvidenceStatus?: BrandEvidenceStatus;
  evidenceRequiredReason?: string;
};

const MAX_BRAND_REFERENCE_IMAGES = 4;
const BRAND_EVIDENCE_REQUIRED_REASON =
  'Brand-owned product/platform references require Brand Vault, website screenshot, or uploaded evidence before storyboard generation.';

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isBrandOwnedSubject(subject: ExtractedSubject): boolean {
  return subject.category === 'product';
}

function brandProductReferenceImages(
  profile: BrandSignalProfile | null | undefined,
  max = MAX_BRAND_REFERENCE_IMAGES,
): string[] {
  const signal = profile?.assets?.productImages;
  if (!signal || !isBrandSignalActionable(signal)) return [];
  const urls = Array.isArray(signal.value) ? signal.value : [];
  return urls
    .filter((url): url is string => typeof url === 'string' && /^https?:\/\/\S+/i.test(url.trim()))
    .map((url) => url.trim())
    .slice(0, Math.max(0, max));
}

async function resolveBrandProductImages(userId: string, brandId: string | undefined): Promise<string[]> {
  if (!brandId) return [];

  try {
    const { acceptedProfile } = await resolveEffectiveBrandWithProfile(userId, brandId, {
      service: 'editron',
      strict: true,
    });
    return brandProductReferenceImages(acceptedProfile);
  } catch (err) {
    console.error('[reference-images/generate] Brand Vault evidence resolution failed', err);
    return [];
  }
}

function serializeSubject(subject: ProvenancedSubjectReference) {
  return {
    subjectId: subject.subjectId,
    name: subject.name,
    category: subject.category,
    imageUrl: subject.imageUrl,
    status: subject.status,
    scenesAppearingIn: subject.scenesAppearingIn,
    visualDescription: subject.visualDescription,
    referenceProvenance: subject.referenceProvenance,
    referenceProvenanceLabel: subject.referenceProvenanceLabel,
    requiresBrandEvidence: subject.requiresBrandEvidence,
    brandEvidenceStatus: subject.brandEvidenceStatus,
    evidenceRequiredReason: subject.evidenceRequiredReason,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { subjects, artStyle, sourceScriptId, modelId, brandId } = (await req.json()) as {
      subjects: ExtractedSubject[];
      artStyle?: string;
      sourceScriptId?: string;
      modelId?: string;
      brandId?: string;
    };

    if (!subjects?.length) {
      return NextResponse.json({ error: 'subjects array required' }, { status: 400 });
    }

    const normalizedBrandId = nonEmptyString(brandId);
    const brandImages = await resolveBrandProductImages(userId, normalizedBrandId);
    let nextBrandImageIndex = 0;

    const refSubjects: ProvenancedSubjectReference[] = subjects.map((s) => {
      const requiresBrandEvidence = Boolean(normalizedBrandId && isBrandOwnedSubject(s));
      const brandImageUrl = requiresBrandEvidence ? brandImages[nextBrandImageIndex++] : undefined;

      if (requiresBrandEvidence && brandImageUrl) {
        return {
          subjectId: s.id,
          name: s.name,
          category: s.category,
          visualDescription: s.visualDescription,
          scenesAppearingIn: s.scenesAppearingIn,
          imageUrl: brandImageUrl,
          status: 'generated',
          generationHistory: [],
          referenceProvenance: 'brand-vault',
          referenceProvenanceLabel: 'Brand Vault',
          requiresBrandEvidence: true,
          brandEvidenceStatus: 'resolved',
        };
      }

      if (requiresBrandEvidence) {
        return {
          subjectId: s.id,
          name: s.name,
          category: s.category,
          visualDescription: s.visualDescription,
          scenesAppearingIn: s.scenesAppearingIn,
          status: 'pending',
          generationHistory: [],
          referenceProvenance: 'missing-brand-evidence',
          referenceProvenanceLabel: 'Evidence required',
          requiresBrandEvidence: true,
          brandEvidenceStatus: 'missing',
          evidenceRequiredReason: BRAND_EVIDENCE_REQUIRED_REASON,
        };
      }

      return {
        subjectId: s.id,
        name: s.name,
        category: s.category,
        visualDescription: s.visualDescription,
        scenesAppearingIn: s.scenesAppearingIn,
        status: 'pending',
        generationHistory: [],
        referenceProvenance: 'generated',
        referenceProvenanceLabel: 'Generated',
        requiresBrandEvidence: false,
        brandEvidenceStatus: 'not-required',
      };
    });

    const refBySubjectId = new Map(refSubjects.map((subject) => [subject.subjectId, subject]));
    const subjectsNeedingGeneration = subjects.filter((subject) => {
      const refSubject = refBySubjectId.get(subject.id);
      return !refSubject?.requiresBrandEvidence && !refSubject?.imageUrl;
    });
    const missingBrandEvidenceCount = refSubjects.filter((subject) => subject.brandEvidenceStatus === 'missing').length;

    // Atomic credit deduction. Only subjects that actually go through image generation burn credits.
    const costPerSubject = 1;
    const totalCost = subjectsNeedingGeneration.length * costPerSubject;

    if (totalCost > 0) {
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
        { quantity: subjectsNeedingGeneration.length },
      );
      if (!deductResult.success) {
        return NextResponse.json(
          { error: `Credit deduction failed. Need ${totalCost} credits.` },
          { status: 402 },
        );
      }
    }

    const refSetId = `refs_${nanoid(12)}`;
    const refSet: ReferenceImageSet = {
      refSetId,
      userId,
      sourceScriptId,
      subjects: refSubjects,
      status: subjectsNeedingGeneration.length > 0
        ? 'generating'
        : missingBrandEvidenceCount > 0
          ? 'partial'
          : 'ready',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await saveReferenceImageSet(refSet);

    if (subjectsNeedingGeneration.length === 0) {
      return NextResponse.json({
        success: true,
        refSetId,
        status: refSet.status,
        subjects: refSubjects.map(serializeSubject),
        async: false,
        brandReferenceWarnings: missingBrandEvidenceCount > 0
          ? refSubjects
              .filter((subject) => subject.brandEvidenceStatus === 'missing')
              .map((subject) => `Brand evidence required for ${subject.name}`)
          : [],
      });
    }

    // ─── Create batch + dispatch workers ───────────────────────────
    const { batchId } = await createReferenceImageBatch(
      userId,
      refSetId,
      subjectsNeedingGeneration.map((s) => ({ subjectId: s.id, name: s.name })),
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
      for (const subject of subjectsNeedingGeneration) {
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
        subjectsNeedingGeneration.map((subject) =>
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
            `[reference-images/generate] QStash publish failed for subject ${subjectsNeedingGeneration[i].id}:`,
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
            `reference-image dispatch failed (${enqueueErrors}/${subjectsNeedingGeneration.length} enqueue errors)`,
            { service: 'pipeline', action: 'reference_image' },
          );
        } catch (refundErr: any) {
          console.error(`[reference-images/generate] Credit refund failed: ${refundErr.message}`);
        }

        return NextResponse.json(
          {
            error: `Failed to enqueue ${enqueueErrors} of ${subjectsNeedingGeneration.length} subjects. Credits refunded. Please retry.`,
          },
          { status: 503 },
        );
      }
    }

    console.log(`[reference-images/generate] Dispatched ${subjectsNeedingGeneration.length} subjects (batch ${batchId})`);

    return NextResponse.json({
      success: true,
      refSetId,
      batchId,
      status: 'generating',
      subjects: refSubjects.map(serializeSubject),
      async: true,
      pollUrl: `/api/services/pipeline/reference-images/${refSetId}/generate-status?batchId=${batchId}`,
      brandReferenceWarnings: missingBrandEvidenceCount > 0
        ? refSubjects
            .filter((subject) => subject.brandEvidenceStatus === 'missing')
            .map((subject) => `Brand evidence required for ${subject.name}`)
        : [],
    });
  } catch (error: any) {
    console.error('[reference-images/generate]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
