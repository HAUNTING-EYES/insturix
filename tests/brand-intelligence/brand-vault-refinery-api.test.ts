import { describe, expect, it } from 'vitest';
import {
  createBrandVaultRefineryJobFromWebsite,
  createInMemoryBrandVaultRefineryStore,
  getBrandVaultRefineryJob,
  getBrandVaultSignalProfile,
  reviewBrandVaultSignalProfileDraft,
  type BrandVaultRefineryStore,
} from '../../lib/shared/brand-vault-refinery-api';
import { createBrandVaultConnectedSocialEvidence } from '../../lib/shared/brand-vault-connected-social-ingestion';

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

function createPromiseBackedStore(): BrandVaultRefineryStore {
  const store = createInMemoryBrandVaultRefineryStore();
  return {
    saveRecord: async (record, options) => store.saveRecord(record, options),
    getRecord: async (id) => store.getRecord(id),
    acceptDraft: async (id, options) => store.acceptDraft(id, options),
    rejectDraft: async (id, reason, options) => store.rejectDraft(id, reason, options),
    getLatestAcceptedProfile: async (filter) => store.getLatestAcceptedProfile(filter),
    saveJobSnapshot: async (snapshot) => store.saveJobSnapshot(snapshot),
    getJobSnapshot: async (jobId) => store.getJobSnapshot(jobId),
    getJobSnapshotByRecordId: async (recordId) => store.getJobSnapshotByRecordId(recordId),
    updateJobStatusForRecord: async (recordId, status, options) =>
      store.updateJobStatusForRecord(recordId, status, options),
  };
}

describe('Brand Vault refinery API boundary', () => {
  it('creates, stores, and reloads a website-derived review draft for the authenticated user', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
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
    expect(loaded.body.record?.id).toBe(created.body.record.id);
    expect(loaded.body.reviewPayload?.reviewRequired).toBe(true);
    expect(loaded.body.candidates).toHaveLength(created.body.candidates.length);
    expect(loaded.body.job.inputs.sourceEvidence).toHaveLength(3);
  });

  it('turns user-selected pinned social post text into reviewable Brand Vault evidence candidates', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
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

  it('lets Brand Vault-owned providers add connected social capability evidence without accepting it as profile truth', async () => {
    const store = createInMemoryBrandVaultRefineryStore();

    const created = await createBrandVaultRefineryJobFromWebsite(
      {
        userId: 'user_vault',
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
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/vaultline'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      now: NOW,
    });

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
    ]);
    expect(result.warnings).toContain('Brand Vault staged 1 public social fallback source for review-only enrichment.');
    expect(result.warnings.some((warning) => /connected social evidence source/.test(warning))).toBe(false);
  });

  it('fetches connected X post samples as draft-only social evidence when tweet.read is available', async () => {
    const store = createInMemoryBrandVaultRefineryStore();
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
      fetchedUrls.push(url);
      expect(init?.headers).toEqual({ Authorization: 'Bearer token_x' });
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
    expect(fetchedUrls).toHaveLength(1);
    expect(fetchedUrls[0]).toContain('https://api.x.com/2/users/x_123/tweets');
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
});
