import { z } from 'zod';
import type { ContentCardTrendContext } from '../planning/content-card-contract';
import {
  TrendCandidateSchema,
  type TrendCandidate,
} from './trend-evidence';

export const SELECTED_TREND_VERSION = 1 as const;

export const TrendSelectionTargetSchema = z.enum(['post', 'script', 'calendar']);

export const TrendSelectionRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  candidate: TrendCandidateSchema,
  target: TrendSelectionTargetSchema,
}).strict();

export const SelectedTrendSchema = z.object({
  selectionVersion: z.literal(SELECTED_TREND_VERSION),
  status: z.literal('selected'),
  target: TrendSelectionTargetSchema,
  selectedAt: z.string().datetime(),
  candidate: TrendCandidateSchema,
});

export type TrendSelectionTarget = z.infer<typeof TrendSelectionTargetSchema>;
export type TrendSelectionRequest = z.infer<typeof TrendSelectionRequestSchema>;
export type SelectedTrend = z.infer<typeof SelectedTrendSchema>;

export class SelectedTrendInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectedTrendInputError';
  }
}

export function buildSelectedTrend(
  request: TrendSelectionRequest,
  now = new Date(),
): SelectedTrend {
  const candidate = normalizeSelectedCandidate(request.candidate);
  return SelectedTrendSchema.parse({
    selectionVersion: SELECTED_TREND_VERSION,
    status: 'selected',
    target: request.target,
    selectedAt: now.toISOString(),
    candidate,
  });
}

export function selectedTrendToContentCardContext(selectedTrend: SelectedTrend): ContentCardTrendContext {
  const sourceUrl = selectedTrend.candidate.evidence.find((evidence) => evidence.sourceUrl)?.sourceUrl;
  return {
    trendId: selectedTrend.candidate.candidateId,
    source: 'public_trend',
    title: selectedTrend.candidate.title,
    ...(selectedTrend.candidate.summary ? { summary: selectedTrend.candidate.summary } : {}),
    ...(sourceUrl ? { url: sourceUrl } : {}),
    provenance: selectedTrend.candidate.evidence.map((evidence) => evidence.evidenceId),
    status: 'accepted',
  };
}

function normalizeSelectedCandidate(candidate: TrendCandidate): TrendCandidate {
  const parsed = TrendCandidateSchema.parse(candidate);
  const title = sanitizeSelectionText(parsed.title, 240);
  if (!title) throw new SelectedTrendInputError('Selected trend title is empty after sanitization.');

  const evidence = parsed.evidence.map((item) => {
    const evidenceTitle = sanitizeSelectionText(item.title, 240);
    const provider = sanitizeSelectionText(item.provider, 80);
    if (!evidenceTitle || !provider) {
      throw new SelectedTrendInputError('Selected trend evidence is incomplete after sanitization.');
    }
    const summary = item.summary ? sanitizeSelectionText(item.summary, 800) : undefined;
    const sourceUrl = safeHttpUrl(item.sourceUrl);
    return {
      ...item,
      title: evidenceTitle,
      provider,
      ...(summary ? { summary } : { summary: undefined }),
      ...(sourceUrl ? { sourceUrl } : { sourceUrl: undefined }),
    };
  });
  const hasReferenceUrl = evidence.some((item) => Boolean(item.sourceUrl));

  return TrendCandidateSchema.parse({
    ...parsed,
    title,
    ...(parsed.summary ? { summary: sanitizeSelectionText(parsed.summary, 800) || undefined } : {}),
    evidence,
    // A browser selection is user intent, never proof that a format has been analysed.
    trendSpecEligible: false,
    nextAction: hasReferenceUrl ? 'analyze_reference_video' : 'add_reference_video',
  });
}

function sanitizeSelectionText(value: unknown, maxChars: number): string {
  return typeof value === 'string'
    ? value
      .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars)
    : '';
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2_000) return undefined;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
