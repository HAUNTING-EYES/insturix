import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  postMortemJobStore,
  safePostMortemJobErrorMessage,
} from '@/lib/thinkforge/post-mortem/post-mortem-job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

const JobIdSchema = z.string().trim().min(1).max(160).regex(/^postmortem_[a-f0-9]+$/);

export async function GET(_request: Request, { params }: RouteParams) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsedJobId = JobIdSchema.safeParse((await params).jobId);
  if (!parsedJobId.success) return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });

  try {
    const job = await postMortemJobStore.getAuthorized(parsedJobId.data, userId, orgId ?? null);
    if (!job) return NextResponse.json({ error: 'Post-mortem job not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      deletionPending: job.input.deleteSessionOnCompletion && job.status !== 'completed',
      error: job.error,
      result: job.result,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[PostMortemStatus] Read failed:', { error: safePostMortemJobErrorMessage(error) });
    return NextResponse.json({ error: 'Post-mortem status is unavailable.' }, { status: 503 });
  }
}
