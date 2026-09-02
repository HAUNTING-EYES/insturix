import { describe, expect, it, vi } from 'vitest';

import {
  hashEditronCanonicalJsonV1,
} from '@/lib/editron/services/canonical-json-v1';
import type { MediaSourceAudioArtifactAssetStateInputV1 }
  from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioAvailabilityEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import {
  runMediaSourceAudioEvidenceBackfillBatchV1,
  type MediaSourceAudioEvidenceBackfillBatchReceiptV1,
  type MediaSourceAudioEvidenceBackfillCandidateV1,
  type MediaSourceAudioEvidenceBackfillCursorV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-batch-v1';
import type { MediaSourceAudioEvidenceBackfillResultV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-v1';
import {
  advanceMediaSourceAudioEvidenceBackfillRunRecordV1,
  assertMediaSourceAudioEvidenceBackfillRunRecordV1,
  createMediaSourceAudioEvidenceBackfillRunRecordV1,
  failMediaSourceAudioEvidenceBackfillRunRecordV1,
  type MediaSourceAudioEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-version-evidence-owner-v1';

const RUN_ID = 'audio-evidence-backfill-2026-08-30';
const POLICY = 'audio-evidence-backfill-policy-v1';
const CREATED_AT = '2026-08-30T22:00:00.000Z';
const UPPER_BOUND = { assetId: 'asset-z', userId: 'user-z' } as const;

describe('MediaSourceAudioEvidenceBackfillRunRecordV1', () => {
  it('creates a canonical immutable-scope run record', () => {
    const record = createRun();
    const { recordSha256, ...material } = record;

    expect(record).toMatchObject({
      recordVersion: 1,
      migrationRunId: RUN_ID,
      policyVersion: POLICY,
      upperBoundCursor: UPPER_BOUND,
      status: 'RUNNING',
      committedBatchCount: 0,
      processedItemCount: 0,
      currentCursor: null,
      previousRecordSha256: null,
    });
    expect(recordSha256).toBe(hashEditronCanonicalJsonV1(material));
    expect(assertMediaSourceAudioEvidenceBackfillRunRecordV1(record))
      .toEqual(record);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('advances verified batches and reports terminal unverifiable evidence', async () => {
    const initial = createRun();
    const firstReceipt = await receipt({
      limit: 2,
      candidates: [
        candidate('asset-a'), candidate('asset-b'), candidate('asset-c'),
      ],
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    const first = advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
      initial,
      firstReceipt,
    );
    expect(first).toMatchObject({
      recordVersion: 2,
      status: 'RUNNING',
      currentCursor: { assetId: 'asset-b', userId: 'user-a' },
      committedBatchCount: 1,
      processedItemCount: 2,
      backfilledCount: 2,
      previousRecordSha256: initial.recordSha256,
      lastBatchReceiptSha256: firstReceipt.batchReceiptSha256,
    });

    const secondReceipt = await receipt({
      afterCursor: first.currentCursor,
      limit: 2,
      candidates: [candidate('asset-c')],
      resultFor: () => nonRetryableFailure(),
      completedAt: '2026-08-30T22:02:00.000Z',
    });
    const complete = advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
      first,
      secondReceipt,
    );
    expect(complete).toMatchObject({
      recordVersion: 3,
      status: 'COMPLETE_WITH_UNVERIFIABLE',
      currentCursor: { assetId: 'asset-c', userId: 'user-a' },
      upperBoundCursor: UPPER_BOUND,
      committedBatchCount: 2,
      processedItemCount: 3,
      backfilledCount: 2,
      unverifiableCount: 1,
      terminalAt: '2026-08-30T22:02:00.000Z',
      previousRecordSha256: first.recordSha256,
    });
    expect(assertMediaSourceAudioEvidenceBackfillRunRecordV1(complete))
      .toEqual(complete);
  });

  it('records an empty bounded scan as a proved completion', async () => {
    const initial = createRun(null);
    const emptyReceipt = await receipt({
      upperBoundCursor: null,
      limit: 5,
      candidates: [],
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    const complete = advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
      initial,
      emptyReceipt,
    );

    expect(complete).toMatchObject({
      status: 'COMPLETE',
      currentCursor: null,
      upperBoundCursor: null,
      committedBatchCount: 1,
      processedItemCount: 0,
      lastBatchReceiptSha256: emptyReceipt.batchReceiptSha256,
    });
  });

  it('rejects retry, scope, cursor and timestamp-invalid transitions', async () => {
    const initial = createRun();
    const retryReceipt = await receipt({
      limit: 2,
      candidates: [candidate('asset-a')],
      resultFor: () => retryableFailure(),
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    expect(() => advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
      initial,
      retryReceipt,
    )).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_RETRY_RECEIPT_NOT_COMMITTABLE',
    );

    const wrongRunReceipt = await receipt({
      migrationRunId: 'another-audio-evidence-run',
      limit: 2,
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    expect(() => advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
      initial,
      wrongRunReceipt,
    )).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_RECEIPT_BINDING_MISMATCH',
    );

    const regressedReceipt = await receipt({
      limit: 2,
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T21:59:59.000Z',
    });
    expect(() => advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
      initial,
      regressedReceipt,
    )).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_TIMESTAMP_REGRESSION',
    );
  });

  it('records a terminal deterministic page failure and forbids reopening', async () => {
    const initial = createRun();
    const failed = failMediaSourceAudioEvidenceBackfillRunRecordV1(initial, {
      failureCode: 'CANDIDATE_PAGE_INVALID',
      failedAt: '2026-08-30T22:01:00.000Z',
    });
    expect(failed).toMatchObject({
      recordVersion: 2,
      status: 'FAILED',
      failureCode: 'CANDIDATE_PAGE_INVALID',
      committedBatchCount: 0,
      terminalAt: '2026-08-30T22:01:00.000Z',
      previousRecordSha256: initial.recordSha256,
    });
    expect(() => failMediaSourceAudioEvidenceBackfillRunRecordV1(failed, {
      failureCode: 'CANDIDATE_PAGE_INVALID',
      failedAt: '2026-08-30T22:02:00.000Z',
    })).toThrow('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_RUN_NOT_RUNNING');

    const receiptValue = await receipt({
      limit: 2,
      candidates: [],
      completedAt: '2026-08-30T22:02:00.000Z',
    });
    expect(() => advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
      failed,
      receiptValue,
    )).toThrow('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_RUN_NOT_RUNNING');
  });

  it('rejects tampered and rehashed impossible run records', () => {
    const record = createRun();
    expect(() => assertMediaSourceAudioEvidenceBackfillRunRecordV1({
      ...record,
      unexpected: true,
    })).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_RECORD_FIELDS_INVALID',
    );
    expect(() => assertMediaSourceAudioEvidenceBackfillRunRecordV1({
      ...record,
      recordSha256: '0'.repeat(64),
    })).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_RECORD_HASH_MISMATCH',
    );

    const { recordSha256: _hash, ...material } = record;
    const falseProgress = {
      ...material,
      processedItemCount: 1,
      backfilledCount: 1,
    };
    expect(() => assertMediaSourceAudioEvidenceBackfillRunRecordV1(
      withRecordHash(falseProgress),
    )).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_RECORD_INVARIANT_INVALID',
    );

    const falseCompletion = {
      ...material,
      status: 'COMPLETE',
      terminalAt: material.updatedAt,
    };
    expect(() => assertMediaSourceAudioEvidenceBackfillRunRecordV1(
      withRecordHash(falseCompletion),
    )).toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_RECORD_STATUS_INVALID',
    );
  });
});

