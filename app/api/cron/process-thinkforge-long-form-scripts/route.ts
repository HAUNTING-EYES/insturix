import { NextRequest, NextResponse } from 'next/server';
import { recoverStalledLongFormScriptJobs } from '@/lib/thinkforge/long-form/script-generation-job';
import { recoverProductionContractRefreshJobs } from '@/lib/thinkforge/production-contract-refresh/job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/process-thinkforge-long-form-scripts] CRON_SECRET is not configured.');
    return NextResponse.json({ ok: false, error: 'Cron authentication is not configured.' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [longFormScripts, productionContractRefreshes] = await Promise.all([
      recoverStalledLongFormScriptJobs(),
      recoverProductionContractRefreshJobs(),
    ]);
    return NextResponse.json({
      ok: true,
      recovery: { longFormScripts, productionContractRefreshes },
      timestamp: new Date().toISOString(),
    });
  } catch {
    console.error('[cron/process-thinkforge-long-form-scripts] ThinkForge durable-work recovery failed.');
    return NextResponse.json({ ok: false, error: 'ThinkForge durable-work recovery failed.' }, { status: 500 });
  }
}
