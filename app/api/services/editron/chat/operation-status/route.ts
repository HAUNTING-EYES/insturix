import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { buildChatEditCheckpointId } from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import type { ChatEditOperationStatusResponse } from '@/lib/editron/agent/chat-operation-recovery';
import { checkpointService } from '@/lib/editron/services/checkpoint-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPERATION_ID_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const projectId = boundedQueryValue(request.nextUrl.searchParams.get('projectId'), 200);
  const sessionId = boundedQueryValue(request.nextUrl.searchParams.get('sessionId'), 200);
  const operationId = boundedQueryValue(request.nextUrl.searchParams.get('operationId'), 128);
  if (!projectId || !sessionId || !operationId || !OPERATION_ID_PATTERN.test(operationId)) {
    return json({
      success: false,
      error: 'A valid projectId, sessionId, and operationId are required.',
      code: 'CHAT_EDIT_OPERATION_STATUS_INVALID',
    }, 400);
  }

  const beforeCheckpointId = buildChatEditCheckpointId({
    projectId,
    sessionId,
    operationId,
    userId,
  }, 'before');
  const checkpoint = await checkpointService.getCheckpoint(beforeCheckpointId, userId, projectId);
  if (!checkpoint) {
    return json({
      success: false,
      error: 'Chat edit operation was not found.',
      code: 'CHAT_EDIT_OPERATION_NOT_FOUND',
    }, 404);
  }
  if (
    checkpoint.projectId !== projectId
    || checkpoint.sessionId !== sessionId
    || checkpoint.operationId !== operationId
  ) {
    return json({
      success: false,
      error: 'Chat edit operation identity does not match.',
      code: 'CHAT_EDIT_OPERATION_IDENTITY_MISMATCH',
    }, 409);
  }
  if (!checkpoint.operationStatus) {
    return json({
      success: false,
      error: 'Chat edit operation status is unavailable.',
      code: 'CHAT_EDIT_OPERATION_STATUS_UNAVAILABLE',
    }, 409);
  }

  const response: ChatEditOperationStatusResponse = {
    success: true,
    operationId,
    projectId,
    sessionId,
    operationStatus: checkpoint.operationStatus,
    mutatingToolNames: checkpoint.mutatingToolNames ?? [],
    beforeCheckpointId,
    ...(checkpoint.afterCheckpointId
      ? { afterCheckpointId: checkpoint.afterCheckpointId }
      : {}),
  };
  return json(response, 200);
}

function boundedQueryValue(value: string | null, maxLength: number): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : '';
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
