import { describe, expect, it } from 'vitest';
import {
  createBrandVaultRefineryJobFromWebsite,
  createInMemoryBrandVaultRefineryStore,
  getBrandVaultSignalProfile,
  reviewBrandVaultSignalProfileDraft,
} from '@/lib/shared/brand-vault-refinery-api';

const NOW = '2026-08-19T00:00:00.000Z';
const HTML = '<html><head><title>Agency Brand</title></head><body><h1>Clear brand evidence</h1></body></html>';

async function createOrgDraft() {
  const store = createInMemoryBrandVaultRefineryStore();
  const created = await createBrandVaultRefineryJobFromWebsite(
    {
      userId: 'owner_user',
      orgId: 'org_agency',
      body: { websiteUrl: 'https://brand.example', brandId: 'brand_client' },
    },
    {
      store,
      clock: () => NOW,
      fetchOptions: {
        fetchFn: async () => new Response(HTML, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      },
    },
  );
  if (!created.body.ok) throw new Error(created.body.error.message);
  return { store, recordId: created.body.record.id };
}

describe('Brand Vault organization review authority', () => {
  it('lets an organization collaborator read and review an open brand draft', async () => {
    const { store, recordId } = await createOrgDraft();

    const loaded = await getBrandVaultSignalProfile(
      { userId: 'collaborator_user', orgId: 'org_agency', recordId },
      { store },
    );
    const reviewed = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'collaborator_user',
        orgId: 'org_agency',
        recordId,
        body: { action: 'accept' },
      },
      { store },
    );

    expect(loaded.status).toBe(200);
    expect(reviewed.status).toBe(200);
    expect((await store.getRecord(recordId))?.status).toBe('accepted');
  });

  it('denies a revoked original owner while preserving organization admin access', async () => {
    const { store, recordId } = await createOrgDraft();
    store.setBrandAccess({
      orgId: 'org_agency',
      brandId: 'brand_client',
      userIds: ['assigned_user'],
    });

    const denied = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'owner_user',
        orgId: 'org_agency',
        recordId,
        body: { action: 'accept' },
      },
      { store },
    );
    const admin = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'admin_user',
        orgId: 'org_agency',
        isOrgAdmin: true,
        recordId,
        body: { action: 'accept' },
      },
      { store },
    );

    expect(denied.status).toBe(404);
    expect(admin.status).toBe(200);
  });
});
