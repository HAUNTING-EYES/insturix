import { brandVaultSourceEnabled, type BrandVaultSourceService } from './brand-flags';
import type { UnifiedBrand } from './brand-registry';
import { brandSignalProfileToUnifiedBrand } from './brand-signal-profile-adapter';
import type { BrandSignalProfile } from './brand-signal-profile';
import { getDefaultBrandVaultRefineryStore, type BrandVaultRefineryStore } from './brand-vault-refinery-api';
import type { BrandVaultStoreResult } from './brand-vault-draft-orchestrator';

export type EffectiveBrandSource = 'legacy' | 'brand_vault' | 'none';

export type BrandVaultAcceptedProfileGetter = (
  filter: { brandId?: string; userId?: string; orgId?: string | null },
) => BrandVaultStoreResult<BrandSignalProfile | null>;

export type LegacyBrandGetter = (userId: string, brandId: string) => Promise<UnifiedBrand | null>;

export interface ResolveEffectiveBrandOptions {
  service: BrandVaultSourceService;
  enabled?: boolean;
  /** Org scope for the accepted-profile lookup (agency isolation). */
  orgId?: string | null;
  /**
   * Fail-closed (R1): when the vault has no accepted profile for this brand/org, do NOT fall back to the
   * legacy brand — return source 'none' so the caller refuses rather than generating with a wrong brand.
   * Use for GENERATION paths. Default false (vault→legacy fallback, fine for read-only/display).
   */
  strict?: boolean;
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
  const strict = options.strict ?? false;
  const getLegacyBrand = options.getLegacyBrand ?? defaultLegacyBrandGetter;
  // Strict (fail-closed) never uses the legacy brand, so don't even fetch it.
  const legacy = strict ? null : await getLegacyBrand(userId, brandId);
  const enabled = options.enabled ?? brandVaultSourceEnabled(options.service);

  if (!enabled) {
    return { brand: legacy, acceptedProfile: null, source: legacy ? 'legacy' : 'none' };
  }

  try {
    const getAcceptedProfile = options.getAcceptedProfile
      ?? defaultAcceptedProfileGetter(options.store);
    const profile = await getAcceptedProfile({ brandId, userId, orgId: options.orgId });
    if (!profile) {
      // Strict: legacy is null here, so this refuses with source 'none' (no wrong-brand fallback).
      return { brand: legacy, acceptedProfile: null, source: legacy ? 'legacy' : 'none' };
    }

    return {
      brand: brandSignalProfileToUnifiedBrand(profile, legacy),
      acceptedProfile: profile,
      source: 'brand_vault',
    };
  } catch (error) {
    const message = strict
      ? 'vault accepted-profile read failed; strict mode refuses legacy fallback.'
      : 'vault accepted-profile read failed; using legacy brand.';
    (options.onVaultFallback ?? warnVaultFallback)(message, error);
    return { brand: legacy, acceptedProfile: null, source: legacy ? 'legacy' : 'none' };
  }
}
