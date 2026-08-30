import { deepFreezeEditronJsonV1, hashEditronCanonicalJsonV1 }
  from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_MAX_ATTEMPTS_V1,
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_TTL_MS_V1,
  buildMediaSourcePtsCadenceDurableJobContractV1,
} from './media-source-pts-cadence-durable-job-binding-v1';
import {
  normalizeMediaSourcePtsCadenceEpochArtifactVerificationPolicyV3,
  type MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BYTES_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_EPOCHS_V3,
  normalizeMediaSourcePtsCadenceEpochIndexResourcePolicyV3,
  type MediaSourcePtsCadenceEpochIndexResourcePolicyV3,
} from './media-source-pts-cadence-epoch-index-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
} from './media-source-pts-cadence-epoch-scan-transport-v3';
import { MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1 }
  from './media-source-pts-cadence-r2-runtime-v1';
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
  assertMediaSourcePtsCadenceSourceCoverageV2,
  createMediaSourcePtsCadenceSourceCoverageV2,
  type MediaSourcePtsCadenceSourceCoverageV2,
} from './media-source-pts-cadence-source-coverage-v2';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_V3_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_COVERAGE_POLICY_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_COVERAGE_V3_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_V3_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_DIRECT_VERIFICATION_POLICY_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DIRECT_VERIFICATION_POLICY_V3_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_NO_EXTERNAL_BOUNDARY_REGISTRY_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_NO_EXTERNAL_BOUNDARY_EVIDENCE_V3_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_MAX_ATTEMPTS_V3 =
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_MAX_ATTEMPTS_V1;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_TTL_MS_V3 =
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_TTL_MS_V1;

export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_SCAN_RESOURCE_POLICY_V3 =
  deepFreezeEditronJsonV1({
    policyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
    maxCanonicalJsonBytes: MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_ABSOLUTE_MAX_BYTES_V1,
    maxFrameRecords: 50_000,
  } satisfies MediaSourcePtsCadenceScanResourcePolicyV1);

export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_RESOURCE_POLICY_V3 =
  deepFreezeEditronJsonV1({
    policyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_VERSION_V3,
    maxCanonicalJsonBytes: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BYTES_V3,
    maxEpochEntries: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_EPOCHS_V3,
    maxBatchEntries: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
  } satisfies MediaSourcePtsCadenceEpochIndexResourcePolicyV3);

export const MEDIA_SOURCE_PTS_CADENCE_DIRECT_VERIFICATION_POLICY_V3 =
  deepFreezeEditronJsonV1({
    policyVersion: MEDIA_SOURCE_PTS_CADENCE_DIRECT_VERIFICATION_POLICY_VERSION_V3,
    maxBatchReads: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
    maxBoundaryEvidenceReads: 0,
    maxTotalArtifactBytes: 8 * 1024 * 1024 * 1024,
    boundaryEvidenceRegistryVersion:
      MEDIA_SOURCE_PTS_CADENCE_NO_EXTERNAL_BOUNDARY_REGISTRY_VERSION_V3,
  } satisfies MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3);

export type MediaSourcePtsCadenceDurableEpochJobInputV3 = Readonly<{
  version: typeof MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3;
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  mapBinding: MediaSourcePtsCadenceScanMapBindingV1;
  mapBindingSha256: string;
  scanResourcePolicy: MediaSourcePtsCadenceScanResourcePolicyV1;
  expectedCoverage: MediaSourcePtsCadenceSourceCoverageV2;
  epochIndexResourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  privateStoragePolicyVersion: typeof MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1;
}>;

export class MediaSourcePtsCadenceDurableEpochJobBindingErrorV3 extends Error {}

