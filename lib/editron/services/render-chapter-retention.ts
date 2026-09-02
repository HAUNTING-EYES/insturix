/**
 * Plan-based retention for render-chapter intermediates.
 *
 * A long render is split into chapters and each render produces a transient job document. The
 * document may be retired only after its plan window expires AND every linked provider-cleanup
 * outbox has a valid DONE receipt. A durable tombstone is written in the same transaction as the
 * deletion. A Mongo TTL index is deliberately forbidden because it cannot prove external cleanup.
 *
 * NOTE: the day values below are the founder's stated tiers; they should ultimately live in the plan
 * `serviceLimits` config (credits session), same as the storage GB numbers.
 */

import type { ClientSession, Collection } from 'mongodb';

import { getPlanRetentionDays } from '@/lib/config/plan-limits';
import {
  assertProjectChapterConcatCleanupOutboxV1,
  ProjectChapterConcatCleanupOutboxSchemaV1,
  type ProjectChapterConcatCleanupOutboxV1,
} from './chapter-concat-cleanup-v1';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  assertProjectRenderSourceCleanupOutboxV1,
  ProjectRenderSourceCleanupOutboxSchemaV1,
  type ProjectRenderSourceCleanupOutboxV1,
} from './project-render-source-cleanup-v1';

export const CHAPTER_RENDER_RETENTION_RECEIPTS_COLLECTION_V1 =
  'editron_render_chapter_retention_receipts_v1' as const;

const CHAPTER_JOB_ID = /^chr_[A-Za-z0-9_-]{12}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const CLEANUP_BOUNDARIES = new Set([
  'CURRENT_SUCCESS',
  'STALE_FINALIZATION',
  'STALE_PROVIDER_OUTPUT',
  'TERMINAL_FINALIZATION_FAILURE',
]);

type ChapterCleanupMaterializationV1 = {
  schemaVersion: 1;
  boundary: string;
  childOutboxIds: string[];
  concatOutboxId?: string;
  materializedAt: Date;
};

export type ChapterRenderRetentionJobV1 = {
  _id: string;
  artifactLifecycleVersion?: unknown;
  artifactState?: unknown;
  retentionState?: unknown;
  artifactInvalidatedAt?: unknown;
  expiresAt?: unknown;
  projectRenderSnapshotBinding?: unknown;
  cleanupMaterialization?: unknown;
};

export type ChapterRenderRetentionReceiptV1 = {
  _id: string;
  schemaVersion: 1;
  scope: 'CHAPTER_RENDER_RETENTION';
  chapterJobId: string;
  bindingHash: string;
  cleanupBoundary: string;
  childOutboxIds: string[];
  concatOutboxId?: string;
  artifactInvalidatedAt: Date;
  expiresAt: Date;
  deletedAt: Date;
  receiptHash: string;
};

export type ChapterRenderRetentionResultV1 =
  | { ok: true; status: 'RETIRED' | 'ALREADY_RETIRED'; receipt: ChapterRenderRetentionReceiptV1 }
  | { ok: true; status: 'RETAINED'; expiresAt: Date }
  | { ok: true; status: 'WAITING_FOR_CLEANUP'; outboxId: string; cleanupStatus: string }
  | { ok: false; status: 'NOT_FOUND' };

/** Smallest tier — used when the plan is unknown/missing (fail to the least generous retention). */
export const BASE_RENDER_CHAPTER_RETENTION_DAYS = 7;

/**
 * Retention window in days for a given plan tier. Delegates to the central
 * PLAN_LIMITS (lib/config/plan-limits) so retention + storage share one source.
 * Case-insensitive; accepts plan type or display name; unknown/missing → base (7d).
 */
export function renderChapterRetentionDays(planType?: string | null): number {
  return getPlanRetentionDays(planType);
}

/** The date a render-chapter job should auto-expire, given when it was created and the owner's plan. */
export function renderChapterExpiresAt(createdAt: Date, planType?: string | null): Date {
  return new Date(createdAt.getTime() + renderChapterRetentionDays(planType) * 24 * 60 * 60 * 1000);
}

