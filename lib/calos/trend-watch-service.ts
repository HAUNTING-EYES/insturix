import { createHash, randomUUID } from "node:crypto";
import {
  CalosTrendWatchPolicy,
  CalosTrendWatchScan,
  type CalosTrendWatchCandidate,
  type ICalosTrendWatchPolicy,
} from "@/schemas/calos-trend-watch";
import { getTrendsProvider, type Trend } from "@/lib/calos/trends";

const DEFAULT_TREND_WATCH_INTERVAL_HOURS = 72;
const MIN_TREND_WATCH_INTERVAL_HOURS = 24;
const MAX_TREND_WATCH_INTERVAL_HOURS = 168;

const SCAN_LEASE_MS = 10 * 60 * 1_000;
const PUBLIC_RESULT_CACHE_MS = 12 * 60 * 60 * 1_000;
const MIN_RETRY_BACKOFF_HOURS = 3;
const MAX_RETRY_BACKOFF_HOURS = 24;
const MAX_CANDIDATES_PER_SCAN = 12;

interface PublicTrendWatchQuery {
  niche: string;
  platforms: string[];
  location?: string;
  fingerprint: string;
}

interface CachedTrendWatchScan {
  status?: string;
  queryFingerprint?: string;
  completedAt?: Date | string | null;
  candidates?: unknown[];
  provider?: string;
}

type TrendWatchProcessResult =
  | { status: "idle" }
  | { status: "completed"; scanId: string; candidateCount: number; resultSource: "live" | "cached" }
  | { status: "unavailable"; scanId: string }
  | { status: "failed"; scanId: string; failureCode: "provider_request_failed" | "invalid_public_query" };

export function normalizeTrendWatchIntervalHours(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TREND_WATCH_INTERVAL_HOURS;
  return Math.min(MAX_TREND_WATCH_INTERVAL_HOURS, Math.max(MIN_TREND_WATCH_INTERVAL_HOURS, Math.round(parsed)));
}

export function nextTrendWatchScanAt(now: Date, intervalHours: unknown): Date {
  return new Date(now.getTime() + normalizeTrendWatchIntervalHours(intervalHours) * 60 * 60 * 1_000);
}

interface TrendWatchScope {
  ownerUserId: string;
  orgId?: string | null;
  brandId: string;
}

/** Stable unique key for one brand's watch policy — per org when in an org, else per creator. */
function buildTrendWatchScopeKey(scope: TrendWatchScope): string {
  return `${scope.orgId ? `org:${scope.orgId}` : `user:${scope.ownerUserId}`}:${scope.brandId}`;
}

export async function getTrendWatchPolicy(scope: TrendWatchScope): Promise<ICalosTrendWatchPolicy | null> {
  return CalosTrendWatchPolicy.findOne({ scopeKey: buildTrendWatchScopeKey(scope) });
}

interface UpsertTrendWatchInput extends TrendWatchScope {
  enabled: boolean;
  publicNiche: string;
  platforms?: string[];
  location?: string | null;
  intervalHours?: number;
}

/**
 * Create or update a brand's trend-watch policy — the ENROLLMENT the watch pipeline was missing.
 * Nothing else in the app writes calos_trend_watch_policies, so without this the watch cron never has
 * anything to scan and the whole watch → opportunity → "Trend ideas" queue stays empty. Enabling sets
 * nextScanAt to now, so the first scan fires on the next cron tick (≤ the 6h cadence).
 */
