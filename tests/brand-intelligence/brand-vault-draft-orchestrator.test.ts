import { describe, expect, it } from 'vitest';
import {
  acceptBrandVaultSignalProfileDraft,
  createBrandVaultWebsiteDraftJob,
  getLatestAcceptedBrandVaultProfile,
  rejectBrandVaultSignalProfileDraft,
} from '../../lib/shared/brand-vault-draft-orchestrator';
import { createInMemoryBrandSignalProfileRepository } from '../../lib/shared/brand-signal-profile-repository';

const NOW = '2026-06-09T05:00:00.000Z';

const HTML = `
<!doctype html>
<html>
  <head>
    <title>Signal House - Video systems for B2B teams</title>
    <meta name="description" content="Signal House helps agencies launch trusted video systems with fast production workflows.">
    <meta property="og:site_name" content="Signal House">
    <meta name="theme-color" content="#0b1b2b">
    <style>
      :root { --brand: #0b1b2b; --accent: #2ee6a6; --paper: #f5f7fa; }
      body { color: #0b1b2b; background: #f5f7fa; font-family: "Inter", system-ui, sans-serif; }
      a { color: #2ee6a6; }
    </style>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Signal House",
        "description": "A video operations partner for B2B agencies.",
        "logo": "https://signal.example/logo.svg"
      }
    </script>
  </head>
  <body>
    <h1>Launch trusted video systems in days</h1>
    <h2>Fast workflows for agency operators</h2>
    <a href="/demo">Book a demo</a>
    <blockquote>Trusted by 120 agency teams to ship faster.</blockquote>
    <img alt="Signal House logo" src="/logo.svg">
  </body>
</html>
`;

