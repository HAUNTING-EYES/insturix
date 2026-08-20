import { describe, expect, it } from 'vitest';
import {
  createBrandVaultRefineryJobFromWebsite,
  createInMemoryBrandVaultRefineryStore,
  getBrandVaultRefineryJob,
  getBrandVaultSignalProfile,
  processNextPendingProductUiDecode,
  processNextQueuedBrandVaultRefineryJob,
  reviewBrandVaultSignalProfileDraft,
  startQueuedBrandVaultRefineryJobFromWebsite,
  type BrandVaultRefineryStore,
} from '../../lib/shared/brand-vault-refinery-api';
import {
  BRAND_VAULT_DEFAULT_APIFY_ACTORS,
  createBrandVaultConnectedSocialEvidence,
} from '../../lib/shared/brand-vault-connected-social-ingestion';
import { createBrandVaultBrowserFallbackFetchFromEnvironment } from '../../lib/shared/brand-vault-browser-fallback';

const NOW = '2026-06-09T06:00:00.000Z';

const HTML = `
<!doctype html>
<html>
  <head>
    <title>Vaultline - Brand systems for agencies</title>
    <meta name="description" content="Vaultline helps agency teams build trusted brand systems fast.">
    <meta property="og:site_name" content="Vaultline">
    <meta name="theme-color" content="#182433">
    <style>
      :root { --brand: #182433; --accent: #ffcc33; --paper: #ffffff; }
      body { color: #182433; background: #ffffff; font-family: "Inter", sans-serif; }
      button { background: #ffcc33; }
    </style>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Vaultline",
        "description": "Brand operations software for agencies.",
        "logo": "https://vaultline.example/logo.svg"
      }
    </script>
  </head>
  <body>
    <h1>Build client brand systems in minutes</h1>
    <h2>Trusted by fast-moving agency operators</h2>
    <a href="/about">About Vaultline</a>
    <a href="/case-studies">Case studies</a>
    <button>Book a demo</button>
    <blockquote>Trusted by 80 creative teams.</blockquote>
  </body>
</html>
`;

