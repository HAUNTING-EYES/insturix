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
  assertMediaProxyMasterR2PreparedArtifactPolicyV1,
  type MediaProxyMasterR2PreparedArtifactPolicyV1,
} from './media-proxy-master-r2-prepared-artifact-policy-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV2,
  type MediaProxyMasterR2PrivatePublicationPolicyV2,
} from './media-proxy-master-r2-private-publication-policy-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
  assertMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  type MediaProxyMasterTranscodeDurableRuntimePolicyV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  assertMediaProxyMasterTranscodeCommandV1,
  type MediaProxyMasterTranscodeCommandV1,
} from './media-proxy-master-trusted-transcode-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V2' as const;

const MAX_JSON_PAYLOAD_BYTES = 256 * 1_024;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodeDurableJobInputV2 = Readonly<{
  version: typeof MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2;
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  command: MediaProxyMasterTranscodeCommandV1;
  commandSha256: string;
  publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV2;
  preparedArtifactPolicy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  runtimePolicy: MediaProxyMasterTranscodeDurableRuntimePolicyV1;
  budgetReservation: DurableWorkflowJobBudgetReservationV1;
}>;

export class MediaProxyMasterTranscodeDurableJobBindingErrorV2 extends Error {}

export function assertMediaProxyMasterTranscodeDurableJobInputV2(
  value: unknown,
): MediaProxyMasterTranscodeDurableJobInputV2 {
  const record = object(value, 'JOB_INPUT_INVALID');
  exactKeys(record, [
    'assetId', 'budgetReservation', 'command', 'commandSha256', 'orgId',
    'preparedArtifactPolicy', 'publicationPolicy', 'runtimePolicy', 'tenantId',
    'userId', 'version',
  ], 'JOB_INPUT_FIELDS_INVALID');
  if (record.version
    !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2) {
    fail('JOB_INPUT_VERSION_INVALID');
  }
  let command: MediaProxyMasterTranscodeCommandV1;
  let publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV2;
  let preparedArtifactPolicy: MediaProxyMasterR2PreparedArtifactPolicyV1;
  let runtimePolicy: MediaProxyMasterTranscodeDurableRuntimePolicyV1;
  try {
    command = assertMediaProxyMasterTranscodeCommandV1(record.command);
    publicationPolicy = assertMediaProxyMasterR2PrivatePublicationPolicyV2(
      record.publicationPolicy,
    );
    preparedArtifactPolicy =
      assertMediaProxyMasterR2PreparedArtifactPolicyV1(
        record.preparedArtifactPolicy,
      );
    runtimePolicy = assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(
      record.runtimePolicy,
    );
  } catch {
    fail('NESTED_CONTRACT_INVALID');
  }
  if (preparedArtifactPolicy.publicationPolicy.policySha256
      !== publicationPolicy.policySha256) {
    fail('PREPARED_PUBLICATION_POLICY_MISMATCH');
  }
  const tenantId = identity(record.tenantId, 'TENANT_ID');
  const userId = identity(record.userId, 'USER_ID');
  const orgId = record.orgId === null ? null : identity(record.orgId, 'ORG_ID');
  const assetId = identity(record.assetId, 'ASSET_ID');
  if (record.commandSha256 !== command.commandSha256) {
    fail('COMMAND_HASH_MISMATCH');
  }
  assertSourceScope({ command, userId, orgId, assetId });
  if (command.policy.maxOutputBytes
      > publicationPolicy.multipart.maximumObjectBytes
    || command.policy.maxOutputBytes
      > preparedArtifactPolicy.chunkPlan.maximumObjectBytes) {
    fail('PUBLICATION_CAPABILITY_MISMATCH');
  }
  const normalized = {
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
    tenantId,
    userId,
    orgId,
    assetId,
    command,
    commandSha256: command.commandSha256,
    publicationPolicy,
    preparedArtifactPolicy,
    runtimePolicy,
    budgetReservation: normalizeBudgetReservation(record.budgetReservation),
  } satisfies MediaProxyMasterTranscodeDurableJobInputV2;
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8')
    > MAX_JSON_PAYLOAD_BYTES) {
    fail('PAYLOAD_TOO_LARGE');
  }
  return deepFreezeEditronJsonV1(normalized);
}

