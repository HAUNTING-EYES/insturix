import { describe, expect, it } from 'vitest';

import {
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-batch-v1';
import {
  assertMediaProxyMasterCorrespondenceIndexReferenceV1,
  assertMediaProxyMasterCorrespondenceIndexV1,
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexV1,
  parseMediaProxyMasterCorrespondenceIndexV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-index-v1';

describe('MediaProxyMasterCorrespondenceIndexV1', () => {
  it('binds exact cross-batch continuity and complete differing frame counts', () => {
    const input = fixture();
    const serialization = createMediaProxyMasterCorrespondenceIndexV1(input);
    const reference = createMediaProxyMasterCorrespondenceIndexReferenceV1({
      serialization,
    });

    expect(parseMediaProxyMasterCorrespondenceIndexV1(serialization.canonicalJson))
      .toEqual(serialization.index);
    expect(serialization.index).toMatchObject({
      totalSpanCount: '4',
      mappedProxyFrameCount: '3',
      mappedMasterFrameCount: '2',
      canonicalEndExclusiveTime: time('1/10'),
    });
    expect(reference).toMatchObject({
      storage: 'R2_PRIVATE',
      batchCount: 2,
      mappedProxyFrameCount: '3',
      mappedMasterFrameCount: '2',
    });
    expect(reference.objectKey).toMatch(
      /^private\/editron\/media-proxy-master-correspondence\/[a-f0-9]{64}\/indexes\/[a-f0-9]{64}\.json$/,
    );
    expect(Object.isFrozen(serialization.index.batches[0])).toBe(true);
  });

  it('rejects a cross-batch canonical gap and a no-op transition', () => {
    const gap = fixture({ secondStart: '1/19' });
    expect(() => createMediaProxyMasterCorrespondenceIndexV1(gap))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_CANONICAL_OR_SPAN_GAP');

    const redundant = fixture({ secondFirstMasterOrdinal: '0' });
    expect(() => createMediaProxyMasterCorrespondenceIndexV1(redundant))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REDUNDANT_SPAN');
  });

  it('rejects incomplete coverage, another basis, and a policy mismatch', () => {
    const partial = fixture({ omitFinalSpan: true });
    expect(() => createMediaProxyMasterCorrespondenceIndexV1(partial))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_FULL_FRAME_COVERAGE_MISMATCH');

    const anotherBasis = fixture();
    anotherBasis.basis = {
      ...anotherBasis.basis,
      relationSha256: hash('another-relation'),
    };
    expect(() => createMediaProxyMasterCorrespondenceIndexV1(anotherBasis))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_SCOPE_MISMATCH');

    const wrongPolicy = fixture();
    wrongPolicy.resourcePolicy.requiredBatchPolicyVersion = 'other-batch-policy';
    expect(() => createMediaProxyMasterCorrespondenceIndexV1(wrongPolicy))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_BATCH_POLICY_MISMATCH');
  });

  it('rejects noncanonical bytes, public references, and a forged nonzero start', () => {
    const serialization = createMediaProxyMasterCorrespondenceIndexV1(fixture());
    expect(() => parseMediaProxyMasterCorrespondenceIndexV1(
      JSON.stringify(JSON.parse(serialization.canonicalJson), null, 2),
    )).toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_JSON_NON_CANONICAL');

    const reference = createMediaProxyMasterCorrespondenceIndexReferenceV1({ serialization });
    const publicReference = structuredClone(reference) as unknown as { objectKey: string };
    publicReference.objectKey = publicReference.objectKey.replace('private/', 'public/');
    expect(() => assertMediaProxyMasterCorrespondenceIndexReferenceV1(publicReference))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_REFERENCE_SCOPE_INVALID');

    const forged = structuredClone(serialization.index) as unknown as {
      batches: Array<{ firstProxyFrameOrdinal: string }>;
    };
    forged.batches[0]!.firstProxyFrameOrdinal = '1';
    expect(() => assertMediaProxyMasterCorrespondenceIndexV1(forged))
      .toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_CANONICAL_OR_SPAN_GAP');
  });
});

type IndexInput = Parameters<typeof createMediaProxyMasterCorrespondenceIndexV1>[0];
type MutableIndexInput = {
  basis: IndexInput['basis'];
  resourcePolicy: {
    policyVersion: string;
    requiredBatchPolicyVersion: string;
    maxCanonicalJsonBytes: number;
    maxBatchEntries: number;
  };
  batches: Array<IndexInput['batches'][number]>;
};

function fixture(options: Readonly<{
  secondStart?: string;
  secondFirstMasterOrdinal?: string;
  omitFinalSpan?: boolean;
}> = {}): MutableIndexInput {
  const fixtureBasis = basis();
  const first = batch({
    basis: fixtureBasis,
    batchSequence: 0,
    firstSpanOrdinal: '0',
    spans: [
      span('0', '0', '1/30', '0', '0'),
      span('1', '1/30', '1/20', '1', '0'),
    ],
  });
  const secondSpans = [
    span(
      '2',
      options.secondStart ?? '1/20',
      '1/15',
      '1',
      options.secondFirstMasterOrdinal ?? '1',
    ),
    span('3', '1/15', '1/10', '2', '1'),
  ];
  if (options.omitFinalSpan) secondSpans.pop();
  const second = batch({
    basis: fixtureBasis,
    batchSequence: 1,
    firstSpanOrdinal: '2',
    spans: secondSpans,
  });
  return {
    basis: fixtureBasis,
    resourcePolicy: {
      policyVersion: 'proxy-master-correspondence-index-policy-v1',
      requiredBatchPolicyVersion: BATCH_POLICY,
      maxCanonicalJsonBytes: 64 * 1024,
      maxBatchEntries: 10,
    },
    batches: [first, second],
  };
}

const BATCH_POLICY = 'proxy-master-correspondence-batch-policy-v1';

function batch(input: Readonly<{
  basis: ReturnType<typeof basis>;
  batchSequence: number;
  firstSpanOrdinal: string;
  spans: readonly ReturnType<typeof span>[];
}>) {
  const serialization = serializeMediaProxyMasterCorrespondenceBatchV1({
    basis: input.basis,
    resourcePolicy: {
      policyVersion: BATCH_POLICY,
      maxCanonicalJsonBytes: 64 * 1024,
      maxSpanRecords: 100,
    },
    batchSequence: input.batchSequence,
    firstSpanOrdinal: input.firstSpanOrdinal,
    spans: input.spans,
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

function time(value: string) {
  const [ticks, timescale = '1'] = value.split('/');
  return { ticks: ticks!, timescale };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
