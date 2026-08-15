import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ recoverStalledPostMortemJobs: vi.fn() }));

vi.mock('@/lib/thinkforge/post-mortem/post-mortem-job', () => ({
  recoverStalledPostMortemJobs: mocks.recoverStalledPostMortemJobs,
}));

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function request(headers: HeadersInit = {}): Request {
  return new Request('http://localhost/api/cron/process-thinkforge-post-mortems', { headers });
}

describe('ThinkForge post-mortem recovery cron', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'post-mortem-cron-secret';
    mocks.recoverStalledPostMortemJobs.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it('fails closed when cron authentication is not configured', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/process-thinkforge-post-mortems/route');

    const response = await GET(request({ authorization: 'Bearer any-value' }) as never);

    expect(response.status).toBe(503);
    expect(mocks.recoverStalledPostMortemJobs).not.toHaveBeenCalled();
  });

  it('rejects requests without the configured bearer secret', async () => {
    const { GET } = await import('@/app/api/cron/process-thinkforge-post-mortems/route');

    const response = await GET(request({ 'user-agent': 'vercel-cron' }) as never);

    expect(response.status).toBe(401);
    expect(mocks.recoverStalledPostMortemJobs).not.toHaveBeenCalled();
  });

  it('redelivers recoverable jobs only after authentication', async () => {
    mocks.recoverStalledPostMortemJobs.mockResolvedValue({ candidates: 2, dispatched: 1, failed: 1 });
    const { GET } = await import('@/app/api/cron/process-thinkforge-post-mortems/route');

    const response = await GET(request({ authorization: 'Bearer post-mortem-cron-secret' }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recovery: { candidates: 2, dispatched: 1, failed: 1 },
    });
    expect(mocks.recoverStalledPostMortemJobs).toHaveBeenCalledTimes(1);
  });

  it('does not expose internal recovery errors', async () => {
    mocks.recoverStalledPostMortemJobs.mockRejectedValue(new Error('mongodb://secret-host/database'));
    const { GET } = await import('@/app/api/cron/process-thinkforge-post-mortems/route');

    const response = await GET(request({ authorization: 'Bearer post-mortem-cron-secret' }) as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: 'Post-mortem recovery failed.' });
    expect(JSON.stringify(body)).not.toContain('secret-host');
  });
});
