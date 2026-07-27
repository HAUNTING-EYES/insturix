import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * List scripts for a session
 * GET /api/services/thinkforge/script/list?sessionId=...
 * POST /api/services/thinkforge/script/list { sessionId }
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

    const scripts = await db.listScripts(session._id);
    return NextResponse.json({ scripts });
  } catch (error: any) {
    console.error('Error listing scripts:', error);
    return NextResponse.json(
      { error: 'Failed to list scripts', details: error?.message },
      { status: 500 }
    );
  }
}

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

    const scripts = await db.listScripts(session._id);
    return NextResponse.json({ scripts });
  } catch (error: any) {
    console.error('Error listing scripts:', error);
    return NextResponse.json(
      { error: 'Failed to list scripts', details: error?.message },
      { status: 500 }
    );
  }
}
