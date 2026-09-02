import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
  resolveMediaSourceAudioEvidenceBackfillRecoveryLeaseExpiryV1,
  resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
} from './media-source-audio-evidence-backfill-recovery-attempt-policy-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  assertMediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-v1';

export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_STATE_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_STATE_V1' as const;

export type MediaSourceAudioEvidenceBackfillRecoverySweepStatusV1 =
  | 'PENDING'
  | 'RUNNING'
  | 'RETRY_WAIT'
  | 'COMPLETE'
  | 'RETRY_EXHAUSTED';

type SweepStateMaterialV1 = Readonly<{
  schemaVersion: 1;
  kind:
    typeof MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_STATE_KIND_V1;
  sweepIntentSha256: string;
  attemptPolicySha256: string;
  intent: MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1;
  attemptPolicy: MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1;
  recordVersion: number;
  status: MediaSourceAudioEvidenceBackfillRecoverySweepStatusV1;
  attemptCount: number;
  lastAttemptSha256: string | null;
  lastAttemptedAt: string | null;
  nextAttemptAt: string | null;
  claimToken: string | null;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  previousRecordSha256: string | null;
}>;

export type MediaSourceAudioEvidenceBackfillRecoverySweepStateV1 =
  SweepStateMaterialV1 & Readonly<{
    recordSha256: string;
  }>;

export type MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1 = Readonly<{
  sweepIntentSha256: string;
  claimedRecordSha256: string;
  attemptNumber: number;
  previousAttemptSha256: string | null;
  claimToken: string;
  claimedAt: string;
  leaseExpiresAt: string;
  intent: MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1;
  attemptPolicy: MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1;
}>;

const MATERIAL_KEYS_V1 = Object.freeze([
  'attemptCount',
  'attemptPolicy',
  'attemptPolicySha256',
  'claimedAt',
  'claimToken',
  'createdAt',
  'intent',
  'kind',
  'lastAttemptedAt',
  'lastAttemptSha256',
  'leaseExpiresAt',
  'nextAttemptAt',
  'previousRecordSha256',
  'recordVersion',
  'schemaVersion',
  'status',
  'sweepIntentSha256',
  'updatedAt',
] as const);

export class MediaSourceAudioEvidenceBackfillRecoverySweepStateErrorV1
  extends Error {
  constructor(public readonly code: string) {
    super('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_STATE_' + code);
    this.name = 'MediaSourceAudioEvidenceBackfillRecoverySweepStateErrorV1';
  }
}

export function createMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
  intentValue: unknown,
  attemptPolicyValue: unknown,
): MediaSourceAudioEvidenceBackfillRecoverySweepStateV1 {
  const intent = assertMediaSourceAudioEvidenceBackfillRecoverySweepIntentV1(
    intentValue,
  );
  const attemptPolicy =
    assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1(
      attemptPolicyValue,
    );
  return freezeState({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_STATE_KIND_V1,
    sweepIntentSha256: intent.sweepIntentSha256,
    attemptPolicySha256: attemptPolicy.policySha256,
    intent,
    attemptPolicy,
    recordVersion: 1,
    status: 'PENDING',
    attemptCount: 0,
    lastAttemptSha256: null,
    lastAttemptedAt: null,
    nextAttemptAt: intent.selectedAt,
    claimToken: null,
    claimedAt: null,
    leaseExpiresAt: null,
    createdAt: intent.selectedAt,
    updatedAt: intent.selectedAt,
    previousRecordSha256: null,
  });
}

