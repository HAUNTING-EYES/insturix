import { createHash, randomUUID } from "node:crypto";
import CalosDeliverable from "@/schemas/calos-deliverable";
import { CalosTrendWatchPolicy, CalosTrendWatchScan, type CalosTrendWatchCandidate } from "@/schemas/calos-trend-watch";
import {
  CalosTrendOpportunity,
  type CalosTrendOpportunityRecommendation,
} from "@/schemas/calos-trend-opportunity";
import { calosScope } from "@/lib/calos/scope";
import { resolveEffectiveBrandWithProfile } from "@/lib/shared/brand-effective-resolver";
import { isBrandSignalActionable, type BrandSignal, type BrandSignalProfile } from "@/lib/shared/brand-signal-profile";

export const TREND_OPPORTUNITY_MATCHER_VERSION = 1;
export const MIN_TREND_OPPORTUNITY_SCORE = 0.5;

const OPPORTUNITY_LEASE_MS = 10 * 60 * 1_000;
const OPPORTUNITY_SOURCE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const RETRY_DELAY_MS = 60 * 60 * 1_000;
const MAX_MATCH_ATTEMPTS = 3;
const MAX_SOURCE_SCANS_PER_TICK = 24;
const MAX_ADAPT_CARDS = 40;

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "along", "among", "and", "are", "around", "because", "been", "being", "between",
  "both", "but", "content", "could", "from", "have", "into", "just", "more", "most", "other", "over", "post", "that",
  "the", "their", "them", "then", "these", "they", "this", "through", "trend", "using", "with", "your",
]);

export type TrendOpportunityProcessResult =
  | { status: "idle" }
  | { status: "suggested"; opportunityId: string; recommendation: CalosTrendOpportunityRecommendation }
  | { status: "not_relevant"; opportunityId: string }
  | { status: "blocked"; opportunityId: string; reasonCode: string }
  | { status: "failed"; opportunityId: string };

export interface TrendOpportunityMatchDecision {
  status: "suggested" | "not_relevant" | "blocked";
  relevanceScore: number | null;
  reasonCodes: string[];
  matchedSignalPaths: string[];
}

interface TrendWatchScanRecord {
  scanId: string;
  policyId: string;
  scopeKey: string;
  ownerUserId: string;
  orgId?: string | null;
  brandId: string;
  candidates?: unknown[];
  completedAt?: Date | null;
}

interface OpportunityWorkItem {
  _id: unknown;
  opportunityId: string;
  policyId: string;
  scopeKey: string;
  ownerUserId: string;
  orgId?: string | null;
  brandId: string;
  candidate: CalosTrendWatchCandidate;
  leaseId?: string | null;
  attempts: number;
}

interface UpcomingDeliverable {
  _id: unknown;
  card?: { title?: unknown; details?: unknown };
}

interface BrandTermGroup {
  code: string;
  weight: number;
  terms: BrandTerm[];
}

interface BrandTerm {
  value: string;
  signalPath: string;
}

export function buildTrendOpportunitySourceKey(scanId: string, candidateIndex: number, candidate: Pick<CalosTrendWatchCandidate, "title" | "platform">): string {
  return createHash("sha256")
    .update(`${scanId}|${candidateIndex}|${normalizeText(candidate.title)}|${normalizeText(candidate.platform)}`)
    .digest("hex");
}

