import { describe, expect, it } from 'vitest';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';
import {
  deriveBrandSignalProfile,
  type BrandSignal,
  type BrandSignalTrustLevel,
} from '../../lib/shared/brand-signal-profile';
import { buildRichBrandContextBlock } from '../../lib/shared/brand-context-block';

const GENERATED_AT = '2026-06-24T00:00:00.000Z';

function brand(overrides: Partial<UnifiedBrand> = {}): UnifiedBrand {
  const base: UnifiedBrand = {
    brandId: 'brand_1',
    userId: 'user_1',
    name: 'Northstar Analytics',
    voice: {
      voiceLock: 'Confident, technical B2B voice.',
      nicheMap: 'Revenue teams at data-forward SaaS companies',
      killList: ['synergy', 'leverage', 'game-changer'],
      hookArchetypes: ['contrarian take', 'data drop'],
      structuralHabits: ['short punchy sentences', 'one idea per line'],
    },
    visual: {
      industry: 'B2B SaaS analytics',
      colors: ['#0B0B0A', '#D4A652'],
      typography: 'Inter',
    },
    learning: { banditProjectCount: 0 },
  };
  return {
    ...base,
    ...overrides,
    voice: { ...base.voice, ...overrides.voice },
    visual: { ...base.visual, ...overrides.visual },
  };
}

/** A numeric dial. Defaults pass the accepted-profile floor (>= 0.50); override conf/trust to probe the boundary. */
function numberSignal(
  value: number,
  confidence = 0.7,
  trustLevel: BrandSignalTrustLevel = 'manual_user_entry',
): BrandSignal<number> {
  return { value, confidence, trustLevel, authorityClass: 'inferred_hint', evidenceIds: [] };
}

describe('buildRichBrandContextBlock', () => {
  it('emits actionable identity + voice signals and suppresses low-confidence inferred ones', () => {
    const profile = deriveBrandSignalProfile(brand(), { generatedAt: GENERATED_AT });
    const block = buildRichBrandContextBlock(profile);

    expect(block).toContain('<brand_context>');
    expect(block).toContain('Brand: Northstar Analytics');
    expect(block).toContain('Industry/category: B2B SaaS analytics');
    expect(block).toContain('Audience: Revenue teams at data-forward SaaS companies');
    expect(block).toContain('Preferred hook styles: contrarian take, data drop');
    expect(block).toContain('Recurring phrases/structures to favor: short punchy sentences, one idea per line');
    expect(block).toContain('NEVER use these words/phrases: synergy, leverage, game-changer');

    // proofStyle from deriveBrandSignalProfile is pinned at 0.45 (below the 0.50 floor), so it must
    // NOT leak into the prompt as if it were trusted guidance.
    expect(block).not.toContain('Persuade with:');
  });

  it('translates actionable voice dials into tone directives, skipping the neutral band', () => {
    const profile = deriveBrandSignalProfile(brand(), { generatedAt: GENERATED_AT });
    profile.voice.assertiveness = numberSignal(0.85); // high pole
    profile.voice.warmth = numberSignal(0.2); // low pole
    profile.voice.defaultFormality = numberSignal(0.5); // neutral → skipped

    const block = buildRichBrandContextBlock(profile);
    expect(block).toContain('Voice/tone:');
    expect(block).toContain('assertive and confident');
    expect(block).toContain('cool and clinical');
    expect(block).not.toContain('formal and professional');
    expect(block).not.toContain('casual and conversational');
  });

  it('applies a 0.50 confidence floor for accepted profiles (vs the 0.55 raw-extraction gate)', () => {
    const profile = deriveBrandSignalProfile(brand(), { generatedAt: GENERATED_AT });
    profile.voice.assertiveness = numberSignal(0.9, 0.5); // exactly at the floor → included (high pole)
    profile.voice.warmth = numberSignal(0.1, 0.49); // just below the floor → excluded
    profile.voice.humor = numberSignal(0.9, 0.8, 'fallback_default'); // high conf but fallback → excluded
    profile.voice.defaultFormality = numberSignal(0.5); // neutral value → skipped
    profile.voice.jargonDensity = numberSignal(0.5); // neutral → skipped
    profile.voice.ctaDirectness = numberSignal(0.5); // neutral → skipped

    const block = buildRichBrandContextBlock(profile);
    expect(block).toContain('assertive and confident'); // conf exactly 0.50 is usable
    expect(block).not.toContain('cool and clinical'); // conf 0.49 is below the floor
    expect(block).not.toContain('lightly playful and witty'); // fallback_default is never usable
  });

  it('falls back to the legacy brand field when the profile signal is not actionable', () => {
    // Empty arrays → deriveBrandSignalProfile makes these fallback_default signals (not actionable).
    const profile = deriveBrandSignalProfile(
      brand({ voice: { killList: [], hookArchetypes: [], structuralHabits: [], nicheMap: undefined } }),
      { generatedAt: GENERATED_AT },
    );
    const legacy = brand(); // carries killList + hooks
    const block = buildRichBrandContextBlock(profile, legacy);

    expect(block).toContain('NEVER use these words/phrases: synergy, leverage, game-changer');
    expect(block).toContain('Preferred hook styles: contrarian take, data drop');
  });

  it('omits sections when neither the profile nor a legacy fallback supplies them', () => {
    const profile = deriveBrandSignalProfile(
      brand({
        voice: { killList: [], hookArchetypes: [], structuralHabits: [], voiceLock: undefined, nicheMap: undefined },
        visual: { industry: undefined, colors: [], typography: undefined },
      }),
      { generatedAt: GENERATED_AT },
    );
    const block = buildRichBrandContextBlock(profile); // no legacy fallback

    expect(block).toContain('<brand_context>');
    expect(block).toContain('Brand: Northstar Analytics'); // brandName is a brand_fact (conf 1) → always emitted
    expect(block).not.toContain('NEVER use these words/phrases:');
    expect(block).not.toContain('Preferred hook styles:');
    expect(block).not.toContain('Industry/category:');
  });
});
