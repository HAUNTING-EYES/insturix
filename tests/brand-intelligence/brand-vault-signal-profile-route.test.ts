import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from '@/app/api/brand-vault/signal-profiles/[id]/route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  emitBrandEvent: vi.fn(),
  getBrandVaultSignalProfile: vi.fn(),
  getDefaultBrandVaultRefineryStore: vi.fn(),
  reviewBrandVaultSignalProfileDraft: vi.fn(),
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

describe('Brand Vault signal profile review route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.emitBrandEvent.mockReset();
    mocks.getBrandVaultSignalProfile.mockReset();
    mocks.getDefaultBrandVaultRefineryStore.mockReset();
    mocks.reviewBrandVaultSignalProfileDraft.mockReset();

    mocks.auth.mockResolvedValue({ userId: 'user_route', orgId: 'org_route' });
    mocks.emitBrandEvent.mockResolvedValue('event_route');
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue({ store: 'brand-vault' });
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
      { store: { store: 'brand-vault' } },
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
});