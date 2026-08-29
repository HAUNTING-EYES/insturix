import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import { hashDurableWorkflowJobJsonV1 } from './durable-workflow-job-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
} from './native-media-final-render-ffmpeg-encoder-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
} from './native-media-final-render-materializer-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 } from './native-media-final-render-profile-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
} from './native-media-final-render-r2-private-artifact-v1';
import type {
  NativeMediaFinalRenderExactSourceRequestV1,
} from './native-media-final-render-source-preparation-v1';
import type { ProjectRevisionV1 } from './project-service';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1 =
  'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1' as const;

const DURABLE_JOB_MAX_JSON_PAYLOAD_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const DURABLE_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;

export type NativeMediaFinalRenderPreparationPolicyBindingsV1 = Readonly<{
  materializerPolicyVersion: typeof NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1;
  materializerPolicySha256: string;
  encoderPolicyVersion: typeof NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1;
  encoderPolicySha256: string;
  privateArtifactPolicyVersion:
    typeof NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1;
  privateArtifactPolicySha256: string;
}>;

export type NativeMediaFinalRenderPreparationExecutionProfileV1 = Readonly<{
  workerImageDigest: string;
  compatibilityProfileVersion: typeof NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1;
  compatibilityReceiptSha256: string;
}>;

export type NativeMediaFinalRenderPreparationJobInputV1 = Readonly<{
  version: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1;
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  sequenceId: string;
  projectRevision: ProjectRevisionV1;
  admissionReceiptSha256: string;
  exactSourceRequests: readonly NativeMediaFinalRenderExactSourceRequestV1[];
  exactSourceRequestsSha256: string;
  artifactProfile: typeof NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1;
  policyBindings: NativeMediaFinalRenderPreparationPolicyBindingsV1;
  executionProfile: NativeMediaFinalRenderPreparationExecutionProfileV1;
}>;

export class NativeMediaFinalRenderPreparationJobBindingErrorV1 extends Error {}

export function buildNativeMediaFinalRenderPreparationJobContractV1(input: Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  sequenceId: string;
  projectRevision: ProjectRevisionV1;
  admissionReceiptSha256: string;
  exactSourceRequests: readonly NativeMediaFinalRenderExactSourceRequestV1[];
  policyBindings: NativeMediaFinalRenderPreparationPolicyBindingsV1;
  executionProfile: NativeMediaFinalRenderPreparationExecutionProfileV1;
}>) {
  const requests = normalizeRequests(input.exactSourceRequests);
  const payload = assertNativeMediaFinalRenderPreparationJobInputV1({
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
    tenantId: input.tenantId,
    userId: input.userId,
    orgId: input.orgId,
    projectId: input.projectId,
    sequenceId: input.sequenceId,
    projectRevision: input.projectRevision,
    admissionReceiptSha256: input.admissionReceiptSha256,
    exactSourceRequests: requests,
    exactSourceRequestsSha256: hashEditronCanonicalJsonV1(requests),
    artifactProfile: NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1,
    policyBindings: input.policyBindings,
    executionProfile: input.executionProfile,
  });
  const bindingSha256 = hashDurableWorkflowJobJsonV1(payload);
  const operationSha256 = hashDurableWorkflowJobJsonV1({
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
    bindingSha256,
  });
  const dependencies = [
    dependency('admission-receipt', '1', payload.admissionReceiptSha256),
    dependency('encoder-policy', '1', payload.policyBindings.encoderPolicySha256),
    dependency('exact-source-requests', '1', payload.exactSourceRequestsSha256),
    dependency('materializer-policy', '1', payload.policyBindings.materializerPolicySha256),
    dependency('private-artifact-policy', '1', payload.policyBindings.privateArtifactPolicySha256),
    dependency('project-revision', '1', hashEditronCanonicalJsonV1(payload.projectRevision)),
    dependency('runtime-profile-receipt', '1',
      payload.executionProfile.compatibilityReceiptSha256),
    dependency('worker-image', '1',
      hashEditronCanonicalJsonV1(payload.executionProfile.workerImageDigest)),
  ].sort((left, right) => left.dependencyId < right.dependencyId ? -1 : 1);
  return deepFreezeEditronJsonV1({
    payload,
    bindingSha256,
    dependencies,
    operationIdentity: `nmfrprep_${operationSha256}`,
  });
}

