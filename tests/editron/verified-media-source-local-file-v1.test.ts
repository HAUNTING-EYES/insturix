import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import {
  materializeVerifiedMediaSourceLocalFileV1,
  type VerifiedMediaSourceFileErrorCodesV1,
} from '@/lib/editron/services/verified-media-source-local-file-v1';

const directories: string[] = [];
const errors: VerifiedMediaSourceFileErrorCodesV1 = Object.freeze({
  sourceByteLimitExceeded: 'TEST_SOURCE_BYTE_LIMIT_EXCEEDED',
  sourceUrlInvalid: 'TEST_SOURCE_URL_INVALID',
  sourceReadFailed: 'TEST_SOURCE_READ_FAILED',
  sourceByteLengthMismatch: 'TEST_SOURCE_BYTE_LENGTH_MISMATCH',
  sourceContentMismatch: 'TEST_SOURCE_CONTENT_MISMATCH',
  outputWriteFailed: 'TEST_SOURCE_WRITE_FAILED',
});

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { force: true, recursive: true })
  )));
});

describe('verified media source local file v1', () => {
  it('streams immutable bytes to a create-only local file and returns bound evidence', async () => {
    const bytes = Buffer.from('immutable-media-source');
    const sourceVersion = version(bytes);
    const directory = await temporaryDirectory();
    const outputPath = path.join(directory, 'source.bin');
    const fetcher = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    }));

    const evidence = await materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: 'https://private.example/source?signature=secret',
      outputPath,
      sourceVersion,
      maximumBytes: bytes.byteLength,
      timeoutMs: 1_000,
      errorCodes: errors,
      fetcher: fetcher as typeof fetch,
    });

    expect(await readFile(outputPath)).toEqual(bytes);
    expect(evidence).toEqual({
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
      storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
      byteLength: bytes.byteLength,
      contentSha256: digest(bytes),
    });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      cache: 'no-store',
      redirect: 'error',
      headers: { 'accept-encoding': 'identity' },
    }));
  });

  it('rejects content mismatch, oversized response bytes, and encoded transport', async () => {
    const expected = Buffer.from('expected');
    const directory = await temporaryDirectory();
    await expect(materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: 'https://private.example/wrong',
      outputPath: path.join(directory, 'wrong.bin'),
      sourceVersion: version(Buffer.from('differen')),
      maximumBytes: 100,
      timeoutMs: 1_000,
      errorCodes: errors,
      fetcher: async () => new Response(expected),
    })).rejects.toThrow('TEST_SOURCE_CONTENT_MISMATCH');

    await expect(materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: 'https://private.example/oversized',
      outputPath: path.join(directory, 'oversized.bin'),
      sourceVersion: version(expected),
      maximumBytes: 100,
      timeoutMs: 1_000,
      errorCodes: errors,
      fetcher: async () => new Response(Buffer.concat([expected, Buffer.from('!')])),
    })).rejects.toThrow('TEST_SOURCE_BYTE_LENGTH_MISMATCH');

    await expect(materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: 'https://private.example/encoded',
      outputPath: path.join(directory, 'encoded.bin'),
      sourceVersion: version(expected),
      maximumBytes: 100,
      timeoutMs: 1_000,
      errorCodes: errors,
      fetcher: async () => new Response(expected, {
        headers: { 'content-encoding': 'gzip' },
      }),
    })).rejects.toThrow('TEST_SOURCE_READ_FAILED');
  });

  it('rejects unsafe URLs, byte limits, and an existing output target', async () => {
    const bytes = Buffer.from('source');
    const sourceVersion = version(bytes);
    const directory = await temporaryDirectory();
    const existingPath = path.join(directory, 'existing.bin');
    await writeFile(existingPath, Buffer.from('do-not-overwrite'), { flag: 'wx' });

    await expect(materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: 'file:///private/source',
      outputPath: path.join(directory, 'file-url.bin'),
      sourceVersion,
      maximumBytes: bytes.byteLength,
      timeoutMs: 1_000,
      errorCodes: errors,
    })).rejects.toThrow('TEST_SOURCE_URL_INVALID');

    await expect(materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: 'https://private.example/large',
      outputPath: path.join(directory, 'too-large.bin'),
      sourceVersion,
      maximumBytes: bytes.byteLength - 1,
      timeoutMs: 1_000,
      errorCodes: errors,
    })).rejects.toThrow('TEST_SOURCE_BYTE_LIMIT_EXCEEDED');

    await expect(materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: 'https://private.example/existing',
      outputPath: existingPath,
      sourceVersion,
      maximumBytes: bytes.byteLength,
      timeoutMs: 1_000,
      errorCodes: errors,
      fetcher: async () => new Response(bytes),
    })).rejects.toThrow('TEST_SOURCE_WRITE_FAILED');
    expect(await readFile(existingPath, 'utf8')).toBe('do-not-overwrite');
  });

  it('forwards caller cancellation through fetch and fails without writing bytes', async () => {
    const bytes = Buffer.from('source');
    const directory = await temporaryDirectory();
    const outputPath = path.join(directory, 'cancelled.bin');
    const controller = new AbortController();
    let started!: () => void;
    const fetchStarted = new Promise<void>((resolve) => { started = resolve; });
    const fetcher = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) return Promise.reject(new Error('missing signal'));
      started();
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
    });

    const pending = materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: 'https://private.example/cancelled',
      outputPath,
      sourceVersion: version(bytes),
      maximumBytes: bytes.byteLength,
      timeoutMs: 1_000,
      errorCodes: errors,
      abortSignal: controller.signal,
      fetcher: fetcher as typeof fetch,
    });
    await fetchStarted;
    controller.abort();

    await expect(pending).rejects.toThrow('TEST_SOURCE_READ_FAILED');
    const forwardedSignal = fetcher.mock.calls[0]?.[1]?.signal;
    expect(forwardedSignal).not.toBe(controller.signal);
    expect(forwardedSignal?.aborted).toBe(true);
    await expect(readFile(outputPath)).rejects.toThrow();
  });
});

function version(bytes: Buffer) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'private/source.mov' },
    byteLength: bytes.byteLength,
    providerVersion: { kind: 'R2_ETAG', value: 'source-etag' },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: bytes.byteLength,
    contentSha256: digest(bytes),
    storageVersion,
  });
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'editron-verified-source-test-'));
  directories.push(directory);
  return directory;
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
