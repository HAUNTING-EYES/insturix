import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from './media-source-pts-cadence-version-evidence-backfill-run-record-v1';

export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_INTENT_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_RUNS_V1 = 100;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1 = Readonly<{
  runUpdatedAt: string;
  migrationRunId: string;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepEntryV1 = Readonly<{
  migrationRunId: string;
  expectedRecordSha256: string;
  runUpdatedAt: string;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_KIND_V1;
  controllerId: string;
  recordVersion: number;
  cursor: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1 | null;
  cycleCount: number;
  selectedSweepCount: number;
  selectedRunCount: number;
  lastSweepIntentSha256: string | null;
  createdAt: string;
  updatedAt: string;
  previousRecordSha256: string | null;
  recordSha256: string;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_KIND_V1;
  controllerId: string;
  controllerRecordVersion: number;
  controllerRecordSha256: string;
  cursorBefore: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1 | null;
  cursorAfter: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1;
  wrapped: boolean;
  selectedAt: string;
  staleBefore: string;
  entries: readonly MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepEntryV1[];
  previousSweepIntentSha256: string | null;
  sweepIntentSha256: string;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1 = Readonly<{
  migrationRunId: string;
  expectedRecordSha256: string;
  disposition: 'DISPATCHED' | 'DEDUPLICATED' | 'UNCONFIRMED';
  reason:
    | null
    | 'QSTASH_PUBLISH_REJECTED'
    | 'QSTASH_MESSAGE_ID_INVALID'
    | 'DISPATCH_RUNTIME_UNAVAILABLE';
  messageId: string | null;
  deduplicationId: string | null;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_KIND_V1;
  sweepIntentSha256: string;
  attemptNumber: number;
  previousAttemptSha256: string | null;
  attemptedAt: string;
  disposition: 'COMPLETE' | 'RETRY_REQUIRED';
  confirmedCount: number;
  unconfirmedCount: number;
  results: readonly MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1[];
  attemptSha256: string;
}>;

type ControllerMaterialV1 = Omit<
  MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1,
  'recordSha256'
>;
type SweepIntentMaterialV1 = Omit<
  MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
  'sweepIntentSha256'
>;
type AttemptMaterialV1 = Omit<
  MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  'attemptSha256'
>;

const CONTROLLER_MATERIAL_KEYS_V1 = Object.freeze([
  'controllerId',
  'createdAt',
  'cursor',
  'cycleCount',
  'kind',
  'lastSweepIntentSha256',
  'previousRecordSha256',
  'recordVersion',
  'schemaVersion',
  'selectedRunCount',
  'selectedSweepCount',
  'updatedAt',
] as const);
const SWEEP_MATERIAL_KEYS_V1 = Object.freeze([
  'controllerId',
  'controllerRecordSha256',
  'controllerRecordVersion',
  'cursorAfter',
  'cursorBefore',
  'entries',
  'kind',
  'previousSweepIntentSha256',
  'schemaVersion',
  'selectedAt',
  'staleBefore',
  'wrapped',
] as const);
const ATTEMPT_MATERIAL_KEYS_V1 = Object.freeze([
  'attemptNumber',
  'attemptedAt',
  'confirmedCount',
  'disposition',
  'kind',
  'previousAttemptSha256',
  'results',
  'schemaVersion',
  'sweepIntentSha256',
  'unconfirmedCount',
] as const);

export function createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1(
  input: Readonly<{ controllerId: string; createdAt: string }>,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1 {
  const createdAt = timestamp(input.createdAt);
  return freezeController({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_KIND_V1,
    controllerId: identifier(input.controllerId),
    recordVersion: 1,
    cursor: null,
    cycleCount: 0,
    selectedSweepCount: 0,
    selectedRunCount: 0,
    lastSweepIntentSha256: null,
    createdAt,
    updatedAt: createdAt,
    previousRecordSha256: null,
  });
}

export function selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
  currentValue: unknown,
  input: Readonly<{
    candidates: readonly MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1[];
    wrapped: boolean;
    staleBefore: string;
    selectedAt: string;
  }>,
): Readonly<{
  intent: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1;
  nextController: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1;
}> {
  const current = assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1(
    currentValue,
  );
  const selectedAt = timestamp(input.selectedAt);
  const staleBefore = timestamp(input.staleBefore);
  if (Date.parse(selectedAt) < Date.parse(current.updatedAt)
    || Date.parse(staleBefore) > Date.parse(selectedAt)
    || !Array.isArray(input.candidates)
    || input.candidates.length < 1
    || input.candidates.length
      > MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_RUNS_V1) {
    fail('SELECTION_INPUT_INVALID');
  }
  const entries = input.candidates.map((candidate) => {
    const record = assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(candidate);
    if (record.status !== 'RUNNING'
      || Date.parse(record.updatedAt) > Date.parse(staleBefore)) {
      fail('SELECTION_CANDIDATE_INVALID');
    }
    return frozen({
      migrationRunId: record.migrationRunId,
      expectedRecordSha256: record.recordSha256,
      runUpdatedAt: record.updatedAt,
    });
  });
  assertStrictEntryOrder(entries);
  assertCursorTraversal(current.cursor, entries, input.wrapped);
  const cursorAfter = entryCursor(entries[entries.length - 1]!);
  const intent = freezeSweepIntent({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_KIND_V1,
    controllerId: current.controllerId,
    controllerRecordVersion: current.recordVersion,
    controllerRecordSha256: current.recordSha256,
    cursorBefore: current.cursor,
    cursorAfter,
    wrapped: boolean(input.wrapped),
    selectedAt,
    staleBefore,
    entries: Object.freeze(entries),
    previousSweepIntentSha256: current.lastSweepIntentSha256,
  });
  const nextController = freezeController({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_KIND_V1,
    controllerId: current.controllerId,
    recordVersion: safeAdd(current.recordVersion, 1),
    cursor: cursorAfter,
    cycleCount: safeAdd(current.cycleCount, intent.wrapped ? 1 : 0),
    selectedSweepCount: safeAdd(current.selectedSweepCount, 1),
    selectedRunCount: safeAdd(current.selectedRunCount, entries.length),
    lastSweepIntentSha256: intent.sweepIntentSha256,
    createdAt: current.createdAt,
    updatedAt: selectedAt,
    previousRecordSha256: current.recordSha256,
  });
  return frozen({ intent, nextController });
}

export function createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
  intentValue: unknown,
  input: Readonly<{
    attemptNumber: number;
    previousAttemptSha256: string | null;
    attemptedAt: string;
    results: readonly MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1[];
  }>,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1 {
  const intent = assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1(
    intentValue,
  );
  const attemptedAt = timestamp(input.attemptedAt);
  const attemptNumber = positiveInteger(input.attemptNumber);
  const previousAttemptSha256 = nullableSha256(input.previousAttemptSha256);
  if ((attemptNumber === 1) !== (previousAttemptSha256 === null)
    || Date.parse(attemptedAt) < Date.parse(intent.selectedAt)
    || !Array.isArray(input.results)
    || input.results.length !== intent.entries.length) {
    fail('ATTEMPT_INPUT_INVALID');
  }
  const results = input.results.map((result, index) => normalizeAttemptResult(
    result,
    intent.entries[index]!,
  ));
  const unconfirmedCount = results.filter(
    (result) => result.disposition === 'UNCONFIRMED',
  ).length;
  return freezeAttempt({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_KIND_V1,
    sweepIntentSha256: intent.sweepIntentSha256,
    attemptNumber,
    previousAttemptSha256,
    attemptedAt,
    disposition: unconfirmedCount === 0 ? 'COMPLETE' : 'RETRY_REQUIRED',
    confirmedCount: results.length - unconfirmedCount,
    unconfirmedCount,
    results: Object.freeze(results),
  });
}

export function assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1 {
  const record = objectRecord(value, 'CONTROLLER_INVALID');
  exactKeys(record, [...CONTROLLER_MATERIAL_KEYS_V1, 'recordSha256']);
  const { recordSha256: hashValue, ...materialValue } = record;
  const material = normalizeControllerMaterial(materialValue);
  const recordSha256 = sha256(hashValue);
  if (hashEditronCanonicalJsonV1(material) !== recordSha256) {
    fail('CONTROLLER_HASH_MISMATCH');
  }
  return frozen({ ...material, recordSha256 });
}

export function assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1 {
  const record = objectRecord(value, 'SWEEP_INVALID');
  exactKeys(record, [...SWEEP_MATERIAL_KEYS_V1, 'sweepIntentSha256']);
  const { sweepIntentSha256: hashValue, ...materialValue } = record;
  const material = normalizeSweepIntentMaterial(materialValue);
  const sweepIntentSha256 = sha256(hashValue);
  if (hashEditronCanonicalJsonV1(material) !== sweepIntentSha256) {
    fail('SWEEP_HASH_MISMATCH');
  }
  return frozen({ ...material, sweepIntentSha256 });
}

export function assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
  value: unknown,
  intentValue?: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1 {
  const record = objectRecord(value, 'ATTEMPT_INVALID');
  exactKeys(record, [...ATTEMPT_MATERIAL_KEYS_V1, 'attemptSha256']);
  const { attemptSha256: hashValue, ...materialValue } = record;
  const material = normalizeAttemptMaterial(materialValue);
  const attemptSha256 = sha256(hashValue);
  if (hashEditronCanonicalJsonV1(material) !== attemptSha256) {
    fail('ATTEMPT_HASH_MISMATCH');
  }
  const attempt = frozen({ ...material, attemptSha256 });
  if (intentValue !== undefined) {
    const intent = assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1(
      intentValue,
    );
    if (attempt.sweepIntentSha256 !== intent.sweepIntentSha256
      || Date.parse(attempt.attemptedAt) < Date.parse(intent.selectedAt)
      || attempt.results.length !== intent.entries.length
      || attempt.results.some((result, index) => (
        result.migrationRunId !== intent.entries[index]!.migrationRunId
        || result.expectedRecordSha256
          !== intent.entries[index]!.expectedRecordSha256
      ))) {
      fail('ATTEMPT_SWEEP_BINDING_INVALID');
    }
  }
  return attempt;
}

function normalizeControllerMaterial(value: unknown): ControllerMaterialV1 {
  const record = objectRecord(value, 'CONTROLLER_INVALID');
  exactKeys(record, CONTROLLER_MATERIAL_KEYS_V1);
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_KIND_V1) {
    fail('CONTROLLER_IDENTITY_INVALID');
  }
  const material = frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_KIND_V1,
    controllerId: identifier(record.controllerId),
    recordVersion: positiveInteger(record.recordVersion),
    cursor: nullableCursor(record.cursor),
    cycleCount: integer(record.cycleCount),
    selectedSweepCount: integer(record.selectedSweepCount),
    selectedRunCount: integer(record.selectedRunCount),
    lastSweepIntentSha256: nullableSha256(record.lastSweepIntentSha256),
    createdAt: timestamp(record.createdAt),
    updatedAt: timestamp(record.updatedAt),
    previousRecordSha256: nullableSha256(record.previousRecordSha256),
  });
  if (material.recordVersion !== safeAdd(material.selectedSweepCount, 1)
    || material.cycleCount > material.selectedSweepCount
    || Date.parse(material.updatedAt) < Date.parse(material.createdAt)
    || (material.recordVersion === 1
      && (material.cursor !== null
        || material.cycleCount !== 0
        || material.selectedRunCount !== 0
        || material.lastSweepIntentSha256 !== null
        || material.previousRecordSha256 !== null))
    || (material.recordVersion > 1
      && (material.cursor === null
        || material.selectedRunCount < material.selectedSweepCount
        || material.lastSweepIntentSha256 === null
        || material.previousRecordSha256 === null))) {
    fail('CONTROLLER_INVARIANT_INVALID');
  }
  return material;
}

