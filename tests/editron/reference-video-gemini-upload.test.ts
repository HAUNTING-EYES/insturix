import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  waitForActive: vi.fn(),
}));

vi.mock('@google/generative-ai/server', () => ({
  GoogleAIFileManager: class {},
}));

vi.mock('@/lib/editron/services/gemini-file-active', () => ({
  waitForGeminiFileActive: mocks.waitForActive,
}));

import { uploadReferenceVideoToGemini } from '@/lib/editron/services/reference-content-extractor';

describe('reference video Gemini upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mocks.waitForActive.mockResolvedValue({ active: true, state: 'ACTIVE', attempts: 1, waitedMs: 0 });
  });

  it('streams the asset through a resumable Gemini upload without staging a local file', async () => {
    const body = Readable.toWeb(Readable.from([Buffer.from('video-bytes')]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(body as BodyInit, {
        status: 200,
        headers: { 'content-length': '11' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { 'x-goog-upload-url': 'https://upload.example/session' },
      }))
      .mockImplementationOnce(async (_url, init) => {
        await new Response(init?.body as BodyInit).arrayBuffer();
        return successfulUploadResponse();
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadReferenceVideoToGemini(
      'https://assets.example/reference.mov',
      'video/quicktime',
    ))
      .resolves.toBe('https://generativelanguage.googleapis.com/v1beta/files/reference');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Header-Content-Length': '11',
        'X-Goog-Upload-Header-Content-Type': 'video/quicktime',
      }),
    });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Goog-Upload-Command': 'upload, finalize',
        'Content-Length': '11',
        'Content-Type': 'video/quicktime',
      }),
    });
    expect(mocks.waitForActive).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'files/reference',
      fileSizeBytes: 11,
    }));
  });

  it('rejects unsupported receipt MIME before reading or uploading bytes', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadReferenceVideoToGemini(
      'https://assets.example/reference.mkv',
      'video/x-matroska',
    )).rejects.toThrow('Unsupported reference video content type');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails clearly when the owned source cannot provide an authoritative byte length', async () => {
    const body = Readable.toWeb(Readable.from([
      Buffer.from('video-'),
      Buffer.from('bytes'),
    ]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body as BodyInit, {
      status: 200,
    })));

    await expect(uploadReferenceVideoToGemini('https://assets.example/chunked.mp4'))
      .rejects.toThrow('did not provide a valid Content-Length');
    expect(mocks.waitForActive).not.toHaveBeenCalled();
  });

  it('fails before download when the declared asset exceeds Gemini limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', {
      status: 200,
      headers: { 'content-length': String(2 * 1024 * 1024 * 1024 + 1) },
    })));

    await expect(uploadReferenceVideoToGemini('https://assets.example/oversized.mp4'))
      .rejects.toThrow('exceeds the Gemini Files API 2GB limit');
    expect(mocks.waitForActive).not.toHaveBeenCalled();
  });

  it('fails loudly when Gemini never activates the uploaded file', async () => {
    const body = Readable.toWeb(Readable.from([Buffer.from('video-bytes')]));
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(body as BodyInit, {
        status: 200,
        headers: { 'content-length': '11' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { 'x-goog-upload-url': 'https://upload.example/session' },
      }))
      .mockImplementationOnce(async (_url, init) => {
        await new Response(init?.body as BodyInit).arrayBuffer();
        return successfulUploadResponse();
      }));
    mocks.waitForActive.mockResolvedValue({
      active: false,
      state: 'FAILED',
      attempts: 2,
      waitedMs: 50,
      reason: 'processing-failed',
    });

    await expect(uploadReferenceVideoToGemini('https://assets.example/reference.mp4'))
      .rejects.toThrow('did not become ACTIVE');
  });
});

function successfulUploadResponse(): Response {
  return new Response(JSON.stringify({
    file: {
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/reference',
      name: 'files/reference',
      state: 'PROCESSING',
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
