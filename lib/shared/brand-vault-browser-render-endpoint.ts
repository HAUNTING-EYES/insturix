import { lookup } from 'node:dns/promises';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import {
  createBrandVaultLocalPlaywrightFallbackFetch,
  type BrandVaultLocalPlaywrightFallbackOptions,
  type BrandVaultPlaywrightWaitUntil,
} from './brand-vault-browser-fallback';
import type {
  BrandWebsiteBrowserFallbackInput,
  BrandWebsiteBrowserFallbackSnapshot,
  BrandWebsiteFetchFallbackReason,
} from './brand-website-refinery-types';
import { normalizeBrandWebsiteUrl } from './brand-website-refinery-utils';

export interface BrandVaultBrowserRenderEndpointEnvironment {
  [key: string]: string | undefined;
  BRAND_VAULT_BROWSER_RENDER_TOKEN?: string;
  BRAND_VAULT_BROWSER_RENDER_ALLOW_PRIVATE_HOSTS?: string;
  BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS?: string;
  BRAND_VAULT_PLAYWRIGHT_WAIT_UNTIL?: string;
}

export interface BrandVaultBrowserRenderEndpointOptions extends BrandVaultLocalPlaywrightFallbackOptions {
  now?: string;
  resolveHostname?: (hostname: string) => Promise<string[]>;
}

export interface BrandVaultBrowserRenderEndpointResult {
  status: number;
  body:
    | ({ ok: true } & BrandWebsiteBrowserFallbackSnapshot)
    | {
        ok: false;
        error: {
          code: string;
          message: string;
        };
      };
}

const DEFAULT_RENDER_TIMEOUT_MS = 12_000;
const MIN_RENDER_TIMEOUT_MS = 1_000;
const MAX_RENDER_TIMEOUT_MS = 25_000;
const DEFAULT_WAIT_UNTIL: BrandVaultPlaywrightWaitUntil = 'domcontentloaded';
const FALLBACK_REASON_VALUES = new Set<BrandWebsiteFetchFallbackReason>([
  'http_blocked',
  'rate_limited',
  'server_error',
  'browser_challenge',
  'javascript_shell',
  'empty_html',
]);

export async function handleBrandVaultBrowserRenderRequest(
  request: Request,
  env: BrandVaultBrowserRenderEndpointEnvironment = process.env,
  options: BrandVaultBrowserRenderEndpointOptions = {},
): Promise<BrandVaultBrowserRenderEndpointResult> {
  const token = env.BRAND_VAULT_BROWSER_RENDER_TOKEN?.trim();
  if (!token) {
    return errorResult(503, 'render_token_not_configured', 'Brand Vault browser render token is not configured.');
  }
  if (!authorizationMatches(request.headers.get('authorization'), token)) {
    return errorResult(401, 'unauthorized', 'Invalid Brand Vault browser render token.');
  }

  const body = await request.json().catch(() => null);
  const record = objectRecord(body);
  if (!record) {
    return errorResult(400, 'invalid_json', 'Expected JSON body with a url field.');
  }

  const input = buildFallbackInput(record, options.now);
  if (!input) {
    return errorResult(400, 'invalid_url', 'Expected a public http(s) url or normalizedUrl field.');
  }

  const safety = await validatePublicRenderTarget(input.normalizedUrl, env, options);
  if (!safety.ok) return errorResult(400, safety.code, safety.message);

  const render = createBrandVaultLocalPlaywrightFallbackFetch({
    loadPlaywright: options.loadPlaywright,
    timeoutMs: options.timeoutMs ?? parseTimeoutMs(env.BRAND_VAULT_PLAYWRIGHT_TIMEOUT_MS),
    waitUntil: options.waitUntil ?? parseWaitUntil(env.BRAND_VAULT_PLAYWRIGHT_WAIT_UNTIL),
  });
  const snapshot = await render(input);
  if (!snapshot?.html.trim()) {
    return errorResult(502, 'render_failed', 'Brand Vault browser render did not produce usable HTML.');
  }

  return {
    status: 200,
    body: {
      ok: true,
      ...snapshot,
    },
  };
}

