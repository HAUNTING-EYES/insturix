import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import {
  resolveReferenceVideoSource,
  type ReferenceVideoSource,
} from '@/lib/editron/reference-video/reference-video-source';
import * as db from '@/lib/thinkforge/services/db';
import { analyzeSelectedTrendSource, TrendSourceAnalysisError } from '@/lib/thinkforge/trends/trend-source-analysis';
import {
  buildAnalyzedSelectedTrend,
  buildFailedTrendAnalysis,
  type SelectedTrend,
  type TrendAnalysisSourceKind,
  type TrendSourceAnalysis,
} from '@/lib/thinkforge/trends/selected-trend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const MAX_QSTASH_RETRIES = 2;
const TrendAnalysisJobSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  candidateId: z.string().trim().min(1).max(240),
  jobId: z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/),
  userId: z.string().trim().min(1).max(240),
  orgId: z.string().trim().min(1).max(240).nullable().optional(),
  sourceKind: z.enum(['asset', 'remote-url']),
  referenceAssetId: z.string().trim().min(1).max(160).optional(),
  referenceVideoUrl: z.string().url().max(2_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.referenceAssetId) === Boolean(value.referenceVideoUrl)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide exactly one reference source.' });
  }
});

type CurrentQueuedTrend = SelectedTrend & {
  analysis: Extract<TrendSourceAnalysis, { status: 'queued' }>;
};

async function handler(request: NextRequest) {
  let job: z.infer<typeof TrendAnalysisJobSchema>;
  try {
    job = TrendAnalysisJobSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? 'Invalid trend analysis job.' : 'Invalid JSON.' }, { status: 400 });
  }

  const session = await db.getSession(job.sessionId, job.userId, job.orgId);
  if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  const selectedTrend = session.projectMeta?.selectedTrend;
  if (!isCurrentQueuedJob(selectedTrend, job.candidateId, job.jobId, job.sourceKind)) {
    return NextResponse.json({ status: 'skipped', reason: 'stale_or_cancelled_job' });
  }

  const fail = async (failureCode: 'source_rejected' | 'source_too_long' | 'analysis_generation_failed') => {
    const failedTrend = buildFailedTrendAnalysis(selectedTrend, {
      jobId: job.jobId,
      sourceKind: job.sourceKind,
      failureCode,
    });
    const projectMeta = await db.setSessionSelectedTrendAnalysis(
      session._id,
      job.candidateId,
      failedTrend,
      { expectedAnalysisJobId: job.jobId },
    );
    return NextResponse.json({
      status: projectMeta ? 'failed' : 'skipped',
      failureCode,
    });
  };

  try {
    const resolvedSource = await resolveReferenceVideoSource({
      userId: job.userId,
      referenceAssetId: job.referenceAssetId,
      referenceVideoUrl: job.referenceVideoUrl,
      assetResolver,
    });
    if (!resolvedSource.ok) {
      console.warn('[ThinkForge:TrendAnalysisWorker] Reference source rejected:', {
        reason: resolvedSource.reason,
        sourceKind: resolvedSource.sourceKind ?? job.sourceKind,
      });
      return fail('source_rejected');
    }

    const canonicalModule = await import('@/lib/editron/reference-video/canonicalize-reference');
    let canonical: Awaited<ReturnType<typeof canonicalModule.canonicalizeReferenceVideo>>;
    try {
      canonical = await canonicalModule.canonicalizeReferenceVideo({
        userId: job.userId,
        orgId: job.orgId ?? undefined,
        source: resolvedSource.source,
        audioUsageMode: 'preview-waveform-only',
      });
    } catch (error) {
      if (error instanceof canonicalModule.CanonicalizeReferenceError
        && ['source_too_small', 'source_demux_failed'].includes(error.code)) {
        return fail('source_rejected');
      }
      throw error;
    }
    if (!canonical.sourceRegistration) {
      throw new Error('Canonical trend reference registration receipt is missing.');
    }
    // Trend analysis may read a temporary playable URL, but persisted identity
    // and every provider input are now bound to the registered exact bytes.
    const canonicalSource: ReferenceVideoSource = {
      kind: 'asset',
      referenceId: canonical.referenceAssetId,
      videoUrl: canonical.videoUrl,
      durationSec: canonical.durationSec ?? resolvedSource.source.durationSec,
      sourceLabel: canonical.sourceLabel ?? resolvedSource.source.sourceLabel,
      sourceFingerprint: [
        'canonical',
        canonical.sourceRegistration.bytesSha256,
        canonical.sourceRegistration.receiptSha256,
      ].join('|'),
      asset: null,
    };

    const analysis = await analyzeSelectedTrendSource({
      selectedTrend,
      source: canonicalSource,
      userId: job.userId,
      sessionId: session._id,
      brandId: session.projectMeta?.brandId,
    });
    const completedTrend = buildAnalyzedSelectedTrend(selectedTrend, analysis);
    const projectMeta = await db.setSessionSelectedTrendAnalysis(
      session._id,
      job.candidateId,
      completedTrend,
      { expectedAnalysisJobId: job.jobId },
    );
    if (!projectMeta) {
      return NextResponse.json({ status: 'skipped', reason: 'selection_changed' });
    }
    return NextResponse.json({ status: 'completed', selectedTrend: completedTrend });
  } catch (error) {
    if (error instanceof TrendSourceAnalysisError && error.code === 'source_too_long') {
      return fail('source_too_long');
    }

    const retryCount = Number(request.headers.get('Upstash-Retry-Count') ?? '0');
    if (Number.isFinite(retryCount) && retryCount >= MAX_QSTASH_RETRIES) {
      return fail('analysis_generation_failed');
    }

    console.error('[ThinkForge:TrendAnalysisWorker] Analysis attempt failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Transient trend analysis failure.' }, { status: 500 });
  }
}

function isCurrentQueuedJob(
  selectedTrend: SelectedTrend | undefined,
  candidateId: string,
  jobId: string,
  sourceKind: TrendAnalysisSourceKind,
): selectedTrend is CurrentQueuedTrend {
  const analysis = selectedTrend?.analysis;
  return selectedTrend?.candidate.candidateId === candidateId
    && analysis?.status === 'queued'
    && analysis.jobId === jobId
    && analysis.request.sourceKind === sourceKind;
}

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);

async function secureHandler(request: NextRequest) {
  if (!isDev && !hasSigningKeys) {
    return NextResponse.json({ error: 'Worker not configured.' }, { status: 503 });
  }
  return handler(request);
}

export const POST = isDev ? handler : (hasSigningKeys ? verifySignatureAppRouter(handler) : secureHandler);
