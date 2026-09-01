import { NextResponse } from 'next/server';

import {
  runChapterRenderRetentionBatchV1,
  type ChapterRenderRetentionBatchResultV1,
} from '@/lib/editron/services/chapter-render-retention-runtime-v1';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RetentionRunnerV1 = (input: { limit: number }) =>
  Promise<ChapterRenderRetentionBatchResultV1>;

export async function handleChapterRenderRetentionCronV1(
  request: Request,
  runner: RetentionRunnerV1 = runChapterRenderRetentionBatchV1,
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
    const retention = await runner({ limit: 10 });
    const retryRequired = retention.failed > 0;
    return NextResponse.json(
      { success: !retryRequired, retention },
      retryRequired
        ? { status: 503, headers: { 'Retry-After': '300' } }
        : { status: 200 },
    );
  } catch (error: unknown) {
    console.error(
      '[ChapterRenderRetentionV1] sweep unavailable:',
      error instanceof Error ? error.name : 'unknown',
    );
    return NextResponse.json(
      { success: false, error: { code: 'CHAPTER_RENDER_RETENTION_UNAVAILABLE' } },
      { status: 503, headers: { 'Retry-After': '300' } },
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleChapterRenderRetentionCronV1(request);
}
