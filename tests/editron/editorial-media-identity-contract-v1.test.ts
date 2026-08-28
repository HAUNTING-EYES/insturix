import { describe, expect, it } from 'vitest';

import {
  EDITORIAL_MEDIA_IDENTITY_CONTRACT_VERSION_V1,
  EditorialMediaIdentityValidationErrorV1,
  parseEditorialMediaIdentityContractV1,
  verifyEditorialMediaIdentityContractV1,
} from '@/lib/editron/contracts/editorial-media-identity-contract-v1';

describe('EditorialMediaIdentityContractV1', () => {
  it('accepts a qualified CFR identity with immutable media, reel, and proxy evidence', () => {
    const identity = parseEditorialMediaIdentityContractV1(qualifiedIdentity());

    expect(identity).toMatchObject({
      status: 'UNWIRED_CONTRACT_ONLY',
      identityStatus: 'QUALIFIED',
      operationEligibility: 'PRECISE_TIMELINE',
      source: {
        cadence: { kind: 'CFR', frameRate: { numerator: '24000', denominator: '1001' } },
        reelTimecode: { reelId: 'A001' },
      },
    });
  });

  it.each([
    ['SOURCE_TIMEBASE_RATE_NOT_REDUCED', (value: ReturnType<typeof qualifiedIdentity>) => {
      value.source.timebase.ticksPerSecond = { numerator: '48000', denominator: '2' };
    }],
    ['SOURCE_RANGE_INVALID', (value: ReturnType<typeof qualifiedIdentity>) => {
      value.source.range = { startTick: '1000', endExclusiveTick: '1000' };
    }],
    ['REEL_TIMECODE_DELIMITER_MISMATCH', (value: ReturnType<typeof qualifiedIdentity>) => {
      value.source.reelTimecode.dropFrame = true;
    }],
    ['PRECISE_OPERATION_PROXY_MAPPING_REQUIRED', (value: ReturnType<typeof qualifiedIdentity>) => {
      value.sourceToProxyMappings = [];
    }],
    ['AUDIO_STREAM_ID_DUPLICATE', (value: ReturnType<typeof qualifiedIdentity>) => {
      value.source.audioStreams.push({ ...value.source.audioStreams[0] });
    }],
  ])('rejects qualified invariant %s', (diagnostic, mutate) => {
    const value = qualifiedIdentity();
    mutate(value);

    expect(verifyEditorialMediaIdentityContractV1(value)).toMatchObject({
      status: 'FAIL',
      diagnostics: expect.arrayContaining([diagnostic]),
    });
  });

  it('preserves qualified rate and PTS integers beyond JavaScript safe range', () => {
    const value = qualifiedIdentity();
    value.source.timebase.ticksPerSecond = {
      numerator: '9007199254740993', denominator: '1',
    };
    value.source.range = {
      startTick: '9007199254740993',
      endExclusiveTick: '90071992547409931234567890',
    };

    expect(parseEditorialMediaIdentityContractV1(value)).toMatchObject({
      source: {
        timebase: { ticksPerSecond: { numerator: '9007199254740993' } },
        range: { endExclusiveTick: '90071992547409931234567890' },
      },
    });
  });

  it('rejects integer text beyond the defensive exact-domain bound', () => {
    const value = qualifiedIdentity();
    value.source.range.endExclusiveTick = '1'.repeat(129);

    expect(verifyEditorialMediaIdentityContractV1(value)).toEqual({
      status: 'FAIL', diagnostics: ['SCHEMA_INVALID'],
    });
  });

  it('requires an explicit PTS mapping for a VFR source', () => {
    const base = qualifiedIdentity();
    const value: unknown = {
      ...base,
      source: {
        ...base.source,
        cadence: {
          kind: 'VFR',
          nominalFrameRate: { numerator: '30000', denominator: '1001' },
          ptsMapping: artifact('source-pts-map', '8'),
        },
      },
      sourceToProxyMappings: [],
    };

    expect(verifyEditorialMediaIdentityContractV1(value)).toMatchObject({
      status: 'FAIL',
      diagnostics: expect.arrayContaining([
        'VFR_PTS_MAPPING_UNBOUND',
        'PRECISE_OPERATION_PROXY_MAPPING_REQUIRED',
      ]),
    });
  });

  it('keeps unqualified legacy media reference-only and rejects a precise-use forgery', () => {
    const legacy = {
      schemaVersion: 1,
      contractVersion: EDITORIAL_MEDIA_IDENTITY_CONTRACT_VERSION_V1,
      kind: 'editorial-media-identity',
      status: 'UNWIRED_CONTRACT_ONLY',
      identityStatus: 'UNQUALIFIED_LEGACY',
      operationEligibility: 'REFERENCE_ONLY',
      legacyMedia: {
        assetId: 'legacy-upload-1',
        fps: 30,
        durationInFrames: 900,
        reasonCodes: ['NO_PROBE_RECEIPT'],
      },
    };

    expect(parseEditorialMediaIdentityContractV1(legacy)).toMatchObject({
      identityStatus: 'UNQUALIFIED_LEGACY',
      operationEligibility: 'REFERENCE_ONLY',
    });
    expect(() => parseEditorialMediaIdentityContractV1({
      ...legacy,
      operationEligibility: 'PRECISE_TIMELINE',
    })).toThrow(EditorialMediaIdentityValidationErrorV1);
  });

  it('rejects raw URLs and other unknown fields rather than turning the contract into a resolver', () => {
    expect(() => parseEditorialMediaIdentityContractV1({
      ...qualifiedIdentity(),
      publicUrl: 'https://example.invalid/source.mov',
    })).toThrow(EditorialMediaIdentityValidationErrorV1);
  });
});

