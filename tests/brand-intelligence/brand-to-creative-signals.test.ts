import { describe, expect, it } from 'vitest';
import {
  brandSignalProfileToCreativeSignalDefaults,
  getCreativeSignalBrandEffectWeight,
} from '../../lib/shared/brand-to-creative-signals';
import {
  deriveBrandSignalProfile,
  type BrandSignal,
  type BrandSignalProfile,
} from '../../lib/shared/brand-signal-profile';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';

function brand(): UnifiedBrand {
  return {
    brandId: 'brand_creative',
    userId: 'user_creative',
    name: 'Northstar Analytics',
    voice: {
      voiceLock: 'Confident, warm, technical B2B voice with direct CTAs.',
      nicheMap: 'Revenue teams at data-forward SaaS companies',
      killList: ['cheap'],
      hookArchetypes: ['metric-led proof'],
      structuralHabits: ['lead with one hard number'],
    },
    visual: {
      industry: 'B2B analytics',
      colors: ['#102033', '#ff6a00', '#f7f7f7'],
      visualStyle: 'minimal data dashboard with expressive sharp transitions',
      typography: 'Geometric sans',
    },
    learning: {
      banditProjectCount: 0,
    },
  };
}

function profile(): BrandSignalProfile {
  const draft = deriveBrandSignalProfile(brand(), {
    generatedAt: '2026-06-20T00:00:00.000Z',
  });

  setSignal(draft.voice.defaultFormality, 0.6, 0.9);
  setSignal(draft.voice.humor, 0.25, 0.75);
  setSignal(draft.voice.warmth, 0.7, 0.8);
  setSignal(draft.voice.assertiveness, 0.85, 0.82);
  setSignal(draft.voice.jargonDensity, 0.65, 0.79);
  setSignal(draft.voice.ctaDirectness, 0.8, 0.76);
  setSignal(draft.motion.motionEnergy, 0.72, 0.74);
  setSignal(draft.motion.rhythmRegularity, 0.66, 0.73);
  setSignal(draft.motion.transitionSharpness, 0.88, 0.77);
  setSignal(draft.visual.minimalism, 0.68, 0.78);
  setSignal(draft.visual.dataVizAffinity, 0.82, 0.81);
  setSignal(draft.visual.expressiveness, 0.62, 0.7);
  setSignal(draft.identity.proofStyle, 'metrics', 0.72);

  return draft;
}

function setSignal<T>(signal: BrandSignal<T>, value: T, confidence: number): void {
  signal.value = value;
  signal.confidence = confidence;
  signal.trustLevel = 'manual_user_entry';
  signal.authorityClass = 'brand_preference';
}

describe('brandSignalProfileToCreativeSignalDefaults', () => {
  it('maps actionable Brand Vault signals into shared CreativeSignals defaults', () => {
    const mapped = brandSignalProfileToCreativeSignalDefaults(profile());

    expect(mapped.signals.formality).toBeCloseTo(0.2);
    expect(mapped.signals.humor).toBe(0.25);
    expect(mapped.signals.warmth).toBe(0.7);
    expect(mapped.signals.certainty).toBe(0.85);
    expect(mapped.signals.in_group_signal).toBe(0.65);
    expect(mapped.signals.autonomy_grant).toBeCloseTo(0.2);
    expect(mapped.signals.enthusiasm).toBe(0.72);
    expect(mapped.signals.pacing_velocity).toBe(0.72);
    expect(mapped.signals.emotional_arousal).toBe(0.72);
    expect(mapped.signals.rhythmic_variation).toBe(0.66);
    expect(mapped.signals.pivot_intensity).toBe(0.88);
    expect(mapped.signals.negative_space).toBe(0.68);
    expect(mapped.signals.visual_dependency).toBe(0.82);
    expect(mapped.signals.show_tell_ratio).toBe(0.82);
    expect(mapped.signals.visceral_impact).toBe(0.62);
    expect(mapped.signals.logos_load).toBe(0.78);
    expect(mapped.signals.specificity_grain).toBe(0.72);
    expect(mapped._inference_metadata.formality).toMatchObject({
      source: 'brand_dna',
      confidence: 0.9,
    });
    expect(mapped._inference_metadata.formality.resolvedFrom).toContain('brand_vault:');
  });

  it('does not promote fallback or low-confidence Brand Vault signals', () => {
    const draft = profile();
    draft.voice.humor.confidence = 0.54;
    draft.voice.warmth.trustLevel = 'fallback_default';
    draft.identity.proofStyle.confidence = 0.45;

    const mapped = brandSignalProfileToCreativeSignalDefaults(draft);

    expect(mapped.signals.humor).toBeUndefined();
    expect(mapped.signals.warmth).toBeUndefined();
    expect(mapped.signals.logos_load).toBeUndefined();
    expect(mapped._inference_metadata.humor).toBeUndefined();
    expect(mapped._inference_metadata.warmth).toBeUndefined();
  });

  it('keeps Brand Vault effect weighting aligned with the shared actionability gate', () => {
    const draft = profile();

    expect(getCreativeSignalBrandEffectWeight(draft.voice.assertiveness)).toBeGreaterThan(0);
    draft.voice.assertiveness.confidence = 0.54;
    expect(getCreativeSignalBrandEffectWeight(draft.voice.assertiveness)).toBe(0);
  });
});
