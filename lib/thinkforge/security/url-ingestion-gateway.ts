import { lookup as dnsLookup } from 'node:dns/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

export type UrlIngestionErrorCode =
  | 'invalid_url'
  | 'https_required'
  | 'credentials_forbidden'
  | 'fragment_forbidden'
  | 'blocked_target'
  | 'dns_unavailable'
  | 'redirect_invalid'
  | 'redirect_limit'
  | 'request_timeout'
  | 'response_too_large'
  | 'unsupported_content_type'
  | 'unsupported_content_encoding'
  | 'upstream_unavailable'
  | 'content_unavailable';

const ERROR_DEFINITIONS: Record<UrlIngestionErrorCode, { status: number; message: string }> = {
  invalid_url: { status: 400, message: 'Enter a valid public HTTPS URL.' },
  https_required: { status: 400, message: 'Only public HTTPS URLs can be researched.' },
  credentials_forbidden: { status: 400, message: 'URLs containing credentials cannot be researched.' },
  fragment_forbidden: { status: 400, message: 'Remove the URL fragment before researching this source.' },
  blocked_target: { status: 400, message: 'This URL does not resolve to a permitted public destination.' },
  dns_unavailable: { status: 422, message: 'The source hostname could not be resolved securely.' },
  redirect_invalid: { status: 422, message: 'The source redirected to an invalid destination.' },
  redirect_limit: { status: 422, message: 'The source redirected too many times.' },
  request_timeout: { status: 504, message: 'The source did not respond within the research time limit.' },
  response_too_large: { status: 413, message: 'The source response is too large to research safely.' },
  unsupported_content_type: { status: 415, message: 'The source did not return a supported text document.' },
  unsupported_content_encoding: { status: 415, message: 'The source used an unsupported content encoding.' },
  upstream_unavailable: { status: 502, message: 'The source could not be reached securely.' },
  content_unavailable: { status: 422, message: 'The source did not contain readable text.' },
};

export class UrlIngestionError extends Error {
  readonly code: UrlIngestionErrorCode;
  readonly status: number;

  constructor(code: UrlIngestionErrorCode) {
    const definition = ERROR_DEFINITIONS[code];
    super(definition.message);
    this.name = 'UrlIngestionError';
    this.code = code;
    this.status = definition.status;
  }
}

export interface SafeUrlIngestionProblem {
  code: UrlIngestionErrorCode;
  message: string;
  status: number;
}

export function toSafeUrlIngestionProblem(error: unknown): SafeUrlIngestionProblem {
  const safeError = error instanceof UrlIngestionError
    ? error
    : new UrlIngestionError('upstream_unavailable');
  return { code: safeError.code, message: safeError.message, status: safeError.status };
}

export interface ResolvedUrlAddress {
  address: string;
  family: 4 | 6;
}

export interface ResolvedUrlTarget {
  url: URL;
  hostname: string;
  addresses: readonly ResolvedUrlAddress[];
}

export interface UrlIngestionTransportResponse {
  statusCode: number;
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  abort: () => void;
}

export interface UrlIngestionGatewayDependencies {
  resolveHostname?: (hostname: string) => Promise<readonly ResolvedUrlAddress[]>;
  requestTarget?: (target: ResolvedUrlTarget, timeoutMs: number) => Promise<UrlIngestionTransportResponse>;
  now?: () => number;
}

export interface UrlIngestionFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxCompressedBytes?: number;
  maxDecompressedBytes?: number;
  maxTextCharacters?: number;
  allowedContentTypes?: readonly string[];
}

export interface IngestedUrlDocument {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  text: string;
  textTruncated: boolean;
  redirectCount: number;
}

const DEFAULTS = {
  timeoutMs: 12_000,
  maxRedirects: 4,
  maxCompressedBytes: 2_000_000,
  maxDecompressedBytes: 5_000_000,
  maxTextCharacters: 200_000,
  allowedContentTypes: ['text/html', 'application/xhtml+xml', 'text/plain'] as const,
};

