import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { applyCommand } from '@/lib/thinkforge/services/command-service';
import * as db from '@/lib/thinkforge/services/db';
import { safeParseTiptapJSON } from '@/lib/thinkforge/schemas/tiptap-validation';
import { SaveBlocksSchema } from '@/lib/thinkforge/schemas/route-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Get script blocks for a session
 * GET /api/services/thinkforge/script/blocks?sessionId=...&scriptId=...
 * 
 * Returns both blocks (ThinkForgeBlock[]) and richText (Tiptap JSON AST)
 */
export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  const scriptId = url.searchParams.get('scriptId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  if (sessionId.trim() !== sessionId) {
    return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
  }
  if (!scriptId) {
    return NextResponse.json({ error: 'Missing scriptId' }, { status: 400 });
  }
  if (scriptId.trim() !== scriptId) {
    return NextResponse.json({ error: 'Invalid scriptId' }, { status: 400 });
  }
  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const script = await db.getScript(session._id, scriptId);
    
    if (!script) {
      return NextResponse.json({
        scriptId,
        blocks: [],
        richText: null,
        title: 'Untitled Script',
        content: '',
        metadata: {},
        documentType: null,
        contentContract: null,
      });
    }

    return NextResponse.json({
      scriptId: script.scriptId || scriptId,
      blocks: script.blocks || [],
      richText: script.richText || null, // Tiptap JSON AST
      title: script.title || 'Untitled Script',
      content: script.content || '',
      version: script.version ?? 1,
      metadata: script.metadata || {},
      documentType: script.documentType,
      contentContract: script.contentContract,
    });
  } catch (error: any) {
    console.error('Error getting script blocks:', error);
    return NextResponse.json(
      { error: 'Failed to get script blocks', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * Save script blocks for a session
 * POST /api/services/thinkforge/script/blocks
 * 
 * Accepts:
 * - sessionId: Session identifier
 * - scriptId: Document identifier
 * - blocks: ThinkForgeBlock[] (legacy format)
 * - richText: Tiptap JSON AST (new format)
 * - title: Script title
 * - content: Plain text content
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

  const parsed = SaveBlocksSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }
  const { sessionId, scriptId, blocks, richText, title, content, baseVersion } = parsed.data;

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

  // Validate richText (Tiptap JSON) if provided
  let validatedRichText = undefined;
  if (richText !== undefined) {
    const parseResult = safeParseTiptapJSON(richText);
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

    const replacementPayload: Record<string, unknown> = {
      scriptId,
      title: title || 'Untitled Script',
    };
    if (typeof content === 'string') replacementPayload.content = content;
    if (Array.isArray(blocks)) replacementPayload.blocks = blocks;
    if (validatedRichText !== undefined) replacementPayload.richText = validatedRichText;

    const result = await applyCommand({
      type: 'ReplaceDocument',
      sessionId: session._id,
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
        blocks: result.script.blocks || [],
        richText: result.script.richText || null,
        title: result.script.title,
        content: result.script.content,
        version: result.script.version ?? 1,
        metadata: result.script.metadata || {},
        documentType: result.script.documentType,
        contentContract: result.script.contentContract,
      }
    });
  } catch (error: any) {
    console.error('Error saving script blocks:', error);
    return NextResponse.json(
      { error: 'Failed to save script blocks', details: error?.message },
      { status: 500 }
    );
  }
}
