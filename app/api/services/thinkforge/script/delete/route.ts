import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;
  let scriptId: string | undefined;
  try {
    const body = await req.json();
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    scriptId = body?.scriptId ? String(body.scriptId) : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId || !scriptId) {
    return NextResponse.json({ error: 'Missing sessionId or scriptId' }, { status: 400 });
  }

  if (scriptId === 'default') {
    return NextResponse.json({ error: 'Cannot delete the default script' }, { status: 400 });
  }

  try {
    const deleted = await db.deleteScript(sessionId, scriptId);
    if (!deleted) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting script:', error);
    return NextResponse.json(
      { error: 'Failed to delete script', details: error?.message },
      { status: 500 }
    );
  }
}
