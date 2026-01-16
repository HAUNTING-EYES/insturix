import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * List scripts for a session
 * GET /api/services/thinkforge/script/list?sessionId=...
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
    const scripts = await db.listScripts(sessionId);
    return NextResponse.json({ scripts });
  } catch (error: any) {
    console.error('Error listing scripts:', error);
    return NextResponse.json(
      { error: 'Failed to list scripts', details: error?.message },
      { status: 500 }
    );
  }
}
