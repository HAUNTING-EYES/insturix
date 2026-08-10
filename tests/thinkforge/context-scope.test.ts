import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContextSources, formatSystemBrief } from '@/lib/thinkforge/context/fetchContextSources';
import {
  resolveThinkForgeAuthoringProjectMetadata,
  ThinkForgeBrandAuthorityError,
} from '@/lib/thinkforge/context/brand-authoring-context';
import type { DataBankEntry } from '@/lib/thinkforge/services/db';
import type { BrandSignalProfile } from '@/lib/shared/brand-signal-profile';

const mocks = vi.hoisted(() => ({
  getDataBankEntriesByIds: vi.fn(),
  getDataBankEntriesByUser: vi.fn(),
  getProjectScopedEntries: vi.fn(),
  getRecentInteractionEvents: vi.fn(),
  queryRelevantFacts: vi.fn(),
  resolveEffectiveBrandDNAWithProfile: vi.fn(),
  resolveThinkForgeBrandAuthority: vi.fn(),
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

vi.mock('@/lib/thinkforge/context/brand-authoring-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/context/brand-authoring-context')>();
  return {
    ...actual,
    resolveThinkForgeBrandAuthority: mocks.resolveThinkForgeBrandAuthority,
  };
});

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

function signal<T>(value: T) {
  return {
    value,
    confidence: 0.9,
    trustLevel: 'manual_user_entry' as const,
    authorityClass: 'brand_preference' as const,
    evidenceIds: ['evidence_brand_1'],
  };
}

function acceptedProfile(): BrandSignalProfile {
  return {
    version: 1,
    generatedAt: '2026-08-11T00:00:00.000Z',
    brandId: 'brand_1',
    userId: 'user_1',
    identity: {
      brandName: signal('Current Brand'),
      category: signal('B2B SaaS'),
      industry: signal('Workflow software'),
      audience: signal(['Operations leaders']),
      productServices: signal(['Automated approvals']),
      proofStyle: signal('metrics'),
    },
    voice: {
      assertiveness: signal(0.75),
      warmth: signal(0.7),
      jargonDensity: signal(0.3),
      humor: signal(0.2),
      defaultFormality: signal(0.7),
      ctaDirectness: signal(0.3),
      recurringPhrases: signal(['Show the operational proof']),
      killList: signal(['cheap']),
      hookArchetypes: signal(['proof-led opening']),
    },
    typography: {
      raw: signal('Inter'),
      category: signal('sans_serif'),
      casingBias: signal('sentence'),
    },
  } as unknown as BrandSignalProfile;
}

describe('fetchContextSources scoped DataBank reads', () => {
  beforeEach(() => {
    mocks.getDataBankEntriesByIds.mockReset();
    mocks.getDataBankEntriesByUser.mockReset();
    mocks.getProjectScopedEntries.mockReset();
    mocks.getRecentInteractionEvents.mockReset();
    mocks.queryRelevantFacts.mockReset();
    mocks.resolveEffectiveBrandDNAWithProfile.mockReset();
    mocks.resolveThinkForgeBrandAuthority.mockReset();

    mocks.resolveEffectiveBrandDNAWithProfile.mockResolvedValue({ brandDNA: {}, brandSignalProfile: null, source: 'legacy' });
    mocks.resolveThinkForgeBrandAuthority.mockResolvedValue({
      brandId: 'brand_1',
      brandName: 'Current Brand',
      recordId: 'record_brand_1',
      profileUpdatedAt: '2026-08-11T00:00:00.000Z',
      profile: acceptedProfile(),
    });
    mocks.getProjectScopedEntries.mockResolvedValue([]);
    mocks.getRecentInteractionEvents.mockResolvedValue([]);
    mocks.queryRelevantFacts.mockResolvedValue([]);
    mocks.getDataBankEntriesByUser.mockResolvedValue([]);
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
    expect(mocks.resolveThinkForgeBrandAuthority).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: null,
      isOrgAdmin: undefined,
      brandId: 'brand_1',
    });
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
    expect(mocks.resolveThinkForgeBrandAuthority).not.toHaveBeenCalled();
  });

  it('formats selected-brand writers from the accepted rich profile, not legacy BrandDNA', async () => {
    const ctx = await fetchContextSources({
      userId: 'user_1',
      brandId: 'brand_1',
      currentPrompt: 'write a launch post',
    });

    const brief = formatSystemBrief(ctx);
    expect(brief).toContain('## Accepted Brand Vault Profile');
    expect(brief).toContain('Brand: Current Brand');
    expect(brief).toContain('Voice/tone: assertive and confident; warm and human; formal and professional');
    expect(brief).toContain('NEVER use these words/phrases: cheap');
    expect(brief).toContain('Profile provenance: record_brand_1; current as of 2026-08-11T00:00:00.000Z.');
    expect(brief).not.toContain('## Brand DNA');
  });

  it('keeps a session-bound brand authoritative and removes its stale free-text brief', () => {
    const metadata = resolveThinkForgeAuthoringProjectMetadata(
      {
        brandId: 'brand_1',
        brandBrief: 'Old scan: lead with the founder interview.',
        idea: 'Original brief',
      },
      {
        brandId: 'brand_1',
        brandBrief: 'Another old client-side snapshot.',
        idea: 'Refined current brief',
      },
    );

    expect(metadata).toEqual({
      brandId: 'brand_1',
      idea: 'Refined current brief',
    });
  });

  it('rejects a request that tries to switch the brand of an existing session', () => {
    expect(() => resolveThinkForgeAuthoringProjectMetadata(
      { brandId: 'brand_1' },
      { brandId: 'brand_2' },
    )).toThrow(ThinkForgeBrandAuthorityError);
  });
});
