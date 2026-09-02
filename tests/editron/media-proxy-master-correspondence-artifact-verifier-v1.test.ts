import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1,
  verifyMediaProxyMasterCorrespondenceArtifactsV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-artifact-verifier-v1';
import {
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-batch-v1';
import {
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-index-v1';

describe('MediaProxyMasterCorrespondenceArtifactVerifierV1', () => {
  it('rereads every private object, reconstructs the index, and issues a bound receipt', async () => {
    const fixture = artifacts();
    const reads: string[] = [];
    const result = await verifyMediaProxyMasterCorrespondenceArtifactsV1({
      basis: fixture.basis,
      indexReference: fixture.indexReference,
      verificationPolicy: policy(),
      reader: reader(fixture.store, reads),
    });

    expect(result).toMatchObject({
      disposition: 'CORRESPONDENCE_ARTIFACT_SET_VERIFIED',
      verifiedBatchCount: 2,
      totalSpanCount: '4',
      mappedProxyFrameCount: '3',
      mappedMasterFrameCount: '2',
      canonicalEndExclusiveTime: time('1/10'),
    });
    if (result.disposition !== 'CORRESPONDENCE_ARTIFACT_SET_VERIFIED') {
      throw new Error('TEST_EXPECTED_VERIFIED_RECEIPT');
    }
    expect(result.totalArtifactBytes).toBe(
      fixture.indexReference.byteLength
        + fixture.batches.reduce((total, batch) => total + batch.sidecar.byteLength, 0),
    );
    expect(result.verificationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1(result))
      .toEqual(result);
    expect(reads).toEqual([
      fixture.indexReference.objectKey,
      ...fixture.batches.map(({ sidecar }) => sidecar.objectKey),
    ]);
  });

  it('classifies a missing batch and corrupted batch hash without false success', async () => {
    const missing = artifacts();
    missing.store.delete(missing.batches[1]!.sidecar.objectKey);
    await expect(verifyMediaProxyMasterCorrespondenceArtifactsV1({
      basis: missing.basis,
      indexReference: missing.indexReference,
      verificationPolicy: policy(),
      reader: reader(missing.store),
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BATCH_READ_FAILED',
      failedBatchSequence: 1,
    });

    const corrupt = artifacts();
    const firstKey = corrupt.batches[0]!.sidecar.objectKey;
    const stored = corrupt.store.get(firstKey)!;
    corrupt.store.set(firstKey, { ...stored, contentSha256: hash('corrupt') });
    await expect(verifyMediaProxyMasterCorrespondenceArtifactsV1({
      basis: corrupt.basis,
      indexReference: corrupt.indexReference,
      verificationPolicy: policy(),
      reader: reader(corrupt.store),
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BATCH_CONTENT_HASH_MISMATCH',
      failedBatchSequence: 0,
    });
  });

  it('rejects another basis and a byte budget too small for the first batch', async () => {
    const wrongBasis = artifacts();
    await expect(verifyMediaProxyMasterCorrespondenceArtifactsV1({
      basis: basis('other'),
      indexReference: wrongBasis.indexReference,
      verificationPolicy: policy(),
      reader: reader(wrongBasis.store),
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BASIS_MISMATCH',
    });

    const bounded = artifacts();
    await expect(verifyMediaProxyMasterCorrespondenceArtifactsV1({
      basis: bounded.basis,
      indexReference: bounded.indexReference,
      verificationPolicy: {
        ...policy(),
        maxTotalArtifactBytes: bounded.indexReference.byteLength,
      },
      reader: reader(bounded.store),
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'RESOURCE_LIMIT_EXCEEDED',
      failedBatchSequence: 0,
    });
  });

  it('rejects a tampered persisted receipt total before accepting its hash', async () => {
    const fixture = artifacts();
    const result = await verifyMediaProxyMasterCorrespondenceArtifactsV1({
      basis: fixture.basis,
      indexReference: fixture.indexReference,
      verificationPolicy: policy(),
      reader: reader(fixture.store),
    });
    if (result.disposition !== 'CORRESPONDENCE_ARTIFACT_SET_VERIFIED') {
      throw new Error('TEST_EXPECTED_VERIFIED_RECEIPT');
    }
    const tampered = structuredClone(result) as unknown as { totalArtifactBytes: number };
    tampered.totalArtifactBytes += 1;
    expect(() => assertMediaProxyMasterCorrespondenceArtifactVerificationReceiptV1(tampered))
      .toThrow('CORRESPONDENCE_ARTIFACT_RECEIPT_SCOPE_MISMATCH');
  });
});

type StoredObject = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

function artifacts() {
  const fixtureBasis = basis();
  const batches = [
    batch(fixtureBasis, 0, '0', [
      span('0', '0', '1/30', '0', '0'),
      span('1', '1/30', '1/20', '1', '0'),
    ]),
    batch(fixtureBasis, 1, '2', [
      span('2', '1/20', '1/15', '1', '1'),
      span('3', '1/15', '1/10', '2', '1'),
    ]),
  ];
  const indexSerialization = createMediaProxyMasterCorrespondenceIndexV1({
    basis: fixtureBasis,
    resourcePolicy: {
      policyVersion: 'proxy-master-correspondence-index-policy-v1',
      requiredBatchPolicyVersion: BATCH_POLICY,
      maxCanonicalJsonBytes: 64 * 1024,
      maxBatchEntries: 10,
    },
    batches,
  });
  const indexReference = createMediaProxyMasterCorrespondenceIndexReferenceV1({
    serialization: indexSerialization,
  });
  const store = new Map<string, StoredObject>([[
    indexReference.objectKey,
    stored(indexSerialization),
  ]]);
  for (const entry of batches) {
    store.set(entry.sidecar.objectKey, stored(entry.serialization));
  }
  return { basis: fixtureBasis, batches, indexReference, store };
}

const BATCH_POLICY = 'proxy-master-correspondence-batch-policy-v1';

function batch(
  fixtureBasis: ReturnType<typeof basis>,
  batchSequence: number,
  firstSpanOrdinal: string,
  spans: readonly ReturnType<typeof span>[],
) {
  const serialization = serializeMediaProxyMasterCorrespondenceBatchV1({
    basis: fixtureBasis,
    resourcePolicy: {
      policyVersion: BATCH_POLICY,
      maxCanonicalJsonBytes: 64 * 1024,
      maxSpanRecords: 100,
    },
    batchSequence,
    firstSpanOrdinal,
    spans,
  });
  return {
    serialization,
    sidecar: createMediaProxyMasterCorrespondenceBatchSidecarV1({ serialization }),
  };
}

function reader(store: Map<string, StoredObject>, reads: string[] = []) {
  return {
    async read(reference: Readonly<{ objectKey: string }>) {
      reads.push(reference.objectKey);
      const value = store.get(reference.objectKey);
      if (!value) throw new Error('TEST_OBJECT_MISSING');
      return value;
    },
  };
}

function stored(value: Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>): StoredObject {
  return {
    canonicalJson: value.canonicalJson,
    byteLength: value.byteLength,
    contentSha256: value.contentSha256,
  };
}

function policy() {
  return {
    policyVersion: 'proxy-master-correspondence-artifact-verification-policy-v1',
    maxBatchReads: 10,
    maxTotalArtifactBytes: 1024 * 1024,
  };
}

function basis(tag = 'primary') {
  return {
    relationSha256: hash(`${tag}-relation`),
    proxyTimeMap: timeMap(tag, 'proxy', 3),
    masterTimeMap: timeMap(tag, 'master', 2),
  };
}

function timeMap(tag: string, role: string, totalFrameCount: number) {
  return {
    sourceVersionSha256: hash(`${tag}-${role}-source`),
    storageVersionSha256: hash(`${tag}-${role}-storage`),
    sourceBindingSha256: hash(`${tag}-${role}-source-binding`),
    technicalObservationSha256: hash(`${tag}-${role}-observation`),
    sourcePtsCadenceMapStateSha256V3: hash(`${tag}-${role}-state`),
    mapBindingSha256: hash(`${tag}-${role}-map-binding`),
    terminalReceiptSha256: hash(`${tag}-${role}-terminal`),
    verificationSha256: hash(`${tag}-${role}-verification`),
    epochIndexContentSha256: hash(`${tag}-${role}-epoch-index`),
    streamId: 'video-0',
    videoStreamIndex: 0,
    totalFrameCount: String(totalFrameCount),
  };
}

function span(
  spanOrdinal: string,
  start: string,
  end: string,
  proxyFrameOrdinal: string,
  masterFrameOrdinal: string,
) {
  return {
    spanOrdinal,
    canonicalStartTime: time(start),
    canonicalEndExclusiveTime: time(end),
    proxyFrameOrdinal,
    masterFrameOrdinal,
  };
}

function time(value: string) {
  const [ticks, timescale = '1'] = value.split('/');
  return { ticks: ticks!, timescale };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