export function buildMediaProxyMasterTranscodeDurableJobContractV2(
  input: Omit<
    MediaProxyMasterTranscodeDurableJobInputV2,
    'version' | 'commandSha256'
  >,
) {
  const payload = assertMediaProxyMasterTranscodeDurableJobInputV2({
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
    ...input,
    commandSha256: input.command.commandSha256,
  });
  const bindingSha256 = hashDurableWorkflowJobJsonV1(payload);
  const operationSha256 = hashDurableWorkflowJobJsonV1({
    version: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
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
    dependency('prepared-artifact-policy', '1',
      payload.preparedArtifactPolicy.policySha256),
    dependency('publication-policy', '2', payload.publicationPolicy.policySha256),
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
    operationIdentity: `mpmtrans2_${operationSha256}`,
  });
}

export function assertMediaProxyMasterTranscodeDurableJobV2(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): MediaProxyMasterTranscodeDurableJobInputV2 {
  let contract: ReturnType<
    typeof buildMediaProxyMasterTranscodeDurableJobContractV2
  >;
  let payload: MediaProxyMasterTranscodeDurableJobInputV2;
  try {
    payload = assertMediaProxyMasterTranscodeDurableJobInputV2(
      job.input.payload,
    );
    const { version: _version, commandSha256: _commandSha256, ...request } =
      payload;
    contract = buildMediaProxyMasterTranscodeDurableJobContractV2(request);
  } catch {
    fail('JOB_CONTRACT_INVALID');
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
      !== MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2
    || job.input.bindingSha256 !== contract.bindingSha256
    || job.maxAttempts !== payload.runtimePolicy.lifecycle.maxAttempts
    || retentionMs !== payload.runtimePolicy.lifecycle.retentionMs
    || hashDurableWorkflowJobJsonV1(job.budgetReservation)
      !== hashDurableWorkflowJobJsonV1(payload.budgetReservation)
    || hashDurableWorkflowJobJsonV1(job.dependencies)
      !== hashDurableWorkflowJobJsonV1(contract.dependencies)) {
    fail('JOB_BINDING_MISMATCH');
  }
  return payload;
}

export async function createOrGetMediaProxyMasterTranscodeDurableJobV2(
  input: Readonly<{
    jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet'>;
    request: Parameters<
      typeof buildMediaProxyMasterTranscodeDurableJobContractV2
    >[0];
    now?: Date;
  }>,
): Promise<Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  created: boolean;
}>> {
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    fail('NOW_INVALID');
  }
  const contract = buildMediaProxyMasterTranscodeDurableJobContractV2(
    input.request,
  );
  const expiresAtMs = now.getTime()
    + contract.payload.runtimePolicy.lifecycle.retentionMs;
  if (!Number.isSafeInteger(expiresAtMs)) fail('EXPIRY_INVALID');
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
      schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: contract.payload.budgetReservation,
    maxAttempts: contract.payload.runtimePolicy.lifecycle.maxAttempts,
    expiresAt: new Date(expiresAtMs),
  }, now);
}

function normalizeBudgetReservation(
  value: unknown,
): DurableWorkflowJobBudgetReservationV1 {
  const record = object(value, 'BUDGET_INVALID');
  exactKeys(record, ['bindingSha256', 'reservationId'],
    'BUDGET_FIELDS_INVALID');
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
  if (source.assetId !== input.assetId) fail('ASSET_SCOPE_MISMATCH');
  if (source.owner.kind === 'USER') {
    if (source.owner.userId !== input.userId || input.orgId !== null) {
      fail('OWNER_SCOPE_MISMATCH');
    }
    return;
  }
  if (!input.orgId || source.owner.orgId !== input.orgId) {
    fail('OWNER_SCOPE_MISMATCH');
  }
}

function dependency(
  dependencyId: string,
  dependencyVersion: string,
  bindingSha256: string,
) {
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
  if (!IDENTITY.test(normalized)) fail(`${label}_INVALID`);
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`${label}_SHA256_INVALID`);
  }
  return value;
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeDurableJobBindingErrorV2(
    `MEDIA_PROXY_MASTER_DURABLE_JOB_V2_${code}`,
  );
}
