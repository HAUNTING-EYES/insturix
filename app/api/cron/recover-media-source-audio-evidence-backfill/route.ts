import { NextResponse } from 'next/server';

import { recoverMediaSourceAudioEvidenceBackfillRunsV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-v1';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: { code: 'CRON_SECRET_NOT_CONFIGURED' } },
      { status: 503 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED' } },
      { status: 401 },
    );
  }

  try {
    const recovery = await recoverMediaSourceAudioEvidenceBackfillRunsV1();
    if (recovery.unconfirmedCount > 0) {
      console.error('[MediaSourceAudioEvidenceBackfillRecoveryV1]', {
        code: 'RECOVERY_DELIVERY_UNCONFIRMED',
        recoveryReceiptSha256: recovery.recoveryReceiptSha256,
        selectedCount: recovery.selectedCount,
        unconfirmedCount: recovery.unconfirmedCount,
      });
      return NextResponse.json({ success: false, recovery }, {
        status: 503,
        headers: { 'Retry-After': '300' },
      });
    }
    return NextResponse.json({ success: true, recovery }, { status: 200 });
  } catch (error: unknown) {
    console.error(
      '[MediaSourceAudioEvidenceBackfillRecoveryV1] sweep unavailable:',
      error instanceof Error ? error.name : 'unknown',
    );
    return NextResponse.json({
      success: false,
      error: {
        code: 'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_UNAVAILABLE',
      },
    }, {
      status: 503,
      headers: { 'Retry-After': '300' },
    });
  }
}
