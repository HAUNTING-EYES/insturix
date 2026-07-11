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

  it('carries only actionable Brand Vault narrative and kinetic signals into brief style defaults', () => {
    const d = brandDefaultsFromProfile({
      narrative: {
        emotionalArc: { value: 0.72, confidence: 0.8 },
        pacePreference: { value: 0.91, confidence: 0.2 },
      },
      motion: {
        motionEnergy: { value: 0.68, confidence: 0.7 },
        easingTaste: { value: 1.4, confidence: 0.9 },
      },
      composition: {
        safeZones: { value: 0.63, confidence: 0.75 },
      },
    });

    expect(d.vibe).toEqual({
      'narrative.emotionalArc': 0.72,
      'motion.motionEnergy': 0.68,
      'motion.easingTaste': 1,
      'composition.safeZones': 0.63,
    });
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
      entryPoint: 'upload', assetCount: 2, hasBrand: true, brandId: 'brand_tiktok',
      brand: brandDefaultsFromProfile({ primaryPlatform: 'tiktok', toneKeywords: ['bold'] }),
    };
    const brief = resolveProductionBrief(signals);
    expect(brief.output.platform).toBe('tiktok');
    expect(brief.output.aspectRatio).toBe('9:16'); // derived from the brand's platform
    expect(brief.brand).toEqual({ brandId: 'brand_tiktok' });
  });
});
