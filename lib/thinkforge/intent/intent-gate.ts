import { generateText } from "ai";
import { normalizeWhitespace } from "../utils/text";
import { suggestInsertionPoint, type PlacementProposal, type BlockNode } from "../block-graph";
import { buildIntentClassifierSystemInstruction } from "../prompts/intentClassifierPrompt";
import { createModelByTier, ModelTier } from "../agents/model-factory";
import { buildIsolatedPromptParts } from "../agents/prompt-boundary";
import { readAiSdkUsage, recordThinkForgeDirectCost } from "../services/provider-cost-telemetry";

export type Intent = "chat" | "draft" | "edit" | "hybrid" | "research";
export type IntentScope = "selection" | "section" | "document";

export interface IntentContextSignals {
  editorFocused?: boolean;
  hasSelection?: boolean;
  workspaceMode?: "script" | "whiteboard" | "unknown";
  lastUserAction?: string;
}

export interface IntentGateResult {
  intent: Intent;
  confidence: number;
  scope?: IntentScope;
  reason: string;
  usedFallback: boolean;
  executable?: boolean;
  proposal?: PlacementProposal;
  signals?: string[];
}

type IntentCacheEntry = {
  value: IntentGateResult;
  expiresAt: number;
};

const INTENT_CACHE_TTL_MS = 2 * 60 * 1000;
const INTENT_CACHE_MAX = 300;
const intentFallbackCache = new Map<string, IntentCacheEntry>();

function getIntentCacheKey(input: {
  prompt: string;
  hasScript: boolean;
  hasSelection: boolean;
  context?: IntentContextSignals;
}): string {
  const normalizedPrompt = normalizeWhitespace(input.prompt).toLowerCase();
  const ctx = input.context;
  const ctxKey = [
    ctx?.editorFocused ? "1" : "0",
    ctx?.workspaceMode || "unknown",
    (ctx?.lastUserAction || "").toLowerCase(),
  ].join("|");
  return [normalizedPrompt, input.hasScript ? "1" : "0", input.hasSelection ? "1" : "0", ctxKey].join("::");
}

