import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import { generateScriptDraft } from '@/lib/thinkforge/agents/script-draft-agent';
import type { SessionState } from '@/lib/thinkforge/state/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Edit script with AI
 * POST /api/services/thinkforge/script/edit
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let instruction: string | undefined;
  let script: any | undefined;
  let sessionId: string | undefined;

  try {
    const body = await req.json();
    instruction = body?.instruction ? String(body.instruction) : undefined;
    script = body?.script;
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
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
    const result = await generateScriptDraft(instruction, sessionState, existingScript);

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
      metadata: {}
    });
  } catch (error: any) {
    console.error('Error editing script:', error);
    return NextResponse.json(
      { error: 'Failed to edit script', details: error?.message },
      { status: 500 }
    );
  }
}

