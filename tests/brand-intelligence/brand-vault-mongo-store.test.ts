import { describe, expect, it } from 'vitest';
import {
  createBrandVaultMongoRefineryStore,
  type BrandVaultMongoBrandAccessDocument,
  type BrandVaultMongoCollection,
  type BrandVaultMongoCollections,
  type BrandVaultMongoEventDocument,
  type BrandVaultMongoJobDocument,
  type BrandVaultMongoProfileDocument,
  type BrandVaultMongoCursor,
} from '../../lib/shared/brand-vault-mongo-store';
import { createBrandSignalProfileDraft } from '../../lib/shared/brand-signal-lifecycle';
import { deriveBrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import {
  createBrandVaultRefineryJobFromWebsite,
  getBrandVaultRefineryJob,
  reviewBrandVaultSignalProfileDraft,
} from '../../lib/shared/brand-vault-refinery-api';

const HTML = `
<!doctype html>
<html>
  <head>
    <title>Persistly - Brand systems for operators</title>
    <meta name="description" content="Persistly helps agency teams turn client websites into trusted brand systems.">
    <meta property="og:site_name" content="Persistly">
    <meta name="theme-color" content="#183047">
    <style>
      :root { --brand: #183047; --accent: #36d399; --paper: #ffffff; }
      body { color: #183047; background: #ffffff; font-family: "Inter", sans-serif; }
      button { background: #36d399; }
    </style>
  </head>
  <body>
    <h1>Build client brand systems fast</h1>
    <button>Start setup</button>
    <blockquote>Trusted by production teams.</blockquote>
  </body>
</html>
`;

describe('Brand Vault Mongo refinery store', () => {
  it('persists drafts, job snapshots, review updates, events, and accepted-profile supersession', async () => {
    const collections = createMemoryCollections();
    const store = createBrandVaultMongoRefineryStore({ collections });

    const first = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_mongo', body: { websiteUrl: 'persistly.example', brandId: 'brand_mongo' } },
      { store, clock: () => '2026-06-10T05:00:00.000Z', fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!first.body.ok) throw new Error(first.body.error.message);

    const loaded = await getBrandVaultRefineryJob(
      { userId: 'user_mongo', jobId: first.body.job.id },
      { store },
    );
    expect(loaded.status).toBe(200);
    expect(loaded.body.ok).toBe(true);
    if (!loaded.body.ok) throw new Error(loaded.body.error.message);
    expect(loaded.body.record?.id).toBe(first.body.record.id);

    const accepted = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_mongo',
        recordId: first.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-10T05:05:00.000Z',
      },
      { store },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.ok).toBe(true);
    if (!accepted.body.ok) throw new Error(accepted.body.error.message);
    expect(accepted.body.record.status).toBe('accepted');
    expect(accepted.body.job?.status).toBe('accepted');

    const second = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_mongo', body: { websiteUrl: 'persistly.example', brandId: 'brand_mongo' } },
      { store, clock: () => '2026-06-10T05:10:00.000Z', fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!second.body.ok) throw new Error(second.body.error.message);

    const acceptedSecond = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_mongo',
        recordId: second.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-10T05:15:00.000Z',
      },
      { store },
    );
    expect(acceptedSecond.body.ok).toBe(true);
    if (!acceptedSecond.body.ok) throw new Error(acceptedSecond.body.error.message);
    expect(acceptedSecond.body.superseded.map((record) => record.id)).toEqual([first.body.record.id]);

    const latest = await store.getLatestAcceptedProfile({ brandId: 'brand_mongo', userId: 'user_mongo' });
    expect(latest?.identity.brandName.value).toBe('Persistly');

    expect(collections.profiles.indexes.length).toBeGreaterThan(0);
    expect(collections.jobs.indexes.length).toBeGreaterThan(0);
    expect(collections.events.indexes.length).toBeGreaterThan(0);
    expect(collections.events.values().map((event) => event.type)).toEqual(
      expect.arrayContaining(['draft_saved', 'draft_accepted', 'record_superseded']),
    );
  });

  it('keeps accepted profiles isolated by organization in Mongo persistence', async () => {
    const collections = createMemoryCollections();
    const store = createBrandVaultMongoRefineryStore({ collections });

    await store.saveRecord(draftRecord({ id: 'org_a_v1', orgId: 'org_a', name: 'Org A V1', now: '2026-06-10T06:00:00.000Z' }));
    const firstOrgA = await store.acceptDraft('org_a_v1', { now: '2026-06-10T06:01:00.000Z' });
    if (!firstOrgA.ok) throw new Error('Expected first org A accept to succeed.');

    await store.saveRecord(draftRecord({ id: 'org_b_v1', orgId: 'org_b', name: 'Org B V1', now: '2026-06-10T06:02:00.000Z' }));
    const firstOrgB = await store.acceptDraft('org_b_v1', { now: '2026-06-10T06:03:00.000Z' });
    if (!firstOrgB.ok) throw new Error('Expected org B accept to succeed.');

    await store.saveRecord(draftRecord({ id: 'org_a_v2', orgId: 'org_a', name: 'Org A V2', now: '2026-06-10T06:04:00.000Z' }));
    const secondOrgA = await store.acceptDraft('org_a_v2', { now: '2026-06-10T06:05:00.000Z' });

    expect(secondOrgA.ok).toBe(true);
    if (!secondOrgA.ok) throw new Error('Expected second org A accept to succeed.');
    expect(secondOrgA.superseded.map((record) => record.id)).toEqual(['org_a_v1']);
    expect((await store.getRecord('org_b_v1'))?.status).toBe('accepted');
    await store.saveRecord(draftRecord({ id: 'personal_v1', name: 'Personal V1', now: '2026-06-10T06:06:00.000Z' }));
    const personal = await store.acceptDraft('personal_v1', { now: '2026-06-10T06:07:00.000Z' });
    if (!personal.ok) throw new Error('Expected personal accept to succeed.');

    expect((await store.getLatestAcceptedProfile({ orgId: 'org_a', brandId: 'shared_brand', userId: 'shared_user' }))?.identity.brandName.value).toBe('Org A V2');
    expect((await store.getLatestAcceptedProfile({ orgId: 'org_b', brandId: 'shared_brand', userId: 'shared_user' }))?.identity.brandName.value).toBe('Org B V1');
    expect((await store.getLatestAcceptedProfile({ orgId: null, brandId: 'shared_brand', userId: 'shared_user' }))?.identity.brandName.value).toBe('Personal V1');
    await expect(store.listAcceptedBrands({ orgId: 'org_a' })).resolves.toEqual([
      expect.objectContaining({ brandId: 'shared_brand', name: 'Org A V2', recordId: 'org_a_v2', orgId: 'org_a' }),
    ]);
    await expect(store.listAcceptedBrands({ orgId: 'org_b' })).resolves.toEqual([
      expect.objectContaining({ brandId: 'shared_brand', name: 'Org B V1', recordId: 'org_b_v1', orgId: 'org_b' }),
    ]);
    await expect(store.listAcceptedBrands({ orgId: null, userId: 'shared_user' })).resolves.toEqual([
      expect.objectContaining({ brandId: 'shared_brand', name: 'Personal V1', recordId: 'personal_v1', userId: 'shared_user' }),
    ]);
    expect(collections.profiles.values().find((doc) => doc._id === 'personal_v1')?.orgId).toBeUndefined();
    expect(collections.profiles.values().find((doc) => doc._id === 'org_a_v2')?.orgId).toBe('org_a');
    expect(collections.events.values().find((event) => event.recordId === 'org_a_v2' && event.type === 'draft_accepted')?.orgId).toBe('org_a');
    expect(collections.profiles.indexes.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'org_brand_user_status_updatedAt' }),
        expect.objectContaining({ name: 'org_status_updatedAt' }),
      ]),
    );
    expect(collections.events.indexes.flat()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'org_user_createdAt' })]),
    );
  });

  it('distinguishes an unrestricted organization from missing access storage', async () => {
    const configuredCollections = createMemoryCollections();
    const configuredStore = createBrandVaultMongoRefineryStore({ collections: configuredCollections });
    await configuredStore.saveRecord(draftRecord({
      id: 'org_open_v1',
      orgId: 'org_open',
      name: 'Open Org Brand',
      now: '2026-06-10T07:30:00.000Z',
    }));
    const accepted = await configuredStore.acceptDraft('org_open_v1', { now: '2026-06-10T07:31:00.000Z' });
    if (!accepted.ok) throw new Error('Expected the unrestricted organization brand to be accepted.');

    await expect(configuredStore.listAcceptedBrands({ orgId: 'org_open', userId: 'member_1' }))
      .resolves.toEqual([expect.objectContaining({ brandId: 'shared_brand' })]);

    const missingAccessStore = createBrandVaultMongoRefineryStore({
      collections: {
        profiles: configuredCollections.profiles,
        events: configuredCollections.events,
        jobs: configuredCollections.jobs,
      },
    });
    await expect(missingAccessStore.listAcceptedBrands({ orgId: 'org_open', userId: 'member_1' }))
      .rejects.toThrow('organization access storage is unavailable');
    await expect(missingAccessStore.setBrandAccess({
      orgId: 'org_open',
      brandId: 'shared_brand',
      userIds: ['member_1'],
    })).rejects.toThrow('organization access storage is unavailable');
  });

  it('keeps one accepted organization profile across collaborating members', async () => {
    const collections = createMemoryCollections();
    const store = createBrandVaultMongoRefineryStore({ collections });

    await store.saveRecord(draftRecord({ id: 'org_team_a', orgId: 'org_team', userId: 'member_a', name: 'Member A', now: '2026-06-10T08:00:00.000Z' }));
    const first = await store.acceptDraft('org_team_a', { now: '2026-06-10T08:01:00.000Z', actorId: 'member_a' });
    if (!first.ok) throw new Error('Expected the first organization draft to be accepted.');

    await store.saveRecord(draftRecord({ id: 'org_team_b', orgId: 'org_team', userId: 'member_b', name: 'Member B', now: '2026-06-10T08:02:00.000Z' }));
    const second = await store.acceptDraft('org_team_b', { now: '2026-06-10T08:03:00.000Z', actorId: 'member_b' });

    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('Expected the second organization draft to be accepted.');
    expect(second.superseded.map((record) => record.id)).toEqual(['org_team_a']);
    expect((await store.getRecord('org_team_a'))?.status).toBe('superseded');
    expect((await store.getRecord('org_team_b'))?.status).toBe('accepted');
    expect(collections.profiles.indexes.flat()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'accepted_scope_unique', unique: true })]),
    );
  });

  it('rejects a stale product-UI patch after a draft is accepted', async () => {
    const store = createBrandVaultMongoRefineryStore({ collections: createMemoryCollections() });
    const record = draftRecord({ id: 'decode_race', name: 'Decode race', now: '2026-06-10T09:00:00.000Z' });
    await store.saveRecord(record);
    const accepted = await store.acceptDraft(record.id, { now: '2026-06-10T09:01:00.000Z' });
    if (!accepted.ok) throw new Error('Expected the draft to be accepted.');

    await expect(store.patchDraftProductUi({
      recordId: record.id,
      expectedUpdatedAt: record.updatedAt,
      patch: { productUiModelDecodeAttemptedAt: '2026-06-10T09:02:00.000Z' },
    })).resolves.toBeNull();
    expect((await store.getRecord(record.id))?.status).toBe('accepted');
  });

  it('persists review decisions only at the expected draft revision', async () => {
    const store = createBrandVaultMongoRefineryStore({ collections: createMemoryCollections() });
    const record = draftRecord({ id: 'review_revision', name: 'Review revision', now: '2026-06-10T09:05:00.000Z' });
    await store.saveRecord(record);

    const saved = await store.patchDraftReview({
      recordId: record.id,
      expectedUpdatedAt: record.updatedAt,
      patch: {
        decisions: {
          signalEdits: [{ path: 'identity.category', value: 'creative operations platform' }],
          confirmedSignalPaths: ['identity.brandName'],
          deferredConflictPaths: ['identity.proofStyle'],
          savedAt: '2026-06-10T09:06:00.000Z',
          savedBy: 'brand_manager_1',
        },
      },
      options: { now: '2026-06-10T09:06:00.000Z', actorId: 'brand_manager_1' },
    });

    expect(saved?.status).toBe('draft');
    expect(saved?.review.decisions).toMatchObject({
      signalEdits: [{ path: 'identity.category', value: 'creative operations platform' }],
      confirmedSignalPaths: ['identity.brandName'],
      deferredConflictPaths: ['identity.proofStyle'],
      savedBy: 'brand_manager_1',
    });
    await expect(store.patchDraftReview({
      recordId: record.id,
      expectedUpdatedAt: record.updatedAt,
      patch: { decisions: { confirmedSignalPaths: ['identity.category'] } },
    })).resolves.toBeNull();
    expect((await store.getRecord(record.id))?.review.decisions).toEqual(saved?.review.decisions);
  });

  it('returns a controlled conflict when the accepted-scope invariant rejects a concurrent accept', async () => {
    const collections = createMemoryCollections();
    const originalUpdateOne = collections.profiles.updateOne.bind(collections.profiles);
    collections.profiles.updateOne = async (filter, update, options) => {
      if ((update.$set as Partial<BrandVaultMongoProfileDocument> | undefined)?.status === 'accepted') {
        throw Object.assign(new Error('duplicate accepted scope'), { code: 11000 });
      }
      return originalUpdateOne(filter, update, options);
    };
    const store = createBrandVaultMongoRefineryStore({ collections });
    const record = draftRecord({ id: 'accept_conflict', name: 'Accept conflict', now: '2026-06-10T09:10:00.000Z' });
    await store.saveRecord(record);

    await expect(store.acceptDraft(record.id, { now: '2026-06-10T09:11:00.000Z' })).resolves.toMatchObject({
      ok: false,
      code: 'conflict',
    });
    expect((await store.getRecord(record.id))?.status).toBe('draft');
  });

  it('does not let an older draft supersede a newer accepted revision', async () => {
    const store = createBrandVaultMongoRefineryStore({ collections: createMemoryCollections() });
    await store.saveRecord(draftRecord({ id: 'stale_a', name: 'Candidate A', now: '2026-06-10T09:12:00.000Z' }));
    await store.saveRecord(draftRecord({ id: 'stale_b', name: 'Candidate B', now: '2026-06-10T09:13:00.000Z' }));

    const acceptedA = await store.acceptDraft('stale_a', { now: '2026-06-10T09:14:00.000Z' });
    if (!acceptedA.ok) throw new Error('Expected candidate A to be accepted.');
    const staleB = await store.acceptDraft('stale_b', { now: '2026-06-10T09:15:00.000Z' });

    expect(staleB).toMatchObject({ ok: false, code: 'conflict' });
    expect(await store.getRecord('stale_b')).toMatchObject({ status: 'draft', baseAcceptedRevision: null });
    expect((await store.getLatestAcceptedRecord({ brandId: 'shared_brand', userId: 'shared_user' }))?.id).toBe('stale_a');
  });

  it('keeps the prior accepted profile visible when an atomic replacement aborts', async () => {
    let active = createMemoryCollections();
    let rejectReplacement = false;
    const store = createBrandVaultMongoRefineryStore({
      collections: async () => active,
      withTransaction: async (operation) => {
        const staged = await cloneMemoryCollections(active);
        if (rejectReplacement) {
          const updateOne = staged.profiles.updateOne.bind(staged.profiles);
          staged.profiles.updateOne = async (filter, update, options) => {
            if ((update.$set as Partial<BrandVaultMongoProfileDocument> | undefined)?.status === 'accepted') {
              throw Object.assign(new Error('duplicate accepted scope'), { code: 11000 });
            }
            return updateOne(filter, update, options);
          };
        }
        const result = await operation(staged);
        active = staged;
        return result;
      },
    });

    await store.saveRecord(draftRecord({ id: 'atomic_v1', name: 'Atomic V1', now: '2026-06-10T09:20:00.000Z' }));
    const first = await store.acceptDraft('atomic_v1', { now: '2026-06-10T09:21:00.000Z' });
    if (!first.ok) throw new Error('Expected first accepted profile.');
    await store.saveRecord(draftRecord({ id: 'atomic_v2', name: 'Atomic V2', now: '2026-06-10T09:22:00.000Z' }));

    rejectReplacement = true;
    await expect(store.acceptDraft('atomic_v2', { now: '2026-06-10T09:23:00.000Z' })).resolves.toMatchObject({
      ok: false,
      code: 'conflict',
    });

    expect((await store.getLatestAcceptedRecord({ brandId: 'shared_brand', userId: 'shared_user' }))?.id).toBe('atomic_v1');
    expect((await store.getRecord('atomic_v2'))?.status).toBe('draft');
  });

  it('surfaces a pre-stack (null-org) brand for an org member until backfill, org row winning (R5 fallback)', async () => {
    const collections = createMemoryCollections();
    const store = createBrandVaultMongoRefineryStore({ collections });

    // A brand accepted before org-scoping existed: orgId is absent.
    await store.saveRecord(draftRecord({ id: 'legacy_v1', name: 'Legacy Brand', now: '2026-06-10T07:00:00.000Z' }));
    const legacy = await store.acceptDraft('legacy_v1', { now: '2026-06-10T07:01:00.000Z' });
    if (!legacy.ok) throw new Error('Expected legacy accept to succeed.');

    // The user is now in an org with no org-scoped row yet → the legacy brand must not vanish.
    expect((await store.getLatestAcceptedProfile({ orgId: 'org_x', brandId: 'shared_brand', userId: 'shared_user' }))?.identity.brandName.value).toBe('Legacy Brand');
    expect((await store.getLatestAcceptedRecord({ orgId: 'org_x', brandId: 'shared_brand', userId: 'shared_user' }))?.id).toBe('legacy_v1');

    // Once an org-scoped row exists, it wins over the legacy fallback.
    await store.saveRecord(draftRecord({ id: 'org_x_v1', orgId: 'org_x', name: 'Org X V1', now: '2026-06-10T07:02:00.000Z' }));
    const orgX = await store.acceptDraft('org_x_v1', { now: '2026-06-10T07:03:00.000Z' });
    if (!orgX.ok) throw new Error('Expected org X accept to succeed.');
    expect((await store.getLatestAcceptedProfile({ orgId: 'org_x', brandId: 'shared_brand', userId: 'shared_user' }))?.identity.brandName.value).toBe('Org X V1');

    // A different org member (no legacy of their own) sees the org brand, never the first user's legacy.
    expect((await store.getLatestAcceptedProfile({ orgId: 'org_x', brandId: 'shared_brand', userId: 'other_user' }))?.identity.brandName.value).toBe('Org X V1');
  });

  it('lists queued job snapshots by status and cutoff for worker processing', async () => {
    const store = createBrandVaultMongoRefineryStore({ collections: createMemoryCollections() });
    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_old',
        userId: 'user_mongo',
        brandId: 'brand_mongo',
        status: 'queued',
        inputs: { websiteUrl: 'old.example', socialLinks: [] },
        warnings: [],
        createdAt: '2026-06-10T05:00:00.000Z',
        updatedAt: '2026-06-10T05:00:00.000Z',
      },
      candidates: [],
    });
    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_running',
        userId: 'user_mongo',
        brandId: 'brand_mongo',
        status: 'running',
        inputs: { websiteUrl: 'running.example', socialLinks: [] },
        warnings: [],
        createdAt: '2026-06-10T05:01:00.000Z',
        updatedAt: '2026-06-10T05:01:00.000Z',
      },
      candidates: [],
    });
    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_new',
        userId: 'user_mongo',
        brandId: 'brand_mongo',
        status: 'queued',
        inputs: { websiteUrl: 'new.example', socialLinks: [] },
        warnings: [],
        createdAt: '2026-06-10T05:10:00.000Z',
        updatedAt: '2026-06-10T05:10:00.000Z',
      },
      candidates: [],
    });

    const queued = await store.listJobSnapshots({
      statuses: ['queued'],
      updatedBefore: '2026-06-10T05:05:00.000Z',
      limit: 5,
    });

    expect(queued.map((snapshot) => snapshot.job.id)).toEqual(['brand_refinery_job_old']);
  });
  it('lists brand scan snapshots by scoped brand and org newest first', async () => {
    const collections = createMemoryCollections();
    const store = createBrandVaultMongoRefineryStore({ collections });

    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_org_old',
        userId: 'user_mongo',
        orgId: 'org_mongo',
        brandId: 'brand_mongo',
        status: 'needs_review',
        inputs: { websiteUrl: 'old.example', socialLinks: [] },
        warnings: ['old warning'],
        createdAt: '2026-06-10T05:00:00.000Z',
        updatedAt: '2026-06-10T05:00:00.000Z',
      },
      recordId: 'record_old',
      normalizedUrl: 'https://old.example/',
      candidates: [],
    });
    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_org_new',
        userId: 'other_user_same_org',
        orgId: 'org_mongo',
        brandId: 'brand_mongo',
        status: 'accepted',
        inputs: { websiteUrl: 'new.example', socialLinks: [] },
        warnings: [],
        createdAt: '2026-06-10T05:10:00.000Z',
        updatedAt: '2026-06-10T05:10:00.000Z',
      },
      recordId: 'record_new',
      normalizedUrl: 'https://new.example/',
      candidates: [],
    });
    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_other_org',
        userId: 'user_mongo',
        orgId: 'org_other',
        brandId: 'brand_mongo',
        status: 'accepted',
        inputs: { websiteUrl: 'other-org.example', socialLinks: [] },
        warnings: [],
        createdAt: '2026-06-10T05:20:00.000Z',
        updatedAt: '2026-06-10T05:20:00.000Z',
      },
      candidates: [],
    });
    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_other_brand',
        userId: 'user_mongo',
        orgId: 'org_mongo',
        brandId: 'brand_other',
        status: 'accepted',
        inputs: { websiteUrl: 'other-brand.example', socialLinks: [] },
        warnings: [],
        createdAt: '2026-06-10T05:30:00.000Z',
        updatedAt: '2026-06-10T05:30:00.000Z',
      },
      candidates: [],
    });

    const scans = await store.listJobSnapshots({
      orgId: 'org_mongo',
      brandId: 'brand_mongo',
      limit: 10,
      sort: 'updatedAtDesc',
    });

    expect(scans.map((snapshot) => snapshot.job.id)).toEqual([
      'brand_refinery_job_org_new',
      'brand_refinery_job_org_old',
    ]);
    expect(scans[0]?.recordId).toBe('record_new');
    expect(collections.jobs.values().find((doc) => doc._id === 'brand_refinery_job_org_new')?.orgId).toBe('org_mongo');
    expect(JSON.stringify(collections.jobs.indexes)).toContain('org_brand_user_updatedAt');
  });

  it('deletes a scan snapshot only for its owner, never another user\'s or a missing one', async () => {
    const collections = createMemoryCollections();
    const store = createBrandVaultMongoRefineryStore({ collections });

    await store.saveJobSnapshot({
      job: { id: 'job_mine', userId: 'user_mongo', orgId: 'org_mongo', brandId: 'brand_mongo', status: 'needs_review', inputs: { websiteUrl: 'x', socialLinks: [] }, warnings: [], createdAt: '2026-06-10T05:00:00.000Z', updatedAt: '2026-06-10T05:00:00.000Z' },
      recordId: 'rec_mine',
      candidates: [],
    });
    await store.saveJobSnapshot({
      job: { id: 'job_theirs', userId: 'other_user', orgId: 'org_mongo', brandId: 'brand_mongo', status: 'needs_review', inputs: { websiteUrl: 'y', socialLinks: [] }, warnings: [], createdAt: '2026-06-10T05:01:00.000Z', updatedAt: '2026-06-10T05:01:00.000Z' },
      candidates: [],
    });

    // Not the owner -> no delete, snapshot remains.
    expect(await store.deleteJobSnapshot('job_theirs', { userId: 'user_mongo', orgId: 'org_mongo' })).toBe(false);
    expect(await store.getJobSnapshot('job_theirs')).not.toBeNull();

    // Owner -> deleted.
    expect(await store.deleteJobSnapshot('job_mine', { userId: 'user_mongo', orgId: 'org_mongo' })).toBe(true);
    expect(await store.getJobSnapshot('job_mine')).toBeNull();

    // Missing job -> false.
    expect(await store.deleteJobSnapshot('job_nope', { userId: 'user_mongo', orgId: 'org_mongo' })).toBe(false);
  });
});

