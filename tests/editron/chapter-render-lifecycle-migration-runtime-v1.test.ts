import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({ getDatabase: vi.fn() }));

import { handleChapterRenderLifecycleMigrationCronV1 }
  from '@/app/api/cron/migrate-editron-render-chapters/route';
import {
  runChapterRenderLifecycleMigrationBatchV1,
  type ChapterRenderLifecycleMigrationBatchResultV1,
  type ChapterRenderLifecycleMigrationBatchStoreV1,
} from '@/lib/editron/services/chapter-render-lifecycle-migration-runtime-v1';

const NOW = new Date('2026-09-01T11:00:00.000Z');
const JOB_A = 'chr_123456789012';
const JOB_B = 'chr_abcdefghijkl';
const JOB_C = 'chr_ABCDEFGHIJKL';
const REPO_ROOT = resolve(__dirname, '../..');

function request(secret?: string): Request {
  return new Request('https://example.test/api/cron/migrate-editron-render-chapters', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('chapter render lifecycle migration runtime v1', () => {
  it('processes candidates sequentially and keeps blocked rows distinct from failures', async () => {
    const migrate = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 'MIGRATED', disposition: 'MIGRATED_ACTIVE' })
      .mockResolvedValueOnce({ ok: true, status: 'BLOCKED', disposition: 'BLOCKED_UNBOUND_LEGACY' })
      .mockRejectedValueOnce(new Error('private database detail'));
    const store: ChapterRenderLifecycleMigrationBatchStoreV1 = {
      listCandidateIds: vi.fn().mockResolvedValue([JOB_A, JOB_B, JOB_C]),
      migrate,
    };

    await expect(runChapterRenderLifecycleMigrationBatchV1({ store, limit: 3, now: NOW })).resolves.toEqual({
      candidates: 3,
      migrated: 1,
      blocked: 1,
      alreadyAssessed: 0,
      missing: 0,
      failed: 1,
      results: [
        { chapterJobId: JOB_A, state: 'MIGRATED' },
        { chapterJobId: JOB_B, state: 'BLOCKED' },
        { chapterJobId: JOB_C, state: 'FAILED' },
      ],
    });
    expect(migrate).toHaveBeenNthCalledWith(1, JOB_A, NOW);
    expect(migrate).toHaveBeenNthCalledWith(2, JOB_B, NOW);
    expect(migrate).toHaveBeenNthCalledWith(3, JOB_C, NOW);
  });

  it('protects the cron and returns retryable status only for actual failures', async () => {
    const result: ChapterRenderLifecycleMigrationBatchResultV1 = {
      candidates: 1,
      migrated: 0,
      blocked: 1,
      alreadyAssessed: 0,
      missing: 0,
      failed: 0,
      results: [{ chapterJobId: JOB_A, state: 'BLOCKED' }],
    };
    const runner = vi.fn().mockResolvedValue(result);
    vi.stubEnv('CRON_SECRET', 'migration-secret');

    expect((await handleChapterRenderLifecycleMigrationCronV1(request(), runner)).status).toBe(401);
    const success = await handleChapterRenderLifecycleMigrationCronV1(request('migration-secret'), runner);
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({ success: true, migration: result });

    runner.mockResolvedValueOnce({ ...result, blocked: 0, failed: 1 });
    const retry = await handleChapterRenderLifecycleMigrationCronV1(request('migration-secret'), runner);
    expect(retry.status).toBe(503);
    expect(retry.headers.get('retry-after')).toBe('300');
  });

  it('fails closed on missing configuration/outage and registers the schedule', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const runner = vi.fn();
    expect((await handleChapterRenderLifecycleMigrationCronV1(request(), runner)).status).toBe(503);
    expect(runner).not.toHaveBeenCalled();

    vi.stubEnv('CRON_SECRET', 'migration-secret');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runner.mockRejectedValueOnce(new Error('private database detail'));
    const outage = await handleChapterRenderLifecycleMigrationCronV1(request('migration-secret'), runner);
    const body = await outage.json();
    expect(outage.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: { code: 'CHAPTER_RENDER_LIFECYCLE_MIGRATION_UNAVAILABLE' },
    });
    expect(JSON.stringify(body)).not.toContain('private database detail');
    errorLog.mockRestore();

    const configuration = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: '/api/cron/migrate-editron-render-chapters',
      schedule: '23 * * * *',
    });
  });
});
