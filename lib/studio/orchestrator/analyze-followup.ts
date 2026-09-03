/**
 * Studio orchestrator — ANALYSIS FOLLOW-UP (§14 Phase 8): same-conversation
 * report questions. The answer comes from Alyzitron's chat endpoint, which
 * is bound to the report's own transcription + results — so every answer is
 * grounded in authoritative outputs, never re-derived from vibes. Billing:
 * chat is per-token (sub-credit, 1000-token minimum) — below the spend-gate
 * threshold, so no card; the route charges and refunds on failure itself.
 */

import { listEvents } from "@/lib/studio/persist/db";
import { artifactsFromEvents } from "@/lib/studio/persist/replay";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";

export interface FollowupContext {
  projectId: string | null;
  forwardHeaders: Record<string, string>;
  origin: string;
}

/** Question-shaped text, or explicitly about the report/analysis. Action
 *  verbs ("write/draft/make/ship…") never route here — those are work asks,
 *  even when phrased as questions ("can you write me a script?"). */
export function analysisFollowupIntent(text: string): boolean {
  if (/\b(write|draft|make|create|plan|design|storyboard|ship|retry|schedule|carousel|thumbnail|script|email|post|analyz|teardown)\b/i.test(text)) return false;
  if (/\b(report|teardown|score|analysis)\b.*\b(say|tell|why|weak|strong|improve|fix|mean)\b/i.test(text)) return true;
  return /^(why|how|what|is|are|does|do|can|should|which|where)\b/i.test(text.trim()) || text.includes("?");
}

export async function* runAnalysisFollowupTurn(ctx: FollowupContext, text: string, signal?: AbortSignal): AsyncGenerator<StudioTurnEvent> {
  const turnId = `t_${crypto.randomUUID().slice(0, 8)}`;
  yield { type: "turn.received", turnId, deliverableId: "del_live" };

  if (!ctx.projectId) {
    yield { type: "turn.capability_gap", turnId, reason: "No analysis on this project yet.", alternative: { description: "Drop a competitor URL and I'll tear it down first — then ask anything about the report.", proposedSteps: [] } };
    return;
  }
  const events = await listEvents(ctx.projectId, 0);
  const analysis = [...artifactsFromEvents(events)].reverse().find((a) => a.sourceRef.engine === "alyzitron" && a.sourceRef.externalId);
  if (!analysis) {
    yield { type: "turn.capability_gap", turnId, reason: "No analysis on this project yet.", alternative: { description: "Drop a competitor URL and I'll tear it down first — then ask anything about the report.", proposedSteps: [] } };
    return;
  }
  const taskId = analysis.sourceRef.externalId.split(",")[0];
  let grounding: { videoAnalysis: unknown; videoTitle: string | null } = { videoAnalysis: null, videoTitle: null };

  /* answers bind to AUTHORIZED results — only a completed task can be asked about */
  try {
    const res = await fetch(new URL(`/api/services/alyzitron/analyses/${taskId}`, ctx.origin), { headers: ctx.forwardHeaders, signal });
    if (!res.ok) {
      yield { type: "turn.error", turnId, message: `report unavailable (${res.status})`, retryable: true, refundIssued: false };
      return;
    }
    const task = (await res.json()) as { status?: string; results?: unknown; videoUrl?: string; videoTitle?: string };
    if (task.status !== "completed") {
      yield { type: "turn.done", turnId, summary: `The report isn't finished yet (${task.status ?? "processing"}) — ask again the moment it lands.`, creditsConsumedTotal: 0, artifactIds: [] };
      return;
    }
    /* grounding: hand the chat the FULL analysis payload — answers quote
     * scores/sections, not just the transcript */
    grounding = { videoAnalysis: task.results ?? null, videoTitle: task.videoTitle ?? task.videoUrl ?? null };
  } catch (error) {
    yield { type: "turn.error", turnId, message: error instanceof Error ? error.message : "report check failed", retryable: true, refundIssued: false };
    return;
  }

  yield {
    type: "turn.plan",
    turnId,
    planId: `${turnId}_p`,
    summary: "Asking the report — grounded in its own transcript and scores.",
    steps: [{ stepId: "f1", capability: "analyze", toolName: "ask-about-report", label: "Answer from the report", riskLevel: "read" }],
  };
  yield { type: "step.start", turnId, stepId: "f1", toolName: "ask-about-report" };

  try {
    const res = await fetch(new URL("/api/services/alyzitron/chat", ctx.origin), {
      method: "POST",
      headers: { "content-type": "application/json", ...ctx.forwardHeaders },
      body: JSON.stringify({ taskId, message: text, ...grounding }),
      signal,
    });
    if (!res.ok || !res.body) {
      yield { type: "turn.error", turnId, message: `report chat failed (${res.status})`, retryable: true, refundIssued: false };
      return;
    }
    /* SSE frames: {type:"chunk", text} — collected server-side, answered in one prose block */
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let failed: string | null = null;
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim()) as { type?: string; text?: string; message?: string };
          if (payload.type === "chunk" && payload.text) answer += payload.text;
          if (payload.type === "error") {
            failed = payload.message ?? "report chat errored";
            break outer;
          }
        } catch {
          /* skip malformed frame */
        }
      }
    }
    if (failed || !answer.trim()) {
      yield { type: "turn.error", turnId, message: failed ?? "the report had no answer", retryable: true, refundIssued: false };
      return;
    }
    yield { type: "step.done", turnId, stepId: "f1", receipt: { label: "answered from the report", detail: `task ${taskId.slice(0, 10)}`, artifactIds: [], creditsConsumed: 0 } };
    yield { type: "turn.done", turnId, summary: answer.trim(), creditsConsumedTotal: 0, artifactIds: [] };
  } catch (error) {
    yield { type: "turn.error", turnId, message: error instanceof Error ? error.message : "report chat bridge failed", retryable: true, refundIssued: false };
  }
}
