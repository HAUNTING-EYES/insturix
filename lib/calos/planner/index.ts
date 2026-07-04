import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from "@/lib/financials/provider-cost-events";
import type { PlannerInput, PlannedIdea, PlannerSlot } from "./types";
import { buildPlannerPrompt } from "./prompt";
import { formatsFor } from "./playbook";
import { isFunnelStage } from "../campaign-intent";
import { extractJsonArray } from "../llm-json";
import { getGenAI } from "@/lib/editron/utils/gemini-model-factory";

export const DEFAULT_PLANNER_MODEL = "gemini-3.1-flash-lite";
const PLANNER_MODEL = process.env.LLM_PLANNER_MODEL || DEFAULT_PLANNER_MODEL;
const DEFAULT_SEED = 42; // Rule 35: always seed - temperature 0 alone is not deterministic.

type CalosPlannerUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/**
 * Propose a batch of on-brand content ideas, one per cadence slot, repurposing current trends
 * where they fit. DRAFT-only: the caller turns these into draft deliverables for human review.
 *
 * Fails loud (R18N) when no Gemini key is configured - the caller surfaces that and degrades to
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

  const modelName = opts.model || PLANNER_MODEL;
  const prompt = buildPlannerPrompt(input);
  const startedAt = Date.now();
  try {
    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() ?? "";
    const ideas = parsePlan(text, input.slots);
    await recordCalosPlannerCost(input, {
      status: "success",
      modelName,
      promptChars: prompt.length,
      outputChars: text.length,
      resultCount: ideas.length,
      functionMs: Date.now() - startedAt,
      usage: readGeminiUsage(result),
    });
    return ideas;
  } catch (error) {
    await recordCalosPlannerCost(input, {
      status: "failed",
      modelName,
      promptChars: prompt.length,
      functionMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}

async function recordCalosPlannerCost(
  input: PlannerInput,
  event: {
    status: ProviderCostEventStatus;
    modelName: string;
    promptChars?: number;
    outputChars?: number;
    resultCount?: number;
    functionMs?: number;
    usage?: CalosPlannerUsage;
    error?: unknown;
  },
) {
  const inputTokens = event.usage?.inputTokens ?? estimateTokensFromChars(event.promptChars);
  const outputTokens = event.usage?.outputTokens ?? estimateTokensFromChars(event.outputChars);
  await recordProviderCostEvent({
    status: event.status,
    service: "calos",
    action: "ai_plan",
    route: "lib/calos/planner",
    provider: "gemini",
    model: cleanGeminiModelName(event.modelName),
    operation: "ai_plan",
    units: {
      requestCount: 1,
      inputTokens,
      outputTokens,
      totalTokens: event.usage?.totalTokens ?? sumOptional(inputTokens, outputTokens),
      functionMs: event.functionMs,
    },
    metadata: {
      providerName: "gemini",
      slotCount: input.slots.length,
      trendCount: input.trends.length,
      platformCount: new Set(input.slots.map((slot) => slot.platform)).size,
      existingIdeaCount: input.existingIdeas?.length,
      resultCount: event.resultCount,
      outputChars: event.outputChars,
      objective: input.objective,
      hasBrandName: Boolean(input.brandName),
      hasBrandContext: Boolean(input.brandContext),
      hasTheme: Boolean(input.theme),
      hasGoal: Boolean(input.goal),
      errorClass: event.error instanceof Error ? event.error.name : event.error ? typeof event.error : undefined,
    },
  });
}

function readGeminiUsage(result: unknown): CalosPlannerUsage | undefined {
  const resultRecord = asRecord(result);
  const responseRecord = asRecord(resultRecord?.response);
  const usage = asRecord(resultRecord?.usageMetadata) ?? asRecord(responseRecord?.usageMetadata);
  if (!usage) return undefined;

  const inputTokens = readNumber(usage.promptTokenCount ?? usage.inputTokenCount);
  const outputTokens = readNumber(usage.candidatesTokenCount ?? usage.outputTokenCount);
  const totalTokens = readNumber(usage.totalTokenCount);
  return inputTokens || outputTokens || totalTokens ? { inputTokens, outputTokens, totalTokens } : undefined;
}

function estimateTokensFromChars(chars?: number): number | undefined {
  return typeof chars === "number" && Number.isFinite(chars) && chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : undefined;
}

function sumOptional(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function cleanGeminiModelName(modelName: string): string {
  return modelName.replace(/^models\//, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Parse + validate the model's JSON, aligning each idea to a real slot by index. The schedule
 * (date/platform) comes from the slot, not the model - the model only supplies title/angle/trend,
 * so it can never corrupt the cadence. Malformed JSON degrades to [] (a bad reply is not an outage).
 */
function parsePlan(text: string, slots: PlannerSlot[]): PlannedIdea[] {
  const arr = extractJsonArray(text);

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
    const fs = String(o.funnelStage ?? "").trim().toLowerCase();
    const funnelStage = isFunnelStage(fs) ? fs : "tofu";
    ideas.push({
      index,
      date: slots[index].date,
      platform: slots[index].platform,
      format,
      funnelStage,
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
