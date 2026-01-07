import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { normalizeWhitespace } from "../utils/text";
import { suggestInsertionPoint, type PlacementProposal, type BlockNode } from "../block-graph";

export type Intent = "SCRIPT_EDIT" | "SCRIPT_GENERATE" | "META_QUESTION" | "CHAT";

export interface IntentGateResult {
  intent: Intent;
  reason: string;
  usedFallback: boolean;
  executable?: boolean;
  proposal?: PlacementProposal;
  signals?: string[];
  textSample?: string;
}

// CHAT is a fallback, never a guess.
// If the user is clearly authoring or mutating content, it must not be CHAT.
// If the user requests a document mutation, it is never CHAT.
// It is either an executable edit or a blocked edit awaiting scope.

const EDIT_VERBS = [
  "edit",
  "change",
  "rewrite",
  "remove",
  "delete",
  "add",
  "insert",
  "append",
  "move",
  "reorder",
  "split",
  "merge",
  "add example",
  "tighten",
  "shorten",
  "expand",
  "improve",
  "fix",
  "update",
  "adjust",
];

const STRUCTURAL_NOUNS = [
  /\b(section|step|block|part|example|why|instruction|paragraph)\b/i,
];

const GENERATE_IMPERATIVE_PATTERNS = [
  /\b(write|draft|create|generate|produce|build|make)\b/i,
  /\b(script|manual|guide|playbook|steps|outline|draft)\b/i,
  /\b(write|draft|create).{0,20}\b(script|guide|manual|steps|draft)\b/i,
  /\b(can you|please)\s+(write|draft|create)\b/i,
];

const META_QUESTION_PATTERNS = [
  /\b(how|why|when|what)\b.*\b(write|draft|create|generate|make)\b/i,
  /\bhow do i\b/i,
  /\bwhat is the best way\b/i,
  /\bcan you explain\b/i,
  /what is thinkforge/i,
  /how does this work/i,
  /pricing|plan/i,
  /terms|privacy/i,
  /bug|issue|problem/i,
];

function containsAny(text: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((p) =>
    typeof p === "string" ? text.includes(p.toLowerCase()) : p.test(text)
  );
}

export function classifyIntentFast(
  prompt: string,
  selection?: string | null,
  hasScript?: boolean
): IntentGateResult {
  const text = normalizeWhitespace(prompt).toLowerCase();
  const hasSelection = Boolean(selection && selection.trim().length > 0);
  const textSample = prompt.length > 80 ? prompt.slice(0, 80) + "..." : prompt;

  // 1. Explicit SCRIPT_EDIT (highest priority)
  const hasEditVerb = EDIT_VERBS.some((v) => text.includes(v));
  const hasStructuralNoun = containsAny(text, STRUCTURAL_NOUNS);

  if (hasEditVerb) {
    // 1a. Edit WITH scope
    if (hasSelection) {
      return { 
        intent: "SCRIPT_EDIT", 
        reason: "edit_with_selection", 
        usedFallback: false, 
        executable: true,
        textSample, 
        signals: ["edit_verb", "selection"] 
      };
    }
    
    // 1b. Edit WITHOUT scope (Structural Mutation)
    if (hasStructuralNoun) {
      return { 
        intent: "SCRIPT_EDIT", 
        reason: "missing_scope", 
        usedFallback: false, 
        executable: false,
        textSample, 
        signals: ["edit_verb", "structural_noun"] 
      };
    }

    // If edit verb but no structural noun and no selection, fall through to check other intents
    // but keep it as a candidate for CHAT if nothing else matches.
  }

  // 2. Explicit SCRIPT_GENERATE (Generative Imperative)
  const hasGenerateSignals = containsAny(text, GENERATE_IMPERATIVE_PATTERNS);
  const isMeta = containsAny(text, META_QUESTION_PATTERNS);

  if (hasGenerateSignals && !isMeta) {
    return { 
      intent: "SCRIPT_GENERATE", 
      reason: "generative_imperative", 
      usedFallback: false, 
      executable: true,
      textSample, 
      signals: ["generate_imperative"] 
    };
  }

  // 3. Meta questions about system or script
  if (isMeta) {
    return { 
      intent: "META_QUESTION", 
      reason: "meta_pattern", 
      usedFallback: false, 
      executable: false,
      textSample, 
      signals: ["meta_pattern"] 
    };
  }

  // 4. Script terms fallback (if script exists)
  if (hasScript && /script|draft|section|block|paragraph|instruction/i.test(text)) {
    if (hasSelection) {
      return { 
        intent: "SCRIPT_EDIT", 
        reason: "script_terms_with_selection", 
        usedFallback: false, 
        executable: true,
        textSample, 
        signals: ["script_terms", "selection"] 
      };
    }
  }

  // 5. Default
  return { 
    intent: "CHAT", 
    reason: "default_chat", 
    usedFallback: false, 
    executable: false,
    textSample, 
    signals: [] 
  };
}

async function classifyIntentFallback(prompt: string): Promise<IntentGateResult> {
  const model = google("gemini-2.0-flash-lite-preview-02-05");
  const system =
    "Classify the user message into one of: SCRIPT_EDIT, SCRIPT_GENERATE, META_QUESTION, CHAT. Return the label only.";
  const { text } = await generateText({ model, prompt: `${system}\nMessage: ${prompt}` });
  const label = text.trim().toUpperCase();
  const intents: Intent[] = ["SCRIPT_EDIT", "SCRIPT_GENERATE", "META_QUESTION", "CHAT"];
  const intent = intents.includes(label as Intent) ? (label as Intent) : "CHAT";
  const textSample = prompt.length > 80 ? prompt.slice(0, 80) + "..." : prompt;
  return { intent, reason: "fallback_llm", usedFallback: true, textSample, signals: ["llm_fallback"] };
}

export async function classifyIntent(
  prompt: string,
  selection?: string | null,
  hasScript?: boolean,
  blocks?: BlockNode[]
): Promise<IntentGateResult> {
  const fast = classifyIntentFast(prompt, selection, hasScript);
  
  if (fast.intent === "SCRIPT_EDIT" && fast.reason === "missing_scope" && blocks) {
    fast.proposal = suggestInsertionPoint(blocks);
  }

  if (fast.intent !== "CHAT" || fast.reason !== "default_chat") {
    return fast;
  }
  // Ambiguous only when default chat without clear signals -> optional tiny fallback
  try {
    const fallback = await classifyIntentFallback(prompt);
    return fallback;
  } catch (err) {
    return fast; // fail closed to CHAT
  }
}

export function intentRequiresSelection(intent: Intent): boolean {
  return intent === "SCRIPT_EDIT";
}
