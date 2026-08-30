import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  DURABLE_WORKFLOW_JOB_VERSION_V1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobBudgetReservationV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV1,
  type MediaProxyMasterR2PrivatePublicationPolicyV1,
} from './media-proxy-master-r2-private-publication-policy-v1';
import {
  assertMediaProxyMasterTranscodeCommandV1,
  type MediaProxyMasterTranscodeCommandV1,
} from './media-proxy-master-trusted-transcode-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V1_1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_V1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_VERSION_V1 =
  'editron-media-proxy-master-transcode-durable-runtime-policy-v1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1 =
  'MEDIA_ASSETS' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1 =
  'media_proxy_master_trusted_transcode' as const;

const MAX_ATTEMPTS = 20;
const MAX_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_JSON_PAYLOAD_BYTES = 256 * 1_024;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodePolicyOwnerBindingV1 = Readonly<{
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
}>;

export type MediaProxyMasterTranscodeDurableRuntimePolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_KIND_V1;
  policyVersion:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_VERSION_V1;
  lifecycle: Readonly<{
    maxAttempts: number;
    retentionMs: number;
  }>;
  executionBudgetPolicy: MediaProxyMasterTranscodePolicyOwnerBindingV1;
  retryPolicy: MediaProxyMasterTranscodePolicyOwnerBindingV1;
  heartbeatPolicy: MediaProxyMasterTranscodePolicyOwnerBindingV1;
  executionProfile: Readonly<{
    workerImageDigest: string;
    platform: string;
    ffmpegVersion: string;
    ffprobeVersion: string;
    compatibilityReceiptSha256: string;
  }>;
  bindingSha256: string;
}>;

export type MediaProxyMasterTranscodeDurableJobInputV1 = Readonly<{
  version: typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1;
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  command: MediaProxyMasterTranscodeCommandV1;
  commandSha256: string;
  publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV1;
  runtimePolicy: MediaProxyMasterTranscodeDurableRuntimePolicyV1;
  budgetReservation: DurableWorkflowJobBudgetReservationV1;
}>;

export class MediaProxyMasterTranscodeDurableJobBindingErrorV1 extends Error {}