export function assertMediaSourcePtsCadenceDurableEpochJobInputV3(
  value: unknown,
): Readonly<MediaSourcePtsCadenceDurableEpochJobInputV3> {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_EPOCH_JOB_INPUT_INVALID');
  exactKeys(record, [
    'assetId', 'epochIndexResourcePolicy', 'expectedCoverage', 'mapBinding',
    'mapBindingSha256', 'orgId', 'privateStoragePolicyVersion',
    'scanResourcePolicy', 'tenantId', 'userId', 'verificationPolicy', 'version',
  ], 'MEDIA_SOURCE_PTS_EPOCH_JOB_INPUT_FIELDS_INVALID');
  if (record.version !== MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3
    || record.privateStoragePolicyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1) {
    fail('MEDIA_SOURCE_PTS_EPOCH_JOB_INPUT_VERSION_INVALID');
  }
  const mapBinding = assertMediaSourcePtsCadenceScanMapBindingV1(record.mapBinding);
  if (mapBinding.mapper.mapperVersion !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3
    || mapBinding.mapper.commandPolicyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3) {
    fail('MEDIA_SOURCE_PTS_EPOCH_JOB_MAPPER_IDENTITY_INVALID');
  }
  const mapBindingSha256 = hashEditronCanonicalJsonV1(mapBinding);
  if (record.mapBindingSha256 !== mapBindingSha256) {
    fail('MEDIA_SOURCE_PTS_EPOCH_JOB_MAP_BINDING_MISMATCH');
  }
  const scanResourcePolicy = assertScanResourcePolicyV1(record.scanResourcePolicy);
  if (scanResourcePolicy.policyVersion !== mapBinding.mapper.commandPolicyVersion
    || hashEditronCanonicalJsonV1(scanResourcePolicy)
      !== hashEditronCanonicalJsonV1(
        MEDIA_SOURCE_PTS_CADENCE_EPOCH_SCAN_RESOURCE_POLICY_V3,
      )) {
    fail('MEDIA_SOURCE_PTS_EPOCH_JOB_SCAN_POLICY_MISMATCH');
  }
  const epochIndexResourcePolicy =
    normalizeMediaSourcePtsCadenceEpochIndexResourcePolicyV3(
      record.epochIndexResourcePolicy,
    );
  if (epochIndexResourcePolicy.policyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_VERSION_V3
    || hashEditronCanonicalJsonV1(epochIndexResourcePolicy)
      !== hashEditronCanonicalJsonV1(
        MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_RESOURCE_POLICY_V3,
      )) {
    fail('MEDIA_SOURCE_PTS_EPOCH_JOB_INDEX_POLICY_MISMATCH');
  }
  const verificationPolicy =
    normalizeMediaSourcePtsCadenceEpochArtifactVerificationPolicyV3(
      record.verificationPolicy,
    );
  if (verificationPolicy.policyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_DIRECT_VERIFICATION_POLICY_VERSION_V3
    || verificationPolicy.maxBoundaryEvidenceReads !== 0
    || verificationPolicy.boundaryEvidenceRegistryVersion
      !== MEDIA_SOURCE_PTS_CADENCE_NO_EXTERNAL_BOUNDARY_REGISTRY_VERSION_V3
    || hashEditronCanonicalJsonV1(verificationPolicy)
      !== hashEditronCanonicalJsonV1(
        MEDIA_SOURCE_PTS_CADENCE_DIRECT_VERIFICATION_POLICY_V3,
      )) {
    fail('MEDIA_SOURCE_PTS_EPOCH_JOB_VERIFICATION_POLICY_MISMATCH');
  }
  const expectedCoverage = assertMediaSourcePtsCadenceSourceCoverageV2(
    record.expectedCoverage,
  );
  if (expectedCoverage.mapBindingSha256 !== mapBindingSha256
    || expectedCoverage.coveragePolicyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_COVERAGE_POLICY_VERSION_V3) {
    fail('MEDIA_SOURCE_PTS_EPOCH_JOB_COVERAGE_BINDING_MISMATCH');
  }
  return deepFreezeEditronJsonV1({
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3,
    tenantId: identity(record.tenantId, 'TENANT_ID'),
    userId: identity(record.userId, 'USER_ID'),
    orgId: nullableIdentity(record.orgId, 'ORG_ID'),
    assetId: identity(record.assetId, 'ASSET_ID'),
    mapBinding,
    mapBindingSha256,
    scanResourcePolicy,
    expectedCoverage,
    epochIndexResourcePolicy,
    verificationPolicy,
    privateStoragePolicyVersion: MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
  });
}

