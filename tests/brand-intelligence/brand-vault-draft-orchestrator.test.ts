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
      'Social links were captured for later Brand Vault enrichment; this website draft does not read social posts yet.',
    );
    expect(result.record.id).toBe('draft_signal_site');
    expect(result.record.status).toBe('draft');
    expect(result.record.review.required).toBe(true);
    expect(result.profile.identity.brandName.value).toBe('Signal House');
    expect(result.reviewPayload.recordId).toBe('draft_signal_site');
    expect(result.reviewPayload.candidateCount).toBeGreaterThan(0);
    expect(result.reviewPayload.coverage.palette.evidenceCount).toBeGreaterThan(0);
    expect(result.reviewPayload.coverage.identity.actionableSignalCount).toBeGreaterThan(0);
    expect(repository.getRecord('draft_signal_site')?.status).toBe('draft');
    expect(repository.listEvents('draft_signal_site').map((event) => event.type)).toEqual(['draft_saved']);
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
            crawl: { maxPages: 3, maxDepth: 2, excludePaths: ['/careers'] },
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
