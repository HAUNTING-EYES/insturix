import { Buffer } from "node:buffer";

import { hashEditronCanonicalJsonV1 } from "./canonical-json-v1";
import type {
  DecisionSnapshot,
  ProjectDecisionLog,
} from "./decision-tracker";

const MAX_PERSISTED_SNAPSHOTS_V1 = 100;
const MAX_SIGNAL_KEYS_V1 = 8;
const MAX_PERSISTED_BYTES_V1 = 200 * 1_024;

export type PersistedDirectorDecisionLogV1 = Readonly<{
  version: "director-decision-log-v1";
  projectId: string;
  userId: string;
  createdAt: number;
  contentMode: string;
  totalDurationMs: number;
  snapshotCount: number;
  snapshotsTruncated: boolean;
  samplingStrategy: "STRATIFIED_TECHNIQUE_THEN_TIMELINE_V1";
  snapshotParamsOmitted: true;
  snapshotFieldTruncationCount: number;
  sourceSnapshotIdentityHash: string;
  snapshots: DecisionSnapshot[];
}>;

export function buildPersistedDirectorDecisionLogV1(
  source: ProjectDecisionLog,
): PersistedDirectorDecisionLogV1 {
  assertSourceLogV1(source);
  const selectedIndices = selectSnapshotIndicesV1(source.snapshots);
  let snapshotFieldTruncationCount = 0;
  const snapshots = selectedIndices.map((index) => {
    const result = sanitizeSnapshotV1(source.snapshots[index]);
    snapshotFieldTruncationCount += result.truncationCount;
    return result.snapshot;
  });
  const persisted: PersistedDirectorDecisionLogV1 = {
    version: "director-decision-log-v1",
    projectId: source.projectId,
    userId: source.userId,
    createdAt: source.createdAt,
    contentMode: source.contentMode,
    totalDurationMs: source.totalDurationMs,
    snapshotCount: source.snapshots.length,
    snapshotsTruncated: source.snapshots.length > snapshots.length,
    samplingStrategy: "STRATIFIED_TECHNIQUE_THEN_TIMELINE_V1",
    snapshotParamsOmitted: true,
    snapshotFieldTruncationCount,
    sourceSnapshotIdentityHash: hashEditronCanonicalJsonV1(
      source.snapshots.map((snapshot) => ({
        id: snapshot.id,
        type: snapshot.type,
        technique: snapshot.technique,
        frame: snapshot.frame,
        source: snapshot.source,
      })),
    ),
    snapshots,
  };
  assertPersistedDirectorDecisionLogV1(persisted);
  return persisted;
}

export function assertPersistedDirectorDecisionLogV1(
  value: PersistedDirectorDecisionLogV1,
  expected?: { projectId: string; userId: string },
): void {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "version",
      "projectId",
      "userId",
      "createdAt",
      "contentMode",
      "totalDurationMs",
      "snapshotCount",
      "snapshotsTruncated",
      "samplingStrategy",
      "snapshotParamsOmitted",
      "snapshotFieldTruncationCount",
      "sourceSnapshotIdentityHash",
      "snapshots",
    ])
    || value.version !== "director-decision-log-v1"
    || !boundedString(value.projectId, 200)
    || !boundedString(value.userId, 200)
    || (expected && (
      value.projectId !== expected.projectId
      || value.userId !== expected.userId
    ))
    || !nonNegativeSafeInteger(value.createdAt)
    || !boundedString(value.contentMode, 200)
    || !nonNegativeFinite(value.totalDurationMs)
    || !Array.isArray(value.snapshots)
    || !nonNegativeSafeInteger(value.snapshotCount)
    || value.snapshotsTruncated !== (value.snapshotCount > value.snapshots.length)
    || value.samplingStrategy !== "STRATIFIED_TECHNIQUE_THEN_TIMELINE_V1"
    || value.snapshotParamsOmitted !== true
    || !nonNegativeSafeInteger(value.snapshotFieldTruncationCount)
    || !/^[a-f0-9]{64}$/.test(value.sourceSnapshotIdentityHash)
    || value.snapshots.length > MAX_PERSISTED_SNAPSHOTS_V1
    || value.snapshotCount < value.snapshots.length
    || value.snapshots.some((snapshot) => !isPersistedSnapshotV1(snapshot))
    || serializedByteLengthV1(value) > MAX_PERSISTED_BYTES_V1
  ) {
    fail();
  }
}

