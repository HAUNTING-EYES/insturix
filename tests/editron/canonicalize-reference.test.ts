import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  canonicalizeReferenceVideo,
  CanonicalizeReferenceError,
  buildCanonicalRemoteAssetId,
  type CanonicalizeReferenceDeps,
} from '@/lib/editron/reference-video/canonicalize-reference';
import { REFERENCE_ENVELOPE_VERSION } from '@/lib/editron/reference-video/reference-demux';
import {
  REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
  type ReferenceMaterializedMediaFileRegistrationInputV1,
}
  from '@/lib/editron/reference-video/reference-materialized-media-registration-v1';

const source = {
  kind: 'remote-url' as const,
  referenceId: 'ref_url_abc',
  videoUrl: 'https://cdn.example.com/clip.mp4',
  sourceLabel: 'demo clip',
  sourceFingerprint: 'remote-url|https://cdn.example.com/clip.mp4',
};

function fakeDeps(overrides: Partial<CanonicalizeReferenceDeps> = {}): CanonicalizeReferenceDeps {
  return {
    downloadSourceBytes: async () => Buffer.alloc(20_000, 0xab),
    uploadCanonicalFile: async (
      filePath: string, _userId: string, _fileName: string,
      contentType: string, canonicalAssetId: string,
    ) => ({
      assetId: canonicalAssetId,
      signedUrl: `https://cdn.example.com/asset/${canonicalAssetId}`,
      gcsPath: null,
      r2Key: canonicalAssetId,
      urlExpiresAt: null,
      size: (await stat(filePath)).size,
      contentType,
    }),
    registerSourceFile: async (input) => registrationReceipt(input),
    demux: async () => ({
      version: 'editron-r1-demux-receipt-v1' as const,
      referenceAssetId: 'ref_url_abc',
      userId: 'user_1',
      createdAt: '2026-08-05T00:00:00.000Z',
      durationMs: 10_000,
      video: { key: 'r2/v.mp4', size: 100, contentType: 'video/mp4', sha256: 'a'.repeat(64) },
      audio: null,
      source: {
        path: 'x', kind: 'remote-url' as const,
        sourceSha256: createHash('sha256').update(Buffer.alloc(20_000, 0xab)).digest('hex'),
      },
    }),
    readDurationMs: async () => 10_000,
    sha256: (b: Buffer) => b.toString('hex'),
    ...overrides,
  };
}

