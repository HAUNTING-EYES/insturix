import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns only the selected trend state needed by the ThinkForge trend workflow.
 * The full session endpoint also returns script and chat data, which is not
 * appropriate for a short-interval analysis poll.
 */
export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const sessionId = new URL(request.url).searchParams.get('sessionId')?.trim();
  if (!sessionId || sessionId.length > 160) {
    return NextResponse.json({ error: 'A valid sessionId is required.' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

    return NextResponse.json({
      sessionId: session._id,
      selectedTrend: session.projectMeta?.selectedTrend ?? null,
    });
  } catch (error) {
    console.error('[ThinkForge:TrendStatus] Failed to read selected trend:', error);
    return NextResponse.json(
      { error: 'Trend status could not be read. Please try again.' },
      { status: 500 },
    );
  }
}
