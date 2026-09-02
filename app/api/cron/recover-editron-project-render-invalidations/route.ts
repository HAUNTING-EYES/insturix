import { NextResponse } from "next/server";

import {
  runProjectRenderSnapshotRecoveryCycleV1,
  type ProjectRenderSnapshotRecoveryCycleResultV1,
} from "@/lib/editron/services/project-render-snapshot-invalidation-cleanup-recovery-v1";

export const runtime = "nodejs";
export const maxDuration = 60;

type RecoveryRunnerV1 = (input: { limit: number }) =>
  Promise<ProjectRenderSnapshotRecoveryCycleResultV1>;

export async function handleProjectRenderSnapshotInvalidationRecoveryCronV1(
  request: Request,
  runner: RecoveryRunnerV1 = runProjectRenderSnapshotRecoveryCycleV1,
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
    const errors = recovery.invalidation.errors + recovery.cleanup.errors;
    const recoveryRequired = recovery.invalidation.awaitingCommit > 0
      || recovery.invalidation.pending > 0
      || recovery.cleanup.handoffCreated > 0
      || recovery.cleanup.handoffPending > 0
      || recovery.cleanup.providerOutcomeUnresolved > 0
      || recovery.cleanup.chapterOwnerRequired > 0;
    return NextResponse.json({
      success: errors === 0,
      recovery,
      recoveryRequired,
    }, errors > 0
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
