import { describe, expect, it } from 'vitest';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  CanonicalMediaTimeValidationErrorV1,
  compareCanonicalMediaTimeV1,
  mediaTimeFromSourceTicksV1,
  parseAudioSampleRangeV1,
  parseExactRationalRateV1,
  parsePresentationEpochV1,
  parseSourcePositionV1,
  parseTimelinePositionV1,
  readCanonicalFrameRateV1,
  rescaleCanonicalMediaTimeExactV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';

describe('CanonicalMediaTimeV1', () => {
  it('preserves exact broadcast rates and integers beyond Number.MAX_SAFE_INTEGER', () => {
    expect(parseExactRationalRateV1({ numerator: '30000', denominator: '1001' }))
      .toEqual({ numerator: '30000', denominator: '1001' });
    expect(parseExactRationalRateV1({ numerator: '60000', denominator: '1001' }))
      .toEqual({ numerator: '60000', denominator: '1001' });

    const beyondSafe = '900719925474099312345678901234567890';
    expect(compareCanonicalMediaTimeV1(
      { ticks: beyondSafe, timescale: '30000' },
      { ticks: String(BigInt(beyondSafe) * BigInt(2)), timescale: '60000' },
    )).toBe(0);
  });

  it('keeps legacy numeric FPS readable without guessing a broadcast rational', () => {
    expect(readCanonicalFrameRateV1(29.97)).toEqual({
      rate: { numerator: '2997', denominator: '100' },
      provenance: 'LEGACY_NUMERIC_DECIMAL_V1',
      writeEligibility: 'READ_COMPATIBILITY_ONLY',
    });
    expect(readCanonicalFrameRateV1({ kind: 'LEGACY_NUMERIC_FPS_V1', fps: 30 }))
      .toEqual({
        rate: { numerator: '30', denominator: '1' },
        provenance: 'LEGACY_NUMERIC_DECIMAL_V1',
        writeEligibility: 'READ_COMPATIBILITY_ONLY',
      });
    expect(readCanonicalFrameRateV1({ numerator: '30000', denominator: '1001' }))
      .toEqual({
        rate: { numerator: '30000', denominator: '1001' },
        provenance: 'EXACT_RATIONAL_V1',
        writeEligibility: 'CANONICAL_EXACT',
      });
  });

  it('rescales only when integer coordinates remain exact', () => {
    expect(rescaleCanonicalMediaTimeExactV1(
      { ticks: '9007199254740993', timescale: '30000' },
      '60000',
    )).toEqual({
      disposition: 'EXACT',
      value: { ticks: '18014398509481986', timescale: '60000' },
    });
    expect(rescaleCanonicalMediaTimeExactV1(
      { ticks: '1', timescale: '3' },
      '1000',
    )).toEqual({
      disposition: 'NON_INTEGRAL',
      source: { ticks: '1', timescale: '3' },
      targetTimescale: '1000',
    });
    expect(mediaTimeFromSourceTicksV1('-4500', {
      numerator: '1', denominator: '90000',
    })).toEqual({ ticks: '-4500', timescale: '90000' });
  });

  it('represents discontinuity epochs without flattening source PTS', () => {
    expect(parsePresentationEpochV1({
      schemaVersion: 1,
      contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
      kind: 'presentation-epoch',
      epochId: 'video-0:epoch-2',
      streamId: 'video-0',
      secondsPerSourceTick: { numerator: '1', denominator: '90000' },
      sourceStartPresentationTimestampTicks: '-9000',
      sourceEndExclusivePresentationTimestampTicks: '180000',
      canonicalStartTime: { ticks: '360000', timescale: '90000' },
      boundaryKind: 'TIMESTAMP_RESET',
    })).toMatchObject({
      epochId: 'video-0:epoch-2',
      sourceStartPresentationTimestampTicks: '-9000',
      boundaryKind: 'TIMESTAMP_RESET',
    });
  });

  it('keeps audio and source/timeline coordinates in their own exact domains', () => {
    expect(parseAudioSampleRangeV1({
      startSampleFrame: '0',
      endExclusiveSampleFrame: '14400000',
      sampleRate: '48000',
    })).toEqual({
      startSampleFrame: '0',
      endExclusiveSampleFrame: '14400000',
      sampleRate: '48000',
    });
    expect(parseSourcePositionV1({
      sourceVersionSha256: 'a'.repeat(64),
      streamId: 'video-0',
      epochId: 'epoch-1',
      presentationTimestampTicks: '-1',
      secondsPerSourceTick: { numerator: '1', denominator: '90000' },
    })).toMatchObject({ presentationTimestampTicks: '-1', epochId: 'epoch-1' });
    expect(parseTimelinePositionV1({
      projectId: 'project-1',
      projectRevision: '9007199254740993',
      sequenceId: 'sequence-main',
      time: { ticks: '1001', timescale: '30000' },
    })).toMatchObject({
      projectRevision: '9007199254740993',
      time: { ticks: '1001', timescale: '30000' },
    });
  });

  it.each([
    ['unreduced rate', () => parseExactRationalRateV1({ numerator: '60000', denominator: '2002' })],
    ['zero rate', () => readCanonicalFrameRateV1(0)],
    ['guessed infinity', () => readCanonicalFrameRateV1(Number.POSITIVE_INFINITY)],
    ['negative zero tick', () => mediaTimeFromSourceTicksV1('-0', { numerator: '1', denominator: '90000' })],
    ['oversized integer', () => parseTimelinePositionV1({
      projectId: 'project-1', projectRevision: '1'.repeat(129), sequenceId: 'main',
      time: { ticks: '0', timescale: '1' },
    })],
    ['reversed audio range', () => parseAudioSampleRangeV1({
      startSampleFrame: '10', endExclusiveSampleFrame: '10', sampleRate: '48000',
    })],
    ['reversed epoch range', () => parsePresentationEpochV1({
      schemaVersion: 1,
      contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
      kind: 'presentation-epoch',
      epochId: 'epoch-1',
      streamId: 'video-0',
      secondsPerSourceTick: { numerator: '1', denominator: '90000' },
      sourceStartPresentationTimestampTicks: '10',
      sourceEndExclusivePresentationTimestampTicks: '10',
      canonicalStartTime: { ticks: '0', timescale: '1' },
      boundaryKind: 'INITIAL',
    })],
  ])('fails loudly for %s', (_label, operation) => {
    expect(operation).toThrow(CanonicalMediaTimeValidationErrorV1);
  });
});
