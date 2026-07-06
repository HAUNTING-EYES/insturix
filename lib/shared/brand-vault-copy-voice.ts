/**
 * Analyze copy the user just APPROVED (a ThinkForge/CalOS script or post) with Gemini to recover the
 * brand's actual voice — the voice dials the vault already models plus a few distinctive recurring
 * phrasings. This is what lets Brand Vault learn HOW a brand writes from work it accepted, instead of
 * only logging an affirm/reject on a single hook.
 *
 * Best-effort enrichment: returns null on disabled / no key / bad model output, so the caller keeps its
 * baseline learning event (no regression). One approved card is weak evidence, so the caller stages
 * these inferences for human review rather than auto-accepting them.
 */

import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';

export interface CopyVoiceSignals {
  dials: {
    formality?: number;
    assertiveness?: number;
    warmth?: number;
    jargonDensity?: number;
    humor?: number;
    ctaDirectness?: number;
  };
  recurringPhrases: string[];
}

export interface AnalyzeCopyVoiceOptions {
  text: string;
  apiKey?: string;
  enabled?: boolean;
  env?: Record<string, string | undefined>;
  modelName?: string;
  maxChars?: number;
}

interface CopyVoiceGeminiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface CopyVoiceGeminiCostInput {
  status: ProviderCostEventStatus;
  modelName: string;
  inputChars: number;
  outputChars?: number;
  functionMs: number;
  usage?: CopyVoiceGeminiUsage;
  parseableSignals?: boolean;
  resultCount?: number;
  error?: unknown;
}

const DEFAULT_MODEL_NAME = 'gemini-2.5-flash'; // ← mirrors the other Brand Vault Gemini callers
const DEFAULT_MAX_CHARS = 4000;

const PROMPT = [
  'You are a brand voice analyst. The copy below is a script/post the user just APPROVED as on-brand.',
  'Return ONLY minified JSON, no prose, with this exact shape:',
  '{"formality":0.0,"assertiveness":0.0,"warmth":0.0,"jargonDensity":0.0,"humor":0.0,"ctaDirectness":0.0,"recurringPhrases":["..."]}',
  'Each dial is 0..1 — formality: 0 casual, 1 formal; assertiveness: 0 gentle, 1 assertive;',
  'warmth: 0 clinical, 1 warm; jargonDensity: 0 plain, 1 jargon-heavy; humor: 0 serious, 1 playful;',
  'ctaDirectness: 0 soft, 1 direct. recurringPhrases = up to 5 distinctive phrasings or structures',
  'actually present in the copy. Omit any field you cannot judge. Base everything ONLY on the copy below.',
].join(' ');

/**
 * Pure parser for the model's JSON reply: clamps dials to [0,1], trims/dedupes/caps phrases, returns
 * null when nothing usable was extracted.
 */
export function parseCopyVoiceSignals(raw: string | undefined): CopyVoiceSignals | null {
  if (!raw) return null;
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/i, '$1').trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch (err) {
    // FAILLOUD: remove after brand-vault verify (revert to `} catch { return null; }`)
    console.error('[FAILLOUD][BrandVault copy-voice] JSON.parse failed', { raw: stripped.slice(0, 500), err });
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;

  const dial = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
  };

  const dials = {
    formality: dial(obj.formality),
    assertiveness: dial(obj.assertiveness),
    warmth: dial(obj.warmth),
    jargonDensity: dial(obj.jargonDensity),
    humor: dial(obj.humor),
    ctaDirectness: dial(obj.ctaDirectness),
  };

  const recurringPhrases = Array.isArray(obj.recurringPhrases)
    ? [
        ...new Set(
          obj.recurringPhrases
            .filter((p): p is string => typeof p === 'string')
            .map((p) => p.trim())
            .filter((p) => p.length > 0 && p.length <= 120),
        ),
      ].slice(0, 5)
    : [];

  const hasAny = Object.values(dials).some((v) => v !== undefined) || recurringPhrases.length > 0;
  if (!hasAny) return null;

  return { dials, recurringPhrases };
}

const TAG = '[BrandVault copy-voice]';

