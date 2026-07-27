import { load } from 'cheerio';

import { assertSafeAssetUrl } from '@/lib/shared/safe-asset-url';

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_EXTRACTED_CHARS = 50_000;
const FETCH_TIMEOUT_MS = 15_000;

const TEXTUAL_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',
] as const;

export interface FetchedChatReferenceUrl {
  requestedUrl: string;
  finalUrl: string;
  name: string;
  contentType: string;
  text: string;
}

export interface ChatReferenceUrlFetcherDependencies {
  fetchFn: typeof fetch;
  assertSafeUrl: (url: string) => Promise<void>;
}

export class ChatReferenceUrlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ChatReferenceUrlError';
  }
}

export async function fetchPublicChatReferenceUrl(
  rawUrl: string,
  dependencies: Partial<ChatReferenceUrlFetcherDependencies> = {},
): Promise<FetchedChatReferenceUrl> {
  const requestedUrl = normalizePublicUrl(rawUrl);
  const fetchFn = dependencies.fetchFn ?? fetch;
  const assertSafeUrl = dependencies.assertSafeUrl ?? assertSafeAssetUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let currentUrl = requestedUrl;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      await assertSafeUrl(currentUrl);
      const response = await fetchFn(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,text/plain,text/markdown,application/json,application/xml;q=0.9,*/*;q=0.1',
          'User-Agent': 'Insturix-Editron-Reference/1.0',
        },
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new ChatReferenceUrlError('reference_redirect_missing_location', 'Reference link redirected without a destination.', 422);
        }
        if (redirectCount === MAX_REDIRECTS) {
          throw new ChatReferenceUrlError('reference_redirect_limit', 'Reference link redirected too many times.', 422);
        }
        currentUrl = normalizePublicUrl(new URL(location, currentUrl).toString());
        continue;
      }

      if (!response.ok) {
        throw new ChatReferenceUrlError(
          'reference_fetch_failed',
          `Reference link returned HTTP ${response.status}.`,
          response.status >= 400 && response.status < 500 ? 422 : 502,
        );
      }

      const contentType = normalizeContentType(response.headers.get('content-type'));
      if (!TEXTUAL_CONTENT_TYPES.includes(contentType as (typeof TEXTUAL_CONTENT_TYPES)[number])) {
        throw new ChatReferenceUrlError(
          'reference_content_type_unsupported',
          `Reference link returned unsupported content type ${contentType || 'unknown'}.`,
          415,
        );
      }

      const declaredBytes = Number(response.headers.get('content-length') ?? 0);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_RESPONSE_BYTES) {
        throw new ChatReferenceUrlError('reference_too_large', 'Reference link is too large to ingest.', 413);
      }

      const bytes = await readResponseBodyBounded(response, MAX_RESPONSE_BYTES);
      const rawText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const extracted = extractText(rawText, contentType);
      if (!extracted.text) {
        throw new ChatReferenceUrlError('reference_has_no_text', 'Reference link contains no readable text.', 422);
      }

      return {
        requestedUrl,
        finalUrl: currentUrl,
        name: extracted.title || new URL(currentUrl).hostname,
        contentType,
        text: extracted.text.slice(0, MAX_EXTRACTED_CHARS),
      };
    }
  } catch (error) {
    if (error instanceof ChatReferenceUrlError) throw error;
    if (controller.signal.aborted) {
      throw new ChatReferenceUrlError('reference_fetch_timeout', 'Reference link timed out while loading.', 504);
    }
    throw new ChatReferenceUrlError(
      'reference_fetch_failed',
      error instanceof Error ? error.message : 'Reference link could not be loaded.',
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  throw new ChatReferenceUrlError('reference_fetch_failed', 'Reference link could not be loaded.', 502);
}

function normalizePublicUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ChatReferenceUrlError('reference_url_invalid', 'A valid HTTP(S) reference URL is required.', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new ChatReferenceUrlError('reference_url_invalid', 'A public HTTP(S) reference URL without embedded credentials is required.', 400);
  }
  url.hash = '';
  return url.toString();
}

async function readResponseBodyBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel('reference response exceeded byte limit');
      throw new ChatReferenceUrlError('reference_too_large', 'Reference link is too large to ingest.', 413);
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function extractText(rawText: string, contentType: string): { title: string; text: string } {
  if (contentType !== 'text/html') {
    return { title: '', text: normalizeWhitespace(rawText) };
  }
  const document = load(rawText);
  document('script,style,noscript,template,svg').remove();
  return {
    title: normalizeWhitespace(document('title').first().text()).slice(0, 180),
    text: normalizeWhitespace(document('main,article').first().text() || document('body').text()),
  };
}

function normalizeContentType(value: string | null): string {
  return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}
