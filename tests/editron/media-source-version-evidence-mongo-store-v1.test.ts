import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1,
  MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1,
} from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import {
  createMediaSourceVersionEvidenceMongoStorePortsV1,
  type MediaSourceVersionEvidenceMongoCollectionV1,
} from '@/lib/editron/services/media-source-version-evidence-mongo-store-v1';
import {
  captureMediaSourceVersionEvidenceV1,
  mediaSourceVersionEvidenceScopeV1,
} from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  createMediaSourceVersionV1,
  type MediaSourceOwnerV1,
} from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourceVersionEvidenceMongoStoreV1', () => {
  it('creates one exact-scope index, majority-inserts, and primary-rereads', async () => {
    const fixture = memoryCollection();
    const ports = createMediaSourceVersionEvidenceMongoStorePortsV1({
      loadCollection: vi.fn(async () => fixture.collection),
    });
    const record = evidenceFixture({ kind: 'USER', userId: 'user-evidence' });
    const scope = mediaSourceVersionEvidenceScopeV1(record);

    await expect(ports.compareAndSet({
      scope,
      expectedEvidenceSha256: null,
      next: record,
    })).resolves.toBe(true);
    await expect(ports.load(scope)).resolves.toEqual(record);
    expect(fixture.createIndex).toHaveBeenCalledTimes(1);
    expect(fixture.createIndex).toHaveBeenCalledWith({
      'scope.owner.kind': 1,
      'scope.owner.userId': 1,
      'scope.owner.orgId': 1,
      'scope.assetId': 1,
      'scope.sourceVersionSha256': 1,
    }, {
      name: 'uniq_media_source_version_evidence_scope_v1',
      unique: true,
    });
    expect(fixture.findOne).toHaveBeenLastCalledWith(
      { _id: expect.stringMatching(/^[a-f0-9]{64}$/) },
      { readPreference: 'primary' },
    );
    expect(fixture.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceSha256: { $exists: false } }),
      { $setOnInsert: expect.objectContaining({ record }) },
      { upsert: true, writeConcern: { w: 'majority' } },
    );
  });

  it('isolates organization scope and returns false for insert and stale races', async () => {
    const fixture = memoryCollection();
    const ports = createMediaSourceVersionEvidenceMongoStorePortsV1({
      loadCollection: async () => fixture.collection,
    });
    const record = evidenceFixture({ kind: 'ORG', orgId: 'org-evidence' });
    const scope = mediaSourceVersionEvidenceScopeV1(record);

    await expect(ports.compareAndSet({
      scope, expectedEvidenceSha256: null, next: record,
    })).resolves.toBe(true);
    await expect(ports.compareAndSet({
      scope, expectedEvidenceSha256: null, next: record,
    })).resolves.toBe(false);
    await expect(ports.compareAndSet({
      scope, expectedEvidenceSha256: hash('stale'), next: record,
    })).resolves.toBe(false);
    await expect(ports.compareAndSet({
      scope, expectedEvidenceSha256: record.evidenceSha256, next: record,
    })).resolves.toBe(true);
    expect(fixture.records).toHaveLength(1);
    expect(fixture.updateOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        evidenceSha256: record.evidenceSha256,
        'record.evidenceSha256': record.evidenceSha256,
      }),
      { $set: { evidenceSha256: record.evidenceSha256, record } },
      { upsert: false, writeConcern: { w: 'majority' } },
    );
  });

  it('rejects forged scope and malformed stored documents', async () => {
    const fixture = memoryCollection();
    const ports = createMediaSourceVersionEvidenceMongoStorePortsV1({
      loadCollection: async () => fixture.collection,
    });
    const record = evidenceFixture({ kind: 'USER', userId: 'user-evidence' });
    const scope = mediaSourceVersionEvidenceScopeV1(record);
    await expect(ports.compareAndSet({
      scope: { ...scope, assetId: 'another-asset' },
      expectedEvidenceSha256: null,
      next: record,
    })).rejects.toThrow('MEDIA_SOURCE_VERSION_EVIDENCE_MONGO_NEXT_SCOPE_MISMATCH');

    await ports.compareAndSet({ scope, expectedEvidenceSha256: null, next: record });
    fixture.records[0]!.record = { forged: true };
    await expect(ports.load(scope)).rejects.toThrow(
      'MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_FIELDS_INVALID',
    );
  });

  it('fails loudly for index/write outages and a missing durability reread', async () => {
    const record = evidenceFixture({ kind: 'USER', userId: 'user-evidence' });
    const scope = mediaSourceVersionEvidenceScopeV1(record);
    const indexFailure = memoryCollection({ indexFailure: true });
    const indexPorts = createMediaSourceVersionEvidenceMongoStorePortsV1({
      loadCollection: async () => indexFailure.collection,
    });
    await expect(indexPorts.load(scope)).rejects.toThrow('index offline');

    const writeFailure = memoryCollection({ writeFailure: true });
    const writePorts = createMediaSourceVersionEvidenceMongoStorePortsV1({
      loadCollection: async () => writeFailure.collection,
    });
    await expect(writePorts.compareAndSet({
      scope, expectedEvidenceSha256: null, next: record,
    })).rejects.toThrow('write offline');

    const missing = memoryCollection({ pretendWriteSuccess: true });
    const missingPorts = createMediaSourceVersionEvidenceMongoStorePortsV1({
      loadCollection: async () => missing.collection,
    });
    await expect(missingPorts.compareAndSet({
      scope, expectedEvidenceSha256: null, next: record,
    })).rejects.toThrow(
      'MEDIA_SOURCE_VERSION_EVIDENCE_MONGO_WRITE_NOT_DURABLE',
    );
  });
});

