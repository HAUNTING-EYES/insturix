import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContextSources } from '@/lib/thinkforge/context/fetchContextSources';
import type { DataBankEntry } from '@/lib/thinkforge/services/db';

const mocks = vi.hoisted(() => ({
  getDataBankEntriesByIds: vi.fn(),
  getDataBankEntriesByUser: vi.fn(),
  getProjectScopedEntries: vi.fn(),
  getRecentInteractionEvents: vi.fn(),
  queryRelevantFacts: vi.fn(),
  resolveEffectiveBrandDNAWithProfile: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getDataBankEntriesByIds: mocks.getDataBankEntriesByIds,
  getDataBankEntriesByUser: mocks.getDataBankEntriesByUser,
  getProjectScopedEntries: mocks.getProjectScopedEntries,
  getRecentInteractionEvents: mocks.getRecentInteractionEvents,
  resolveEffectiveBrandDNAWithProfile: mocks.resolveEffectiveBrandDNAWithProfile,
}));

vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  queryRelevantFacts: mocks.queryRelevantFacts,
}));

const NOW = new Date('2026-06-09T00:00:00.000Z');

function entry(overrides: Partial<DataBankEntry>): DataBankEntry {
  return {
    _id: 'entry_generic',
    userId: 'user_1',
    type: 'brand_insight',
    scope: 'global',
    title: 'Generic caption rule',
    content: { claim: 'Use crisp captions.' },
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('fetchContextSources scoped DataBank reads', () => {
  beforeEach(() => {
    mocks.getDataBankEntriesByIds.mockReset();
    mocks.getDataBankEntriesByUser.mockReset();
    mocks.getProjectScopedEntries.mockReset();
    mocks.getRecentInteractionEvents.mockReset();
    mocks.queryRelevantFacts.mockReset();
    mocks.resolveEffectiveBrandDNAWithProfile.mockReset();

    mocks.resolveEffectiveBrandDNAWithProfile.mockResolvedValue({ brandDNA: {}, brandSignalProfile: null, source: 'legacy' });
    mocks.getProjectScopedEntries.mockResolvedValue([]);
    mocks.getRecentInteractionEvents.mockResolvedValue([]);
    mocks.queryRelevantFacts.mockResolvedValue([]);
  });

  it('keyword fallback reads only global entries and filters other-brand facts', async () => {
    mocks.getDataBankEntriesByUser.mockResolvedValue([
      entry({
        _id: 'entry_generic',
        title: 'Generic caption rule',
        content: { claim: 'Use crisp captions.' },
      }),
      entry({
        _id: 'entry_brand_1',
        title: 'Brand one voice',
        content: { claim: 'Use warm voice.', brandId: 'brand_1' },
        tags: ['memory:brand', 'brand:brand_1'],
      }),
      entry({
        _id: 'entry_brand_2',
        title: 'Brand two voice',
        content: { claim: 'Use austere voice.', brandId: 'brand_2' },
        tags: ['memory:brand', 'brand:brand_2'],
      }),
      entry({
        _id: 'entry_project',
        title: 'Old project note',
        scope: 'project',
        content: { claim: 'Project scratch note.' },
      }),
    ]);

    const ctx = await fetchContextSources({
      userId: 'user_1',
      brandId: 'brand_1',
      currentPrompt: 'warm captions',
      maxFacts: 10,
    });

    expect(mocks.getDataBankEntriesByUser).toHaveBeenCalledWith('user_1', {
      limit: 200,
      scope: 'global',
    });
    expect(mocks.resolveEffectiveBrandDNAWithProfile).toHaveBeenCalledWith('user_1', undefined, 'brand_1');
    expect(ctx.globalFacts.map((fact) => fact.id)).toEqual([
      'entry_generic',
      'entry_brand_1',
    ]);
  });

  it('filters vector matches by brand scope after resolving entry ids', async () => {
    mocks.queryRelevantFacts.mockResolvedValue([
      { id: 'entry_brand_2', score: 0.95 },
      { id: 'entry_brand_1', score: 0.9 },
    ]);
    mocks.getDataBankEntriesByIds.mockResolvedValue([
      entry({
        _id: 'entry_brand_1',
        title: 'Brand one voice',
        content: { claim: 'Use warm voice.', brandId: 'brand_1' },
        tags: ['memory:brand', 'brand:brand_1'],
      }),
      entry({
        _id: 'entry_brand_2',
        title: 'Brand two voice',
        content: { claim: 'Use austere voice.', brandId: 'brand_2' },
        tags: ['memory:brand', 'brand:brand_2'],
      }),
    ]);

    const ctx = await fetchContextSources({
      userId: 'user_1',
      brandId: 'brand_1',
      currentPrompt: 'voice preference',
      maxFacts: 10,
    });

    expect(ctx.globalFacts.map((fact) => fact.id)).toEqual(['entry_brand_1']);
    expect(mocks.getDataBankEntriesByUser).not.toHaveBeenCalled();
  });

  it('does not expose brand-scoped global memory when no brand is selected', async () => {
    mocks.getDataBankEntriesByUser.mockResolvedValue([
      entry({
        _id: 'entry_generic',
        title: 'Generic caption rule',
        content: { claim: 'Use crisp captions.' },
      }),
      entry({
        _id: 'entry_brand_1',
        title: 'Brand one voice',
        content: { claim: 'Use warm voice.', brandId: 'brand_1' },
        tags: ['memory:brand', 'brand:brand_1'],
      }),
    ]);

    const ctx = await fetchContextSources({
      userId: 'user_1',
      currentPrompt: 'captions voice',
      maxFacts: 10,
    });

    expect(ctx.globalFacts.map((fact) => fact.id)).toEqual(['entry_generic']);
    expect(mocks.resolveEffectiveBrandDNAWithProfile).toHaveBeenCalledWith('user_1', undefined, undefined);
  });
});
