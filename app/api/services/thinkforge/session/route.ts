import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import type { ProjectMeta } from '@/lib/thinkforge/state/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified session endpoint
 * Handles get or create session with full state loading
 */
export async function POST(req: Request) {
  const { userId, orgId } = await auth();
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
    // Create/get session with org context
    const session = await db.getOrCreateSession(userId, sessionId, projectMeta, orgId);

    // Load script for session
    const script = await db.getScript(session._id);

    // Load chat history (last 50 messages)
    const chat = await db.getChatHistory(session._id, 50);

    // Load user preferences
    const preferences = await db.getUserPreferences(userId);

    return NextResponse.json({
      sessionId: session._id,
      userId: session.userId,
      orgId: session.orgId,
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
    
    return NextResponse.json(
      { error: 'Session operation failed', details: error?.message },
      { status: 500 }
    );
  }
}


