import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS_V1 = 20;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MIN_LEASE_MS_V1 =
  1_000;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_LEASE_MS_V1 =
  24 * 60 * 60 * 1_000;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MIN_RETRY_MS_V1 =
  1_000;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_RETRY_MS_V1 =
  7 * 24 * 60 * 60 * 1_000;

type AttemptPolicyMaterialV1 = Readonly<{
  schemaVersion: 1;
  kind:
    typeof MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_KIND_V1;
  maxAttempts: number;
  leaseMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1 =
  AttemptPolicyMaterialV1 & Readonly<{
    policySha256: string;
  }>;

const MATERIAL_KEYS_V1 = Object.freeze([
  'kind',
  'leaseMs',
  'maxAttempts',
  'retryBaseMs',
  'retryMaxMs',
  'schemaVersion',
] as const);

export class MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyErrorV1
  extends Error {
  constructor(public readonly code: string) {
    super(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_' + code,
    );
    this.name =
      'MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyErrorV1';
  }
}

export function createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1(
  input: Readonly<{
    maxAttempts: number;
    leaseMs: number;
    retryBaseMs: number;
    retryMaxMs: number;
  }>,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1 {
  const material = normalizeMaterial({
    schemaVersion: 1,
    kind:
      MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_KIND_V1,
    maxAttempts: input.maxAttempts,
    leaseMs: input.leaseMs,
    retryBaseMs: input.retryBaseMs,
    retryMaxMs: input.retryMaxMs,
  });
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1 {
  const record = objectRecord(value, 'RECORD_INVALID');
  exactKeys(record, [...MATERIAL_KEYS_V1, 'policySha256'], 'FIELDS_INVALID');
  const material = normalizeMaterial(record);
  const expectedSha256 = hashEditronCanonicalJsonV1(material);
  if (record.policySha256 !== expectedSha256) fail('HASH_INVALID');
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: expectedSha256,
  });
}

export function resolveMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryLeaseExpiryV1(
  policyValue: unknown,
  claimedAtValue: unknown,
): string {
  const policy =
    assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1(policyValue);
  return addMilliseconds(
    timestamp(claimedAtValue, 'CLAIMED_AT_INVALID'),
    policy.leaseMs,
    'LEASE_EXPIRY_INVALID',
  );
}

export function resolveMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryRetryAtV1(
  policyValue: unknown,
  attemptNumberValue: unknown,
  attemptedAtValue: unknown,
): string | null {
  const policy =
    assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1(policyValue);
  const attemptNumber = integer(
    attemptNumberValue,
    1,
    policy.maxAttempts,
    'ATTEMPT_NUMBER_INVALID',
  );
  const attemptedAt = timestamp(attemptedAtValue, 'ATTEMPTED_AT_INVALID');
  if (attemptNumber >= policy.maxAttempts) return null;
  let delay = policy.retryBaseMs;
  for (let completed = 1; completed < attemptNumber; completed += 1) {
    delay = Math.min(policy.retryMaxMs, delay * 2);
  }
  return addMilliseconds(attemptedAt, delay, 'RETRY_AT_INVALID');
}

function normalizeMaterial(value: unknown): AttemptPolicyMaterialV1 {
  const record = objectRecord(value, 'MATERIAL_INVALID');
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_KIND_V1) {
    fail('VERSION_INVALID');
  }
  const maxAttempts = integer(
    record.maxAttempts,
    1,
    MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS_V1,
    'MAX_ATTEMPTS_INVALID',
  );
  const leaseMs = integer(
    record.leaseMs,
    MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MIN_LEASE_MS_V1,
    MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_LEASE_MS_V1,
    'LEASE_MS_INVALID',
  );
  const retryBaseMs = integer(
    record.retryBaseMs,
    MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MIN_RETRY_MS_V1,
    MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_RETRY_MS_V1,
    'RETRY_BASE_MS_INVALID',
  );
  const retryMaxMs = integer(
    record.retryMaxMs,
    retryBaseMs,
    MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_RETRY_MS_V1,
    'RETRY_MAX_MS_INVALID',
  );
  return deepFreezeEditronJsonV1({
    schemaVersion: 1 as const,
    kind:
      MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_KIND_V1,
    maxAttempts,
    leaseMs,
    retryBaseMs,
    retryMaxMs,
  });
}

function addMilliseconds(
  isoTimestamp: string,
  milliseconds: number,
  code: string,
): string {
  const epochMs = Date.parse(isoTimestamp);
  const result = epochMs + milliseconds;
  if (!Number.isSafeInteger(result)) fail(code);
  const date = new Date(result);
  if (!Number.isFinite(date.getTime())) fail(code);
  return date.toISOString();
}

function timestamp(value: unknown, code: string): string {
  if (typeof value !== 'string') fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(code);
  }
  return value;
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
  throw new MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyErrorV1(code);
}