/** Scores public trend evidence against accepted Brand Vault signals without sending private context to a provider. */
export function evaluateTrendCandidate(candidate: CalosTrendWatchCandidate, profile: BrandSignalProfile): TrendOpportunityMatchDecision {
  const candidateText = normalizeText([candidate.title, candidate.summary].filter(Boolean).join(" "));
  const candidateTokens = tokenize(candidateText);
  const killList = acceptedStringValues(profile.voice.killList);
  if (killList.some((term) => phraseMatches(candidateText, term))) {
    return {
      status: "blocked",
      relevanceScore: null,
      reasonCodes: ["brand_constraint"],
      matchedSignalPaths: ["voice.killList"],
    };
  }

  const groups = relevanceGroups(profile);
  if (groups.length === 0) {
    return {
      status: "blocked",
      relevanceScore: null,
      reasonCodes: ["accepted_relevance_signals_required"],
      matchedSignalPaths: [],
    };
  }

  let weightedCoverage = 0;
  let hasDirectMatch = false;
  const reasonCodes: string[] = [];
  const matchedSignalPaths: string[] = [];
  for (const group of groups) {
    const match = scoreGroupMatch(group, candidateText, candidateTokens);
    if (match.coverage <= 0) continue;
    weightedCoverage += group.weight * match.coverage;
    hasDirectMatch ||= match.direct;
    reasonCodes.push(group.code);
    matchedSignalPaths.push(...match.matchedSignalPaths);
  }

  if (matchedSignalPaths.length === 0) {
    return {
      status: "not_relevant",
      relevanceScore: 0,
      reasonCodes: ["insufficient_brand_fit"],
      matchedSignalPaths: [],
    };
  }

  const momentum = clamp01(typeof candidate.score === "number" ? candidate.score : 0.5);
  const relevanceScore = clamp01(0.55 * weightedCoverage + 0.25 * momentum + (hasDirectMatch ? 0.2 : 0));
  if (relevanceScore < MIN_TREND_OPPORTUNITY_SCORE) {
    return {
      status: "not_relevant",
      relevanceScore,
      reasonCodes: ["insufficient_brand_fit"],
      matchedSignalPaths: unique(matchedSignalPaths),
    };
  }

  if (momentum >= 0.7) reasonCodes.push("trend_momentum");
  return {
    status: "suggested",
    relevanceScore,
    reasonCodes: unique(reasonCodes),
    matchedSignalPaths: unique(matchedSignalPaths),
  };
}

/** Claims one public candidate or an abandoned private match, then evaluates it inside the service boundary. */
export async function processNextTrendOpportunity(now = new Date()): Promise<TrendOpportunityProcessResult> {
  await markAbandonedMatches(now);
  const work = await claimRetry(now) ?? await claimFreshCandidate(now);
  if (!work) return { status: "idle" };
  return evaluateClaimedOpportunity(work, now);
}

