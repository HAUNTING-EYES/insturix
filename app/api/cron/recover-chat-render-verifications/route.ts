import { NextResponse } from 'next/server';

import { sweepChatEditRenderVerificationDispatches } from '@/lib/editron/services/chat-edit-render-verification-dispatch-recovery';
import { sweepChatEditRenderVerificationNotifications } from '@/lib/editron/services/chat-edit-render-verification-notification-recovery';

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
    const [dispatch, notification] = await Promise.all([
      sweepChatEditRenderVerificationDispatches(),
      sweepChatEditRenderVerificationNotifications(),
    ]);
    const errors = dispatch.errors + notification.errors;
    console.log(
      `[ChatRenderVerificationRecovery] dispatch(scanned=${dispatch.scanned}, eligible=${dispatch.eligible}, `
      + `claimed=${dispatch.claimed}, dispatched=${dispatch.dispatched}, deferred=${dispatch.deferred}) `
      + `notification(scanned=${notification.scanned}, notified=${notification.notified}, `
      + `skipped=${notification.skipped}) errors=${errors}`,
    );
    return NextResponse.json({ success: errors === 0, dispatch, notification }, {
      status: errors === 0 ? 200 : 207,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ChatRenderVerificationRecovery] sweep failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
