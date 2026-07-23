/**
 * MG render sweep (#3, 2026-07-22): the durable-job watchdog. Two behaviours it depends on:
 *   1. findStaleMgRenderJobs queries EXACTLY the set claimMgRenderJob can re-claim (queued past nextAttemptAt,
 *      or running past an expired lease, still under maxAttempts) — no completed/failed/live-lease jobs.
 *   2. dispatchMgRenderJob's dedupSalt changes the QStash deduplicationId, so re-dispatching a stalled job at
 *      the SAME attemptCount reaches the worker instead of being swallowed by content-dedup.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

const qstashMock = vi.hoisted(() => ({ publishJSON: vi.fn(async () => ({ messageId: 'msg_1' })) }));
vi.mock('@upstash/qstash', () => ({ Client: vi.fn(() => ({ publishJSON: qstashMock.publishJSON })) }));

const dbMock = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MG_RENDER_JOBS: 'editron_mg_render_jobs' },
  getDatabase: vi.fn(async () => ({ collection: () => ({ find: dbMock.find }) })),
}));

import { dispatchMgRenderJob } from '@/lib/editron/motion-graphics/codegen/mg-render-job-runner';
import { findStaleMgRenderJobs } from '@/lib/editron/motion-graphics/codegen/mg-render-job-service';

const ENV = {
  QSTASH_TOKEN: 'test-token',
  MG_RENDER_CALLBACK_ORIGIN: 'https://app.example.com',
} as unknown as NodeJS.ProcessEnv;

const job = { _id: 'mgr_00000000000000000000000000000abc', attemptCount: 1, nextAttemptAt: new Date(0) };

describe('dispatchMgRenderJob dedup salt', () => {
  it('re-dispatches a stalled job with a distinct deduplicationId when salted', async () => {
    qstashMock.publishJSON.mockClear();
    await dispatchMgRenderJob(job, ENV);
    await dispatchMgRenderJob(job, ENV, 'sweep:42');

    type Published = { deduplicationId: string; body: unknown };
    const [original] = qstashMock.publishJSON.mock.calls[0] as unknown as [Published];
    const [swept] = qstashMock.publishJSON.mock.calls[1] as unknown as [Published];
    const expected = (salt: string | null) => createHash('sha256')
      .update(JSON.stringify([job._id, job.attemptCount, salt]))
      .digest('hex');
    expect(original.deduplicationId).toBe(expected(null));
    expect(swept.deduplicationId).toBe(expected('sweep:42'));
    expect(swept.deduplicationId).not.toBe(original.deduplicationId);
    expect(original.deduplicationId).toMatch(/^[a-f0-9]{64}$/);
    expect(swept.deduplicationId).toMatch(/^[a-f0-9]{64}$/);
    expect(swept.body).toEqual({ jobId: job._id });
  });
});

describe('findStaleMgRenderJobs query', () => {
  it('matches only re-claimable stalled jobs (queued-overdue OR running-lease-expired, under maxAttempts)', async () => {
    dbMock.find.mockReturnValue({ toArray: async () => [] });
    const now = new Date('2026-07-22T00:00:00.000Z');
    await findStaleMgRenderJobs({ now });

    const [filter, options] = dbMock.find.mock.calls[0];
    expect(filter.status).toEqual({ $in: ['queued', 'running'] });
    expect(filter.$expr).toEqual({ $lt: ['$attemptCount', '$maxAttempts'] });
    expect(filter.$or).toEqual([
      { status: 'queued', nextAttemptAt: { $lte: now } },
      { status: 'running', leaseExpiresAt: { $lte: now } },
    ]);
    // bounded scan, oldest-first
    expect(options.limit).toBe(50);
    expect(options.sort).toEqual({ nextAttemptAt: 1 });
  });

  it('clamps the scan limit to [1, 200]', async () => {
    dbMock.find.mockReturnValue({ toArray: async () => [] });
    await findStaleMgRenderJobs({ limit: 5000 });
    expect(dbMock.find.mock.calls.at(-1)?.[1].limit).toBe(200);
    await findStaleMgRenderJobs({ limit: 0 });
    expect(dbMock.find.mock.calls.at(-1)?.[1].limit).toBe(1);
  });
});
