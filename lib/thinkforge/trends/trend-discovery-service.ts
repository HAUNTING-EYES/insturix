import { createHash } from 'node:crypto';
import {
  getTrendsProvider,
  type Trend,
  type TrendQuery,
  type TrendsProvider,
} from '@/lib/calos/trends';
import {
  PublicTrendDiscoveryInputSchema,
  TrendCandidateSchema,
  type PublicTrendDiscoveryInput,
  type PublicTrendEvidence,
  type TrendCandidate,
  type TrendPlatform,
} from './trend-evidence';
import {
  firstAnalyzableTrendVideoUrl,
  prioritizeAnalyzableTrendEvidence,
} from './trend-analysis-source';

const FRESH_TREND_MS = 72 * 60 * 60 * 1_000;
const STALE_TREND_MS = 14 * 24 * 60 * 60 * 1_000;

export class TrendDiscoveryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrendDiscoveryInputError';
  }
}

export class TrendDiscoveryUnavailableError extends Error {
  constructor(message = 'No public trend provider is available.') {
    super(message);
    this.name = 'TrendDiscoveryUnavailableError';
  }
}

export interface PublicTrendDiscoveryResult {
  provider: string;
  query: Omit<TrendQuery, 'brandId'>;
  candidates: TrendCandidate[];
}

export interface PublicTrendDiscoveryOptions {
  provider?: TrendsProvider;
  now?: Date;
}

export async function discoverPublicTrendCandidates(
  rawInput: unknown,
  options: PublicTrendDiscoveryOptions = {},
): Promise<PublicTrendDiscoveryResult> {
  const input = PublicTrendDiscoveryInputSchema.parse(rawInput);
  const query = buildPublicTrendQuery(input);
  const provider = options.provider ?? getTrendsProvider();

  if (!provider.available()) {
    throw new TrendDiscoveryUnavailableError();
  }

  const trends = await provider.getTrends(query);
  const now = options.now ?? new Date();
  const queryFingerprint = fingerprint(JSON.stringify(query));
  const candidatesByKey = new Map<string, TrendCandidate>();

  for (const trend of trends) {
    const evidence = normalizeTrendEvidence({ trend, provider: provider.name, queryFingerprint, query });
    if (!evidence) continue;

    const key = `${normalizeKey(evidence.title)}:${evidence.platform}`;
    const existing = candidatesByKey.get(key);
    if (existing) {
      if (!existing.evidence.some((item) => item.evidenceId === evidence.evidenceId)) {
        existing.evidence.push(evidence);
      }
      continue;
    }

    candidatesByKey.set(key, {
      candidateId: stableId('candidate', key),
      candidateVersion: 1,
      title: evidence.title,
      ...(evidence.summary ? { summary: evidence.summary } : {}),
      platform: evidence.platform,
      evidence: [evidence],
      evidenceCompleteness: 0,
      freshness: 'unknown',
      trendSpecEligible: false,
      nextAction: firstAnalyzableTrendVideoUrl([evidence])
        ? 'analyze_reference_video'
        : 'add_reference_video',
    });
  }

  return {
    provider: provider.name,
    query,
    candidates: Array.from(candidatesByKey.values())
      .map((candidate) => finalizeCandidate(candidate, now))
      .sort((left, right) => right.evidenceCompleteness - left.evidenceCompleteness || left.title.localeCompare(right.title))
      .slice(0, query.limit ?? 12),
  };
}

export function buildPublicTrendQuery(input: PublicTrendDiscoveryInput): Omit<TrendQuery, 'brandId'> {
  const niche = sanitizePublicQueryText(input.niche, 300);
  if (niche.length < 2) {
    throw new TrendDiscoveryInputError('Trend discovery needs a public niche without contact details, URLs, or credentials.');
  }

  const platforms = input.platforms
    ?.filter((platform) => platform !== 'unknown')
    .map((platform) => platform === 'x' ? 'twitter' : platform);
  const location = input.location ? sanitizePublicQueryText(input.location, 120) : undefined;

  return {
    niche,
    ...(platforms?.length ? { platforms } : {}),
    ...(location ? { location } : {}),
    limit: input.limit ?? 8,
  };
}

