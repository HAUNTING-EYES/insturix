import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultAcceptedBrandSummary,
  type BrandVaultRefineryStore,
} from './brand-vault-refinery-api';
import { isBrandAccessible } from './brand-access';
import type { BrandSignalProfileRecord } from './brand-signal-lifecycle';

export type AuthorizedBrandScope = {
  brandId: string;
  brandName: string;
  recordId?: string;
  acceptedAt?: string;
  updatedAt?: string;
};

export type AuthorizedBrandRecordScope = AuthorizedBrandScope & {
  acceptedRecord: BrandSignalProfileRecord;
};

export type BrandScopeListInput = {
  userId: string;
  orgId: string | null;
  isOrgAdmin?: boolean;
  store?: Pick<BrandVaultRefineryStore, 'listAcceptedBrands'>;
};

export type BrandScopeAuthorizationInput = {
  userId: string;
  orgId: string | null;
  isOrgAdmin?: boolean;
  brandId: string;
  store?: Pick<BrandVaultRefineryStore, 'getLatestAcceptedRecord'>
    & Partial<Pick<BrandVaultRefineryStore, 'getBrandAccessGrants'>>;
};

export class BrandScopeAuthorizationError extends Error {
  constructor(
    readonly code: 'brand_not_found' | 'brand_scope_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'BrandScopeAuthorizationError';
  }
}

function toAuthorizedBrandScope(brand: BrandVaultAcceptedBrandSummary): AuthorizedBrandScope {
  const brandId = brand.brandId.trim();
  return {
    brandId,
    brandName: brand.name?.trim() || brandId,
    ...(brand.recordId ? { recordId: brand.recordId } : {}),
    ...(brand.acceptedAt ? { acceptedAt: brand.acceptedAt } : {}),
    ...(brand.updatedAt ? { updatedAt: brand.updatedAt } : {}),
  };
}

export async function listAuthorizedBrandScopes(input: BrandScopeListInput): Promise<AuthorizedBrandScope[]> {
  const store = input.store ?? getDefaultBrandVaultRefineryStore();
  if (!store.listAcceptedBrands) {
    throw new BrandScopeAuthorizationError(
      'brand_scope_unavailable',
      'Brand Vault cannot verify access to the selected brand.',
    );
  }

  const accepted = await store.listAcceptedBrands(
    input.orgId
      ? { orgId: input.orgId, userId: input.userId, isOrgAdmin: Boolean(input.isOrgAdmin) }
      : { orgId: null, userId: input.userId },
  );

  return accepted
    .map(toAuthorizedBrandScope)
    .filter((brand) => brand.brandId.length > 0);
}

export async function authorizeBrandScope(input: BrandScopeAuthorizationInput): Promise<AuthorizedBrandRecordScope> {
  const brandId = input.brandId.trim();
  if (!brandId) {
    throw new BrandScopeAuthorizationError('brand_not_found', 'A brand must be selected.');
  }

  const store = input.store ?? getDefaultBrandVaultRefineryStore();
  try {
    const record = await store.getLatestAcceptedRecord({
      brandId,
      userId: input.userId,
      orgId: input.orgId,
    });
    const recordBrandId = record?.profile.brandId?.trim();
    const personalOwnerMismatch = !input.orgId
      && Boolean(record?.profile.userId)
      && record?.profile.userId !== input.userId;
    if (!record || record.status !== 'accepted' || recordBrandId !== brandId || personalOwnerMismatch) {
      throw new BrandScopeAuthorizationError(
        'brand_not_found',
        'The selected brand is not available to this workspace. Re-select the brand and try again.',
      );
    }

    if (input.orgId) {
      if (!store.getBrandAccessGrants) {
        throw new BrandScopeAuthorizationError(
          'brand_scope_unavailable',
          'Brand Vault cannot verify organization brand access.',
        );
      }
      const grants = await store.getBrandAccessGrants(input.orgId);
      if (!isBrandAccessible(brandId, grants, {
        userId: input.userId,
        isOrgAdmin: Boolean(input.isOrgAdmin),
      })) {
        throw new BrandScopeAuthorizationError(
          'brand_not_found',
          'The selected brand is not available to this workspace. Re-select the brand and try again.',
        );
      }
    }

    return {
      brandId,
      brandName: record.profile.identity.brandName.value.trim() || brandId,
      recordId: record.id,
      ...(record.review.acceptedAt ? { acceptedAt: record.review.acceptedAt } : {}),
      updatedAt: record.updatedAt,
      acceptedRecord: record,
    };
  } catch (error) {
    if (error instanceof BrandScopeAuthorizationError) throw error;
    throw new BrandScopeAuthorizationError(
      'brand_scope_unavailable',
      'Brand Vault cannot verify access to the selected brand.',
    );
  }
}
