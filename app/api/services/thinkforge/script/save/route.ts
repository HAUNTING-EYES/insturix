import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
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

  try {
    const body = await req.json();
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    script = body?.script;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const saved = await db.saveScript(sessionId, {
      title: script?.title || 'Untitled Script',
      content: script?.content || '',
      blocks: script?.blocks || [],
      richText: script?.richText // Include Tiptap JSON AST if provided
    });

    return NextResponse.json({
      success: true,
      script: {
        title: saved.title,
        content: saved.content,
        blocks: saved.blocks || [],
        richText: saved.richText || null
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
