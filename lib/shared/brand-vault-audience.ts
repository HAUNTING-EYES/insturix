/**
 * Infer a brand audience's PSYCHOGRAPHICS (value drivers, pain points, jobs-to-be-done) from the
 * brand's website/marketing copy, with Gemini. The vault already stores `identity.audience` as a thin
 * list of labels ("founders", "agencies"); that tells a generator WHO, not what MOVES them. This adds
 * the WHY layer so ThinkForge copy, Clickatron metaphors, and Alyzitron scoring can speak to motivation.
 *
 * Audience motivation is genuine natural-language understanding — keyword scoring produces garbage here
 * (Rule 30), so this is an LLM pass. Best-effort: returns null on disabled / no key / bad output, so the
 * scan keeps its thin label list (no regression).
 */

import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';
import { BRAND_CONFIDENCE } from './brand-confidence';
import {
  sanitizeEvidenceExcerpt,
  type BrandSignal,
  type BrandSignalEvidence,
  type BrandSignalProfile,
} from './brand-signal-profile';

export interface AudiencePsychographics {
  valueDrivers: string[];
  painPoints: string[];
  jobsToBeDone: string[];
}

export interface AnalyzeAudienceOptions {
  text: string;
  apiKey?: string;
  enabled?: boolean;
  env?: Record<string, string | undefined>;
  modelName?: string;
  maxChars?: number;
}

export interface ApplyAudiencePsychographicsOptions {
  observedAt?: string;
  sourceExcerpt?: string;
  sourceUrl?: string;
}

interface AudienceGeminiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface AudienceGeminiCostInput {
  status: ProviderCostEventStatus;
  modelName: string;
  inputChars: number;
  outputChars?: number;
  functionMs: number;
  usage?: AudienceGeminiUsage;
  parseableSignals?: boolean;
  resultCount?: number;
  error?: unknown;
}

const DEFAULT_MODEL_NAME = 'gemini-2.5-flash';
const DEFAULT_MAX_CHARS = 6000;
const MAX_PER_LIST = 5;
const MAX_PHRASE_LEN = 120;
const AUDIENCE_PSYCHOGRAPHICS_CONFIDENCE = 0.6;
const AUDIENCE_PSYCHOGRAPHICS_EXTRACTOR = 'brand-vault-audience-psychographics.v1';

const PROMPT = [
  'You are a brand audience analyst. From the brand copy below, infer the TARGET AUDIENCE psychographics.',
  'Return ONLY minified JSON, no prose, with this exact shape:',
  '{"valueDrivers":["..."],"painPoints":["..."],"jobsToBeDone":["..."]}',
  'valueDrivers = what the audience wants / values (e.g. "save time", "look credible to clients").',
  'painPoints = what they struggle with or fear (e.g. "wasted ad spend", "looking amateur").',
  'jobsToBeDone = what they hire this product to accomplish (e.g. "look like a big brand without an agency").',
  'Up to 5 short phrases each, grounded ONLY in the copy. Omit any list you cannot infer with confidence.',
].join(' ');

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && p.length <= MAX_PHRASE_LEN),
    ),
  ].slice(0, MAX_PER_LIST);
}

/** Pure parser for the model's JSON reply. Returns null when no list has usable content. */
export function parseAudiencePsychographics(raw: string | undefined): AudiencePsychographics | null {
  if (!raw) return null;
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/i, '$1').trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;

  const valueDrivers = cleanList(obj.valueDrivers);
  const painPoints = cleanList(obj.painPoints);
  const jobsToBeDone = cleanList(obj.jobsToBeDone);

  if (valueDrivers.length === 0 && painPoints.length === 0 && jobsToBeDone.length === 0) return null;
  return { valueDrivers, painPoints, jobsToBeDone };
}

const TAG = '[BrandVault audience]';

