import { describe, expect, it } from 'vitest';
import {
  bucketMatches,
  classifyFailureBucket,
  createBroadScanFetchOptions,
  createBroadScanTextEvidenceCompiler,
  withTimeout,
} from '../../scripts/brand-vault-broad-scan';
import type { BrandVaultBrowserRenderFetch } from '../../lib/shared/brand-vault-browser-fallback';

describe('Brand Vault broad scan harness', () => {
  it('keeps paid/browser fallback disabled unless a render provider is configured', () => {
    const options = createBroadScanFetchOptions({}, async () => {
      throw new Error('render fetch should not run');
    });

    expect(options).toMatchObject({
      timeoutMs: 12_000,
      stylesheetTimeoutMs: 4_000,
      maxStylesheetBytes: 120_000,
      maxLinkedStylesheets: 8,
    });
    expect(options.browserFallbackFetchFn).toBeUndefined();
  });

  it('uses the same env-gated text evidence compiler as production scans', () => {
    const emptyEnv = {} as NodeJS.ProcessEnv;
    const disabledEnv = {
      NODE_ENV: 'test',
      BRAND_VAULT_TEXT_COMPILER_ENABLED: 'false',
      GEMINI_API_KEY: 'gemini_key',
    } as NodeJS.ProcessEnv;
    const enabledEnv = {
      NODE_ENV: 'test',
      BRAND_VAULT_TEXT_COMPILER_ENABLED: 'true',
      GEMINI_API_KEY: 'gemini_key',
    } as NodeJS.ProcessEnv;

    expect(createBroadScanTextEvidenceCompiler(emptyEnv)).toBeUndefined();
    expect(createBroadScanTextEvidenceCompiler(disabledEnv)).toBeUndefined();
    expect(createBroadScanTextEvidenceCompiler(enabledEnv)).toBeTypeOf('function');
  });

  it('returns the timeout result when a broad-scan target exceeds its budget', async () => {
    const startedAt = Date.now();
    const result = await withTimeout(
      new Promise<string>(() => {
        // Intentionally never resolves: this mirrors a hostile or stuck target.
      }),
      20,
      () => 'timed-out',
    );

    expect(result).toBe('timed-out');
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
  it('classifies infrastructure failures separately from extraction-quality gaps', () => {
    expect(
      classifyFailureBucket({
        status: 'fail',
        scanStatus: 'exception',
        reasons: ['target timeout', 'missing industry'],
      }),
    ).toBe('timeout');
    expect(
      classifyFailureBucket({
        status: 'fail',
        scanStatus: 'job_failed',
        reasons: ['Website fetch produced only blocked or challenge HTML (http 403).'],
      }),
    ).toBe('blocked');
    expect(
      classifyFailureBucket({
        status: 'fail',
        scanStatus: 'exception',
        reasons: ['getaddrinfo ENOTFOUND example.test'],
      }),
    ).toBe('dns');
    expect(
      classifyFailureBucket({
        status: 'fail',
        scanStatus: 'job_failed',
        reasons: ['HTTP 503 service unavailable'],
      }),
    ).toBe('server');
    expect(
      classifyFailureBucket({
        status: 'fail',
        scanStatus: 'exception',
        reasons: ['fetch failed'],
      }),
    ).toBe('fetch');
    expect(
      classifyFailureBucket({
        status: 'warn',
        scanStatus: 'ok',
        reasons: ['missing palette', 'no crawled pages'],
        crawledPageCount: 0,
        candidateCount: 0,
      }),
    ).toBe('empty');
    expect(
      classifyFailureBucket({
        status: 'warn',
        scanStatus: 'ok',
        reasons: ['missing palette'],
        crawledPageCount: 2,
        candidateCount: 8,
      }),
    ).toBe('extraction');
    expect(
      classifyFailureBucket({
        status: 'warn',
        scanStatus: 'ok',
        reasons: ['missing audience'],
        warnings: ['Brand Vault crawler skipped https://example.com/about: Website fetch failed with HTTP 404.'],
        crawledPageCount: 4,
        candidateCount: 60,
      }),
    ).toBe('extraction');
    expect(
      classifyFailureBucket({
        status: 'pass',
        scanStatus: 'ok',
        reasons: [],
      }),
    ).toBe('none');
  });

  it('uses the configured self-hosted browser render endpoint for blocked broad-scan targets', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const renderFetchFn: BrandVaultBrowserRenderFetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          finalUrl: 'https://chai.example/',
          html: '<html><head><title>Chaayos</title></head><body><h1>Fresh chai for office teams</h1></body></html>',
          contentType: 'text/html',
          warnings: ['Render endpoint returned browser-executed HTML.'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const options = createBroadScanFetchOptions(
      {
        BRAND_VAULT_BROWSER_RENDER_ENDPOINT: 'https://render.example/brand-vault',
        BRAND_VAULT_BROWSER_RENDER_TOKEN: 'render_token',
        BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS: '1500',
        FIRECRAWL_API_KEY: 'paid_key_should_not_be_used',
      },
      renderFetchFn,
    );

    expect(options.browserFallbackFetchFn).toBeTypeOf('function');
    const snapshot = await options.browserFallbackFetchFn?.({
      normalizedUrl: 'https://chai.example/',
      reason: 'http_blocked',
      httpStatus: 403,
      contentType: 'text/html',
      htmlExcerpt: '<title>Access denied</title>',
      now: '2026-06-20T00:00:00.000Z',
      userAgent: 'Mozilla/5.0 Brand Vault Test Browser',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://render.example/brand-vault');
    expect(calls[0].init?.headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer render_token',
        'content-type': 'application/json',
      }),
    );
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      url: 'https://chai.example/',
      reason: 'http_blocked',
      httpStatus: 403,
    });
    expect(snapshot).toMatchObject({
      normalizedUrl: 'https://chai.example/',
      html: expect.stringContaining('Fresh chai'),
      fetchWarnings: expect.arrayContaining(['Render endpoint returned browser-executed HTML.']),
    });
  });
});

