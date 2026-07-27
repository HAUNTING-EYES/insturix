import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Get current script for a session
 * POST /api/services/thinkforge/script/current
 */
export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;

  try {
    const body = await req.json();
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const script = await db.getScript(session._id);
    
    if (!script) {
      return NextResponse.json({
        script: null
      });
    }

    return NextResponse.json({
      script: {
        title: script.title,
        content: script.content,
        blocks: script.blocks || [],
        richText: script.richText || null,
        metadata: script.metadata || {},
        version: script.version ?? 1
      }
    });
  } catch (error: any) {
    console.error('Error getting current script:', error);
    return NextResponse.json(
      { error: 'Failed to get script', details: error?.message },
      { status: 500 }
    );
  }
}
