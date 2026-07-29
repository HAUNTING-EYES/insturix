import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  waitForActive: vi.fn(),
}));

vi.mock('@google/generative-ai/server', () => ({
  GoogleAIFileManager: class {
    uploadFile = mocks.uploadFile;
  },
}));

vi.mock('@/lib/editron/services/gemini-file-active', () => ({
  waitForGeminiFileActive: mocks.waitForActive,
}));

import { uploadReferenceVideoToGemini } from '@/lib/editron/services/reference-content-extractor';

describe('reference video Gemini upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mocks.uploadFile.mockResolvedValue({
      file: {
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/reference',
        name: 'files/reference',
        state: 'PROCESSING',
      },
    });
    mocks.waitForActive.mockResolvedValue({ active: true, state: 'ACTIVE', attempts: 1, waitedMs: 0 });
  });

  it('streams the asset through Gemini Files API and waits for ACTIVE', async () => {
    const body = Readable.toWeb(Readable.from([Buffer.from('video-bytes')]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body as BodyInit, {
      status: 200,
      headers: { 'content-length': '11' },
    })));

    await expect(uploadReferenceVideoToGemini('https://assets.example/reference.mp4'))
      .resolves.toBe('https://generativelanguage.googleapis.com/v1beta/files/reference');

    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(mocks.waitForActive).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'files/reference',
      fileSizeBytes: 11,
    }));
  });

  it('uses the concrete Node stream constructors accepted by the server bundle', async () => {
    const body = Readable.toWeb(Readable.from([
      Buffer.from('video-'),
      Buffer.from('bytes'),
    ]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body as BodyInit, {
      status: 200,
    })));

    await expect(uploadReferenceVideoToGemini('https://assets.example/chunked.mp4'))
      .resolves.toBe('https://generativelanguage.googleapis.com/v1beta/files/reference');
    expect(mocks.waitForActive).toHaveBeenCalledWith(expect.objectContaining({
      fileSizeBytes: 11,
    }));
  });

  it('fails before download when the declared asset exceeds Gemini limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', {
      status: 200,
      headers: { 'content-length': String(2 * 1024 * 1024 * 1024 + 1) },
    })));

    await expect(uploadReferenceVideoToGemini('https://assets.example/oversized.mp4'))
      .rejects.toThrow('exceeds the Gemini Files API 2GB limit');
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it('fails loudly when Gemini never activates the uploaded file', async () => {
    const body = Readable.toWeb(Readable.from([Buffer.from('video-bytes')]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body as BodyInit, { status: 200 })));
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
