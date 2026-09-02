import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ recovery: vi.fn() }));
vi.mock('@/lib/editron/services/media-source-pts-cadence-recovery-runtime-v3', () => ({
  runMediaSourcePtsCadenceRecoveryV3: mocks.recovery,
}));

import { GET }
  from '@/app/api/cron/recover-media-source-pts-cadence-v3/route';

const repoRoot = resolve(__dirname, '../..');

describe('media source PTS cadence recovery cron V3', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.recovery.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when cron authentication is absent or wrong', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request())).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect((await GET(request('wrong-secret'))).status).toBe(401);
    expect(mocks.recovery).not.toHaveBeenCalled();
  });

  it('returns success only when every selected delivery is confirmed', async () => {
    mocks.recovery.mockResolvedValue({
      scanned: 2,
      eligible: 1,
      skipped: 1,
      results: [{
        state: 'dispatched',
        jobId: 'dwj_v3_recovery_1',
        messageId: 'qstash-recovery-1',
      }],
    });
    const response = await GET(request('cron-secret'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      recovery: { scanned: 2, eligible: 1 },
    });
  });

  it('keeps partial or failed delivery retryable without hiding its receipt', async () => {
    mocks.recovery.mockResolvedValue({
      scanned: 1,
      eligible: 1,
      skipped: 0,
      results: [{
        state: 'dispatch_unconfirmed',
        jobId: 'dwj_v3_recovery_2',
        reason: 'QSTASH_PUBLISH_REJECTED',
      }],
    });
    const response = await GET(request('cron-secret'));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      recovery: {
        results: [{ jobId: 'dwj_v3_recovery_2' }],
      },
    });
  });

  it('sanitizes a recovery-runtime outage and keeps the cron retryable', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recovery.mockRejectedValue(new Error('database-secret-detail'));
    const response = await GET(request('cron-secret'));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: { code: 'MEDIA_SOURCE_PTS_CADENCE_RECOVERY_UNAVAILABLE' },
    });
    expect(JSON.stringify(body)).not.toContain('database-secret-detail');
    errorLog.mockRestore();
  });

  it('is present in the deployed cron schedule', () => {
    const configuration = JSON.parse(
      readFileSync(resolve(repoRoot, 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: '/api/cron/recover-media-source-pts-cadence-v3',
      schedule: '*/5 * * * *',
    });
  });
});

function request(secret?: string): Request {
  return new Request(
    'https://editron.example.test/api/cron/recover-media-source-pts-cadence-v3',
    {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    },
  );
}
