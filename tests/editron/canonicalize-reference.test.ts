import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  canonicalizeReferenceVideo,
  CanonicalizeReferenceError,
  buildCanonicalRemoteAssetId,
  type CanonicalizeReferenceDeps,
} from '@/lib/editron/reference-video/canonicalize-reference';
import { REFERENCE_ENVELOPE_VERSION } from '@/lib/editron/reference-video/reference-demux';
import { REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1 }
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
    downloadRemoteBytes: async () => Buffer.alloc(20_000, 0xab),
    uploadRemoteBytes: async (file: Buffer, _userId: string, _fileName: string, referenceAssetId: string) => ({
      assetId: referenceAssetId,
      signedUrl: `https://cdn.example.com/asset/${referenceAssetId}`,
      gcsPath: null,
      r2Key: referenceAssetId,
      urlExpiresAt: null,
      size: file.byteLength,
      contentType: 'video/mp4',
    }),
    registerSource: async (input) => registrationReceipt(input.upload.assetId, input.bytes.byteLength),
    demux: async () => ({
      version: 'editron-r1-demux-receipt-v1' as const,
      referenceAssetId: 'ref_url_abc',
      userId: 'user_1',
      createdAt: '2026-08-05T00:00:00.000Z',
      durationMs: 10_000,
      video: { key: 'r2/v.mp4', size: 100, contentType: 'video/mp4', sha256: 'a'.repeat(64) },
      audio: null,
      source: { path: 'x', kind: 'remote-url' as const, sourceSha256: 'c'.repeat(64) },
    }),
    readDurationMs: async () => 10_000,
    sha256: (b: Buffer) => b.toString('hex'),
    ...overrides,
  };
}

describe('R1-C canonicalize reference', () => {
  it('passes an asset-kind reference straight through as canonical', async () => {
    const assetSource = {
      kind: 'asset' as const,
      referenceId: 'asset_ref_1',
      videoUrl: 'https://cdn.example.com/asset/asset_ref_1',
      sourceLabel: 'uploaded ref',
      asset: { assetId: 'asset_ref_1' } as never,
    };
    const out = await canonicalizeReferenceVideo(
      { userId: 'user_1', source: assetSource, audioUsageMode: 'preview-waveform-only' },
      {},
    );

    expect(out.referenceAssetId).toBe('asset_ref_1');
    expect(out.canonicalKind).toBe('asset');
  });

  it('materializes a remote-url reference into a canonical asset with envelope', async () => {
    const expectedId = buildCanonicalRemoteAssetId(
      'user_1', source.referenceId, createHash('sha256').update(Buffer.alloc(20_000, 0xab)).digest('hex'),
    );
    let uploadedAssetId = '';
    const deps = fakeDeps({
      uploadRemoteBytes: async (_file, _userId, _fileName, referenceAssetId) => {
        uploadedAssetId = referenceAssetId;
        return {
          assetId: referenceAssetId,
          signedUrl: `https://cdn.example.com/asset/${referenceAssetId}`,
          gcsPath: null,
          r2Key: referenceAssetId,
          urlExpiresAt: null,
          size: 20_000,
          contentType: 'video/mp4',
        };
      },
    });
    const out = await canonicalizeReferenceVideo(
      { userId: 'user_1', source, audioUsageMode: 'preview-waveform-only' },
      deps,
    );

    expect(out.canonicalKind).toBe('materialized-remote');
    expect(out.referenceAssetId).toBe(expectedId);
    expect(uploadedAssetId).toBe(expectedId);
    // Fake demux has no audio track -> no audioArtifact surfaced for R3.
    expect(out.audioArtifact).toBeNull();
    expect(out.envelope).toBeDefined();
    expect(out.envelope?.version).toBe(REFERENCE_ENVELOPE_VERSION);
    expect(out.envelope?.audioUsageMode).toBe('preview-waveform-only');
    expect(out.envelope?.contentHash).toBe('c'.repeat(64)); // wired from the demux receipt source hash
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
      downloadRemoteBytes: async () => Buffer.alloc(50, 0x00),
    });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'preview-waveform-only' }, deps),
    ).rejects.toMatchObject({ code: 'remote_too_small' });
  });

  it('rejects when the remote download fails', async () => {
    const deps = fakeDeps({
      downloadRemoteBytes: async () => {
        throw new Error('fetch failed (HTTP 403)');
      },
    });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'preview-waveform-only' }, deps),
    ).rejects.toBeInstanceOf(CanonicalizeReferenceError);
  });

  it('propagates source registration failure with a stable code', async () => {
    const deps = fakeDeps({
      registerSource: async () => {
        throw new Error('asset not found');
      },
    });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'export-attested' }, deps),
    ).rejects.toMatchObject({ code: 'source_registration_failed' });
  });

  it('fails loudly when remote upload fails before demux or registration', async () => {
    const deps = fakeDeps({ uploadRemoteBytes: async () => { throw new Error('R2 unavailable'); } });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'preview-waveform-only' }, deps),
    ).rejects.toMatchObject({ code: 'remote_upload_failed' });
  });

  it('carries the export-attested audio mode through Constraint #7', async () => {
    const out = await canonicalizeReferenceVideo(
      { userId: 'user_1', source, audioUsageMode: 'export-attested' },
      fakeDeps(),
    );
    expect(out.envelope?.audioUsageMode).toBe('export-attested');
  });
});

function registrationReceipt(assetId: string, byteLength: number) {
  return {
    version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
    assetId,
    mediaOwner: { type: 'USER' as const, userId: 'user_1' },
    contentType: 'video/mp4',
    byteLength,
    bytesSha256: 'c'.repeat(64),
    storage: { backend: 'R2' as const, key: assetId },
    provenance: {
      version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
      role: 'SOURCE' as const,
      referenceEnvelopeSha256: 'd'.repeat(64),
    },
    receiptSha256: 'e'.repeat(64),
  };
}
