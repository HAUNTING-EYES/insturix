/**
 * SaaS Explainer — job tracking (Phase 2, additive).
 *
 * Mirrors the proven render-job-service pattern (Mongo, _id = jobId, status/progress) but on its OWN collection
 * so it CANNOT affect the existing render pipeline. The finalize route creates a `queued` job carrying the
 * craft-worker inputs; the heavy craft-and-render worker (a Node box with Chromium + Anthropic + AWS — NOT a
 * serverless route) claims it via claimNextQueuedExplainerJob, runs, and reports progress/result here.
 */
import { createHash } from 'node:crypto';
import type { Collection } from 'mongodb';
import { nanoid } from 'nanoid';
import { getDatabase } from '@/lib/editron/db/mongodb';
import type { ExplainerPlan, ExplainerProductModel } from '@/lib/editron/saas-explainer/director-to-plan';
import { resolveVoice } from '@/lib/editron/saas-explainer/vo-voices';

const COLLECTION_NAME = 'editron_explainer_jobs';

export type ExplainerJobStatus = 'queued' | 'rendering' | 'done' | 'error';

export interface ExplainerJob {
  _id: string;
  userId: string;
  projectId?: string;
  brandId?: string;
  /** Stable per-video id (also used for the Lambda site name). */
  videoId: string;
  /** edge-tts voice id for the VO (see vo-voices catalog). */
  voice: string;
  status: ExplainerJobStatus;
  /** 0..1 */
  progress: number;
  /** Craft-worker inputs, carried on the job so the worker reads them from Mongo. */
  plan: ExplainerPlan;
  productModel: ExplainerProductModel;
  productImageUrls: string[];
  /** Style-reference images (video frames / a link screenshot) the craft agent designs to match. */
  referenceImageUrls: string[];
  /** Style-reference VIDEO (Gemini craft models only) — drives scene MOTION, not just stills. */
  referenceVideoUrl?: string;
  /**
   * Render-idempotency key, derived server-side from the render payload. Present while the job is active or done
   * (so a duplicate/replayed finalize returns THIS job instead of enqueuing another paid render); cleared on error
   * so a genuine retry can re-enqueue. Enforced unique by a partial index — see ensureExplainerIndexes.
   */
  idempotencyKey?: string;
  outputUrl?: string;
  costUsd?: number | null;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

async function getCollection(): Promise<Collection<ExplainerJob>> {
  const db = await getDatabase();
  return db.collection<ExplainerJob>(COLLECTION_NAME);
}

// Unique index on idempotencyKey, but ONLY over jobs that still carry one (active or done — errored jobs clear it,
// see failExplainerJob). This makes a concurrent double-submit collide on insert instead of creating two renders,
// while still allowing a legitimate retry after failure. createIndex is idempotent; guarded so it runs once/process.
let _indexesEnsured = false;
async function ensureExplainerIndexes(collection: Collection<ExplainerJob>): Promise<void> {
  if (_indexesEnsured) return;
  await collection.createIndex(
    { idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } }, name: 'idempotencyKey_unique' },
  );
  _indexesEnsured = true;
}

/**
 * Derive the render-idempotency key from the exact inputs that define "the same render": the user, the plan, the
 * product model, the references, and the voice. Same inputs → same key → at most one paid render. A deterministic
 * SHA-256 over canonical JSON; order-stable because it hashes the already-built objects, not a re-serialization.
 */
export function deriveExplainerIdempotencyKey(input: {
  userId: string;
  plan: ExplainerPlan;
  productModel: ExplainerProductModel;
  referenceImageUrls?: string[];
  referenceVideoUrl?: string;
  voice?: string;
}): string {
  const material = JSON.stringify({
    u: input.userId,
    p: input.plan,
    m: input.productModel,
    r: input.referenceImageUrls ?? [],
    v: input.referenceVideoUrl ?? '',
    voice: input.voice ?? '',
  });
  return createHash('sha256').update(material).digest('hex');
}

