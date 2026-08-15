import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchThinkForgeUrlDocument,
  toSafeUrlIngestionProblem,
  UrlIngestionError,
  validateThinkForgeIngestionUrl,
  type ResolvedUrlAddress,
  type UrlIngestionTransportResponse,
} from '@/lib/thinkforge/security/url-ingestion-gateway';

const PUBLIC_V4: ResolvedUrlAddress = { address: '93.184.216.34', family: 4 };

function response(input: {
  statusCode?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
} = {}): UrlIngestionTransportResponse & { abort: ReturnType<typeof vi.fn> } {
  const chunks = input.chunks ?? [];
  return {
    statusCode: input.statusCode ?? 200,
    headers: input.headers ?? { 'content-type': 'text/html; charset=utf-8' },
    body: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    abort: vi.fn(),
  };
}

async function expectCode(promise: Promise<unknown>, code: UrlIngestionError['code']): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(UrlIngestionError);
    expect((error as UrlIngestionError).code).toBe(code);
  }
}

describe('ThinkForge URL ingestion gateway', () => {
  it.each([
    ['http://example.com/source', 'https_required'],
    ['https://user:secret@example.com/source', 'credentials_forbidden'],
    ['https://example.com/source#private-fragment', 'fragment_forbidden'],
    ['https://127.0.0.1/source', 'blocked_target'],
    ['https://169.254.169.254/latest/meta-data', 'blocked_target'],
    ['https://192.0.2.10/source', 'blocked_target'],
    ['https://224.0.0.1/source', 'blocked_target'],
    ['https://240.0.0.1/source', 'blocked_target'],
    ['https://[::1]/source', 'blocked_target'],
    ['https://[fc00::1]/source', 'blocked_target'],
    ['https://[fe80::1]/source', 'blocked_target'],
    ['https://[ff02::1]/source', 'blocked_target'],
    ['https://[2001:db8::1]/source', 'blocked_target'],
  ] as const)('rejects non-public target %s', async (url, code) => {
    await expectCode(validateThinkForgeIngestionUrl(url), code);
  });

  it('accepts globally routable literals and rejects a mixed public/private DNS answer', async () => {
    await expect(validateThinkForgeIngestionUrl('https://8.8.8.8/source')).resolves.toBe('https://8.8.8.8/source');
    await expect(validateThinkForgeIngestionUrl('https://[2606:4700:4700::1111]/source')).resolves.toBe(
      'https://[2606:4700:4700::1111]/source',
    );

    await expectCode(validateThinkForgeIngestionUrl('https://research.example.org/source', {
      resolveHostname: async () => [PUBLIC_V4, { address: '10.0.0.4', family: 4 }],
    }), 'blocked_target');
  });

  it('maps DNS and transport failures to typed public errors without leaking internals', async () => {
    let dnsFailure: unknown;
    try {
      await validateThinkForgeIngestionUrl('https://research.example.org/source', {
        resolveHostname: async () => {
          throw new Error('EAI_AGAIN via resolver 10.4.7.9');
        },
      });
    } catch (error) {
      dnsFailure = error;
    }
    const dnsProblem = toSafeUrlIngestionProblem(dnsFailure);
    expect(dnsProblem).toEqual({
      code: 'dns_unavailable',
      message: 'The source hostname could not be resolved securely.',
      status: 422,
    });
    expect(JSON.stringify(dnsProblem)).not.toContain('10.4.7.9');

    let transportFailure: unknown;
    try {
      await fetchThinkForgeUrlDocument('https://research.example.org/source', {}, {
        resolveHostname: async () => [PUBLIC_V4],
        requestTarget: async () => {
          throw new Error('socket connected to internal proxy 172.16.0.8');
        },
      });
    } catch (error) {
      transportFailure = error;
    }
    const transportProblem = toSafeUrlIngestionProblem(transportFailure);
    expect(transportProblem.code).toBe('upstream_unavailable');
    expect(JSON.stringify(transportProblem)).not.toContain('172.16.0.8');
  });

  it('bounds DNS resolution inside the operation deadline', async () => {
    vi.useFakeTimers();
    try {
      const pending = validateThinkForgeIngestionUrl('https://research.example.org/source', {
        resolveHostname: () => new Promise(() => undefined),
      });
      const assertion = expectCode(pending, 'request_timeout');
      await vi.advanceTimersByTimeAsync(12_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('revalidates every redirect target and blocks a redirect pivot before a second request', async () => {
    const redirect = response({ statusCode: 302, headers: { location: 'https://private.example.org/secret' } });
    const requestTarget = vi.fn().mockResolvedValue(redirect);

    await expectCode(fetchThinkForgeUrlDocument('https://public.example.org/source', {}, {
      resolveHostname: async (hostname) => hostname === 'public.example.org'
        ? [PUBLIC_V4]
        : [{ address: '10.20.30.40', family: 4 }],
      requestTarget,
    }), 'blocked_target');

    expect(requestTarget).toHaveBeenCalledTimes(1);
    expect(redirect.abort).toHaveBeenCalledOnce();
  });

  it('passes only validated addresses to each hop and decodes a bounded gzip document', async () => {
    const redirect = response({ statusCode: 301, headers: { location: '/final' } });
    const sourceText = '<html><body>Evidence-led source text for a campaign.</body></html>';
    const final = response({
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' },
      chunks: [gzipSync(sourceText)],
    });
    const queue = [redirect, final];
    const requestTarget = vi.fn(async (target) => {
      expect(target.addresses).toEqual([PUBLIC_V4]);
      return queue.shift()!;
    });

    const document = await fetchThinkForgeUrlDocument('https://research.example.org/start', {
      maxTextCharacters: 24,
    }, {
      resolveHostname: async () => [PUBLIC_V4],
      requestTarget,
    });

    expect(requestTarget).toHaveBeenCalledTimes(2);
    expect(document.finalUrl).toBe('https://research.example.org/final');
    expect(document.redirectCount).toBe(1);
    expect(document.text).toBe(sourceText.slice(0, 24));
    expect(document.textTruncated).toBe(true);
  });

  it('enforces compressed, decompressed, content-type, encoding, redirect, and timeout limits', async () => {
    const resolver = async () => [PUBLIC_V4];
    await expectCode(fetchThinkForgeUrlDocument('https://research.example.org/source', {
      maxCompressedBytes: 4,
    }, {
      resolveHostname: resolver,
      requestTarget: async () => response({ chunks: [Buffer.from('12345')] }),
    }), 'response_too_large');

    await expectCode(fetchThinkForgeUrlDocument('https://research.example.org/source', {
      maxDecompressedBytes: 32,
    }, {
      resolveHostname: resolver,
      requestTarget: async () => response({
        headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' },
        chunks: [gzipSync('x'.repeat(512))],
      }),
    }), 'response_too_large');

    const binary = response({ headers: { 'content-type': 'application/octet-stream' } });
    await expectCode(fetchThinkForgeUrlDocument('https://research.example.org/source', {}, {
      resolveHostname: resolver,
      requestTarget: async () => binary,
    }), 'unsupported_content_type');
    expect(binary.abort).toHaveBeenCalledOnce();

    const unsupportedEncoding = response({
      headers: { 'content-type': 'text/plain', 'content-encoding': 'zstd' },
      chunks: [Buffer.from('text')],
    });
    await expectCode(fetchThinkForgeUrlDocument('https://research.example.org/source', {}, {
      resolveHostname: resolver,
      requestTarget: async () => unsupportedEncoding,
    }), 'unsupported_content_encoding');
    expect(unsupportedEncoding.abort).toHaveBeenCalledOnce();

    const loopingRedirect = response({ statusCode: 302, headers: { location: '/again' } });
    await expectCode(fetchThinkForgeUrlDocument('https://research.example.org/source', {
      maxRedirects: 0,
    }, {
      resolveHostname: resolver,
      requestTarget: async () => loopingRedirect,
    }), 'redirect_limit');

    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(12_001);
    await expectCode(fetchThinkForgeUrlDocument('https://research.example.org/source', {}, {
      resolveHostname: resolver,
      requestTarget: vi.fn(),
      now,
    }), 'request_timeout');
  });
});
