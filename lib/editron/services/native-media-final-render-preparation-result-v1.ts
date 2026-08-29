import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import {
  assertNativeMediaFinalRenderPreparationJobInputV1,
  NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1,
  type NativeMediaFinalRenderPreparationJobInputV1,
} from './native-media-final-render-preparation-job-v1';
import {
  createNativeMediaFinalRenderArtifactV1,
  type NativeMediaFinalRenderArtifactV1,
} from './native-media-final-render-source-preparation-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESULT_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESULT_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_TERMINAL_RECEIPT_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_TERMINAL_RECEIPT_V1_1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const OPAQUE_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const PUBLISH_HANDLE = /^nmfrpubv1_([a-f0-9]{64})$/;

export type NativeMediaFinalRenderPreparationResultV1 = Readonly<{
  version: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESULT_VERSION_V1;
  jobInputBindingSha256: string;
  exactSourceRequestSha256: string;
  artifactProfile: typeof NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1;
  publishHandle: string;
  publishHandleSha256: string;
  artifact: NativeMediaFinalRenderArtifactV1;
  resultBindingSha256: string;
}>;

export type NativeMediaFinalRenderPreparationResumeStateV1 = Readonly<{
  schemaId: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1;
  stateSha256: string;
  payload: NativeMediaFinalRenderPreparationResultV1;
}>;

export class NativeMediaFinalRenderPreparationResultErrorV1 extends Error {}

