import { describe, expect, it } from 'vitest';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  verifyMediaProxyMasterCorrespondenceArtifactsV1,
  type MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-artifact-verifier-v1';
import type {
  MediaProxyMasterCorrespondenceBatchSerializationV1,
  MediaProxyMasterCorrespondenceBatchSidecarV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-batch-v1';
import {
  produceMediaProxyMasterCorrespondenceV1,
  type MediaProxyMasterCorrespondenceIncrementalPublisherV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-producer-v1';
import type {
  MediaSourcePtsCadenceEpochPresentationWindowResultV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-window-reader-v3';

describe('MediaProxyMasterCorrespondenceProducerV1', () => {
  it('streams unequal frame durations into the exact union of boundaries', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4), frame(4, 4), frame(8, 4)]),
      master: timeline([frame(0, 6), frame(6, 6)]),
      pageFrameRecords: 2,
      maxSpanRecords: 2,
    });

    const result = await produceMediaProxyMasterCorrespondenceV1(fixture.request);

    expect(result).toMatchObject({
      disposition: 'PUBLISHED',
      batchCount: 2,
      totalSpanCount: '4',
      canonicalEndExclusiveTime: mediaTime(12),
    });
    expect(fixture.publisher.batches.flatMap(
      (entry) => entry.serialization.batch.spans.map((span) => ({
        ordinal: span.spanOrdinal,
        start: span.canonicalStartTime,
        end: span.canonicalEndExclusiveTime,
        proxy: span.proxyFrameOrdinal,
        master: span.masterFrameOrdinal,
      })),
    )).toEqual([
      { ordinal: '0', start: mediaTime(0), end: mediaTime(4), proxy: '0', master: '0' },
      { ordinal: '1', start: mediaTime(4), end: mediaTime(6), proxy: '1', master: '0' },
      { ordinal: '2', start: mediaTime(6), end: mediaTime(8), proxy: '1', master: '1' },
      { ordinal: '3', start: mediaTime(8), end: mediaTime(12), proxy: '2', master: '1' },
    ]);
    expect(fixture.windowReads).toEqual([
      { role: 'PROXY', first: '0', end: '2' },
      { role: 'MASTER', first: '0', end: '2' },
      { role: 'PROXY', first: '2', end: '3' },
    ]);
    expect(fixture.publisher.indexPublished).toBe(true);
  });

  it('accepts VFR intervals and an explicit timestamp reset when canonical playback stays continuous', async () => {
    const fixture = createFixture({
      proxy: timeline([
        frame(0, 3, 10),
        frame(3, 5, 13),
        frame(8, 4, -200),
      ]),
      master: timeline([frame(0, 4), frame(4, 4), frame(8, 4)]),
      pageFrameRecords: 1,
      maxSpanRecords: 10,
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'PUBLISHED',
        totalSpanCount: '4',
        canonicalEndExclusiveTime: mediaTime(12),
      });
    expect(fixture.windowReads.filter((read) => read.role === 'PROXY'))
      .toHaveLength(3);
  });

  it('rejects a self-hashed window from the wrong source identity', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4), frame(4, 4)]),
      master: timeline([frame(0, 4), frame(4, 4)]),
      mutateWindow(window, role) {
        return role === 'PROXY'
          ? rehashWindow({ ...window, sourceVersionSha256: hash('wrong-source') })
          : window;
      },
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'WINDOW_EVIDENCE_REJECTED',
        sourceRole: 'PROXY',
        failedFrameOrdinal: '0',
      });
    expect(fixture.publisher.indexPublished).toBe(false);
  });

  it('fails closed on a canonical gap and never publishes an index', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4), frame(4, 4), frame(9, 3)]),
      master: timeline([frame(0, 4), frame(4, 4), frame(8, 4)]),
      pageFrameRecords: 1,
      maxSpanRecords: 2,
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'NON_CONTIGUOUS_PRESENTATION',
        sourceRole: 'PROXY',
        failedFrameOrdinal: '2',
      });
    expect(fixture.publisher.batches).toHaveLength(1);
    expect(fixture.publisher.indexPublished).toBe(false);
  });

  it('rejects unequal terminal duration after any immutable orphan batches', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4), frame(4, 4), frame(8, 4)]),
      master: timeline([frame(0, 5), frame(5, 5)]),
      maxSpanRecords: 2,
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'TERMINAL_DURATION_MISMATCH',
        sourceRole: 'MASTER',
      });
    expect(fixture.publisher.indexPublished).toBe(false);
  });

  it('separates transient V3 read failure from invalid media evidence', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4)]),
      master: timeline([frame(0, 4)]),
      readFailure: { role: 'MASTER', firstFrameOrdinal: '0' },
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'RETRYABLE',
        reason: 'WINDOW_READER_UNAVAILABLE',
        sourceRole: 'MASTER',
        failedFrameOrdinal: '0',
        lastPublishedBatchSequence: null,
      });
    expect(fixture.publisher.indexPublished).toBe(false);
  });

  it('reports the last durable batch when publication is interrupted', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4), frame(4, 4), frame(8, 4)]),
      master: timeline([frame(0, 6), frame(6, 6)]),
      maxSpanRecords: 2,
      failBatchSequence: 1,
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'RETRYABLE',
        reason: 'ARTIFACT_STORE_UNAVAILABLE',
        lastPublishedBatchSequence: 0,
      });
    expect(fixture.publisher.indexPublished).toBe(false);
  });

  it('rejects a forged final verification receipt', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4)]),
      master: timeline([frame(0, 4)]),
      forgeReceipt: true,
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'ARTIFACT_VERIFICATION_REJECTED',
      });
  });

  it('rejects impossible resource admission before reading or writing', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4), frame(4, 4)]),
      master: timeline([frame(0, 4), frame(4, 4)]),
      maxSpanRecords: 1,
      maxBatchEntries: 1,
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'RESOURCE_LIMIT_EXCEEDED',
      });
    expect(fixture.windowReads).toHaveLength(0);
    expect(fixture.publisher.batches).toHaveLength(0);
  });

  it('reports canonical batch byte exhaustion as a resource stop', async () => {
    const fixture = createFixture({
      proxy: timeline([frame(0, 4)]),
      master: timeline([frame(0, 4)]),
      maxBatchBytes: 128,
    });

    await expect(produceMediaProxyMasterCorrespondenceV1(fixture.request))
      .resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'RESOURCE_LIMIT_EXCEEDED',
        failedFrameOrdinal: '0',
        diagnostic: 'MEDIA_PROXY_MASTER_CORRESPONDENCE_BATCH_BYTE_LIMIT_EXCEEDED',
      });
    expect(fixture.publisher.batches).toHaveLength(0);
    expect(fixture.publisher.indexPublished).toBe(false);
  });
});