describe('Brand Vault broad scan taxonomy matching', () => {
  it('matches D2C verticals from free-text category labels (real scan examples)', () => {
    // The compiler puts the business model in industry and the vertical in category.
    expect(bucketMatches('beauty/personal care', 'e-commerce/DTC', 'personal care products')).toBe(true);
    expect(bucketMatches('beauty/personal care', 'e-commerce/DTC', 'skincare brand')).toBe(true);
    expect(bucketMatches('beauty/personal care', 'e-commerce/DTC', "men's grooming and fragrance")).toBe(true);
    expect(bucketMatches('food/beverage', 'e-commerce/DTC', 'online grocery delivery')).toBe(true);
    expect(bucketMatches('food/beverage', 'food and beverage', 'coffee roasters and retailer')).toBe(true);
    expect(bucketMatches('food/beverage', 'food and beverage', "children's food and snacks")).toBe(true);
    expect(bucketMatches('food/beverage', 'beverages', 'cocktail mixers and non-alcoholic beverages')).toBe(true);
    expect(bucketMatches('health/wellness', 'food/beverage', 'sports nutrition and supplements')).toBe(true);
    expect(bucketMatches('baby/kids', 'e-commerce/DTC', 'cloth diapering and baby care products')).toBe(true);
    expect(bucketMatches('baby/kids', 'e-commerce/DTC', 'baby products online store')).toBe(true);
  });

  it('does not match across unrelated verticals (guards against false positives)', () => {
    // "operations team" must not register as "tea" for a food bucket.
    expect(bucketMatches('food/beverage', 'SaaS/software', 'operations team')).toBe(false);
    // A generic e-commerce label with no vertical signal stays a real miss.
    expect(bucketMatches('beauty/personal care', 'e-commerce/DTC', 'online store platform')).toBe(false);
    // A beauty extraction must not satisfy a baby/kids expectation.
    expect(bucketMatches('baby/kids', 'e-commerce/DTC', 'cosmetics and beauty products')).toBe(false);
    // Unrelated tech extraction never matches a consumer bucket.
    expect(bucketMatches('food/beverage', 'SaaS/software', 'observability platform')).toBe(false);
    expect(bucketMatches('beauty/personal care', 'semiconductor/hardware', 'semiconductor manufacturer')).toBe(false);
  });

  it('preserves the existing tech-bucket matching', () => {
    expect(bucketMatches('semiconductor', 'semiconductor/hardware', 'semiconductor manufacturer')).toBe(true);
    expect(bucketMatches('software', 'SaaS/software', 'CRM platform')).toBe(true);
    expect(bucketMatches('it services', 'technology services', 'IT consulting and services')).toBe(true);
    expect(bucketMatches('unknown', undefined, undefined)).toBe(true);
  });
});
