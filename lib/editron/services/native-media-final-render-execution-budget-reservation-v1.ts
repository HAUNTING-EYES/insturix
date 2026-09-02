import type { DurableWorkflowJobBudgetReservationV1 }
  from './durable-workflow-job-v1';
import {
  assertNativeMediaFinalRenderExecutionBudgetPolicyV1,
  calculateNativeMediaFinalRenderExecutionBudgetCostV1,
  NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
  type NativeMediaFinalRenderExecutionBudgetPolicyV1,
  type NativeMediaFinalRenderExecutionBudgetUsageV1,
} from './native-media-final-render-execution-budget-policy-v1';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_AUTHORIZATION_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_RESERVATION_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_RESERVATION_V1' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type NativeMediaFinalRenderExecutionBudgetScopeV1 = Readonly<{
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  sequenceId: string;
  projectRevisionSha256: string;
  admissionReceiptSha256: string;
  exactSourceRequestSha256: string;
}>;

type MaximumUsageV1 = Readonly<Omit<
  NativeMediaFinalRenderExecutionBudgetUsageV1,
  'usageEvidenceSha256'
>>;

export interface NativeMediaFinalRenderExecutionBudgetAuthorizationV1 {
  version: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V1;
  authority: 'FINANCE_POLICY_BOUND_EXACT_RENDER_EXECUTION_AUTHORIZATION';
  ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  policySha256: string;
  scope: NativeMediaFinalRenderExecutionBudgetScopeV1;
  maximumUsage: MaximumUsageV1;
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

export interface NativeMediaFinalRenderExecutionBudgetReservationV1 {
  version: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_RESERVATION_VERSION_V1;
  authority: 'EXACT_RENDER_INTERNAL_COST_RESERVATION_NO_CUSTOMER_CHARGE';
  ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  policySha256: string;
  authorizationSha256: string;
  scope: NativeMediaFinalRenderExecutionBudgetScopeV1;
  reservationId: string;
  status: 'RESERVED';
  reservedNanoUsd: string;
  reservedAt: string;
  expiresAt: string;
  reservationSha256: string;
}

export function createNativeMediaFinalRenderExecutionBudgetAuthorizationV1(
  input: Readonly<{
    policy: unknown;
    scope: NativeMediaFinalRenderExecutionBudgetScopeV1;
    maximumUsage: MaximumUsageV1;
    approvedBy: string;
    approvedAt: string;
    expiresAt: string;
  }>,
): Readonly<NativeMediaFinalRenderExecutionBudgetAuthorizationV1> {
  const policy = assertNativeMediaFinalRenderExecutionBudgetPolicyV1(input.policy);
  const scope = normalizeScope(input.scope);
  const maximumUsageEvidenceSha256 = hashEditronCanonicalJsonV1({
    kind: 'EXACT_RENDER_AUTHORIZED_MAXIMUM_USAGE_V1',
    scope,
    maximumUsage: input.maximumUsage,
  });
  const maximumCost = calculateNativeMediaFinalRenderExecutionBudgetCostV1(
    policy,
    { ...input.maximumUsage, usageEvidenceSha256: maximumUsageEvidenceSha256 },
  );
  if ((maximumCost.usage.encodedFrameAttempts === '0'
      && maximumCost.usage.artifactBytesWritten === '0'
      && maximumCost.usage.artifactBytesVerified === '0')
    || maximumCost.totalCostNanoUsd === '0') {
    fail('AUTHORIZATION_MAXIMUM_USAGE_EMPTY');
  }
  const approvedAt = timestamp(input.approvedAt, 'AUTHORIZATION_APPROVED_AT');
  const expiresAt = timestamp(input.expiresAt, 'AUTHORIZATION_EXPIRES_AT');
  if (Date.parse(approvedAt) >= Date.parse(expiresAt)
    || Date.parse(approvedAt) < Date.parse(policy.effectiveAt)
    || Date.parse(expiresAt) > Date.parse(policy.expiresAt)) {
    fail('AUTHORIZATION_POLICY_WINDOW_MISMATCH');
  }
  const material = {
    version: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_AUTHORIZATION_VERSION_V1,
    authority: 'FINANCE_POLICY_BOUND_EXACT_RENDER_EXECUTION_AUTHORIZATION' as const,
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    scope,
    maximumUsage: {
      encodedFrameAttempts: maximumCost.usage.encodedFrameAttempts,
      artifactBytesWritten: maximumCost.usage.artifactBytesWritten,
      artifactBytesVerified: maximumCost.usage.artifactBytesVerified,
    },
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

export function assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1(
  value: unknown,
  policy: unknown,
): Readonly<NativeMediaFinalRenderExecutionBudgetAuthorizationV1> {
  const candidate = record(value, 'AUTHORIZATION');
  const approval = record(candidate.approval, 'AUTHORIZATION_APPROVAL');
  const rebound = createNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
    policy,
    scope: record(candidate.scope, 'AUTHORIZATION_SCOPE') as never,
    maximumUsage: record(candidate.maximumUsage, 'AUTHORIZATION_MAXIMUM_USAGE') as never,
    approvedBy: text(approval.approvedBy, 'AUTHORIZATION_APPROVER'),
    approvedAt: text(approval.approvedAt, 'AUTHORIZATION_APPROVED_AT'),
    expiresAt: text(approval.expiresAt, 'AUTHORIZATION_EXPIRES_AT'),
  });
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('AUTHORIZATION_INVALID');
  }
  return rebound;
}