export async function upsertTrendWatchPolicy(input: UpsertTrendWatchInput): Promise<ICalosTrendWatchPolicy> {
  const scopeKey = buildTrendWatchScopeKey(input);
  const niche = input.publicNiche.trim().slice(0, 300);
  if (niche.length < 2) throw new Error("A niche is required to watch trends.");
  const platforms = Array.from(
    new Set((input.platforms ?? []).map((p) => String(p).trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 12);
  const location = input.location ? String(input.location).trim().slice(0, 120) : null;
  const intervalHours = normalizeTrendWatchIntervalHours(input.intervalHours);
  const now = new Date();

  const policy = await CalosTrendWatchPolicy.findOneAndUpdate(
    { scopeKey },
    {
      $set: {
        enabled: input.enabled,
        publicNiche: niche,
        platforms,
        location,
        intervalHours,
        // Enabling → due now so the first scan runs on the next cron tick.
        ...(input.enabled ? { nextScanAt: now } : {}),
      },
      $setOnInsert: {
        scopeKey,
        ownerUserId: input.ownerUserId,
        orgId: input.orgId ?? null,
        brandId: input.brandId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return policy!;
}

export function buildPublicTrendWatchQuery(policy: Pick<ICalosTrendWatchPolicy, "publicNiche" | "platforms" | "location">): PublicTrendWatchQuery {
  const niche = sanitizePublicQueryText(policy.publicNiche, 300);
  if (niche.length < 2) throw new Error("Trend watch policy has no safe public niche.");

  const platforms = Array.from(new Set(
    (policy.platforms ?? [])
      .map((platform) => sanitizePublicQueryText(platform, 40).toLowerCase())
      .filter(Boolean),
  )).sort();
  const location = policy.location ? sanitizePublicQueryText(policy.location, 120) : undefined;
  const fingerprint = fingerprintFor([niche.toLowerCase(), platforms.join(","), location?.toLowerCase() ?? ""].join("|"));

  return { niche, platforms, ...(location ? { location } : {}), fingerprint };
}

export function sanitizeTrendWatchCandidates(trends: readonly unknown[]): CalosTrendWatchCandidate[] {
  const deduped = new Map<string, CalosTrendWatchCandidate>();
  for (const trend of trends) {
    if (!isTrendRecord(trend)) continue;
    const title = sanitizeExternalText(trend.title, 240);
    if (!title) continue;
    const platform = sanitizeExternalText(trend.platform, 80).toLowerCase() || "web";
    const summary = sanitizeExternalText(trend.summary, 800);
    const url = safeHttpUrl(trend.url);
    const capturedAt = safeIsoDate(trend.capturedAt);
    const candidate: CalosTrendWatchCandidate = {
      title,
      platform,
      ...(summary ? { summary } : {}),
      ...(url ? { url } : {}),
      ...(capturedAt ? { capturedAt } : {}),
      ...(typeof trend.score === "number" && Number.isFinite(trend.score)
        ? { score: Math.max(0, Math.min(1, trend.score)) }
        : {}),
    };
    const key = `${title.toLowerCase()}|${platform}`;
    if (!deduped.has(key)) deduped.set(key, candidate);
  }
  return Array.from(deduped.values()).slice(0, MAX_CANDIDATES_PER_SCAN);
}

function isTrendRecord(value: unknown): value is Trend {
  return Boolean(value) && typeof value === "object";
}

export function isReusableTrendWatchScan(
  scan: { status?: string; queryFingerprint?: string; completedAt?: Date | string | null; candidates?: unknown[] } | null | undefined,
  query: PublicTrendWatchQuery,
  now: Date,
): boolean {
  if (!scan || scan.status !== "completed" || scan.queryFingerprint !== query.fingerprint || !Array.isArray(scan.candidates) || scan.candidates.length === 0) {
    return false;
  }
  const completedAt = scan.completedAt instanceof Date ? scan.completedAt : new Date(String(scan.completedAt ?? ""));
  return !Number.isNaN(completedAt.getTime()) && now.getTime() - completedAt.getTime() <= PUBLIC_RESULT_CACHE_MS;
}

/** Collects public evidence only. Private matching and calendar mutation are separate stages. */
export async function processNextDueTrendWatch(now = new Date()): Promise<TrendWatchProcessResult> {
  await markAbandonedTrendWatchScans(now);
  const leaseId = `trend_watch_${randomUUID().replace(/-/g, "")}`;
  const policy = await CalosTrendWatchPolicy.findOneAndUpdate(
    {
      enabled: true,
      nextScanAt: { $lte: now },
      $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
    },
    { $set: { leaseId, leaseExpiresAt: new Date(now.getTime() + SCAN_LEASE_MS), lastAttemptAt: now } },
    { sort: { nextScanAt: 1 }, new: true },
  );
  if (!policy) return { status: "idle" };

  let query: PublicTrendWatchQuery;
  try {
    query = buildPublicTrendWatchQuery(policy);
  } catch {
    const scanId = await recordInvalidQueryScan(policy, leaseId, now);
    return { status: "failed", scanId, failureCode: "invalid_public_query" };
  }

  const scanId = `trend_scan_${randomUUID().replace(/-/g, "")}`;
  await CalosTrendWatchScan.create({
    scanId,
    policyId: String(policy._id),
    scopeKey: policy.scopeKey,
    ownerUserId: policy.ownerUserId,
    orgId: policy.orgId ?? null,
    brandId: policy.brandId,
    queryFingerprint: query.fingerprint,
    query: { niche: query.niche, platforms: query.platforms, ...(query.location ? { location: query.location } : {}) },
    status: "running",
    provider: "pending",
    resultSource: "live",
    candidates: [],
    candidateCount: 0,
    startedAt: now,
  });

  try {
    const cached = await CalosTrendWatchScan.findOne({
      queryFingerprint: query.fingerprint,
      status: "completed",
      completedAt: { $gte: new Date(now.getTime() - PUBLIC_RESULT_CACHE_MS) },
      candidateCount: { $gt: 0 },
    }).sort({ completedAt: -1 }).lean() as CachedTrendWatchScan | null;

    if (cached && isReusableTrendWatchScan(cached, query, now)) {
      const candidates = sanitizeTrendWatchCandidates(cached.candidates as Trend[]);
      await completeScan({ policy, leaseId, scanId, now, provider: cached.provider ?? "unknown", resultSource: "cached", candidates });
      return { status: "completed", scanId, candidateCount: candidates.length, resultSource: "cached" };
    }

    const provider = getTrendsProvider();
    if (!provider.available()) {
      await completeScan({ policy, leaseId, scanId, now, provider: provider.name, status: "unavailable", failureCode: "provider_unavailable" });
      return { status: "unavailable", scanId };
    }

    const trends = await provider.getTrends({
      niche: query.niche,
      ...(query.platforms.length ? { platforms: query.platforms } : {}),
      ...(query.location ? { location: query.location } : {}),
      limit: MAX_CANDIDATES_PER_SCAN,
    });
    const candidates = sanitizeTrendWatchCandidates(trends);
    await completeScan({ policy, leaseId, scanId, now, provider: provider.name, resultSource: "live", candidates });
    return { status: "completed", scanId, candidateCount: candidates.length, resultSource: "live" };
  } catch (error) {
    console.error("[CalOS:TrendWatch] Public trend scan failed", {
      scanId,
      policyId: String(policy._id),
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    await completeScan({ policy, leaseId, scanId, now, provider: "unknown", status: "failed", failureCode: "provider_request_failed" });
    return { status: "failed", scanId, failureCode: "provider_request_failed" };
  }
}

async function markAbandonedTrendWatchScans(now: Date): Promise<void> {
  await CalosTrendWatchScan.updateMany(
    {
      status: "running",
      startedAt: { $lte: new Date(now.getTime() - SCAN_LEASE_MS) },
    },
    {
      $set: {
        status: "failed",
        provider: "unknown",
        completedAt: now,
        failureCode: "scan_abandoned",
      },
    },
  );
}

async function recordInvalidQueryScan(policy: ICalosTrendWatchPolicy, leaseId: string, now: Date): Promise<string> {
  const scanId = `trend_scan_${randomUUID().replace(/-/g, "")}`;
  await CalosTrendWatchScan.create({
    scanId,
    policyId: String(policy._id),
    scopeKey: policy.scopeKey,
    ownerUserId: policy.ownerUserId,
    orgId: policy.orgId ?? null,
    brandId: policy.brandId,
    queryFingerprint: "invalid_public_query",
    query: { niche: "invalid_public_query", platforms: [] },
    status: "failed",
    provider: "none",
    resultSource: "live",
    candidates: [],
    candidateCount: 0,
    startedAt: now,
    completedAt: now,
    failureCode: "invalid_public_query",
  });
  await releaseFailedPolicy(policy, leaseId, now);
  return scanId;
}

async function completeScan(input: {
  policy: ICalosTrendWatchPolicy;
  leaseId: string;
  scanId: string;
  now: Date;
  provider: string;
  resultSource?: "live" | "cached";
  candidates?: CalosTrendWatchCandidate[];
  status?: "unavailable" | "failed";
  failureCode?: "provider_unavailable" | "provider_request_failed";
}): Promise<void> {
  const status = input.status ?? "completed";
  const candidates = input.candidates ?? [];
  await CalosTrendWatchScan.updateOne(
    { scanId: input.scanId, status: "running" },
    {
      $set: {
        status,
        provider: input.provider,
        resultSource: input.resultSource ?? "live",
        candidates,
        candidateCount: candidates.length,
        completedAt: input.now,
        failureCode: input.failureCode ?? null,
      },
    },
  );

  if (status === "completed") {
    await CalosTrendWatchPolicy.updateOne(
      { _id: input.policy._id, leaseId: input.leaseId },
      {
        $set: {
          lastScanAt: input.now,
          lastAttemptAt: input.now,
          nextScanAt: nextTrendWatchScanAt(input.now, input.policy.intervalHours),
          consecutiveFailures: 0,
          leaseId: null,
          leaseExpiresAt: null,
        },
      },
    );
    return;
  }

  await releaseFailedPolicy(input.policy, input.leaseId, input.now);
}

async function releaseFailedPolicy(policy: ICalosTrendWatchPolicy, leaseId: string, now: Date): Promise<void> {
  const failures = Math.max(1, Number(policy.consecutiveFailures ?? 0) + 1);
  const retryHours = Math.min(MAX_RETRY_BACKOFF_HOURS, MIN_RETRY_BACKOFF_HOURS * failures);
  await CalosTrendWatchPolicy.updateOne(
    { _id: policy._id, leaseId },
    {
      $set: {
        lastAttemptAt: now,
        nextScanAt: new Date(now.getTime() + retryHours * 60 * 60 * 1_000),
        consecutiveFailures: failures,
        leaseId: null,
        leaseExpiresAt: null,
      },
    },
  );
}

function sanitizePublicQueryText(value: unknown, maxChars: number): string {
  return (typeof value === "string" ? value : "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "")
    .replace(/\b(?:sk|pk)[-_][a-z0-9_=-]{6,}\b/gi, "")
    .replace(/\b(?:api\s*key|key|token|secret)\s*[:=]?\s*[a-z0-9_=-]{6,}\b/gi, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function sanitizeExternalText(value: unknown, maxChars: number): string {
  return (typeof value === "string" ? value : "")
    .replace(/[<>\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_000) return undefined;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function fingerprintFor(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
