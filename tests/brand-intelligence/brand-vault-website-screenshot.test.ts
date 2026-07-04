import { describe, expect, it, vi } from 'vitest';
import {
  applyWebsiteScreenshotToProfile,
  createBrandVaultWebsiteScreenshotCaptureFromEnvironment,
  extractScreenshotUrl,
} from '@/lib/shared/brand-vault-website-screenshot';
import { isBrandSignalActionable, type BrandSignalProfile } from '@/lib/shared/brand-signal-profile';

function profileStub(overrides: Partial<BrandSignalProfile> = {}): BrandSignalProfile {
  return { evidence: [], ...overrides } as unknown as BrandSignalProfile;
}

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

  describe('applyWebsiteScreenshotToProfile', () => {
    const args = { screenshotUrl: 'https://cdn.insturix.com/shot.png', observedAt: '2026-07-04T00:00:00.000Z', sourceUrl: 'https://insturix.com' };

    it('adds an ACTIONABLE socialPreviewImages signal the storyboard gate will resolve', () => {
      const next = applyWebsiteScreenshotToProfile(profileStub(), args);
      const signal = next.assets?.socialPreviewImages;
      expect(signal?.value).toEqual(['https://cdn.insturix.com/shot.png']);
      expect(signal?.trustLevel).toBe('first_party_website');
      expect(signal?.authorityClass).toBe('brand_fact');
      expect(signal && isBrandSignalActionable(signal)).toBe(true);
    });

    it('seeds a non-actionable empty productImages so it never fakes product evidence (Clickatron-safe)', () => {
      const next = applyWebsiteScreenshotToProfile(profileStub(), args);
      const productImages = next.assets?.productImages;
      expect(productImages?.value).toEqual([]);
      expect(productImages && isBrandSignalActionable(productImages)).toBe(false);
    });

    it('preserves existing product images and appends the screenshot to existing previews (deduped)', () => {
      const seeded = profileStub({
        assets: {
          productImages: { value: ['https://x.dev/p.png'], confidence: 0.56, trustLevel: 'first_party_website', authorityClass: 'brand_fact', evidenceIds: [] },
          socialPreviewImages: { value: ['https://x.dev/og.png'], confidence: 0.62, trustLevel: 'first_party_website', authorityClass: 'brand_fact', evidenceIds: [] },
        },
      } as unknown as Partial<BrandSignalProfile>);
      const next = applyWebsiteScreenshotToProfile(seeded, args);
      expect(next.assets?.productImages.value).toEqual(['https://x.dev/p.png']);
      expect(next.assets?.socialPreviewImages?.value).toEqual(['https://cdn.insturix.com/shot.png', 'https://x.dev/og.png']);
    });

    it('records one evidence entry referenced by the signal, and is idempotent', () => {
      const once = applyWebsiteScreenshotToProfile(profileStub(), args);
      const evidenceId = once.assets?.socialPreviewImages?.evidenceIds[0];
      expect(evidenceId).toBeTruthy();
      expect(once.evidence.filter((item) => item.id === evidenceId)).toHaveLength(1);
      const twice = applyWebsiteScreenshotToProfile(once, args);
      expect(twice.evidence.filter((item) => item.id === evidenceId)).toHaveLength(1);
    });

    it('is a no-op for a non-http screenshot url and never mutates the input', () => {
      const input = profileStub();
      const next = applyWebsiteScreenshotToProfile(input, { ...args, screenshotUrl: 'not-a-url' });
      expect(next).toBe(input);
      expect(input.assets).toBeUndefined();
    });
  });
});
