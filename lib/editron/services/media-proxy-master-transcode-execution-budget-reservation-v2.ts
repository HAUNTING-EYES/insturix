import type { DurableWorkflowJobBudgetReservationV1 }
  from './durable-workflow-job-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactPolicyV1,
  type MediaProxyMasterR2PreparedArtifactPolicyV1,
} from './media-proxy-master-r2-prepared-artifact-policy-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV2,
  type MediaProxyMasterR2PrivatePublicationPolicyV2,
} from './media-proxy-master-r2-private-publication-policy-v2';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  assertMediaProxyMasterTranscodeDurableRuntimePolicyV1,
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
  deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1,
} from './media-proxy-master-transcode-execution-budget-reservation-v1';
import {
  assertMediaProxyMasterTranscodeCommandV1,
  type MediaProxyMasterTranscodeCommandV1,
} from './media-proxy-master-trusted-transcode-v1';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_AUTHORIZATION_V2' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_RESERVATION_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_RESERVATION_V2' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2' as const;

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_DECIMAL_DIGITS = 40;

const artifactAccountingProfileMaterial = {
  version:
    MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_VERSION_V2,
  authority: 'FINANCE_BOUND_REMOTE_ARTIFACT_BYTE_DERIVATION' as const,
  meterInterpretation:
    'REMOTE_STORED_BYTES_WRITTEN_OR_FULL_GET_VERIFIED' as const,
  localValidationCostDisposition:
    'UNMETERED_REQUIRES_V2_ATTEMPT_TELEMETRY_BEFORE_EXACT_SETTLEMENT' as const,
  providerRequestCostDisposition:
    'UNMETERED_REQUIRES_SUCCESSOR_FINANCE_RATE_POLICY' as const,
  remoteArtifactWritesPerAttempt: {
    preparedArtifactCopies: 1,
    preparedManifestCopies: 1,
    finalPublicationCopies: 1,
  },
  remoteArtifactVerificationsPerAttempt: {
    preparedRecoveryCopies: 1,
    preparedReopenCopies: 1,
    preparedManifestCopies: 2,
    finalPublicationCopies: 1,
  },
} as const;

export const MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2 =
  deepFreezeEditronJsonV1({
    ...artifactAccountingProfileMaterial,
    profileSha256: hashEditronCanonicalJsonV1(
      artifactAccountingProfileMaterial,
    ),
  });

export type MediaProxyMasterTranscodeExecutionBudgetScopeV2 = Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  masterSourceVersionSha256: string;
  masterStorageVersionSha256: string;
  commandSha256: string;
  runtimePolicyBindingSha256: string;
  publicationPolicySha256: string;
  preparedArtifactPolicySha256: string;
  artifactAccountingProfileSha256: string;
}>;

export type MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2 = Readonly<
  Omit<MediaProxyMasterTranscodeExecutionBudgetUsageV1, 'usageEvidenceSha256'>
>;

export interface MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2 {
  version:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V2;
  authority:
    'FINANCE_POLICY_BOUND_PROXY_TRANSCODE_PREPARED_PUBLICATION_AUTHORIZATION';
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  policySha256: string;
  scope: MediaProxyMasterTranscodeExecutionBudgetScopeV2;
  maximumUsage: MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2;
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

export interface MediaProxyMasterTranscodeExecutionBudgetReservationV2 {
  version:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_RESERVATION_VERSION_V2;
  authority:
    'PROXY_TRANSCODE_PREPARED_PUBLICATION_INTERNAL_COST_RESERVATION_NO_CUSTOMER_CHARGE';
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  policySha256: string;
  authorizationSha256: string;
  scope: MediaProxyMasterTranscodeExecutionBudgetScopeV2;
  reservationId: string;
  status: 'RESERVED';
  reservedNanoUsd: string;
  reservedAt: string;
  expiresAt: string;
  reservationSha256: string;
}

type AuthorizationEvidenceInputV2 = Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  assetId: string;
  command: unknown;
  runtimePolicy: unknown;
  publicationPolicy: unknown;
  preparedArtifactPolicy: unknown;
}>;

export function deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2(
  commandInput: unknown,
  runtimePolicyInput: unknown,
  preparedArtifactPolicyInput: unknown,
): MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2 {
  const command = assertMediaProxyMasterTranscodeCommandV1(commandInput);
  const runtimePolicy = assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(
    runtimePolicyInput,
  );
  const preparedArtifactPolicy =
    assertMediaProxyMasterR2PreparedArtifactPolicyV1(
      preparedArtifactPolicyInput,
    );
  const base = deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1(
    command,
    runtimePolicy,
  );
  const attempts = BigInt(runtimePolicy.lifecycle.maxAttempts);
  const outputBytes = BigInt(command.policy.maxOutputBytes);
  const manifestBytes = BigInt(preparedArtifactPolicy.maximumManifestBytes);
  const accounting =
    MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2;
  const writtenOutputCopies = BigInt(
    accounting.remoteArtifactWritesPerAttempt.preparedArtifactCopies
      + accounting.remoteArtifactWritesPerAttempt.finalPublicationCopies,
  );
  const verifiedOutputCopies = BigInt(
    accounting.remoteArtifactVerificationsPerAttempt.preparedRecoveryCopies
      + accounting.remoteArtifactVerificationsPerAttempt.preparedReopenCopies
      + accounting.remoteArtifactVerificationsPerAttempt.finalPublicationCopies,
  );
  return deepFreezeEditronJsonV1({
    ...base,
    artifactBytesWritten: boundedProduct(
      outputBytes * writtenOutputCopies
        + manifestBytes * BigInt(
          accounting.remoteArtifactWritesPerAttempt.preparedManifestCopies,
        ),
      attempts,
      'MAXIMUM_ARTIFACT_BYTES_WRITTEN',
    ),
    artifactBytesVerified: boundedProduct(
      outputBytes * verifiedOutputCopies
        + manifestBytes * BigInt(
          accounting
            .remoteArtifactVerificationsPerAttempt.preparedManifestCopies,
        ),
      attempts,
      'MAXIMUM_ARTIFACT_BYTES_VERIFIED',
    ),
  });
}