export interface CreateExplainerJobInput {
  userId: string;
  projectId?: string;
  brandId?: string;
  plan: ExplainerPlan;
  productModel: ExplainerProductModel;
  productImageUrls?: string[];
  /** Style-reference images (video frames / link screenshot) the craft agent matches. */
  referenceImageUrls?: string[];
  /** Style-reference VIDEO (Gemini craft models only) — drives scene MOTION. */
  referenceVideoUrl?: string;
  /** edge-tts voice id; falls back to the default if unknown/empty. */
  voice?: string;
  /** Render-idempotency key (see deriveExplainerIdempotencyKey). When set, a duplicate returns the existing job. */
  idempotencyKey?: string;
}

/**
 * Enqueue an explainer render job (status `queued`), IDEMPOTENTLY when `idempotencyKey` is set: a duplicate or
 * replayed request returns the existing active/done job instead of creating a second paid render. The unique
 * partial index makes a concurrent double-submit collide on insert; we catch that and return the winner.
 */
export async function createExplainerJob(input: CreateExplainerJobInput): Promise<ExplainerJob> {
  const collection = await getCollection();
  const key = input.idempotencyKey;
  if (key) {
    await ensureExplainerIndexes(collection);
    // Fast path: an identical request that is still active or already done → return THAT job (one render, one charge).
    const existing = await collection.findOne({ idempotencyKey: key });
    if (existing) return existing;
  }
  const job: ExplainerJob = {
    _id: nanoid(),
    userId: input.userId,
    projectId: input.projectId,
    brandId: input.brandId,
    videoId: `v${nanoid(10)}`,
    voice: resolveVoice(input.voice),
    status: 'queued',
    progress: 0,
    plan: input.plan,
    productModel: input.productModel,
    productImageUrls: input.productImageUrls ?? input.productModel.productImageUrls ?? [],
    referenceImageUrls: input.referenceImageUrls ?? [],
    ...(input.referenceVideoUrl ? { referenceVideoUrl: input.referenceVideoUrl } : {}),
    ...(key ? { idempotencyKey: key } : {}),
    createdAt: new Date(),
  };
  try {
    const result = await collection.insertOne(job as ExplainerJob);
    if (!result.acknowledged) throw new Error('explainer-job: failed to insert job');
    return job;
  } catch (err) {
    // Concurrent identical submit lost the unique-index race → return the winner rather than erroring / double-charging.
    if (key && (err as { code?: number }).code === 11000) {
      const winner = await collection.findOne({ idempotencyKey: key });
      if (winner) return winner;
    }
    throw err;
  }
}

/** Atomically claim the oldest queued job (queued → rendering). Returns null if none. For the worker poll loop. */
export async function claimNextQueuedExplainerJob(): Promise<ExplainerJob | null> {
  const collection = await getCollection();
  const res = await collection.findOneAndUpdate(
    { status: 'queued' },
    { $set: { status: 'rendering', startedAt: new Date() } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
  return res ?? null;
}

export async function updateExplainerJobProgress(jobId: string, progress: number): Promise<void> {
  await (await getCollection()).updateOne({ _id: jobId }, { $set: { progress } });
}

export async function completeExplainerJob(jobId: string, outputUrl: string, costUsd: number | null): Promise<void> {
  await (await getCollection()).updateOne(
    { _id: jobId },
    { $set: { status: 'done', progress: 1, outputUrl, costUsd, completedAt: new Date() } },
  );
}

export async function failExplainerJob(jobId: string, error: string): Promise<void> {
  // Clear the idempotency key so a genuine retry of the same request can re-enqueue (the unique index only holds
  // over jobs that still carry a key). A duplicate of a SUCCEEDED render still dedupes; a failed one is retryable.
  await (await getCollection()).updateOne(
    { _id: jobId },
    { $set: { status: 'error', error, completedAt: new Date() }, $unset: { idempotencyKey: '' } },
  );
}

export async function getExplainerJob(jobId: string): Promise<ExplainerJob | null> {
  return (await getCollection()).findOne({ _id: jobId });
}
