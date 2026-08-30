import { describe, expect, it, vi } from 'vitest';

import {
  createMediaProxyMasterR2MultipartMongoStoreV1,
  type MediaProxyMasterR2MultipartMongoCollectionV1,
} from '@/lib/editron/services/media-proxy-master-r2-multipart-mongo-store-v1';
import { expectedMediaProxyMasterR2MultipartPartRangeV1 }
  from '@/lib/editron/services/media-proxy-master-r2-multipart-record-v1';
import { R2_MIN_PART_BYTES } from '@/lib/editron/services/r2-upload-limits';

type MongoRecord = Record<string, unknown>;

const hash = (label: string) => Buffer.from(label).toString('hex').padEnd(64, '0').slice(0, 64);
const CONTENT = hash('content');
const COMMAND = hash('command');
const LEASE_1 = hash('lease-1');
const LEASE_2 = hash('lease-2');

describe('media proxy/master durable R2 multipart Mongo store v1', () => {
  it('creates once, validates the envelope, and replays admission exactly', async () => {
    const fixture = build();
    const first = await fixture.store.createOrGet(createInput());
    const replay = await fixture.store.createOrGet({
      ...createInput(),
      leaseOwnerId: 'another-worker',
      leaseTokenSha256: LEASE_2,
    });

    expect(replay).toEqual(first);
    expect(fixture.documents).toHaveLength(1);
    expect(fixture.createIndex).toHaveBeenCalledTimes(3);
    expect(fixture.loadCollection).toHaveBeenCalledTimes(1);
    await expect(fixture.store.get(first.recordId)).resolves.toEqual(first);
  });

  it('persists pre-create intent, upload id, and exact part evidence via fenced CAS', async () => {
    const fixture = build();
    let record = await fixture.store.createOrGet(createInput());
    record = await fixture.store.beginSession(record.recordId, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      now: '2026-08-30T00:00:01.000Z',
    });
    expect(record.status).toBe('INITIATING');
    await expect(fixture.store.getBySessionObjectKey(
      record.sessions[0]!.objectKey,
    )).resolves.toEqual(record);

    record = await fixture.store.bindUploadId(record.recordId, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      uploadId: 'r2-upload-1',
      now: '2026-08-30T00:00:01.001Z',
    });
    const range = expectedMediaProxyMasterR2MultipartPartRangeV1(record, 1);
    record = await fixture.store.recordPart(record.recordId, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      ...range,
      contentSha256: hash('part-1'),
      eTag: 'etag-1',
      now: '2026-08-30T00:00:02.000Z',
    });

    expect(record.status).toBe('UPLOADING');
    expect(fixture.documents[0]).toMatchObject({
      status: 'UPLOADING',
      sequence: 3,
      leaseFence: 1,
      currentUploadId: 'r2-upload-1',
      sessionObjectKeys: [record.sessions[0]!.objectKey],
    });
  });

  it('does not write an exact duplicate part callback twice', async () => {
    const fixture = build();
    let record = await started(fixture);
    const range = expectedMediaProxyMasterR2MultipartPartRangeV1(record, 1);
    const part = {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      ...range,
      contentSha256: hash('part-1'),
      eTag: 'etag-1',
      now: '2026-08-30T00:00:02.000Z',
    };
    record = await fixture.store.recordPart(record.recordId, part);
    const replaceCalls = fixture.replaceOne.mock.calls.length;
    const replay = await fixture.store.recordPart(record.recordId, {
      ...part,
      expectedSequence: record.sequence,
      now: '2026-08-30T00:00:03.000Z',
    });

    expect(replay).toEqual(record);
    expect(fixture.replaceOne).toHaveBeenCalledTimes(replaceCalls);
  });

  it('rejects a lost CAS and preserves the concurrent durable record', async () => {
    const fixture = build();
    const record = await fixture.store.createOrGet(createInput());
    fixture.beforeReplace = (current) => ({ ...current, sequence: 99 });

    await expect(fixture.store.beginSession(record.recordId, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      now: '2026-08-30T00:00:01.000Z',
    })).rejects.toThrow('COMPARE_AND_SET_LOST');
    expect(fixture.documents[0]?.sequence).toBe(99);
  });

  it('fences the old token after an expired-lease takeover', async () => {
    const fixture = build();
    let record = await fixture.store.createOrGet(createInput());
    record = await fixture.store.takeOver(record.recordId, {
      expectedSequence: record.sequence,
      leaseOwnerId: 'worker-2',
      leaseTokenSha256: LEASE_2,
      leaseExpiresAt: '2026-08-30T00:20:00.000Z',
      now: '2026-08-30T00:10:00.000Z',
    });

    await expect(fixture.store.beginSession(record.recordId, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_1,
      now: '2026-08-30T00:10:01.000Z',
    })).rejects.toThrow('LEASE_TOKEN_MISMATCH');
    await expect(fixture.store.beginSession(record.recordId, {
      expectedSequence: record.sequence,
      leaseTokenSha256: LEASE_2,
      now: '2026-08-30T00:10:01.000Z',
    })).resolves.toMatchObject({ status: 'INITIATING' });
  });

  it('rejects a corrupt stored envelope before returning inner state', async () => {
    const fixture = build();
    const record = await fixture.store.createOrGet(createInput());
    fixture.documents[0] = { ...fixture.documents[0], status: 'PUBLISHED' };

    await expect(fixture.store.get(record.recordId))
      .rejects.toThrow('STORED_ENVELOPE_INVALID');
  });
});