function buildFallbackInput(
  record: Record<string, unknown>,
  now: string | undefined,
): BrandWebsiteBrowserFallbackInput | undefined {
  const rawUrl = stringValue(record.url) ?? stringValue(record.normalizedUrl);
  if (!rawUrl) return undefined;
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeBrandWebsiteUrl(rawUrl);
  } catch {
    return undefined;
  }
  return {
    normalizedUrl,
    reason: fallbackReason(record.reason) ?? 'browser_challenge',
    httpStatus: numberValue(record.httpStatus),
    contentType: stringValue(record.contentType),
    htmlExcerpt: stringValue(record.htmlExcerpt),
    now: stringValue(record.now) ?? now,
    userAgent: stringValue(record.userAgent),
  };
}

async function validatePublicRenderTarget(
  normalizedUrl: string,
  env: BrandVaultBrowserRenderEndpointEnvironment,
  options: BrandVaultBrowserRenderEndpointOptions,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  let url: URL;
  try {
    url = new URL(normalizedUrl);
  } catch {
    return { ok: false, code: 'invalid_url', message: 'Brand Vault browser render target is not a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'unsupported_protocol', message: 'Brand Vault browser render only supports http(s) URLs.' };
  }
  if (url.username || url.password) {
    return { ok: false, code: 'embedded_credentials', message: 'Brand Vault browser render URLs cannot contain credentials.' };
  }

  if (truthy(env.BRAND_VAULT_BROWSER_RENDER_ALLOW_PRIVATE_HOSTS)) return { ok: true };

  const hostname = cleanHostname(url.hostname);
  if (isPrivateOrReservedHost(hostname)) {
    return { ok: false, code: 'private_host_blocked', message: 'Brand Vault browser render blocked a private or local host.' };
  }

  const addresses = await (options.resolveHostname ?? resolveHostname)(hostname).catch(() => []);
  if (addresses.length === 0) {
    return { ok: false, code: 'host_resolution_failed', message: 'Brand Vault browser render could not resolve the target host.' };
  }
  if (addresses.some((address) => isPrivateOrReservedAddress(address))) {
    return { ok: false, code: 'private_host_blocked', message: 'Brand Vault browser render blocked a private or local resolved address.' };
  }

  return { ok: true };
}

async function resolveHostname(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: false });
  return addresses.map((address) => address.address);
}

function authorizationMatches(header: string | null, token: string): boolean {
  const supplied = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!supplied) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(token);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function isPrivateOrReservedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'localhost' || lower.endsWith('.localhost') || isPrivateOrReservedAddress(lower);
}

function isPrivateOrReservedAddress(value: string): boolean {
  const address = cleanHostname(value).toLowerCase();
  if (!isIP(address)) return false;
  if (address.includes('.')) return isPrivateOrReservedIpv4(address);
  if (address === '::' || address === '::1') return true;
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isPrivateOrReservedIpv4(mapped) : false;
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return a >= 224;
}

function cleanHostname(value: string): string {
  return value.replace(/^\[|\]$/g, '');
}

function fallbackReason(value: unknown): BrandWebsiteFetchFallbackReason | undefined {
  return typeof value === 'string' && FALLBACK_REASON_VALUES.has(value as BrandWebsiteFetchFallbackReason)
    ? (value as BrandWebsiteFetchFallbackReason)
    : undefined;
}

function parseWaitUntil(value: string | undefined): BrandVaultPlaywrightWaitUntil {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'domcontentloaded' || normalized === 'load' || normalized === 'networkidle') return normalized;
  return DEFAULT_WAIT_UNTIL;
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : DEFAULT_RENDER_TIMEOUT_MS;
  if (!Number.isFinite(parsed)) return DEFAULT_RENDER_TIMEOUT_MS;
  return Math.min(MAX_RENDER_TIMEOUT_MS, Math.max(MIN_RENDER_TIMEOUT_MS, parsed));
}

function errorResult(status: number, code: string, message: string): BrandVaultBrowserRenderEndpointResult {
  return {
    status,
    body: {
      ok: false,
      error: { code, message },
    },
  };
}

function truthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