function htmlResponse(status = 200): Response {
  return new Response(status === 200 ? HTML : 'missing', {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

function jsShellResponse(): Response {
  return new Response(
    '<!doctype html><html><head><title>Loading</title></head><body><div id="root"></div><noscript>Please enable JavaScript to view this app.</noscript><script src="/app.js"></script></body></html>',
    {
      status: 200,
      headers: { 'content-type': 'text/html' },
    },
  );
}

function createPromiseBackedStore(): BrandVaultRefineryStore {
  const store = createInMemoryBrandVaultRefineryStore();
  return {
    saveRecord: async (record, options) => store.saveRecord(record, options),
    patchDraftProductUi: async (input) => store.patchDraftProductUi(input),
    patchDraftReview: async (input) => store.patchDraftReview(input),
    getRecord: async (id) => store.getRecord(id),
    acceptDraft: async (id, options) => store.acceptDraft(id, options),
    rejectDraft: async (id, reason, options) => store.rejectDraft(id, reason, options),
    getLatestAcceptedProfile: async (filter) => store.getLatestAcceptedProfile(filter),
    getLatestAcceptedRecord: async (filter) => store.getLatestAcceptedRecord(filter),
    saveJobSnapshot: async (snapshot) => store.saveJobSnapshot(snapshot),
    getJobSnapshot: async (jobId) => store.getJobSnapshot(jobId),
    getJobSnapshotByRecordId: async (recordId) => store.getJobSnapshotByRecordId(recordId),
    updateJobStatusForRecord: async (recordId, status, options) =>
      store.updateJobStatusForRecord(recordId, status, options),
  };
}

describe('Brand Vault refinery API boundary', () => {
  it('queues a refinery job before running slow website and social enrichment work', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    let websiteFetchCount = 0;
    let providerCallCount = 0;

    const started = await startQueuedBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://x.com/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: {
          fetchFn: async () => {
            websiteFetchCount += 1;
            return htmlResponse();
          },
        },
        sourceEvidenceProvider: async ({ orgId }) => {
          expect(orgId).toBe('org_vaultline');
          providerCallCount += 1;
          return { warnings: ['connected social enrichment ran'] };
        },
      },
    );

    expect(started.response.status).toBe(202);
    expect(started.response.body.ok).toBe(true);
    if (!started.response.body.ok) throw new Error(started.response.body.error.message);
    expect(started.response.body.job.status).toBe('queued');
    expect(started.response.body.job.orgId).toBe('org_vaultline');
    expect(started.response.body.record).toBeNull();
    expect(started.response.body.reviewPayload).toBeNull();
    expect(websiteFetchCount).toBe(0);
    expect(providerCallCount).toBe(0);

    const queued = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: started.response.body.job.id },
      { store, clock: () => NOW },
    );
    expect(queued.status).toBe(200);
    expect(queued.body.ok).toBe(true);
    if (!queued.body.ok) throw new Error(queued.body.error.message);
    expect(queued.body.job.status).toBe('queued');
    expect(queued.body.job.orgId).toBe('org_vaultline');
    expect(queued.body.record).toBeNull();

    await started.run?.();
    expect(websiteFetchCount).toBeGreaterThan(0);
    expect(providerCallCount).toBe(1);

    const completed = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: started.response.body.job.id },
      { store },
    );
    expect(completed.status).toBe(200);
    expect(completed.body.ok).toBe(true);
    if (!completed.body.ok) throw new Error(completed.body.error.message);
    expect(completed.body.job.status).toBe('needs_review');
    expect(completed.body.job.orgId).toBe('org_vaultline');
    expect(completed.body.job.id).toBe(started.response.body.job.id);
    expect(completed.body.job.warnings).toContain('connected social enrichment ran');
    expect(completed.body.record?.id).toBe(`${started.response.body.job.id}_profile`);
    expect(completed.body.record?.profile.orgId).toBe('org_vaultline');
    expect(completed.body.reviewPayload?.orgId).toBe('org_vaultline');
    expect(completed.body.reviewPayload?.reviewRequired).toBe(true);
  });

  it('processes a persisted queued refinery job through the reusable queue processor', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    let websiteFetchCount = 0;
    let providerCallCount = 0;

    const started = await startQueuedBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://x.com/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: {
          fetchFn: async () => {
            websiteFetchCount += 1;
            return htmlResponse();
          },
        },
        sourceEvidenceProvider: async ({ orgId }) => {
          expect(orgId).toBe('org_vaultline');
          providerCallCount += 1;
          return { warnings: ['connected social enrichment ran'] };
        },
      },
    );
    expect(started.response.body.ok).toBe(true);
    if (!started.response.body.ok) throw new Error(started.response.body.error.message);
    expect(websiteFetchCount).toBe(0);
    expect(providerCallCount).toBe(0);

    const processed = await processNextQueuedBrandVaultRefineryJob({
      store,
      clock: () => NOW,
      updatedBefore: '2026-06-09T06:00:01.000Z',
      fetchOptions: {
        fetchFn: async () => {
          websiteFetchCount += 1;
          return htmlResponse();
        },
      },
      sourceEvidenceProvider: async ({ orgId }) => {
        expect(orgId).toBe('org_vaultline');
        providerCallCount += 1;
        return { warnings: ['connected social enrichment ran'] };
      },
    });

    expect(processed).toMatchObject({
      processed: true,
      jobId: started.response.body.job.id,
      status: 'needs_review',
    });
    expect(websiteFetchCount).toBeGreaterThan(0);
    expect(providerCallCount).toBe(1);

    const completed = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: started.response.body.job.id },
      { store },
    );
    expect(completed.status).toBe(200);
    expect(completed.body.ok).toBe(true);
    if (!completed.body.ok) throw new Error(completed.body.error.message);
    expect(completed.body.job.status).toBe('needs_review');
    expect(completed.body.job.orgId).toBe('org_vaultline');
    expect(completed.body.record?.id).toBe(`${started.response.body.job.id}_profile`);
    expect(completed.body.record?.profile.orgId).toBe('org_vaultline');
    expect(completed.body.reviewPayload?.orgId).toBe('org_vaultline');
  });

  it('fails malformed persisted queued jobs instead of leaving them running forever', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_missing_website',
        userId: 'user_vault',
        brandId: 'brand_vaultline',
        status: 'queued',
        inputs: {
          socialLinks: [],
        },
        warnings: ['Brand Vault scan queued; refresh or poll this job id for review results.'],
        createdAt: NOW,
        updatedAt: NOW,
      },
      candidates: [],
    });

    const processed = await processNextQueuedBrandVaultRefineryJob({
      store,
      clock: () => NOW,
      updatedBefore: '2026-06-09T06:00:01.000Z',
    });

    expect(processed).toMatchObject({
      processed: true,
      jobId: 'brand_refinery_job_missing_website',
      status: 'failed',
    });
    const failed = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: 'brand_refinery_job_missing_website' },
      { store, clock: () => NOW },
    );
    expect(failed.status).toBe(200);
    expect(failed.body.ok).toBe(true);
    if (!failed.body.ok) throw new Error(failed.body.error.message);
    expect(failed.body.job.status).toBe('failed');
    expect(failed.body.job.warnings).toContain(
      'Brand Vault scan could not run because the queued job is missing websiteUrl.',
    );
  });

  it('marks a queued refinery job failed when the background run crashes', async () => {
    const backingStore = createInMemoryBrandVaultRefineryStore();
    const store: BrandVaultRefineryStore = {
      saveRecord: (record, options) => backingStore.saveRecord(record, options),
      patchDraftProductUi: (input) => backingStore.patchDraftProductUi(input),
      patchDraftReview: (input) => backingStore.patchDraftReview(input),
      getRecord: (id) => backingStore.getRecord(id),
      acceptDraft: (id, options) => backingStore.acceptDraft(id, options),
      rejectDraft: (id, reason, options) => backingStore.rejectDraft(id, reason, options),
      getLatestAcceptedProfile: (filter) => backingStore.getLatestAcceptedProfile(filter),
      getLatestAcceptedRecord: (filter) => backingStore.getLatestAcceptedRecord(filter),
      saveJobSnapshot: (snapshot) => {
        if (snapshot.recordId) throw new Error('mongo write failed');
        return backingStore.saveJobSnapshot(snapshot);
      },
      getJobSnapshot: (jobId) => backingStore.getJobSnapshot(jobId),
      getJobSnapshotByRecordId: (recordId) => backingStore.getJobSnapshotByRecordId(recordId),
      updateJobStatusForRecord: (recordId, status, options) =>
        backingStore.updateJobStatusForRecord(recordId, status, options),
    };
    const started = await startQueuedBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://x.com/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
      },
    );

    expect(started.response.body.ok).toBe(true);
    if (!started.response.body.ok) throw new Error(started.response.body.error.message);
    await expect(started.run?.()).rejects.toThrow('mongo write failed');

    const failed = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: started.response.body.job.id },
      { store },
    );
    expect(failed.status).toBe(200);
    expect(failed.body.ok).toBe(true);
    if (!failed.body.ok) throw new Error(failed.body.error.message);
    expect(failed.body.job.status).toBe('failed');
    expect(failed.body.job.warnings).toEqual(
      expect.arrayContaining([
        'Brand Vault scan failed after it started: mongo write failed',
      ]),
    );
    expect(failed.body.record).toBeNull();
    expect(failed.body.reviewPayload).toBeNull();
  });

  it('marks stale queued and running jobs failed during polling', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const staleNow = '2026-06-09T06:11:00.000Z';
    const started = await startQueuedBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
      },
    );
    expect(started.response.body.ok).toBe(true);
    if (!started.response.body.ok) throw new Error(started.response.body.error.message);

    const failedQueued = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: started.response.body.job.id },
      { store, clock: () => staleNow },
    );
    expect(failedQueued.status).toBe(200);
    expect(failedQueued.body.ok).toBe(true);
    if (!failedQueued.body.ok) throw new Error(failedQueued.body.error.message);
    expect(failedQueued.body.job.status).toBe('failed');
    expect(failedQueued.body.job.warnings).toContain(
      'Brand Vault scan timed out after 10 minutes without progress. Start a new scan to retry.',
    );
    expect(failedQueued.body.record).toBeNull();

    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_running_stale',
        userId: 'user_vault',
        orgId: 'org_vaultline',
        brandId: 'brand_vaultline',
        status: 'running',
        inputs: {
          websiteUrl: 'vaultline.example',
          socialLinks: [],
        },
        warnings: ['Brand Vault scan is running; refresh or poll this job id for review results.'],
        createdAt: NOW,
        updatedAt: NOW,
      },
      candidates: [],
    });
    const failedRunning = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: 'brand_refinery_job_running_stale' },
      { store, clock: () => staleNow },
    );
    expect(failedRunning.status).toBe(200);
    expect(failedRunning.body.ok).toBe(true);
    if (!failedRunning.body.ok) throw new Error(failedRunning.body.error.message);
    expect(failedRunning.body.job.status).toBe('failed');
    expect(failedRunning.body.job.warnings).toContain(
      'Brand Vault scan timed out after 10 minutes without progress. Start a new scan to retry.',
    );
    expect(failedRunning.body.record).toBeNull();
  });

  it('recovers stale running refinery jobs through the queue processor', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const retryNow = '2026-06-09T06:07:00.000Z';
    await store.saveJobSnapshot({
      job: {
        id: 'brand_refinery_job_running_retry',
        userId: 'user_vault',
        orgId: 'org_vaultline',
        brandId: 'brand_vaultline',
        status: 'running',
        inputs: {
          websiteUrl: 'vaultline.example',
          socialLinks: [],
        },
        warnings: ['Brand Vault scan is running; refresh or poll this job id for review results.'],
        createdAt: NOW,
        updatedAt: NOW,
      },
      candidates: [],
    });

    const processed = await processNextQueuedBrandVaultRefineryJob({
      store,
      clock: () => retryNow,
      fetchOptions: { fetchFn: async () => htmlResponse() },
    });

    expect(processed).toMatchObject({
      processed: true,
      jobId: 'brand_refinery_job_running_retry',
      status: 'needs_review',
    });
    const completed = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: 'brand_refinery_job_running_retry' },
      { store, clock: () => retryNow },
    );
    expect(completed.status).toBe(200);
    expect(completed.body.ok).toBe(true);
    if (!completed.body.ok) throw new Error(completed.body.error.message);
    expect(completed.body.job.status).toBe('needs_review');
    expect(completed.body.job.orgId).toBe('org_vaultline');
    expect(completed.body.record?.id).toBe('brand_refinery_job_running_retry_profile');
  });

  it('creates, stores, and reloads a website-derived review draft for the authenticated user', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://x.com/vaultline'],
          sourceEvidence: [
            {
              kind: 'uploaded_guideline',
              name: 'brand-book.pdf',
              note: 'Official tone and color rules.',
              mimeType: 'application/pdf',
              sizeBytes: 512_000,
              text: ['Palette: #abc #182433', 'Voice: direct but calm.', 'Never use lazy stock captions.'].join('\n'),
              dominantColors: ['#abc', '#182433'],
              assetRole: 'brand_book',
            },
            {
              kind: 'crawl_seed',
              url: 'https://vaultline.example/case-studies',
              platform: 'website',
              crawl: { maxPages: 6, maxDepth: 2, excludePaths: ['/privacy'] },
            },
            { kind: 'legacy_brand_intelligence', name: 'legacy-profile-v1', note: 'Existing Brand Intelligence profile.' },
          ],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(created.body.job.status).toBe('needs_review');
    expect(created.body.job.orgId).toBe('org_vaultline');
    expect(created.body.record.profile.orgId).toBe('org_vaultline');
    expect(created.body.reviewPayload.orgId).toBe('org_vaultline');
    expect(created.body.record.review.required).toBe(true);
    expect(created.body.record.profile.identity.brandName.value).toBe('Vaultline');
    expect(created.body.reviewPayload.candidateCount).toBeGreaterThan(0);
    expect(created.body.job.inputs.sourceEvidence).toHaveLength(3);
    expect(created.body.job.inputs.sourceEvidence?.[0]).toMatchObject({
      kind: 'uploaded_guideline',
      name: 'brand-book.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 512_000,
      text: 'Palette: #abc #182433\nVoice: direct but calm.\nNever use lazy stock captions.',
      dominantColors: ['#aabbcc', '#182433'],
      assetRole: 'brand_book',
    });
    expect(created.body.job.inputs.sourceEvidence?.[1]?.crawl).toEqual({ maxPages: 6, maxDepth: 2, excludePaths: ['/privacy'] });
    expect(created.body.job.warnings).toContain('8 additional Brand Vault sources staged for enrichment and evidence review.');
    expect(created.body.job.warnings).toContain('Crawled 6 additional brand pages for draft evidence.');
    expect(created.body.candidates.map((candidate) => candidate.sourceType)).toEqual(
      expect.arrayContaining(['social_profile', 'uploaded_guideline', 'crawl_seed', 'legacy_brand_intelligence']),
    );
    expect(created.body.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'socialLinks.0.socialIdentity',
          normalizedValue: expect.objectContaining({
            platform: 'x',
            handle: 'vaultline',
            accountType: 'profile',
            capability: expect.objectContaining({
              liveFetchStatus: 'adapter_required',
              connectedAccountStatus: 'scope_audit_required',
              publicFallbackStatus: 'review_only',
            }),
          }),
        }),
      ]),
    );
    expect(created.body.candidates.some((candidate) => candidate.extractorId === 'brand-vault-upload-evidence.v1')).toBe(true);
    expect(created.body.candidates.some((candidate) => candidate.sourceField === 'crawl.page')).toBe(true);
    expect(created.body.record.profile.evidence.some((item) => item.sourceType === 'public_social_page')).toBe(false);

    const loaded = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: created.body.job.id },
      { store },
    );

    expect(loaded.status).toBe(200);
    expect(loaded.body.ok).toBe(true);
    if (!loaded.body.ok) throw new Error(loaded.body.error.message);
    expect(loaded.body.job.id).toBe(created.body.job.id);
    expect(loaded.body.job.orgId).toBe('org_vaultline');
    expect(loaded.body.record?.profile.orgId).toBe('org_vaultline');
    expect(loaded.body.reviewPayload?.orgId).toBe('org_vaultline');
    expect(loaded.body.record?.id).toBe(created.body.record.id);
    expect(loaded.body.reviewPayload?.reviewRequired).toBe(true);
    expect(loaded.body.candidates).toHaveLength(created.body.candidates.length);
    expect(loaded.body.job.inputs.sourceEvidence).toHaveLength(3);
  });

  it('preserves mirrored visual previews when API reloads and updates review status', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const visualHtml = HTML.replace('</body>', '<img alt="Vaultline logo" src="/logo.svg"></body>');
    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example', brandId: 'brand_vaultline' } },
      {
        store,
        clock: () => NOW,
        fetchOptions: {
          fetchFn: async (url, init) => {
            const target = String(url);
            if (init?.method === 'HEAD' && target.endsWith('.svg')) {
              return new Response('', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
            }
            return new Response(visualHtml, { status: 200, headers: { 'content-type': 'text/html' } });
          },
        },
        visualAssetStorage: {
          async mirrorAsset(input) {
            return {
              ok: true,
              provider: 'test_r2',
              storageKey: `brandvault/${input.assetId}`,
              publicUrl: `https://cdn.vaultline.example/${input.assetId}`,
              contentType: input.url.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
              sizeBytes: 4096,
              storedAt: NOW,
            };
          },
        },
      },
    );
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);

    const storedLogo = created.body.reviewPayload.visualIdentity.logos[0];
    expect(storedLogo).toMatchObject({
      url: expect.stringMatching(/^https:\/\/cdn\.vaultline\.example\/visual_asset_/),
      originalUrl: 'https://vaultline.example/logo.svg',
      storage: expect.objectContaining({
        status: 'stored',
        provider: 'test_r2',
        originalUrl: 'https://vaultline.example/logo.svg',
      }),
    });

    const loaded = await getBrandVaultRefineryJob(
      { userId: 'user_vault', jobId: created.body.job.id },
      { store },
    );
    expect(loaded.body.ok).toBe(true);
    if (!loaded.body.ok) throw new Error(loaded.body.error.message);
    expect(loaded.body.reviewPayload?.visualIdentity.logos[0]).toEqual(storedLogo);

    const profile = await getBrandVaultSignalProfile(
      { userId: 'user_vault', recordId: created.body.record.id },
      { store },
    );
    expect(profile.body.ok).toBe(true);
    if (!profile.body.ok) throw new Error(profile.body.error.message);
    expect(profile.body.reviewPayload?.visualIdentity.logos[0]).toEqual(storedLogo);

    const accepted = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_vault',
        recordId: created.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-09T06:12:00.000Z',
      },
      { store },
    );
    expect(accepted.body.ok).toBe(true);
    if (!accepted.body.ok) throw new Error(accepted.body.error.message);
    expect(accepted.body.reviewPayload?.visualIdentity.logos[0]).toEqual(storedLogo);
  });

  it('uses configured browser-render fallback evidence when direct website scan only sees a JavaScript shell', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const renderRequests: Array<{ url: string; init?: RequestInit }> = [];
    const browserFallbackFetchFn = createBrandVaultBrowserFallbackFetchFromEnvironment(
      {
        BRAND_VAULT_BROWSER_RENDER_ENDPOINT: 'https://render.example/brand-vault',
        BRAND_VAULT_BROWSER_RENDER_TOKEN: 'render_token',
        BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS: '50',
      },
      async (url, init) => {
        renderRequests.push({ url, init });
        return new Response(
          JSON.stringify({
            finalUrl: 'https://vaultline.example/',
            html: HTML,
            contentType: 'text/html',
            stylesheets: [
              {
                url: 'https://vaultline.example/app.css',
                css: ':root { --brand: #182433; --accent: #ffcc33; }',
                contentType: 'text/css',
              },
            ],
            warnings: ['Render endpoint returned browser-executed HTML.'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    );

    expect(browserFallbackFetchFn).toBeTypeOf('function');
    if (!browserFallbackFetchFn) throw new Error('Expected browser fallback fetcher.');

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: {
          fetchFn: async () => jsShellResponse(),
          browserFallbackFetchFn,
        },
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(renderRequests.length).toBeGreaterThan(0);
    const rootRenderRequest = renderRequests[0];
    expect(rootRenderRequest.url).toBe('https://render.example/brand-vault');
    expect(rootRenderRequest.init?.method).toBe('POST');
    expect(rootRenderRequest.init?.headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer render_token',
        'content-type': 'application/json',
      }),
    );
    expect(JSON.parse(String(rootRenderRequest.init?.body))).toMatchObject({
      url: 'https://vaultline.example/',
      normalizedUrl: 'https://vaultline.example/',
      reason: 'javascript_shell',
      httpStatus: 200,
      userAgent: expect.stringContaining('Chrome'),
    });
    expect(created.body.record.profile.identity.brandName.value).toBe('Vaultline');
    expect(created.body.job.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/browser-rendered fallback evidence/i),
        'Render endpoint returned browser-executed HTML.',
      ]),
    );
    expect(created.body.reviewPayload.warnings).toEqual(
      expect.arrayContaining(['Render endpoint returned browser-executed HTML.']),
    );
  });

  it('turns user-selected pinned social post text into reviewable Brand Vault evidence candidates', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          sourceEvidence: [
            {
              kind: 'social_post',
              url: 'https://www.linkedin.com/posts/vaultline_brand-systems-for-agencies-activity-123',
              platform: 'linkedin',
              pinned: true,
              text: [
                'Stop losing brand consistency between strategy and delivery.',
                'Vaultline gives agency teams one reviewed brand system for every client.',
                'Trusted by 80 creative teams. Book a demo this week.',
                '#BrandOps',
              ].join('\n'),
            },
          ],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(created.body.job.inputs.sourceEvidence?.[0]).toMatchObject({
      kind: 'social_post',
      platform: 'linkedin',
      pinned: true,
    });

    const socialCandidates = created.body.candidates.filter(
      (candidate) => candidate.extractorId === 'brand-vault-social-evidence.v1',
    );
    expect(socialCandidates.map((candidate) => candidate.sourceField)).toEqual(
      expect.arrayContaining([
        'sourceEvidence.0.social_post.socialIdentity',
        'sourceEvidence.0.social_post.text.voicePhrases',
        'sourceEvidence.0.social_post.text.hookArchetypes',
        'sourceEvidence.0.social_post.text.proofStyle',
        'sourceEvidence.0.social_post.text.ctaDirectness',
      ]),
    );
    expect(socialCandidates.find((candidate) => candidate.sourceField.endsWith('.socialIdentity'))?.normalizedValue).toMatchObject({
      platform: 'linkedin',
      accountType: 'post',
      pinned: true,
      capability: {
        evidenceAccess: 'manual_post_text',
        liveFetchStatus: 'adapter_required',
        connectedAccountStatus: 'scope_audit_required',
        publicFallbackStatus: 'review_only',
        pinnedContentStatus: 'manual_selected_pinned',
      },
    });
    expect(socialCandidates.find((candidate) => candidate.sourceField.endsWith('.text.voicePhrases'))?.normalizedValue).toEqual(
      expect.arrayContaining(['Stop losing brand consistency between strategy and delivery', '#BrandOps']),
    );
    expect(socialCandidates.find((candidate) => candidate.sourceField.endsWith('.text.proofStyle'))?.normalizedValue).toBe('community');
    expect(socialCandidates.find((candidate) => candidate.sourceField.endsWith('.text.ctaDirectness'))?.normalizedValue).toBeGreaterThan(0.5);
    expect(created.body.record.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining(['Stop losing brand consistency between strategy and delivery', '#BrandOps']),
    );
    expect(created.body.record.profile.voice.hookArchetypes.value).toEqual(expect.arrayContaining(['statement-led']));
    expect(created.body.record.profile.identity.proofStyle.trustLevel).toBe('public_social_page');
    expect(created.body.record.profile.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'voice.recurringPhrases',
          trustLevel: 'public_social_page',
        }),
      ]),
    );
  });

  it('preserves rich user-supplied social evidence for media, profile, metrics, and connection-aware draft signals', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          sourceEvidence: [
            {
              kind: 'social_post',
              url: 'https://www.instagram.com/p/rich_source/',
              platform: 'instagram',
              pinned: true,
              publishedAt: '2026-06-16T10:00:00.000Z',
              media: {
                mediaType: 'video',
                mediaUrl: 'https://cdn.example.com/rich_source.mp4',
                thumbnailUrl: 'https://cdn.example.com/rich_source.jpg',
                sampledFrameUrls: ['https://cdn.example.com/rich_source_frame_1.jpg'],
                ocrText: 'Stop guessing brand voice from stale decks.',
                transcript: 'Book a demo and build one reviewed brand system before the edit starts.',
                durationSeconds: 42.5,
              },
              metrics: {
                likeCount: 44,
                commentCount: 6,
                shareCount: 3,
                viewCount: 1200,
                engagementCount: 53,
              },
              profile: {
                bio: 'Brand operations software for agency teams.',
                category: 'Software',
                website: 'https://vaultline.example',
                followerCount: 8200,
              },
              evidenceOrigin: 'user_supplied',
              connection: {
                provider: 'alyzitron_apify',
                status: 'public_fallback_available',
                accountHandle: 'vaultline',
                scopes: ['public'],
                missingScopes: [],
                canReadProfile: true,
                canReadPosts: true,
                canReadPinned: false,
                matchStatus: 'matched',
              },
            },
          ],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(created.body.job.inputs.sourceEvidence?.[0]).toMatchObject({
      kind: 'social_post',
      platform: 'instagram',
      pinned: true,
      publishedAt: '2026-06-16T10:00:00.000Z',
      media: {
        mediaType: 'video',
        mediaUrl: 'https://cdn.example.com/rich_source.mp4',
        thumbnailUrl: 'https://cdn.example.com/rich_source.jpg',
        sampledFrameUrls: ['https://cdn.example.com/rich_source_frame_1.jpg'],
        ocrText: 'Stop guessing brand voice from stale decks.',
        transcript: 'Book a demo and build one reviewed brand system before the edit starts.',
        durationSeconds: 42.5,
      },
      metrics: {
        likeCount: 44,
        commentCount: 6,
        shareCount: 3,
        viewCount: 1200,
        engagementCount: 53,
      },
      profile: {
        bio: 'Brand operations software for agency teams.',
        category: 'Software',
        website: 'https://vaultline.example',
        followerCount: 8200,
      },
      evidenceOrigin: 'user_supplied',
      connection: {
        provider: 'alyzitron_apify',
        status: 'public_fallback_available',
        accountHandle: 'vaultline',
        scopes: ['public'],
        missingScopes: [],
        canReadProfile: true,
        canReadPosts: true,
        canReadPinned: false,
        matchStatus: 'matched',
      },
    });

    const socialCandidates = created.body.candidates.filter(
      (candidate) => candidate.extractorId === 'brand-vault-social-evidence.v1',
    );
    expect(socialCandidates.find((candidate) => candidate.sourceField.endsWith('.socialIdentity'))?.normalizedValue).toMatchObject({
      platform: 'instagram',
      media: expect.objectContaining({ mediaType: 'video' }),
      metrics: expect.objectContaining({ engagementCount: 53 }),
      profile: expect.objectContaining({ category: 'Software' }),
      evidenceOrigin: 'user_supplied',
      connection: expect.objectContaining({
        provider: 'alyzitron_apify',
        status: 'public_fallback_available',
        matchStatus: 'matched',
      }),
      capability: {
        evidenceAccess: 'post_url_only',
        liveFetchStatus: 'public_fallback_available',
        connectedAccountStatus: 'not_connected',
        publicFallbackStatus: 'review_only',
        pinnedContentStatus: 'manual_selected_pinned',
      },
    });
    expect(socialCandidates.find((candidate) => candidate.sourceField.endsWith('.text.voicePhrases'))?.rawValue).toMatchObject({
      value: expect.stringContaining('Stop guessing brand voice from stale decks'),
      media: expect.objectContaining({ transcript: expect.stringContaining('Book a demo') }),
      metrics: expect.objectContaining({ engagementCount: 53 }),
      profile: expect.objectContaining({ bio: 'Brand operations software for agency teams.' }),
      evidenceOrigin: 'user_supplied',
    });
    expect(created.body.record.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining(['Stop guessing brand voice from stale decks']),
    );
  });

  it('lets Brand Vault-owned providers add connected social capability evidence without accepting it as profile truth', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://x.com/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        sourceEvidenceProvider: async ({ socialLinks }) => ({
          warnings: ['Connected X account metadata was added from UploaderX.'],
          sourceEvidence: [
            {
              kind: 'social_profile',
              url: socialLinks[0],
              platform: 'x',
              name: '@vaultline',
              note: 'Existing UploaderX X connection can read authored posts.',
              connection: {
                provider: 'uploaderx',
                status: 'connected',
                accountId: 'x_123',
                accountName: 'Vaultline',
                accountHandle: 'vaultline',
                scopes: ['tweet.read', 'users.read'],
                missingScopes: [],
                canReadProfile: true,
                canReadPosts: true,
                canReadPinned: true,
                matchStatus: 'matched',
              },
            },
          ],
        }),
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(created.body.job.inputs.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_profile',
          platform: 'x',
          connection: expect.objectContaining({
            provider: 'uploaderx',
            status: 'connected',
            canReadPosts: true,
            canReadPinned: true,
          }),
        }),
      ]),
    );
    expect(created.body.job.warnings).toContain('Connected X account metadata was added from UploaderX.');
    expect(created.body.reviewPayload.warnings).toContain('Connected X account metadata was added from UploaderX.');
    expect(created.body.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.0.social_profile.socialIdentity',
          normalizedValue: expect.objectContaining({
            capability: {
              evidenceAccess: 'connected_post_read_possible',
              liveFetchStatus: 'available_with_connected_account',
              connectedAccountStatus: 'connected',
              publicFallbackStatus: 'review_only',
              pinnedContentStatus: 'platform_pinned_supported',
            },
            connection: expect.objectContaining({
              provider: 'uploaderx',
              matchStatus: 'matched',
            }),
          }),
        }),
      ]),
    );
    expect(created.body.record.profile.evidence.some((item) => item.sourceType === 'connected_social_account')).toBe(false);
  });

  it('labels Apify public fallback social evidence separately from connected evidence', async () => {
    const fetchedUrls: string[] = [];
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/vaultline'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { instagram: 'apify/instagram-scraper' },
      fetchFn: async (url, init) => {
        fetchedUrls.push(url);
        expect(url).toContain('https://api.apify.com/v2/acts/');
        expect(url).toContain('run-sync-get-dataset-items');
        expect(url).toContain('token=apify_key');
        expect(init?.method).toBe('POST');
        return new Response(
          JSON.stringify([
            {
              url: 'https://www.instagram.com/p/apify_1/',
              caption: 'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams. Book a demo.',
              type: 'Video',
              videoUrl: 'https://cdn.example/video.mp4',
              thumbnailUrl: 'https://cdn.example/thumb.jpg',
              likesCount: 120,
              commentsCount: 8,
              ownerUsername: 'vaultline',
              ownerFullName: 'Vaultline',
              biography: 'Brand operations software for agencies.',
              followersCount: 4400,
              timestamp: '2026-06-08T10:00:00.000Z',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
      now: NOW,
    });

    expect(fetchedUrls).toHaveLength(1);
    expect(result.sourceEvidence).toEqual([
      expect.objectContaining({
        kind: 'social_profile',
        platform: 'instagram',
        evidenceOrigin: 'public_fallback',
        connection: expect.objectContaining({
          provider: 'alyzitron_apify',
          status: 'public_fallback_available',
        }),
      }),
      expect.objectContaining({
        kind: 'social_post',
        platform: 'instagram',
        evidenceOrigin: 'public_fallback',
        url: 'https://www.instagram.com/p/apify_1/',
        text: 'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams. Book a demo.',
        publishedAt: '2026-06-08T10:00:00.000Z',
        media: expect.objectContaining({
          mediaType: 'video',
          mediaUrl: 'https://cdn.example/video.mp4',
          thumbnailUrl: 'https://cdn.example/thumb.jpg',
        }),
        metrics: expect.objectContaining({
          likeCount: 120,
          commentCount: 8,
          engagementCount: 128,
        }),
        profile: expect.objectContaining({
          bio: 'Brand operations software for agencies.',
          followerCount: 4400,
        }),
      }),
    ]);
    expect(result.warnings).toContain('Brand Vault fetched 1 instagram public Apify item for review-only social evidence.');
    expect(result.warnings).toContain('Brand Vault staged 2 public social fallback sources for review-only enrichment.');
    expect(result.warnings.some((warning) => /connected social evidence source/.test(warning))).toBe(false);
  });

  it('does not spend on Apify when the submitted account matches an existing UploaderX connection', async () => {
    const fetchedUrls: string[] = [];
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/vaultline'],
      uploaderXUser: {
        instagramTokens: {
          userAccessToken: 'ig_token',
          userName: 'vaultline',
          accounts: [{ instagramUsername: 'vaultline', instagramAccountId: 'ig_account_1' }],
        },
      },
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { instagram: 'apify/instagram-scraper' },
      fetchFn: async (url) => {
        fetchedUrls.push(url);
        expect(url).toContain('https://graph.instagram.com/v21.0/me/media');
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
      now: NOW,
    });

    expect(fetchedUrls).toHaveLength(1);
    expect(fetchedUrls[0]).toContain('graph.instagram.com');
    expect(fetchedUrls.some((url) => url.includes('api.apify.com'))).toBe(false);
    expect(result.sourceEvidence).toEqual([
      expect.objectContaining({
        kind: 'social_profile',
        platform: 'instagram',
        evidenceOrigin: 'connected_metadata',
        connection: expect.objectContaining({
          provider: 'uploaderx',
          status: 'connected',
          accountHandle: 'vaultline',
          matchStatus: 'matched',
        }),
      }),
    ]);
    expect(result.warnings).toContain('Brand Vault added 1 connected social evidence source from existing platform integrations.');
    expect(result.warnings.some((warning) => /Apify/i.test(warning))).toBe(false);
  });

  it('uses the selected LinkedIn Apify actor shape for unmatched company pages', async () => {
    const fetchedUrls: string[] = [];
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.linkedin.com/company/vaultline/'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: BRAND_VAULT_DEFAULT_APIFY_ACTORS,
      fetchFn: async (url, init) => {
        fetchedUrls.push(url);
        expect(url).toContain('atomus%2Flinkedin-posts-scraper-pro');
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          companies: ['https://www.linkedin.com/company/vaultline/'],
          profiles: [],
          maxPosts: 5,
          contentType: 'all',
          includeSharedPosts: true,
          includeReposts: true,
        });
        return new Response(
          JSON.stringify([
            {
              type: 'post',
              content: 'Brand systems should stay consistent from strategy to delivery.',
              post_url: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
              posted_at: '2026-06-08T10:00:00.000Z',
              images: ['https://media.licdn.com/image.jpg'],
              engagement: {
                total_reactions: 12,
                comments: 3,
                shares: 2,
              },
              author: {
                name: 'Vaultline',
                username: 'vaultline',
                headline: 'Brand operations software for agencies.',
                website_url: 'https://vaultline.example',
              },
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
      now: NOW,
    });

    expect(fetchedUrls).toHaveLength(1);
    expect(result.sourceEvidence).toEqual([
      expect.objectContaining({
        kind: 'social_profile',
        platform: 'linkedin',
        evidenceOrigin: 'public_fallback',
      }),
      expect.objectContaining({
        kind: 'social_post',
        platform: 'linkedin',
        evidenceOrigin: 'public_fallback',
        url: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
        text: 'Brand systems should stay consistent from strategy to delivery.',
        publishedAt: '2026-06-08T10:00:00.000Z',
        media: expect.objectContaining({
          mediaType: 'image',
          mediaUrl: 'https://media.licdn.com/image.jpg',
          thumbnailUrl: 'https://media.licdn.com/image.jpg',
        }),
        metrics: expect.objectContaining({
          likeCount: 12,
          commentCount: 3,
          shareCount: 2,
          engagementCount: 17,
        }),
        profile: expect.objectContaining({
          bio: 'Brand operations software for agencies.',
          website: 'https://vaultline.example',
        }),
      }),
    ]);
    expect(result.warnings).toContain('Brand Vault fetched 1 linkedin public Apify item for review-only social evidence.');
  });

  it('uses free public oEmbed for supported social post URLs when no connected account is available', async () => {
    const fetchedUrls: string[] = [];
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.youtube.com/watch?v=video_1'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: '',
      fetchFn: async (url) => {
        fetchedUrls.push(url);
        if (!url.includes('/oembed')) {
          return new Response(
            `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify({
              videoDetails: {
                title: 'Brand systems launch walkthrough',
                author: 'Vaultline',
                shortDescription: 'A practical walkthrough for building one reviewed brand system.',
                lengthSeconds: '120',
                viewCount: '900',
                thumbnail: {
                  thumbnails: [{ url: 'https://i.ytimg.com/vi/video_1/hqdefault.jpg' }],
                },
              },
              microformat: {
                playerMicroformatRenderer: {
                  publishDate: '2026-06-16',
                  category: 'Software',
                },
              },
            })};</script></body></html>`,
            { status: 200, headers: { 'content-type': 'text/html' } },
          );
        }
        return new Response(
          JSON.stringify({
            title: 'Brand systems launch walkthrough',
            author_name: 'Vaultline',
            thumbnail_url: 'https://i.ytimg.com/vi/video_1/hqdefault.jpg',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
      now: NOW,
    });

    expect(fetchedUrls).toHaveLength(2);
    expect(fetchedUrls[0]).toContain('https://www.youtube.com/oembed');
    expect(fetchedUrls[1]).toBe('https://www.youtube.com/watch?v=video_1');
    expect(result.sourceEvidence).toEqual([
      expect.objectContaining({
        kind: 'social_post',
        platform: 'youtube',
        evidenceOrigin: 'public_fallback',
        publishedAt: '2026-06-16',
        text: 'Brand systems launch walkthrough\nA practical walkthrough for building one reviewed brand system.',
        media: expect.objectContaining({
          mediaType: 'video',
          thumbnailUrl: 'https://i.ytimg.com/vi/video_1/hqdefault.jpg',
          durationSeconds: 120,
        }),
        metrics: expect.objectContaining({
          viewCount: 900,
        }),
        profile: expect.objectContaining({
          bio: 'Vaultline',
          category: 'Software',
        }),
      }),
    ]);
    expect(result.warnings).toContain('Brand Vault fetched youtube public oEmbed and watch metadata as review-only social evidence.');
  });

  it('fetches connected Instagram media items as draft-only social evidence', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string): Promise<Response> => {
      fetchedUrls.push(url);
      expect(url).toContain('https://graph.instagram.com/v21.0/me/media');
      expect(url).toContain('access_token=ig_token');
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'ig_media_1',
              caption: 'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams. Book a demo.',
              media_type: 'IMAGE',
              permalink: 'https://www.instagram.com/p/ig_media_1/',
              timestamp: '2026-06-08T10:00:00.000Z',
              username: 'vaultline',
            },
            {
              id: 'ig_media_without_caption',
              media_type: 'VIDEO',
              permalink: 'https://www.instagram.com/p/ig_media_without_caption/',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://www.instagram.com/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        sourceEvidenceProvider: async ({ socialLinks }) =>
          createBrandVaultConnectedSocialEvidence({
            socialLinks,
            uploaderXUser: {
              instagramTokens: {
                userAccessToken: 'ig_token',
                userName: 'vaultline',
                accounts: [{ instagramAccountId: 'ig_account_1', instagramUsername: 'vaultline' }],
                expiresAt: '2026-06-10T00:00:00.000Z',
              },
            },
            youtubeConnection: null,
            apifyApiKey: '',
            fetchFn,
            now: NOW,
          }),
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(fetchedUrls).toHaveLength(1);
    expect(created.body.job.warnings).toContain('Brand Vault fetched 1 recent Instagram media item for draft social evidence review.');
    expect(created.body.job.warnings).not.toContain(
      'Social links without connected post evidence were staged for review; connect read scopes or add pinned posts for richer social language.',
    );
    expect(created.body.reviewPayload.intake.social).toMatchObject({
      status: 'complete',
      linksProvided: 1,
      connectedAccountCount: 2,
      fetchedPostCount: 1,
      needsAuthCount: 0,
    });
    expect(created.body.reviewPayload.intake.sources.byOrigin).toMatchObject({
      connected_metadata: 1,
      connected_fetch: 1,
    });
    expect(created.body.job.inputs.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_profile',
          platform: 'instagram',
          evidenceOrigin: 'connected_metadata',
          connection: expect.objectContaining({
            provider: 'uploaderx',
            status: 'connected',
            accountHandle: 'vaultline',
            canReadPosts: true,
          }),
        }),
        expect.objectContaining({
          kind: 'social_post',
          platform: 'instagram',
          url: 'https://www.instagram.com/p/ig_media_1/',
          text: 'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams. Book a demo.',
          evidenceOrigin: 'connected_fetch',
        }),
      ]),
    );
    expect(created.body.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.text.voicePhrases',
          normalizedValue: expect.arrayContaining(['Stop losing brand consistency between strategy and delivery']),
        }),
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.text.proofStyle',
          normalizedValue: 'community',
        }),
      ]),
    );
    expect(created.body.record.profile.voice.recurringPhrases.trustLevel).toBe('connected_social_account');
    expect(created.body.record.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining(['Stop losing brand consistency between strategy and delivery']),
    );
  });

  it('fetches connected Facebook page posts as draft-only social evidence', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string): Promise<Response> => {
      fetchedUrls.push(url);
      expect(url).toContain('https://graph.facebook.com/v21.0/page_1/feed');
      expect(url).toContain('access_token=page_token');
      expect(url).toContain('fields=');
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'page_1_post_1',
              message: 'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams. Book a demo.',
              story: 'Vaultline shared a launch update.',
              permalink_url: 'https://www.facebook.com/vaultline/posts/page_1_post_1',
              created_time: '2026-06-08T10:00:00.000Z',
              attachments: {
                data: [
                  {
                    title: 'Brand operations for agencies',
                    description: 'One reviewed brand system before the edit starts.',
                  },
                ],
              },
            },
            {
              id: 'page_1_post_without_text',
              permalink_url: 'https://www.facebook.com/vaultline/posts/page_1_post_without_text',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://www.facebook.com/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        sourceEvidenceProvider: async ({ socialLinks }) =>
          createBrandVaultConnectedSocialEvidence({
            socialLinks,
            uploaderXUser: {
              facebookTokens: {
                userAccessToken: 'fb_user_token',
                userId: 'fb_user_1',
                userName: 'Vaultline Admin',
                pages: [{ pageId: 'page_1', pageName: 'Vaultline', pageAccessToken: 'page_token' }],
                expiresAt: '2026-06-10T00:00:00.000Z',
              },
            },
            youtubeConnection: null,
            apifyApiKey: '',
            fetchFn,
            now: NOW,
          }),
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(fetchedUrls).toHaveLength(1);
    expect(created.body.job.warnings).toContain('Brand Vault fetched 1 recent Facebook page post for draft social evidence review.');
    expect(created.body.job.warnings).not.toContain(
      'Social links without connected post evidence were staged for review; connect read scopes or add pinned posts for richer social language.',
    );
    expect(created.body.reviewPayload.intake.social).toMatchObject({
      status: 'complete',
      linksProvided: 1,
      connectedAccountCount: 2,
      fetchedPostCount: 1,
      needsAuthCount: 0,
    });
    expect(created.body.reviewPayload.intake.sources.byOrigin).toMatchObject({
      connected_metadata: 1,
      connected_fetch: 1,
    });
    expect(created.body.job.inputs.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_profile',
          platform: 'facebook',
          evidenceOrigin: 'connected_metadata',
          connection: expect.objectContaining({
            provider: 'uploaderx',
            status: 'connected',
            accountName: 'Vaultline',
            canReadPosts: true,
          }),
        }),
        expect.objectContaining({
          kind: 'social_post',
          platform: 'facebook',
          url: 'https://www.facebook.com/vaultline/posts/page_1_post_1',
          text: [
            'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams. Book a demo.',
            'Vaultline shared a launch update.',
            'Brand operations for agencies',
            'One reviewed brand system before the edit starts.',
          ].join('\n'),
          evidenceOrigin: 'connected_fetch',
        }),
      ]),
    );
    expect(created.body.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.text.voicePhrases',
          normalizedValue: expect.arrayContaining(['Stop losing brand consistency between strategy and delivery']),
        }),
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.text.proofStyle',
          normalizedValue: 'community',
        }),
      ]),
    );
    expect(created.body.record.profile.voice.recurringPhrases.trustLevel).toBe('connected_social_account');
    expect(created.body.record.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining(['Stop losing brand consistency between strategy and delivery']),
    );
  });

  it('fetches connected LinkedIn organization posts only when read scope is present', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
      fetchedUrls.push(url);
      expect(url).toContain('https://api.linkedin.com/rest/posts');
      expect(url).toContain('q=author');
      expect(url).toContain('urn%3Ali%3Aorganization%3Aorg_1');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer linkedin_token',
        'Linkedin-Version': '202506',
        'X-Restli-Protocol-Version': '2.0.0',
      });
      return new Response(
        JSON.stringify({
          elements: [
            {
              id: 'urn:li:share:123',
              commentary: 'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams. Book a demo.',
              content: {
                article: {
                  title: 'Brand operations for agencies',
                  description: 'One reviewed brand system before the edit starts.',
                },
              },
            },
            {
              id: 'urn:li:share:no_text',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://www.linkedin.com/company/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        sourceEvidenceProvider: async ({ socialLinks }) =>
          createBrandVaultConnectedSocialEvidence({
            socialLinks,
            uploaderXUser: {
              linkedinTokens: {
                accessToken: 'linkedin_token',
                userId: 'person_1',
                userName: 'Vaultline Admin',
                scopes: ['openid', 'profile', 'w_member_social', 'r_organization_social'],
                missingScopes: [],
                organizations: [{ id: 'org_1', name: 'Vaultline', vanityName: 'vaultline' }],
                expiresAt: '2026-06-10T00:00:00.000Z',
              },
            },
            youtubeConnection: null,
            apifyApiKey: '',
            fetchFn,
            now: NOW,
          }),
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(fetchedUrls).toHaveLength(1);
    expect(created.body.job.warnings).toContain('Brand Vault fetched 1 recent LinkedIn post for draft social evidence review.');
    expect(created.body.job.warnings).not.toContain(
      'Social links without connected post evidence were staged for review; connect read scopes or add pinned posts for richer social language.',
    );
    expect(created.body.reviewPayload.intake.sources.byOrigin).toMatchObject({
      connected_metadata: 1,
      connected_fetch: 1,
    });
    expect(created.body.job.inputs.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_profile',
          platform: 'linkedin',
          evidenceOrigin: 'connected_metadata',
          connection: expect.objectContaining({
            provider: 'uploaderx',
            status: 'connected',
            accountId: 'org_1',
            accountName: 'Vaultline',
            accountHandle: 'vaultline',
            canReadPosts: true,
          }),
        }),
        expect.objectContaining({
          kind: 'social_post',
          platform: 'linkedin',
          url: 'https://www.linkedin.com/feed/update/urn:li:share:123',
          text: [
            'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams. Book a demo.',
            'Brand operations for agencies',
            'One reviewed brand system before the edit starts.',
          ].join('\n'),
          evidenceOrigin: 'connected_fetch',
        }),
      ]),
    );
    expect(created.body.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.text.voicePhrases',
          normalizedValue: expect.arrayContaining(['Stop losing brand consistency between strategy and delivery']),
        }),
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.text.proofStyle',
          normalizedValue: 'community',
        }),
      ]),
    );
    expect(created.body.record.profile.voice.recurringPhrases.trustLevel).toBe('connected_social_account');
  });

  it('stages explicit LinkedIn and Facebook post URLs as public metadata fallback evidence', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string): Promise<Response> => {
      fetchedUrls.push(url);
      if (url.includes('linkedin.com')) {
        return new Response(
          [
            '<html><head>',
            '<meta property="og:title" content="Vaultline launch note">',
            '<meta property="og:description" content="Stop losing brand consistency between strategy and delivery. Book a demo this week.">',
            '</head></html>',
          ].join(''),
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      return new Response(
        [
          '<html><head>',
          '<meta property="og:title" content="Facebook agency proof">',
          '<meta name="description" content="Trusted by 80 creative teams &amp; built for brand operations.">',
          '</head></html>',
        ].join(''),
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    };

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: [
            'https://www.linkedin.com/posts/vaultline_brand-systems-for-agencies-activity-123',
            'https://www.facebook.com/posts/page_1_post_1',
          ],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        sourceEvidenceProvider: async ({ socialLinks }) =>
          createBrandVaultConnectedSocialEvidence({
            socialLinks,
            uploaderXUser: null,
            youtubeConnection: null,
            apifyApiKey: '',
            fetchFn,
            now: NOW,
          }),
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(fetchedUrls).toHaveLength(2);
    expect(created.body.job.warnings).toEqual(
      expect.arrayContaining([
        'Brand Vault fetched public metadata for linkedin post URL as draft-only evidence.',
        'Brand Vault fetched public metadata for facebook post URL as draft-only evidence.',
        'Brand Vault staged 2 public social fallback sources for review-only enrichment.',
      ]),
    );
    expect(created.body.reviewPayload.intake.sources.byOrigin).toMatchObject({
      public_fallback: 2,
    });
    expect(created.body.job.inputs.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_post',
          platform: 'linkedin',
          evidenceOrigin: 'public_fallback',
          text: [
            'Vaultline launch note',
            'Stop losing brand consistency between strategy and delivery. Book a demo this week.',
          ].join('\n'),
        }),
        expect.objectContaining({
          kind: 'social_post',
          platform: 'facebook',
          evidenceOrigin: 'public_fallback',
          text: [
            'Facebook agency proof',
            'Trusted by 80 creative teams & built for brand operations.',
          ].join('\n'),
        }),
      ]),
    );
    const socialCandidates = created.body.candidates.filter(
      (candidate) => candidate.extractorId === 'brand-vault-social-evidence.v1',
    );
    expect(socialCandidates.map((candidate) => candidate.sourceField)).toEqual(
      expect.arrayContaining([
        'sourceEvidence.0.social_post.socialIdentity',
        'sourceEvidence.0.social_post.text.voicePhrases',
        'sourceEvidence.0.social_post.text.ctaDirectness',
        'sourceEvidence.1.social_post.socialIdentity',
        'sourceEvidence.1.social_post.text.proofStyle',
      ]),
    );
    expect(socialCandidates.some((candidate) => candidate.signalPath === 'voice.recurringPhrases')).toBe(true);
    expect(socialCandidates.some((candidate) => candidate.signalPath === 'identity.proofStyle')).toBe(true);
  });

  it('fetches connected X post samples as draft-only social evidence when tweet.read is available', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
      fetchedUrls.push(url);
      expect(init?.headers).toEqual({ Authorization: 'Bearer token_x' });
      if (url.includes('/2/users/me')) {
        return new Response(
          JSON.stringify({
            data: { id: 'x_123', username: 'vaultline' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'tweet_1',
              text: 'Stop losing brand consistency between strategy and delivery. Book a demo this week.',
              created_at: '2026-06-08T10:00:00.000Z',
              public_metrics: { like_count: 12, reply_count: 2, retweet_count: 3, quote_count: 1 },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://x.com/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        sourceEvidenceProvider: async ({ socialLinks }) =>
          createBrandVaultConnectedSocialEvidence({
            socialLinks,
            uploaderXUser: {
              twitterTokens: {
                accessToken: 'token_x',
                userId: 'x_123',
                userName: 'vaultline',
                scopes: ['tweet.read', 'users.read'],
                missingScopes: [],
                expiresAt: '2026-06-10T00:00:00.000Z',
              },
            },
            youtubeConnection: null,
            apifyApiKey: '',
            fetchFn,
            now: NOW,
          }),
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(fetchedUrls).toHaveLength(2);
    expect(fetchedUrls[0]).toContain('https://api.x.com/2/users/me');
    expect(fetchedUrls[1]).toContain('https://api.x.com/2/users/x_123/tweets');
    expect(created.body.job.warnings).toContain('Brand Vault fetched 1 recent X post for draft social evidence review.');
    expect(created.body.job.warnings).not.toContain(
      'Social links without connected post evidence were staged for review; connect read scopes or add pinned posts for richer social language.',
    );
    expect(created.body.reviewPayload.intake.social).toMatchObject({
      status: 'complete',
      linksProvided: 1,
      connectedAccountCount: 2,
      fetchedPostCount: 1,
      needsAuthCount: 0,
    });
    expect(created.body.reviewPayload.intake.sources.byOrigin).toMatchObject({
      connected_metadata: 1,
      connected_fetch: 1,
    });
    expect(created.body.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'social')).toMatchObject({
      status: 'complete',
      sourceCount: 2,
    });
    expect(created.body.reviewPayload.intake.nextActions.map((action) => action.id)).not.toEqual(
      expect.arrayContaining(['connect_social', 'add_pinned_posts']),
    );
    expect(created.body.job.inputs.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_post',
          platform: 'x',
          text: 'Stop losing brand consistency between strategy and delivery. Book a demo this week.',
          evidenceOrigin: 'connected_fetch',
          connection: expect.objectContaining({
            provider: 'uploaderx',
            status: 'connected',
            canReadPosts: true,
          }),
        }),
      ]),
    );
    expect(created.body.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.socialIdentity',
          normalizedValue: expect.objectContaining({
            evidenceOrigin: 'connected_fetch',
            capability: {
              evidenceAccess: 'connected_post_sample',
              liveFetchStatus: 'available_with_connected_account',
              connectedAccountStatus: 'connected',
              publicFallbackStatus: 'review_only',
              pinnedContentStatus: 'platform_pinned_supported',
            },
          }),
        }),
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.text.ctaDirectness',
          normalizedValue: expect.any(Number),
        }),
      ]),
    );
    expect(created.body.record.profile.evidence.some((item) => String(item.sourceType) === 'connected_social_post')).toBe(false);
    expect(created.body.record.profile.voice.recurringPhrases.trustLevel).toBe('connected_social_account');
    expect(created.body.record.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining(['Stop losing brand consistency between strategy and delivery']),
    );
    expect(created.body.record.profile.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'voice.recurringPhrases',
          trustLevel: 'connected_social_account',
        }),
      ]),
    );
  });

  it('fetches connected X pinned posts as stronger draft-only social language evidence', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
      fetchedUrls.push(url);
      expect(init?.headers).toEqual({ Authorization: 'Bearer token_x' });
      if (url.includes('/2/users/me')) {
        return new Response(
          JSON.stringify({
            data: { id: 'x_123', username: 'vaultline', pinned_tweet_id: 'tweet_pin' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/2/tweets/tweet_pin')) {
        return new Response(
          JSON.stringify({
            data: {
              id: 'tweet_pin',
              text: 'Stop guessing brand voice from stale decks. Build one reviewed brand system before the edit starts. Trusted by 80 creative teams. Book a demo.',
              created_at: '2026-06-08T09:00:00.000Z',
              public_metrics: { like_count: 44, reply_count: 6, retweet_count: 9, quote_count: 2 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'tweet_1',
              text: 'One brand system should guide the brief, the edit, and the final client review. Try Vaultline this week.',
              created_at: '2026-06-08T10:00:00.000Z',
              public_metrics: { like_count: 12, reply_count: 2, retweet_count: 3, quote_count: 1 },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        orgId: 'org_vaultline',
        body: {
          websiteUrl: 'vaultline.example',
          brandId: 'brand_vaultline',
          socialLinks: ['https://x.com/vaultline'],
        },
      },
      {
        store,
        clock: () => NOW,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        sourceEvidenceProvider: async ({ socialLinks }) =>
          createBrandVaultConnectedSocialEvidence({
            socialLinks,
            uploaderXUser: {
              twitterTokens: {
                accessToken: 'token_x',
                userId: 'x_123',
                userName: 'vaultline',
                scopes: ['tweet.read', 'users.read'],
                missingScopes: [],
                expiresAt: '2026-06-10T00:00:00.000Z',
              },
            },
            youtubeConnection: null,
            apifyApiKey: '',
            fetchFn,
            now: NOW,
          }),
      },
    );

    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) throw new Error(created.body.error.message);
    expect(fetchedUrls).toHaveLength(3);
    expect(fetchedUrls[0]).toContain('https://api.x.com/2/users/me');
    expect(fetchedUrls[1]).toContain('https://api.x.com/2/tweets/tweet_pin');
    expect(fetchedUrls[2]).toContain('https://api.x.com/2/users/x_123/tweets');
    expect(created.body.job.warnings).toContain('Brand Vault fetched pinned X post for draft social evidence review.');
    expect(created.body.job.warnings).toContain('Brand Vault fetched 1 recent X post for draft social evidence review.');
    expect(created.body.reviewPayload.intake.social).toMatchObject({
      status: 'complete',
      linksProvided: 1,
      connectedAccountCount: 3,
      fetchedPostCount: 2,
      needsAuthCount: 0,
    });
    expect(created.body.reviewPayload.intake.sources.byOrigin).toMatchObject({
      connected_metadata: 1,
      connected_fetch: 2,
    });
    expect(created.body.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'social')).toMatchObject({
      status: 'complete',
      sourceCount: 3,
    });
    expect(created.body.job.inputs.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_post',
          platform: 'x',
          pinned: true,
          text: 'Stop guessing brand voice from stale decks. Build one reviewed brand system before the edit starts. Trusted by 80 creative teams. Book a demo.',
          evidenceOrigin: 'connected_fetch',
        }),
      ]),
    );
    expect(created.body.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.socialIdentity',
          normalizedValue: expect.objectContaining({
            pinned: true,
            evidenceOrigin: 'connected_fetch',
            capability: expect.objectContaining({
              evidenceAccess: 'connected_post_sample',
              liveFetchStatus: 'available_with_connected_account',
              connectedAccountStatus: 'connected',
              pinnedContentStatus: 'connected_pinned_read',
            }),
          }),
        }),
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.1.social_post.text.voicePhrases',
          normalizedValue: expect.arrayContaining(['Stop guessing brand voice from stale decks']),
        }),
        expect.objectContaining({
          extractorId: 'brand-vault-social-evidence.v1',
          sourceField: 'sourceEvidence.2.social_post.socialIdentity',
          normalizedValue: expect.objectContaining({
            pinned: false,
            evidenceOrigin: 'connected_fetch',
          }),
        }),
      ]),
    );
  });

  it('does not leak jobs or profiles across users', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'owner_user', body: { websiteUrl: 'vaultline.example' } },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);

    const wrongUserJob = await getBrandVaultRefineryJob(
      { userId: 'other_user', jobId: created.body.job.id },
      { store },
    );
    const wrongUserProfile = await getBrandVaultSignalProfile(
      { userId: 'other_user', recordId: created.body.record.id },
      { store },
    );

    expect(wrongUserJob.status).toBe(404);
    expect(wrongUserProfile.status).toBe(404);
  });

  it('does not leak jobs, profiles, or draft review across active org scopes', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'owner_user',
        orgId: 'org_a',
        body: { websiteUrl: 'vaultline.example', brandId: 'brand_vaultline' },
      },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);

    const sameOrgJob = await getBrandVaultRefineryJob(
      { userId: 'owner_user', orgId: 'org_a', jobId: created.body.job.id },
      { store },
    );
    const wrongOrgJob = await getBrandVaultRefineryJob(
      { userId: 'owner_user', orgId: 'org_b', jobId: created.body.job.id },
      { store },
    );
    const wrongOrgProfile = await getBrandVaultSignalProfile(
      { userId: 'owner_user', orgId: 'org_b', recordId: created.body.record.id },
      { store },
    );
    const wrongOrgReview = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'owner_user',
        orgId: 'org_b',
        recordId: created.body.record.id,
        body: { action: 'accept' },
      },
      { store },
    );

    expect(sameOrgJob.status).toBe(200);
    expect(wrongOrgJob.status).toBe(404);
    expect(wrongOrgProfile.status).toBe(404);
    expect(wrongOrgReview.status).toBe(404);
    expect((await store.getRecord(created.body.record.id))?.status).toBe('draft');
  });

  it('awaits promise-returning store adapters for production persistence compatibility', async () => {
    const store = createPromiseBackedStore();
    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'async_user', body: { websiteUrl: 'vaultline.example', brandId: 'async_brand' } },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);

    const loaded = await getBrandVaultRefineryJob(
      { userId: 'async_user', jobId: created.body.job.id },
      { store },
    );
    expect(loaded.status).toBe(200);
    expect(loaded.body.ok).toBe(true);
    if (!loaded.body.ok) throw new Error(loaded.body.error.message);
    expect(loaded.body.record?.id).toBe(created.body.record.id);

    const accepted = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'async_user',
        recordId: created.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-09T06:20:00.000Z',
      },
      { store },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.ok).toBe(true);
    if (!accepted.body.ok) throw new Error(accepted.body.error.message);
    expect(accepted.body.job?.status).toBe('accepted');
    expect(accepted.body.record.status).toBe('accepted');
  });

  it('persists validated review decisions without teaching the brand until final acceptance', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example', brandId: 'brand_vaultline' } },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);

    const saved = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_vault',
        recordId: created.body.record.id,
        actorId: 'brand_manager_1',
        body: {
          action: 'save_review',
          expectedUpdatedAt: created.body.record.updatedAt,
          signalEdits: [{ path: 'identity.category', value: 'creative operations platform' }],
          confirmedSignalPaths: ['identity.brandName'],
          deferredConflictPaths: ['identity.proofStyle'],
        },
        now: '2026-06-09T06:20:00.000Z',
      },
      { store },
    );

    expect(saved.status).toBe(200);
    expect(saved.body.ok).toBe(true);
    if (!saved.body.ok) throw new Error(saved.body.error.message);
    expect(saved.body.record.status).toBe('draft');
    expect(saved.body.record.profile.identity.category.value).not.toBe('creative operations platform');
    expect(saved.body.record.review.decisions).toMatchObject({
      signalEdits: [{ path: 'identity.category', value: 'creative operations platform' }],
      confirmedSignalPaths: ['identity.brandName'],
      deferredConflictPaths: ['identity.proofStyle'],
      savedAt: '2026-06-09T06:20:00.000Z',
      savedBy: 'brand_manager_1',
    });
    expect(saved.body.job?.status).toBe('needs_review');
    expect(saved.body.learningEvents).toEqual([]);

    const reloaded = await store.getRecord(created.body.record.id);
    expect(reloaded?.review.decisions).toEqual(saved.body.record.review.decisions);

    const staleSave = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_vault',
        recordId: created.body.record.id,
        body: {
          action: 'save_review',
          expectedUpdatedAt: created.body.record.updatedAt,
          confirmedSignalPaths: ['identity.category'],
        },
        now: '2026-06-09T06:21:00.000Z',
      },
      { store },
    );
    expect(staleSave).toMatchObject({ status: 409, body: { ok: false, error: { code: 'conflict' } } });

    const accepted = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_vault',
        recordId: created.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-09T06:25:00.000Z',
      },
      { store },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.ok).toBe(true);
    if (!accepted.body.ok) throw new Error(accepted.body.error.message);
    expect(accepted.body.record.status).toBe('accepted');
    expect(accepted.body.record.profile.identity.category.value).toBe('creative operations platform');
    expect(accepted.body.learningEvents).toHaveLength(1);
  });

  it('accepts and rejects drafts while updating the stored job review state', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const acceptedDraft = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example', brandId: 'brand_vaultline' } },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!acceptedDraft.body.ok) throw new Error(acceptedDraft.body.error.message);

    const accepted = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_vault',
        recordId: acceptedDraft.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-09T06:05:00.000Z',
      },
      { store },
    );

    expect(accepted.status).toBe(200);
    expect(accepted.body.ok).toBe(true);
    if (!accepted.body.ok) throw new Error(accepted.body.error.message);
    expect(accepted.body.record.status).toBe('accepted');
    expect(accepted.body.job?.status).toBe('accepted');
    expect(accepted.body.reviewPayload?.reviewRequired).toBe(false);
    expect(accepted.body.reviewPayload?.intake.nextActions.map((action) => action.id)).not.toContain('review_candidates');
    expect(accepted.body.learningEvents).toEqual([]);

    const rejectedDraft = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example', brandId: 'brand_vaultline' } },
      { store, clock: () => '2026-06-09T06:10:00.000Z', fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!rejectedDraft.body.ok) throw new Error(rejectedDraft.body.error.message);

    const rejected = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_vault',
        recordId: rejectedDraft.body.record.id,
        body: { action: 'reject', reason: 'Wrong client site.' },
        now: '2026-06-09T06:15:00.000Z',
      },
      { store },
    );

    expect(rejected.status).toBe(200);
    expect(rejected.body.ok).toBe(true);
    if (!rejected.body.ok) throw new Error(rejected.body.error.message);
    expect(rejected.body.record.status).toBe('rejected');
    expect(rejected.body.job?.status).toBe('rejected');
    expect(rejected.body.record.review.rejectionReason).toBe('Wrong client site.');
    expect(rejected.body.learningEvents).toEqual([]);
  });

  it('mints a brandId when accepting a brandless draft so consumers can still resolve accepted truth by brandId', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example' } },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);

    const accepted = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_vault',
        recordId: created.body.record.id,
        body: { action: 'accept' },
        now: '2026-06-09T06:18:00.000Z',
      },
      { store },
    );

    // A brandless draft is no longer a dead end: accept mints a brandId rather than refusing, so the
    // user's review work survives AND the invariant still holds — the accepted profile carries a brandId
    // that generation consumers can resolve.
    expect(accepted.status).toBe(200);
    expect(accepted.body.ok).toBe(true);
    if (!accepted.body.ok) throw new Error('Expected brandless accept to succeed with a minted brandId.');
    expect(accepted.body.record.status).toBe('accepted');
    expect(accepted.body.record.profile.brandId).toMatch(/^brand_/);
    const stored = store.getRecord(created.body.record.id);
    expect(stored?.status).toBe('accepted');
    expect(stored?.profile.brandId).toMatch(/^brand_/);
  });

  it('mints a brandId without global Web Crypto so production accepts do not disappear', async () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    try {
      const store = createInMemoryBrandVaultRefineryStore();
      const created = await createBrandVaultRefineryJobFromWebsite(
        { userId: 'user_vault', body: { websiteUrl: 'vaultline.example' } },
        { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
      );
      if (!created.body.ok) throw new Error(created.body.error.message);

      const accepted = await reviewBrandVaultSignalProfileDraft(
        {
          userId: 'user_vault',
          recordId: created.body.record.id,
          body: { action: 'accept' },
          now: '2026-06-09T06:19:00.000Z',
        },
        { store },
      );

      expect(accepted.status).toBe(200);
      expect(accepted.body.ok).toBe(true);
      if (!accepted.body.ok) throw new Error('Expected accept to succeed without global Web Crypto.');
      expect(accepted.body.record.status).toBe('accepted');
      expect(accepted.body.record.profile.brandId).toMatch(/^brand_/);
      expect(store.getLatestAcceptedRecord({ userId: 'user_vault', orgId: null })?.id).toBe(created.body.record.id);
    } finally {
      if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it('returns reviewed Brand Vault learning events when accepted signal edits change values', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example', brandId: 'brand_vaultline' } },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);

    const accepted = await reviewBrandVaultSignalProfileDraft(
      {
        userId: 'user_vault',
        recordId: created.body.record.id,
        actorId: 'brand_manager_1',
        body: {
          action: 'accept',
          signalEdits: [{ path: 'identity.category', value: 'creative operations platform' }],
        },
        now: '2026-06-09T06:25:00.000Z',
      },
      { store },
    );

    expect(accepted.status).toBe(200);
    expect(accepted.body.ok).toBe(true);
    if (!accepted.body.ok) throw new Error(accepted.body.error.message);
    expect(accepted.body.record.profile.identity.category.value).toBe('creative operations platform');
    expect(accepted.body.learningEvents).toHaveLength(1);

    const event = accepted.body.learningEvents[0];
    if (!event) throw new Error('Expected reviewed learning event.');
    expect(event).toMatchObject({
      version: 1,
      service: 'brand_vault',
      signalPath: 'identity.category',
      editType: 'direct_review_edit',
      scope: 'brand',
      polarity: 'replace',
      observedAt: '2026-06-09T06:25:00.000Z',
      actorId: 'brand_manager_1',
      context: {
        userId: 'user_vault',
        brandId: 'brand_vaultline',
        sourceId: created.body.record.id,
      },
      afterValue: 'creative operations platform',
      observedValue: 'creative operations platform',
      learningWeight: {
        category: 'invented',
        service: 'brand_vault',
        editType: 'direct_review_edit',
        scope: 'brand',
        polarity: 'replace',
        signalClass: 'strategic_identity',
      },
    });
    expect(event.learningWeight.value).toBeGreaterThan(0.8);
  });

  it('returns deterministic errors for invalid input, fetch failure, and bad review actions', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const missingWebsite = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: {} },
      { store },
    );
    expect(missingWebsite.status).toBe(400);
    expect(missingWebsite.body.ok).toBe(false);

    const fetchFailed = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example' } },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse(500) } },
    );
    expect(fetchFailed.status).toBe(422);
    expect(fetchFailed.body.ok).toBe(false);

    const badSourceEvidence = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example', sourceEvidence: [{ kind: 'unknown', name: 'bad' }] } },
      { store },
    );
    expect(badSourceEvidence.status).toBe(400);
    expect(badSourceEvidence.body.ok).toBe(false);

    const badCrawlPolicy = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        body: {
          websiteUrl: 'vaultline.example',
          sourceEvidence: [{ kind: 'crawl_seed', url: 'https://vaultline.example/work', crawl: { maxPages: 'many' } }],
        },
      },
      { store },
    );
    expect(badCrawlPolicy.status).toBe(400);
    expect(badCrawlPolicy.body.ok).toBe(false);

    const badUploadMetadata = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        body: {
          websiteUrl: 'vaultline.example',
          sourceEvidence: [
            {
              kind: 'uploaded_guideline',
              name: 'bad-brand-book.pdf',
              dominantColors: ['not-a-color'],
              sizeBytes: 'large',
              assetRole: 'brand_manual',
            },
          ],
        },
      },
      { store },
    );
    expect(badUploadMetadata.status).toBe(400);
    expect(badUploadMetadata.body.ok).toBe(false);

    const badSocialPinnedFlag = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        body: {
          websiteUrl: 'vaultline.example',
          sourceEvidence: [{ kind: 'social_post', text: 'Pinned launch post.', pinned: 'yes' }],
        },
      },
      { store },
    );
    expect(badSocialPinnedFlag.status).toBe(400);
    expect(badSocialPinnedFlag.body.ok).toBe(false);

    const badRichSocialMetadata = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        body: {
          websiteUrl: 'vaultline.example',
          sourceEvidence: [
            {
              kind: 'social_post',
              platform: 'instagram',
              media: { mediaType: 'gif', ocrText: 'Unsupported media type should fail.' },
            },
          ],
        },
      },
      { store },
    );
    expect(badRichSocialMetadata.status).toBe(400);
    expect(badRichSocialMetadata.body.ok).toBe(false);

    const badConnectionMetadata = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
        body: {
          websiteUrl: 'vaultline.example',
          sourceEvidence: [
            {
              kind: 'social_profile',
              platform: 'linkedin',
              connection: {
                provider: 'uploaderx',
                status: 'connected',
                canReadProfile: true,
                canReadPosts: true,
              },
            },
          ],
        },
      },
      { store },
    );
    expect(badConnectionMetadata.status).toBe(400);
    expect(badConnectionMetadata.body.ok).toBe(false);

    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_vault', body: { websiteUrl: 'vaultline.example' } },
      { store, clock: () => NOW, fetchOptions: { fetchFn: async () => htmlResponse() } },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);

    const badAction = await reviewBrandVaultSignalProfileDraft(
      { userId: 'user_vault', recordId: created.body.record.id, body: { action: 'reject' } },
      { store },
    );

    expect(badAction.status).toBe(400);
    expect(badAction.body.ok).toBe(false);
  });

  it('runs vision decode as a post-save follow-up (draft persisted BEFORE decode) and attaches productUiModel', async () => {
    const store = createPromiseBackedStore();
    let recordIdAtDecode: string | undefined;
    let screenshotUrlsAtDecode: string[] = [];

    const result = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_decode', body: { websiteUrl: 'vaultline.example' }, jobId: 'job_decode_followup' },
      {
        store,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        captureSectionScreenshots: async () => [{ source: 'url', url: 'https://raw.example/s1.png' }],
        visualAssetStorage: {
          mirrorAsset: async (input) => ({ ok: true, provider: 'test_r2', storageKey: input.assetId, publicUrl: `https://cdn.ui.example/${input.assetId}`, contentType: 'image/png', sizeBytes: 100, storedAt: NOW }),
        },
        decodeProductUiModel: async ({ screenshotUrls }) => {
          // Proof the draft is already persisted when decode runs: its snapshot (with recordId) exists now.
          const snap = await store.getJobSnapshot('job_decode_followup');
          recordIdAtDecode = snap?.recordId;
          screenshotUrlsAtDecode = screenshotUrls;
          return { brand: { accent: '#ffcc33', theme: 'light' }, screens: [{ name: 'hero' }] };
        },
        clock: () => NOW,
      },
    );

    expect(result.status).toBe(201);
    if (!result.body.ok) throw new Error(result.body.error.message);
    // Decode ran AFTER the draft snapshot was saved (off the critical path) and was fed the mirrored R2 urls.
    expect(recordIdAtDecode).toBe(result.body.record.id);
    expect(screenshotUrlsAtDecode.length).toBeGreaterThanOrEqual(1);
    expect(screenshotUrlsAtDecode.every((u) => u.startsWith('https://cdn.ui.example/'))).toBe(true);
    // productUiModel is attached to the persisted record.
    expect(result.body.record.profile.productUiModel?.brand).toMatchObject({ accent: '#ffcc33', theme: 'light' });
    const stored = await store.getRecord(result.body.record.id);
    expect(stored?.profile.productUiModel?.screens?.[0]?.name).toBe('hero');
  });

  it('does not let a late vision decode overwrite an accepted profile', async () => {
    const store = createPromiseBackedStore();
    const result = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_decode_race', body: { websiteUrl: 'vaultline.example' }, jobId: 'job_decode_race' },
      {
        store,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        captureSectionScreenshots: async () => [{ source: 'url', url: 'https://raw.example/s1.png' }],
        visualAssetStorage: {
          mirrorAsset: async (input) => ({ ok: true, provider: 'test_r2', storageKey: input.assetId, publicUrl: `https://cdn.ui.example/${input.assetId}`, contentType: 'image/png', sizeBytes: 100, storedAt: NOW }),
        },
        decodeProductUiModel: async () => {
          const snapshot = await store.getJobSnapshot('job_decode_race');
          if (!snapshot?.recordId) throw new Error('Expected the draft to be persisted before decode.');
          const accepted = await store.acceptDraft(snapshot.recordId, { now: '2026-06-09T06:05:00.000Z' });
          if (!accepted.ok) throw new Error('Expected concurrent draft acceptance to succeed.');
          return { brand: { accent: '#ffcc33', theme: 'light' }, screens: [{ name: 'hero' }] };
        },
        clock: () => NOW,
      },
    );

    expect(result.status).toBe(201);
    if (!result.body.ok) throw new Error(result.body.error.message);
    expect(result.body.record.status).toBe('accepted');
    expect(result.body.record.profile.productUiModel).toBeUndefined();
    expect((await store.getRecord(result.body.record.id))?.status).toBe('accepted');
    expect((await store.getRecord(result.body.record.id))?.profile.productUiModel).toBeUndefined();
  });

  it('leaves the saved draft fully intact when the vision decode follow-up throws', async () => {
    const store = createPromiseBackedStore();

    const result = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_decode_fail', body: { websiteUrl: 'vaultline.example' }, jobId: 'job_decode_fail' },
      {
        store,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        captureSectionScreenshots: async () => [{ source: 'url', url: 'https://raw.example/s1.png' }],
        visualAssetStorage: {
          mirrorAsset: async (input) => ({ ok: true, provider: 'test_r2', storageKey: input.assetId, publicUrl: `https://cdn.ui.example/${input.assetId}`, contentType: 'image/png', sizeBytes: 100, storedAt: NOW }),
        },
        decodeProductUiModel: async () => { throw new Error('vision exploded'); },
        clock: () => NOW,
      },
    );

    expect(result.status).toBe(201);
    if (!result.body.ok) throw new Error(result.body.error.message);
    // The draft is saved + reviewable; only the enrichment is missing — a decode failure never loses it.
    const stored = await store.getRecord(result.body.record.id);
    expect(stored).not.toBeNull();
    expect((stored?.profile.assets?.uiScreenshots?.value ?? []).length).toBeGreaterThanOrEqual(1);
    expect(stored?.profile.productUiModel).toBeUndefined();
  });

  it('cron backfill decodes a needs-review draft that captured screenshots but never got a productUiModel', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    // A scan with the inline decoder disabled: the draft is saved with uiScreenshots but no productUiModel.
    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_backfill', body: { websiteUrl: 'vaultline.example' }, jobId: 'job_backfill' },
      {
        store,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        captureSectionScreenshots: async () => [{ source: 'url', url: 'https://raw.example/s1.png' }],
        visualAssetStorage: {
          mirrorAsset: async (input) => ({ ok: true, provider: 'test_r2', storageKey: input.assetId, publicUrl: `https://cdn.ui.example/${input.assetId}`, contentType: 'image/png', sizeBytes: 100, storedAt: NOW }),
        },
        decodeProductUiModel: null,
        clock: () => NOW,
      },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);
    const recordId = created.body.record.id;
    expect((await store.getRecord(recordId))?.profile.productUiModel).toBeUndefined();

    // The cron backfill picks up that pending draft and decodes it.
    let decodeCalls = 0;
    const result = await processNextPendingProductUiDecode({
      store,
      decodeProductUiModel: async () => {
        decodeCalls += 1;
        return { brand: { theme: 'dark' }, screens: [{ name: 'hero' }] };
      },
      clock: () => NOW,
    });
    expect(result).toMatchObject({ processed: true, recordId, decoded: true });
    expect(decodeCalls).toBe(1);
    expect((await store.getRecord(recordId))?.profile.productUiModel?.brand?.theme).toBe('dark');
  });

  it('cron backfill stamps the attempt and respects the cooldown (no hot-loop, no starvation)', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const created = await createBrandVaultRefineryJobFromWebsite(
      { userId: 'user_cooldown', body: { websiteUrl: 'vaultline.example' }, jobId: 'job_cooldown' },
      {
        store,
        fetchOptions: { fetchFn: async () => htmlResponse() },
        captureSectionScreenshots: async () => [{ source: 'url', url: 'https://raw.example/s1.png' }],
        visualAssetStorage: {
          mirrorAsset: async (input) => ({ ok: true, provider: 'test_r2', storageKey: input.assetId, publicUrl: `https://cdn.ui.example/${input.assetId}`, contentType: 'image/png', sizeBytes: 100, storedAt: NOW }),
        },
        decodeProductUiModel: null,
        clock: () => NOW,
      },
    );
    if (!created.body.ok) throw new Error(created.body.error.message);
    const recordId = created.body.record.id;

    let decodeCalls = 0;
    const failingDecoder = async () => {
      decodeCalls += 1;
      return null; // decode ran but produced nothing usable
    };

    // First pass: attempts, stamps productUiModelDecodeAttemptedAt, decoded:false.
    const first = await processNextPendingProductUiDecode({ store, decodeProductUiModel: failingDecoder, clock: () => NOW });
    expect(first).toMatchObject({ processed: true, recordId, decoded: false });
    expect((await store.getRecord(recordId))?.profile.productUiModelDecodeAttemptedAt).toBe(NOW);

    // Second pass at the SAME instant: cooldown skips it, decoder is NOT called again.
    const second = await processNextPendingProductUiDecode({ store, decodeProductUiModel: failingDecoder, clock: () => NOW });
    expect(second).toMatchObject({ processed: false, reason: 'nothing_pending' });
    expect(decodeCalls).toBe(1);

    // Once the cooldown elapses, it becomes eligible again.
    const later = new Date(Date.parse(NOW) + 31 * 60 * 1000).toISOString();
    const third = await processNextPendingProductUiDecode({ store, decodeProductUiModel: failingDecoder, clock: () => later });
    expect(third).toMatchObject({ processed: true, recordId });
    expect(decodeCalls).toBe(2);
  });

  it('cron backfill is a no-op when no vision decoder is configured', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const result = await processNextPendingProductUiDecode({ store, decodeProductUiModel: null, clock: () => NOW });
    expect(result).toEqual({ processed: false, reason: 'decode_disabled' });
  });
});