export function createMediaProxyMasterTranscodeDurableRuntimePolicyV1(
  input: Readonly<{
    lifecycle: Readonly<{ maxAttempts: number; retentionMs: number }>;
    executionBudgetPolicy: MediaProxyMasterTranscodePolicyOwnerBindingV1;
    retryPolicy: MediaProxyMasterTranscodePolicyOwnerBindingV1;
    heartbeatPolicy: MediaProxyMasterTranscodePolicyOwnerBindingV1;
    executionProfile: MediaProxyMasterTranscodeDurableRuntimePolicyV1['executionProfile'];
  }>,
): MediaProxyMasterTranscodeDurableRuntimePolicyV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_KIND_V1,
    policyVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_VERSION_V1,
    lifecycle: normalizeLifecycle(input.lifecycle),
    executionBudgetPolicy: normalizePolicyOwner(
      input.executionBudgetPolicy,
      'EXECUTION_BUDGET',
    ),
    retryPolicy: normalizePolicyOwner(input.retryPolicy, 'RETRY'),
    heartbeatPolicy: normalizePolicyOwner(input.heartbeatPolicy, 'HEARTBEAT'),
    executionProfile: normalizeExecutionProfile(input.executionProfile),
  };
  return deepFreezeEditronJsonV1({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(
  value: unknown,
): MediaProxyMasterTranscodeDurableRuntimePolicyV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_DURABLE_RUNTIME_POLICY_INVALID');
  exactKeys(record, [
    'bindingSha256', 'executionBudgetPolicy', 'executionProfile',
    'heartbeatPolicy', 'kind', 'lifecycle', 'policyVersion', 'retryPolicy',
    'schemaVersion',
  ], 'MEDIA_PROXY_MASTER_DURABLE_RUNTIME_POLICY_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_KIND_V1
    || record.policyVersion
      !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RUNTIME_POLICY_VERSION_V1) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RUNTIME_POLICY_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterTranscodeDurableRuntimePolicyV1({
    lifecycle: record.lifecycle as never,
    executionBudgetPolicy: record.executionBudgetPolicy as never,
    retryPolicy: record.retryPolicy as never,
    heartbeatPolicy: record.heartbeatPolicy as never,
    executionProfile: record.executionProfile as never,
  });
  if (sha256(record.bindingSha256, 'RUNTIME_POLICY_BINDING')
    !== rebuilt.bindingSha256) {
    fail('MEDIA_PROXY_MASTER_DURABLE_RUNTIME_POLICY_HASH_MISMATCH');
  }
  return rebuilt;
}

export function assertMediaProxyMasterTranscodeDurableJobInputV1(
  value: unknown,
): MediaProxyMasterTranscodeDurableJobInputV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_DURABLE_JOB_INPUT_INVALID');
  exactKeys(record, [
    'assetId', 'budgetReservation', 'command', 'commandSha256', 'orgId',
    'publicationPolicy', 'runtimePolicy', 'tenantId', 'userId', 'version',
  ], 'MEDIA_PROXY_MASTER_DURABLE_JOB_INPUT_FIELDS_INVALID');
  if (record.version !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_INPUT_VERSION_INVALID');
  }
  let command: MediaProxyMasterTranscodeCommandV1;
  let publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV1;
  let runtimePolicy: MediaProxyMasterTranscodeDurableRuntimePolicyV1;
  try {
    command = assertMediaProxyMasterTranscodeCommandV1(record.command);
    publicationPolicy = assertMediaProxyMasterR2PrivatePublicationPolicyV1(
      record.publicationPolicy,
    );
    runtimePolicy = assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(
      record.runtimePolicy,
    );
  } catch {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_NESTED_CONTRACT_INVALID');
  }
  const tenantId = identity(record.tenantId, 'TENANT_ID');
  const userId = identity(record.userId, 'USER_ID');
  const orgId = record.orgId === null ? null : identity(record.orgId, 'ORG_ID');
  const assetId = identity(record.assetId, 'ASSET_ID');
  if (record.commandSha256 !== command.commandSha256) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_COMMAND_HASH_MISMATCH');
  }
  assertSourceScope({ command, userId, orgId, assetId });
  if (command.policy.maxOutputBytes > publicationPolicy.maximumSingleRequestBytes) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_PUBLICATION_CAPABILITY_MISMATCH');
  }
  const normalized = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
    tenantId,
    userId,
    orgId,
    assetId,
    command,
    commandSha256: command.commandSha256,
    publicationPolicy,
    runtimePolicy,
    budgetReservation: normalizeBudgetReservation(record.budgetReservation),
  } satisfies MediaProxyMasterTranscodeDurableJobInputV1;
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8')
    > MAX_JSON_PAYLOAD_BYTES) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_PAYLOAD_TOO_LARGE');
  }
  return deepFreezeEditronJsonV1(normalized);
}

export function buildMediaProxyMasterTranscodeDurableJobContractV1(
  input: Omit<MediaProxyMasterTranscodeDurableJobInputV1, 'version' | 'commandSha256'>,
) {
  const payload = assertMediaProxyMasterTranscodeDurableJobInputV1({
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
    ...input,
    commandSha256: input.command.commandSha256,
  });
  const bindingSha256 = hashDurableWorkflowJobJsonV1(payload);
  const operationSha256 = hashDurableWorkflowJobJsonV1({
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
    bindingSha256,
  });
  const command = payload.command;
  const runtime = payload.runtimePolicy;
  const timeMap = command.masterTimeMap;
  const dependencies = [
    dependency('budget-reservation', '1', payload.budgetReservation.bindingSha256),
    dependency('command', '1', command.commandSha256),
    dependency('epoch-index-content', '3', timeMap.epochIndexContentSha256),
    dependency('execution-budget-policy', '1',
      runtime.executionBudgetPolicy.policySha256),
    dependency('heartbeat-policy', '1', runtime.heartbeatPolicy.policySha256),
    dependency('master-source-version', '1',
      command.masterSourceVersion.sourceVersionSha256),
    dependency('master-storage-version', '1',
      command.masterSourceVersion.storageVersion.storageVersionSha256),
    dependency('publication-policy', '1', payload.publicationPolicy.policySha256),
    dependency('retry-policy', '1', runtime.retryPolicy.policySha256),
    dependency('runtime-policy', '1', runtime.bindingSha256),
    dependency('source-binding', '1', timeMap.sourceBindingSha256),
    dependency('technical-observation', '1', timeMap.technicalObservationSha256),
    dependency('time-map-binding', '3', timeMap.mapBindingSha256),
    dependency('time-map-state', '3', timeMap.sourcePtsCadenceMapStateSha256V3),
    dependency('time-map-terminal', '3', timeMap.terminalReceiptSha256),
    dependency('time-map-verification', '3', timeMap.verificationSha256),
    dependency('toolchain-compatibility', '1',
      runtime.executionProfile.compatibilityReceiptSha256),
    dependency('transcode-policy', '1', command.policy.policySha256),
    dependency('worker-image', '1', runtime.executionProfile.workerImageDigest),
  ].sort((left, right) => left.dependencyId < right.dependencyId ? -1 : 1);
  return deepFreezeEditronJsonV1({
    payload,
    bindingSha256,
    dependencies,
    operationIdentity: `mpmtrans_${operationSha256}`,
  });
}

