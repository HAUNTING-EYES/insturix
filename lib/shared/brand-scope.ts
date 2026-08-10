import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultAcceptedBrandSummary,
  type BrandVaultRefineryStore,
} from './brand-vault-refinery-api';

export type AuthorizedBrandScope = {
  brandId: string;
  brandName: string;
  recordId?: string;
  acceptedAt?: string;
  updatedAt?: string;
};

export type BrandScopeAuthorizationInput = {
  userId: string;
  orgId: string | null;
  isOrgAdmin?: boolean;
  brandId: string;
  store?: Pick<BrandVaultRefineryStore, 'listAcceptedBrands'>;
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

export async function listAuthorizedBrandScopes(input: Omit<BrandScopeAuthorizationInput, 'brandId'>): Promise<AuthorizedBrandScope[]> {
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

export async function authorizeBrandScope(input: BrandScopeAuthorizationInput): Promise<AuthorizedBrandScope> {
  const brandId = input.brandId.trim();
  if (!brandId) {
    throw new BrandScopeAuthorizationError('brand_not_found', 'A brand must be selected.');
  }

  const candidates = await listAuthorizedBrandScopes(input);
  const scope = candidates.find((candidate) => candidate.brandId === brandId);
  if (!scope) {
    throw new BrandScopeAuthorizationError(
      'brand_not_found',
      'The selected brand is not available to this workspace. Re-select the brand and try again.',
    );
  }
  return scope;
}
