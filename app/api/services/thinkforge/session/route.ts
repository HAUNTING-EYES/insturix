import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import { ServiceUsageService } from '@/lib/services/serviceUsageService';
import type { ProjectMeta } from '@/lib/thinkforge/state/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified session endpoint
 * Handles get or create session with full state loading
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;
  let projectMeta: ProjectMeta | undefined;

  try {
    const body = await req.json();
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    projectMeta = body?.projectMeta;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // If creating new session, check limits
    if (!sessionId && projectMeta) {
      try {
        await ServiceUsageService.useService(userId, 'thinkforge' as any, 'maxSessions', 1);
      } catch (e: any) {
        const msg = e?.message || 'Weekly sessions limit exceeded';
        return NextResponse.json({ success: false, error: msg }, { status: 429 });
      }
    }

    // Get or create session
    const session = await db.getOrCreateSession(userId, sessionId, projectMeta);

    // Load script for session
    const script = await db.getScript(session._id);

    // Load chat history (last 50 messages)
    const chat = await db.getChatHistory(session._id, 50);

    // Load user preferences
    const preferences = await db.getUserPreferences(userId);

    return NextResponse.json({
      sessionId: session._id,
      userId: session.userId,
      projectMeta: session.projectMeta || {},
      preferences,
      script: script ? {
        title: script.title,
        content: script.content,
        blocks: script.blocks || []
      } : null,
      activeGeneration: session.activeGeneration || null,
      chat
    });
  } catch (error: any) {
    console.error('Error in session endpoint:', error);
    
    // Roll back usage reservation if this was a create-new request that failed
    if (!sessionId && projectMeta) {
      try {
        await ServiceUsageService.useService(userId, 'thinkforge' as any, 'maxSessions', -1);
      } catch (rollbackErr) {
        console.error('[Session] Failed to rollback usage after error:', rollbackErr);
      }
    }
    
    return NextResponse.json(
      { error: 'Session operation failed', details: error?.message },
      { status: 500 }
    );
  }
}


