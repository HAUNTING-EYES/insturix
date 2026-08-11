import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveCalosWriterContext: vi.fn(),
  resolveReferenceBlock: vi.fn(),
  postRunStructured: vi.fn(),
  scriptRunStructured: vi.fn(),
}));

vi.mock('@/lib/calos/generate/generators/_brand-brief', () => ({
  resolveCalosWriterContext: mocks.resolveCalosWriterContext,
}));
vi.mock('@/lib/calos/generate/generators/_campaign-references', () => ({
  resolveReferenceBlock: mocks.resolveReferenceBlock,
}));
vi.mock('@/lib/thinkforge/agents/post-writer-agent', () => ({
  PostWriterAgent: function PostWriterAgent() {
    return { runStructured: mocks.postRunStructured };
  },
}));
vi.mock('@/lib/thinkforge/agents/script-writer-agent', () => ({
  ScriptWriterAgent: function ScriptWriterAgent() {
    return { runStructured: mocks.scriptRunStructured };
  },
}));

const params = {
  ownerUserId: 'user_1',
  orgId: 'org_1',
  brandId: 'brand_b',
  campaignId: 'campaign_1',
  deliverableId: 'deliverable_1',
  format: 'linkedin_post',
  platform: 'linkedin',
  title: 'A grounded launch idea',
  angle: 'Show the actual customer workflow.',
};

const writerContext = {
  projectMeta: {
    brandId: 'brand_b',
    title: 'A grounded launch idea',
    campaignId: 'campaign_1',
    contentCardId: 'deliverable_1',
  },
  systemBrief: 'Accepted Brand Vault revision plus resolved content signals.',
  retrievedContext: {
    brandDNA: { killList: ['synergy'] },
    projectFacts: [{ id: 'fact_1', title: 'Launch date', summary: 'Launch is on Friday.', tags: [] }],
    globalFacts: [],
    semanticFacts: [],
    interactionPatterns: [],
  },
  snapshot: { version: 1 },
  contentSignalProfile: { profile: { signals: {}, constraints: {}, derived: {} } },
  signalTrace: { version: 1 },
};

describe('CalOS canonical ThinkForge authoring context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCalosWriterContext.mockResolvedValue(writerContext);
    mocks.resolveReferenceBlock.mockResolvedValue('\n\n<reference_material>Launch is on Friday.</reference_material>');
    mocks.postRunStructured.mockResolvedValue({
      result: {
        content: 'A complete platform post.',
        clickatron: { singleImagePrompt: 'A real product workflow in natural light.' },
      },
    });
    mocks.scriptRunStructured.mockResolvedValue({ result: { content: 'A complete video script.' } });
  });

  it('passes the resolved Brand Vault context, facts, and signal profile to PostWriter', async () => {
    const { runPostWriter } = await import('@/lib/calos/generate/generators/_post-writer');

    await expect(runPostWriter(params)).resolves.toEqual({
      content: 'A complete platform post.',
      imagePrompt: 'A real product workflow in natural light.',
    });

    expect(mocks.resolveCalosWriterContext).toHaveBeenCalledWith(params);
    expect(mocks.resolveReferenceBlock).toHaveBeenCalledWith({
      campaignId: 'campaign_1',
      brandId: 'brand_b',
      ownerUserId: 'user_1',
      orgId: 'org_1',
    });
    expect(mocks.postRunStructured).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      project: writerContext.projectMeta,
      retrievedContext: writerContext.retrievedContext,
      contentSignalProfile: writerContext.contentSignalProfile,
      context: {
        projectSummary: 'A grounded launch idea',
        systemBrief: writerContext.systemBrief,
      },
      userPrompt: expect.stringContaining('<reference_material>'),
    }));
  });

  it('passes the same resolved Brand Vault context and facts to ScriptWriter', async () => {
    const { runScriptWriter } = await import('@/lib/calos/generate/generators/_script-writer');

    await expect(runScriptWriter({ ...params, format: 'youtube_video' })).resolves.toBe('A complete video script.');

    expect(mocks.resolveReferenceBlock).toHaveBeenCalledWith({
      campaignId: 'campaign_1',
      brandId: 'brand_b',
      ownerUserId: 'user_1',
      orgId: 'org_1',
    });
    expect(mocks.scriptRunStructured).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_b',
      project: writerContext.projectMeta,
      retrievedContext: writerContext.retrievedContext,
      context: {
        projectSummary: 'A grounded launch idea',
        systemBrief: writerContext.systemBrief,
      },
      userPrompt: expect.stringContaining('<reference_material>'),
    }));
  });

  it('does not silently write brandless content when authoritative context resolution fails', async () => {
    mocks.resolveCalosWriterContext.mockRejectedValueOnce(new Error('Brand Vault profile is unavailable.'));
    const { runPostWriter } = await import('@/lib/calos/generate/generators/_post-writer');

    await expect(runPostWriter(params)).rejects.toThrow('Brand Vault profile is unavailable.');
    expect(mocks.postRunStructured).not.toHaveBeenCalled();
  });
});
