import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import { MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1 }
  from './media-source-audio-artifact-asset-owner-v1';
import {
  assertMediaSourceAudioSampleEpochResourcePolicyV1,
  assertMediaSourceAudioStreamBindingV1,
  createMediaSourceAudioStreamBindingV1,
  type MediaSourceAudioSampleEpochResourcePolicyV1,
  type MediaSourceAudioStreamBindingV1,
} from './media-source-audio-sample-epoch-map-v1';
import { MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1 }
  from './media-source-pts-cadence-r2-runtime-v1';
import { readNativeMediaExactAudioStreamIndexesV1 }
  from './native-media-exact-audio-evidence-v1';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from './media-source-qualification-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_V1_1' as const;
export const MEDIA_SOURCE_AUDIO_DURABLE_LIFECYCLE_POLICY_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_DURABLE_LIFECYCLE_V1_1' as const;
export const MEDIA_SOURCE_AUDIO_DURABLE_MAX_ATTEMPTS_V1 = 20;
export const MEDIA_SOURCE_AUDIO_DURABLE_TTL_MS_V1 =
  7 * 24 * 60 * 60 * 1000;

export type MediaSourceAudioDurableLifecyclePolicyV1 = Readonly<{
  policyVersion: typeof MEDIA_SOURCE_AUDIO_DURABLE_LIFECYCLE_POLICY_VERSION_V1;
  maxAttempts: typeof MEDIA_SOURCE_AUDIO_DURABLE_MAX_ATTEMPTS_V1;
  ttlMilliseconds: typeof MEDIA_SOURCE_AUDIO_DURABLE_TTL_MS_V1;
}>;

export const MEDIA_SOURCE_AUDIO_DURABLE_LIFECYCLE_POLICY_V1 =
  deepFreezeEditronJsonV1({
    policyVersion: MEDIA_SOURCE_AUDIO_DURABLE_LIFECYCLE_POLICY_VERSION_V1,
    maxAttempts: MEDIA_SOURCE_AUDIO_DURABLE_MAX_ATTEMPTS_V1,
    ttlMilliseconds: MEDIA_SOURCE_AUDIO_DURABLE_TTL_MS_V1,
  } satisfies MediaSourceAudioDurableLifecyclePolicyV1);

export type MediaSourceAudioDurableJobInputV1 = Readonly<{
  version: typeof MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1;
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  audioStreamBindings: readonly MediaSourceAudioStreamBindingV1[];
  audioStreamBindingsSha256: string;
  resourcePolicy: MediaSourceAudioSampleEpochResourcePolicyV1;
  privateStoragePolicyVersion:
    typeof MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1;
  lifecyclePolicy: MediaSourceAudioDurableLifecyclePolicyV1;
}>;

export class MediaSourceAudioDurableJobBindingErrorV1 extends Error {}

export function assertMediaSourceAudioDurableJobInputV1(
  value: unknown,
): Readonly<MediaSourceAudioDurableJobInputV1> {
  const record = asRecord(value, 'MEDIA_SOURCE_AUDIO_JOB_INPUT_INVALID');
  exactKeys(record, [
    'assetId', 'audioStreamBindings', 'audioStreamBindingsSha256',
    'lifecyclePolicy', 'orgId', 'privateStoragePolicyVersion',
    'resourcePolicy', 'tenantId', 'userId', 'version',
  ], 'MEDIA_SOURCE_AUDIO_JOB_INPUT_FIELDS_INVALID');
  if (record.version !== MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1
    || record.privateStoragePolicyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1) {
    fail('MEDIA_SOURCE_AUDIO_JOB_INPUT_VERSION_INVALID');
  }
  const assetId = identity(record.assetId, 'ASSET_ID');
  if (!Array.isArray(record.audioStreamBindings)
    || record.audioStreamBindings.length < 1
    || record.audioStreamBindings.length
      > MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1) {
    fail('MEDIA_SOURCE_AUDIO_JOB_STREAM_BINDINGS_INVALID');
  }
  const audioStreamBindings = record.audioStreamBindings.map(
    (binding) => assertMediaSourceAudioStreamBindingV1(binding),
  );
  for (let index = 0; index < audioStreamBindings.length; index += 1) {
    const binding = audioStreamBindings[index]!;
    if (binding.assetId !== assetId
      || (index > 0 && audioStreamBindings[index - 1]!.audioStreamIndex
        >= binding.audioStreamIndex)) {
      fail('MEDIA_SOURCE_AUDIO_JOB_STREAM_BINDINGS_NONCANONICAL');
    }
  }
  const first = audioStreamBindings[0]!;
  if (audioStreamBindings.some((binding) => (
    binding.mediaKind !== first.mediaKind
    || binding.sourceVersionSha256 !== first.sourceVersionSha256
    || binding.storageVersionSha256 !== first.storageVersionSha256
    || binding.sourceBindingSha256 !== first.sourceBindingSha256
    || binding.technicalObservationSha256
      !== first.technicalObservationSha256
  ))) {
    fail('MEDIA_SOURCE_AUDIO_JOB_STREAM_BINDINGS_SCOPE_MISMATCH');
  }
  const audioStreamBindingsSha256 = hashEditronCanonicalJsonV1(
    audioStreamBindings,
  );
  if (record.audioStreamBindingsSha256 !== audioStreamBindingsSha256) {
    fail('MEDIA_SOURCE_AUDIO_JOB_STREAM_BINDINGS_HASH_MISMATCH');
  }
  const resourcePolicy = assertMediaSourceAudioSampleEpochResourcePolicyV1(
    record.resourcePolicy,
  );
  const lifecyclePolicy = assertLifecyclePolicy(record.lifecyclePolicy);
  return deepFreezeEditronJsonV1({
    version: MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1,
    tenantId: identity(record.tenantId, 'TENANT_ID'),
    userId: identity(record.userId, 'USER_ID'),
    orgId: nullableIdentity(record.orgId, 'ORG_ID'),
    assetId,
    audioStreamBindings,
    audioStreamBindingsSha256,
    resourcePolicy,
    privateStoragePolicyVersion:
      MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
    lifecyclePolicy,
  });
}

