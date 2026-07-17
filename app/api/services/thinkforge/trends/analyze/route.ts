import { randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateReferenceVideoUrlForAutoEditIntake } from '@/lib/editron/reference-video/reference-video-source';
import * as db from '@/lib/thinkforge/services/db';
import {
  buildFailedTrendAnalysis,
  buildQueuedTrendAnalysis,
} from '@/lib/thinkforge/trends/selected-trend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TrendAnalysisRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  referenceAssetId: z.string().trim().min(1).max(160).optional(),
  referenceVideoUrl: z.string().url().max(2_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.referenceAssetId && value.referenceVideoUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide either a reference asset or video URL, not both.' });
  }
});

export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  try {
    const input = TrendAnalysisRequestSchema.parse(body);
    if (!isTrendAnalysisWorkerConfigured()) {
      return NextResponse.json({ error: 'Trend analysis worker is not configured.' }, { status: 503 });
    }

    const session = await db.getSession(input.sessionId, userId, orgId);
    if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

    const selectedTrend = session.projectMeta?.selectedTrend;
    if (!selectedTrend) {
      return NextResponse.json({ error: 'Select a trend before requesting source analysis.' }, { status: 409 });
    }
    if (selectedTrend.analysis?.status === 'queued') {
      return NextResponse.json({ sessionId: session._id, selectedTrend, status: 'queued' }, { status: 202 });
    }

    const referenceVideoUrl = input.referenceVideoUrl ?? selectedTrend.candidate.evidence.find((item) => item.sourceUrl)?.sourceUrl;
    if (!input.referenceAssetId && !referenceVideoUrl) {
      return NextResponse.json({ error: 'Upload a reference video or provide a public direct video URL.' }, { status: 422 });
    }
    if (!input.referenceAssetId && referenceVideoUrl) {
      const validation = validateReferenceVideoUrlForAutoEditIntake(referenceVideoUrl);
      if (!validation.ok) {
        return NextResponse.json({
          error: validation.diagnostics[0] ?? 'Provide a supported YouTube or direct public video URL.',
        }, { status: 422 });
      }
    }

    const sourceKind = input.referenceAssetId ? 'asset' : 'remote-url';
    const jobId = `trend_analysis_${randomUUID().replace(/-/g, '')}`;
    const queuedTrend = buildQueuedTrendAnalysis(selectedTrend, { jobId, sourceKind });
    const projectMeta = await db.setSessionSelectedTrendAnalysis(
      session._id,
      selectedTrend.candidate.candidateId,
      queuedTrend,
      { requireNoQueuedAnalysis: true },
    );
    if (!projectMeta) {
      return NextResponse.json({ error: 'Trend analysis is already running. Refresh the session status.' }, { status: 409 });
    }

    try {
      const qstash = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL || undefined });
      const dispatch = await qstash.publishJSON({
        url: getTrendAnalysisWorkerUrl(),
        body: {
          sessionId: session._id,
          candidateId: selectedTrend.candidate.candidateId,
          jobId,
          userId,
          orgId: orgId ?? null,
          sourceKind,
          ...(input.referenceAssetId ? { referenceAssetId: input.referenceAssetId } : {}),
          ...(referenceVideoUrl ? { referenceVideoUrl } : {}),
        },
        retries: 2,
        deduplicationId: jobId,
      });

      return NextResponse.json({
        sessionId: session._id,
        selectedTrend: queuedTrend,
        status: 'queued',
        jobId,
        queueMessageId: dispatch.messageId,
      }, { status: 202 });
    } catch (error) {
      const failedTrend = buildFailedTrendAnalysis(queuedTrend, {
        jobId,
        sourceKind,
        failureCode: 'dispatch_failed',
      });
      await db.setSessionSelectedTrendAnalysis(
        session._id,
        selectedTrend.candidate.candidateId,
        failedTrend,
        { expectedAnalysisJobId: jobId },
      );
      console.error('[ThinkForge:TrendAnalysis] Queue dispatch failed:', error);
      return NextResponse.json({ error: 'Trend analysis could not be queued. Please try again.' }, { status: 503 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid trend analysis request.' }, { status: 400 });
    }
    console.error('[ThinkForge:TrendAnalysis] Queue request failed:', error);
    return NextResponse.json({ error: 'Trend analysis could not be started. Please try again.' }, { status: 500 });
  }
}

function isTrendAnalysisWorkerConfigured(): boolean {
  const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
  return Boolean(process.env.QSTASH_TOKEN) && (isDev || Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY));
}

function getTrendAnalysisWorkerUrl(): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/internal/workers/thinkforge/trend-analysis`;
}
