import type { DurableWorkflowJobBudgetReservationV1 }
  from './durable-workflow-job-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV1,
  type MediaProxyMasterR2PrivatePublicationPolicyV1,
} from './media-proxy-master-r2-private-publication-policy-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV1,
  assertMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  type MediaProxyMasterTranscodeDurableJobInputV1,
  type MediaProxyMasterTranscodeDurableRuntimePolicyV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  calculateMediaProxyMasterTranscodeExecutionBudgetCostV1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  type MediaProxyMasterTranscodeExecutionBudgetUsageV1,
} from './media-proxy-master-transcode-execution-budget-policy-v1';
import {
  assertMediaProxyMasterTranscodeCommandV1,
  type MediaProxyMasterTranscodeCommandV1,
} from './media-proxy-master-trusted-transcode-v1';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_AUTHORIZATION_V1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_RESERVATION_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_RESERVATION_V1' as const;

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_DECIMAL_DIGITS = 40;

export type MediaProxyMasterTranscodeExecutionBudgetScopeV1 = Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  masterSourceVersionSha256: string;
  masterStorageVersionSha256: string;
  commandSha256: string;
  runtimePolicyBindingSha256: string;
  publicationPolicySha256: string;
}>;

export type MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1 = Readonly<
  Omit<MediaProxyMasterTranscodeExecutionBudgetUsageV1, 'usageEvidenceSha256'>
>;

export interface MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1 {
  version:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V1;
  authority: 'FINANCE_POLICY_BOUND_PROXY_TRANSCODE_EXECUTION_AUTHORIZATION';
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  policySha256: string;
  scope: MediaProxyMasterTranscodeExecutionBudgetScopeV1;
  maximumUsage: MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1;
  maximumUsageEvidenceSha256: string;
  maximumCostNanoUsd: string;
  maximumCostReceiptSha256: string;
  approval: Readonly<{
    approvedBy: string;
    approvedAt: string;
    expiresAt: string;
  }>;
  authorizationSha256: string;
}

export interface MediaProxyMasterTranscodeExecutionBudgetReservationV1 {
  version:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_RESERVATION_VERSION_V1;
  authority: 'PROXY_TRANSCODE_INTERNAL_COST_RESERVATION_NO_CUSTOMER_CHARGE';
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  policySha256: string;
  authorizationSha256: string;
  scope: MediaProxyMasterTranscodeExecutionBudgetScopeV1;
  reservationId: string;
  status: 'RESERVED';
  reservedNanoUsd: string;
  reservedAt: string;
  expiresAt: string;
  reservationSha256: string;
}

type AuthorizationEvidenceInputV1 = Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  command: unknown;
  runtimePolicy: unknown;
  publicationPolicy: unknown;
}>;

export function deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1(
  commandInput: unknown,
  runtimePolicyInput: unknown,
): MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1 {
  const command = assertMediaProxyMasterTranscodeCommandV1(commandInput);
  const runtimePolicy = assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(
    runtimePolicyInput,
  );
  const attempts = BigInt(runtimePolicy.lifecycle.maxAttempts);
  return deepFreezeEditronJsonV1({
    sourceBytesRead: product(command.policy.maxSourceBytes, attempts),
    encodedFrameAttempts: product(command.masterTimeMap.totalFrameCount, attempts),
    processMilliseconds: product(command.policy.timeoutMs, attempts),
    artifactBytesWritten: product(command.policy.maxOutputBytes, attempts),
    artifactBytesVerified: product(command.policy.maxOutputBytes, attempts),
  });
}

export function createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(
  input: Readonly<{
    policy: unknown;
    evidence: AuthorizationEvidenceInputV1;
    approvedBy: string;
    approvedAt: string;
    expiresAt: string;
  }>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    input.policy,
  );
  const basis = authorizationBasis(policy, input.evidence);
  return createAuthorizationFromBasis({
    policy,
    ...basis,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt,
  });
}

