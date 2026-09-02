import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readWindow: vi.fn(),
}));

vi.mock(
  '@/lib/editron/services/media-source-pts-cadence-epoch-window-reader-v3',
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import('@/lib/editron/services/media-source-pts-cadence-epoch-window-reader-v3')
    >();
    return {
      ...actual,
      readMediaSourcePtsCadenceEpochPresentationWindowV3: mocks.readWindow,
    };
  },
);

import { CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1 } from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-batch-v1';
import {
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-index-v1';
import {
  assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1,
  verifyMediaProxyMasterCorrespondenceV3DerivationV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-v3-derivation-verifier-v1';

describe('MediaProxyMasterCorrespondenceV3DerivationVerifierV1', () => {
  it('rereads correspondence and proves every span from current V3 frame intervals', async () => {
    const fixture = artifacts();
    installWindowReader(fixture.basis);

    const result = await verifyMediaProxyMasterCorrespondenceV3DerivationV1(
      request(fixture),
    );

    expect(result).toMatchObject({
      disposition: 'CORRESPONDENCE_V3_DERIVATION_VERIFIED',
      verifiedBatchCount: 2,
      verifiedSpanCount: '4',
      totalWindowFrameRecords: 6,
      canonicalEndExclusiveTime: time('1/10'),
    });
    if (result.disposition !== 'CORRESPONDENCE_V3_DERIVATION_VERIFIED') {
      throw new Error('TEST_EXPECTED_DERIVATION_RECEIPT');
    }
    expect(assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1(result))
      .toEqual(result);
    expect(mocks.readWindow.mock.calls.map(([call]) => ({
      role: (call.asset as { role: string }).role,
      first: call.firstFrameOrdinal,
      end: call.endExclusiveFrameOrdinal,
    }))).toEqual([
      { role: 'proxy', first: '0', end: '2' },
      { role: 'master', first: '0', end: '1' },
      { role: 'proxy', first: '1', end: '3' },
      { role: 'master', first: '1', end: '2' },
    ]);
  });

  it('rejects an internally valid correspondence set with a false frame boundary', async () => {
    const fixture = artifacts('1/40');
    installWindowReader(fixture.basis);

    await expect(verifyMediaProxyMasterCorrespondenceV3DerivationV1(
      request(fixture),
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SPAN_DERIVATION_MISMATCH',
      failedBatchSequence: 0,
      failedSpanOrdinal: '0',
    });
  });

  it('rejects a self-consistent V3 window from another source identity', async () => {
    const fixture = artifacts();
    installWindowReader(fixture.basis, { wrongProxySource: true });

    await expect(verifyMediaProxyMasterCorrespondenceV3DerivationV1(
      request(fixture),
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'V3_WINDOW_SCOPE_MISMATCH',
      failedBatchSequence: 0,
      sourceRole: 'PROXY',
    });
  });

  it('separates V3 read failure and aggregate resource exhaustion', async () => {
    const failed = artifacts();
    installWindowReader(failed.basis, { failMaster: true });
    await expect(verifyMediaProxyMasterCorrespondenceV3DerivationV1(
      request(failed),
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'MASTER_V3_WINDOW_UNVERIFIABLE',
      sourceRole: 'MASTER',
    });

    const bounded = artifacts();
    installWindowReader(bounded.basis);
    await expect(verifyMediaProxyMasterCorrespondenceV3DerivationV1({
      ...request(bounded),
      derivationPolicy: { ...derivationPolicy(), maxTotalWindowFrameRecords: 1 },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'RESOURCE_LIMIT_EXCEEDED',
      failedBatchSequence: 0,
    });
  });

  it('does not reinterpret artifact corruption and rejects a tampered receipt', async () => {
    const corrupt = artifacts();
    const firstKey = corrupt.batches[0]!.sidecar.objectKey;
    const storedBatch = corrupt.store.get(firstKey)!;
    corrupt.store.set(firstKey, { ...storedBatch, contentSha256: hash('corrupt') });
    installWindowReader(corrupt.basis);
    await expect(verifyMediaProxyMasterCorrespondenceV3DerivationV1(
      request(corrupt),
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'CORRESPONDENCE_ARTIFACT_UNVERIFIABLE',
      failedBatchSequence: 0,
    });

    const fixture = artifacts();
    installWindowReader(fixture.basis);
    const result = await verifyMediaProxyMasterCorrespondenceV3DerivationV1(
      request(fixture),
    );
    if (result.disposition !== 'CORRESPONDENCE_V3_DERIVATION_VERIFIED') {
      throw new Error('TEST_EXPECTED_DERIVATION_RECEIPT');
    }
    const tampered = structuredClone(result) as unknown as { verifiedSpanCount: string };
    tampered.verifiedSpanCount = '5';
    expect(() => assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1(tampered))
      .toThrow('CORRESPONDENCE_V3_DERIVATION_RECEIPT_SCOPE_MISMATCH');

    const wrongBasis = structuredClone(result) as unknown as {
      basis: { relationSha256: string };
    };
    wrongBasis.basis.relationSha256 = hash('another-relation');
    expect(() => assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1(wrongBasis))
      .toThrow('CORRESPONDENCE_V3_DERIVATION_RECEIPT_SCOPE_MISMATCH');
  });
});

type StoredObject = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

function artifacts(firstBoundary = '1/30') {
  const fixtureBasis = basis();
  const batches = [
    batch(fixtureBasis, 0, '0', [
      span('0', '0', firstBoundary, '0', '0'),
      span('1', firstBoundary, '1/20', '1', '0'),
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
  for (const entry of batches) store.set(entry.sidecar.objectKey, stored(entry.serialization));
  return { basis: fixtureBasis, batches, indexReference, store };
}

function request(fixture: ReturnType<typeof artifacts>) {
  return {
    basis: fixture.basis,
    indexReference: fixture.indexReference,
    artifactVerificationPolicy: {
      policyVersion: 'proxy-master-correspondence-artifact-verification-policy-v1',
      maxBatchReads: 10,
      maxTotalArtifactBytes: 1024 * 1024,
    },
    derivationPolicy: derivationPolicy(),
    correspondenceReader: reader(fixture.store),
    proxy: source('proxy'),
    master: source('master'),
  };
}

function derivationPolicy() {
  return {
    policyVersion: 'proxy-master-correspondence-v3-derivation-policy-v1',
    maxSpanChecks: 100,
    maxTotalWindowFrameRecords: 100,
    maxTotalSelectedBatchBytes: 1024 * 1024,
  };
}

function source(role: 'proxy' | 'master') {
  return {
    asset: { role } as never,
    storedObjectReader: { read: vi.fn() } as never,
    windowResourcePolicy: {
      policyVersion: 'proxy-master-v3-window-policy-v1',
      maxFrameRecords: 100,
      maxBatchReads: 10,
      maxTotalReadBytes: 1024 * 1024,
    },
  };
}

function installWindowReader(
  fixtureBasis: ReturnType<typeof basis>,
  options: Readonly<{ wrongProxySource?: boolean; failMaster?: boolean }> = {},
) {
  mocks.readWindow.mockReset();
  mocks.readWindow.mockImplementation(async (input: Readonly<{
    asset: { role: 'proxy' | 'master' };
    firstFrameOrdinal: string;
    endExclusiveFrameOrdinal: string;
    resourcePolicy: ReturnType<typeof source>['windowResourcePolicy'];
  }>) => {
    const role = input.asset.role;
    if (role === 'master' && options.failMaster) {
      return {
        disposition: 'UNVERIFIABLE',
        reason: 'WINDOW_BATCH_READ_FAILED',
        failedObjectKey: 'private/test/master-batch.json',
        failedBatchSequence: 0,
        diagnostic: null,
      };
    }
    const map = role === 'proxy' ? fixtureBasis.proxyTimeMap : fixtureBasis.masterTimeMap;
    return presentationWindow(
      role,
      options.wrongProxySource && role === 'proxy'
        ? { ...map, sourceVersionSha256: hash('wrong-proxy-source') }
        : map,
      input.firstFrameOrdinal,
      input.endExclusiveFrameOrdinal,
      input.resourcePolicy,
    );
  });
}

function presentationWindow(
  role: 'proxy' | 'master',
  map: ReturnType<typeof timeMap>,
  firstFrameOrdinal: string,
  endExclusiveFrameOrdinal: string,
  resourcePolicy: ReturnType<typeof source>['windowResourcePolicy'],
) {
  const durationTicks = role === 'proxy' ? BigInt(1000) : BigInt(1500);
  const frames = [];
  for (let ordinal = BigInt(firstFrameOrdinal);
    ordinal < BigInt(endExclusiveFrameOrdinal);
    ordinal += BigInt(1)) {
    frames.push({
      sourceFrameOrdinal: ordinal.toString(),
      epochId: `${role}-epoch-0`,
      presentationTimestampTicks: (ordinal * durationTicks).toString(),
      durationTicks: durationTicks.toString(),
    });
  }
  const material = {
    schemaVersion: 3 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_PRESENTATION_WINDOW_V3' as const,
    disposition: 'EPOCH_PRESENTATION_WINDOW_VERIFIED' as const,
    evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW' as const,
    assetId: `${role}-asset`,
    sourceVersionSha256: map.sourceVersionSha256,
    storageVersionSha256: map.storageVersionSha256,
    sourceBindingSha256: map.sourceBindingSha256,
    technicalObservationSha256: map.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3: map.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: map.mapBindingSha256,
    terminalReceiptSha256: map.terminalReceiptSha256,
    verificationSha256: map.verificationSha256,
    epochIndexContentSha256: map.epochIndexContentSha256,
    streamId: map.streamId,
    videoStreamIndex: map.videoStreamIndex,
    sourceTimebase: { numerator: '1', denominator: '30000' },
    firstFrameOrdinal,
    endExclusiveFrameOrdinal,
    selectedBatchCount: 1,
    selectedBatchBytes: frames.length * 64,
    epochs: [{
      schemaVersion: 1 as const,
      contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
      kind: 'presentation-epoch' as const,
      epochId: `${role}-epoch-0`,
      streamId: map.streamId,
      secondsPerSourceTick: { numerator: '1', denominator: '30000' },
      sourceStartPresentationTimestampTicks: '0',
      sourceEndExclusivePresentationTimestampTicks: '3000',
      canonicalStartTime: time('0'),
      boundaryKind: 'INITIAL' as const,
    }],
    frames,
    selectedBatches: [{
      batchSequence: 0,
      epochId: `${role}-epoch-0`,
      contentSha256: hash(`${role}-v3-batch`),
      shardDescriptorSha256: hash(`${role}-v3-shard`),
      firstFrameOrdinal,
      frameCount: String(frames.length),
    }],
    resourcePolicy,
  };
  return {
    ...material,
    presentationWindowEvidenceSha256: hashEditronCanonicalJsonV1(material),
  };
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

function basis() {
  return {
    relationSha256: hash('relation'),
    proxyTimeMap: timeMap('proxy', 3),
    masterTimeMap: timeMap('master', 2),
  };
}

function timeMap(role: string, totalFrameCount: number) {
  return {
    sourceVersionSha256: hash(`${role}-source`),
    storageVersionSha256: hash(`${role}-storage`),
    sourceBindingSha256: hash(`${role}-source-binding`),
    technicalObservationSha256: hash(`${role}-observation`),
    sourcePtsCadenceMapStateSha256V3: hash(`${role}-state`),
    mapBindingSha256: hash(`${role}-map-binding`),
    terminalReceiptSha256: hash(`${role}-terminal`),
    verificationSha256: hash(`${role}-verification`),
    epochIndexContentSha256: hash(`${role}-epoch-index`),
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

function reader(store: Map<string, StoredObject>) {
  return {
    async read(reference: Readonly<{ objectKey: string }>) {
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

function time(value: string) {
  const [ticks, timescale = '1'] = value.split('/');
  return { ticks: ticks!, timescale };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