export function createNativeMediaFinalRenderPreparationResultV1(input: Readonly<{
  jobInput: NativeMediaFinalRenderPreparationJobInputV1;
  jobInputBindingSha256: string;
  publishHandle: string;
  artifact: NativeMediaFinalRenderArtifactV1;
}>): NativeMediaFinalRenderPreparationResultV1 {
  const job = boundJobInput(input.jobInput, input.jobInputBindingSha256);
  const artifact = scopedArtifact(input.artifact, job);
  const publishHandle = scopedPublishHandle(input.publishHandle, artifact);
  const material = {
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESULT_VERSION_V1,
    jobInputBindingSha256: sha256(input.jobInputBindingSha256, 'JOB_INPUT_BINDING'),
    exactSourceRequestSha256: job.exactSourceRequestSha256,
    artifactProfile: NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1,
    publishHandle,
    publishHandleSha256: hashEditronCanonicalJsonV1(publishHandle),
    artifact,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    resultBindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNativeMediaFinalRenderPreparationResultV1(
  value: unknown,
  expected: Readonly<{
    jobInput: NativeMediaFinalRenderPreparationJobInputV1;
    jobInputBindingSha256: string;
  }>,
): NativeMediaFinalRenderPreparationResultV1 {
  const record = asRecord(value, 'NATIVE_MEDIA_FINAL_RENDER_RESULT_INVALID');
  exactKeys(record, [
    'artifact', 'artifactProfile', 'exactSourceRequestSha256',
    'jobInputBindingSha256', 'publishHandle', 'publishHandleSha256',
    'resultBindingSha256', 'version',
  ], 'NATIVE_MEDIA_FINAL_RENDER_RESULT_FIELDS_INVALID');
  if (record.version !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESULT_VERSION_V1
    || record.artifactProfile !== NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1) {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_VERSION_INVALID');
  }
  const rebuilt = createNativeMediaFinalRenderPreparationResultV1({
    jobInput: expected.jobInput,
    jobInputBindingSha256: expected.jobInputBindingSha256,
    publishHandle: record.publishHandle as string,
    artifact: normalizeArtifact(record.artifact),
  });
  if (record.jobInputBindingSha256 !== rebuilt.jobInputBindingSha256
    || record.exactSourceRequestSha256 !== rebuilt.exactSourceRequestSha256
    || record.publishHandleSha256 !== rebuilt.publishHandleSha256
    || record.resultBindingSha256 !== rebuilt.resultBindingSha256) {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_BINDING_INVALID');
  }
  return rebuilt;
}

export function createNativeMediaFinalRenderPreparationResumeStateV1(input: Readonly<{
  jobInput: NativeMediaFinalRenderPreparationJobInputV1;
  jobInputBindingSha256: string;
  publishHandle: string;
  artifact: NativeMediaFinalRenderArtifactV1;
}>): NativeMediaFinalRenderPreparationResumeStateV1 {
  const payload = createNativeMediaFinalRenderPreparationResultV1(input);
  return deepFreezeEditronJsonV1({
    schemaId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RESUME_SCHEMA_V1,
    stateSha256: hashDurableWorkflowJobJsonV1(payload),
    payload,
  });
}

export function createNativeMediaFinalRenderPreparationTerminalReceiptV1(input: Readonly<{
  jobId: string;
  operationId: string;
  jobInput: NativeMediaFinalRenderPreparationJobInputV1;
  jobInputBindingSha256: string;
  result: NativeMediaFinalRenderPreparationResultV1;
  executionAuthorizationReceiptSha256: string;
  completedAt: Date;
}>): DurableWorkflowJobTerminalReceiptV1 {
  const result = assertNativeMediaFinalRenderPreparationResultV1(input.result, input);
  const job = boundJobInput(input.jobInput, input.jobInputBindingSha256);
  const completedAt = validDate(input.completedAt);
  const executionAuthorizationReceiptSha256 = sha256(
    input.executionAuthorizationReceiptSha256,
    'EXECUTION_AUTHORIZATION_RECEIPT',
  );
  const proofReferences = Object.freeze([
    proof('execution-budget-authorization', executionAuthorizationReceiptSha256),
    proof('exact-render-artifact', result.artifact.artifactBindingSha256),
    proof('exact-render-result', result.resultBindingSha256),
    proof('runtime-profile-receipt', job.executionProfile.compatibilityReceiptSha256),
  ]);
  const material = {
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_TERMINAL_RECEIPT_VERSION_V1,
    jobId: opaqueIdentity(input.jobId, 'JOB_ID'),
    operationId: opaqueIdentity(input.operationId, 'OPERATION_ID'),
    jobInputBindingSha256: result.jobInputBindingSha256,
    budgetReservationId: job.budgetReservation.reservationId,
    budgetReservationBindingSha256: job.budgetReservation.bindingSha256,
    executionAuthorizationReceiptSha256,
    resultBindingSha256: result.resultBindingSha256,
    proofReferences,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return Object.freeze({
    disposition: 'PASS',
    receiptId: `nmfrprep_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences,
    completedAt,
  });
}

function boundJobInput(
  value: unknown,
  bindingSha256: unknown,
): NativeMediaFinalRenderPreparationJobInputV1 {
  const job = assertNativeMediaFinalRenderPreparationJobInputV1(value);
  const binding = sha256(bindingSha256, 'JOB_INPUT_BINDING');
  if (hashDurableWorkflowJobJsonV1(job) !== binding) {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_JOB_INPUT_BINDING_INVALID');
  }
  return job;
}

function normalizeArtifact(value: unknown): NativeMediaFinalRenderArtifactV1 {
  const record = asRecord(value, 'NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_INVALID');
  exactKeys(record, [
    'artifactBindingSha256', 'artifactByteLength', 'artifactContentSha256',
    'artifactHandle', 'artifactProfile', 'assetId', 'assetTimingStateSha256',
    'audio', 'container', 'contentType', 'decodedFrameSequenceSha256', 'kind',
    'overlayId', 'overlayTimingSha256', 'pixelFormat', 'projectId', 'projectRate',
    'projectRevision', 'remotionCompatibilityReceiptSha256', 'schemaVersion',
    'sequenceId', 'sourceBindingSha256', 'sourcePtsCadenceMapStateSha256V3',
    'sourceVersionSha256', 'storageVersionSha256', 'timelineFrameCount',
    'timelineStartFrame', 'transformSha256', 'videoCodec', 'videoFrameCount',
  ], 'NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_FIELDS_INVALID');
  assertNestedArtifactFields(record);
  const claimedBinding = sha256(record.artifactBindingSha256, 'ARTIFACT_BINDING');
  const { artifactBindingSha256: _binding, ...material } = record;
  let artifact: NativeMediaFinalRenderArtifactV1;
  try {
    artifact = createNativeMediaFinalRenderArtifactV1(
      material as unknown as Omit<NativeMediaFinalRenderArtifactV1, 'artifactBindingSha256'>,
    );
  } catch {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_INVALID');
  }
  if (artifact.artifactBindingSha256 !== claimedBinding) {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_BINDING_INVALID');
  }
  return artifact;
}

function scopedArtifact(
  value: unknown,
  job: NativeMediaFinalRenderPreparationJobInputV1,
): NativeMediaFinalRenderArtifactV1 {
  const artifact = normalizeArtifact(value);
  const request = job.exactSourceRequest;
  if (artifact.projectId !== job.projectId || artifact.sequenceId !== job.sequenceId
    || hashEditronCanonicalJsonV1(artifact.projectRevision)
      !== hashEditronCanonicalJsonV1(job.projectRevision)
    || artifact.overlayId !== request.overlayId || artifact.assetId !== request.assetId
    || artifact.overlayTimingSha256 !== request.overlayTimingSha256
    || artifact.assetTimingStateSha256 !== request.assetTimingStateSha256
    || artifact.sourceVersionSha256 !== request.sourceVersionSha256
    || artifact.storageVersionSha256 !== request.storageVersionSha256
    || artifact.sourceBindingSha256 !== request.sourceBindingSha256
    || artifact.sourcePtsCadenceMapStateSha256V3
      !== request.sourcePtsCadenceMapStateSha256V3
    || artifact.remotionCompatibilityReceiptSha256
      !== job.executionProfile.compatibilityReceiptSha256
    || artifact.artifactHandle !== `nmfrv1_${artifact.artifactContentSha256}`
    || artifact.container !== 'matroska' || artifact.videoCodec !== 'h264'
    || artifact.pixelFormat !== 'gbrp' || artifact.contentType !== 'video/x-matroska'
    || artifact.videoFrameCount !== artifact.timelineFrameCount
    || (request.renderNativeAudio
      ? artifact.audio.disposition !== 'EMBEDDED_EXACT_NATIVE_PCM'
      : artifact.audio.disposition !== 'NO_AUDIO_MAPPING_REQUESTED')) {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_SCOPE_INVALID');
  }
  return artifact;
}

function assertNestedArtifactFields(record: Record<string, unknown>): void {
  exactKeys(asRecord(record.projectRevision,
    'NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_REVISION_INVALID'),
  ['compatibilityUpdatedAt', 'schemaVersion', 'value'],
  'NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_REVISION_FIELDS_INVALID');
  exactKeys(asRecord(record.projectRate,
    'NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_RATE_INVALID'),
  ['denominator', 'numerator'],
  'NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_RATE_FIELDS_INVALID');
  exactKeys(asRecord(record.audio,
    'NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_AUDIO_INVALID'), [
    'artifactDecodedPcmSha256', 'audioCodec', 'audioMappingSha256', 'channelCount',
    'decodedPcmEquivalenceReceiptSha256', 'decodedSampleFrameCount', 'disposition',
    'sampleRate', 'sourceDecodedPcmSha256',
  ], 'NATIVE_MEDIA_FINAL_RENDER_RESULT_ARTIFACT_AUDIO_FIELDS_INVALID');
}

function scopedPublishHandle(
  value: unknown,
  artifact: NativeMediaFinalRenderArtifactV1,
): string {
  if (typeof value !== 'string') {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_PUBLISH_HANDLE_INVALID');
  }
  const match = PUBLISH_HANDLE.exec(value);
  if (!match || match[1] !== artifact.artifactContentSha256) {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_PUBLISH_HANDLE_INVALID');
  }
  return value;
}

function proof(proofId: string, proofSha256: string) {
  return Object.freeze({ proofId, proofSha256: sha256(proofSha256, 'PROOF'),
    disposition: 'PASS' as const });
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], code: string) {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) fail(code);
}

function opaqueIdentity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!OPAQUE_IDENTITY.test(normalized)) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_RESULT_${label}_INVALID`);
  }
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_RESULT_${label}_SHA256_INVALID`);
  }
  return value;
}

function validDate(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail('NATIVE_MEDIA_FINAL_RENDER_RESULT_COMPLETED_AT_INVALID');
  }
  return new Date(value.getTime());
}

function fail(code: string): never {
  throw new NativeMediaFinalRenderPreparationResultErrorV1(code);
}
