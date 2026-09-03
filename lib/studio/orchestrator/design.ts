/**
 * Studio orchestrator — DESIGN capability (Phase 4b).
 *
 * Real pre-flight quote from creditCosts (model multiplier + generation
 * request-type), the SPEND confirm gate via the confirm registry, and on
 * accept a bridge into Clickatron's session create (FormData, same origin,
 * forwarded auth). The canvas artifact is born queued/streaming — the worker
 * owns generation; we never fake a percent.
 */

import { getCreditCost, getCreditPool } from "@/lib/config/creditCosts";
import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioTurnCostQuote } from "@/lib/studio/contracts/credits";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";
import { DESIGN_DOMAIN_MANIFEST } from "./manifests/design";

const TOOL = (name: string) => {
  const tool = DESIGN_DOMAIN_MANIFEST.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`design manifest missing tool: ${name}`);
  return tool;
};

/** The bridge posts ONE prompt per design turn — the session route bills
 * quantity 1 for plain prompts (only carousel fan-out raises it), and
 * regenerating is a new turn with its own quote. The quote must say exactly
 * that: 1 variation, priced by the SAME resolver the charge path uses. */
const DESIGN_QUANTITY = 1;
const DEFAULT_MODEL = "fal-ai/flux-2/flash";

export interface DesignTurnContext {
  userId: string;
  orgId: string | null;
  brandId?: string | null;
  forwardHeaders: Record<string, string>;
  origin: string;
}

/** Pure — priced via getCreditCost (the exact resolver checkCredits uses),
 * so the card can never disagree with the deduction. */
export function designCanvasQuote(turnId: string, stepId: string, quantity = DESIGN_QUANTITY, modelId = DEFAULT_MODEL): StudioTurnCostQuote {
  const base = getCreditCost("clickatron", "variation", { quantity: 1 });
  const unit = getCreditCost("clickatron", "variation", { model: modelId, quantity: 1 });
  const subtotal = getCreditCost("clickatron", "variation", { model: modelId, quantity });
  return {
    quoteId: "q_design_canvas_v1",
    turnId,
    stepId,
    lines: [
      {
        service: "clickatron",
        action: "variation",
        pool: getCreditPool("clickatron", "variation"),
        unitCost: unit,
        quantity,
        multiplier: unit / base,
        subtotal,
        display: `${quantity} variation${quantity > 1 ? "s" : ""} · ${modelId.split("/").pop()}`,
      },
    ],
    totalByPool: { main: 0, media: subtotal },
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
}

function canvasArtifact(sessionId: string, title: string): StudioArtifact {
  const nowIso = new Date().toISOString();
  return {
    id: `art_cv_${sessionId}`,
    kind: "image_canvas",
    status: "running",
    title,
    sourceRef: { engine: "clickatron", externalId: sessionId, manualHref: `/dashboard/clickatron/lab/${sessionId}` },
    progress: { stage: "generation queued", percent: null },
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

export async function* runDesignTurn(
  ctx: DesignTurnContext,
  text: string,
  signal?: AbortSignal,
  confirmAcceptedQuoteId?: string | null,
): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  const compiler = TOOL("generation-prompt-compiler");
  const job = TOOL("create-image-job");
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  const quantity = DESIGN_QUANTITY;
  const modelId = DEFAULT_MODEL;
  const stepQuote = designCanvasQuote(turnId, "g2", quantity, modelId);

  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: "Designing it — quote first, nothing generates without your yes.",
    steps: [
      { stepId: "g1", capability: "design", toolName: compiler.name, label: compiler.label, riskLevel: compiler.riskLevel },
      { stepId: "g2", capability: "design", toolName: job.name, label: job.label, riskLevel: job.riskLevel, quotedCost: stepQuote.lines[0].subtotal },
    ],
  };

  /* step 1 — brand scope, honest gaps */
  yield { type: "step.start", turnId, stepId: "g1", toolName: compiler.name, loadingMessage: compiler.loadingMessages[0] };
  let brandId = ctx.brandId ?? null;
  if (!brandId) {
    const scopes = await listAuthorizedBrandScopes({ userId: ctx.userId, orgId: ctx.orgId });
    brandId = scopes[0]?.brandId ?? null;
  }
  if (!brandId) {
    yield {
      type: "turn.capability_gap",
      turnId,
      reason: "No brand set up — design is brand-grounded.",
      alternative: { description: "Create a brand in the vault first, then ask again.", proposedSteps: [] },
    };
    return;
  }
  yield { type: "step.done", turnId, stepId: "g1", receipt: { label: compiler.receiptLabel, detail: "brand context baked in", artifactIds: [], creditsConsumed: 0 } };

  /* step 2 — spend gate, then the real bridge */
  yield { type: "step.start", turnId, stepId: "g2", toolName: job.name, loadingMessage: job.loadingMessages[0] };
  if (confirmAcceptedQuoteId && confirmAcceptedQuoteId !== stepQuote.quoteId) {
    yield { type: "turn.error", turnId, message: "Quote changed since you confirmed — the card shows fresh numbers.", retryable: true, refundIssued: false };
    return;
  }
  if (!confirmAcceptedQuoteId) {
    /* serverless-safe: the gate ENDS the stream; the answer re-posts as a
     * continuation turn that re-derives this same quote deterministically. */
    yield {
      type: "turn.confirm_required",
      turnId,
      stepId: "g2",
      kind: "spend",
      quote: JSON.stringify(stepQuote),
      publishTargets: [],
    };
    yield { type: "turn.done", turnId, summary: "Quoted — say yes on the card and I'll generate.", creditsConsumedTotal: 0, artifactIds: [] };
    return;
  }

  const form = new FormData();
  form.set("prompt", text);
  form.set("modelId", modelId);
  form.set("brandId", brandId);
  form.set("aspectRatio", "16:9");

  let sessionId: string | null = null;
  try {
    const res = await fetch(new URL("/api/services/clickatron/session", ctx.origin), {
      method: "POST",
      headers: ctx.forwardHeaders,
      body: form,
      signal,
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      const session = (data.session ?? data) as { id?: string; sessionId?: string };
      sessionId = session.sessionId ?? session.id ?? null;
    } else {
      yield {
        type: "turn.error",
        turnId,
        message: `canvas session failed (${res.status})`,
        retryable: true,
        refundIssued: false,
      };
      return;
    }
  } catch (error) {
    yield {
      type: "turn.error",
      turnId,
      message: error instanceof Error ? error.message : "canvas bridge failed",
      retryable: true,
      refundIssued: false,
    };
    return;
  }

  if (!sessionId) {
    yield { type: "turn.error", turnId, message: "canvas session id missing from response", retryable: true, refundIssued: false };
    return;
  }

  const artifact = canvasArtifact(sessionId, "Canvas");
  yield {
    type: "step.done",
    turnId,
    stepId: "g2",
    receipt: { label: job.receiptLabel, detail: `${quantity} variation${quantity > 1 ? "s" : ""} · queued`, artifactIds: [artifact.id], creditsConsumed: stepQuote.lines[0].subtotal },
  };
  yield {
    type: "turn.done",
    turnId,
    summary: `Canvas is live — 1 variation queued in the media pool. Showing it; the lab link takes over any time.`,
    creditsConsumedTotal: stepQuote.lines[0].subtotal,
    artifactIds: [artifact.id],
    artifactPayload: artifact,
    stageFocus: { artifactId: artifact.id, why: "generation queued" },
  };
}
