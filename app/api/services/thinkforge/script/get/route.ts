import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Get a script by session + scriptId
 * GET /api/services/thinkforge/script/get?sessionId=...&scriptId=...
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

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const script = await db.getScript(session._id, scriptId || null);
    if (!script) {
      return NextResponse.json({ script: null });
    }

    return NextResponse.json({
      script: {
        scriptId: script.scriptId || scriptId || 'default',
        title: script.title,
        content: script.content,
        blocks: script.blocks || [],
        richText: script.richText || null,
        metadata: script.metadata || {},
        version: script.version ?? 1,
        documentType: script.documentType,
        contentContract: script.contentContract,
        updatedAt: script.updatedAt,
        createdAt: script.createdAt,
      }
    });
  } catch (error: any) {
    console.error('Error getting script:', error);
    return NextResponse.json(
      { error: 'Failed to get script', details: error?.message },
      { status: 500 }
    );
  }
}
