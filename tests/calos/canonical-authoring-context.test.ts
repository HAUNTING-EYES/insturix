import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveThinkForgeAuthoringContext: vi.fn(),
  resolveContentSignalProfile: vi.fn(),
  formatContentSignalProfileForPrompt: vi.fn(),
  buildThinkForgeSignalTrace: vi.fn(),
  getWritingKnowledgeVersion: vi.fn(),
}));

vi.mock('@/lib/thinkforge/context/resolved-authoring-context', () => ({
  resolveThinkForgeAuthoringContext: mocks.resolveThinkForgeAuthoringContext,
}));
vi.mock('@/lib/thinkforge/signals', () => ({
  resolveContentSignalProfile: mocks.resolveContentSignalProfile,
  formatContentSignalProfileForPrompt: mocks.formatContentSignalProfileForPrompt,
  buildThinkForgeSignalTrace: mocks.buildThinkForgeSignalTrace,
}));
vi.mock('@/lib/thinkforge/data/writing-graph-query', () => ({
  getVersion: mocks.getWritingKnowledgeVersion,
}));

const params = {
  ownerUserId: 'user_1',
  orgId: 'org_1',
  brandId: 'brand_b',
  campaignId: 'campaign_1',
  deliverableId: 'deliverable_1',
  format: 'youtube_video',
  platform: 'youtube',
  title: 'Customer workflow film',
  angle: 'Use the documented launch proof.',
};

describe('resolveCalosWriterContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWritingKnowledgeVersion.mockReturnValue('writing-knowledge-v3');
    mocks.resolveThinkForgeAuthoringContext.mockResolvedValue({
      projectMeta: { brandId: 'brand_b', title: 'Customer workflow film' },
      systemBrief: 'Accepted Brand Vault revision 12.',
      retrievedContext: { projectFacts: [], globalFacts: [], interactionPatterns: [] },
      snapshot: { version: 1, brand: { brandId: 'brand_b' } },
    });
    mocks.resolveContentSignalProfile.mockReturnValue({ profile: { signals: {} } });
    mocks.formatContentSignalProfileForPrompt.mockReturnValue('<content_signal_profile>resolved</content_signal_profile>');
    mocks.buildThinkForgeSignalTrace.mockReturnValue({ version: 1, brandId: 'brand_b' });
  });

  it('resolves the current accepted profile and deterministic signal profile as one writer context', async () => {
    const { resolveCalosWriterContext } = await import('@/lib/calos/generate/generators/_brand-brief');

    const result = await resolveCalosWriterContext(params);

    expect(mocks.resolveThinkForgeAuthoringContext).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      currentPrompt: expect.stringContaining('Use the documented launch proof.'),
      writingKnowledgeVersion: 'writing-knowledge-v3',
      providedProject: {
        title: 'Customer workflow film',
        idea: 'Use the documented launch proof.',
        format: 'youtube_video',
        platform: 'youtube',
        brandId: 'brand_b',
        contentCardId: 'deliverable_1',
        campaignId: 'campaign_1',
      },
    }));
    expect(mocks.resolveContentSignalProfile).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      documentType: 'youtube_video',
      retrievedContext: result.retrievedContext,
    }));
    expect(result.systemBrief).toBe(
      'Accepted Brand Vault revision 12.\n\n<content_signal_profile>resolved</content_signal_profile>',
    );
    expect(result.signalTrace).toEqual({ version: 1, brandId: 'brand_b' });
  });

  it('propagates explicit Brand Vault resolution failures instead of creating a generic fallback', async () => {
    mocks.resolveThinkForgeAuthoringContext.mockRejectedValueOnce(new Error('Accepted profile is unavailable.'));
    const { resolveCalosWriterContext } = await import('@/lib/calos/generate/generators/_brand-brief');

    await expect(resolveCalosWriterContext(params)).rejects.toThrow('Accepted profile is unavailable.');
    expect(mocks.resolveContentSignalProfile).not.toHaveBeenCalled();
  });
});
