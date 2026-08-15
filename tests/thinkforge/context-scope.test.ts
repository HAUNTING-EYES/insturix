import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContextSources, formatSystemBrief } from '@/lib/thinkforge/context/fetchContextSources';
import {
  buildThinkForgeAuthoringContextSnapshot,
  resolveThinkForgeAuthoringProjectMetadata,
  ThinkForgeBrandAuthorityError,
} from '@/lib/thinkforge/context/brand-authoring-context';
import { resolvePersistedThinkForgeProjectMetadata } from '@/lib/thinkforge/state/types';
import type { DataBankEntry } from '@/lib/thinkforge/services/db';
import type { BrandSignalProfile } from '@/lib/shared/brand-signal-profile';

const mocks = vi.hoisted(() => ({
  getAuthorizedDataBankEntriesByIds: vi.fn(),
  getAuthorizedDataBankEntries: vi.fn(),
  getAuthorizedProjectScopedEntries: vi.fn(),
  getRecentInteractionEvents: vi.fn(),
  isVectorRetrievalConfigured: vi.fn(),
  queryRelevantFacts: vi.fn(),
  resolveThinkForgeBrandAuthority: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getAuthorizedDataBankEntriesByIds: mocks.getAuthorizedDataBankEntriesByIds,
  getAuthorizedDataBankEntries: mocks.getAuthorizedDataBankEntries,
  getAuthorizedProjectScopedEntries: mocks.getAuthorizedProjectScopedEntries,
  getRecentInteractionEvents: mocks.getRecentInteractionEvents,
}));

vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  isVectorRetrievalConfigured: mocks.isVectorRetrievalConfigured,
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mocks.getAuthorizedDataBankEntriesByIds.mockReset();
    mocks.getAuthorizedDataBankEntries.mockReset();
    mocks.getAuthorizedProjectScopedEntries.mockReset();
    mocks.getRecentInteractionEvents.mockReset();
    mocks.isVectorRetrievalConfigured.mockReset();
    mocks.queryRelevantFacts.mockReset();
    mocks.resolveThinkForgeBrandAuthority.mockReset();

    mocks.resolveThinkForgeBrandAuthority.mockResolvedValue({
      brandId: 'brand_1',
      brandName: 'Current Brand',
      recordId: 'record_brand_1',
      profileUpdatedAt: '2026-08-11T00:00:00.000Z',
      profile: acceptedProfile(),
    });
    mocks.getAuthorizedProjectScopedEntries.mockResolvedValue([]);
    mocks.getRecentInteractionEvents.mockResolvedValue([]);
    mocks.isVectorRetrievalConfigured.mockReturnValue(true);
    mocks.queryRelevantFacts.mockResolvedValue([]);
    mocks.getAuthorizedDataBankEntries.mockResolvedValue([]);
  });

  it('keyword fallback reads only global entries and filters other-brand facts', async () => {
    mocks.getAuthorizedDataBankEntries.mockResolvedValue([
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
        _id: 'entry_universal',
        title: 'Universal caption rule',
        content: { claim: 'Use accessible captions.' },
        memoryScope: 'universal',
        tags: ['memory:universal'],
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
      orgId: 'org_1',
      brandId: 'brand_1',
      currentPrompt: 'warm captions',
      maxFacts: 10,
    });

    expect(mocks.getAuthorizedDataBankEntries).toHaveBeenCalledWith({ userId: 'user_1', orgId: 'org_1' }, {
      limit: 200,
      scope: 'global',
    });
    expect(mocks.resolveThinkForgeBrandAuthority).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      isOrgAdmin: undefined,
      brandId: 'brand_1',
    });
    expect(ctx.globalFacts.map((fact) => fact.id)).toEqual([
      'entry_brand_1',
      'entry_universal',
    ]);
  });

  it('filters vector matches by brand scope after resolving entry ids', async () => {
    mocks.queryRelevantFacts.mockResolvedValue([
      { id: 'entry_brand_2', score: 0.95 },
      { id: 'entry_brand_1', score: 0.9 },
    ]);
    mocks.getAuthorizedDataBankEntriesByIds.mockResolvedValue([
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
    expect(mocks.getAuthorizedDataBankEntries).toHaveBeenCalledWith({ userId: 'user_1', orgId: null }, {
      limit: 200,
      scope: 'global',
    });
    expect(mocks.queryRelevantFacts).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: null },
      'voice preference',
      10,
      'global',
      { brandId: 'brand_1', memoryScope: 'brand' },
    );
    expect(mocks.queryRelevantFacts).toHaveBeenCalledWith(
      { userId: 'user_1', orgId: null },
      'voice preference',
      10,
      'global',
      { memoryScope: 'universal' },
    );
  });

  it('uses scoped keyword retrieval without querying Vector when it is intentionally unconfigured', async () => {
    mocks.isVectorRetrievalConfigured.mockReturnValue(false);
    mocks.getAuthorizedDataBankEntries.mockResolvedValue([
      entry({
        _id: 'entry_brand_1',
        title: 'Brand one proof',
        content: { claim: 'Lead with operational proof.', brandId: 'brand_1' },
        tags: ['memory:brand', 'brand:brand_1'],
      }),
    ]);

    const ctx = await fetchContextSources({
      userId: 'user_1',
      brandId: 'brand_1',
      currentPrompt: 'operational proof',
      maxFacts: 10,
    });

    expect(mocks.queryRelevantFacts).not.toHaveBeenCalled();
    expect(ctx.globalFacts.map((fact) => fact.id)).toEqual(['entry_brand_1']);
  });

  it('fills incomplete vector results with explicitly scoped legacy memory', async () => {
    mocks.queryRelevantFacts.mockImplementation(async (_principal, _queryText, _maxFacts, _scope, plan) => (
      plan?.memoryScope === 'universal'
        ? [{ id: 'entry_universal', score: 0.95 }]
        : []
    ));
    mocks.getAuthorizedDataBankEntriesByIds.mockResolvedValue([
      entry({
        _id: 'entry_universal',
        title: 'Universal proof rule',
        content: { claim: 'Show proof clearly.' },
        memoryScope: 'universal',
        tags: ['memory:universal'],
      }),
    ]);
    mocks.getAuthorizedDataBankEntries.mockResolvedValue([
      entry({
        _id: 'entry_brand_1',
        title: 'Brand proof rule',
        content: { claim: 'Lead with customer proof.', brandId: 'brand_1' },
        tags: ['memory:brand', 'brand:brand_1'],
      }),
      entry({
        _id: 'entry_universal',
        title: 'Universal proof rule',
        content: { claim: 'Show proof clearly.' },
        memoryScope: 'universal',
        tags: ['memory:universal'],
      }),
    ]);

    const ctx = await fetchContextSources({
      userId: 'user_1',
      brandId: 'brand_1',
      currentPrompt: 'show proof',
      maxFacts: 5,
    });

    expect(ctx.globalFacts.map((fact) => fact.id)).toEqual([
      'entry_brand_1',
      'entry_universal',
    ]);
    expect(ctx.retrievalDiagnostics).toMatchObject({
      version: 1,
      projectFacts: { status: 'skipped', itemCount: 0, reason: 'session_not_provided' },
      globalVector: { status: 'succeeded', itemCount: 1 },
      globalKeyword: { status: 'succeeded', itemCount: 2 },
      interactionPatterns: { status: 'empty', itemCount: 0 },
    });
  });

  it('records dependency failures per channel without discarding healthy channels silently', async () => {
    mocks.getAuthorizedProjectScopedEntries.mockRejectedValue(new Error('project database unavailable'));
    mocks.queryRelevantFacts.mockRejectedValue(new Error('vector unavailable'));
    mocks.getAuthorizedDataBankEntries.mockRejectedValue(new Error('global database unavailable'));
    mocks.getRecentInteractionEvents.mockRejectedValue(new Error('events database unavailable'));

    const ctx = await fetchContextSources({
      userId: 'user_1',
      brandId: 'brand_1',
      sessionId: 'session_1',
      currentPrompt: 'write with operational proof',
    });

    expect(ctx.projectFacts).toEqual([]);
    expect(ctx.globalFacts).toEqual([]);
    expect(ctx.interactionPatterns).toEqual([]);
    expect(ctx.retrievalDiagnostics).toMatchObject({
      projectFacts: { status: 'failed', reason: 'dependency_error' },
      globalVector: { status: 'failed', reason: 'dependency_error' },
      globalKeyword: { status: 'failed', reason: 'dependency_error' },
      interactionPatterns: { status: 'failed', reason: 'dependency_error' },
    });
  });

  it('distinguishes a retrieval deadline from an empty project knowledge set', async () => {
    vi.useFakeTimers();
    mocks.getAuthorizedProjectScopedEntries.mockReturnValue(new Promise(() => undefined));

    const pendingContext = fetchContextSources({
      userId: 'user_1',
      brandId: 'brand_1',
      sessionId: 'session_1',
      currentPrompt: 'write a launch post',
    });
    await vi.advanceTimersByTimeAsync(3000);
    const ctx = await pendingContext;

    expect(ctx.projectFacts).toEqual([]);
    expect(ctx.retrievalDiagnostics?.projectFacts).toEqual({
      status: 'timed_out',
      itemCount: 0,
      durationMs: 3000,
      reason: 'deadline_exceeded',
    });
  });

  it('does not infer a legacy BrandDNA profile when no brand is selected', async () => {
    mocks.getAuthorizedDataBankEntries.mockResolvedValue([
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
        _id: 'entry_universal',
        title: 'Universal caption rule',
        content: { claim: 'Use accessible captions.' },
        memoryScope: 'universal',
        tags: ['memory:universal'],
      }),
    ]);

    const ctx = await fetchContextSources({
      userId: 'user_1',
      currentPrompt: 'captions voice',
      maxFacts: 10,
    });

    expect(ctx.globalFacts.map((fact) => fact.id)).toEqual(['entry_universal']);
    expect(ctx.brandDNA).toEqual({});
    expect(formatSystemBrief(ctx)).not.toContain('## Brand DNA');
    expect(mocks.resolveThinkForgeBrandAuthority).not.toHaveBeenCalled();
  });

  it('allows only trusted legacy metadata into global writer context', async () => {
    mocks.getAuthorizedDataBankEntries.mockResolvedValue([
      entry({
        _id: 'entry_raw_spoof',
        title: 'Raw imported proof',
        content: {
          claim: 'Use proof in every post.',
          source: 'unverified-import',
          memoryScope: 'brand',
          brandId: 'brand_1',
        },
      }),
      entry({
        _id: 'entry_post_mortem',
        title: 'Verified post-mortem proof',
        content: {
          claim: 'Use proof in every post.',
          source: 'post-mortem',
          memoryScope: 'brand',
          brandId: 'brand_1',
        },
      }),
      entry({
        _id: 'entry_quarantined',
        title: 'Quarantined proof',
        memoryScope: 'brand',
        brandId: 'brand_1',
        provenanceStatus: 'quarantined',
        content: { claim: 'Use proof in every post.' },
        tags: ['memory:brand', 'brand:brand_1'],
      }),
      entry({
        _id: 'entry_conflicting_tags',
        title: 'Conflicting proof',
        memoryScope: 'brand',
        brandId: 'brand_1',
        content: { claim: 'Use proof in every post.' },
        tags: ['memory:brand', 'memory:universal', 'brand:brand_1'],
      }),
    ]);

    const ctx = await fetchContextSources({
      userId: 'user_1',
      brandId: 'brand_1',
      currentPrompt: 'show proof',
      maxFacts: 10,
    });

    expect(ctx.globalFacts.map((fact) => fact.id)).toEqual(['entry_post_mortem']);
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

  it('records a privacy-safe authoring context snapshot for the accepted profile and retrieved facts', () => {
    const profile = acceptedProfile();
    const snapshot = buildThinkForgeAuthoringContextSnapshot({
      orgId: 'org_1',
      retrievedContext: {
        brandAuthority: {
          brandId: 'brand_1',
          brandName: 'Current Brand',
          recordId: 'record_brand_1',
          profileUpdatedAt: '2026-08-11T00:00:00.000Z',
          profile,
        },
        projectFacts: [{ id: 'project_fact_2' }, { id: 'project_fact_1' }] as any,
        globalFacts: [{ id: 'global_fact_1' } as any],
        interactionPatterns: [{ type: 'hook_rejected' } as any],
        retrievalDiagnostics: {
          version: 1,
          projectFacts: { status: 'succeeded', itemCount: 2, durationMs: 5 },
          globalVector: { status: 'empty', itemCount: 0, durationMs: 4 },
          globalKeyword: { status: 'succeeded', itemCount: 1, durationMs: 6 },
          interactionPatterns: { status: 'succeeded', itemCount: 1, durationMs: 3 },
        },
      },
      writingKnowledgeVersion: '1.0.0',
      resolvedAt: new Date('2026-08-11T09:00:00.000Z'),
    });

    expect(snapshot).toMatchObject({
      version: 2,
      resolvedAt: '2026-08-11T09:00:00.000Z',
      scope: { kind: 'organization', brandId: 'brand_1' },
      brand: {
        brandId: 'brand_1',
        recordId: 'record_brand_1',
        profileUpdatedAt: '2026-08-11T00:00:00.000Z',
      },
      retrieval: {
        projectFactIds: ['project_fact_1', 'project_fact_2'],
        globalFactIds: ['global_fact_1'],
        interactionPatternTypes: ['hook_rejected'],
        diagnostics: {
          version: 1,
          projectFacts: { status: 'succeeded', itemCount: 2 },
          globalVector: { status: 'empty', itemCount: 0 },
          globalKeyword: { status: 'succeeded', itemCount: 1 },
          interactionPatterns: { status: 'succeeded', itemCount: 1 },
        },
      },
      writingKnowledgeVersion: '1.0.0',
    });
    expect(snapshot.brand?.profileFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(snapshot)).not.toContain('Show the operational proof');
    expect(JSON.stringify(snapshot)).not.toContain('cheap');
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

  it('never treats a legacy free-text scan as authoring context for an unbound session', () => {
    const metadata = resolveThinkForgeAuthoringProjectMetadata(
      { brandBrief: 'Old scan: call this a founder-led exclusivity brand.', idea: 'Write a launch post.' },
      { brandBrief: 'Replacement browser scan that must not enter the writer.' },
    );

    expect(metadata).toEqual({ idea: 'Write a launch post.' });
  });

  it('preserves persisted brand, campaign, and selected trend state during a partial session refresh', () => {
    const metadata = resolvePersistedThinkForgeProjectMetadata(
      {
        brandId: 'brand_1',
        brandBrief: 'Stale pre-acceptance scan that must not survive.',
        campaignId: 'campaign_1',
        selectedTrend: {
          candidate: { candidateId: 'trend_1' },
          analysis: { status: 'completed' },
        } as any,
      },
      { title: 'Fresh browser title' },
    );

    expect(metadata).toEqual({
      brandId: 'brand_1',
      campaignId: 'campaign_1',
      selectedTrend: {
        candidate: { candidateId: 'trend_1' },
        analysis: { status: 'completed' },
      },
      title: 'Fresh browser title',
    });
  });

  it('rejects a persistence update that attempts to replace a bound brand', () => {
    expect(() => resolvePersistedThinkForgeProjectMetadata(
      { brandId: 'brand_1' },
      { brandId: 'brand_2' },
    )).toThrow('ThinkForge session brand binding cannot be changed');
  });

  it('rejects a request that tries to switch the brand of an existing session', () => {
    expect(() => resolveThinkForgeAuthoringProjectMetadata(
      { brandId: 'brand_1' },
      { brandId: 'brand_2' },
    )).toThrow(ThinkForgeBrandAuthorityError);
  });
});
