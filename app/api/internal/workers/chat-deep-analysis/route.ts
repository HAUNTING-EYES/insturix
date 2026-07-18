import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import { runChatDeepAnalysisJob } from '@/lib/editron/services/chat-deep-analysis-job';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface ChatDeepAnalysisWorkerPayload {
  jobId?: string;
  projectId?: string;
  userId?: string;
}

async function handleChatDeepAnalysisWorker(request: NextRequest) {
  const payload = await request.json().catch(() => ({})) as ChatDeepAnalysisWorkerPayload;
  if (!payload.jobId || !payload.projectId || !payload.userId) {
    return NextResponse.json({ success: false, error: 'Invalid chat deep-analysis worker payload.' }, { status: 400 });
  }

  const result = await runChatDeepAnalysisJob({
    jobId: payload.jobId,
    projectId: payload.projectId,
    userId: payload.userId,
  });
  if (result.status === 'retrying') {
    return NextResponse.json({ success: false, retryable: true, result }, { status: 503 });
  }
  if (result.status === 'failed' || result.status === 'stale') {
    return NextResponse.json({ success: false, retryable: false, result }, { status: 422 });
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
  ? verifySignatureAppRouter(handleChatDeepAnalysisWorker)
  : process.env.NODE_ENV === 'test'
    ? handleChatDeepAnalysisWorker
    : missingSigningKeys;