export async function analyzeCopyVoiceSignals(
  options: AnalyzeCopyVoiceOptions,
): Promise<CopyVoiceSignals | null> {
  const env = options.env ?? process.env;
  // Kill switch is silent (intentional config); everything else logs why it produced nothing, so a
  // null is never a mystery in the logs.
  const enabled = options.enabled ?? env.BRAND_VAULT_COPY_VOICE_ANALYSIS_ENABLED !== 'false';
  if (!enabled) return null;
  const apiKey = options.apiKey ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn(`${TAG} skipped: no GEMINI_API_KEY/GOOGLE_API_KEY`);
    return null;
  }
  const text = options.text?.trim();
  if (!text) return null;

  const modelName = options.modelName ?? env.BRAND_VAULT_COPY_VOICE_ANALYSIS_MODEL ?? DEFAULT_MODEL_NAME;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const copyInput = `\n\nCOPY TO ANALYZE:\n${text.slice(0, maxChars)}`;
  const inputChars = PROMPT.length + copyInput.length;
  const startedAt = Date.now();
  let providerCallStarted = false;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
    // Rule 35: instructions first, data (the copy) last.
    providerCallStarted = true;
    const result = await model.generateContent([PROMPT, copyInput]);
    const outputText = result.response.text();
    const signals = parseCopyVoiceSignals(outputText);
    await recordBrandVaultCopyVoiceGeminiCost({
      status: signals ? 'success' : 'failed',
      modelName,
      inputChars,
      outputChars: outputText.length,
      functionMs: Date.now() - startedAt,
      usage: readGeminiUsage(result),
      parseableSignals: Boolean(signals),
      resultCount: signals ? countCopyVoiceSignals(signals) : 0,
    });
    if (!signals) {
      console.error(`[FAILLOUD]${TAG} model returned no parseable signals`); // FAILLOUD: remove after brand-vault verify (revert to console.warn)
      return null;
    }
    const dials = Object.entries(signals.dials)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    console.log(`${TAG} extracted ${dials || 'no dials'}; ${signals.recurringPhrases.length} phrase(s)`);
    return signals;
  } catch (err) {
    if (providerCallStarted) {
      await recordBrandVaultCopyVoiceGeminiCost({
        status: 'failed',
        modelName,
        inputChars,
        outputChars: 0,
        functionMs: Date.now() - startedAt,
        error: err,
      });
    }
    // FAILLOUD: remove after brand-vault verify (revert to console.warn message-only)
    console.error(`[FAILLOUD]${TAG} failed`, err);
    return null;
  }
}

async function recordBrandVaultCopyVoiceGeminiCost(input: CopyVoiceGeminiCostInput) {
  const inputTokens = input.usage?.inputTokens ?? estimateTokensFromChars(input.inputChars);
  const outputTokens = input.usage?.outputTokens ?? estimateTokensFromChars(input.outputChars);
  await recordProviderCostEvent({
    status: input.status,
    service: 'brand_vault',
    action: 'brand_scan',
    route: 'lib/shared/brand-vault-copy-voice',
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
      sourceKind: 'approved_copy_voice',
      inputChars: input.inputChars,
      outputChars: input.outputChars,
      parseableSignals: input.parseableSignals,
      resultCount: input.resultCount,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}

function readGeminiUsage(result: unknown): CopyVoiceGeminiUsage | undefined {
  const resultRecord = asRecord(result);
  const responseRecord = asRecord(resultRecord?.response);
  const usage = asRecord(resultRecord?.usageMetadata) ?? asRecord(responseRecord?.usageMetadata);
  if (!usage) return undefined;

  const inputTokens = readNumber(usage.promptTokenCount ?? usage.inputTokenCount);
  const outputTokens = readNumber(usage.candidatesTokenCount ?? usage.outputTokenCount);
  const totalTokens = readNumber(usage.totalTokenCount);
  return inputTokens || outputTokens || totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined;
}

function countCopyVoiceSignals(signals: CopyVoiceSignals): number {
  return Object.values(signals.dials).filter((value) => value !== undefined).length + signals.recurringPhrases.length;
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
