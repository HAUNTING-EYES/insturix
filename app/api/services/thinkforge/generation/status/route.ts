import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHAT_EXECUTION_BUDGET_MS = 300_000;
const WATCHDOG_GRACE_MS = 30_000;
const STALE_AFTER_MS = CHAT_EXECUTION_BUDGET_MS + WATCHDOG_GRACE_MS;

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId')?.trim();

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const canonicalSessionId = session._id;
    let generation = await db.getActiveGeneration(canonicalSessionId);
    let script: Awaited<ReturnType<typeof db.getScript>> = null;

    // A status poll is a watchdog, not a cleanup mechanism. Keep failures durable so
    // the client can tell the user what happened instead of presenting an empty board.
    if (generation && generation.status === 'running') {
      const updatedAt = generation.updatedAt ? new Date(generation.updatedAt).getTime() : 0;
      const startedAt = generation.startedAt ? new Date(generation.startedAt).getTime() : 0;
      const lastActivity = Math.max(updatedAt, startedAt);
      if (lastActivity && Date.now() - lastActivity > STALE_AFTER_MS) {
        const message = 'Generation timed out before a script could be saved. Please try again.';
        console.error('[ThinkForge] Generation watchdog timed out', {
          generationId: generation.id,
          age: Date.now() - lastActivity,
          type: generation.type,
        });
        try {
          generation = await db.updateGenerationState(canonicalSessionId, generation.id, {
            status: 'failed',
            message,
          });
        } catch (error) {
          if (!(error instanceof db.GenerationStateConflictError)) throw error;
          generation = await db.getActiveGeneration(canonicalSessionId);
        }
      }
    }

    if (
      generation &&
      generation.status === 'completed' &&
      (generation.type === 'script_generate' || generation.type === 'script_edit')
    ) {
      const generationScriptId = typeof generation.scriptId === 'string' && generation.scriptId.trim()
        ? generation.scriptId.trim()
        : null;
      if (generationScriptId) {
        script = await db.getScript(canonicalSessionId, generationScriptId);
      }
    }

    return NextResponse.json({ generation: generation || null, script });
  } catch (error) {
    console.error('[ThinkForge] Generation status error:', error);
    return NextResponse.json({ error: 'Failed to fetch generation status' }, { status: 500 });
  }
}
