/**
 * SaaS Explainer — narration-led VO writer (Part A of the VO redesign; see memory saas-explainer-vo-architecture).
 *
 * The pros are narration-LED, not scene-led: write ONE flowing voiceover first (the "radio edit" — validate the
 * story as continuous audio), then hang scenes on it. This module replaces the scenes-first chain (ScriptDraftAgent
 * doc → parseScriptWithLLM re-segment, which produced patchy per-scene VO) with: the director's beat sequence is the
 * STRUCTURE, and `writeFlowingVoScript` authors one coherent VO whose lines are assigned to those beats. A beat may
 * be left with an empty line ONLY as a deliberate visual hold; the audio-treatment resolver then formalizes silence.
 *
 * EVAL-GATED (Rule 35): the prompt here must pass `scripts/prompt-optimization/eval-explainer-vo.mjs` before it goes
 * live. It is wired behind the `SAAS_EXPLAINER_NARRATION_LED` flag so it cannot ship un-evaled. The pure assembler
 * (`voLinesToStoryboard`) and the word-budget math are deterministic and unit-tested independently of the LLM.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { DEFAULT_CONFIG } from "@/lib/editron/config/editron-config";
import type { SceneDescriptor } from "@/lib/pipeline/schemas/storyboard";

// ── Timing model (research-grounded — see saas-explainer-vo-architecture) ──────────────────────────────────
// Explainer VO runs ~130-150 wpm ≈ 2.3 words/sec; pros narrate ~70-85% of the runtime (the rest are music beats).
export const VO_WORDS_PER_SEC = 2.3;
const VO_COVERAGE_TARGET = 0.8;
const MIN_VO_SCENE_SEC = 2.6; // matches the render's silent-hold floor (glm-voice-fit.py)

/** Total spoken-word budget for a flowing VO across the whole video (deliberate breathing room, not wall-to-wall). */
export function voWordBudget(totalDurationSec: number): number {
  return Math.max(20, Math.round(totalDurationSec * VO_WORDS_PER_SEC * VO_COVERAGE_TARGET));
}

/** Estimate how long a spoken line holds the screen (its own read time, floored so short lines still breathe). */
export function estimateVoDurationSec(vo: string): number {
  const words = vo.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(MIN_VO_SCENE_SEC, words / VO_WORDS_PER_SEC);
}

export interface VoScriptBeat {
  index: number;
  family: string;
  copyRole: string;
  directorNotes?: string[];
  durationSec: number;
}

export interface WriteFlowingVoScriptArgs {
  beats: VoScriptBeat[];
  totalDurationSec: number;
  brandContextPrompt?: string;
  productEvidencePrompt?: string;
  sourceMaterial?: string;
  /** Override the generation seed (the eval harness varies this across runs; production uses the default). */
  seed?: number;
}

export interface FlowingVoScript {
  /** One entry per beat, aligned by `index`. `vo` may be "" for a deliberate visual/silent hold. */
  lines: Array<{ index: number; vo: string }>;
}

const VoScriptSchema = z.object({
  beats: z
    .array(
      z.object({
        index: z.number().int().describe("The beat number this line belongs to (matches the numbered beats)."),
        vo: z
          .string()
          .describe(
            "The spoken voiceover for this beat — the words a voice actor reads aloud, continuing naturally from " +
              'the previous beat. Empty string "" ONLY if this beat is a deliberate wordless visual hold.',
          ),
      }),
    )
    .describe("One entry per beat, in order."),
});

function getGeminiProvider() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("No Gemini API key found (GEMINI_API_KEY or GOOGLE_API_KEY)");
  return createGoogleGenerativeAI({ apiKey });
}

/**
 * Author one flowing voiceover across the director's beats. Narration-led: the whole VO is written to read as
 * continuous audio, then split across beats. Grounded — only facts present in the brand/evidence/source context.
 */
