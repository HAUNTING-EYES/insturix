import { NextResponse } from 'next/server';

import { runMediaSourceAudioRecoveryV1 }
  from '@/lib/editron/services/media-source-audio-recovery-runtime-v1';

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
    const recovery = await runMediaSourceAudioRecoveryV1();
    const deliveryDeferred = recovery.results.some(
      (result) => result.state !== 'dispatched',
    );
    return NextResponse.json({
      success: !deliveryDeferred,
      recovery,
    }, deliveryDeferred
      ? { status: 503, headers: { 'Retry-After': '300' } }
      : { status: 200 });
  } catch (error: unknown) {
    console.error(
      '[MediaSourceAudioRecoveryV1] sweep unavailable:',
      error instanceof Error ? error.name : 'unknown',
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: 'MEDIA_SOURCE_AUDIO_RECOVERY_UNAVAILABLE' },
      },
      { status: 503, headers: { 'Retry-After': '300' } },
    );
  }
}
