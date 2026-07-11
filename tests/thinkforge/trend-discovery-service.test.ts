import { describe, expect, it, vi } from 'vitest';
import type { Trend, TrendQuery, TrendsProvider } from '@/lib/calos/trends';
import {
  buildPublicTrendQuery,
  discoverPublicTrendCandidates,
  TrendDiscoveryUnavailableError,
} from '@/lib/thinkforge/trends/trend-discovery-service';

function provider(trends: Trend[]) {
  const getTrends = vi.fn<[TrendQuery], Promise<Trend[]>>(async () => trends);
  const trendsProvider: TrendsProvider = {
    name: 'test-provider',
    available: () => true,
    getTrends,
  };
  return { provider: trendsProvider, getTrends };
}

describe('ThinkForge public trend discovery', () => {
  it('sends only sanitized public discovery context to providers', () => {
    const query = buildPublicTrendQuery({
      niche: 'Indian B2B SaaS onboarding. Email founder@example.com, key sk-secret123456, https://private.example',
      platforms: ['linkedin', 'x'],
      location: 'India',
    });

    expect(query).toEqual({
      niche: 'Indian B2B SaaS onboarding. Email, key',
      platforms: ['linkedin', 'twitter'],
      location: 'India',
      limit: 8,
    });
  });

  it('normalizes untrusted provider results into cultural signals, never false TrendSpec readiness', async () => {
    const trends = provider([
      {
        title: 'The founder teardown format',
        summary: 'Operators are sharing concise before and after workflow proof.',
        platform: 'linkedin',
        url: 'https://example.com/trend',
        score: 0.82,
        capturedAt: '2026-07-11T00:00:00.000Z',
      },
      {
        title: 'The founder teardown format',
        summary: 'Operators are sharing concise before and after workflow proof.',
        platform: 'linkedin',
        url: 'https://example.com/trend',
        score: 0.82,
        capturedAt: '2026-07-11T00:00:00.000Z',
      },
    ]);

    const result = await discoverPublicTrendCandidates(
      { niche: 'B2B SaaS onboarding', platforms: ['linkedin'] },
      { provider: trends.provider, now: new Date('2026-07-11T12:00:00.000Z') },
    );

    expect(trends.getTrends).toHaveBeenCalledWith({
      niche: 'B2B SaaS onboarding',
      platforms: ['linkedin'],
      limit: 8,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      candidateVersion: 1,
      platform: 'linkedin',
      evidenceCompleteness: 0.9,
      freshness: 'fresh',
      trendSpecEligible: false,
      nextAction: 'analyze_reference_video',
    });
    expect(result.candidates[0]?.evidence).toHaveLength(1);
    expect(result.candidates[0]?.evidence[0]).toMatchObject({
      kind: 'cultural_signal',
      provider: 'test-provider',
      sourceScore: 0.82,
      provenance: { purpose: 'public_trend_discovery' },
    });
  });

  it('does not invent freshness when a provider supplies no capture time', async () => {
    const result = await discoverPublicTrendCandidates(
      { niche: 'Indian retail campaigns' },
      {
        provider: provider([{ title: 'Festival shopping stories', platform: 'instagram' }]).provider,
        now: new Date('2026-07-11T12:00:00.000Z'),
      },
    );

    expect(result.candidates[0]).toMatchObject({
      freshness: 'unknown',
      nextAction: 'add_reference_video',
      trendSpecEligible: false,
    });
  });

  it('fails loudly when no configured public trend provider is available', async () => {
    const unavailable: TrendsProvider = {
      name: 'none',
      available: () => false,
      getTrends: async () => [],
    };

    await expect(
      discoverPublicTrendCandidates({ niche: 'B2B SaaS' }, { provider: unavailable }),
    ).rejects.toBeInstanceOf(TrendDiscoveryUnavailableError);
  });
});
