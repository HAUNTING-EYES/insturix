import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recoverStalledLongFormScriptJobs: vi.fn(),
  recoverProductionContractRefreshJobs: vi.fn(),
}));

vi.mock('@/lib/thinkforge/long-form/script-generation-job', () => ({
  recoverStalledLongFormScriptJobs: mocks.recoverStalledLongFormScriptJobs,
}));
vi.mock('@/lib/thinkforge/production-contract-refresh/job', () => ({
  recoverProductionContractRefreshJobs: mocks.recoverProductionContractRefreshJobs,
}));

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function request(headers: HeadersInit = {}): Request {
  return new Request('http://localhost/api/cron/process-thinkforge-long-form-scripts', { headers });
}

describe('ThinkForge durable-work recovery cron', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'long-form-cron-secret';
    mocks.recoverStalledLongFormScriptJobs.mockReset();
    mocks.recoverProductionContractRefreshJobs.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it('fails closed when cron authentication is not configured', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/process-thinkforge-long-form-scripts/route');

    const response = await GET(request({ authorization: 'Bearer any-value' }) as never);

    expect(response.status).toBe(503);
    expect(mocks.recoverStalledLongFormScriptJobs).not.toHaveBeenCalled();
    expect(mocks.recoverProductionContractRefreshJobs).not.toHaveBeenCalled();
  });

  it('rejects the Vercel cron user-agent without the configured bearer secret', async () => {
    const { GET } = await import('@/app/api/cron/process-thinkforge-long-form-scripts/route');

    const response = await GET(request({ 'user-agent': 'vercel-cron' }) as never);

    expect(response.status).toBe(401);
    expect(mocks.recoverStalledLongFormScriptJobs).not.toHaveBeenCalled();
    expect(mocks.recoverProductionContractRefreshJobs).not.toHaveBeenCalled();
  });

  it('redelivers recoverable jobs only after authentication', async () => {
    mocks.recoverStalledLongFormScriptJobs.mockResolvedValue({ candidates: 3, dispatched: 2, failed: 1 });
    mocks.recoverProductionContractRefreshJobs.mockResolvedValue({
      candidates: 2,
      dispatched: 1,
      refunded: 1,
      failed: 0,
    });
    const { GET } = await import('@/app/api/cron/process-thinkforge-long-form-scripts/route');

    const response = await GET(request({ authorization: 'Bearer long-form-cron-secret' }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recovery: {
        longFormScripts: { candidates: 3, dispatched: 2, failed: 1 },
        productionContractRefreshes: { candidates: 2, dispatched: 1, refunded: 1, failed: 0 },
      },
    });
    expect(mocks.recoverStalledLongFormScriptJobs).toHaveBeenCalledTimes(1);
    expect(mocks.recoverProductionContractRefreshJobs).toHaveBeenCalledTimes(1);
  });

  it('does not expose internal recovery errors', async () => {
    mocks.recoverStalledLongFormScriptJobs.mockRejectedValue(new Error('mongodb://secret-host/database'));
    const { GET } = await import('@/app/api/cron/process-thinkforge-long-form-scripts/route');

    const response = await GET(request({ authorization: 'Bearer long-form-cron-secret' }) as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: 'ThinkForge durable-work recovery failed.' });
    expect(JSON.stringify(body)).not.toContain('secret-host');
  });
});
