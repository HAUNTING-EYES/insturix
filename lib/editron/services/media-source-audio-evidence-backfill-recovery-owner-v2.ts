import { randomUUID } from 'node:crypto';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
  dispatchMediaSourceAudioEvidenceBackfillMessageV1,
  resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1,
  type MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1,
  type MediaSourceAudioEvidenceBackfillDispatchResultV1,
  type MediaSourceAudioEvidenceBackfillQStashPublisherV1,
} from './media-source-audio-evidence-backfill-dispatch-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS_V1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_LEASE_MS_V1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_RETRY_MS_V1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MIN_RETRY_MS_V1,
  resolveMediaSourceAudioEvidenceBackfillRecoveryLeaseExpiryV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
} from './media-source-audio-evidence-backfill-recovery-attempt-policy-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoveryMongoSelectorV1,
  type MediaSourceAudioEvidenceBackfillRecoverySelectionResultV1,
} from './media-source-audio-evidence-backfill-recovery-mongo-selector-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepSettlementV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-mongo-store-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-state-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRecoveryControllerV1,
  assertMediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptResultV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-v1';

const RECOVERY_RECEIPT_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RECEIPT_V2' as const;
const MAX_RECOVERY_SELECTION_LIMIT_V2 = 100;
const MIN_RECOVERY_STALE_MS_V2 =
  2 * MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1.timeoutSeconds
    * 1_000;
const MAX_RECOVERY_STALE_MS_V2 = 7 * 24 * 60 * 60 * 1_000;

const RECOVERY_STALE_MS_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS' as const;
const RECOVERY_RUN_LIMIT_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT' as const;
const RECOVERY_BATCH_LIMIT_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT' as const;
const RECOVERY_MAX_ATTEMPTS_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS' as const;
const RECOVERY_LEASE_MS_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_LEASE_MS' as const;
const RECOVERY_RETRY_BASE_MS_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RETRY_BASE_MS' as const;
const RECOVERY_RETRY_MAX_MS_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RETRY_MAX_MS' as const;

export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_ID_V2 =
  'global-audio-backfill-v1' as const;
export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MIN_LEASE_MS_V2 =
  60_000;

export type MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV2 =
  MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1 & Readonly<{
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS?: string;
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT?: string;
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT?: string;
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS?: string;
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_LEASE_MS?: string;
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RETRY_BASE_MS?: string;
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RETRY_MAX_MS?: string;
  }>;

export type MediaSourceAudioEvidenceBackfillRecoveryConfigurationV2 =
  Readonly<{
    staleMs: number;
    selectionLimit: number;
    batchLimit: number;
    attemptPolicy: MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1;
  }>;

type DispatchFailureV2 = Readonly<{
  disposition: 'UNCONFIRMED';
  reason: 'DISPATCH_RUNTIME_UNAVAILABLE';
  messageId: null;
  deduplicationId: null;
}>;

export type MediaSourceAudioEvidenceBackfillRecoveryResultV2 = Readonly<{
  migrationRunId: string;
  expectedRecordSha256: string;
  runUpdatedAt: string;
  dispatch: MediaSourceAudioEvidenceBackfillDispatchResultV1
    | DispatchFailureV2;
}>;

type RecoveryReceiptMaterialV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof RECOVERY_RECEIPT_KIND_V2;
  invokedAt: string;
  batchLimit: number;
  selection: Readonly<{
    disposition: 'NO_CANDIDATES' | 'SELECTED';
    selectedSweepIntentSha256: string | null;
    staleBefore: string;
    selectionLimit: number;
  }>;
  claim: null | Readonly<{
    sweepIntentSha256: string;
    selectedAt: string;
    staleBefore: string;
    entryCount: number;
    attemptNumber: number;
    claimedRecordSha256: string;
    claimedAt: string;
    leaseExpiresAt: string;
    attemptPolicySha256: string;
  }>;
  attempt: null | Readonly<{
    attemptSha256: string;
    disposition: 'COMPLETE' | 'RETRY_REQUIRED';
    attemptedAt: string;
  }>;
  settlement: null | Readonly<{
    disposition: 'SETTLED' | 'ALREADY_SETTLED';
    sweepRecordSha256: string;
    sweepStatus:
      | 'PENDING'
      | 'RUNNING'
      | 'RETRY_WAIT'
      | 'COMPLETE'
      | 'RETRY_EXHAUSTED';
    attemptCount: number;
  }>;
  claimedCount: number;
  confirmedCount: number;
  unconfirmedCount: number;
  results: readonly MediaSourceAudioEvidenceBackfillRecoveryResultV2[];
}>;

