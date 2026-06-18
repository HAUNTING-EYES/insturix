import type { UnifiedBrand } from './brand-registry';
import {
  brandVaultSourceEnabled,
  type BrandVaultSourceService,
} from './brand-flags';
import type { BrandSignalProfile } from './brand-signal-profile';
import { brandSignalProfileToUnifiedBrand } from './brand-signal-profile-adapter';
import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultRefineryStore,
} from './brand-vault-refinery-api';
import type { BrandVaultStoreResult } from './brand-vault-draft-orchestrator';

export type BrandVaultAcceptedProfileGetter = (
  filter: { brandId?: string; userId?: string },
) => BrandVaultStoreResult<BrandSignalProfile | null>;

export type LegacyBrandGetter = (userId: string, brandId: string) => Promise<UnifiedBrand | null>;

export interface ResolveEffectiveBrandOptions {
  service: BrandVaultSourceService;
  enabled?: boolean;
  getLegacyBrand?: LegacyBrandGetter;
  getAcceptedProfile?: BrandVaultAcceptedProfileGetter;
  onVaultFallback?: (message: string, error: unknown) => void;
}

function defaultAcceptedProfileGetter(): BrandVaultAcceptedProfileGetter {
  const store: BrandVaultRefineryStore = getDefaultBrandVaultRefineryStore();
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
  const getLegacyBrand = options.getLegacyBrand ?? defaultLegacyBrandGetter;
  const enabled = options.enabled ?? brandVaultSourceEnabled(options.service);

  if (!enabled) return getLegacyBrand(userId, brandId);

  const legacyPromise = getLegacyBrand(userId, brandId);
  try {
    const getAcceptedProfile = options.getAcceptedProfile ?? defaultAcceptedProfileGetter();
    const profile = await getAcceptedProfile({ brandId, userId });
    const legacy = await legacyPromise;
    if (!profile) return legacy;
    return brandSignalProfileToUnifiedBrand(profile, legacy);
  } catch (error) {
    (options.onVaultFallback ?? warnVaultFallback)('vault accepted-profile read failed; using legacy brand.', error);
    return legacyPromise;
  }
}
