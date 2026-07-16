import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import * as db from '@/lib/thinkforge/services/db';
import { SaveScriptSchema } from '@/lib/thinkforge/schemas/route-validation';

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
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SaveScriptSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }
  const { sessionId, scriptId, baseVersion, script } = parsed.data;

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const canonicalSessionId = session._id;

    let effectiveBaseVersion = typeof baseVersion === 'number' ? baseVersion : undefined;
    if (effectiveBaseVersion === undefined) {
      const existing = await db.getScript(canonicalSessionId, scriptId || null);
      effectiveBaseVersion = existing?.version ?? 0;
    }
    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: canonicalSessionId,
      baseVersion: effectiveBaseVersion,
      source: 'user',
      payload: {
        scriptId,
        title: script?.title || 'Untitled Script',
        content: script?.content || '',
        blocks: script?.blocks || [],
        richText: script?.richText,
        documentType: script?.documentType,
        contentContract: script?.contentContract,
      }
    }, userId, orgId);

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
        documentType: result.script.documentType,
        contentContract: result.script.contentContract,
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