export type MediaSourceAudioEvidenceBackfillRecoveryReceiptV2 =
  RecoveryReceiptMaterialV2 & Readonly<{
    recoveryReceiptSha256: string;
  }>;

type RecoverySelectorV2 = Pick<
  ReturnType<typeof createMediaSourceAudioEvidenceBackfillRecoveryMongoSelectorV1>,
  'selectNext'
>;
type RecoverySweepStoreV2 = Pick<
  ReturnType<
    typeof createMediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreV1
  >,
  'claimNext' | 'settle'
>;
type DispatcherV2 = typeof dispatchMediaSourceAudioEvidenceBackfillMessageV1;

export class MediaSourceAudioEvidenceBackfillRecoveryOwnerErrorV2
  extends Error {
  constructor(public readonly code: string) {
    super('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_OWNER_V2_' + code);
    this.name = 'MediaSourceAudioEvidenceBackfillRecoveryOwnerErrorV2';
  }
}

export function resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV2(
  environment: MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV2,
): MediaSourceAudioEvidenceBackfillRecoveryConfigurationV2 {
  const retryBaseMs = requiredInteger(
    environment[RECOVERY_RETRY_BASE_MS_ENV],
    'RETRY_BASE_MS',
    MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MIN_RETRY_MS_V1,
    MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_RETRY_MS_V1,
  );
  return Object.freeze({
    staleMs: requiredInteger(
      environment[RECOVERY_STALE_MS_ENV],
      'STALE_MS',
      MIN_RECOVERY_STALE_MS_V2,
      MAX_RECOVERY_STALE_MS_V2,
    ),
    selectionLimit: requiredInteger(
      environment[RECOVERY_RUN_LIMIT_ENV],
      'SELECTION_LIMIT',
      1,
      MAX_RECOVERY_SELECTION_LIMIT_V2,
    ),
    batchLimit: requiredInteger(
      environment[RECOVERY_BATCH_LIMIT_ENV],
      'BATCH_LIMIT',
      1,
      100,
    ),
    attemptPolicy:
      createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1({
        maxAttempts: requiredInteger(
          environment[RECOVERY_MAX_ATTEMPTS_ENV],
          'MAX_ATTEMPTS',
          1,
          MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS_V1,
        ),
        leaseMs: requiredInteger(
          environment[RECOVERY_LEASE_MS_ENV],
          'LEASE_MS',
          MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MIN_LEASE_MS_V2,
          MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_LEASE_MS_V1,
        ),
        retryBaseMs,
        retryMaxMs: requiredInteger(
          environment[RECOVERY_RETRY_MAX_MS_ENV],
          'RETRY_MAX_MS',
          retryBaseMs,
          MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_RETRY_MS_V1,
        ),
      }),
  });
}

