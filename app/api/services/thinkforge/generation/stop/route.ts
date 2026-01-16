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
  let generationId: string | undefined;

  try {
    const body = await req.json();
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    generationId = body?.generationId ? String(body.generationId) : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const active = await db.getActiveGeneration(sessionId);
    if (!active) {
      return NextResponse.json({ error: 'No active generation' }, { status: 404 });
    }

    if (generationId && active.id !== generationId) {
      return NextResponse.json({ error: 'Generation mismatch' }, { status: 409 });
    }

    await db.updateGenerationState(sessionId, active.id, {
      status: 'cancelled',
      message: 'Cancelled by user',
      updatedAt: new Date()
    } as any);

    return NextResponse.json({ ok: true, generationId: active.id });
  } catch (error: any) {
    console.error('[ThinkForge] Generation stop error:', error);
    return NextResponse.json({ error: 'Failed to cancel generation' }, { status: 500 });
  }
}
