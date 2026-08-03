import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import {
  queueChatDubbingJob,
  runChatDubbingJob,
} from '@/lib/editron/services/chat-dubbing-job';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface ChatDubbingWorkerPayload {
  jobId?: string;
  projectId?: string;
  userId?: string;
}

async function handleChatDubbingWorker(request: NextRequest) {
  const payload = await request.json().catch(() => ({})) as ChatDubbingWorkerPayload;
  if (!payload.jobId || !payload.projectId || !payload.userId) {
    return NextResponse.json({ success: false, error: 'Invalid chat dubbing worker payload.' }, { status: 400 });
  }

  const input = { jobId: payload.jobId, projectId: payload.projectId, userId: payload.userId };
  const result = await runChatDubbingJob(input);
  if (result.status === 'retrying') {
    const queued = await queueChatDubbingJob(input);
    if (queued.status === 'queued' || queued.status === 'already-queued' || queued.status === 'completed') {
      return NextResponse.json({ success: true, continuing: true, result, queued }, { status: 202 });
    }
    return NextResponse.json({ success: false, retryable: true, result, queued }, { status: 503 });
  }
  if (result.status === 'failed' || result.status === 'stale') {
    return NextResponse.json({ success: false, retryable: false, result }, { status: 422 });
  }
  if (result.status === 'skipped') {
    // The prior invocation was hard-killed (e.g., Vercel runtime timeout) and its lease is still
    // valid. Answering 200 here tells QStash the redelivery was handled and permanently strands the
    // job — answer 409 so QStash retries after the lease expires and the job resumes (2026-08-03).
    return NextResponse.json({ success: false, retryable: true, result }, { status: 409 });
  }
  return NextResponse.json({ success: true, result });
}

async function missingSigningKeys() {
  return NextResponse.json(
    { success: false, error: 'QStash signing keys are required for this internal worker.' },
    { status: 503 },
  );
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? verifySignatureAppRouter(handleChatDubbingWorker)
  : process.env.NODE_ENV === 'test'
    ? handleChatDubbingWorker
    : missingSigningKeys;
