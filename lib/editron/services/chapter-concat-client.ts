/**
 * Client for the chapter-concatenation pipeline (the "real fix" for >15-min renders).
 *
 * Flow:
 *   chapter-renderer (all chapters done, multi-chapter)
 *     → enqueueChapterConcat(jobId)  [QStash, durable + retried]
 *       → POST /api/internal/workers/chapter-concat
 *         → concatenateChapters(orderedUrls, jobId)  [calls the Modal ffmpeg worker]
 *           → writes status/outputUrl back onto the render-chapters job doc
 *
 * Gated behind isChapterConcatConfigured(): without the Modal endpoint + token + QStash,
 * the chapter renderer fails loud (never ships a truncated chapter 0). See
 * modal/concat_chapters.py and the scope doc.
 */

/** True only when the full async concat path is wired: Modal worker endpoint + token + QStash. */
export function isChapterConcatConfigured(): boolean {
  return Boolean(
    process.env.EDITRON_CHAPTER_CONCAT_ENDPOINT &&
      process.env.EDITRON_CHAPTER_CONCAT_TOKEN &&
      process.env.QSTASH_TOKEN,
  );
}

function chapterConcatWorkerUrl(): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/internal/workers/chapter-concat`;
}

/**
 * Enqueue the durable concat job. Idempotency is the caller's responsibility (the chapter
 * renderer claims `concatStatus` atomically before calling this). Mirrors the QStash producer
 * pattern in director-agent.ts. Throws if QStash is not configured (caller releases the claim).
 */
export async function enqueueChapterConcat(jobId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN not set — cannot enqueue chapter concat');
  const { Client } = await import('@upstash/qstash');
  const qstash = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
  await qstash.publishJSON({
    url: chapterConcatWorkerUrl(),
    body: { jobId },
    retries: 3,
  });
}

export interface ChapterConcatResult {
  url: string;
  sizeBytes: number;
  chapters: number;
}

/**
 * Call the Modal concat worker: download the ordered chapter MP4s → ffmpeg stream-copy concat →
 * upload the assembled file → return its public URL. Throws on any failure (the worker route
 * records that as a terminal concat failure on the job).
 */
export async function concatenateChapters(
  orderedChapterUrls: string[],
  jobId: string,
): Promise<ChapterConcatResult> {
  const endpoint = process.env.EDITRON_CHAPTER_CONCAT_ENDPOINT;
  const token = process.env.EDITRON_CHAPTER_CONCAT_TOKEN;
  if (!endpoint || !token) throw new Error('Chapter concat endpoint/token not configured');
  if (orderedChapterUrls.length < 2) throw new Error('Need at least 2 chapter URLs to concatenate');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ chapters: orderedChapterUrls, jobId }),
  });

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; url?: string; sizeBytes?: number; chapters?: number; error?: { message?: string } }
    | null;

  if (!res.ok || !data?.ok || typeof data.url !== 'string') {
    const msg = data?.error?.message || `Concat worker returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  return {
    url: data.url,
    sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
    chapters: typeof data.chapters === 'number' ? data.chapters : orderedChapterUrls.length,
  };
}
