import { generateObject } from 'ai';
import { z } from 'zod';
import type { ReferenceVideoSource } from '@/lib/editron/reference-video/reference-video-source';
import {
  createThinkForgeModelForRoute,
  resolveThinkForgeProviderRoute,
} from '../agents/model-factory';
import {
  TrendAlignmentFrameSchema,
  TrendBeatGridSchema,
  TrendCopyFormulaSchema,
  TrendInvariantSchema,
  TrendVariableSchema,
  TREND_SPEC_VERSION,
  parseTrendSpec,
} from '../schemas/trend-spec';
import {
  TREND_SOURCE_ANALYSIS_VERSION,
  TrendSourceAnalysisSchema,
  type SelectedTrend,
  type TrendSourceAnalysis,
} from './selected-trend';
import {
  readAiSdkUsage,
  recordThinkForgeDirectCost,
  safeJsonLength,
} from '../services/provider-cost-telemetry';

const MAX_REFERENCE_DURATION_SEC = 180;
const MAX_DURATION_DRIFT_MS = 1_500;

// This deliberately excludes trendId, version, exemplarRefs, and fetchedAt.
// They are session/server facts, not facts the model should ever author.
export const TrendSpecGenerationSchema = z.object({
  alignmentFrame: TrendAlignmentFrameSchema,
  beatGrid: TrendBeatGridSchema,
  invariants: z.array(TrendInvariantSchema).max(20),
  variables: z.array(TrendVariableSchema).max(20),
  copyFormula: TrendCopyFormulaSchema,
  performanceScript: z.string().min(1).max(1_500),
}).strict();

type GeneratedTrendSpec = z.infer<typeof TrendSpecGenerationSchema>;

export interface AnalyzeSelectedTrendSourceInput {
  selectedTrend: SelectedTrend;
  source: ReferenceVideoSource;
  userId: string;
  sessionId: string;
  brandId?: string;
}

export interface AnalyzeSelectedTrendSourceOptions {
  now?: Date;
  generate?: (input: AnalyzeSelectedTrendSourceInput) => Promise<GeneratedTrendSpec>;
}

export class TrendSourceAnalysisError extends Error {
  constructor(message: string, readonly code: 'invalid_timeline' | 'source_too_long' | 'generation_failed') {
    super(message);
    this.name = 'TrendSourceAnalysisError';
  }
}

export async function analyzeSelectedTrendSource(
  input: AnalyzeSelectedTrendSourceInput,
  options: AnalyzeSelectedTrendSourceOptions = {},
): Promise<TrendSourceAnalysis> {
  const selectedTrend = input.selectedTrend;
  const source = input.source;
  assertSourceDuration(source);

  const generated = await (options.generate ?? generateTrendSpecFromVideo)(input);
  const now = options.now ?? new Date();
  const trendSpec = parseTrendSpec({
    trendId: selectedTrend.candidate.candidateId,
    version: TREND_SPEC_VERSION,
    ...generated,
    exemplarRefs: [source.referenceId],
    fetchedAt: now.toISOString(),
  });
  assertCoherentTimeline(trendSpec, source.durationSec);

  return TrendSourceAnalysisSchema.parse({
    analysisVersion: TREND_SOURCE_ANALYSIS_VERSION,
    status: 'completed',
    analyzedAt: now.toISOString(),
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    // Never persist a signed URL or the remote source URL in ThinkForge metadata.
    source: {
      referenceId: source.referenceId,
      sourceKind: source.kind,
      sourceLabel: source.sourceLabel,
      sourceFingerprint: source.sourceFingerprint ?? source.referenceId,
      ...(source.durationSec ? { durationSec: source.durationSec } : {}),
    },
    trendSpec,
  });
}

async function generateTrendSpecFromVideo(input: AnalyzeSelectedTrendSourceInput): Promise<GeneratedTrendSpec> {
  const routePurpose = 'structural';
  const privacyClass = 'business_confidential';
  const modelRoute = resolveThinkForgeProviderRoute({
    routePurpose,
    privacyClass,
    preferredProvider: 'gemini',
    modelName: 'gemini-2.5-flash',
  });
  const model = createThinkForgeModelForRoute({
    routePurpose,
    privacyClass,
    preferredProvider: modelRoute.provider,
    modelName: modelRoute.model,
  });
  const prompt = buildTrendSpecPrompt(input);
  const startedAt = Date.now();

  try {
    const result = await generateObject({
      model,
      schema: TrendSpecGenerationSchema,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'file',
            data: new URL(input.source.videoUrl),
            mediaType: mediaTypeForVideoUrl(input.source.videoUrl),
          },
        ],
      }],
      temperature: 0.15,
      abortSignal: AbortSignal.timeout(110_000),
    });

    await recordAnalysisCost({
      status: 'success',
      input,
      modelRoute,
      promptChars: prompt.length,
      outputChars: safeJsonLength(result.object),
      functionMs: Date.now() - startedAt,
      usage: await readAiSdkUsage(result.usage),
    });
    return TrendSpecGenerationSchema.parse(result.object);
  } catch (error) {
    await recordAnalysisCost({
      status: 'failed',
      input,
      modelRoute,
      promptChars: prompt.length,
      functionMs: Date.now() - startedAt,
      error,
    });
    throw new TrendSourceAnalysisError('Trend source analysis could not be completed.', 'generation_failed');
  }
}