const RESERVED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.test',
  '.invalid',
  '.example',
] as const;

const DENIED_IPV4_CIDRS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const;

function ipv4ToBigInt(address: string): bigint | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let result = BigInt(0);
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    result = (result << BigInt(8)) | BigInt(value);
  }
  return result;
}

function ipv6ToBigInt(address: string): bigint | null {
  if (address.includes('%')) return null;
  let normalized = address.toLowerCase();
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const embedded = ipv4ToBigInt(normalized.slice(lastColon + 1));
    if (lastColon < 0 || embedded === null) return null;
    normalized = `${normalized.slice(0, lastColon)}:${(embedded >> BigInt(16)).toString(16)}:${(embedded & BigInt(0xffff)).toString(16)}`;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce(
    (value, group) => (value << BigInt(16)) | BigInt(`0x${group}`),
    BigInt(0),
  );
}

function isInCidr(value: bigint, base: bigint, bits: number, width: number): boolean {
  const shift = BigInt(width - bits);
  return (value >> shift) === (base >> shift);
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToBigInt(address);
  if (value === null) return false;
  return !DENIED_IPV4_CIDRS.some(([baseAddress, bits]) => {
    const base = ipv4ToBigInt(baseAddress);
    return base !== null && isInCidr(value, base, bits, 32);
  });
}

function isPublicIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  const globalBase = ipv6ToBigInt('2000::');
  if (value === null || globalBase === null || !isInCidr(value, globalBase, 3, 128)) return false;
  const denied = [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const;
  return !denied.some(([baseAddress, bits]) => {
    const base = ipv6ToBigInt(baseAddress);
    return base !== null && isInCidr(value, base, bits, 128);
  });
}

function isPublicAddress(address: ResolvedUrlAddress): boolean {
  return address.family === 4 ? isPublicIpv4(address.address) : isPublicIpv6(address.address);
}

function parseIngestionUrl(rawUrl: string): URL {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2_000) {
    throw new UrlIngestionError('invalid_url');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlIngestionError('invalid_url');
  }
  if (url.protocol !== 'https:') throw new UrlIngestionError('https_required');
  if (url.username || url.password) throw new UrlIngestionError('credentials_forbidden');
  if (url.hash) throw new UrlIngestionError('fragment_forbidden');
  if (!url.hostname) throw new UrlIngestionError('invalid_url');
  return url;
}

async function defaultResolveHostname(hostname: string): Promise<readonly ResolvedUrlAddress[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records
    .filter((record): record is { address: string; family: 4 | 6 } => record.family === 4 || record.family === 6)
    .map((record) => ({ address: record.address, family: record.family }));
}

async function resolveTarget(
  rawUrl: string,
  dependencies: UrlIngestionGatewayDependencies,
): Promise<ResolvedUrlTarget> {
  const url = parseIngestionUrl(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (
    hostname === 'localhost'
    || hostname === 'metadata'
    || RESERVED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new UrlIngestionError('blocked_target');
  }

  const literalFamily = isIP(hostname);
  let addresses: readonly ResolvedUrlAddress[];
  if (literalFamily === 4 || literalFamily === 6) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await (dependencies.resolveHostname ?? defaultResolveHostname)(hostname);
    } catch {
      throw new UrlIngestionError('dns_unavailable');
    }
  }

  const uniqueAddresses = [...new Map(addresses.map((address) => [`${address.family}:${address.address}`, address])).values()];
  if (uniqueAddresses.length === 0) throw new UrlIngestionError('dns_unavailable');
  if (uniqueAddresses.some((address) => !isPublicAddress(address))) {
    throw new UrlIngestionError('blocked_target');
  }
  return { url, hostname, addresses: uniqueAddresses };
}

type PinnedLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: 4 | 6 }>,
  family?: number,
) => void;