type FrameFixtureV1 = Readonly<{
  canonicalStartTicks: number;
  durationTicks: number;
  presentationTimestampTicks: number;
}>;

type StoredObjectV1 = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

function frame(
  canonicalStartTicks: number,
  durationTicks: number,
  presentationTimestampTicks = canonicalStartTicks,
): FrameFixtureV1 {
  return { canonicalStartTicks, durationTicks, presentationTimestampTicks };
}

function timeline(frames: readonly FrameFixtureV1[]) {
  return frames;
}

function createFixture(options: Readonly<{
  proxy: readonly FrameFixtureV1[];
  master: readonly FrameFixtureV1[];
  pageFrameRecords?: number;
  maxSpanRecords?: number;
  maxBatchBytes?: number;
  maxBatchEntries?: number;
  failBatchSequence?: number;
  forgeReceipt?: boolean;
  readFailure?: Readonly<{
    role: 'PROXY' | 'MASTER';
    firstFrameOrdinal: string;
  }>;
  mutateWindow?: (
    window: MediaSourcePtsCadenceEpochPresentationWindowResultV3 & {
      disposition: 'EPOCH_PRESENTATION_WINDOW_VERIFIED';
    },
    role: 'PROXY' | 'MASTER',
  ) => MediaSourcePtsCadenceEpochPresentationWindowResultV3;
}>) {
  const fixtureBasis = basis(options.proxy.length, options.master.length);
  const windowReads: Array<{
    role: 'PROXY' | 'MASTER'; first: string; end: string;
  }> = [];
  const publisher = memoryPublisher({
    failBatchSequence: options.failBatchSequence,
    forgeReceipt: options.forgeReceipt,
  });
  const windowResourcePolicy = {
    policyVersion: 'proxy-master-producer-window-policy-v1',
    maxFrameRecords: 100,
    maxBatchReads: 10,
    maxTotalReadBytes: 1024 * 1024,
  };
  const readWindow = async (input: Readonly<{
    asset: unknown;
    firstFrameOrdinal: string;
    endExclusiveFrameOrdinal: string;
    resourcePolicy: typeof windowResourcePolicy;
  }>): Promise<MediaSourcePtsCadenceEpochPresentationWindowResultV3> => {
    const role = (input.asset as { role: 'PROXY' | 'MASTER' }).role;
    windowReads.push({
      role,
      first: input.firstFrameOrdinal,
      end: input.endExclusiveFrameOrdinal,
    });
    if (options.readFailure?.role === role
      && options.readFailure.firstFrameOrdinal === input.firstFrameOrdinal) {
      return {
        disposition: 'UNVERIFIABLE',
        reason: 'WINDOW_BATCH_READ_FAILED',
        failedObjectKey: `private/test/${role.toLowerCase()}-batch.json`,
        failedBatchSequence: 0,
        diagnostic: null,
      };
    }
    const sourceFrames = role === 'PROXY' ? options.proxy : options.master;
    const map = role === 'PROXY'
      ? fixtureBasis.proxyTimeMap
      : fixtureBasis.masterTimeMap;
    const window = presentationWindow({
      role,
      map,
      frames: sourceFrames,
      firstFrameOrdinal: input.firstFrameOrdinal,
      endExclusiveFrameOrdinal: input.endExclusiveFrameOrdinal,
      resourcePolicy: input.resourcePolicy,
    });
    return options.mutateWindow?.(window, role) ?? window;
  };
  const request = {
    basis: fixtureBasis,
    proxy: {
      asset: { role: 'PROXY' } as never,
      storedObjectReader: { read: async () => { throw new Error('TEST_UNUSED'); } },
      windowResourcePolicy,
    },
    master: {
      asset: { role: 'MASTER' } as never,
      storedObjectReader: { read: async () => { throw new Error('TEST_UNUSED'); } },
      windowResourcePolicy,
    },
    policy: {
      policyVersion: 'proxy-master-correspondence-producer-policy-v1',
      pageFrameRecords: options.pageFrameRecords ?? 100,
      batch: {
        policyVersion: 'proxy-master-correspondence-batch-policy-v1',
        maxCanonicalJsonBytes: options.maxBatchBytes ?? 64 * 1024,
        maxSpanRecords: options.maxSpanRecords ?? 100,
      },
      index: {
        policyVersion: 'proxy-master-correspondence-index-policy-v1',
        requiredBatchPolicyVersion: 'proxy-master-correspondence-batch-policy-v1',
        maxCanonicalJsonBytes: 64 * 1024,
        maxBatchEntries: options.maxBatchEntries ?? 100,
      },
      verification: {
        policyVersion: 'proxy-master-correspondence-verification-policy-v1',
        maxBatchReads: 100,
        maxTotalArtifactBytes: 1024 * 1024,
      },
    },
    publisher: publisher.port,
    readWindow: readWindow as never,
  };
  return { request, publisher, windowReads };
}

