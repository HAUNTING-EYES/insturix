import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertNativeMediaFinalRenderFfmpegEncoderPolicyV1,
  type NativeMediaFinalRenderFfmpegEncoderPolicyV1,
} from './native-media-final-render-ffmpeg-encoder-v1';
import {
  assertNativeMediaFinalRenderMaterializerPolicyV1,
  type NativeMediaFinalRenderMaterializerPolicyV1,
} from './native-media-final-render-materializer-v1';
import type {
  NativeMediaFinalRenderPreparationExecutionProfileV1,
  NativeMediaFinalRenderPreparationJobInputV1,
  NativeMediaFinalRenderPreparationPolicyBindingsV1,
} from './native-media-final-render-preparation-job-v1';
import {
  assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
  type NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
} from './native-media-final-render-preparation-delivery-retry-policy-v1';
import {
  createNativeMediaFinalRenderPreparationHeartbeatPolicyV1,
  type NativeMediaFinalRenderPreparationHeartbeatPolicyV1,
} from './native-media-final-render-preparation-owner-adapter-v1';
import {
  createNativeMediaFinalRenderPreparationRuntimePolicyV1,
  type NativeMediaFinalRenderPreparationPolicyOwnerBindingV1,
} from './native-media-final-render-preparation-runtime-policy-v1';
import {
  assertNativeMediaFinalRenderProfileReceiptV1,
  type NativeMediaFinalRenderProfileReceiptV1,
} from './native-media-final-render-profile-v1';
import {
  assertNativeMediaFinalRenderR2PrivateArtifactPolicyV1,
  type NativeMediaFinalRenderR2PrivateArtifactPolicyV1,
} from './native-media-final-render-r2-private-artifact-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_EXECUTION_MANIFEST_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_EXECUTION_MANIFEST_V1' as const;

const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;

export type NativeMediaFinalRenderPreparationExecutionManifestV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_EXECUTION_MANIFEST_KIND_V1;
  jobBindings: NativeMediaFinalRenderPreparationPolicyBindingsV1;
  policies: Readonly<{
    materializer: NativeMediaFinalRenderMaterializerPolicyV1;
    encoder: NativeMediaFinalRenderFfmpegEncoderPolicyV1;
    privateArtifact: NativeMediaFinalRenderR2PrivateArtifactPolicyV1;
    retry: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1;
    heartbeat: NativeMediaFinalRenderPreparationHeartbeatPolicyV1;
  }>;
  executionProfile: Readonly<{
    workerImageDigest: string;
    compatibilityReceipt: NativeMediaFinalRenderProfileReceiptV1;
  }>;
  manifestSha256: string;
}>;

