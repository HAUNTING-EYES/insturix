import type { ClientSession, Collection } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import {
  renderChapterRetentionDays,
  renderChapterExpiresAt,
  BASE_RENDER_CHAPTER_RETENTION_DAYS,
  retireExpiredChapterRenderV1,
  type ChapterRenderRetentionJobV1,
  type ChapterRenderRetentionReceiptV1,
} from '../../lib/editron/services/render-chapter-retention';
import {
  createProjectChapterConcatCleanupOutboxV1,
  type ProjectChapterConcatCleanupOutboxV1,
} from '../../lib/editron/services/chapter-concat-cleanup-v1';
import {
  createProjectRenderChapterChildSourceCleanupOutboxV1,
  type ProjectRenderSourceCleanupOutboxV1,
} from '../../lib/editron/services/project-render-source-cleanup-v1';
import { createProjectRenderSnapshotBindingV1 } from '../../lib/editron/services/project-render-snapshot-binding-v1';

const JOB_ID = 'chr_123456789012';
const INVALIDATED_AT = new Date('2026-08-01T00:00:00.000Z');
const EXPIRES_AT = new Date('2026-08-08T00:00:00.000Z');
const NOW = new Date('2026-08-09T00:00:00.000Z');
const CLEANED_AT = new Date('2026-08-02T00:00:00.000Z');

function retentionFixture() {
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: 'DELIVERY_PROOF',
    artifactId: JOB_ID,
    ownerId: 'retention-owner',
    projectId: 'retention-project',
    projectRevision: {
      schemaVersion: 1,
      value: 9,
      compatibilityUpdatedAt: '2026-08-01T00:00:00.000Z',
    },
    sequenceId: 'main',
    compositionId: 'MainComposition',
    renderContract: { codec: 'h264' },
    durationInFrames: 1_000,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: { schemaVersion: 1, overlays: [] },
    containedVideoTargets: [],
  });
  const childPending = createProjectRenderChapterChildSourceCleanupOutboxV1({
    binding,
    parentAdmissionId: JOB_ID,
    chapterIndex: 0,
    providerRenderId: 'provider-child-0',
    bucketName: 'retention-child-bucket',
    region: 'us-east-1',
    sourceOutputUrl: 'https://retention-child-bucket.example.test/chapter-0.mp4',
    sourceOutputSize: 101,
    now: INVALIDATED_AT,
  });
  const childDone = {
    ...childPending,
    status: 'DONE' as const,
    completion: { completedAt: CLEANED_AT, freedBytes: 101 },
    updatedAt: CLEANED_AT,
  };
  const generation = 'a'.repeat(64);
  const outputKey = `editron-concat/v1/${generation}.mp4`;
  const concatPending = createProjectChapterConcatCleanupOutboxV1({
    binding,
    parentAdmissionId: JOB_ID,
    generation,
    sourceManifestHash: 'b'.repeat(64),
    outputBucket: 'retention-concat-bucket',
    outputRegion: 'us-east-1',
    outputKey,
    outputUrl: `https://retention-concat-bucket.example.test/${outputKey}`,
    outputSizeBytes: 202,
    now: INVALIDATED_AT,
  });
  const concatDone = {
    ...concatPending,
    status: 'DONE' as const,
    completion: { completedAt: CLEANED_AT, freedBytes: 202 },
    updatedAt: CLEANED_AT,
  };
  let chapter: ChapterRenderRetentionJobV1 | null = {
    _id: JOB_ID,
    artifactLifecycleVersion: 1,
    artifactState: 'STALE',
    retentionState: 'CLEANUP_PENDING',
    artifactInvalidatedAt: INVALIDATED_AT,
    expiresAt: EXPIRES_AT,
    projectRenderSnapshotBinding: binding,
    cleanupMaterialization: {
      schemaVersion: 1,
      boundary: 'CURRENT_SUCCESS',
      childOutboxIds: [childDone._id],
      concatOutboxId: concatDone._id,
      materializedAt: INVALIDATED_AT,
    },
  };
  let receipt: ChapterRenderRetentionReceiptV1 | null = null;
  let childOutbox: typeof childPending | typeof childDone = childDone;
  let concatOutbox: typeof concatPending | typeof concatDone = concatDone;
  const chapterCollection = {
    findOne: vi.fn(async () => chapter ? structuredClone(chapter) : null),
    deleteOne: vi.fn(async () => {
      if (!chapter) return { acknowledged: true, deletedCount: 0 };
      chapter = null;
      return { acknowledged: true, deletedCount: 1 };
    }),
  };
  const receiptCollection = {
    findOne: vi.fn(async () => receipt ? structuredClone(receipt) : null),
    updateOne: vi.fn(async (_filter: unknown, update: { $setOnInsert: ChapterRenderRetentionReceiptV1 }) => {
      if (receipt) return { acknowledged: true, matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
      receipt = structuredClone(update.$setOnInsert);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }),
  };
  const session = { inTransaction: vi.fn(() => true) } as unknown as ClientSession;
  const input = () => ({
    chapterJobId: JOB_ID,
    chapterCollection: chapterCollection as unknown as Pick<Collection<ChapterRenderRetentionJobV1>, 'findOne' | 'deleteOne'>,
    childCleanupCollection: {
      findOne: vi.fn(async () => structuredClone(childOutbox)),
    } as unknown as Pick<Collection<ProjectRenderSourceCleanupOutboxV1>, 'findOne'>,
    concatCleanupCollection: {
      findOne: vi.fn(async () => structuredClone(concatOutbox)),
    } as unknown as Pick<Collection<ProjectChapterConcatCleanupOutboxV1>, 'findOne'>,
    receiptCollection: receiptCollection as unknown as Pick<Collection<ChapterRenderRetentionReceiptV1>, 'findOne' | 'updateOne'>,
    session,
    now: NOW,
  });
  return {
    input,
    chapterCollection,
    receiptCollection,
    session,
    setChapter: (next: ChapterRenderRetentionJobV1 | null) => { chapter = next; },
    getChapter: () => chapter,
    getReceipt: () => receipt,
    setChildPending: () => { childOutbox = childPending; },
    setConcatPending: () => { concatOutbox = concatPending; },
  };
}