export function assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(
  value: unknown,
  policyInput: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1> {
  const candidate = record(value, 'AUTHORIZATION');
  const approval = record(candidate.approval, 'AUTHORIZATION_APPROVAL');
  const rebound = createAuthorizationFromBasis({
    policy: assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(policyInput),
    scope: candidate.scope as never,
    maximumUsage: candidate.maximumUsage as never,
    approvedBy: text(approval.approvedBy, 'AUTHORIZATION_APPROVER'),
    approvedAt: text(approval.approvedAt, 'AUTHORIZATION_APPROVED_AT'),
    expiresAt: text(approval.expiresAt, 'AUTHORIZATION_EXPIRES_AT'),
  });
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('AUTHORIZATION_INVALID');
  }
  return rebound;
}

export function assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV1(
  value: unknown,
  policyInput: unknown,
  jobInputValue: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    policyInput,
  );
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(value, policy);
  const jobInput = assertMediaProxyMasterTranscodeDurableJobInputV1(jobInputValue);
  const expected = createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1({
    policy,
    evidence: evidenceFromJob(jobInput),
    approvedBy: authorization.approval.approvedBy,
    approvedAt: authorization.approval.approvedAt,
    expiresAt: authorization.approval.expiresAt,
  });
  if (canonicalizeEditronJsonV1(authorization)
    !== canonicalizeEditronJsonV1(expected)) {
    fail('AUTHORIZATION_JOB_BINDING_MISMATCH');
  }
  return authorization;
}

export function createMediaProxyMasterTranscodeExecutionBudgetReservationV1(
  input: Readonly<{
    policy: unknown;
    authorization: unknown;
    reservationId: string;
    reservedAt: string;
  }>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV1> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    input.policy,
  );
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(
      input.authorization,
      policy,
    );
  const reservedAt = timestamp(input.reservedAt, 'RESERVATION_RESERVED_AT');
  if (Date.parse(reservedAt) < Date.parse(authorization.approval.approvedAt)
    || Date.parse(reservedAt) >= Date.parse(authorization.approval.expiresAt)) {
    fail('RESERVATION_TIME_INVALID');
  }
  const material = {
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_RESERVATION_VERSION_V1,
    authority:
      'PROXY_TRANSCODE_INTERNAL_COST_RESERVATION_NO_CUSTOMER_CHARGE' as const,
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    authorizationSha256: authorization.authorizationSha256,
    scope: authorization.scope,
    reservationId: identity(input.reservationId, 'RESERVATION_ID'),
    status: 'RESERVED' as const,
    reservedNanoUsd: authorization.maximumCostNanoUsd,
    reservedAt,
    expiresAt: authorization.approval.expiresAt,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    reservationSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterTranscodeExecutionBudgetReservationV1(
  value: unknown,
  authorization: unknown,
  policy: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV1> {
  const candidate = record(value, 'RESERVATION');
  const rebound = createMediaProxyMasterTranscodeExecutionBudgetReservationV1({
    policy,
    authorization,
    reservationId: text(candidate.reservationId, 'RESERVATION_ID'),
    reservedAt: text(candidate.reservedAt, 'RESERVATION_RESERVED_AT'),
  });
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('RESERVATION_INVALID');
  }
  return rebound;
}

export function mediaProxyMasterTranscodeExecutionBudgetReservationRefV1(
  reservation: Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV1>,
): Readonly<DurableWorkflowJobBudgetReservationV1> {
  return Object.freeze({
    reservationId: reservation.reservationId,
    bindingSha256: reservation.reservationSha256,
  });
}

function authorizationBasis(
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  evidence: AuthorizationEvidenceInputV1,
): Readonly<{
  scope: MediaProxyMasterTranscodeExecutionBudgetScopeV1;
  maximumUsage: MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1;
}> {
  const command = assertMediaProxyMasterTranscodeCommandV1(evidence.command);
  const runtimePolicy = assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(
    evidence.runtimePolicy,
  );
  const publicationPolicy = assertMediaProxyMasterR2PrivatePublicationPolicyV1(
    evidence.publicationPolicy,
  );
  assertPolicyBinding(policy, runtimePolicy);
  const scope = createScope(evidence, command, runtimePolicy, publicationPolicy);
  return Object.freeze({
    scope,
    maximumUsage:
      deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1(
        command,
        runtimePolicy,
      ),
  });
}

function createAuthorizationFromBasis(input: Readonly<{
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>;
  scope: unknown;
  maximumUsage: unknown;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
}>): Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    input.policy,
  );
  const scope = normalizeScope(input.scope);
  const maximumUsage = normalizeMaximumUsage(input.maximumUsage);
  const maximumUsageEvidenceSha256 = hashEditronCanonicalJsonV1({
    kind: 'PROXY_TRANSCODE_AUTHORIZED_MAXIMUM_USAGE_V1',
    scope,
    maximumUsage,
  });
  const maximumCost = calculateMediaProxyMasterTranscodeExecutionBudgetCostV1(
    policy,
    { ...maximumUsage, usageEvidenceSha256: maximumUsageEvidenceSha256 },
  );
  if (maximumCost.totalCostNanoUsd === '0') {
    fail('AUTHORIZATION_MAXIMUM_COST_EMPTY');
  }
  const approvedAt = timestamp(input.approvedAt, 'AUTHORIZATION_APPROVED_AT');
  const expiresAt = timestamp(input.expiresAt, 'AUTHORIZATION_EXPIRES_AT');
  if (Date.parse(approvedAt) >= Date.parse(expiresAt)
    || Date.parse(approvedAt) < Date.parse(policy.effectiveAt)
    || Date.parse(expiresAt) > Date.parse(policy.expiresAt)) {
    fail('AUTHORIZATION_POLICY_WINDOW_MISMATCH');
  }
  const material = {
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V1,
    authority:
      'FINANCE_POLICY_BOUND_PROXY_TRANSCODE_EXECUTION_AUTHORIZATION' as const,
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    scope,
    maximumUsage,
    maximumUsageEvidenceSha256,
    maximumCostNanoUsd: maximumCost.totalCostNanoUsd,
    maximumCostReceiptSha256: maximumCost.receiptSha256,
    approval: {
      approvedBy: identity(input.approvedBy, 'AUTHORIZATION_APPROVER'),
      approvedAt,
      expiresAt,
    },
  };
  return deepFreezeEditronJsonV1({
    ...material,
    authorizationSha256: hashEditronCanonicalJsonV1(material),
  });
}

