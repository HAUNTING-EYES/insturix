import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
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
    // Get creator name for org context display (only for new sessions)
    let createdByName: string | undefined;
    if (orgId && !sessionId) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        createdByName = user.firstName 
          ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
          : user.username || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Unknown';
      } catch (e) {
        console.error('[ThinkForge] Failed to get user name:', e);
      }
    }

    // Create/get session with org context
    const session = await db.getOrCreateSession(userId, sessionId, projectMeta, orgId, createdByName);

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
      createdByName: session.createdByName,
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
