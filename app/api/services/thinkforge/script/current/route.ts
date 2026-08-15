import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Get current script for a session
 * POST /api/services/thinkforge/script/current
 */
export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;
  let scriptId: string | undefined;

  try {
    const body = await req.json();
    sessionId = readIdentifier(body?.sessionId);
    scriptId = readIdentifier(body?.scriptId);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  if (!scriptId) {
    return NextResponse.json({ error: 'Missing scriptId' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const script = await db.getScript(session._id, scriptId);
    
    if (!script) {
      return NextResponse.json({
        script: null
      });
    }

    return NextResponse.json({
      script: {
        sessionId: script.sessionId,
        scriptId: script.scriptId,
        title: script.title,
        content: script.content,
        blocks: script.blocks || [],
        richText: script.richText || null,
        metadata: script.metadata || {},
        version: script.version ?? 1,
        documentType: script.documentType,
        contentContract: script.contentContract,
      }
    });
  } catch (error) {
    console.error('Error getting current script:', error);
    return NextResponse.json(
      { error: 'Failed to get script' },
      { status: 500 }
    );
  }
}
