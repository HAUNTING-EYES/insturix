import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-batch-v1';
import type {
  MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1,
  MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import {
  advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-v1';

const RUN_ID = 'v3-evidence-backfill-2026-08-30';
const POLICY = 'v3-evidence-backfill-policy-v1';
const CREATED_AT = '2026-08-30T22:00:00.000Z';
const UPPER_BOUND = { assetId: 'asset-z', userId: 'user-z' } as const;

describe('MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1', () => {
  it('creates a canonical self-hashed immutable run scope', () => {
    const record = createRun();
    const { recordSha256, ...material } = record;

    expect(record).toMatchObject({
      recordVersion: 1,
      migrationRunId: RUN_ID,
      policyVersion: POLICY,
      upperBoundCursor: UPPER_BOUND,
      status: 'RUNNING',
      currentCursor: null,
      committedBatchCount: 0,
      processedItemCount: 0,
      previousRecordSha256: null,
    });
    expect(recordSha256).toBe(hashEditronCanonicalJsonV1(material));
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      record,
    )).toEqual(record);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('advances exact batches and reports terminal unverifyable evidence', async () => {
    const initial = createRun();
    const firstReceipt = await receipt({
      limit: 2,
      candidates: [
        candidate('asset-a'), candidate('asset-b'), candidate('asset-c'),
      ],
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    const first = advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
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
      resultFor: () => permanentFailure(),
      completedAt: '2026-08-30T22:02:00.000Z',
    });
    const complete = advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      first,
      secondReceipt,
    );
    expect(complete).toMatchObject({
      recordVersion: 3,
      status: 'COMPLETE_WITH_UNVERIFIABLE',
      currentCursor: { assetId: 'asset-c', userId: 'user-a' },
      committedBatchCount: 2,
      processedItemCount: 3,
      backfilledCount: 2,
      unverifiableCount: 1,
      terminalAt: '2026-08-30T22:02:00.000Z',
      previousRecordSha256: first.recordSha256,
    });
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      complete,
    )).toEqual(complete);
  });

  it('records an empty bounded inventory as a proved completion', async () => {
    const initial = createRun(null);
    const emptyReceipt = await receipt({
      upperBoundCursor: null,
      limit: 5,
      candidates: [],
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    const complete = advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
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

  it('rejects retry, scope and timestamp-invalid transitions', async () => {
    const initial = createRun();
    const retryReceipt = await receipt({
      limit: 2,
      candidates: [candidate('asset-a')],
      resultFor: () => retryableFailure(),
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    expect(() => advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      initial,
      retryReceipt,
    )).toThrow('RUN_RETRY_RECEIPT_NOT_COMMITTABLE');

    const wrongRun = await receipt({
      migrationRunId: 'another-v3-evidence-run',
      limit: 2,
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    expect(() => advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      initial,
      wrongRun,
    )).toThrow('RUN_RECEIPT_BINDING_MISMATCH');

    const regressed = await receipt({
      limit: 2,
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T21:59:59.000Z',
    });
    expect(() => advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      initial,
      regressed,
    )).toThrow('RUN_TIMESTAMP_REGRESSION');
  });

  it('records deterministic page failure and forbids terminal reopening', async () => {
    const initial = createRun();
    const failed = failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      initial,
      {
        failureCode: 'CANDIDATE_PAGE_INVALID',
        failedAt: '2026-08-30T22:01:00.000Z',
      },
    );
    expect(failed).toMatchObject({
      recordVersion: 2,
      status: 'FAILED',
      failureCode: 'CANDIDATE_PAGE_INVALID',
      terminalAt: '2026-08-30T22:01:00.000Z',
      previousRecordSha256: initial.recordSha256,
    });
    expect(() => failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      failed,
      {
        failureCode: 'CANDIDATE_PAGE_INVALID',
        failedAt: '2026-08-30T22:02:00.000Z',
      },
    )).toThrow('RUN_RUN_NOT_RUNNING');

    const finalReceipt = await receipt({
      limit: 2,
      candidates: [],
      completedAt: '2026-08-30T22:02:00.000Z',
    });
    expect(() => advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      failed,
      finalReceipt,
    )).toThrow('RUN_RUN_NOT_RUNNING');
  });

  it('rejects tampered and rehashed impossible run records', () => {
    const record = createRun();
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
      ...record,
      unexpected: true,
    })).toThrow('RUN_RECORD_FIELDS_INVALID');
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
      ...record,
      recordSha256: '0'.repeat(64),
    })).toThrow('RUN_RECORD_HASH_MISMATCH');

    const { recordSha256: _hash, ...material } = record;
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      withRecordHash({
        ...material,
        processedItemCount: 1,
        backfilledCount: 1,
      }),
    )).toThrow('RUN_RECORD_INVARIANT_INVALID');
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      withRecordHash({
        ...material,
        status: 'COMPLETE',
        terminalAt: material.updatedAt,
      }),
    )).toThrow('RUN_RECORD_STATUS_INVALID');
  });
});

function createRun(
  upperBoundCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null
    = UPPER_BOUND,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
    migrationRunId: RUN_ID,
    policyVersion: POLICY,
    upperBoundCursor,
    createdAt: CREATED_AT,
  });
}

async function receipt(input: Readonly<{
  migrationRunId?: string;
  policyVersion?: string;
  afterCursor?: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  upperBoundCursor?: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  limit: number;
  candidates: readonly MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[];
  resultFor?: (
    assetId: string,
  ) => MediaSourcePtsCadenceVersionEvidenceBackfillResultV1;
  completedAt: string;
}>): Promise<MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1> {
  const resultFor = input.resultFor ?? success;
  const result = await runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1({
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
    backfillCandidate: vi.fn(async (asset) => {
      if (typeof asset.assetId !== 'string') throw new Error('TEST_ASSET_ID_INVALID');
      return resultFor(asset.assetId);
    }),
    storedObjectReader: { read: vi.fn(async () => {
      throw new Error('TEST_ARTIFACT_READER_SHOULD_NOT_RUN');
    }) },
    boundarySemanticVerifier: { verify: vi.fn(async () => ({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'TEST_BOUNDARY_VERIFIER_SHOULD_NOT_RUN',
    })) },
    evidenceStorePorts: {
      load: vi.fn(async () => null),
      compareAndSet: vi.fn(async () => true),
    },
  });
  if (!('receipt' in result)) throw new Error('TEST_RECEIPT_MISSING');
  return result.receipt;
}

function candidate(
  assetId: string,
  userId = 'user-a',
): MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1 {
  return {
    assetId,
    userId,
    asset: { assetId },
  } as MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1;
}

function success(assetId: string): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
  return {
    disposition: 'BACKFILLED',
    assetId,
    sourceVersionSha256: 'a'.repeat(64),
    terminalReceiptSha256: 'b'.repeat(64),
    verificationSha256: 'c'.repeat(64),
    evidenceWriteDisposition: 'APPLIED',
    evidenceSha256: 'd'.repeat(64),
  };
}

function permanentFailure(): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
  return {
    disposition: 'UNVERIFIABLE',
    reason: 'PERSISTED_VERIFICATION_MISMATCH',
    retryable: false,
    artifactReason: null,
  };
}

function retryableFailure(): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
  return {
    disposition: 'UNVERIFIABLE',
    reason: 'EVIDENCE_STORE_LOAD_FAILED',
    retryable: true,
    artifactReason: null,
  };
}

function withRecordHash(
  material: Omit<
    MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
    'recordSha256'
  >,
) {
  return { ...material, recordSha256: hashEditronCanonicalJsonV1(material) };
}