export function assertNativeMediaFinalRenderPreparationJobInputV1(
  value: unknown,
): NativeMediaFinalRenderPreparationJobInputV1 {
  const record = asRecord(value, 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_INVALID');
  exactKeys(record, [
    'admissionReceiptSha256', 'artifactProfile', 'exactSourceRequests',
    'exactSourceRequestsSha256', 'executionProfile', 'orgId', 'policyBindings',
    'projectId', 'projectRevision', 'sequenceId', 'tenantId', 'userId', 'version',
  ], 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_FIELDS_INVALID');
  if (record.version !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1
    || record.artifactProfile !== NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_VERSION_INVALID');
  }
  const requests = normalizeRequests(record.exactSourceRequests);
  const exactSourceRequestsSha256 = hashEditronCanonicalJsonV1(requests);
  if (record.exactSourceRequestsSha256 !== exactSourceRequestsSha256) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REQUESTS_HASH_INVALID');
  }
  const normalized = {
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
    tenantId: durableIdentity(record.tenantId, 'TENANT_ID'),
    userId: durableIdentity(record.userId, 'USER_ID'),
    orgId: record.orgId === null ? null : durableIdentity(record.orgId, 'ORG_ID'),
    projectId: durableIdentity(record.projectId, 'PROJECT_ID'),
    sequenceId: durableIdentity(record.sequenceId, 'SEQUENCE_ID'),
    projectRevision: normalizeRevision(record.projectRevision),
    admissionReceiptSha256: sha256(record.admissionReceiptSha256, 'ADMISSION_RECEIPT'),
    exactSourceRequests: requests,
    exactSourceRequestsSha256,
    artifactProfile: NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PROFILE_V1,
    policyBindings: normalizePolicyBindings(record.policyBindings),
    executionProfile: normalizeExecutionProfile(record.executionProfile),
  } satisfies NativeMediaFinalRenderPreparationJobInputV1;
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8')
    > DURABLE_JOB_MAX_JSON_PAYLOAD_BYTES) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_PAYLOAD_TOO_LARGE');
  }
  return deepFreezeEditronJsonV1(normalized);
}

function normalizeRequests(value: unknown): readonly NativeMediaFinalRenderExactSourceRequestV1[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REQUESTS_INVALID');
  }
  const seen = new Set<string>();
  const requests = value.map((candidate) => {
    const record = asRecord(
      candidate,
      'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REQUEST_INVALID',
    );
    exactKeys(record, [
      'assetId', 'assetTimingStateSha256', 'overlayId', 'overlayTimingSha256',
      'renderNativeAudio', 'sourceBindingSha256', 'sourcePtsCadenceMapStateSha256V3',
      'sourceVersionSha256', 'storageVersionSha256',
    ], 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REQUEST_FIELDS_INVALID');
    const overlayId = boundedIdentifier(record.overlayId, 'OVERLAY_ID');
    if (seen.has(overlayId)) {
      fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_OVERLAY_DUPLICATE');
    }
    seen.add(overlayId);
    if (typeof record.renderNativeAudio !== 'boolean') {
      fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_AUDIO_DISPOSITION_INVALID');
    }
    return Object.freeze({
      overlayId,
      assetId: boundedIdentifier(record.assetId, 'ASSET_ID'),
      overlayTimingSha256: sha256(record.overlayTimingSha256, 'OVERLAY_TIMING'),
      assetTimingStateSha256: sha256(record.assetTimingStateSha256, 'ASSET_TIMING_STATE'),
      sourceVersionSha256: sha256(record.sourceVersionSha256, 'SOURCE_VERSION'),
      storageVersionSha256: sha256(record.storageVersionSha256, 'STORAGE_VERSION'),
      sourceBindingSha256: sha256(record.sourceBindingSha256, 'SOURCE_BINDING'),
      sourcePtsCadenceMapStateSha256V3: sha256(
        record.sourcePtsCadenceMapStateSha256V3,
        'SOURCE_PTS_CADENCE_STATE',
      ),
      renderNativeAudio: record.renderNativeAudio,
    });
  });
  return Object.freeze(requests);
}

