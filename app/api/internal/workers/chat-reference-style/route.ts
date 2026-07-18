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

export async function handleChatReferenceStyleWorker(request: NextRequest) {
  const payload = await request.json().catch(() => ({})) as ChatReferenceStyleWorkerPayload;
  if (!payload.jobId || !payload.projectId || !payload.userId) {
    return NextResponse.json({ success: false, error: 'Invalid reference-style worker payload' }, { status: 400 });
  }

  try {
    const result = await runChatReferenceStyleJob({
      jobId: payload.jobId,
      projectId: payload.projectId,
      userId: payload.userId,
    });
    return NextResponse.json({ success: result.status !== 'failed', result }, {
      status: result.status === 'failed' ? 422 : 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ChatReferenceStyleRetryableError) {
      return NextResponse.json({ success: false, retryable: true, error: message }, { status: 503 });
    }
    return NextResponse.json({ success: false, retryable: false, error: message }, { status: 500 });
  }
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