function memoryCollection(options: Readonly<{
  indexFailure?: boolean;
  writeFailure?: boolean;
  pretendWriteSuccess?: boolean;
}> = {}) {
  const records: Record<string, unknown>[] = [];
  const createIndex = vi.fn(async () => {
    if (options.indexFailure) throw new Error('index offline');
    return 'created';
  });
  const findOne = vi.fn(async (
    filter: Readonly<Record<string, unknown>>,
    _options: Readonly<{ readPreference: 'primary' }>,
  ) => records.find((record) => matches(record, filter)) ?? null);
  const updateOne = vi.fn(async (
    filter: Readonly<Record<string, unknown>>,
    update: Readonly<{
      $set?: Readonly<Record<string, unknown>>;
      $setOnInsert?: Readonly<Record<string, unknown>>;
    }>,
    writeOptions: Readonly<{
      upsert: boolean;
      writeConcern: Readonly<{ w: 'majority' }>;
    }>,
  ) => {
    if (options.writeFailure) throw new Error('write offline');
    const index = records.findIndex((record) => matches(record, filter));
    if (index >= 0) {
      Object.assign(records[index]!, update.$set ?? {});
      return { matchedCount: 1, upsertedCount: 0 };
    }
    if (!writeOptions.upsert) return { matchedCount: 0, upsertedCount: 0 };
    const id = filter._id;
    if (records.some((record) => record._id === id)) {
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    }
    if (!options.pretendWriteSuccess) {
      records.push({ _id: id, ...(update.$setOnInsert ?? {}) });
    }
    return { matchedCount: 0, upsertedCount: 1 };
  });
  const collection: MediaSourceVersionEvidenceMongoCollectionV1 = {
    createIndex,
    findOne,
    updateOne,
  };
  return { collection, createIndex, findOne, updateOne, records };
}

function matches(
  record: Readonly<Record<string, unknown>>,
  filter: Readonly<Record<string, unknown>>,
): boolean {
  return Object.entries(filter).every(([path, expected]) => {
    const actual = nested(record, path);
    if (expected && typeof expected === 'object' && '$exists' in expected) {
      return (actual !== undefined)
        === (expected as Readonly<{ $exists: boolean }>).$exists;
    }
    return actual === expected;
  });
}

function nested(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (
    current && typeof current === 'object'
      ? (current as Record<string, unknown>)[key]
      : undefined
  ), value);
}

function evidenceFixture(owner: MediaSourceOwnerV1) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/version-evidence-audio.wav' },
    byteLength: 96_000,
    providerVersion: { kind: 'R2_ETAG', value: 'audio-evidence-etag' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner,
    assetId: 'asset-version-evidence-audio',
    mediaKind: 'audio',
    byteLength: storageVersion.byteLength,
    contentSha256: hash('audio-source-content'),
    storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'wav',
    durationMilliseconds: 1_000,
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
      sourceDurationTicks: '48000',
    }],
  };
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: sourceVersion.assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: hash('audio-source-binding'),
    requestId: 'audio-evidence-request',
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
  const source = {
    assetId: sourceVersion.assetId,
    mediaKind: 'audio' as const,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation.observationSha256,
  };
  const audioSampleEpochMapSha256 = hash('audio-map');
  const manifestSha256 = hash('audio-manifest');
  const recordMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1,
    source,
    audioStreamIndex: 0,
    streamId: 'audio-0',
    sampleRate: '48000',
    channelCount: 2,
    audioSampleEpochMapSha256,
    decodedPcmSha256: hash('decoded-pcm'),
    decodedSampleFrameCount: '48000',
    manifestSha256,
    manifestReference: {
      schemaVersion: 1 as const,
      storage: 'R2_PRIVATE' as const,
      artifactKind: 'MANIFEST' as const,
      objectKey: `private/editron/media-source-audio/v1/${source.sourceVersionSha256}/${audioSampleEpochMapSha256}/manifests/${manifestSha256}.json`,
      byteLength: 256,
      contentSha256: manifestSha256,
    },
    publishedAt: '2026-08-30T00:03:00.000Z',
  };
  const set = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1,
    source,
    records: [{
      ...recordMaterial,
      recordSha256: hashEditronCanonicalJsonV1(recordMaterial),
    }],
  };
  return captureMediaSourceVersionEvidenceV1({
    assetId: sourceVersion.assetId,
    type: 'audio',
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
    sourceAudioArtifactsV1: set,
    sourceAudioArtifactsStateSha256V1: hashEditronCanonicalJsonV1(set),
  });
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
