import { NextResponse } from "next/server";

import {
  sweepProjectRenderDispatchRecoveryV1,
  type ProjectRenderDispatchRecoveryResultV1,
} from "@/lib/editron/services/render-dispatch-recovery-v1";

export const runtime = "nodejs";
export const maxDuration = 60;

type RecoveryRunnerV1 = (input: { limit: number }) =>
  Promise<ProjectRenderDispatchRecoveryResultV1>;

export async function handleProjectRenderDispatchRecoveryCronV1(
  request: Request,
  runner: RecoveryRunnerV1 = sweepProjectRenderDispatchRecoveryV1,
): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: { code: "CRON_SECRET_NOT_CONFIGURED" } },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED" } },
      { status: 401 },
    );
  }

  try {
    const recovery = await runner({ limit: 5 });
    const recoveryRequired = recovery.quarantined > 0 || recovery.skipped > 0;
    return NextResponse.json({
      success: recovery.errors === 0,
      recovery,
      recoveryRequired,
    }, recovery.errors > 0
      ? { status: 503, headers: { "Retry-After": "300" } }
      : { status: 200 });
  } catch (error: unknown) {
    console.error(
      "[ProjectRenderDispatchRecoveryV1] sweep unavailable:",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: "PROJECT_RENDER_DISPATCH_RECOVERY_UNAVAILABLE" },
      },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleProjectRenderDispatchRecoveryCronV1(request);
}