export function buildMediaSourceAudioDurableJobContractV1(input: Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  resourcePolicy: MediaSourceAudioSampleEpochResourcePolicyV1;
}>) {
  const tenantId = identity(input.tenantId, 'TENANT_ID');
  const userId = identity(input.userId, 'USER_ID');
  const orgId = nullableIdentity(input.orgId, 'ORG_ID');
  const assetId = identity(input.assetId, 'ASSET_ID');
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  assertSourceScope({ sourceVersion, userId, orgId, assetId });
  assertQualificationSourceBinding(input.qualification, assetId);
  const audioStreamIndexes = readNativeMediaExactAudioStreamIndexesV1({
    assetId,
    type: sourceVersion.mediaKind,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: input.qualification,
  });
  if (audioStreamIndexes === null) {
    fail('MEDIA_SOURCE_AUDIO_JOB_STREAM_OBSERVATION_INVALID');
  }
  if (audioStreamIndexes.length === 0) {
    fail('MEDIA_SOURCE_AUDIO_JOB_NO_AUDIO_STREAMS');
  }
  if (audioStreamIndexes.length > MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1) {
    fail('MEDIA_SOURCE_AUDIO_JOB_STREAM_COUNT_EXCEEDED');
  }
  const audioStreamBindings = audioStreamIndexes.map((audioStreamIndex) => (
    createMediaSourceAudioStreamBindingV1({
      sourceVersion,
      qualification: input.qualification,
      audioStreamIndex,
    })
  ));
  const payload = assertMediaSourceAudioDurableJobInputV1({
    version: MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1,
    tenantId,
    userId,
    orgId,
    assetId,
    audioStreamBindings,
    audioStreamBindingsSha256: hashEditronCanonicalJsonV1(audioStreamBindings),
    resourcePolicy: input.resourcePolicy,
    privateStoragePolicyVersion:
      MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
    lifecyclePolicy: MEDIA_SOURCE_AUDIO_DURABLE_LIFECYCLE_POLICY_V1,
  });
  const bindingSha256 = hashDurableWorkflowJobJsonV1(payload);
  const operationSha256 = hashDurableWorkflowJobJsonV1({
    version: MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1,
    bindingSha256,
  });
  const first = payload.audioStreamBindings[0]!;
  const dependencies = [
    dependency('audio-resource-policy', '1', hashEditronCanonicalJsonV1(
      payload.resourcePolicy,
    )),
    dependency('audio-stream-bindings', '1', payload.audioStreamBindingsSha256),
    dependency('durable-lifecycle-policy', '1', hashEditronCanonicalJsonV1(
      payload.lifecyclePolicy,
    )),
    dependency('private-storage-policy', '1', hashEditronCanonicalJsonV1({
      version: MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
    })),
    dependency('source-binding', '1', first.sourceBindingSha256),
    dependency('source-version', '1', first.sourceVersionSha256),
    dependency('storage-version', '1', first.storageVersionSha256),
    dependency(
      'technical-observation',
      '1',
      first.technicalObservationSha256,
    ),
  ].sort((left, right) => left.dependencyId < right.dependencyId ? -1 : 1);
  return deepFreezeEditronJsonV1({
    payload,
    bindingSha256,
    dependencies,
    operationIdentity: `msaudio_${operationSha256}`,
  });
}