export function createNativeMediaFinalRenderPreparationExecutionManifestV1(
  input: Readonly<{
    executionBudget: NativeMediaFinalRenderPreparationPolicyOwnerBindingV1;
    materializerPolicy: NativeMediaFinalRenderMaterializerPolicyV1;
    encoderPolicy: NativeMediaFinalRenderFfmpegEncoderPolicyV1;
    privateArtifactPolicy: NativeMediaFinalRenderR2PrivateArtifactPolicyV1;
    retryPolicy: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1;
    heartbeatPolicy: NativeMediaFinalRenderPreparationHeartbeatPolicyV1;
    workerImageDigest: string;
    compatibilityReceipt: NativeMediaFinalRenderProfileReceiptV1;
  }>,
): NativeMediaFinalRenderPreparationExecutionManifestV1 {
  const materializer = assertNativeMediaFinalRenderMaterializerPolicyV1(
    input?.materializerPolicy,
  );
  strictMaterializerPolicy(materializer);
  const encoder = assertNativeMediaFinalRenderFfmpegEncoderPolicyV1(input?.encoderPolicy);
  exactKeys(object(encoder, 'ENCODER_POLICY_INVALID'), [
    'maxArtifactBytes', 'maxDecodedSequenceBytes', 'maxDimension', 'maxFrameBytes',
    'maxPcmBytes', 'maxSourceBytes', 'maxTimelineFrames', 'policyVersion', 'timeoutMs',
  ], 'ENCODER_POLICY_FIELDS_INVALID');
  const privateArtifact = assertNativeMediaFinalRenderR2PrivateArtifactPolicyV1(
    input?.privateArtifactPolicy,
  );
  exactKeys(object(privateArtifact, 'PRIVATE_ARTIFACT_POLICY_INVALID'), [
    'defaultLeaseTtlMs', 'maxArtifactBytes', 'maximumLeaseTtlMs', 'policyVersion',
  ], 'PRIVATE_ARTIFACT_POLICY_FIELDS_INVALID');
  const retry = assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1(
    input?.retryPolicy,
  );
  const heartbeat = assertHeartbeatPolicy(input?.heartbeatPolicy);
  const compatibilityReceipt = assertNativeMediaFinalRenderProfileReceiptV1(
    input?.compatibilityReceipt,
  );
  const workerImageDigest = imageDigest(input?.workerImageDigest);
  const runtimePolicy = createNativeMediaFinalRenderPreparationRuntimePolicyV1({
    executionBudget: input.executionBudget,
    retryPolicy: {
      ownerId: retry.ownerId,
      ownerVersion: retry.ownerVersion,
      policySha256: retry.policySha256,
    },
    heartbeatPolicySha256: heartbeat.policySha256,
  });
  const jobBindings = deepFreezeEditronJsonV1({
    materializerPolicyVersion: materializer.policyVersion,
    materializerPolicySha256: hashEditronCanonicalJsonV1(materializer),
    encoderPolicyVersion: encoder.policyVersion,
    encoderPolicySha256: hashEditronCanonicalJsonV1(encoder),
    privateArtifactPolicyVersion: privateArtifact.policyVersion,
    privateArtifactPolicySha256: hashEditronCanonicalJsonV1(privateArtifact),
    runtimePolicy,
  } satisfies NativeMediaFinalRenderPreparationPolicyBindingsV1);
  const material = deepFreezeEditronJsonV1({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_EXECUTION_MANIFEST_KIND_V1,
    jobBindings,
    policies: { materializer, encoder, privateArtifact, retry, heartbeat },
    executionProfile: { workerImageDigest, compatibilityReceipt },
  });
  return deepFreezeEditronJsonV1({
    ...material,
    manifestSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNativeMediaFinalRenderPreparationExecutionManifestV1(
  value: unknown,
): NativeMediaFinalRenderPreparationExecutionManifestV1 {
  const record = object(value, 'MANIFEST_INVALID');
  exactKeys(record, [
    'executionProfile', 'jobBindings', 'kind', 'manifestSha256', 'policies',
    'schemaVersion',
  ], 'MANIFEST_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_EXECUTION_MANIFEST_KIND_V1) {
    fail('MANIFEST_IDENTITY_INVALID');
  }
  const policies = object(record.policies, 'POLICIES_INVALID');
  exactKeys(policies, [
    'encoder', 'heartbeat', 'materializer', 'privateArtifact', 'retry',
  ], 'POLICIES_FIELDS_INVALID');
  const profile = object(record.executionProfile, 'EXECUTION_PROFILE_INVALID');
  exactKeys(profile, [
    'compatibilityReceipt', 'workerImageDigest',
  ], 'EXECUTION_PROFILE_FIELDS_INVALID');
  const bindings = object(record.jobBindings, 'JOB_BINDINGS_INVALID');
  const runtime = object(bindings.runtimePolicy, 'RUNTIME_POLICY_INVALID');
  const rebuilt = createNativeMediaFinalRenderPreparationExecutionManifestV1({
    executionBudget: (
      runtime.executionBudget as NativeMediaFinalRenderPreparationPolicyOwnerBindingV1
    ),
    materializerPolicy: policies.materializer as NativeMediaFinalRenderMaterializerPolicyV1,
    encoderPolicy: policies.encoder as NativeMediaFinalRenderFfmpegEncoderPolicyV1,
    privateArtifactPolicy:
      policies.privateArtifact as NativeMediaFinalRenderR2PrivateArtifactPolicyV1,
    retryPolicy: policies.retry as NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
    heartbeatPolicy:
      policies.heartbeat as NativeMediaFinalRenderPreparationHeartbeatPolicyV1,
    workerImageDigest: profile.workerImageDigest as string,
    compatibilityReceipt:
      profile.compatibilityReceipt as NativeMediaFinalRenderProfileReceiptV1,
  });
  if (hashEditronCanonicalJsonV1(rebuilt) !== hashEditronCanonicalJsonV1(record)) {
    fail('MANIFEST_BINDING_MISMATCH');
  }
  return rebuilt;
}

export function assertNativeMediaFinalRenderPreparationExecutionManifestForJobV1(
  manifestValue: unknown,
  job: Pick<NativeMediaFinalRenderPreparationJobInputV1, 'policyBindings' | 'executionProfile'>,
): NativeMediaFinalRenderPreparationExecutionManifestV1 {
  const manifest = assertNativeMediaFinalRenderPreparationExecutionManifestV1(manifestValue);
  const expectedProfile: NativeMediaFinalRenderPreparationExecutionProfileV1 = {
    workerImageDigest: manifest.executionProfile.workerImageDigest,
    compatibilityProfileVersion: manifest.executionProfile.compatibilityReceipt.profileVersion,
    compatibilityReceiptSha256: manifest.executionProfile.compatibilityReceipt.receiptSha256,
  };
  if (hashEditronCanonicalJsonV1(job?.policyBindings)
      !== hashEditronCanonicalJsonV1(manifest.jobBindings)
    || hashEditronCanonicalJsonV1(job?.executionProfile)
      !== hashEditronCanonicalJsonV1(expectedProfile)) {
    fail('JOB_BINDING_MISMATCH');
  }
  return manifest;
}

function strictMaterializerPolicy(value: NativeMediaFinalRenderMaterializerPolicyV1): void {
  exactKeys(object(value, 'MATERIALIZER_POLICY_INVALID'), [
    'conform', 'epochWindow', 'maxArtifactBytes', 'maxTimelineFrames', 'policyVersion',
  ], 'MATERIALIZER_POLICY_FIELDS_INVALID');
  exactKeys(object(value.epochWindow, 'EPOCH_WINDOW_POLICY_INVALID'), [
    'maxBatchReads', 'maxFrameRecords', 'maxTotalReadBytes', 'policyVersion',
  ], 'EPOCH_WINDOW_POLICY_FIELDS_INVALID');
  exactKeys(object(value.conform, 'CONFORM_POLICY_INVALID'), [
    'maxFrameQueries', 'maxSourceFrames', 'policyVersion',
  ], 'CONFORM_POLICY_FIELDS_INVALID');
}

function assertHeartbeatPolicy(
  value: NativeMediaFinalRenderPreparationHeartbeatPolicyV1,
): NativeMediaFinalRenderPreparationHeartbeatPolicyV1 {
  const rebuilt = createNativeMediaFinalRenderPreparationHeartbeatPolicyV1({
    heartbeatIntervalMs: value?.heartbeatIntervalMs,
  });
  if (hashEditronCanonicalJsonV1(rebuilt) !== hashEditronCanonicalJsonV1(value)) {
    fail('HEARTBEAT_POLICY_INVALID');
  }
  return rebuilt;
}

function imageDigest(value: unknown): string {
  if (typeof value !== 'string' || !IMAGE_DIGEST.test(value)) {
    fail('WORKER_IMAGE_DIGEST_INVALID');
  }
  return value;
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) fail(code);
}

function fail(code: string): never {
  throw new Error(`NATIVE_MEDIA_FINAL_RENDER_EXECUTION_MANIFEST_${code}`);
}
