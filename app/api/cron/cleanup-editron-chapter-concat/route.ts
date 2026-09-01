import { NextResponse } from "next/server";

import {
  runProjectChapterConcatCleanupBatchV1,
  type ProjectChapterConcatCleanupBatchResultV1,
} from "@/lib/editron/services/chapter-concat-cleanup-runtime-v1";

export const runtime = "nodejs";
export const maxDuration = 60;

type CleanupRunnerV1 = (input: { limit: number }) =>
  Promise<ProjectChapterConcatCleanupBatchResultV1>;

export async function handleProjectChapterConcatCleanupCronV1(
  request: Request,
  runner: CleanupRunnerV1 = runProjectChapterConcatCleanupBatchV1,
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
      "[ProjectChapterConcatCleanupV1] sweep unavailable:",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        success: false,
        error: { code: "PROJECT_CHAPTER_CONCAT_CLEANUP_UNAVAILABLE" },
      },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }
}

export const handleChapterConcatCleanupCronV1 = handleProjectChapterConcatCleanupCronV1;

export async function GET(request: Request): Promise<NextResponse> {
  return handleProjectChapterConcatCleanupCronV1(request);
}
