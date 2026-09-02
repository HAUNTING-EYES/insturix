import type { StudioThreadItem } from "@/lib/studio/contracts/objects";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";

/**
 * Pure replay of persisted spine events into thread items — the reload path.
 * This mirrors the live reducer in components/studio/session.tsx (applyEvent)
 * so a reloaded Project reconstructs the same conversation exactly (plan §3).
 * pendingConfirm is deliberately not replayed: an unanswered gate mid-turn is
 * a Phase 2 decision request, not a durable thread item.
 */

export interface PersistedSpineEvent {
  seq: number;
  turnId: string | null;
  actor: "user" | "agent" | "system";
  kind: string;
  payload: unknown;
  createdAt?: string | null;
}

function ts(ev: PersistedSpineEvent): string {
  return ev.createdAt ?? new Date().toISOString();
}

export function replayEventsToItems(events: PersistedSpineEvent[]): StudioThreadItem[] {
  let items: StudioThreadItem[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind === "user") {
      const p = ev.payload as { id?: string; text?: string; attachments?: unknown[]; mentions?: unknown[] };
      items.push({
        kind: "user",
        id: p.id ?? `u_replay_${ev.seq}`,
        text: p.text ?? "",
        attachments: (p.attachments ?? []) as never,
        mentions: (p.mentions ?? []) as never,
        createdAt: ts(ev),
      });
      continue;
    }
    if (ev.kind === "prose") {
      const p = ev.payload as { id?: string; text?: string };
      items.push({ kind: "prose", id: p.id ?? `prose_replay_${ev.seq}`, text: p.text ?? "", createdAt: ts(ev) });
      continue;
    }
    const turn = ev.payload as StudioTurnEvent;
    switch (turn?.type) {
      case "turn.plan":
        items.push({
          kind: "plan",
          id: turn.planId,
          turnId: turn.turnId,
          summary: turn.summary,
          steps: turn.steps.map((s) => ({
            id: s.stepId,
            capability: s.capability,
            toolName: s.toolName,
            label: s.label,
            riskLevel: s.riskLevel,
            state: "pending",
          })),
          createdAt: ts(ev),
        });
        break;
      case "step.start":
      case "step.progress":
        items = items.map((it) =>
          it.kind === "plan" && it.turnId === turn.turnId
            ? { ...it, steps: it.steps.map((s) => (s.id === turn.stepId ? { ...s, state: "running" as const } : s)) }
            : it,
        );
        break;
      case "step.done":
        items = items.map((it) =>
          it.kind === "plan" && it.turnId === turn.turnId
            ? { ...it, steps: it.steps.map((s) => (s.id === turn.stepId ? { ...s, state: "done" as const } : s)) }
            : it,
        );
        items.push({
          kind: "receipt",
          id: `${turn.turnId}_${turn.stepId}_rc`,
          label: turn.receipt.label,
          riskLevel: turn.receipt.riskLevel,
          detail: turn.receipt.detail,
          creditsConsumed: turn.receipt.creditsConsumed,
          createdAt: ts(ev),
        });
        break;
      case "step.error":
        items = items.map((it) =>
          it.kind === "plan" && it.turnId === turn.turnId
            ? { ...it, steps: it.steps.map((s) => (s.id === turn.stepId ? { ...s, state: "error" as const } : s)) }
            : it,
        );
        break;
      case "turn.error":
        items.push({
          kind: "prose",
          id: `err_${turn.turnId}_${ev.seq}`,
          text: `${turn.message}${turn.refundIssued ? " · credits refunded" : ""}${turn.retryable ? " — try again" : ""}`,
          createdAt: ts(ev),
        });
        break;
      case "turn.ideas":
        items.push({
          kind: "ideas",
          id: `ideas_${turn.turnId}`,
          turnId: turn.turnId,
          ideas: turn.ideas,
          createdAt: ts(ev),
        });
        break;
      case "turn.done":
        items.push({ kind: "prose", id: `${turn.turnId}_done`, text: turn.summary, createdAt: ts(ev) });
        items.push({
          kind: "quick_replies",
          id: `${turn.turnId}_qr`,
          options: ["shorten it", "punch up the hook", "make it a carousel"],
          createdAt: ts(ev),
        });
        break;
      default:
        break; // turn.received / confirm_required / capability_gap / interrupted: transient
    }
  }
  return items;
}