function normalizeSweepIntentMaterial(value: unknown): SweepIntentMaterialV1 {
  const record = objectRecord(value, 'SWEEP_INVALID');
  exactKeys(record, SWEEP_MATERIAL_KEYS_V1);
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_KIND_V1
    || typeof record.wrapped !== 'boolean'
    || !Array.isArray(record.entries)
    || record.entries.length < 1
    || record.entries.length
      > MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_RUNS_V1) {
    fail('SWEEP_IDENTITY_INVALID');
  }
  const entries = record.entries.map(normalizeSweepEntry);
  assertStrictEntryOrder(entries);
  const material = frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_KIND_V1,
    controllerId: identifier(record.controllerId),
    controllerRecordVersion: positiveInteger(record.controllerRecordVersion),
    controllerRecordSha256: sha256(record.controllerRecordSha256),
    cursorBefore: nullableCursor(record.cursorBefore),
    cursorAfter: cursor(record.cursorAfter),
    wrapped: record.wrapped,
    selectedAt: timestamp(record.selectedAt),
    staleBefore: timestamp(record.staleBefore),
    entries: Object.freeze(entries),
    previousSweepIntentSha256: nullableSha256(
      record.previousSweepIntentSha256,
    ),
  });
  assertCursorTraversal(material.cursorBefore, material.entries, material.wrapped);
  if (!sameCursor(material.cursorAfter, entryCursor(entries[entries.length - 1]!))
    || Date.parse(material.staleBefore) > Date.parse(material.selectedAt)
    || material.entries.some(
      (entry) => Date.parse(entry.runUpdatedAt) > Date.parse(material.staleBefore),
    )
    || (material.controllerRecordVersion === 1
      && (material.cursorBefore !== null
        || material.previousSweepIntentSha256 !== null
        || material.wrapped))
    || (material.controllerRecordVersion > 1
      && (material.cursorBefore === null
        || material.previousSweepIntentSha256 === null))) {
    fail('SWEEP_INVARIANT_INVALID');
  }
  return material;
}