function buildTrendSpecPrompt(input: AnalyzeSelectedTrendSourceInput): string {
  const candidate = input.selectedTrend.candidate;
  const durationHint = input.source.durationSec ? `The authorized reference is approximately ${input.source.durationSec}s long.` : 'Infer the runtime from the video.';
  return `<role>You extract reusable short-form creative mechanics from a user-authorized reference video.</role>

<task>Watch the entire supplied video and produce a TrendSpec that captures its reusable format: timing, sections, pacing, safe copy slots, and performance cues. ${durationHint}</task>

<candidate>
Title: ${candidate.title}
Platform: ${candidate.platform}
Summary: ${candidate.summary ?? 'No external summary supplied.'}
</candidate>

<rules>
1. Extract FORM, not expression. Do not transcribe dialogue, lyrics, captions, or exact on-screen text. Do not reuse distinctive wording, named creators, logos, products, or claims from the reference.
2. All copyFormula templates must be generic semantic placeholders, such as "POV: {audience_problem}" or "Then {reveal}". They must never quote the source.
3. beatGrid.totalMs, beatsMs, dropsMs, and sections must reflect the observed video timeline. Sections must be chronological, non-overlapping, inside totalMs, and cover the format from its hook to its close.
4. Invariants are only high-confidence reusable mechanics (pacing, reveal timing, camera/action rhythm, slot structure). Variables are the safe degrees of freedom for a brand to customize.
5. performanceScript is a concise filming/editing cue sheet. It must describe actions and beats, never reproduce the reference's speech.
6. Do not claim public popularity, performance metrics, origin, or legal clearance. This is analysis of one authorized exemplar, not proof of a market trend.
</rules>`;
}

function assertSourceDuration(source: ReferenceVideoSource): void {
  if (source.durationSec && source.durationSec > MAX_REFERENCE_DURATION_SEC) {
    throw new TrendSourceAnalysisError(
      `Trend reference is ${Math.round(source.durationSec)}s. Analyze a clip of ${MAX_REFERENCE_DURATION_SEC}s or less.`,
      'source_too_long',
    );
  }
}

function assertCoherentTimeline(
  trendSpec: ReturnType<typeof parseTrendSpec>,
  sourceDurationSec?: number,
): void {
  const { beatGrid } = trendSpec;
  const failure = (message: string): never => {
    throw new TrendSourceAnalysisError(`Trend analysis produced an incoherent timeline: ${message}`, 'invalid_timeline');
  };

  if (beatGrid.beatsMs.some((beat, index) => beat > beatGrid.totalMs || (index > 0 && beat < beatGrid.beatsMs[index - 1]!))) {
    failure('beats must be ordered and inside totalMs');
  }
  if (beatGrid.sections.some((section) => section.start < 0 || section.end > beatGrid.totalMs)) {
    failure('sections must stay inside totalMs');
  }
  for (let index = 1; index < beatGrid.sections.length; index += 1) {
    if (beatGrid.sections[index]!.start < beatGrid.sections[index - 1]!.end) {
      failure('sections must not overlap');
    }
  }
  if (sourceDurationSec && Math.abs(beatGrid.totalMs - (sourceDurationSec * 1_000)) > MAX_DURATION_DRIFT_MS) {
    failure('totalMs does not match the authorized source duration');
  }
}

function mediaTypeForVideoUrl(rawUrl: string): string {
  const pathname = new URL(rawUrl).pathname.toLowerCase();
  if (pathname.endsWith('.mov')) return 'video/quicktime';
  if (pathname.endsWith('.webm')) return 'video/webm';
  if (pathname.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/mp4';
}

async function recordAnalysisCost(input: {
  status: 'success' | 'failed';
  input: AnalyzeSelectedTrendSourceInput;
  modelRoute: ReturnType<typeof resolveThinkForgeProviderRoute>;
  promptChars: number;
  outputChars?: number;
  functionMs: number;
  usage?: Awaited<ReturnType<typeof readAiSdkUsage>>;
  error?: unknown;
}): Promise<void> {
  try {
    await recordThinkForgeDirectCost({
      status: input.status,
      action: 'trend_source_analysis',
      route: 'lib/thinkforge/trends/trend-source-analysis',
      provider: input.modelRoute.provider,
      modelName: input.modelRoute.model,
      operation: 'llm_structured_direct',
      userId: input.input.userId,
      projectId: input.input.brandId,
      taskId: input.input.sessionId,
      promptChars: input.promptChars,
      outputChars: input.outputChars,
      functionMs: input.functionMs,
      usage: input.usage,
      routePurpose: input.modelRoute.routePurpose,
      privacyClass: input.modelRoute.privacyClass,
      temperature: 0.15,
      sourceKind: input.input.source.kind,
      resultCount: input.status === 'success' ? 1 : 0,
      acceptedCount: input.status === 'success' ? 1 : 0,
      error: input.error,
    });
  } catch (telemetryError) {
    console.warn('[ThinkForge:TrendSourceAnalysis] Cost telemetry failed:', telemetryError);
  }
}