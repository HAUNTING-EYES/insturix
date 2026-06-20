import { describe, expect, it } from 'vitest';
import { classifyFailureBucket, createBroadScanFetchOptions, withTimeout } from '../../scripts/brand-vault-broad-scan';
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
