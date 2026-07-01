import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import { createScriptAuthorAgent, type ScriptAuthorIntentInput } from '@/lib/thinkforge/agents/script-author-agent';
import { ScriptWriterAgent, type ScriptWriterInput } from '@/lib/thinkforge/agents/script-writer-agent';
import { PostWriterAgent, type PostWriterInput } from '@/lib/thinkforge/agents/post-writer-agent';
import { parseMarkdownToBlocks } from '@/lib/thinkforge/normalization/markdown-parser';
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

    const existingContent = typeof existingScript?.content === 'string' ? existingScript.content : '';
    const existingBlocksForEdit = Array.isArray(existingScript?.blocks) ? existingScript.blocks : [];

    // P5 PRIMARY: revise the whole document via the flat writer (eval-validated 4.89/5 in
    // scripts/prompt-optimization/eval-thinkforge-edit.ts). Only for a real edit of an existing
    // doc; ANY failure falls straight through to the legacy ScriptAuthor block-command path below,
    // which is left completely unchanged.
    if (sessionId && existingContent.trim().length > 0 && existingBlocksForEdit.length > 0) {
      try {
        const flat = await editViaFlatWriter({
          userId, sessionId, scriptId, existingScript, existingContent, enrichedInstruction, selection, baseVersion,
        });
        return NextResponse.json(flat);
      } catch (flatErr) {
        console.error('[ThinkForge:edit-blocks] flat-writer path failed; falling back to legacy author:', flatErr);
      }
    }

    const intent = await classifyIntent({ userMessage: enrichedInstruction });
    // FORK is mapped to REWRITE inside classifyIntent (no separate-document path yet), so it no
    // longer dead-ends here — a fork-style request now does a useful in-place new version.

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

/**
 * P5 flat-writer edit path: revise the WHOLE document via the flat writer's editContext mode,
 * parse the revised markdown back into blocks, and save via ReplaceDocument. Throws on any
 * empty/invalid output or save failure so the caller falls back to the legacy author agent.
 */
async function editViaFlatWriter(args: {
  userId: string;
  sessionId: string;
  scriptId?: string;
  existingScript: any;
  existingContent: string;
  enrichedInstruction: string;
  selection?: string;
  baseVersion: number;
}) {
  const { userId, sessionId, scriptId, existingScript, existingContent, enrichedInstruction, selection, baseVersion } = args;

  const isScript = existingScript?.documentType === 'video_script'
    || /^\s*#{1,3}\s+Scene\s+\d+/im.test(existingContent);

  const baseInput = {
    context: { projectSummary: existingScript?.title ? `Editing document: ${existingScript.title}` : '' },
    userPrompt: enrichedInstruction,
    editContext: { existingContent, instruction: enrichedInstruction, selection },
  };

  const { result } = isScript
    ? await new ScriptWriterAgent().runStructured(baseInput as unknown as ScriptWriterInput)
    : await new PostWriterAgent().runStructured(baseInput as unknown as PostWriterInput);

  const revised = (result as { content?: string }).content ?? '';
  if (revised.trim().length < 30) {
    throw new Error('flat-writer edit returned empty/too-short content');
  }

  const blocks = parseMarkdownToBlocks(revised);
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('flat-writer edit produced no parseable blocks');
  }

  const saveResult = await applyCommand({
    type: 'ReplaceDocument',
    sessionId,
    baseVersion,
    source: 'ai',
    payload: {
      scriptId: scriptId || 'default',
      title: existingScript?.title || (isScript ? 'Script' : 'Post'),
      content: revised,
      blocks,
      ...(isScript ? { documentType: 'video_script' } : {}),
    },
  } as Parameters<typeof applyCommand>[0], userId);

  if (!saveResult.ok) {
    throw new Error(saveResult.error || 'failed to save revised document');
  }

  const updated = await db.getScript(sessionId, scriptId || null);
  return {
    title: updated?.title || existingScript?.title,
    content: updated?.content || revised,
    blocks: updated?.blocks || blocks,
    metadata: { editMode: 'flat-writer' },
    replacements: [],
  };
}

