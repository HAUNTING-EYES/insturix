import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let generation = await db.getActiveGeneration(sessionId);
    let script: any = null;

    // A status poll is a watchdog, not a cleanup mechanism. Keep failures durable so
    // the client can tell the user what happened instead of presenting an empty board.
    if (generation && generation.status === 'running') {
      const updatedAt = generation.updatedAt ? new Date(generation.updatedAt).getTime() : 0;
      const startedAt = generation.startedAt ? new Date(generation.startedAt).getTime() : 0;
      const lastActivity = Math.max(updatedAt, startedAt);
      const SERVERLESS_REQUEST_BUDGET_MS = 60_000;
      const WATCHDOG_GRACE_MS = 30_000;
      const STALE_AFTER_MS = SERVERLESS_REQUEST_BUDGET_MS + WATCHDOG_GRACE_MS;

      if (lastActivity && Date.now() - lastActivity > STALE_AFTER_MS) {
        const message = 'Generation timed out before a script could be saved. Please try again.';
        console.error('[ThinkForge] Generation watchdog timed out', {
          generationId: generation.id,
          age: Date.now() - lastActivity,
          type: generation.type,
        });
        await db.updateGenerationState(sessionId, generation.id, {
          status: 'failed',
          message,
        });
        generation = {
          ...generation,
          status: 'failed',
          message,
          updatedAt: new Date(),
        };
      }
    }

    if (
      generation &&
      generation.status === 'completed' &&
      (generation.type === 'script_generate' || generation.type === 'script_edit')
    ) {
      const generationScriptId = typeof generation.scriptId === 'string' && generation.scriptId.trim()
        ? generation.scriptId
        : null;
      script = await db.getScript(sessionId, generationScriptId);
    }

    return NextResponse.json({ generation: generation || null, script });
  } catch (error: any) {
    console.error('[ThinkForge] Generation status error:', error);
    return NextResponse.json({ error: 'Failed to fetch generation status' }, { status: 500 });
  }
}
