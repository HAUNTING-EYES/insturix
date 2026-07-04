import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import type { GenerationState } from '@/lib/thinkforge/services/db';

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

    // Auto-clear stale running generations (prevents UI from getting stuck)
    if (generation && generation.status === 'running') {
      const updatedAt = generation.updatedAt ? new Date(generation.updatedAt).getTime() : 0;
      const startedAt = generation.startedAt ? new Date(generation.startedAt).getTime() : 0;
      const lastActivity = Math.max(updatedAt, startedAt);
      const STALE_AFTER_MS = 30_000; // 30s - aggressive cleanup to prevent stuck UI
      if (lastActivity && Date.now() - lastActivity > STALE_AFTER_MS) {
        console.log('[ThinkForge] Clearing stale generation', { generationId: generation.id, age: Date.now() - lastActivity });
        await db.clearActiveGeneration(sessionId);
        generation = null;
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