async function evaluateClaimedOpportunity(work: OpportunityWorkItem, now: Date): Promise<TrendOpportunityProcessResult> {
  try {
    const policy = await CalosTrendWatchPolicy.findOne({
      _id: work.policyId,
      scopeKey: work.scopeKey,
      ownerUserId: work.ownerUserId,
      orgId: work.orgId ?? null,
      brandId: work.brandId,
      enabled: true,
    }).lean() as unknown as { calendarWindowDays?: number } | null;
    if (!policy) {
      await finalizeOpportunity(work, now, {
        status: "blocked",
        relevanceScore: null,
        reasonCodes: ["watch_policy_unavailable"],
        matchedSignalPaths: [],
      });
      return { status: "blocked", opportunityId: work.opportunityId, reasonCode: "watch_policy_unavailable" };
    }

    const resolution = await resolveEffectiveBrandWithProfile(work.ownerUserId, work.brandId, {
      service: "thinkforge",
      enabled: true,
      strict: true,
      orgId: work.orgId ?? null,
    });
    if (!resolution.acceptedProfile) {
      await finalizeOpportunity(work, now, {
        status: "blocked",
        relevanceScore: null,
        reasonCodes: ["accepted_profile_required"],
        matchedSignalPaths: [],
      });
      return { status: "blocked", opportunityId: work.opportunityId, reasonCode: "accepted_profile_required" };
    }

    const decision = evaluateTrendCandidate(work.candidate, resolution.acceptedProfile);
    if (decision.status !== "suggested") {
      await finalizeOpportunity(work, now, {
        ...decision,
        acceptedProfileGeneratedAt: resolution.acceptedProfile.generatedAt,
      });
      return decision.status === "blocked"
        ? { status: "blocked", opportunityId: work.opportunityId, reasonCode: decision.reasonCodes[0] ?? "blocked" }
        : { status: "not_relevant", opportunityId: work.opportunityId };
    }

    const calendarWindowEndsAt = new Date(now.getTime() + calendarWindowDays(policy.calendarWindowDays) * 24 * 60 * 60 * 1_000);
    const adaptDeliverableId = await findAdaptDeliverable(work, now, calendarWindowEndsAt);
    const recommendation: CalosTrendOpportunityRecommendation = adaptDeliverableId ? "adapt" : "add";
    await finalizeOpportunity(work, now, {
      ...decision,
      recommendation,
      adaptDeliverableId,
      calendarWindowEndsAt,
      acceptedProfileGeneratedAt: resolution.acceptedProfile.generatedAt,
      reasonCodes: adaptDeliverableId ? unique([...decision.reasonCodes, "planned_card_alignment"]) : decision.reasonCodes,
    });
    return { status: "suggested", opportunityId: work.opportunityId, recommendation };
  } catch (error) {
    console.error("[CalOS:TrendOpportunity] Private match failed", {
      opportunityId: work.opportunityId,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    await retryOrFailOpportunity(work, now);
    return { status: "failed", opportunityId: work.opportunityId };
  }
}

async function claimRetry(now: Date): Promise<OpportunityWorkItem | null> {
  const leaseId = newLeaseId();
  return await CalosTrendOpportunity.findOneAndUpdate(
    {
      status: "processing",
      leaseExpiresAt: { $lte: now },
      nextAttemptAt: { $lte: now },
      attempts: { $lt: MAX_MATCH_ATTEMPTS },
    },
    {
      $set: { leaseId, leaseExpiresAt: new Date(now.getTime() + OPPORTUNITY_LEASE_MS) },
      $inc: { attempts: 1 },
    },
    { sort: { nextAttemptAt: 1 }, new: true },
  ).lean() as unknown as OpportunityWorkItem | null;
}

async function claimFreshCandidate(now: Date): Promise<OpportunityWorkItem | null> {
  const scans = await CalosTrendWatchScan.find({
    status: "completed",
    candidateCount: { $gt: 0 },
    completedAt: { $gte: new Date(now.getTime() - OPPORTUNITY_SOURCE_TTL_MS) },
  })
    .sort({ completedAt: -1 })
    .limit(MAX_SOURCE_SCANS_PER_TICK)
    .lean() as unknown as TrendWatchScanRecord[];

  for (const scan of scans) {
    for (const [index, rawCandidate] of (scan.candidates ?? []).entries()) {
      const candidate = readCandidate(rawCandidate);
      if (!candidate || !isCurrentCandidate(candidate, now)) continue;
      const sourceKey = buildTrendOpportunitySourceKey(scan.scanId, index, candidate);
      try {
        const created = await CalosTrendOpportunity.create({
          opportunityId: `trend_opportunity_${randomUUID().replace(/-/g, "")}`,
          sourceKey,
          sourceScanId: scan.scanId,
          sourceCandidateIndex: index,
          policyId: scan.policyId,
          scopeKey: scan.scopeKey,
          ownerUserId: scan.ownerUserId,
          orgId: scan.orgId ?? null,
          brandId: scan.brandId,
          candidate,
          status: "processing",
          relevanceScore: null,
          reasonCodes: [],
          matchedSignalPaths: [],
          matcherVersion: TREND_OPPORTUNITY_MATCHER_VERSION,
          leaseId: newLeaseId(),
          leaseExpiresAt: new Date(now.getTime() + OPPORTUNITY_LEASE_MS),
          nextAttemptAt: now,
          attempts: 1,
          expiresAt: new Date(now.getTime() + OPPORTUNITY_SOURCE_TTL_MS),
        });
        return created.toObject() as unknown as OpportunityWorkItem;
      } catch (error) {
        if (isDuplicateKeyError(error)) continue;
        throw error;
      }
    }
  }
  return null;
}

async function findAdaptDeliverable(work: OpportunityWorkItem, now: Date, calendarWindowEndsAt: Date): Promise<string | null> {
  const cards = await CalosDeliverable.find({
    ...calosScope({ userId: work.ownerUserId, orgId: work.orgId ?? null }, work.brandId),
    deletedAt: null,
    editorialStatus: { $in: ["idea", "drafting", "changes_requested"] },
    plannedDates: { $gte: now.toISOString(), $lte: calendarWindowEndsAt.toISOString() },
  })
    .select("_id card.title card.details")
    .limit(MAX_ADAPT_CARDS)
    .lean() as unknown as UpcomingDeliverable[];

  const candidateTokens = tokenize(normalizeText([work.candidate.title, work.candidate.summary].filter(Boolean).join(" ")));
  let best: { id: string; score: number } | null = null;
  for (const card of cards) {
    const cardText = normalizeText([card.card?.title, card.card?.details].filter((value): value is string => typeof value === "string").join(" "));
    const score = sharedTokenScore(candidateTokens, tokenize(cardText));
    if (score < 0.35 || (best && score <= best.score)) continue;
    best = { id: String(card._id), score };
  }
  return best?.id ?? null;
}

async function finalizeOpportunity(
  work: OpportunityWorkItem,
  now: Date,
  input: TrendOpportunityMatchDecision & {
    recommendation?: CalosTrendOpportunityRecommendation;
    adaptDeliverableId?: string | null;
    calendarWindowEndsAt?: Date | null;
    acceptedProfileGeneratedAt?: string | null;
  },
): Promise<void> {
  await CalosTrendOpportunity.updateOne(
    { _id: work._id, leaseId: work.leaseId },
    {
      $set: {
        status: input.status,
        relevanceScore: input.relevanceScore,
        reasonCodes: input.reasonCodes,
        matchedSignalPaths: input.matchedSignalPaths,
        recommendation: input.recommendation ?? null,
        adaptDeliverableId: input.adaptDeliverableId ?? null,
        calendarWindowEndsAt: input.calendarWindowEndsAt ?? null,
        acceptedProfileGeneratedAt: input.acceptedProfileGeneratedAt ?? null,
        evaluatedAt: now,
        leaseId: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        failureCode: null,
      },
    },
  );
}

async function retryOrFailOpportunity(work: OpportunityWorkItem, now: Date): Promise<void> {
  const terminal = work.attempts >= MAX_MATCH_ATTEMPTS;
  await CalosTrendOpportunity.updateOne(
    { _id: work._id, leaseId: work.leaseId },
    {
      $set: {
        status: terminal ? "failed" : "processing",
        evaluatedAt: terminal ? now : null,
        leaseId: null,
        leaseExpiresAt: null,
        nextAttemptAt: terminal ? null : new Date(now.getTime() + RETRY_DELAY_MS),
        failureCode: "matcher_failed",
      },
    },
  );
}

async function markAbandonedMatches(now: Date): Promise<void> {
  await CalosTrendOpportunity.updateMany(
    {
      status: "processing",
      leaseExpiresAt: { $lte: now },
      attempts: { $gte: MAX_MATCH_ATTEMPTS },
    },
    {
      $set: {
        status: "failed",
        evaluatedAt: now,
        leaseId: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        failureCode: "matcher_abandoned",
      },
    },
  );
}

function relevanceGroups(profile: BrandSignalProfile): BrandTermGroup[] {
  const groups: BrandTermGroup[] = [
    {
      code: "industry_or_category",
      weight: 0.4,
      terms: acceptedTerms([
        [profile.identity.industry, "identity.industry"],
        [profile.identity.category, "identity.category"],
      ]),
    },
    {
      code: "product_or_service",
      weight: 0.38,
      terms: acceptedTerms([[profile.identity.productServices, "identity.productServices"]]),
    },
    {
      code: "audience",
      weight: 0.15,
      terms: acceptedTerms([[profile.identity.audience, "identity.audience"]]),
    },
    {
      code: "audience_need",
      weight: 0.07,
      terms: acceptedTerms([
        [profile.identity.audiencePsychographics?.valueDrivers, "identity.audiencePsychographics.valueDrivers"],
        [profile.identity.audiencePsychographics?.painPoints, "identity.audiencePsychographics.painPoints"],
        [profile.identity.audiencePsychographics?.jobsToBeDone, "identity.audiencePsychographics.jobsToBeDone"],
      ]),
    },
  ];
  return groups.filter((group) => group.terms.some((term) => tokenize(normalizeText(term.value)).size > 0));
}

function acceptedTerms(entries: Array<[BrandSignal<string | string[]> | undefined, string]>): BrandTerm[] {
  const terms = entries.flatMap(([signal, signalPath]) => acceptedStringValues(signal).map((value) => ({ value, signalPath })));
  return Array.from(new Map(terms.map((term) => [`${term.signalPath}|${normalizeText(term.value)}`, term])).values());
}

function acceptedStringValues(signal: BrandSignal<string | string[]> | undefined): string[] {
  if (!signal || !isBrandSignalActionable(signal)) return [];
  const values = Array.isArray(signal.value) ? signal.value : [signal.value];
  return unique(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean));
}

function scoreGroupMatch(
  group: BrandTermGroup,
  candidateText: string,
  candidateTokens: Set<string>,
): { coverage: number; direct: boolean; matchedSignalPaths: string[] } {
  let coverage = 0;
  let direct = false;
  let matchedSignalPaths: string[] = [];
  for (const term of group.terms) {
    const normalizedTerm = normalizeText(term.value);
    const termTokens = tokenize(normalizedTerm);
    if (termTokens.size === 0) continue;
    const isDirect = candidateText.includes(normalizedTerm);
    const shared = intersectionSize(candidateTokens, termTokens);
    const partial = isDirect ? 1 : (termTokens.size === 1 ? (shared === 1 ? 1 : 0) : (shared >= 2 ? shared / termTokens.size : 0));
    if (partial > coverage || (partial === coverage && isDirect && !direct)) {
      coverage = partial;
      direct = isDirect;
      matchedSignalPaths = partial > 0 ? [term.signalPath] : [];
    } else if (partial === coverage && partial > 0) {
      matchedSignalPaths.push(term.signalPath);
    }
  }
  return { coverage, direct, matchedSignalPaths: unique(matchedSignalPaths) };
}

function readCandidate(value: unknown): CalosTrendWatchCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = safeText(raw.title, 240);
  const platform = safeText(raw.platform, 80).toLowerCase();
  if (!title || !platform) return null;
  const summary = safeText(raw.summary, 800);
  const url = safeUrl(raw.url);
  const capturedAt = safeIsoDate(raw.capturedAt);
  const score = typeof raw.score === "number" && Number.isFinite(raw.score) ? clamp01(raw.score) : undefined;
  return { title, platform, ...(summary ? { summary } : {}), ...(url ? { url } : {}), ...(capturedAt ? { capturedAt } : {}), ...(score !== undefined ? { score } : {}) };
}