function serializedByteLengthV1(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function assertSourceLogV1(source: ProjectDecisionLog): void {
  if (
    !isRecord(source)
    || !boundedString(source.projectId, 200)
    || !boundedString(source.userId, 200)
    || !nonNegativeSafeInteger(source.createdAt)
    || !boundedString(source.contentMode, 200)
    || !nonNegativeFinite(source.totalDurationMs)
    || !Array.isArray(source.snapshots)
    || source.snapshots.some((snapshot) => !isSourceSnapshotV1(snapshot))
  ) {
    fail();
  }
}

function selectSnapshotIndicesV1(snapshots: readonly DecisionSnapshot[]): number[] {
  if (snapshots.length <= MAX_PERSISTED_SNAPSHOTS_V1) {
    return snapshots.map((_, index) => index);
  }
  const selected = new Set<number>();
  const techniques = new Set<string>();
  for (let index = 0; index < snapshots.length && selected.size < MAX_PERSISTED_SNAPSHOTS_V1; index++) {
    if (techniques.has(snapshots[index].technique)) continue;
    techniques.add(snapshots[index].technique);
    selected.add(index);
  }
  const remainingSlots = MAX_PERSISTED_SNAPSHOTS_V1 - selected.size;
  for (let slot = 0; slot < remainingSlots; slot++) {
    const index = remainingSlots === 1
      ? Math.round((snapshots.length - 1) / 2)
      : Math.round((slot * (snapshots.length - 1)) / (remainingSlots - 1));
    selected.add(index);
  }
  for (let index = 0; index < snapshots.length && selected.size < MAX_PERSISTED_SNAPSHOTS_V1; index++) {
    selected.add(index);
  }
  return [...selected].sort((left, right) => left - right);
}

function sanitizeSnapshotV1(source: DecisionSnapshot): {
  snapshot: DecisionSnapshot;
  truncationCount: number;
} {
  let truncationCount = Object.keys(source.params).length > 0 ? 1 : 0;
  const id = clamp(source.id, 200);
  const type = clamp(String(source.type), 100);
  const technique = clamp(source.technique, 200);
  const reason = clampAllowEmpty(source.reason, 500);
  const sourceName = clamp(source.source, 200);
  const overlayId = source.overlayId ? clamp(source.overlayId, 200) : undefined;
  truncationCount += Number(id.truncated)
    + Number(type.truncated)
    + Number(technique.truncated)
    + Number(reason.truncated)
    + Number(sourceName.truncated)
    + Number(overlayId?.truncated ?? false);

  const signalEntries = Object.entries(source.signalContext).sort(([left], [right]) => (
    left.localeCompare(right)
  ));
  if (signalEntries.length > MAX_SIGNAL_KEYS_V1) {
    truncationCount += signalEntries.length - MAX_SIGNAL_KEYS_V1;
  }
  const signalContext: Record<string, number> = {};
  for (const [rawKey, signal] of signalEntries.slice(0, MAX_SIGNAL_KEYS_V1)) {
    const key = clamp(rawKey, 64);
    truncationCount += Number(key.truncated);
    signalContext[key.value] = signal;
  }

  return {
    snapshot: {
      id: id.value,
      type: type.value as DecisionSnapshot["type"],
      technique: technique.value,
      frame: source.frame,
      confidence: source.confidence,
      reason: reason.value,
      source: sourceName.value,
      params: {},
      signalContext,
      ...(overlayId ? { overlayId: overlayId.value } : {}),
    },
    truncationCount,
  };
}

function isSourceSnapshotV1(value: unknown): value is DecisionSnapshot {
  return isRecord(value)
    && boundedString(value.id, 10_000)
    && typeof value.type === "string"
    && boundedString(value.type, 10_000)
    && boundedString(value.technique, 10_000)
    && nonNegativeSafeInteger(value.frame)
    && ratio(value.confidence)
    && typeof value.reason === "string"
    && boundedString(value.source, 10_000)
    && isRecord(value.params)
    && isFiniteNumberRecord(value.signalContext)
    && (value.overlayId === undefined || boundedString(value.overlayId, 10_000));
}

function isPersistedSnapshotV1(value: unknown): boolean {
  if (!isSourceSnapshotV1(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [
    "confidence",
    "frame",
    "id",
    "params",
    "reason",
    "signalContext",
    "source",
    "technique",
    "type",
    ...(value.overlayId === undefined ? [] : ["overlayId"]),
  ].sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && Object.keys(value.params).length === 0
    && Object.keys(value.signalContext).length <= MAX_SIGNAL_KEYS_V1
    && Object.keys(value.signalContext).every((key) => boundedString(key, 64));
}

function isFiniteNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value)
    && Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function clamp(value: string, max: number): { value: string; truncated: boolean } {
  const normalized = value.trim();
  if (!normalized) fail();
  return normalized.length <= max
    ? { value: normalized, truncated: false }
    : { value: normalized.slice(0, max), truncated: true };
}

function clampAllowEmpty(value: string, max: number): { value: string; truncated: boolean } {
  const normalized = value.trim();
  return normalized.length <= max
    ? { value: normalized, truncated: false }
    : { value: normalized.slice(0, max), truncated: true };
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function ratio(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(): never {
  throw new Error("DIRECTOR_DECISION_LOG_INVALID");
}
