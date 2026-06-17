import type {
  BrandWebsiteBrowserFallbackInput,
  BrandWebsiteBrowserFallbackSnapshot,
  BrandWebsiteStylesheetSnapshot,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';

export interface BrandVaultBrowserRenderEnvironment {
  [key: string]: string | undefined;
  BRAND_VAULT_BROWSER_RENDER_ENDPOINT?: string;
  BRAND_VAULT_BROWSER_RENDER_PROVIDER?: string;
  BRAND_VAULT_BROWSER_RENDER_TOKEN?: string;
  BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS?: string;
  BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS?: string;
  BRAND_VAULT_PLAYWRIGHT_WAIT_UNTIL?: string;
  BRAND_VAULT_FIRECRAWL_TIMEOUT_MS?: string;
  BRAND_VAULT_FIRECRAWL_WAIT_MS?: string;
  FIRECRAWL_API_KEY?: string;
  FIRECRAWL_API_URL?: string;
}

export type BrandVaultBrowserRenderFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type BrandVaultBrowserRenderProvider = 'endpoint' | 'local_playwright' | 'firecrawl' | 'off';

export interface BrandVaultPlaywrightBrowser {
  close: () => Promise<void>;
  newContext: (options: { userAgent?: string }) => Promise<BrandVaultPlaywrightContext>;
}

export interface BrandVaultPlaywrightContext {
  close: () => Promise<void>;
  newPage: () => Promise<BrandVaultPlaywrightPage>;
}

export interface BrandVaultPlaywrightPage {
  content: () => Promise<string>;
  evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T>;
  goto: (
    url: string,
    options: { timeout: number; waitUntil: BrandVaultPlaywrightWaitUntil },
  ) => Promise<BrandVaultPlaywrightResponse | null>;
}

export interface BrandVaultPlaywrightResponse {
  headers: () => Record<string, string>;
  status: () => number;
  url: () => string;
}

export interface BrandVaultPlaywrightModule {
  chromium: {
    launch: (options: { headless: true; args: string[] }) => Promise<BrandVaultPlaywrightBrowser>;
  };
}

export type BrandVaultPlaywrightWaitUntil = 'domcontentloaded' | 'load' | 'networkidle';

export interface BrandVaultLocalPlaywrightFallbackOptions {
  loadPlaywright?: () => Promise<BrandVaultPlaywrightModule>;
  timeoutMs?: number;
  waitUntil?: BrandVaultPlaywrightWaitUntil;
}

const DEFAULT_BROWSER_RENDER_TIMEOUT_MS = 12_000;
const MIN_BROWSER_RENDER_TIMEOUT_MS = 1_000;
const MAX_BROWSER_RENDER_TIMEOUT_MS = 25_000;
const DEFAULT_FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape';
const DEFAULT_FIRECRAWL_WAIT_MS = 1_000;
const MAX_FIRECRAWL_WAIT_MS = 5_000;
const DEFAULT_PLAYWRIGHT_WAIT_UNTIL: BrandVaultPlaywrightWaitUntil = 'domcontentloaded';
const PLAYWRIGHT_LAUNCH_ARGS = ['--disable-dev-shm-usage', '--no-sandbox'] as const;

export function createBrandVaultBrowserFallbackFetchFromEnvironment(
  env: BrandVaultBrowserRenderEnvironment = process.env,
  fetchFn: BrandVaultBrowserRenderFetch = fetch,
): FetchWebsiteBrandSnapshotOptions['browserFallbackFetchFn'] | undefined {
  const provider = parseProvider(env.BRAND_VAULT_BROWSER_RENDER_PROVIDER);
  if (provider === 'off') return undefined;

  const endpoint = env.BRAND_VAULT_BROWSER_RENDER_ENDPOINT?.trim();
  if (endpoint) {
    const token = env.BRAND_VAULT_BROWSER_RENDER_TOKEN?.trim();
    const timeoutMs = parseTimeoutMs(env.BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS);
    return async (input) => fetchBrowserRenderedSnapshot({ endpoint, token, timeoutMs, input, fetchFn });
  }

  if (provider === 'local_playwright') {
    return createBrandVaultLocalPlaywrightFallbackFetch({
      timeoutMs: parseTimeoutMs(env.BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS),
      waitUntil: parsePlaywrightWaitUntil(env.BRAND_VAULT_PLAYWRIGHT_WAIT_UNTIL),
    });
  }

  if (provider !== 'firecrawl') return undefined;

  const firecrawlApiKey = env.FIRECRAWL_API_KEY?.trim();
  if (!firecrawlApiKey) return undefined;

  return async (input) =>
    fetchFirecrawlRenderedSnapshot({
      apiKey: firecrawlApiKey,
      endpoint: env.FIRECRAWL_API_URL?.trim() || DEFAULT_FIRECRAWL_API_URL,
      input,
      fetchFn,
      timeoutMs: parseTimeoutMs(env.BRAND_VAULT_FIRECRAWL_TIMEOUT_MS),
      waitMs: parseBoundedInteger(env.BRAND_VAULT_FIRECRAWL_WAIT_MS, 0, MAX_FIRECRAWL_WAIT_MS, DEFAULT_FIRECRAWL_WAIT_MS),
    });
}

export function createBrandVaultLocalPlaywrightFallbackFetch(
  options: BrandVaultLocalPlaywrightFallbackOptions = {},
): NonNullable<FetchWebsiteBrandSnapshotOptions['browserFallbackFetchFn']> {
  return async (input) =>
    fetchLocalPlaywrightRenderedSnapshot({
      input,
      loadPlaywright: options.loadPlaywright ?? loadPlaywrightModule,
      timeoutMs: options.timeoutMs ?? DEFAULT_BROWSER_RENDER_TIMEOUT_MS,
      waitUntil: options.waitUntil ?? DEFAULT_PLAYWRIGHT_WAIT_UNTIL,
    });
}

async function fetchBrowserRenderedSnapshot(args: {
  endpoint: string;
  token?: string;
  timeoutMs: number;
  input: BrandWebsiteBrowserFallbackInput;
  fetchFn: BrandVaultBrowserRenderFetch;
}): Promise<BrandWebsiteBrowserFallbackSnapshot | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await args.fetchFn(args.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: renderRequestHeaders(args.token),
      body: JSON.stringify(renderRequestBody(args.input)),
    });
    if (!response.ok) return undefined;
    return responseToFallbackSnapshot(response, args.input.normalizedUrl);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function renderRequestHeaders(token: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    accept: 'application/json,text/html',
    'content-type': 'application/json',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function renderRequestBody(input: BrandWebsiteBrowserFallbackInput): Record<string, unknown> {
  return {
    url: input.normalizedUrl,
    normalizedUrl: input.normalizedUrl,
    reason: input.reason,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    htmlExcerpt: input.htmlExcerpt,
    now: input.now,
    userAgent: input.userAgent,
  };
}

async function fetchLocalPlaywrightRenderedSnapshot(args: {
  input: BrandWebsiteBrowserFallbackInput;
  loadPlaywright: () => Promise<BrandVaultPlaywrightModule>;
  timeoutMs: number;
  waitUntil: BrandVaultPlaywrightWaitUntil;
}): Promise<BrandWebsiteBrowserFallbackSnapshot | undefined> {
  let browser: BrandVaultPlaywrightBrowser | undefined;
  let context: BrandVaultPlaywrightContext | undefined;
  try {
    const playwright = await args.loadPlaywright();
    browser = await playwright.chromium.launch({
      headless: true,
      args: [...PLAYWRIGHT_LAUNCH_ARGS],
    });
    context = await browser.newContext({
      userAgent: args.input.userAgent,
    });
    const page = await context.newPage();
    const response = await page.goto(args.input.normalizedUrl, {
      timeout: args.timeoutMs,
      waitUntil: args.waitUntil,
    });
    const html = await page.content();
    if (!html.trim()) return undefined;
    const stylesheets = await extractPlaywrightStylesheets(page);

    return {
      normalizedUrl: response?.url() ?? args.input.normalizedUrl,
      html,
      contentType: response?.headers()['content-type'] ?? 'text/html',
      stylesheets,
      fetchWarnings: uniqueStrings([
        'Self-hosted Playwright browser-rendered evidence was used because direct Brand Vault website fetch did not produce usable HTML.',
        response ? `Self-hosted Playwright renderer received HTTP ${response.status()}.` : undefined,
        stylesheets?.length ? 'Self-hosted Playwright renderer attached CSSOM stylesheet evidence for color and font extraction.' : undefined,
      ]),
    };
  } catch {
    return undefined;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

async function extractPlaywrightStylesheets(
  page: BrandVaultPlaywrightPage,
): Promise<BrandWebsiteStylesheetSnapshot[] | undefined> {
  const stylesheets = await page.evaluate(() => {
    return Array.from(document.styleSheets)
      .map((sheet, index) => {
        try {
          const css = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n').trim();
          if (!css) return null;
          return {
            url: sheet.href || `${location.href}#playwright-stylesheet-${index}`,
            css,
            contentType: 'text/css',
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is { url: string; css: string; contentType: string } => Boolean(item));
  });
  return stylesheets.length > 0 ? stylesheets : undefined;
}

async function fetchFirecrawlRenderedSnapshot(args: {
  apiKey: string;
  endpoint: string;
  input: BrandWebsiteBrowserFallbackInput;
  fetchFn: BrandVaultBrowserRenderFetch;
  timeoutMs: number;
  waitMs: number;
}): Promise<BrandWebsiteBrowserFallbackSnapshot | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await args.fetchFn(args.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${args.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(firecrawlRequestBody(args.input, args.timeoutMs, args.waitMs)),
    });
    if (!response.ok) return undefined;
    const payload = await response.json().catch(() => null);
    return firecrawlPayloadToSnapshot(payload, args.input.normalizedUrl);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function firecrawlRequestBody(
  input: BrandWebsiteBrowserFallbackInput,
  timeoutMs: number,
  waitMs: number,
): Record<string, unknown> {
  return {
    url: input.normalizedUrl,
    formats: ['html', 'rawHtml', 'links', 'branding'],
    onlyMainContent: false,
    waitFor: waitMs,
    timeout: timeoutMs,
    removeBase64Images: true,
    blockAds: true,
    proxy: 'auto',
    ...(input.userAgent ? { headers: { 'User-Agent': input.userAgent } } : {}),
  };
}

function firecrawlPayloadToSnapshot(
  payload: unknown,
  requestedUrl: string,
): BrandWebsiteBrowserFallbackSnapshot | undefined {
  const record = objectRecord(payload) ?? {};
  const data = objectRecord(record.data) ?? record;
  const html = stringValue(data.html) ?? stringValue(data.rawHtml);
  if (!html?.trim()) return undefined;

  const metadata = objectRecord(data.metadata);
  const normalizedUrl =
    stringValue(metadata?.url) ??
    stringValue(metadata?.sourceURL) ??
    stringValue(data.url) ??
    requestedUrl;
  const brandingStylesheet = firecrawlBrandingStylesheet(data.branding, normalizedUrl);
  return {
    normalizedUrl,
    html,
    contentType: stringValue(metadata?.contentType) ?? 'text/html',
    stylesheets: brandingStylesheet ? [brandingStylesheet] : undefined,
    fetchWarnings: uniqueStrings([
      'Firecrawl browser-rendered evidence was used because direct Brand Vault website fetch did not produce usable HTML.',
      stringValue(data.warning),
      stringValue(metadata?.error),
      brandingStylesheet ? 'Firecrawl branding metadata was converted into draft-only color and font stylesheet evidence.' : undefined,
    ]),
  };
}

async function responseToFallbackSnapshot(
  response: Response,
  requestedUrl: string,
): Promise<BrandWebsiteBrowserFallbackSnapshot | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return snapshotFromJsonPayload(payload, requestedUrl);
  }

  const html = await response.text();
  if (!html.trim()) return undefined;
  return {
    normalizedUrl: response.url || requestedUrl,
    html,
    contentType: contentType || 'text/html',
    fetchWarnings: ['Browser render endpoint returned raw HTML fallback evidence.'],
  };
}

function snapshotFromJsonPayload(
  payload: unknown,
  requestedUrl: string,
): BrandWebsiteBrowserFallbackSnapshot | undefined {
  const record = objectRecord(payload) ?? {};
  const data = objectRecord(record.data) ?? objectRecord(record.result) ?? record;
  const html = stringValue(data.html) ?? stringValue(data.content);
  if (!html?.trim()) return undefined;

  return {
    normalizedUrl:
      stringValue(data.normalizedUrl) ??
      stringValue(data.finalUrl) ??
      stringValue(data.url) ??
      requestedUrl,
    html,
    contentType: stringValue(data.contentType) ?? stringValue(data.mimeType) ?? 'text/html',
    stylesheets: stylesheetSnapshots(data.stylesheets),
    stylesheetWarnings: stringArray(data.stylesheetWarnings),
    fetchWarnings: stringArray(data.fetchWarnings ?? data.warnings),
  };
}

function stylesheetSnapshots(value: unknown): BrandWebsiteStylesheetSnapshot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const snapshots = value
    .map((item) => {
      const record = objectRecord(item);
      const url = stringValue(record?.url);
      const css = stringValue(record?.css);
      if (!url || !css) return null;
      const contentType = stringValue(record?.contentType);
      return {
        url,
        css,
        ...(contentType ? { contentType } : {}),
      };
    })
    .filter((item): item is BrandWebsiteStylesheetSnapshot => Boolean(item));
  return snapshots.length > 0 ? snapshots : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  return values.length > 0 ? values : undefined;
}

function firecrawlBrandingStylesheet(
  value: unknown,
  normalizedUrl: string,
): BrandWebsiteStylesheetSnapshot | undefined {
  const branding = objectRecord(value);
  if (!branding) return undefined;

  const lines = firecrawlBrandingColorLines(branding.colors);
  const fontFamily = firecrawlFontFamily(branding.typography);
  if (fontFamily) lines.push(`body { font-family: ${JSON.stringify(fontFamily)}, sans-serif; }`);
  if (lines.length === 0) return undefined;

  return {
    url: `${normalizedUrl}#firecrawl-branding`,
    css: lines.join('\n'),
    contentType: 'text/css',
  };
}

function firecrawlBrandingColorLines(value: unknown): string[] {
  const colors = objectRecord(value);
  if (!colors) return [];
  const entries = Object.entries(colors)
    .map(([name, color]) => {
      const normalized = normalizeHexColor(stringValue(color));
      if (!normalized) return null;
      return `--firecrawl-${cssIdentifier(name)}: ${normalized};`;
    })
    .filter((line): line is string => Boolean(line));
  return entries.length > 0 ? [`:root { ${entries.join(' ')} }`] : [];
}

function firecrawlFontFamily(value: unknown): string | undefined {
  const typography = objectRecord(value);
  const fontFamilies = objectRecord(typography?.fontFamilies);
  const family = stringValue(fontFamilies?.primary) ?? stringValue(fontFamilies?.heading);
  if (!family) return undefined;
  const clean = family.replace(/[^a-zA-Z0-9 ,._-]+/g, '').trim();
  return clean || undefined;
}

function cssIdentifier(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'color';
}

function normalizeHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] | undefined {
  const unique = [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  return unique.length > 0 ? unique : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseProvider(value: string | undefined): BrandVaultBrowserRenderProvider | undefined {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_');
  if (!normalized) return undefined;
  if (normalized === 'endpoint' || normalized === 'self_hosted' || normalized === 'custom') return 'endpoint';
  if (normalized === 'playwright' || normalized === 'local_playwright') return 'local_playwright';
  if (normalized === 'firecrawl') return 'firecrawl';
  if (normalized === 'off' || normalized === 'disabled' || normalized === 'none') return 'off';
  return undefined;
}

function parsePlaywrightWaitUntil(value: string | undefined): BrandVaultPlaywrightWaitUntil {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'domcontentloaded' || normalized === 'load' || normalized === 'networkidle') return normalized;
  return DEFAULT_PLAYWRIGHT_WAIT_UNTIL;
}

async function loadPlaywrightModule(): Promise<BrandVaultPlaywrightModule> {
  const packageName = 'playwright';
  const loadedPackage = await import(packageName);
  return loadedPackage as BrandVaultPlaywrightModule;
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : DEFAULT_BROWSER_RENDER_TIMEOUT_MS;
  if (!Number.isFinite(parsed)) return DEFAULT_BROWSER_RENDER_TIMEOUT_MS;
  return Math.min(MAX_BROWSER_RENDER_TIMEOUT_MS, Math.max(MIN_BROWSER_RENDER_TIMEOUT_MS, parsed));
}

function parseBoundedInteger(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
