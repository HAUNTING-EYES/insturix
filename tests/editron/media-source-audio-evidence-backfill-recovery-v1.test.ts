import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-dispatch-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1,
  recoverMediaSourceAudioEvidenceBackfillRunsV1,
  resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV1,
  type MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV1,
  type MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-v1';
import {
  createMediaSourceAudioEvidenceBackfillRunRecordV1,
  type MediaSourceAudioEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';

const NOW = new Date('2026-08-30T20:00:00.000Z');
const STALE_BEFORE = new Date('2026-08-30T19:50:00.000Z');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('media source audio evidence backfill recovery V1', () => {
  it('requires explicit bounded operational configuration', () => {
    expect(() => resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV1({
      ...environment(),
      EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS: undefined,
    })).toThrow('RECOVERY_STALE_MS_CONFIG_INVALID');
    expect(() => resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV1({
      ...environment(),
      EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS: '599999',
    })).toThrow('RECOVERY_STALE_MS_INVALID');
    expect(() => resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV1({
      ...environment(),
      EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT: '101',
    })).toThrow('RECOVERY_RUN_LIMIT_INVALID');
    expect(resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV1(
      environment(),
    )).toEqual({ staleMs: 600_000, runLimit: 10, batchLimit: 25 });
  });

  it('uses the bounded primary-majority recovery index and validates envelopes', async () => {
    const first = run('run-a', '2026-08-30T19:00:00.000Z');
    const second = run('run-b', '2026-08-30T19:00:00.000Z');
    const collection = mongoCollection([document(first), document(second)]);
    const source = createMediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1({
      loadCollection: async () => collection,
    });

    await expect(source.listStaleRunning({
      staleBefore: STALE_BEFORE,
      limit: 10,
    })).resolves.toEqual([first, second]);
    expect(collection.createIndex).toHaveBeenCalledWith(
      { status: 1, updatedAt: 1, migrationRunId: 1 },
      { name: 'audio_evidence_backfill_recovery_v1' },
    );
    expect(collection.findMany).toHaveBeenCalledWith({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_DOCUMENT_V1',
      status: 'RUNNING',
      updatedAt: { $lte: STALE_BEFORE },
    }, {
      projection: {
        _id: 1,
        kind: 1,
        migrationRunId: 1,
        record: 1,
        recordSha256: 1,
        schemaVersion: 1,
        status: 1,
        updatedAt: 1,
      },
      sort: { updatedAt: 1, migrationRunId: 1 },
      limit: 10,
      hint: 'audio_evidence_backfill_recovery_v1',
      readConcern: { level: 'majority' },
      readPreference: 'primary',
    });
  });

  it('retries index creation after an outage instead of caching failure', async () => {
    const createIndex = vi.fn()
      .mockRejectedValueOnce(new Error('index unavailable'))
      .mockResolvedValue('audio_evidence_backfill_recovery_v1');
    const collection = mongoCollection([], createIndex);
    const source = createMediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1({
      loadCollection: async () => collection,
    });

    await expect(source.listStaleRunning({
      staleBefore: STALE_BEFORE,
      limit: 1,
    })).rejects.toThrow('index unavailable');
    await expect(source.listStaleRunning({
      staleBefore: STALE_BEFORE,
      limit: 1,
    })).resolves.toEqual([]);
    expect(createIndex).toHaveBeenCalledTimes(2);
  });

  it('rejects corrupt, too-fresh and noncanonical candidate pages', async () => {
    const stale = run('run-stale', '2026-08-30T19:00:00.000Z');
    const fresh = run('run-fresh', '2026-08-30T19:55:00.000Z');
    const corrupt = { ...document(stale), recordSha256: HASH_A };
    const reversed = [
      document(run('run-b', '2026-08-30T19:00:00.000Z')),
      document(run('run-a', '2026-08-30T19:00:00.000Z')),
    ];

    await expect(sourceFor([corrupt]).listStaleRunning({
      staleBefore: STALE_BEFORE,
      limit: 10,
    })).rejects.toThrow('RECOVERY_CANDIDATE_DOCUMENT_ENVELOPE_INVALID');
    await expect(sourceFor([document(fresh)]).listStaleRunning({
      staleBefore: STALE_BEFORE,
      limit: 10,
    })).rejects.toThrow('RECOVERY_CANDIDATE_DOCUMENT_ENVELOPE_INVALID');
    await expect(sourceFor(reversed).listStaleRunning({
      staleBefore: STALE_BEFORE,
      limit: 10,
    })).rejects.toThrow('RECOVERY_CANDIDATE_ORDER_INVALID');
  });

  it('dispatches each selected run with its exact current record hash', async () => {
    const first = run('run-a', '2026-08-30T19:00:00.000Z');
    const second = run('run-b', '2026-08-30T19:10:00.000Z');
    const candidateSource = {
      listStaleRunning: vi.fn(async () => Object.freeze([first, second])),
    };
    const dispatch = vi.fn()
      .mockResolvedValueOnce(Object.freeze({
        disposition: 'DISPATCHED' as const,
        messageId: 'qstash-recovery-a',
        deduplicationId: HASH_A,
      }))
      .mockResolvedValueOnce(Object.freeze({
        disposition: 'DEDUPLICATED' as const,
        messageId: 'qstash-recovery-b',
        deduplicationId: HASH_B,
      }));

    const receipt = await recoverMediaSourceAudioEvidenceBackfillRunsV1({
      environment: environment(),
      candidateSource,
      dispatch,
      now: NOW,
    });

    expect(candidateSource.listStaleRunning).toHaveBeenCalledWith({
      staleBefore: STALE_BEFORE,
      limit: 10,
    });
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      message: {
        schemaVersion: 1,
        kind: 'RUN_NEXT_BATCH',
        migrationRunId: first.migrationRunId,
        expectedRecordSha256: first.recordSha256,
        batchLimit: 25,
      },
      deliveryPolicy: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
      environment: environment(),
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      message: expect.objectContaining({
        migrationRunId: second.migrationRunId,
        expectedRecordSha256: second.recordSha256,
      }),
    }));
    expect(receipt).toMatchObject({
      selectedAt: NOW.toISOString(),
      staleBefore: STALE_BEFORE.toISOString(),
      selectedCount: 2,
      confirmedCount: 2,
      unconfirmedCount: 0,
    });
    const { recoveryReceiptSha256, ...material } = receipt;
    expect(recoveryReceiptSha256).toBe(hashEditronCanonicalJsonV1(material));
  });

  it('returns a retryable receipt for thrown, unconfirmed or malformed dispatch', async () => {
    const first = run('run-a', '2026-08-30T19:00:00.000Z');
    const second = run('run-b', '2026-08-30T19:10:00.000Z');
    const third = run('run-c', '2026-08-30T19:20:00.000Z');
    const dispatch = vi.fn()
      .mockRejectedValueOnce(new Error('secret provider detail'))
      .mockResolvedValueOnce(Object.freeze({
        disposition: 'UNCONFIRMED' as const,
        reason: 'QSTASH_PUBLISH_REJECTED' as const,
        messageId: null,
        deduplicationId: HASH_B,
      }))
      .mockResolvedValueOnce(Object.freeze({
        disposition: 'DISPATCHED' as const,
        messageId: 'qstash-forged-success',
        deduplicationId: HASH_A,
        forged: true,
      }));

    const receipt = await recoverMediaSourceAudioEvidenceBackfillRunsV1({
      environment: environment(),
      candidateSource: {
        listStaleRunning: async () => Object.freeze([first, second, third]),
      },
      dispatch,
      now: NOW,
    });

    expect(receipt).toMatchObject({
      selectedCount: 3,
      confirmedCount: 0,
      unconfirmedCount: 3,
      results: [{
        migrationRunId: 'run-a',
        dispatch: {
          disposition: 'UNCONFIRMED',
          reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
          messageId: null,
          deduplicationId: null,
        },
      }, {
        migrationRunId: 'run-b',
        dispatch: {
          disposition: 'UNCONFIRMED',
          reason: 'QSTASH_PUBLISH_REJECTED',
        },
      }, {
        migrationRunId: 'run-c',
        dispatch: {
          disposition: 'UNCONFIRMED',
          reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
          messageId: null,
          deduplicationId: null,
        },
      }],
    });
    expect(JSON.stringify(receipt)).not.toContain('secret provider detail');
  });

  it('fails preflight before candidate access when recovery or dispatch config is absent', async () => {
    const listStaleRunning = vi.fn();
    await expect(recoverMediaSourceAudioEvidenceBackfillRunsV1({
      environment: {
        ...environment(),
        EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT: undefined,
      },
      candidateSource: { listStaleRunning },
      now: NOW,
    })).rejects.toThrow('RECOVERY_BATCH_LIMIT_CONFIG_INVALID');
    await expect(recoverMediaSourceAudioEvidenceBackfillRunsV1({
      environment: { ...environment(), QSTASH_TOKEN: undefined },
      candidateSource: { listStaleRunning },
      now: NOW,
    })).rejects.toThrow('RECOVERY_DISPATCH_MISSING_QSTASH_TOKEN');
    expect(listStaleRunning).not.toHaveBeenCalled();
  });

  it('rejects a source that returns a too-fresh record before dispatch', async () => {
    const dispatch = vi.fn();
    await expect(recoverMediaSourceAudioEvidenceBackfillRunsV1({
      environment: environment(),
      candidateSource: {
        listStaleRunning: async () => Object.freeze([
          run('run-fresh', '2026-08-30T19:55:00.000Z'),
        ]),
      },
      dispatch,
      now: NOW,
    })).rejects.toThrow('RECOVERY_CANDIDATE_NOT_STALE_RUNNING');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

function environment(): MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV1 {
  return {
    QSTASH_TOKEN: 'qstash-token',
    QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
    QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
    NEXT_PUBLIC_APP_URL: 'https://editron.example.test',
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS: '600000',
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT: '10',
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT: '25',
  };
}

function run(
  migrationRunId: string,
  createdAt: string,
): MediaSourceAudioEvidenceBackfillRunRecordV1 {
  return createMediaSourceAudioEvidenceBackfillRunRecordV1({
    migrationRunId,
    policyVersion: 'audio-backfill-policy-v1',
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    createdAt,
  });
}

function document(record: MediaSourceAudioEvidenceBackfillRunRecordV1) {
  return {
    _id: record.migrationRunId,
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_DOCUMENT_V1',
    migrationRunId: record.migrationRunId,
    status: record.status,
    recordSha256: record.recordSha256,
    updatedAt: new Date(record.updatedAt),
    record,
  };
}

function sourceFor(documents: readonly Record<string, unknown>[]) {
  return createMediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1({
    loadCollection: async () => mongoCollection(documents),
  });
}

function mongoCollection(
  documents: readonly Record<string, unknown>[],
  createIndex = vi.fn(async () => 'audio_evidence_backfill_recovery_v1'),
): MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1 {
  return {
    createIndex,
    findMany: vi.fn(async () => documents),
  };
}