function presentationWindow(input: Readonly<{
  role: 'PROXY' | 'MASTER';
  map: ReturnType<typeof timeMap>;
  frames: readonly FrameFixtureV1[];
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  resourcePolicy: Readonly<{
    policyVersion: string;
    maxFrameRecords: number;
    maxBatchReads: number;
    maxTotalReadBytes: number;
  }>;
}>) {
  const first = Number(input.firstFrameOrdinal);
  const end = Number(input.endExclusiveFrameOrdinal);
  const selected = input.frames.slice(first, end);
  const frames = selected.map((entry, offset) => {
    const ordinal = first + offset;
    return {
      sourceFrameOrdinal: String(ordinal),
      epochId: `${input.role.toLowerCase()}-epoch-${String(ordinal)}`,
      presentationTimestampTicks: String(entry.presentationTimestampTicks),
      durationTicks: String(entry.durationTicks),
    };
  });
  const epochs = selected.map((entry, offset) => {
    const ordinal = first + offset;
    return {
      schemaVersion: 1 as const,
      contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
      kind: 'presentation-epoch' as const,
      epochId: `${input.role.toLowerCase()}-epoch-${String(ordinal)}`,
      streamId: input.map.streamId,
      secondsPerSourceTick: { numerator: '1', denominator: '120' },
      sourceStartPresentationTimestampTicks: String(entry.presentationTimestampTicks),
      sourceEndExclusivePresentationTimestampTicks: String(
        entry.presentationTimestampTicks + entry.durationTicks,
      ),
      canonicalStartTime: mediaTime(entry.canonicalStartTicks),
      boundaryKind: ordinal === 0 ? 'INITIAL' as const : 'TIMESTAMP_RESET' as const,
    };
  });
  const material = {
    schemaVersion: 3 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_PRESENTATION_WINDOW_V3' as const,
    disposition: 'EPOCH_PRESENTATION_WINDOW_VERIFIED' as const,
    evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW' as const,
    assetId: `${input.role.toLowerCase()}-asset`,
    sourceVersionSha256: input.map.sourceVersionSha256,
    storageVersionSha256: input.map.storageVersionSha256,
    sourceBindingSha256: input.map.sourceBindingSha256,
    technicalObservationSha256: input.map.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3: input.map.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: input.map.mapBindingSha256,
    terminalReceiptSha256: input.map.terminalReceiptSha256,
    verificationSha256: input.map.verificationSha256,
    epochIndexContentSha256: input.map.epochIndexContentSha256,
    streamId: input.map.streamId,
    videoStreamIndex: input.map.videoStreamIndex,
    sourceTimebase: { numerator: '1', denominator: '120' },
    firstFrameOrdinal: input.firstFrameOrdinal,
    endExclusiveFrameOrdinal: input.endExclusiveFrameOrdinal,
    selectedBatchCount: 1,
    selectedBatchBytes: selected.length * 64,
    epochs,
    frames,
    selectedBatches: [{
      batchSequence: first,
      epochId: epochs[0]!.epochId,
      contentSha256: hash(`${input.role}-batch-${input.firstFrameOrdinal}`),
      shardDescriptorSha256: hash(`${input.role}-shard-${input.firstFrameOrdinal}`),
      firstFrameOrdinal: input.firstFrameOrdinal,
      frameCount: String(selected.length),
    }],
    resourcePolicy: input.resourcePolicy,
  };
  return rehashWindow(material);
}