export function claimMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
  currentValue: unknown,
  input: Readonly<{
    claimToken: string;
    claimedAt: string;
  }>,
): Readonly<{
  state: MediaSourceAudioEvidenceBackfillRecoverySweepStateV1;
  claim: MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1;
}> {
  const current = assertMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
    currentValue,
  );
  const claimToken = identifier(input.claimToken, 'CLAIM_TOKEN_INVALID');
  const claimedAt = timestamp(input.claimedAt, 'CLAIMED_AT_INVALID');
  if (current.status === 'COMPLETE'
    || current.status === 'RETRY_EXHAUSTED') fail('CLAIM_TERMINAL');
  if (Date.parse(claimedAt) < Date.parse(current.updatedAt)
    || current.attemptCount >= current.attemptPolicy.maxAttempts) {
    fail('CLAIM_NOT_ELIGIBLE');
  }
  if (current.status === 'PENDING' || current.status === 'RETRY_WAIT') {
    if (current.nextAttemptAt === null
      || Date.parse(current.nextAttemptAt) > Date.parse(claimedAt)) {
      fail('CLAIM_NOT_DUE');
    }
  } else if (current.status === 'RUNNING') {
    if (current.leaseExpiresAt === null
      || Date.parse(current.leaseExpiresAt) > Date.parse(claimedAt)) {
      fail('CLAIM_LEASE_HELD');
    }
  }
  const leaseExpiresAt =
    resolveMediaSourceAudioEvidenceBackfillRecoveryLeaseExpiryV1(
      current.attemptPolicy,
      claimedAt,
    );
  const state = freezeState({
    ...stateMaterial(current),
    recordVersion: safeAdd(current.recordVersion, 1),
    status: 'RUNNING',
    nextAttemptAt: null,
    claimToken,
    claimedAt,
    leaseExpiresAt,
    updatedAt: claimedAt,
    previousRecordSha256: current.recordSha256,
  });
  return deepFreezeEditronJsonV1({
    state,
    claim: {
      sweepIntentSha256: state.sweepIntentSha256,
      claimedRecordSha256: state.recordSha256,
      attemptNumber: safeAdd(state.attemptCount, 1),
      previousAttemptSha256: state.lastAttemptSha256,
      claimToken,
      claimedAt,
      leaseExpiresAt,
      intent: state.intent,
      attemptPolicy: state.attemptPolicy,
    },
  });
}

export function settleMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
  currentValue: unknown,
  input: Readonly<{
    claimToken: string;
    attempt: MediaSourceAudioEvidenceBackfillRecoveryAttemptV1;
  }>,
): MediaSourceAudioEvidenceBackfillRecoverySweepStateV1 {
  const current = assertMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
    currentValue,
  );
  if (current.status !== 'RUNNING'
    || current.claimToken !== identifier(input.claimToken, 'CLAIM_TOKEN_INVALID')
    || current.claimedAt === null) {
    fail('SETTLEMENT_CLAIM_INVALID');
  }
  const attempt = assertMediaSourceAudioEvidenceBackfillRecoveryAttemptV1(
    input.attempt,
    current.intent,
  );
  if (attempt.attemptNumber !== safeAdd(current.attemptCount, 1)
    || attempt.previousAttemptSha256 !== current.lastAttemptSha256
    || Date.parse(attempt.attemptedAt) < Date.parse(current.claimedAt)) {
    fail('SETTLEMENT_ATTEMPT_INVALID');
  }
  const retryAt = attempt.disposition === 'RETRY_REQUIRED'
    ? resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      current.attemptPolicy,
      attempt.attemptNumber,
      attempt.attemptedAt,
    )
    : null;
  const status: MediaSourceAudioEvidenceBackfillRecoverySweepStatusV1 =
    attempt.disposition === 'COMPLETE'
      ? 'COMPLETE'
      : retryAt === null ? 'RETRY_EXHAUSTED' : 'RETRY_WAIT';
  return freezeState({
    ...stateMaterial(current),
    recordVersion: safeAdd(current.recordVersion, 1),
    status,
    attemptCount: attempt.attemptNumber,
    lastAttemptSha256: attempt.attemptSha256,
    lastAttemptedAt: attempt.attemptedAt,
    nextAttemptAt: retryAt,
    claimToken: null,
    claimedAt: null,
    leaseExpiresAt: null,
    updatedAt: attempt.attemptedAt,
    previousRecordSha256: current.recordSha256,
  });
}

