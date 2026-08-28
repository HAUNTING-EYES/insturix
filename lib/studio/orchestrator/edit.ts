/**
 * Studio orchestrator — EDIT capability (Phase 3).
 *
 * Bridges the vibe turn protocol onto the LIVE Editron agent stream
 * (chat/stream SSE: token | tool_start | tool_end | done | error). All tool
 * metadata — labels, risk, receipt strings, loading messages — resolves
 * through the edit domain manifest, never hardcoded here.
 *
 * This is a transitional bridge: it forwards the engine's own HTTP endpoint
 * with the caller's Clerk session. When the backend rewrite exposes direct
 * orchestrator-grade calls, only this file changes — plans, manifests, and
 * the UI stay untouched.
 */

import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioArtifact } from "@/lib/studio/contracts/objects";
import { EDIT_DOMAIN_MANIFEST } from "./manifests/edit";

export interface EditTurnContext {
  userId: string;
  orgId: string | null;
  /** editron project id — the reel artifact's sourceRef.externalId */
  projectId: string;
  /** forwarded auth for the engine bridge */
  forwardHeaders: Record<string, string>;
  origin: string;
}

const EDIT_TOOL = (name: string) => EDIT_DOMAIN_MANIFEST.tools.find((t) => t.name === name);

function reelArtifact(projectId: string, title: string): StudioArtifact {
  const nowIso = new Date().toISOString();
  return {
    id: `art_ed_${projectId}`,
    kind: "reel",
    status: "done",
    title,
    sourceRef: { engine: "editron", externalId: projectId, manualHref: `/dashboard/editron/project/${projectId}` },
    revisions: [],
    updatedAt: nowIso,
    createdAt: nowIso,
  };
}

interface EngineEvent {
  type?: string;
  [key: string]: unknown;
}

export async function* runEditTurn(ctx: EditTurnContext, text: string, signal?: AbortSignal): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  const agentTool = EDIT_TOOL("apply_editorial_intent");
  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: "Editing — the agent picks its tools as it works.",
    steps: [
      {
        stepId: "e1",
        capability: "edit",
        toolName: agentTool?.name ?? "apply_editorial_intent",
        label: "Editing the reel",
        riskLevel: agentTool?.riskLevel ?? "high",
      },
    ],
  };
  yield { type: "step.start", turnId, stepId: "e1", toolName: agentTool?.name ?? "apply_editorial_intent", loadingMessage: agentTool?.loadingMessages[0] };

  const res = await fetch(new URL("/api/services/editron/chat/stream", ctx.origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ctx.forwardHeaders },
    body: JSON.stringify({
      message: text,
      projectId: ctx.projectId,
      operationId: crypto.randomUUID(),
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    yield { type: "turn.error", turnId, message: `editron stream unavailable (${res.status})`, retryable: true, refundIssued: false };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tokenCount = 0;
  let toolsUsed = 0;
  let lastProgressAt = 0;

  const handleFrame = function* (ev: EngineEvent): Generator<StudioTurnEvent> {
    const type = ev.type;
    if (type === "tool_start" || type === "tool_end") {
      const name = String(ev.toolName ?? ev.tool ?? ev.name ?? "");
      const meta = name ? EDIT_TOOL(name) : undefined;
      if (type === "tool_start") {
        toolsUsed++;
        yield { type: "step.progress", turnId, stepId: "e1", stage: meta ? `${meta.label.toLowerCase()} · ${name}` : name, percent: null };
      } else {
        /* one receipt per engine tool, from the manifest's literal label */
        yield {
          type: "step.done",
          turnId,
          stepId: "e1",
          receipt: { label: meta?.receiptLabel ?? (name || "Tool ran"), riskLevel: meta?.riskLevel, artifactIds: [], creditsConsumed: 0 },
        };
      }
    } else if (type === "token") {
      tokenCount++;
      if (Date.now() - lastProgressAt > 600) {
        lastProgressAt = Date.now();
        yield { type: "step.progress", turnId, stepId: "e1", stage: `editing · ${tokenCount} tokens`, percent: null };
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim()) as EngineEvent;
            yield* handleFrame(ev);
            if (ev.type === "error") {
              yield { type: "turn.error", turnId, message: String(ev.message ?? "edit failed"), retryable: true, refundIssued: false };
              return;
            }
            if (ev.type === "done") {
              const artifact = reelArtifact(ctx.projectId, "Reel");
              yield {
                type: "turn.done",
                turnId,
                summary: `Done — ${toolsUsed} tool call${toolsUsed === 1 ? "" : "s"} on the reel. Showing it.`,
                creditsConsumedTotal: 0,
                artifactIds: [artifact.id],
                artifactPayload: artifact,
                stageFocus: { artifactId: artifact.id, why: "just edited" },
              };
              return;
            }
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
    /* stream ended without a done frame — still close the turn honestly */
    const artifact = reelArtifact(ctx.projectId, "Reel");
    yield {
      type: "turn.done",
      turnId,
      summary: `Stream closed — ${toolsUsed} tool call${toolsUsed === 1 ? "" : "s"} ran. Showing the reel.`,
      creditsConsumedTotal: 0,
      artifactIds: [artifact.id],
      artifactPayload: artifact,
      stageFocus: { artifactId: artifact.id, why: "edited" },
    };
  } finally {
    reader.releaseLock();
  }
}
