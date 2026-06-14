import { describe, expect, it } from 'vitest';
import {
  createBrandVaultBrowserFallbackFetchFromEnvironment,
  type BrandVaultBrowserRenderFetch,
} from '../../lib/shared/brand-vault-browser-fallback';

const INPUT = {
  normalizedUrl: 'https://vaultline.example/',
  reason: 'javascript_shell' as const,
  httpStatus: 200,
  contentType: 'text/html',
  htmlExcerpt: '<div id="root"></div>',
  now: '2026-06-14T12:00:00.000Z',
  userAgent: 'Mozilla/5.0 Brand Vault Test Browser',
};

describe('Brand Vault browser fallback providers', () => {
  it('stays disabled when no render endpoint or Firecrawl key is configured', () => {
    const fallback = createBrandVaultBrowserFallbackFetchFromEnvironment({}, async () => {
      throw new Error('fetch should not run');
    });

    expect(fallback).toBeUndefined();
  });

  it('uses Firecrawl as the production browser-render provider when FIRECRAWL_API_KEY is configured', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn: BrandVaultBrowserRenderFetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            html: '<html><head><title>Vaultline</title></head><body><h1>Rendered brand page</h1></body></html>',
            rawHtml: '<html><body>Raw fallback</body></html>',
            metadata: {
              url: 'https://vaultline.example/',
              contentType: 'text/html',
            },
            warning: 'Firecrawl warning from provider.',
            branding: {
              colors: {
                primary: '#123456',
                accent: '#fc3',
                ignored: 'rgb(1, 2, 3)',
              },
              typography: {
                fontFamilies: {
                  primary: 'Plus Jakarta Sans',
                },
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fallback = createBrandVaultBrowserFallbackFetchFromEnvironment(
      {
        FIRECRAWL_API_KEY: 'fc_test_key',
        BRAND_VAULT_FIRECRAWL_WAIT_MS: '250',
        BRAND_VAULT_FIRECRAWL_TIMEOUT_MS: '1500',
      },
      fetchFn,
    );

    expect(fallback).toBeTypeOf('function');
    if (!fallback) throw new Error('Expected Firecrawl fallback.');

    const snapshot = await fallback(INPUT);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.firecrawl.dev/v2/scrape');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.headers).toEqual(
      expect.objectContaining({
        accept: 'application/json',
        authorization: 'Bearer fc_test_key',
        'content-type': 'application/json',
      }),
    );
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      url: 'https://vaultline.example/',
      formats: ['html', 'rawHtml', 'links', 'branding'],
      onlyMainContent: false,
      waitFor: 250,
      timeout: 1500,
      removeBase64Images: true,
      blockAds: true,
      proxy: 'auto',
      headers: { 'User-Agent': 'Mozilla/5.0 Brand Vault Test Browser' },
    });
    expect(snapshot).toMatchObject({
      normalizedUrl: 'https://vaultline.example/',
      html: expect.stringContaining('Rendered brand page'),
      contentType: 'text/html',
      fetchWarnings: expect.arrayContaining([
        expect.stringMatching(/Firecrawl browser-rendered evidence/i),
        'Firecrawl warning from provider.',
        expect.stringMatching(/branding metadata/i),
      ]),
    });
    expect(snapshot?.stylesheets?.[0]).toMatchObject({
      url: 'https://vaultline.example/#firecrawl-branding',
      contentType: 'text/css',
    });
    expect(snapshot?.stylesheets?.[0]?.css).toContain('--firecrawl-primary: #123456');
    expect(snapshot?.stylesheets?.[0]?.css).toContain('--firecrawl-accent: #ffcc33');
    expect(snapshot?.stylesheets?.[0]?.css).toContain('Plus Jakarta Sans');
    expect(snapshot?.stylesheets?.[0]?.css).not.toContain('rgb(1, 2, 3)');
  });

  it('keeps a custom render endpoint ahead of Firecrawl when both are configured', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fallback = createBrandVaultBrowserFallbackFetchFromEnvironment(
      {
        BRAND_VAULT_BROWSER_RENDER_ENDPOINT: 'https://render.example/brand-vault',
        BRAND_VAULT_BROWSER_RENDER_TOKEN: 'render_token',
        FIRECRAWL_API_KEY: 'fc_test_key',
      },
      async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ html: '<html><body>Custom render</body></html>' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );

    expect(fallback).toBeTypeOf('function');
    if (!fallback) throw new Error('Expected endpoint fallback.');

    const snapshot = await fallback(INPUT);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://render.example/brand-vault');
    expect(calls[0].init?.headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer render_token',
      }),
    );
    expect(snapshot?.html).toContain('Custom render');
  });
});
