import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;
  let generationId: string | undefined;

  try {
    const body = await req.json();
    sessionId = readIdentifier(body?.sessionId);
    generationId = readIdentifier(body?.generationId);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  if (!generationId) {
    return NextResponse.json({ error: 'Missing generationId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const canonicalSessionId = session._id;
    const active = await db.getActiveGeneration(canonicalSessionId);
    if (!active) {
      return NextResponse.json({ error: 'No active generation' }, { status: 404 });
    }

    if (active.id !== generationId) {
      return NextResponse.json({ error: 'Generation mismatch' }, { status: 409 });
    }

    await db.updateGenerationState(canonicalSessionId, generationId, {
      status: 'cancelled',
      message: 'Cancelled by user',
    });

    return NextResponse.json({ ok: true, generationId });
  } catch (error) {
    if (error instanceof db.GenerationStateConflictError) {
      return NextResponse.json({ error: 'Generation is no longer running' }, { status: 409 });
    }
    console.error('[ThinkForge] Generation stop error:', error);
    return NextResponse.json({ error: 'Failed to cancel generation' }, { status: 500 });
  }
}
