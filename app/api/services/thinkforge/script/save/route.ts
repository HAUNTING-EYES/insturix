import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import * as db from '@/lib/thinkforge/services/db';
import { SaveScriptSchema } from '@/lib/thinkforge/schemas/route-validation';
import { safeParseTiptapJSON } from '@/lib/thinkforge/schemas/tiptap-validation';

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

  if (sessionId.trim() !== sessionId) {
    return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
  }
  if (!scriptId) {
    return NextResponse.json({ error: 'Missing scriptId' }, { status: 400 });
  }
  if (scriptId.trim() !== scriptId) {
    return NextResponse.json({ error: 'Invalid scriptId' }, { status: 400 });
  }
  if (baseVersion === undefined) {
    return NextResponse.json({ error: 'baseVersion is required for document mutations' }, { status: 400 });
  }

  let validatedRichText = undefined;
  if (script?.richText !== undefined) {
    const parseResult = safeParseTiptapJSON(script.richText);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid richText', details: parseResult.error.toJSON() },
        { status: 400 },
      );
    }
    validatedRichText = parseResult.data;
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const canonicalSessionId = session._id;

    const replacementPayload: Record<string, unknown> = {
      scriptId,
      title: script?.title || 'Untitled Script',
      documentType: script?.documentType,
      contentContract: script?.contentContract,
    };
    if (typeof script?.content === 'string') replacementPayload.content = script.content;
    if (Array.isArray(script?.blocks)) replacementPayload.blocks = script.blocks;
    if (validatedRichText !== undefined) replacementPayload.richText = validatedRichText;

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: canonicalSessionId,
      baseVersion,
      source: 'user',
      payload: replacementPayload,
    }, userId, orgId);

    if (!result.ok) {
      const status = result.error === 'Version conflict' ? 409 : result.error === 'Session not found' ? 404 : 400;
      return NextResponse.json({ error: result.error, currentVersion: result.currentVersion }, { status });
    }

    return NextResponse.json({
      success: true,
      script: {
        scriptId: result.script.scriptId || scriptId,
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
