import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import { createScriptAuthorAgent, type ScriptAuthorIntentInput } from '@/lib/thinkforge/agents/script-author-agent';
import type { AssembledContext } from '@/lib/thinkforge/agents/types';
import { ScriptIntent } from '@/lib/thinkforge/protocol/intent';
import { classifyIntent } from '@/lib/thinkforge/protocol/intent-classifier';
import { validateAgentResponse } from '@/lib/thinkforge/protocol/validation';
import { agentResponseToCommands } from '@/lib/thinkforge/mappers/diff-engine';
import { retryOnceOnOverload } from '@/lib/thinkforge/services/retry-on-overload';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;


/**
 * Edit specific blocks in a script with AI
 * POST /api/services/thinkforge/script/edit-blocks
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let instruction: string | undefined;
  let script: any | undefined;
  let sessionId: string | undefined;
  let scriptId: string | undefined;
  let selection: string | undefined;
  let indices: number[] | undefined;

  try {
    const body = await req.json();
    instruction = body?.instruction ? String(body.instruction) : undefined;
    script = body?.script;
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    scriptId = body?.scriptId ? String(body.scriptId) : undefined;
    selection = body?.selection ? String(body.selection) : undefined;
    indices = Array.isArray(body?.indices) ? body.indices : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!instruction) {
    return NextResponse.json({ error: 'Missing instruction' }, { status: 400 });
  }

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

    // Build context-aware instruction
    let enrichedInstruction = instruction;
    if (selection) {
      enrichedInstruction = `Edit the following selected text: "${selection}"\n\nInstruction: ${instruction}`;
    }
    if (indices && indices.length > 0) {
      enrichedInstruction += `\n\nFocus on blocks at indices: ${indices.join(', ')}`;
    }

    const intent = await classifyIntent({ userMessage: enrichedInstruction });
    if (intent === ScriptIntent.FORK) {
      return NextResponse.json({ error: 'Forking not implemented yet' }, { status: 501 });
    }

    const existingBlocks = Array.isArray(existingScript?.blocks) ? existingScript.blocks : [];
    if ((intent === ScriptIntent.EDIT || intent === ScriptIntent.CONTINUE) && existingBlocks.length === 0) {
      return NextResponse.json({ error: 'No existing script to edit or continue' }, { status: 400 });
    }

    const context: AssembledContext = {
      projectSummary: '',
      currentScript: undefined,
      chatHistory: undefined,
      recentChanges: undefined,
      selection: undefined,
    };

    const recentBlocks = intent === ScriptIntent.CONTINUE
      ? existingBlocks.slice(-3)
      : undefined;

    const agentInput: ScriptAuthorIntentInput = {
      intent,
      instruction: enrichedInstruction,
      userPrompt: enrichedInstruction,
      context,
      currentScript: intent === ScriptIntent.EDIT ? existingBlocks : undefined,
      recentBlocks,
    };

    const agent = createScriptAuthorAgent();
    const response = await retryOnceOnOverload(() => agent.writeStructuredResponse(agentInput));

    validateAgentResponse(response, { blocks: existingBlocks });

    if (sessionId) {
      const commands = agentResponseToCommands(response, {
        sessionId,
        scriptId: scriptId || 'default',
        baseVersion,
      });

      let currentVersion = baseVersion;
      for (const command of commands) {
        const result = await applyCommand({ ...command, baseVersion: currentVersion }, userId);
        if (!result.ok) {
          throw new Error(result.error);
        }
        currentVersion = typeof result.script.version === 'number' ? result.script.version : currentVersion + 1;
      }
    }

    const updated = sessionId ? await db.getScript(sessionId, scriptId || null) : null;

    return NextResponse.json({
      title: updated?.title || existingScript?.title,
      content: updated?.content || existingScript?.content || '',
      blocks: updated?.blocks || existingBlocks || [],
      metadata: {},
      replacements: []
    });
  } catch (error: any) {
    console.error('Error editing script blocks:', error);
    const normalized = toThinkForgeErrorResponse(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}

