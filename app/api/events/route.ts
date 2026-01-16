import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getEventsSince } from '@/lib/thinkforge/services/event-log';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Replay SSE events for a session
 * GET /api/events?sessionId=...&since=...&threadId=...
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  const sinceParam = url.searchParams.get('since');
  const threadId = url.searchParams.get('threadId') || undefined;

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const since = Number(sinceParam);
  if (!Number.isFinite(since)) {
    return NextResponse.json({ error: 'Invalid since' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const events = getEventsSince(sessionId, since, threadId);
    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('[events] Error fetching replay events:', error);
    return NextResponse.json({ error: 'Failed to fetch events', details: error?.message }, { status: 500 });
  }
}
