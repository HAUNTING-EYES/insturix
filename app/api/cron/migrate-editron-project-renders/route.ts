import { NextResponse } from "next/server";

import {
  runProjectRenderLifecycleMigrationBatchV1,
  type ProjectRenderLifecycleMigrationBatchResultV1,
} from "@/lib/editron/services/project-render-lifecycle-migration-runtime-v1";

export const runtime = "nodejs";
export const maxDuration = 60;

type MigrationRunnerV1 = (input: { limit: number }) =>
  Promise<ProjectRenderLifecycleMigrationBatchResultV1>;

export async function handleProjectRenderLifecycleMigrationCronV1(
  request: Request,
  runner: MigrationRunnerV1 = runProjectRenderLifecycleMigrationBatchV1,
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
    const migration = await runner({ limit: 10 });
    const retryRequired = migration.failed > 0;
    return NextResponse.json(
      { success: !retryRequired, migration },
      retryRequired
        ? { status: 503, headers: { "Retry-After": "300" } }
        : { status: 200 },
    );
  } catch (error: unknown) {
    console.error(
      "[ProjectRenderLifecycleMigrationV1] sweep unavailable:",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { success: false, error: { code: "PROJECT_RENDER_LIFECYCLE_MIGRATION_UNAVAILABLE" } },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleProjectRenderLifecycleMigrationCronV1(request);
}