function createScope(
  evidence: AuthorizationEvidenceInputV1,
  command: Readonly<MediaProxyMasterTranscodeCommandV1>,
  runtimePolicy: Readonly<MediaProxyMasterTranscodeDurableRuntimePolicyV1>,
  publicationPolicy: Readonly<MediaProxyMasterR2PrivatePublicationPolicyV1>,
): MediaProxyMasterTranscodeExecutionBudgetScopeV1 {
  const tenantId = identity(evidence.tenantId, 'SCOPE_TENANT_ID');
  const userId = identity(evidence.userId, 'SCOPE_USER_ID');
  const orgId = evidence.orgId === null
    ? null
    : identity(evidence.orgId, 'SCOPE_ORG_ID');
  const assetId = identity(evidence.assetId, 'SCOPE_ASSET_ID');
  const source = command.masterSourceVersion;
  if (source.assetId !== assetId) fail('SCOPE_ASSET_MISMATCH');
  if (source.owner.kind === 'USER') {
    if (source.owner.userId !== userId || orgId !== null) {
      fail('SCOPE_OWNER_MISMATCH');
    }
  } else if (!orgId || source.owner.orgId !== orgId) {
    fail('SCOPE_OWNER_MISMATCH');
  }
  if (source.byteLength > command.policy.maxSourceBytes) {
    fail('SCOPE_SOURCE_RESOURCE_LIMIT_EXCEEDED');
  }
  if (command.policy.maxOutputBytes
    > publicationPolicy.maximumSingleRequestBytes) {
    fail('SCOPE_PUBLICATION_CAPABILITY_MISMATCH');
  }
  return deepFreezeEditronJsonV1({
    tenantId,
    userId,
    orgId,
    assetId,
    masterSourceVersionSha256: source.sourceVersionSha256,
    masterStorageVersionSha256:
      source.storageVersion.storageVersionSha256,
    commandSha256: command.commandSha256,
    runtimePolicyBindingSha256: runtimePolicy.bindingSha256,
    publicationPolicySha256: publicationPolicy.policySha256,
  });
}

