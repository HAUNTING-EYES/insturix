import type { StudioArtifact, StudioThreadItem } from "@/lib/studio/contracts/objects";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";

/**
 * Pure replay of persisted spine events into thread items — the reload path.
 * This mirrors the live reducer in components/studio/session.tsx (applyEvent)
 * so a reloaded Project reconstructs the same conversation exactly (plan §3).
 * An UNANSWERED approval gate is likewise reconstructed: replayOpenConfirm
 * derives it from the log so reload re-arms the interactive card and the
 * answer resumes the same operation claim.
 */

export interface ReplayOpenConfirm {
  turnId: string;
  kind: "spend" | "publish" | "destructive";
  operationId: string | null;
  quote: unknown | null;
  publishTargets: Array<{ platform: string; scheduledAt: string }>;
  originalText: string;
  createdAt: string;
}

/** The open approval gate, if the log ends on one: the LAST confirm_required
 *  event with no subsequent user message and no subsequent turn.received
 *  (the resumed turn emits turn.received, which consumes the gate). */
export function replayOpenConfirm(events: PersistedSpineEvent[]): ReplayOpenConfirm | null {
  let open: ReplayOpenConfirm | null = null;
  let lastUserText = "";
  for (const ev of events) {
    if (ev.kind === "user") {
      const p = ev.payload as { text?: string };
      lastUserText = p.text ?? lastUserText;
      open = null; // a new user message supersedes any earlier open gate
      continue;
    }
    if (ev.kind !== "turn.confirm_required") {
      if (ev.kind === "turn.received") open = null; // the gate was answered and the turn resumed
      if (ev.kind === "turn.confirm_declined") open = null; // audit item 5: a decline RESOLVES the gate — no re-arm
      continue;
    }
    const p = ev.payload as {
      turnId?: string;
      kind?: "spend" | "publish" | "destructive";
      operationId?: string;
      quote?: unknown;
      publishTargets?: Array<{ platform: string; scheduledAt: string }>;
    };
    if (!p.turnId || !p.kind) continue;
    open = {
      turnId: p.turnId,
      kind: p.kind,
      operationId: p.operationId ?? null,
      quote: p.quote ?? null,
      publishTargets: p.publishTargets ?? [],
      originalText: lastUserText,
      createdAt: ts(ev),
    };
  }
  return open;
}

export interface PersistedSpineEvent {
  seq: number;
  turnId: string | null;
  actor: "user" | "agent" | "system";
  kind: string;
  payload: unknown;
  createdAt?: string | null;
}

/** Artifacts rebuilt from the persisted log (plan §3 reload): the LAST
 *  in-band artifactPayload per id wins — exactly what the live reducer was
 *  showing when the page went away. Ordered by first appearance.
 *  artifact.selected events (§11 "use this") apply on top in log order. */
export function artifactsFromEvents(events: PersistedSpineEvent[]): StudioArtifact[] {
  const order: string[] = [];
  const byId = new Map<string, StudioArtifact>();
  const select = (artifactId: string, candidateId: string) => {
    const artifact = byId.get(artifactId);
    if (artifact) byId.set(artifactId, { ...artifact, selectedCandidateId: candidateId });
  };
  const planEntry = (artifactId: string, entryId: string, action: string) => {
    const artifact = byId.get(artifactId);
    if (!artifact?.planEntries) return;
    byId.set(artifactId, {
      ...artifact,
      planEntries: artifact.planEntries.map((e) =>
        e.id === entryId ? { ...e, accepted: action === "accept" ? true : e.accepted, removed: action === "remove" ? true : e.removed } : e,
      ),
    });
  };
  for (const ev of events) {
    if (ev.kind === "turn.done") {
      /* a turn may land ONE artifact or SEVERAL (ship receipts) — collect all */
      const payload = ev.payload as { artifactPayload?: StudioArtifact; artifactPayloads?: StudioArtifact[] } | null;
      const landed = [payload?.artifactPayload, ...(payload?.artifactPayloads ?? [])];
      for (const artifact of landed) {
        if (!artifact?.id) continue;
        if (!byId.has(artifact.id)) order.push(artifact.id);
        byId.set(artifact.id, artifact);
      }
      continue;
    }
    if (ev.kind === "artifact.selected") {
      const p = ev.payload as { artifactId?: string; candidateId?: string } | null;
      if (p?.artifactId && p.candidateId) select(p.artifactId, p.candidateId);
      continue;
    }
    if (ev.kind === "plan.entry") {
      const p = ev.payload as { artifactId?: string; entryId?: string; action?: string } | null;
      if (p?.artifactId && p.entryId && p.action) planEntry(p.artifactId, p.entryId, p.action);
      continue;
    }
    const payload = ev.payload as { artifactPayload?: StudioArtifact } | null;
    const artifact = payload?.artifactPayload;
    if (!artifact?.id) continue;
    if (!byId.has(artifact.id)) order.push(artifact.id);
    byId.set(artifact.id, artifact);
  }
  return order.map((id) => byId.get(id) as StudioArtifact);
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
      case "turn.needs_clarification":
        /* audit item 5: the question survives reload — it persisted but was
         * invisible before; as prose it stays in the record (the live card
         * renders while the turn is fresh) */
        items.push({
          kind: "prose",
          id: `${turn.turnId}_clarify`,
          text: `❓ ${turn.question}${turn.options?.length ? ` — ${turn.options.map((o) => o.label).join(" / ")}` : ""}`,
          createdAt: ts(ev),
        });
        break;
      case "turn.capability_gap":
        /* mirror of the live applyEvent: the decline persists as the turn's
         * answer, so a reload keeps the honest record */
        items.push({
          kind: "prose",
          id: `${turn.turnId}_gap`,
          text: `${turn.reason}${turn.alternative ? ` ${turn.alternative.description}` : ""}`,
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
        break; // turn.received / confirm_required / interrupted: transient
    }
  }
  return items;
}
