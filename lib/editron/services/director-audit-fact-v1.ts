import { hashEditronCanonicalJsonV1 } from "./canonical-json-v1";

const MAX_AUDIT_FACT_BYTES_V1 = 256 * 1_024;
const MAX_AUDIT_STRING_V1 = 8_000;

export type DirectorAuditFactKindV1 =
  | "UNIFIED_DECISION_BUNDLE"
  | "POST_BUNDLE_PROFILE_ACTION_POLICY";

export type PostBundleProfileActionPolicySummaryV1 = {
  version: "post-bundle-profile-action-policy-v1";
  unifiedDecisionBundleExecuted: true;
  evaluatedAt: string;
  allowedActionCount: number;
  skippedActionCount: number;
  allowedTools: string[];
  skippedActions: Array<{
    tool: string;
    action: string;
    reason: string;
  }>;
};

export type DirectorAuditFactV1 = Readonly<{
  schemaVersion: 1;
  kind: DirectorAuditFactKindV1;
  payload: Record<string, unknown>;
  payloadHash: string;
}>;

export function createDirectorAuditFactV1(input: {
  kind: DirectorAuditFactKindV1;
  payload: Record<string, unknown>;
}): DirectorAuditFactV1 {
  assertDirectorAuditPayloadV1(input.kind, input.payload);
  const fact = {
    schemaVersion: 1 as const,
    kind: input.kind,
    payload: structuredClone(input.payload),
    payloadHash: hashEditronCanonicalJsonV1(input.payload),
  };
  assertDirectorAuditFactV1(fact);
  return fact;
}

export function assertDirectorAuditFactV1(fact: DirectorAuditFactV1): void {
  if (
    !isPlainRecord(fact)
    || fact.schemaVersion !== 1
    || (fact.kind !== "UNIFIED_DECISION_BUNDLE"
      && fact.kind !== "POST_BUNDLE_PROFILE_ACTION_POLICY")
    || !isPlainRecord(fact.payload)
    || !/^[a-f0-9]{64}$/.test(fact.payloadHash)
  ) {
    fail();
  }
  assertDirectorAuditPayloadV1(fact.kind, fact.payload);
  if (hashEditronCanonicalJsonV1(fact.payload) !== fact.payloadHash) fail();
}

function assertDirectorAuditPayloadV1(
  kind: DirectorAuditFactKindV1,
  payload: Record<string, unknown>,
): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    fail();
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_AUDIT_FACT_BYTES_V1) fail();
  if (kind === "UNIFIED_DECISION_BUNDLE") {
    assertUnifiedDecisionBundleSummaryV1(payload);
    return;
  }
  assertPostBundleProfileActionPolicyV1(payload);
}

function assertUnifiedDecisionBundleSummaryV1(payload: Record<string, unknown>): void {
  assertExactKeys(payload, [
    "version",
    "source",
    "authority",
    "totalDecisions",
    "expectedExecuted",
    "expectedSkipped",
    "graphicsDensity",
    "byType",
    "canonicalTimeline",
    "executionTrace",
    "evidence",
  ]);
  if (
    payload.version !== 1
    || !boundedString(payload.source)
    || !isPlainRecord(payload.authority)
    || !nonNegativeInteger(payload.totalDecisions)
    || !nonNegativeInteger(payload.expectedExecuted)
    || !nonNegativeInteger(payload.expectedSkipped)
    || (payload.graphicsDensity !== null && !boundedString(payload.graphicsDensity))
    || !nonNegativeIntegerRecord(payload.byType)
    || (payload.canonicalTimeline !== null && !isPlainRecord(payload.canonicalTimeline))
    || (payload.executionTrace !== null && !isPlainRecord(payload.executionTrace))
    || !isPlainRecord(payload.evidence)
  ) {
    fail();
  }
}

function assertPostBundleProfileActionPolicyV1(payload: Record<string, unknown>): void {
  assertExactKeys(payload, [
    "version",
    "unifiedDecisionBundleExecuted",
    "evaluatedAt",
    "allowedActionCount",
    "skippedActionCount",
    "allowedTools",
    "skippedActions",
  ]);
  const allowedTools = payload.allowedTools;
  const skippedActions = payload.skippedActions;
  if (
    payload.version !== "post-bundle-profile-action-policy-v1"
    || payload.unifiedDecisionBundleExecuted !== true
    || !isoDate(payload.evaluatedAt)
    || !nonNegativeInteger(payload.allowedActionCount)
    || !nonNegativeInteger(payload.skippedActionCount)
    || !Array.isArray(allowedTools)
    || allowedTools.length > 50
    || allowedTools.some((value) => !boundedString(value, 500))
    || new Set(allowedTools).size !== allowedTools.length
    || (payload.allowedActionCount as number) < allowedTools.length
    || !Array.isArray(skippedActions)
    || skippedActions.length > 50
    || (payload.skippedActionCount as number) < skippedActions.length
    || skippedActions.some((value) => (
      !isPlainRecord(value)
      || !hasExactKeys(value, ["tool", "action", "reason"])
      || !boundedString(value.tool, 500)
      || !boundedString(value.action)
      || !boundedString(value.reason)
    ))
  ) {
    fail();
  }
}

function nonNegativeIntegerRecord(value: unknown): boolean {
  return isPlainRecord(value)
    && Object.entries(value).every(([key, count]) => (
      boundedString(key, 500) && nonNegativeInteger(count)
    ));
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isoDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function boundedString(value: unknown, max = MAX_AUDIT_STRING_V1): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (!hasExactKeys(value, keys)) fail();
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(): never {
  throw new Error("DIRECTOR_AUDIT_FACT_INVALID");
}
