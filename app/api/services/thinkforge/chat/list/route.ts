import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * List chat messages for a session
 * GET /api/services/thinkforge/chat/list?sessionId=...&limit=50&offset=0
 */
export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const threadId = url.searchParams.get('threadId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const messages = await db.getChatHistory(session._id, limit, threadId || null);
    
    // Format messages for frontend
    const items = messages.map((msg: any, idx: number) => ({
      id: msg._id || `msg_${idx}`,
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt || new Date().toISOString(),
    }));

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error('Error listing chat messages:', error);
    return NextResponse.json(
      { error: 'Failed to list messages', details: error?.message },
      { status: 500 }
    );
  }
}

