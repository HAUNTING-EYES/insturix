import { describe, expect, it, vi } from 'vitest';
import { authorizeBrandScope } from '@/lib/shared/brand-scope';

function acceptedRecord(brandId = 'brand_1') {
  return {
    id: 'record_12',
    status: 'accepted' as const,
    createdAt: '2026-08-15T09:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    review: {
      required: false,
      reasons: [],
      acceptedAt: '2026-08-15T09:30:00.000Z',
    },
    profile: {
      brandId,
      userId: 'user_1',
      identity: { brandName: { value: 'Direct Brand' } },
    },
  } as any;
}

describe('direct Brand Vault scope authorization', () => {
  it('authorizes the requested accepted record directly without a capped list scan', async () => {
    const getLatestAcceptedRecord = vi.fn().mockResolvedValue(acceptedRecord());
    const result = await authorizeBrandScope({
      userId: 'user_1',
      orgId: null,
      brandId: 'brand_1',
      store: { getLatestAcceptedRecord },
    });

    expect(getLatestAcceptedRecord).toHaveBeenCalledWith({
      brandId: 'brand_1',
      userId: 'user_1',
      orgId: null,
    });
    expect(result).toMatchObject({
      brandId: 'brand_1',
      brandName: 'Direct Brand',
      recordId: 'record_12',
      acceptedAt: '2026-08-15T09:30:00.000Z',
      updatedAt: '2026-08-15T10:00:00.000Z',
      acceptedRecord: { id: 'record_12', status: 'accepted' },
    });
  });

  it('does not disclose an org brand to a restricted member', async () => {
    const getLatestAcceptedRecord = vi.fn().mockResolvedValue(acceptedRecord());
    const getBrandAccessGrants = vi.fn().mockResolvedValue(new Map([
      ['brand_1', ['user_2']],
    ]));

    await expect(authorizeBrandScope({
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_1',
      store: { getLatestAcceptedRecord, getBrandAccessGrants },
    })).rejects.toMatchObject({ code: 'brand_not_found' });
  });

  it('allows an org admin through an explicit grant restriction', async () => {
    const getLatestAcceptedRecord = vi.fn().mockResolvedValue(acceptedRecord());
    const getBrandAccessGrants = vi.fn().mockResolvedValue(new Map([
      ['brand_1', ['user_2']],
    ]));

    await expect(authorizeBrandScope({
      userId: 'user_1',
      orgId: 'org_1',
      isOrgAdmin: true,
      brandId: 'brand_1',
      store: { getLatestAcceptedRecord, getBrandAccessGrants },
    })).resolves.toMatchObject({ brandId: 'brand_1', recordId: 'record_12' });
  });

  it('fails closed when organization access storage is not available', async () => {
    await expect(authorizeBrandScope({
      userId: 'user_1',
      orgId: 'org_1',
      brandId: 'brand_1',
      store: { getLatestAcceptedRecord: vi.fn().mockResolvedValue(acceptedRecord()) },
    })).rejects.toMatchObject({ code: 'brand_scope_unavailable' });
  });

  it('rejects a record whose embedded brand identity disagrees with the request', async () => {
    await expect(authorizeBrandScope({
      userId: 'user_1',
      orgId: null,
      brandId: 'brand_1',
      store: { getLatestAcceptedRecord: vi.fn().mockResolvedValue(acceptedRecord('brand_other')) },
    })).rejects.toMatchObject({ code: 'brand_not_found' });
  });

  it('maps storage failures to an explicit unavailable result', async () => {
    await expect(authorizeBrandScope({
      userId: 'user_1',
      orgId: null,
      brandId: 'brand_1',
      store: { getLatestAcceptedRecord: vi.fn().mockRejectedValue(new Error('database unavailable')) },
    })).rejects.toMatchObject({ code: 'brand_scope_unavailable' });
  });
});
