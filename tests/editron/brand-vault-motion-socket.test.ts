import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveMotionTokens, type BrandInputs, type ContentSignals } from '../../lib/editron/data/motion-theme-resolver';
import { brandInputsFromBrandSignalProfile, brandVaultToMotionOverrides } from '../../lib/editron/motion-graphics/engine/brand-vault-to-motion';
import { resolveEffectiveBrandWithProfile } from '../../lib/shared/brand-effective-resolver';
import { deriveBrandSignalProfile, type BrandSignal, type BrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';

function legacyBrand(): UnifiedBrand {
  return {
    brandId: 'brand_motion',
    userId: 'user_motion',
    name: 'Motion Labs',
    voice: {
      voiceLock: 'Direct, confident, technical.',
      nicheMap: 'Creative operations teams',
      killList: ['cheap'],
      hookArchetypes: ['system-led proof'],
      structuralHabits: ['lead with the workflow problem'],
    },
    visual: {
      industry: 'creative software',
      colors: ['#111827', '#f97316', '#f8fafc'],
      visualStyle: 'minimal structured technical dashboard with sharp energetic motion',
      typography: 'Geometric sans uppercase',
    },
    learning: {
      banditProjectCount: 4,
    },
  };
}

function acceptedProfile(): BrandSignalProfile {
  const draft = deriveBrandSignalProfile(legacyBrand(), {
    generatedAt: '2026-06-22T00:00:00.000Z',
  });

  setSignal(draft.palette.primary!, '#101820', 0.92, 'brand_fact');
  setSignal(draft.palette.accent!, '#ffcc00', 0.9, 'brand_preference');
  setSignal(draft.typography.casingBias, 'uppercase', 0.9, 'brand_preference');
  setSignal(draft.visual.minimalism, 0.82, 0.86, 'brand_preference');
  setSignal(draft.visual.densityTolerance, 0.72, 0.84, 'brand_preference');
  setSignal(draft.visual.expressiveness, 0.68, 0.82, 'brand_preference');
  setSignal(draft.visual.cornerRadiusBias, 0.22, 0.84, 'brand_preference');
  setSignal(draft.visual.layoutSymmetry, 0.8, 0.84, 'brand_preference');
  setSignal(draft.visual.contrastPreference, 0.74, 0.84, 'brand_preference');
  setSignal(draft.motion.motionEnergy, 0.78, 0.84, 'brand_preference');
  setSignal(draft.motion.overshootTolerance, 0.24, 0.84, 'brand_preference');
  setSignal(draft.motion.transitionSharpness, 0.82, 0.84, 'brand_preference');
  setSignal(draft.motion.rhythmRegularity, 0.72, 0.84, 'brand_preference');

  return draft;
}

function setSignal<T>(
  signal: BrandSignal<T>,
  value: T,
  confidence: number,
  authorityClass: BrandSignal<T>['authorityClass'],
): void {
  signal.value = value;
  signal.confidence = confidence;
  signal.trustLevel = 'manual_user_entry';
  signal.authorityClass = authorityClass;
  delete signal.fallbackReason;
}

const BASE_SIGNALS: ContentSignals = {
  formality: 0,
  enthusiasm: 0.45,
  warmth: 0.5,
  emotional_arousal: 0.45,
  pacing_velocity: 0.45,
  humor: 0.1,
  visceral_impact: 0.2,
  visual_dependency: 0.5,
  position_in_video: 0.5,
  motion_intensity: 0.1,
  time_since_last_cut: 999,
};

describe('Brand Vault Editron motion socket', () => {
  it('uses legacy brand when the Editron Brand Vault source flag is off', async () => {
    let vaultReads = 0;
    const profile = acceptedProfile();
    const legacy = legacyBrand();

    const disabled = await resolveEffectiveBrandWithProfile('user_motion', 'brand_motion', {
      service: 'editron',
      enabled: false,
      getLegacyBrand: async () => legacy,
      store: {
        getLatestAcceptedProfile: async () => {
          vaultReads += 1;
          return profile;
        },
      },
    });

    expect(vaultReads).toBe(0);
    expect(disabled.source).toBe('legacy');
    expect(disabled.acceptedProfile).toBeNull();
    expect(disabled.brand?.visual.colors).toEqual(legacy.visual.colors);
  });

  it('promotes an accepted Brand Vault profile into brand inputs and locked hierarchy overrides', async () => {
    const profile = acceptedProfile();
    const legacy = legacyBrand();

    const resolution = await resolveEffectiveBrandWithProfile('user_motion', 'brand_motion', {
      service: 'editron',
      enabled: true,
      getLegacyBrand: async () => legacy,
      store: {
        getLatestAcceptedProfile: async () => profile,
      },
    });

    expect(resolution.source).toBe('brand_vault');
    expect(resolution.acceptedProfile).toBe(profile);
    expect(resolution.brand?.visual.colors.slice(0, 2)).toEqual(['#101820', '#ffcc00']);

    const inputs = brandInputsFromBrandSignalProfile(profile, resolution.brand);
    const overrides = brandVaultToMotionOverrides(profile);
    const tokens = resolveMotionTokens(BASE_SIGNALS, inputs, overrides);

    expect(inputs).toMatchObject<Partial<BrandInputs>>({
      primaryColor: '#101820',
      accentColor: '#ffcc00',
      motionEnergy: 0.78,
      transitionSharpness: 0.82,
    });
    expect(tokens.color.primary).toBe('#101820');
    expect(tokens.color.accent).toBe('#ffcc00');
    expect(tokens.typography.headingTransform).toBe('uppercase');
  });

  it('uses brand visual and motion dials as bias inputs, not presets', () => {
    const restrained = resolveMotionTokens(BASE_SIGNALS, {
      minimalism: 0.9,
      densityTolerance: 0.1,
      cornerRadiusBias: 0.1,
      layoutSymmetry: 0.9,
      motionEnergy: 0.1,
      overshootTolerance: 0.1,
      transitionSharpness: 0.1,
      rhythmRegularity: 0.9,
    });
    const expressive = resolveMotionTokens(BASE_SIGNALS, {
      expressiveness: 0.9,
      densityTolerance: 0.9,
      cornerRadiusBias: 0.9,
      layoutSymmetry: 0.1,
      motionEnergy: 0.9,
      overshootTolerance: 0.9,
      transitionSharpness: 0.9,
      rhythmRegularity: 0.1,
    });

    expect(expressive.animation.entranceDurationMs).toBeLessThan(restrained.animation.entranceDurationMs);
    expect(expressive.animation.entranceEasing).toBe('power4.out');
    expect(restrained.animation.entranceEasing).toBe('power1.inOut');
    expect(expressive.animation.overshoot).toBe(true);
    expect(restrained.animation.overshoot).toBe(false);
    expect(expressive.surface.cornerRadius).toBeGreaterThan(restrained.surface.cornerRadius);
    expect(restrained.layout.density).toBe('minimal');
    expect(expressive.layout.density).toBe('rich');
    expect(restrained.layout.alignment).toBe('center');
    expect(expressive.layout.alignment).toBe('left');
  });

  it('routes addMotionGraphic through the effective Brand Vault resolver seam', () => {
    const source = readFileSync(new URL('../../lib/editron/agent/tools.ts', import.meta.url), 'utf8');
    const seamStart = source.indexOf('const addMotionGraphic = tool(');
    const seamEnd = source.indexOf('const syncCutsToBeats = tool(', seamStart);

    expect(seamStart).toBeGreaterThanOrEqual(0);
    expect(seamEnd).toBeGreaterThan(seamStart);

    const seam = source.slice(seamStart, seamEnd);
    expect(seam).toContain('resolveEffectiveBrandWithProfile');
    expect(seam).toContain("service: 'editron'");
    expect(seam).toContain('brandInputsFromBrandSignalProfile');
    expect(seam).toContain('brandVaultToMotionOverrides');
    expect(seam).toContain('resolveMotionTokens(compositionSignals, graphicBrandInputs, graphicBrandMotionOverrides)');
    expect(seam).not.toContain('getUnifiedBrand');
  });

  it('routes Director creative-intent brand context through the effective resolver seam', () => {
    const source = readFileSync(new URL('../../lib/editron/agent/director-agent.ts', import.meta.url), 'utf8');
    const seamStart = source.indexOf('Brand context for creative intent');
    const seamEnd = source.indexOf('Layer 1b: LLM generates creative intent', seamStart);

    expect(seamStart).toBeGreaterThanOrEqual(0);
    expect(seamEnd).toBeGreaterThan(seamStart);

    const seam = source.slice(seamStart, seamEnd);
    expect(seam).toContain('resolveEffectiveBrandWithProfile');
    expect(seam).toContain("service: 'editron'");
    expect(seam).toContain('buildBrandContextBlock(resolution.brand)');
    expect(seam).not.toContain('getUnifiedBrand');
  });
  it('routes LLM scene parser brand context through the effective resolver seam', () => {
    const source = readFileSync(new URL('../../lib/pipeline/llm-scene-parser.ts', import.meta.url), 'utf8');
    const seamStart = source.indexOf('Brand Context (optional)');
    const seamEnd = source.indexOf("const { geminiRetry }", seamStart);

    expect(seamStart).toBeGreaterThanOrEqual(0);
    expect(seamEnd).toBeGreaterThan(seamStart);

    const seam = source.slice(seamStart, seamEnd);
    expect(seam).toContain('resolveEffectiveBrand');
    expect(seam).toContain("service: 'editron'");
    expect(seam).toContain('buildBrandContextBlock(brand)');
    expect(seam).not.toContain('getUnifiedBrand');
  });
});
