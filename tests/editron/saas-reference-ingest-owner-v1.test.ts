import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  assertSupportedSaasReferenceUploadV1,
  ingestSaasExplainerReferenceV1,
  SaasReferenceIngestErrorV1,
} from '@/lib/editron/saas-explainer/reference-ingest-owner-v1';
import type {
  CanonicalizeReferenceDeps,
  CanonicalizeReferenceInput,
  CanonicalizeReferenceOutput,
} from '@/lib/editron/reference-video/canonicalize-reference';
import type { SampleReferenceVideoFramesParams } from '@/lib/editron/reference-video/reference-frame-sampler';
import { resolveCanonicalReferenceStorageV1 } from '@/lib/editron/reference-video/reference-source-storage-v1';

describe('SaaS reference ingest owner V1', () => {
  it('uploads, canonicalizes, then samples an exact upload identity', async () => {
    const order: string[] = [];
    const bytes = Buffer.alloc(20_000, 0xab);
    const upload = vi.fn(async (
      _bytes: Buffer,
      _userId: string,
      _filename: string,
      _contentType: string,
      options: Readonly<{ customAssetId: string }>,
    ) => {
      order.push('upload');
      return uploadResult(options.customAssetId);
    });
    const canonicalize = vi.fn(async (
      input: CanonicalizeReferenceInput,
      deps?: CanonicalizeReferenceDeps,
    ): Promise<CanonicalizeReferenceOutput> => {
      order.push('canonicalize');
      expect(input.source.kind).toBe('asset');
      expect(input.source.referenceId).toMatch(/^saasref_upload_[a-f0-9]{24}$/);
      expect(input.source.asset?.r2Key).toBe(input.source.referenceId);
      await expect(deps?.downloadSourceBytes?.('ignored')).resolves.toEqual(bytes);
      return canonicalOutput();
    });
    const sampleFrames = vi.fn(async (input: SampleReferenceVideoFramesParams) => {
      order.push('sample');
      expect(input).toMatchObject({
        referenceAssetId: 'ref_canon_final',
        videoUrl: 'https://cdn.example.com/ref_canon_final.mp4',
        durationSec: 12,
      });
      return [frameReceipt(0)];
    });

    const result = await ingestSaasExplainerReferenceV1(
      { userId: 'user_1', source: { kind: 'upload', bytes, filename: 'Reference.MP4' } },
      { upload, canonicalize, sampleFrames },
    );

    expect(order).toEqual(['upload', 'canonicalize', 'sample']);
    expect(upload).toHaveBeenCalledWith(
      bytes,
      'user_1',
      expect.stringMatching(/^saasref_upload_[a-f0-9]{24}\.mp4$/),
      'video/mp4',
      { customAssetId: expect.stringMatching(/^saasref_upload_[a-f0-9]{24}$/) },
    );
    expect(result.referenceImageUrls).toEqual(['https://cdn.example.com/frame-0.jpg']);
    expect(result.frameAssetIds).toEqual(['frame_asset_0']);
    expect(result.frameRegistrationReceiptSha256s).toEqual(['f'.repeat(64)]);
  });

  it('resolves and canonicalizes a URL before frame sampling', async () => {
    const order: string[] = [];
    const resolveSource = vi.fn(async () => {
      order.push('resolve');
      return {
        ok: true as const,
        source: {
          kind: 'remote-url' as const,
          referenceId: 'ref_url_source',
          videoUrl: 'https://public.example.com/reference.webm',
          sourceLabel: 'reference.webm',
          sourceFingerprint: 'remote-url|reference.webm',
          asset: null,
        },
      };
    });
    const canonicalize = vi.fn(async (): Promise<CanonicalizeReferenceOutput> => {
      order.push('canonicalize');
      return { ...canonicalOutput(), canonicalKind: 'materialized-remote' };
    });
    const sampleFrames = vi.fn(async () => {
      order.push('sample');
      return [frameReceipt(0)];
    });

    const result = await ingestSaasExplainerReferenceV1(
      { userId: 'user_1', source: { kind: 'url', videoUrl: 'https://public.example.com/reference.webm' } },
      { assetResolver: fakeAssetResolver(), resolveSource, canonicalize, sampleFrames },
    );

    expect(order).toEqual(['resolve', 'canonicalize', 'sample']);
    expect(result.canonical.sourceKind).toBe('materialized-remote');
  });

  it('stops before canonicalization and sampling when source resolution rejects', async () => {
    const canonicalize = vi.fn();
    const sampleFrames = vi.fn();
    const promise = ingestSaasExplainerReferenceV1(
      { userId: 'user_1', source: { kind: 'url', videoUrl: 'http://127.0.0.1/private.mp4' } },
      {
        assetResolver: fakeAssetResolver(),
        resolveSource: async () => ({
          ok: false as const,
          reason: 'unsafe_reference_video_url' as const,
          diagnostics: ['Private network target rejected.'],
          sourceKind: 'remote-url' as const,
        }),
        canonicalize,
        sampleFrames,
      },
    );
    await expect(promise).rejects.toMatchObject({
      code: 'unsafe_reference_video_url', status: 422,
    });
    expect(canonicalize).not.toHaveBeenCalled();
    expect(sampleFrames).not.toHaveBeenCalled();
  });

  it('never samples when canonicalization fails', async () => {
    const sampleFrames = vi.fn();
    const promise = ingestSaasExplainerReferenceV1(
      { userId: 'user_1', source: { kind: 'url', videoUrl: 'https://public.example.com/ref.mp4' } },
      {
        assetResolver: fakeAssetResolver(),
        resolveSource: async () => ({
          ok: true as const,
          source: {
            kind: 'remote-url' as const,
            referenceId: 'ref_url',
            videoUrl: 'https://public.example.com/ref.mp4',
            sourceLabel: 'ref.mp4',
            asset: null,
          },
        }),
        canonicalize: async () => { throw new Error('registration unavailable'); },
        sampleFrames,
      },
    );
    await expect(promise).rejects.toMatchObject({
      code: 'source_canonicalization_failed', status: 502,
    });
    expect(sampleFrames).not.toHaveBeenCalled();
  });

  it('fails instead of returning a successful empty frame pack', async () => {
    const promise = ingestSaasExplainerReferenceV1(
      { userId: 'user_1', source: { kind: 'url', videoUrl: 'https://public.example.com/ref.mp4' } },
      {
        assetResolver: fakeAssetResolver(),
        resolveSource: async () => ({
          ok: true as const,
          source: {
            kind: 'remote-url' as const,
            referenceId: 'ref_url',
            videoUrl: 'https://public.example.com/ref.mp4',
            sourceLabel: 'ref.mp4',
            asset: null,
          },
        }),
        canonicalize: async () => canonicalOutput(),
        sampleFrames: async () => [],
      },
    );
    await expect(promise).rejects.toMatchObject({
      code: 'reference_frames_empty', status: 422,
    });
  });

  it('uses one format allowlist for uploads', () => {
    for (const filename of ['a.mp4', 'a.mov', 'a.webm', 'a.m4v']) {
      expect(() => assertSupportedSaasReferenceUploadV1(filename)).not.toThrow();
    }
    expect(() => assertSupportedSaasReferenceUploadV1('reference.avi'))
      .toThrow(SaasReferenceIngestErrorV1);
  });

  it('preserves permanent R2 URL semantics on a managed canonical alias', async () => {
    const storage = await resolveCanonicalReferenceStorageV1({
      userId: 'user_1',
      bytes: Buffer.from('exact managed bytes'),
      source: {
        kind: 'asset',
        referenceId: 'asset_1',
        videoUrl: 'https://cdn.example.com/asset_1.mp4',
        sourceLabel: 'asset_1.mp4',
        asset: {
          assetId: 'asset_1', userId: 'user_1', type: 'video', filename: 'asset_1.mp4',
          source: 'user-upload', gcsPath: null, r2Key: 'r2/asset_1',
          cachedUrl: 'https://cdn.example.com/asset_1.mp4',
          urlExpiresAt: new Date('2099-01-01T00:00:00.000Z'), size: 19,
          uploadedAt: new Date('2026-08-23T00:00:00.000Z'),
        },
      },
    }, {
      uploadCanonicalBytes: async () => { throw new Error('managed object must not upload'); },
    });
    expect(storage.upload.urlExpiresAt).toBeNull();
  });

  it('removes both standalone direct-sampling bypasses', () => {
    const routeSource = readFileSync(join(
      process.cwd(), 'app/api/services/editron/saas-explainer/ingest-reference/route.ts',
    ), 'utf8');
    const analysisSource = readFileSync(join(
      process.cwd(), 'lib/editron/saas-explainer/reference-analysis.ts',
    ), 'utf8');
    expect(routeSource).toContain('ingestSaasExplainerReferenceV1');
    expect(routeSource).not.toContain("from '@/lib/editron/services/upload-service'");
    expect(routeSource).not.toContain("from '@/lib/editron/reference-video/reference-frame-sampler'");
    expect(routeSource).not.toContain("from 'nanoid'");
    expect(analysisSource).toContain('resolveCanonicalSaasReferenceSourceV1');
    expect(analysisSource).not.toContain('resolveReferenceVideoSource');
    expect(analysisSource.indexOf('resolveCanonicalSaasReferenceSourceV1({'))
      .toBeLessThan(analysisSource.indexOf('sampleReferenceVideoFrames({'));
  });
});

