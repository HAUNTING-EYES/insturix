import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterAudioLineageVerificationReceiptV1,
  verifyMediaProxyMasterAudioLineageV1,
} from '@/lib/editron/services/media-proxy-master-audio-lineage-verifier-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 }
  from '@/lib/editron/services/media-source-audio-private-artifact-port-v1';
import {
  buildMediaProxyMasterAudioLineageFixtureV1,
} from './helpers/media-proxy-master-audio-lineage-fixture';

describe('MediaProxyMasterAudioLineageVerifierV1', () => {
  it('rereads private artifacts and proves exact origin-shifted sample lineage', async () => {
    const fixture = buildMediaProxyMasterAudioLineageFixtureV1();
    const result = await verifyMediaProxyMasterAudioLineageV1(fixture);

    expect(result).toMatchObject({
      disposition: 'AUDIO_LINEAGE_VERIFIED',
      relationSha256: fixture.relation.relationSha256,
      transcodeReceiptSha256: fixture.trustedTranscodeReceipt.receiptSha256,
      audio: {
        disposition: 'VERIFIED_SAMPLE_TIMELINE_LINEAGE',
        streams: [{ masterStreamId: 'audio-1', proxyStreamId: 'audio-1' }],
      },
      streams: [{ masterAudioStreamIndex: 1, proxyAudioStreamIndex: 1 }],
      artifactReadCount: 2,
    });
    if (result.disposition === 'UNVERIFIABLE') throw new Error('TEST_RECEIPT_REQUIRED');
    expect(assertMediaProxyMasterAudioLineageVerificationReceiptV1(result))
      .toEqual(result);
    expect(Object.isFrozen(result.streams[0])).toBe(true);
  });

  it('proves genuine no-audio only when both observations and selections agree', async () => {
    const fixture = buildMediaProxyMasterAudioLineageFixtureV1({
      tag: 'no-audio',
      observedMasterAudioStreamIndexes: [],
      selectedMasterAudioStreamIndexes: [],
    });

    await expect(verifyMediaProxyMasterAudioLineageV1(fixture)).resolves
      .toMatchObject({
        disposition: 'AUDIO_LINEAGE_VERIFIED',
        audio: { disposition: 'NO_AUDIO_IN_EITHER_SOURCE' },
        streams: [],
        artifactReadCount: 0,
      });
  });

  it('rejects omitted observed streams and bounded-resource understatement', async () => {
    const omitted = buildMediaProxyMasterAudioLineageFixtureV1({
      tag: 'omitted-stream',
      observedMasterAudioStreamIndexes: [1, 2],
      selectedMasterAudioStreamIndexes: [1],
    });
    await expect(verifyMediaProxyMasterAudioLineageV1(omitted)).resolves
      .toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'MASTER_AUDIO_SELECTION_INCOMPLETE',
        failedSide: 'MASTER',
      });

    const limited = buildMediaProxyMasterAudioLineageFixtureV1({
      tag: 'read-limit',
      maxAudioStreams: 1,
      maxArtifactReads: 1,
    });
    await expect(verifyMediaProxyMasterAudioLineageV1(limited)).resolves
      .toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'RESOURCE_LIMIT_EXCEEDED',
      });

    await expect(verifyMediaProxyMasterAudioLineageV1({
      ...limited,
      verifiedAt: '2026-08-31T10:01:59.000Z',
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'VERIFICATION_TIME_INCONSISTENT',
    });
  });

  it('rejects sample-rate, channel-layout and exact epoch-timeline drift', async () => {
    const sampleRate = buildMediaProxyMasterAudioLineageFixtureV1({
      tag: 'sample-rate-drift',
      proxySampleRate: '44100',
    });
    await expect(verifyMediaProxyMasterAudioLineageV1(sampleRate)).resolves
      .toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'SAMPLE_RATE_MISMATCH' });

    const layout = buildMediaProxyMasterAudioLineageFixtureV1({
      tag: 'layout-drift',
      proxyChannelLayout: '2.0',
    });
    await expect(verifyMediaProxyMasterAudioLineageV1(layout)).resolves
      .toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'CHANNEL_LAYOUT_MISMATCH' });

    const timeline = buildMediaProxyMasterAudioLineageFixtureV1({
      tag: 'timeline-drift',
      proxySecondFramePtsDelta: BigInt(1),
    });
    await expect(verifyMediaProxyMasterAudioLineageV1(timeline)).resolves
      .toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'TIMELINE_MISMATCH' });
  });

  it('rejects source substitution, private read failure and artifact substitution', async () => {
    const fixture = buildMediaProxyMasterAudioLineageFixtureV1({ tag: 'adversarial' });
    const other = buildMediaProxyMasterAudioLineageFixtureV1({ tag: 'other-source' });
    await expect(verifyMediaProxyMasterAudioLineageV1({
      ...fixture,
      proxyAudioAvailabilityEvidence: other.proxyAudioAvailabilityEvidence,
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_SCOPE_MISMATCH',
    });

    const readFailure: MediaSourceAudioPrivateArtifactReaderV1 = {
      async readArtifactSet() { throw new Error('PRIVATE_STORE_DOWN'); },
    };
    await expect(verifyMediaProxyMasterAudioLineageV1({
      ...fixture,
      reader: readFailure,
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'ARTIFACT_READ_FAILED',
      failedSide: 'MASTER',
    });

    const values = [...fixture.artifacts.values()];
    const substituted: MediaSourceAudioPrivateArtifactReaderV1 = {
      async readArtifactSet() { return values.at(-1)!; },
    };
    await expect(verifyMediaProxyMasterAudioLineageV1({
      ...fixture,
      reader: substituted,
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'ARTIFACT_BINDING_MISMATCH',
    });
  });

  it('rejects tampered nested receipt evidence on reload', async () => {
    const fixture = buildMediaProxyMasterAudioLineageFixtureV1({ tag: 'tamper' });
    const result = await verifyMediaProxyMasterAudioLineageV1(fixture);
    if (result.disposition === 'UNVERIFIABLE') throw new Error('TEST_RECEIPT_REQUIRED');
    const tampered = structuredClone(result) as unknown as {
      streams: Array<{ canonicalTimelineEquivalenceSha256: string }>;
    };
    tampered.streams[0]!.canonicalTimelineEquivalenceSha256 = 'f'.repeat(64);

    expect(() => assertMediaProxyMasterAudioLineageVerificationReceiptV1(tampered))
      .toThrow('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_STREAM_HASH_MISMATCH');
  });
});
