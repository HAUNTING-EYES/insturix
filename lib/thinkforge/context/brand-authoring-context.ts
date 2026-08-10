import {
  authorizeBrandScope,
  BrandScopeAuthorizationError,
} from '@/lib/shared/brand-scope';
import type { BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultRefineryStore,
} from '@/lib/shared/brand-vault-refinery-api';
import {
  mergeThinkForgeProjectMetadata,
  resolveProjectMetaBrandId,
  type ProjectMeta,
} from '../state/types';

export type ThinkForgeBrandAuthority = {
  brandId: string;
  brandName: string;
  recordId: string;
  profileUpdatedAt: string;
  profile: BrandSignalProfile;
};

export class ThinkForgeBrandAuthorityError extends Error {
  constructor(
    readonly code: 'brand_not_found' | 'brand_scope_unavailable' | 'brand_profile_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'ThinkForgeBrandAuthorityError';
  }
}

/**
 * A persisted session brand is the authoring authority. The client may refine
 * the brief, but it may not silently redirect an existing session to another
 * brand or keep a stale free-text Brand Vault summary alongside the profile.
 */
export function resolveThinkForgeAuthoringProjectMetadata(
  sessionProjectMeta?: ProjectMeta | null,
  providedProject?: ProjectMeta | null,
): ProjectMeta {
  const sessionBrandId = resolveProjectMetaBrandId(sessionProjectMeta);
  const providedBrandId = resolveProjectMetaBrandId(providedProject);

  if (sessionBrandId && providedBrandId && sessionBrandId !== providedBrandId) {
    throw new ThinkForgeBrandAuthorityError(
      'brand_not_found',
      'This session is already bound to a different brand. Start a new session to change brands.',
    );
  }

  const merged = mergeThinkForgeProjectMetadata(sessionProjectMeta, providedProject);
  const brandId = sessionBrandId ?? providedBrandId;
  if (!brandId) return merged;

  const { brandBrief: _legacyBrandBrief, ...authoringMetadata } = merged;
  return { ...authoringMetadata, brandId };
}

export async function resolveThinkForgeBrandAuthority(input: {
  userId: string;
  orgId: string | null;
  isOrgAdmin?: boolean;
  brandId?: string;
  store?: Pick<BrandVaultRefineryStore, 'listAcceptedBrands' | 'getLatestAcceptedRecord'>;
}): Promise<ThinkForgeBrandAuthority | null> {
  const brandId = input.brandId?.trim();
  if (!brandId) return null;

  const store = input.store ?? getDefaultBrandVaultRefineryStore();
  try {
    const scope = await authorizeBrandScope({
      userId: input.userId,
      orgId: input.orgId,
      isOrgAdmin: input.isOrgAdmin,
      brandId,
      store,
    });
    const record = await store.getLatestAcceptedRecord({
      brandId: scope.brandId,
      userId: input.userId,
      orgId: input.orgId,
    });
    if (!record || record.status !== 'accepted' || record.profile.brandId !== scope.brandId) {
      throw new ThinkForgeBrandAuthorityError(
        'brand_profile_unavailable',
        'The selected brand no longer has an accepted Brand Vault profile. Review Brand Vault before generating.',
      );
    }
    if (!input.orgId && record.profile.userId && record.profile.userId !== input.userId) {
      throw new ThinkForgeBrandAuthorityError(
        'brand_not_found',
        'The selected brand is not available to this workspace. Re-select the brand and try again.',
      );
    }

    return {
      brandId: scope.brandId,
      brandName: scope.brandName,
      recordId: record.id,
      profileUpdatedAt: record.updatedAt,
      profile: record.profile,
    };
  } catch (error) {
    if (error instanceof ThinkForgeBrandAuthorityError) throw error;
    if (error instanceof BrandScopeAuthorizationError) {
      throw new ThinkForgeBrandAuthorityError(error.code, error.message);
    }
    throw new ThinkForgeBrandAuthorityError(
      'brand_scope_unavailable',
      'Brand Vault could not verify the selected brand. Please try again before generating.',
    );
  }
}
