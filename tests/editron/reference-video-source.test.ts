import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import type { MediaAsset } from '../../lib/editron/services/asset-resolver';
import {
  resolveReferenceVideoSource,
  validateReferenceVideoUrlForAutoEditIntake,
  validateReferenceVideoUrlForIntake,
  type ReferenceVideoAssetResolver,
  type ReferenceVideoYoutubeImporter,
} from '../../lib/editron/reference-video/reference-video-source';
import {
  buildYoutubeReferenceAssetId,
  importYoutubeReferenceVideo,
} from '../../lib/editron/reference-video/youtube-reference-importer';

describe('reference video source intake', () => {
  it('accepts direct public video URLs with stable non-query fingerprints', async () => {
    const result = await resolveReferenceVideoSource({
      userId: 'user_123',
      referenceVideoUrl: 'https://cdn.example.com/references/demo-flow.mp4?utm=smoke',
      assetResolver: emptyAssetResolver(),
      dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toMatchObject({
      kind: 'remote-url',
      sourceLabel: 'demo-flow.mp4',
    });
    expect(result.source.referenceId).toMatch(/^ref_url_[a-f0-9]{16}$/);
    expect(result.source.videoUrl).toContain('?utm=smoke');
    expect(result.source.sourceFingerprint).toBe('remote-url|https://cdn.example.com/references/demo-flow.mp4');
  });

  it('keeps uploaded reference assets on the existing asset path', async () => {
    const result = await resolveReferenceVideoSource({
      userId: 'user_123',
      referenceAssetId: 'asset_ref_123',
      assetResolver: {
        async getAsset() {
          return videoAsset();
        },
        async resolveAssetUrl() {
          return 'https://cdn.example.com/assets/asset_ref_123.mp4';
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toMatchObject({
      kind: 'asset',
      referenceId: 'asset_ref_123',
      durationSec: 74,
      sourceLabel: 'reference-demo.mp4',
    });
    expect(result.source.sourceFingerprint).toContain('asset_ref_123');
  });

  it('rejects unsafe, signed, unsupported, and direct-intake YouTube reference URLs deterministically', () => {
    expect(validateReferenceVideoUrlForIntake('http://127.0.0.1/private.mp4')).toMatchObject({
      ok: false,
      reason: 'unsafe_reference_video_url',
    });
    expect(validateReferenceVideoUrlForIntake('https://cdn.example.com/demo.mp4?X-Amz-Signature=secret')).toMatchObject({
      ok: false,
      reason: 'unsafe_reference_video_url',
    });
    expect(validateReferenceVideoUrlForIntake('https://cdn.example.com/demo.txt')).toMatchObject({
      ok: false,
      reason: 'unsupported_reference_video_url',
    });
    expect(validateReferenceVideoUrlForIntake('https://www.youtube.com/watch?v=abc12345678')).toMatchObject({
      ok: false,
      reason: 'youtube_reference_ingestion_not_supported',
      sourceKind: 'youtube-url',
    });
  });

  it('accepts YouTube URLs at auto-edit intake and imports them as owned assets', async () => {
    const validation = validateReferenceVideoUrlForAutoEditIntake('https://youtu.be/abc12345678?t=15');
    expect(validation).toMatchObject({
      ok: true,
      sourceKind: 'youtube-url',
      sourceFingerprint: 'youtube|abc12345678',
    });
    if (!validation.ok) return;
    expect(validation.url.toString()).toBe('https://www.youtube.com/watch?v=abc12345678');

    const importedAsset = videoAsset({
      assetId: 'ref_yt_imported',
      filename: 'SaaS demo reference-abc12345678.mp4',
      duration: 72,
      cachedUrl: 'https://cdn.example.com/assets/ref_yt_imported.mp4',
    });
    const importer: ReferenceVideoYoutubeImporter = async (input) => {
      expect(input.youtubeUrl).toBe(validation.url.toString());
      expect(input.sourceFingerprint).toBe('youtube|abc12345678');
      return {
        asset: importedAsset,
        videoUrl: importedAsset.cachedUrl,
        durationSec: importedAsset.duration,
        sourceLabel: 'SaaS demo reference',
        sourceFingerprint: `${input.sourceFingerprint}|asset:${importedAsset.assetId}`,
      };
    };

    const result = await resolveReferenceVideoSource({
      userId: 'user_123',
      referenceVideoUrl: 'https://youtu.be/abc12345678?t=15',
      assetResolver: emptyAssetResolver(),
      youtubeImporter: importer,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toMatchObject({
      kind: 'asset',
      referenceId: 'ref_yt_imported',
      videoUrl: importedAsset.cachedUrl,
      durationSec: 72,
      sourceLabel: 'SaaS demo reference',
      sourceFingerprint: 'youtube|abc12345678|asset:ref_yt_imported',
    });
  });

  it('downloads and registers bounded YouTube references without live network calls', async () => {
    let selectedItag: number | undefined;
    let clipAttempted = false;
    let registeredAsset: MediaAsset | undefined;
    const expectedAssetId = buildYoutubeReferenceAssetId('user_123', 'abc12345678');

    const result = await importYoutubeReferenceVideo(
      {
        userId: 'user_123',
        youtubeUrl: 'https://www.youtube.com/watch?v=abc12345678',
        sourceFingerprint: 'youtube|abc12345678',
      },
      {
        findExistingAsset: async () => null,
        getInfo: async () => ({
          videoDetails: {
            videoId: 'abc12345678',
            title: 'Clean SaaS Product Demo',
            lengthSeconds: '72',
          },
          formats: [
            { itag: 22, url: 'https://video.example/720.mp4', mimeType: 'video/mp4', hasVideo: true, hasAudio: true, height: 720, audioBitrate: 128 },
            { itag: 37, url: 'https://video.example/1080.mp4', mimeType: 'video/mp4', hasVideo: true, hasAudio: true, height: 1080, audioBitrate: 128 },
          ],
        }),
        downloadFromInfo: async (_info, format) => {
          selectedItag = format.itag;
          return Readable.from([Buffer.from('fake-mp4')]);
        },
        clipStreamToMp4Buffer: async () => {
          clipAttempted = true;
          throw new Error('Short YouTube references should not be clipped.');
        },
        uploadMedia: async (file, _userId, _filename, contentType, options) => ({
          assetId: options?.customAssetId ?? 'missing_asset',
          signedUrl: `https://cdn.example.com/assets/${options?.customAssetId}.mp4`,
          gcsPath: null,
          r2Key: options?.customAssetId ?? null,
          urlExpiresAt: null,
          size: file.length,
          contentType,
        }),
        registerAsset: async (asset) => {
          registeredAsset = asset;
          return asset;
        },
        now: () => new Date('2026-06-29T00:00:00.000Z'),
      },
    );

    expect(selectedItag).toBe(22);
    expect(clipAttempted).toBe(false);
    expect(registeredAsset).toMatchObject({
      assetId: expectedAssetId,
      userId: 'user_123',
      type: 'video',
      duration: 72,
      source: 'user-upload',
      r2Key: expectedAssetId,
    });
    expect(result).toMatchObject({
      videoUrl: `https://cdn.example.com/assets/${expectedAssetId}.mp4`,
      durationSec: 72,
      sourceFingerprint: `youtube|abc12345678|asset:${expectedAssetId}`,
    });
  });

  it('clips long YouTube references to the first 120 seconds before upload', async () => {
    let selectedItag: number | undefined;
    let clippedDuration: number | undefined;
    let clippedByteLimit: number | undefined;
    let uploadedFilename = '';
    let uploadedSize = 0;
    let registeredAsset: MediaAsset | undefined;
    const clippedBuffer = Buffer.from('first-two-minutes');
    const expectedAssetId = buildYoutubeReferenceAssetId('user_123', 'abc12345678');

    const result = await importYoutubeReferenceVideo(
      {
        userId: 'user_123',
        youtubeUrl: 'https://www.youtube.com/watch?v=abc12345678',
        sourceFingerprint: 'youtube|abc12345678',
        maxDurationSec: 120,
      },
      {
        findExistingAsset: async () => null,
        getInfo: async () => ({
          videoDetails: {
            videoId: 'abc12345678',
            title: 'Long SaaS Webinar',
            lengthSeconds: '240',
          },
          formats: [
            { itag: 22, url: 'https://video.example/720.mp4', mimeType: 'video/mp4', hasVideo: true, hasAudio: true, height: 720, audioBitrate: 128 },
          ],
        }),
        downloadFromInfo: async (_info, format) => {
          selectedItag = format.itag;
          return Readable.from([Buffer.from('long-input')]);
        },
        clipStreamToMp4Buffer: async (_stream, maxDurationSec, maxBytes) => {
          clippedDuration = maxDurationSec;
          clippedByteLimit = maxBytes;
          return clippedBuffer;
        },
        uploadMedia: async (file, _userId, filename, contentType, options) => {
          uploadedFilename = filename;
          uploadedSize = file.length;
          return {
            assetId: options?.customAssetId ?? 'missing_asset',
            signedUrl: `https://cdn.example.com/assets/${options?.customAssetId}.mp4`,
            gcsPath: null,
            r2Key: options?.customAssetId ?? null,
            urlExpiresAt: null,
            size: file.length,
            contentType,
          };
        },
        registerAsset: async (asset, metadata) => {
          expect(metadata).toMatchObject({
            originalDurationSec: 240,
            evaluationWindowSec: 120,
          });
          registeredAsset = asset;
          return asset;
        },
        now: () => new Date('2026-06-29T00:00:00.000Z'),
      },
    );

    expect(selectedItag).toBe(22);
    expect(clippedDuration).toBe(120);
    expect(clippedByteLimit).toBe(160 * 1024 * 1024);
    expect(uploadedFilename).toContain('first-120s');
    expect(uploadedSize).toBe(clippedBuffer.length);
    expect(registeredAsset).toMatchObject({
      assetId: expectedAssetId,
      duration: 120,
      r2Key: expectedAssetId,
    });
    expect(result).toMatchObject({
      videoUrl: `https://cdn.example.com/assets/${expectedAssetId}.mp4`,
      durationSec: 120,
      sourceFingerprint: `youtube|abc12345678|asset:${expectedAssetId}`,
    });
  });
  it('wires referenceVideoUrl through the from-asset route and video-analysis worker', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/services/editron/auto-edit/from-asset/route.ts'),
      'utf8',
    );
    const workerSource = readFileSync(
      join(process.cwd(), 'app/api/internal/workers/video-analysis/route.ts'),
      'utf8',
    );

    expect(routeSource).toContain('validateReferenceVideoUrlForAutoEditIntake');
    expect(routeSource).toContain('referenceVideoUrl: normalizedReferenceVideoUrl');
    expect(routeSource).toContain('referenceVideoSource: referenceVideoUrlMetadata');
    expect(workerSource).toContain('referenceVideoUrl?: string');
    expect(workerSource).toContain('resolveReferenceVideoSource');
    expect(workerSource).toContain('if (referenceAssetId || referenceVideoUrl)');
    expect(workerSource).toContain('referenceAssetId: referenceId');
  });
});

function emptyAssetResolver(): ReferenceVideoAssetResolver {
  return {
    async getAsset() {
      return null;
    },
    async resolveAssetUrl() {
      return null;
    },
  };
}

function videoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    assetId: 'asset_ref_123',
    userId: 'user_123',
    type: 'video',
    filename: 'reference-demo.mp4',
    source: 'user-upload',
    gcsPath: null,
    cachedUrl: 'https://cdn.example.com/assets/asset_ref_123.mp4',
    urlExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    size: 123_456,
    duration: 74,
    uploadedAt: new Date('2026-06-29T00:00:00.000Z'),
    r2Key: 'asset_ref_123',
    ...overrides,
  };
}