export function createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2(
  input: Readonly<{
    policy: unknown;
    evidence: AuthorizationEvidenceInputV2;
    approvedBy: string;
    approvedAt: string;
    expiresAt: string;
  }>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    input.policy,
  );
  return createAuthorizationFromBasis({
    policy,
    ...authorizationBasis(policy, input.evidence),
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt,
  });
}

export function assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2(
  value: unknown,
  policyInput: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2> {
  const candidate = record(value, 'AUTHORIZATION');
  const approval = record(candidate.approval, 'AUTHORIZATION_APPROVAL');
  const rebound = createAuthorizationFromBasis({
    policy: assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(policyInput),
    scope: candidate.scope,
    maximumUsage: candidate.maximumUsage,
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

export function assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV2(
  value: unknown,
  policyInput: unknown,
  jobInputValue: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    policyInput,
  );
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2(value, policy);
  const jobInput = assertMediaProxyMasterTranscodeDurableJobInputV2(
    jobInputValue,
  );
  const expected = createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2({
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

export function createMediaProxyMasterTranscodeExecutionBudgetReservationV2(
  input: Readonly<{
    policy: unknown;
    authorization: unknown;
    reservationId: string;
    reservedAt: string;
  }>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV2> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    input.policy,
  );
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2(
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
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_RESERVATION_VERSION_V2,
    authority:
      'PROXY_TRANSCODE_PREPARED_PUBLICATION_INTERNAL_COST_RESERVATION_NO_CUSTOMER_CHARGE' as const,
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

export function assertMediaProxyMasterTranscodeExecutionBudgetReservationV2(
  value: unknown,
  authorization: unknown,
  policy: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV2> {
  const candidate = record(value, 'RESERVATION');
  const rebound = createMediaProxyMasterTranscodeExecutionBudgetReservationV2({
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

export function mediaProxyMasterTranscodeExecutionBudgetReservationRefV2(
  reservation: Readonly<MediaProxyMasterTranscodeExecutionBudgetReservationV2>,
): Readonly<DurableWorkflowJobBudgetReservationV1> {
  return Object.freeze({
    reservationId: reservation.reservationId,
    bindingSha256: reservation.reservationSha256,
  });
}

function authorizationBasis(
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>,
  evidence: AuthorizationEvidenceInputV2,
): Readonly<{
  scope: MediaProxyMasterTranscodeExecutionBudgetScopeV2;
  maximumUsage: MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2;
}> {
  const command = assertMediaProxyMasterTranscodeCommandV1(evidence.command);
  const runtimePolicy = assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(
    evidence.runtimePolicy,
  );
  const publicationPolicy =
    assertMediaProxyMasterR2PrivatePublicationPolicyV2(
      evidence.publicationPolicy,
    );
  const preparedArtifactPolicy =
    assertMediaProxyMasterR2PreparedArtifactPolicyV1(
      evidence.preparedArtifactPolicy,
    );
  if (preparedArtifactPolicy.publicationPolicy.policySha256
      !== publicationPolicy.policySha256) {
    fail('PREPARED_PUBLICATION_POLICY_MISMATCH');
  }
  assertPolicyBinding(policy, runtimePolicy);
  return Object.freeze({
    scope: createScope({
      evidence,
      command,
      runtimePolicy,
      publicationPolicy,
      preparedArtifactPolicy,
    }),
    maximumUsage:
      deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2(
        command,
        runtimePolicy,
        preparedArtifactPolicy,
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
}>): Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV2> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    input.policy,
  );
  const scope = normalizeScope(input.scope);
  const maximumUsage = normalizeMaximumUsage(input.maximumUsage);
  const maximumUsageEvidenceSha256 = hashEditronCanonicalJsonV1({
    kind: 'PROXY_TRANSCODE_PREPARED_PUBLICATION_AUTHORIZED_MAXIMUM_USAGE_V2',
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
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V2,
    authority:
      'FINANCE_POLICY_BOUND_PROXY_TRANSCODE_PREPARED_PUBLICATION_AUTHORIZATION' as const,
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

function createScope(input: Readonly<{
  evidence: AuthorizationEvidenceInputV2;
  command: Readonly<MediaProxyMasterTranscodeCommandV1>;
  runtimePolicy: Readonly<MediaProxyMasterTranscodeDurableRuntimePolicyV1>;
  publicationPolicy: Readonly<MediaProxyMasterR2PrivatePublicationPolicyV2>;
  preparedArtifactPolicy:
    Readonly<MediaProxyMasterR2PreparedArtifactPolicyV1>;
}>): MediaProxyMasterTranscodeExecutionBudgetScopeV2 {
  const tenantId = identity(input.evidence.tenantId, 'SCOPE_TENANT_ID');
  const userId = identity(input.evidence.userId, 'SCOPE_USER_ID');
  const orgId = input.evidence.orgId === null
    ? null
    : identity(input.evidence.orgId, 'SCOPE_ORG_ID');
  const assetId = identity(input.evidence.assetId, 'SCOPE_ASSET_ID');
  const source = input.command.masterSourceVersion;
  if (source.assetId !== assetId) fail('SCOPE_ASSET_MISMATCH');
  if (source.owner.kind === 'USER') {
    if (source.owner.userId !== userId || orgId !== null) {
      fail('SCOPE_OWNER_MISMATCH');
    }
  } else if (!orgId || source.owner.orgId !== orgId) {
    fail('SCOPE_OWNER_MISMATCH');
  }
  if (source.byteLength > input.command.policy.maxSourceBytes) {
    fail('SCOPE_SOURCE_RESOURCE_LIMIT_EXCEEDED');
  }
  if (input.command.policy.maxOutputBytes
      > input.publicationPolicy.multipart.maximumObjectBytes
    || input.command.policy.maxOutputBytes
      > input.preparedArtifactPolicy.chunkPlan.maximumObjectBytes) {
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
    commandSha256: input.command.commandSha256,
    runtimePolicyBindingSha256: input.runtimePolicy.bindingSha256,
    publicationPolicySha256: input.publicationPolicy.policySha256,
    preparedArtifactPolicySha256: input.preparedArtifactPolicy.policySha256,
    artifactAccountingProfileSha256:
      MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2.profileSha256,
  });
}

function normalizeScope(
  value: unknown,
): MediaProxyMasterTranscodeExecutionBudgetScopeV2 {
  const candidate = record(value, 'SCOPE');
  const artifactAccountingProfileSha256 = sha256(
    candidate.artifactAccountingProfileSha256,
    'SCOPE_ARTIFACT_ACCOUNTING_PROFILE',
  );
  if (artifactAccountingProfileSha256
      !== MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2
        .profileSha256) {
    fail('SCOPE_ARTIFACT_ACCOUNTING_PROFILE_MISMATCH');
  }
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
    preparedArtifactPolicySha256: sha256(
      candidate.preparedArtifactPolicySha256,
      'SCOPE_PREPARED_ARTIFACT_POLICY',
    ),
    artifactAccountingProfileSha256,
  };
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(normalized)) {
    fail('SCOPE_INVALID');
  }
  return deepFreezeEditronJsonV1(normalized);
}

function normalizeMaximumUsage(
  value: unknown,
): MediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2 {
  const candidate = record(value, 'MAXIMUM_USAGE');
  const normalized = {
    sourceBytesRead: positiveDecimal(candidate.sourceBytesRead,
      'MAXIMUM_SOURCE_BYTES_READ'),
    encodedFrameAttempts: positiveDecimal(candidate.encodedFrameAttempts,
      'MAXIMUM_ENCODED_FRAME_ATTEMPTS'),
    processMilliseconds: positiveDecimal(candidate.processMilliseconds,
      'MAXIMUM_PROCESS_MILLISECONDS'),
    artifactBytesWritten: positiveDecimal(candidate.artifactBytesWritten,
      'MAXIMUM_ARTIFACT_BYTES_WRITTEN'),
    artifactBytesVerified: positiveDecimal(candidate.artifactBytesVerified,
      'MAXIMUM_ARTIFACT_BYTES_VERIFIED'),
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
  jobInput: Readonly<MediaProxyMasterTranscodeDurableJobInputV2>,
): AuthorizationEvidenceInputV2 {
  return Object.freeze({
    tenantId: jobInput.tenantId,
    userId: jobInput.userId,
    orgId: jobInput.orgId,
    assetId: jobInput.assetId,
    command: jobInput.command,
    runtimePolicy: jobInput.runtimePolicy,
    publicationPolicy: jobInput.publicationPolicy,
    preparedArtifactPolicy: jobInput.preparedArtifactPolicy,
  });
}

function boundedProduct(
  value: bigint,
  multiplier: bigint,
  label: string,
): string {
  const result = (value * multiplier).toString();
  if (!DECIMAL.test(result) || result === '0'
    || result.length > MAX_DECIMAL_DIGITS) {
    fail(`${label}_OVERFLOW`);
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
  throw new MediaProxyMasterTranscodeExecutionBudgetErrorV2(code);
}

export class MediaProxyMasterTranscodeExecutionBudgetErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_V2_${code}`);
    this.name = 'MediaProxyMasterTranscodeExecutionBudgetErrorV2';
  }
}