export function createNativeMediaFinalRenderExecutionBudgetReservationV1(
  input: Readonly<{
    policy: unknown;
    authorization: unknown;
    reservationId: string;
    reservedAt: string;
  }>,
): Readonly<NativeMediaFinalRenderExecutionBudgetReservationV1> {
  const policy = assertNativeMediaFinalRenderExecutionBudgetPolicyV1(input.policy);
  const authorization = assertNativeMediaFinalRenderExecutionBudgetAuthorizationV1(
    input.authorization,
    policy,
  );
  const reservedAt = timestamp(input.reservedAt, 'RESERVATION_RESERVED_AT');
  if (Date.parse(reservedAt) < Date.parse(authorization.approval.approvedAt)
    || Date.parse(reservedAt) >= Date.parse(authorization.approval.expiresAt)) {
    fail('RESERVATION_TIME_INVALID');
  }
  const material = {
    version: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_RESERVATION_VERSION_V1,
    authority: 'EXACT_RENDER_INTERNAL_COST_RESERVATION_NO_CUSTOMER_CHARGE' as const,
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

export function assertNativeMediaFinalRenderExecutionBudgetReservationV1(
  value: unknown,
  authorization: unknown,
  policy: unknown,
): Readonly<NativeMediaFinalRenderExecutionBudgetReservationV1> {
  const candidate = record(value, 'RESERVATION');
  const rebound = createNativeMediaFinalRenderExecutionBudgetReservationV1({
    policy,
    authorization,
    reservationId: text(candidate.reservationId, 'RESERVATION_ID'),
    reservedAt: text(candidate.reservedAt, 'RESERVATION_RESERVED_AT'),
  });
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('RESERVATION_INVALID');
  }
  return rebound;
}

export function nativeMediaFinalRenderExecutionBudgetReservationRefV1(
  reservation: Readonly<NativeMediaFinalRenderExecutionBudgetReservationV1>,
): Readonly<DurableWorkflowJobBudgetReservationV1> {
  return Object.freeze({
    reservationId: reservation.reservationId,
    bindingSha256: reservation.reservationSha256,
  });
}

function normalizeScope(value: unknown): NativeMediaFinalRenderExecutionBudgetScopeV1 {
  const candidate = record(value, 'SCOPE');
  const normalized = {
    tenantId: identity(candidate.tenantId, 'SCOPE_TENANT_ID'),
    userId: identity(candidate.userId, 'SCOPE_USER_ID'),
    orgId: candidate.orgId === null ? null : identity(candidate.orgId, 'SCOPE_ORG_ID'),
    projectId: identity(candidate.projectId, 'SCOPE_PROJECT_ID'),
    sequenceId: identity(candidate.sequenceId, 'SCOPE_SEQUENCE_ID'),
    projectRevisionSha256: sha256(candidate.projectRevisionSha256, 'SCOPE_PROJECT_REVISION'),
    admissionReceiptSha256: sha256(candidate.admissionReceiptSha256, 'SCOPE_ADMISSION'),
    exactSourceRequestSha256: sha256(candidate.exactSourceRequestSha256, 'SCOPE_REQUEST'),
  };
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(normalized)) {
    fail('SCOPE_INVALID');
  }
  return Object.freeze(normalized);
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  return value;
}

function fail(code: string): never {
  throw new Error(`NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_${code}`);
}
