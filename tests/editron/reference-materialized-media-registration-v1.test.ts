import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  registerReferenceMaterializedMediaAssetV1,
  type ReferenceMaterializedMediaAssetRowV1,
  type ReferenceMaterializedMediaAssetStoreV1,
} from '@/lib/editron/reference-video/reference-materialized-media-registration-v1';

const NOW = new Date('2026-08-23T10:00:00.000Z');

describe('reference materialized media registration V1', () => {
  it('create-or-compares a source in existing mediaAssets with exact byte and envelope identity', async () => {
    const bytes = Buffer.from('exact-source-video');
    const store = new MemoryStore();
    const first = await registerReferenceMaterializedMediaAssetV1({
      bytes,
      upload: upload('source_asset', bytes, { r2Key: 'users/user-1/source_asset.mp4' }),
      actorUserId: 'user-1',
      mediaOwner: { type: 'USER', userId: 'user-1' },
      mediaKind: 'video',
      filename: 'reference.mp4',
      role: { kind: 'SOURCE', referenceEnvelope: envelope(bytes) },
      uploadedAt: NOW,
    }, { store });
    const replay = await registerReferenceMaterializedMediaAssetV1({
      bytes,
      upload: upload('source_asset', bytes, { r2Key: 'users/user-1/source_asset.mp4' }),
      actorUserId: 'user-1',
      mediaOwner: { type: 'USER', userId: 'user-1' },
      mediaKind: 'video',
      filename: 'renamed-reference.mp4',
      role: { kind: 'SOURCE', referenceEnvelope: envelope(bytes) },
      uploadedAt: new Date('2026-08-23T11:00:00.000Z'),
    }, { store });

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      assetId: 'source_asset',
      byteLength: bytes.length,
      bytesSha256: sha(bytes),
      storage: { backend: 'R2', key: 'users/user-1/source_asset.mp4' },
      provenance: { role: 'SOURCE' },
    });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      assetId: 'source_asset',
      userId: 'user-1',
      type: 'video',
      contentHash: sha(bytes),
      referenceEnvelope: { contentHash: sha(bytes) },
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('registers a GCS-derived frame with source/timestamp provenance and org ownership', async () => {
    const bytes = Buffer.from('jpeg-frame');
    const store = new MemoryStore();
    const receipt = await registerReferenceMaterializedMediaAssetV1({
      bytes,
      upload: upload('frame_asset', bytes, {
        contentType: 'image/jpeg', r2Key: null, gcsPath: 'media/org-1/frame.jpg',
      }),
      actorUserId: 'user-operator',
      mediaOwner: { type: 'ORG', orgId: 'org-1' },
      mediaKind: 'image',
      filename: 'frame.jpg',
      role: {
        kind: 'DERIVED_FRAME', sourceAssetId: 'source_asset',
        frameId: 'frame_000001', timestampUs: '1250000',
      },
      uploadedAt: NOW,
    }, { store });

    expect(receipt).toMatchObject({
      mediaOwner: { type: 'ORG', orgId: 'org-1' },
      storage: { backend: 'GCS', key: 'media/org-1/frame.jpg' },
      provenance: {
        role: 'DERIVED_FRAME', sourceAssetId: 'source_asset',
        frameId: 'frame_000001', timestampUs: '1250000',
      },
    });
    expect(store.rows[0]).toMatchObject({ userId: 'user-operator', orgId: 'org-1' });
  });

  it('rejects byte-length, owner, envelope, storage and stored-identity drift', async () => {
    const bytes = Buffer.from('source');
    const valid = {
      bytes,
      upload: upload('source_asset', bytes, { r2Key: 'source.mp4' }),
      actorUserId: 'user-1',
      mediaOwner: { type: 'USER' as const, userId: 'user-1' },
      mediaKind: 'video' as const,
      filename: 'source.mp4',
      role: { kind: 'SOURCE' as const, referenceEnvelope: envelope(bytes) },
      uploadedAt: NOW,
    };

    await expect(registerReferenceMaterializedMediaAssetV1({
      ...valid, upload: { ...valid.upload, size: bytes.length + 1 },
    }, { store: new MemoryStore() })).rejects.toThrow('BYTE_LENGTH_MISMATCH');
    await expect(registerReferenceMaterializedMediaAssetV1({
      ...valid, mediaOwner: { type: 'USER', userId: 'user-2' },
    }, { store: new MemoryStore() })).rejects.toThrow('MEDIA_OWNER_ACTOR_MISMATCH');
    await expect(registerReferenceMaterializedMediaAssetV1({
      ...valid,
      role: {
        kind: 'SOURCE',
        referenceEnvelope: { ...envelope(bytes), contentHash: 'f'.repeat(64) },
      },
    }, { store: new MemoryStore() })).rejects.toThrow('REFERENCE_ENVELOPE_CONTENT_MISMATCH');
    await expect(registerReferenceMaterializedMediaAssetV1({
      ...valid, upload: { ...valid.upload, r2Key: null, gcsPath: null },
    }, { store: new MemoryStore() })).rejects.toThrow('STORAGE_IDENTITY_MISSING');

    const conflicting = new MemoryStore({ contentHash: 'f'.repeat(64) });
    await expect(registerReferenceMaterializedMediaAssetV1(valid, { store: conflicting }))
      .rejects.toThrow('STORED_IDENTITY_MISMATCH');
  });
});

class MemoryStore implements ReferenceMaterializedMediaAssetStoreV1 {
  readonly rows: ReferenceMaterializedMediaAssetRowV1[] = [];

  constructor(private readonly firstReadPatch: Record<string, unknown> = {}) {}

  async createOrRead(row: Readonly<ReferenceMaterializedMediaAssetRowV1>): Promise<unknown> {
    const existing = this.rows.find((candidate) =>
      candidate.assetId === row.assetId && candidate.userId === row.userId);
    if (!existing) this.rows.push(structuredClone(row));
    return { ...structuredClone(existing ?? this.rows[this.rows.length - 1]), ...this.firstReadPatch };
  }
}

function upload(
  assetId: string,
  bytes: Buffer,
  overrides: Partial<{
    contentType: string;
    r2Key: string | null;
    gcsPath: string | null;
  }> = {},
) {
  return {
    assetId,
    signedUrl: `https://cdn.example.com/${assetId}`,
    gcsPath: overrides.gcsPath ?? null,
    r2Key: overrides.r2Key === undefined ? `${assetId}.bin` : overrides.r2Key,
    urlExpiresAt: null,
    size: bytes.length,
    contentType: overrides.contentType ?? 'video/mp4',
  };
}

function envelope(bytes: Buffer) {
  return {
    version: 'editron-r1-reference-envelope-v1',
    contentHash: sha(bytes),
    audioUsageMode: 'preview-waveform-only' as const,
    demux: {
      version: 'editron-r1-demux-receipt-v1',
      demuxedAt: '2026-08-23T09:00:00.000Z',
      durationMs: 4_000,
      videoSha256: 'a'.repeat(64),
      audioSha256: null,
      audioPresent: false,
    },
  };
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
