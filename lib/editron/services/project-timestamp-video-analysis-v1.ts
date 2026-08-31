import {
  assertNativeMediaTimestampAnalysisMaterializationV1,
  type NativeMediaTimestampAnalysisMaterializationV1,
} from './native-media-timestamp-analysis-materialization-v1';
import {
  analysisNonNegativeIntegerText,
  analysisObjectRecord,
  analysisProjectRevision,
  analysisSha256,
  analysisText,
} from './native-media-timestamp-analysis-validation-v1';
import {
  mapVerifiedNativeMediaTimestampAnalysisVisionV1,
  type NativeMediaTimestampAnalysisVisionV1,
} from './native-media-timestamp-analysis-vision-v1';
import type {
  NativeMediaTimestampAnalysisMaterializerInputV1,
} from './native-media-timestamp-preview-materializer-v1';
import type { ProjectRevisionV1 } from './project-service';
import type { VerifiedVideoSourceEpochTimeBindingV3 }
  from './video-source-time-transform-v1';

export type ProjectTimestampVideoAnalysisPortsV1 = Readonly<{
  materialize(
    input: NativeMediaTimestampAnalysisMaterializerInputV1,
  ): Promise<unknown>;
}>;

export type ProjectTimestampVideoAnalysisResultV1 = Readonly<
  | {
      disposition: 'ANALYZED';
      sourceVersionSha256: string;
      storageVersionSha256: string;
      sourcePtsCadenceMapStateSha256V3: string;
      materialization: NativeMediaTimestampAnalysisMaterializationV1;
      vision: NativeMediaTimestampAnalysisVisionV1;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'INPUT_INVALID'
        | 'MATERIALIZATION_UNAVAILABLE'
        | 'MATERIALIZATION_UNVERIFIABLE'
        | 'EXACT_TIMESTAMP_SOURCE_REQUIRED'
        | 'MATERIALIZATION_INVALID'
        | 'SELECTED_SOURCE_SCOPE_MISMATCH'
        | 'VISION_MAPPING_INVALID';
      diagnostic: string | null;
    }
>;

export async function analyzeProjectTimestampVideoV1(input: Readonly<{
  userId: string;
  projectId: string;
  sequenceId: string;
  overlayId: string | number;
  projectRevision: ProjectRevisionV1;
  overlayFromFrame: number;
  overlayDurationInFrames: number;
  selectedSource: Pick<
    VerifiedVideoSourceEpochTimeBindingV3,
    | 'sourceVersionSha256'
    | 'storageVersionSha256'
    | 'sourcePtsCadenceMapStateSha256V3'
  >;
  ports: ProjectTimestampVideoAnalysisPortsV1;
}>): Promise<ProjectTimestampVideoAnalysisResultV1> {
  let scope: ReturnType<typeof normalizeScope>;
  try {
    scope = normalizeScope(input);
  } catch (error) {
    return unverifiable('INPUT_INVALID', diagnostic(error));
  }
  if (!input.ports || typeof input.ports.materialize !== 'function') {
    return unverifiable(
      'INPUT_INVALID',
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_PORT_INVALID',
    );
  }

  let raw: unknown;
  try {
    raw = await input.ports.materialize({
      userId: scope.userId,
      projectId: scope.projectId,
      sequenceId: scope.sequenceId,
      overlayId: scope.overlayId,
      expectedProjectRevision: scope.projectRevision,
      windowLocalStartFrame: 0,
      windowDurationInFrames: scope.overlayDurationInFrames,
      deliveryContract: 'ANALYSIS_RECEIPT_V1',
    });
  } catch (error) {
    return unverifiable('MATERIALIZATION_UNAVAILABLE', diagnostic(error));
  }
  let record: Record<string, unknown>;
  try {
    record = analysisObjectRecord(
      raw,
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_MATERIALIZATION_INVALID',
    );
  } catch (error) {
    return unverifiable('MATERIALIZATION_INVALID', diagnostic(error));
  }
  if (record.disposition === 'UNVERIFIABLE') {
    return unverifiable(
      'MATERIALIZATION_UNVERIFIABLE',
      diagnosticCode(record.reason),
    );
  }
  if (record.disposition === 'NOT_APPLICABLE') {
    return unverifiable(
      'EXACT_TIMESTAMP_SOURCE_REQUIRED',
      diagnosticCode(record.reason),
    );
  }
  if (record.disposition !== 'ANALYSIS_MATERIALIZED') {
    return unverifiable(
      'MATERIALIZATION_INVALID',
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_DISPOSITION_INVALID',
    );
  }

  let materialization: NativeMediaTimestampAnalysisMaterializationV1;
  try {
    materialization = assertNativeMediaTimestampAnalysisMaterializationV1(
      raw,
      {
        projectId: scope.projectId,
        sequenceId: scope.sequenceId,
        overlayId: scope.overlayId,
        projectRevision: scope.projectRevision,
        timelineStartFrame: scope.timelineStartFrame,
        timelineEndExclusiveFrame: scope.timelineEndExclusiveFrame,
      },
    );
  } catch (error) {
    return unverifiable('MATERIALIZATION_INVALID', diagnostic(error));
  }
  if (materialization.analysisReceipt.sourceVersionSha256
      !== scope.sourceVersionSha256
    || materialization.analysisReceipt.storageVersionSha256
      !== scope.storageVersionSha256
    || materialization.sourcePtsCadenceMapStateSha256V3
      !== scope.sourcePtsCadenceMapStateSha256V3) {
    return unverifiable('SELECTED_SOURCE_SCOPE_MISMATCH', null);
  }
  try {
    return Object.freeze({
      disposition: 'ANALYZED' as const,
      sourceVersionSha256: scope.sourceVersionSha256,
      storageVersionSha256: scope.storageVersionSha256,
      sourcePtsCadenceMapStateSha256V3:
        scope.sourcePtsCadenceMapStateSha256V3,
      materialization,
      vision: mapVerifiedNativeMediaTimestampAnalysisVisionV1(materialization),
    });
  } catch (error) {
    return unverifiable('VISION_MAPPING_INVALID', diagnostic(error));
  }
}