function htmlResponse(status = 200): Response {
  return new Response(status === 200 ? HTML : 'missing', {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

function pageHtml(title: string, body: string): string {
  return `
<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta name="description" content="${title} for Signal House.">
    <meta property="og:site_name" content="Signal House">
    <meta name="theme-color" content="#0b1b2b">
  </head>
  <body>${body}</body>
</html>
`;
}

describe('Brand Vault draft orchestrator', () => {
  it('creates and persists an API-ready website draft job without reading social links yet', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        socialLinks: ['https://x.com/signalhouse'],
        jobId: 'job_signal_site',
        profileRecordId: 'draft_signal_site',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(),
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.job.status).toBe('needs_review');
    expect(result.job.inputs.socialLinks).toEqual(['https://x.com/signalhouse']);
    expect(result.warnings).toContain(
      'Social links without connected post evidence were staged for review; connect read scopes or add pinned posts for richer social language.',
    );
    expect(result.record.id).toBe('draft_signal_site');
    expect(result.record.status).toBe('draft');
    expect(result.record.review.required).toBe(true);
    expect(result.profile.identity.brandName.value).toBe('Signal House');
    expect(result.reviewPayload.recordId).toBe('draft_signal_site');
    expect(result.reviewPayload.candidateCount).toBeGreaterThan(0);
    expect(result.reviewPayload.coverage.palette.evidenceCount).toBeGreaterThan(0);
    expect(result.reviewPayload.coverage.identity.actionableSignalCount).toBeGreaterThan(0);
    expect(result.reviewPayload.intake.website).toMatchObject({
      status: 'complete',
      normalizedUrl: 'https://signal.example/',
      providedCount: 1,
    });
    expect(result.reviewPayload.intake.social).toMatchObject({
      status: 'needs_auth',
      linksProvided: 1,
      fetchedPostCount: 0,
      needsAuthCount: 1,
    });
    expect(result.reviewPayload.intake.social.platforms).toEqual([
      expect.objectContaining({ platform: 'x', status: 'needs_auth' }),
    ]);
    expect(result.reviewPayload.intake.uploads.status).toBe('not_provided');
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'social')).toMatchObject({
      label: 'Social Evidence',
      status: 'needs_auth',
    });
    expect(result.reviewPayload.intake.nextActions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['review_candidates', 'connect_social', 'add_pinned_posts', 'add_uploads', 'accept_or_reject']),
    );
    expect(repository.getRecord('draft_signal_site')?.status).toBe('draft');
    expect(repository.listEvents('draft_signal_site').map((event) => event.type)).toEqual(['draft_saved']);
  });

  it('downgrades unreachable website asset candidates before review payload assembly', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_asset_probe',
        profileRecordId: 'draft_asset_probe',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async (url) => {
            if (url === 'https://signal.example/') return htmlResponse();
            if (url.endsWith('/logo.svg')) return new Response('', { status: 404 });
            return new Response('', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const logo = result.candidates.find(
      (candidate) => candidate.signalPath === 'assets.logoCandidates' && candidate.normalizedValue === 'https://signal.example/logo.svg',
    );
    expect(logo?.confidence).toBeLessThanOrEqual(0.18);
    expect(logo?.rawValue).toMatchObject({
      availability: {
        status: 'unavailable',
        httpStatus: 404,
      },
    });
    expect(result.warnings).toContain('1 website asset candidate was unreachable and downgraded before review.');
    expect(result.reviewPayload.warnings).toContain('1 website asset candidate was unreachable and downgraded before review.');
  });

  it('crawls prioritized same-origin pages across depth with policy caps', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, string> = {
      'https://signal.example/': pageHtml(
        'Signal House',
        [
          '<a href="/about?utm=ignored#team">About</a>',
          '<a href="/case-studies">Case studies</a>',
          '<a href="/privacy">Privacy</a>',
          '<a href="/brand.pdf">Brand PDF</a>',
          '<a href="https://other.example/work">Offsite work</a>',
        ].join(''),
      ),
      'https://signal.example/about': pageHtml(
        'About Signal House',
        '<h1>About Signal House</h1><a href="/customers">Customers</a><a href="/careers">Careers</a>',
      ),
      'https://signal.example/case-studies': pageHtml(
        'Signal House Case Studies',
        '<h1>Case studies</h1><a href="/features">Features</a>',
      ),
      'https://signal.example/customers': pageHtml(
        'Signal House Customers',
        '<h1>Customer proof</h1><a href="/features">Features</a>',
      ),
      'https://signal.example/features': pageHtml('Signal House Features', '<h1>Feature platform</h1>'),
    };
    const fetchCalls: string[] = [];

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_crawl',
        profileRecordId: 'draft_crawl',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://signal.example/about?utm=ignored#team',
            platform: 'website',
            crawl: {
              maxPages: 3,
              maxDepth: 2,
              includePaths: ['/about', '/case-studies', '/customers', '/features'],
              excludePaths: ['/careers'],
            },
          },
        ],
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async (url) => {
            fetchCalls.push(url);
            return new Response(pages[url] ?? 'missing', {
              status: pages[url] ? 200 : 404,
              headers: { 'content-type': 'text/html' },
            });
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const crawled = result.candidates.filter((candidate) => candidate.sourceField === 'crawl.page');
    expect(fetchCalls).toEqual([
      'https://signal.example/',
      'https://signal.example/about',
      'https://signal.example/sitemap_index.xml',
      'https://signal.example/sitemap.xml',
      'https://signal.example/case-studies',
      'https://signal.example/customers',
    ]);
    expect(crawled.map((candidate) => candidate.sourceUrl)).toEqual([
      'https://signal.example/about',
      'https://signal.example/case-studies',
      'https://signal.example/customers',
    ]);
    expect(crawled.some((candidate) => /privacy|brand\.pdf|other\.example|careers|features/.test(candidate.sourceUrl ?? ''))).toBe(false);
    expect(crawled[0]?.normalizedValue).toMatchObject({ title: 'About Signal House' });
    expect(result.warnings).toContain('Crawled 3 additional brand pages for draft evidence.');
    expect(result.reviewPayload.intake.website.crawledPageCount).toBe(3);
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'crawl')).toMatchObject({
      status: 'complete',
      sourceCount: 3,
    });
  });

  it('normalizes bare-domain crawl seeds against the final website origin', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const fetchCalls: string[] = [];

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_bare_seed_crawl',
        profileRecordId: 'draft_bare_seed_crawl',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'signal.example/about?utm=ignored#team',
            platform: 'website',
            crawl: {
              maxPages: 1,
              maxDepth: 0,
              includePaths: ['/about'],
            },
          },
        ],
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          fetchCalls.push(url);
          if (url === 'https://signal.example/') {
            return {
              normalizedUrl: 'https://www.signal.example/',
              html: pageHtml('Signal House', '<h1>Signal House</h1>'),
              contentType: 'text/html',
              fetchedAt: NOW,
            };
          }
          if (url === 'https://www.signal.example/about') {
            return {
              normalizedUrl: url,
              html: pageHtml('About Signal House', '<h1>About Signal House</h1>'),
              contentType: 'text/html',
              fetchedAt: NOW,
            };
          }
          throw new Error(`Unexpected crawl URL: ${url}`);
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(fetchCalls).toEqual(['https://signal.example/', 'https://www.signal.example/about']);
    expect(fetchCalls).not.toContain('https://www.signal.example/signal.example/about');
    expect(result.candidates.find((candidate) => candidate.sourceField === 'crawl.page')?.sourceUrl).toBe(
      'https://www.signal.example/about',
    );
  });

  it('auto-crawls brand pages and expands sitemap URLs without requiring a crawl seed', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const pages: Record<string, { html: string; contentType: string }> = {
      'https://signal.example/': {
        contentType: 'text/html',
        html: pageHtml(
          'Signal House',
          [
            '<link rel="sitemap" href="/brand-sitemap.xml">',
            '<a href="/about">About</a>',
            '<a href="/privacy">Privacy</a>',
            '<a href="/logo.png">Logo</a>',
          ].join(''),
        ),
      },
      'https://signal.example/brand-sitemap.xml': {
        contentType: 'application/xml',
        html: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset>',
          '<url><loc>https://signal.example/mission</loc></url>',
          '<url><loc>https://signal.example/customers?utm=ignored#proof</loc></url>',
          '<url><loc>https://signal.example/privacy</loc></url>',
          '<url><loc>https://other.example/work</loc></url>',
          '</urlset>',
        ].join(''),
      },
      'https://signal.example/about': {
        contentType: 'text/html',
        html: pageHtml('About Signal House', '<h1>About the team</h1>'),
      },
      'https://signal.example/mission': {
        contentType: 'text/html',
        html: pageHtml('Signal House Mission', '<h1>Operator-first mission</h1>'),
      },
      'https://signal.example/customers': {
        contentType: 'text/html',
        html: pageHtml('Signal House Customers', '<h1>Customer proof</h1>'),
      },
    };

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_auto_crawl',
        profileRecordId: 'draft_auto_crawl',
        now: NOW,
      },
      {
        repository,
        fetchSnapshot: async (url) => {
          const page = pages[url];
          if (!page) throw new Error('not found');
          return {
            normalizedUrl: url,
            html: page.html,
            contentType: page.contentType,
            fetchedAt: NOW,
          };
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const crawledUrls = result.candidates
      .filter((candidate) => candidate.sourceField === 'crawl.page')
      .map((candidate) => candidate.sourceUrl);
    expect(crawledUrls).toEqual(expect.arrayContaining([
      'https://signal.example/about',
      'https://signal.example/mission',
      'https://signal.example/customers',
    ]));
    expect(crawledUrls.some((url) => /privacy|logo\.png|other\.example|brand-sitemap/.test(url ?? ''))).toBe(false);
    expect(result.warnings).toContain('Crawled 3 additional brand pages for draft evidence.');
    expect(result.reviewPayload.intake.website.crawledPageCount).toBe(3);
  });

  it('turns uploaded brand books and assets into reviewable draft signal evidence', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_uploads',
        profileRecordId: 'draft_uploads',
        now: NOW,
        sourceEvidence: [
          {
            kind: 'uploaded_guideline',
            name: 'brand-book.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 420_000,
            text: [
              'Color palette: #102033 #ffcc33 #f7f7f7',
              'Tone: precise, editorial, operator-first.',
              'Do not use stock-photo language.',
              'Avoid neon gradients.',
            ].join('\n'),
            assetRole: 'brand_book',
          },
          {
            kind: 'uploaded_asset',
            name: 'primary-logo.svg',
            url: 'https://signal.example/assets/primary-logo.svg',
            mimeType: 'image/svg+xml',
            dominantColors: ['#102033', '#ffcc33'],
            assetRole: 'logo',
          },
        ],
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(),
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const stagedGuideline = result.candidates.find(
      (candidate) => candidate.extractorId === 'brand-vault-source-staging.v1' && candidate.sourceField === 'sourceEvidence.0.uploaded_guideline',
    );
    expect(stagedGuideline?.normalizedValue).toMatchObject({
      kind: 'uploaded_guideline',
      mimeType: 'application/pdf',
      sizeBytes: 420_000,
      textLength: 135,
      assetRole: 'brand_book',
      status: 'staged',
    });

    const uploadCandidates = result.candidates.filter((candidate) => candidate.extractorId === 'brand-vault-upload-evidence.v1');
    expect(uploadCandidates.map((candidate) => candidate.sourceField)).toEqual(
      expect.arrayContaining([
        'sourceEvidence.0.uploaded_guideline.colors',
        'sourceEvidence.0.uploaded_guideline.brandRules',
        'sourceEvidence.0.uploaded_guideline.voiceGuidelines',
        'sourceEvidence.1.uploaded_asset.colors',
        'sourceEvidence.1.uploaded_asset.logoAsset',
      ]),
    );
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.uploaded_guideline.colors')?.normalizedValue).toEqual([
      '#102033',
      '#ffcc33',
      '#f7f7f7',
    ]);
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.uploaded_guideline.brandRules')?.signalPath).toBe(
      'voice.killList',
    );
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.uploaded_guideline.brandRules')?.normalizedValue).toEqual(
      expect.arrayContaining(['Do not use stock-photo language', 'Avoid neon gradients.']),
    );
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.uploaded_guideline.voiceGuidelines')?.signalPath).toBe(
      'voice.recurringPhrases',
    );
    expect(uploadCandidates.find((candidate) => candidate.sourceField === 'sourceEvidence.1.uploaded_asset.logoAsset')?.signalPath).toBe(
      'assets.logoCandidates',
    );
    expect(result.profile.palette.supporting.value).toEqual(expect.arrayContaining(['#102033', '#ffcc33', '#f7f7f7']));
    expect(result.profile.palette.supporting.trustLevel).toBe('uploaded_brand_guideline');
    expect(result.profile.voice.killList.value).toEqual(
      expect.arrayContaining(['Do not use stock-photo language', 'Avoid neon gradients.']),
    );
    expect(result.profile.voice.killList.trustLevel).toBe('uploaded_brand_guideline');
    expect(result.profile.voice.recurringPhrases.value).toEqual(
      expect.arrayContaining(['Tone: precise, editorial, operator-first']),
    );
    expect(result.profile.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'voice.killList',
          trustLevel: 'uploaded_brand_guideline',
          authorityClass: 'brand_constraint',
        }),
      ]),
    );
    expect(result.job.warnings).toContain('7 additional Brand Vault sources staged for enrichment and evidence review.');
    expect(result.reviewPayload.intake.uploads).toMatchObject({
      status: 'complete',
      guidelineCount: 1,
      assetCount: 1,
      parsedColorCandidateCount: 2,
      parsedTextCandidateCount: 2,
      logoCandidateCount: 1,
    });
    expect(result.reviewPayload.intake.sources.byKind).toMatchObject({
      uploaded_guideline: 1,
      uploaded_asset: 1,
    });
    expect(result.reviewPayload.intake.evidenceLanes.find((lane) => lane.id === 'uploads')).toMatchObject({
      status: 'complete',
      sourceCount: 2,
    });
  });

  it('does not fetch or persist when the website URL is unsupported', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    let fetchCalls = 0;

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        websiteUrl: 'mailto:hello@signal.example',
        jobId: 'job_bad_url',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => {
            fetchCalls += 1;
            return htmlResponse();
          },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Invalid URL should not produce a draft.');
    expect(result.error.code).toBe('invalid_url');
    expect(result.job.status).toBe('failed');
    expect(fetchCalls).toBe(0);
    expect(repository.listRecords()).toHaveLength(0);
  });

  it('returns a failed job when the website fetch fails', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_fetch_fail',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(500),
        },
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Failed fetch should not produce a draft.');
    expect(result.error.code).toBe('fetch_failed');
    expect(result.error.message).toBe('Website fetch failed with HTTP 500.');
    expect(result.job.inputs.websiteUrl).toBe('https://signal.example/');
    expect(repository.listRecords()).toHaveLength(0);
  });

  it('keeps accept, reject, and latest profile operations behind the Brand Vault boundary', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();
    const draft = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_accept',
        profileRecordId: 'draft_accept',
        now: NOW,
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(),
        },
      },
    );
    if (!draft.ok) throw new Error(draft.error.message);

    const accepted = acceptBrandVaultSignalProfileDraft(repository, 'draft_accept', {
      actorId: 'brand_manager',
      now: '2026-06-09T05:05:00.000Z',
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('Expected accepted draft.');
    expect(accepted.record.status).toBe('accepted');
    expect(getLatestAcceptedBrandVaultProfile(repository, { brandId: 'brand_signal', userId: 'user_signal' })?.identity.brandName.value).toBe(
      'Signal House',
    );

    const rejectDraft = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_signal',
        brandId: 'brand_signal',
        websiteUrl: 'signal.example',
        jobId: 'job_reject',
        profileRecordId: 'draft_reject',
        now: '2026-06-09T05:10:00.000Z',
      },
      {
        repository,
        fetchOptions: {
          fetchFn: async () => htmlResponse(),
        },
      },
    );
    if (!rejectDraft.ok) throw new Error(rejectDraft.error.message);

    const rejected = rejectBrandVaultSignalProfileDraft(repository, 'draft_reject', 'Wrong client site.', {
      actorId: 'brand_manager',
      now: '2026-06-09T05:15:00.000Z',
    });

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) throw new Error('Expected rejected draft.');
    expect(rejected.record.status).toBe('rejected');
    expect(rejected.record.review.rejectionReason).toBe('Wrong client site.');
  });
});
