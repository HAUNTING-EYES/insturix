import { beforeEach, describe, expect, it, vi } from 'vitest';

const mongoMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'media_assets' },
  getDatabase: async () => ({
    collection: () => mongoMocks,
  }),
}));

import {
  buildInstagramReferenceAssetId,
  importInstagramReferenceVideo,
  parseInstagramReferenceUrl,
} from '../../lib/editron/reference-video/instagram-reference-importer';

const MP4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.alloc(16)]);

describe('Instagram reference importer', () => {
  beforeEach(() => {
    mongoMocks.findOne.mockReset();
    mongoMocks.updateOne.mockReset();
  });

  it('canonicalizes only supported public Instagram media URLs', () => {
    expect(parseInstagramReferenceUrl('https://instagram.com/p/C9Example_1/?igsh=secret')).toEqual({
      shortcode: 'C9Example_1',
      canonicalUrl: 'https://www.instagram.com/reel/C9Example_1/',
    });
    expect(parseInstagramReferenceUrl('https://instagram.com/example_brand/')).toBeNull();
    expect(parseInstagramReferenceUrl('https://instagram.example/reel/C9Example_1/')).toBeNull();
  });

  it('stores resolved Reel bytes as a deterministic owned media asset', async () => {
    const expectedAssetId = buildInstagramReferenceAssetId('user_123', 'C9Example_1');
    let registeredMetadata: object | undefined;
    const result = await importInstagramReferenceVideo(
      {
        userId: 'user_123',
        instagramUrl: 'https://www.instagram.com/reel/C9Example_1/?igsh=secret',
        sourceFingerprint: 'instagram|C9Example_1',
      },
      {
        findExistingAsset: async () => null,
        resolveActor: async (canonicalUrl, shortcode) => {
          expect(canonicalUrl).toBe('https://www.instagram.com/reel/C9Example_1/');
          expect(shortcode).toBe('C9Example_1');
          return {
            videoUrl: 'https://scontent.example.cdninstagram.com/video.mp4?token=ephemeral',
            sourceLabel: 'Reference caption',
            durationSec: 18,
            providerRunId: 'actor_run_1',
          };
        },
        downloadVideo: async (url) => {
          expect(url).toContain('token=ephemeral');
          return MP4;
        },
        uploadMedia: async (file, userId, filename, contentType, options) => ({
          assetId: options?.customAssetId || 'missing',
          signedUrl: `https://assets.example/${options?.customAssetId}.mp4`,
          gcsPath: null,
          r2Key: `${userId}/${filename}`,
          urlExpiresAt: null,
          size: file.length,
          contentType,
        }),
        registerAsset: async (asset, metadata) => {
          registeredMetadata = metadata;
          return asset;
        },
        now: () => new Date('2026-07-18T00:00:00.000Z'),
      },
    );

    expect(result).toMatchObject({
      durationSec: 18,
      sourceLabel: 'Reference caption',
      sourceFingerprint: `instagram|C9Example_1|asset:${expectedAssetId}`,
      asset: {
        assetId: expectedAssetId,
        userId: 'user_123',
        type: 'video',
        source: 'user-upload',
      },
    });
    expect(registeredMetadata).toMatchObject({
      shortcode: 'C9Example_1',
      canonicalUrl: 'https://www.instagram.com/reel/C9Example_1/',
      providerRunId: 'actor_run_1',
    });
    expect(JSON.stringify(registeredMetadata)).not.toContain('token=ephemeral');
  });

  it('fails closed when the resolved payload is not an MP4', async () => {
    await expect(importInstagramReferenceVideo(
      {
        userId: 'user_123',
        instagramUrl: 'https://www.instagram.com/reel/C9Example_1/',
        sourceFingerprint: 'instagram|C9Example_1',
      },
      {
        findExistingAsset: async () => null,
        resolveActor: async () => ({ videoUrl: 'https://scontent.cdninstagram.com/video', sourceLabel: 'Bad payload' }),
        downloadVideo: async () => Buffer.from('not-video'),
      },
    )).rejects.toMatchObject({ reason: 'instagram_reference_ingestion_failed' });
  });

  it('registers a new reference without conflicting Mongo parent and child paths', async () => {
    mongoMocks.updateOne.mockResolvedValue({ acknowledged: true });
    mongoMocks.findOne.mockImplementation(async (query) => ({
      ...query,
      assetId: buildInstagramReferenceAssetId('user_123', 'C9Example_1'),
      type: 'video',
      cachedUrl: 'https://assets.example/reference.mp4',
    }));

    await importInstagramReferenceVideo(
      {
        userId: 'user_123',
        instagramUrl: 'https://www.instagram.com/reel/C9Example_1/',
        sourceFingerprint: 'instagram|C9Example_1',
      },
      {
        findExistingAsset: async () => null,
        resolveActor: async () => ({
          videoUrl: 'https://scontent.cdninstagram.com/video.mp4',
          sourceLabel: 'Reference caption',
          providerRunId: 'actor_run_1',
        }),
        downloadVideo: async () => MP4,
        uploadMedia: async (file, _userId, _filename, contentType, options) => ({
          assetId: options?.customAssetId || 'missing',
          signedUrl: 'https://assets.example/reference.mp4',
          gcsPath: null,
          r2Key: null,
          urlExpiresAt: null,
          size: file.length,
          contentType,
        }),
        now: () => new Date('2026-07-18T00:00:00.000Z'),
      },
    );

    expect(mongoMocks.updateOne).toHaveBeenCalledTimes(2);
    const insertUpdate = mongoMocks.updateOne.mock.calls[0]?.[1];
    expect(insertUpdate).toHaveProperty('$setOnInsert.referenceSource');
    expect(insertUpdate).not.toHaveProperty('$set');
    expect(mongoMocks.updateOne.mock.calls[1]?.[1]).toEqual({
      $set: { 'referenceSource.lastUsedAt': new Date('2026-07-18T00:00:00.000Z') },
    });
  });
});
