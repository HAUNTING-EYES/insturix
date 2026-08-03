import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  verifyUploadedAudioPrefix,
  fetchUploadedAudioBytes,
} from '@/lib/editron/services/media/verify-uploaded-audio';

const WAV_HEADER = Buffer.from(
  'RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x40\x1f\x00\x00\x80\x3e\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00',
);

function bytesResponse(bytes: Buffer, status = 206) {
  const body = new Uint8Array(bytes);
  return new Response(body, {
    status,
    headers: {
      'content-type': 'audio/wav',
      'content-length': String(bytes.length),
    },
  });
}

describe('verifyUploadedAudioPrefix', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts a real audio prefix from an allowlisted read URL', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('https://');
      expect(init?.headers).toEqual({ Range: 'bytes=0-262143' });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return bytesResponse(WAV_HEADER);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyUploadedAudioPrefix('https://cdn.example.com/asset.wav');

    expect(result).toEqual({
      verified: true,
      mime: 'audio/wav',
      extension: 'wav',
      bytesChecked: WAV_HEADER.length,
    });
  });

  it('rejects a non-audio prefix (e.g. image bytes) as not-audio', async () => {
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const fetchMock = vi.fn(async () => bytesResponse(jpegBytes));
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyUploadedAudioPrefix('https://cdn.example.com/fake.mp3');

    expect(result.verified).toBe(false);
    if (!result.verified) {
      expect(result.reason).toBe('not-audio');
      expect(result.bytesChecked).toBeGreaterThan(0);
    }
  });

  it('reports fetch-failed when the storage read is not available', async () => {
    const fetchMock = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyUploadedAudioPrefix('https://cdn.example.com/missing.wav');

    expect(result).toEqual({ verified: false, reason: 'fetch-failed', bytesChecked: 0 });
  });

  it('reports empty for a zero-length body', async () => {
    const fetchMock = vi.fn(async () => bytesResponse(Buffer.alloc(0), 206));
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyUploadedAudioPrefix('https://cdn.example.com/empty.wav');

    expect(result.verified).toBe(false);
    if (!result.verified) {
      expect(result.reason).toBe('empty');
    }
  });
});

describe('fetchUploadedAudioBytes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches the full audio buffer and returns it', async () => {
    const payload = Buffer.concat([WAV_HEADER, Buffer.alloc(1024, 7)]);
    const fetchMock = vi.fn(async () => bytesResponse(payload, 200));
    vi.stubGlobal('fetch', fetchMock);

    const buffer = await fetchUploadedAudioBytes('https://cdn.example.com/song.wav');

    expect(Buffer.compare(buffer, payload)).toBe(0);
  });

  it('throws on non-OK HTTP status', async () => {
    const fetchMock = vi.fn(async () => new Response('gone', { status: 410 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchUploadedAudioBytes('https://cdn.example.com/gone.wav')).rejects.toThrow(
      /HTTP 410/,
    );
  });
});
