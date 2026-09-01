import { hashEditronCanonicalJsonV1 } from "./canonical-json-v1";
import type {
  SegmentCoverageSummary,
  VjepaCoverageAudit,
  VjepaReliabilitySummary,
} from "./vjepa-coverage-audit";

const MAX_AUDIT_FACT_BYTES_V1 = 256 * 1_024;
const MAX_AUDIT_STRING_V1 = 8_000;

export type DirectorAuditFactKindV1 =
  | "UNIFIED_DECISION_BUNDLE"
  | "POST_BUNDLE_PROFILE_ACTION_POLICY"
  | "INTELLIGENCE_RUN_SUMMARY"
  | "INTELLIGENCE_SKIP_SUMMARY"
  | "VJEPA_COVERAGE_AUDIT";

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

export type DirectorIntelligenceRunSummaryV1 = {
  version: "director-intelligence-run-summary-v1";
  status: "partial" | "complete";
  assetsAnalyzed: number;
  assetsFailed: number;
  failedAssets: string[];
  decisionsGenerated: number;
  decisionsExecuted: number;
  cinematicMoments: number;
  completedAt: string;
};

export type DirectorIntelligenceSkipSummaryV1 = {
  version: "director-intelligence-skip-summary-v1";
  status: "skipped_edl";
  reason: string;
  failedAssetCount: number;
  failedAssets: string[];
  message: string;
  attemptedAt: string;
};

