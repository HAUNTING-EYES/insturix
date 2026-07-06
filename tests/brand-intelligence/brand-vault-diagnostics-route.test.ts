import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/brand-vault/diagnostics/route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveEffectiveBrandWithProfile: vi.fn(),
  getLatestAcceptedRecord: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/shared/brand-effective-resolver', () => ({
  resolveEffectiveBrandWithProfile: mocks.resolveEffectiveBrandWithProfile,
}));
vi.mock('@/lib/shared/brand-vault-refinery-api', () => ({
  getDefaultBrandVaultRefineryStore: () => ({ getLatestAcceptedRecord: mocks.getLatestAcceptedRecord }),
}));

function req(brandId?: string): Request {
  const suffix = brandId ? `?brandId=${encodeURIComponent(brandId)}` : '';
  return new Request(`http://localhost/api/brand-vault/diagnostics${suffix}`);
}

describe('Brand Vault diagnostics route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.resolveEffectiveBrandWithProfile.mockReset();
    mocks.getLatestAcceptedRecord.mockReset();
    mocks.getLatestAcceptedRecord.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ userId: 'user_diag', orgId: 'org_diag' });
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      brand: { name: 'Diag Brand' },
      acceptedProfile: { version: 1 },
      source: 'brand_vault',
    });
  });

  it('401 when unauthenticated', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const res = await GET(req('brand_diag'));
    expect(res.status).toBe(401);
    expect(mocks.resolveEffectiveBrandWithProfile).not.toHaveBeenCalled();
  });

  it('dumps the latest-accepted-record ground truth when brandId is missing (no service resolution)', async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe('latest-accepted-record');
    expect(body.record).toBeNull();
    expect(mocks.getLatestAcceptedRecord).toHaveBeenCalledWith({ userId: 'user_diag', orgId: 'org_diag' });
    expect(mocks.resolveEffectiveBrandWithProfile).not.toHaveBeenCalled();
  });

  it('reports the resolved source per generation service, scoped by orgId', async () => {
    const res = await GET(req('brand_diag'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.brandId).toBe('brand_diag');
    expect(body.services.map((s: { service: string }) => s.service)).toEqual([
      'editron',
      'thinkforge',
      'clickatron',
    ]);
    expect(body.services.every((s: { source: string }) => s.source === 'brand_vault')).toBe(true);
    expect(body.services.every((s: { hasAcceptedProfile: boolean }) => s.hasAcceptedProfile)).toBe(true);
    expect(mocks.resolveEffectiveBrandWithProfile).toHaveBeenCalledWith(
      'user_diag',
      'brand_diag',
      expect.objectContaining({ service: 'editron', orgId: 'org_diag' }),
    );
  });

  it('surfaces a legacy/none fallback distinctly (so a silent legacy fallback is visible)', async () => {
    mocks.resolveEffectiveBrandWithProfile.mockResolvedValue({
      brand: { name: 'Legacy Brand' },
      acceptedProfile: null,
      source: 'legacy',
    });
    const res = await GET(req('brand_diag'));
    const body = await res.json();
    expect(body.services.every((s: { source: string }) => s.source === 'legacy')).toBe(true);
    expect(body.services.every((s: { hasAcceptedProfile: boolean }) => s.hasAcceptedProfile === false)).toBe(true);
  });
});
