import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type {
  BrandSignal,
  BrandSignalEvidence,
  BrandSignalProfile,
} from './brand-signal-profile';
import { sanitizeEvidenceExcerpt } from './brand-signal-profile';
import {
  createBrandSignalProfileDraft,
  type BrandSignalLifecycleOptions,
} from './brand-signal-lifecycle';
import type {
  BrandEvidenceCandidate,
  BrandWebsiteAssetAvailability,
  BrandWebsiteAssetProbeOptions,
  BrandWebsiteAssetProbeResult,
  BrandWebsiteDraftInput,
  BrandWebsiteDraftResult,
  BrandWebsiteFetchFallbackReason,
  BrandWebsiteRenderedPrimitiveEvidence,
  BrandWebsiteSignalProfileResult,
  BrandWebsiteSnapshot,
  BrandWebsiteStylesheetSnapshot,
  BrandWebsiteSupplementalTextEvidence,
  FallbackSignal,
  FetchWebsiteBrandSnapshotOptions,
  MakeSignal,
  SignalSource,
} from './brand-website-refinery-types';
export type {
  BrandEvidenceCandidate,
  BrandEvidenceCandidateAuthority,
  BrandEvidenceCandidateSourceType,
  BrandRefineryJob,
  BrandWebsiteAssetAvailability,
  BrandWebsiteAssetAvailabilityStatus,
  BrandWebsiteAssetProbeOptions,
  BrandWebsiteAssetProbeResult,
  BrandWebsiteDraftInput,
  BrandWebsiteDraftResult,
  BrandWebsiteSignalProfileResult,
  BrandWebsiteSnapshot,
  BrandWebsiteStylesheetSnapshot,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';
import {
  chooseAccent,
  clamp01,
  contrastRatio,
  candidateOnly,
  DARK_SURFACE,
  domainBrand,
  extractNextDataTextEvidenceFromHtml,
  extractLinkedStylesheetUrls,
  firstDefined,
  inferAudience,
  inferCasingBias,
  inferCategory,
  inferContrastBias,
  inferHarmony,
  inferHookArchetypes,
  inferIndustry,
  inferProductServices,
  inferProofStyle,
  inferRecurringPhrases,
  inferTypographyCategory,
  LIGHT_SURFACE,
  nextEvidenceId,
  normalizeBrandWebsiteUrl,
  parseWebsiteHtml,
  saturation,
  score,
  source,
  stringifyExcerpt,
  titleBrand,
  uniqueText,
} from './brand-website-refinery-utils';
export { normalizeBrandWebsiteUrl } from './brand-website-refinery-utils';

const ASSET_SIGNAL_PATHS = new Set(['assets.logoCandidates', 'assets.productImages', 'assets.socialPreviewImages']);
const DEFAULT_ASSET_PROBE_MAX_CANDIDATES = 16;
const UNAVAILABLE_ASSET_CONFIDENCE_CEILING = 0.18;
const UNKNOWN_ASSET_CONFIDENCE_CEILING = 0.38;
const DEFAULT_LINKED_STYLESHEET_MAX_COUNT = 8;
const DEFAULT_LINKED_STYLESHEET_MAX_BYTES = 320_000;
const DEFAULT_LINKED_STYLESHEET_TIMEOUT_MS = 4_000;
const DEFAULT_SHOPIFY_JSON_TIMEOUT_MS = 4_000;
const DEFAULT_SHOPIFY_PRODUCTS_LIMIT = 12;
const DEFAULT_SHOPIFY_COLLECTIONS_LIMIT = 12;
const DEFAULT_WEBSITE_FETCH_MAX_REDIRECTS = 5;
const DEFAULT_BRAND_VAULT_USER_AGENT = 'InsturixBrandVault/1.0';
const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BROWSER_CHALLENGE_PATTERN = /\b(?:just a moment|checking your browser|verifying your browser|security checkpoint|website owner\?|attention required|verify you are human|captcha|pardon our interruption|access denied|request blocked)\b/i;
const JAVASCRIPT_SHELL_PATTERN = /\b(?:please enable javascript|enable javascript|requires javascript|enable cookies|please use a different browser|javascript is disabled)\b/i;
const HYDRATION_ROOT_MARKER_PATTERN = /\b__NEXT_DATA__\b|<[^>]+\bid=["'](?:__next|root|app)["']|<[^>]+\bdata-reactroot\b/i;
const SHOPIFY_MARKER_PATTERN = /\b(?:cdn\.shopify\.com|Shopify\.theme|myshopify\.com)\b/i;

interface WebsiteFetchAttempt {
  normalizedUrl: string;
  html: string;
  contentType?: string;
  httpStatus: number;
  ok: boolean;
  reason?: BrandWebsiteFetchFallbackReason;
}

export async function fetchWebsiteBrandSnapshot(
  websiteUrl: string,
  options: FetchWebsiteBrandSnapshotOptions = {},
): Promise<BrandWebsiteSnapshot> {
  const normalizedUrl = normalizeBrandWebsiteUrl(websiteUrl);
  const fetchFn = options.fetchFn ?? fetch;
  const fetchWarnings: string[] = [];
  let attempt = await fetchWebsiteHtmlAttempt(
    normalizedUrl,
    fetchFn,
    options,
    options.userAgent ?? DEFAULT_BRAND_VAULT_USER_AGENT,
    false,
  );

  if (attempt.reason && options.disableBrowserLikeRetry !== true && shouldRetryWithBrowserHeaders(attempt.reason)) {
    fetchWarnings.push(`Brand Vault retried the website with browser-like request headers because the direct scan looked blocked (${describeFetchFallbackReason(attempt.reason)}).`);
    const browserAttempt = await fetchWebsiteHtmlAttempt(
      normalizedUrl,
      fetchFn,
      options,
      options.browserUserAgent ?? DEFAULT_BROWSER_USER_AGENT,
      true,
    );
    if (!browserAttempt.reason || isBetterWebsiteFetchAttempt(browserAttempt, attempt)) {
      attempt = browserAttempt;
    }
  }

  if (attempt.reason && options.browserFallbackFetchFn) {
    const fallback = await resolveBrowserFallbackSnapshot({
      attempt,
      now: options.now,
      userAgent: options.browserUserAgent ?? DEFAULT_BROWSER_USER_AGENT,
      fetchFn: options.browserFallbackFetchFn,
    });
    if (fallback) return fallback;
    fetchWarnings.push(`Brand Vault attempted browser-rendered fallback evidence but the configured renderer returned no usable HTML for ${describeFetchFallbackReason(attempt.reason)}.`);
  }

  if (attempt.reason && isBlockingFetchFallbackReason(attempt.reason)) {
    throw new Error(`Website fetch produced only blocked or challenge HTML (${describeFetchFallbackReason(attempt.reason)}). Browser fallback or uploaded brand evidence is required.`);
  }

  if (!attempt.ok) {
    const reason = attempt.reason && attempt.reason !== 'server_error'
      ? ` ${describeFetchFallbackReason(attempt.reason)}; browser fallback or uploaded brand evidence is required.`
      : '';
    throw new Error(`Website fetch failed with HTTP ${attempt.httpStatus}.${reason}`);
  }

  if (attempt.reason) {
    fetchWarnings.push(`Website scan may be incomplete: ${describeFetchFallbackReason(attempt.reason)}. Add browser-rendered evidence, uploads, or social evidence before approving low-confidence draft signals.`);
  }

  return snapshotFromAttempt({
    attempt,
    fetchFn,
    options,
    fetchWarnings,
    browserFallbackRequired: Boolean(attempt.reason),
    fetchFallbackReason: attempt.reason,
  });
}

async function fetchWebsiteHtmlAttempt(
  url: string,
  fetchFn: NonNullable<FetchWebsiteBrandSnapshotOptions['fetchFn']>,
  options: FetchWebsiteBrandSnapshotOptions,
  userAgent: string,
  browserLike: boolean,
): Promise<WebsiteFetchAttempt> {
  let nextUrl = url;
  for (let redirectCount = 0; redirectCount <= DEFAULT_WEBSITE_FETCH_MAX_REDIRECTS; redirectCount += 1) {
    await validatePublicWebsiteFetchTarget(nextUrl, options);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    try {
      const response = await fetchFn(nextUrl, {
        signal: controller.signal,
        headers: websiteFetchHeaders(userAgent, browserLike),
        redirect: 'manual',
      });
      if (isRedirectResponse(response)) {
        const location = response.headers.get('location');
        if (location && redirectCount < DEFAULT_WEBSITE_FETCH_MAX_REDIRECTS) {
          nextUrl = normalizeBrandWebsiteUrl(new URL(location, nextUrl).toString());
          continue;
        }
      }
      const html = await response.text();
      const contentType = response.headers.get('content-type') ?? undefined;
      return {
        normalizedUrl: normalizeBrandWebsiteUrl(response.url || nextUrl),
        html,
        contentType,
        httpStatus: response.status,
        ok: response.ok,
        reason: detectWebsiteFetchFallbackReason(response.status, contentType, html),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    normalizedUrl: nextUrl,
    html: '',
    httpStatus: 508,
    ok: false,
    reason: 'server_error',
  };
}

function isRedirectResponse(response: Response): boolean {
  return response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308;
}

async function validatePublicWebsiteFetchTarget(
  normalizedUrl: string,
  options: FetchWebsiteBrandSnapshotOptions,
): Promise<void> {
  if (options.allowPrivateNetworkTargets) return;
  const url = new URL(normalizedUrl);
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (isPrivateOrLocalHostname(hostname)) {
    throw new Error('Brand Vault cannot scan private or local network targets.');
  }
  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    if (!isPublicIPAddress(hostname, ipVersion)) {
      throw new Error('Brand Vault cannot scan private or local network targets.');
    }
    return;
  }
  if (options.fetchFn) return;
  const addresses = await lookup(hostname, { all: true, verbatim: false });
  if (addresses.some((entry) => !isPublicIPAddress(entry.address, isIP(entry.address)))) {
    throw new Error('Brand Vault cannot scan private or local network targets.');
  }
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'metadata.google.internal';
}

function isPublicIPAddress(address: string, ipVersion: number): boolean {
  if (ipVersion === 4) return isPublicIPv4(address);
  if (ipVersion === 6) return isPublicIPv6(address);
  return true;
}

function isPublicIPv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return !(a === 198 && (b === 18 || b === 19));
}

function isPublicIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:')) return false;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false;
  if (normalized.startsWith('::ffff:')) return isPublicIPv4(normalized.slice('::ffff:'.length));
  return true;
}

function websiteFetchHeaders(userAgent: string, browserLike: boolean): HeadersInit {
  const headers: Record<string, string> = {
    'user-agent': userAgent,
    accept: 'text/html,application/xhtml+xml',
  };
  if (browserLike) {
    headers.accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    headers['accept-language'] = 'en-US,en;q=0.9';
    headers['upgrade-insecure-requests'] = '1';
  }
  return headers;
}

function detectWebsiteFetchFallbackReason(
  httpStatus: number,
  contentType: string | undefined,
  html: string,
): BrandWebsiteFetchFallbackReason | undefined {
  const compact = html.replace(/\s+/g, ' ').trim();
  const visibleText = isHtmlPayload(contentType, html) ? visibleBodyTextFromHtml(html) : '';
  const challengeText = visibleText || compact;
  if (httpStatus === 429) return 'rate_limited';
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 406 || httpStatus === 409 || httpStatus === 418 || httpStatus === 451) {
    return 'http_blocked';
  }
  if (httpStatus >= 500 && BROWSER_CHALLENGE_PATTERN.test(challengeText)) return 'browser_challenge';
  if (httpStatus >= 500) return 'server_error';
  if (!isHtmlPayload(contentType, html)) return undefined;
  if (BROWSER_CHALLENGE_PATTERN.test(challengeText)) return 'browser_challenge';
  if (visibleText.length < 300 && JAVASCRIPT_SHELL_PATTERN.test(compact)) return 'javascript_shell';
  if (visibleText.length < 40 && extractNextDataTextEvidenceFromHtml(html).length > 0) return undefined;
  if (visibleText.length < 40 && HYDRATION_ROOT_MARKER_PATTERN.test(html)) return 'javascript_shell';
  if (!visibleText || visibleText.length < 40) return 'empty_html';
  return undefined;
}

