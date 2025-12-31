import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import { generateScriptDraft } from '@/lib/thinkforge/agents/script-draft-agent';
import type { SessionState } from '@/lib/thinkforge/state/types';

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
  let selection: string | undefined;
  let indices: number[] | undefined;

  try {
    const body = await req.json();
    instruction = body?.instruction ? String(body.instruction) : undefined;
    script = body?.script;
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
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
    if (!existingScript && sessionId) {
      const dbScript = await db.getScript(sessionId);
      if (dbScript) {
        existingScript = {
          title: dbScript.title,
          content: dbScript.content,
          blocks: dbScript.blocks
        };
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

    // Build minimal session state
    const sessionState: SessionState = {
      sessionId: sessionId || `temp_${Date.now()}`,
      userId: userId,
      metadata: {},
      chat: [],
      script: existingScript ? {
        title: existingScript.title || 'Untitled Script',
        blocks: existingScript.blocks || [],
        content: existingScript.content || '',
        draft: false,
        version: 1
      } : null,
      ideas: [],
      version: 1,
      lastUpdated: new Date()
    };

    // Generate edited script
    const result = await generateScriptDraft(enrichedInstruction, sessionState, existingScript);

    // Save to database if sessionId provided
    if (sessionId && result) {
      await db.saveScript(sessionId, {
        title: result.title || existingScript?.title || 'Untitled Script',
        content: result.content || '',
        blocks: result.blocks || []
      });
    }

    return NextResponse.json({
      title: result?.title,
      content: result?.content,
      blocks: result?.blocks || [],
      metadata: {},
      replacements: []
    });
  } catch (error: any) {
    console.error('Error editing script blocks:', error);
    return NextResponse.json(
      { error: 'Failed to edit script blocks', details: error?.message },
      { status: 500 }
    );
  }
}

