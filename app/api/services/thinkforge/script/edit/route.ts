import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import { generateScriptDraft } from '@/lib/thinkforge/agents/script-draft-agent';
import { reviseDocumentViaFlatWriter } from '@/lib/thinkforge/services/flat-writer-edit';
import type { SessionState } from '@/lib/thinkforge/state/types';
import { retryOnceOnOverload } from '@/lib/thinkforge/services/retry-on-overload';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import { checkCredits } from '@/lib/services/creditsMiddleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Edit script with AI
 * POST /api/services/thinkforge/script/edit
 */
export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let instruction: string | undefined;
  let script: any | undefined;
  let sessionId: string | undefined;
  let scriptId: string | undefined;

  try {
    const body = await req.json();
    instruction = body?.instruction ? String(body.instruction) : undefined;
    script = body?.script;
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    scriptId = body?.scriptId ? String(body.scriptId) : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!instruction) {
    return NextResponse.json({ error: 'Missing instruction' }, { status: 400 });
  }

  if (sessionId) {
    try {
      const session = await db.getSession(sessionId, userId, orgId);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      sessionId = session._id;
    } catch (error) {
      console.error('[ThinkForge:script/edit] Session authorization failed:', error);
      return NextResponse.json({ error: 'Failed to authorize session' }, { status: 500 });
    }
  }

  const creditCheck = await checkCredits(userId, 'thinkforge', 'document_creation', { taskId: sessionId });
  if (!creditCheck.allowed) return creditCheck.errorResponse;
  await creditCheck.deduct();

  try {
    // Get existing script if not provided
    let existingScript = script;
    let baseVersion = typeof script?.version === 'number' ? script.version : 0;
    if (!existingScript && sessionId) {
      const dbScript = await db.getScript(sessionId, scriptId || null);
      if (dbScript) {
        existingScript = {
          title: dbScript.title,
          content: dbScript.content,
          blocks: dbScript.blocks
        };
        baseVersion = dbScript.version ?? 0;
      }
    }

    const existingContent = typeof existingScript?.content === 'string' ? existingScript.content : '';
    const existingBlocks = Array.isArray(existingScript?.blocks) ? existingScript.blocks : [];

    // P5 PRIMARY: revise the whole document via the flat writer (eval-validated 4.89/5,
    // scripts/prompt-optimization/eval-thinkforge-edit.ts). Only for a real edit of an existing
    // doc; ANY failure falls through to the legacy generateScriptDraft path below (unchanged).
    if (sessionId && existingContent.trim().length > 0 && existingBlocks.length > 0) {
      try {
        const revised = await reviseDocumentViaFlatWriter({
          userId, orgId, sessionId, scriptId, existingScript, existingContent, instruction, baseVersion,
        });
        return NextResponse.json({
          title: revised.title,
          content: revised.content,
          blocks: revised.blocks,
          metadata: { editMode: 'flat-writer' },
        });
      } catch (flatErr) {
        console.error('[ThinkForge:script/edit] flat-writer path failed; falling back to generateScriptDraft:', flatErr);
      }
    }

    const currentScript = existingScript ? {
      title: existingScript.title || 'Untitled Script',
      blocks: existingScript.blocks || [],
      content: existingScript.content || '',
      draft: false,
      version: 1
    } : null;

    // Build minimal session state
    const sessionState: SessionState = {
      sessionId: sessionId || `temp_${Date.now()}`,
      userId: userId,
      metadata: {},
      chat: [],
      script: currentScript,
      documents: currentScript ? [currentScript] : [],
      ideas: [],
      version: 1,
      lastUpdated: new Date()
    };

    // Generate edited script
    const result = await retryOnceOnOverload(() => generateScriptDraft(instruction, sessionState, existingScript));

    // Save to database if sessionId provided
    if (sessionId && result) {
      await applyCommand({
        type: 'ReplaceDocument',
        sessionId,
        baseVersion,
        source: 'ai',
        payload: {
          scriptId,
          title: result.title || existingScript?.title || 'Untitled Script',
          content: result.content || '',
          blocks: result.blocks || []
        }
      }, userId, orgId);
    }

    return NextResponse.json({
      title: result?.title,
      content: result?.content,
      blocks: result?.blocks || [],
      metadata: {}
    });
  } catch (error: any) {
    console.error('Error editing script:', error);
    await creditCheck.refund(error?.message || 'Script edit failed');
    const normalized = toThinkForgeErrorResponse(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}

