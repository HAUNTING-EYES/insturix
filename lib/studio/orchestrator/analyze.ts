/**
 * Studio orchestrator — ANALYZE capability (Phase 5).
 *
 * URL teardown via the real Alyzitron analyze bridge. Same serverless-safe
 * spend gate as design: quote ends the stream; the accepted continuation
 * re-derives it. Cost is 2cr/min — quoted as a 1-minute minimum, honestly
 * labeled "from".
 */

import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioTurnCostQuote } from "@/lib/studio/contracts/credits";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";
import { ANALYZE_DOMAIN_MANIFEST } from "./manifests/analyze";

const TOOL = (name: string) => {
  const tool = ANALYZE_DOMAIN_MANIFEST.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`analyze manifest missing tool: ${name}`);
  return tool;
};

const URL_RE = /https?:\/\/[^\s)]+/i;
const COST_PER_MINUTE = 2;

export interface AnalyzeTurnContext {
  userId: string;
  orgId: string | null;
  brandId?: string | null;
  forwardHeaders: Record<string, string>;
  origin: string;
}

function quote(turnId: string): StudioTurnCostQuote {
  return {
    quoteId: `q_${turnId}`,
    turnId,
    stepId: "a1",
    lines: [
      {
        service: "alyzitron",
        action: "analysis",
        pool: "main",
        unitCost: COST_PER_MINUTE,
        quantity: 1,
        multiplier: 1,
        subtotal: COST_PER_MINUTE,
        display: `analysis · from ${COST_PER_MINUTE} cr (2 cr/min)`,
      },
    ],
    totalByPool: { main: COST_PER_MINUTE, media: 0 },
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
}

function analysisArtifact(taskId: string): StudioArtifact {
  const nowIso = new Date().toISOString();
  return {
    id: `art_az_${taskId}`,
    kind: "analysis",
    status: "running",
    title: "Analysis",
    sourceRef: { engine: "alyzitron", externalId: taskId, manualHref: `/dashboard/alyzitron/report/${taskId}` },
    progress: { stage: "queued · transcription + scoring", percent: null },
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

export async function* runAnalyzeTurn(
  ctx: AnalyzeTurnContext,
  text: string,
  signal?: AbortSignal,
  confirmAcceptedQuoteId?: string | null,
): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  const analyze = TOOL("alyzitron/analyze");
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  const url = text.match(URL_RE)?.[0];
  if (!url) {
    yield {
      type: "turn.needs_clarification",
      turnId,
      question: "Which video should I tear down?",
      options: [
        { id: "u1", label: "Paste a link", detail: "YouTube / Instagram / X URL — competitor or reference" },
        { id: "u2", label: "Your own content", detail: "pick something from this deliverable instead" },
      ],
    };
    return;
  }

  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: "Tearing it down — intent-aware, brand-grounded.",
    steps: [{ stepId: "a1", capability: "analyze", toolName: analyze.name, label: analyze.label, riskLevel: analyze.riskLevel, quotedCost: COST_PER_MINUTE }],
  };
  yield { type: "step.start", turnId, stepId: "a1", toolName: analyze.name, loadingMessage: analyze.loadingMessages[0] };

  if (confirmAcceptedQuoteId && confirmAcceptedQuoteId !== quote(turnId).quoteId) {
    yield { type: "turn.error", turnId, message: "Quote changed since you confirmed.", retryable: true, refundIssued: false };
    return;
  }
  if (!confirmAcceptedQuoteId) {
    const q = quote(turnId);
    yield { type: "turn.confirm_required", turnId, stepId: "a1", kind: "spend", quote: JSON.stringify(q), publishTargets: [] };
    yield { type: "turn.done", turnId, summary: "Quoted — confirm on the card and the teardown starts.", creditsConsumedTotal: 0, artifactIds: [] };
    return;
  }

  let brandId = ctx.brandId ?? null;
  if (!brandId) {
    const scopes = await listAuthorizedBrandScopes({ userId: ctx.userId, orgId: ctx.orgId });
    brandId = scopes[0]?.brandId ?? null;
  }

  try {
    const res = await fetch(new URL("/api/services/alyzitron/analyze", ctx.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.forwardHeaders },
      body: JSON.stringify({
        video_url: url,
        context: { contentIntent: "competitor", platform: "Social Media", familyFriendly: true },
        ...(brandId ? { brandId } : {}),
      }),
      signal,
    });
    if (!res.ok) {
      yield { type: "turn.error", turnId, message: `analysis submit failed (${res.status})`, retryable: true, refundIssued: false };
      return;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const taskId =
      (data.taskId as string) ?? (data.id as string) ?? (data.analysisId as string) ?? (data.task as { id?: string })?.id ?? null;
    if (!taskId) {
      yield { type: "turn.error", turnId, message: "analysis id missing from response", retryable: true, refundIssued: false };
      return;
    }
    const artifact = analysisArtifact(taskId);
    yield { type: "step.done", turnId, stepId: "a1", receipt: { label: analyze.receiptLabel, detail: taskId.slice(0, 12), artifactIds: [artifact.id], creditsConsumed: COST_PER_MINUTE } };
    yield {
      type: "turn.done",
      turnId,
      summary: "Teardown queued — transcribing and scoring. The report lands in this deliverable; I'll show it when it's done.",
      creditsConsumedTotal: COST_PER_MINUTE,
      artifactIds: [artifact.id],
      artifactPayload: artifact,
      stageFocus: { artifactId: artifact.id, why: "analysis queued" },
    };
  } catch (error) {
    yield { type: "turn.error", turnId, message: error instanceof Error ? error.message : "analyze bridge failed", retryable: true, refundIssued: false };
  }
}