function normalizeAttemptMaterial(value: unknown): AttemptMaterialV1 {
  const record = objectRecord(value, 'ATTEMPT_INVALID');
  exactKeys(record, ATTEMPT_MATERIAL_KEYS_V1);
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_KIND_V1
    || (record.disposition !== 'COMPLETE'
      && record.disposition !== 'RETRY_REQUIRED')
    || !Array.isArray(record.results)
    || record.results.length < 1
    || record.results.length
      > MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_RUNS_V1) {
    fail('ATTEMPT_IDENTITY_INVALID');
  }
  const attemptNumber = positiveInteger(record.attemptNumber);
  const previousAttemptSha256 = nullableSha256(record.previousAttemptSha256);
  const results = record.results.map((result) => normalizeAttemptResult(result));
  const confirmedCount = integer(record.confirmedCount);
  const unconfirmedCount = integer(record.unconfirmedCount);
  const actualUnconfirmed = results.filter(
    (result) => result.disposition === 'UNCONFIRMED',
  ).length;
  if ((attemptNumber === 1) !== (previousAttemptSha256 === null)
    || confirmedCount + unconfirmedCount !== results.length
    || unconfirmedCount !== actualUnconfirmed
    || (record.disposition === 'COMPLETE') !== (unconfirmedCount === 0)) {
    fail('ATTEMPT_INVARIANT_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_KIND_V1,
    sweepIntentSha256: sha256(record.sweepIntentSha256),
    attemptNumber,
    previousAttemptSha256,
    attemptedAt: timestamp(record.attemptedAt),
    disposition: record.disposition,
    confirmedCount,
    unconfirmedCount,
    results: Object.freeze(results),
  });
}

