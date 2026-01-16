import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Save script for a session
 * POST /api/services/thinkforge/script/save
 * 
 * Accepts script object with:
 * - title: Script title
 * - content: Plain text content
 * - blocks: ThinkForgeBlock[] (legacy format)
 * - richText: Tiptap JSON AST (new format)
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;
  let script: any | undefined;
  let scriptId: string | undefined;
  let baseVersion: number | undefined;

  try {
    const body = await req.json();
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    script = body?.script;
    scriptId = body?.scriptId ? String(body.scriptId) : undefined;
    baseVersion = typeof body?.baseVersion === 'number' ? body.baseVersion : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    let effectiveBaseVersion = typeof baseVersion === 'number' ? baseVersion : undefined;
    if (effectiveBaseVersion === undefined) {
      const existing = await db.getScript(sessionId, scriptId || null);
      effectiveBaseVersion = existing?.version ?? 0;
    }
    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId,
      baseVersion: effectiveBaseVersion,
      source: 'user',
      payload: {
        scriptId,
        title: script?.title || 'Untitled Script',
        content: script?.content || '',
        blocks: script?.blocks || [],
        richText: script?.richText,
      }
    }, userId);

    if (!result.ok) {
      const status = result.error === 'Version conflict' ? 409 : result.error === 'Session not found' ? 404 : 400;
      return NextResponse.json({ error: result.error, currentVersion: result.currentVersion }, { status });
    }

    return NextResponse.json({
      success: true,
      script: {
        scriptId: result.script.scriptId || scriptId || 'default',
        title: result.script.title,
        content: result.script.content,
        blocks: result.script.blocks || [],
        richText: result.script.richText || null,
        version: result.script.version ?? 1,
      }
    });
  } catch (error: any) {
    console.error('Error saving script:', error);
    return NextResponse.json(
      { error: 'Failed to save script', details: error?.message },
      { status: 500 }
    );
  }
}