export type DirectorVjepaCoverageAuditSummaryV1 = Record<string, unknown> & {
  version: "director-vjepa-coverage-audit-v1";
  status: VjepaCoverageAudit["status"];
  issues: string[];
  issueCount: number;
  issuesTruncated: boolean;
  fps: number;
  expectedDurationMs: number | null;
  durationBasis: VjepaCoverageAudit["durationBasis"];
  segmentCoverage: SegmentCoverageSummary;
  rawFootageCoverage: SegmentCoverageSummary | null;
  overlayHitRate: number | null;
  overlayHitCount: number;
  overlayHits: [];
  overlayHitsTruncated: boolean;
  reliability: VjepaReliabilitySummary | null;
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

export function buildDirectorVjepaCoverageAuditSummaryV1(
  audit: VjepaCoverageAudit,
): DirectorVjepaCoverageAuditSummaryV1 {
  const summary: DirectorVjepaCoverageAuditSummaryV1 = {
    version: "director-vjepa-coverage-audit-v1",
    status: audit.status,
    issues: audit.issues.slice(0, 50),
    issueCount: audit.issues.length,
    issuesTruncated: audit.issues.length > 50,
    fps: audit.fps,
    expectedDurationMs: audit.expectedDurationMs,
    durationBasis: audit.durationBasis,
    segmentCoverage: structuredClone(audit.segmentCoverage),
    rawFootageCoverage: audit.rawFootageCoverage
      ? structuredClone(audit.rawFootageCoverage)
      : null,
    overlayHitRate: audit.overlayHitRate,
    overlayHitCount: audit.overlayHits.length,
    overlayHits: [],
    overlayHitsTruncated: audit.overlayHits.length > 0,
    reliability: audit.reliability ? structuredClone(audit.reliability) : null,
  };
  assertDirectorAuditPayloadV1("VJEPA_COVERAGE_AUDIT", summary);
  return summary;
}

export function assertDirectorAuditFactV1(fact: DirectorAuditFactV1): void {
  if (
    !isPlainRecord(fact)
    || fact.schemaVersion !== 1
    || !isDirectorAuditFactKindV1(fact.kind)
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
  switch (kind) {
    case "UNIFIED_DECISION_BUNDLE":
      assertUnifiedDecisionBundleSummaryV1(payload);
      return;
    case "POST_BUNDLE_PROFILE_ACTION_POLICY":
      assertPostBundleProfileActionPolicyV1(payload);
      return;
    case "INTELLIGENCE_RUN_SUMMARY":
      assertDirectorIntelligenceRunSummaryV1(payload);
      return;
    case "INTELLIGENCE_SKIP_SUMMARY":
      assertDirectorIntelligenceSkipSummaryV1(payload);
      return;
    case "VJEPA_COVERAGE_AUDIT":
      assertDirectorVjepaCoverageAuditSummaryV1(payload);
      return;
  }
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

function assertDirectorIntelligenceRunSummaryV1(payload: Record<string, unknown>): void {
  assertExactKeys(payload, [
    "version",
    "status",
    "assetsAnalyzed",
    "assetsFailed",
    "failedAssets",
    "decisionsGenerated",
    "decisionsExecuted",
    "cinematicMoments",
    "completedAt",
  ]);
  if (
    payload.version !== "director-intelligence-run-summary-v1"
    || (payload.status !== "partial" && payload.status !== "complete")
    || !nonNegativeInteger(payload.assetsAnalyzed)
    || !nonNegativeInteger(payload.assetsFailed)
    || !boundedStringArray(payload.failedAssets, 100, 500)
    || (payload.assetsFailed as number) < (payload.failedAssets as string[]).length
    || !nonNegativeInteger(payload.decisionsGenerated)
    || !nonNegativeInteger(payload.decisionsExecuted)
    || (payload.decisionsExecuted as number) > (payload.decisionsGenerated as number)
    || !nonNegativeInteger(payload.cinematicMoments)
    || !isoDate(payload.completedAt)
  ) {
    fail();
  }
}

function assertDirectorIntelligenceSkipSummaryV1(payload: Record<string, unknown>): void {
  assertExactKeys(payload, [
    "version",
    "status",
    "reason",
    "failedAssetCount",
    "failedAssets",
    "message",
    "attemptedAt",
  ]);
  if (
    payload.version !== "director-intelligence-skip-summary-v1"
    || payload.status !== "skipped_edl"
    || !boundedString(payload.reason)
    || !nonNegativeInteger(payload.failedAssetCount)
    || !boundedStringArray(payload.failedAssets, 100, 500)
    || (payload.failedAssetCount as number) < (payload.failedAssets as string[]).length
    || !boundedString(payload.message)
    || !isoDate(payload.attemptedAt)
  ) {
    fail();
  }
}

function assertDirectorVjepaCoverageAuditSummaryV1(payload: Record<string, unknown>): void {
  assertExactKeys(payload, [
    "version",
    "status",
    "issues",
    "issueCount",
    "issuesTruncated",
    "fps",
    "expectedDurationMs",
    "durationBasis",
    "segmentCoverage",
    "rawFootageCoverage",
    "overlayHitRate",
    "overlayHitCount",
    "overlayHits",
    "overlayHitsTruncated",
    "reliability",
  ]);
  if (
    payload.version !== "director-vjepa-coverage-audit-v1"
    || (payload.status !== "pass" && payload.status !== "warn" && payload.status !== "fail")
    || !boundedStringArray(payload.issues, 50, 1_000)
    || !nonNegativeInteger(payload.issueCount)
    || (payload.issueCount as number) < (payload.issues as string[]).length
    || payload.issuesTruncated !== ((payload.issueCount as number) > (payload.issues as string[]).length)
    || !positiveFiniteNumber(payload.fps)
    || !nullableNonNegativeFiniteNumber(payload.expectedDurationMs)
    || (payload.durationBasis !== "vjepa-eligible-video-timeline"
      && payload.durationBasis !== "original-media"
      && payload.durationBasis !== "unknown")
    || !isSegmentCoverageSummaryV1(payload.segmentCoverage)
    || (payload.rawFootageCoverage !== null
      && !isSegmentCoverageSummaryV1(payload.rawFootageCoverage))
    || !nullableRatio(payload.overlayHitRate)
    || !nonNegativeInteger(payload.overlayHitCount)
    || !Array.isArray(payload.overlayHits)
    || payload.overlayHits.length !== 0
    || payload.overlayHitsTruncated !== ((payload.overlayHitCount as number) > 0)
    || (payload.reliability !== null && !isVjepaReliabilitySummaryV1(payload.reliability))
  ) {
    fail();
  }
}

function isSegmentCoverageSummaryV1(value: unknown): boolean {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "segmentCount",
    "spanStartMs",
    "spanEndMs",
    "coveredMs",
    "gapCount",
    "gapTotalMs",
    "maxGapMs",
    "coverageRatio",
    "fieldCoverage",
  ])) return false;
  const fieldCoverage = value.fieldCoverage;
  if (
    !nonNegativeInteger(value.segmentCount)
    || !nullableFiniteNumber(value.spanStartMs)
    || !nullableFiniteNumber(value.spanEndMs)
    || !nonNegativeFiniteNumber(value.coveredMs)
    || !nonNegativeInteger(value.gapCount)
    || !nonNegativeFiniteNumber(value.gapTotalMs)
    || !nonNegativeFiniteNumber(value.maxGapMs)
    || !nullableRatio(value.coverageRatio)
    || !isPlainRecord(fieldCoverage)
  ) return false;
  const fieldKeys = [
    "visualSignificance",
    "motionIntensity",
    "actionType",
    "motionType",
    "faceEmotion",
    "eyeContact",
    "motionVector",
    "mainSubject",
    "textBoxes",
    "textCoverage",
    "negativeSpace",
    "objectCount",
    "faceCount",
  ];
  return hasExactKeys(fieldCoverage, fieldKeys)
    && fieldKeys.every((key) => ratio(fieldCoverage[key]));
}

function isVjepaReliabilitySummaryV1(value: unknown): boolean {
  return isPlainRecord(value)
    && hasExactKeys(value, ["screenAwarePlacement", "score", "reasons"])
    && (value.screenAwarePlacement === "trusted"
      || value.screenAwarePlacement === "degraded"
      || value.screenAwarePlacement === "unavailable")
    && ratio(value.score)
    && boundedStringArray(value.reasons, 50, 1_000);
}

function boundedStringArray(value: unknown, maxItems: number, maxItemLength: number): boolean {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => boundedString(item, maxItemLength));
}

function isDirectorAuditFactKindV1(value: unknown): value is DirectorAuditFactKindV1 {
  return value === "UNIFIED_DECISION_BUNDLE"
    || value === "POST_BUNDLE_PROFILE_ACTION_POLICY"
    || value === "INTELLIGENCE_RUN_SUMMARY"
    || value === "INTELLIGENCE_SKIP_SUMMARY"
    || value === "VJEPA_COVERAGE_AUDIT";
}

function positiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nullableFiniteNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function nullableNonNegativeFiniteNumber(value: unknown): boolean {
  return value === null || nonNegativeFiniteNumber(value);
}

function ratio(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function nullableRatio(value: unknown): boolean {
  return value === null || ratio(value);
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