export async function recoverMediaSourceAudioEvidenceBackfillSweepsV2(
  dependencies: Readonly<{
    environment?: MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV2;
    selector?: Readonly<RecoverySelectorV2>;
    sweepStore?: Readonly<RecoverySweepStoreV2>;
    dispatch?: DispatcherV2;
    publisher?: Readonly<MediaSourceAudioEvidenceBackfillQStashPublisherV1>;
    now?: Date;
    attemptedAt?: Date;
    claimToken?: string;
  }> = {},
): Promise<MediaSourceAudioEvidenceBackfillRecoveryReceiptV2> {
  const environment = dependencies.environment ?? processEnvironment();
  const configuration =
    resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV2(environment);
  const dispatchConfiguration =
    resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1(environment);
  if (!dispatchConfiguration.configured) {
    fail('DISPATCH_' + dispatchConfiguration.reason);
  }
  const now = validDate(dependencies.now ?? new Date(), 'NOW');
  const staleBefore = new Date(now.getTime() - configuration.staleMs);
  const claimToken = protocolIdentifier(
    dependencies.claimToken ?? randomUUID(),
    'CLAIM_TOKEN_INVALID',
  );
  const selector = dependencies.selector
    ?? createMediaSourceAudioEvidenceBackfillRecoveryMongoSelectorV1();
  const sweepStore = dependencies.sweepStore
    ?? createMediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreV1();
  const selection = normalizeSelection(await selector.selectNext({
    controllerId:
      MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_ID_V2,
    staleBefore,
    selectedAt: now,
    limit: configuration.selectionLimit,
    attemptPolicy: configuration.attemptPolicy,
  }), {
    selectedAt: now.toISOString(),
    staleBefore: staleBefore.toISOString(),
    selectionLimit: configuration.selectionLimit,
  });
  const claimedValue = await sweepStore.claimNext({
    claimToken,
    claimedAt: now,
  });
  if (claimedValue === null) {
    return createReceipt({
      invokedAt: now.toISOString(),
      batchLimit: configuration.batchLimit,
      selection,
      claim: null,
      attempt: null,
      settlement: null,
      results: Object.freeze([]),
    });
  }
  const claim = normalizeClaim(claimedValue, claimToken, now.toISOString());
  const dispatch = dependencies.dispatch
    ?? dispatchMediaSourceAudioEvidenceBackfillMessageV1;
  const results: MediaSourceAudioEvidenceBackfillRecoveryResultV2[] = [];
  const attemptResults: MediaSourceAudioEvidenceBackfillRecoveryAttemptResultV1[] = [];
  for (const entry of claim.intent.entries) {
    let delivery: MediaSourceAudioEvidenceBackfillDispatchResultV1
      | DispatchFailureV2;
    try {
      delivery = dispatchResult(await dispatch({
        message: {
          schemaVersion: 1,
          kind: 'RUN_NEXT_BATCH',
          migrationRunId: entry.migrationRunId,
          expectedRecordSha256: entry.expectedRecordSha256,
          batchLimit: configuration.batchLimit,
        },
        deliveryPolicy:
          MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
        environment,
        ...(dependencies.publisher
          ? { publisher: dependencies.publisher }
          : {}),
      }));
    } catch {
      delivery = Object.freeze({
        disposition: 'UNCONFIRMED' as const,
        reason: 'DISPATCH_RUNTIME_UNAVAILABLE' as const,
        messageId: null,
        deduplicationId: null,
      });
    }
    results.push(Object.freeze({
      migrationRunId: entry.migrationRunId,
      expectedRecordSha256: entry.expectedRecordSha256,
      runUpdatedAt: entry.runUpdatedAt,
      dispatch: delivery,
    }));
    attemptResults.push(Object.freeze({
      migrationRunId: entry.migrationRunId,
      expectedRecordSha256: entry.expectedRecordSha256,
      disposition: delivery.disposition,
      reason: 'reason' in delivery ? delivery.reason : null,
      messageId: delivery.messageId,
      deduplicationId: delivery.deduplicationId,
    }));
  }
  const attemptedAt = validDate(
    dependencies.attemptedAt ?? new Date(),
    'ATTEMPTED_AT',
  );
  if (attemptedAt.getTime() < now.getTime()) fail('ATTEMPT_TIME_INVALID');
  const attempt = createMediaSourceAudioEvidenceBackfillRecoveryAttemptV1(
    claim.intent,
    {
      attemptNumber: claim.attemptNumber,
      previousAttemptSha256: claim.previousAttemptSha256,
      attemptedAt: attemptedAt.toISOString(),
      results: attemptResults,
    },
  );
  const settlement = normalizeSettlement(await sweepStore.settle({
    sweepIntentSha256: claim.sweepIntentSha256,
    claimedRecordSha256: claim.claimedRecordSha256,
    claimToken: claim.claimToken,
    attempt,
  }), claim, attempt);
  return createReceipt({
    invokedAt: now.toISOString(),
    batchLimit: configuration.batchLimit,
    selection,
    claim,
    attempt,
    settlement,
    results: Object.freeze(results),
  });
}

