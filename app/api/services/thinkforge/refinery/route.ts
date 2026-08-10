import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runRefineryAgent } from '@/lib/thinkforge/agents/refinery-agent';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import { getSession } from '@/lib/thinkforge/services/db';
import { assertSafeAssetUrl } from '@/lib/shared/safe-asset-url';

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
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, urls } = body;

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'Missing or empty urls array' }, { status: 400 });
  }
  if (urls.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 URLs per request' }, { status: 400 });
  }

  const normalizedUrls = [...new Set(urls.map((url: unknown) => (
    typeof url === 'string' ? url.trim() : ''
  )))];
  if (normalizedUrls.some((url) => !url)) {
    return NextResponse.json({ error: 'Every URL must be a non-empty string' }, { status: 400 });
  }
  for (const url of normalizedUrls) {
    try {
      await assertSafeAssetUrl(url);
    } catch (error) {
      return NextResponse.json({
        error: `Unsafe or invalid URL: ${url}`,
        details: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  const session = await getSession(sessionId, userId, orgId ?? null);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // P3.1: the active context at WORK-START decides who pays (stamped surfaces).
  const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());

  const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', { taskId: sessionId }, billingWallet);
  if (!creditCheck.allowed) return creditCheck.errorResponse;
  await creditCheck.deduct();

  try {
    const result = await runRefineryAgent({
      userId,
      sessionId: session._id,
      projectId: session._id,
      urls: normalizedUrls,
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
