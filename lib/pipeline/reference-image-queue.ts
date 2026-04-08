/**
 * Reference Image Generation Queue (QStash-direct pattern)
 *
 * Bundle 4 (2026-04-09): Moves reference-image generation from inline
 * `generateAllReferenceImages` (300s Vercel timeout pressure) + the four
 * 60s-capped routes (add-subject, subject regenerate, etc.) to a per-subject
 * QStash worker architecture.
 *
 * Mirrors lib/pipeline/storyboard-image-queue.ts — same contract.
 */

import { nanoid } from 'nanoid';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const REFERENCE_IMAGE_BATCHES_COLLECTION = 'pipeline_reference_image_batches';
export const REFERENCE_IMAGE_JOBS_COLLECTION = 'pipeline_reference_image_jobs';

export type ReferenceImageJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export type ReferenceImageJobIntent =
  | 'initial-generation' // First-time generation for an extracted subject
  | 'add-subject' // New manual subject added to an existing ref set
  | 'regenerate'; // Regenerate an existing subject with feedback

export interface ReferenceImageJob {
  _id: string; // `${batchId}_${subjectId}`
  batchId: string;
  refSetId: string;
  userId: string;
  subjectId: string;
  /** Subject name for logging + idempotency */
  subjectName: string;
  intent: ReferenceImageJobIntent;
  status: ReferenceImageJobStatus;
  imageUrl?: string;
  imageAssetId?: string;
  error?: string;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  expiresAt: Date;
}

export interface ReferenceImageBatch {
  _id: string; // batchId
  userId: string;
  refSetId: string;
  totalSubjects: number;
  completed: number;
  failed: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export async function createReferenceImageBatch(
  userId: string,
  refSetId: string,
  subjects: Array<{ subjectId: string; name: string }>,
  intent: ReferenceImageJobIntent = 'initial-generation',
): Promise<{ batchId: string; jobIds: string[] }> {
  const batchId = `rib_${nanoid(12)}`;
  const db = await getDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h TTL

  const batch: ReferenceImageBatch = {
    _id: batchId,
    userId,
    refSetId,
    totalSubjects: subjects.length,
    completed: 0,
    failed: 0,
    status: 'processing',
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
  await db.collection(REFERENCE_IMAGE_BATCHES_COLLECTION).insertOne(batch as any);

  const jobIds: string[] = [];
  const jobDocs: ReferenceImageJob[] = subjects.map((s) => {
    const jobId = `${batchId}_${s.subjectId}`;
    jobIds.push(jobId);
    return {
      _id: jobId,
      batchId,
      refSetId,
      userId,
      subjectId: s.subjectId,
      subjectName: s.name,
      intent,
      status: 'queued' as const,
      attempts: 0,
      createdAt: now,
      expiresAt,
    };
  });

  if (jobDocs.length > 0) {
    await db.collection(REFERENCE_IMAGE_JOBS_COLLECTION).insertMany(jobDocs as any[]);
  }

  console.log(`[ReferenceImageQueue] Created batch ${batchId}: ${subjects.length} subjects for ${refSetId} (intent=${intent})`);

  return { batchId, jobIds };
}

export async function updateReferenceImageBatchStatus(batchId: string): Promise<ReferenceImageBatch | null> {
  const db = await getDatabase();
  const batch = (await db
    .collection(REFERENCE_IMAGE_BATCHES_COLLECTION)
    .findOne({ _id: batchId } as any)) as any;
  if (!batch) return null;

  const done = (batch.completed || 0) + (batch.failed || 0);
  let status: ReferenceImageBatch['status'] = 'processing';
  if (done >= batch.totalSubjects) {
    if (batch.failed === 0) status = 'completed';
    else if (batch.completed === 0) status = 'failed';
    else status = 'partial';
  }

  await db.collection(REFERENCE_IMAGE_BATCHES_COLLECTION).updateOne(
    { _id: batchId } as any,
    { $set: { status, updatedAt: new Date() } },
  );

  return { ...batch, status } as ReferenceImageBatch;
}

export async function incrementReferenceImageBatchCompleted(batchId: string): Promise<void> {
  const db = await getDatabase();
  await db.collection(REFERENCE_IMAGE_BATCHES_COLLECTION).updateOne(
    { _id: batchId } as any,
    { $inc: { completed: 1 }, $set: { updatedAt: new Date() } },
  );
}

export async function incrementReferenceImageBatchFailed(batchId: string): Promise<void> {
  const db = await getDatabase();
  await db.collection(REFERENCE_IMAGE_BATCHES_COLLECTION).updateOne(
    { _id: batchId } as any,
    { $inc: { failed: 1 }, $set: { updatedAt: new Date() } },
  );
}

export async function getReferenceImageBatchStatus(
  batchId: string,
  userId: string,
): Promise<{ batch: ReferenceImageBatch | null; jobs: ReferenceImageJob[] }> {
  const db = await getDatabase();
  const batch = (await db
    .collection(REFERENCE_IMAGE_BATCHES_COLLECTION)
    .findOne({ _id: batchId, userId } as any)) as any;
  if (!batch) return { batch: null, jobs: [] };

  const jobs = (await db
    .collection(REFERENCE_IMAGE_JOBS_COLLECTION)
    .find({ batchId, userId } as any)
    .sort({ createdAt: 1 })
    .toArray()) as any[];

  return { batch, jobs };
}

/**
 * Payload passed to the reference-image worker via QStash.
 */
export interface ReferenceImageWorkerPayload {
  jobId: string;
  batchId: string;
  userId: string;
  refSetId: string;
  subjectId: string;
  intent: ReferenceImageJobIntent;
  /** Full subject data needed to generate. For 'regenerate', feedback is in options. */
  subject: {
    subjectId: string;
    name: string;
    category: 'character' | 'product' | 'location' | 'object' | 'vehicle';
    visualDescription: string;
    scenesAppearingIn: number[];
    /** For regenerate: the previous imageUrl so worker can pass it as reference */
    previousImageUrl?: string;
  };
  artStyle?: string;
  modelId?: string;
  /** Feedback text for regenerate intent */
  feedback?: string;
}
