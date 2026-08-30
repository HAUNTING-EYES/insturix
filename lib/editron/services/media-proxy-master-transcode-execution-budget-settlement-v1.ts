import {
  assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  calculateMediaProxyMasterTranscodeExecutionBudgetCostV1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  type MediaProxyMasterTranscodeExecutionBudgetUsageV1,
} from './media-proxy-master-transcode-execution-budget-policy-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  assertMediaProxyMasterTranscodeExecutionBudgetReservationV1,
  type MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
} from './media-proxy-master-transcode-execution-budget-reservation-v1';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_SETTLEMENT_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_SETTLEMENT_V1' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1 =
  | 'METERED_TRUSTED_TRANSCODE'
  | 'RELEASED_NO_EXECUTION'
  | 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN'
  | 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN';

export type MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1 = Readonly<{
  jobId: string;
  jobStatus: 'completed' | 'cancelled' | 'dead_letter';
  terminalDisposition: 'PASS' | 'UNVERIFIABLE' | 'CANCELLED' | null;
  attemptCount: number;
  terminalArtifactSha256: string;
}>;

export type MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1 = Readonly<
  Omit<MediaProxyMasterTranscodeExecutionBudgetUsageV1, 'usageEvidenceSha256'>
>;

export interface MediaProxyMasterTranscodeExecutionBudgetSettlementV1 {
  version:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_SETTLEMENT_VERSION_V1;
  authority: 'PROXY_TRANSCODE_INTERNAL_COST_SETTLEMENT_NO_CUSTOMER_CHARGE';
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1;
  ownerVersion: string;
  policySha256: string;
  authorizationSha256: string;
  reservationId: string;
  reservationSha256: string;
  mode: MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1;
  terminalEvidence: MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1;
  terminalEvidenceSha256: string;
  usage: Readonly<MediaProxyMasterTranscodeExecutionBudgetUsageV1> | null;
  costReceiptSha256: string | null;
  settledNanoUsd: string;
  releasedNanoUsd: string;
  settledAt: string;
  settlementSha256: string;
}

