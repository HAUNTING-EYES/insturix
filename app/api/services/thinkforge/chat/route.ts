import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { processChat } from '@/lib/thinkforge/services/chat-service';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { retryOnceOnOverload } from '@/lib/thinkforge/services/retry-on-overload';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import { CreditsMigrationService } from '@/lib/services/creditsMigrationService';
import { getCreditCost } from '@/lib/config/creditCosts';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Unified chat endpoint
 * Handles both Q&A and script editing
 * Uses SSE format like Editron for consistent streaming
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let prompt: string | undefined;
  let sessionId: string | undefined;
  let selection: string | undefined;
  let script: any | undefined;
  let project: any | undefined;
  let selectionBlocks: any[] | undefined;
  let selectionBlockIds: string[] | undefined;
  let selectionRange: { from: number; to: number } | undefined;
  let scriptId: string | undefined;
  let generationId: string | undefined;
  let threadId: string | undefined;
  let intentContext: any | undefined;
  let blueprintArtifacts: Array<{ type: string; label: string; description?: string; priority?: string }> | undefined;
  let silent: boolean | undefined;
  let generationAdmitted = false;

  try {
    const body = await req.json();
    prompt = (body?.prompt ?? '').toString();
    if (body?.sessionId) sessionId = String(body.sessionId);
    if (body?.selection) selection = String(body.selection);
    if (body?.script) script = body.script;
    if (body?.project) project = body.project;
    if (body?.selectionBlocks) selectionBlocks = body.selectionBlocks;
    if (Array.isArray(body?.selectionBlockIds)) selectionBlockIds = body.selectionBlockIds.map((id: any) => String(id));
    if (body?.selectionRange) selectionRange = body.selectionRange;
    if (body?.scriptId) scriptId = String(body.scriptId);
    if (body?.generationId) generationId = String(body.generationId);
    if (body?.threadId) threadId = String(body.threadId);
    if (body?.intentContext) intentContext = body.intentContext;
    if (Array.isArray(body?.blueprintArtifacts)) blueprintArtifacts = body.blueprintArtifacts;
    if (typeof body?.silent === 'boolean') silent = body.silent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  // STEP 6: Defensive validation - sessionId is required for chat
  if (!sessionId) {
    console.error('[ThinkForge Chat] Missing sessionId in request');
    return NextResponse.json({ error: 'Missing sessionId - session must be created first' }, { status: 400 });
  }

  // Ensure user exists and is migrated
  await CreditsMigrationService.ensureMigrated(userId);

  // Check credits before processing
  // TODO: Add model detection from intentContext or processChat response
  const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', {
    taskId: sessionId,
  });

  if (!creditCheck.allowed) {
    return creditCheck.errorResponse;
  }

  try {
    const deduction = await creditCheck.deduct();
    generationId = generationId || `gen_${crypto.randomUUID()}`;
    const now = new Date();
    generationAdmitted = await db.setActiveGeneration(sessionId, userId, {
      id: generationId,
      type: 'chat',
      status: 'running',
      intent: 'chat_request',
      progress: 0,
      message: 'Request accepted',
      startedAt: now,
      updatedAt: now,
      billing: {
        transactionId: deduction.transactionId,
        userId,
        amount: getCreditCost('thinkforge', 'chat_message'),
        service: 'thinkforge',
        action: 'chat_message',
        status: 'reserved',
        updatedAt: now,
      },
    });
    if (!generationAdmitted) {
      throw new Error('This session is finishing another generation. Please retry in a moment.');
    }

    const stream = await retryOnceOnOverload(() => processChat({
      sessionId,
      prompt,
      selection,
      userId,
      script,
      project,
      selectionBlocks,
      selectionBlockIds,
      selectionRange,
      scriptId,
      generationId,
      threadId,
      intentContext,
      blueprintArtifacts,
      silent,
    }));

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    console.error('Error in chat endpoint:', error);

    let lifecycleSettled = false;
    if (generationAdmitted && generationId) {
      try {
        await db.updateGenerationState(sessionId, generationId, {
          status: 'failed',
          message: error?.message || 'Chat processing failed',
        });
        lifecycleSettled = true;
      } catch (lifecycleError) {
        console.error('[ThinkForge Chat] Failed to settle generation lifecycle:', lifecycleError);
      }
    }
    if (!lifecycleSettled) {
      await creditCheck.refund(error?.message || 'Chat processing failed');
    }

    // Handle rate limit errors
    if (error.message?.includes('limit reached')) {
      return NextResponse.json(
        { error: error.message },
        { status: 429 }
      );
    }

    const normalized = toThinkForgeErrorResponse(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
