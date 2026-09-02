import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({ connectToDatabase: vi.fn() }));

import { handleChapterRenderRetentionCronV1 }
  from '@/app/api/cron/retire-editron-render-chapters/route';
import {
  runChapterRenderRetentionBatchV1,
  type ChapterRenderRetentionBatchResultV1,
  type ChapterRenderRetentionBatchStoreV1,
} from '@/lib/editron/services/chapter-render-retention-runtime-v1';

const NOW = new Date('2026-09-01T09:00:00.000Z');
const JOB_A = 'chr_123456789012';
const JOB_B = 'chr_abcdefghijkl';
const JOB_C = 'chr_ABCDEFGHIJKL';
const REPO_ROOT = resolve(__dirname, '../..');

function request(secret?: string): Request {
  return new Request('https://example.test/api/cron/retire-editron-render-chapters', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('chapter render retention runtime v1', () => {
  it('processes due candidates sequentially and reports bounded outcomes', async () => {
    const retireChapterJob = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 'RETIRED', receipt: {} })
      .mockResolvedValueOnce({
        ok: true,
        status: 'WAITING_FOR_CLEANUP',
        outboxId: 'cleanup-1',
        cleanupStatus: 'PENDING',
      })
      .mockRejectedValueOnce(new Error('private database detail'));
    const store: ChapterRenderRetentionBatchStoreV1 = {
      listDueChapterJobIds: vi.fn().mockResolvedValue([JOB_A, JOB_B, JOB_C]),
      retireChapterJob,
    };

    await expect(runChapterRenderRetentionBatchV1({ store, limit: 3, now: NOW })).resolves.toEqual({
      candidates: 3,
      retired: 1,
      waiting: 1,
      retained: 0,
      missing: 0,
      failed: 1,
      results: [
        { chapterJobId: JOB_A, state: 'RETIRED' },
        { chapterJobId: JOB_B, state: 'WAITING_FOR_CLEANUP' },
        { chapterJobId: JOB_C, state: 'FAILED' },
      ],
    });
    expect(retireChapterJob).toHaveBeenNthCalledWith(1, JOB_A, NOW);
    expect(retireChapterJob).toHaveBeenNthCalledWith(2, JOB_B, NOW);
    expect(retireChapterJob).toHaveBeenNthCalledWith(3, JOB_C, NOW);
  });

  it('rejects duplicate or oversized candidate sets before retirement', async () => {
    const store: ChapterRenderRetentionBatchStoreV1 = {
      listDueChapterJobIds: vi.fn().mockResolvedValue([JOB_A, JOB_A]),
      retireChapterJob: vi.fn(),
    };
    await expect(runChapterRenderRetentionBatchV1({ store, limit: 2, now: NOW })).rejects.toThrow(
      'CHAPTER_RENDER_RETENTION_CANDIDATE_SET_INVALID',
    );
    expect(store.retireChapterJob).not.toHaveBeenCalled();
  });

  it('protects the cron and requests retry without leaking internal errors', async () => {
    const successResult: ChapterRenderRetentionBatchResultV1 = {
      candidates: 1,
      retired: 1,
      waiting: 0,
      retained: 0,
      missing: 0,
      failed: 0,
      results: [{ chapterJobId: JOB_A, state: 'RETIRED' }],
    };
    const runner = vi.fn().mockResolvedValue(successResult);
    vi.stubEnv('CRON_SECRET', 'retention-secret');

    expect((await handleChapterRenderRetentionCronV1(request(), runner)).status).toBe(401);
    const success = await handleChapterRenderRetentionCronV1(request('retention-secret'), runner);
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toMatchObject({ success: true, retention: successResult });

    runner.mockResolvedValueOnce({ ...successResult, retired: 0, failed: 1 });
    const retry = await handleChapterRenderRetentionCronV1(request('retention-secret'), runner);
    expect(retry.status).toBe(503);
    expect(retry.headers.get('retry-after')).toBe('300');

    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runner.mockRejectedValueOnce(new Error('private database detail'));
    const outage = await handleChapterRenderRetentionCronV1(request('retention-secret'), runner);
    const body = await outage.json();
    expect(outage.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: { code: 'CHAPTER_RENDER_RETENTION_UNAVAILABLE' },
    });
    expect(JSON.stringify(body)).not.toContain('private database detail');
    errorLog.mockRestore();
  });

  it('fails closed without a cron secret and registers the retention schedule', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const runner = vi.fn();
    expect((await handleChapterRenderRetentionCronV1(request(), runner)).status).toBe(503);
    expect(runner).not.toHaveBeenCalled();

    const configuration = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: '/api/cron/retire-editron-render-chapters',
      schedule: '17 * * * *',
    });
  });
});