export function createMediaProxyMasterTranscodeExecutionBudgetSettlementV1(
  input: Readonly<{
    policy: unknown;
    authorization: unknown;
    reservation: unknown;
    mode: MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1;
    terminalEvidence:
      MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1;
    usage: MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1 | null;
    settledAt: string;
  }>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetSettlementV1> {
  const policy = assertMediaProxyMasterTranscodeExecutionBudgetPolicyV1(
    input.policy,
  );
  const authorization =
    assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1(
      input.authorization,
      policy,
    );
  const reservation =
    assertMediaProxyMasterTranscodeExecutionBudgetReservationV1(
      input.reservation,
      authorization,
      policy,
    );
  const terminalEvidence = normalizeTerminalEvidence(input.terminalEvidence);
  const terminalEvidenceSha256 = hashEditronCanonicalJsonV1({
    kind: 'PROXY_TRANSCODE_EXECUTION_BUDGET_TERMINAL_EVIDENCE_V1',
    reservationSha256: reservation.reservationSha256,
    terminalEvidence,
  });
  const outcome = settlementOutcome({
    mode: input.mode,
    usage: input.usage,
    terminalEvidence,
    terminalEvidenceSha256,
    policy,
    authorization,
  });
  const settledAt = timestamp(input.settledAt, 'SETTLED_AT');
  if (Date.parse(settledAt) < Date.parse(reservation.reservedAt)) {
    fail('SETTLEMENT_TIME_INVALID');
  }
  const material = {
    version:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_SETTLEMENT_VERSION_V1,
    authority:
      'PROXY_TRANSCODE_INTERNAL_COST_SETTLEMENT_NO_CUSTOMER_CHARGE' as const,
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    authorizationSha256: authorization.authorizationSha256,
    reservationId: reservation.reservationId,
    reservationSha256: reservation.reservationSha256,
    mode: input.mode,
    terminalEvidence,
    terminalEvidenceSha256,
    ...outcome,
    settledAt,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    settlementSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterTranscodeExecutionBudgetSettlementV1(
  value: unknown,
  authorization: unknown,
  reservation: unknown,
  policy: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetSettlementV1> {
  const candidate = record(value, 'SETTLEMENT');
  const rebound = createMediaProxyMasterTranscodeExecutionBudgetSettlementV1({
    policy,
    authorization,
    reservation,
    mode: text(candidate.mode, 'SETTLEMENT_MODE') as
      MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1,
    terminalEvidence: record(
      candidate.terminalEvidence,
      'TERMINAL_EVIDENCE',
    ) as never,
    usage: candidate.usage === null
      ? null
      : record(candidate.usage, 'SETTLEMENT_USAGE') as never,
    settledAt: text(candidate.settledAt, 'SETTLED_AT'),
  });
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(rebound)) {
    fail('SETTLEMENT_INVALID');
  }
  return rebound;
}

function settlementOutcome(input: Readonly<{
  mode: MediaProxyMasterTranscodeExecutionBudgetSettlementModeV1;
  usage: MediaProxyMasterTranscodeExecutionBudgetSettlementUsageV1 | null;
  terminalEvidence: MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1;
  terminalEvidenceSha256: string;
  policy: Readonly<MediaProxyMasterTranscodeExecutionBudgetPolicyV1>;
  authorization:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1>;
}>) {
  const reserved = BigInt(input.authorization.maximumCostNanoUsd);
  if (input.mode === 'METERED_TRUSTED_TRANSCODE') {
    if (input.terminalEvidence.jobStatus !== 'completed'
      || input.terminalEvidence.terminalDisposition !== 'PASS'
      || input.terminalEvidence.attemptCount !== 1
      || !input.usage) {
      fail('SETTLEMENT_METERED_EVIDENCE_INVALID');
    }
    const receipt = calculateMediaProxyMasterTranscodeExecutionBudgetCostV1(
      input.policy,
      { ...input.usage, usageEvidenceSha256: input.terminalEvidenceSha256 },
    );
    assertUsageWithinAuthorization(receipt.usage, input.authorization);
    const settled = BigInt(receipt.totalCostNanoUsd);
    if (settled > reserved) fail('SETTLEMENT_EXCEEDS_RESERVATION');
    return Object.freeze({
      usage: receipt.usage,
      costReceiptSha256: receipt.receiptSha256,
      settledNanoUsd: settled.toString(),
      releasedNanoUsd: (reserved - settled).toString(),
    });
  }
  if (input.usage !== null) fail('SETTLEMENT_USAGE_UNEXPECTED');
  if (input.mode === 'RELEASED_NO_EXECUTION') {
    if (input.terminalEvidence.jobStatus !== 'cancelled'
      || input.terminalEvidence.terminalDisposition !== 'CANCELLED'
      || input.terminalEvidence.attemptCount !== 0) {
      fail('SETTLEMENT_RELEASE_EVIDENCE_INVALID');
    }
    return Object.freeze({
      usage: null,
      costReceiptSha256: null,
      settledNanoUsd: '0',
      releasedNanoUsd: reserved.toString(),
    });
  }
  if (input.mode === 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN') {
    if (input.terminalEvidence.jobStatus !== 'completed'
      || input.terminalEvidence.terminalDisposition !== 'PASS'
      || input.terminalEvidence.attemptCount <= 1) {
      fail('SETTLEMENT_PASS_RETRY_EVIDENCE_INVALID');
    }
    return conservativeMaximum(input.authorization);
  }
  if (input.mode !== 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN'
    || (input.terminalEvidence.jobStatus === 'completed'
      && input.terminalEvidence.terminalDisposition === 'PASS')
    || (input.terminalEvidence.jobStatus === 'cancelled'
      && input.terminalEvidence.attemptCount === 0)) {
    fail('SETTLEMENT_CONSERVATIVE_EVIDENCE_INVALID');
  }
  return conservativeMaximum(input.authorization);
}

function conservativeMaximum(
  authorization:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1>,
) {
  return Object.freeze({
    usage: null,
    costReceiptSha256: authorization.maximumCostReceiptSha256,
    settledNanoUsd: authorization.maximumCostNanoUsd,
    releasedNanoUsd: '0',
  });
}

function assertUsageWithinAuthorization(
  usage: Readonly<MediaProxyMasterTranscodeExecutionBudgetUsageV1>,
  authorization:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetAuthorizationV1>,
): void {
  for (const meter of [
    'sourceBytesRead',
    'encodedFrameAttempts',
    'processMilliseconds',
    'artifactBytesWritten',
    'artifactBytesVerified',
  ] as const) {
    if (BigInt(usage[meter]) > BigInt(authorization.maximumUsage[meter])) {
      fail('SETTLEMENT_USAGE_EXCEEDS_AUTHORIZATION');
    }
  }
}

function normalizeTerminalEvidence(
  value: unknown,
): MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1 {
  const candidate = record(value, 'TERMINAL_EVIDENCE');
  const status = text(candidate.jobStatus, 'TERMINAL_JOB_STATUS');
  const disposition = candidate.terminalDisposition === null
    ? null
    : text(candidate.terminalDisposition, 'TERMINAL_DISPOSITION');
  const attemptCount = candidate.attemptCount;
  if (!['completed', 'cancelled', 'dead_letter'].includes(status)
    || ![null, 'PASS', 'UNVERIFIABLE', 'CANCELLED'].includes(disposition)
    || !Number.isSafeInteger(attemptCount) || Number(attemptCount) < 0
    || (status === 'dead_letter') !== (disposition === null)
    || (status === 'cancelled') !== (disposition === 'CANCELLED')
    || (status === 'completed'
      && (Number(attemptCount) < 1
        || (disposition !== 'PASS' && disposition !== 'UNVERIFIABLE')))
    || (status === 'dead_letter' && Number(attemptCount) < 1)) {
    fail('TERMINAL_EVIDENCE_INVALID');
  }
  const normalized = {
    jobId: identity(candidate.jobId, 'TERMINAL_JOB_ID'),
    jobStatus: status as
      MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1['jobStatus'],
    terminalDisposition: disposition as
      MediaProxyMasterTranscodeExecutionBudgetTerminalEvidenceV1[
        'terminalDisposition'
      ],
    attemptCount: Number(attemptCount),
    terminalArtifactSha256: sha256(
      candidate.terminalArtifactSha256,
      'TERMINAL_ARTIFACT',
    ),
  };
  if (canonicalizeEditronJsonV1(candidate)
    !== canonicalizeEditronJsonV1(normalized)) {
    fail('TERMINAL_EVIDENCE_INVALID');
  }
  return Object.freeze(normalized);
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
