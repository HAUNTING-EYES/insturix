import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveThinkForgeAuthoringContext: vi.fn(),
  buildThinkForgeAuthoringContextSnapshot: vi.fn(),
  resolveCalosReferenceFacts: vi.fn(),
  resolveContentSignalProfile: vi.fn(),
  formatContentSignalProfileForPrompt: vi.fn(),
  buildThinkForgeSignalTrace: vi.fn(),
  getWritingKnowledgeVersion: vi.fn(),
}));

vi.mock('@/lib/thinkforge/context/resolved-authoring-context', () => ({
  resolveThinkForgeAuthoringContext: mocks.resolveThinkForgeAuthoringContext,
}));
vi.mock('@/lib/thinkforge/context/brand-authoring-context', () => ({
  buildThinkForgeAuthoringContextSnapshot: mocks.buildThinkForgeAuthoringContextSnapshot,
}));
vi.mock('@/lib/calos/generate/generators/_campaign-references', () => ({
  resolveCalosReferenceFacts: mocks.resolveCalosReferenceFacts,
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
  format: 'long_video',
  platform: 'youtube',
  title: 'Customer workflow film',
  angle: 'Use the documented launch proof.',
  targetDurationSeconds: 420,
};

const referenceFact = {
  id: 'calos_campaign_launch',
  title: 'Launch brief',
  summary: 'The launch is on Friday.',
  tags: ['calos-reference', 'campaign-reference'],
};

describe('resolveCalosWriterContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWritingKnowledgeVersion.mockReturnValue('writing-knowledge-v3');
    mocks.resolveThinkForgeAuthoringContext.mockResolvedValue({
      projectMeta: {
        brandId: 'brand_b',
        title: 'Customer workflow film',
        contentCardId: 'deliverable_1',
        campaignId: 'campaign_1',
      },
      systemBrief: 'Accepted Brand Vault revision 12.',
      retrievedContext: {
        brandDNA: {},
        projectFacts: [],
        globalFacts: [],
        semanticFacts: [],
        interactionPatterns: [],
      },
      snapshot: { version: 2, scope: { kind: 'organization' }, brand: { brandId: 'brand_b' } },
    });
    mocks.resolveCalosReferenceFacts.mockResolvedValue([referenceFact]);
    mocks.buildThinkForgeAuthoringContextSnapshot.mockReturnValue({
      version: 2,
      scope: { kind: 'organization' },
      brand: { brandId: 'brand_b' },
      retrieval: { projectFactIds: ['calos_campaign_launch'] },
    });
    mocks.resolveContentSignalProfile.mockReturnValue({ profile: { signals: {} } });
    mocks.formatContentSignalProfileForPrompt.mockReturnValue('<content_signal_profile>resolved</content_signal_profile>');
    mocks.buildThinkForgeSignalTrace.mockReturnValue({ version: 1, brandId: 'brand_b' });
  });

  it('resolves Brand Vault, references, signals, duration, and snapshot as one context', async () => {
    const { resolveCalosWriterContext } = await import('@/lib/calos/generate/generators/_brand-brief');

    const result = await resolveCalosWriterContext(params);

    expect(mocks.resolveThinkForgeAuthoringContext).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      currentPrompt: expect.stringContaining('Target duration: 420 seconds'),
      writingKnowledgeVersion: 'writing-knowledge-v3',
      providedProject: expect.objectContaining({
        format: 'long_video',
        durationSec: 420,
        contentCardId: 'deliverable_1',
        campaignId: 'campaign_1',
        contentContract: expect.objectContaining({ outputKind: 'video_script' }),
      }),
    }));
    expect(mocks.resolveCalosReferenceFacts).toHaveBeenCalledWith({
      campaignId: 'campaign_1',
      brandId: 'brand_b',
      ownerUserId: 'user_1',
      orgId: 'org_1',
    });
    expect(mocks.resolveContentSignalProfile).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      documentType: 'video_script',
      retrievedContext: expect.objectContaining({ projectFacts: [referenceFact] }),
    }));
    expect(mocks.buildThinkForgeAuthoringContextSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org_1',
      retrievedContext: expect.objectContaining({ projectFacts: [referenceFact] }),
      writingKnowledgeVersion: 'writing-knowledge-v3',
    }));
    expect(result.snapshot.retrieval.projectFactIds).toEqual(['calos_campaign_launch']);
    expect(result.projectMeta).toMatchObject({ durationSec: 420, contentCardId: 'deliverable_1' });
  });

  it('propagates Brand Vault and reference failures instead of creating a generic draft', async () => {
    mocks.resolveThinkForgeAuthoringContext.mockRejectedValueOnce(new Error('Accepted profile is unavailable.'));
    const { resolveCalosWriterContext } = await import('@/lib/calos/generate/generators/_brand-brief');

    await expect(resolveCalosWriterContext(params)).rejects.toThrow('Accepted profile is unavailable.');
    expect(mocks.resolveContentSignalProfile).not.toHaveBeenCalled();

    mocks.resolveThinkForgeAuthoringContext.mockResolvedValueOnce({
      projectMeta: { brandId: 'brand_b' },
      retrievedContext: { projectFacts: [], globalFacts: [], semanticFacts: [], interactionPatterns: [] },
    });
    mocks.resolveCalosReferenceFacts.mockRejectedValueOnce(new Error('reference store unavailable'));
    await expect(resolveCalosWriterContext(params)).rejects.toThrow('reference store unavailable');
  });

  it('rejects a preflighted context from another calendar card', async () => {
    const { resolveCalosWriterContext } = await import('@/lib/calos/generate/generators/_brand-brief');
    const mismatchedContext = {
      projectMeta: { brandId: 'brand_b', contentCardId: 'deliverable_other', campaignId: 'campaign_1' },
      snapshot: { scope: { kind: 'organization' }, brand: { brandId: 'brand_b' } },
    };

    await expect(resolveCalosWriterContext({
      ...params,
      authoringContext: mismatchedContext as never,
    })).rejects.toThrow('does not match the requested deliverable scope');
  });
});
