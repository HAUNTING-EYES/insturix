import {
  assertNativeMediaTimestampPreviewWindowV2,
  type NativeMediaTimestampPreviewWindowV2,
} from './native-media-timestamp-preview-window-v2';
import {
  assertNativeMediaTimestampPreviewSessionWindowV1,
  type NativeMediaTimestampPreviewSessionWindowV1,
} from './native-media-timestamp-preview-session-window-v1';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_V2' as const;
export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_V2' as const;
export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_LEASE_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_LEASE_V1' as const;
export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_MAX_TTL_MS_V1 =
  5 * 60 * 1_000;

export type NativeMediaTimestampPreviewMaterializeCommandV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2;
  projectId: string;
  sequenceId: string;
  overlayId: string;
  expectedProjectRevision: NativeMediaTimestampPreviewWindowV2['projectRevision'];
  windowLocalStartFrame: number;
  windowDurationInFrames: number;
}>;

export type NativeMediaTimestampPreviewReleaseCommandV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1;
  window: NativeMediaTimestampPreviewWindowV2;
}>;

export type NativeMediaTimestampPreviewReleaseCommandV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2;
  sessionWindow: NativeMediaTimestampPreviewSessionWindowV1;
}>;

export type NativeMediaTimestampPreviewClassificationLeaseV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_LEASE_KIND_V1;
  decision: 'ASSET_NOT_TIMESTAMP_MANAGED';
  projectId: string;
  sequenceId: string;
  overlayId: string;
  assetId: string;
  projectRevision: NativeMediaTimestampPreviewWindowV2['projectRevision'];
  decisionStateSha256: string;
  issuedAtEpochMs: number;
  refreshAfterEpochMs: number;
  expiresAtEpochMs: number;
}>;

export function assertNativeMediaTimestampPreviewMaterializeCommandV2(
  value: unknown,
): NativeMediaTimestampPreviewMaterializeCommandV2 {
  const record = exactRecord(value, [
    'expectedProjectRevision', 'kind', 'overlayId', 'projectId', 'schemaVersion',
    'sequenceId', 'windowDurationInFrames', 'windowLocalStartFrame',
  ], 'NATIVE_MEDIA_PREVIEW_MATERIALIZE_COMMAND_V2_INVALID');
  if (record.schemaVersion !== 2
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2) {
    throw new Error('NATIVE_MEDIA_PREVIEW_MATERIALIZE_COMMAND_V2_INVALID');
  }
  return Object.freeze({
    schemaVersion: 2 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
    projectId: identifier(record.projectId, 'NATIVE_MEDIA_PREVIEW_SESSION_PROJECT_INVALID'),
    sequenceId: identifier(record.sequenceId, 'NATIVE_MEDIA_PREVIEW_SESSION_SEQUENCE_INVALID'),
    overlayId: identifier(record.overlayId, 'NATIVE_MEDIA_PREVIEW_SESSION_OVERLAY_INVALID'),
    expectedProjectRevision: projectRevision(record.expectedProjectRevision),
    windowLocalStartFrame: nonNegativeInteger(
      record.windowLocalStartFrame,
      'NATIVE_MEDIA_PREVIEW_SESSION_WINDOW_START_INVALID',
    ),
    windowDurationInFrames: positiveInteger(
      record.windowDurationInFrames,
      'NATIVE_MEDIA_PREVIEW_SESSION_WINDOW_DURATION_INVALID',
    ),
  });
}