function normalizeScope(
  value: unknown,
): MediaProxyMasterTranscodeExecutionBudgetScopeV1 {
  const candidate = record(value, 'SCOPE');
  const normalized = {
    tenantId: identity(candidate.tenantId, 'SCOPE_TENANT_ID'),
    userId: identity(candidate.userId, 'SCOPE_USER_ID'),
    orgId: candidate.orgId === null
      ? null
      : identity(candidate.orgId, 'SCOPE_ORG_ID'),
    assetId: identity(candidate.assetId, 'SCOPE_ASSET_ID'),
    masterSourceVersionSha256: sha256(
      candidate.masterSourceVersionSha256,
      'SCOPE_MASTER_SOURCE_VERSION',
    ),
    masterStorageVersionSha256: sha256(
      candidate.masterStorageVersionSha256,
      'SCOPE_MASTER_STORAGE_VERSION',
    ),
    commandSha256: sha256(candidate.commandSha256, 'SCOPE_COMMAND'),
    runtimePolicyBindingSha256: sha256(
      candidate.runtimePolicyBindingSha256,
      'SCOPE_RUNTIME_POLICY',
    ),
    publicationPolicySha256: sha256(
      candidate.publicationPolicySha256,
      'SCOPE_PUBLICATION_POLICY',
    ),
  };
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(normalized)) {
    fail('SCOPE_INVALID');
  }
  return deepFreezeEditronJsonV1(normalized);
}

function normalizeMaximumUsage(
  value: unknown,
): MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1 {
  const candidate = record(value, 'MAXIMUM_USAGE');
  const normalized = {
    sourceBytesRead: positiveDecimal(
      candidate.sourceBytesRead,
      'MAXIMUM_SOURCE_BYTES_READ',
    ),
    encodedFrameAttempts: positiveDecimal(
      candidate.encodedFrameAttempts,
      'MAXIMUM_ENCODED_FRAME_ATTEMPTS',
    ),
    processMilliseconds: positiveDecimal(
      candidate.processMilliseconds,
      'MAXIMUM_PROCESS_MILLISECONDS',
    ),
    artifactBytesWritten: positiveDecimal(
      candidate.artifactBytesWritten,
      'MAXIMUM_ARTIFACT_BYTES_WRITTEN',
    ),
    artifactBytesVerified: positiveDecimal(
      candidate.artifactBytesVerified,
      'MAXIMUM_ARTIFACT_BYTES_VERIFIED',
    ),
  };
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(normalized)) {
    fail('MAXIMUM_USAGE_INVALID');
  }
  return deepFreezeEditronJsonV1(normalized);
}

function assertPolicyBinding(
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  runtimePolicy: Readonly<MediaProxyMasterTranscodeDurableRuntimePolicyV1>,
): void {
  const binding = runtimePolicy.executionBudgetPolicy;
  if (binding.ownerId !== policy.ownerId
    || binding.ownerVersion !== policy.ownerVersion
    || binding.policySha256 !== policy.policySha256) {
    fail('RUNTIME_POLICY_BINDING_MISMATCH');
  }
}

function evidenceFromJob(
  jobInput: Readonly<MediaProxyMasterTranscodeDurableJobInputV1>,
): AuthorizationEvidenceInputV1 {
  return Object.freeze({
    tenantId: jobInput.tenantId,
    userId: jobInput.userId,
    orgId: jobInput.orgId,
    assetId: jobInput.assetId,
    command: jobInput.command,
    runtimePolicy: jobInput.runtimePolicy,
    publicationPolicy: jobInput.publicationPolicy,
  });
}

function product(value: string | number, multiplier: bigint): string {
  const result = (BigInt(value) * multiplier).toString();
  if (!DECIMAL.test(result) || result.length > MAX_DECIMAL_DIGITS) {
    fail('MAXIMUM_USAGE_OVERFLOW');
  }
  return result;
}

function positiveDecimal(value: unknown, label: string): string {
  const result = text(value, label);
  if (!DECIMAL.test(result) || result === '0'
    || result.length > MAX_DECIMAL_DIGITS) {
    fail(`${label}_INVALID`);
  }
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds)
    || new Date(milliseconds).toISOString() !== result) {
    fail(`${label}_INVALID`);
  }
  return result;
}

function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!IDENTITY.test(result)) fail(`${label}_INVALID`);
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SHA256.test(result)) fail(`${label}_INVALID`);
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label}_INVALID`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  return value;
}

function fail(code: string): never {
  throw new Error(
    `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_${code}`,
  );
}
