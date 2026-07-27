import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * List chat threads for a session
 * GET /api/services/thinkforge/chat/threads?sessionId=...
 */
export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const threads = await db.listChatThreads(session._id);
    return NextResponse.json({ threads });
  } catch (error: any) {
    console.error('Error listing chat threads:', error);
    return NextResponse.json(
      { error: 'Failed to list threads', details: error?.message },
      { status: 500 }
    );
  }
}
