/**
 * Client for the chapter-concatenation pipeline (the "real fix" for >15-min renders).
 *
 * Flow:
 *   chapter-renderer (all chapters done, multi-chapter)
 *     → enqueueChapterConcat(jobId, persistedGeneration)  [QStash, durable + retried]
 *       → POST /api/internal/workers/chapter-concat
 *         → concatenateChapters(persistedTarget)  [signed Modal handoff]
 *           → writes the exact target/result identity back onto the job doc
 *
 * Gated behind isChapterConcatConfigured(): without the Modal endpoint, signing token,
 * QStash and fixed server-owned output destination,
 * the chapter renderer fails loud (never ships a truncated chapter 0). See
 * modal/concat_chapters.py and the scope doc.
 */

import { createHash } from 'node:crypto';

import {
  assertProjectChapterConcatTargetV1,
  createSignedProjectChapterConcatRequestV1,
  isProjectChapterConcatDestinationConfiguredV1,
  projectChapterConcatOutputUrlV1,
  type ProjectChapterConcatTargetV1,
} from "./chapter-concat-contract-v1";

/** True only when the full async concat path is wired: Modal worker endpoint + token + QStash. */
export function isChapterConcatConfigured(): boolean {
  return Boolean(
    process.env.EDITRON_CHAPTER_CONCAT_ENDPOINT &&
      process.env.EDITRON_CHAPTER_CONCAT_TOKEN &&
      process.env.QSTASH_TOKEN &&
      isProjectChapterConcatDestinationConfiguredV1(),
  );
}

function chapterConcatWorkerUrl(): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/internal/workers/chapter-concat`;
}

/**
 * Enqueue the durable concat job. The persisted target generation is used as
 * QStash's stable deduplication identity; the worker lease remains the
 * correctness authority because a provider may still redeliver a message. A
 * missing/invalid generation is rejected before QStash, so this client cannot
 * dispatch an unbound legacy job.
 */
export async function enqueueChapterConcat(
  jobId: string,
  targetGeneration: string,
): Promise<void> {
  if (!/^chr_[A-Za-z0-9_-]{12}$/.test(jobId)) {
    throw new Error('CHAPTER_CONCAT_JOB_ID_INVALID');
  }
  const normalizedGeneration = targetGeneration.trim();
  if (!/^[a-f0-9]{64}$/.test(normalizedGeneration)) {
    throw new Error('CHAPTER_CONCAT_TARGET_GENERATION_INVALID');
  }
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN not set — cannot enqueue chapter concat');
  const { Client } = await import('@upstash/qstash');
  const qstash = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
  await qstash.publishJSON({
    url: chapterConcatWorkerUrl(),
    body: { jobId },
    retries: 3,
    // QStash rejects punctuation in some deduplication IDs. Hashing the
    // immutable target generation also keeps this ID opaque and bounded.
    deduplicationId: createHash('sha256').update(normalizedGeneration, 'utf8').digest('hex'),
  });
}

export interface ChapterConcatResult {
  generation: string;
  sourceManifestHash: string;
  outputBucket: string;
  outputRegion: string;
  outputKey: string;
  url: string;
  sizeBytes: number;
  chapters: number;
}

/**
 * Call the Modal concat worker with a persisted, server-owned target. The target
 * carries the ordered child manifest and the exact fixed destination; only its
 * canonical payload is signed and sent to Modal. Throws on any failure.
 */
export async function concatenateChapters(
  target: ProjectChapterConcatTargetV1,
): Promise<ChapterConcatResult> {
  const endpoint = process.env.EDITRON_CHAPTER_CONCAT_ENDPOINT;
  const token = process.env.EDITRON_CHAPTER_CONCAT_TOKEN;
  if (!endpoint || !token) throw new Error('Chapter concat endpoint/token not configured');
  assertProjectChapterConcatTargetV1(target);
  if (!isProjectChapterConcatDestinationConfiguredV1()) {
    throw new Error('CHAPTER_CONCAT_OUTPUT_DESTINATION_NOT_CONFIGURED');
  }
  const contract = createSignedProjectChapterConcatRequestV1(target, token);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ contract }),
  });

  const data = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        generation?: string;
        sourceManifestHash?: string;
        outputBucket?: string;
        outputRegion?: string;
        key?: string;
        url?: string;
        sizeBytes?: number;
        chapters?: number;
        error?: { message?: string };
      }
    | null;

  if (!res.ok || !data?.ok) {
    const msg = data?.error?.message || `Concat worker returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  const expectedUrl = projectChapterConcatOutputUrlV1(target);
  if (
    data.generation !== target.generation
    || data.sourceManifestHash !== target.sourceManifestHash
    || data.outputBucket !== target.outputBucket
    || data.outputRegion !== target.outputRegion
    || data.key !== target.outputKey
    || data.url !== expectedUrl
    || data.chapters !== target.sources.length
    || typeof data.sizeBytes !== 'number'
    || !Number.isSafeInteger(data.sizeBytes)
    || data.sizeBytes <= 0
  ) {
    throw new Error('CHAPTER_CONCAT_RESULT_IDENTITY_MISMATCH');
  }

  return {
    generation: data.generation,
    sourceManifestHash: data.sourceManifestHash,
    outputBucket: data.outputBucket,
    outputRegion: data.outputRegion,
    outputKey: data.key,
    url: data.url,
    sizeBytes: data.sizeBytes,
    chapters: data.chapters,
  };
}