function fail(code: string): never {
  throw new Error(`CHAPTER_RENDER_RETENTION_${code}`);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseCleanupMaterialization(value: unknown): ChapterCleanupMaterializationV1 {
  const candidate = record(value);
  if (
    candidate?.schemaVersion !== 1
    || typeof candidate.boundary !== 'string'
    || !CLEANUP_BOUNDARIES.has(candidate.boundary)
    || !Array.isArray(candidate.childOutboxIds)
    || candidate.childOutboxIds.length === 0
    || candidate.childOutboxIds.length > 64
    || candidate.childOutboxIds.some((id) => typeof id !== 'string' || id.length === 0)
    || new Set(candidate.childOutboxIds).size !== candidate.childOutboxIds.length
    || candidate.concatOutboxId !== undefined && typeof candidate.concatOutboxId !== 'string'
    || !validDate(candidate.materializedAt)
  ) fail('CLEANUP_MATERIALIZATION_INVALID');
  return candidate as ChapterCleanupMaterializationV1;
}

function bindingHash(job: ChapterRenderRetentionJobV1): string {
  const binding = record(job.projectRenderSnapshotBinding);
  const hash = binding?.bindingHash;
  if (typeof hash !== 'string' || !HEX_SHA256.test(hash)) fail('BINDING_INVALID');
  return hash;
}

function receiptIdentity(receipt: Omit<ChapterRenderRetentionReceiptV1, 'receiptHash'>) {
  return {
    schemaVersion: receipt.schemaVersion,
    scope: receipt.scope,
    chapterJobId: receipt.chapterJobId,
    bindingHash: receipt.bindingHash,
    cleanupBoundary: receipt.cleanupBoundary,
    childOutboxIds: receipt.childOutboxIds,
    ...(receipt.concatOutboxId ? { concatOutboxId: receipt.concatOutboxId } : {}),
    artifactInvalidatedAt: receipt.artifactInvalidatedAt.toISOString(),
    expiresAt: receipt.expiresAt.toISOString(),
    deletedAt: receipt.deletedAt.toISOString(),
  };
}

function assertReceipt(value: unknown, chapterJobId: string): ChapterRenderRetentionReceiptV1 {
  const receipt = record(value) as ChapterRenderRetentionReceiptV1 | null;
  if (
    !receipt
    || receipt._id !== chapterJobId
    || receipt.chapterJobId !== chapterJobId
    || receipt.schemaVersion !== 1
    || receipt.scope !== 'CHAPTER_RENDER_RETENTION'
    || !HEX_SHA256.test(receipt.bindingHash)
    || !CLEANUP_BOUNDARIES.has(receipt.cleanupBoundary)
    || !Array.isArray(receipt.childOutboxIds)
    || receipt.childOutboxIds.length === 0
    || !validDate(receipt.artifactInvalidatedAt)
    || !validDate(receipt.expiresAt)
    || !validDate(receipt.deletedAt)
    || typeof receipt.receiptHash !== 'string'
    || receipt.receiptHash !== hashEditronCanonicalJsonV1(receiptIdentity(receipt))
  ) fail('RECEIPT_INVALID');
  return receipt;
}

/**
 * Retire one expired chapter aggregate inside the caller's Mongo transaction.
 * The transaction requirement makes the tombstone and aggregate deletion one
 * indivisible state change.
 */
export async function retireExpiredChapterRenderV1(input: {
  chapterJobId: string;
  chapterCollection: Pick<Collection<ChapterRenderRetentionJobV1>, 'findOne' | 'deleteOne'>;
  childCleanupCollection: Pick<Collection<ProjectRenderSourceCleanupOutboxV1>, 'findOne'>;
  concatCleanupCollection: Pick<Collection<ProjectChapterConcatCleanupOutboxV1>, 'findOne'>;
  receiptCollection: Pick<Collection<ChapterRenderRetentionReceiptV1>, 'findOne' | 'updateOne'>;
  session: ClientSession;
  now?: Date;
}): Promise<ChapterRenderRetentionResultV1> {
  if (!CHAPTER_JOB_ID.test(input.chapterJobId)) fail('JOB_ID_INVALID');
  if (!input.session.inTransaction()) fail('TRANSACTION_REQUIRED');
  const now = input.now ?? new Date();
  if (!validDate(now)) fail('TIME_INVALID');

  const job = await input.chapterCollection.findOne(
    { _id: input.chapterJobId },
    { session: input.session },
  );
  if (!job) {
    const existingReceipt = await input.receiptCollection.findOne(
      { _id: input.chapterJobId },
      { session: input.session },
    );
    return existingReceipt
      ? { ok: true, status: 'ALREADY_RETIRED', receipt: assertReceipt(existingReceipt, input.chapterJobId) }
      : { ok: false, status: 'NOT_FOUND' };
  }

  if (
    job.artifactLifecycleVersion !== 1
    || job.artifactState !== 'STALE'
    || job.retentionState !== 'CLEANUP_PENDING'
    || !validDate(job.artifactInvalidatedAt)
    || !validDate(job.expiresAt)
  ) fail('LIFECYCLE_MIGRATION_REQUIRED');
  if (job.expiresAt.getTime() > now.getTime()) {
    return { ok: true, status: 'RETAINED', expiresAt: job.expiresAt };
  }

  const cleanup = parseCleanupMaterialization(job.cleanupMaterialization);
  if (cleanup.materializedAt.getTime() !== job.artifactInvalidatedAt.getTime()) {
    fail('INVALIDATION_MATERIALIZATION_MISMATCH');
  }
  const exactBindingHash = bindingHash(job);
  for (const outboxId of cleanup.childOutboxIds) {
    const raw = await input.childCleanupCollection.findOne(
      { _id: outboxId },
      { session: input.session },
    );
    if (!raw) {
      return { ok: true, status: 'WAITING_FOR_CLEANUP', outboxId, cleanupStatus: 'MISSING' };
    }
    const parsed = ProjectRenderSourceCleanupOutboxSchemaV1.safeParse(raw);
    if (!parsed.success) fail('CHILD_CLEANUP_RECEIPT_INVALID');
    const outbox = parsed.data;
    try {
      assertProjectRenderSourceCleanupOutboxV1(outbox);
    } catch {
      fail('CHILD_CLEANUP_RECEIPT_INVALID');
    }
    if (
      outbox.descriptor.artifactKind !== 'REMOTION_AWS_CHAPTER_CHILD_RENDER_OUTPUT'
      || outbox.descriptor.parentAdmissionId !== input.chapterJobId
      || outbox.descriptor.binding.bindingHash !== exactBindingHash
    ) fail('CHILD_CLEANUP_SCOPE_MISMATCH');
    if (outbox.status !== 'DONE') {
      return { ok: true, status: 'WAITING_FOR_CLEANUP', outboxId, cleanupStatus: outbox.status };
    }
  }

  if (cleanup.concatOutboxId) {
    const raw = await input.concatCleanupCollection.findOne(
      { _id: cleanup.concatOutboxId },
      { session: input.session },
    );
    if (!raw) {
      return {
        ok: true,
        status: 'WAITING_FOR_CLEANUP',
        outboxId: cleanup.concatOutboxId,
        cleanupStatus: 'MISSING',
      };
    }
    const parsed = ProjectChapterConcatCleanupOutboxSchemaV1.safeParse(raw);
    if (!parsed.success) fail('CONCAT_CLEANUP_RECEIPT_INVALID');
    const outbox = parsed.data;
    try {
      assertProjectChapterConcatCleanupOutboxV1(outbox);
    } catch {
      fail('CONCAT_CLEANUP_RECEIPT_INVALID');
    }
    if (
      outbox.descriptor.parentAdmissionId !== input.chapterJobId
      || outbox.descriptor.binding.bindingHash !== exactBindingHash
    ) fail('CONCAT_CLEANUP_SCOPE_MISMATCH');
    if (outbox.status !== 'DONE') {
      return {
        ok: true,
        status: 'WAITING_FOR_CLEANUP',
        outboxId: cleanup.concatOutboxId,
        cleanupStatus: outbox.status,
      };
    }
  }

  const receiptWithoutHash: Omit<ChapterRenderRetentionReceiptV1, 'receiptHash'> = {
    _id: input.chapterJobId,
    schemaVersion: 1,
    scope: 'CHAPTER_RENDER_RETENTION',
    chapterJobId: input.chapterJobId,
    bindingHash: exactBindingHash,
    cleanupBoundary: cleanup.boundary,
    childOutboxIds: [...cleanup.childOutboxIds],
    ...(cleanup.concatOutboxId ? { concatOutboxId: cleanup.concatOutboxId } : {}),
    artifactInvalidatedAt: job.artifactInvalidatedAt,
    expiresAt: job.expiresAt,
    deletedAt: now,
  };
  const receipt: ChapterRenderRetentionReceiptV1 = {
    ...receiptWithoutHash,
    receiptHash: hashEditronCanonicalJsonV1(receiptIdentity(receiptWithoutHash)),
  };
  const receiptWrite = await input.receiptCollection.updateOne(
    { _id: input.chapterJobId },
    { $setOnInsert: receipt },
    { upsert: true, session: input.session },
  );
  if (receiptWrite.upsertedCount !== 1) {
    const existing = await input.receiptCollection.findOne(
      { _id: input.chapterJobId },
      { session: input.session },
    );
    const replay = assertReceipt(existing, input.chapterJobId);
    if (replay.receiptHash !== receipt.receiptHash) fail('RECEIPT_CONFLICT');
  }

  const deleted = await input.chapterCollection.deleteOne(
    {
      _id: input.chapterJobId,
      artifactLifecycleVersion: 1,
      artifactState: 'STALE',
      retentionState: 'CLEANUP_PENDING',
      artifactInvalidatedAt: job.artifactInvalidatedAt,
      expiresAt: { $lte: now },
      'projectRenderSnapshotBinding.bindingHash': exactBindingHash,
      cleanupMaterialization: cleanup,
    },
    { session: input.session },
  );
  if (deleted.deletedCount !== 1) fail('DELETE_WRITE_UNPROVED');
  return { ok: true, status: 'RETIRED', receipt };
}
