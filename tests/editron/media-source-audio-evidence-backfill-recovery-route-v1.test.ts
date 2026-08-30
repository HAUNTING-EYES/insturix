import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ recovery: vi.fn() }));
vi.mock(
  '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-owner-v2',
  () => ({ recoverMediaSourceAudioEvidenceBackfillSweepsV2: mocks.recovery }),
);

import { GET }
  from '@/app/api/cron/recover-media-source-audio-evidence-backfill/route';

const repoRoot = resolve(__dirname, '../..');
const RECEIPT_HASH = 'c'.repeat(64);

describe('media source audio evidence backfill recovery cron V2', () => {
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

  it('returns success only when every claimed delivery is confirmed', async () => {
    mocks.recovery.mockResolvedValue(receipt({
      claimedCount: 2,
      confirmedCount: 2,
      unconfirmedCount: 0,
    }));

    const response = await GET(request('cron-secret'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      recovery: {
        claimedCount: 2,
        confirmedCount: 2,
        unconfirmedCount: 0,
        recoveryReceiptSha256: RECEIPT_HASH,
      },
    });
  });

  it('returns a retryable receipt and sanitized alert for partial delivery', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recovery.mockResolvedValue(receipt({
      claimedCount: 2,
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
        claimedCount: 2,
        unconfirmedCount: 1,
        recoveryReceiptSha256: RECEIPT_HASH,
      },
    });
    expect(errorLog).toHaveBeenCalledWith(
      '[MediaSourceAudioEvidenceBackfillRecoveryV2]',
      {
        code: 'RECOVERY_DELIVERY_UNCONFIRMED',
        recoveryReceiptSha256: RECEIPT_HASH,
        claimedCount: 2,
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
      '[MediaSourceAudioEvidenceBackfillRecoveryV2] sweep unavailable:',
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
  claimedCount: number;
  confirmedCount: number;
  unconfirmedCount: number;
}>) {
  const retryRequired = counts.unconfirmedCount > 0;
  return {
    schemaVersion: 2,
    kind: 'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RECEIPT_V2',
    invokedAt: '2026-08-30T20:00:00.000Z',
    batchLimit: 25,
    selection: {
      disposition: 'SELECTED',
      selectedSweepIntentSha256: 'd'.repeat(64),
      staleBefore: '2026-08-30T19:50:00.000Z',
      selectionLimit: 10,
    },
    claim: {
      sweepIntentSha256: 'd'.repeat(64),
      selectedAt: '2026-08-30T20:00:00.000Z',
      staleBefore: '2026-08-30T19:50:00.000Z',
      entryCount: counts.claimedCount,
      attemptNumber: 1,
      claimedRecordSha256: 'e'.repeat(64),
      claimedAt: '2026-08-30T20:00:00.000Z',
      leaseExpiresAt: '2026-08-30T20:02:00.000Z',
      attemptPolicySha256: 'f'.repeat(64),
    },
    attempt: {
      attemptSha256: 'a'.repeat(64),
      disposition: retryRequired ? 'RETRY_REQUIRED' : 'COMPLETE',
      attemptedAt: '2026-08-30T20:00:01.000Z',
    },
    settlement: {
      disposition: 'SETTLED',
      sweepRecordSha256: 'b'.repeat(64),
      sweepStatus: retryRequired ? 'RETRY_WAIT' : 'COMPLETE',
      attemptCount: 1,
    },
    ...counts,
    results: Array.from({ length: counts.claimedCount }, (_, index) => ({
      migrationRunId: `run-${index}`,
      expectedRecordSha256: '1'.repeat(64),
      runUpdatedAt: '2026-08-30T19:00:00.000Z',
      dispatch: index < counts.confirmedCount
        ? {
            disposition: 'DISPATCHED',
            messageId: `message-${index}`,
            deduplicationId: '2'.repeat(64),
          }
        : {
            disposition: 'UNCONFIRMED',
            reason: 'QSTASH_PUBLISH_REJECTED',
            messageId: null,
            deduplicationId: '3'.repeat(64),
          },
    })),
    recoveryReceiptSha256: RECEIPT_HASH,
  };
}