describe('R1-C canonicalize reference', () => {
  it('registers an asset under a content-addressed alias over its existing managed object', async () => {
    const bytes = Buffer.alloc(20_000, 0xab);
    const uploadCanonicalFile = vi.fn(fakeDeps().uploadCanonicalFile!);
    let registeredStorageKey = '';
    const assetSource = {
      kind: 'asset' as const,
      referenceId: 'asset_ref_1',
      videoUrl: 'https://cdn.example.com/asset/asset_ref_1',
      sourceLabel: 'uploaded ref.mp4',
      asset: {
        assetId: 'asset_ref_1', userId: 'user_1', type: 'video' as const,
        filename: 'uploaded-ref.mp4', source: 'user-upload' as const,
        gcsPath: null, r2Key: 'original/source-r2-key',
        cachedUrl: 'https://cdn.example.com/asset/asset_ref_1',
        urlExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        size: bytes.byteLength, uploadedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    };
    const out = await canonicalizeReferenceVideo(
      { userId: 'user_1', source: assetSource, audioUsageMode: 'preview-waveform-only' },
      fakeDeps({
        downloadSourceBytes: async () => bytes,
        uploadCanonicalFile,
        registerSourceFile: async (input) => {
          registeredStorageKey = input.upload.r2Key ?? '';
          return registrationReceipt(input);
        },
      }),
    );

    expect(out.referenceAssetId).toBe(buildCanonicalRemoteAssetId(
      'user_1', 'asset_ref_1', createHash('sha256').update(bytes).digest('hex'),
    ));
    expect(out.canonicalKind).toBe('asset');
    expect(registeredStorageKey).toBe('original/source-r2-key');
    expect(uploadCanonicalFile).not.toHaveBeenCalled();
  });

  it('privately materializes an asset that has no managed R2/GCS object', async () => {
    const assetSource = {
      kind: 'asset' as const,
      referenceId: 'public_asset_ref',
      videoUrl: 'https://public.example.com/reference.webm',
      sourceLabel: 'reference.webm',
      asset: {
        assetId: 'public_asset_ref', userId: 'user_1', type: 'video' as const,
        filename: 'reference.webm', source: 'public' as const, gcsPath: null,
        publicUrl: 'https://public.example.com/reference.webm',
        cachedUrl: 'https://public.example.com/reference.webm',
        urlExpiresAt: new Date('2099-01-01T00:00:00.000Z'), size: 20_000,
        uploadedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    };
    const uploadCanonicalFile = vi.fn(fakeDeps().uploadCanonicalFile!);
    const out = await canonicalizeReferenceVideo(
      { userId: 'user_1', source: assetSource, audioUsageMode: 'preview-waveform-only' },
      fakeDeps({ uploadCanonicalFile }),
    );
    expect(out.canonicalKind).toBe('materialized-asset');
    expect(uploadCanonicalFile).toHaveBeenCalledWith(
      expect.any(String), 'user_1', 'reference.webm', 'video/webm', expect.stringMatching(/^ref_canon_/),
    );
  });

  it('materializes a remote-url reference into a canonical asset with envelope', async () => {
    const exactBytes = Buffer.alloc(20_000, 0xab);
    const expectedId = buildCanonicalRemoteAssetId(
      'user_1', source.referenceId, createHash('sha256').update(exactBytes).digest('hex'),
    );
    let uploadedAssetId = '';
    const fetchSource = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(exactBytes.subarray(0, 7_000));
        controller.enqueue(exactBytes.subarray(7_000));
        controller.close();
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSource);
    const deps = fakeDeps({
      downloadSourceBytes: undefined,
      uploadCanonicalFile: async (_file, _userId, _fileName, contentType, canonicalAssetId) => {
        uploadedAssetId = canonicalAssetId;
        return {
          assetId: canonicalAssetId,
          signedUrl: `https://cdn.example.com/asset/${canonicalAssetId}`,
          gcsPath: null,
          r2Key: canonicalAssetId,
          urlExpiresAt: null,
          size: 20_000,
          contentType,
        };
      },
    });
    let out;
    try {
      out = await canonicalizeReferenceVideo(
        { userId: 'user_1', source, audioUsageMode: 'preview-waveform-only' },
        deps,
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(fetchSource).toHaveBeenCalledWith(source.videoUrl, { signal: undefined });
    expect(out.canonicalKind).toBe('materialized-remote');
    expect(out.referenceAssetId).toBe(expectedId);
    expect(uploadedAssetId).toBe(expectedId);
    // Fake demux has no audio track -> no audioArtifact surfaced for R3.
    expect(out.audioArtifact).toBeNull();
    expect(out.envelope).toBeDefined();
    expect(out.envelope?.version).toBe(REFERENCE_ENVELOPE_VERSION);
    expect(out.envelope?.audioUsageMode).toBe('preview-waveform-only');
    expect(out.envelope?.contentHash).toBe(
      createHash('sha256').update(exactBytes).digest('hex'),
    );
    expect(out.envelope?.demux?.audioPresent).toBe(false);
  });

  it('scopes the canonical asset id per-user (no cross-user R2 collision)', () => {
    const contentHash = 'a'.repeat(64);
    const a = buildCanonicalRemoteAssetId('user_1', source.referenceId, contentHash);
    const b = buildCanonicalRemoteAssetId('user_2', source.referenceId, contentHash);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^ref_canon_/);
  });

  it('changes the canonical object identity when bytes at the same URL change', () => {
    const a = buildCanonicalRemoteAssetId('user_1', source.referenceId, 'a'.repeat(64));
    const b = buildCanonicalRemoteAssetId('user_1', source.referenceId, 'b'.repeat(64));
    expect(a).not.toBe(b);
  });

  it('rejects a remote file too small to be video (fail-loud)', async () => {
    const deps = fakeDeps({
      downloadSourceBytes: async () => Buffer.alloc(0),
    });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'preview-waveform-only' }, deps),
    ).rejects.toMatchObject({ code: 'source_too_small' });
  });

  it('rejects when the remote download fails', async () => {
    const deps = fakeDeps({
      downloadSourceBytes: async () => {
        throw new Error('fetch failed (HTTP 403)');
      },
    });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'preview-waveform-only' }, deps),
    ).rejects.toBeInstanceOf(CanonicalizeReferenceError);
  });

  it('propagates source registration failure with a stable code', async () => {
    const deps = fakeDeps({
      registerSourceFile: async () => {
        throw new Error('asset not found');
      },
    });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'export-attested' }, deps),
    ).rejects.toMatchObject({ code: 'source_registration_failed' });
  });

  it('fails loudly when remote upload fails before demux or registration', async () => {
    const deps = fakeDeps({ uploadCanonicalFile: async () => { throw new Error('R2 unavailable'); } });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'preview-waveform-only' }, deps),
    ).rejects.toMatchObject({ code: 'source_storage_failed' });
  });

  it('carries the export-attested audio mode through Constraint #7', async () => {
    const out = await canonicalizeReferenceVideo(
      { userId: 'user_1', source, audioUsageMode: 'export-attested' },
      fakeDeps(),
    );
    expect(out.envelope?.audioUsageMode).toBe('export-attested');
  });

  it('keeps the default remote path streaming rather than using arrayBuffer', () => {
    const code = readFileSync(path.join(
      process.cwd(), 'lib/editron/reference-video/canonicalize-reference.ts',
    ), 'utf8');
    expect(code).toContain('for await (const chunk of response.body');
    expect(code).toContain('uploadMediaFromFile');
    expect(code).toContain('registerReferenceMaterializedMediaFileV1');
    expect(code).not.toContain('response.arrayBuffer()');
    expect(code).not.toContain('MIN_DL_BYTES');
    expect(code).not.toContain('DL_TIMEOUT_MS');
  });
});

async function registrationReceipt(
  input: Readonly<ReferenceMaterializedMediaFileRegistrationInputV1>,
) {
  const r2Key = input.upload.r2Key;
  const gcsPath = input.upload.gcsPath;
  if (!r2Key && !gcsPath) throw new Error('test receipt requires managed storage');
  return {
    version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
    assetId: input.upload.assetId,
    mediaOwner: { type: 'USER' as const, userId: 'user_1' },
    contentType: input.upload.contentType,
    byteLength: (await stat(input.filePath)).size,
    bytesSha256: createHash('sha256').update(await readFile(input.filePath)).digest('hex'),
    storage: r2Key
      ? { backend: 'R2' as const, key: r2Key }
      : { backend: 'GCS' as const, key: gcsPath! },
    provenance: {
      version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
      role: 'SOURCE' as const,
      referenceEnvelopeSha256: 'd'.repeat(64),
    },
    receiptSha256: 'e'.repeat(64),
  };
}
