import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/services/media-source-qualification-runtime-v1', () => ({
  resolveVerifiedMediaSourceUrlV1: vi.fn(),
}));
vi.mock('@/lib/editron/services/media-source-storage-version-v1', async (original) => {
  const actual = await original<
    typeof import('@/lib/editron/services/media-source-storage-version-v1')
  >();
  return { ...actual, inspectMediaSourceStorageVersionV1: vi.fn() };
});

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { resolveVerifiedMediaSourceUrlV1 }
  from '@/lib/editron/services/media-source-qualification-runtime-v1';
import {
  createMediaSourceStorageVersionV1,
  inspectMediaSourceStorageVersionV1,
} from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import {
  createQualifiedAssetMediaSourceLeasePortV1,
  createVerifiedAssetMediaSourceLeasePortV1,
} from '@/lib/editron/services/verified-media-source-local-file-v1';

const errors = {
  bindingStale: 'TEST_BINDING_STALE',
  versionStale: 'TEST_VERSION_STALE',
  sourceUnavailable: 'TEST_SOURCE_UNAVAILABLE',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('qualified media source lease v1', () => {
  it('opens and revalidates an immutable audio source without a video V3 map', async () => {
    const fixture = sourceFixture('audio');
    vi.mocked(resolveVerifiedMediaSourceUrlV1).mockResolvedValue({
      disposition: 'AVAILABLE',
      sourceUrl: 'https://private.example/audio?signature=secret',
      storageVersion: fixture.storageVersion,
    });
    vi.mocked(inspectMediaSourceStorageVersionV1).mockResolvedValue({
      disposition: 'OBSERVED',
      storageVersion: fixture.storageVersion,
    });

    const lease = await createQualifiedAssetMediaSourceLeasePortV1(
      fixture.asset,
      errors,
    ).open(fixture.sourceVersion);

    expect(lease.sourceUrl).toBe('https://private.example/audio?signature=secret');
    await expect(lease.revalidate()).resolves.toBe(true);
    expect(inspectMediaSourceStorageVersionV1)
      .toHaveBeenCalledWith(fixture.storageVersion.locator);
  });

  it('keeps the existing video lease gated on a verified V3 epoch binding', async () => {
    const fixture = sourceFixture('video');

    await expect(createVerifiedAssetMediaSourceLeasePortV1(
      fixture.asset,
      errors,
    ).open(fixture.sourceVersion)).rejects.toThrow('TEST_BINDING_STALE');
    expect(resolveVerifiedMediaSourceUrlV1).not.toHaveBeenCalled();
  });

  it('distinguishes unavailable source access from a changed storage version', async () => {
    const fixture = sourceFixture('stale');
    vi.mocked(resolveVerifiedMediaSourceUrlV1).mockResolvedValueOnce({
      disposition: 'UNVERIFIABLE',
      result: {
        disposition: 'UNVERIFIABLE',
        observation: null,
        diagnostics: ['MEDIA_SOURCE_SIGNED_URL_UNAVAILABLE'],
      },
    });
    const port = createQualifiedAssetMediaSourceLeasePortV1(fixture.asset, errors);
    await expect(port.open(fixture.sourceVersion))
      .rejects.toThrow('TEST_SOURCE_UNAVAILABLE');

    const changed = createMediaSourceStorageVersionV1({
      locator: fixture.storageVersion.locator,
      byteLength: fixture.storageVersion.byteLength,
      providerVersion: { kind: 'R2_ETAG', value: 'changed-etag' },
    });
    vi.mocked(resolveVerifiedMediaSourceUrlV1).mockResolvedValueOnce({
      disposition: 'AVAILABLE',
      sourceUrl: 'https://private.example/stale',
      storageVersion: changed,
    });
    await expect(port.open(fixture.sourceVersion))
      .rejects.toThrow('TEST_VERSION_STALE');
  });
});

function sourceFixture(tag: string) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `tests/qualified-${tag}.wav` },
    byteLength: 100,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-qualified-lease' },
    assetId: `asset-qualified-${tag}`,
    mediaKind: 'audio',
    byteLength: storageVersion.byteLength,
    contentSha256: hash(`source-${tag}`),
    storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'wav',
    durationMilliseconds: 1,
    startTimeMilliseconds: 0,
    videoStreams: [],
    audioStreams: [{
      streamIndex: 0,
      codec: 'pcm_s16le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '10',
    }],
  };
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: sourceVersion.assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: hash(`binding-${tag}`),
    requestId: `request-${tag}`,
    attemptCount: 1,
    requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  return {
    storageVersion,
    sourceVersion,
    asset: {
      assetId: sourceVersion.assetId,
      type: 'audio' as const,
      sourceVersionV1: sourceVersion,
      sourceQualificationV1: qualification,
    },
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
