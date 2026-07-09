/**
 * prompt-knob-parser - the intake LANGUAGE pass (ThinkForge's layer, Rule 30: language via LLM,
 * logic native). Turns a user's free-text request about the OUTPUT ("punchy 30s vertical cut for
 * TikTok, make two versions") into the CONCRETE knobs they EXPLICITLY stated - nothing more.
 *
 * The output is `RequestedKnobs`: a strict SUBSET of the resolver's `IntakeSignals['requested']`
 * (derived, never forked). The composer sets it as `IntakeUserContext.requested`; the resolver
 * (resolveProductionBrief) already treats those as user-confirmed, highest precedence
 * (USER > BRAND > INFERRED). So once this emits `requested`, the spec is honored end-to-end -
 * no composer change (intake-resolver.ts:52-58 was built anticipating exactly this parser).
 *
 * THE failure mode is HALLUCINATING a knob (inventing "30s" when no length was said, or "TikTok"
 * from "make it snappy"). A wrong knob is worse than a missing one - the resolver infers missing
 * ones sensibly. So this pass is CONSERVATIVE: it emits a knob only when the user clearly stated
 * it, and omits everything else. Vibe words ("punchy") are NOT knobs - they stay in the raw
 * `prompt` -> `intent` path (handled by the resolver), not here.
 *
 * Duration clamping and platform-from-connected-accounts inference are the RESOLVER's job
 * (clampDuration / inferPlatform) - this parser only extracts what's on the page, never bounds
 * or infers. Follows the project prompt methodology (Rule 35): XML-delimited, rules-over-examples
 * (no few-shot anchoring), data LAST. Seed/temperature live in the caller's generation config.
 *
 * Structure mirrors ordering-prompt.ts: a pure `build...Prompt` + a pure `parse...Response` that
 * never throws, plus one impure edge (`parsePromptKnobs`) that takes an injected LLM.
 */

import type { IntakeSignals } from '@/lib/editron/production-brief/intake-resolver';
import { type AspectRatio, type Platform, PLATFORM_SHAPE } from '@/lib/editron/production-brief/production-brief';

/**
 * The knobs this pass may emit - the resolver's `requested` shape MINUS `intent` and `style`
 * (those flow via the raw prompt -> intent path and the brand -> style path, not structured
 * extraction). Derived from `IntakeSignals['requested']` so it can NEVER drift from the shape the
 * resolver consumes (a change there compile-breaks here, by design).
 */
export type RequestedKnobs = Omit<NonNullable<IntakeSignals['requested']>, 'intent' | 'style'>;

/** Complete a prompt with an LLM (raw text in, raw text out). Inject Gemini in prod, Grok in eval. */
export type LLMComplete = (prompt: string) => Promise<string>;

/** Valid emittable platforms - PLATFORM_SHAPE keys minus 'unspecified' ("not stated" = omit the knob). */
const VALID_PLATFORMS: ReadonlySet<string> = new Set(
  Object.keys(PLATFORM_SHAPE).filter((p) => p !== 'unspecified'),
);
const VALID_ASPECTS: ReadonlySet<string> = new Set<AspectRatio>(['16:9', '9:16', '1:1', '4:5']);

// ─── prompt builder (pure) ──────────────────────────────────────

