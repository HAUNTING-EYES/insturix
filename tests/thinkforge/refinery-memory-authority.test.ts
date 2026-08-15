import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addGovernedDataBankEntry: vi.fn(),
  checkDuplicateBeforeSave: vi.fn(),
  embedDataBankEntry: vi.fn(),
  extractUrlContent: vi.fn(),
  generateBrief: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  addGovernedDataBankEntry: mocks.addGovernedDataBankEntry,
  updateDataBankEmbeddingStatus: vi.fn(),
}));
vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  checkDuplicateBeforeSave: mocks.checkDuplicateBeforeSave,
  embedDataBankEntry: mocks.embedDataBankEntry,
}));
vi.mock('@/lib/thinkforge/agents/url-brief-agent', () => ({
  createUrlBriefAgent: () => ({ generateBrief: mocks.generateBrief }),
  extractUrlContent: mocks.extractUrlContent,
}));

function storedEntry(id: string) {
  return {
    _id: id,
    userId: 'user_1',
    type: 'atomic_fact',
    scope: 'project',
    memoryScope: 'project',
    provenanceStatus: 'verified',
    title: id,
    content: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ThinkForge refinery memory authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractUrlContent.mockResolvedValue({ bodyText: 'Public product update.', description: '' });
    mocks.generateBrief.mockResolvedValue({
      title: 'Product update',
      summary: 'The product added an auditable approval workflow.',
      keyTopics: [],
      suggestedAngles: [],
      specs: [],
    });
    mocks.addGovernedDataBankEntry
      .mockResolvedValueOnce(storedEntry('parent_1'))
      .mockResolvedValueOnce(storedEntry('fact_1'));
    mocks.checkDuplicateBeforeSave.mockResolvedValue(false);
    mocks.embedDataBankEntry.mockResolvedValue(true);
  });

  it('propagates the exact organization principal and public storage policy', async () => {
    const { runRefineryAgent } = await import('@/lib/thinkforge/agents/refinery-agent');

    const result = await runRefineryAgent({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      urls: ['https://example.com/update'],
    });

    expect(result).toMatchObject({ processed: 1, failed: 0 });
    expect(mocks.addGovernedDataBankEntry).toHaveBeenCalledTimes(2);
    for (const call of mocks.addGovernedDataBankEntry.mock.calls) {
      expect(call[0]).toEqual({ userId: 'user_1', orgId: 'org_1' });
      expect(call[1]).toBe('session_1');
      expect(call[2]).toMatchObject({
        projectId: 'session_1',
        scope: 'project',
        governance: { classification: 'public', consentStatus: 'not_required' },
      });
    }
    expect(mocks.embedDataBankEntry).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['personal', { title: 'Contact', summary: 'Email Alex at alex@example.com.', keyTopics: [] }],
    ['child', { title: 'Student profile', summary: 'Use an 11-year-old student record.', keyTopics: [] }],
  ])('blocks %s data before any DataBank write', async (_kind, brief) => {
    mocks.generateBrief.mockResolvedValue(brief);
    const { runRefineryAgent } = await import('@/lib/thinkforge/agents/refinery-agent');

    const result = await runRefineryAgent({
      userId: 'user_1',
      orgId: null,
      sessionId: 'session_1',
      urls: ['https://example.com/unsafe'],
    });

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(mocks.addGovernedDataBankEntry).not.toHaveBeenCalled();
    expect(mocks.embedDataBankEntry).not.toHaveBeenCalled();
  });
});
