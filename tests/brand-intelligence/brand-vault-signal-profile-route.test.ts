import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as GET_BRANDS } from '@/app/api/brand-vault/brands/route';
import { GET as GET_SCANS } from '@/app/api/brand-vault/brands/[brandId]/scans/route';
import { GET } from '@/app/api/brand-vault/signal-profiles/route';
import { PATCH } from '@/app/api/brand-vault/signal-profiles/[id]/route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  emitBrandEvent: vi.fn(),
  getBrandVaultSignalProfile: vi.fn(),
  getDefaultBrandVaultRefineryStore: vi.fn(),
  getLatestAcceptedRecord: vi.fn(),
  getBrandAccessGrants: vi.fn(),
  listAcceptedBrands: vi.fn(),
  listJobSnapshots: vi.fn(),
  reviewBrandVaultSignalProfileDraft: vi.fn(),
  saveRecord: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/shared/brand-events', () => ({
  emitBrandEvent: mocks.emitBrandEvent,
}));

vi.mock('@/lib/shared/brand-vault-refinery-api', () => ({
  getBrandVaultSignalProfile: mocks.getBrandVaultSignalProfile,
  getDefaultBrandVaultRefineryStore: mocks.getDefaultBrandVaultRefineryStore,
  reviewBrandVaultSignalProfileDraft: mocks.reviewBrandVaultSignalProfileDraft,
}));

