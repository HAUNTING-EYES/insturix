/**
 * ordering-prompt - build the narrative-ordering LLM prompt + parse its response. Follows the
 * project prompt methodology (Rule 35): XML-delimited, schema-first, rules-over-examples (NO
 * few-shot - anchoring), data LAST. The seed/temperature live in the caller's generation
 * config, not here.
 *
 * The model ORDERS existing clips (it never writes prose - Rule 30, language at the edge). It
 * reasons in the clips' own language and keeps code-mixing (Hinglish) intact. Output is a JSON
 * OrderingPlan-by-ref that `parseOrderingResponse` maps to real Scene ids; the pure composer
 * then validates it (ordering-plan.ts) and falls back if it breaks a contract.
 *
 * `SEQUENCING_MOVES` here is PROVISIONAL - a placeholder mirroring the ThinkForge handoff. When
 * ThinkForge exports the real menu in creative-doc-rules.ts, pass it as the `moves` arg; the
 * builder does not change. Pure; never throws.
 */

import { SEQUENCING_MOVES } from '../data/creative-doc-rules';
import type { ClipDigest } from './ordering-digest';
import { narrativeLine, refToSceneIdMap } from './ordering-digest';
import type { OrderedItem, OrderingPlan, SeamLink } from './ordering-plan';
import { SEAM_LINKS } from './ordering-plan';

/**
 * The menu shape the prompt renders from. Structurally a SUBSET of the creative doc's
 * SEQUENCING_MOVES (Record<move, {effect, whenNotTo?, ...}>) - ThinkForge owns the menu
 * content in `creative-doc-rules.ts`; we consume it. Extra fields (signalsFor) are ignored
 * here. Any object with this shape can be injected (the eval/tests pass a small stub).
 */
export type SequencingMovesMenu = Readonly<Record<string, { readonly effect: string; readonly whenNotTo?: string }>>;

export interface OrderingPromptContext {
  platform?: string | null;
  targetDurationSec?: number | null;
  /** Source language (ISO code or label), from the transcript. Absent = let the model infer. */
  language?: string | null;
}

/** Assign each distinct source a short tag (s0, s1, ...) so the model can see co-recording groups. */
function sourceTags(digests: readonly ClipDigest[]): Map<string, string> {
  const tags = new Map<string, string>();
  for (const d of digests) if (!tags.has(d.source)) tags.set(d.source, `s${tags.size}`);
  return tags;
}

function renderClip(d: ClipDigest, srcTag: string): string {
  const sig: string[] = [`${d.durationSec}s`];
  if (d.importance !== undefined) sig.push(`importance ${d.importance}`);
  if (d.visualMode) sig.push(d.visualMode);
  if (d.actionType) sig.push(`action:${d.actionType}`);
  if (d.vocalArousal !== undefined || d.vocalValence) sig.push(`vocal:${d.vocalArousal ?? '?'}/${d.vocalValence ?? '?'}`);
  const lines = [`[${d.ref} · ${srcTag}] ${sig.join(' | ')}`];
  const narrative = narrativeLine(d);
  if (narrative) lines.push(narrative);
  if (d.onScreenText && d.onScreenText.length > 0) lines.push(`on-screen: ${d.onScreenText.join(', ')}`);
  lines.push(`transcript: ${d.transcript || '(no speech)'}`);
  return lines.join('\n');
}

