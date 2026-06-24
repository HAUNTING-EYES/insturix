import { describe, expect, it } from 'vitest';
import { createBrandVaultWebsiteDraftJob } from '../../lib/shared/brand-vault-draft-orchestrator';
import { createInMemoryBrandSignalProfileRepository } from '../../lib/shared/brand-signal-profile-repository';

const NOW = '2026-06-21T12:00:00.000Z';

// A Shopify-style storefront: the homepage renders fine and links to real
// /collections, /products, and /pages routes, but the crawler's default
// brand-page guesses (/about, /company, /services, ...) and the sitemap guesses
// do not exist (404). This reproduces the India-D2C scan, where 147/272 sites
// returned 0 crawled pages because the bounded crawl budget was spent on
// 404-prone guesses before reaching the real, discovered storefront links.
const SHOP_HOME = `
<!doctype html>
<html>
  <head>
    <title>GlowKind - Clean Skincare</title>
    <meta name="description" content="GlowKind makes clean, effective skincare.">
    <meta property="og:site_name" content="GlowKind">
    <meta name="theme-color" content="#114b3a">
    <link rel="stylesheet" href="/cdn/shop/t/1/assets/theme.css">
  </head>
  <body>
    <nav>
      <a href="/collections/all">Shop All</a>
      <a href="/collections/skincare">Skincare</a>
      <a href="/pages/our-story">Our Story</a>
      <a href="/products/glow-serum">Glow Serum</a>
    </nav>
    <h1>Clean skincare that actually works</h1>
    <img alt="GlowKind logo" src="/logo.svg">
  </body>
</html>
`;

function storefrontPage(path: string): string {
  return `<!doctype html><html><head><title>GlowKind ${path}</title>` +
    `<meta name="description" content="GlowKind ${path} page."></head>` +
    `<body><h1>GlowKind</h1><p>Clean skincare details for ${path}.</p></body></html>`;
}

function notFoundPage(): string {
  return '<!doctype html><html><head><title>404 Not Found</title></head><body><h1>Page not found</h1></body></html>';
}

// Returns 200 only for the homepage and real storefront routes; everything else
// (default-path guesses, sitemap guesses) 404s — exactly like a Shopify store.
function shopifyFetchFn(): (url: string | URL, init?: { method?: string }) => Promise<Response> {
  return async (url, init) => {
    const target = String(url);
    if (init?.method === 'HEAD') {
      const contentType = target.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
      return new Response('', { status: 200, headers: { 'content-type': contentType } });
    }
    const path = new URL(target).pathname;
    if (path === '/' || path === '') {
      return new Response(SHOP_HOME, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (/^\/(collections|products|pages)\//.test(path)) {
      return new Response(storefrontPage(path), { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response(notFoundPage(), { status: 404, headers: { 'content-type': 'text/html' } });
  };
}

describe('Brand Vault crawl prioritization', () => {
  it('reaches discovered storefront pages instead of starving on default-path guesses', async () => {
    const repository = createInMemoryBrandSignalProfileRepository();

    const result = await createBrandVaultWebsiteDraftJob(
      {
        userId: 'user_shop',
        brandId: 'brand_shop',
        websiteUrl: 'https://glowkind.example',
        jobId: 'job_shop_crawl',
        profileRecordId: 'draft_shop_crawl',
        now: NOW,
        // Mirror the broad-scan India-D2C config: a tight 2-page crawl budget.
        sourceEvidence: [
          {
            kind: 'crawl_seed',
            url: 'https://glowkind.example',
            platform: 'website',
            crawl: { maxPages: 2, maxDepth: 2 },
          },
        ],
      },
      {
        repository,
        fetchOptions: { fetchFn: shopifyFetchFn() },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    // The fix: discovered /collections and /pages links outrank the 404-prone
    // default guesses, so the crawl returns real pages within the tight budget.
    const crawledPages = result.candidates.filter((candidate) => candidate.sourceField === 'crawl.page');
    expect(crawledPages.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((warning) => /Crawled \d+ additional brand page/.test(warning))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('0 usable pages'))).toBe(false);

    // Sanity: the real storefront routes were the ones fetched, not the guesses.
    const crawledUrls = crawledPages.map((candidate) => candidate.sourceUrl ?? '');
    expect(crawledUrls.every((url) => /\/(collections|products|pages)\//.test(url))).toBe(true);
  });
});
