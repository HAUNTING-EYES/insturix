import { NextResponse } from 'next/server';

import { runMediaSourcePtsCadenceRecoveryV3 }
  from '@/lib/editron/services/media-source-pts-cadence-recovery-runtime-v3';

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
    const recovery = await runMediaSourcePtsCadenceRecoveryV3();
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
      '[MediaSourcePtsCadenceRecoveryV3] sweep unavailable:',
      error instanceof Error ? error.name : 'unknown',
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: 'MEDIA_SOURCE_PTS_CADENCE_RECOVERY_UNAVAILABLE' },
      },
      { status: 503, headers: { 'Retry-After': '300' } },
    );
  }
}
