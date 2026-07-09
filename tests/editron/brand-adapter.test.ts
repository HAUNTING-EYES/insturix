import { describe, expect, it } from 'vitest';

import { brandDefaultsFromProfile, normalizePlatform } from '@/lib/editron/production-brief/brand-adapter';
import { resolveProductionBrief, type IntakeSignals } from '@/lib/editron/production-brief/intake-resolver';

describe('normalizePlatform', () => {
  it('maps common free-text platform names', () => {
    expect(normalizePlatform('Instagram Reels')).toBe('instagram-reels');
    expect(normalizePlatform('TikTok')).toBe('tiktok');
    expect(normalizePlatform('yt')).toBe('youtube');
    expect(normalizePlatform('Twitter')).toBe('x');
    expect(normalizePlatform('Instagram')).toBe('instagram-feed');
  });
  it('returns undefined for unknown/empty (never guesses)', () => {
    expect(normalizePlatform('myspace')).toBeUndefined();
    expect(normalizePlatform('')).toBeUndefined();
    expect(normalizePlatform(null)).toBeUndefined();
  });
});

describe('brandDefaultsFromProfile', () => {
  it('sets preferredPlatform from an explicit primary platform', () => {
    expect(brandDefaultsFromProfile({ primaryPlatform: 'tiktok' }).preferredPlatform).toBe('tiktok');
  });

  it('falls back to the first recognizable connected platform', () => {
    const d = brandDefaultsFromProfile({ connectedPlatforms: ['myspace', 'YouTube'] });
    expect(d.preferredPlatform).toBe('youtube');
  });

  it('maps tone + energy into vibe (drives look, not the spec)', () => {
    const d = brandDefaultsFromProfile({ toneKeywords: ['playful', 'premium'], energy: 'punchy' });
    expect(d.vibe).toEqual({ tone: 'playful, premium', energy: 'punchy' });
  });

  it('★ leaves aspect/duration UNSET (platform-derived, not a brand attribute)', () => {
    const d = brandDefaultsFromProfile({ primaryPlatform: 'youtube' });
    expect(d.preferredAspectRatio).toBeUndefined();
    expect(d.defaultDurationSec).toBeUndefined();
  });

  it('empty profile -> empty defaults (no fabrication)', () => {
    expect(brandDefaultsFromProfile({})).toEqual({});
  });

  it('feeds the resolver: a TikTok brand default drives platform (over content inference)', () => {
    const signals: IntakeSignals = {
      entryPoint: 'upload', assetCount: 2, hasBrand: true,
      brand: brandDefaultsFromProfile({ primaryPlatform: 'tiktok', toneKeywords: ['bold'] }),
    };
    const brief = resolveProductionBrief(signals);
    expect(brief.output.platform).toBe('tiktok');
    expect(brief.output.aspectRatio).toBe('9:16'); // derived from the brand's platform
  });
});
