import { describe, expect, it, vi } from 'vitest';
import {
  authorizeBrandVaultScanRequest,
  type BrandVaultScanAuthorizationDependencies,
} from '../../lib/shared/brand-vault-scan-authorization';
import { createInMemoryBrandVaultRefineryStore } from '../../lib/shared/brand-vault-refinery-api';

const BASE_REQUEST = {
  websiteUrl: 'https://client.example',
  socialLinks: [],
  sourceEvidence: [],
};

function createUnownedDependencies(
  overrides: BrandVaultScanAuthorizationDependencies = {},
): BrandVaultScanAuthorizationDependencies {
  return {
    mintBrandId: () => 'brand_server_minted',
    findOwnedPlatformBrand: async () => false,
    authorizeAcceptedBrand: async () => false,
    findOwnedPendingScan: async () => false,
    ...overrides,
  };
}

function authorize(
  body: unknown,
  dependencies: BrandVaultScanAuthorizationDependencies = createUnownedDependencies(),
  store = createInMemoryBrandVaultRefineryStore(),
) {
  return authorizeBrandVaultScanRequest(
    {
      body,
      userId: 'user_brand_owner',
      orgId: 'org_agency',
      isOrgAdmin: false,
      store,
    },
    dependencies,
  );
}

describe('Brand Vault scan target authorization', () => {
  it('mints the first new-client brand id on the server and removes client-only intent', async () => {
    const result = await authorize(
      { ...BASE_REQUEST, newClient: true },
      createUnownedDependencies({ mintBrandId: () => 'brand_server_owned' }),
    );

    expect(result).toMatchObject({
      ok: true,
      brandId: 'brand_server_owned',
      source: 'server_minted_new_client',
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.body).toEqual({ ...BASE_REQUEST, brandId: 'brand_server_owned' });
  });

  it('rejects a browser-supplied brand id that claims to be a new client', async () => {
    const result = await authorize(
      { ...BASE_REQUEST, newClient: true, brandId: 'brand_browser_minted' },
      createUnownedDependencies(),
    );

    expect(result).toMatchObject({ ok: false, status: 400, code: 'invalid_request' });
  });

  it('allows an existing platform client owned by the caller', async () => {
    const result = await authorize(
      { ...BASE_REQUEST, brandId: 'brand_existing_client' },
      createUnownedDependencies({ findOwnedPlatformBrand: async () => true }),
    );

    expect(result).toMatchObject({
      ok: true,
      brandId: 'brand_existing_client',
      source: 'platform_brand',
    });
  });

  it('allows an accepted Vault client resolved through the existing ACL owner', async () => {
    const result = await authorize(
      { ...BASE_REQUEST, brandId: 'brand_accepted_vault' },
      createUnownedDependencies({ authorizeAcceptedBrand: async () => true }),
    );

    expect(result).toMatchObject({
      ok: true,
      brandId: 'brand_accepted_vault',
      source: 'accepted_vault_brand',
    });
  });

  it('allows the caller to rescan their own pending client without accepting it first', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_pending',
        userId: 'user_brand_owner',
        orgId: 'org_agency',
        brandId: 'brand_pending_client',
        status: 'needs_review',
        inputs: { websiteUrl: 'https://client.example', socialLinks: [] },
        warnings: [],
        createdAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
      },
      candidates: [],
    });

    const result = await authorize(
      { ...BASE_REQUEST, brandId: 'brand_pending_client' },
      createUnownedDependencies({ findOwnedPendingScan: undefined }),
      store,
    );

    expect(result).toMatchObject({
      ok: true,
      brandId: 'brand_pending_client',
      source: 'pending_vault_scan',
    });
  });

  it('rejects forged client ids and fails closed when target verification is unavailable', async () => {
    const forged = await authorize(
      { ...BASE_REQUEST, brandId: 'brand_someone_else' },
      createUnownedDependencies(),
    );
    expect(forged).toMatchObject({ ok: false, status: 403, code: 'brand_scope_not_found' });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const unavailable = await authorize(
        { ...BASE_REQUEST, brandId: 'brand_existing_client' },
        createUnownedDependencies({ findOwnedPlatformBrand: async () => { throw new Error('Mongo unavailable'); } }),
      );
      expect(unavailable).toMatchObject({ ok: false, status: 503, code: 'brand_scope_unavailable' });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
