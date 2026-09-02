import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { R2_MAX_OBJECT_BYTES } from '@/lib/editron/services/r2-upload-limits';
import { uploadFileToR2 } from '@/lib/editron/services/r2-service';
import { uploadMediaFromFile } from '@/lib/editron/services/upload-service';

function stream() {
  const value = new PassThrough();
  value.end(Buffer.from('bounded'));
  return value as never;
}

describe('file-backed media upload', () => {
  it('streams a small R2 object through one PUT', async () => {
    const commands: string[] = [];
    const send = vi.fn(async (command: unknown) => {
      commands.push((command as { constructor: { name: string } }).constructor.name);
      return {};
    });
    const result = await uploadFileToR2(
      'source.mp4', 'user_1', 'source.mp4', 'video/mp4', 'ref_source', {
        client: { send },
        statFile: async () => ({ size: 12_345, isFile: () => true }),
        createFileReadStream: stream,
        now: () => new Date('2026-08-23T00:00:00.000Z'),
      },
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(commands).toEqual(['PutObjectCommand']);
    expect(result).toMatchObject({
      assetId: 'ref_source', r2Key: 'ref_source', size: 12_345, contentType: 'video/mp4',
    });
  });

  it('uses bounded multipart ranges and completes a large R2 object', async () => {
    const commands: string[] = [];
    const send = vi.fn(async (command: unknown) => {
      const name = (command as { constructor: { name: string } }).constructor.name;
      commands.push(name);
      if (name === 'CreateMultipartUploadCommand') return { UploadId: 'upload_1' };
      if (name === 'UploadPartCommand') return { ETag: `etag_${commands.length}` };
      return {};
    });

    await uploadFileToR2(
      'large.mp4', 'user_1', 'large.mp4', 'video/mp4', 'ref_large', {
        client: { send },
        statFile: async () => ({ size: 64 * 1024 * 1024 + 1, isFile: () => true }),
        createFileReadStream: stream,
      },
    );

    expect(commands).toEqual([
      'CreateMultipartUploadCommand',
      'UploadPartCommand',
      'UploadPartCommand',
      'CompleteMultipartUploadCommand',
    ]);
  });

  it('aborts an incomplete multipart upload', async () => {
    const commands: string[] = [];
    const send = vi.fn(async (command: unknown) => {
      const name = (command as { constructor: { name: string } }).constructor.name;
      commands.push(name);
      if (name === 'CreateMultipartUploadCommand') return { UploadId: 'upload_1' };
      if (name === 'UploadPartCommand') throw new Error('network failed');
      return {};
    });

    await expect(uploadFileToR2(
      'large.mp4', 'user_1', 'large.mp4', 'video/mp4', 'ref_large', {
        client: { send },
        statFile: async () => ({ size: 64 * 1024 * 1024 + 1, isFile: () => true }),
        createFileReadStream: stream,
      },
    )).rejects.toThrow('network failed');
    expect(commands).toEqual([
      'CreateMultipartUploadCommand', 'UploadPartCommand', 'AbortMultipartUploadCommand',
    ]);
  });

  it('rejects provider-invalid object size before issuing an R2 command', async () => {
    const send = vi.fn(async () => ({}));
    await expect(uploadFileToR2(
      'oversize.mp4', 'user_1', 'oversize.mp4', 'video/mp4', 'ref_oversize', {
        client: { send },
        statFile: async () => ({
          size: R2_MAX_OBJECT_BYTES + 1,
          isFile: () => true,
        }),
        createFileReadStream: stream,
      },
    )).rejects.toThrow('R2_FILE_UPLOAD_OBJECT_TOO_LARGE');
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves the existing R2-primary and GCS-availability policy', async () => {
    const uploadR2 = vi.fn(async () => ({
      assetId: 'ref_source', r2Key: 'ref_source', publicUrl: 'https://cdn/ref_source',
      size: 500, contentType: 'video/mp4',
    }));
    const uploadGcs = vi.fn(async () => ({
      assetId: 'ref_source', gcsPath: 'editron/user_1/ref_source.mp4',
      signedUrl: 'https://gcs/ref_source', urlExpiresAt: new Date('2026-08-30T00:00:00Z'),
      size: 500, contentType: 'video/mp4',
    }));
    const loadGcsService = vi.fn(async () => ({ uploadFileToGCS: uploadGcs })) as never;

    const result = await uploadMediaFromFile(
      'source.mp4', 'user_1', 'source.mp4', 'video/mp4',
      { customAssetId: 'ref_source', alsoUploadToGCS: true },
      { isR2Available: () => true, uploadFileToR2: uploadR2, loadGcsService },
    );

    expect(uploadR2).toHaveBeenCalledOnce();
    expect(uploadGcs).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      assetId: 'ref_source', r2Key: 'ref_source',
      gcsPath: 'editron/user_1/ref_source.mp4', size: 500,
    });
  });

  it('uses GCS when R2 is unavailable or its upload fails', async () => {
    const uploadGcs = vi.fn(async () => ({
      assetId: 'ref_source', gcsPath: 'editron/user_1/ref_source.mp4',
      signedUrl: 'https://gcs/ref_source', urlExpiresAt: new Date('2026-08-30T00:00:00Z'),
      size: 500, contentType: 'video/mp4',
    }));
    const loadGcsService = vi.fn(async () => ({ uploadFileToGCS: uploadGcs })) as never;
    const failedR2 = vi.fn(async () => { throw new Error('R2 unavailable'); });

    const absent = await uploadMediaFromFile(
      'source.mp4', 'user_1', 'source.mp4', 'video/mp4', { customAssetId: 'ref_source' },
      { isR2Available: () => false, uploadFileToR2: failedR2, loadGcsService },
    );
    const failed = await uploadMediaFromFile(
      'source.mp4', 'user_1', 'source.mp4', 'video/mp4', { customAssetId: 'ref_source' },
      { isR2Available: () => true, uploadFileToR2: failedR2, loadGcsService },
    );

    expect(absent.r2Key).toBeNull();
    expect(failed.r2Key).toBeNull();
    expect(uploadGcs).toHaveBeenCalledTimes(2);
  });

  it('preserves both failures when no storage backend accepts the file', async () => {
    const loadGcsService = vi.fn(async () => ({
      uploadFileToGCS: vi.fn(async () => { throw new Error('GCS unavailable'); }),
    })) as never;

    await expect(uploadMediaFromFile(
      'source.mp4', 'user_1', 'source.mp4', 'video/mp4', {}, {
        isR2Available: () => true,
        uploadFileToR2: vi.fn(async () => { throw new Error('R2 unavailable'); }),
        loadGcsService,
      },
    )).rejects.toMatchObject({
      message: 'EDITRON_FILE_UPLOAD_ALL_BACKENDS_FAILED',
      errors: [expect.objectContaining({ message: 'R2 unavailable' }),
        expect.objectContaining({ message: 'GCS unavailable' })],
    });
  });

  it('keeps the GCS file path streaming and resumable', () => {
    const source = readFileSync(path.join(
      process.cwd(), 'lib/editron/services/gcs-service.ts',
    ), 'utf8');
    expect(source).toContain('createReadStream(filePath)');
    expect(source).toContain('blob.createWriteStream({');
    expect(source).toContain('resumable: true');
    expect(source).not.toContain('readFile(filePath)');
  });
});