function request(body: unknown): Request {
  return new Request('http://localhost/api/brand-vault/signal-profiles/record_route', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function listRequest(brandId?: string): Request {
  const suffix = brandId ? `?brandId=${encodeURIComponent(brandId)}` : '';
  return new Request(`http://localhost/api/brand-vault/signal-profiles${suffix}`);
}

function scansRequest(limit?: number): Request {
  const suffix = typeof limit === 'number' ? `?limit=${limit}` : '';
  return new Request(`http://localhost/api/brand-vault/brands/brand_route/scans${suffix}`);
}

describe('Brand Vault signal profile routes', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.emitBrandEvent.mockReset();
    mocks.getBrandVaultSignalProfile.mockReset();
    mocks.getDefaultBrandVaultRefineryStore.mockReset();
    mocks.getLatestAcceptedRecord.mockReset();
    mocks.getBrandAccessGrants.mockReset();
    mocks.listAcceptedBrands.mockReset();
    mocks.listJobSnapshots.mockReset();
    mocks.reviewBrandVaultSignalProfileDraft.mockReset();
    mocks.saveRecord.mockReset();

    mocks.auth.mockResolvedValue({ userId: 'user_route', orgId: 'org_route', has: vi.fn(() => false) });
    mocks.emitBrandEvent.mockResolvedValue('event_route');
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue({
      store: 'brand-vault',
      getLatestAcceptedRecord: mocks.getLatestAcceptedRecord,
      getBrandAccessGrants: mocks.getBrandAccessGrants,
      listAcceptedBrands: mocks.listAcceptedBrands,
      listJobSnapshots: mocks.listJobSnapshots,
      saveRecord: mocks.saveRecord,
    });
  });

  it('lists accepted brands for the active organization', async () => {
    mocks.listAcceptedBrands.mockResolvedValue([
      {
        brandId: 'brand_route',
        name: 'Route Brand',
        recordId: 'accepted_route',
        orgId: 'org_route',
        userId: 'user_route',
        acceptedAt: '2026-06-24T01:00:00.000Z',
        updatedAt: '2026-06-24T01:01:00.000Z',
      },
    ]);

    const response = await GET_BRANDS();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      brands: [
        {
          brandId: 'brand_route',
          name: 'Route Brand',
          recordId: 'accepted_route',
          orgId: 'org_route',
          userId: 'user_route',
          acceptedAt: '2026-06-24T01:00:00.000Z',
          updatedAt: '2026-06-24T01:01:00.000Z',
        },
      ],
    });
    expect(mocks.listAcceptedBrands).toHaveBeenCalledWith({
      orgId: 'org_route',
      userId: 'user_route',
      isOrgAdmin: false,
    });
  });

  it('lists personal accepted brands only for the signed-in user when no org is active', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_route', orgId: null, has: vi.fn(() => false) });
    mocks.listAcceptedBrands.mockResolvedValue([]);

    const response = await GET_BRANDS();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, brands: [] });
    expect(mocks.listAcceptedBrands).toHaveBeenCalledWith({ orgId: null, userId: 'user_route' });
  });

  it('never mutates accepted history while listing brands', async () => {
    mocks.getLatestAcceptedRecord.mockResolvedValue({
      id: 'legacy_accepted',
      status: 'accepted',
      profile: { brandId: '' },
    });
    mocks.listAcceptedBrands.mockResolvedValue([]);

    const response = await GET_BRANDS();

    expect(response.status).toBe(200);
    expect(mocks.getLatestAcceptedRecord).not.toHaveBeenCalled();
    expect(mocks.saveRecord).not.toHaveBeenCalled();
  });

  it('falls back to the user\'s latest accepted profile when no brandId is given', async () => {
    // brandId is optional so the vault still loads on a fresh visit before any brand is selected.
    mocks.getLatestAcceptedRecord.mockResolvedValue({ id: 'accepted_latest' });

    const response = await GET(listRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, recordId: 'accepted_latest' });
    expect(mocks.getLatestAcceptedRecord).toHaveBeenCalledWith({
      userId: 'user_route',
      orgId: 'org_route',
      brandId: undefined,
    });
  });

  it('loads the latest accepted profile for the selected brand', async () => {
    mocks.getLatestAcceptedRecord.mockResolvedValue({ id: 'accepted_route' });

    const response = await GET(listRequest('brand_route'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, recordId: 'accepted_route' });
    expect(mocks.getLatestAcceptedRecord).toHaveBeenCalledWith({
      userId: 'user_route',
      orgId: 'org_route',
      brandId: 'brand_route',
    });
  });

  it('emits brand_updated when a draft is accepted without manual learning events', async () => {
    mocks.reviewBrandVaultSignalProfileDraft.mockResolvedValue({
      status: 200,
      body: {
        ok: true,
        record: {
          id: 'record_route',
          status: 'accepted',
          profile: { brandId: 'brand_route', orgId: 'org_route' },
          review: { acceptedAt: '2026-06-24T01:00:00.000Z' },
        },
        job: { id: 'job_route', status: 'accepted' },
        reviewPayload: null,
        superseded: [],
        learningEvents: [],
      },
    });

    const response = await PATCH(request({ action: 'accept' }), {
      params: Promise.resolve({ id: 'record_route' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.reviewBrandVaultSignalProfileDraft).toHaveBeenCalledWith(
      {
        userId: 'user_route',
        orgId: 'org_route',
        recordId: 'record_route',
        actorId: 'user_route',
        body: { action: 'accept' },
      },
      { store: expect.objectContaining({ store: 'brand-vault' }) },
    );
    expect(mocks.emitBrandEvent).toHaveBeenCalledWith({
      userId: 'user_route',
      brandId: 'brand_route',
      service: 'brand_vault',
      type: 'brand_updated',
      payload: {
        source: 'brand_vault_review_acceptance',
        recordId: 'record_route',
        orgId: 'org_route',
        acceptedAt: '2026-06-24T01:00:00.000Z',
        learningEvents: [],
      },
    });
  });

  it('does not emit brand_updated for rejected drafts', async () => {
    mocks.reviewBrandVaultSignalProfileDraft.mockResolvedValue({
      status: 200,
      body: {
        ok: true,
        record: {
          id: 'record_route',
          status: 'rejected',
          profile: { brandId: 'brand_route', orgId: 'org_route' },
          review: { rejectionReason: 'Wrong brand.' },
        },
        job: { id: 'job_route', status: 'rejected' },
        reviewPayload: null,
        superseded: [],
        learningEvents: [],
      },
    });

    const response = await PATCH(request({ action: 'reject', reason: 'Wrong brand.' }), {
      params: Promise.resolve({ id: 'record_route' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.emitBrandEvent).not.toHaveBeenCalled();
  });
  it('lists scoped brand scan summaries without raw evidence payloads', async () => {
    mocks.getBrandAccessGrants.mockResolvedValue(new Map());
    mocks.listJobSnapshots
      .mockResolvedValueOnce([
        {
          job: {
            id: 'job_org_new',
            userId: 'other_user_same_org',
            orgId: 'org_route',
            brandId: 'brand_route',
            status: 'needs_review',
            inputs: { websiteUrl: 'https://new.example', companyName: 'Route Brand', socialLinks: ['https://instagram.com/insturix'] },
            warnings: ['needs review'],
            createdAt: '2026-06-24T01:00:00.000Z',
            updatedAt: '2026-06-24T01:05:00.000Z',
          },
          recordId: 'record_org_new',
          normalizedUrl: 'https://new.example/',
          candidates: [{ id: 'candidate_hidden' }],
        },
      ])
      .mockResolvedValueOnce([
        {
          job: {
            id: 'job_legacy_old',
            userId: 'user_route',
            brandId: 'brand_route',
            status: 'accepted',
            inputs: { websiteUrl: 'https://old.example', socialLinks: [] },
            warnings: [],
            createdAt: '2026-06-24T00:00:00.000Z',
            updatedAt: '2026-06-24T00:05:00.000Z',
          },
          recordId: 'record_legacy_old',
          candidates: [],
        },
      ]);

    const response = await GET_SCANS(scansRequest(2), {
      params: Promise.resolve({ brandId: 'brand_route' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listJobSnapshots).toHaveBeenNthCalledWith(1, {
      brandId: 'brand_route',
      orgId: 'org_route',
      limit: 2,
      sort: 'updatedAtDesc',
    });
    expect(mocks.listJobSnapshots).toHaveBeenNthCalledWith(2, {
      brandId: 'brand_route',
      userId: 'user_route',
      orgId: null,
      limit: 2,
      sort: 'updatedAtDesc',
    });
    expect(payload).toEqual({
      ok: true,
      brandId: 'brand_route',
      scans: [
        {
          jobId: 'job_org_new',
          brandId: 'brand_route',
          orgId: 'org_route',
          userId: 'other_user_same_org',
          recordId: 'record_org_new',
          status: 'needs_review',
          websiteUrl: 'https://new.example',
          companyName: 'Route Brand',
          socialLinks: ['https://instagram.com/insturix'],
          normalizedUrl: 'https://new.example/',
          candidateCount: 1,
          warningCount: 1,
          createdAt: '2026-06-24T01:00:00.000Z',
          updatedAt: '2026-06-24T01:05:00.000Z',
        },
        {
          jobId: 'job_legacy_old',
          brandId: 'brand_route',
          orgId: null,
          userId: 'user_route',
          recordId: 'record_legacy_old',
          status: 'accepted',
          websiteUrl: 'https://old.example',
          companyName: null,
          socialLinks: [],
          normalizedUrl: null,
          candidateCount: 0,
          warningCount: 0,
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:05:00.000Z',
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain('candidate_hidden');
  });

  it('blocks brand scan history when org access restricts another user', async () => {
    mocks.getBrandAccessGrants.mockResolvedValue(new Map([['brand_route', ['other_user']]]));

    const response = await GET_SCANS(scansRequest(), {
      params: Promise.resolve({ brandId: 'brand_route' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      ok: false,
      error: { code: 'forbidden', message: 'You do not have access to this brand.' },
    });
    expect(mocks.listJobSnapshots).not.toHaveBeenCalled();
  });
});