export async function analyzeAudiencePsychographics(
  options: AnalyzeAudienceOptions,
): Promise<AudiencePsychographics | null> {
  const env = options.env ?? process.env;
  // Kill switch is silent; everything else logs its reason so a null is never a mystery.
  const enabled = options.enabled ?? env.BRAND_VAULT_AUDIENCE_ANALYSIS_ENABLED !== 'false';
  if (!enabled) return null;
  const apiKey = options.apiKey ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn(`${TAG} skipped: no GEMINI_API_KEY/GOOGLE_API_KEY`);
    return null;
  }
  const text = options.text?.trim();
  if (!text) return null;

  const modelName = options.modelName ?? env.BRAND_VAULT_AUDIENCE_ANALYSIS_MODEL ?? DEFAULT_MODEL_NAME;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const copyInput = `\n\nBRAND COPY:\n${text.slice(0, maxChars)}`;
  const inputChars = PROMPT.length + copyInput.length;
  const startedAt = Date.now();
  let providerCallStarted = false;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
    // Rule 35: instructions first, data last.
    providerCallStarted = true;
    const result = await model.generateContent([PROMPT, copyInput]);
    const outputText = result.response.text();
    const signals = parseAudiencePsychographics(outputText);
    await recordBrandVaultAudienceGeminiCost({
      status: signals ? 'success' : 'failed',
      modelName,
      inputChars,
      outputChars: outputText.length,
      functionMs: Date.now() - startedAt,
      usage: readGeminiUsage(result),
      parseableSignals: Boolean(signals),
      resultCount: signals ? countAudienceSignals(signals) : 0,
    });
    if (!signals) {
      console.warn(`${TAG} skipped: model returned no parseable audience signals`);
      return null;
    }
    return signals;
  } catch (err) {
    if (providerCallStarted) {
      await recordBrandVaultAudienceGeminiCost({
        status: 'failed',
        modelName,
        inputChars,
        outputChars: 0,
        functionMs: Date.now() - startedAt,
        error: err,
      });
    }
    console.warn(`${TAG} failed`, err);
    return null;
  }
}

