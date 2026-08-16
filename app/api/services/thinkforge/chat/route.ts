import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { processChat } from '@/lib/thinkforge/services/chat-service';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { retryOnceOnOverload } from '@/lib/thinkforge/services/retry-on-overload';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import { CreditsMigrationService } from '@/lib/services/creditsMigrationService';
import { getCreditCost } from '@/lib/config/creditCosts';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import * as db from '@/lib/thinkforge/services/db';
import {
  resolveThinkForgeAuthoringContext,
  type ThinkForgeResolvedAuthoringContext,
} from '@/lib/thinkforge/context';
import {
  resolveThinkForgeAuthoringProjectMetadata,
  ThinkForgeBrandAuthorityError,
} from '@/lib/thinkforge/context/brand-authoring-context';
import { resolveProjectMetaBrandId } from '@/lib/thinkforge/state/types';
import { getVersion as getWritingKnowledgeVersion } from '@/lib/thinkforge/data/writing-graph-query';
import { LEGACY_BLUEPRINT_RETIREMENT } from '@/lib/thinkforge/blueprints/legacy-blueprint-retirement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Structured writers routinely need longer than the platform's 60-second default.
// Keep this aligned with the stale-generation watchdog in generation/status.
export const maxDuration = 300;

function readIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function authoringContextErrorResponse(error: ThinkForgeBrandAuthorityError): NextResponse {
  const status = error.code === 'brand_not_found'
    ? 404
    : error.code === 'brand_profile_unavailable'
      ? 409
      : 503;
  return NextResponse.json({
    error: 'Brand context unavailable',
    code: error.code,
    message: error.message,
  }, { status });
}

/**
 * Unified chat endpoint
 * Handles both Q&A and script editing
 * Uses SSE format like Editron for consistent streaming
 */
export async function POST(req: Request) {
  const { userId, orgId, has } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let prompt: string | undefined;
  let sessionId: string | undefined;
  let selection: string | undefined;
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
    sessionId = readIdentifier(body?.sessionId);
    if (body?.selection) selection = String(body.selection);
    if (body?.project) project = body.project;
    if (body?.selectionBlocks) selectionBlocks = body.selectionBlocks;
    if (Array.isArray(body?.selectionBlockIds)) selectionBlockIds = body.selectionBlockIds.map((id: any) => String(id));
    if (body?.selectionRange) selectionRange = body.selectionRange;
    scriptId = readIdentifier(body?.scriptId);
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
  if (!scriptId) {
    return NextResponse.json({ error: 'Missing scriptId' }, { status: 400 });
  }
  if (blueprintArtifacts?.length) {
    return NextResponse.json(LEGACY_BLUEPRINT_RETIREMENT, { status: 410 });
  }

  let authorizedSession: Awaited<ReturnType<typeof db.getSession>>;
  try {
    authorizedSession = await db.getSession(sessionId, userId, orgId);
  } catch (error) {
    console.error('[ThinkForge Chat] Session authorization failed:', error);
    return NextResponse.json({ error: 'Failed to authorize session' }, { status: 500 });
  }
  if (!authorizedSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  const canonicalSessionId = authorizedSession._id;
  const isOrgAdmin = Boolean(orgId && has({ role: 'org:admin' }));
  const canonicalScript = await db.getScript(canonicalSessionId, scriptId);

  // Resolve the authoring truth before reserving a credit. An explicit brand can
  // never degrade into an unbranded generation when its accepted profile is gone.
  let authoringContext: ThinkForgeResolvedAuthoringContext | null = null;
  let requestedBrandId: string | undefined;
  try {
    const projectMeta = resolveThinkForgeAuthoringProjectMetadata(authorizedSession.projectMeta, project);
    requestedBrandId = resolveProjectMetaBrandId(projectMeta);
    authoringContext = await resolveThinkForgeAuthoringContext({
      userId,
      orgId: orgId ?? null,
      isOrgAdmin,
      sessionProjectMeta: authorizedSession.projectMeta,
      providedProject: project,
      projectId: canonicalSessionId,
      sessionId: canonicalSessionId,
      currentPrompt: prompt,
      currentScript: canonicalScript?.content || undefined,
      maxFacts: 5,
      interactionWindowDays: 30,
      writingKnowledgeVersion: getWritingKnowledgeVersion(),
    });
  } catch (error) {
    if (error instanceof ThinkForgeBrandAuthorityError) {
      return authoringContextErrorResponse(error);
    }

    if (requestedBrandId) {
      return NextResponse.json({
        error: 'Brand context unavailable',
        code: 'brand_context_unavailable',
        message: 'ThinkForge could not resolve the selected brand context. Please try again before generating.',
      }, { status: 503 });
    }
    console.warn('[ThinkForge Chat] Unbranded context retrieval failed; continuing without retrieved context:', error);
  }

  // Ensure user exists and is migrated
  await CreditsMigrationService.ensureMigrated(userId);

  // P3.1: the active context at WORK-START decides who pays. Resolve the billing wallet ONCE
  // from this request's org context + flag, then stamp it on the generation record below so
  // every later refund (settleGenerationRefund, headless) reads the stamp — never re-resolves.
  const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());

  // Check credits before processing
  // TODO: Add model detection from intentContext or processChat response
  const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', {
    taskId: canonicalSessionId,
  }, billingWallet);

  if (!creditCheck.allowed) {
    return creditCheck.errorResponse;
  }

  try {
    const deduction = await creditCheck.deduct();
    generationId = generationId || `gen_${crypto.randomUUID()}`;
    const now = new Date();
    generationAdmitted = await db.setActiveGeneration(canonicalSessionId, userId, {
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
        // P3.1 stamp: the wallet this charge was billed to. settleGenerationRefund reads it to
        // route the refund to the SAME wallet (D5) — even if the member left the org by then.
        billedWallet: billingWallet,
      },
    });
    if (!generationAdmitted) {
      throw new Error('This session is finishing another generation. Please retry in a moment.');
    }

    const stream = await retryOnceOnOverload(() => processChat({
      sessionId: canonicalSessionId,
      orgId,
      isOrgAdmin,
      prompt,
      selection,
      userId,
      script: canonicalScript,
      project,
      selectionBlocks,
      selectionBlockIds,
      selectionRange,
      scriptId,
      generationId,
      threadId,
      intentContext,
      silent,
      authoringContext,
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
        await db.updateGenerationState(canonicalSessionId, generationId, {
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
