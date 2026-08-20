import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getBrandAccessGrants: vi.fn(),
  getDefaultBrandVaultRefineryStore: vi.fn(),
  setBrandAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/shared/brand-vault-refinery-api', () => ({
  getDefaultBrandVaultRefineryStore: mocks.getDefaultBrandVaultRefineryStore,
}));

import { GET as getAccessMap } from '@/app/api/brand-vault/brands/access/route';
import {
  GET as getBrandAccess,
  PUT as putBrandAccess,
} from '@/app/api/brand-vault/brands/[brandId]/access/route';

function params(brandId = 'brand_1') {
  return { params: Promise.resolve({ brandId }) };
}

describe('Brand Vault access routes', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getBrandAccessGrants.mockReset();
    mocks.getDefaultBrandVaultRefineryStore.mockReset();
    mocks.setBrandAccess.mockReset();
    mocks.auth.mockResolvedValue({
      userId: 'admin_1',
      orgId: 'org_1',
      has: vi.fn((input: { role?: string }) => input.role === 'org:admin'),
    });
  });

  it('does not represent unavailable ACL storage as an empty open grant map', async () => {
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue({});

    const response = await getAccessMap();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'brand_scope_unavailable',
        message: 'Brand Vault cannot verify organization brand access.',
      },
    });
  });

  it('fails closed when reading a single brand assignment cannot reach ACL storage', async () => {
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue({
      getBrandAccessGrants: mocks.getBrandAccessGrants,
    });
    mocks.getBrandAccessGrants.mockRejectedValue(new Error('ACL collection unavailable'));

    const response = await getBrandAccess(new Request('http://localhost/api/brand-vault/brands/brand_1/access'), params());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'brand_scope_unavailable' },
    });
  });

  it('does not accept an access assignment while ACL storage is unavailable', async () => {
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue({});

    const response = await putBrandAccess(
      new Request('http://localhost/api/brand-vault/brands/brand_1/access', {
        method: 'PUT',
        body: JSON.stringify({ userIds: ['member_1'] }),
      }),
      params(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'brand_scope_unavailable' },
    });
  });

  it('does not reinterpret a malformed assignment as an instruction to reopen a restricted brand', async () => {
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue({
      setBrandAccess: mocks.setBrandAccess,
    });

    const response = await putBrandAccess(
      new Request('http://localhost/api/brand-vault/brands/brand_1/access', {
        method: 'PUT',
        body: JSON.stringify({ userIds: 'member_1' }),
      }),
      params(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(mocks.setBrandAccess).not.toHaveBeenCalled();
  });

  it('keeps an explicit empty assignment as the deliberate reopen command', async () => {
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue({
      setBrandAccess: mocks.setBrandAccess,
    });
    mocks.setBrandAccess.mockResolvedValue(undefined);

    const response = await putBrandAccess(
      new Request('http://localhost/api/brand-vault/brands/brand_1/access', {
        method: 'PUT',
        body: JSON.stringify({ userIds: [] }),
      }),
      params(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, brandId: 'brand_1', userIds: [] });
    expect(mocks.setBrandAccess).toHaveBeenCalledWith({
      orgId: 'org_1',
      brandId: 'brand_1',
      userIds: [],
    });
  });

  it('does not report success when ACL storage rejects a valid assignment', async () => {
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue({
      setBrandAccess: mocks.setBrandAccess,
    });
    mocks.setBrandAccess.mockRejectedValue(new Error('ACL collection unavailable'));

    const response = await putBrandAccess(
      new Request('http://localhost/api/brand-vault/brands/brand_1/access', {
        method: 'PUT',
        body: JSON.stringify({ userIds: ['member_1'] }),
      }),
      params(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'brand_scope_unavailable' },
    });
  });
});
