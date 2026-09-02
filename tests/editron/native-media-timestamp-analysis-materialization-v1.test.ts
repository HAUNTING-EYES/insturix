import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { assertNativeMediaTimestampAnalysisMaterializationV1 }
  from '@/lib/editron/services/native-media-timestamp-analysis-materialization-v1';
import { createNativeMediaTimestampAnalysisSamplePlanV1 }
  from '@/lib/editron/services/native-media-timestamp-analysis-sample-plan-v1';
import type { ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

const PROJECT_REVISION: ProjectRevisionV1 = Object.freeze({
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: '2026-08-31T00:00:00.000Z',
});

describe('native media timestamp analysis materialization V1', () => {
  it('verifies exact scope and permits repeated samples backed by one decoded picture', () => {
    const value = fixture();

    const result = assertNativeMediaTimestampAnalysisMaterializationV1(
      value,
      expectedScope(),
    );

    expect(result).toMatchObject({
      materializedPictureCount: 2,
      samplePlan: { samples: [{ timelineFrame: '300' }, { timelineFrame: '330' }, { timelineFrame: '360' }] },
      analysisReceipt: { frameMap: expect.arrayContaining([
        expect.objectContaining({ sampleIndex: 1, timelineFrame: '330' }),
      ]) },
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects a fully rehashed observation mapped to the wrong timeline frame', () => {
    const value = fixture();
    value.analysisReceipt.observations[0]!.timelineFrame = '360';
    rehash(value);

    expect(() => assertNativeMediaTimestampAnalysisMaterializationV1(
      value,
      expectedScope(),
    )).toThrow('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_OBSERVATION_SCOPE_MISMATCH');
  });

  it('rejects a fully rehashed decoded-picture count that ignores deduplication', () => {
    const value = fixture();
    value.materializedPictureCount = 3;
    rehash(value);

    expect(() => assertNativeMediaTimestampAnalysisMaterializationV1(
      value,
      expectedScope(),
    )).toThrow('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SCOPE_MISMATCH');
  });

  it('rejects expected project revision drift', () => {
    expect(() => assertNativeMediaTimestampAnalysisMaterializationV1(
      fixture(),
      {
        ...expectedScope(),
        projectRevision: { ...PROJECT_REVISION, value: 8 },
      },
    )).toThrow('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_SCOPE_MISMATCH');
  });

  it('rejects unknown root fields even when the known material hash is valid', () => {
    const value = { ...fixture(), unboundAuthority: true };

    expect(() => assertNativeMediaTimestampAnalysisMaterializationV1(
      value,
      expectedScope(),
    )).toThrow('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_FIELDS_INVALID');
  });

  it('rejects a forged nested receipt hash before promotion', () => {
    const value = fixture();
    value.analysisReceipt.receiptSha256 = 'f'.repeat(64);
    value.analysisReceiptSha256 = value.analysisReceipt.receiptSha256;
    rehashRoot(value);

    expect(() => assertNativeMediaTimestampAnalysisMaterializationV1(
      value,
      expectedScope(),
    )).toThrow('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_RECEIPT_HASH_MISMATCH');
  });
});

function fixture() {
  const samplePlan = createNativeMediaTimestampAnalysisSamplePlanV1({
    projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '300',
    timelineEndExclusiveFrame: '390',
    policy: {
      policyVersion: 'TEST_ONE_SECOND_V1',
      sampleIntervalSeconds: { numerator: '1', denominator: '1' },
      maxWindowDurationSeconds: '120',
      maxSampleFrames: 120,
    },
  });
  const requests = ['1'.repeat(64), '1'.repeat(64), '2'.repeat(64)];
  const handles = [`nmpv1_${'3'.repeat(64)}`, `nmpv1_${'3'.repeat(64)}`, `nmpv1_${'4'.repeat(64)}`];
  const analysisReceipt = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_V1' as const,
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: '1',
    projectRevision: PROJECT_REVISION,
    sourceVersionSha256: '5'.repeat(64),
    storageVersionSha256: '6'.repeat(64),
    transformSha256: '7'.repeat(64),
    consumptionReceiptSha256: '8'.repeat(64),
    analysisRequestSha256: '9'.repeat(64),
    engineVersion: 'TEST_EXACT_ENGINE_V1',
    engineOutputSha256: 'a'.repeat(64),
    frameMap: samplePlan.samples.map((sample, sampleIndex) => ({
      sampleIndex,
      timelineFrame: sample.timelineFrame,
      decoderPictureRequestSha256: requests[sampleIndex]!,
      sourceFrameOrdinal: sampleIndex < 2 ? '10' : '11',
      epochId: 'epoch-a',
      presentationTimestampTicks: sampleIndex < 2 ? '10000' : '11000',
      selection: 'COVERING_PRESENTATION' as const,
      pictureHandle: handles[sampleIndex]!,
      decodedPictureContentSha256: sampleIndex < 2 ? 'b'.repeat(64) : 'c'.repeat(64),
      pngContentSha256: sampleIndex < 2 ? 'd'.repeat(64) : 'e'.repeat(64),
      pngByteLength: 128,
      width: 1920,
      height: 1080,
    })),
    observations: [
      {
        kind: 'POINT' as const,
        sampleIndex: 1,
        signal: 'SCENE_CHANGE',
        detail: 'Exact cut',
        timelineFrame: '330',
      },
      {
        kind: 'RANGE' as const,
        startSampleIndex: 1,
        endExclusiveSampleIndex: 3,
        signal: 'DEAD_VISUAL_RANGE',
        detail: 'Static range',
        timelineStartFrame: '330',
        timelineEndExclusiveFrame: '390',
      },
      {
        kind: 'GLOBAL' as const,
        signal: 'SUMMARY',
        detail: 'Interview summary',
        coordinateDisposition: 'NO_RANGE_COORDINATE' as const,
      },
    ],
    receiptSha256: '',
  };
  const { receiptSha256: _receiptSha256, ...receiptMaterial } = analysisReceipt;
  analysisReceipt.receiptSha256 = hashEditronCanonicalJsonV1(receiptMaterial);
  const root = {
    disposition: 'ANALYSIS_MATERIALIZED' as const,
    schemaVersion: 1 as const,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_V1' as const,
    samplePlan,
    analysisReceipt,
    samplePlanSha256: samplePlan.samplePlanSha256,
    analysisReceiptSha256: analysisReceipt.receiptSha256,
    sourcePtsCadenceMapStateSha256V3: 'f'.repeat(64),
    transformSha256: analysisReceipt.transformSha256,
    materializedPictureCount: 2,
    materializationSha256: '',
  };
  rehashRoot(root);
  return root;
}

function expectedScope() {
  return {
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: '1',
    projectRevision: PROJECT_REVISION,
    timelineStartFrame: '300',
    timelineEndExclusiveFrame: '390',
  };
}

function rehash(value: ReturnType<typeof fixture>): void {
  const { receiptSha256: _receiptSha256, ...receiptMaterial } = value.analysisReceipt;
  value.analysisReceipt.receiptSha256 = hashEditronCanonicalJsonV1(receiptMaterial);
  value.analysisReceiptSha256 = value.analysisReceipt.receiptSha256;
  rehashRoot(value);
}

function rehashRoot(value: ReturnType<typeof fixture>): void {
  value.materializationSha256 = hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    kind: value.kind,
    samplePlanSha256: value.samplePlanSha256,
    analysisReceiptSha256: value.analysisReceiptSha256,
    sourcePtsCadenceMapStateSha256V3: value.sourcePtsCadenceMapStateSha256V3,
    transformSha256: value.transformSha256,
    materializedPictureCount: value.materializedPictureCount,
  });
}