function getCachedIntent(key: string): IntentGateResult | null {
  const cached = intentFallbackCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    intentFallbackCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedIntent(key: string, value: IntentGateResult): void {
  intentFallbackCache.set(key, { value, expiresAt: Date.now() + INTENT_CACHE_TTL_MS });
  if (intentFallbackCache.size > INTENT_CACHE_MAX) {
    const oldestKey = intentFallbackCache.keys().next().value as string | undefined;
    if (oldestKey) intentFallbackCache.delete(oldestKey);
  }
}

// CHAT is a fallback, never a guess.
// If the user is clearly authoring or mutating content, it must not be CHAT.
// If the user requests a document mutation, it is never CHAT.
// It is either an executable edit or a blocked edit awaiting scope.

const EDIT_VERBS_HEURISTIC = [
  "rewrite",
  "edit",
  "improve",
  "refine",
  "shorten",
  "expand",
  "fix",
  "polish",
];

const GENERATE_VERBS_HEURISTIC = [
  "create",
  "write",
  "generate",
  "make",
  "build",
  "draft",
];

const RESEARCH_VERBS_HEURISTIC = [
  "research",
  "find",
  "search",
  "lookup",
  "look up",
  "explore",
];

const RESEARCH_PATTERNS_HEURISTIC: RegExp[] = [
  /\b(trends?|trending|trendy|viral)\b/i,
  /\b(examples?|references?|sources?)\b/i,
  /\b(suggest|recommend)\b.*?\b(ideas?|hooks?|trends?|topics?)\b/i,
  /\b(find|search|look\s*up|explore)\b.*?\b(ideas?|hooks?|trends?|examples?|meme|videos?|links?|topics?)\b/i,
  /\bwhat('s|\s+is|\s+are)\s+(trending|popular|viral|trendy)\b/i,
  /\b(give me|show me|list)\s+(some|trending|popular|recent)\b/i,
  /\binspirations?\b/i,
  /\b(hooks?|ideas?)\s+(that|which|for)\b/i,
];

const META_PATTERNS_HEURISTIC = [
  /how does/i,
  /what is thinkforge/i,
  /how does this work/i,
];

const QUESTION_PATTERNS = [/^\s*(what|how|why|explain|tell me|describe)\b/i];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesStandalonePhrase(text: string, phrase: string): boolean {
  const escapedPhrase = phrase
    .trim()
    .split(/\s+/u)
    .map(escapeRegExp)
    .join("\\s+");
  if (!escapedPhrase) return false;
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])${escapedPhrase}(?=$|[^\\p{L}\\p{N}_])`,
    "iu",
  ).test(text);
}

function textIncludesAny(text: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) =>
    typeof pattern === "string" ? includesStandalonePhrase(text, pattern) : pattern.test(text)
  );
}

/**
 * Fast heuristic-only router. Returns null when ambiguous to allow LLM fallback.
 */
export function fastIntentHeuristic(input: {
  userMessage: string;
  hasScript: boolean;
  hasSelection: boolean;
  context?: IntentContextSignals;
}): { intent: Intent; confidence: number; scope?: IntentScope; signals: string[] } | null {
  const text = normalizeWhitespace(input.userMessage).toLowerCase();
  const hasSelection = input.hasSelection || Boolean(input.context?.hasSelection);
  const hasScript = Boolean(input.hasScript);
  const editorFocused = Boolean(input.context?.editorFocused);
  const workspaceMode = input.context?.workspaceMode || "unknown";
  const lastAction = (input.context?.lastUserAction || "").toLowerCase();

  // This action is emitted only after the server atomically claims the session's
  // pending initial-draft intent. Its meaning is authoritative and must not be
  // re-guessed from wording by either the heuristic or fallback classifier.
  if (lastAction === "initial_draft_claim") {
    return {
      intent: "draft",
      confidence: 1,
      scope: "document",
      signals: ["initial_draft_claim"],
    };
  }

  const isQuestion = textIncludesAny(text, QUESTION_PATTERNS) || textIncludesAny(text, META_PATTERNS_HEURISTIC);
  const hasEditVerb = textIncludesAny(text, EDIT_VERBS_HEURISTIC);
  const hasGenerateVerb = textIncludesAny(text, GENERATE_VERBS_HEURISTIC);
  const hasResearchVerb = textIncludesAny(text, RESEARCH_VERBS_HEURISTIC);
  const hasResearchPattern = textIncludesAny(text, RESEARCH_PATTERNS_HEURISTIC);
  const mentionsWholeDoc = /\b(entire|whole|all|full|complete|from scratch)\b/i.test(text);

  const isStructuralAdd = /\badd (a )?(section|step|block|outline|hook|cta|why)\b/i.test(text);

  const wantsEdit = hasSelection || hasEditVerb || /\b(revise|tweak|polish|tighten)\b/i.test(text);
  const wantsDraft = hasGenerateVerb || /\bwrite (a|the) script\b/i.test(text);

  // If it's a question but also looks like a specific action request (e.g. "how to shorten this"), we prefer the action.
  // But if it's a generic question ("how do you write scripts?"), we prefer chat.
  const isGenericQuestion = isQuestion && !hasSelection && !hasEditVerb && !isStructuralAdd && !mentionsWholeDoc;

  // Research intent: user wants to find trends, examples, references, or ideas from the web
  // Research takes priority over generic chat when research patterns are detected
  const wantsResearch = (hasResearchVerb && !hasEditVerb && !hasSelection) || hasResearchPattern;

  const hybridSignal = (wantsEdit && isQuestion && !isGenericQuestion) || (wantsEdit && wantsDraft) || (hasScript && isStructuralAdd);

  const scope: IntentScope | undefined = hasSelection
    ? "selection"
    : mentionsWholeDoc
      ? "document"
      : "section";

  let confidence = 0.5;
  const signals: string[] = [];

  if (hasSelection) {
    confidence += 0.25;
    signals.push("selection");
  }
  if (editorFocused && workspaceMode === "script") {
    confidence += 0.1;
    signals.push("editor_focused");
  }
  if (lastAction.includes("selection")) {
    confidence += 0.1;
    signals.push("last_action_selection");
  }
  if (workspaceMode === "whiteboard") {
    confidence -= 0.1;
    signals.push("whiteboard_mode");
  }

  // Research intent — fires before hybrid/edit so research queries are not misrouted as edits
  if (wantsResearch && !wantsEdit && !wantsDraft) {
    const researchConfidence = hasResearchPattern ? 0.85 : 0.75;
    return { intent: "research", confidence: researchConfidence, signals: [...signals, "research_signal"] };
  }

  if (hybridSignal) {
    return { intent: "hybrid", confidence: Math.min(0.85, confidence + 0.15), scope, signals: [...signals, "hybrid"] };
  }

  if (wantsEdit && (hasSelection || hasScript || editorFocused)) {
    return { intent: "edit", confidence: Math.min(0.9, confidence + 0.2), scope, signals: [...signals, "edit_signal"] };
  }

  if (isGenericQuestion) {
    return { intent: "chat", confidence: Math.min(0.85, confidence + 0.2), signals: [...signals, "question"] };
  }

  if (wantsDraft) {
    const draftConfidence = hasScript ? confidence + 0.25 : confidence + 0.3;
    return {
      intent: "draft",
      confidence: Math.min(0.9, Math.max(0.7, draftConfidence)),
      scope: "document",
      signals: [...signals, "draft_signal"],
    };
  }

  if (isQuestion) {
    return { intent: "chat", confidence: Math.min(0.75, confidence + 0.1), signals: [...signals, "question"] };
  }

  return null;
}

/**
 * Backward-compatible fast classifier (kept for tests/consumers).
 * Uses fastIntentHeuristic and defaults to CHAT when ambiguous.
 */
export function classifyIntentFast(
  prompt: string,
  selection?: string | null,
  hasScript?: boolean,
  context?: IntentContextSignals
): IntentGateResult {
  const hasSelection = Boolean(selection && selection.trim().length > 0) || Boolean(context?.hasSelection);
  const result = fastIntentHeuristic({
    userMessage: prompt,
    hasScript: Boolean(hasScript),
    hasSelection,
    context,
  });
  if (result) {
    return {
      intent: result.intent,
      confidence: result.confidence,
      scope: result.scope,
      reason: "heuristic_rule",
      usedFallback: false,
      executable: result.intent !== "chat",
      signals: ["heuristic", ...result.signals],
    };
  }

  return {
    intent: "chat",
    confidence: 0.45,
    reason: "default_chat",
    usedFallback: false,
    executable: false,
    signals: [],
  };
}

async function classifyIntentFallback(
  prompt: string,
  hasScript: boolean,
  hasSelection: boolean,
  context?: IntentContextSignals
): Promise<IntentGateResult> {
  const cacheKey = getIntentCacheKey({
    prompt,
    hasScript,
    hasSelection,
    context,
  });
  const cached = getCachedIntent(cacheKey);
  if (cached) {
    return cached;
  }

  const model = createModelByTier(ModelTier.Structural);
  const modelName = "gemini-2.5-flash";
  const promptParts = buildIsolatedPromptParts({
    systemInstruction: buildIntentClassifierSystemInstruction(),
    data: {
      message: prompt,
      hasScript,
      hasSelection,
      context: {
        editorFocused: Boolean(context?.editorFocused),
        workspaceMode: context?.workspaceMode ?? "unknown",
        lastUserAction: context?.lastUserAction ?? null,
      },
    },
    fieldLimits: {
      message: 8_000,
      lastUserAction: 1_000,
    },
    totalLimit: 12_000,
  });
  const promptChars = promptParts.systemInstruction.length + promptParts.prompt.length;
  const startedAt = Date.now();

  try {
    const aiResult = await generateText({
      model,
      system: promptParts.systemInstruction,
      prompt: promptParts.prompt,
      maxOutputTokens: 120,
      temperature: 0,
    });
    const { text } = aiResult;
    const raw = text.trim();
    let parsed: { intent?: string; confidence?: number; scope?: string } | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const normalizedIntent = String(parsed?.intent || "").toLowerCase();
    const intent: Intent = ("chat,draft,edit,hybrid,research".split(",") as Intent[]).includes(normalizedIntent as Intent)
      ? (normalizedIntent as Intent)
      : "chat";
    const confidence = typeof parsed?.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6;
    const scope = parsed?.scope === "selection" || parsed?.scope === "section" || parsed?.scope === "document" ? (parsed.scope as IntentScope) : undefined;
    const result: IntentGateResult = {
      intent,
      confidence,
      scope,
      reason: "fallback_llm",
      usedFallback: true,
      signals: ["llm_fallback"],
    };
    await recordThinkForgeDirectCost({
      status: "success",
      action: "intent_gate_fallback",
      route: "lib/thinkforge/intent/intent-gate",
      provider: "gemini",
      modelName,
      operation: "llm_text_direct",
      promptChars,
      outputChars: text?.length,
      functionMs: Date.now() - startedAt,
      usage: await readAiSdkUsage((aiResult as { usage?: unknown }).usage),
      routePurpose: "structural",
      privacyClass: "business_confidential",
      temperature: 0,
      maxTokens: 120,
      sourceKind: "intent_gate_llm_fallback",
      resultCount: 1,
    });
    setCachedIntent(cacheKey, result);
    return result;
  } catch (error) {
    await recordThinkForgeDirectCost({
      status: "failed",
      action: "intent_gate_fallback",
      route: "lib/thinkforge/intent/intent-gate",
      provider: "gemini",
      modelName,
      operation: "llm_text_direct",
      promptChars,
      functionMs: Date.now() - startedAt,
      routePurpose: "structural",
      privacyClass: "business_confidential",
      temperature: 0,
      maxTokens: 120,
      sourceKind: "intent_gate_llm_fallback",
      error,
    });
    const result: IntentGateResult = {
      intent: "chat",
      confidence: 0.4,
      reason: "llm_failed_default_chat",
      usedFallback: true,
      signals: ["llm_failure"],
    };
    setCachedIntent(cacheKey, result);
    return result;
  }
}

export async function classifyIntent(
  prompt: string,
  selection?: string | null,
  hasScript?: boolean,
  blocks?: BlockNode[],
  context?: IntentContextSignals
): Promise<IntentGateResult> {
  const hasSelection = Boolean(selection && selection.trim().length > 0) || Boolean(context?.hasSelection);
  const heuristic = fastIntentHeuristic({
    userMessage: prompt,
    hasScript: Boolean(hasScript),
    hasSelection,
    context,
  });

  if (heuristic) {
    const result: IntentGateResult = {
      intent: heuristic.intent,
      confidence: heuristic.confidence,
      scope: heuristic.scope,
      reason: "heuristic_rule",
      usedFallback: false,
      executable: heuristic.intent !== "chat",
      signals: ["heuristic", ...heuristic.signals],
    };

    if (heuristic.intent === "edit" && !hasSelection && blocks) {
      result.proposal = suggestInsertionPoint(blocks);
    }

    const shouldFallback = result.confidence < 0.65;
    if (shouldFallback) {
      const fallback = await classifyIntentFallback(prompt, Boolean(hasScript), hasSelection, context);
      if (fallback) {
        return fallback;
      }
    }

    return result;
  }

  const fallback = await classifyIntentFallback(prompt, Boolean(hasScript), hasSelection, context);
  return fallback;
}

export function intentRequiresSelection(intent: Intent, scope?: IntentScope): boolean {
  if (intent !== "edit" && intent !== "hybrid") return false;
  if (!scope) return true;
  return scope !== "document";
}
