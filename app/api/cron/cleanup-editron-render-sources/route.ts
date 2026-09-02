import { NextResponse } from "next/server";

import {
  runProjectRenderSourceCleanupBatchV1,
  type ProjectRenderSourceCleanupBatchResultV1,
} from "@/lib/editron/services/project-render-source-cleanup-runtime-v1";

export const runtime = "nodejs";
export const maxDuration = 60;

type CleanupRunnerV1 = (input: { limit: number }) =>
  Promise<ProjectRenderSourceCleanupBatchResultV1>;

export async function handleProjectRenderSourceCleanupCronV1(
  request: Request,
  runner: CleanupRunnerV1 = runProjectRenderSourceCleanupBatchV1,
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
    const cleanup = await runner({ limit: 5 });
    const retryRequired = cleanup.failed > 0;
    return NextResponse.json(
      { success: !retryRequired, cleanup },
      retryRequired
        ? { status: 503, headers: { "Retry-After": "300" } }
        : { status: 200 },
    );
  } catch (error: unknown) {
    console.error(
      "[ProjectRenderSourceCleanupV1] sweep unavailable:",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: "PROJECT_RENDER_SOURCE_CLEANUP_UNAVAILABLE" },
      },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleProjectRenderSourceCleanupCronV1(request);
}
