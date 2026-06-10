import { describe, expect, it } from 'vitest';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';
import {
  deriveBrandSignalProfile,
  getBrandSignalEffectWeight,
  isBrandSignalActionable,
  sanitizeEvidenceExcerpt,
} from '../../lib/shared/brand-signal-profile';

const GENERATED_AT = '2026-06-09T00:00:00.000Z';

function brand(overrides: Partial<UnifiedBrand> = {}): UnifiedBrand {
  return {
    brandId: 'brand_123',
    userId: 'user_123',
    name: 'Northstar Analytics',
    voice: {
      voiceLock: 'Confident, warm, technical B2B voice with direct CTAs.',
      nicheMap: 'Revenue teams at data-forward SaaS companies',
      killList: ['cheap', 'hack'],
      hookArchetypes: ['metric-led hook', 'before-after proof'],
      structuralHabits: ['lead with one hard number', 'close with a direct CTA'],
    },
    visual: {
      industry: 'B2B analytics',
      colors: ['#102033', '#ff6a00', '#f7f7f7', 'not-a-color'],
      visualStyle: 'minimal premium data dashboard with sharp high contrast geometry',
      typography: 'Geometric sans, uppercase section labels',
    },
    learning: {
      banditProjectCount: 0,
    },
    ...overrides,
  };
}

describe('BrandSignalProfile', () => {
  it('derives a shared profile from UnifiedBrand without service-specific imports', () => {
    const profile = deriveBrandSignalProfile(brand(), { generatedAt: GENERATED_AT });

    expect(profile.version).toBe(1);
    expect(profile.brandId).toBe('brand_123');
    expect(profile.identity.brandName.value).toBe('Northstar Analytics');
    expect(profile.identity.industry?.value).toBe('B2B analytics');
    expect(profile.identity.proofStyle.value).toBe('metrics');
    expect(profile.palette.primary?.value).toBe('#102033');
    expect(profile.palette.accent?.value).toBe('#ff6a00');
    expect(profile.palette.neutrals.value).toEqual(['#f7f7f7']);
    expect(profile.typography.category.value).toBe('sans');
    expect(profile.typography.casingBias.value).toBe('uppercase');
    expect(profile.visual.minimalism.value).toBeGreaterThan(0.5);
    expect(profile.visual.dataVizAffinity.value).toBeGreaterThan(0.5);
    expect(profile.motion.transitionSharpness.value).toBeGreaterThan(0.5);
    expect(profile.voice.killList.authorityClass).toBe('brand_constraint');
    expect(profile.voice.killList.value).toEqual(['cheap', 'hack']);
    expect(profile.evidence.length).toBeGreaterThan(20);
  });

  it('keeps evidence sanitized and linked to every signal', () => {
    const profile = deriveBrandSignalProfile(
      brand({
        visual: {
          industry: 'B2B analytics',
          colors: ['#000', '#fff'],
          visualStyle: 'minimal <script>alert(1)</script> data brand',
          typography: 'sans',
        },
      }),
      { generatedAt: GENERATED_AT, extractor: 'test-extractor' },
    );

    const minimalismEvidence = profile.evidence.find((item) =>
      profile.visual.minimalism.evidenceIds.includes(item.id),
    );

    expect(minimalismEvidence?.extractor).toBe('test-extractor');
    expect(minimalismEvidence?.excerpt).not.toContain('<');
    expect(minimalismEvidence?.excerpt).not.toContain('>');
    expect(minimalismEvidence?.observedAt).toBe(GENERATED_AT);
  });

  it('labels missing brand data as fallback and non-actionable', () => {
    const profile = deriveBrandSignalProfile(null, { generatedAt: GENERATED_AT });

    expect(profile.identity.brandName.value).toBe('Unknown Brand');
    expect(profile.identity.brandName.trustLevel).toBe('fallback_default');
    expect(profile.identity.brandName.fallbackReason).toBe('No UnifiedBrand was provided.');
    expect(profile.evidence.length).toBeGreaterThan(10);
    expect(isBrandSignalActionable(profile.identity.brandName)).toBe(false);
    expect(getBrandSignalEffectWeight(profile.visual.minimalism)).toBe(0);
  });

  it('confidence-gates effect weight without hiding strong manual constraints', () => {
    const profile = deriveBrandSignalProfile(brand(), { generatedAt: GENERATED_AT });
    const accent = profile.palette.accent;

    expect(accent).toBeDefined();
    if (!accent) throw new Error('Expected fixture to derive an accent color.');
    expect(getBrandSignalEffectWeight(accent)).toBeGreaterThan(0);
    expect(isBrandSignalActionable(accent)).toBe(true);
    expect(getBrandSignalEffectWeight(profile.identity.proofStyle)).toBe(0);
    expect(getBrandSignalEffectWeight(profile.voice.killList)).toBeGreaterThan(0.8);
  });

  it('clips sanitized excerpts to a stable maximum length', () => {
    const excerpt = sanitizeEvidenceExcerpt(` <b>${'value '.repeat(80)}</b> `, 40);

    expect(excerpt.length).toBeLessThanOrEqual(40);
    expect(excerpt).not.toContain('<');
    expect(excerpt.endsWith('...')).toBe(true);
  });
});