export function assertMediaProxyMasterTranscodeDurableJobV1(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableJobInputV1 {
  let contract: ReturnType<typeof buildMediaProxyMasterTranscodeDurableJobContractV1>;
  let payload: MediaProxyMasterTranscodeDurableJobInputV1;
  try {
    payload = assertMediaProxyMasterTranscodeDurableJobInputV1(job.input.payload);
    const { version: _version, commandSha256: _commandSha256, ...request } = payload;
    contract = buildMediaProxyMasterTranscodeDurableJobContractV1(request);
  } catch {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_CONTRACT_INVALID');
  }
  const retentionMs = Date.parse(job.expiresAt) - Date.parse(job.createdAt);
  if (job.version !== DURABLE_WORKFLOW_JOB_VERSION_V1
    || job.operationOwner !== MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1
    || job.operationKind !== MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1
    || job.operationId !== contract.operationIdentity
    || job.idempotencyKey !== contract.operationIdentity
    || job.parentCommandId !== null || job.parentReceiptId !== null
    || job.projectId !== null
    || job.tenantId !== payload.tenantId || job.userId !== payload.userId
    || job.orgId !== payload.orgId
    || job.input.schemaId
      !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1
    || job.input.bindingSha256 !== contract.bindingSha256
    || job.maxAttempts !== payload.runtimePolicy.lifecycle.maxAttempts
    || retentionMs !== payload.runtimePolicy.lifecycle.retentionMs
    || hashDurableWorkflowJobJsonV1(job.budgetReservation)
      !== hashDurableWorkflowJobJsonV1(payload.budgetReservation)
    || hashDurableWorkflowJobJsonV1(job.dependencies)
      !== hashDurableWorkflowJobJsonV1(contract.dependencies)) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_BINDING_MISMATCH');
  }
  return payload;
}

export async function createOrGetMediaProxyMasterTranscodeDurableJobV1(
  input: Readonly<{
    jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet'>;
    request: Parameters<typeof buildMediaProxyMasterTranscodeDurableJobContractV1>[0];
    now?: Date;
  }>,
): Promise<Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  created: boolean;
}>> {
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_NOW_INVALID');
  }
  const contract = buildMediaProxyMasterTranscodeDurableJobContractV1(input.request);
  const expiresAtMs = now.getTime()
    + contract.payload.runtimePolicy.lifecycle.retentionMs;
  if (!Number.isSafeInteger(expiresAtMs)) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_EXPIRY_INVALID');
  }
  return input.jobStore.createOrGet({
    tenantId: contract.payload.tenantId,
    userId: contract.payload.userId,
    orgId: contract.payload.orgId,
    projectId: null,
    operationOwner: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
    operationKind: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
    operationId: contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: contract.payload.budgetReservation,
    maxAttempts: contract.payload.runtimePolicy.lifecycle.maxAttempts,
    expiresAt: new Date(expiresAtMs),
  }, now);
}

