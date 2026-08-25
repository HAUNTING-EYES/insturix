import { deepFreezeEditronJsonV1, hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BATCHES_V2,
  MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BYTES_V2,
  type MediaSourcePtsCadenceManifestIndexResourcePolicyV2,
} from './media-source-pts-cadence-manifest-index-v2';
import { MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1 } from './media-source-pts-cadence-map-lifecycle-v1';
import { MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1 } from './media-source-pts-cadence-r2-runtime-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1,
  assertScanResourcePolicyV1,
  type MediaSourcePtsCadenceScanResourcePolicyV1,
} from './media-source-pts-cadence-scan-staging-v1';
import {
  assertMediaSourcePtsCadenceScanMapBindingV1,
  type MediaSourcePtsCadenceScanMapBindingV1,
} from './media-source-pts-cadence-scan-transport-v1';
import {
  createMediaSourcePtsCadenceShardV1,
  type MediaSourcePtsCadenceMapperV1,
} from './media-source-pts-cadence-shard-v1';
import {
  assertMediaSourcePtsCadenceSourceCoverageV2,
  createMediaSourcePtsCadenceSourceCoverageV2,
  type MediaSourcePtsCadenceSourceCoverageV2,
} from './media-source-pts-cadence-source-coverage-v2';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from './media-source-qualification-v1';
import { MEDIA_SOURCE_PROBE_VERSION_V1 } from './media-source-probe-v1';
import { assertMediaSourceVersionV1, type MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_V1_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_MAPPER_VERSION_V1 = 'continuous-ffprobe-v1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_COMMAND_POLICY_VERSION_V1 =
  'continuous-ffprobe-v1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_COVERAGE_POLICY_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_COVERAGE_V2_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_MAX_ATTEMPTS_V1 = 20;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_TTL_MS_V1 = 7 * 24 * 60 * 60 * 1000;

export const MEDIA_SOURCE_PTS_CADENCE_SCAN_RESOURCE_POLICY_V1 =
  deepFreezeEditronJsonV1({
    policyVersion: MEDIA_SOURCE_PTS_CADENCE_COMMAND_POLICY_VERSION_V1,
    maxCanonicalJsonBytes: MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1,
    maxFrameRecords: 50_000,
  } satisfies MediaSourcePtsCadenceScanResourcePolicyV1);

export const MEDIA_SOURCE_PTS_CADENCE_MANIFEST_RESOURCE_POLICY_V1 =
  deepFreezeEditronJsonV1({
    policyVersion: MEDIA_SOURCE_PTS_CADENCE_COMMAND_POLICY_VERSION_V1,
    maxCanonicalJsonBytes: MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BYTES_V2,
    maxBatchEntries: 10_000,
  } satisfies MediaSourcePtsCadenceManifestIndexResourcePolicyV2);

export type MediaSourcePtsCadenceDurableJobInputV1 = Readonly<{
  version: typeof MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1;
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  mapBinding: MediaSourcePtsCadenceScanMapBindingV1;
  mapBindingSha256: string;
  scanResourcePolicy: MediaSourcePtsCadenceScanResourcePolicyV1;
  manifestResourcePolicy: MediaSourcePtsCadenceManifestIndexResourcePolicyV2;
  expectedCoverage: MediaSourcePtsCadenceSourceCoverageV2;
  privateStoragePolicyVersion: typeof MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1;
}>;

export class MediaSourcePtsCadenceDurableJobBindingErrorV1 extends Error {}

export function assertMediaSourcePtsCadenceDurableJobInputV1(
  value: unknown,
): Readonly<MediaSourcePtsCadenceDurableJobInputV1> {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_JOB_INPUT_INVALID');
  exactKeys(record, [
    'assetId', 'expectedCoverage', 'manifestResourcePolicy', 'mapBinding',
    'mapBindingSha256', 'orgId', 'privateStoragePolicyVersion',
    'scanResourcePolicy', 'tenantId', 'userId', 'version',
  ], 'MEDIA_SOURCE_PTS_JOB_INPUT_FIELDS_INVALID');
  if (record.version !== MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1
    || record.privateStoragePolicyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1) {
    fail('MEDIA_SOURCE_PTS_JOB_INPUT_VERSION_INVALID');
  }
  const mapBinding = assertMediaSourcePtsCadenceScanMapBindingV1(record.mapBinding);
  const scanResourcePolicy = assertScanResourcePolicyV1(record.scanResourcePolicy);
  if (scanResourcePolicy.policyVersion !== mapBinding.mapper.commandPolicyVersion) {
    fail('MEDIA_SOURCE_PTS_JOB_SCAN_POLICY_MISMATCH');
  }
  const mapBindingSha256 = hashEditronCanonicalJsonV1(mapBinding);
  const manifestResourcePolicy = assertManifestPolicy(record.manifestResourcePolicy);
  if (manifestResourcePolicy.policyVersion !== scanResourcePolicy.policyVersion) {
    fail('MEDIA_SOURCE_PTS_JOB_MANIFEST_POLICY_MISMATCH');
  }
  const expectedCoverage = assertMediaSourcePtsCadenceSourceCoverageV2(record.expectedCoverage);
  if (expectedCoverage.mapBindingSha256 !== mapBindingSha256
    || record.mapBindingSha256 !== mapBindingSha256) {
    fail('MEDIA_SOURCE_PTS_JOB_MAP_BINDING_MISMATCH');
  }
  return deepFreezeEditronJsonV1({
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1,
    tenantId: identity(record.tenantId, 'TENANT_ID'),
    userId: identity(record.userId, 'USER_ID'),
    orgId: nullableIdentity(record.orgId, 'ORG_ID'),
    assetId: identity(record.assetId, 'ASSET_ID'),
    mapBinding,
    mapBindingSha256,
    scanResourcePolicy,
    manifestResourcePolicy,
    expectedCoverage,
    privateStoragePolicyVersion: MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
  });
}

export function buildMediaSourcePtsCadenceDurableJobContractV1(input: Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  videoStreamIndex: number;
}>) {
  const tenantId = identity(input.tenantId, 'TENANT_ID');
  const userId = identity(input.userId, 'USER_ID');
  const orgId = nullableIdentity(input.orgId, 'ORG_ID');
  const assetId = identity(input.assetId, 'ASSET_ID');
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  assertSourceScope({ sourceVersion, userId, orgId, assetId });
  assertQualificationSourceBinding(input.qualification, assetId);
  const ffprobeVersion = exactQualifiedFfprobeVersion(input.qualification);
  const mapper: MediaSourcePtsCadenceMapperV1 = {
    mapperVersion: MEDIA_SOURCE_PTS_CADENCE_MAPPER_VERSION_V1,
    ffprobeVersion,
    commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_COMMAND_POLICY_VERSION_V1,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
  };
  const bindingShard = createMediaSourcePtsCadenceShardV1({
    sourceVersion,
    qualification: input.qualification,
    videoStreamIndex: input.videoStreamIndex,
    mapper,
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames: [{ presentationTimestampTicks: '0', durationTicks: '1' }],
  });
  const mapBinding: MediaSourcePtsCadenceScanMapBindingV1 = {
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_KIND_V1,
    sourceVersionSha256: bindingShard.sourceVersionSha256,
    storageVersionSha256: bindingShard.storageVersionSha256,
    sourceBindingSha256: bindingShard.sourceBindingSha256,
    technicalObservationSha256: bindingShard.technicalObservationSha256,
    videoStreamIndex: bindingShard.videoStreamIndex,
    sourceTimebase: bindingShard.sourceTimebase,
    mapper: bindingShard.mapper,
  };
  const validatedMapBinding = assertMediaSourcePtsCadenceScanMapBindingV1(mapBinding);
  const mapBindingSha256 = hashEditronCanonicalJsonV1(validatedMapBinding);
  const expectedCoverage = createMediaSourcePtsCadenceSourceCoverageV2({
    sourceVersion,
    qualification: input.qualification,
    videoStreamIndex: input.videoStreamIndex,
    mapper,
    coveragePolicyVersion: MEDIA_SOURCE_PTS_CADENCE_COVERAGE_POLICY_VERSION_V1,
  });
  const payload = assertMediaSourcePtsCadenceDurableJobInputV1({
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1,
    tenantId,
    userId,
    orgId,
    assetId,
    mapBinding: validatedMapBinding,
    mapBindingSha256,
    scanResourcePolicy: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESOURCE_POLICY_V1,
    manifestResourcePolicy: MEDIA_SOURCE_PTS_CADENCE_MANIFEST_RESOURCE_POLICY_V1,
    expectedCoverage,
    privateStoragePolicyVersion: MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
  });
  const bindingSha256 = hashDurableWorkflowJobJsonV1(payload);
  const operationSha256 = hashDurableWorkflowJobJsonV1({
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1,
    bindingSha256,
  });
  const dependencies = [
    dependency('source-version', '1', mapBinding.sourceVersionSha256),
    dependency('storage-version', '1', mapBinding.storageVersionSha256),
    dependency('source-binding', '1', mapBinding.sourceBindingSha256),
    dependency('technical-observation', '1', mapBinding.technicalObservationSha256),
    dependency('mapper-runtime', '1', hashEditronCanonicalJsonV1(mapBinding.mapper)),
    dependency('scan-resource-policy', '1', hashEditronCanonicalJsonV1(payload.scanResourcePolicy)),
    dependency('manifest-resource-policy', '1', hashEditronCanonicalJsonV1(payload.manifestResourcePolicy)),
    dependency('source-coverage', '2', expectedCoverage.coverageSha256),
    dependency('private-storage-policy', '1', hashEditronCanonicalJsonV1({
      version: MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
    })),
  ].sort((left, right) => left.dependencyId < right.dependencyId ? -1 : 1);
  return deepFreezeEditronJsonV1({
    payload,
    bindingSha256,
    dependencies,
    operationIdentity: `mpts_${operationSha256}`,
  });
}

