import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterMappingQualificationExecutionReceiptV1,
  assertMediaProxyMasterMappingQualificationReceiptV1,
  qualifyMediaProxyMasterTimeMappingV1,
} from '@/lib/editron/services/media-proxy-master-mapping-qualification-v1';
import { buildMediaProxyMasterMappingQualificationFixtureV1 }
  from './helpers/media-proxy-master-mapping-qualification-fixture';

const WORKER_IMAGE_DIGEST = 'f'.repeat(64);
type FixtureV1 = Awaited<
ReturnType<typeof buildMediaProxyMasterMappingQualificationFixtureV1>
>;
type QualificationInputV1 = Parameters<
typeof qualifyMediaProxyMasterTimeMappingV1
>[0];

describe('MediaProxyMasterMappingQualificationV1', () => {
  let fixture: FixtureV1;
  let otherFixture: FixtureV1;
  let noAudioFixture: FixtureV1;

  beforeAll(async () => {
    [fixture, otherFixture, noAudioFixture] = await Promise.all([
      buildMediaProxyMasterMappingQualificationFixtureV1({ tag: 'qualify-a' }),
      buildMediaProxyMasterMappingQualificationFixtureV1({ tag: 'qualify-b' }),
      buildMediaProxyMasterMappingQualificationFixtureV1({
        tag: 'qualify-no-audio',
        noAudio: true,
      }),
    ]);
  });

  it('qualifies an exact picture mapping and binds verified audio lineage', () => {
    const result = qualifyMediaProxyMasterTimeMappingV1(request(fixture));

    expect(result).toMatchObject({
      disposition: 'MAPPING_QUALIFIED',
      relation: {
        relationSha256: fixture.relation.relationSha256,
      },
      execution: {
        relationSha256: fixture.relation.relationSha256,
        trustedTranscodeReceiptSha256:
          fixture.trustedTranscodeReceipt.receiptSha256,
        correspondenceDerivationSha256:
          fixture.derivationReceipt.derivationSha256,
        segmentMaterializationSha256:
          fixture.segmentMaterializationReceipt.materializationSha256,
        audioLineageVerificationSha256:
          fixture.audioLineageReceipt.verificationSha256,
      },
      mapping: {
        disposition: 'QUALIFIED',
        relationSha256: fixture.relation.relationSha256,
        canonicalEndExclusiveTime: { ticks: '10', timescale: '1' },
        audio: { disposition: 'VERIFIED_SAMPLE_TIMELINE_LINEAGE' },
      },
    });
    if (result.disposition !== 'MAPPING_QUALIFIED') {
      throw new Error('TEST_EXPECTED_MAPPING_QUALIFICATION');
    }
    expect(result.mapping.segments).toHaveLength(1);
    expect(result.mapping.verifier.executionReceiptSha256)
      .toBe(result.execution.executionReceiptSha256);
    expect(assertMediaProxyMasterMappingQualificationExecutionReceiptV1(
      result.execution,
    )).toEqual(result.execution);
    expect(assertMediaProxyMasterMappingQualificationReceiptV1(result))
      .toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('qualifies true no-audio media without weakening the execution binding', () => {
    const result = qualifyMediaProxyMasterTimeMappingV1(
      request(noAudioFixture),
    );

    expect(result).toMatchObject({
      disposition: 'MAPPING_QUALIFIED',
      mapping: { audio: { disposition: 'NO_AUDIO_IN_EITHER_SOURCE' } },
      execution: {
        audioLineageVerificationSha256:
          noAudioFixture.audioLineageReceipt.verificationSha256,
      },
    });
    if (result.disposition !== 'MAPPING_QUALIFIED') {
      throw new Error('TEST_EXPECTED_NO_AUDIO_MAPPING_QUALIFICATION');
    }
    expect(result.mapping.verifier.executionReceiptSha256)
      .toBe(result.execution.executionReceiptSha256);
  });

  it('rejects source-scoped receipts from another immutable relation', () => {
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      trustedTranscodeReceipt: otherFixture.trustedTranscodeReceipt,
    }))).toEqual(unverifiable('EVIDENCE_SCOPE_MISMATCH'));
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      correspondenceDerivationReceipt: otherFixture.derivationReceipt,
      segmentMaterializationReceipt:
        otherFixture.segmentMaterializationReceipt,
    }))).toEqual(unverifiable('EVIDENCE_SCOPE_MISMATCH'));
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      audioLineageReceipt: otherFixture.audioLineageReceipt,
    }))).toEqual(unverifiable('EVIDENCE_SCOPE_MISMATCH'));
  });

  it('rejects qualification before the audio verification instant', () => {
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      qualifiedAt: new Date('2026-08-31T10:02:59.999Z'),
    }))).toEqual(unverifiable('VERIFICATION_TIME_INCONSISTENT'));
  });

  it('rejects an exact V3 picture duration that disagrees with the proxy probe', async () => {
    const durationMismatch =
      await buildMediaProxyMasterMappingQualificationFixtureV1({
        tag: 'qualify-duration-mismatch',
        frameDurationTicks: 2_999,
      });

    expect(qualifyMediaProxyMasterTimeMappingV1(
      request(durationMismatch),
    )).toEqual(unverifiable('EVIDENCE_SCOPE_MISMATCH'));
  });

  it('classifies each malformed upstream receipt before any mapping is issued', () => {
    const transcode = {
      ...structuredClone(fixture.trustedTranscodeReceipt),
      receiptSha256: '0'.repeat(64),
    };
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      trustedTranscodeReceipt: transcode,
    }))).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'TRANSCODE_RECEIPT_REJECTED',
    });

    const derivation = {
      ...structuredClone(fixture.derivationReceipt),
      derivationSha256: '0'.repeat(64),
    };
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      correspondenceDerivationReceipt: derivation,
    }))).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'CORRESPONDENCE_RECEIPT_REJECTED',
    });

    const segments = {
      ...structuredClone(fixture.segmentMaterializationReceipt),
      materializationSha256: '0'.repeat(64),
    };
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      segmentMaterializationReceipt: segments,
    }))).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SEGMENT_RECEIPT_REJECTED',
    });

    const audio = {
      ...structuredClone(fixture.audioLineageReceipt),
      verificationSha256: '0'.repeat(64),
    };
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      audioLineageReceipt: audio,
    }))).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'AUDIO_RECEIPT_REJECTED',
    });
  });

  it('rejects invalid request identity without consulting evidence', () => {
    expect(qualifyMediaProxyMasterTimeMappingV1(request(fixture, {
      workerImageDigest: 'not-a-digest',
    }))).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'REQUEST_INVALID',
    });
  });

  it('detects tampering in the execution, mapping, and wrapper hashes', () => {
    const result = qualifyMediaProxyMasterTimeMappingV1(request(fixture));
    if (result.disposition !== 'MAPPING_QUALIFIED') {
      throw new Error('TEST_EXPECTED_TAMPER_BASELINE');
    }

    const executionTamper = {
      ...structuredClone(result.execution),
      audioLineageVerificationSha256: '0'.repeat(64),
    };
    expect(() =>
      assertMediaProxyMasterMappingQualificationExecutionReceiptV1(
        executionTamper,
      )).toThrow(
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_HASH_MISMATCH',
    );

    const mappingTamper = {
      ...structuredClone(result),
      mapping: {
        ...structuredClone(result.mapping),
        verifiedAt: '2026-08-31T10:05:00.000Z',
      },
    };
    expect(() => assertMediaProxyMasterMappingQualificationReceiptV1(
      mappingTamper,
    )).toThrow('MEDIA_PROXY_MASTER_MAPPING_HASH_OR_RELATION_MISMATCH');

    const wrapperTamper = {
      ...structuredClone(result),
      qualificationSha256: '0'.repeat(64),
    };
    expect(() => assertMediaProxyMasterMappingQualificationReceiptV1(
      wrapperTamper,
    )).toThrow(
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_RECEIPT_HASH_MISMATCH',
    );
  });
});

function request(
  fixture: FixtureV1,
  overrides: Partial<QualificationInputV1> = {},
): QualificationInputV1 {
  return {
    relation: fixture.relation,
    trustedTranscodeReceipt: fixture.trustedTranscodeReceipt,
    correspondenceDerivationReceipt: fixture.derivationReceipt,
    segmentMaterializationReceipt: fixture.segmentMaterializationReceipt,
    audioLineageReceipt: fixture.audioLineageReceipt,
    workerImageDigest: WORKER_IMAGE_DIGEST,
    qualifiedAt: new Date('2026-08-31T10:04:00.000Z'),
    ...overrides,
  };
}

function unverifiable(reason: string) {
  return { disposition: 'UNVERIFIABLE', reason, diagnostic: null };
}
