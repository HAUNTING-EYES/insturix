import { NextResponse } from 'next/server';

import { sweepChatEditRenderVerificationDispatches } from '@/lib/editron/services/chat-edit-render-verification-dispatch-recovery';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[ChatRenderVerificationRecovery] CRON_SECRET is not configured.');
    return new NextResponse('Cron recovery is not configured', { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const result = await sweepChatEditRenderVerificationDispatches();
    console.log(
      `[ChatRenderVerificationRecovery] scanned=${result.scanned} eligible=${result.eligible} `
      + `claimed=${result.claimed} dispatched=${result.dispatched} deferred=${result.deferred} `
      + `skipped=${result.skipped} errors=${result.errors}`,
    );
    return NextResponse.json({ success: result.errors === 0, ...result }, {
      status: result.errors === 0 ? 200 : 207,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ChatRenderVerificationRecovery] sweep failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