export async function createOrGetMediaSourcePtsCadenceDurableJobV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet'>;
  request: Parameters<typeof buildMediaSourcePtsCadenceDurableJobContractV1>[0];
  now?: Date;
}>): Promise<Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  created: boolean;
}>> {
  const now = input.now ?? new Date();
  const contract = buildMediaSourcePtsCadenceDurableJobContractV1(input.request);
  return input.jobStore.createOrGet({
    tenantId: contract.payload.tenantId,
    userId: contract.payload.userId,
    orgId: contract.payload.orgId,
    projectId: null,
    operationOwner: 'MEDIA_ASSETS',
    operationKind: 'media_source_pts_cadence_scan',
    operationId: contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: null,
    maxAttempts: MEDIA_SOURCE_PTS_CADENCE_DURABLE_MAX_ATTEMPTS_V1,
    expiresAt: new Date(now.getTime() + MEDIA_SOURCE_PTS_CADENCE_DURABLE_TTL_MS_V1),
  }, now);
}

function exactQualifiedFfprobeVersion(qualification: MediaSourceQualificationRecordV1): string {
  const prefix = `${MEDIA_SOURCE_PROBE_VERSION_V1}; `;
  const value = qualification.observation?.probeVersion;
  if (qualification.status !== 'MEASURED_TECHNICAL'
    || typeof value !== 'string' || !value.startsWith(prefix)) {
    fail('MEDIA_SOURCE_PTS_JOB_FFPROBE_VERSION_UNAVAILABLE');
  }
  const version = value.slice(prefix.length).trim();
  if (!version.startsWith('ffprobe version ') || version.length > 256
    || /[\u0000-\u001F\u007F]/.test(version)) {
    fail('MEDIA_SOURCE_PTS_JOB_FFPROBE_VERSION_INVALID');
  }
  return version;
}