async function recordBrandVaultAudienceGeminiCost(input: AudienceGeminiCostInput) {
  const inputTokens = input.usage?.inputTokens ?? estimateTokensFromChars(input.inputChars);
  const outputTokens = input.usage?.outputTokens ?? estimateTokensFromChars(input.outputChars);
  await recordProviderCostEvent({
    status: input.status,
    service: 'brand_vault',
    action: 'brand_scan',
    route: 'lib/shared/brand-vault-audience',
    provider: 'gemini',
    model: cleanGeminiModelName(input.modelName),
    operation: 'llm_text_enrichment',
    units: {
      requestCount: 1,
      inputTokens,
      outputTokens,
      totalTokens: input.usage?.totalTokens ?? sumOptional(inputTokens, outputTokens),
      functionMs: input.functionMs,
    },
    metadata: {
      providerName: 'gemini',
      sourceKind: 'audience_psychographics',
      inputChars: input.inputChars,
      outputChars: input.outputChars,
      parseableSignals: input.parseableSignals,
      resultCount: input.resultCount,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}

function readGeminiUsage(result: unknown): AudienceGeminiUsage | undefined {
  const resultRecord = asRecord(result);
  const responseRecord = asRecord(resultRecord?.response);
  const usage = asRecord(resultRecord?.usageMetadata) ?? asRecord(responseRecord?.usageMetadata);
  if (!usage) return undefined;

  const inputTokens = readNumber(usage.promptTokenCount ?? usage.inputTokenCount);
  const outputTokens = readNumber(usage.candidatesTokenCount ?? usage.outputTokenCount);
  const totalTokens = readNumber(usage.totalTokenCount);
  return inputTokens || outputTokens || totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined;
}

function countAudienceSignals(signals: AudiencePsychographics): number {
  return signals.valueDrivers.length + signals.painPoints.length + signals.jobsToBeDone.length;
}

function estimateTokensFromChars(chars?: number): number | undefined {
  return typeof chars === 'number' && Number.isFinite(chars) && chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : undefined;
}

function sumOptional(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function cleanGeminiModelName(modelName: string): string {
  return modelName.replace(/^models\//, '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function audienceSignal(path: string, value: string[], evidenceId: string | undefined): BrandSignal<string[]> {
  if (value.length === 0 || !evidenceId) {
    return {
      value: [],
      confidence: BRAND_CONFIDENCE.FALLBACK_SIGNAL,
      trustLevel: 'fallback_default',
      authorityClass: 'inferred_hint',
      evidenceIds: [],
      fallbackReason: `No audience psychographic inference for ${path}.`,
    };
  }

  // LLM-inferred from website copy; confidence clears the accepted-profile floor (0.50) so the
  // brand-context builders can use it only when linked evidence exists, while staying below hard-fact confidence.
  return {
    value,
    confidence: AUDIENCE_PSYCHOGRAPHICS_CONFIDENCE,
    trustLevel: 'llm_inference',
    authorityClass: 'inferred_hint',
    evidenceIds: [evidenceId],
  };
}

function addAudienceEvidence(
  profile: BrandSignalProfile,
  path: string,
  label: string,
  value: string[],
  options: ApplyAudiencePsychographicsOptions,
): string | undefined {
  if (value.length === 0) return undefined;

  const existingIds = new Set(profile.evidence.map((item) => item.id));
  const slug = path.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
  let id = `audience_psychographics_${slug}`;
  let suffix = 1;
  while (existingIds.has(id)) {
    id = `audience_psychographics_${slug}_${suffix}`;
    suffix += 1;
  }

  const sourceExcerpt = options.sourceExcerpt?.trim();
  const excerpt = sourceExcerpt
    ? `${label}: ${value.join(', ')}. Source: ${sourceExcerpt}`
    : `${label}: ${value.join(', ')}`;
  const evidence: BrandSignalEvidence = {
    id,
    signalPath: path,
    sourceType: 'llm_inference',
    sourceField: 'brandVault.audiencePsychographics',
    excerpt: sanitizeEvidenceExcerpt(excerpt),
    confidence: AUDIENCE_PSYCHOGRAPHICS_CONFIDENCE,
    trustLevel: 'llm_inference',
    authorityClass: 'inferred_hint',
    observedAt: options.observedAt ?? profile.generatedAt,
    extractor: AUDIENCE_PSYCHOGRAPHICS_EXTRACTOR,
  };
  if (options.sourceUrl) evidence.sourceUrl = options.sourceUrl;

  profile.evidence.push(evidence);
  return id;
}

/**
 * Attach extracted psychographics to a profile's identity (mutates + returns it). One-liner for the
 * scan/orchestrator: analyzeAudiencePsychographics(text) -> applyAudiencePsychographics(profile, result).
 */
export function applyAudiencePsychographics(
  profile: BrandSignalProfile,
  signals: AudiencePsychographics,
  options: ApplyAudiencePsychographicsOptions = {},
): BrandSignalProfile {
  const valueDriversPath = 'identity.audiencePsychographics.valueDrivers';
  const painPointsPath = 'identity.audiencePsychographics.painPoints';
  const jobsToBeDonePath = 'identity.audiencePsychographics.jobsToBeDone';

  const valueDriversEvidenceId = addAudienceEvidence(profile, valueDriversPath, 'Audience value drivers', signals.valueDrivers, options);
  const painPointsEvidenceId = addAudienceEvidence(profile, painPointsPath, 'Audience pain points', signals.painPoints, options);
  const jobsToBeDoneEvidenceId = addAudienceEvidence(profile, jobsToBeDonePath, 'Audience jobs to be done', signals.jobsToBeDone, options);

  profile.identity.audiencePsychographics = {
    valueDrivers: audienceSignal(valueDriversPath, signals.valueDrivers, valueDriversEvidenceId),
    painPoints: audienceSignal(painPointsPath, signals.painPoints, painPointsEvidenceId),
    jobsToBeDone: audienceSignal(jobsToBeDonePath, signals.jobsToBeDone, jobsToBeDoneEvidenceId),
  };
  return profile;
}