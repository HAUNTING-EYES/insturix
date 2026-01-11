import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import { safeParseTiptapJSON } from '@/lib/thinkforge/schemas/tiptap-validation';

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

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const script = await db.getScript(sessionId);
    
    if (!script) {
      return NextResponse.json({
        blocks: [],
        richText: null,
        title: 'Untitled Script',
        content: ''
      });
    }

    return NextResponse.json({
      blocks: script.blocks || [],
      richText: script.richText || null, // Tiptap JSON AST
      title: script.title || 'Untitled Script',
      content: script.content || ''
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

  let sessionId: string | undefined;
  let blocks: any[] | undefined;
  let richText: any | undefined;
  let title: string | undefined;
  let content: string | undefined;

  try {
    const body = await req.json();
    // Accept both sessionId and scriptId (scriptId is used by ScriptEditor)
    sessionId = body?.sessionId ? String(body.sessionId) : (body?.scriptId ? String(body.scriptId) : undefined);
    blocks = body?.blocks;
    richText = body?.richText; // Tiptap JSON AST
    title = body?.title;
    content = body?.content;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId or scriptId' }, { status: 400 });
  }

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
    const script = await db.saveScript(sessionId, {
      title: title || 'Untitled Script',
      content: content || '',
      blocks: blocks || [],
      richText: validatedRichText // Include validated Tiptap JSON AST
    });

    return NextResponse.json({
      success: true,
      script: {
        blocks: script.blocks || [],
        richText: script.richText || null,
        title: script.title,
        content: script.content
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
