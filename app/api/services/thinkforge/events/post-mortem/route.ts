import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PostMortemScopeError,
  resolvePostMortemScope,
} from '@/lib/thinkforge/agents/post-mortem-scope';
import {
  enqueuePostMortemJob,
  isPostMortemWorkerConfigured,
} from '@/lib/thinkforge/post-mortem/post-mortem-job';
import { safePostMortemJobErrorMessage } from '@/lib/thinkforge/post-mortem/post-mortem-job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PostMortemRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(256),
  projectTitle: z.string().trim().min(1).max(2_000).optional(),
}).strict();

export async function POST(req: Request) {
  if (process.env.POSTMORTEM_ENABLED !== 'true') {
    return NextResponse.json({ success: true, message: 'Post-Mortem disabled' });
  }

  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PostMortemRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid post-mortem request.' }, { status: 400 });
  }

  try {
    const scoped = await resolvePostMortemScope({ userId, orgId, ...parsed.data });
    if (!scoped) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!isPostMortemWorkerConfigured()) {
      return NextResponse.json({
        error: 'Post-mortem processing is temporarily unavailable.',
        code: 'post_mortem_worker_unavailable',
        retryable: true,
      }, { status: 503 });
    }

    const queued = await enqueuePostMortemJob(scoped.input);
    return NextResponse.json({
      success: true,
      accepted: true,
      jobId: queued.job.id,
      status: queued.job.status,
      statusUrl: `/api/services/thinkforge/events/post-mortem/${encodeURIComponent(queued.job.id)}`,
    }, { status: 202 });
  } catch (error: unknown) {
    if (error instanceof PostMortemScopeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[PostMortem] Queueing failed:', { error: safePostMortemJobErrorMessage(error) });
    return NextResponse.json({
      error: 'Post-mortem processing could not be queued.',
      code: 'post_mortem_queue_unavailable',
      retryable: true,
    }, { status: 503 });
  }
}
