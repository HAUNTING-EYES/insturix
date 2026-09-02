import type { Collection } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({
  connectToDatabase: vi.fn(),
  getDatabase: vi.fn(),
}));

import {
  migrateChapterRenderLifecycleV1,
  type ChapterRenderLifecycleMigrationDocumentV1,
} from '@/lib/editron/services/chapter-render-lifecycle-migration-v1';
import { createChapterChildDispatchV1 } from '@/lib/editron/services/chapter-render-dispatch-v1';
import { createChapterLayoutManifestForRenderV1 } from '@/lib/editron/services/chapter-renderer';
import { createProjectRenderSnapshotBindingV1 } from '@/lib/editron/services/project-render-snapshot-binding-v1';

const JOB_ID = 'chr_123456789012';
const NOW = new Date('2026-09-01T10:00:00.000Z');
const REVISION = {
  schemaVersion: 1 as const,
  value: 12,
  compatibilityUpdatedAt: '2026-09-01T09:59:00.000Z',
};

function strictRow(): ChapterRenderLifecycleMigrationDocumentV1 {
  const boundaries = [{ startFrame: 0, endFrame: 1_000 }];
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: 'DELIVERY_PROOF',
    artifactId: JOB_ID,
    ownerId: 'migration-owner',
    projectId: 'migration-project',
    projectRevision: REVISION,
    sequenceId: 'main',
    compositionId: 'MainComposition',
    renderContract: { routeMode: 'chapter', chapterPolicy: { boundaries } },
    durationInFrames: 1_000,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: { schemaVersion: 1, overlays: [] },
    containedVideoTargets: [],
  });
  const manifest = createChapterLayoutManifestForRenderV1({
    parentAdmissionId: JOB_ID,
    bindingHash: binding.bindingHash,
    projectId: binding.projectId,
    totalFrames: 1_000,
    fps: 30,
    boundaries,
  });
  return {
    _id: JOB_ID,
    projectId: binding.projectId,
    userId: 'migration-requester',
    ownerId: binding.ownerId,
    region: 'us-east-1',
    status: 'rendering',
    totalFrames: 1_000,
    fps: 30,
    projectRenderSnapshotBinding: binding,
    chapterLayoutManifest: manifest,
    chapters: manifest.chapters.map((chapter) => ({
      ...chapter,
      parentAdmissionId: JOB_ID,
      region: 'us-east-1',
      status: 'pending',
      dispatch: createChapterChildDispatchV1({
        parentAdmissionId: JOB_ID,
        childIndex: chapter.index,
        bindingHash: binding.bindingHash,
      }),
    })),
  };
}

function fixture(initial: ChapterRenderLifecycleMigrationDocumentV1) {
  const row = structuredClone(initial) as ChapterRenderLifecycleMigrationDocumentV1;
  const updateOne = vi.fn(async (_filter: unknown, update: { $set?: Record<string, unknown> }) => {
    Object.assign(row, structuredClone(update.$set ?? {}));
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  });
  return {
    row,
    updateOne,
    collection: {
      findOne: vi.fn(async () => structuredClone(row)),
      updateOne,
    } as unknown as Pick<Collection<ChapterRenderLifecycleMigrationDocumentV1>, 'findOne' | 'updateOne'>,
  };
}

describe('chapter render lifecycle migration v1', () => {
  it('backfills only a cryptographically strict row at the exact live project revision', async () => {
    const state = fixture(strictRow());
    const reader = vi.fn().mockResolvedValue(REVISION);

    await expect(migrateChapterRenderLifecycleV1({
      chapterJobId: JOB_ID,
      collection: state.collection,
      projectRevisionReader: reader,
      now: NOW,
    })).resolves.toEqual({ ok: true, status: 'MIGRATED', disposition: 'MIGRATED_ACTIVE' });
    expect(state.row).toMatchObject({
      artifactLifecycleVersion: 1,
      artifactState: 'ACTIVE',
      retentionState: 'RETAINED',
      lifecycleMigration: { schemaVersion: 1, disposition: 'MIGRATED_ACTIVE' },
    });
  });

  it('restores cleanup-pending lifecycle from an existing materialization without reopening writes', async () => {
    const row = strictRow();
    row.cleanupMaterialization = {
      schemaVersion: 1,
      boundary: 'CURRENT_SUCCESS',
      childOutboxIds: ['project-render-source-cleanup_'.concat('a'.repeat(64))],
      materializedAt: NOW,
    };
    const state = fixture(row);
    const reader = vi.fn();

    await expect(migrateChapterRenderLifecycleV1({
      chapterJobId: JOB_ID,
      collection: state.collection,
      projectRevisionReader: reader,
      now: NOW,
    })).resolves.toEqual({
      ok: true,
      status: 'MIGRATED',
      disposition: 'MIGRATED_CLEANUP_PENDING',
    });
    expect(state.row).toMatchObject({
      artifactState: 'STALE',
      retentionState: 'CLEANUP_PENDING',
      artifactInvalidatedAt: NOW,
    });
    expect(reader).not.toHaveBeenCalled();
  });

  it('classifies genuinely unbound legacy rows without promoting them', async () => {
    const state = fixture({ _id: JOB_ID, status: 'rendering' });

    await expect(migrateChapterRenderLifecycleV1({
      chapterJobId: JOB_ID,
      collection: state.collection,
      projectRevisionReader: vi.fn(),
      now: NOW,
    })).resolves.toEqual({
      ok: true,
      status: 'BLOCKED',
      disposition: 'BLOCKED_UNBOUND_LEGACY',
    });
    expect(state.row).not.toHaveProperty('artifactLifecycleVersion');
    expect(state.row.lifecycleMigration).toMatchObject({ disposition: 'BLOCKED_UNBOUND_LEGACY' });
  });

  it('blocks a strict row whose project revision is no longer current', async () => {
    const state = fixture(strictRow());

    await expect(migrateChapterRenderLifecycleV1({
      chapterJobId: JOB_ID,
      collection: state.collection,
      projectRevisionReader: vi.fn().mockResolvedValue({ ...REVISION, value: REVISION.value + 1 }),
      now: NOW,
    })).resolves.toEqual({
      ok: true,
      status: 'BLOCKED',
      disposition: 'BLOCKED_PROJECT_REVISION_STALE',
    });
    expect(state.row).not.toHaveProperty('artifactLifecycleVersion');
  });

  it('fails loudly on a partially written lifecycle instead of guessing', async () => {
    const state = fixture({ ...strictRow(), artifactState: 'ACTIVE' });
    await expect(migrateChapterRenderLifecycleV1({
      chapterJobId: JOB_ID,
      collection: state.collection,
      projectRevisionReader: vi.fn(),
      now: NOW,
    })).rejects.toThrow('CHAPTER_RENDER_LIFECYCLE_MIGRATION_LIFECYCLE_CONFLICT');
    expect(state.updateOne).not.toHaveBeenCalled();
  });
});