export async function createOrGetMediaSourceAudioDurableJobV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet'>;
  request: Parameters<typeof buildMediaSourceAudioDurableJobContractV1>[0];
  now?: Date;
}>): Promise<Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  created: boolean;
}>> {
  const now = input.now ?? new Date();
  const contract = buildMediaSourceAudioDurableJobContractV1(input.request);
  return input.jobStore.createOrGet({
    tenantId: contract.payload.tenantId,
    userId: contract.payload.userId,
    orgId: contract.payload.orgId,
    projectId: null,
    operationOwner: 'MEDIA_ASSETS',
    operationKind: 'media_source_audio_materialization',
    operationId: contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: null,
    maxAttempts: MEDIA_SOURCE_AUDIO_DURABLE_MAX_ATTEMPTS_V1,
    expiresAt: new Date(now.getTime() + MEDIA_SOURCE_AUDIO_DURABLE_TTL_MS_V1),
  }, now);
}

function assertLifecyclePolicy(
  value: unknown,
): MediaSourceAudioDurableLifecyclePolicyV1 {
  const record = asRecord(
    value,
    'MEDIA_SOURCE_AUDIO_JOB_LIFECYCLE_POLICY_INVALID',
  );
  exactKeys(record, ['maxAttempts', 'policyVersion', 'ttlMilliseconds'],
    'MEDIA_SOURCE_AUDIO_JOB_LIFECYCLE_POLICY_FIELDS_INVALID');
  if (record.policyVersion
      !== MEDIA_SOURCE_AUDIO_DURABLE_LIFECYCLE_POLICY_VERSION_V1
    || record.maxAttempts !== MEDIA_SOURCE_AUDIO_DURABLE_MAX_ATTEMPTS_V1
    || record.ttlMilliseconds !== MEDIA_SOURCE_AUDIO_DURABLE_TTL_MS_V1) {
    fail('MEDIA_SOURCE_AUDIO_JOB_LIFECYCLE_POLICY_MISMATCH');
  }
  return MEDIA_SOURCE_AUDIO_DURABLE_LIFECYCLE_POLICY_V1;
}

function assertQualificationSourceBinding(
  qualification: MediaSourceQualificationRecordV1,
  assetId: string,
): void {
  try {
    const locator = qualification.locator;
    const rebuilt = createMediaSourceQualificationV1({
      asset: {
        assetId,
        source: 'user-upload',
        ...(locator.provider === 'R2'
          ? { r2Key: locator.objectKey }
          : { gcsPath: locator.objectKey }),
      },
      now: new Date(0),
    });
    if (rebuilt.disposition !== 'CREATED'
      || qualification.assetId !== assetId
      || rebuilt.record.sourceBindingSha256
        !== qualification.sourceBindingSha256) {
      fail('MEDIA_SOURCE_AUDIO_JOB_QUALIFICATION_BINDING_INVALID');
    }
  } catch (error) {
    if (error instanceof MediaSourceAudioDurableJobBindingErrorV1) throw error;
    fail('MEDIA_SOURCE_AUDIO_JOB_QUALIFICATION_BINDING_INVALID');
  }
}

function assertSourceScope(input: Readonly<{
  sourceVersion: Readonly<MediaSourceVersionV1>;
  userId: string;
  orgId: string | null;
  assetId: string;
}>): void {
  const source = input.sourceVersion;
  if ((source.mediaKind !== 'video' && source.mediaKind !== 'audio')
    || source.assetId !== input.assetId) {
    fail('MEDIA_SOURCE_AUDIO_JOB_SOURCE_SCOPE_INVALID');
  }
  if (source.owner.kind === 'USER') {
    if (source.owner.userId !== input.userId || input.orgId !== null) {
      fail('MEDIA_SOURCE_AUDIO_JOB_SOURCE_OWNER_MISMATCH');
    }
    return;
  }
  if (!input.orgId || source.owner.orgId !== input.orgId) {
    fail('MEDIA_SOURCE_AUDIO_JOB_SOURCE_OWNER_MISMATCH');
  }
}

function dependency(
  dependencyId: string,
  dependencyVersion: string,
  bindingSha256: string,
) {
  return { dependencyId, dependencyVersion, bindingSha256 };
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) fail(code);
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value.trim())) {
    fail(`MEDIA_SOURCE_AUDIO_JOB_${label}_INVALID`);
  }
  return value.trim();
}

function nullableIdentity(value: unknown, label: string): string | null {
  return value === null ? null : identity(value, label);
}

function fail(code: string): never {
  throw new MediaSourceAudioDurableJobBindingErrorV1(code);
}