function assertQualificationSourceBinding(
  qualification: MediaSourceQualificationRecordV1,
  assetId: string,
): void {
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
    || rebuilt.record.sourceBindingSha256 !== qualification.sourceBindingSha256) {
    fail('MEDIA_SOURCE_PTS_JOB_QUALIFICATION_BINDING_INVALID');
  }
}

function assertSourceScope(input: Readonly<{
  sourceVersion: Readonly<MediaSourceVersionV1>;
  userId: string;
  orgId: string | null;
  assetId: string;
}>): void {
  const source = input.sourceVersion;
  if (source.mediaKind !== 'video' || source.assetId !== input.assetId) {
    fail('MEDIA_SOURCE_PTS_JOB_SOURCE_SCOPE_INVALID');
  }
  if (source.owner.kind === 'USER') {
    if (source.owner.userId !== input.userId || input.orgId !== null) {
      fail('MEDIA_SOURCE_PTS_JOB_SOURCE_OWNER_MISMATCH');
    }
    return;
  }
  if (!input.orgId || source.owner.orgId !== input.orgId) {
    fail('MEDIA_SOURCE_PTS_JOB_SOURCE_OWNER_MISMATCH');
  }
}

function assertManifestPolicy(value: unknown): MediaSourcePtsCadenceManifestIndexResourcePolicyV2 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_JOB_MANIFEST_POLICY_INVALID');
  exactKeys(record, ['maxBatchEntries', 'maxCanonicalJsonBytes', 'policyVersion'],
    'MEDIA_SOURCE_PTS_JOB_MANIFEST_POLICY_FIELDS_INVALID');
  return {
    policyVersion: text(record.policyVersion, 'MANIFEST_POLICY_VERSION'),
    maxCanonicalJsonBytes: positiveInteger(
      record.maxCanonicalJsonBytes,
      MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BYTES_V2,
      'MANIFEST_POLICY_BYTES',
    ),
    maxBatchEntries: positiveInteger(
      record.maxBatchEntries,
      MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BATCHES_V2,
      'MANIFEST_POLICY_BATCHES',
    ),
  };
}

function dependency(dependencyId: string, dependencyVersion: string, bindingSha256: string) {
  return { dependencyId, dependencyVersion, bindingSha256 };
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

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value.trim())) {
    fail(`MEDIA_SOURCE_PTS_JOB_${label}_INVALID`);
  }
  return value.trim();
}

function nullableIdentity(value: unknown, label: string): string | null {
  return value === null ? null : identity(value, label);
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 256
    || /[\u0000-\u001F\u007F]/.test(value.trim())) {
    fail(`MEDIA_SOURCE_PTS_JOB_${label}_INVALID`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    fail(`MEDIA_SOURCE_PTS_JOB_${label}_INVALID`);
  }
  return Number(value);
}

function fail(code: string): never {
  throw new MediaSourcePtsCadenceDurableJobBindingErrorV1(code);
}
