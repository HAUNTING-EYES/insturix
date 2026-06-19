import { describe, expect, it } from 'vitest';
import {
  brandVaultSourceEnabled,
  brandVaultSourceFlagName,
} from '../../lib/shared/brand-flags';
import {
  resolveEffectiveBrand,
  type LegacyBrandGetter,
} from '../../lib/shared/brand-effective-resolver';
import { brandSignalProfileToUnifiedBrand } from '../../lib/shared/brand-signal-profile-adapter';
import {
  deriveBrandSignalProfile,
  type BrandSignalProfile,
} from '../../lib/shared/brand-signal-profile';
import type { UnifiedBrand } from '../../lib/shared/brand-registry';

function legacyBrand(overrides: Partial<UnifiedBrand> = {}): UnifiedBrand {
  return {
    brandId: 'brand_effective',
    userId: 'user_effective',
    name: 'Legacy Brand',
    voice: {
      voiceLock: 'Keep the learned sentence rhythm intact.',
      nicheMap: 'legacy operators',
      killList: ['cheap'],
      hookArchetypes: ['legacy hook'],
      structuralHabits: ['legacy phrase'],
    },
    visual: {
      industry: 'legacy software',
      colors: ['#111111', '#eeeeee'],
      visualStyle: 'legacy visual style',
      typography: 'Legacy Sans',
    },
    learning: {
      banditProjectCount: 7,
      lastLearnedAt: new Date('2026-06-01T00:00:00.000Z'),
    },
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function vaultProfile(): BrandSignalProfile {
  return deriveBrandSignalProfile({
    brandId: 'brand_effective',
    userId: 'user_effective',
    name: 'Vault Brand',
    voice: {
      voiceLock: 'Vault should not replace the learned lock sentence.',
      nicheMap: 'creative ops teams',
      killList: ['generic', 'cheap'],
      hookArchetypes: ['system-led'],
      structuralHabits: ['one system before output'],
    },
    visual: {
      industry: 'AI content operations',
      colors: ['#123456', '#ffcc33', '#f8f8f8'],
      visualStyle: 'minimal premium',
      typography: 'Space Grotesk',
    },
    learning: { banditProjectCount: 0 },
  }, { generatedAt: '2026-06-18T00:00:00.000Z' });
}

describe('Brand Vault effective brand resolver', () => {
  it('reads per-service feature flags from explicit env maps', () => {
    expect(brandVaultSourceFlagName('editron')).toBe('BRAND_VAULT_SOURCE_EDITRON');
    expect(brandVaultSourceEnabled('editron', { BRAND_VAULT_SOURCE_EDITRON: 'true' })).toBe(true);
    expect(brandVaultSourceEnabled('thinkforge', { BRAND_VAULT_SOURCE_THINKFORGE: 'false' })).toBe(false);
    expect(brandVaultSourceEnabled('clickatron', {})).toBe(false);
  });

  it('adapts only actionable Vault signals and keeps learned legacy voice fields', () => {
    const profile = vaultProfile();
    if (!profile.palette.primary) throw new Error('Expected profile fixture to include primary color.');
    profile.palette.primary.confidence = 0.54;

    const adapted = brandSignalProfileToUnifiedBrand(profile, legacyBrand());

    expect(adapted.name).toBe('Vault Brand');
    expect(adapted.voice.voiceLock).toBe('Keep the learned sentence rhythm intact.');
    expect(adapted.voice.nicheMap).toBe('creative ops teams');
    expect(adapted.voice.killList).toEqual(['generic', 'cheap']);
    expect(adapted.voice.hookArchetypes).toEqual(['system-led']);
    expect(adapted.voice.structuralHabits).toEqual(['one system before output']);
    expect(adapted.visual.industry).toBe('AI content operations');
    expect(adapted.visual.colors).toEqual(['#ffcc33', '#f8f8f8']);
    expect(adapted.visual.visualStyle).toBe('legacy visual style');
    expect(adapted.learning.banditProjectCount).toBe(7);
  });

  it('returns the legacy brand byte-for-byte when the service flag is off', async () => {
    const legacy = legacyBrand();
    let vaultReadCount = 0;

    const result = await resolveEffectiveBrand('user_effective', 'brand_effective', {
      service: 'editron',
      enabled: false,
      getLegacyBrand: async () => legacy,
      getAcceptedProfile: async () => {
        vaultReadCount += 1;
        return vaultProfile();
      },
    });

    expect(result).toBe(legacy);
    expect(vaultReadCount).toBe(0);
  });

  it('uses the latest accepted Vault profile when enabled and falls back to legacy gaps', async () => {
    const result = await resolveEffectiveBrand('user_effective', 'brand_effective', {
      service: 'clickatron',
      enabled: true,
      getLegacyBrand: async () => legacyBrand(),
      getAcceptedProfile: async (filter) => {
        expect(filter).toEqual({ brandId: 'brand_effective', userId: 'user_effective' });
        return vaultProfile();
      },
    });

    expect(result?.name).toBe('Vault Brand');
    expect(result?.visual.colors).toEqual(['#123456', '#ffcc33', '#f8f8f8']);
    expect(result?.visual.visualStyle).toBe('legacy visual style');
    expect(result?.voice.voiceLock).toBe('Keep the learned sentence rhythm intact.');
  });

  it('falls back to legacy when no accepted Vault profile exists or the Vault read fails', async () => {
    const legacy = legacyBrand();
    const warnings: string[] = [];
    const getLegacyBrand: LegacyBrandGetter = async () => legacy;

    await expect(resolveEffectiveBrand('user_effective', 'brand_effective', {
      service: 'thinkforge',
      enabled: true,
      getLegacyBrand,
      getAcceptedProfile: async () => null,
    })).resolves.toBe(legacy);

    await expect(resolveEffectiveBrand('user_effective', 'brand_effective', {
      service: 'thinkforge',
      enabled: true,
      getLegacyBrand,
      getAcceptedProfile: async () => {
        throw new Error('mongo unavailable');
      },
      onVaultFallback: (message) => warnings.push(message),
    })).resolves.toBe(legacy);

    expect(warnings).toEqual(['vault accepted-profile read failed; using legacy brand.']);
  });
});
