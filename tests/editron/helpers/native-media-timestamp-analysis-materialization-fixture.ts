import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { createNativeMediaTimestampAnalysisSamplePlanV1 }
  from '@/lib/editron/services/native-media-timestamp-analysis-sample-plan-v1';
import type { ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';

export const TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1: ProjectRevisionV1 =
  Object.freeze({
    schemaVersion: 1,
    value: 7,
    compatibilityUpdatedAt: '2026-08-31T00:00:00.000Z',
  });

export function buildNativeMediaTimestampAnalysisMaterializationFixtureV1(
  overrides: Readonly<{
    projectId?: string;
    sequenceId?: string;
    overlayId?: string;
    projectRevision?: ProjectRevisionV1;
    timelineStartFrame?: string;
    timelineEndExclusiveFrame?: string;
    sourceVersionSha256?: string;
    storageVersionSha256?: string;
    transformSha256?: string;
    sourcePtsCadenceMapStateSha256V3?: string;
    repeatFirstPicture?: boolean;
  }> = {},
) {
  const samplePlan = createNativeMediaTimestampAnalysisSamplePlanV1({
    projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: overrides.timelineStartFrame ?? '300',
    timelineEndExclusiveFrame: overrides.timelineEndExclusiveFrame ?? '390',
    policy: {
      policyVersion: 'TEST_ONE_SECOND_V1',
      sampleIntervalSeconds: { numerator: '1', denominator: '1' },
      maxWindowDurationSeconds: '120',
      maxSampleFrames: 120,
    },
  });
  const frameMap = samplePlan.samples.map((sample, sampleIndex) => {
    const pictureIndex = overrides.repeatFirstPicture && sampleIndex === 1
      ? 0
      : sampleIndex;
    return {
      sampleIndex,
      timelineFrame: sample.timelineFrame,
      decoderPictureRequestSha256: fixtureSha256(pictureIndex + 1),
      sourceFrameOrdinal: String(pictureIndex + 10),
      epochId: 'epoch-a',
      presentationTimestampTicks: String(pictureIndex + 1000),
      selection: 'COVERING_PRESENTATION' as const,
      pictureHandle: `nmpv1_${fixtureSha256(pictureIndex + 4)}`,
      decodedPictureContentSha256: fixtureSha256(pictureIndex + 7),
      pngContentSha256: fixtureSha256(pictureIndex + 10),
      pngByteLength: 128,
      width: 1920,
      height: 1080,
    };
  });
  const analysisReceipt = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_RECEIPT_V1' as const,
    projectId: overrides.projectId ?? 'project-1',
    sequenceId: overrides.sequenceId ?? 'main',
    overlayId: overrides.overlayId ?? '1',
    projectRevision: overrides.projectRevision
      ?? TIMESTAMP_ANALYSIS_PROJECT_REVISION_FIXTURE_V1,
    sourceVersionSha256: overrides.sourceVersionSha256 ?? '5'.repeat(64),
    storageVersionSha256: overrides.storageVersionSha256 ?? '6'.repeat(64),
    transformSha256: overrides.transformSha256 ?? '7'.repeat(64),
    consumptionReceiptSha256: '8'.repeat(64),
    analysisRequestSha256: '9'.repeat(64),
    engineVersion: 'TEST_EXACT_ENGINE_V1',
    engineOutputSha256: 'a'.repeat(64),
    frameMap,
    observations: [
      {
        kind: 'POINT' as const,
        sampleIndex: Math.min(1, samplePlan.samples.length - 1),
        signal: 'SCENE_CHANGE',
        detail: 'Exact cut',
        timelineFrame: samplePlan.samples[Math.min(1, samplePlan.samples.length - 1)]!
          .timelineFrame,
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
  const uniquePictures = new Set(
    frameMap.map((frame) => frame.decoderPictureRequestSha256),
  ).size;
  const root = {
    disposition: 'ANALYSIS_MATERIALIZED' as const,
    schemaVersion: 1 as const,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_MATERIALIZATION_V1' as const,
    samplePlan,
    analysisReceipt,
    samplePlanSha256: samplePlan.samplePlanSha256,
    analysisReceiptSha256: '',
    sourcePtsCadenceMapStateSha256V3:
      overrides.sourcePtsCadenceMapStateSha256V3 ?? 'f'.repeat(64),
    transformSha256: analysisReceipt.transformSha256,
    materializedPictureCount: uniquePictures,
    materializationSha256: '',
  };
  rehashNativeMediaTimestampAnalysisMaterializationFixtureV1(root);
  return root;
}

export function rehashNativeMediaTimestampAnalysisMaterializationFixtureV1(
  value: ReturnType<
    typeof buildNativeMediaTimestampAnalysisMaterializationFixtureV1
  >,
): void {
  const { receiptSha256: _receiptSha256, ...receiptMaterial } =
    value.analysisReceipt;
  value.analysisReceipt.receiptSha256 =
    hashEditronCanonicalJsonV1(receiptMaterial);
  value.analysisReceiptSha256 = value.analysisReceipt.receiptSha256;
  value.materializationSha256 = hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    kind: value.kind,
    samplePlanSha256: value.samplePlanSha256,
    analysisReceiptSha256: value.analysisReceiptSha256,
    sourcePtsCadenceMapStateSha256V3:
      value.sourcePtsCadenceMapStateSha256V3,
    transformSha256: value.transformSha256,
    materializedPictureCount: value.materializedPictureCount,
  });
}

function fixtureSha256(value: number): string {
  return value.toString(16).padStart(64, '0');
}
