import { beforeEach, describe, expect, it, vi } from 'vitest';

const evidence = vi.hoisted(() => ({
  assertRecord: vi.fn((value: unknown) => value),
  assetView: vi.fn((value: unknown) => (
    value as { assetView: Record<string, unknown> }
  ).assetView),
}));

vi.mock('@/lib/editron/services/media-source-version-evidence-owner-v1', () => ({
  assertMediaSourceVersionEvidenceRecordV1: evidence.assertRecord,
  mediaSourceVersionEvidenceAssetViewV1: evidence.assetView,
}));

import { createProjectSelectedMediaSourceLeasePortV1 }
  from '@/lib/editron/services/project-selected-media-source-lease-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('project selected media source lease V1', () => {
  beforeEach(() => {
    evidence.assertRecord.mockClear();
    evidence.assetView.mockClear();
  });

  it('opens the exact current source without historical evidence', async () => {
    const current = source('current', 'current.mp4');
    const asset = sourceAsset(current, null);
    const load = vi.fn();
    const { createQualifiedLease, open } = qualifiedLease();
    const port = createProjectSelectedMediaSourceLeasePortV1({
      asset,
      evidenceReader: { load },
      createQualifiedLease,
    });

    expect(await port.open(current)).toMatchObject({
      sourceUrl: 'https://lease.example.com/exact',
      storageVersion: current.storageVersion,
    });
    expect(load).not.toHaveBeenCalled();
    expect(createQualifiedLease).toHaveBeenCalledWith(asset, expect.objectContaining({
      bindingStale: 'ASSET_TRANSCRIPTION_SOURCE_BINDING_STALE',
    }));
    expect(open).toHaveBeenCalledWith(current);
  });

  it('opens a retained proxy from its own immutable qualification evidence', async () => {
    const current = source('master', 'master.mp4');
    const proxy = source('proxy', 'proxy.mp4');
    const asset = sourceAsset(current, proxy);
    const historicalView = { sourceVersionV1: proxy, sourceQualificationV1: {} };
    const record = { sourceVersionV1: proxy, assetView: historicalView };
    const load = vi.fn(async () => record);
    const { createQualifiedLease, open } = qualifiedLease();
    const port = createProjectSelectedMediaSourceLeasePortV1({
      asset,
      evidenceReader: { load },
      createQualifiedLease,
    });

    await expect(port.open(proxy)).resolves.toMatchObject({
      storageVersion: proxy.storageVersion,
    });
    expect(load).toHaveBeenCalledWith({
      owner: proxy.owner,
      assetId: proxy.assetId,
      sourceVersionSha256: proxy.sourceVersionSha256,
    });
    expect(evidence.assertRecord).toHaveBeenCalledWith(record);
    expect(evidence.assetView).toHaveBeenCalledWith(record);
    expect(createQualifiedLease).toHaveBeenCalledWith(
      historicalView,
      expect.any(Object),
    );
    expect(open).toHaveBeenCalledWith(proxy);
  });

  it('rejects an arbitrary source without reading historical evidence', async () => {
    const current = source('master', 'master.mp4');
    const proxy = source('proxy', 'proxy.mp4');
    const unknown = source('unknown', 'unknown.mp4');
    const load = vi.fn();
    const { createQualifiedLease } = qualifiedLease();
    const port = createProjectSelectedMediaSourceLeasePortV1({
      asset: sourceAsset(current, proxy),
      evidenceReader: { load },
      createQualifiedLease,
    });

    await expect(port.open(unknown)).rejects.toThrow(
      'ASSET_TRANSCRIPTION_SOURCE_BINDING_STALE',
    );
    expect(load).not.toHaveBeenCalled();
    expect(createQualifiedLease).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', async () => null],
    ['unavailable', async () => { throw new Error('database'); }],
    ['wrong-source', async () => ({
      sourceVersionV1: source('wrong', 'wrong.mp4'),
      assetView: {},
    })],
  ])('rejects %s historical evidence', async (_label, read) => {
    const current = source('master', 'master.mp4');
    const proxy = source('proxy', 'proxy.mp4');
    const { createQualifiedLease } = qualifiedLease();
    const port = createProjectSelectedMediaSourceLeasePortV1({
      asset: sourceAsset(current, proxy),
      evidenceReader: {
        load: vi.fn(async (): Promise<unknown | null> => read()),
      },
      createQualifiedLease,
    });

    await expect(port.open(proxy)).rejects.toThrow(
      'ASSET_TRANSCRIPTION_SOURCE_BINDING_STALE',
    );
    expect(createQualifiedLease).not.toHaveBeenCalled();
  });

  it('preserves the qualified lease failure instead of substituting a source', async () => {
    const current = source('current', 'current.mp4');
    const createQualifiedLease = vi.fn(() => ({
      open: vi.fn(async () => {
        throw new Error('ASSET_TRANSCRIPTION_SOURCE_VERSION_STALE');
      }),
    }));
    const port = createProjectSelectedMediaSourceLeasePortV1({
      asset: sourceAsset(current, null),
      evidenceReader: { load: vi.fn() },
      createQualifiedLease,
    });

    await expect(port.open(current)).rejects.toThrow(
      'ASSET_TRANSCRIPTION_SOURCE_VERSION_STALE',
    );
  });
});

function qualifiedLease() {
  const open = vi.fn(async (sourceVersion: ReturnType<typeof source>) => ({
    sourceUrl: 'https://lease.example.com/exact',
    storageVersion: sourceVersion.storageVersion,
    revalidate: vi.fn(async () => true),
  }));
  return {
    open,
    createQualifiedLease: vi.fn(() => ({ open })),
  };
}

function source(tag: string, objectKey: string) {
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 4_096,
    contentSha256: 'a'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: `private/${objectKey}` },
      byteLength: 4_096,
      providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
    }),
  });
}

function sourceAsset(
  current: ReturnType<typeof source>,
  proxy: ReturnType<typeof source> | null,
) {
  return {
    assetId: current.assetId,
    type: 'video' as const,
    sourceVersionV1: current,
    sourceQualificationV1: {},
    proxySourceVersionV1: proxy,
  };
}
