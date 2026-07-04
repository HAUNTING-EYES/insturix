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
 * GET /api/services/thinkforge/script/blocks?sessionId=...
 * 
 * Returns both blocks (ThinkForgeBlock[]) and richText (Tiptap JSON AST)
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  const scriptId = url.searchParams.get('scriptId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const script = await db.getScript(sessionId, scriptId || null);
    
    if (!script) {
      return NextResponse.json({
        blocks: [],
        richText: null,
        title: 'Untitled Script',
        content: '',
        metadata: {},
        documentType: 'screenplay'
      });
    }

    return NextResponse.json({
      blocks: script.blocks || [],
      richText: script.richText || null, // Tiptap JSON AST
      title: script.title || 'Untitled Script',
      content: script.content || '',
      version: script.version ?? 1,
      metadata: script.metadata || {},
      documentType: script.documentType || 'screenplay'
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
 * - sessionId or scriptId: Session identifier
 * - blocks: ThinkForgeBlock[] (legacy format)
 * - richText: Tiptap JSON AST (new format)
 * - title: Script title
 * - content: Plain text content
 */
export async function POST(req: Request) {
  const { userId } = await auth();
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

  // Validate richText (Tiptap JSON) if provided
  let validatedRichText = undefined;
  if (richText) {
    const parseResult = safeParseTiptapJSON(richText);
    if (!parseResult.success) {
      console.warn('Invalid Tiptap JSON received, skipping richText:', parseResult.error.message);
      // Don't reject the request, just skip the invalid richText
      // This ensures backward compatibility while logging issues
    } else {
      validatedRichText = parseResult.data;
    }
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
        title: title || 'Untitled Script',
        content: content || '',
        blocks: blocks || [],
        richText: validatedRichText
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
        blocks: result.script.blocks || [],
        richText: result.script.richText || null,
        title: result.script.title,
        content: result.script.content,
        version: result.script.version ?? 1,
        metadata: result.script.metadata || {},
        documentType: result.script.documentType || 'screenplay',
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
