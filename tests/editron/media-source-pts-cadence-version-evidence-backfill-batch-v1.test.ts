import { describe, expect, it, vi } from 'vitest';

import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
  runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchPortsV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-batch-v1';
import {
  MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-v1';

const COMPLETED_AT = new Date('2026-08-30T18:00:00.000Z');

describe('MediaSourcePtsCadenceVersionEvidenceBackfillBatchV1', () => {
  it('uses one-row lookahead and advances through a complete bounded page', async () => {
    const fixture = batchFixture(
      [candidate('asset-a'), candidate('asset-b'), candidate('asset-c')],
      [backfilled('asset-a'), notApplicable()],
    );

    const result = await fixture.run({ limit: 2 });

    expect(result).toMatchObject({
      disposition: 'BATCH_COMPLETE',
      receipt: {
        loadedCandidateCount: 3,
        processedItemCount: 2,
        backfilledCount: 1,
        notApplicableCount: 1,
        unverifiableCount: 0,
        nextCursor: { assetId: 'asset-b', userId: 'user-a' },
      },
    });
    expect(fixture.loadCandidates).toHaveBeenCalledWith({
      afterCursor: null,
      upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
      limit: 3,
    });
    expect(fixture.backfillCandidate).toHaveBeenCalledTimes(2);
    if (!('receipt' in result)) throw new Error('TEST_RECEIPT_MISSING');
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1(
      result.receipt,
    )).toEqual(result.receipt);
  });

  it('records permanent unverifyable evidence and completes the frozen run', async () => {
    const fixture = batchFixture(
      [candidate('asset-a'), candidate('asset-b')],
      [backfilled('asset-a'), permanentFailure()],
    );

    await expect(fixture.run({ limit: 3 })).resolves.toMatchObject({
      disposition: 'RUN_COMPLETE',
      receipt: {
        loadedCandidateCount: 2,
        processedItemCount: 2,
        backfilledCount: 1,
        unverifiableCount: 1,
        nextCursor: { assetId: 'asset-b', userId: 'user-a' },
      },
    });
  });

  it('stops on the first retryable result and does not advance the batch cursor', async () => {
    const fixture = batchFixture(
      [candidate('asset-a'), candidate('asset-b'), candidate('asset-c')],
      [backfilled('asset-a'), retryableFailure(), backfilled('asset-c')],
    );

    await expect(fixture.run({
      afterCursor: { assetId: 'asset-0', userId: 'user-a' },
      limit: 3,
    })).resolves.toMatchObject({
      disposition: 'RETRY_REQUIRED',
      receipt: {
        processedItemCount: 2,
        backfilledCount: 1,
        unverifiableCount: 1,
        inputCursor: { assetId: 'asset-0', userId: 'user-a' },
        nextCursor: { assetId: 'asset-0', userId: 'user-a' },
      },
    });
    expect(fixture.backfillCandidate).toHaveBeenCalledTimes(2);
  });

  it('distinguishes invalid candidate pages from retryable load outages', async () => {
    const invalid = batchFixture([], []);
    invalid.loadCandidates.mockRejectedValue(
      new MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1(
        'ORDER_INVALID',
      ),
    );
    await expect(invalid.run()).resolves.toEqual({
      disposition: 'BATCH_UNVERIFIABLE',
      reason: 'CANDIDATE_PAGE_INVALID',
      retryable: false,
    });

    const outage = batchFixture([], []);
    outage.loadCandidates.mockRejectedValue(new Error('Atlas unavailable'));
    await expect(outage.run()).resolves.toEqual({
      disposition: 'BATCH_UNAVAILABLE',
      reason: 'CANDIDATE_LOAD_FAILED',
      retryable: true,
    });
  });

  it('rejects duplicate or asset-mismatched driver pages before item work', async () => {
    for (const candidates of [
      [candidate('asset-a'), candidate('asset-a')],
      [{ ...candidate('asset-a'), asset: { assetId: 'asset-other' } }],
      [candidate('asset-z')],
    ]) {
      const fixture = batchFixture(candidates, []);
      await expect(fixture.run({
        upperBoundCursor: { assetId: 'asset-y', userId: 'user-y' },
      })).resolves.toEqual({
        disposition: 'BATCH_UNVERIFIABLE',
        reason: 'CANDIDATE_PAGE_INVALID',
        retryable: false,
      });
      expect(fixture.backfillCandidate).not.toHaveBeenCalled();
    }
  });

  it('rejects forged receipt counts, result semantics, and hashes', async () => {
    const fixture = batchFixture(
      [candidate('asset-a')],
      [backfilled('asset-a')],
    );
    const result = await fixture.run();
    if (!('receipt' in result)) throw new Error('TEST_RECEIPT_MISSING');

    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1({
      ...result.receipt,
      backfilledCount: 9,
    })).toThrow('RECEIPT_COUNTS_INVALID');
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1({
      ...result.receipt,
      items: [{
        ...result.receipt.items[0],
        result: {
          disposition: 'UNVERIFIABLE',
          reason: 'EVIDENCE_STORE_LOAD_FAILED',
          retryable: false,
          artifactReason: null,
        },
      }],
    })).toThrow('BACKFILL_RESULT_RETRYABLE_INVALID');
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1({
      ...result.receipt,
      batchReceiptSha256: 'f'.repeat(64),
    })).toThrow('RECEIPT_HASH_MISMATCH');
  });
});

function batchFixture(
  candidates: readonly MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[],
  results: readonly MediaSourcePtsCadenceVersionEvidenceBackfillResultV1[],
) {
  const remaining = [...results];
  const loadCandidates = vi.fn(async () => candidates);
  const backfillCandidate = vi.fn(async () => {
    const result = remaining.shift();
    if (!result) throw new Error('TEST_RESULT_MISSING');
    return result;
  });
  const ports = {
    loadCandidates,
    backfillCandidate,
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
  } satisfies MediaSourcePtsCadenceVersionEvidenceBackfillBatchPortsV1;
  return {
    loadCandidates,
    backfillCandidate,
    run: (overrides: Partial<Parameters<
      typeof runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1
    >[0]> = {}) => runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1({
      migrationRunId: 'v3-evidence-backfill-run',
      policyVersion: 'v3-evidence-backfill-policy-v1',
      afterCursor: null,
      upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
      limit: 3,
      completedAt: COMPLETED_AT,
      ...overrides,
    }, ports),
  };
}

function candidate(
  assetId: string,
): MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1 {
  return {
    assetId,
    userId: 'user-a',
    asset: { assetId },
  } as MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1;
}

function backfilled(
  assetId: string,
): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
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

function notApplicable(): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
  return { disposition: 'NOT_APPLICABLE', reason: 'V3_STATE_ABSENT' };
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
