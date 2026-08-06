import { describe, expect, it } from 'vitest';

import {
  canonicalizeReferenceVideo,
  CanonicalizeReferenceError,
  buildCanonicalRemoteAssetId,
  type CanonicalizeReferenceDeps,
} from '@/lib/editron/reference-video/canonicalize-reference';
import { REFERENCE_ENVELOPE_VERSION } from '@/lib/editron/reference-video/reference-demux';

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
      videoUrl: `https://cdn.example.com/asset/${referenceAssetId}`,
      size: file.byteLength,
    }),
    persistEnvelope: async () => null,
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
    const expectedId = buildCanonicalRemoteAssetId('user_1', source.referenceId);
    let uploadedAssetId = '';
    const deps = fakeDeps({
      uploadRemoteBytes: async (_file, _userId, _fileName, referenceAssetId) => {
        uploadedAssetId = referenceAssetId;
        return { assetId: referenceAssetId, videoUrl: `https://cdn.example.com/asset/${referenceAssetId}`, size: 20_000 };
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
    const a = buildCanonicalRemoteAssetId('user_1', source.referenceId);
    const b = buildCanonicalRemoteAssetId('user_2', source.referenceId);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^ref_canon_/);
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

  it('propagates envelope persist failure with a stable code', async () => {
    const deps = fakeDeps({
      persistEnvelope: async () => {
        throw new Error('asset not found');
      },
    });
    await expect(
      canonicalizeReferenceVideo({ userId: 'user_1', source, audioUsageMode: 'export-attested' }, deps),
    ).rejects.toMatchObject({ code: 'envelope_persist_failed' });
  });

  it('carries the export-attested audio mode through Constraint #7', async () => {
    const out = await canonicalizeReferenceVideo(
      { userId: 'user_1', source, audioUsageMode: 'export-attested' },
      fakeDeps(),
    );
    expect(out.envelope?.audioUsageMode).toBe('export-attested');
  });
});