/** Build the knob-extraction prompt. Data (the user's request) goes LAST, per Rule 35. */
export function buildKnobParserPrompt(userPrompt: string): string {
  const platforms = [...VALID_PLATFORMS].join(' | ');
  return `<role>
You read a user's free-text request about a video they want made, and extract ONLY the concrete OUTPUT settings they EXPLICITLY stated. You do not design the video, judge it, or infer anything - you transcribe stated settings into a small JSON object.
</role>

<rules>
- Extract a setting ONLY when the user clearly and explicitly states it. If it is not clearly stated, OMIT that key entirely. A missing key is CORRECT and expected - the system infers unstated settings elsewhere.
- NEVER guess a setting from vibe or mood words. "snappy", "punchy", "clean", "professional", "make it pop" state NO platform, NO duration, NO aspect ratio. Omit them.
- Do NOT derive one setting from another. If the user names a platform but not an aspect ratio, do NOT emit aspectRatio (the system derives it). Emit aspectRatio only if they explicitly say "vertical" (9:16), "square" (1:1), "portrait" (4:5), "widescreen"/"landscape" (16:9), or give a ratio.
- A stated duration is a number of seconds ("30 seconds", "half a minute" = 30, "a minute" = 60, "under a minute" = 60). "short"/"quick"/"long" alone are NOT durations - omit.
- count = how many distinct cuts/versions they ask for ("two versions", "a couple" = 2, "three" = 3). Not stated = omit (do NOT default to 1).
- Languages are ISO-639-1 codes (Hindi = "hi", English = "en", Spanish = "es"). voiceLanguages = spoken/voiceover language; captionLanguages = subtitle/caption language.
- deliverables = explicitly requested named outputs beyond the cut(s) (e.g. "thumbnail", "captions file", "square version").
- When in doubt, LEAVE IT OUT.
</rules>

<output_format>
Return ONLY valid JSON, no prose, no code fence. Include ONLY the keys the user explicitly stated; omit all others:
{
  "platform"?: ${platforms},
  "targetDurationSec"?: number,
  "aspectRatio"?: "16:9" | "9:16" | "1:1" | "4:5",
  "count"?: number,
  "voiceLanguages"?: string[],
  "captionLanguages"?: string[],
  "deliverables"?: string[]
}
An empty object {} is the correct answer when the user stated no concrete settings.
</output_format>

<user_request>
${userPrompt}
</user_request>`;
}

// ─── response parsing (pure, never throws) ──────────────────────

/** Strip a \`\`\`json ... \`\`\` fence if the model added one despite being told not to. */
function stripFence(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1].trim() : t;
}

/** Normalize a string list: trim, drop empties, dedupe, lowercase (ISO codes). Undefined if none. */
function normalizeStringList(value: unknown, opts?: { lowercase?: boolean }): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const s = opts?.lowercase ? item.trim().toLowerCase() : item.trim();
    if (s.length === 0 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.length > 0 ? out : undefined;
}

/** A positive finite integer >= 1, or undefined (0 / negative / NaN / non-number -> undefined, NOT 1). */
function positiveIntOrUndefined(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const n = Math.floor(value);
  return n >= 1 ? n : undefined;
}

/**
 * Parse a raw LLM response into validated `RequestedKnobs`. Pure; NEVER throws. Every field is
 * validated/coerced and DROPPED if invalid (conservative - a dropped knob just means the resolver
 * infers it). Malformed JSON -> {} (emit nothing rather than guess). This is the safety net that
 * makes the whole pass trustworthy regardless of what the model returns.
 */
export function parseKnobResponse(raw: string): RequestedKnobs {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const obj = parsed as Record<string, unknown>;
  const out: RequestedKnobs = {};

  if (typeof obj.platform === 'string' && VALID_PLATFORMS.has(obj.platform)) {
    out.platform = obj.platform as Platform;
  }
  if (typeof obj.aspectRatio === 'string' && VALID_ASPECTS.has(obj.aspectRatio)) {
    out.aspectRatio = obj.aspectRatio as AspectRatio;
  }
  if (typeof obj.targetDurationSec === 'number' && Number.isFinite(obj.targetDurationSec) && obj.targetDurationSec > 0) {
    out.targetDurationSec = obj.targetDurationSec;
  }
  const count = positiveIntOrUndefined(obj.count);
  if (count !== undefined) out.count = count;

  const voice = normalizeStringList(obj.voiceLanguages, { lowercase: true });
  if (voice) out.voiceLanguages = voice;
  const caption = normalizeStringList(obj.captionLanguages, { lowercase: true });
  if (caption) out.captionLanguages = caption;
  const deliverables = normalizeStringList(obj.deliverables);
  if (deliverables) out.deliverables = deliverables;

  return out;
}

// ─── impure edge (injected LLM) ─────────────────────────────────

/**
 * Extract the explicitly-stated output knobs from a user's free-text request. Impure only through
 * the injected `llm`. NEVER throws: an empty/blank prompt, an LLM error, or a bad response all
 * yield `{}` (emit nothing -> the resolver infers everything, the safe default). The caller sets
 * the result on `IntakeUserContext.requested`.
 */
export async function parsePromptKnobs(userPrompt: string, llm: LLMComplete): Promise<RequestedKnobs> {
  if (typeof userPrompt !== 'string' || userPrompt.trim().length === 0) return {};
  let raw: string;
  try {
    raw = await llm(buildKnobParserPrompt(userPrompt));
  } catch {
    return {};
  }
  return parseKnobResponse(raw);
}