function normalizeLifecycle(value: unknown) {
  const record = object(value, 'MEDIA_PROXY_MASTER_DURABLE_LIFECYCLE_INVALID');
  exactKeys(record, ['maxAttempts', 'retentionMs'],
    'MEDIA_PROXY_MASTER_DURABLE_LIFECYCLE_FIELDS_INVALID');
  return Object.freeze({
    maxAttempts: positiveInteger(record.maxAttempts, MAX_ATTEMPTS, 'MAX_ATTEMPTS'),
    retentionMs: positiveInteger(record.retentionMs, MAX_RETENTION_MS, 'RETENTION_MS'),
  });
}

function normalizePolicyOwner(value: unknown, label: string) {
  const record = object(value, `MEDIA_PROXY_MASTER_DURABLE_${label}_POLICY_INVALID`);
  exactKeys(record, ['ownerId', 'ownerVersion', 'policySha256'],
    `MEDIA_PROXY_MASTER_DURABLE_${label}_POLICY_FIELDS_INVALID`);
  return Object.freeze({
    ownerId: identity(record.ownerId, `${label}_POLICY_OWNER_ID`),
    ownerVersion: identity(record.ownerVersion, `${label}_POLICY_OWNER_VERSION`),
    policySha256: sha256(record.policySha256, `${label}_POLICY`),
  });
}

function normalizeExecutionProfile(value: unknown) {
  const record = object(value, 'MEDIA_PROXY_MASTER_DURABLE_EXECUTION_PROFILE_INVALID');
  exactKeys(record, [
    'compatibilityReceiptSha256', 'ffmpegVersion', 'ffprobeVersion',
    'platform', 'workerImageDigest',
  ], 'MEDIA_PROXY_MASTER_DURABLE_EXECUTION_PROFILE_FIELDS_INVALID');
  return Object.freeze({
    workerImageDigest: sha256(record.workerImageDigest, 'WORKER_IMAGE'),
    platform: identity(record.platform, 'PLATFORM'),
    ffmpegVersion: boundedText(record.ffmpegVersion, 'FFMPEG_VERSION'),
    ffprobeVersion: boundedText(record.ffprobeVersion, 'FFPROBE_VERSION'),
    compatibilityReceiptSha256: sha256(
      record.compatibilityReceiptSha256,
      'TOOLCHAIN_COMPATIBILITY_RECEIPT',
    ),
  });
}

function normalizeBudgetReservation(value: unknown): DurableWorkflowJobBudgetReservationV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_DURABLE_BUDGET_INVALID');
  exactKeys(record, ['bindingSha256', 'reservationId'],
    'MEDIA_PROXY_MASTER_DURABLE_BUDGET_FIELDS_INVALID');
  return Object.freeze({
    reservationId: identity(record.reservationId, 'BUDGET_RESERVATION_ID'),
    bindingSha256: sha256(record.bindingSha256, 'BUDGET_RESERVATION'),
  });
}

function assertSourceScope(input: Readonly<{
  command: MediaProxyMasterTranscodeCommandV1;
  userId: string;
  orgId: string | null;
  assetId: string;
}>): void {
  const source = input.command.masterSourceVersion;
  if (source.assetId !== input.assetId) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_ASSET_SCOPE_MISMATCH');
  }
  if (source.owner.kind === 'USER') {
    if (source.owner.userId !== input.userId || input.orgId !== null) {
      fail('MEDIA_PROXY_MASTER_DURABLE_JOB_OWNER_SCOPE_MISMATCH');
    }
    return;
  }
  if (!input.orgId || source.owner.orgId !== input.orgId) {
    fail('MEDIA_PROXY_MASTER_DURABLE_JOB_OWNER_SCOPE_MISMATCH');
  }
}

function dependency(dependencyId: string, dependencyVersion: string, bindingSha256: string) {
  return Object.freeze({ dependencyId, dependencyVersion, bindingSha256 });
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

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) fail(`MEDIA_PROXY_MASTER_DURABLE_${label}_INVALID`);
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`MEDIA_PROXY_MASTER_DURABLE_${label}_SHA256_INVALID`);
  }
  return value;
}

function boundedText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length < 1 || value.length > 512
    || /[\u0000-\u001F\u007F]/.test(value)) {
    fail(`MEDIA_PROXY_MASTER_DURABLE_${label}_INVALID`);
  }
  return value;
}

function positiveInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    fail(`MEDIA_PROXY_MASTER_DURABLE_${label}_INVALID`);
  }
  return Number(value);
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeDurableJobBindingErrorV1(code);
}
