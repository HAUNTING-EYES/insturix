import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';
import type { ProjectMeta } from '@/lib/thinkforge/state/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Updates project metadata for an existing ThinkForge session.
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

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    // Ensure the session belongs to the authenticated user
    // If session doesn't exist, create it (upsert behavior for smoother UX)
    let existing = await db.getSession(sessionId, userId);
    if (!existing) {
      // Create the session first
      existing = await db.getOrCreateSession(userId, sessionId, projectMeta);
    }

    const session = await db.updateSession(sessionId, {
      projectMeta,
      updatedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      sessionId: session._id,
      projectMeta: session.projectMeta || {},
    });
  } catch (error: any) {
    console.error('Error updating session project meta:', error);
    return NextResponse.json(
      { error: 'Failed to update session', details: error?.message },
      { status: 500 }
    );
  }
}