export function assertNativeMediaTimestampPreviewClassificationLeaseV1(
  value: unknown,
): NativeMediaTimestampPreviewClassificationLeaseV1 {
  const record = exactRecord(value, [
    'assetId', 'decision', 'decisionStateSha256', 'expiresAtEpochMs', 'issuedAtEpochMs',
    'kind', 'overlayId', 'projectId', 'projectRevision', 'refreshAfterEpochMs',
    'schemaVersion', 'sequenceId',
  ], 'NATIVE_MEDIA_PREVIEW_CLASSIFICATION_LEASE_INVALID');
  const issuedAtEpochMs = nonNegativeInteger(
    record.issuedAtEpochMs,
    'NATIVE_MEDIA_PREVIEW_CLASSIFICATION_LEASE_INVALID',
  );
  const refreshAfterEpochMs = nonNegativeInteger(
    record.refreshAfterEpochMs,
    'NATIVE_MEDIA_PREVIEW_CLASSIFICATION_LEASE_INVALID',
  );
  const expiresAtEpochMs = nonNegativeInteger(
    record.expiresAtEpochMs,
    'NATIVE_MEDIA_PREVIEW_CLASSIFICATION_LEASE_INVALID',
  );
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_LEASE_KIND_V1
    || record.decision !== 'ASSET_NOT_TIMESTAMP_MANAGED'
    || refreshAfterEpochMs <= issuedAtEpochMs
    || expiresAtEpochMs <= refreshAfterEpochMs
    || expiresAtEpochMs - issuedAtEpochMs
      > NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_MAX_TTL_MS_V1) {
    throw new Error('NATIVE_MEDIA_PREVIEW_CLASSIFICATION_LEASE_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_CLASSIFICATION_LEASE_KIND_V1,
    decision: 'ASSET_NOT_TIMESTAMP_MANAGED' as const,
    projectId: identifier(record.projectId, 'NATIVE_MEDIA_PREVIEW_CLASSIFICATION_SCOPE_INVALID'),
    sequenceId: identifier(record.sequenceId, 'NATIVE_MEDIA_PREVIEW_CLASSIFICATION_SCOPE_INVALID'),
    overlayId: identifier(record.overlayId, 'NATIVE_MEDIA_PREVIEW_CLASSIFICATION_SCOPE_INVALID'),
    assetId: identifier(record.assetId, 'NATIVE_MEDIA_PREVIEW_CLASSIFICATION_SCOPE_INVALID'),
    projectRevision: projectRevision(record.projectRevision),
    decisionStateSha256: sha256(record.decisionStateSha256),
    issuedAtEpochMs,
    refreshAfterEpochMs,
    expiresAtEpochMs,
  });
}

function projectRevision(
  value: unknown,
): NativeMediaTimestampPreviewWindowV2['projectRevision'] {
  const record = exactRecord(
    value,
    ['compatibilityUpdatedAt', 'schemaVersion', 'value'],
    'NATIVE_MEDIA_PREVIEW_SESSION_REVISION_INVALID',
  );
  if (record.schemaVersion !== 1
    || !Number.isSafeInteger(record.value)
    || Number(record.value) < 0
    || typeof record.compatibilityUpdatedAt !== 'string'
    || record.compatibilityUpdatedAt.length > 128
    || /[\u0000-\u001F\u007F]/.test(record.compatibilityUpdatedAt)
    || Number.isNaN(Date.parse(record.compatibilityUpdatedAt))) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SESSION_REVISION_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    value: Number(record.value),
    compatibilityUpdatedAt: record.compatibilityUpdatedAt,
  });
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_CLASSIFICATION_LEASE_INVALID');
  }
  return value;
}

export function assertNativeMediaTimestampPreviewReleaseCommandV1(
  value: unknown,
): NativeMediaTimestampPreviewReleaseCommandV1 {
  const record = exactRecord(
    value,
    ['kind', 'schemaVersion', 'window'],
    'NATIVE_MEDIA_PREVIEW_RELEASE_COMMAND_INVALID',
  );
  if (record.schemaVersion !== 1
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1) {
    throw new Error('NATIVE_MEDIA_PREVIEW_RELEASE_COMMAND_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
    window: assertNativeMediaTimestampPreviewWindowV2(record.window),
  });
}

export function assertNativeMediaTimestampPreviewReleaseCommandV2(
  value: unknown,
): NativeMediaTimestampPreviewReleaseCommandV2 {
  const record = exactRecord(
    value,
    ['kind', 'schemaVersion', 'sessionWindow'],
    'NATIVE_MEDIA_PREVIEW_RELEASE_COMMAND_V2_INVALID',
  );
  if (record.schemaVersion !== 2
    || record.kind !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2) {
    throw new Error('NATIVE_MEDIA_PREVIEW_RELEASE_COMMAND_V2_INVALID');
  }
  return Object.freeze({
    schemaVersion: 2 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V2,
    sessionWindow: assertNativeMediaTimestampPreviewSessionWindowV1(record.sessionWindow),
  });
}

function exactRecord(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) throw new Error(code);
  return record;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveInteger(value: unknown, code: string): number {
  const normalized = nonNegativeInteger(value, code);
  if (normalized < 1) throw new Error(code);
  return normalized;
}