export async function writeFlowingVoScript(args: WriteFlowingVoScriptArgs): Promise<FlowingVoScript> {
  const { beats, totalDurationSec, brandContextPrompt, productEvidencePrompt, sourceMaterial } = args;
  const budget = voWordBudget(totalDurationSec);
  const google = getGeminiProvider();
  const model = (google as unknown as (id: string, opts: { structuredOutputs: boolean }) => unknown)(
    DEFAULT_CONFIG.aiModels.sceneParserModel,
    { structuredOutputs: true },
  );

  const beatBlock = beats
    .map((b) => {
      const notes = (b.directorNotes ?? []).filter(Boolean).join(" ");
      return `Beat ${b.index} — ${b.family} (${b.copyRole}), ~${Math.round(b.durationSec)}s.${notes ? ` Notes: ${notes}` : ""}`;
    })
    .join("\n");

  const groundingBlocks = [
    brandContextPrompt ? `<brand_context>\n${brandContextPrompt}\n</brand_context>` : "",
    productEvidencePrompt ? `<product_evidence>\n${productEvidencePrompt}\n</product_evidence>` : "",
    sourceMaterial ? `<source_material>\n${sourceMaterial}\n</source_material>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { geminiRetry } = await import("@/lib/pipeline/gemini-retry");
  const { object } = await geminiRetry(
    () =>
      generateObject({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: model as any,
        schema: VoScriptSchema,
        temperature: 0.4,
        seed: args.seed ?? 1, // Rule 35: temperature alone is not deterministic; eval harness varies this.
        abortSignal: AbortSignal.timeout(120_000),
        prompt: `<role>
You are a senior SaaS explainer voiceover writer. You write the SPOKEN NARRATION for a short product video.
</role>

<task>
Write ONE flowing voiceover for a ${Math.round(totalDurationSec)}-second SaaS explainer, then split it across the
numbered beats in <beats>. The whole thing must read as continuous narration when the lines are played in order —
not disconnected per-scene fragments. Return the spoken line for each beat.
</task>

<rules>
- GROUNDED: use ONLY facts present in <brand_context>, <product_evidence>, or <source_material>. Never invent
  metrics, customer names, integrations, prices, or claims. If proof is thin, be specific through the audience's
  problem, the workflow, and concrete product actions — not fabricated numbers.
- CONTINUOUS: each beat's line continues naturally from the previous one. Read top-to-bottom, it is one script.
- WORD BUDGET: about ${budget} spoken words TOTAL across all beats (deliberate breathing room — do NOT pad to fill
  every second). Roughly ${VO_WORDS_PER_SEC} words per second of a narrated beat.
- SILENCE IS ALLOWED, SPARINGLY: a beat may have an empty "" line ONLY if it is a pure visual hold that reads
  without words (a cold-open image, a UI-proof beat, a logo/tagline punch). Never leave an explanatory beat silent.
- The final CTA beat MUST have a spoken line.
- Match the brand voice in <brand_context>. Plain, confident, human. No filler ("in today's fast-paced world",
  "game-changing", "seamless", "unlock", "leverage").
- Output every beat's index exactly once.
</rules>

<beats>
${beatBlock}
</beats>

${groundingBlocks}`,
      }),
    { label: "explainer-vo-script", maxRetries: 2 },
  );

  // Align to the beat list by index; a beat the model omitted becomes an (intended-or-not) silent hold.
  const byIndex = new Map<number, string>();
  for (const b of object.beats) byIndex.set(b.index, (b.vo || "").trim());
  const lines = beats.map((b) => ({ index: b.index, vo: byIndex.get(b.index) ?? "" }));
  return { lines };
}

/** A short human title for a beat, for the editable script screen (the VO writer returns words, not titles). */
export function titleForBeat(beat: VoScriptBeat): string {
  const label = (beat.copyRole || beat.family || `Scene ${beat.index + 1}`)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Deterministically assemble a storyboard (SceneDescriptor[]) from the director beats + the flowing VO lines, so the
 * rest of the plan pipeline (audio-treatment resolver, toScriptPlanScene) runs unchanged. Narration-led timing: a
 * spoken beat's duration is fitted to its line's read time; a wordless beat keeps the director's planned duration.
 */
export function voLinesToStoryboard(
  beats: VoScriptBeat[],
  lines: Array<{ index: number; vo: string }>,
): SceneDescriptor[] {
  const voByIndex = new Map<number, string>();
  for (const l of lines) voByIndex.set(l.index, (l.vo || "").trim());

  return beats.map((beat, order) => {
    const vo = voByIndex.get(beat.index) ?? "";
    const durationSeconds = vo ? estimateVoDurationSec(vo) : Math.max(MIN_VO_SCENE_SEC, beat.durationSec);
    return {
      sceneIndex: order,
      title: titleForBeat(beat),
      narration: vo,
      visualDescription: (beat.directorNotes ?? []).filter(Boolean).join(" ") || `${beat.family} beat`,
      durationSeconds,
      mood: "focused",
    } satisfies SceneDescriptor;
  });
}