export function buildMediaSourcePtsCadenceDurableEpochJobContractV3(
  input: Readonly<{
    tenantId: string;
    userId: string;
    orgId: string | null;
    assetId: string;
    sourceVersion: MediaSourceVersionV1;
    qualification: MediaSourceQualificationRecordV1;
    videoStreamIndex: number;
  }>,
) {
  const validatedSource = buildMediaSourcePtsCadenceDurableJobContractV1(input);
  const mapper = {
    mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
    ffprobeVersion: validatedSource.payload.mapBinding.mapper.ffprobeVersion,
    commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const mapBinding = assertMediaSourcePtsCadenceScanMapBindingV1({
    ...validatedSource.payload.mapBinding,
    mapper,
  });
  const mapBindingSha256 = hashEditronCanonicalJsonV1(mapBinding);
  const expectedCoverage = createMediaSourcePtsCadenceSourceCoverageV2({
    sourceVersion: input.sourceVersion,
    qualification: input.qualification,
    videoStreamIndex: input.videoStreamIndex,
    mapper,
    coveragePolicyVersion:
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_COVERAGE_POLICY_VERSION_V3,
  });
  const payload = assertMediaSourcePtsCadenceDurableEpochJobInputV3({
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3,
    tenantId: validatedSource.payload.tenantId,
    userId: validatedSource.payload.userId,
    orgId: validatedSource.payload.orgId,
    assetId: validatedSource.payload.assetId,
    mapBinding,
    mapBindingSha256,
    scanResourcePolicy: MEDIA_SOURCE_PTS_CADENCE_EPOCH_SCAN_RESOURCE_POLICY_V3,
    expectedCoverage,
    epochIndexResourcePolicy:
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_RESOURCE_POLICY_V3,
    verificationPolicy: MEDIA_SOURCE_PTS_CADENCE_DIRECT_VERIFICATION_POLICY_V3,
    privateStoragePolicyVersion: MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
  });
  const bindingSha256 = hashDurableWorkflowJobJsonV1(payload);
  const operationSha256 = hashDurableWorkflowJobJsonV1({
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3,
    bindingSha256,
  });
  const dependencies = [
    dependency('source-version', '1', mapBinding.sourceVersionSha256),
    dependency('storage-version', '1', mapBinding.storageVersionSha256),
    dependency('source-binding', '1', mapBinding.sourceBindingSha256),
    dependency('technical-observation', '1', mapBinding.technicalObservationSha256),
    dependency('mapper-runtime', '3', hashEditronCanonicalJsonV1(mapper)),
    dependency('scan-resource-policy', '3', hashEditronCanonicalJsonV1(
      payload.scanResourcePolicy,
    )),
    dependency('source-coverage', '3', expectedCoverage.coverageSha256),
    dependency('epoch-index-resource-policy', '3', hashEditronCanonicalJsonV1(
      payload.epochIndexResourcePolicy,
    )),
    dependency('epoch-artifact-verification-policy', '3', hashEditronCanonicalJsonV1(
      payload.verificationPolicy,
    )),
    dependency('private-storage-policy', '1', hashEditronCanonicalJsonV1({
      version: MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
    })),
  ].sort((left, right) => left.dependencyId < right.dependencyId ? -1 : 1);
  return deepFreezeEditronJsonV1({
    payload,
    bindingSha256,
    dependencies,
    operationIdentity: `mptsv3_${operationSha256}`,
  });
}

export async function createOrGetMediaSourcePtsCadenceDurableEpochJobV3(
  input: Readonly<{
    jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet'>;
    request: Parameters<typeof buildMediaSourcePtsCadenceDurableEpochJobContractV3>[0];
    now?: Date;
  }>,
): Promise<Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  created: boolean;
}>> {
  const now = input.now ?? new Date();
  const contract = buildMediaSourcePtsCadenceDurableEpochJobContractV3(input.request);
  return input.jobStore.createOrGet({
    tenantId: contract.payload.tenantId,
    userId: contract.payload.userId,
    orgId: contract.payload.orgId,
    projectId: null,
    operationOwner: 'MEDIA_ASSETS',
    operationKind: 'media_source_pts_cadence_epoch_scan',
    operationId: contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: null,
    maxAttempts: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_MAX_ATTEMPTS_V3,
    expiresAt: new Date(now.getTime() + MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_TTL_MS_V3),
  }, now);
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
    fail(`MEDIA_SOURCE_PTS_EPOCH_JOB_${label}_INVALID`);
  }
  return value.trim();
}

function nullableIdentity(value: unknown, label: string): string | null {
  return value === null ? null : identity(value, label);
}

function fail(code: string): never {
  throw new MediaSourcePtsCadenceDurableEpochJobBindingErrorV3(code);
}
