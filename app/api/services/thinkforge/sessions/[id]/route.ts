import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import * as db from '@/lib/thinkforge/services/db';
import {
  PostMortemScopeError,
  resolvePostMortemScope,
} from '@/lib/thinkforge/agents/post-mortem-scope';
import {
  enqueuePostMortemJob,
  isPostMortemWorkerConfigured,
} from '@/lib/thinkforge/post-mortem/post-mortem-job';
import { safePostMortemJobErrorMessage } from '@/lib/thinkforge/post-mortem/post-mortem-job-store';

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

  } catch (error: unknown) {
    console.error('Error getting session:', safePostMortemJobErrorMessage(error));
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
export async function DELETE(_request: Request, { params }: RouteParams) {
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

    const scoped = await resolvePostMortemScope({ userId, orgId, sessionId, session });
    if (!scoped) {
      return NextResponse.json({ error: 'Session not found or access denied' }, { status: 404 });
    }
    if (!isPostMortemWorkerConfigured()) {
      return NextResponse.json(
        {
          error: 'Session deletion is temporarily unavailable.',
          code: 'post_mortem_worker_unavailable',
          retryable: true,
        },
        { status: 503 },
      );
    }

    const queued = await enqueuePostMortemJob(scoped.input, { deleteSessionOnCompletion: true });

    return NextResponse.json({
      success: true,
      accepted: true,
      deletionPending: queued.job.status !== 'completed',
      jobId: queued.job.id,
      status: queued.job.status,
      statusUrl: `/api/services/thinkforge/events/post-mortem/${encodeURIComponent(queued.job.id)}`,
    }, { status: 202 });

  } catch (error: unknown) {
    if (error instanceof PostMortemScopeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Error queueing session deletion:', safePostMortemJobErrorMessage(error));
    return NextResponse.json(
      {
        error: 'Session deletion could not be queued.',
        code: 'post_mortem_queue_unavailable',
        retryable: true,
      },
      { status: 503 }
    );
  }
}
