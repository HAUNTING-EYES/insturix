import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterCorrespondenceBatchSidecarV1,
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  parseMediaProxyMasterCorrespondenceBatchV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-batch-v1';

describe('MediaProxyMasterCorrespondenceBatchV1', () => {
  it('preserves an exact rational union of non-coincident proxy and master boundaries', () => {
    const serialization = serializeMediaProxyMasterCorrespondenceBatchV1(fixture());
    const sidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({ serialization });

    expect(parseMediaProxyMasterCorrespondenceBatchV1(serialization.canonicalJson))
      .toEqual(serialization.batch);
    expect(serialization.batch.spans).toEqual([
      span('0', '0', '1/30', '0', '0'),
      span('1', '1/30', '1/20', '1', '0'),
      span('2', '1/20', '1/15', '1', '1'),
      span('3', '1/15', '1/10', '2', '1'),
    ]);
    expect(sidecar).toMatchObject({
      storage: 'R2_PRIVATE',
      batchSequence: 0,
      firstSpanOrdinal: '0',
      spanCount: '4',
      firstProxyFrameOrdinal: '0',
      lastProxyFrameOrdinal: '2',
      firstMasterFrameOrdinal: '0',
      lastMasterFrameOrdinal: '1',
    });
    expect(sidecar.objectKey).toMatch(
      /^private\/editron\/media-proxy-master-correspondence\/[a-f0-9]{64}\/batches\/00000000-[a-f0-9]{64}\.json$/,
    );
    expect(Object.isFrozen(serialization.batch.spans[0])).toBe(true);
  });

  it('rejects a canonical gap, a skipped frame, and a redundant boundary', () => {
    const gap = fixture();
    gap.spans[1] = {
      ...gap.spans[1]!,
      canonicalStartTime: time('1/29'),
    };
    expect(() => serializeMediaProxyMasterCorrespondenceBatchV1(gap))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_CANONICAL_GAP');

    const skipped = fixture();
    skipped.spans[1] = { ...skipped.spans[1]!, proxyFrameOrdinal: '2' };
    expect(() => serializeMediaProxyMasterCorrespondenceBatchV1(skipped))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_FRAME_STEP_INVALID');

    const redundant = fixture();
    redundant.spans[1] = {
      ...redundant.spans[1]!,
      proxyFrameOrdinal: '0',
      masterFrameOrdinal: '0',
    };
    expect(() => serializeMediaProxyMasterCorrespondenceBatchV1(redundant))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_REDUNDANT_SPAN');

    const outOfRange = fixture();
    outOfRange.spans[3] = { ...outOfRange.spans[3]!, proxyFrameOrdinal: '3' };
    expect(() => serializeMediaProxyMasterCorrespondenceBatchV1(outOfRange))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_FRAME_OUT_OF_RANGE');
  });

  it('rejects noncanonical JSON and an altered serialization receipt', () => {
    const serialization = serializeMediaProxyMasterCorrespondenceBatchV1(fixture());
    expect(() => parseMediaProxyMasterCorrespondenceBatchV1(
      JSON.stringify(JSON.parse(serialization.canonicalJson), null, 2),
    )).toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_JSON_NON_CANONICAL');

    expect(() => createMediaProxyMasterCorrespondenceBatchSidecarV1({
      serialization: { ...serialization, contentSha256: hash('altered') },
    })).toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SERIALIZATION_MISMATCH');
  });

  it('rejects cross-map basis tampering and non-private sidecar identity', () => {
    const serialization = serializeMediaProxyMasterCorrespondenceBatchV1(fixture());
    const crossMap = structuredClone(serialization.batch) as unknown as {
      basis: { proxyTimeMap: { mapBindingSha256: string } };
    };
    crossMap.basis.proxyTimeMap.mapBindingSha256 = hash('different-map');
    expect(() => parseMediaProxyMasterCorrespondenceBatchV1(
      JSON.stringify(crossMap),
    )).toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_BASIS_HASH_MISMATCH');

    const sidecar = createMediaProxyMasterCorrespondenceBatchSidecarV1({ serialization });
    const publicKey = structuredClone(sidecar) as unknown as { objectKey: string };
    publicKey.objectKey = publicKey.objectKey.replace('private/', 'public/');
    expect(() => assertMediaProxyMasterCorrespondenceBatchSidecarV1(publicKey))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_SCOPE_INVALID');

    const descending = structuredClone(sidecar) as unknown as {
      firstProxyFrameOrdinal: string;
    };
    descending.firstProxyFrameOrdinal = '3';
    expect(() => assertMediaProxyMasterCorrespondenceBatchSidecarV1(descending))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_SUMMARY_INVALID');

    const impossibleAdvance = structuredClone(sidecar) as unknown as { spanCount: string };
    impossibleAdvance.spanCount = '1';
    expect(() => assertMediaProxyMasterCorrespondenceBatchSidecarV1(impossibleAdvance))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_SIDECAR_SUMMARY_INVALID');
  });
});

type MutableFixture = {
  basis: ReturnType<typeof basis>;
  resourcePolicy: {
    policyVersion: string;
    maxCanonicalJsonBytes: number;
    maxSpanRecords: number;
  };
  batchSequence: number;
  firstSpanOrdinal: string;
  spans: Array<ReturnType<typeof span>>;
};

function fixture(): MutableFixture {
  return {
    basis: basis(),
    resourcePolicy: {
      policyVersion: 'proxy-master-correspondence-batch-policy-v1',
      maxCanonicalJsonBytes: 64 * 1024,
      maxSpanRecords: 100,
    },
    batchSequence: 0,
    firstSpanOrdinal: '0',
    spans: [
      span('0', '0', '1/30', '0', '0'),
      span('1', '1/30', '1/20', '1', '0'),
      span('2', '1/20', '1/15', '1', '1'),
      span('3', '1/15', '1/10', '2', '1'),
    ],
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

function time(value: string) {
  const [ticks, timescale = '1'] = value.split('/');
  return { ticks: ticks!, timescale };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