async function requestPinnedTarget(
  target: ResolvedUrlTarget,
  timeoutMs: number,
): Promise<UrlIngestionTransportResponse> {
  return new Promise((resolve, reject) => {
    let responseStarted = false;
    const requestTimer = setTimeout(
      () => request.destroy(new UrlIngestionError('request_timeout')),
      timeoutMs,
    );
    const clearRequestTimer = () => clearTimeout(requestTimer);
    const pinnedLookup = ((
      _hostname: string,
      options: number | { all?: boolean; family?: number },
      callback: PinnedLookupCallback,
    ) => {
      const requestedFamily = typeof options === 'number' ? options : options.family;
      const candidates = requestedFamily === 4 || requestedFamily === 6
        ? target.addresses.filter((address) => address.family === requestedFamily)
        : target.addresses;
      if (candidates.length === 0) {
        callback(Object.assign(new Error('No validated address for requested family'), { code: 'ENOTFOUND' }), '');
        return;
      }
      if (typeof options === 'object' && options.all) {
        callback(null, candidates.map((address) => ({ ...address })));
        return;
      }
      callback(null, candidates[0].address, candidates[0].family);
    }) as unknown as NonNullable<RequestOptions['lookup']>;

    const request = httpsRequest(target.url, {
      method: 'GET',
      agent: false,
      lookup: pinnedLookup,
      ...(isIP(target.hostname) === 0 ? { servername: target.hostname } : {}),
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'user-agent': 'ThinkForge-Research/1.0',
      },
    }, (response) => {
      responseStarted = true;
      response.once('end', clearRequestTimer);
      response.once('close', clearRequestTimer);
      resolve({
        statusCode: response.statusCode ?? 502,
        headers: response.headers,
        body: response,
        abort: () => {
          clearRequestTimer();
          response.destroy();
          request.destroy();
        },
      });
    });
    request.once('error', (error) => {
      clearRequestTimer();
      if (!responseStarted) reject(error);
    });
    request.end();
  });
}

function getHeader(
  headers: UrlIngestionTransportResponse['headers'],
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function createDecoder(encoding: string) {
  if (encoding === '' || encoding === 'identity') return null;
  if (encoding === 'gzip' || encoding === 'x-gzip') return createGunzip();
  if (encoding === 'deflate') return createInflate();
  if (encoding === 'br') return createBrotliDecompress();
  throw new UrlIngestionError('unsupported_content_encoding');
}

async function readBoundedBody(
  response: UrlIngestionTransportResponse,
  encoding: string,
  maxCompressedBytes: number,
  maxDecompressedBytes: number,
): Promise<Buffer> {
  let compressedBytes = 0;
  const boundedSource = Readable.from((async function* () {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      compressedBytes += bytes.byteLength;
      if (compressedBytes > maxCompressedBytes) {
        response.abort();
        throw new UrlIngestionError('response_too_large');
      }
      yield bytes;
    }
  })());
  let decoder: ReturnType<typeof createDecoder>;
  try {
    decoder = createDecoder(encoding);
  } catch (error) {
    response.abort();
    throw error;
  }
  const decodedStream = decoder ? boundedSource.pipe(decoder) : boundedSource;
  const chunks: Buffer[] = [];
  let decompressedBytes = 0;
  try {
    for await (const chunk of decodedStream) {
      const bytes = Buffer.from(chunk);
      decompressedBytes += bytes.byteLength;
      if (decompressedBytes > maxDecompressedBytes) {
        response.abort();
        boundedSource.destroy();
        decoder?.destroy();
        throw new UrlIngestionError('response_too_large');
      }
      chunks.push(bytes);
    }
  } catch (error) {
    response.abort();
    if (error instanceof UrlIngestionError) throw error;
    throw new UrlIngestionError('upstream_unavailable');
  }
  return Buffer.concat(chunks, decompressedBytes);
}

