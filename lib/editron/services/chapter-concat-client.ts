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

import {
  assertProjectChapterConcatResultV1,
  assertProjectChapterConcatTargetV1,
  createProjectChapterConcatWorkerMessageV1,
  createSignedProjectChapterConcatRequestV1,
  isProjectChapterConcatDestinationConfiguredV1,
  projectChapterConcatDispatchIdV1,
  type ProjectChapterConcatResultV1,
  type ProjectChapterConcatTargetV1,
} from "./chapter-concat-contract-v1";
import { isInternalQStashDispatchConfigured } from "../security/internal-worker-auth";

const QSTASH_RETRY_DELAY = 'min(480000, max(30000, pow(2, retried) * 30000))';
const QSTASH_TIMEOUT_SECONDS = 300;
const CONCAT_PROVIDER_TIMEOUT_MS = 270_000;

function hasConfiguredValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/** True only when the full async concat path is wired: Modal worker endpoint + token + QStash. */
export function isChapterConcatConfigured(): boolean {
  return Boolean(
    hasConfiguredValue(process.env.EDITRON_CHAPTER_CONCAT_ENDPOINT) &&
      hasConfiguredValue(process.env.EDITRON_CHAPTER_CONCAT_TOKEN) &&
      isInternalQStashDispatchConfigured() &&
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
export interface ChapterConcatEnqueueReceipt {
  disposition: 'DISPATCHED' | 'DEDUPLICATED';
  messageId: string;
  deduplicationId: string;
}

export async function enqueueChapterConcat(
  jobId: string,
  targetGeneration: string,
): Promise<ChapterConcatEnqueueReceipt> {
  if (!/^chr_[A-Za-z0-9_-]{12}$/.test(jobId)) {
    throw new Error('CHAPTER_CONCAT_JOB_ID_INVALID');
  }
  const normalizedGeneration = targetGeneration.trim();
  if (!/^[a-f0-9]{64}$/.test(normalizedGeneration)) {
    throw new Error('CHAPTER_CONCAT_TARGET_GENERATION_INVALID');
  }
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) throw new Error('QSTASH_TOKEN not set — cannot enqueue chapter concat');
  const { Client } = await import('@upstash/qstash');
  const qstash = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
  const message = createProjectChapterConcatWorkerMessageV1({
    jobId,
    generation: normalizedGeneration,
  });
  const deduplicationId = projectChapterConcatDispatchIdV1(message);
  let published: { messageId?: unknown; deduplicated?: unknown };
  try {
    published = await qstash.publishJSON({
      url: chapterConcatWorkerUrl(),
      body: message,
      retries: 3,
      retryDelay: QSTASH_RETRY_DELAY,
      timeout: QSTASH_TIMEOUT_SECONDS,
      deduplicationId,
    });
  } catch {
    // The publish may have been accepted even when this request lost its
    // response. Throwing makes the existing renderer recovery retain the
    // exact target and retry with this same deduplication identity.
    throw new Error('CHAPTER_CONCAT_ENQUEUE_UNCONFIRMED');
  }
  if (
    typeof published?.messageId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(published.messageId)
  ) {
    throw new Error('CHAPTER_CONCAT_ENQUEUE_UNCONFIRMED');
  }
  return {
    disposition: published.deduplicated === true ? 'DEDUPLICATED' : 'DISPATCHED',
    messageId: published.messageId,
    deduplicationId,
  };
}

export type ChapterConcatResult = ProjectChapterConcatResultV1;

/**
 * Call the Modal concat worker with a persisted, server-owned target. The target
 * carries the ordered child manifest and the exact fixed destination; only its
 * canonical payload is signed and sent to Modal. Throws on any failure.
 */
export async function concatenateChapters(
  target: ProjectChapterConcatTargetV1,
): Promise<ChapterConcatResult> {
  const endpoint = process.env.EDITRON_CHAPTER_CONCAT_ENDPOINT?.trim();
  const token = process.env.EDITRON_CHAPTER_CONCAT_TOKEN?.trim();
  if (!endpoint || !token) throw new Error('Chapter concat endpoint/token not configured');
  assertProjectChapterConcatTargetV1(target);
  if (!isProjectChapterConcatDestinationConfiguredV1()) {
    throw new Error('CHAPTER_CONCAT_OUTPUT_DESTINATION_NOT_CONFIGURED');
  }
  const contract = createSignedProjectChapterConcatRequestV1(target, token);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONCAT_PROVIDER_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': target.generation,
      },
      body: JSON.stringify({ contract }),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (controller.signal.aborted) throw new Error('CHAPTER_CONCAT_PROVIDER_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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

  if (!res.ok || data?.ok !== true) {
    const msg = data?.error?.message || `Concat worker returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  const result = {
    generation: data.generation,
    sourceManifestHash: data.sourceManifestHash,
    outputBucket: data.outputBucket,
    outputRegion: data.outputRegion,
    outputKey: data.key,
    url: data.url,
    sizeBytes: data.sizeBytes,
    chapters: data.chapters,
  };
  assertProjectChapterConcatResultV1(result, target);
  return result;
}
