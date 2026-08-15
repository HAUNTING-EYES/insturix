import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addGovernedDataBankEntry: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  addGovernedDataBankEntry: mocks.addGovernedDataBankEntry,
}));

describe('grounded research memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addGovernedDataBankEntry.mockResolvedValue({ _id: 'research_1' });
  });

  it('persists safe public research under the exact organization principal', async () => {
    const { persistGroundedResearchMemory } = await import('@/lib/thinkforge/provenance/research-memory');

    await persistGroundedResearchMemory({
      principal: { userId: 'user_1', orgId: 'org_1' },
      sessionId: 'session_1',
      query: 'Find public reports on approval-cycle delays.',
      response: 'A public benchmark reports a measurable delay.',
      verifiedSources: [{ title: 'Benchmark', url: 'https://example.com/report' }],
    });

    expect(mocks.addGovernedDataBankEntry).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: 'org_1' },
      'session_1',
      expect.objectContaining({
        type: 'research',
        projectId: 'session_1',
        scope: 'project',
        governance: { classification: 'public', consentStatus: 'not_required' },
      }),
    );
  });

  it('retains a conservative classification for private campaign research', async () => {
    const { persistGroundedResearchMemory } = await import('@/lib/thinkforge/provenance/research-memory');

    await persistGroundedResearchMemory({
      principal: { userId: 'user_1' },
      sessionId: 'session_1',
      query: 'Compare this private campaign strategy with public examples.',
      response: 'The public examples use a shorter proof sequence.',
      verifiedSources: [],
    });

    expect(mocks.addGovernedDataBankEntry).toHaveBeenCalledWith(
      { userId: 'user_1' },
      'session_1',
      expect.objectContaining({
        governance: { classification: 'business_confidential', consentStatus: 'not_required' },
      }),
    );
  });

  it.each([
    ['personal', 'Research Alex at alex@example.com.', 'personal_data'],
    ['child', 'Research an 11-year-old student record.', 'child_data'],
  ])('blocks %s research from durable learning', async (_kind, query, code) => {
    const { persistGroundedResearchMemory, ResearchMemoryPolicyError } = await import(
      '@/lib/thinkforge/provenance/research-memory'
    );

    await expect(persistGroundedResearchMemory({
      principal: { userId: 'user_1' },
      sessionId: 'session_1',
      query,
      response: 'Result',
      verifiedSources: [],
    })).rejects.toMatchObject({
      name: ResearchMemoryPolicyError.name,
      code,
    });
    expect(mocks.addGovernedDataBankEntry).not.toHaveBeenCalled();
  });
});