function qualifiedIdentity() {
  return {
    schemaVersion: 1 as const,
    contractVersion: EDITORIAL_MEDIA_IDENTITY_CONTRACT_VERSION_V1,
    kind: 'editorial-media-identity' as const,
    status: 'UNWIRED_CONTRACT_ONLY' as const,
    identityStatus: 'QUALIFIED' as const,
    operationEligibility: 'PRECISE_TIMELINE' as const,
    media: {
      assetId: 'camera-master-1',
      version: 'v1',
      contentDigest: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
      ingestReceipt: artifact('ingest-receipt-1', '1'),
    },
    source: {
      timebase: {
        timebaseId: 'camera-master-1:pts',
        version: 'probe-v1',
        coordinateDomain: 'SOURCE_PTS' as const,
        ticksPerSecond: { numerator: '48000', denominator: '1' },
      },
      range: { startTick: '0', endExclusiveTick: '96000' },
      cadence: {
        kind: 'CFR' as const,
        frameRate: { numerator: '24000', denominator: '1001' },
        frameCount: '48',
      },
      reelTimecode: {
        reelId: 'A001',
        start: '01:00:00:00',
        rate: { numerator: '24000', denominator: '1001' },
        dropFrame: false,
        evidence: artifact('timecode-probe-1', '2'),
      },
      video: {
        codedWidth: 3840,
        codedHeight: 2160,
        pixelAspectRatio: { numerator: '1', denominator: '1' },
        codec: 'prores-422',
        colorPrimaries: 'bt2020',
        transfer: 'arib-std-b67',
        matrix: 'bt2020-ncl',
        range: 'LIMITED' as const,
      },
      audioStreams: [{
        streamId: 'audio-main',
        sampleRate: '48000',
        sampleCount: '96000',
        channelCount: 2,
        channelLayout: 'stereo',
        codec: 'pcm-s24le',
      }],
    },
    sourceToProxyMappings: [{
      proxy: artifact('proxy-1', '3'),
      mappingArtifact: artifact('source-pts-to-proxy-1', '4'),
      coordinateMapping: 'SOURCE_PTS_TO_PROXY_TICK' as const,
    }],
  };
}

function artifact(artifactId: string, digit: string) {
  return {
    artifactId,
    version: 'v1',
    digest: { algorithm: 'sha-256' as const, value: digit.repeat(64) },
  };
}