type SelectionSummaryV2 = RecoveryReceiptMaterialV2['selection'];
type SettlementSummaryV2 = NonNullable<RecoveryReceiptMaterialV2['settlement']>;

function normalizeSelection(
  value: MediaSourceAudioEvidenceBackfillRecoverySelectionResultV1,
  expected: Readonly<{
    selectedAt: string;
    staleBefore: string;
    selectionLimit: number;
  }>,
): SelectionSummaryV2 {
  const record = objectRecord(value, 'SELECTION_INVALID');
  if (record.disposition === 'NO_CANDIDATES') {
    exactKeys(record, ['controller', 'disposition'], 'SELECTION_FIELDS_INVALID');
    const controller =
      assertMediaSourceAudioEvidenceBackfillRecoveryControllerV1(
        record.controller,
      );
    if (controller.controllerId
      !== MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_ID_V2
      || Date.parse(controller.updatedAt) > Date.parse(expected.selectedAt)) {
      fail('SELECTION_CONTROLLER_INVALID');
    }
    return deepFreezeEditronJsonV1({
      disposition: 'NO_CANDIDATES' as const,
      selectedSweepIntentSha256: null,
      staleBefore: expected.staleBefore,
      selectionLimit: expected.selectionLimit,
    });
  }
  if (record.disposition !== 'SELECTED') fail('SELECTION_INVALID');
  exactKeys(
    record,
    ['controller', 'disposition', 'intent'],
    'SELECTION_FIELDS_INVALID',
  );
  const controller =
    assertMediaSourceAudioEvidenceBackfillRecoveryControllerV1(
      record.controller,
    );
  const intent = assertMediaSourceAudioEvidenceBackfillRecoverySweepIntentV1(
    record.intent,
  );
  if (controller.controllerId
      !== MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_ID_V2
    || intent.controllerId !== controller.controllerId
    || intent.selectedAt !== expected.selectedAt
    || intent.staleBefore !== expected.staleBefore
    || intent.entries.length > expected.selectionLimit
    || controller.lastSweepIntentSha256 !== intent.sweepIntentSha256) {
    fail('SELECTION_BINDING_INVALID');
  }
  return deepFreezeEditronJsonV1({
    disposition: 'SELECTED' as const,
    selectedSweepIntentSha256: intent.sweepIntentSha256,
    staleBefore: expected.staleBefore,
    selectionLimit: expected.selectionLimit,
  });
}

