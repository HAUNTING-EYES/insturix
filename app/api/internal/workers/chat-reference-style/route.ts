import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import {
  ChatReferenceStyleRetryableError,
  runChatReferenceStyleJob,
} from '@/lib/editron/services/chat-reference-style-job';

export const runtime = 'nodejs';
export const maxDuration = 800;

interface ChatReferenceStyleWorkerPayload {
  jobId?: string;
  projectId?: string;
  userId?: string;
}

async function handleChatReferenceStyleWorker(request: NextRequest) {
  const payload = await request.json().catch(() => ({})) as ChatReferenceStyleWorkerPayload;
  if (!payload.jobId || !payload.projectId || !payload.userId) {
    return nonRetryableResponse('Invalid reference-style worker payload');
  }

  try {
    const result = await runChatReferenceStyleJob({
      jobId: payload.jobId,
      projectId: payload.projectId,
      userId: payload.userId,
    });
    if (result.status === 'retrying') {
      return retryableResponse(result.reason ?? 'Reference-style job is not ready to run', result.retryAt);
    }
    if (result.status === 'failed') {
      return nonRetryableResponse(result.reason ?? 'Reference-style job failed', { result });
    }
    return NextResponse.json({ success: true, result }, {
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ChatReferenceStyleRetryableError) {
      return retryableResponse(message, error.retryAt.toISOString());
    }
    return NextResponse.json({ success: false, retryable: false, error: message }, { status: 500 });
  }
}

function retryableResponse(message: string, retryAt?: string) {
  const headers = new Headers();
  if (retryAt) {
    const date = new Date(retryAt);
    if (Number.isFinite(date.getTime())) headers.set('Retry-After', date.toUTCString());
  }
  return NextResponse.json(
    { success: false, retryable: true, error: message, ...(retryAt ? { retryAt } : {}) },
    { status: 503, headers },
  );
}

function nonRetryableResponse(message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { success: false, retryable: false, error: message, ...extra },
    {
      status: 489,
      headers: { 'Upstash-NonRetryable-Error': 'true' },
    },
  );
}

async function missingSigningKeys() {
  return NextResponse.json(
    { success: false, error: 'QStash signing keys are required for this internal worker' },
    { status: 503 },
  );
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? verifySignatureAppRouter(handleChatReferenceStyleWorker)
  : process.env.NODE_ENV === 'test'
    ? handleChatReferenceStyleWorker
    : missingSigningKeys;
