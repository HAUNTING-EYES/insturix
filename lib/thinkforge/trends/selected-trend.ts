import { z } from 'zod';
import type { ContentCardTrendContext } from '../planning/content-card-contract';
import { ThinkForgeAuthoringRequestSchema } from '../schemas/authoring-request';
import { TrendSpecSchema } from '../schemas/trend-spec';
import {
  TrendCandidateSchema,
  type TrendCandidate,
} from './trend-evidence';
import {
  firstAnalyzableTrendVideoUrl,
  prioritizeAnalyzableTrendEvidence,
} from './trend-analysis-source';

export const SELECTED_TREND_VERSION = 1 as const;
export const TREND_SOURCE_ANALYSIS_VERSION = 1 as const;

export const TrendSelectionTargetSchema = z.enum(['post', 'script', 'calendar']);

export const TrendSelectionRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(160),
  candidate: TrendCandidateSchema,
  target: TrendSelectionTargetSchema,
}).strict();

export const TrendSelectionPersistenceRequestSchema = TrendSelectionRequestSchema.extend({
  authoringRequest: ThinkForgeAuthoringRequestSchema.optional(),
}).superRefine((selection, ctx) => {
  const outputKind = selection.authoringRequest?.contentContract.outputKind;
  if (selection.target === 'calendar') {
    if (selection.authoringRequest !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['authoringRequest'],
        message: 'calendar trend selection does not accept an authoring request',
      });
    }
    return;
  }
  if (!selection.authoringRequest) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['authoringRequest'],
      message: 'post and script trend selections require an explicit authoring request',
    });
    return;
  }
  if (selection.target === 'script' && outputKind !== 'video_script') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['authoringRequest', 'contentContract', 'outputKind'],
      message: 'script trend selection requires a video_script authoring request',
    });
  }
  if (selection.target === 'post' && outputKind !== 'social_post' && outputKind !== 'carousel') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['authoringRequest', 'contentContract', 'outputKind'],
      message: 'post trend selection requires a social_post or carousel authoring request',
    });
  }
});

export const TrendSourceKindSchema = z.enum(['asset', 'remote-url']);

export const QueuedTrendSourceAnalysisSchema = z.object({
  analysisVersion: z.literal(TREND_SOURCE_ANALYSIS_VERSION),
  status: z.literal('queued'),
  queuedAt: z.string().datetime(),
  jobId: z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/),
  request: z.object({
    sourceKind: TrendSourceKindSchema,
  }).strict(),
}).strict();

export const FailedTrendSourceAnalysisSchema = z.object({
  analysisVersion: z.literal(TREND_SOURCE_ANALYSIS_VERSION),
  status: z.literal('failed'),
  failedAt: z.string().datetime(),
  jobId: z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/),
  request: z.object({
    sourceKind: TrendSourceKindSchema,
  }).strict(),
  failureCode: z.enum([
    'dispatch_failed',
    'source_rejected',
    'source_too_long',
    'analysis_generation_failed',
  ]),
}).strict();

export const CompletedTrendSourceAnalysisSchema = z.object({
  analysisVersion: z.literal(TREND_SOURCE_ANALYSIS_VERSION),
  status: z.literal('completed'),
  analyzedAt: z.string().datetime(),
  provider: z.literal('gemini'),
  model: z.string().min(1).max(160),
  source: z.object({
    referenceId: z.string().min(1).max(240),
    sourceKind: TrendSourceKindSchema,
    sourceLabel: z.string().min(1).max(240),
    sourceFingerprint: z.string().min(1).max(360),
    durationSec: z.number().finite().positive().max(900).optional(),
  }),
  trendSpec: TrendSpecSchema,
}).strict();

export const TrendSourceAnalysisSchema = z.discriminatedUnion('status', [
  QueuedTrendSourceAnalysisSchema,
  FailedTrendSourceAnalysisSchema,
  CompletedTrendSourceAnalysisSchema,
]);

export const SelectedTrendSchema = z.object({
  selectionVersion: z.literal(SELECTED_TREND_VERSION),
  status: z.literal('selected'),
  target: TrendSelectionTargetSchema,
  selectedAt: z.string().datetime(),
  candidate: TrendCandidateSchema,
  analysis: TrendSourceAnalysisSchema.optional(),
});

export type TrendSelectionTarget = z.infer<typeof TrendSelectionTargetSchema>;
export type TrendSelectionRequest = z.infer<typeof TrendSelectionRequestSchema>;
export type TrendAnalysisSourceKind = z.infer<typeof TrendSourceKindSchema>;
export type TrendSourceAnalysis = z.infer<typeof TrendSourceAnalysisSchema>;
export type CompletedTrendSourceAnalysis = z.infer<typeof CompletedTrendSourceAnalysisSchema>;
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

/** Attaches model-derived format evidence only after the server has analyzed an authorized source. */
export function buildAnalyzedSelectedTrend(
  selectedTrend: SelectedTrend,
  analysis: TrendSourceAnalysis,
): SelectedTrend {
  const selected = parsePersistedSelectedTrend(selectedTrend);
  const parsedAnalysis = TrendSourceAnalysisSchema.parse(analysis);

  if (parsedAnalysis.status !== 'completed') {
    throw new SelectedTrendInputError('Only completed source analysis can activate a trend.');
  }
  if (parsedAnalysis.trendSpec.trendId !== selected.candidate.candidateId) {
    throw new SelectedTrendInputError('Trend analysis does not belong to the currently selected candidate.');
  }

  return SelectedTrendSchema.parse({
    ...selected,
    candidate: {
      ...selected.candidate,
      trendSpecEligible: true,
      nextAction: 'use_as_timed_angle',
    },
    analysis: parsedAnalysis,
  });
}