function normalizeScope(input: Parameters<
  typeof analyzeProjectTimestampVideoV1
>[0]) {
  const overlayFromFrame = safeFrame(
    input.overlayFromFrame,
    false,
    'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_WINDOW_INVALID',
  );
  const overlayDurationInFrames = safeFrame(
    input.overlayDurationInFrames,
    true,
    'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_WINDOW_INVALID',
  );
  const end = overlayFromFrame + overlayDurationInFrames;
  if (!Number.isSafeInteger(end)) {
    throw new Error('PROJECT_TIMESTAMP_VIDEO_ANALYSIS_WINDOW_INVALID');
  }
  return {
    userId: analysisText(
      input.userId, 256, 'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_SCOPE_INVALID',
    ),
    projectId: analysisText(
      input.projectId, 256, 'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_SCOPE_INVALID',
    ),
    sequenceId: analysisText(
      input.sequenceId, 256, 'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_SCOPE_INVALID',
    ),
    overlayId: analysisText(
      String(input.overlayId), 256,
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_SCOPE_INVALID',
    ),
    projectRevision: analysisProjectRevision(input.projectRevision),
    overlayDurationInFrames,
    timelineStartFrame: analysisNonNegativeIntegerText(
      String(overlayFromFrame),
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_WINDOW_INVALID',
    ),
    timelineEndExclusiveFrame: analysisNonNegativeIntegerText(
      String(end),
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_WINDOW_INVALID',
    ),
    sourceVersionSha256: analysisSha256(
      input.selectedSource?.sourceVersionSha256,
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_SOURCE_INVALID',
    ),
    storageVersionSha256: analysisSha256(
      input.selectedSource?.storageVersionSha256,
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_SOURCE_INVALID',
    ),
    sourcePtsCadenceMapStateSha256V3: analysisSha256(
      input.selectedSource?.sourcePtsCadenceMapStateSha256V3,
      'PROJECT_TIMESTAMP_VIDEO_ANALYSIS_SOURCE_INVALID',
    ),
  };
}

function safeFrame(value: unknown, positive: boolean, code: string): number {
  if (!Number.isSafeInteger(value)
    || Number(value) < (positive ? 1 : 0)) {
    throw new Error(code);
  }
  return Number(value);
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error ? diagnosticCode(error.message) : null;
}

function diagnosticCode(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9_:.-]{1,240}$/.test(value)
    ? value
    : null;
}

function unverifiable(
  reason: Extract<
    ProjectTimestampVideoAnalysisResultV1,
    { disposition: 'UNVERIFIABLE' }
  >['reason'],
  diagnosticValue: string | null,
): ProjectTimestampVideoAnalysisResultV1 {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    diagnostic: diagnosticValue,
  });
}