function normalizePolicyBindings(value: unknown): NativeMediaFinalRenderPreparationPolicyBindingsV1 {
  const record = asRecord(value, 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_POLICY_INVALID');
  exactKeys(record, [
    'encoderPolicySha256', 'encoderPolicyVersion', 'materializerPolicySha256',
    'materializerPolicyVersion', 'privateArtifactPolicySha256',
    'privateArtifactPolicyVersion',
  ], 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_POLICY_FIELDS_INVALID');
  if (record.materializerPolicyVersion
      !== NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1
    || record.encoderPolicyVersion !== NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1
    || record.privateArtifactPolicyVersion
      !== NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_POLICY_VERSION_INVALID');
  }
  return Object.freeze({
    materializerPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
    materializerPolicySha256: sha256(record.materializerPolicySha256, 'MATERIALIZER_POLICY'),
    encoderPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
    encoderPolicySha256: sha256(record.encoderPolicySha256, 'ENCODER_POLICY'),
    privateArtifactPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
    privateArtifactPolicySha256: sha256(
      record.privateArtifactPolicySha256,
      'PRIVATE_ARTIFACT_POLICY',
    ),
  });
}

function normalizeExecutionProfile(
  value: unknown,
): NativeMediaFinalRenderPreparationExecutionProfileV1 {
  const record = asRecord(
    value,
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_EXECUTION_PROFILE_INVALID',
  );
  exactKeys(record, [
    'compatibilityProfileVersion', 'compatibilityReceiptSha256', 'workerImageDigest',
  ], 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_EXECUTION_PROFILE_FIELDS_INVALID');
  if (record.compatibilityProfileVersion !== NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1
    || typeof record.workerImageDigest !== 'string'
    || !IMAGE_DIGEST.test(record.workerImageDigest)) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_EXECUTION_PROFILE_INVALID');
  }
  return Object.freeze({
    workerImageDigest: record.workerImageDigest,
    compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
    compatibilityReceiptSha256: sha256(
      record.compatibilityReceiptSha256,
      'COMPATIBILITY_RECEIPT',
    ),
  });
}

function normalizeRevision(value: unknown): ProjectRevisionV1 {
  const record = asRecord(value, 'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REVISION_INVALID');
  exactKeys(record, ['compatibilityUpdatedAt', 'schemaVersion', 'value'],
    'NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REVISION_FIELDS_INVALID');
  if (record.schemaVersion !== 1 || !Number.isSafeInteger(record.value)
    || Number(record.value) < 0 || typeof record.compatibilityUpdatedAt !== 'string'
    || record.compatibilityUpdatedAt.length > 128
    || Number.isNaN(Date.parse(record.compatibilityUpdatedAt))) {
    fail('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_REVISION_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    value: Number(record.value),
    compatibilityUpdatedAt: record.compatibilityUpdatedAt,
  });
}

function dependency(dependencyId: string, dependencyVersion: string, bindingSha256: string) {
  return Object.freeze({ dependencyId, dependencyVersion, bindingSha256 });
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

function durableIdentity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!DURABLE_IDENTITY.test(normalized)) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_${label}_INVALID`);
  }
  return normalized;
}

function boundedIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 512
    || /[\u0000-\u001F\u007F]/.test(value)) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_${label}_INVALID`);
  }
  return value.trim();
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_${label}_SHA256_INVALID`);
  }
  return value;
}

function fail(code: string): never {
  throw new NativeMediaFinalRenderPreparationJobBindingErrorV1(code);
}