describe('render-chapter plan-based retention', () => {
  it('maps plan tiers to base 7 / mid 30 / top 90 days', () => {
    expect(renderChapterRetentionDays('free')).toBe(7);
    expect(renderChapterRetentionDays('plus')).toBe(30);
    expect(renderChapterRetentionDays('pro')).toBe(90);
    expect(renderChapterRetentionDays('premium')).toBe(90);
  });

  it('maps the LIVE agency plans (regression guard — these silently fell to 7d before)', () => {
    // chapter-renderer passes plan.type (e.g. "agency_scale"), so these are the real keys.
    expect(renderChapterRetentionDays('agency_starter')).toBe(7);
    expect(renderChapterRetentionDays('agency_growth')).toBe(30);
    expect(renderChapterRetentionDays('agency_scale')).toBe(90);
  });

  it('is case-insensitive and accepts base/mid/top aliases', () => {
    expect(renderChapterRetentionDays('PRO')).toBe(90);
    expect(renderChapterRetentionDays('base')).toBe(7);
    expect(renderChapterRetentionDays('mid')).toBe(30);
    expect(renderChapterRetentionDays('top')).toBe(90);
  });

  it('falls back to the base tier (7d) for unknown/missing plans', () => {
    expect(renderChapterRetentionDays(undefined)).toBe(BASE_RENDER_CHAPTER_RETENTION_DAYS);
    expect(renderChapterRetentionDays(null)).toBe(7);
    expect(renderChapterRetentionDays('enterprise-xyz')).toBe(7);
    expect(renderChapterRetentionDays('')).toBe(7);
  });

  it('computes expiresAt = createdAt + the plan retention window', () => {
    const created = new Date('2026-07-03T00:00:00.000Z');
    expect(renderChapterExpiresAt(created, 'free').getTime() - created.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(renderChapterExpiresAt(created, 'plus').getTime() - created.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(renderChapterExpiresAt(created, 'pro').getTime() - created.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('retains a stale chapter until its plan window expires', async () => {
    const fixture = retentionFixture();
    const chapter = fixture.getChapter()!;
    fixture.setChapter({ ...chapter, expiresAt: new Date('2026-08-10T00:00:00.000Z') });

    await expect(retireExpiredChapterRenderV1(fixture.input())).resolves.toEqual({
      ok: true,
      status: 'RETAINED',
      expiresAt: new Date('2026-08-10T00:00:00.000Z'),
    });
    expect(fixture.chapterCollection.deleteOne).not.toHaveBeenCalled();
    expect(fixture.receiptCollection.updateOne).not.toHaveBeenCalled();
  });

  it('waits for every provider cleanup receipt before deleting the chapter row', async () => {
    const fixture = retentionFixture();
    fixture.setChildPending();

    await expect(retireExpiredChapterRenderV1(fixture.input())).resolves.toMatchObject({
      ok: true,
      status: 'WAITING_FOR_CLEANUP',
      cleanupStatus: 'PENDING',
    });
    expect(fixture.chapterCollection.deleteOne).not.toHaveBeenCalled();
    expect(fixture.receiptCollection.updateOne).not.toHaveBeenCalled();
  });

  it('writes a hashed tombstone and retires only after child and concat cleanup are DONE', async () => {
    const fixture = retentionFixture();

    const first = await retireExpiredChapterRenderV1(fixture.input());
    expect(first).toMatchObject({
      ok: true,
      status: 'RETIRED',
      receipt: {
        _id: JOB_ID,
        chapterJobId: JOB_ID,
        cleanupBoundary: 'CURRENT_SUCCESS',
        deletedAt: NOW,
        receiptHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(fixture.getChapter()).toBeNull();
    expect(fixture.getReceipt()).toMatchObject({ _id: JOB_ID, deletedAt: NOW });

    await expect(retireExpiredChapterRenderV1(fixture.input())).resolves.toMatchObject({
      ok: true,
      status: 'ALREADY_RETIRED',
      receipt: { _id: JOB_ID },
    });
    expect(fixture.chapterCollection.deleteOne).toHaveBeenCalledOnce();
  });

  it('requires the tombstone and deletion to run inside one transaction', async () => {
    const fixture = retentionFixture();
    vi.mocked(fixture.session.inTransaction).mockReturnValue(false);

    await expect(retireExpiredChapterRenderV1(fixture.input())).rejects.toThrow(
      'CHAPTER_RENDER_RETENTION_TRANSACTION_REQUIRED',
    );
    expect(fixture.chapterCollection.deleteOne).not.toHaveBeenCalled();
  });
});
