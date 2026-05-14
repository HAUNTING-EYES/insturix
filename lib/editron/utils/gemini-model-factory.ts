/**
 * Centralized Gemini Model Factory
 *
 * Replaces hardcoded model references across the codebase with a single configurable factory.
 *
 * Model hierarchy (updated 2026-05-15):
 *   gemini-3.1-flash     — Analysis, chat, captions, classification (fast + cheap)
 *   gemini-3.1-pro       — Intelligence, transcript editing, creative intent (best reasoning)
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
 * Get a model for video/image analysis (fast + cheap).
 * Used by: five-track-analysis, style-transfer, motion-graphics, transcription, asset analysis.
 * Override: LLM_ANALYSIS_MODEL env var.
 */
export async function getAnalysisModel() {
  const genAI = await getGenAI();
  const modelName = process.env.LLM_ANALYSIS_MODEL || 'gemini-3.1-flash';
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Get a model for interactive chat (speed-critical).
 * Used by: AI Chat tools, agent-graph, editor LLM service.
 * NOT configurable — chat needs low latency + LangChain compatibility.
 */
export async function getChatModel() {
  const genAI = await getGenAI();
  return genAI.getGenerativeModel({ model: 'gemini-3.1-flash' });
}

/**
 * Get a model for heavy tasks — best reasoning.
 * Used by: editorial intent classification, transcript editing, creative intent.
 * Override: LLM_GENERAL_MODEL env var.
 */
export async function getGeneralModel() {
  const genAI = await getGenAI();
  const modelName = process.env.LLM_GENERAL_MODEL || 'gemini-3.1-pro';
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Get the raw GoogleGenerativeAI instance (for Files API uploads, etc.).
 * Callers who need `genAI.getGenerativeModel()` directly can use this.
 */
export { getGenAI };

/**
 * Get a model bound to the cached creative production knowledge doc.
 * Creative doc rules (~10K tokens) are cached via Gemini Context Caching
 * with cache ID stored in Upstash Redis (survives Vercel cold starts).
 *
 * Falls back to uncached model with inline system instruction on any failure.
 * Used by: video-understanding-service (Mode 2 analysis).
 */
export async function getCreativeDocModel() {
  const { getCreativeDocCachedModel } = await import('@/lib/editron/services/gemini-context-cache');
  return getCreativeDocCachedModel();
}

// ─── Error Classification ────────────────────────────────────────

/**
 * Error patterns that indicate MODEL INCOMPATIBILITY — the model doesn't
 * support this operation (e.g., Gemma 4 can't use Files API).
 *
 * These trigger fallback to gemini-3.1-flash.
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
      const primaryName = process.env.LLM_ANALYSIS_MODEL || 'gemini-3.1-flash';
      const fallbackName = 'gemini-3.1-flash';
      console.warn(`[ModelFactory] ${primaryName} unsupported for this operation, falling back to ${fallbackName}: ${err.message}`);
      const genAI = await getGenAI();
      const fallback = genAI.getGenerativeModel({ model: fallbackName });
      return await fn(fallback);
    }
    throw err; // Rate limit, auth, malformed → don't mask with fallback
  }
}
