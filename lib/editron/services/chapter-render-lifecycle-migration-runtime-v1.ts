import { getDatabase } from '@/lib/editron/db/mongodb';
import {
  migrateChapterRenderLifecycleV1,
  type ChapterRenderLifecycleMigrationDocumentV1,
  type ChapterRenderLifecycleMigrationResultV1,
} from './chapter-render-lifecycle-migration-v1';
import { CHAPTER_RENDER_DISPATCH_CHAPTERS_COLLECTION_V1 } from './chapter-render-dispatch-v1';

const MAX_BATCH_SIZE = 25;

export type ChapterRenderLifecycleMigrationBatchResultV1 = {
  candidates: number;
  migrated: number;
  blocked: number;
  alreadyAssessed: number;
  missing: number;
  failed: number;
  results: Array<{
    chapterJobId: string;
    state: 'MIGRATED' | 'BLOCKED' | 'ALREADY_MIGRATED' | 'ALREADY_ASSESSED' | 'NOT_FOUND' | 'FAILED';
  }>;
};

export type ChapterRenderLifecycleMigrationBatchStoreV1 = {
  listCandidateIds(limit: number): Promise<string[]>;
  migrate(chapterJobId: string, now: Date): Promise<ChapterRenderLifecycleMigrationResultV1>;
};

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return 5;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_BATCH_SIZE) {
    throw new Error('CHAPTER_RENDER_LIFECYCLE_MIGRATION_BATCH_SIZE_INVALID');
  }
  return value;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

async function mongoStore(): Promise<ChapterRenderLifecycleMigrationBatchStoreV1> {
  const db = await getDatabase();
  const chapters = db.collection<ChapterRenderLifecycleMigrationDocumentV1>(
    CHAPTER_RENDER_DISPATCH_CHAPTERS_COLLECTION_V1,
  );
  return {
    async listCandidateIds(limit) {
      const rows = await chapters.find({
        artifactLifecycleVersion: { $exists: false },
        lifecycleMigration: { $exists: false },
      }).sort({ createdAt: 1, _id: 1 }).limit(limit).project<{ _id: string }>({ _id: 1 }).toArray();
      return rows.map((row) => row._id);
    },
    async migrate(chapterJobId, now) {
      return migrateChapterRenderLifecycleV1({
        chapterJobId,
        collection: chapters,
        projectRevisionReader: async (ownerId, projectId) => {
          const { projectService } = await import('./project-service');
          return projectService.getProjectRevision(ownerId, projectId);
        },
        now,
      });
    },
  };
}

export async function runChapterRenderLifecycleMigrationBatchV1(input: {
  store?: ChapterRenderLifecycleMigrationBatchStoreV1;
  limit?: number;
  now?: Date;
} = {}): Promise<ChapterRenderLifecycleMigrationBatchResultV1> {
  const limit = boundedLimit(input.limit);
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error('CHAPTER_RENDER_LIFECYCLE_MIGRATION_TIME_INVALID');
  const store = input.store ?? await mongoStore();
  const ids = await store.listCandidateIds(limit);
  if (ids.length > limit || new Set(ids).size !== ids.length) {
    throw new Error('CHAPTER_RENDER_LIFECYCLE_MIGRATION_CANDIDATES_INVALID');
  }
  const result: ChapterRenderLifecycleMigrationBatchResultV1 = {
    candidates: ids.length,
    migrated: 0,
    blocked: 0,
    alreadyAssessed: 0,
    missing: 0,
    failed: 0,
    results: [],
  };
  for (const chapterJobId of ids) {
    try {
      const outcome = await store.migrate(chapterJobId, now);
      result.results.push({ chapterJobId, state: outcome.status });
      if (outcome.status === 'MIGRATED') result.migrated += 1;
      else if (outcome.status === 'BLOCKED') result.blocked += 1;
      else if (outcome.status === 'ALREADY_MIGRATED' || outcome.status === 'ALREADY_ASSESSED') {
        result.alreadyAssessed += 1;
      } else result.missing += 1;
    } catch {
      result.failed += 1;
      result.results.push({ chapterJobId, state: 'FAILED' });
    }
  }
  return result;
}
