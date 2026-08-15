import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import * as db from '@/lib/thinkforge/services/db';
import { runPostMortemAgent } from '@/lib/thinkforge/agents/post-mortem-agent';
import { resolvePostMortemScope } from '@/lib/thinkforge/agents/post-mortem-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/services/thinkforge/sessions/[id]
 * Get a specific session by ID
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const scriptId = new URL(request.url).searchParams.get('scriptId');
    if (!scriptId) {
      return NextResponse.json({ error: 'Missing scriptId' }, { status: 400 });
    }
    if (scriptId.trim() !== scriptId) {
      return NextResponse.json({ error: 'Invalid scriptId' }, { status: 400 });
    }

    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Also get the script and chat count for this session
    const script = await db.getScript(session._id, scriptId);
    const chatHistory = await db.getChatHistory(session._id, 1);

    return NextResponse.json({
      success: true,
      session: {
        id: session._id,
        userId: session.userId,
        projectMeta: session.projectMeta,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        hasScript: !!script,
        scriptTitle: script?.title,
        chatCount: chatHistory.length > 0 ? 'has_messages' : 'empty'
      }
    });

  } catch (error: any) {
    console.error('Error getting session:', error);
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/services/thinkforge/sessions/[id]
 * Delete a session and all its associated data
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }
    if (session.userId !== userId) {
      return NextResponse.json(
        { error: 'Only the session owner can delete this session' },
        { status: 403 },
      );
    }

    try {
      const scoped = await resolvePostMortemScope({ userId, orgId, sessionId, session });
      if (scoped) {
        await runPostMortemAgent(scoped.input);
      }
    } catch (pmErr) {
      console.error('[Sessions] Post-mortem failed; session deletion blocked:', pmErr);
      return NextResponse.json(
        {
          error: 'Session learning could not be preserved. Retry deletion.',
          code: 'post_mortem_not_durable',
          retryable: true,
        },
        { status: 503 },
      );
    }

    await db.deleteSession(sessionId, userId);

    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting session:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
