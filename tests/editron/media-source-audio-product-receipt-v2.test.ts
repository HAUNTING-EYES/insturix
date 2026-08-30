import { describe, expect, it } from 'vitest';

import {
  assertMediaSourceAudioProductMaterializationReceiptV2,
  createMediaSourceAudioProductMaterializationReceiptV2,
} from '@/lib/editron/services/media-source-audio-product-receipt-v2';

const INPUT = Object.freeze({
  disposition: 'COMPLETED' as const,
  assetId: 'asset-audio-receipt-v2',
  userId: 'user-audio-receipt-v2',
  sourceVersionSha256: '1'.repeat(64),
  audioStreamBindingsSha256: '2'.repeat(64),
  observedAudioStreamIndexes: Object.freeze([1, 4]),
  materializedAudioStreamIndexes: Object.freeze([1, 4]),
  audioArtifactStateSha256: '3'.repeat(64),
  sourceAudioAvailabilityEvidenceSha256: '4'.repeat(64),
  sourceVersionEvidenceSha256: '5'.repeat(64),
  completedAt: '2026-08-30T20:00:00.000Z',
});

describe('MediaSourceAudioProductReceiptV2', () => {
  it('creates and independently revalidates the exact dual-evidence receipt', () => {
    const receipt = createMediaSourceAudioProductMaterializationReceiptV2(
      INPUT,
    );

    expect(receipt).toMatchObject({
      schemaVersion: 2,
      kind: 'EDITRON_MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_V2',
      sourceAudioAvailabilityEvidenceSha256: '4'.repeat(64),
      sourceVersionEvidenceSha256: '5'.repeat(64),
      receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(assertMediaSourceAudioProductMaterializationReceiptV2(receipt))
      .toEqual(receipt);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.observedAudioStreamIndexes)).toBe(true);
  });

  it('accepts an already-complete replay only with no newly materialized streams', () => {
    const receipt = createMediaSourceAudioProductMaterializationReceiptV2({
      ...INPUT,
      disposition: 'ALREADY_COMPLETE',
      materializedAudioStreamIndexes: [],
    });

    expect(receipt.disposition).toBe('ALREADY_COMPLETE');
    expect(receipt.materializedAudioStreamIndexes).toEqual([]);
  });

  it.each([
    {
      label: 'hash tamper',
      mutate: (receipt: Record<string, unknown>) => ({
        ...receipt,
        sourceAudioAvailabilityEvidenceSha256: '9'.repeat(64),
      }),
      code: 'MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_HASH_MISMATCH',
    },
    {
      label: 'missing canonical evidence',
      mutate: (receipt: Record<string, unknown>) => {
        const { sourceAudioAvailabilityEvidenceSha256: _removed, ...rest } =
          receipt;
        return rest;
      },
      code: 'MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_FIELDS_INVALID',
    },
    {
      label: 'extra field',
      mutate: (receipt: Record<string, unknown>) => ({
        ...receipt,
        inferredAudio: true,
      }),
      code: 'MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_FIELDS_INVALID',
    },
    {
      label: 'unobserved materialized stream',
      mutate: (receipt: Record<string, unknown>) => ({
        ...receipt,
        materializedAudioStreamIndexes: [1, 8],
      }),
      code: 'MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_STREAM_SET_INVALID',
    },
    {
      label: 'unordered observed streams',
      mutate: (receipt: Record<string, unknown>) => ({
        ...receipt,
        observedAudioStreamIndexes: [4, 1],
      }),
      code: 'MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_STREAM_SET_INVALID',
    },
  ])('rejects $label deterministically', ({ mutate, code }) => {
    const receipt = createMediaSourceAudioProductMaterializationReceiptV2(
      INPUT,
    );
    expect(() => assertMediaSourceAudioProductMaterializationReceiptV2(
      mutate({ ...receipt }),
    )).toThrow(code);
  });

  it('does not reinterpret a V1-shaped receipt as V2', () => {
    const receipt = createMediaSourceAudioProductMaterializationReceiptV2(
      INPUT,
    );
    expect(() => assertMediaSourceAudioProductMaterializationReceiptV2({
      ...receipt,
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_V1',
    })).toThrow('MEDIA_SOURCE_AUDIO_PRODUCT_RECEIPT_V2_IDENTITY_INVALID');
  });
});
