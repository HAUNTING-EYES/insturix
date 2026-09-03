/**
 * Studio orchestrator — STORYBOARD capability (Phase 5).
 *
 * A "storyboard this" command in a Project conversation: parse the user's
 * scene beats, quote the per-scene image cost with the SAME resolver the
 * pipeline generate route charges (getCreditCost pipeline.storyboard_image_generation
 * × scenes), gate on the SPEND confirm, then bridge into the pipeline's
 * batch generate. Scene images generate in the QStash worker — the artifact
 * is born running and the stage polls the real storyboard record.
 */

import { getCreditCost, getCreditPool } from "@/lib/config/creditCosts";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioTurnCostQuote } from "@/lib/studio/contracts/credits";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";
import { planStoryboardScenes, storyboardIntent, type PlannedScene } from "./storyboard-scenes";

export interface StoryboardTurnContext {
  userId: string;
  orgId: string | null;
  forwardHeaders: Record<string, string>;
  origin: string;
}

export function storyboardTurnIntent(text: string): boolean {
  return storyboardIntent(text);
}

/** Card == charge: the generate route deducts
 *  getCreditCost(pipeline, storyboard_image_generation, {model: undefined, quantity: scenes}). */
export function storyboardQuote(turnId: string, stepId: string, sceneCount: number): StudioTurnCostQuote {
  const unit = getCreditCost("pipeline", "storyboard_image_generation", { quantity: 1 });
  const subtotal = getCreditCost("pipeline", "storyboard_image_generation", { quantity: sceneCount });
  return {
    quoteId: "q_storyboard_v1",
    turnId,
    stepId,
    lines: [
      {
        service: "pipeline",
        action: "storyboard_image_generation",
        pool: getCreditPool("pipeline", "storyboard_image_generation"),
        unitCost: unit,
        quantity: sceneCount,
        multiplier: 1,
        subtotal,
        display: `${sceneCount} scene${sceneCount > 1 ? "s" : ""} · storyboard images`,
      },
    ],
    totalByPool: { main: 0, media: subtotal },
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
}

function storyboardArtifact(storyboardId: string, sceneCount: number): StudioArtifact {
  const nowIso = new Date().toISOString();
  return {
    id: `art_sb_${storyboardId}`,
    kind: "storyboard",
    status: "running",
    title: "Storyboard",
    sourceRef: { engine: "pipeline", externalId: storyboardId, manualHref: `/dashboard/storyboard/${storyboardId}` },
    progress: { stage: `scenes 0/${sceneCount}`, percent: null },
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

export async function* runStoryboardTurn(
  ctx: StoryboardTurnContext,
  text: string,
  signal?: AbortSignal,
  confirmAcceptedQuoteId?: string | null,
): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  /* scene beats come from the user — a storyboard ask without them asks */
  const plan = planStoryboardScenes(text);
  if ("need" in plan) {
    yield {
      type: "turn.needs_clarification",
      turnId,
      question: "A storyboard is 2–20 scenes. Give me one line per scene — what we see and say in each — and I'll board it.",
      options: [{ id: "type_beats", label: "I'll type the scene beats" }],
    };
    return;
  }
  const scenes: PlannedScene[] = plan.scenes;
  const stepQuote = storyboardQuote(turnId, "sb1", scenes.length);

  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: "Boarding it — quote first, nothing generates without your yes.",
    steps: [
      { stepId: "sb1", capability: "design", toolName: "storyboard-batch", label: `Generate ${scenes.length} scene images`, riskLevel: "high", quotedCost: stepQuote.lines[0].subtotal },
    ],
  };
  yield { type: "step.start", turnId, stepId: "sb1", toolName: "storyboard-batch", loadingMessage: "waiting on your yes — nothing is generating yet" };

  if (confirmAcceptedQuoteId && confirmAcceptedQuoteId !== stepQuote.quoteId) {
    yield { type: "turn.error", turnId, message: "Quote changed since you confirmed — the card shows fresh numbers.", retryable: true, refundIssued: false };
    return;
  }
  if (!confirmAcceptedQuoteId) {
    yield { type: "turn.confirm_required", turnId, stepId: "sb1", kind: "spend", quote: JSON.stringify(stepQuote), publishTargets: [] };
    yield { type: "turn.done", turnId, summary: "Quoted — say yes on the card and I'll board the scenes.", creditsConsumedTotal: 0, artifactIds: [] };
    return;
  }

  let storyboardId: string | null = null;
  let creditsDeducted: number | null = null;
  try {
    const res = await fetch(new URL("/api/services/pipeline/storyboard/generate", ctx.origin), {
      method: "POST",
      headers: { "content-type": "application/json", ...ctx.forwardHeaders },
      body: JSON.stringify({ scenes }),
      signal,
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean; storyboardId?: string; creditsDeducted?: number; error?: string } | null;
    if (!res.ok || !data?.success || !data.storyboardId) {
      yield { type: "turn.error", turnId, message: `storyboard batch failed (${res.status}${data?.error ? `: ${data.error}` : ""})`, retryable: res.status >= 500 || res.status === 429, refundIssued: false };
      return;
    }
    storyboardId = data.storyboardId;
    creditsDeducted = data.creditsDeducted ?? stepQuote.lines[0].subtotal;
  } catch (error) {
    yield { type: "turn.error", turnId, message: error instanceof Error ? error.message : "storyboard bridge failed", retryable: true, refundIssued: false };
    return;
  }

  const artifact = storyboardArtifact(storyboardId, scenes.length);
  yield {
    type: "step.done",
    turnId,
    stepId: "sb1",
    receipt: { label: "scene images queued", detail: `${scenes.length} scenes · generating in the pipeline`, artifactIds: [artifact.id], creditsConsumed: creditsDeducted },
  };
  yield {
    type: "turn.done",
    turnId,
    summary: `Storyboard is live — ${scenes.length} scenes generating. The board fills in as images land.`,
    creditsConsumedTotal: creditsDeducted,
    artifactIds: [artifact.id],
    artifactPayload: artifact,
    stageFocus: { artifactId: artifact.id, why: "scene images generating" },
  };
}