function createInput() {
  return {
    jobId: 'job-proxy-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    orgId: null,
    owner: { kind: 'USER' as const, userId: 'user-1' },
    assetId: 'asset-1',
    bucketName: 'editron-private-media',
    storagePolicyVersion: 'private-r2-v1',
    publicationPolicySha256: hash('policy'),
    objectKey: `editron_proxy_v1_${COMMAND}_${CONTENT}.mp4`,
    contentSha256: CONTENT,
    byteLength: R2_MIN_PART_BYTES + 7,
    commandSha256: COMMAND,
    outputProbeSha256: hash('probe'),
    leaseOwnerId: 'worker-1',
    leaseTokenSha256: LEASE_1,
    leaseExpiresAt: '2026-08-30T00:10:00.000Z',
    now: '2026-08-30T00:00:00.000Z',
  };
}

async function started(fixture: ReturnType<typeof build>) {
  let record = await fixture.store.createOrGet(createInput());
  record = await fixture.store.beginSession(record.recordId, {
    expectedSequence: record.sequence,
    leaseTokenSha256: LEASE_1,
    now: '2026-08-30T00:00:01.000Z',
  });
  return fixture.store.bindUploadId(record.recordId, {
    expectedSequence: record.sequence,
    leaseTokenSha256: LEASE_1,
    uploadId: 'r2-upload-1',
    now: '2026-08-30T00:00:01.001Z',
  });
}

function build() {
  const documents: MongoRecord[] = [];
  const createIndex = vi.fn(async (
    _keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string }>,
  ) => options.name);
  let beforeReplace: ((record: MongoRecord) => MongoRecord) | null = null;
  const matches = (document: MongoRecord, filter: Readonly<MongoRecord>) => (
    Object.entries(filter).every(([key, value]) => {
      if (key === 'sessionObjectKeys') {
        return Array.isArray(document[key]) && document[key].includes(value);
      }
      return document[key] === value;
    })
  );
  const replaceOne = vi.fn(async (
    filter: Readonly<MongoRecord>,
    replacement: Readonly<MongoRecord>,
  ) => {
    const index = documents.findIndex((document) => matches(document, filter));
    if (index < 0) return { matchedCount: 0 };
    if (beforeReplace) {
      documents[index] = beforeReplace(documents[index]!);
      beforeReplace = null;
      if (!matches(documents[index]!, filter)) return { matchedCount: 0 };
    }
    documents[index] = { ...replacement };
    return { matchedCount: 1 };
  });
  const collection: MediaProxyMasterR2MultipartMongoCollectionV1 = {
    createIndex,
    findOne: async (filter) => documents.find(
      (document) => matches(document, filter),
    ) ?? null,
    findOneAndUpdate: async (filter, update) => {
      const existing = documents.find((document) => matches(document, filter));
      if (existing) return existing;
      const inserted = { ...update.$setOnInsert };
      documents.push(inserted);
      return inserted;
    },
    replaceOne,
  };
  const loadCollection = vi.fn(async () => collection);
  const store = createMediaProxyMasterR2MultipartMongoStoreV1({
    loadCollection,
  });
  return {
    documents,
    createIndex,
    replaceOne,
    loadCollection,
    store,
    get beforeReplace() { return beforeReplace; },
    set beforeReplace(value: ((record: MongoRecord) => MongoRecord) | null) {
      beforeReplace = value;
    },
  };
}
