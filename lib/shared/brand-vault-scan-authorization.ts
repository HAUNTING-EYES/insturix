import { mintBrandId } from './brand-access';
import { authorizeBrandScope, BrandScopeAuthorizationError } from './brand-scope';
import type { BrandVaultRefineryStore } from './brand-vault-refinery-api';

type BrandVaultScanRequestBody = Record<string, unknown>;

type BrandVaultScanScopeSource =
  | 'server_minted_new_client'
  | 'platform_brand'
  | 'accepted_vault_brand'
  | 'pending_vault_scan';

export type BrandVaultScanAuthorizationInput = {
  body: unknown;
  userId: string;
  orgId: string | null;
  isOrgAdmin: boolean;
  store: BrandVaultRefineryStore;
};

export type BrandVaultScanAuthorizationResult =
  | {
      ok: true;
      body: BrandVaultScanRequestBody;
      brandId: string;
      source: BrandVaultScanScopeSource;
    }
  | {
      ok: false;
      status: 400 | 403 | 503;
      code: 'invalid_request' | 'brand_scope_not_found' | 'brand_scope_unavailable';
      message: string;
    };

type OwnedBrandInput = { userId: string; brandId: string };
type AcceptedBrandInput = {
  userId: string;
  orgId: string | null;
  isOrgAdmin: boolean;
  brandId: string;
  store: BrandVaultRefineryStore;
};
type PendingScanInput = {
  userId: string;
  orgId: string | null;
  brandId: string;
  store: BrandVaultRefineryStore;
};

export type BrandVaultScanAuthorizationDependencies = {
  mintBrandId?: () => string;
  findOwnedPlatformBrand?: (input: OwnedBrandInput) => Promise<boolean>;
  authorizeAcceptedBrand?: (input: AcceptedBrandInput) => Promise<boolean>;
  findOwnedPendingScan?: (input: PendingScanInput) => Promise<boolean>;
};

/**
 * Makes the server, rather than the browser, the authority for the target of a Brand Vault scan.
 * An existing client must resolve through a durable platform brand, accepted Vault profile, or the
 * caller's own pending scan. A missing client id explicitly starts a server-minted new client.
 */
export async function authorizeBrandVaultScanRequest(
  input: BrandVaultScanAuthorizationInput,
  dependencies: BrandVaultScanAuthorizationDependencies = {},
): Promise<BrandVaultScanAuthorizationResult> {
  if (!isObjectRecord(input.body)) {
    return invalidRequest('Request body must be an object.');
  }

  const requestedNewClient = input.body.newClient;
  if (requestedNewClient !== undefined && typeof requestedNewClient !== 'boolean') {
    return invalidRequest('newClient must be a boolean when provided.');
  }

  const rawBrandId = input.body.brandId;
  if (rawBrandId !== undefined && (typeof rawBrandId !== 'string' || rawBrandId.trim().length === 0)) {
    return invalidRequest('brandId must be a non-empty string when provided.');
  }

  const brandId = typeof rawBrandId === 'string' ? rawBrandId.trim() : undefined;
  if (requestedNewClient === true && brandId) {
    return invalidRequest('Start a new client without supplying a brandId.');
  }

  if (requestedNewClient === true || !brandId) {
    return mintNewClientRequest(input.body, dependencies.mintBrandId ?? mintBrandId);
  }

  const findOwnedPlatformBrand = dependencies.findOwnedPlatformBrand ?? hasOwnedPlatformBrand;
  const authorizeAcceptedBrand = dependencies.authorizeAcceptedBrand ?? hasAuthorizedAcceptedBrand;
  const findOwnedPendingScan = dependencies.findOwnedPendingScan ?? hasOwnedPendingBrandVaultScan;

  try {
    if (await findOwnedPlatformBrand({ userId: input.userId, brandId })) {
      return authorizedRequest(input.body, brandId, 'platform_brand');
    }

    if (await authorizeAcceptedBrand({
      userId: input.userId,
      orgId: input.orgId,
      isOrgAdmin: input.isOrgAdmin,
      brandId,
      store: input.store,
    })) {
      return authorizedRequest(input.body, brandId, 'accepted_vault_brand');
    }

    if (await findOwnedPendingScan({
      userId: input.userId,
      orgId: input.orgId,
      brandId,
      store: input.store,
    })) {
      return authorizedRequest(input.body, brandId, 'pending_vault_scan');
    }
  } catch (error) {
    console.error('[BrandVault] brand scan scope verification failed:', error);
    return {
      ok: false,
      status: 503,
      code: 'brand_scope_unavailable',
      message: 'Brand Vault cannot verify access to the selected client. Please retry.',
    };
  }

  return {
    ok: false,
    status: 403,
    code: 'brand_scope_not_found',
    message: 'The selected client is not available to this workspace. Choose an existing client or start a new client.',
  };
}

function mintNewClientRequest(
  body: BrandVaultScanRequestBody,
  createBrandId: () => string,
): Extract<BrandVaultScanAuthorizationResult, { ok: true }> {
  const { newClient: _newClient, brandId: _brandId, ...requestBody } = body;
  const brandId = createBrandId();
  return {
    ok: true,
    body: { ...requestBody, brandId },
    brandId,
    source: 'server_minted_new_client',
  };
}

function authorizedRequest(
  body: BrandVaultScanRequestBody,
  brandId: string,
  source: Exclude<BrandVaultScanScopeSource, 'server_minted_new_client'>,
): Extract<BrandVaultScanAuthorizationResult, { ok: true }> {
  const { newClient: _newClient, ...requestBody } = body;
  return { ok: true, body: { ...requestBody, brandId }, brandId, source };
}

function invalidRequest(message: string): Extract<BrandVaultScanAuthorizationResult, { ok: false }> {
  return { ok: false, status: 400, code: 'invalid_request', message };
}

async function hasOwnedPlatformBrand(input: OwnedBrandInput): Promise<boolean> {
  const { getDatabase } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  const brand = await db.collection('brands').findOne(
    { brandId: input.brandId, userId: input.userId },
    { projection: { _id: 1 } },
  );
  return Boolean(brand);
}

async function hasAuthorizedAcceptedBrand(input: AcceptedBrandInput): Promise<boolean> {
  try {
    await authorizeBrandScope({
      userId: input.userId,
      orgId: input.orgId,
      isOrgAdmin: input.isOrgAdmin,
      brandId: input.brandId,
      store: input.store,
    });
    return true;
  } catch (error) {
    if (error instanceof BrandScopeAuthorizationError && error.code === 'brand_not_found') return false;
    throw error;
  }
}

async function hasOwnedPendingBrandVaultScan(input: PendingScanInput): Promise<boolean> {
  if (!input.store.listJobSnapshots) return false;
  const snapshots = await input.store.listJobSnapshots({
    brandId: input.brandId,
    userId: input.userId,
    orgId: input.orgId,
    limit: 1,
    sort: 'updatedAtDesc',
  });
  return snapshots.some((snapshot) =>
    snapshot.job.brandId?.trim() === input.brandId &&
    snapshot.job.userId === input.userId &&
    (snapshot.job.orgId ?? null) === input.orgId,
  );
}

function isObjectRecord(value: unknown): value is BrandVaultScanRequestBody {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
