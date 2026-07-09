/**
 * SaaS Explainer — job tracking (Phase 2, additive).
 *
 * Mirrors the proven render-job-service pattern (Mongo, _id = jobId, status/progress) but on its OWN collection
 * so it CANNOT affect the existing render pipeline. The finalize route creates a `queued` job carrying the
 * craft-worker inputs; the heavy craft-and-render worker (a Node box with Chromium + Anthropic + AWS — NOT a
 * serverless route) claims it via claimNextQueuedExplainerJob, runs, and reports progress/result here.
 */
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

export interface CreateExplainerJobInput {
  userId: string;
  projectId?: string;
  brandId?: string;
  plan: ExplainerPlan;
  productModel: ExplainerProductModel;
  productImageUrls?: string[];
  /** edge-tts voice id; falls back to the default if unknown/empty. */
  voice?: string;
}

/** Enqueue a new explainer render job (status `queued`). */
export async function createExplainerJob(input: CreateExplainerJobInput): Promise<ExplainerJob> {
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
    createdAt: new Date(),
  };
  const result = await (await getCollection()).insertOne(job as ExplainerJob);
  if (!result.acknowledged) throw new Error('explainer-job: failed to insert job');
  return job;
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
  await (await getCollection()).updateOne(
    { _id: jobId },
    { $set: { status: 'error', error, completedAt: new Date() } },
  );
}

export async function getExplainerJob(jobId: string): Promise<ExplainerJob | null> {
  return (await getCollection()).findOne({ _id: jobId });
}