function normalizeClaim(
  value: unknown,
  expectedClaimToken: string,
  expectedClaimedAt: string,
): MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1 {
  const record = objectRecord(value, 'CLAIM_INVALID');
  exactKeys(record, [
    'attemptNumber',
    'attemptPolicy',
    'claimedAt',
    'claimedRecordSha256',
    'claimToken',
    'intent',
    'leaseExpiresAt',
    'previousAttemptSha256',
    'sweepIntentSha256',
  ], 'CLAIM_FIELDS_INVALID');
  const intent = assertMediaSourceAudioEvidenceBackfillRecoverySweepIntentV1(
    record.intent,
  );
  const attemptPolicy =
    assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1(
      record.attemptPolicy,
    );
  const attemptNumber = boundedInteger(
    record.attemptNumber,
    'CLAIM_ATTEMPT_NUMBER',
    1,
    attemptPolicy.maxAttempts,
  );
  const previousAttemptSha256 = record.previousAttemptSha256 === null
    ? null
    : sha256(record.previousAttemptSha256, 'CLAIM_PREVIOUS_ATTEMPT_SHA256');
  const claimToken = protocolIdentifier(
    record.claimToken,
    'CLAIM_TOKEN_INVALID',
  );
  const claimedAt = timestamp(record.claimedAt, 'CLAIMED_AT_INVALID');
  const leaseExpiresAt = timestamp(
    record.leaseExpiresAt,
    'LEASE_EXPIRES_AT_INVALID',
  );
  if (record.sweepIntentSha256 !== intent.sweepIntentSha256
    || claimToken !== expectedClaimToken
    || claimedAt !== expectedClaimedAt
    || leaseExpiresAt
      !== resolveMediaSourceAudioEvidenceBackfillRecoveryLeaseExpiryV1(
        attemptPolicy,
        claimedAt,
      )
    || (attemptNumber === 1) !== (previousAttemptSha256 === null)) {
    fail('CLAIM_BINDING_INVALID');
  }
  return deepFreezeEditronJsonV1({
    sweepIntentSha256: intent.sweepIntentSha256,
    claimedRecordSha256: sha256(
      record.claimedRecordSha256,
      'CLAIMED_RECORD_SHA256_INVALID',
    ),
    attemptNumber,
    previousAttemptSha256,
    claimToken,
    claimedAt,
    leaseExpiresAt,
    intent,
    attemptPolicy,
  });
}

function normalizeSettlement(
  value: MediaSourceAudioEvidenceBackfillRecoverySweepSettlementV1,
  claim: MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1,
  attempt: MediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
): SettlementSummaryV2 {
  const record = objectRecord(value, 'SETTLEMENT_INVALID');
  exactKeys(record, ['disposition', 'state'], 'SETTLEMENT_FIELDS_INVALID');
  if (record.disposition !== 'SETTLED'
    && record.disposition !== 'ALREADY_SETTLED') fail('SETTLEMENT_INVALID');
  const state =
    assertMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(record.state);
  if (state.sweepIntentSha256 !== claim.sweepIntentSha256
    || state.attemptCount < attempt.attemptNumber) {
    fail('SETTLEMENT_BINDING_INVALID');
  }
  if (record.disposition === 'SETTLED') {
    const expectedStatus = attempt.disposition === 'COMPLETE'
      ? 'COMPLETE'
      : attempt.attemptNumber >= state.attemptPolicy.maxAttempts
        ? 'RETRY_EXHAUSTED'
        : 'RETRY_WAIT';
    if (state.lastAttemptSha256 !== attempt.attemptSha256
      || state.attemptCount !== attempt.attemptNumber
      || state.status !== expectedStatus) fail('SETTLEMENT_STATE_INVALID');
  }
  return deepFreezeEditronJsonV1({
    disposition: record.disposition,
    sweepRecordSha256: state.recordSha256,
    sweepStatus: state.status,
    attemptCount: state.attemptCount,
  });
}

