import { brandVaultSourceEnabled, type BrandVaultSourceService } from './brand-flags';
import type { UnifiedBrand } from './brand-registry';
import { brandSignalProfileToUnifiedBrand } from './brand-signal-profile-adapter';
import type { BrandSignalProfile } from './brand-signal-profile';
import { getDefaultBrandVaultRefineryStore, type BrandVaultRefineryStore } from './brand-vault-refinery-api';
import type { BrandSignalProfileRecord } from './brand-signal-lifecycle';
import type { BrandVaultStoreResult, BrandVaultWebsiteDraftReviewPayload } from './brand-vault-draft-orchestrator';

export type EffectiveBrandSource = 'legacy' | 'brand_vault' | 'none';

export type BrandVaultAcceptedProfileGetter = (
  filter: { brandId?: string; userId?: string; orgId?: string | null },
) => BrandVaultStoreResult<BrandSignalProfile | null>;

export type LegacyBrandGetter = (userId: string, brandId: string) => Promise<UnifiedBrand | null>;

export type BrandVaultAcceptedContextStore = Pick<BrandVaultRefineryStore, 'getLatestAcceptedProfile'> &
  Partial<Pick<BrandVaultRefineryStore, 'getLatestAcceptedRecord' | 'getJobSnapshotByRecordId'>>;

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
  store?: BrandVaultAcceptedContextStore;
  onVaultFallback?: (message: string, error?: unknown) => void;
}

export interface EffectiveBrandResolution {
  brand: UnifiedBrand | null;
  acceptedProfile: BrandSignalProfile | null;
  acceptedRecord?: BrandSignalProfileRecord | null;
  acceptedReviewPayload?: BrandVaultWebsiteDraftReviewPayload | null;
  source: EffectiveBrandSource;
}

function warnVaultFallback(message: string, error: unknown): void {
  // FAILLOUD: remove after brand-vault verify (revert to console.warn). A silent legacy fallback on a
  // vault read error is exactly what you can't see otherwise — make it scream during testing.
  console.error(`[FAILLOUD][resolveEffectiveBrand] ${message}`, error);
}

async function getAcceptedVaultRecordContext(
  filter: { brandId?: string; userId?: string; orgId?: string | null },
  store: BrandVaultAcceptedContextStore,
): Promise<Pick<EffectiveBrandResolution, 'acceptedProfile' | 'acceptedRecord' | 'acceptedReviewPayload'>> {
  if (!store.getLatestAcceptedRecord) {
    const acceptedProfile = await store.getLatestAcceptedProfile(filter);
    return { acceptedProfile, acceptedRecord: null, acceptedReviewPayload: null };
  }

  const acceptedRecord = await store.getLatestAcceptedRecord(filter);
  if (!acceptedRecord) {
    return { acceptedProfile: null, acceptedRecord: null, acceptedReviewPayload: null };
  }

  const snapshot = store.getJobSnapshotByRecordId
    ? await store.getJobSnapshotByRecordId(acceptedRecord.id)
    : null;
  return {
    acceptedProfile: acceptedRecord.profile,
    acceptedRecord,
    acceptedReviewPayload: snapshot?.reviewPayload ?? null,
  };
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
    const accepted = options.getAcceptedProfile
      ? {
          acceptedProfile: await options.getAcceptedProfile({ brandId, userId, orgId: options.orgId }),
          acceptedRecord: null,
          acceptedReviewPayload: null,
        }
      : await getAcceptedVaultRecordContext(
          { brandId, userId, orgId: options.orgId },
          options.store ?? getDefaultBrandVaultRefineryStore(),
        );
    const profile = accepted.acceptedProfile;
    if (!profile) {
      // Strict: legacy is null here, so this refuses with source 'none' (no wrong-brand fallback).
      return { brand: legacy, acceptedProfile: null, source: legacy ? 'legacy' : 'none' };
    }

    return {
      brand: brandSignalProfileToUnifiedBrand(profile, legacy),
      acceptedProfile: profile,
      acceptedRecord: accepted.acceptedRecord ?? null,
      acceptedReviewPayload: accepted.acceptedReviewPayload ?? null,
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