export function assertMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
  value: unknown,
): MediaSourceAudioEvidenceBackfillRecoverySweepStateV1 {
  const record = objectRecord(value, 'RECORD_INVALID');
  exactKeys(record, [...MATERIAL_KEYS_V1, 'recordSha256'], 'FIELDS_INVALID');
  const intent = assertMediaSourceAudioEvidenceBackfillRecoverySweepIntentV1(
    record.intent,
  );
  const attemptPolicy =
    assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1(
      record.attemptPolicy,
    );
  const status = sweepStatus(record.status);
  const recordVersion = positiveInteger(record.recordVersion, 'VERSION_INVALID');
  const attemptCount = integer(
    record.attemptCount,
    0,
    attemptPolicy.maxAttempts,
    'ATTEMPT_COUNT_INVALID',
  );
  const createdAt = timestamp(record.createdAt, 'CREATED_AT_INVALID');
  const updatedAt = timestamp(record.updatedAt, 'UPDATED_AT_INVALID');
  const lastAttemptSha256 = nullableSha256(record.lastAttemptSha256);
  const lastAttemptedAt = nullableTimestamp(
    record.lastAttemptedAt,
    'LAST_ATTEMPTED_AT_INVALID',
  );
  const nextAttemptAt = nullableTimestamp(
    record.nextAttemptAt,
    'NEXT_ATTEMPT_AT_INVALID',
  );
  const claimToken = nullableIdentifier(record.claimToken, 'CLAIM_TOKEN_INVALID');
  const claimedAt = nullableTimestamp(record.claimedAt, 'CLAIMED_AT_INVALID');
  const leaseExpiresAt = nullableTimestamp(
    record.leaseExpiresAt,
    'LEASE_EXPIRES_AT_INVALID',
  );
  const previousRecordSha256 = nullableSha256(record.previousRecordSha256);
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_STATE_KIND_V1
    || record.sweepIntentSha256 !== intent.sweepIntentSha256
    || record.attemptPolicySha256 !== attemptPolicy.policySha256
    || createdAt !== intent.selectedAt
    || Date.parse(updatedAt) < Date.parse(createdAt)
    || (recordVersion === 1) !== (previousRecordSha256 === null)
    || (attemptCount === 0) !== (lastAttemptSha256 === null)
    || (attemptCount === 0) !== (lastAttemptedAt === null)
    || (lastAttemptedAt !== null
      && Date.parse(lastAttemptedAt) > Date.parse(updatedAt))) {
    fail('INVARIANT_INVALID');
  }
  const expectedRetryAt = attemptCount === 0 || lastAttemptedAt === null
    ? null
    : resolveMediaSourceAudioEvidenceBackfillRecoveryRetryAtV1(
      attemptPolicy,
      attemptCount,
      lastAttemptedAt,
    );
  assertStatusInvariant({
    status,
    recordVersion,
    attemptCount,
    maxAttempts: attemptPolicy.maxAttempts,
    createdAt,
    updatedAt,
    lastAttemptedAt,
    nextAttemptAt,
    claimToken,
    claimedAt,
    leaseExpiresAt,
    expectedRetryAt,
  });
  const material: SweepStateMaterialV1 = deepFreezeEditronJsonV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_STATE_KIND_V1,
    sweepIntentSha256: intent.sweepIntentSha256,
    attemptPolicySha256: attemptPolicy.policySha256,
    intent,
    attemptPolicy,
    recordVersion,
    status,
    attemptCount,
    lastAttemptSha256,
    lastAttemptedAt,
    nextAttemptAt,
    claimToken,
    claimedAt,
    leaseExpiresAt,
    createdAt,
    updatedAt,
    previousRecordSha256,
  });
  const recordSha256 = sha256(record.recordSha256, 'RECORD_HASH_INVALID');
  if (recordSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('HASH_MISMATCH');
  }
  return deepFreezeEditronJsonV1({ ...material, recordSha256 });
}

