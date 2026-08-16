import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchContextSources: vi.fn(),
  formatSystemBrief: vi.fn(),
}));

vi.mock('@/lib/thinkforge/context/fetchContextSources', () => ({
  fetchContextSources: mocks.fetchContextSources,
  formatSystemBrief: mocks.formatSystemBrief,
}));

import { resolveThinkForgeAuthoringContext } from '@/lib/thinkforge/context/resolved-authoring-context';
import { createThinkForgeAuthoringRequest } from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

function contextFor(recordId: string, profileUpdatedAt: string) {
  return {
    brandDNA: {},
    brandSignalProfile: null,
    brandAuthority: {
      brandId: 'brand_b',
      brandName: 'Brand B',
      recordId,
      profileUpdatedAt,
      profile: { brandId: 'brand_b', voice: { defaultFormality: 0.8 } },
    },
    projectFacts: [{ id: 'project_fact_1', title: 'Project fact', summary: 'Fact', tags: [] }],
    globalFacts: [{ id: 'global_fact_1', title: 'Global fact', summary: 'Fact', tags: [] }],
    semanticFacts: [],
    interactionPatterns: [{ type: 'style_corrected', summary: 'Use short sentences', count: 2 }],
    retrievalDiagnostics: {
      version: 1 as const,
      projectFacts: { status: 'succeeded' as const, itemCount: 1, durationMs: 5 },
      globalVector: { status: 'empty' as const, itemCount: 0, durationMs: 4 },
      globalKeyword: { status: 'succeeded' as const, itemCount: 1, durationMs: 6 },
      interactionPatterns: { status: 'succeeded' as const, itemCount: 1, durationMs: 3 },
    },
  };
}

describe('resolveThinkForgeAuthoringContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formatSystemBrief.mockReturnValue('Accepted Brand Vault context');
    mocks.fetchContextSources.mockResolvedValue(contextFor('record_b_12', '2026-08-11T00:00:00.000Z'));
  });

  it('keeps the persisted binding, strips browser Brand Vault text, and records resolved provenance', async () => {
    const authoringRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      targetDurationSec: 420,
    });
    const result = await resolveThinkForgeAuthoringContext({
      userId: 'user_1',
      orgId: 'org_1',
      isOrgAdmin: false,
      sessionId: 'session_1',
      projectId: 'session_1',
      currentPrompt: 'Create a post.',
      writingKnowledgeVersion: 'writing-graph-v1',
      resolvedAt: new Date('2026-08-11T01:00:00.000Z'),
      sessionProjectMeta: {
        brandId: 'brand_b',
        brandBinding: {
          version: 2,
          brandId: 'brand_b',
          scope: 'organization',
          orgId: 'org_1',
          boundAt: '2026-08-10T00:00:00.000Z',
        },
        brandBrief: 'Old profile text must never reach a writer.',
        authoringRequest,
      },
      providedProject: {
        brandId: 'brand_b',
        brandBinding: {
          version: 1,
          brandId: 'brand_a',
          scope: 'organization',
          boundAt: '2026-01-01T00:00:00.000Z',
        },
        brandBrief: 'Forged browser Brand Vault text.',
        purpose: 'Launch post',
      },
    });

    expect(result.projectMeta).toMatchObject({
      brandId: 'brand_b',
      purpose: 'Launch post',
      brandBinding: { brandId: 'brand_b' },
    });
    expect(result.projectMeta.brandBrief).toBeUndefined();
    expect(mocks.fetchContextSources).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      projectId: 'session_1',
      brandId: 'brand_b',
    }));
    expect(result.systemBrief).toBe('Accepted Brand Vault context');
    expect(result.snapshot).toMatchObject({
      version: 3,
      resolvedAt: '2026-08-11T01:00:00.000Z',
      scope: { kind: 'organization', brandId: 'brand_b' },
      authoringRequest,
      brand: {
        brandId: 'brand_b',
        recordId: 'record_b_12',
        profileUpdatedAt: '2026-08-11T00:00:00.000Z',
      },
      retrieval: {
        projectFactIds: ['project_fact_1'],
        globalFactIds: ['global_fact_1'],
        interactionPatternTypes: ['style_corrected'],
        diagnostics: {
          projectFacts: { status: 'succeeded', itemCount: 1 },
          globalVector: { status: 'empty', itemCount: 0 },
          globalKeyword: { status: 'succeeded', itemCount: 1 },
          interactionPatterns: { status: 'succeeded', itemCount: 1 },
        },
      },
      writingKnowledgeVersion: 'writing-graph-v1',
    });
    expect(result.snapshot.brand?.profileFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps a session brand identity stable while recording the latest accepted profile revision per operation', async () => {
    const sessionProjectMeta = {
      brandId: 'brand_b',
      brandBinding: {
        version: 1 as const,
        brandId: 'brand_b',
        scope: 'personal' as const,
        boundAt: '2026-08-10T00:00:00.000Z',
      },
    };
    const first = await resolveThinkForgeAuthoringContext({
      userId: 'user_1',
      sessionProjectMeta,
      resolvedAt: new Date('2026-08-11T01:00:00.000Z'),
    });
    mocks.fetchContextSources.mockResolvedValueOnce(contextFor('record_b_13', '2026-08-12T00:00:00.000Z'));
    const second = await resolveThinkForgeAuthoringContext({
      userId: 'user_1',
      sessionProjectMeta,
      resolvedAt: new Date('2026-08-12T01:00:00.000Z'),
    });

    expect(first.projectMeta.brandBinding?.brandId).toBe('brand_b');
    expect(second.projectMeta.brandBinding?.brandId).toBe('brand_b');
    expect(first.snapshot.brand?.recordId).toBe('record_b_12');
    expect(second.snapshot.brand?.recordId).toBe('record_b_13');
    expect(second.snapshot.brand?.profileUpdatedAt).toBe('2026-08-12T00:00:00.000Z');
  });

  it('does not downgrade an explicit Brand Vault resolution failure into unbranded authoring', async () => {
    mocks.fetchContextSources.mockRejectedValueOnce(new Error('The selected brand no longer has an accepted profile.'));

    await expect(resolveThinkForgeAuthoringContext({
      userId: 'user_1',
      providedProject: { brandId: 'brand_b' },
    })).rejects.toThrow('accepted profile');
  });

  it('rejects a session binding issued for a different organization before retrieval', async () => {
    await expect(resolveThinkForgeAuthoringContext({
      userId: 'user_1',
      orgId: 'org_1',
      sessionProjectMeta: {
        brandId: 'brand_b',
        brandBinding: {
          version: 2,
          brandId: 'brand_b',
          scope: 'organization',
          orgId: 'org_other',
          boundAt: '2026-08-10T00:00:00.000Z',
        },
      },
    })).rejects.toMatchObject({
      code: 'brand_scope_unavailable',
    });

    expect(mocks.fetchContextSources).not.toHaveBeenCalled();
  });

  it('rejects a malformed persisted binding before treating its brandId as authority', async () => {
    await expect(resolveThinkForgeAuthoringContext({
      userId: 'user_1',
      orgId: 'org_1',
      sessionProjectMeta: {
        brandId: 'brand_b',
        brandBinding: {
          version: 2,
          brandId: 'brand_b',
          scope: 'organization',
          orgId: null,
          boundAt: '2026-08-10T00:00:00.000Z',
        },
      },
    })).rejects.toMatchObject({
      code: 'brand_scope_unavailable',
    });

    expect(mocks.fetchContextSources).not.toHaveBeenCalled();
  });
});