function visibleBodyTextFromHtml(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  return body
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldRetryWithBrowserHeaders(reason: BrandWebsiteFetchFallbackReason): boolean {
  return reason === 'http_blocked' || reason === 'rate_limited' || reason === 'browser_challenge' || reason === 'javascript_shell';
}

function isBlockingFetchFallbackReason(reason: BrandWebsiteFetchFallbackReason): boolean {
  return reason === 'http_blocked' || reason === 'rate_limited' || reason === 'browser_challenge';
}

function isBetterWebsiteFetchAttempt(candidate: WebsiteFetchAttempt, current: WebsiteFetchAttempt): boolean {
  if (!candidate.reason && current.reason) return true;
  if (candidate.ok && !current.ok) return true;
  return candidate.ok === current.ok && candidate.html.length > current.html.length * 1.5;
}

async function resolveBrowserFallbackSnapshot(args: {
  attempt: WebsiteFetchAttempt;
  now?: string;
  userAgent: string;
  fetchFn: NonNullable<FetchWebsiteBrandSnapshotOptions['browserFallbackFetchFn']>;
}): Promise<BrandWebsiteSnapshot | undefined> {
  const fallback = await args.fetchFn({
    normalizedUrl: args.attempt.normalizedUrl,
    reason: args.attempt.reason ?? 'browser_challenge',
    httpStatus: args.attempt.httpStatus,
    contentType: args.attempt.contentType,
    htmlExcerpt: sanitizeEvidenceExcerpt(args.attempt.html, 320),
    now: args.now,
    userAgent: args.userAgent,
  });
  if (!fallback?.html.trim()) return undefined;
  const fallbackContentType = fallback.contentType ?? 'text/html';
  const fallbackReason = detectWebsiteFetchFallbackReason(200, fallbackContentType, fallback.html);
  if (fallbackReason) return undefined;
  return {
    normalizedUrl: normalizeBrandWebsiteUrl(fallback.normalizedUrl ?? args.attempt.normalizedUrl),
    html: fallback.html,
    fetchedAt: args.now ?? new Date().toISOString(),
    contentType: fallback.contentType ?? 'text/html',
    stylesheets: fallback.stylesheets,
    supplementalText: fallback.supplementalText,
    renderedPrimitives: fallback.renderedPrimitives,
    stylesheetWarnings: fallback.stylesheetWarnings,
    fetchWarnings: uniqueText([
      `Brand Vault used browser-rendered fallback evidence because the direct website scan looked blocked (${describeFetchFallbackReason(args.attempt.reason ?? 'browser_challenge')}).`,
      ...(fallback.fetchWarnings ?? []),
    ]),
    browserFallbackRequired: false,
  };
}

async function snapshotFromAttempt(args: {
  attempt: WebsiteFetchAttempt;
  fetchFn: NonNullable<FetchWebsiteBrandSnapshotOptions['fetchFn']>;
  options: FetchWebsiteBrandSnapshotOptions;
  fetchWarnings: string[];
  browserFallbackRequired: boolean;
  fetchFallbackReason?: BrandWebsiteFetchFallbackReason;
}): Promise<BrandWebsiteSnapshot> {
  const stylesheetResult = await fetchLinkedWebsiteStylesheets({
    normalizedUrl: args.attempt.normalizedUrl,
    html: args.attempt.html,
    contentType: args.attempt.contentType,
    fetchFn: args.fetchFn,
    options: args.options,
  });
  const shopifyResult = await fetchShopifySupplementalText({
    normalizedUrl: args.attempt.normalizedUrl,
    html: args.attempt.html,
    fetchFn: args.fetchFn,
    options: args.options,
  });

  return {
    normalizedUrl: args.attempt.normalizedUrl,
    html: args.attempt.html,
    fetchedAt: args.options.now ?? new Date().toISOString(),
    contentType: args.attempt.contentType,
    stylesheets: stylesheetResult.stylesheets,
    supplementalText: shopifyResult.supplementalText,
    stylesheetWarnings: stylesheetResult.warnings,
    fetchWarnings: uniqueText([...args.fetchWarnings, ...shopifyResult.warnings]),
    browserFallbackRequired: args.browserFallbackRequired,
    fetchFallbackReason: args.fetchFallbackReason,
  };
}

async function fetchShopifySupplementalText(args: {
  normalizedUrl: string;
  html: string;
  fetchFn: NonNullable<FetchWebsiteBrandSnapshotOptions['fetchFn']>;
  options: FetchWebsiteBrandSnapshotOptions;
}): Promise<{ supplementalText: BrandWebsiteSupplementalTextEvidence[]; warnings: string[] }> {
  if (!SHOPIFY_MARKER_PATTERN.test(args.html)) return { supplementalText: [], warnings: [] };
  const baseUrl = new URL(args.normalizedUrl);
  const [products, collections] = await Promise.all([
    fetchShopifyJsonEndpoint({
      baseUrl,
      path: '/products.json',
      sourceField: 'shopify.products',
      fetchFn: args.fetchFn,
      options: args.options,
      limit: DEFAULT_SHOPIFY_PRODUCTS_LIMIT,
      readItems: readShopifyProducts,
    }),
    fetchShopifyJsonEndpoint({
      baseUrl,
      path: '/collections.json',
      sourceField: 'shopify.collections',
      fetchFn: args.fetchFn,
      options: args.options,
      limit: DEFAULT_SHOPIFY_COLLECTIONS_LIMIT,
      readItems: readShopifyCollections,
    }),
  ]);

  return {
    supplementalText: [...products.supplementalText, ...collections.supplementalText],
    warnings: [...products.warnings, ...collections.warnings],
  };
}

async function fetchShopifyJsonEndpoint(args: {
  baseUrl: URL;
  path: string;
  sourceField: string;
  fetchFn: NonNullable<FetchWebsiteBrandSnapshotOptions['fetchFn']>;
  options: FetchWebsiteBrandSnapshotOptions;
  limit: number;
  readItems: (value: unknown, limit: number) => string[];
}): Promise<{ supplementalText: BrandWebsiteSupplementalTextEvidence[]; warnings: string[] }> {
  const url = new URL(args.path, args.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.options.stylesheetTimeoutMs ?? DEFAULT_SHOPIFY_JSON_TIMEOUT_MS);
  try {
    const response = await args.fetchFn(url.href, {
      signal: controller.signal,
      headers: {
        'user-agent': args.options.userAgent ?? DEFAULT_BRAND_VAULT_USER_AGENT,
        accept: 'application/json,text/plain,*/*;q=0.8',
      },
    });
    if (!response.ok) {
      return { supplementalText: [], warnings: [`Brand Vault skipped ${args.sourceField}: HTTP ${response.status}.`] };
    }
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return {
        supplementalText: [],
        warnings: [`Brand Vault skipped ${args.sourceField}: non-JSON response${contentType ? ` (${contentType})` : ''}.`],
      };
    }
    const supplementalText = args.readItems(json, args.limit).map((text) => ({
      sourceField: args.sourceField,
      sourceUrl: url.href,
      text,
      confidence: 0.58,
    }));
    return { supplementalText, warnings: [] };
  } catch (error) {
    return { supplementalText: [], warnings: [`Brand Vault skipped ${args.sourceField}: ${formatUnknownError(error)}`] };
  } finally {
    clearTimeout(timeout);
  }
}

