import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindVerifiedBrandVaultDomain,
  BrandClientRegistryError,
  createBrandVaultClientRecord,
  ensureBrandVaultClient,
} from '@/lib/shared/brand-client-registry';

const mocks = vi.hoisted(() => {
  const brandsFindOne = vi.fn();
  const brandsUpdateOne = vi.fn();
  const claimsDeleteOne = vi.fn();
  const claimsFindOne = vi.fn();
  const claimsInsertOne = vi.fn();
  const collection = vi.fn();
  const getDatabase = vi.fn();
  const invalidateCache = vi.fn();
  return {
    brandsFindOne,
    brandsUpdateOne,
    claimsDeleteOne,
    claimsFindOne,
    claimsInsertOne,
    collection,
    getDatabase,
    invalidateCache,
  };
});

vi.mock('@/lib/editron/db/mongodb', () => ({ getDatabase: mocks.getDatabase }));
vi.mock('@/lib/shared/brand-registry', () => ({ invalidateCache: mocks.invalidateCache }));

const BASE_INPUT = {
  brandId: 'brand_client_1',
  userId: 'user_owner',
  orgId: 'org_agency',
  websiteUrl: 'https://www.client.example/',
  companyName: 'Client Studio',
  now: '2026-08-20T12:00:00.000Z',
} as const;

describe('Brand Vault client registry', () => {
  beforeEach(() => {
    mocks.brandsFindOne.mockReset();
    mocks.brandsUpdateOne.mockReset();
    mocks.claimsDeleteOne.mockReset();
    mocks.claimsFindOne.mockReset();
    mocks.claimsInsertOne.mockReset();
    mocks.collection.mockReset();
    mocks.getDatabase.mockReset();
    mocks.invalidateCache.mockReset();

    mocks.brandsFindOne.mockResolvedValue(null);
    mocks.brandsUpdateOne.mockResolvedValue({ upsertedCount: 1, matchedCount: 1 });
    mocks.claimsDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.claimsFindOne.mockResolvedValue(null);
    mocks.claimsInsertOne.mockResolvedValue({ acknowledged: true });
    mocks.collection.mockImplementation((name: string) => {
      if (name === 'brands') {
        return { findOne: mocks.brandsFindOne, updateOne: mocks.brandsUpdateOne };
      }
      if (name === 'brand_domain_claims') {
        return {
          deleteOne: mocks.claimsDeleteOne,
          findOne: mocks.claimsFindOne,
          insertOne: mocks.claimsInsertOne,
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    });
    mocks.getDatabase.mockResolvedValue({ collection: mocks.collection });
  });

  it('creates a minimal durable client record from scan intake facts', () => {
    const record = createBrandVaultClientRecord({
      ...BASE_INPUT,
      source: 'brand_vault_scan',
    });

    expect(record).toMatchObject({
      brandId: 'brand_client_1',
      userId: 'user_owner',
      orgId: 'org_agency',
      name: 'Client Studio',
      websiteUrl: 'https://www.client.example/',
      industry: '',
      colors: [],
      provisioningSource: 'brand_vault_scan',
      domainAssociations: [{ host: 'client.example', status: 'observed', firstSeenAt: BASE_INPUT.now }],
    });
    expect(record.createdAt).toEqual(new Date(BASE_INPUT.now));
    expect(record.updatedAt).toEqual(new Date(BASE_INPUT.now));
  });

  it('upserts a first scan client against its owner and invalidates the legacy read cache', async () => {
    const result = await ensureBrandVaultClient({
      ...BASE_INPUT,
      source: 'brand_vault_scan',
    });

    expect(result).toMatchObject({ created: true, client: { brandId: 'brand_client_1', userId: 'user_owner' } });
    expect(mocks.brandsUpdateOne).toHaveBeenCalledWith(
      { brandId: 'brand_client_1', userId: 'user_owner' },
      {
        $setOnInsert: expect.objectContaining({
          name: 'Client Studio',
          websiteUrl: 'https://www.client.example/',
          domainAssociations: [{ host: 'client.example', status: 'observed', firstSeenAt: BASE_INPUT.now }],
        }),
      },
      { upsert: true },
    );
    expect(mocks.invalidateCache).toHaveBeenCalledWith('user_owner');
  });

  it('binds a verified DNS domain once and makes retrying the same client safe', async () => {
    mocks.brandsUpdateOne
      .mockResolvedValueOnce({ upsertedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockResolvedValueOnce({ upsertedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 1 });
    mocks.claimsInsertOne
      .mockResolvedValueOnce({ acknowledged: true })
      .mockRejectedValueOnce({ code: 11000 });
    mocks.claimsFindOne.mockResolvedValue({ brandId: 'brand_client_1' });

    const binding = await bindVerifiedBrandVaultDomain({
      ...BASE_INPUT,
      recordName: '_insturix-brand.client.example',
      verifiedAt: '2026-08-20T13:00:00.000Z',
    });

    expect(binding).toEqual({
      host: 'client.example',
      status: 'verified',
      firstSeenAt: BASE_INPUT.now,
      verifiedAt: '2026-08-20T13:00:00.000Z',
      verificationMethod: 'dns_txt',
      recordName: '_insturix-brand.client.example',
    });
    await expect(bindVerifiedBrandVaultDomain({
      ...BASE_INPUT,
      recordName: '_insturix-brand.client.example',
      verifiedAt: '2026-08-20T13:00:00.000Z',
    })).resolves.toEqual(binding);
    expect(mocks.claimsInsertOne).toHaveBeenCalledWith(expect.objectContaining({
      _id: '["user_owner","client.example"]',
      brandId: 'brand_client_1',
      host: 'client.example',
    }));
    expect(mocks.brandsFindOne).toHaveBeenCalledWith(
      {
        userId: 'user_owner',
        brandId: { $ne: 'brand_client_1' },
        domainAssociations: { $elemMatch: { host: 'client.example', status: 'verified' } },
      },
      { projection: { brandId: 1 } },
    );
    expect(mocks.claimsFindOne).toHaveBeenCalledWith(
      { _id: '["user_owner","client.example"]' },
      { projection: { brandId: 1 } },
    );
    expect(mocks.brandsUpdateOne).toHaveBeenCalledTimes(4);
  });

  it('fails closed when another client reserves the verified domain concurrently', async () => {
    mocks.claimsInsertOne.mockRejectedValue({ code: 11000 });
    mocks.claimsFindOne.mockResolvedValue({ brandId: 'brand_other_client' });

    await expect(bindVerifiedBrandVaultDomain({
      ...BASE_INPUT,
      recordName: '_insturix-brand.client.example',
    })).rejects.toMatchObject({
      code: 'domain_bound_elsewhere',
    });

    expect(mocks.brandsUpdateOne).not.toHaveBeenCalled();
  });

  it('releases a newly reserved claim when the client association cannot be persisted', async () => {
    mocks.brandsUpdateOne
      .mockResolvedValueOnce({ upsertedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 0 });

    await expect(bindVerifiedBrandVaultDomain({
      ...BASE_INPUT,
      recordName: '_insturix-brand.client.example',
    })).rejects.toMatchObject({
      code: 'client_provision_failed',
    });

    expect(mocks.claimsDeleteOne).toHaveBeenCalledWith({
      _id: '["user_owner","client.example"]',
      brandId: 'brand_client_1',
    });
  });
});
