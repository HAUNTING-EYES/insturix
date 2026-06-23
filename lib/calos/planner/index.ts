import type { PlannerInput, PlannedIdea, PlannerSlot } from "./types";
import { buildPlannerPrompt } from "./prompt";
import { formatsFor } from "./playbook";
import { getGenAI } from "@/lib/editron/utils/gemini-model-factory";

const PLANNER_MODEL = process.env.LLM_PLANNER_MODEL || "gemini-3.1-pro-preview";
const DEFAULT_SEED = 42; // Rule 35: always seed — temperature 0 alone is not deterministic.

/**
 * Propose a batch of on-brand content ideas, one per cadence slot, repurposing current trends
 * where they fit. DRAFT-only: the caller turns these into draft deliverables for human review.
 *
 * Fails loud (R18N) when no Gemini key is configured — the caller surfaces that and degrades to
 * plain cadence auto-fill rather than silently producing nothing.
 */
export async function proposePlan(
  input: PlannerInput,
  opts: { seed?: number; model?: string } = {},
): Promise<PlannedIdea[]> {
  if (!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    throw new Error("AI planner unavailable: set GEMINI_API_KEY (or GOOGLE_API_KEY).");
  }
  if (input.slots.length === 0) return [];

  const genAI = await getGenAI();
  const model = genAI.getGenerativeModel({
    model: opts.model || PLANNER_MODEL,
    generationConfig: {
      temperature: 0,
      seed: opts.seed ?? DEFAULT_SEED,
      responseMimeType: "application/json",
    },
  });

  const prompt = buildPlannerPrompt(input);
  const result = await model.generateContent(prompt);
  const text = result?.response?.text?.() ?? "";
  return parsePlan(text, input.slots);
}

/**
 * Parse + validate the model's JSON, aligning each idea to a real slot by index. The schedule
 * (date/platform) comes from the slot, not the model — the model only supplies title/angle/trend,
 * so it can never corrupt the cadence. Malformed JSON degrades to [] (a bad reply is not an outage).
 */
function parsePlan(text: string, slots: PlannerSlot[]): PlannedIdea[] {
  if (!text) return [];
  let body = text.trim();

  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();

  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];

  let arr: unknown;
  try {
    arr = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const seen = new Set<number>();
  const ideas: PlannedIdea[] = [];
  for (const item of arr) {
    const o = (item ?? {}) as Record<string, unknown>;
    const index = typeof o.index === "number" ? o.index : NaN;
    if (!Number.isInteger(index) || index < 0 || index >= slots.length || seen.has(index)) continue;
    const title = String(o.title ?? "").trim().slice(0, 200);
    if (!title) continue;
    seen.add(index);
    const allowed = formatsFor(slots[index].platform);
    const requested = String(o.format ?? "").trim().toLowerCase();
    const format = allowed.includes(requested) ? requested : allowed[0];
    ideas.push({
      index,
      date: slots[index].date,
      platform: slots[index].platform,
      format,
      title,
      angle: String(o.angle ?? "").trim().slice(0, 300),
      trendTitle:
        typeof o.trendTitle === "string" && o.trendTitle.trim()
          ? o.trendTitle.trim().slice(0, 200)
          : null,
    });
  }
  ideas.sort((a, b) => a.index - b.index);
  return ideas;
}

export { buildPlannerPrompt };
export type { PlannerInput, PlannedIdea, PlannerSlot } from "./types";
