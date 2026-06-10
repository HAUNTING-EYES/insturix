import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runPostMortemAgent } from '@/lib/thinkforge/agents/post-mortem-agent';
import { resolvePostMortemScope } from '@/lib/thinkforge/agents/post-mortem-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Post-Mortem Compression API
 *
 * POST /api/services/thinkforge/events/post-mortem
 *
 * Triggers the Post-Mortem agent for a completed project session.
 * Compresses transient events and project-scoped entries into
 * global Brand DNA insights, then cleans up the raw data.
 *
 * Body: { sessionId: string, projectTitle?: string }
 */
export async function POST(req: Request) {
  if (process.env.POSTMORTEM_ENABLED !== 'true') {
    return NextResponse.json({ success: true, message: 'Post-Mortem disabled' });
  }

  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sessionId = nonEmptyString(body?.sessionId);
  const projectTitle = nonEmptyString(body?.projectTitle);
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const scoped = await resolvePostMortemScope({ userId, sessionId, projectTitle });
    if (!scoped) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const result = await runPostMortemAgent(scoped.input);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[PostMortem] Agent failed:', error);
    return NextResponse.json({ error: 'Post-mortem compression failed' }, { status: 500 });
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
