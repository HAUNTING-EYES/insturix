import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createBrowserFallback: vi.fn(),
  createTextEvidenceCompiler: vi.fn(),
  ensureBrandVaultClient: vi.fn(),
  getBrandVaultRefineryJob: vi.fn(),
  getDefaultBrandVaultRefineryStore: vi.fn(),
  loadConnectedSocialEvidence: vi.fn(),
  processNextQueuedJob: vi.fn(),
  startQueuedJob: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/shared/brand-vault-refinery-api', () => ({
  getBrandVaultRefineryJob: mocks.getBrandVaultRefineryJob,
  getDefaultBrandVaultRefineryStore: mocks.getDefaultBrandVaultRefineryStore,
  processNextQueuedBrandVaultRefineryJob: mocks.processNextQueuedJob,
  startQueuedBrandVaultRefineryJobFromWebsite: mocks.startQueuedJob,
}));
vi.mock('@/lib/shared/brand-vault-browser-fallback', () => ({
  createBrandVaultBrowserFallbackFetchFromEnvironment: mocks.createBrowserFallback,
}));
vi.mock('@/lib/shared/brand-vault-connected-social-loader', () => ({
  loadBrandVaultConnectedSocialEvidence: mocks.loadConnectedSocialEvidence,
}));
vi.mock('@/lib/shared/brand-vault-text-evidence-compiler', () => ({
  createBrandVaultTextEvidenceCompilerFromEnvironment: mocks.createTextEvidenceCompiler,
}));
vi.mock('@/lib/shared/brand-vault-scan-authorization', () => ({
  authorizeBrandVaultScanRequest: vi.fn(),
}));
vi.mock('@/lib/shared/brand-client-registry', () => ({
  BrandClientRegistryError: class BrandClientRegistryError extends Error {},
  ensureBrandVaultClient: mocks.ensureBrandVaultClient,
}));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: vi.fn() }));

import { GET } from '@/app/api/brand-vault/refinery/jobs/route';

describe('Brand Vault refinery jobs route', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.getBrandVaultRefineryJob.mockReset();
    mocks.getDefaultBrandVaultRefineryStore.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_route', orgId: 'org_route' });
  });

  it('returns private no-store headers for a completed scan status', async () => {
    const store = { id: 'store_route' };
    mocks.getDefaultBrandVaultRefineryStore.mockReturnValue(store);
    mocks.getBrandVaultRefineryJob.mockResolvedValue({
      status: 200,
      body: { ok: true, job: { id: 'job_route', status: 'needs_review' } },
    });

    const response = await GET(new Request('http://localhost/api/brand-vault/refinery/jobs?jobId=job_route'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(mocks.getBrandVaultRefineryJob).toHaveBeenCalledWith(
      { userId: 'user_route', orgId: 'org_route', jobId: 'job_route' },
      { store },
    );
  });

  it('does not expose an unauthenticated job-status response to shared caches', async () => {
    mocks.auth.mockResolvedValue({ userId: null, orgId: null });

    const response = await GET(new Request('http://localhost/api/brand-vault/refinery/jobs?jobId=job_route'));

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(mocks.getBrandVaultRefineryJob).not.toHaveBeenCalled();
  });
});
