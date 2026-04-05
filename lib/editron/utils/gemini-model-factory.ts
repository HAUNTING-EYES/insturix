/**
 * Centralized Gemini/Gemma Model Factory
 *
 * Replaces 22+ hardcoded `new GoogleGenerativeAI().getGenerativeModel({ model: 'gemini-2.5-flash' })`
 * calls across the codebase with a single configurable factory.
 *
 * Model hierarchy:
 *   Gemma 4 (31B)       — Parsing + video/image analysis (FREE on AI Studio)
 *   Gemini 3.1 Flash    — Intelligence + scoring
 *   Gemini 2.5 Flash    — Chat + backup fallback
 *
 * The factory uses the native @google/generative-ai SDK (not @ai-sdk/google).
 * The Vercel AI SDK callers (llm-scene-parser, unified-intelligence, reference-image)
 * are already wired via DEFAULT_CONFIG.aiModels — this factory handles everything else.
 */

// ─── Singleton ───────────────────────────────────────────────────

let _genAI: any = null;

async function getGenAI() {
  if (!_genAI) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY or GOOGLE_API_KEY found');
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

// ─── Model Getters ───────────────────────────────────────────────

/**
 * Get a model for video/image analysis — Gemma 4 by default.
 * Used by: five-track-analysis, style-transfer, motion-graphics, transcription, asset analysis.
 * Override: LLM_ANALYSIS_MODEL env var.
 */
export async function getAnalysisModel() {
  const genAI = await getGenAI();
  const modelName = process.env.LLM_ANALYSIS_MODEL || 'gemma-4-31b-it';
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Get a model for interactive chat — Gemini 2.5 Flash (speed-critical).
 * Used by: AI Chat tools, agent-graph, editor LLM service.
 * NOT configurable — chat needs low latency + LangChain compatibility.
 */
export async function getChatModel() {
  const genAI = await getGenAI();
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

/**
 * Get a model for general tasks — Gemini 3.1 Flash.
 * Used by: consistency scoring, quality review.
 * Override: LLM_GENERAL_MODEL env var.
 */
export async function getGeneralModel() {
  const genAI = await getGenAI();
  const modelName = process.env.LLM_GENERAL_MODEL || 'gemini-2.5-flash';
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Get the raw GoogleGenerativeAI instance (for Files API uploads, etc.).
 * Callers who need `genAI.getGenerativeModel()` directly can use this.
 */
export { getGenAI };

// ─── Error Classification ────────────────────────────────────────

/**
 * Error patterns that indicate MODEL INCOMPATIBILITY — the model doesn't
 * support this operation (e.g., Gemma 4 can't use Files API).
 *
 * These trigger fallback to gemini-2.5-flash.
 * Rate limits (429), auth errors (401), malformed requests (400) do NOT trigger fallback.
 */
const MODEL_UNSUPPORTED_PATTERNS = [
  'model not found',
  'unsupported model',
  'does not support',
  'is not available',
  'invalid model',
  'model_not_found',
  'not_found',
  'models/ is not found',
];

/** Check if an error is a model-incompatibility error (vs. rate limit, auth, etc.) */
export function isModelUnsupportedError(error: any): boolean {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  const status = error?.status || error?.statusCode || error?.code;
  // 404 = model not found. Other 4xx = request/auth issue — should NOT fallback.
  if (status === 404) return true;
  return MODEL_UNSUPPORTED_PATTERNS.some(p => msg.includes(p));
}

// ─── Fallback Wrapper ────────────────────────────────────────────

/**
 * Wrap an analysis call with model-specific fallback.
 *
 * Only falls back to gemini-2.5-flash if the error is MODEL incompatibility.
 * Rate limits (429), auth errors (401), malformed requests (400) → rethrow
 * so the caller can handle them properly (retry, surface to user, etc.).
 *
 * Usage:
 *   const result = await withAnalysisFallback(async (model) => {
 *     return model.generateContent([...]);
 *   });
 */
export async function withAnalysisFallback<T>(
  fn: (model: any) => Promise<T>,
): Promise<T> {
  const primaryModel = await getAnalysisModel();
  try {
    return await fn(primaryModel);
  } catch (err: any) {
    if (isModelUnsupportedError(err)) {
      const primaryName = process.env.LLM_ANALYSIS_MODEL || 'gemma-4-31b-it';
      const fallbackName = 'gemini-2.5-flash';
      console.warn(`[ModelFactory] ${primaryName} unsupported for this operation, falling back to ${fallbackName}: ${err.message}`);
      const genAI = await getGenAI();
      const fallback = genAI.getGenerativeModel({ model: fallbackName });
      return await fn(fallback);
    }
    throw err; // Rate limit, auth, malformed → don't mask with fallback
  }
}
