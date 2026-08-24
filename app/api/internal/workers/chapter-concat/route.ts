/**
 * POST /api/internal/workers/chapter-concat
 *
 * QStash worker that stitches a long video's per-chapter MP4s into one file.
 * Dispatched by the chapter renderer once all chapters of a multi-chapter (>15 min)
 * job complete (see lib/editron/services/chapter-renderer.ts).
 *
 * Loads the job, reassembles the chapter output URLs IN ORDER (chapters render out
 * of order), calls the Modal ffmpeg worker, and writes the assembled URL back onto
 * the job:
 *   success → { status: 'completed', outputUrl, concatStatus: 'done' }
 *   failure → { status: 'failed', concatStatus: 'failed', concatError }
 *
 * The job is left at concatStatus 'running' while in flight, so a crash before any
 * response is retried by QStash (3x) and re-runs cleanly; an explicit concat failure
 * is terminal (200) and recorded for the client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function handler(request: NextRequest) {
  try {
    const body = (await request.json()) as { jobId?: unknown };
    const jobId = body?.jobId;
    if (typeof jobId !== 'string' || !jobId.trim()) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const { CHAPTERS_COLLECTION } = await import('@/lib/editron/services/chapter-renderer');
    const { concatenateChapters } = await import('@/lib/editron/services/chapter-concat-client');

    const db = await getDatabase();
    const job = (await db.collection(CHAPTERS_COLLECTION).findOne({ _id: jobId } as any)) as any;
    if (!job) {
      return NextResponse.json({ error: 'Chapter render job not found' }, { status: 404 });
    }

    // Reassemble chapter outputs IN ORDER — chapters finish out of order, the video must not.
    const orderedUrls: string[] = [...(job.chapters || [])]
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((c: any) => c.outputUrl)
      .filter((u: any): u is string => typeof u === 'string' && u.length > 0);

    if (orderedUrls.length < 2) {
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        {
          $set: {
            status: 'failed',
            concatStatus: 'failed',
            concatError: `Expected ≥2 chapter outputs to concatenate, found ${orderedUrls.length}.`,
            updatedAt: new Date(),
          },
        },
      );
      return NextResponse.json({ success: false, error: 'insufficient_chapter_outputs' }, { status: 200 });
    }

    // Mark in-flight so the progress poll shows "still working" (not stuck on 'queued').
    await db.collection(CHAPTERS_COLLECTION).updateOne(
      { _id: jobId } as any,
      { $set: { concatStatus: 'running', updatedAt: new Date() } },
    );

    try {
      const result = await concatenateChapters(orderedUrls, jobId);
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        {
          $set: {
            status: 'completed',
            outputUrl: result.url,
            concatStatus: 'done',
            updatedAt: new Date(),
          },
        },
      );
      console.log(`[ChapterConcat] Job ${jobId}: stitched ${result.chapters} chapters → ${result.url}`);
      return NextResponse.json({ success: true, url: result.url });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: jobId } as any,
        { $set: { status: 'failed', concatStatus: 'failed', concatError: msg, updatedAt: new Date() } },
      );
      console.error(`[ChapterConcat] Job ${jobId}: concat failed: ${msg}`);
      // Terminal failure — recorded for the client; do not 500 (would QStash-retry a bad input).
      return NextResponse.json({ success: false, error: msg }, { status: 200 });
    }
  } catch (error: unknown) {
    // Unexpected error before we recorded a terminal state → 500 so QStash retries.
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ChapterConcat] Worker error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withInternalQStashWorkerAuth(handler, 'chapter-concat');
