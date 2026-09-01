import { NextResponse } from 'next/server';

import {
  DEFAULT_PROJECT_RENDER_BILLING_RECOVERY_BATCH_SIZE_V1,
  sweepProjectRenderBillingRecoveryV1,
  type ProjectRenderBillingRecoveryResultV1,
} from '@/lib/editron/services/render-billing-recovery-v1';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RecoveryRunnerV1 = (input: { limit: number }) =>
  Promise<ProjectRenderBillingRecoveryResultV1>;

export async function handleProjectRenderBillingRecoveryCronV1(
  request: Request,
  runner: RecoveryRunnerV1 = sweepProjectRenderBillingRecoveryV1,
): Promise<NextResponse> {
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
    const recovery = await runner({
      limit: DEFAULT_PROJECT_RENDER_BILLING_RECOVERY_BATCH_SIZE_V1,
    });
    const recoveryRequired = recovery.notFound > 0
      || recovery.ambiguous > 0
      || recovery.invalid > 0
      || recovery.stale > 0
      || recovery.conflicts > 0
      || recovery.skipped > 0
      || recovery.errors > 0;
    return NextResponse.json({
      success: recovery.errors === 0,
      recovery,
      recoveryRequired,
    }, recovery.errors > 0
      ? { status: 503, headers: { 'Retry-After': '300' } }
      : { status: 200 });
  } catch (error: unknown) {
    console.error(
      '[ProjectRenderBillingRecoveryV1] sweep unavailable:',
      error instanceof Error ? error.name : 'unknown',
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: 'PROJECT_RENDER_BILLING_RECOVERY_UNAVAILABLE' },
      },
      { status: 503, headers: { 'Retry-After': '300' } },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleProjectRenderBillingRecoveryCronV1(request);
}

