import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  appendMediaSourcePtsCadenceMapShardV1,
  claimMediaSourcePtsCadenceMapV1,
  completeMediaSourcePtsCadenceMapV1,
  createMediaSourcePtsCadenceMapCompletionReceiptV1,
  createMediaSourcePtsCadenceMapRecordV1,
  expectedMediaSourcePtsCadenceManifestObjectKeyV1,
  expectedMediaSourcePtsCadenceShardObjectKeyV1,
  markMediaSourcePtsCadenceMapUnverifiableV1,
  prepareMediaSourcePtsCadenceMapCompletionV1,
} from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import type { MediaSourceTechnicalObservationV1 } from '@/lib/editron/services/media-source-probe-v1';

const NOW = new Date('2026-08-25T12:00:00.000Z');
const CLAIM_ID = 'cadence_claim_0001';

describe('MediaSourcePtsCadenceMapLifecycleV1', () => {
  it('creates a source-bound request then advances only through the next private shard', () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const claimed = claim(pending);
    const appended = appendMediaSourcePtsCadenceMapShardV1({
      record: claimed,
      claimId: CLAIM_ID,
      shard: first,
      privateSidecar: shardSidecar(claimed, first),
      now: NOW,
    });

    expect(appended).toMatchObject({
      status: 'MAPPING',
      attemptCount: 1,
      checkpoint: {
        nextShardSequence: 1,
        nextFrameOrdinal: '2',
        nextPresentationTimestampTicks: '6006',
        appendedShardCount: '1',
      },
    });
    expect(Object.isFrozen(appended)).toBe(true);
  });

  it('accepts a resumptive contiguous second shard only under a fresh claim', () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const firstClaim = claim(pending, 'cadence_claim_0001', '2026-08-25T12:01:00.000Z');
    const checkpointed = appendMediaSourcePtsCadenceMapShardV1({
      record: firstClaim,
      claimId: CLAIM_ID,
      shard: first,
      privateSidecar: shardSidecar(firstClaim, first),
      now: NOW,
    });
    const resumed = claim(checkpointed, 'cadence_claim_0002', '2026-08-25T12:03:00.000Z', new Date('2026-08-25T12:02:00.000Z'));
    const second = shard({
      shardSequence: 1,
      firstFrameOrdinal: '2',
      frames: [
        { presentationTimestampTicks: '6006', durationTicks: '3003' },
        { presentationTimestampTicks: '9009', durationTicks: '3003' },
      ],
    });

    expect(() => appendMediaSourcePtsCadenceMapShardV1({
      record: resumed,
      claimId: CLAIM_ID,
      shard: second,
      privateSidecar: shardSidecar(resumed, second),
      now: new Date('2026-08-25T12:02:01.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_NOT_ACTIVE');

    const appended = appendMediaSourcePtsCadenceMapShardV1({
      record: resumed,
      claimId: 'cadence_claim_0002',
      shard: second,
      privateSidecar: shardSidecar(resumed, second),
      now: new Date('2026-08-25T12:02:01.000Z'),
    });
    expect(appended.checkpoint).toMatchObject({
      nextShardSequence: 2,
      nextFrameOrdinal: '4',
      nextPresentationTimestampTicks: '12012',
      appendedShardCount: '2',
    });
  });

  it.each([
    ['different mapper', shard({ mapper: { ...mapper(), commandPolicyVersion: 'policy-v2' } })],
    ['wrong sequence', shard({ shardSequence: 1, firstFrameOrdinal: '0' })],
    ['wrong ordinal', shard({ shardSequence: 0, firstFrameOrdinal: '2' })],
  ])('fails closed for a %s shard', (_label, candidate) => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const claimed = claim(pending);
    expect(() => appendMediaSourcePtsCadenceMapShardV1({
      record: claimed,
      claimId: CLAIM_ID,
      shard: candidate,
      privateSidecar: shardSidecar(claimed, candidate),
      now: NOW,
    })).toThrow();
  });

  it('rejects a forged shard hash, presentation gap, or non-private deterministic key', () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const claimed = claim(pending);

    expect(() => createMediaSourcePtsCadenceMapRecordV1({
      bootstrapShard: { ...first, shardSha256: '0'.repeat(64) },
      now: NOW,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_SHARD_HASH_MISMATCH');

    const appended = appendMediaSourcePtsCadenceMapShardV1({
      record: claimed,
      claimId: CLAIM_ID,
      shard: first,
      privateSidecar: shardSidecar(claimed, first),
      now: NOW,
    });
    const gap = shard({
      shardSequence: 1,
      firstFrameOrdinal: '2',
      frames: [{ presentationTimestampTicks: '7000', durationTicks: '3003' }],
    });
    expect(() => appendMediaSourcePtsCadenceMapShardV1({
      record: appended,
      claimId: CLAIM_ID,
      shard: gap,
      privateSidecar: shardSidecar(appended, gap),
      now: NOW,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_PRESENTATION_CONTINUITY_MISMATCH');
    expect(() => appendMediaSourcePtsCadenceMapShardV1({
      record: claimed,
      claimId: CLAIM_ID,
      shard: first,
      privateSidecar: { ...shardSidecar(claimed, first), objectKey: 'https://unsafe.example/sidecar.json' },
      now: NOW,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_SIDECAR_INVALID');
  });

  it('hands completion only to a later full verifier and terminal CAS owner', () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const claimed = claim(pending);
    const appended = appendMediaSourcePtsCadenceMapShardV1({
      record: claimed,
      claimId: CLAIM_ID,
      shard: first,
      privateSidecar: shardSidecar(claimed, first),
      now: NOW,
    });
    const candidate = prepareMediaSourcePtsCadenceMapCompletionV1({
      record: appended,
      claimId: CLAIM_ID,
      privateManifest: manifestSidecar(appended),
      now: NOW,
    });

    expect(candidate).toMatchObject({
      mapBindingSha256: appended.mapBindingSha256,
      requiredTerminalVerifier: 'COMPLETE_PRESENTATION_COVERAGE_AND_CONTIGUITY_V1',
      requiredTerminalWrite: 'MEDIA_ASSETS_COMPARE_AND_SET_V1',
    });
    expect(JSON.stringify(candidate)).not.toContain('CFR');
    expect(JSON.stringify(candidate)).not.toContain('VFR');
  });

  it('terminalizes only an exact full-verifier receipt and then refuses renewed work', () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const claimed = claim(pending);
    const appended = appendMediaSourcePtsCadenceMapShardV1({
      record: claimed,
      claimId: CLAIM_ID,
      shard: first,
      privateSidecar: shardSidecar(claimed, first),
      now: NOW,
    });
    const candidate = prepareMediaSourcePtsCadenceMapCompletionV1({
      record: appended,
      claimId: CLAIM_ID,
      privateManifest: manifestSidecar(appended),
      now: NOW,
    });
    const receipt = createMediaSourcePtsCadenceMapCompletionReceiptV1({
      candidate,
      verifierVersion: 'presentation-coverage-verifier-v1',
      coveragePolicyVersion: 'coverage-policy-v1',
    });

    const terminal = completeMediaSourcePtsCadenceMapV1({
      record: appended,
      claimId: CLAIM_ID,
      candidate,
      completionReceipt: receipt,
      now: NOW,
    });
    expect(terminal).toMatchObject({
      status: 'COMPLETE',
      activeClaim: null,
      diagnostic: null,
      completion: {
        receipt: {
          verifierVersion: 'presentation-coverage-verifier-v1',
          coveragePolicyVersion: 'coverage-policy-v1',
        },
      },
    });
    expect(JSON.stringify(terminal)).not.toContain('CFR');
    expect(JSON.stringify(terminal)).not.toContain('VFR');
    expect(() => claimMediaSourcePtsCadenceMapV1({
      record: terminal,
      claimId: 'cadence_claim_0003',
      now: NOW,
      expiresAt: new Date('2026-08-25T12:01:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL');
    expect(() => completeMediaSourcePtsCadenceMapV1({
      record: appended,
      claimId: CLAIM_ID,
      candidate,
      completionReceipt: { ...receipt, verifierVersion: 'forged-verifier-v1' },
      now: NOW,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_COMPLETION_RECEIPT_INVALID');
  });

  it('terminalizes unverifiable maps and refuses renewed work', () => {
    const first = shard();
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: first, now: NOW });
    const terminal = markMediaSourcePtsCadenceMapUnverifiableV1({
      record: claim(pending),
      claimId: CLAIM_ID,
      diagnostic: 'private sidecar write interrupted',
      now: NOW,
    });
    expect(terminal).toMatchObject({ status: 'UNVERIFIABLE', activeClaim: null });
    expect(() => claimMediaSourcePtsCadenceMapV1({
      record: terminal,
      claimId: 'cadence_claim_0003',
      now: NOW,
      expiresAt: new Date('2026-08-25T12:01:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL');
  });

  it('rejects corrupted non-terminal diagnostics and attempt-counter overflow', () => {
    const pending = createMediaSourcePtsCadenceMapRecordV1({ bootstrapShard: shard(), now: NOW });
    expect(() => claimMediaSourcePtsCadenceMapV1({
      record: { ...pending, diagnostic: 'stale diagnostic' },
      claimId: CLAIM_ID,
      now: NOW,
      expiresAt: new Date('2026-08-25T12:01:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_DIAGNOSTIC_STATE_INVALID');
    expect(() => claimMediaSourcePtsCadenceMapV1({
      record: { ...pending, attemptCount: Number.MAX_SAFE_INTEGER },
      claimId: CLAIM_ID,
      now: NOW,
      expiresAt: new Date('2026-08-25T12:01:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_ATTEMPT_OVERFLOW');
  });
});

function claim(
  record: ReturnType<typeof createMediaSourcePtsCadenceMapRecordV1>,
  claimId = CLAIM_ID,
  expiresAt = '2026-08-25T12:01:00.000Z',
  now = NOW,
) {
  return claimMediaSourcePtsCadenceMapV1({
    record,
    claimId,
    now,
    expiresAt: new Date(expiresAt),
  });
}

function shard(options: {
  mapper?: ReturnType<typeof mapper>;
  shardSequence?: number;
  firstFrameOrdinal?: string;
  frames?: readonly { presentationTimestampTicks: string; durationTicks: string }[];
} = {}) {
  return createMediaSourcePtsCadenceShardV1({
    sourceVersion: sourceVersion(),
    qualification: qualification(),
    videoStreamIndex: 0,
    mapper: options.mapper ?? mapper(),
    shardSequence: options.shardSequence ?? 0,
    firstFrameOrdinal: options.firstFrameOrdinal ?? '0',
    frames: options.frames ?? [
      { presentationTimestampTicks: '0', durationTicks: '3003' },
      { presentationTimestampTicks: '3003', durationTicks: '3003' },
    ],
  });
}

function shardSidecar(
  record: { mapBindingSha256: string },
  value: ReturnType<typeof shard>,
) {
  return {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_V1' as const,
    storage: 'R2_PRIVATE' as const,
    objectKey: expectedMediaSourcePtsCadenceShardObjectKeyV1(record.mapBindingSha256, value),
    byteLength: 512,
    contentSha256: 'd'.repeat(64),
  };
}

function manifestSidecar(record: {
  mapBindingSha256: string;
  checkpoint: Parameters<typeof expectedMediaSourcePtsCadenceManifestObjectKeyV1>[1];
}) {
  return {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_V1' as const,
    storage: 'R2_PRIVATE' as const,
    objectKey: expectedMediaSourcePtsCadenceManifestObjectKeyV1(record.mapBindingSha256, record.checkpoint),
    byteLength: 1024,
    contentSha256: 'e'.repeat(64),
  };
}

function sourceVersion() {
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 12_345,
    contentSha256: 'b'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'media/source.mp4' },
      byteLength: 12_345,
      providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
    }),
  });
}

function qualification() {
  const observation = technicalObservation();
  return {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: 'asset-1',
    locator: { provider: 'R2', objectKey: 'media/source.mp4' },
    sourceBindingSha256: 'a'.repeat(64),
    requestId: 'media-source-probe:fixture',
    attemptCount: 1,
    requestedAt: '2026-08-25T00:00:00.000Z',
    startedAt: '2026-08-25T00:00:01.000Z',
    completedAt: '2026-08-25T00:00:02.000Z',
    storageVersion: sourceVersion().storageVersion,
    observation,
    diagnostic: null,
  } satisfies MediaSourceQualificationRecordV1;
}

function technicalObservation(): MediaSourceTechnicalObservationV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-7.1',
    formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
    durationMilliseconds: 12_345,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '-4500',
      sourceDurationTicks: '1111050',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '370',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: '01:00:00;00',
      reelId: 'A001',
    }],
    audioStreams: [],
  };
  return { ...material, observationSha256: hashEditronCanonicalJsonV1(material) };
}

function mapper() {
  return {
    mapperVersion: 'media-pts-mapper-v1',
    ffprobeVersion: 'ffprobe-7.1',
    commandPolicyVersion: 'policy-v1',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
}
