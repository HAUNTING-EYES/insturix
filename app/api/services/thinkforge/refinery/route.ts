import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runRefineryAgent } from '@/lib/thinkforge/agents/refinery-agent';
import { checkCredits } from '@/lib/services/creditsMiddleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Refinery API - async URL/content ingestion
 *
 * POST /api/services/thinkforge/refinery
 *   body: { sessionId, urls: string[], projectId? }
 *
 * Processes URLs through the refinery pipeline:
 *   1. Extracts content
 *   2. Generates structured briefs
 *   3. Splits into atomic facts
 *   4. Saves all entries to the DataBank
 *
 * Designed to be called fire-and-forget from the client (ChatPanel)
 * or via QStash for production-grade background processing.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, urls, projectId } = body;

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'Missing or empty urls array' }, { status: 400 });
  }
  if (urls.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 URLs per request' }, { status: 400 });
  }

  for (const url of urls) {
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: `Invalid URL: ${url}` }, { status: 400 });
    }
  }

  const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', { taskId: sessionId });
  if (!creditCheck.allowed) return creditCheck.errorResponse;
  await creditCheck.deduct();

  try {
    const result = await runRefineryAgent({
      userId,
      sessionId,
      projectId,
      urls,
    });

    return NextResponse.json({ result }, { status: 200 });
  } catch (error: any) {
    console.error('[Refinery] Processing failed:', error);
    await creditCheck.refund(error?.message || 'Refinery processing failed');
    return NextResponse.json(
      { error: 'Refinery processing failed', details: error?.message },
      { status: 500 },
    );
  }
}
