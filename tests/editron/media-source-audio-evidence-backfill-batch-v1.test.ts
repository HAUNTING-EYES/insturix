import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { MediaSourceAudioArtifactAssetStateInputV1 }
  from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioAvailabilityEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import {
  runMediaSourceAudioEvidenceBackfillBatchV1,
  type MediaSourceAudioEvidenceBackfillCandidateV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-batch-v1';
import type { MediaSourceAudioEvidenceBackfillResultV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-version-evidence-owner-v1';

const COMPLETED_AT = new Date('2026-08-30T22:00:00.000Z');

describe('MediaSourceAudioEvidenceBackfillBatchV1', () => {
  it('processes one bounded page and retains lookahead for the next cursor', async () => {
    const loaded = [candidate('asset-a'), candidate('asset-b'), candidate('asset-c')];
    const loadCandidates = vi.fn(async () => loaded);
    const backfillCandidate = vi.fn(async (asset) => success(asset.assetId));

    const result = await runMediaSourceAudioEvidenceBackfillBatchV1(
      batchInput(2),
      ports({ loadCandidates, backfillCandidate }),
    );

    expect(loadCandidates).toHaveBeenCalledWith({
      afterCursor: null,
      upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
      limit: 3,
    });
    expect(backfillCandidate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      disposition: 'BATCH_COMPLETE',
      receipt: {
        loadedCandidateCount: 3,
        processedItemCount: 2,
        backfilledCount: 2,
        nextCursor: { assetId: 'asset-b', userId: 'user-a' },
      },
    });
    if (!('receipt' in result)) throw new Error('TEST_RECEIPT_MISSING');
    const { batchReceiptSha256, ...material } = result.receipt;
    expect(batchReceiptSha256).toBe(hashEditronCanonicalJsonV1(material));
  });

  it('marks a short or empty page as run complete', async () => {
    const first = await runMediaSourceAudioEvidenceBackfillBatchV1(
      batchInput(3),
      ports({
        loadCandidates: vi.fn(async () => [candidate('asset-a')]),
        backfillCandidate: vi.fn(async () => success('asset-a')),
      }),
    );
    expect(first).toMatchObject({
      disposition: 'RUN_COMPLETE',
      receipt: { nextCursor: { assetId: 'asset-a', userId: 'user-a' } },
    });

    const afterCursor = { assetId: 'asset-a', userId: 'user-a' };
    const empty = await runMediaSourceAudioEvidenceBackfillBatchV1(
      { ...batchInput(3), afterCursor },
      ports({ loadCandidates: vi.fn(async () => []) }),
    );
    expect(empty).toMatchObject({
      disposition: 'RUN_COMPLETE',
      receipt: { processedItemCount: 0, nextCursor: afterCursor },
    });
  });

  it('keeps the incoming cursor when a retryable item fails', async () => {
    const afterCursor = { assetId: 'asset-a', userId: 'user-a' };
    const backfillCandidate = vi.fn(async (asset) => (
      asset.assetId === 'asset-c'
        ? retryableFailure()
        : success(asset.assetId)
    ));

    const result = await runMediaSourceAudioEvidenceBackfillBatchV1(
      { ...batchInput(3), afterCursor },
      ports({
        loadCandidates: vi.fn(async () => [
          candidate('asset-b'), candidate('asset-c'), candidate('asset-d'),
        ]),
        backfillCandidate,
      }),
    );

    expect(result).toMatchObject({
      disposition: 'RETRY_REQUIRED',
      receipt: {
        processedItemCount: 2,
        backfilledCount: 1,
        unverifiableCount: 1,
        nextCursor: afterCursor,
      },
    });
    expect(backfillCandidate).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'out of order',
      [candidate('asset-b'), candidate('asset-a')],
    ],
    [
      'duplicate',
      [candidate('asset-a'), candidate('asset-a')],
    ],
    [
      'asset mismatch',
      [{ ...candidate('asset-a'), asset: fakeAsset('asset-other') }],
    ],
    [
      'above upper bound',
      [candidate('asset-z', 'user-zz')],
    ],
  ])('rejects an invalid %s page before item writes', async (_label, loaded) => {
    const backfillCandidate = vi.fn();
    const result = await runMediaSourceAudioEvidenceBackfillBatchV1(
      batchInput(3),
      ports({ loadCandidates: vi.fn(async () => loaded), backfillCandidate }),
    );

    expect(result).toEqual({
      disposition: 'BATCH_UNVERIFIABLE',
      reason: 'CANDIDATE_PAGE_INVALID',
      retryable: false,
    });
    expect(backfillCandidate).not.toHaveBeenCalled();
  });

  it('classifies candidate-load failure without advancing a cursor', async () => {
    const result = await runMediaSourceAudioEvidenceBackfillBatchV1(
      batchInput(3),
      ports({
        loadCandidates: vi.fn(async () => {
          throw new Error('ATLAS_UNAVAILABLE');
        }),
      }),
    );
    expect(result).toEqual({
      disposition: 'BATCH_UNAVAILABLE',
      reason: 'CANDIDATE_LOAD_FAILED',
      retryable: true,
    });
  });

  it('rejects invalid operator limits before loading candidates', async () => {
    const loadCandidates = vi.fn();
    await expect(runMediaSourceAudioEvidenceBackfillBatchV1(
      batchInput(0),
      ports({ loadCandidates }),
    )).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_INPUT_INVALID',
    );
    expect(loadCandidates).not.toHaveBeenCalled();
  });
});

function batchInput(limit: number) {
  return {
    migrationRunId: 'audio-evidence-backfill-2026-08-30',
    policyVersion: 'audio-evidence-backfill-policy-v1',
    afterCursor: null,
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    limit,
    completedAt: COMPLETED_AT,
  };
}

function ports(input: Readonly<{
  loadCandidates: (
    value: Readonly<{
      afterCursor: unknown;
      upperBoundCursor: unknown;
      limit: number;
    }>,
  ) => Promise<readonly MediaSourceAudioEvidenceBackfillCandidateV1[]>;
  backfillCandidate?: (
    asset: MediaSourceAudioArtifactAssetStateInputV1,
  ) => Promise<MediaSourceAudioEvidenceBackfillResultV1>;
}>) {
  return {
    loadCandidates: input.loadCandidates,
    backfillCandidate: input.backfillCandidate,
    availabilityEvidenceStorePorts: evidencePorts(),
    legacyEvidenceStorePorts: evidencePorts(),
  };
}

function candidate(
  assetId: string,
  userId = 'user-a',
): MediaSourceAudioEvidenceBackfillCandidateV1 {
  return { assetId, userId, asset: fakeAsset(assetId) };
}

function fakeAsset(assetId: string): MediaSourceAudioArtifactAssetStateInputV1 {
  return { assetId } as MediaSourceAudioArtifactAssetStateInputV1;
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
