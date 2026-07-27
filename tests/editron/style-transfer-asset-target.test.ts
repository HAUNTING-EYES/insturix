import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  getAsset: vi.fn(),
  loadProject: vi.fn(),
  resolveAssetUrl: vi.fn(),
  updateOne: vi.fn(),
  uploadReferenceVideoToGemini: vi.fn(),
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

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { loadProject: mocks.loadProject },
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    getAsset: mocks.getAsset,
    resolveAssetUrl: mocks.resolveAssetUrl,
  },
}));

vi.mock('@/lib/editron/services/reference-content-extractor', () => ({
  uploadReferenceVideoToGemini: mocks.uploadReferenceVideoToGemini,
}));

vi.mock('@/lib/editron/utils/gemini-model-factory', () => ({
  getAnalysisModel: async () => ({ generateContent: mocks.generateContent }),
}));

import { extractEditDNA } from '@/lib/editron/services/style-transfer-service';

const GEMINI_DNA = {
  cutRhythm: { avgCutsPerMinute: 14, pattern: 'building', avgClipDuration: 4.2 },
  transitions: { dominant: 'hard_cut', frequency: 8 },
  colorGrade: {
    temperature: 'neutral',
    saturation: 'normal',
    contrast: 'high',
    dominantColors: ['#101010'],
  },
  textStyle: {
    fontWeight: 'bold',
    position: 'varied',
    animation: 'fade',
    frequency: 'minimal',
  },
  musicStyle: { tempo: 'medium', genre: 'ambient', energyLevel: 'low' },
  pacing: { overall: 'medium', hookSpeed: 'fast', mainSpeed: 'medium' },
  graphicsDensity: 'minimal',
};

describe('style transfer owned asset targeting', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getAsset.mockResolvedValue({
      assetId: 'asset-reference',
      userId: 'user-style',
      type: 'video',
      filename: 'reference-cut.mp4',
    });
    mocks.resolveAssetUrl.mockResolvedValue('https://cdn.example.test/reference-cut.mp4');
    mocks.uploadReferenceVideoToGemini.mockResolvedValue('https://generativelanguage.googleapis.com/files/reference');
    mocks.generateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(GEMINI_DNA) },
    });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1, upsertedCount: 1 });
  });

  it('resolves one user-owned video asset and persists its provenance', async () => {
    const dna = await extractEditDNA({
      assetId: 'asset-reference',
      userId: 'user-style',
    });

    expect(mocks.getAsset).toHaveBeenCalledWith('asset-reference', 'user-style');
    expect(mocks.resolveAssetUrl).toHaveBeenCalledWith('asset-reference', 'user-style');
    expect(mocks.uploadReferenceVideoToGemini).toHaveBeenCalledWith(
      'https://cdn.example.test/reference-cut.mp4',
    );
    expect(dna).toMatchObject({
      sourceAssetId: 'asset-reference',
      sourceName: 'reference-cut.mp4',
      cutRhythm: { avgCutsPerMinute: 14 },
    });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: dna.profileId, userId: 'user-style' }),
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

  it('rejects missing or non-video assets before any Gemini upload', async () => {
    mocks.getAsset.mockResolvedValueOnce(null);
    await expect(extractEditDNA({
      assetId: 'asset-foreign',
      userId: 'user-style',
    })).rejects.toThrow('not found or is not owned');

    mocks.getAsset.mockResolvedValueOnce({
      assetId: 'asset-image',
      userId: 'user-style',
      type: 'image',
      filename: 'still.png',
    });
    await expect(extractEditDNA({
      assetId: 'asset-image',
      userId: 'user-style',
    })).rejects.toThrow('is not a video');

    expect(mocks.uploadReferenceVideoToGemini).not.toHaveBeenCalled();
  });

  it('rejects ambiguous transport targets instead of choosing precedence silently', async () => {
    await expect(extractEditDNA({
      assetId: 'asset-reference',
      videoUrl: 'https://cdn.example.test/other.mp4',
      userId: 'user-style',
    })).rejects.toThrow('Provide exactly one reference target');

    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.uploadReferenceVideoToGemini).not.toHaveBeenCalled();
  });
});