function draftRecord(input: { id: string; orgId?: string; userId?: string; name: string; now: string }) {
  const profile = deriveBrandSignalProfile(
    {
      brandId: 'shared_brand',
      userId: input.userId ?? 'shared_user',
      orgId: input.orgId,
      name: input.name,
      voice: {
        voiceLock: 'Warm, direct operator voice.',
        nicheMap: 'Agency operators',
        killList: ['cheap'],
        hookArchetypes: ['proof-led hook'],
        structuralHabits: ['open with proof'],
      },
      visual: {
        industry: 'creative operations',
        colors: ['#183047', '#36d399', '#ffffff'],
        visualStyle: 'minimal premium structured high contrast',
        typography: 'Inter, sans-serif',
      },
      learning: { banditProjectCount: 0 },
    },
    { generatedAt: input.now },
  );
  return createBrandSignalProfileDraft(profile, { id: input.id, now: input.now });
}

function htmlResponse(): Response {
  return new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } });
}

function createMemoryCollections(): {
  profiles: MemoryMongoCollection<BrandVaultMongoProfileDocument>;
  events: MemoryMongoCollection<BrandVaultMongoEventDocument>;
  jobs: MemoryMongoCollection<BrandVaultMongoJobDocument>;
  brandAccess: MemoryMongoCollection<BrandVaultMongoBrandAccessDocument>;
} & BrandVaultMongoCollections {
  return {
    profiles: new MemoryMongoCollection<BrandVaultMongoProfileDocument>(),
    events: new MemoryMongoCollection<BrandVaultMongoEventDocument>(),
    jobs: new MemoryMongoCollection<BrandVaultMongoJobDocument>(),
    brandAccess: new MemoryMongoCollection<BrandVaultMongoBrandAccessDocument>(),
  };
}

