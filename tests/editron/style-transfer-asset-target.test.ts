import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extractReferenceAnalysis: vi.fn(),
  resolveStyleReferenceSourceV1: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { STYLE_PROFILES: 'styleProfiles' },
  getDatabase: async () => ({
    collection: () => ({
      updateOne: mocks.updateOne,
      findOne: vi.fn(),
      find: vi.fn(),
    }),
  }),
}));

vi.mock('@/lib/editron/services/style-reference-source-v1', () => ({
  resolveStyleReferenceSourceV1: mocks.resolveStyleReferenceSourceV1,
}));

vi.mock('@/lib/editron/services/reference-content-extractor', () => ({
  extractReferenceAnalysis: mocks.extractReferenceAnalysis,
}));

import { extractEditDNA } from '@/lib/editron/services/style-transfer-service';

const DNA = {
  profileId: 'style_receipt_bound',
  sourceName: 'ignored-provider-name.mp4',
  sourceAssetId: 'asset-reference',
  cutRhythm: { avgCutsPerMinute: 14, pattern: 'building', avgClipDuration: 4.2 },
  transitions: { dominant: 'hard_cut', frequency: 8 },
  colorGrade: {
    temperature: 'neutral', saturation: 'normal', contrast: 'high', dominantColors: ['#101010'],
  },
  textStyle: {
    fontWeight: 'bold', position: 'varied', animation: 'fade', frequency: 'minimal',
  },
  musicStyle: { tempo: 'medium', genre: 'ambient', energyLevel: 'low' },
  pacing: { overall: 'medium', hookSpeed: 'fast', mainSpeed: 'medium' },
  graphicsDensity: 'minimal',
} as const;

describe('style transfer canonical source handoff', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.resolveStyleReferenceSourceV1.mockResolvedValue({
      referenceAssetId: 'asset-reference',
      videoUrl: 'https://cdn.example.test/reference-cut.mp4',
      sourceName: 'reference-cut.mp4',
      durationSec: 12,
      registration: {
        assetId: 'asset-reference',
        contentType: 'video/quicktime',
        receiptSha256: 'a'.repeat(64),
      },
    });
    mocks.extractReferenceAnalysis.mockResolvedValue({
      dna: DNA,
      contentMap: [],
      source: {
        referenceAssetId: 'asset-reference',
        bytesSha256: 'b'.repeat(64),
        registrationReceiptSha256: 'a'.repeat(64),
      },
    });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1, upsertedCount: 1 });
  });

  it('persists only the receipt-bound strict style observation', async () => {
    const input = { assetId: 'asset-reference', userId: 'user-style' };
    const dna = await extractEditDNA(input);

    expect(mocks.resolveStyleReferenceSourceV1).toHaveBeenCalledWith(input);
    expect(mocks.extractReferenceAnalysis).toHaveBeenCalledWith({
      userId: 'user-style',
      source: expect.objectContaining({
        referenceAssetId: 'asset-reference',
        registration: expect.objectContaining({
          contentType: 'video/quicktime',
          receiptSha256: 'a'.repeat(64),
        }),
      }),
    });
    expect(dna).toMatchObject({
      profileId: 'style_receipt_bound',
      sourceAssetId: 'asset-reference',
      sourceName: 'reference-cut.mp4',
      cutRhythm: { avgCutsPerMinute: 14 },
    });
    expect(dna.sourceUrl).toBeUndefined();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { profileId: 'style_receipt_bound', userId: 'user-style' },
      expect.objectContaining({
        $set: expect.objectContaining({
          sourceAssetId: 'asset-reference',
          sourceName: 'reference-cut.mp4',
          userId: 'user-style',
        }),
      }),
      { upsert: true },
    );
  });

  it('never persists when source resolution or strict analysis fails', async () => {
    mocks.resolveStyleReferenceSourceV1.mockRejectedValueOnce(new Error('canonical receipt missing'));
    await expect(extractEditDNA({ assetId: 'asset-reference', userId: 'user-style' }))
      .rejects.toThrow('canonical receipt missing');
    expect(mocks.extractReferenceAnalysis).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();

    mocks.resolveStyleReferenceSourceV1.mockResolvedValueOnce({
      referenceAssetId: 'asset-reference', videoUrl: 'https://cdn.example.test/ref.mov',
      sourceName: 'ref.mov', registration: { assetId: 'asset-reference' },
    });
    mocks.extractReferenceAnalysis.mockRejectedValueOnce(new Error('Measured reference cut evidence is unavailable'));
    await expect(extractEditDNA({ assetId: 'asset-reference', userId: 'user-style' }))
      .rejects.toThrow('Measured reference cut evidence is unavailable');
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});