function readShopifyProducts(value: unknown, limit: number): string[] {
  if (!isRecord(value) || !Array.isArray(value.products)) return [];
  return uniqueText(value.products.slice(0, limit).flatMap((item) => {
    if (!isRecord(item)) return undefined;
    const title = readRecordString(item, 'title');
    const description = stripHtml(readRecordString(item, 'body_html'));
    return [
      title,
      description,
      readRecordString(item, 'product_type'),
      uniqueText([title, description, readRecordString(item, 'vendor')]).join('. '),
    ];
  }));
}

function readShopifyCollections(value: unknown, limit: number): string[] {
  if (!isRecord(value) || !Array.isArray(value.collections)) return [];
  return uniqueText(value.collections.slice(0, limit).flatMap((item) => {
    if (!isRecord(item)) return undefined;
    const title = readRecordString(item, 'title');
    const description = stripHtml(readRecordString(item, 'body_html'));
    return [title, description, uniqueText([title, description]).join('. ')];
  }));
}

function readRecordString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === 'string' ? item.trim() || undefined : undefined;
}

function stripHtml(value: string | undefined): string | undefined {
  return value
    ?.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim() || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function describeFetchFallbackReason(reason: BrandWebsiteFetchFallbackReason): string {
  switch (reason) {
    case 'http_blocked':
      return 'the site returned a bot/permission block';
    case 'rate_limited':
      return 'the site rate-limited the scan';
    case 'server_error':
      return 'the site returned a server error';
    case 'browser_challenge':
      return 'the page looked like a browser challenge';
    case 'javascript_shell':
      return 'the page required JavaScript or a modern browser';
    case 'empty_html':
      return 'the page returned almost no readable HTML';
  }
}

async function fetchLinkedWebsiteStylesheets(args: {
  normalizedUrl: string;
  html: string;
  contentType?: string;
  fetchFn: NonNullable<FetchWebsiteBrandSnapshotOptions['fetchFn']>;
  options: FetchWebsiteBrandSnapshotOptions;
}): Promise<{ stylesheets: BrandWebsiteStylesheetSnapshot[]; warnings: string[] }> {
  if (args.options.fetchLinkedStylesheets === false || !isHtmlPayload(args.contentType, args.html)) {
    return { stylesheets: [], warnings: [] };
  }

  const urls = extractLinkedStylesheetUrls(
    args.html,
    args.normalizedUrl,
    args.options.maxLinkedStylesheets ?? DEFAULT_LINKED_STYLESHEET_MAX_COUNT,
  );
  const stylesheets: BrandWebsiteStylesheetSnapshot[] = [];
  const warnings: string[] = [];

  const results = await Promise.all(urls.map(async (url) => {
    try {
      return fetchLinkedWebsiteStylesheet(url, args.fetchFn, args.options);
    } catch (error) {
      return { warning: `Brand Vault skipped stylesheet ${url}: ${formatUnknownError(error)}` };
    }
  }));

  for (const result of results) {
    if (result.stylesheet) stylesheets.push(result.stylesheet);
    if (result.warning) warnings.push(result.warning);
  }

  return { stylesheets, warnings };
}

async function fetchLinkedWebsiteStylesheet(
  url: string,
  fetchFn: NonNullable<FetchWebsiteBrandSnapshotOptions['fetchFn']>,
  options: FetchWebsiteBrandSnapshotOptions,
): Promise<{ stylesheet?: BrandWebsiteStylesheetSnapshot; warning?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.stylesheetTimeoutMs ?? DEFAULT_LINKED_STYLESHEET_TIMEOUT_MS);
  const maxBytes = options.maxStylesheetBytes ?? DEFAULT_LINKED_STYLESHEET_MAX_BYTES;

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        'user-agent': options.userAgent ?? 'InsturixBrandVault/1.0',
        accept: 'text/css,*/*;q=0.8',
      },
    });
    const contentType = response.headers.get('content-type') ?? undefined;
    if (!response.ok) {
      return { warning: `Brand Vault skipped stylesheet ${url}: HTTP ${response.status}.` };
    }
    if (!isStylesheetPayload(url, contentType)) {
      return { warning: `Brand Vault skipped stylesheet ${url}: non-CSS response${contentType ? ` (${contentType})` : ''}.` };
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { warning: `Brand Vault skipped stylesheet ${url}: declared size exceeded ${maxBytes} bytes.` };
    }
    const css = await response.text();
    const clipped = css.slice(0, maxBytes);
    return {
      stylesheet: { url, css: clipped, contentType },
      warning: css.length > maxBytes ? `Brand Vault clipped stylesheet ${url} to ${maxBytes} characters for draft extraction.` : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isHtmlPayload(contentType: string | undefined, html: string): boolean {
  return !contentType || /text\/html|application\/xhtml\+xml/i.test(contentType) || /^\s*(?:<!doctype html|<html[\s>])/i.test(html);
}

function isStylesheetPayload(url: string, contentType: string | undefined): boolean {
  if (/\.css$/i.test(new URL(url).pathname)) return true;
  return !contentType || /text\/css|text\/plain|application\/octet-stream/i.test(contentType);
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'unknown error';
}

export async function verifyWebsiteBrandAssetCandidates(
  candidates: BrandEvidenceCandidate[],
  options: BrandWebsiteAssetProbeOptions = {},
): Promise<BrandWebsiteAssetProbeResult> {
  const fetchFn =
    options.fetchFn ??
    (options.allowDefaultFetch === false ? undefined : globalThis.fetch?.bind(globalThis));
  if (!fetchFn) {
    return { candidates, warnings: [], checkedCount: 0, unavailableCount: 0, unknownCount: 0 };
  }

  const candidateUrls = uniqueText(
    candidates
      .filter(isWebsiteAssetCandidate)
      .map((candidate) => (typeof candidate.normalizedValue === 'string' ? candidate.normalizedValue : undefined)),
  ).slice(0, options.maxCandidates ?? DEFAULT_ASSET_PROBE_MAX_CANDIDATES);
  if (candidateUrls.length === 0) {
    return { candidates, warnings: [], checkedCount: 0, unavailableCount: 0, unknownCount: 0 };
  }

  const availabilityByUrl = new Map(
    await Promise.all(candidateUrls.map(async (url) => [url, await probeWebsiteAssetUrl(url, fetchFn, options)] as const)),
  );

  const checkedCandidates = candidates.map((candidate) => {
    if (!isWebsiteAssetCandidate(candidate) || typeof candidate.normalizedValue !== 'string') return candidate;
    const availability = availabilityByUrl.get(candidate.normalizedValue);
    return availability ? applyAssetAvailability(candidate, availability) : candidate;
  });
  const availability = [...availabilityByUrl.values()];
  const unavailableCount = availability.filter((item) => item.status === 'unavailable').length;
  const unknownCount = availability.filter((item) => item.status === 'unknown').length;

  return {
    candidates: checkedCandidates,
    warnings: assetAvailabilityWarnings(unavailableCount, unknownCount),
    checkedCount: availability.length,
    unavailableCount,
    unknownCount,
  };
}

export function createWebsiteBrandSignalProfile(input: BrandWebsiteDraftInput): BrandWebsiteSignalProfileResult {
  const normalizedUrl = normalizeBrandWebsiteUrl(input.websiteUrl);
  const observedAt = input.fetchedAt ?? new Date().toISOString();
  const extractor = input.extractor ?? 'brand-website-refinery.v1';
  const parsed = parseWebsiteHtml({ ...input, websiteUrl: normalizedUrl });
  const evidence: BrandSignalEvidence[] = [];
  const candidates: BrandEvidenceCandidate[] = [];
  const makeSignal = createSignalFactory({ input, normalizedUrl, observedAt, extractor, evidence, candidates });
  const fallback = createFallbackFactory({ observedAt, extractor, evidence });

  const brandName = firstDefined(input.companyName, parsed.schemaName, parsed.siteName, titleBrand(parsed.title), domainBrand(parsed.host));
  const description = firstDefined(parsed.schemaDescription, parsed.metaDescription, parsed.headings[0], parsed.title, domainBrand(parsed.host));
  const textForInference = uniqueText([
    description,
    parsed.schemaDescription,
    parsed.metaDescription,
    parsed.bodyText,
    ...parsed.headings,
    ...parsed.ctas,
    ...parsed.proofSnippets,
  ]).join('. ');
  const primary = parsed.colors.find((color) => saturation(color) >= 0.08) ?? parsed.colors[0];
  const accent = chooseAccent(parsed.colors, primary);
  const neutrals = parsed.colors.filter((color) => saturation(color) < 0.12);
  const supporting = parsed.colors.filter((color) => color !== primary && color !== accent && !neutrals.includes(color));
  const unsafeOnDark = parsed.colors.filter((color) => contrastRatio(color, DARK_SURFACE) < 3);
  const unsafeOnLight = parsed.colors.filter((color) => contrastRatio(color, LIGHT_SURFACE) < 3);
  const rawTypography = parsed.fonts.join(', ');
  const typographySourceUrl = rawTypography ? stylesheetUrlForTypography(rawTypography, input.stylesheets ?? []) : undefined;
  const textForTaxonomy = taxonomyInferenceText(textForInference);
  const inferredIndustry = textForTaxonomy ? inferIndustry(textForTaxonomy, parsed.schemaTypes) : undefined;
  const inferredCategory = textForTaxonomy ? inferCategory(textForTaxonomy) : 'unknown';
  const primitiveSignals = renderedPrimitiveSignals(input.renderedPrimitives) ?? extractWebsitePrimitiveSignals(input.html, input.stylesheets ?? [], parsed);

  const profile: BrandSignalProfile = {
    version: 1,
    brandId: input.brandId,
    userId: input.userId,
    generatedAt: observedAt,
    identity: {
      brandName: makeSignal('identity.brandName', brandName, {
        candidateSourceType: input.companyName ? 'manual_user' : parsed.schemaName ? 'json_ld' : 'website_metadata',
        sourceField: input.companyName ? 'companyName' : parsed.schemaName ? 'jsonLd.name' : 'metadata.siteName',
        rawValue: brandName,
        normalizedValue: brandName,
        confidence: input.companyName ? 0.95 : parsed.schemaName || parsed.siteName ? 0.86 : 0.62,
        authorityClass: 'brand_fact',
        trustLevel: input.companyName ? 'manual_user_entry' : 'first_party_website',
      }),
      industry: inferredIndustry
        ? makeSignal('identity.industry', inferredIndustry, source('website_metadata', 'website.copy', textForTaxonomy, inferredIndustry, description ? 0.58 : 0.38, 'inferred_hint'))
        : undefined,
      category: makeSignal('identity.category', inferredCategory, source('website_metadata', 'website.copy', textForTaxonomy || textForInference, textForTaxonomy || textForInference, description ? 0.58 : 0.35, 'inferred_hint')),
      audience: makeSignal('identity.audience', inferAudience(textForInference), source('website', 'website.copy', textForInference, textForInference, textForInference ? 0.5 : 0.2, 'inferred_hint')),
      productServices: parsed.productServices.length
        ? makeSignal('identity.productServices', parsed.productServices, source('website', 'website.productServices', parsed.productServices, parsed.productServices, 0.58, 'inferred_hint'))
        : undefined,
      proofStyle: makeSignal('identity.proofStyle', inferProofStyle(textForInference), source('website', 'website.proofSnippets', parsed.proofSnippets, textForInference, parsed.proofSnippets.length ? 0.62 : 0.42, 'inferred_hint')),
    },
    assets: parsed.productImages.length
      ? {
          productImages: makeSignal('assets.productImages', parsed.productImages, source('website', 'website.productImages', parsed.productImageCandidates, parsed.productImages, 0.56, 'inferred_hint')),
        }
      : undefined,
    palette: {
      primary: primary ? makeSignal('palette.primary', primary, source('css', 'css.colors', parsed.colors, primary, 0.76, 'brand_fact')) : undefined,
      accent: accent ? makeSignal('palette.accent', accent, source('css', 'css.colors', parsed.colors, accent, 0.66, 'brand_preference')) : undefined,
      neutrals: parsed.colors.length ? makeSignal('palette.neutrals', neutrals, source('css', 'css.colors', parsed.colors, neutrals, 0.58, 'inferred_hint')) : fallback('palette.neutrals', [], 'No website color evidence.'),
      supporting: parsed.colors.length ? makeSignal('palette.supporting', supporting, source('css', 'css.colors', parsed.colors, supporting, 0.55, 'inferred_hint')) : fallback('palette.supporting', [], 'No website color evidence.'),
      unsafeOnDark: parsed.colors.length ? makeSignal('palette.unsafeOnDark', unsafeOnDark, source('css', 'css.colors', parsed.colors, unsafeOnDark, 0.76, 'process_default')) : fallback('palette.unsafeOnDark', [], 'No website color evidence.'),
      unsafeOnLight: parsed.colors.length ? makeSignal('palette.unsafeOnLight', unsafeOnLight, source('css', 'css.colors', parsed.colors, unsafeOnLight, 0.76, 'process_default')) : fallback('palette.unsafeOnLight', [], 'No website color evidence.'),
      contrastBias: parsed.colors.length ? makeSignal('palette.contrastBias', inferContrastBias(parsed.colors), source('css', 'css.colors', parsed.colors, parsed.colors, 0.52, 'inferred_hint')) : fallback('palette.contrastBias', 0.5, 'No website color evidence.'),
      harmony: primary && accent ? makeSignal('palette.harmony', inferHarmony(primary, accent), source('css', 'css.colors', parsed.colors, parsed.colors, 0.45, 'inferred_hint')) : fallback('palette.harmony', 'unknown', 'Need at least two website colors.'),
    },
    typography: {
      raw: rawTypography ? makeSignal('typography.raw', rawTypography, { ...source('css', 'css.fontFamily', parsed.fonts, rawTypography, 0.64, 'brand_preference'), sourceUrl: typographySourceUrl }) : undefined,
      category: rawTypography ? makeSignal('typography.category', inferTypographyCategory(rawTypography), { ...source('css', 'css.fontFamily', parsed.fonts, rawTypography, 0.5, 'inferred_hint'), sourceUrl: typographySourceUrl }) : fallback('typography.category', 'unknown', 'No website typography evidence.'),
      casingBias: parsed.headings.length ? makeSignal('typography.casingBias', inferCasingBias(parsed.headings), source('website', 'website.headings', parsed.headings, parsed.headings, 0.45, 'inferred_hint')) : fallback('typography.casingBias', 'unknown', 'No heading evidence.'),
    },
    visual: makeVisualSignals(primitiveSignals, makeSignal, fallback),
    motion: makeMotionSignals(primitiveSignals, makeSignal, fallback),
    voice: {
      assertiveness: makeSignal('voice.assertiveness', score(textForInference, ['bold', 'direct', 'guarantee', 'fast'], ['gentle', 'soft']), source('website', 'website.copy', textForInference, textForInference, 0.48, 'inferred_hint')),
      warmth: makeSignal('voice.warmth', score(textForInference, ['human', 'friendly', 'community', 'together'], ['enterprise-grade', 'compliance']), source('website', 'website.copy', textForInference, textForInference, 0.48, 'inferred_hint')),
      jargonDensity: makeSignal('voice.jargonDensity', score(textForInference, ['api', 'workflow', 'automation', 'analytics', 'infrastructure'], ['simple', 'easy']), source('website', 'website.copy', textForInference, textForInference, 0.48, 'inferred_hint')),
      humor: makeSignal('voice.humor', score(textForInference, ['fun', 'playful', 'witty'], ['serious', 'trusted']), source('website', 'website.copy', textForInference, textForInference, 0.42, 'inferred_hint')),
      defaultFormality: makeSignal('voice.defaultFormality', score(textForInference, ['enterprise', 'professional', 'trusted', 'secure'], ['casual', 'playful']), source('website', 'website.copy', textForInference, textForInference, 0.48, 'voice_default')),
      ctaDirectness: makeSignal('voice.ctaDirectness', parsed.ctas.length ? score(parsed.ctas.join(' '), ['start', 'get', 'book', 'buy', 'request'], ['learn', 'explore']) : 0.5, source('website', 'website.ctas', parsed.ctas, parsed.ctas, parsed.ctas.length ? 0.62 : 0.2, 'inferred_hint')),
      recurringPhrases: makeSignal('voice.recurringPhrases', inferRecurringPhrases(parsed.headings, parsed.ctas), source('website', 'website.headingsAndCtas', [...parsed.headings, ...parsed.ctas], [...parsed.headings, ...parsed.ctas], 0.55, 'voice_default')),
      killList: fallback('voice.killList', [], 'Website scan cannot infer prohibited brand phrases without human review.'),
      hookArchetypes: makeSignal('voice.hookArchetypes', inferHookArchetypes(parsed.headings), source('website', 'website.headings', parsed.headings, parsed.headings, parsed.headings.length ? 0.45 : 0.2, 'inferred_hint')),
    },
    evidence,
  };

  for (const logo of parsed.logoCandidates) {
    const candidate = candidateOnly('assets.logoCandidates', logo.url, 'logo_asset', logo.sourceField, normalizedUrl, observedAt, extractor, input);
    candidate.rawValue = {
      url: logo.rawValue,
      role: logo.role,
      sourceField: logo.sourceField,
    };
    candidate.confidence = logo.confidence;
    candidate.excerpt = sanitizeEvidenceExcerpt(`${logo.role} candidate from ${logo.sourceField}: ${logo.url}`);
    candidates.push(candidate);
  }
  for (const fontFace of parsed.fontFaces) {
    const candidate = candidateOnly('assets.fontFiles', fontFace.family, 'website_metadata', 'css.fontFace', normalizedUrl, observedAt, extractor, input);
    const value = { family: fontFace.family, files: fontFace.files, weights: fontFace.weights };
    candidate.rawValue = value;
    candidate.normalizedValue = value;
    candidate.excerpt = sanitizeEvidenceExcerpt(
      `${fontFace.family}: ${fontFace.files.length} font file(s)${fontFace.weights.length ? `, weights ${fontFace.weights.join('/')}` : ''}`,
    );
    candidates.push(candidate);
  }
  for (const image of parsed.socialPreviewImages) {
    candidates.push(candidateOnly('assets.socialPreviewImages', image, 'website_metadata', 'metadata.socialPreviewImage', normalizedUrl, observedAt, extractor, input));
  }
  for (const image of parsed.productImageCandidates) {
    const candidate = candidateOnly('assets.productImages', image.url, 'website_metadata', image.sourceField, normalizedUrl, observedAt, extractor, input);
    candidate.rawValue = {
      url: image.rawValue,
      altText: image.altText,
      context: image.context,
      sourceField: image.sourceField,
    };
    candidate.normalizedValue = {
      url: image.url,
      altText: image.altText,
      context: image.context,
      sourceField: image.sourceField,
    };
    candidate.confidence = image.confidence;
    candidate.excerpt = sanitizeEvidenceExcerpt(`Product or service image from ${image.sourceField}: ${image.altText ?? image.context ?? image.url}`);
    candidates.push(candidate);
  }
  appendNextDataSignalCandidates({
    input,
    normalizedUrl,
    observedAt,
    extractor,
    nextDataText: parsed.nextDataText,
    candidates,
  });
  appendSupplementalTextSignalCandidates({
    input,
    normalizedUrl,
    observedAt,
    extractor,
    supplementalText: parsed.supplementalText,
    candidates,
  });

  return { profile, candidates, normalizedUrl, warnings: parsed.colors.length ? [] : ['No website colors were detected.'] };
}

function appendNextDataSignalCandidates(args: {
  input: BrandWebsiteDraftInput;
  normalizedUrl: string;
  observedAt: string;
  extractor: string;
  nextDataText: string[];
  candidates: BrandEvidenceCandidate[];
}): void {
  const text = uniqueText(args.nextDataText).join('. ');
  if (!text) return;

  const add = (signalPath: string, normalizedValue: unknown, confidence: number): void => {
    args.candidates.push({
      id: `candidate_next_data_${signalPath.replace(/[^a-z0-9]+/gi, '_')}`,
      brandId: args.input.brandId,
      jobId: args.input.jobId,
      sourceType: 'website_metadata',
      sourceUrl: args.normalizedUrl,
      sourceField: 'nextData.pageProps',
      signalPath,
      rawValue: args.nextDataText,
      normalizedValue,
      excerpt: sanitizeEvidenceExcerpt(text),
      confidence,
      authorityClass: 'owned',
      observedAt: args.observedAt,
      extractorId: args.extractor,
    });
  };

  const audience = inferAudience(text);
  if (audience.length > 0) add('identity.audience', audience, 0.54);

  const phrases = inferRecurringPhrases(args.nextDataText, []);
  if (phrases.length > 0) add('voice.recurringPhrases', phrases, 0.56);

  const proofStyle = inferProofStyle(text);
  if (proofStyle !== 'unknown') add('identity.proofStyle', proofStyle, 0.56);
}

function appendSupplementalTextSignalCandidates(args: {
  input: BrandWebsiteDraftInput;
  normalizedUrl: string;
  observedAt: string;
  extractor: string;
  supplementalText: BrandWebsiteSupplementalTextEvidence[];
  candidates: BrandEvidenceCandidate[];
}): void {
  const groups = new Map<string, BrandWebsiteSupplementalTextEvidence[]>();
  for (const item of args.supplementalText) {
    if (!item.text.trim()) continue;
    groups.set(item.sourceField, [...(groups.get(item.sourceField) ?? []), item]);
  }

  for (const [sourceField, items] of groups) {
    const textValues = uniqueText(items.map((item) => item.text));
    const text = textValues.join('. ');
    if (!text) continue;
    const confidence = Math.max(...items.map((item) => item.confidence ?? 0.52));
    const sourceUrl = items.map((item) => item.sourceUrl).find((value): value is string => Boolean(value));
    const add = (signalPath: string, normalizedValue: unknown): void => {
      args.candidates.push({
        id: `candidate_${sourceField.replace(/[^a-z0-9]+/gi, '_')}_${signalPath.replace(/[^a-z0-9]+/gi, '_')}`,
        brandId: args.input.brandId,
        jobId: args.input.jobId,
        sourceType: 'website',
        sourceUrl: sourceUrl ?? args.normalizedUrl,
        sourceField,
        signalPath,
        rawValue: textValues,
        normalizedValue,
        excerpt: sanitizeEvidenceExcerpt(text),
        confidence,
        authorityClass: 'owned',
        observedAt: args.observedAt,
        extractorId: args.extractor,
      });
    };

    const audience = inferAudience(text);
    if (audience.length > 0) add('identity.audience', audience);

    const productServices = inferProductServices(textValues);
    if (productServices.length > 0) add('identity.productServices', productServices);

    const phrases = inferRecurringPhrases(textValues, []);
    if (phrases.length > 0) add('voice.recurringPhrases', phrases);

    const proofStyle = inferProofStyle(text);
    if (proofStyle !== 'unknown') add('identity.proofStyle', proofStyle);
  }
}

export function createWebsiteBrandSignalProfileDraft(
  input: BrandWebsiteDraftInput,
  options: BrandSignalLifecycleOptions = {},
): BrandWebsiteDraftResult {
  const result = createWebsiteBrandSignalProfile(input);
  return {
    ...result,
    record: createBrandSignalProfileDraft(result.profile, options),
  };
}

function isWebsiteAssetCandidate(candidate: BrandEvidenceCandidate): boolean {
  return ASSET_SIGNAL_PATHS.has(candidate.signalPath) && typeof candidate.normalizedValue === 'string';
}

async function probeWebsiteAssetUrl(
  url: string,
  fetchFn: NonNullable<BrandWebsiteAssetProbeOptions['fetchFn']>,
  options: BrandWebsiteAssetProbeOptions,
): Promise<BrandWebsiteAssetAvailability> {
  try {
    const head = await fetchWebsiteAsset(url, 'HEAD', fetchFn, options);
    if (head.ok || !shouldRetryAssetProbeWithGet(head.status)) {
      return responseAvailability(url, head, 'HEAD');
    }
    const get = await fetchWebsiteAsset(url, 'GET', fetchFn, options);
    return responseAvailability(url, get, 'GET');
  } catch (error) {
    return {
      status: 'unknown',
      method: 'HEAD',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchWebsiteAsset(
  url: string,
  method: 'HEAD' | 'GET',
  fetchFn: NonNullable<BrandWebsiteAssetProbeOptions['fetchFn']>,
  options: BrandWebsiteAssetProbeOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    return await fetchFn(url, {
      method,
      signal: controller.signal,
      headers: {
        'user-agent': options.userAgent ?? 'InsturixBrandVault/1.0',
        accept: 'image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function shouldRetryAssetProbeWithGet(status: number): boolean {
  return status === 403 || status === 405 || status === 501;
}

function responseAvailability(url: string, response: Response, method: 'HEAD' | 'GET'): BrandWebsiteAssetAvailability {
  const contentType = response.headers.get('content-type') ?? undefined;
  if (response.ok) {
    if (!isUsableAssetContentType(url, contentType)) {
      return {
        status: 'unavailable',
        method,
        httpStatus: response.status,
        contentType,
        reason: `non-image response${contentType ? ` (${contentType})` : ''}`,
      };
    }
    return {
      status: 'available',
      method,
      httpStatus: response.status,
      contentType,
    };
  }
  if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
    return {
      status: 'unknown',
      method,
      httpStatus: response.status,
      contentType,
      reason: `HTTP ${response.status}`,
    };
  }
  return {
    status: 'unavailable',
    method,
    httpStatus: response.status,
    contentType,
    reason: `HTTP ${response.status}`,
  };
}

function isUsableAssetContentType(url: string, contentType: string | undefined): boolean {
  if (!contentType) return true;
  const normalized = contentType.toLowerCase();
  if (/^image\//.test(normalized)) return true;
  if (/application\/octet-stream/.test(normalized)) return true;
  if (/text\/plain/.test(normalized) && /\.svg(?:$|\?)/i.test(new URL(url).pathname)) return true;
  return false;
}

function applyAssetAvailability(
  candidate: BrandEvidenceCandidate,
  availability: BrandWebsiteAssetAvailability,
): BrandEvidenceCandidate {
  if (availability.status === 'available') {
    return {
      ...candidate,
      rawValue: rawValueWithAssetAvailability(candidate.rawValue, availability),
      excerpt: sanitizeEvidenceExcerpt(`${candidate.excerpt ?? candidate.normalizedValue} Verified asset: HTTP ${availability.httpStatus}.`),
    };
  }
  const confidenceCeiling =
    availability.status === 'unavailable' ? UNAVAILABLE_ASSET_CONFIDENCE_CEILING : UNKNOWN_ASSET_CONFIDENCE_CEILING;
  return {
    ...candidate,
    rawValue: rawValueWithAssetAvailability(candidate.rawValue, availability),
    confidence: Math.min(candidate.confidence, confidenceCeiling),
    excerpt: sanitizeEvidenceExcerpt(`${candidate.excerpt ?? candidate.normalizedValue} Asset check ${availability.reason ?? availability.status}.`),
  };
}

function rawValueWithAssetAvailability(
  rawValue: unknown,
  availability: BrandWebsiteAssetAvailability,
): Record<string, unknown> {
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return { ...rawValue, availability };
  }
  return { value: rawValue, availability };
}

function assetAvailabilityWarnings(unavailableCount: number, unknownCount: number): string[] {
  const warnings: string[] = [];
  if (unavailableCount > 0) {
    warnings.push(
      `${unavailableCount} website asset candidate${unavailableCount === 1 ? ' was' : 's were'} unreachable and downgraded before review.`,
    );
  }
  if (unknownCount > 0) {
    warnings.push(
      `${unknownCount} website asset candidate${unknownCount === 1 ? ' could' : 's could'} not be verified before review.`,
    );
  }
  return warnings;
}

function taxonomyInferenceText(text: string): string {
  let clean = text;
  if (/\b(?:investor relations|stockholders?|financial analysts?|earnings|dividend|sec filings?)\b/i.test(clean)) {
    clean = clean.replace(
      /\b(?:investor relations?|stockholders?|potential investors?|financial analysts?|quarterly financial information|financial results|earnings webcast|earnings release|earnings presentation|dividends?|stock quote|stock chart|sec filings?|annual reports?|conference calls?|webcasts?|investment calculator|analyst coverage)\b/gi,
      ' ',
    );
  }
  return sanitizeEvidenceExcerpt(clean.replace(/\s+/g, ' ').trim(), 4000);
}

function createSignalFactory(args: {
  input: BrandWebsiteDraftInput;
  normalizedUrl: string;
  observedAt: string;
  extractor: string;
  evidence: BrandSignalEvidence[];
  candidates: BrandEvidenceCandidate[];
}): MakeSignal {
  return <T>(path: string, value: T, item: SignalSource): BrandSignal<T> => {
    const id = nextEvidenceId(args.evidence.length, path);
    const trustLevel = item.trustLevel ?? 'first_party_website';
    const confidence = clamp01(item.confidence);
    const excerpt = item.excerpt ?? stringifyExcerpt(item.normalizedValue);
    args.evidence.push({
      id,
      signalPath: path,
      sourceType: trustLevel,
      sourceField: item.sourceField,
      sourceUrl: item.sourceUrl,
      excerpt: excerpt ? sanitizeEvidenceExcerpt(excerpt) : undefined,
      confidence,
      trustLevel,
      authorityClass: item.authorityClass,
      observedAt: args.observedAt,
      extractor: args.extractor,
    });
    args.candidates.push({
      id: `candidate_${id}`,
      brandId: args.input.brandId,
      jobId: args.input.jobId,
      sourceType: item.candidateSourceType,
      sourceUrl: item.sourceUrl ?? args.normalizedUrl,
      sourceField: item.sourceField,
      signalPath: path,
      rawValue: item.rawValue,
      normalizedValue: item.normalizedValue,
      excerpt: excerpt ? sanitizeEvidenceExcerpt(excerpt) : undefined,
      confidence,
      authorityClass: item.trustLevel === 'uploaded_brand_guideline' ? 'official' : 'owned',
      observedAt: args.observedAt,
      extractorId: args.extractor,
    });
    return { value, confidence, trustLevel, authorityClass: item.authorityClass, evidenceIds: [id] };
  };
}

function createFallbackFactory(args: {
  observedAt: string;
  extractor: string;
  evidence: BrandSignalEvidence[];
}): FallbackSignal {
  return <T>(path: string, value: T, reason: string): BrandSignal<T> => {
    const id = nextEvidenceId(args.evidence.length, path);
    args.evidence.push({
      id,
      signalPath: path,
      sourceType: 'fallback_default',
      sourceField: 'fallback',
      excerpt: sanitizeEvidenceExcerpt(reason),
      confidence: 0.15,
      trustLevel: 'fallback_default',
      authorityClass: 'inferred_hint',
      observedAt: args.observedAt,
      extractor: args.extractor,
      fallbackReason: reason,
    });
    return {
      value,
      confidence: 0.15,
      trustLevel: 'fallback_default',
      authorityClass: 'inferred_hint',
      evidenceIds: [id],
      fallbackReason: reason,
    };
  };
}

function stylesheetUrlForTypography(rawTypography: string, stylesheets: BrandWebsiteStylesheetSnapshot[]): string | undefined {
  const families = uniqueText(rawTypography.split(',').map((value) => value.replace(/^['"]|['"]$/g, '').trim()));
  if (families.length === 0) return undefined;
  const matches = stylesheets.filter((stylesheet) => {
    const haystack = `${stylesheet.url}\n${stylesheet.css}`.toLowerCase();
    return families.some((family) => haystack.includes(family.toLowerCase()));
  });
  return matches.find((stylesheet) => isGoogleFontsStylesheetUrl(stylesheet.url))?.url ?? matches[0]?.url;
}

function isGoogleFontsStylesheetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  } catch {
    return false;
  }
}

interface WebsitePrimitiveSignals {
  sourceField: string;
  motionSourceField?: string;
  excerpt: string;
  atoms: Record<string, number>;
  confidence?: number;
  motionConfidence?: number;
  visual: {
    minimalism: number;
    densityTolerance: number;
    dataVizAffinity: number;
    expressiveness: number;
    geometryTendency: number;
    decorationTolerance: number;
    cornerRadiusBias: number;
    layoutSymmetry: number;
    contrastPreference: number;
  };
  motion?: {
    motionEnergy: number;
    overshootTolerance: number;
    transitionSharpness: number;
    rhythmRegularity: number;
  };
}

function makeVisualSignals(
  primitives: WebsitePrimitiveSignals | null,
  makeSignal: MakeSignal,
  fallback: FallbackSignal,
): BrandSignalProfile['visual'] {
  if (!primitives) {
    return {
      minimalism: fallback('visual.minimalism', 0.5, 'No website DOM/CSS visual primitives.'),
      densityTolerance: fallback('visual.densityTolerance', 0.5, 'No website DOM/CSS visual primitives.'),
      dataVizAffinity: fallback('visual.dataVizAffinity', 0.5, 'No website DOM/CSS visual primitives.'),
      expressiveness: fallback('visual.expressiveness', 0.5, 'No website DOM/CSS visual primitives.'),
      geometryTendency: fallback('visual.geometryTendency', 0.5, 'No website DOM/CSS visual primitives.'),
      decorationTolerance: fallback('visual.decorationTolerance', 0.5, 'No website DOM/CSS visual primitives.'),
      cornerRadiusBias: fallback('visual.cornerRadiusBias', 0.5, 'No website DOM/CSS visual primitives.'),
      layoutSymmetry: fallback('visual.layoutSymmetry', 0.5, 'No website DOM/CSS visual primitives.'),
      contrastPreference: fallback('visual.contrastPreference', 0.5, 'No website DOM/CSS visual primitives.'),
    };
  }
  const visualSource = (value: number): SignalSource => ({
    candidateSourceType: 'website',
    sourceField: primitives.sourceField,
    rawValue: primitives.atoms,
    normalizedValue: value,
    excerpt: primitives.excerpt,
    confidence: primitives.confidence ?? 0.58,
    authorityClass: 'inferred_hint',
  });
  return {
    minimalism: makeSignal('visual.minimalism', primitives.visual.minimalism, visualSource(primitives.visual.minimalism)),
    densityTolerance: makeSignal('visual.densityTolerance', primitives.visual.densityTolerance, visualSource(primitives.visual.densityTolerance)),
    dataVizAffinity: makeSignal('visual.dataVizAffinity', primitives.visual.dataVizAffinity, visualSource(primitives.visual.dataVizAffinity)),
    expressiveness: makeSignal('visual.expressiveness', primitives.visual.expressiveness, visualSource(primitives.visual.expressiveness)),
    geometryTendency: makeSignal('visual.geometryTendency', primitives.visual.geometryTendency, visualSource(primitives.visual.geometryTendency)),
    decorationTolerance: makeSignal('visual.decorationTolerance', primitives.visual.decorationTolerance, visualSource(primitives.visual.decorationTolerance)),
    cornerRadiusBias: makeSignal('visual.cornerRadiusBias', primitives.visual.cornerRadiusBias, visualSource(primitives.visual.cornerRadiusBias)),
    layoutSymmetry: makeSignal('visual.layoutSymmetry', primitives.visual.layoutSymmetry, visualSource(primitives.visual.layoutSymmetry)),
    contrastPreference: makeSignal('visual.contrastPreference', primitives.visual.contrastPreference, visualSource(primitives.visual.contrastPreference)),
  };
}

function makeMotionSignals(
  primitives: WebsitePrimitiveSignals | null,
  makeSignal: MakeSignal,
  fallback: FallbackSignal,
): BrandSignalProfile['motion'] {
  if (!primitives?.motion) {
    return {
      motionEnergy: fallback('motion.motionEnergy', 0.5, 'No website CSS motion primitives.'),
      overshootTolerance: fallback('motion.overshootTolerance', 0.5, 'No website CSS motion primitives.'),
      transitionSharpness: fallback('motion.transitionSharpness', 0.5, 'No website CSS motion primitives.'),
      rhythmRegularity: fallback('motion.rhythmRegularity', 0.5, 'No website CSS motion primitives.'),
    };
  }
  const motionSource = (value: number): SignalSource => ({
    candidateSourceType: 'website',
    sourceField: primitives.motionSourceField ?? 'website.motionPrimitives',
    rawValue: primitives.atoms,
    normalizedValue: value,
    excerpt: primitives.excerpt,
    confidence: primitives.motionConfidence ?? 0.54,
    authorityClass: 'inferred_hint',
  });
  return {
    motionEnergy: makeSignal('motion.motionEnergy', primitives.motion.motionEnergy, motionSource(primitives.motion.motionEnergy)),
    overshootTolerance: makeSignal('motion.overshootTolerance', primitives.motion.overshootTolerance, motionSource(primitives.motion.overshootTolerance)),
    transitionSharpness: makeSignal('motion.transitionSharpness', primitives.motion.transitionSharpness, motionSource(primitives.motion.transitionSharpness)),
    rhythmRegularity: makeSignal('motion.rhythmRegularity', primitives.motion.rhythmRegularity, motionSource(primitives.motion.rhythmRegularity)),
  };
}

function extractWebsitePrimitiveSignals(
  html: string,
  stylesheets: BrandWebsiteStylesheetSnapshot[],
  parsed: { bodyText: string; colors: string[]; headings: string[]; ctas: string[] },
): WebsitePrimitiveSignals | null {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const css = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]),
    ...stylesheets.map((stylesheet) => stylesheet.css),
  ].join('\n');
  const tagCount = countMatches(body, /<([a-z][a-z0-9-]*)\b/gi);
  const textLength = parsed.bodyText.length + parsed.headings.join(' ').length + parsed.ctas.join(' ').length;
  if (tagCount === 0 && textLength === 0 && !css.trim()) return null;

  const mediaCount = countMatches(body, /<(?:img|picture|video|svg|canvas)\b/gi);
  const dataVizCount = countMatches(body, /<(?:table|canvas|svg)\b/gi)
    + countMatches(body, /\b(?:chart|graph|metric|stat|dashboard|analytics|data-viz|datatable)\b/gi);
  const interactiveCount = countMatches(body, /<(?:a|button|input|select|textarea)\b/gi);
  const radiusValues = numericCssValues(css, /border-radius\s*:\s*([^;]+)/gi);
  const transitionDurations = durationCssValues(css, /transition-duration\s*:\s*([^;]+)/gi);
  const animationDurations = durationCssValues(css, /animation-duration\s*:\s*([^;]+)/gi);
  const transitionCount = countMatches(css, /(?:^|[;{\s])transition(?:-[a-z-]+)?\s*:/gi);
  const animationCount = countMatches(css, /(?:^|[;{\s])animation(?:-[a-z-]+)?\s*:/gi) + countMatches(css, /@keyframes\b/gi);
  const transformCount = countMatches(css, /\btransform\s*:|translate3?d?\(|scale3?d?\(|rotate3?d?\(/gi);
  const centerCount = countMatches(css, /justify-content\s*:\s*center|align-items\s*:\s*center|text-align\s*:\s*center|margin-inline\s*:\s*auto|margin\s*:\s*0\s+auto/gi);
  const layoutSystemCount = countMatches(css, /display\s*:\s*(?:grid|flex)|grid-template|gap\s*:/gi);
  const decorationCount = countMatches(css, /box-shadow|text-shadow|filter\s*:|backdrop-filter|linear-gradient|radial-gradient|border\s*:/gi);
  const easingCount = countMatches(css, /cubic-bezier\([^)]*(?:1\.\d|-\d|elastic|back|bounce)[^)]*\)|\b(?:spring|bounce|elastic|back)\b/gi);

  const elementDensity = clamp01(tagCount / 90);
  const textCoverage = clamp01(textLength / Math.max(600, tagCount * 140));
  const mediaCoverage = clamp01(mediaCount / Math.max(1, tagCount) * 5);
  const dataVizDensity = clamp01(dataVizCount / Math.max(1, tagCount) * 8);
  const interactionDensity = clamp01(interactiveCount / Math.max(1, tagCount) * 4);
  const averageRadius = radiusValues.length ? radiusValues.reduce((sum, value) => sum + value, 0) / radiusValues.length : 0;
  const radiusBias = clamp01(averageRadius / 28);
  const decorationDensity = clamp01((decorationCount + radiusValues.length * 0.35) / 28);
  const geometryDensity = clamp01((layoutSystemCount + transformCount + dataVizCount) / 36);
  const layoutSymmetry = clamp01(0.38 + centerCount / 16 + layoutSystemCount / 28 - interactionDensity * 0.12);
  const contrastPreference = parsed.colors.length ? inferContrastBias(parsed.colors) : 0.5;
  const colorDiversity = clamp01(parsed.colors.length / 8);
  const transitionDensity = clamp01(transitionCount / 16);
  const animationDensity = clamp01(animationCount / 10);
  const transformDensity = clamp01(transformCount / 16);
  const motionEvidence = transitionCount + animationCount + transformCount;
  const durations = [...transitionDurations, ...animationDurations];
  const averageDurationMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  const durationRegularity = durations.length > 1 ? 1 - clamp01(durationStdDev(durations) / Math.max(1, averageDurationMs)) : 0.5;
  const fastness = durations.length ? clamp01(1 - averageDurationMs / 900) : 0.45;
  const motionEnergy = clamp01(animationDensity * 0.45 + transitionDensity * 0.35 + transformDensity * 0.2);

  const atoms = {
    'website.element_density': roundSignal(elementDensity),
    'website.text_coverage': roundSignal(textCoverage),
    'website.media_coverage': roundSignal(mediaCoverage),
    'website.data_viz_density': roundSignal(dataVizDensity),
    'website.interaction_density': roundSignal(interactionDensity),
    'website.corner_radius_bias': roundSignal(radiusBias),
    'website.decoration_density': roundSignal(decorationDensity),
    'website.geometry_density': roundSignal(geometryDensity),
    'website.layout_symmetry': roundSignal(layoutSymmetry),
    'website.contrast_preference': roundSignal(contrastPreference),
    'website.motion_intensity': roundSignal(motionEnergy),
    'website.transition_density': roundSignal(transitionDensity),
    'website.animation_density': roundSignal(animationDensity),
  };

  return {
    sourceField: 'website.visualPrimitives',
    excerpt: `DOM/CSS primitives: ${tagCount} elements, ${mediaCount} media nodes, ${dataVizCount} data-viz markers, ${transitionCount} transitions, ${animationCount} animations.`,
    atoms,
    visual: {
      minimalism: roundSignal(clamp01(0.78 - elementDensity * 0.36 - decorationDensity * 0.32 - mediaCoverage * 0.12)),
      densityTolerance: roundSignal(clamp01(0.32 + elementDensity * 0.36 + textCoverage * 0.18 + dataVizDensity * 0.28)),
      dataVizAffinity: roundSignal(clamp01(dataVizDensity * 0.76 + geometryDensity * 0.14 + textCoverage * 0.1)),
      expressiveness: roundSignal(clamp01(decorationDensity * 0.34 + mediaCoverage * 0.22 + colorDiversity * 0.2 + motionEnergy * 0.24)),
      geometryTendency: roundSignal(clamp01(geometryDensity * 0.48 + layoutSymmetry * 0.28 + dataVizDensity * 0.24)),
      decorationTolerance: roundSignal(decorationDensity),
      cornerRadiusBias: roundSignal(radiusBias),
      layoutSymmetry: roundSignal(layoutSymmetry),
      contrastPreference: roundSignal(contrastPreference),
    },
    motion: motionEvidence
      ? {
          motionEnergy: roundSignal(motionEnergy),
          overshootTolerance: roundSignal(clamp01(easingCount / Math.max(1, transitionCount + animationCount) + animationDensity * 0.18)),
          transitionSharpness: roundSignal(clamp01(fastness * 0.55 + transitionDensity * 0.25 + geometryDensity * 0.2)),
          rhythmRegularity: roundSignal(clamp01(durationRegularity * 0.7 + (transitionCount > 0 && animationCount === 0 ? 0.15 : 0))),
        }
      : undefined,
  };
}

function renderedPrimitiveSignals(value: BrandWebsiteRenderedPrimitiveEvidence | undefined): WebsitePrimitiveSignals | null {
  if (!value) return null;
  return {
    sourceField: value.sourceField,
    motionSourceField: value.motionSourceField,
    excerpt: value.excerpt ?? 'Browser-rendered computed layout and motion primitives.',
    atoms: value.atoms,
    confidence: value.confidence,
    motionConfidence: value.motionConfidence,
    visual: value.visual,
    motion: value.motion,
  };
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function numericCssValues(css: string, pattern: RegExp): number[] {
  return [...css.matchAll(pattern)]
    .flatMap((match) => [...match[1].matchAll(/(-?\d+(?:\.\d+)?)(px|rem|em|%|vh|vw)?/gi)])
    .map((match) => cssLengthToPixels(Number.parseFloat(match[1]), match[2]))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function durationCssValues(css: string, pattern: RegExp): number[] {
  return [...css.matchAll(pattern)]
    .flatMap((match) => [...match[1].matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/gi)])
    .map((match) => match[2].toLowerCase() === 's' ? Number.parseFloat(match[1]) * 1000 : Number.parseFloat(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function cssLengthToPixels(value: number, unit: string | undefined): number {
  const normalized = unit?.toLowerCase();
  if (normalized === 'rem' || normalized === 'em') return value * 16;
  if (normalized === '%') return value / 4;
  if (normalized === 'vh' || normalized === 'vw') return value / 3;
  return value;
}

function durationStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function roundSignal(value: number): number {
  return Math.round(clamp01(value) * 100) / 100;
}