async function cloneMemoryCollections(
  source: ReturnType<typeof createMemoryCollections>,
): Promise<ReturnType<typeof createMemoryCollections>> {
  const cloned = createMemoryCollections();
  for (const document of source.profiles.values()) {
    await cloned.profiles.updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
  for (const document of source.events.values()) {
    await cloned.events.updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
  for (const document of source.jobs.values()) {
    await cloned.jobs.updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
  for (const document of source.brandAccess.values()) {
    await cloned.brandAccess.updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
  return cloned;
}

class MemoryMongoCollection<TDocument extends { _id: string }> implements BrandVaultMongoCollection<TDocument> {
  readonly indexes: unknown[][] = [];
  private readonly docs = new Map<string, TDocument>();

  async createIndexes(indexes: unknown[]): Promise<void> {
    this.indexes.push(indexes);
  }

  async findOne(filter: Record<string, unknown>): Promise<TDocument | null> {
    return this.values().find((doc) => matchesFilter(doc, filter)) ?? null;
  }

  find(filter: Record<string, unknown>): BrandVaultMongoCursor<TDocument> {
    return new MemoryMongoCursor(this.values().filter((doc) => matchesFilter(doc, filter)));
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: { $set?: Partial<TDocument>; $setOnInsert?: Partial<TDocument> },
    options: { upsert?: boolean } = {},
  ): Promise<void> {
    const existing = this.values().find((doc) => matchesFilter(doc, filter));
    const id = typeof filter._id === 'string' ? filter._id : update.$set?._id ?? update.$setOnInsert?._id;
    if (!existing && !options.upsert) return;
    if (!id) throw new Error('MemoryMongoCollection updateOne requires an _id.');

    if (existing) {
      this.docs.set(existing._id, clone({ ...existing, ...update.$set }));
      return;
    }

    this.docs.set(id, clone({ _id: id, ...update.$setOnInsert, ...update.$set } as TDocument));
  }

  async deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount?: number }> {
    const existing = this.values().find((doc) => matchesFilter(doc, filter));
    if (!existing) return { deletedCount: 0 };
    this.docs.delete(existing._id);
    return { deletedCount: 1 };
  }

  values(): TDocument[] {
    return [...this.docs.values()].map(clone);
  }
}

class MemoryMongoCursor<TDocument> implements BrandVaultMongoCursor<TDocument> {
  constructor(private docs: TDocument[]) {}

  sort(sort: Record<string, 1 | -1>): BrandVaultMongoCursor<TDocument> {
    const [[key, direction]] = Object.entries(sort);
    this.docs = [...this.docs].sort((a, b) => {
      const left = String((a as Record<string, unknown>)[key] ?? '');
      const right = String((b as Record<string, unknown>)[key] ?? '');
      const order = left.localeCompare(right);
      return direction === 1 ? order : -order;
    });
    return this;
  }

  limit(limit: number): BrandVaultMongoCursor<TDocument> {
    this.docs = this.docs.slice(0, limit);
    return this;
  }

  async toArray(): Promise<TDocument[]> {
    return this.docs.map(clone);
  }
}

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => matchesFilterValue(doc[key], value));
}

function matchesFilterValue(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual == null;
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    const operators = expected as Record<string, unknown>;
    if ('$in' in operators) {
      return Array.isArray(operators.$in) && operators.$in.includes(actual);
    }
    if ('$lt' in operators) {
      return String(actual ?? '') < String(operators.$lt ?? '');
    }
  }
  return actual === expected;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
