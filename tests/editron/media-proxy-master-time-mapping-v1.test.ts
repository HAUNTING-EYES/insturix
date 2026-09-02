import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterTimeMappingV1,
  createMediaProxyMasterTimeMappingV1,
  MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
} from '@/lib/editron/services/media-proxy-master-time-mapping-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import {
  createMediaProxyMasterRelationV1,
  createMediaSourceVersionV1,
} from '@/lib/editron/services/media-source-version-v1';

describe('MediaProxyMasterTimeMappingV1', () => {
  it('qualifies exact multi-epoch real-time mapping with private frame and audio lineage', () => {
    const { relation, input } = fixture();
    const mapping = createMediaProxyMasterTimeMappingV1(input);

    expect(mapping).toMatchObject({
      disposition: 'QUALIFIED',
      relationSha256: relation.relationSha256,
      canonicalEndExclusiveTime: { ticks: '10', timescale: '1' },
      proxyTimeMap: { totalFrameCount: '300' },
      masterTimeMap: { totalFrameCount: '240' },
      frameCorrespondenceIndex: {
        storage: 'R2_PRIVATE',
        mappedProxyFrameCount: '300',
        mappedMasterFrameCount: '240',
      },
      audio: { disposition: 'VERIFIED_SAMPLE_TIMELINE_LINEAGE' },
    });
    expect(mapping.lineage.lineageReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(mapping.mappingSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(assertMediaProxyMasterTimeMappingV1(mapping, relation)).toEqual(mapping);
    expect(Object.isFrozen(mapping.segments[0])).toBe(true);
  });

  it('rejects canonical gaps and exact source-duration drift', () => {
    const gap = fixture();
    gap.input.segments[1] = {
      ...gap.input.segments[1]!,
      canonicalStartTime: { ticks: '6', timescale: '1' },
    };
    expect(() => createMediaProxyMasterTimeMappingV1(gap.input))
      .toThrow('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_COVERAGE_GAP');

    const drift = fixture();
    drift.input.segments[0] = {
      ...drift.input.segments[0]!,
      masterEndExclusive: {
        ...drift.input.segments[0]!.masterEndExclusive,
        presentationTimestampTicks: '1350001',
      },
    };
    expect(() => createMediaProxyMasterTimeMappingV1(drift.input))
      .toThrow('MEDIA_PROXY_MASTER_MAPPING_MASTER_DURATION_MISMATCH');
  });

  it('rejects incomplete correspondence, non-private evidence, and audio layout drift', () => {
    const partial = fixture();
    partial.input.frameCorrespondenceIndex = {
      ...partial.input.frameCorrespondenceIndex,
      mappedProxyFrameCount: '299',
    };
    expect(() => createMediaProxyMasterTimeMappingV1(partial.input))
      .toThrow('MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_COVERAGE_MISMATCH');

    const publicEvidence = fixture();
    publicEvidence.input.frameCorrespondenceIndex = {
      ...publicEvidence.input.frameCorrespondenceIndex,
      objectKey: 'public/editron/mapping.json',
    };
    expect(() => createMediaProxyMasterTimeMappingV1(publicEvidence.input))
      .toThrow('MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_INDEX_INVALID');

    const audioDrift = fixture();
    if (audioDrift.input.audio.disposition !== 'VERIFIED_SAMPLE_TIMELINE_LINEAGE') {
      throw new Error('TEST_AUDIO_REQUIRED');
    }
    audioDrift.input.audio = {
      ...audioDrift.input.audio,
      streams: [{
        ...audioDrift.input.audio.streams[0]!,
        proxyChannelLayoutSha256: hash('different-layout'),
      }],
    };
    expect(() => createMediaProxyMasterTimeMappingV1(audioDrift.input))
      .toThrow('MEDIA_PROXY_MASTER_MAPPING_AUDIO_SCOPE_OR_LAYOUT_MISMATCH');
  });

  it('rejects another relation and any tampered qualified record', () => {
    const first = fixture();
    const mapping = createMediaProxyMasterTimeMappingV1(first.input);
    const other = fixture('other');
    expect(() => assertMediaProxyMasterTimeMappingV1(mapping, other.relation))
      .toThrow('MEDIA_PROXY_MASTER_MAPPING_PROXY_SOURCE_SCOPE_MISMATCH');

    const tampered = structuredClone(mapping) as unknown as {
      segments: Array<{ proxyEndExclusive: { presentationTimestampTicks: string } }>;
    };
    tampered.segments[0]!.proxyEndExclusive.presentationTimestampTicks = '4999';
    expect(() => assertMediaProxyMasterTimeMappingV1(tampered, first.relation))
      .toThrow('MEDIA_PROXY_MASTER_MAPPING_PROXY_DURATION_MISMATCH');

    const ignoredFieldTamper = structuredClone(mapping) as unknown as {
      proxy: { contentSha256: string };
    };
    ignoredFieldTamper.proxy.contentSha256 = 'f'.repeat(64);
    expect(() => assertMediaProxyMasterTimeMappingV1(ignoredFieldTamper, first.relation))
      .toThrow('MEDIA_PROXY_MASTER_MAPPING_HASH_OR_RELATION_MISMATCH');
  });
});

type MutableInput = {
  -readonly [K in keyof Parameters<typeof createMediaProxyMasterTimeMappingV1>[0]]:
    K extends 'segments'
      ? Array<Parameters<typeof createMediaProxyMasterTimeMappingV1>[0]['segments'][number]>
      : Parameters<typeof createMediaProxyMasterTimeMappingV1>[0][K];
};

function fixture(tag = 'primary') {
  const proxy = source(tag, 'proxy', 50_000);
  const master = source(tag, 'master', 100_000);
  const relation = createMediaProxyMasterRelationV1({ proxy, master });
  const layout = hash(`layout-${tag}`);
  const proxyMap = timeMap(proxy, 300, tag, 'proxy');
  const masterMap = timeMap(master, 240, tag, 'master');
  const input: MutableInput = {
    relation,
    verificationBasis: 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1',
    verifier: {
      verifierId: 'editron-proxy-master-verifier',
      verifierVersion: 'proxy-master-verifier-v1',
      verificationPolicyVersion: 'proxy-master-verification-policy-v1',
      workerImageDigest: hash(`worker-${tag}`),
      executionReceiptSha256: hash(`execution-${tag}`),
    },
    lineage: {
      kind: 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1',
      transcodeJobId: `transcode-${tag}`,
      transcodePolicyVersion: 'editron-proxy-transcode-policy-v1',
      ffmpegVersion: 'ffmpeg-8.1',
      commandSha256: hash(`command-${tag}`),
      masterDecodeReceiptSha256: hash(`decode-${tag}`),
      proxyEncodeReceiptSha256: hash(`encode-${tag}`),
    },
    proxyTimeMap: proxyMap,
    masterTimeMap: masterMap,
    frameCorrespondenceIndex: {
      schemaVersion: 1,
      kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
      storage: 'R2_PRIVATE',
      objectKey: `private/editron/media-proxy-master-correspondence/${tag}/index.json`,
      byteLength: 10_000,
      contentSha256: hash(`index-${tag}`),
      batchCount: 2,
      mappedProxyFrameCount: '300',
      mappedMasterFrameCount: '240',
    },
    segments: [
      segment({
        sequence: 0,
        canonicalStart: '0', canonicalEnd: '5',
        proxy, proxyEpoch: 'proxy-epoch-0', proxyStart: '0', proxyEnd: '5000',
        proxyFirst: '0', proxyEndOrdinal: '150',
        master, masterEpoch: 'master-epoch-0', masterStart: '900000', masterEnd: '1350000',
        masterFirst: '0', masterEndOrdinal: '120',
      }),
      segment({
        sequence: 1,
        canonicalStart: '5', canonicalEnd: '10',
        proxy, proxyEpoch: 'proxy-epoch-1', proxyStart: '-2000', proxyEnd: '3000',
        proxyFirst: '150', proxyEndOrdinal: '300',
        master, masterEpoch: 'master-epoch-1', masterStart: '-90000', masterEnd: '360000',
        masterFirst: '120', masterEndOrdinal: '240',
      }),
    ],
    audio: {
      disposition: 'VERIFIED_SAMPLE_TIMELINE_LINEAGE',
      streams: [{
        sequence: 0,
        proxyStreamId: 'audio-0',
        masterStreamId: 'audio-0',
        proxyAudioEpochMapSha256: hash(`proxy-audio-map-${tag}`),
        masterAudioEpochMapSha256: hash(`master-audio-map-${tag}`),
        proxyChannelLayoutSha256: layout,
        masterChannelLayoutSha256: layout,
        canonicalTimelineEquivalenceSha256: hash(`audio-timeline-${tag}`),
        lineageEvidenceSha256: hash(`audio-lineage-${tag}`),
      }],
    },
    verifiedAt: '2026-08-30T00:00:00.000Z',
  };
  return { relation, input };
}

function source(tag: string, role: string, byteLength: number) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `media/${tag}-${role}.mp4` },
    byteLength,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}-${role}` },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: `user-${tag}` },
    assetId: `asset-${tag}`,
    mediaKind: 'video',
    byteLength,
    contentSha256: hash(`content-${tag}-${role}`),
    storageVersion,
  });
}

function timeMap(
  sourceVersion: ReturnType<typeof source>,
  totalFrameCount: number,
  tag: string,
  role: string,
) {
  return {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: hash(`source-binding-${tag}-${role}`),
    technicalObservationSha256: hash(`observation-${tag}-${role}`),
    sourcePtsCadenceMapStateSha256V3: hash(`state-${tag}-${role}`),
    mapBindingSha256: hash(`binding-${tag}-${role}`),
    terminalReceiptSha256: hash(`terminal-${tag}-${role}`),
    verificationSha256: hash(`verification-${tag}-${role}`),
    epochIndexContentSha256: hash(`epoch-index-${tag}-${role}`),
    streamId: 'video-0',
    videoStreamIndex: 0,
    totalFrameCount: String(totalFrameCount),
  };
}

function segment(input: {
  sequence: number;
  canonicalStart: string;
  canonicalEnd: string;
  proxy: ReturnType<typeof source>;
  proxyEpoch: string;
  proxyStart: string;
  proxyEnd: string;
  proxyFirst: string;
  proxyEndOrdinal: string;
  master: ReturnType<typeof source>;
  masterEpoch: string;
  masterStart: string;
  masterEnd: string;
  masterFirst: string;
  masterEndOrdinal: string;
}) {
  return {
    sequence: input.sequence,
    canonicalStartTime: { ticks: input.canonicalStart, timescale: '1' },
    canonicalEndExclusiveTime: { ticks: input.canonicalEnd, timescale: '1' },
    proxyStart: position(input.proxy, input.proxyEpoch, input.proxyStart, '1000'),
    proxyEndExclusive: position(input.proxy, input.proxyEpoch, input.proxyEnd, '1000'),
    proxyFirstFrameOrdinal: input.proxyFirst,
    proxyEndExclusiveFrameOrdinal: input.proxyEndOrdinal,
    masterStart: position(input.master, input.masterEpoch, input.masterStart, '90000'),
    masterEndExclusive: position(input.master, input.masterEpoch, input.masterEnd, '90000'),
    masterFirstFrameOrdinal: input.masterFirst,
    masterEndExclusiveFrameOrdinal: input.masterEndOrdinal,
  };
}

function position(
  sourceVersion: ReturnType<typeof source>,
  epochId: string,
  presentationTimestampTicks: string,
  timescale: string,
) {
  return {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    streamId: 'video-0',
    epochId,
    presentationTimestampTicks,
    secondsPerSourceTick: { numerator: '1', denominator: timescale },
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
