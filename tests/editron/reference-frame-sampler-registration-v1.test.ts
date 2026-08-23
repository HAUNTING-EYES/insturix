import fs from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

// The sampler's legacy FFmpeg-path import currently pulls the full analysis
// service (and its Mongo bootstrap) at module load. Frame extraction is injected
// in this suite, so keep that unrelated process-global dependency out of scope.
vi.mock('@/lib/editron/services/media/analysis-service', () => ({
  getFFmpegPath: () => 'ffmpeg',
}));

import {
  buildReferenceFrameVersionAssetId,
  sampleReferenceVideoFrames,
} from '@/lib/editron/reference-video/reference-frame-sampler';
import type { UploadOptions, UploadResult } from '@/lib/editron/services/upload-service';
import {
  registerReferenceMaterializedMediaFileV1,
  type ReferenceMaterializedMediaAssetRowV1,
  type ReferenceMaterializedMediaAssetStoreV1,
} from '@/lib/editron/reference-video/reference-materialized-media-registration-v1';

describe('reference frame sampler media registration', () => {
  it('returns only frames registered with exact byte, storage, source and timestamp identity', async () => {
    const store = new MemoryStore();
    const frameBytes = Buffer.from('deterministic-jpeg-frame');
    const uploadFile = vi.fn(async (
      filePath: string,
      _userId: string,
      filename: string,
      contentType: string,
      options?: UploadOptions,
    ): Promise<UploadResult> => {
      const bytes = await fs.readFile(filePath);
      return {
        assetId: options?.customAssetId ?? 'unexpected',
        signedUrl: `https://cdn.example.com/${filename}`,
        gcsPath: null,
        r2Key: `r2/${options?.customAssetId}`,
        urlExpiresAt: null,
        size: bytes.byteLength,
        contentType,
      };
    });
    const samples = await sampleReferenceVideoFrames({
      videoUrl: 'D:/fixtures/reference.mp4',
      userId: 'user-1',
      referenceAssetId: 'source_asset',
      durationSec: 4,
      sampleCount: 2,
    }, {
      uploadFile,
      extractFrame: async ({ outputPath }) => { await fs.writeFile(outputPath, frameBytes); },
      registerFile: (input) => registerReferenceMaterializedMediaFileV1(input, { store }),
    });

    expect(samples).toHaveLength(2);
    expect(samples.map(({ frameId, timestampUs }) => ({ frameId, timestampUs }))).toEqual([
      { frameId: 'frame_000000', timestampUs: '0' },
      { frameId: 'frame_000001', timestampUs: '3500000' },
    ]);
    expect(samples[0]).toMatchObject({
      mimeType: 'image/jpeg',
      byteLength: frameBytes.length,
      storage: { backend: 'R2' },
    });
    expect(store.rows).toHaveLength(2);
    expect(store.rows[1]).toMatchObject({
      contentHash: samples[1].bytesSha256,
      referenceMaterialization: {
        role: 'DERIVED_FRAME', sourceAssetId: 'source_asset',
        frameId: 'frame_000001', timestampUs: '3500000',
      },
    });
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(samples[0].assetId).toBe(buildReferenceFrameVersionAssetId(
      samples[0].assetId.slice(0, -17), samples[0].bytesSha256,
    ));
  });

  it('uses a new object identity when exact frame bytes change', () => {
    const logical = 'ref_frame_1';
    expect(buildReferenceFrameVersionAssetId(logical, 'a'.repeat(64)))
      .not.toBe(buildReferenceFrameVersionAssetId(logical, 'b'.repeat(64)));
  });

  it('streams a remote source in ordered chunks without using arrayBuffer', async () => {
    const sourceBytes = Buffer.from('streamed-reference-video');
    const frameBytes = Buffer.from('streamed-frame');
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(sourceBytes.subarray(0, 7));
        controller.enqueue(sourceBytes.subarray(7));
        controller.close();
      },
    }), { status: 200, headers: { 'content-length': String(sourceBytes.byteLength) } });
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer');
    const store = new MemoryStore();
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;

    const samples = await sampleReferenceVideoFrames({
      videoUrl: 'https://media.example.com/reference.mp4',
      userId: 'user-1', referenceAssetId: 'source_asset', sampleCount: 1,
      maxDownloadBytes: sourceBytes.byteLength,
      fetchImpl,
    }, {
      extractFrame: async ({ inputPath, outputPath }) => {
        expect(await fs.readFile(inputPath)).toEqual(sourceBytes);
        await fs.writeFile(outputPath, frameBytes);
      },
      uploadFile: async (filePath, _userId, filename, contentType, options) => ({
        assetId: requiredAssetId(options),
        signedUrl: `https://cdn.example.com/${filename}`,
        gcsPath: null,
        r2Key: `r2/${requiredAssetId(options)}`,
        urlExpiresAt: null,
        size: (await fs.stat(filePath)).size,
        contentType,
      }),
      registerFile: (input) => registerReferenceMaterializedMediaFileV1(input, { store }),
    });

    expect(samples).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('stops an unbounded remote stream at the byte ceiling before extraction', async () => {
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2, 3]));
        controller.enqueue(Uint8Array.from([4, 5, 6]));
        controller.close();
      },
    }), { status: 200 });
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer');
    const extractFrame = vi.fn();

    await expect(sampleReferenceVideoFrames({
      videoUrl: 'https://media.example.com/oversize.mp4',
      userId: 'user-1', referenceAssetId: 'source_asset', sampleCount: 1,
      maxDownloadBytes: 5,
      fetchImpl: vi.fn(async () => response) as unknown as typeof fetch,
    }, { extractFrame })).rejects.toThrow('too large for frame sampling (6 bytes)');
    expect(extractFrame).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('does not return an orphaned frame when registration fails', async () => {
    await expect(sampleReferenceVideoFrames({
      videoUrl: 'D:/fixtures/reference.mp4',
      userId: 'user-1', referenceAssetId: 'source_asset', sampleCount: 1,
    }, {
      extractFrame: async ({ outputPath }) => { await fs.writeFile(outputPath, 'frame'); },
      uploadFile: async (filePath, _userId, _filename, _contentType, options) => ({
        assetId: requiredAssetId(options), signedUrl: 'https://cdn.example.com/frame.jpg',
        gcsPath: null, r2Key: requiredAssetId(options), urlExpiresAt: null,
        size: (await fs.stat(filePath)).size, contentType: 'image/jpeg',
      }),
      registerFile: async () => { throw new Error('registration unavailable'); },
    })).rejects.toThrow('registration unavailable');
  });

  it('rejects a registration receipt that does not bind the extracted frame', async () => {
    const store = new MemoryStore();
    await expect(sampleReferenceVideoFrames({
      videoUrl: 'D:/fixtures/reference.mp4',
      userId: 'user-1', referenceAssetId: 'source_asset', sampleCount: 1,
    }, {
      extractFrame: async ({ outputPath }) => { await fs.writeFile(outputPath, 'frame'); },
      uploadFile: async (filePath, _userId, _filename, contentType, options) => ({
        assetId: requiredAssetId(options), signedUrl: 'https://cdn.example.com/frame.jpg',
        gcsPath: null, r2Key: requiredAssetId(options), urlExpiresAt: null,
        size: (await fs.stat(filePath)).size, contentType,
      }),
      registerFile: async (input) => ({
        ...(await registerReferenceMaterializedMediaFileV1(input, { store })),
        receiptSha256: 'f'.repeat(64),
      }),
    })).rejects.toThrow('registration receipt does not match the extracted file');
  });
});

function requiredAssetId(options: UploadOptions | undefined): string {
  if (!options?.customAssetId) throw new Error('test expected a custom frame asset id');
  return options.customAssetId;
}

class MemoryStore implements ReferenceMaterializedMediaAssetStoreV1 {
  readonly rows: ReferenceMaterializedMediaAssetRowV1[] = [];

  async createOrRead(row: Readonly<ReferenceMaterializedMediaAssetRowV1>) {
    this.rows.push(structuredClone(row));
    return structuredClone(row);
  }
}
