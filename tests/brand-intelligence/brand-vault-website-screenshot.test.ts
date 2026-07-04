import { describe, expect, it, vi } from 'vitest';
import {
  createBrandVaultWebsiteScreenshotCaptureFromEnvironment,
  extractScreenshotUrl,
} from '@/lib/shared/brand-vault-website-screenshot';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

describe('brand-vault website screenshot capture', () => {
  it('returns undefined (skips) when no FIRECRAWL_API_KEY is configured', () => {
    const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment({}, vi.fn());
    expect(capture).toBeUndefined();
  });

  it('returns undefined when the provider is explicitly off, even with a key', () => {
    const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment(
      { FIRECRAWL_API_KEY: 'fc-test', BRAND_VAULT_SCREENSHOT_PROVIDER: 'off' },
      vi.fn(),
    );
    expect(capture).toBeUndefined();
  });

  it('captures a screenshot URL from a Firecrawl scrape response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { screenshot: 'https://cdn.firecrawl.dev/shot-abc.png' } }),
    );
    const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment({ FIRECRAWL_API_KEY: 'fc-test' }, fetchFn);
    expect(capture).toBeDefined();

    const url = await capture!('https://insturix.com');
    expect(url).toBe('https://cdn.firecrawl.dev/shot-abc.png');

    // Requests the screenshot format with bearer auth against the Firecrawl scrape endpoint.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchFn.mock.calls[0];
    expect(endpoint).toContain('firecrawl.dev');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer fc-test');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.url).toBe('https://insturix.com/');
    expect(body.formats).toEqual([{ type: 'screenshot', fullPage: false }]);
  });

  it('honors BRAND_VAULT_SCREENSHOT_FULL_PAGE=true', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { screenshot: 'https://cdn.firecrawl.dev/x.png' } }));
    const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment(
      { FIRECRAWL_API_KEY: 'fc-test', BRAND_VAULT_SCREENSHOT_FULL_PAGE: 'true' },
      fetchFn,
    );
    await capture!('https://insturix.com');
    const body = JSON.parse(String(fetchFn.mock.calls[0][1].body));
    expect(body.formats).toEqual([{ type: 'screenshot', fullPage: true }]);
  });

  it('fails soft to undefined on a non-ok response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'rate limited' }, false));
    const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment({ FIRECRAWL_API_KEY: 'fc-test' }, fetchFn);
    expect(await capture!('https://insturix.com')).toBeUndefined();
  });

  it('fails soft to undefined when fetch throws (timeout/abort/network)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('aborted'));
    const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment({ FIRECRAWL_API_KEY: 'fc-test' }, fetchFn);
    expect(await capture!('https://insturix.com')).toBeUndefined();
  });

  it('returns undefined for a non-http(s) target without calling out', async () => {
    const fetchFn = vi.fn();
    const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment({ FIRECRAWL_API_KEY: 'fc-test' }, fetchFn);
    expect(await capture!('javascript:alert(1)')).toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  describe('extractScreenshotUrl', () => {
    it('reads data.screenshot as a plain string', () => {
      expect(extractScreenshotUrl({ data: { screenshot: 'https://x.dev/a.png' } })).toBe('https://x.dev/a.png');
    });
    it('reads a nested screenshot object url', () => {
      expect(extractScreenshotUrl({ data: { screenshot: { url: 'https://x.dev/b.png' } } })).toBe('https://x.dev/b.png');
    });
    it('reads a top-level screenshot object url', () => {
      expect(extractScreenshotUrl({ screenshot: { url: 'https://x.dev/c.png' } })).toBe('https://x.dev/c.png');
    });
    it('rejects non-http screenshot values', () => {
      expect(extractScreenshotUrl({ data: { screenshot: 'data:image/png;base64,AAAA' } })).toBeUndefined();
      expect(extractScreenshotUrl({ data: {} })).toBeUndefined();
      expect(extractScreenshotUrl(null)).toBeUndefined();
    });
  });
});
