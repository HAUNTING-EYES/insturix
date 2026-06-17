import { describe, expect, it } from 'vitest';
import { handleBrandVaultBrowserRenderRequest } from '../../lib/shared/brand-vault-browser-render-endpoint';
import type { BrandVaultPlaywrightModule } from '../../lib/shared/brand-vault-browser-fallback';

const ENV = {
  BRAND_VAULT_BROWSER_RENDER_TOKEN: 'render_secret',
  BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS: '1500',
  BRAND_VAULT_PLAYWRIGHT_WAIT_UNTIL: 'domcontentloaded',
};

describe('Brand Vault browser render endpoint handler', () => {
  it('fails closed when the internal render token is not configured', async () => {
    const result = await handleBrandVaultBrowserRenderRequest(request({ url: 'https://vaultline.example/' }), {});

    expect(result).toMatchObject({
      status: 503,
      body: {
        ok: false,
        error: { code: 'render_token_not_configured' },
      },
    });
  });

  it('rejects requests without the configured bearer token', async () => {
    const result = await handleBrandVaultBrowserRenderRequest(
      request({ url: 'https://vaultline.example/' }, 'wrong_token'),
      ENV,
    );

    expect(result).toMatchObject({
      status: 401,
      body: {
        ok: false,
        error: { code: 'unauthorized' },
      },
    });
  });

  it('rejects invalid JSON bodies before rendering', async () => {
    const result = await handleBrandVaultBrowserRenderRequest(
      new Request('https://render.example/', {
        method: 'POST',
        headers: { authorization: 'Bearer render_secret' },
        body: '{nope',
      }),
      ENV,
    );

    expect(result).toMatchObject({
      status: 400,
      body: {
        ok: false,
        error: { code: 'invalid_json' },
      },
    });
  });

  it('blocks local and private targets by default', async () => {
    const local = await handleBrandVaultBrowserRenderRequest(
      request({ url: 'http://localhost:3000/' }),
      ENV,
    );
    const privateAddress = await handleBrandVaultBrowserRenderRequest(
      request({ url: 'https://vaultline.example/' }),
      ENV,
      {
        resolveHostname: async () => ['10.0.0.12'],
      },
    );

    expect(local).toMatchObject({
      status: 400,
      body: { ok: false, error: { code: 'private_host_blocked' } },
    });
    expect(privateAddress).toMatchObject({
      status: 400,
      body: { ok: false, error: { code: 'private_host_blocked' } },
    });
  });

  it('returns rendered HTML and stylesheet evidence for public targets', async () => {
    const lifecycle: string[] = [];
    const gotoCalls: Array<{ url: string; timeout: number; waitUntil: string }> = [];
    const loadPlaywright = async (): Promise<BrandVaultPlaywrightModule> => ({
      chromium: {
        launch: async () => ({
          close: async () => {
            lifecycle.push('browser.close');
          },
          newContext: async () => ({
            close: async () => {
              lifecycle.push('context.close');
            },
            newPage: async () => ({
              content: async () => '<html><body><h1>Rendered Vaultline</h1></body></html>',
              evaluate: async <T>() =>
                [
                  {
                    url: 'https://vaultline.example/#playwright-stylesheet-0',
                    css: ':root { --brand-primary: #123456; }',
                    contentType: 'text/css',
                  },
                ] as T,
              goto: async (url, options) => {
                gotoCalls.push({ url, timeout: options.timeout, waitUntil: options.waitUntil });
                return {
                  headers: () => ({ 'content-type': 'text/html; charset=utf-8' }),
                  status: () => 200,
                  url: () => 'https://vaultline.example/',
                };
              },
            }),
          }),
        }),
      },
    });

    const result = await handleBrandVaultBrowserRenderRequest(
      request({
        url: 'vaultline.example',
        reason: 'javascript_shell',
        userAgent: 'Brand Vault Renderer Test',
      }),
      ENV,
      {
        loadPlaywright,
        resolveHostname: async () => ['93.184.216.34'],
      },
    );

    expect(result).toMatchObject({
      status: 200,
      body: {
        ok: true,
        normalizedUrl: 'https://vaultline.example/',
        html: expect.stringContaining('Rendered Vaultline'),
        contentType: 'text/html; charset=utf-8',
        fetchWarnings: expect.arrayContaining([
          expect.stringMatching(/Self-hosted Playwright browser-rendered evidence/i),
        ]),
      },
    });
    expect(gotoCalls).toEqual([
      {
        url: 'https://vaultline.example/',
        timeout: 1500,
        waitUntil: 'domcontentloaded',
      },
    ]);
    expect(result.body.ok && result.body.stylesheets?.[0]?.css).toContain('--brand-primary: #123456');
    expect(lifecycle).toEqual(['context.close', 'browser.close']);
  });

  it('defaults endpoint Playwright readiness to domcontentloaded when env is not set', async () => {
    const gotoCalls: Array<{ waitUntil: string; timeout: number }> = [];
    const loadPlaywright = async (): Promise<BrandVaultPlaywrightModule> => ({
      chromium: {
        launch: async () => ({
          close: async () => undefined,
          newContext: async () => ({
            close: async () => undefined,
            newPage: async () => ({
              content: async () => '<html><body><h1>Rendered quickly</h1></body></html>',
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

    const result = await handleBrandVaultBrowserRenderRequest(
      request({ url: 'vaultline.example' }),
      {
        BRAND_VAULT_BROWSER_RENDER_TOKEN: 'render_secret',
        BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS: '1500',
      },
      {
        loadPlaywright,
        resolveHostname: async () => ['93.184.216.34'],
      },
    );

    expect(result.status).toBe(200);
    expect(gotoCalls).toEqual([{ waitUntil: 'domcontentloaded', timeout: 1500 }]);
  });
});

function request(body: Record<string, unknown>, token = 'render_secret'): Request {
  return new Request('https://render.example/', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
