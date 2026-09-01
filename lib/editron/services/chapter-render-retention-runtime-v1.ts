import { connectToDatabase } from '@/lib/editron/db/mongodb';
import {
  PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1,
  type ProjectChapterConcatCleanupOutboxV1,
} from './chapter-concat-cleanup-v1';
import {
  CHAPTER_RENDER_DISPATCH_CHAPTERS_COLLECTION_V1,
} from './chapter-render-dispatch-v1';
import {
  CHAPTER_RENDER_RETENTION_RECEIPTS_COLLECTION_V1,
  retireExpiredChapterRenderV1,
  type ChapterRenderRetentionJobV1,
  type ChapterRenderRetentionResultV1,
  type ChapterRenderRetentionReceiptV1,
} from './render-chapter-retention';
import {
  PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
  type ProjectRenderSourceCleanupOutboxV1,
} from './project-render-source-cleanup-v1';

const MAX_BATCH_SIZE = 25;

export type ChapterRenderRetentionBatchResultV1 = {
  candidates: number;
  retired: number;
  waiting: number;
  retained: number;
  missing: number;
  failed: number;
  results: Array<{
    chapterJobId: string;
    state: 'RETIRED' | 'ALREADY_RETIRED' | 'WAITING_FOR_CLEANUP' | 'RETAINED' | 'NOT_FOUND' | 'FAILED';
  }>;
};

export type ChapterRenderRetentionBatchStoreV1 = {
  listDueChapterJobIds(now: Date, limit: number): Promise<string[]>;
  retireChapterJob(chapterJobId: string, now: Date): Promise<ChapterRenderRetentionResultV1>;
};

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function batchSize(value: number | undefined): number {
  if (value === undefined) return 5;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_BATCH_SIZE) {
    throw new Error('CHAPTER_RENDER_RETENTION_BATCH_SIZE_INVALID');
  }
  return value;
}

async function mongoStore(): Promise<ChapterRenderRetentionBatchStoreV1> {
  const { client, db } = await connectToDatabase();
  const chapters = db.collection<ChapterRenderRetentionJobV1>(
    CHAPTER_RENDER_DISPATCH_CHAPTERS_COLLECTION_V1,
  );
  const childCleanup = db.collection<ProjectRenderSourceCleanupOutboxV1>(
    PROJECT_RENDER_SOURCE_CLEANUP_OUTBOX_COLLECTION_V1,
  );
  const concatCleanup = db.collection<ProjectChapterConcatCleanupOutboxV1>(
    PROJECT_CHAPTER_CONCAT_CLEANUP_OUTBOX_COLLECTION_V1,
  );
  const receipts = db.collection<ChapterRenderRetentionReceiptV1>(
    CHAPTER_RENDER_RETENTION_RECEIPTS_COLLECTION_V1,
  );

  return {
    async listDueChapterJobIds(now, limit) {
      const rows = await chapters.find({
        artifactLifecycleVersion: 1,
        artifactState: 'STALE',
        retentionState: 'CLEANUP_PENDING',
        expiresAt: { $lte: now },
      }).sort({ expiresAt: 1, _id: 1 }).limit(limit).project<{ _id: string }>({ _id: 1 }).toArray();
      return rows.map((row) => row._id);
    },
    async retireChapterJob(chapterJobId, now) {
      const session = client.startSession();
      try {
        const result = await session.withTransaction(
          () => retireExpiredChapterRenderV1({
            chapterJobId,
            chapterCollection: chapters,
            childCleanupCollection: childCleanup,
            concatCleanupCollection: concatCleanup,
            receiptCollection: receipts,
            session,
            now,
          }),
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            readPreference: 'primary',
          },
        );
        if (!result) throw new Error('CHAPTER_RENDER_RETENTION_TRANSACTION_UNPROVED');
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

export async function runChapterRenderRetentionBatchV1(input: {
  store?: ChapterRenderRetentionBatchStoreV1;
  limit?: number;
  now?: Date;
} = {}): Promise<ChapterRenderRetentionBatchResultV1> {
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error('CHAPTER_RENDER_RETENTION_TIME_INVALID');
  const limit = batchSize(input.limit);
  const store = input.store ?? await mongoStore();
  const chapterJobIds = await store.listDueChapterJobIds(now, limit);
  if (chapterJobIds.length > limit || new Set(chapterJobIds).size !== chapterJobIds.length) {
    throw new Error('CHAPTER_RENDER_RETENTION_CANDIDATE_SET_INVALID');
  }
  const result: ChapterRenderRetentionBatchResultV1 = {
    candidates: chapterJobIds.length,
    retired: 0,
    waiting: 0,
    retained: 0,
    missing: 0,
    failed: 0,
    results: [],
  };
  for (const chapterJobId of chapterJobIds) {
    try {
      const outcome = await store.retireChapterJob(chapterJobId, now);
      result.results.push({ chapterJobId, state: outcome.status });
      if (outcome.status === 'RETIRED' || outcome.status === 'ALREADY_RETIRED') result.retired += 1;
      else if (outcome.status === 'WAITING_FOR_CLEANUP') result.waiting += 1;
      else if (outcome.status === 'RETAINED') result.retained += 1;
      else result.missing += 1;
    } catch {
      result.failed += 1;
      result.results.push({ chapterJobId, state: 'FAILED' });
    }
  }
  return result;
}