function freezeController(
  material: ControllerMaterialV1,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1 {
  const normalized = normalizeControllerMaterial(material);
  return frozen({
    ...normalized,
    recordSha256: hashEditronCanonicalJsonV1(normalized),
  });
}

function freezeSweepIntent(
  material: SweepIntentMaterialV1,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1 {
  const normalized = normalizeSweepIntentMaterial(material);
  return frozen({
    ...normalized,
    sweepIntentSha256: hashEditronCanonicalJsonV1(normalized),
  });
}

function freezeAttempt(
  material: AttemptMaterialV1,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1 {
  const normalized = normalizeAttemptMaterial(material);
  return frozen({
    ...normalized,
    attemptSha256: hashEditronCanonicalJsonV1(normalized),
  });
}

function normalizeSweepEntry(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepEntryV1 {
  const record = objectRecord(value, 'SWEEP_ENTRY_INVALID');
  exactKeys(record, [
    'expectedRecordSha256',
    'migrationRunId',
    'runUpdatedAt',
  ]);
  return frozen({
    migrationRunId: identifier(record.migrationRunId),
    expectedRecordSha256: sha256(record.expectedRecordSha256),
    runUpdatedAt: timestamp(record.runUpdatedAt),
  });
}

function normalizeAttemptResult(
  value: unknown,
  expected?: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepEntryV1,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1 {
  const record = objectRecord(value, 'ATTEMPT_RESULT_INVALID');
  exactKeys(record, [
    'deduplicationId',
    'disposition',
    'expectedRecordSha256',
    'messageId',
    'migrationRunId',
    'reason',
  ]);
  const migrationRunId = identifier(record.migrationRunId);
  const expectedRecordSha256 = sha256(record.expectedRecordSha256);
  if (expected && (migrationRunId !== expected.migrationRunId
    || expectedRecordSha256 !== expected.expectedRecordSha256)) {
    fail('ATTEMPT_RESULT_BINDING_INVALID');
  }
  if (record.disposition === 'DISPATCHED'
    || record.disposition === 'DEDUPLICATED') {
    if (record.reason !== null) fail('ATTEMPT_RESULT_INVALID');
    return frozen({
      migrationRunId,
      expectedRecordSha256,
      disposition: record.disposition,
      reason: null,
      messageId: transportIdentifier(record.messageId),
      deduplicationId: sha256(record.deduplicationId),
    });
  }
  if (record.disposition !== 'UNCONFIRMED'
    || record.messageId !== null
    || (record.reason !== 'QSTASH_PUBLISH_REJECTED'
      && record.reason !== 'QSTASH_MESSAGE_ID_INVALID'
      && record.reason !== 'DISPATCH_RUNTIME_UNAVAILABLE')) {
    fail('ATTEMPT_RESULT_INVALID');
  }
  const deduplicationId = record.reason === 'DISPATCH_RUNTIME_UNAVAILABLE'
    ? nullableSha256(record.deduplicationId)
    : sha256(record.deduplicationId);
  return frozen({
    migrationRunId,
    expectedRecordSha256,
    disposition: 'UNCONFIRMED' as const,
    reason: record.reason,
    messageId: null,
    deduplicationId,
  });
}

function assertStrictEntryOrder(
  entries: readonly MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepEntryV1[],
): void {
  for (let index = 1; index < entries.length; index += 1) {
    if (compareCursor(
      entryCursor(entries[index - 1]!),
      entryCursor(entries[index]!),
    ) >= 0) {
      fail('SWEEP_ENTRY_ORDER_INVALID');
    }
  }
}

function assertCursorTraversal(
  cursorBefore: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1 | null,
  entries: readonly MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepEntryV1[],
  wrapped: boolean,
): void {
  if (wrapped && cursorBefore === null) fail('SWEEP_WRAP_INVALID');
  if (cursorBefore === null) return;
  for (const entry of entries) {
    const comparison = compareCursor(entryCursor(entry), cursorBefore);
    if ((!wrapped && comparison <= 0) || (wrapped && comparison > 0)) {
      fail('SWEEP_CURSOR_TRAVERSAL_INVALID');
    }
  }
}

function entryCursor(
  entry: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepEntryV1,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1 {
  return frozen({
    runUpdatedAt: entry.runUpdatedAt,
    migrationRunId: entry.migrationRunId,
  });
}

function nullableCursor(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1 | null {
  return value === null ? null : cursor(value);
}

function cursor(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1 {
  const record = objectRecord(value, 'CURSOR_INVALID');
  exactKeys(record, ['migrationRunId', 'runUpdatedAt']);
  return frozen({
    runUpdatedAt: timestamp(record.runUpdatedAt),
    migrationRunId: identifier(record.migrationRunId),
  });
}

function compareCursor(
  left: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1,
  right: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1,
): number {
  if (left.runUpdatedAt !== right.runUpdatedAt) {
    return left.runUpdatedAt < right.runUpdatedAt ? -1 : 1;
  }
  return left.migrationRunId === right.migrationRunId
    ? 0
    : left.migrationRunId < right.migrationRunId ? -1 : 1;
}

function sameCursor(
  left: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1,
  right: MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOrderCursorV1,
): boolean {
  return compareCursor(left, right) === 0;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('BOOLEAN_INVALID');
  return value;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) fail('COUNT_OVERFLOW');
  return result;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail('COUNT_INVALID');
  }
  return Number(value);
}

function positiveInteger(value: unknown): number {
  const normalized = integer(value);
  if (normalized < 1) fail('COUNT_INVALID');
  return normalized;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    fail('IDENTIFIER_INVALID');
  }
  return value;
}

function transportIdentifier(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    fail('TRANSPORT_IDENTIFIER_INVALID');
  }
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('SHA256_INVALID');
  }
  return value;
}

function nullableSha256(value: unknown): string | null {
  return value === null ? null : sha256(value);
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string') fail('TIMESTAMP_INVALID');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('TIMESTAMP_INVALID');
  }
  return value;
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
): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) {
    fail('FIELDS_INVALID');
  }
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}

function fail(code: string): never {
  throw new Error(
    'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_' + code,
  );
}
