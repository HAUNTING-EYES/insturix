import { describe, expect, it, vi } from 'vitest';
import {
  applyWebsiteScreenshotToProfile,
  buildWebsiteScreenshotCandidate,
  createBrandVaultWebsiteScreenshotCaptureFromEnvironment,
  extractScreenshotUrl,
  parseCapturedScreenshot,
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

    const captured = await capture!('https://insturix.com');
    expect(captured).toEqual({ source: 'url', url: 'https://cdn.firecrawl.dev/shot-abc.png' });

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

  describe('endpoint (Modal) provider', () => {
    it('is selected when a render endpoint is configured, with no Firecrawl key', async () => {
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ screenshotUrl: 'https://cdn.insturix.com/s.png' }));
      const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment(
        { BRAND_VAULT_MODAL_RENDER_ENDPOINT: 'https://modal.example/render', BRAND_VAULT_MODAL_RENDER_TOKEN: 'tok' },
        fetchFn,
      );
      expect(capture).toBeDefined();
      const captured = await capture!('https://insturix.com');
      expect(captured).toEqual({ source: 'url', url: 'https://cdn.insturix.com/s.png' });
      const [endpoint, init] = fetchFn.mock.calls[0];
      expect(endpoint).toBe('https://modal.example/render');
      expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.mode).toBe('screenshot');
      expect(body.url).toBe('https://insturix.com/');
    });

    it('accepts a base64 screenshot from the endpoint as a bytes source', async () => {
      const b64 = 'A'.repeat(48);
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { screenshotBase64: b64, contentType: 'image/png' } }));
      const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment(
        { BRAND_VAULT_SCREENSHOT_ENDPOINT: 'https://modal.example/render' },
        fetchFn,
      );
      expect(await capture!('https://insturix.com')).toEqual({ source: 'bytes', base64: b64, contentType: 'image/png' });
    });

    it('prefers the endpoint over Firecrawl when both are configured', () => {
      const capture = createBrandVaultWebsiteScreenshotCaptureFromEnvironment(
        { BRAND_VAULT_BROWSER_RENDER_ENDPOINT: 'https://modal.example/render', FIRECRAWL_API_KEY: 'fc' },
        vi.fn(),
      );
      expect(capture).toBeDefined();
    });
  });

  describe('parseCapturedScreenshot', () => {
    it('reads a public screenshotUrl', () => {
      expect(parseCapturedScreenshot({ screenshotUrl: 'https://x.dev/a.png' })).toEqual({ source: 'url', url: 'https://x.dev/a.png' });
    });
    it('reads a data:image base64 URI in screenshot', () => {
      const b64 = 'B'.repeat(40);
      expect(parseCapturedScreenshot({ data: { screenshot: `data:image/jpeg;base64,${b64}` } })).toEqual({ source: 'bytes', base64: b64, contentType: 'image/jpeg' });
    });
    it('reads screenshotBase64 with a default png content type', () => {
      const b64 = 'C'.repeat(64);
      expect(parseCapturedScreenshot({ screenshotBase64: b64 })).toEqual({ source: 'bytes', base64: b64, contentType: 'image/png' });
    });
    it('returns undefined for an empty / too-short / missing screenshot', () => {
      expect(parseCapturedScreenshot({ data: { screenshotBase64: 'tooShort' } })).toBeUndefined();
      expect(parseCapturedScreenshot({})).toBeUndefined();
      expect(parseCapturedScreenshot(null)).toBeUndefined();
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

  describe('buildWebsiteScreenshotCandidate', () => {
    it('builds a socialPreviewImages candidate the visual board renders as a tile', () => {
      const candidate = buildWebsiteScreenshotCandidate({
        screenshotUrl: 'https://cdn.insturix.com/shot.png',
        jobId: 'job_1',
        brandId: 'brand_x',
        observedAt: '2026-07-04T00:00:00.000Z',
        sourceUrl: 'https://insturix.com',
      });
      expect(candidate.signalPath).toBe('assets.socialPreviewImages');
      // The visual-identity engine reads the URL off normalizedValue/rawValue to make the tile.
      expect(candidate.normalizedValue).toBe('https://cdn.insturix.com/shot.png');
      expect(candidate.rawValue).toBe('https://cdn.insturix.com/shot.png');
      expect(candidate.sourceField).toBe('website.screenshot');
      expect(candidate.jobId).toBe('job_1');
      expect(candidate.brandId).toBe('brand_x');
      expect(candidate.confidence).toBeGreaterThan(0.55);
    });
  });
});