function isCurrentCandidate(candidate: CalosTrendWatchCandidate, now: Date): boolean {
  if (!candidate.capturedAt) return true;
  const capturedAt = Date.parse(candidate.capturedAt);
  return Number.isFinite(capturedAt) && capturedAt >= now.getTime() - OPPORTUNITY_SOURCE_TTL_MS;
}

function safeText(value: unknown, maxLength: number): string {
  return (typeof value === "string" ? value : "")
    .replace(/[<>\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_000) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string): Set<string> {
  return new Set((value.match(/[a-z0-9]{3,}/g) ?? []).filter((token) => !STOP_WORDS.has(token)));
}

function phraseMatches(text: string, term: string): boolean {
  const normalized = normalizeText(term);
  return normalized.length >= 3 && text.includes(normalized);
}

function sharedTokenScore(left: Set<string>, right: Set<string>): number {
  const shared = intersectionSize(left, right);
  if (shared < 2 || left.size === 0 || right.size === 0) return 0;
  return shared / Math.min(left.size, right.size);
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared;
}

function calendarWindowDays(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 21;
  return Math.min(60, Math.max(7, Math.round(parsed)));
}

function newLeaseId(): string {
  return `trend_opportunity_lease_${randomUUID().replace(/-/g, "")}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === 11_000;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}