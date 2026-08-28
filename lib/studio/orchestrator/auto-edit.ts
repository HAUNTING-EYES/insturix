/**
 * Studio orchestrator — AUTO-EDIT from a media attachment (A2).
 * "Upload footage and just talk" — the bridge that turns a composer media
 * attachment into the real auto-edit pipeline, as a conversation.
 * Creates the project via the engine's own from-asset route, then hands the
 * reel artifact to the client's telemetry polling (no fake percents).
 */

import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";
import { EDIT_DOMAIN_MANIFEST } from "./manifests/edit";

const AUTO_EDIT_TOOL = EDIT_DOMAIN_MANIFEST.tools.find((t) => t.name === "auto_edit_from_script");

export interface AutoEditTurnContext {
  userId: string;
  orgId: string | null;
  assetId: string;
  assetLabel: string;
  brandId?: string | null;
  forwardHeaders: Record<string, string>;
  origin: string;
}

export async function* runAutoEditTurn(ctx: AutoEditTurnContext, text: string, signal?: AbortSignal): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  const tool = AUTO_EDIT_TOOL;
  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: `Cutting a reel from ${ctx.assetLabel} — the pipeline runs, I'll surface what it needs.`,
    steps: [
      { stepId: "ae1", capability: "edit", toolName: tool?.name ?? "auto_edit_from_script", label: "Starting the auto-edit", riskLevel: tool?.riskLevel ?? "high" },
    ],
  };
  yield { type: "step.start", turnId, stepId: "ae1", toolName: tool?.name ?? "auto_edit_from_script", loadingMessage: tool?.loadingMessages[0] };

  let projectId: string | null = null;
  try {
    const res = await fetch(new URL("/api/services/editron/auto-edit/from-asset", ctx.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.forwardHeaders },
      body: JSON.stringify({
        assetId: ctx.assetId,
        title: ctx.assetLabel.replace(/\.[^.]+$/, "").slice(0, 60) || "Studio edit",
        userIntent: text.slice(0, 400),
        ...(ctx.brandId ? { brandId: ctx.brandId } : {}),
      }),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      yield { type: "turn.error", turnId, message: err.error ?? `auto-edit submit failed (${res.status})`, retryable: true, refundIssued: false };
      return;
    }
    const data = (await res.json()) as { projectId?: string; project?: { projectId?: string }; id?: string };
    projectId = data.projectId ?? data.project?.projectId ?? data.id ?? null;
  } catch (error) {
    yield { type: "turn.error", turnId, message: error instanceof Error ? error.message : "auto-edit bridge failed", retryable: true, refundIssued: false };
    return;
  }
  if (!projectId) {
    yield { type: "turn.error", turnId, message: "project id missing from auto-edit response", retryable: true, refundIssued: false };
    return;
  }

  const nowIso = new Date().toISOString();
  const artifact: StudioArtifact = {
    id: `art_ed_${projectId}`,
    kind: "reel",
    status: "running",
    title: ctx.assetLabel.replace(/\.[^.]+$/, "").slice(0, 40) || "Reel",
    sourceRef: { engine: "editron", externalId: projectId, manualHref: `/dashboard/editron/auto-edit/${projectId}` },
    progress: { stage: "analyzing footage · pipeline queued", percent: null },
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };

  yield {
    type: "step.done",
    turnId,
    stepId: "ae1",
    receipt: { label: "Auto edit started", detail: projectId.slice(0, 12), riskLevel: "high", artifactIds: [artifact.id], creditsConsumed: 0 },
  };
  yield {
    type: "turn.done",
    turnId,
    summary: "Auto-edit is running — analyze, cut, captions, music, graphics. I'm watching it; the reel lands here when it's done, and I'll tell you if it needs more footage.",
    creditsConsumedTotal: 0,
    artifactIds: [artifact.id],
    artifactPayload: artifact,
    stageFocus: { artifactId: artifact.id, why: "auto-edit running" },
  };
}
