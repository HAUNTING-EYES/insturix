import { describe, expect, it } from 'vitest';
import {
  createBrandVaultBrowserFallbackFetchFromEnvironment,
  createBrandVaultLocalPlaywrightFallbackFetch,
  type BrandVaultBrowserRenderFetch,
  type BrandVaultPlaywrightModule,
} from '../../lib/shared/brand-vault-browser-fallback';
import { createWebsiteBrandSignalProfileDraft } from '../../lib/shared/brand-website-refinery';

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
  it('stays disabled when no free render provider is configured', () => {
    const fallback = createBrandVaultBrowserFallbackFetchFromEnvironment({}, async () => {
      throw new Error('fetch should not run');
    });

    expect(fallback).toBeUndefined();
  });

  it('does not spend Firecrawl credits unless the paid provider is explicitly selected', () => {
    const fallback = createBrandVaultBrowserFallbackFetchFromEnvironment(
      {
        FIRECRAWL_API_KEY: 'fc_test_key',
      },
      async () => {
        throw new Error('fetch should not run');
      },
    );

    expect(fallback).toBeUndefined();
  });

  it('uses Firecrawl only when the paid browser-render provider is explicitly configured', async () => {
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
        BRAND_VAULT_BROWSER_RENDER_PROVIDER: 'firecrawl',
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

  it('keeps a self-hosted render endpoint ahead of paid Firecrawl when both are configured', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fallback = createBrandVaultBrowserFallbackFetchFromEnvironment(
      {
        BRAND_VAULT_BROWSER_RENDER_ENDPOINT: 'https://render.example/brand-vault',
        BRAND_VAULT_BROWSER_RENDER_PROVIDER: 'firecrawl',
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

  it('can render through a self-hosted local Playwright provider without a paid scraper', async () => {
    const lifecycle: string[] = [];
    const gotoCalls: Array<{ url: string; waitUntil: string; timeout: number }> = [];
    const contextOptions: Array<{ userAgent?: string }> = [];
    const loadPlaywright = async (): Promise<BrandVaultPlaywrightModule> => ({
      chromium: {
        launch: async (options) => {
          expect(options.headless).toBe(true);
          expect(options.args).toContain('--no-sandbox');
          lifecycle.push('launch');
          return {
            close: async () => {
              lifecycle.push('browser.close');
            },
            newContext: async (options) => {
              contextOptions.push(options);
              lifecycle.push('context');
              return {
                close: async () => {
                  lifecycle.push('context.close');
                },
                newPage: async () => ({
                  content: async () => '<html><body><h1>Rendered locally</h1></body></html>',
                  evaluate: async <T>(pageFunction: () => T | Promise<T>) => {
                    if (String(pageFunction).includes('document.styleSheets')) {
                      return [
                      {
                        url: 'https://vaultline.example/#playwright-stylesheet-0',
                        css: ':root { --brand-primary: #123456; } body { font-family: "Plus Jakarta Sans"; }',
                        contentType: 'text/css',
                      },
                      ] as T;
                    }
                    return {
                      sourceField: 'website.renderedPrimitives',
                      motionSourceField: 'website.renderedMotionPrimitives',
                      excerpt: 'Rendered primitives: 12 visible elements, 2 data-viz markers, 3 transitions, 1 animations.',
                      atoms: {
                        'rendered.element_density': 0.18,
                        'rendered.text_coverage': 0.42,
                        'rendered.media_coverage': 0.12,
                        'rendered.data_viz_density': 0.71,
                        'rendered.motion_intensity': 0.64,
                        'rendered.transition_density': 0.58,
                        'rendered.animation_density': 0.22,
                      },
                      visual: {
                        minimalism: 0.41,
                        densityTolerance: 0.67,
                        dataVizAffinity: 0.82,
                        expressiveness: 0.64,
                        geometryTendency: 0.72,
                        decorationTolerance: 0.44,
                        cornerRadiusBias: 0.36,
                        layoutSymmetry: 0.69,
                        contrastPreference: 0.5,
                      },
                      motion: {
                        motionEnergy: 0.64,
                        overshootTolerance: 0.38,
                        transitionSharpness: 0.71,
                        rhythmRegularity: 0.66,
                      },
                      confidence: 0.66,
                      motionConfidence: 0.62,
                    } as T;
                  },
                  goto: async (url, options) => {
                    gotoCalls.push({ url, waitUntil: options.waitUntil, timeout: options.timeout });
                    return {
                      headers: () => ({ 'content-type': 'text/html; charset=utf-8' }),
                      status: () => 200,
                      url: () => 'https://vaultline.example/',
                    };
                  },
                }),
              };
            },
          };
        },
      },
    });

    const fallback = createBrandVaultLocalPlaywrightFallbackFetch({
      loadPlaywright,
      timeoutMs: 1_500,
      waitUntil: 'domcontentloaded',
    });

    const snapshot = await fallback(INPUT);

    expect(contextOptions).toEqual([{ userAgent: 'Mozilla/5.0 Brand Vault Test Browser' }]);
    expect(gotoCalls).toEqual([
      {
        url: 'https://vaultline.example/',
        waitUntil: 'domcontentloaded',
        timeout: 1_500,
      },
    ]);
    expect(snapshot).toMatchObject({
      normalizedUrl: 'https://vaultline.example/',
      html: expect.stringContaining('Rendered locally'),
      contentType: 'text/html; charset=utf-8',
      fetchWarnings: expect.arrayContaining([
        expect.stringMatching(/Self-hosted Playwright browser-rendered evidence/i),
        'Self-hosted Playwright renderer received HTTP 200.',
        expect.stringMatching(/CSSOM stylesheet evidence/i),
      ]),
    });
    expect(snapshot?.stylesheets?.[0]?.css).toContain('--brand-primary: #123456');
    expect(snapshot?.stylesheets?.[0]?.css).toContain('Plus Jakarta Sans');
    expect(snapshot?.renderedPrimitives).toMatchObject({
      sourceField: 'website.renderedPrimitives',
      motionSourceField: 'website.renderedMotionPrimitives',
      atoms: expect.objectContaining({
        'rendered.data_viz_density': 0.71,
        'rendered.motion_intensity': 0.64,
      }),
    });
    if (!snapshot) throw new Error('Expected local Playwright snapshot.');
    const draft = createWebsiteBrandSignalProfileDraft({
      websiteUrl: snapshot.normalizedUrl ?? INPUT.normalizedUrl,
      html: snapshot.html,
      stylesheets: snapshot.stylesheets,
      renderedPrimitives: snapshot.renderedPrimitives,
      fetchedAt: INPUT.now,
      jobId: 'job_rendered_primitives',
    });
    expect(draft.profile.visual.dataVizAffinity.value).toBe(0.82);
    expect(draft.profile.visual.dataVizAffinity.evidenceIds[0]).toBeDefined();
    expect(draft.profile.evidence.find((item) => item.id === draft.profile.visual.dataVizAffinity.evidenceIds[0])).toMatchObject({
      signalPath: 'visual.dataVizAffinity',
      sourceField: 'website.renderedPrimitives',
      confidence: 0.66,
    });
    expect(draft.profile.motion.motionEnergy.value).toBe(0.64);
    expect(draft.profile.evidence.find((item) => item.id === draft.profile.motion.motionEnergy.evidenceIds[0])).toMatchObject({
      signalPath: 'motion.motionEnergy',
      sourceField: 'website.renderedMotionPrimitives',
      confidence: 0.62,
    });
    expect(lifecycle).toEqual(['launch', 'context', 'context.close', 'browser.close']);
  });

  it('defaults local Playwright readiness to domcontentloaded instead of networkidle', async () => {
    const gotoCalls: Array<{ waitUntil: string; timeout: number }> = [];
    const loadPlaywright = async (): Promise<BrandVaultPlaywrightModule> => ({
      chromium: {
        launch: async () => ({
          close: async () => undefined,
          newContext: async () => ({
            close: async () => undefined,
            newPage: async () => ({
              content: async () => '<html><body><h1>Rendered without waiting for idle analytics</h1></body></html>',
              evaluate: async <T>() => [] as T,
              goto: async (_url, options) => {
                gotoCalls.push({ waitUntil: options.waitUntil, timeout: options.timeout });
                return {
                  headers: () => ({ 'content-type': 'text/html' }),
                  status: () => 200,
                  url: () => 'https://vaultline.example/',
                };
              },
            }),
          }),
        }),
      },
    });

    const fallback = createBrandVaultLocalPlaywrightFallbackFetch({
      loadPlaywright,
      timeoutMs: 1_500,
    });

    const snapshot = await fallback(INPUT);

    expect(snapshot?.html).toContain('Rendered without waiting for idle analytics');
    expect(gotoCalls).toEqual([{ waitUntil: 'domcontentloaded', timeout: 1_500 }]);
  });
});