function createReceipt(input: Readonly<{
  invokedAt: string;
  batchLimit: number;
  selection: SelectionSummaryV2;
  claim: MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1 | null;
  attempt: MediaSourceAudioEvidenceBackfillRecoveryAttemptV1 | null;
  settlement: SettlementSummaryV2 | null;
  results: readonly MediaSourceAudioEvidenceBackfillRecoveryResultV2[];
}>): MediaSourceAudioEvidenceBackfillRecoveryReceiptV2 {
  if ((input.claim === null) !== (input.attempt === null)
    || (input.attempt === null) !== (input.settlement === null)
    || input.results.length !== (input.claim?.intent.entries.length ?? 0)) {
    fail('RECEIPT_INPUT_INVALID');
  }
  const unconfirmedCount = input.results.filter(
    (result) => result.dispatch.disposition === 'UNCONFIRMED',
  ).length;
  const material: RecoveryReceiptMaterialV2 = deepFreezeEditronJsonV1({
    schemaVersion: 2 as const,
    kind: RECOVERY_RECEIPT_KIND_V2,
    invokedAt: input.invokedAt,
    batchLimit: input.batchLimit,
    selection: input.selection,
    claim: input.claim === null ? null : {
      sweepIntentSha256: input.claim.sweepIntentSha256,
      selectedAt: input.claim.intent.selectedAt,
      staleBefore: input.claim.intent.staleBefore,
      entryCount: input.claim.intent.entries.length,
      attemptNumber: input.claim.attemptNumber,
      claimedRecordSha256: input.claim.claimedRecordSha256,
      claimedAt: input.claim.claimedAt,
      leaseExpiresAt: input.claim.leaseExpiresAt,
      attemptPolicySha256: input.claim.attemptPolicy.policySha256,
    },
    attempt: input.attempt === null ? null : {
      attemptSha256: input.attempt.attemptSha256,
      disposition: input.attempt.disposition,
      attemptedAt: input.attempt.attemptedAt,
    },
    settlement: input.settlement,
    claimedCount: input.results.length,
    confirmedCount: input.results.length - unconfirmedCount,
    unconfirmedCount,
    results: input.results,
  });
  return deepFreezeEditronJsonV1({
    ...material,
    recoveryReceiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

function processEnvironment(): MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV2 {
  return {
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_LEASE_MS:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_LEASE_MS,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RETRY_BASE_MS:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RETRY_BASE_MS,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RETRY_MAX_MS:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RETRY_MAX_MS,
  };
}

function dispatchResult(
  value: unknown,
): MediaSourceAudioEvidenceBackfillDispatchResultV1 {
  const result = objectRecord(value, 'DISPATCH_RESULT_INVALID');
  if (result.disposition === 'DISPATCHED'
    || result.disposition === 'DEDUPLICATED') {
    exactKeys(result, [
      'deduplicationId',
      'disposition',
      'messageId',
    ], 'DISPATCH_RESULT_FIELDS_INVALID');
    return Object.freeze({
      disposition: result.disposition,
      messageId: transportIdentifier(
        result.messageId,
        'DISPATCH_MESSAGE_ID_INVALID',
      ),
      deduplicationId: sha256(
        result.deduplicationId,
        'DISPATCH_DEDUPLICATION_ID_INVALID',
      ),
    });
  }
  if (result.disposition !== 'UNCONFIRMED') fail('DISPATCH_RESULT_INVALID');
  exactKeys(result, [
    'deduplicationId',
    'disposition',
    'messageId',
    'reason',
  ], 'DISPATCH_RESULT_FIELDS_INVALID');
  if (result.messageId !== null
    || (result.reason !== 'QSTASH_PUBLISH_REJECTED'
      && result.reason !== 'QSTASH_MESSAGE_ID_INVALID')) {
    fail('DISPATCH_RESULT_INVALID');
  }
  return Object.freeze({
    disposition: 'UNCONFIRMED' as const,
    reason: result.reason,
    messageId: null,
    deduplicationId: sha256(
      result.deduplicationId,
      'DISPATCH_DEDUPLICATION_ID_INVALID',
    ),
  });
}

function requiredInteger(
  raw: string | undefined,
  code: string,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) {
    fail(code + '_CONFIG_INVALID');
  }
  return boundedInteger(Number(raw), code, minimum, maximum);
}

function boundedInteger(
  value: unknown,
  code: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value)
    || Number(value) < minimum
    || Number(value) > maximum) fail(code + '_INVALID');
  return Number(value);
}

function protocolIdentifier(value: unknown, code: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) fail(code);
  return value;
}

function transportIdentifier(value: unknown, code: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) fail(code);
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

function validDate(value: unknown, code: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  return new Date(value.getTime());
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
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
  throw new MediaSourceAudioEvidenceBackfillRecoveryOwnerErrorV2(code);
}
