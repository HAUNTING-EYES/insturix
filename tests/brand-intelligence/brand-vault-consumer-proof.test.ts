import { describe, expect, it } from 'vitest';
import {
  deriveBrandSignalProfile,
  type BrandSignal,
  type BrandSignalProfile,
} from '../../lib/shared/brand-signal-profile';
import { buildRichBrandContextBlock } from '../../lib/shared/brand-context-block';
import { brandInputsFromBrandSignalProfile } from '../../lib/editron/motion-graphics/engine/brand-vault-to-motion';

/**
 * Consumer proof: switching the active brand changes the GENERATION INPUT each service receives.
 * This is the wiring-level proof (deterministic, no live render) that the rich vault actually drives
 * output — two distinct brands must yield distinct, non-empty context for the copy path
 * (buildRichBrandContextBlock) and the Editron motion path (brandInputsFromBrandSignalProfile).
 */

// deriveBrandSignalProfile emits inferred signals at 0.45–0.5 (below the 0.55 actionable floor the
// motion path uses — the documented dual-path gap), so a proof of an ACCEPTED/human-vetted brand
// raises the read signals over the floor. Value is left as-derived (so it still varies by brand).
function makeActionable(signal: BrandSignal<unknown> | undefined): void {
  if (!signal) return;
  signal.confidence = 0.72;
  signal.trustLevel = 'manual_user_entry';
  signal.authorityClass = 'brand_preference';
}

function brandProfile(input: {
  name: string;
  visualStyle: string;
  voiceLock: string;
  colors: string[];
  killList: string[];
}): BrandSignalProfile {
  const profile = deriveBrandSignalProfile(
    {
      brandId: `brand_${input.name.toLowerCase()}`,
      userId: 'user_proof',
      name: input.name,
      voice: {
        voiceLock: input.voiceLock,
        nicheMap: 'operators',
        killList: input.killList,
        hookArchetypes: ['proof-led'],
        structuralHabits: ['open with proof'],
      },
      visual: {
        industry: 'software',
        colors: input.colors,
        visualStyle: input.visualStyle,
        typography: 'Inter',
      },
      learning: { banditProjectCount: 0 },
    },
    { generatedAt: '2026-06-26T00:00:00.000Z' },
  );
  makeActionable(profile.identity.brandName);
  makeActionable(profile.voice.defaultFormality);
  makeActionable(profile.voice.killList);
  makeActionable(profile.visual.minimalism);
  makeActionable(profile.visual.expressiveness);
  makeActionable(profile.visual.contrastPreference);
  makeActionable(profile.motion.motionEnergy);
  makeActionable(profile.palette.primary);
  makeActionable(profile.palette.accent);
  return profile;
}

const minimalFormal = brandProfile({
  name: 'Northwind',
  visualStyle: 'minimal clean premium luxury restrained',
  voiceLock: 'Formal, professional, structured, corporate tone.',
  colors: ['#003366', '#8899aa'],
  killList: ['cheap'],
});

const boldCasual = brandProfile({
  name: 'Voltage',
  visualStyle: 'bold loud maximal playful expressive busy',
  voiceLock: 'Casual, conversational, playful, friendly tone.',
  colors: ['#cc0000', '#ff8800'],
  killList: ['premium'],
});

describe('Brand Vault consumer proof — switching brand changes generation input', () => {
  it('copy path (buildRichBrandContextBlock): two brands → different, non-empty context', () => {
    const a = buildRichBrandContextBlock(minimalFormal);
    const b = buildRichBrandContextBlock(boldCasual);

    expect(a).not.toBe(b);
    expect(a).toContain('Northwind');
    expect(b).toContain('Voltage');
    // voice banding diverges
    expect(a.toLowerCase()).toContain('formal');
    expect(b.toLowerCase()).toContain('casual');
    // kill-list (hard constraint) diverges
    expect(a).toContain('cheap');
    expect(b).toContain('premium');
  });

  it('Editron motion path (brandInputsFromBrandSignalProfile): two brands → different motion + color', () => {
    const a = brandInputsFromBrandSignalProfile(minimalFormal);
    const b = brandInputsFromBrandSignalProfile(boldCasual);

    expect(typeof a.minimalism).toBe('number');
    expect(typeof b.minimalism).toBe('number');
    // the minimal brand reads as more minimal than the loud one
    expect(a.minimalism as number).toBeGreaterThan(b.minimalism as number);
    // different palettes → different color input
    expect(a.primaryColor).not.toBe(b.primaryColor);
    expect(a.primaryColor).toBeTruthy();
    expect(b.primaryColor).toBeTruthy();
  });
});
