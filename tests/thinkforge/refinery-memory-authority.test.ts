import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  putGovernedDataBankReviewCandidate: vi.fn(),
  checkDuplicateBeforeSave: vi.fn(),
  extractUrlContent: vi.fn(),
  generateBrief: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  putGovernedDataBankReviewCandidate: mocks.putGovernedDataBankReviewCandidate,
}));
vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  checkDuplicateBeforeSave: mocks.checkDuplicateBeforeSave,
}));
vi.mock('@/lib/thinkforge/agents/url-brief-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/agents/url-brief-agent')>();
  return {
    ...actual,
    createUrlBriefAgent: () => ({ generateBrief: mocks.generateBrief }),
    extractUrlContent: mocks.extractUrlContent,
  };
});

function storedEntry(id: string) {
  return {
    _id: id,
    userId: 'user_1',
    type: 'atomic_fact',
    scope: 'project',
    memoryScope: 'project',
    provenanceStatus: 'quarantined',
    provenanceReason: 'pending_owner_review',
    reviewStatus: 'pending',
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
      keyTopics: ['Approvals', 'Auditability'],
      targetAudience: 'Content operations teams',
      suggestedAngles: ['How approvals reduce rework', 'What an audit trail prevents'],
      platform: 'Web',
      contentType: 'article',
    });
    mocks.putGovernedDataBankReviewCandidate.mockImplementation(
      (_principal: unknown, _sessionId: unknown, operationKey: string) => Promise.resolve(
        storedEntry(operationKey.endsWith(':brief') ? 'parent_1' : operationKey),
      ),
    );
    mocks.checkDuplicateBeforeSave.mockResolvedValue(false);
  });

  it('stores model-derived learning as scoped, idempotent review candidates', async () => {
    const { runRefineryAgent } = await import('@/lib/thinkforge/agents/refinery-agent');

    const result = await runRefineryAgent({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      operationKey: 'refinery:job:1',
      urls: ['https://example.com/update'],
    });

    expect(result).toMatchObject({ processed: 1, failed: 0 });
    expect(mocks.putGovernedDataBankReviewCandidate).toHaveBeenCalledTimes(7);
    expect(mocks.putGovernedDataBankReviewCandidate.mock.calls.map((call) => call[2])).toEqual([
      'refinery:job:1:source:0:brief',
      'refinery:job:1:source:0:fact:0',
      'refinery:job:1:source:0:fact:1',
      'refinery:job:1:source:0:fact:2',
      'refinery:job:1:source:0:fact:3',
      'refinery:job:1:source:0:fact:4',
      'refinery:job:1:source:0:fact:5',
    ]);
    for (const call of mocks.putGovernedDataBankReviewCandidate.mock.calls) {
      expect(call[0]).toEqual({ userId: 'user_1', orgId: 'org_1' });
      expect(call[1]).toBe('session_1');
      expect(call[3]).toMatchObject({
        projectId: 'session_1',
        scope: 'project',
        governance: { classification: 'public', consentStatus: 'not_required' },
      });
    }
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
      operationKey: 'refinery:job:unsafe',
      urls: ['https://example.com/unsafe'],
    });

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(mocks.putGovernedDataBankReviewCandidate).not.toHaveBeenCalled();
  });

  it('reports candidate persistence failures instead of claiming success', async () => {
    mocks.putGovernedDataBankReviewCandidate
      .mockReset()
      .mockResolvedValueOnce(storedEntry('parent_1'))
      .mockRejectedValueOnce(new Error('databank unavailable'));
    const { runRefineryAgent } = await import('@/lib/thinkforge/agents/refinery-agent');

    await expect(runRefineryAgent({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      operationKey: 'refinery:job:failure',
      urls: ['https://example.com/update'],
    })).rejects.toThrow('Refinery candidate commit failed');
  });

  it('rejects missing durable operation identity before provider or storage work', async () => {
    const { runRefineryAgent } = await import('@/lib/thinkforge/agents/refinery-agent');

    await expect(runRefineryAgent({
      userId: 'user_1',
      orgId: null,
      sessionId: 'session_1',
      operationKey: ' ',
      urls: ['https://example.com/update'],
    })).rejects.toThrow('stable operation key');

    expect(mocks.extractUrlContent).not.toHaveBeenCalled();
    expect(mocks.putGovernedDataBankReviewCandidate).not.toHaveBeenCalled();
  });

  it('replays a prepared plan without another provider call or changing persistence slots', async () => {
    const { commitRefineryPlan, prepareRefineryPlan } = await import(
      '@/lib/thinkforge/agents/refinery-agent'
    );
    const plan = await prepareRefineryPlan({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      operationKey: 'refinery:job:replay',
      urls: ['https://example.com/update'],
    });

    expect(mocks.generateBrief).toHaveBeenCalledTimes(1);
    expect(mocks.putGovernedDataBankReviewCandidate).not.toHaveBeenCalled();

    await commitRefineryPlan(plan);
    const firstCommit = structuredClone(mocks.putGovernedDataBankReviewCandidate.mock.calls);
    await commitRefineryPlan(plan);
    const secondCommit = mocks.putGovernedDataBankReviewCandidate.mock.calls.slice(firstCommit.length);

    expect(mocks.generateBrief).toHaveBeenCalledTimes(1);
    expect(firstCommit).toHaveLength(7);
    expect(secondCommit).toEqual(firstCommit);
  });
});
