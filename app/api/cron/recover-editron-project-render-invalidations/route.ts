import { NextResponse } from "next/server";

import {
  sweepProjectRenderSnapshotInvalidationRecoveryV1,
  type ProjectRenderSnapshotInvalidationRecoveryResultV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-recovery-v1";

export const runtime = "nodejs";
export const maxDuration = 60;

type RecoveryRunnerV1 = (input: { limit: number }) =>
  Promise<ProjectRenderSnapshotInvalidationRecoveryResultV1>;

export async function handleProjectRenderSnapshotInvalidationRecoveryCronV1(
  request: Request,
  runner: RecoveryRunnerV1 = sweepProjectRenderSnapshotInvalidationRecoveryV1,
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
    return NextResponse.json({
      success: recovery.errors === 0,
      recovery,
      recoveryRequired: recovery.awaitingCommit > 0 || recovery.pending > 0,
    }, recovery.errors > 0
      ? { status: 503, headers: { "Retry-After": "60" } }
      : { status: 200 });
  } catch (error: unknown) {
    console.error(
      "[ProjectRenderSnapshotInvalidationRecoveryV1] sweep unavailable:",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: "PROJECT_RENDER_SNAPSHOT_INVALIDATION_RECOVERY_UNAVAILABLE" },
      },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleProjectRenderSnapshotInvalidationRecoveryCronV1(request);
}