function normalizeTrendEvidence(input: {
  trend: Trend;
  provider: string;
  queryFingerprint: string;
  query: Omit<TrendQuery, 'brandId'>;
}): PublicTrendEvidence | null {
  const title = sanitizeExternalText(input.trend.title, 240);
  if (!title) return null;

  const summary = sanitizeExternalText(input.trend.summary ?? '', 800);
  const sourceUrl = toSafeHttpUrl(input.trend.url);
  const platform = normalizePlatform(input.trend.platform);
  const capturedAt = parseIsoDate(input.trend.capturedAt);
  const provider = sanitizeExternalText(input.provider, 80) || 'unknown';
  const sourceScore = Number.isFinite(input.trend.score) ? input.trend.score : undefined;
  const evidenceId = stableId('evidence', [provider, platform, title, sourceUrl ?? '', capturedAt ?? ''].join('|'));

  return {
    evidenceId,
    evidenceVersion: 1,
    kind: 'cultural_signal',
    provider,
    platform,
    title,
    ...(summary ? { summary } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(sourceScore !== undefined ? { sourceScore } : {}),
    ...(capturedAt ? { capturedAt } : {}),
    ...(input.query.location ? { location: input.query.location } : {}),
    provenance: {
      purpose: 'public_trend_discovery',
      queryFingerprint: input.queryFingerprint,
    },
  };
}

function finalizeCandidate(candidate: TrendCandidate, now: Date): TrendCandidate {
  const evidence = prioritizeAnalyzableTrendEvidence(candidate.evidence).slice(0, 12);
  return TrendCandidateSchema.parse({
    ...candidate,
    evidence,
    evidenceCompleteness: calculateEvidenceCompleteness(evidence),
    freshness: freshnessForEvidence(evidence, now),
    nextAction: firstAnalyzableTrendVideoUrl(evidence)
      ? 'analyze_reference_video'
      : 'add_reference_video',
  });
}

function calculateEvidenceCompleteness(evidence: PublicTrendEvidence[]): number {
  const hasSummary = evidence.some((item) => Boolean(item.summary));
  const hasSourceUrl = evidence.some((item) => Boolean(item.sourceUrl));
  const hasCapturedAt = evidence.some((item) => Boolean(item.capturedAt));
  const hasKnownPlatform = evidence.some((item) => item.platform !== 'unknown');
  const providerCount = new Set(evidence.map((item) => item.provider)).size;
  const total = 0.2
    + (hasSummary ? 0.2 : 0)
    + (hasSourceUrl ? 0.25 : 0)
    + (hasCapturedAt ? 0.1 : 0)
    + (hasKnownPlatform ? 0.05 : 0)
    + Math.min(providerCount, 2) * 0.1;
  return Number(Math.min(total, 1).toFixed(2));
}

function freshnessForEvidence(evidence: PublicTrendEvidence[], now: Date): 'fresh' | 'stale' | 'unknown' {
  const timestamps = evidence
    .map((item) => item.capturedAt ? Date.parse(item.capturedAt) : NaN)
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return 'unknown';

  const newest = Math.max(...timestamps);
  const age = now.getTime() - newest;
  if (age <= FRESH_TREND_MS) return 'fresh';
  if (age <= STALE_TREND_MS) return 'stale';
  return 'stale';
}

function normalizePlatform(value: unknown): TrendPlatform {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'instagram' || normalized === 'reel' || normalized === 'reels') return 'instagram';
  if (normalized === 'tiktok') return 'tiktok';
  if (normalized === 'youtube' || normalized === 'short' || normalized === 'shorts') return 'youtube';
  if (normalized === 'linkedin') return 'linkedin';
  if (normalized === 'x' || normalized === 'twitter') return 'x';
  if (normalized === 'web' || normalized === 'news') return 'web';
  return 'unknown';
}

function sanitizePublicQueryText(value: string, maxChars: number): string {
  return sanitizeText(value, maxChars)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '')
    .replace(/\b(?:sk|pk)[-_][a-z0-9_=-]{6,}\b/gi, '')
    .replace(/\b(?:api\s*key|key|token|secret)\s*[:=]?\s*[a-z0-9_=-]{6,}\b/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[\s,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeExternalText(value: unknown, maxChars: number): string {
  return sanitizeText(value, maxChars)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeText(value: unknown, maxChars: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, maxChars)
    : '';
}

function toSafeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2_000) return undefined;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function parseIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${fingerprint(value).slice(0, 24)}`;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