function assertStatusInvariant(input: Readonly<{
  status: MediaSourceAudioEvidenceBackfillRecoverySweepStatusV1;
  recordVersion: number;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  lastAttemptedAt: string | null;
  nextAttemptAt: string | null;
  claimToken: string | null;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  expectedRetryAt: string | null;
}>): void {
  const unclaimed = input.claimToken === null
    && input.claimedAt === null
    && input.leaseExpiresAt === null;
  if (input.status === 'PENDING') {
    if (input.recordVersion !== 1
      || input.attemptCount !== 0
      || !unclaimed
      || input.nextAttemptAt !== input.createdAt
      || input.updatedAt !== input.createdAt) fail('PENDING_INVARIANT_INVALID');
    return;
  }
  if (input.status === 'RUNNING') {
    if (input.recordVersion < (2 * input.attemptCount) + 2
      || input.attemptCount >= input.maxAttempts
      || input.nextAttemptAt !== null
      || input.claimToken === null
      || input.claimedAt === null
      || input.leaseExpiresAt === null
      || input.updatedAt !== input.claimedAt
      || (input.expectedRetryAt !== null
        && Date.parse(input.claimedAt) < Date.parse(input.expectedRetryAt))
      || Date.parse(input.leaseExpiresAt) <= Date.parse(input.claimedAt)) {
      fail('RUNNING_INVARIANT_INVALID');
    }
    return;
  }
  if (!unclaimed
    || input.recordVersion < (2 * input.attemptCount) + 1
    || input.lastAttemptedAt === null
    || input.updatedAt !== input.lastAttemptedAt) {
    fail('SETTLED_INVARIANT_INVALID');
  }
  if (input.status === 'RETRY_WAIT') {
    if (input.attemptCount < 1
      || input.attemptCount >= input.maxAttempts
      || input.nextAttemptAt === null
      || input.nextAttemptAt !== input.expectedRetryAt) {
      fail('RETRY_WAIT_INVARIANT_INVALID');
    }
    return;
  }
  if (input.nextAttemptAt !== null || input.attemptCount < 1) {
    fail('TERMINAL_INVARIANT_INVALID');
  }
  if (input.status === 'RETRY_EXHAUSTED'
    && (input.attemptCount !== input.maxAttempts
      || input.expectedRetryAt !== null)) {
    fail('EXHAUSTED_INVARIANT_INVALID');
  }
}

function freezeState(
  input: SweepStateMaterialV1,
): MediaSourceAudioEvidenceBackfillRecoverySweepStateV1 {
  const material = deepFreezeEditronJsonV1(input);
  return assertMediaSourceAudioEvidenceBackfillRecoverySweepStateV1({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

function stateMaterial(
  state: MediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
): SweepStateMaterialV1 {
  const { recordSha256: _recordSha256, ...material } = state;
  return material;
}

function sweepStatus(
  value: unknown,
): MediaSourceAudioEvidenceBackfillRecoverySweepStatusV1 {
  if (value !== 'PENDING'
    && value !== 'RUNNING'
    && value !== 'RETRY_WAIT'
    && value !== 'COMPLETE'
    && value !== 'RETRY_EXHAUSTED') fail('STATUS_INVALID');
  return value;
}

function timestamp(value: unknown, code: string): string {
  if (typeof value !== 'string') fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(code);
  }
  return value;
}

function nullableTimestamp(value: unknown, code: string): string | null {
  return value === null ? null : timestamp(value, code);
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) fail(code);
  return value;
}

function nullableIdentifier(value: unknown, code: string): string | null {
  return value === null ? null : identifier(value, code);
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function nullableSha256(value: unknown): string | null {
  return value === null ? null : sha256(value, 'SHA256_INVALID');
}

function positiveInteger(value: unknown, code: string): number {
  return integer(value, 1, Number.MAX_SAFE_INTEGER, code);
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value)
    || Number(value) < minimum
    || Number(value) > maximum) fail(code);
  return Number(value);
}

function safeAdd(value: number, amount: number): number {
  const result = value + amount;
  if (!Number.isSafeInteger(result)) fail('INTEGER_OVERFLOW');
  return result;
}

function objectRecord(
  value: unknown,
  code: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) fail(code);
}

function fail(code: string): never {
  throw new MediaSourceAudioEvidenceBackfillRecoverySweepStateErrorV1(code);
}