function rehashWindow<T extends Record<string, unknown>>(value: T) {
  const { presentationWindowEvidenceSha256: _ignored, ...material } = value;
  return {
    ...material,
    presentationWindowEvidenceSha256: hashEditronCanonicalJsonV1(material),
  } as T & { presentationWindowEvidenceSha256: string };
}

function memoryPublisher(options: Readonly<{
  failBatchSequence?: number;
  forgeReceipt?: boolean;
}>) {
  const objects = new Map<string, StoredObjectV1>();
  const batches: Array<{
    serialization: MediaProxyMasterCorrespondenceBatchSerializationV1;
    sidecar: MediaProxyMasterCorrespondenceBatchSidecarV1;
  }> = [];
  let indexPublished = false;
  const port: MediaProxyMasterCorrespondenceIncrementalPublisherV1 = {
    async publishBatch(input) {
      if (input.serialization.batch.batchSequence === options.failBatchSequence) {
        throw new Error('TEST_BATCH_WRITE_UNAVAILABLE');
      }
      batches.push({ serialization: input.serialization, sidecar: input.sidecar });
      objects.set(input.sidecar.objectKey, stored(input.serialization));
    },
    async publishIndexAndVerify(input) {
      indexPublished = true;
      objects.set(input.indexReference.objectKey, stored(input.indexSerialization));
      const result = await verifyMediaProxyMasterCorrespondenceArtifactsV1({
        basis: input.basis,
        indexReference: input.indexReference,
        verificationPolicy: input.verificationPolicy,
        reader: {
          async read(reference) {
            const object = objects.get(reference.objectKey);
            if (!object) throw new Error('TEST_OBJECT_MISSING');
            return object;
          },
        },
      });
      if (result.disposition === 'UNVERIFIABLE') {
        throw new Error(`TEST_ARTIFACT_UNVERIFIABLE:${result.reason}`);
      }
      return options.forgeReceipt
        ? ({ ...result, verificationSha256: 'f'.repeat(64) } as
          MediaProxyMasterCorrespondenceArtifactVerificationReceiptV1)
        : result;
    },
  };
  return {
    port,
    batches,
    get indexPublished() { return indexPublished; },
  };
}

function stored(value: Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>): StoredObjectV1 {
  return {
    canonicalJson: value.canonicalJson,
    byteLength: value.byteLength,
    contentSha256: value.contentSha256,
  };
}

function basis(proxyFrameCount: number, masterFrameCount: number) {
  return {
    relationSha256: hash('relation'),
    proxyTimeMap: timeMap('proxy', proxyFrameCount),
    masterTimeMap: timeMap('master', masterFrameCount),
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

function mediaTime(ticks: number) {
  const divisor = greatestCommonDivisor(Math.abs(ticks), 120);
  return {
    ticks: String(ticks / divisor),
    timescale: String(120 / divisor),
  };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a === 0 ? 1 : a;
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