function createRun(
  upperBoundCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null
    = UPPER_BOUND,
): MediaSourceAudioEvidenceBackfillRunRecordV1 {
  return createMediaSourceAudioEvidenceBackfillRunRecordV1({
    migrationRunId: RUN_ID,
    policyVersion: POLICY,
    upperBoundCursor,
    createdAt: CREATED_AT,
  });
}

async function receipt(input: Readonly<{
  migrationRunId?: string;
  policyVersion?: string;
  afterCursor?: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  upperBoundCursor?: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  limit: number;
  candidates: readonly MediaSourceAudioEvidenceBackfillCandidateV1[];
  resultFor?: (assetId: string) => MediaSourceAudioEvidenceBackfillResultV1;
  completedAt: string;
}>): Promise<MediaSourceAudioEvidenceBackfillBatchReceiptV1> {
  const resultFor = input.resultFor ?? success;
  const result = await runMediaSourceAudioEvidenceBackfillBatchV1({
    migrationRunId: input.migrationRunId ?? RUN_ID,
    policyVersion: input.policyVersion ?? POLICY,
    afterCursor: input.afterCursor ?? null,
    upperBoundCursor: input.upperBoundCursor === undefined
      ? UPPER_BOUND
      : input.upperBoundCursor,
    limit: input.limit,
    completedAt: new Date(input.completedAt),
  }, {
    loadCandidates: vi.fn(async () => input.candidates),
    backfillCandidate: vi.fn(async (asset) => (
      resultFor((asset as TestAsset).assetId)
    )),
    availabilityEvidenceStorePorts: evidencePorts(),
    legacyEvidenceStorePorts: evidencePorts(),
  });
  if (!('receipt' in result)) throw new Error('TEST_RECEIPT_MISSING');
  return result.receipt;
}

type TestAsset = MediaSourceAudioArtifactAssetStateInputV1 & {
  assetId: string;
};

function candidate(
  assetId: string,
  userId = 'user-a',
): MediaSourceAudioEvidenceBackfillCandidateV1 {
  return {
    assetId,
    userId,
    asset: { assetId } as TestAsset,
  };
}

function success(sourceVersionSeed: string): MediaSourceAudioEvidenceBackfillResultV1 {
  return {
    disposition: 'BACKFILLED',
    sourceVersionSha256: hashEditronCanonicalJsonV1({ sourceVersionSeed }),
    audioDisposition: 'NO_AUDIO_STREAMS_OBSERVED',
    availabilityWriteDisposition: 'APPLIED',
    availabilityEvidenceSha256: '1'.repeat(64),
    legacyWriteDisposition: 'NOT_REQUIRED',
    legacyEvidenceSha256: null,
  };
}

function nonRetryableFailure(): MediaSourceAudioEvidenceBackfillResultV1 {
  return {
    disposition: 'UNVERIFIABLE',
    reason: 'SOURCE_STATE_INVALID',
    retryable: false,
  };
}

function retryableFailure(): MediaSourceAudioEvidenceBackfillResultV1 {
  return {
    disposition: 'UNVERIFIABLE',
    reason: 'CANONICAL_STORE_LOAD_FAILED',
    retryable: true,
  };
}

function evidencePorts(): MediaSourceAudioAvailabilityEvidenceStorePortsV1
  & MediaSourceVersionEvidenceStorePortsV1 {
  return {
    load: vi.fn(async () => null),
    compareAndSet: vi.fn(async () => false),
  };
}

function withRecordHash(material: Record<string, unknown>) {
  return {
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  };
}
