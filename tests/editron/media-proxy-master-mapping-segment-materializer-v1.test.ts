import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaProxyMasterMappingSegmentMaterializationReceiptV1,
  createMediaProxyMasterMappingSegmentMaterializationPolicyV1,
  materializeMediaProxyMasterMappingSegmentsV1,
} from '@/lib/editron/services/media-proxy-master-mapping-segment-materializer-v1';
import {
  createSharedResetMappingSegmentFixtureV1,
  createUnequalRateMappingSegmentFixtureV1,
  createUnrepresentableEpochMappingSegmentFixtureV1,
  createVariableCadenceMappingSegmentFixtureV1,
  fixtureSha256V1,
  type MediaProxyMasterMappingSegmentFixtureV1,
} from './helpers/media-proxy-master-mapping-segment-fixture';

describe('MediaProxyMasterMappingSegmentMaterializerV1', () => {
  it('materializes one exact unequal-rate segment from complete paged V3 windows', async () => {
    const fixture = createUnequalRateMappingSegmentFixtureV1();

    const result = await materializeMediaProxyMasterMappingSegmentsV1(
      request(fixture),
    );

    expect(result).toMatchObject({
      disposition: 'MAPPING_SEGMENTS_MATERIALIZED',
      totalPageReads: 3,
      totalFrameRecords: 5,
      totalSelectedBatchBytes: 320,
      canonicalEndExclusiveTime: time(1),
    });
    if (result.disposition !== 'MAPPING_SEGMENTS_MATERIALIZED') {
      throw new Error('TEST_EXPECTED_MAPPING_SEGMENTS');
    }
    expect(result.proxyPages).toMatchObject([
      { sequence: 0, firstFrameOrdinal: '0', endExclusiveFrameOrdinal: '2' },
      { sequence: 1, firstFrameOrdinal: '2', endExclusiveFrameOrdinal: '3' },
    ]);
    expect(result.masterPages).toMatchObject([
      { sequence: 0, firstFrameOrdinal: '0', endExclusiveFrameOrdinal: '2' },
    ]);
    expect(result.segments).toEqual([{
      sequence: 0,
      canonicalStartTime: time(0),
      canonicalEndExclusiveTime: time(1),
      proxyStart: {
        sourceVersionSha256: fixtureSha256V1('proxy-source'),
        streamId: 'video-0',
        epochId: 'proxy-epoch-0',
        presentationTimestampTicks: '0',
        secondsPerSourceTick: { numerator: '1', denominator: '6' },
      },
      proxyEndExclusive: {
        sourceVersionSha256: fixtureSha256V1('proxy-source'),
        streamId: 'video-0',
        epochId: 'proxy-epoch-0',
        presentationTimestampTicks: '6',
        secondsPerSourceTick: { numerator: '1', denominator: '6' },
      },
      proxyFirstFrameOrdinal: '0',
      proxyEndExclusiveFrameOrdinal: '3',
      masterStart: {
        sourceVersionSha256: fixtureSha256V1('master-source'),
        streamId: 'video-0',
        epochId: 'master-epoch-0',
        presentationTimestampTicks: '0',
        secondsPerSourceTick: { numerator: '1', denominator: '6' },
      },
      masterEndExclusive: {
        sourceVersionSha256: fixtureSha256V1('master-source'),
        streamId: 'video-0',
        epochId: 'master-epoch-0',
        presentationTimestampTicks: '6',
        secondsPerSourceTick: { numerator: '1', denominator: '6' },
      },
      masterFirstFrameOrdinal: '0',
      masterEndExclusiveFrameOrdinal: '2',
    }]);
    expect(assertMediaProxyMasterMappingSegmentMaterializationReceiptV1(
      result,
      fixture.derivationReceipt,
    )).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('materializes measured variable cadence without nominal-FPS inference', async () => {
    const fixture = createVariableCadenceMappingSegmentFixtureV1();

    const result = await materializeMediaProxyMasterMappingSegmentsV1(
      request(fixture),
    );

    expect(result).toMatchObject({
      disposition: 'MAPPING_SEGMENTS_MATERIALIZED',
      totalPageReads: 4,
      totalFrameRecords: 6,
      canonicalEndExclusiveTime: time(1),
      segments: [{
        sequence: 0,
        canonicalStartTime: time(0),
        canonicalEndExclusiveTime: time(1),
        proxyFirstFrameOrdinal: '0',
        proxyEndExclusiveFrameOrdinal: '3',
        masterFirstFrameOrdinal: '0',
        masterEndExclusiveFrameOrdinal: '3',
      }],
    });
  });

  it('splits shared timestamp resets into exact epoch-safe segments', async () => {
    const fixture = createSharedResetMappingSegmentFixtureV1();

    const result = await materializeMediaProxyMasterMappingSegmentsV1(
      request(fixture),
    );

    expect(result).toMatchObject({
      disposition: 'MAPPING_SEGMENTS_MATERIALIZED',
      canonicalEndExclusiveTime: time(2),
      segments: [
        {
          sequence: 0,
          canonicalStartTime: time(0),
          canonicalEndExclusiveTime: time(1),
          proxyStart: {
            epochId: 'proxy-epoch-0',
            presentationTimestampTicks: '10',
          },
          proxyEndExclusive: {
            epochId: 'proxy-epoch-0',
            presentationTimestampTicks: '12',
          },
        },
        {
          sequence: 1,
          canonicalStartTime: time(1),
          canonicalEndExclusiveTime: time(2),
          proxyStart: {
            epochId: 'proxy-epoch-1',
            presentationTimestampTicks: '-2',
          },
          proxyEndExclusive: {
            epochId: 'proxy-epoch-1',
            presentationTimestampTicks: '0',
          },
        },
      ],
    });
  });

  it('rejects an epoch boundary inside the other source frame without approximation', async () => {
    const fixture = createUnrepresentableEpochMappingSegmentFixtureV1();

    await expect(materializeMediaProxyMasterMappingSegmentsV1(
      request(fixture),
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'UNREPRESENTABLE_EPOCH_BOUNDARY',
      sourceRole: 'PROXY',
      failedFrameOrdinal: '1',
      diagnostic: null,
    });
  });

  it('rejects a self-consistent window bound to another source identity', async () => {
    const fixture = createUnequalRateMappingSegmentFixtureV1();
    const readWindow: typeof fixture.readWindow = async (input) => {
      const result = await fixture.readWindow(input);
      if (result.disposition === 'UNVERIFIABLE'
        || result.assetId !== 'proxy-asset') return result;
      const {
        presentationWindowEvidenceSha256: previousEvidenceSha256,
        ...material
      } = result;
      void previousEvidenceSha256;
      const substituted = {
        ...material,
        sourceVersionSha256: fixtureSha256V1('substituted-proxy-source'),
      };
      return {
        ...substituted,
        presentationWindowEvidenceSha256:
          hashEditronCanonicalJsonV1(substituted),
      };
    };

    await expect(materializeMediaProxyMasterMappingSegmentsV1({
      ...request(fixture),
      readWindow,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'WINDOW_EVIDENCE_REJECTED',
      sourceRole: 'PROXY',
      failedFrameOrdinal: '0',
      diagnostic: null,
    });
  });

  it('enforces page and segment budgets before publishing a receipt', async () => {
    const unequal = createUnequalRateMappingSegmentFixtureV1();
    const readWindow = vi.fn(unequal.readWindow);
    await expect(materializeMediaProxyMasterMappingSegmentsV1({
      ...request(unequal, policy({ maxPageReads: 2 })),
      readWindow,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'RESOURCE_LIMIT_EXCEEDED',
      sourceRole: null,
      failedFrameOrdinal: null,
      diagnostic: null,
    });
    expect(readWindow).not.toHaveBeenCalled();

    const reset = createSharedResetMappingSegmentFixtureV1();
    await expect(materializeMediaProxyMasterMappingSegmentsV1(
      request(reset, policy({ maxSegments: 1 })),
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SEGMENT_LIMIT_EXCEEDED',
    });
  });

  it.each(['THROWN', 'REPORTED'] as const)(
    'classifies %s private-window outages as retryable',
    async (mode) => {
      const fixture = createUnequalRateMappingSegmentFixtureV1();
      const readWindow: typeof fixture.readWindow = async (input) => {
        const role = (input.asset as { fixtureRole?: unknown }).fixtureRole;
        if (role !== 'master') return fixture.readWindow(input);
        if (mode === 'THROWN') throw new Error('TEST_WINDOW_OFFLINE');
        return {
          disposition: 'UNVERIFIABLE',
          reason: 'WINDOW_BATCH_READ_FAILED',
          failedObjectKey: 'private/test/master-window.json',
          failedBatchSequence: 0,
          diagnostic: null,
        };
      };

      await expect(materializeMediaProxyMasterMappingSegmentsV1({
        ...request(fixture),
        readWindow,
      })).resolves.toEqual({
        disposition: 'RETRYABLE',
        reason: 'WINDOW_READER_UNAVAILABLE',
        sourceRole: 'MASTER',
        failedFrameOrdinal: '0',
        diagnostic: mode === 'THROWN'
          ? 'TEST_WINDOW_OFFLINE' : 'WINDOW_BATCH_READ_FAILED',
      });
    },
  );

  it('rejects nested source-scope and page-coverage receipt tampering', async () => {
    const fixture = createUnequalRateMappingSegmentFixtureV1();
    const result = await materializeMediaProxyMasterMappingSegmentsV1(
      request(fixture),
    );
    if (result.disposition !== 'MAPPING_SEGMENTS_MATERIALIZED') {
      throw new Error('TEST_EXPECTED_MAPPING_SEGMENTS');
    }

    const wrongSource = structuredClone(result) as unknown as {
      segments: Array<{ proxyStart: { sourceVersionSha256: string } }>;
    };
    wrongSource.segments[0]!.proxyStart.sourceVersionSha256 =
      fixtureSha256V1('wrong-receipt-source');
    expect(() => assertMediaProxyMasterMappingSegmentMaterializationReceiptV1(
      wrongSource,
      fixture.derivationReceipt,
    )).toThrow('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_PROXY_SCOPE_MISMATCH');

    const pageGap = structuredClone(result) as unknown as {
      proxyPages: Array<{ firstFrameOrdinal: string }>;
    };
    pageGap.proxyPages[1]!.firstFrameOrdinal = '1';
    expect(() => assertMediaProxyMasterMappingSegmentMaterializationReceiptV1(
      pageGap,
      fixture.derivationReceipt,
    )).toThrow('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_RECEIPT_PROXY_PAGE_COVERAGE_INVALID');
  });
});

type PolicyInputV1 = Parameters<
  typeof createMediaProxyMasterMappingSegmentMaterializationPolicyV1
>[0];

function policy(overrides: Partial<PolicyInputV1> = {}) {
  return createMediaProxyMasterMappingSegmentMaterializationPolicyV1({
    policyVersion: 'mapping-segment-materialization-policy-v1',
    pageFrameRecords: 2,
    maxPageReads: 10,
    maxSegments: 10,
    maxTotalFrameRecords: 100,
    maxTotalSelectedBatchBytes: 1024 * 1024,
    ...overrides,
  });
}

function request(
  fixture: MediaProxyMasterMappingSegmentFixtureV1,
  materializationPolicy = policy(),
) {
  return {
    derivationReceipt: fixture.derivationReceipt,
    proxy: fixture.proxy,
    master: fixture.master,
    materializationPolicy,
    readWindow: fixture.readWindow,
  };
}

function time(ticks: number) {
  return { ticks: String(ticks), timescale: '1' };
}
