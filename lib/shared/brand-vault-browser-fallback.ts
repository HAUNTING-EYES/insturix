import type {
  BrandWebsiteBrowserFallbackInput,
  BrandWebsiteBrowserFallbackSnapshot,
  BrandWebsiteStylesheetSnapshot,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';

export interface BrandVaultBrowserRenderEnvironment {
  [key: string]: string | undefined;
  BRAND_VAULT_BROWSER_RENDER_ENDPOINT?: string;
  BRAND_VAULT_BROWSER_RENDER_TOKEN?: string;
  BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS?: string;
}

export type BrandVaultBrowserRenderFetch = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_BROWSER_RENDER_TIMEOUT_MS = 12_000;
const MIN_BROWSER_RENDER_TIMEOUT_MS = 1_000;
const MAX_BROWSER_RENDER_TIMEOUT_MS = 25_000;

export function createBrandVaultBrowserFallbackFetchFromEnvironment(
  env: BrandVaultBrowserRenderEnvironment = process.env,
  fetchFn: BrandVaultBrowserRenderFetch = fetch,
): FetchWebsiteBrandSnapshotOptions['browserFallbackFetchFn'] | undefined {
  const endpoint = env.BRAND_VAULT_BROWSER_RENDER_ENDPOINT?.trim();
  if (!endpoint) return undefined;

  const token = env.BRAND_VAULT_BROWSER_RENDER_TOKEN?.trim();
  const timeoutMs = parseTimeoutMs(env.BRAND_VAULT_BROWSER_RENDER_TIMEOUT_MS);

  return async (input) => fetchBrowserRenderedSnapshot({ endpoint, token, timeoutMs, input, fetchFn });
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

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : DEFAULT_BROWSER_RENDER_TIMEOUT_MS;
  if (!Number.isFinite(parsed)) return DEFAULT_BROWSER_RENDER_TIMEOUT_MS;
  return Math.min(MAX_BROWSER_RENDER_TIMEOUT_MS, Math.max(MIN_BROWSER_RENDER_TIMEOUT_MS, parsed));
}