function fakeAssetResolver() {
  return {
    getAsset: async () => null,
    resolveAssetUrl: async () => null,
  };
}

function uploadResult(assetId: string) {
  return {
    assetId,
    signedUrl: `https://cdn.example.com/${assetId}.mp4`,
    gcsPath: null,
    r2Key: assetId,
    urlExpiresAt: null,
    size: 20_000,
    contentType: 'video/mp4',
  };
}

function canonicalOutput(): CanonicalizeReferenceOutput {
  return {
    referenceAssetId: 'ref_canon_final',
    videoUrl: 'https://cdn.example.com/ref_canon_final.mp4',
    canonicalKind: 'asset',
    durationSec: 12,
    sourceLabel: 'Reference.mp4',
    sourceFingerprint: 'upload|sha256:abc',
  };
}

function frameReceipt(index: number) {
  return {
    index,
    timestampSec: index,
    timestampUs: String(index * 1_000_000),
    frameId: `frame_${index}`,
    assetId: `frame_asset_${index}`,
    url: `https://cdn.example.com/frame-${index}.jpg`,
    mimeType: 'image/jpeg' as const,
    byteLength: 100,
    bytesSha256: 'e'.repeat(64),
    storage: { backend: 'R2' as const, key: `frame_asset_${index}` },
    registrationReceiptSha256: 'f'.repeat(64),
  };
}
