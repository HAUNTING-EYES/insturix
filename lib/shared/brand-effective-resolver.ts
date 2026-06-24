import { brandVaultSourceEnabled, type BrandVaultSourceService } from './brand-flags';
import type { UnifiedBrand } from './brand-registry';
import { brandSignalProfileToUnifiedBrand } from './brand-signal-profile-adapter';
import type { BrandSignalProfile } from './brand-signal-profile';
import { getDefaultBrandVaultRefineryStore, type BrandVaultRefineryStore } from './brand-vault-refinery-api';
import type { BrandVaultStoreResult } from './brand-vault-draft-orchestrator';

export type EffectiveBrandSource = 'legacy' | 'brand_vault' | 'none';

export type BrandVaultAcceptedProfileGetter = (
  filter: { brandId?: string; userId?: string },
) => BrandVaultStoreResult<BrandSignalProfile | null>;

export type LegacyBrandGetter = (userId: string, brandId: string) => Promise<UnifiedBrand | null>;

export interface ResolveEffectiveBrandOptions {
  service: BrandVaultSourceService;
  enabled?: boolean;
  getLegacyBrand?: LegacyBrandGetter;
  getAcceptedProfile?: BrandVaultAcceptedProfileGetter;
  store?: Pick<BrandVaultRefineryStore, 'getLatestAcceptedProfile'>;
  onVaultFallback?: (message: string, error?: unknown) => void;
}

export interface EffectiveBrandResolution {
  brand: UnifiedBrand | null;
  acceptedProfile: BrandSignalProfile | null;
  source: EffectiveBrandSource;
}

function defaultAcceptedProfileGetter(
  store: Pick<BrandVaultRefineryStore, 'getLatestAcceptedProfile'> = getDefaultBrandVaultRefineryStore(),
): BrandVaultAcceptedProfileGetter {
  return (filter) => store.getLatestAcceptedProfile(filter);
}

function warnVaultFallback(message: string, error: unknown): void {
  console.warn(`[resolveEffectiveBrand] ${message}`, error);
}

async function defaultLegacyBrandGetter(userId: string, brandId: string): Promise<UnifiedBrand | null> {
  const { getUnifiedBrand } = await import('./brand-registry');
  return getUnifiedBrand(userId, brandId);
}

export async function resolveEffectiveBrand(
  userId: string,
  brandId: string,
  options: ResolveEffectiveBrandOptions,
): Promise<UnifiedBrand | null> {
  return (await resolveEffectiveBrandWithProfile(userId, brandId, options)).brand;
}

export async function resolveEffectiveBrandWithProfile(
  userId: string,
  brandId: string,
  options: ResolveEffectiveBrandOptions,
): Promise<EffectiveBrandResolution> {
  const getLegacyBrand = options.getLegacyBrand ?? defaultLegacyBrandGetter;
  const legacy = await getLegacyBrand(userId, brandId);
  const enabled = options.enabled ?? brandVaultSourceEnabled(options.service);

  if (!enabled) {
    return { brand: legacy, acceptedProfile: null, source: legacy ? 'legacy' : 'none' };
  }

  try {
    const getAcceptedProfile = options.getAcceptedProfile
      ?? defaultAcceptedProfileGetter(options.store);
    const profile = await getAcceptedProfile({ brandId, userId });
    if (!profile) {
      return { brand: legacy, acceptedProfile: null, source: legacy ? 'legacy' : 'none' };
    }

    return {
      brand: brandSignalProfileToUnifiedBrand(profile, legacy),
      acceptedProfile: profile,
      source: 'brand_vault',
    };
  } catch (error) {
    const message = 'vault accepted-profile read failed; using legacy brand.';
    (options.onVaultFallback ?? warnVaultFallback)(message, error);
    return { brand: legacy, acceptedProfile: null, source: legacy ? 'legacy' : 'none' };
  }
}