export function buildQueuedTrendAnalysis(
  selectedTrend: SelectedTrend,
  input: { jobId: string; sourceKind: TrendAnalysisSourceKind; now?: Date },
): SelectedTrend {
  const selected = parsePersistedSelectedTrend(selectedTrend);
  return SelectedTrendSchema.parse({
    ...selected,
    analysis: {
      analysisVersion: TREND_SOURCE_ANALYSIS_VERSION,
      status: 'queued',
      queuedAt: (input.now ?? new Date()).toISOString(),
      jobId: input.jobId,
      request: { sourceKind: input.sourceKind },
    },
  });
}

export function buildFailedTrendAnalysis(
  selectedTrend: SelectedTrend,
  input: {
    jobId: string;
    sourceKind: TrendAnalysisSourceKind;
    failureCode: z.infer<typeof FailedTrendSourceAnalysisSchema>['failureCode'];
    now?: Date;
  },
): SelectedTrend {
  const selected = parsePersistedSelectedTrend(selectedTrend);
  return SelectedTrendSchema.parse({
    ...selected,
    analysis: {
      analysisVersion: TREND_SOURCE_ANALYSIS_VERSION,
      status: 'failed',
      failedAt: (input.now ?? new Date()).toISOString(),
      jobId: input.jobId,
      request: { sourceKind: input.sourceKind },
      failureCode: input.failureCode,
    },
  });
}

export function selectedTrendToContentCardContext(selectedTrend: SelectedTrend): ContentCardTrendContext {
  const sourceUrl = selectedTrend.candidate.evidence.find((evidence) => evidence.sourceUrl)?.sourceUrl;
  const analysis = selectedTrend.analysis?.status === 'completed'
    ? selectedTrend.analysis
    : undefined;
  const provenance = Array.from(new Set([
    ...selectedTrend.candidate.evidence.map((evidence) => evidence.evidenceId),
    ...(analysis ? [analysis.source.referenceId] : []),
  ]));

  return {
    trendId: selectedTrend.candidate.candidateId,
    source: analysis ? 'social' : 'public_trend',
    title: selectedTrend.candidate.title,
    ...(selectedTrend.candidate.summary ? { summary: selectedTrend.candidate.summary } : {}),
    ...(sourceUrl ? { url: sourceUrl } : {}),
    provenance,
    // Selecting a public candidate is intent. It only becomes accepted after
    // ThinkForge has analysed an authorized reference into the canonical spec.
    status: analysis ? 'accepted' : 'suggested',
  };
}

function normalizeSelectedCandidate(candidate: TrendCandidate): TrendCandidate {
  const parsed = TrendCandidateSchema.parse(candidate);
  const title = sanitizeSelectionText(parsed.title, 240);
  if (!title) throw new SelectedTrendInputError('Selected trend title is empty after sanitization.');

  const evidence = prioritizeAnalyzableTrendEvidence(parsed.evidence.map((item) => {
    const {
      summary: originalSummary,
      sourceUrl: originalSourceUrl,
      ...evidenceWithoutOptionalText
    } = item;
    const evidenceTitle = sanitizeSelectionText(item.title, 240);
    const provider = sanitizeSelectionText(item.provider, 80);
    if (!evidenceTitle || !provider) {
      throw new SelectedTrendInputError('Selected trend evidence is incomplete after sanitization.');
    }
    const summary = originalSummary ? sanitizeSelectionText(originalSummary, 800) : undefined;
    const sourceUrl = safeHttpUrl(originalSourceUrl);
    return {
      ...evidenceWithoutOptionalText,
      title: evidenceTitle,
      provider,
      ...(summary ? { summary } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    };
  }));
  const analyzableReferenceUrl = firstAnalyzableTrendVideoUrl(evidence);
  const { summary: originalSummary, ...candidateWithoutSummary } = parsed;
  const summary = originalSummary ? sanitizeSelectionText(originalSummary, 800) : undefined;

  return TrendCandidateSchema.parse({
    ...candidateWithoutSummary,
    title,
    ...(summary ? { summary } : {}),
    evidence,
    // A browser selection is user intent, never proof that a format has been analysed.
    trendSpecEligible: false,
    nextAction: analyzableReferenceUrl ? 'analyze_reference_video' : 'add_reference_video',
  });
}

const OPTIONAL_EVIDENCE_STORAGE_FIELDS = [
  'summary',
  'sourceUrl',
  'sourceScore',
  'capturedAt',
  'location',
  'language',
] as const;

/** Mongo Mixed arrays can materialize an explicitly undefined optional as null. */
function parsePersistedSelectedTrend(value: unknown): SelectedTrend {
  if (!isRecord(value) || !isRecord(value.candidate)) {
    return SelectedTrendSchema.parse(value);
  }

  const candidate = omitNullOptionalFields(value.candidate, ['summary']);
  const evidence = Array.isArray(candidate.evidence)
    ? candidate.evidence.map((item) => omitNullOptionalFields(item, OPTIONAL_EVIDENCE_STORAGE_FIELDS))
    : candidate.evidence;

  return SelectedTrendSchema.parse({
    ...value,
    candidate: {
      ...candidate,
      evidence,
    },
  });
}

function omitNullOptionalFields(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const normalized = { ...value };
  for (const field of fields) {
    if (normalized[field] === null) delete normalized[field];
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
