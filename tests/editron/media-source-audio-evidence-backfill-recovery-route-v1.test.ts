import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ recovery: vi.fn() }));
vi.mock(
  '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-v1',
  () => ({ recoverMediaSourceAudioEvidenceBackfillRunsV1: mocks.recovery }),
);

import { GET }
  from '@/app/api/cron/recover-media-source-audio-evidence-backfill/route';

const repoRoot = resolve(__dirname, '../..');
const RECEIPT_HASH = 'c'.repeat(64);

describe('media source audio evidence backfill recovery cron V1', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.recovery.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fails closed when cron authentication is absent or wrong', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request())).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect((await GET(request('wrong-secret'))).status).toBe(401);
    expect(mocks.recovery).not.toHaveBeenCalled();
  });

  it('returns success only when every selected delivery is confirmed', async () => {
    mocks.recovery.mockResolvedValue(receipt({
      selectedCount: 2,
      confirmedCount: 2,
      unconfirmedCount: 0,
    }));

    const response = await GET(request('cron-secret'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      recovery: {
        selectedCount: 2,
        confirmedCount: 2,
        unconfirmedCount: 0,
        recoveryReceiptSha256: RECEIPT_HASH,
      },
    });
  });

  it('returns a retryable receipt and sanitized alert for partial delivery', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recovery.mockResolvedValue(receipt({
      selectedCount: 2,
      confirmedCount: 1,
      unconfirmedCount: 1,
    }));

    const response = await GET(request('cron-secret'));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    const body = await response.json();
    expect(body).toMatchObject({
      success: false,
      recovery: {
        selectedCount: 2,
        unconfirmedCount: 1,
        recoveryReceiptSha256: RECEIPT_HASH,
      },
    });
    expect(errorLog).toHaveBeenCalledWith(
      '[MediaSourceAudioEvidenceBackfillRecoveryV1]',
      {
        code: 'RECOVERY_DELIVERY_UNCONFIRMED',
        recoveryReceiptSha256: RECEIPT_HASH,
        selectedCount: 2,
        unconfirmedCount: 1,
      },
    );
  });

  it('sanitizes a recovery outage and remains retryable', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recovery.mockRejectedValue(new Error('database-secret-detail'));

    const response = await GET(request('cron-secret'));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_UNAVAILABLE',
      },
    });
    expect(JSON.stringify(body)).not.toContain('database-secret-detail');
    expect(errorLog).toHaveBeenCalledWith(
      '[MediaSourceAudioEvidenceBackfillRecoveryV1] sweep unavailable:',
      'Error',
    );
  });

  it('is present in the deployed cron schedule', () => {
    const configuration = JSON.parse(
      readFileSync(resolve(repoRoot, 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(configuration.crons).toContainEqual({
      path: '/api/cron/recover-media-source-audio-evidence-backfill',
      schedule: '*/5 * * * *',
    });
  });
});

function request(secret?: string): Request {
  return new Request(
    'https://editron.example.test/api/cron/'
      + 'recover-media-source-audio-evidence-backfill',
    {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    },
  );
}

function receipt(counts: Readonly<{
  selectedCount: number;
  confirmedCount: number;
  unconfirmedCount: number;
}>) {
  return {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RECEIPT_V1',
    selectedAt: '2026-08-30T20:00:00.000Z',
    staleBefore: '2026-08-30T19:50:00.000Z',
    staleMs: 600_000,
    runLimit: 10,
    batchLimit: 25,
    ...counts,
    results: [],
    recoveryReceiptSha256: RECEIPT_HASH,
  };
}