function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  if (timeoutMs <= 0) return Promise.reject(new UrlIngestionError('request_timeout'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      reject(new UrlIngestionError('request_timeout'));
    }, timeoutMs);
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function validateThinkForgeIngestionUrl(
  rawUrl: string,
  dependencies: UrlIngestionGatewayDependencies = {},
): Promise<string> {
  const target = await withDeadline(resolveTarget(rawUrl, dependencies), DEFAULTS.timeoutMs);
  return target.url.toString();
}

export async function fetchThinkForgeUrlDocument(
  rawUrl: string,
  options: UrlIngestionFetchOptions = {},
  dependencies: UrlIngestionGatewayDependencies = {},
): Promise<IngestedUrlDocument> {
  const limits = {
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    maxRedirects: options.maxRedirects ?? DEFAULTS.maxRedirects,
    maxCompressedBytes: options.maxCompressedBytes ?? DEFAULTS.maxCompressedBytes,
    maxDecompressedBytes: options.maxDecompressedBytes ?? DEFAULTS.maxDecompressedBytes,
    maxTextCharacters: options.maxTextCharacters ?? DEFAULTS.maxTextCharacters,
    allowedContentTypes: options.allowedContentTypes ?? DEFAULTS.allowedContentTypes,
  };
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= limits.maxRedirects; redirectCount += 1) {
    const remainingMs = limits.timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) throw new UrlIngestionError('request_timeout');
    const target = await withDeadline(resolveTarget(currentUrl, dependencies), remainingMs);
    const requestRemainingMs = limits.timeoutMs - (now() - startedAt);
    if (requestRemainingMs <= 0) throw new UrlIngestionError('request_timeout');
    let response: UrlIngestionTransportResponse;
    try {
      response = await withDeadline(
        (dependencies.requestTarget ?? requestPinnedTarget)(target, requestRemainingMs),
        requestRemainingMs,
      );
    } catch (error) {
      if (error instanceof UrlIngestionError) throw error;
      throw new UrlIngestionError('upstream_unavailable');
    }

    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      const location = getHeader(response.headers, 'location');
      response.abort();
      if (!location) throw new UrlIngestionError('redirect_invalid');
      if (redirectCount === limits.maxRedirects) throw new UrlIngestionError('redirect_limit');
      try {
        currentUrl = new URL(location, target.url).toString();
      } catch {
        throw new UrlIngestionError('redirect_invalid');
      }
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.abort();
      throw new UrlIngestionError('upstream_unavailable');
    }

    const contentTypeHeader = getHeader(response.headers, 'content-type') ?? '';
    const contentType = contentTypeHeader.split(';', 1)[0].trim().toLowerCase();
    if (!limits.allowedContentTypes.includes(contentType)) {
      response.abort();
      throw new UrlIngestionError('unsupported_content_type');
    }
    const declaredLength = Number(getHeader(response.headers, 'content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > limits.maxCompressedBytes) {
      response.abort();
      throw new UrlIngestionError('response_too_large');
    }

    const encoding = (getHeader(response.headers, 'content-encoding') ?? 'identity').trim().toLowerCase();
    const bodyRemainingMs = limits.timeoutMs - (now() - startedAt);
    const body = await withDeadline(
      readBoundedBody(
        response,
        encoding,
        limits.maxCompressedBytes,
        limits.maxDecompressedBytes,
      ),
      bodyRemainingMs,
      response.abort,
    );
    const charset = contentTypeHeader.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? 'utf-8';
    let decoded: string;
    try {
      decoded = new TextDecoder(charset).decode(body).replace(/\0/g, '');
    } catch {
      throw new UrlIngestionError('unsupported_content_type');
    }
    const textTruncated = decoded.length > limits.maxTextCharacters;
    return {
      requestedUrl: parseIngestionUrl(rawUrl).toString(),
      finalUrl: target.url.toString(),
      contentType,
      text: decoded.slice(0, limits.maxTextCharacters),
      textTruncated,
      redirectCount,
    };
  }

  throw new UrlIngestionError('redirect_limit');
}
