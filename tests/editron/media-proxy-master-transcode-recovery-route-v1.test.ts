import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ recovery: vi.fn() }));
vi.mock(
  '@/lib/editron/services/media-proxy-master-transcode-recovery-runtime-v2',
  () => ({ runMediaProxyMasterTranscodeRecoveryV2: mocks.recovery }),
);

import { GET }
  from '@/app/api/cron/recover-media-proxy-master-transcode/route';

const repoRoot = resolve(__dirname, '../..');

describe('media proxy/master transcode recovery cron V2', () => {
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
        jobId: 'proxy_recovery_1',
        messageId: 'qstash-proxy-recovery-1',
      }],
    });
    const response = await GET(request('cron-secret'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      recovery: { results: [{ jobId: 'proxy_recovery_1' }] },
    });
  });

  it('keeps policy or delivery failures retryable with their receipts', async () => {
    mocks.recovery.mockResolvedValue({
      scanned: 2,
      eligible: 2,
      skipped: 0,
      results: [{
        state: 'policy_unavailable',
        jobId: 'proxy_recovery_2',
        reason: 'RETRY_POLICY_UNAVAILABLE',
      }, {
        state: 'dispatch_unconfirmed',
        jobId: 'proxy_recovery_3',
        reason: 'QSTASH_PUBLISH_REJECTED',
      }],
    });
    const response = await GET(request('cron-secret'));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      recovery: {
        results: [
          { jobId: 'proxy_recovery_2', state: 'policy_unavailable' },
          { jobId: 'proxy_recovery_3', state: 'dispatch_unconfirmed' },
        ],
      },
    });
  });

  it('sanitizes runtime outages and keeps the cron retryable', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recovery.mockRejectedValue(new Error('database-secret-detail'));
    const response = await GET(request('cron-secret'));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: { code: 'MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_UNAVAILABLE' },
    });
    expect(JSON.stringify(body)).not.toContain('database-secret-detail');
    errorLog.mockRestore();
  });

  it('is present in the deployed cron schedule', () => {
    const configuration = JSON.parse(
      readFileSync(resolve(repoRoot, 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: '/api/cron/recover-media-proxy-master-transcode',
      schedule: '*/5 * * * *',
    });
  });
});

function request(secret?: string): Request {
  return new Request(
    'https://editron.example.test/api/cron/recover-media-proxy-master-transcode',
    {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    },
  );
}