/** Build the ordering prompt. `moves` defaults to the creative doc's SEQUENCING_MOVES. */
export function buildOrderingPrompt(
  digests: readonly ClipDigest[],
  ctx: OrderingPromptContext = {},
  moves: SequencingMovesMenu = SEQUENCING_MOVES,
): string {
  const tags = sourceTags(digests);
  const clips = digests.map((d) => renderClip(d, tags.get(d.source)!)).join('\n\n');
  const movesBlock = Object.entries(moves)
    .map(([name, m]) => `- ${name}: ${m.effect}${m.whenNotTo ? ` (avoid when: ${m.whenNotTo})` : ''}`)
    .join('\n');
  const lang = ctx.language ?? 'the clips\' own language';
  const target =
    typeof ctx.targetDurationSec === 'number' && ctx.targetDurationSec > 0
      ? `${ctx.targetDurationSec}s`
      : 'none (keep them all, follow the content)';

  return `<role>
You are a narrative video editor. You are given already-cut CLIPS and you decide the ORDER they play in to tell the strongest story. You order existing clips - you never write, rewrite, or translate anything. Reason and respond in ${lang}; if the clips mix languages (e.g. Hindi + English), keep that natural mix, do not clean it up.
</role>

<sequencing_moves>
Ordering moves you may lean on (use what fits; you need not name one, and never force a template):
${movesBlock}
</sequencing_moves>

<rules>
- Use EVERY clip exactly once. Ordering is NOT cutting.
- Clips sharing the same [· sN] source tag are ONE continuous recording: you may move that group anywhere, but keep those clips in the order listed relative to each other. Never reorder a clip against others from its own source.
- The FIRST clip in your order is the hook.
- For each clip after the first, label the join from the previous clip with exactly one of: ${SEAM_LINKS.map((l) => `"${l}"`).join(', ')}. Prefer "therefore"/"but"; use "and-then" only when there is genuinely no stronger link.
- Keep total duration within the target when one is given.
</rules>

<output_format>
Return ONLY valid JSON, no prose:
{"hookRef": "<ref of first clip>", "order": [{"ref": "<clip ref>", "linkFromPrev": null | "therefore" | "but" | "and-then" | "meanwhile", "reason": "<short>"}], "rationale": "<one sentence>"}
Refs must be exactly the clip refs below. Every clip appears exactly once; the first item's linkFromPrev is null.
</output_format>

<context>
Platform: ${ctx.platform ?? 'unspecified'}. Target duration: ${target}. Language: ${lang}.
</context>

<clips count="${digests.length}">
${clips}
</clips>`;
}

// ─── response parsing ───────────────────────────────────────────

interface RawOrderedItem {
  ref?: unknown;
  linkFromPrev?: unknown;
  reason?: unknown;
}

/** Strip a ```json ... ``` fence if the model added one despite the JSON mime type. */
function stripFence(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1].trim() : t;
}

function asSeamLink(v: unknown): SeamLink | undefined {
  return typeof v === 'string' && (SEAM_LINKS as readonly string[]).includes(v) ? (v as SeamLink) : undefined;
}

/**
 * Parse the LLM response into an OrderingPlan with real Scene ids (mapping the short refs back
 * via the digest). Unknown/duplicate refs are dropped (the validator surfaces coverage). Never
 * throws - returns `{ error }` on malformed JSON so the caller can fall back deterministically.
 */
export function parseOrderingResponse(
  raw: string,
  digests: readonly ClipDigest[],
): { plan?: OrderingPlan; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch (e) {
    return { error: `invalid JSON: ${(e as Error).message}` };
  }
  if (parsed === null || typeof parsed !== 'object') return { error: 'response is not a JSON object' };
  const obj = parsed as { order?: unknown; hookRef?: unknown; rationale?: unknown };
  if (!Array.isArray(obj.order)) return { error: 'response.order is not an array' };

  const refMap = refToSceneIdMap(digests);
  const seen = new Set<string>();
  const order: OrderedItem[] = [];
  for (const rawItem of obj.order as RawOrderedItem[]) {
    const ref = typeof rawItem?.ref === 'string' ? rawItem.ref : undefined;
    if (!ref) continue;
    const sceneId = refMap.get(ref);
    if (!sceneId || seen.has(sceneId)) continue; // unknown or duplicate -> drop
    seen.add(sceneId);
    const item: OrderedItem = { sourceRef: sceneId };
    const link = asSeamLink(rawItem.linkFromPrev);
    if (link) item.linkFromPrev = link;
    if (typeof rawItem.reason === 'string') item.reason = rawItem.reason;
    order.push(item);
  }
  if (order.length === 0) return { error: 'no valid clip refs in response' };

  const plan: OrderingPlan = { order };
  const hookId = typeof obj.hookRef === 'string' ? refMap.get(obj.hookRef) : undefined;
  if (hookId) plan.hookRef = hookId;
  if (typeof obj.rationale === 'string') plan.rationale = obj.rationale;
  return { plan };
}
