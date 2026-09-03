import { describe, expect, it } from "vitest";
import { artifactsFromEvents, replayEventsToItems, replayOpenConfirm, type PersistedSpineEvent } from "@/lib/studio/persist/replay";

const ev = (seq: number, kind: string, payload: unknown, createdAt = `2026-09-02T10:00:${String(seq).padStart(2, "0")}Z`): PersistedSpineEvent => ({
  seq,
  turnId: kind === "user" || kind === "prose" ? null : "t1",
  actor: kind === "user" ? "user" : kind === "prose" ? "agent" : "system",
  kind,
  payload,
  createdAt,
});

describe("replayEventsToItems — the reload path (plan §3: same conversation, exactly)", () => {
  it("replays a full turn lifecycle into the same items the live reducer produces", () => {
    const items = replayEventsToItems([
      ev(1, "user", { kind: "user", id: "u1", text: "make a launch reel", attachments: [], mentions: [] }),
      ev(2, "turn.received", { type: "turn.received", turnId: "t1", deliverableId: "proj_x" }),
      ev(3, "turn.plan", { type: "turn.plan", turnId: "t1", planId: "p1", summary: "on it", steps: [{ stepId: "s1", capability: "write", toolName: "thinkforge", label: "write script", riskLevel: "low" }] }),
      ev(4, "step.start", { type: "step.start", turnId: "t1", stepId: "s1", toolName: "thinkforge" }),
      ev(5, "step.progress", { type: "step.progress", turnId: "t1", stepId: "s1", stage: "drafting", percent: null }),
      ev(6, "step.done", { type: "step.done", turnId: "t1", stepId: "s1", receipt: { label: "script drafted", riskLevel: "low", creditsConsumed: 5, artifactIds: [] } }),
      ev(7, "turn.done", { type: "turn.done", turnId: "t1", summary: "script ready", creditsConsumedTotal: 5, artifactIds: [] }),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "plan", "receipt", "prose", "quick_replies"]);
    const plan = items[1];
    if (plan.kind !== "plan") throw new Error("expected plan");
    expect(plan.steps[0]?.state).toBe("done"); // start/progress/done transitions replayed
    const receipt = items[2];
    if (receipt.kind !== "receipt") throw new Error("expected receipt");
    expect(receipt.label).toBe("script drafted");
    expect(receipt.creditsConsumed).toBe(5);
    const summary = items[3];
    if (summary.kind !== "prose") throw new Error("expected prose");
    expect(summary.text).toBe("script ready");
  });

  it("replays step.error and turn.error honestly", () => {
    const items = replayEventsToItems([
      ev(1, "turn.plan", { type: "turn.plan", turnId: "t1", planId: "p1", summary: "s", steps: [{ stepId: "s1", capability: "write", toolName: "tf", label: "l", riskLevel: "low" }] }),
      ev(2, "step.error", { type: "step.error", turnId: "t1", stepId: "s1", message: "engine down", retryable: true, refundIssued: true }),
      ev(3, "turn.error", { type: "turn.error", turnId: "t1", message: "failed", retryable: true, refundIssued: true }),
    ]);
    const plan = items[0];
    if (plan.kind !== "plan") throw new Error("expected plan");
    expect(plan.steps[0]?.state).toBe("error");
    const prose = items[1];
    if (prose.kind !== "prose") throw new Error("expected prose");
    expect(prose.text).toContain("credits refunded");
    expect(prose.text).toContain("try again");
  });

  it("replays imported ThinkForge history (user + prose) in original order", () => {
    const items = replayEventsToItems([
      ev(1, "user", { kind: "user", id: "tf_1", text: "write a launch script", attachments: [], mentions: [], importedFrom: "thinkforge" }),
      ev(2, "prose", { kind: "prose", id: "tf_2", text: "here is v1...", importedFrom: "thinkforge" }),
      ev(3, "user", { kind: "user", id: "tf_3", text: "punch up the hook", attachments: [], mentions: [] }),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "prose", "user"]);
    expect(items.map((i) => (i.kind === "user" || i.kind === "prose" ? i.text : ""))).toEqual([
      "write a launch script",
      "here is v1...",
      "punch up the hook",
    ]);
  });

  it("skips transient events (received / confirm / interrupted) and unknown kinds", () => {
    const items = replayEventsToItems([
      ev(1, "turn.received", { type: "turn.received", turnId: "t1", deliverableId: "p" }),
      ev(2, "turn.confirm_required", { type: "turn.confirm_required", turnId: "t1", kind: "spend", quote: null, publishTargets: [] }),
      ev(3, "turn.interrupted", { type: "turn.interrupted", turnId: "t1", reason: "user_cancel" }),
      ev(4, "mystery_future_kind", { anything: true }),
    ]);
    expect(items).toEqual([]);
  });

  it("persists a capability gap as the turn's answer (edit-gate: reload keeps the decline)", () => {
    const items = replayEventsToItems([
      ev(1, "user", { kind: "user", id: "u1", text: "cut this into a reel", attachments: [], mentions: [], createdAt: "2026-01-01T00:00:00Z" }),
      ev(2, "turn.received", { type: "turn.received", turnId: "t1", deliverableId: "p" }),
      ev(3, "turn.capability_gap", {
        type: "turn.capability_gap",
        turnId: "t1",
        reason: "Editing in the studio chat is coming soon.",
        alternative: { description: "The classic editor still works.", proposedSteps: [] },
      }),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "prose"]);
    const prose = items[1];
    if (prose.kind !== "prose") throw new Error("expected prose");
    expect(prose.text).toBe("Editing in the studio chat is coming soon. The classic editor still works.");
  });

  it("replays ideas", () => {
    const items = replayEventsToItems([
      ev(1, "turn.ideas", { type: "turn.ideas", turnId: "t1", ideas: [{ id: "i1", idea: "fit check" }] }),
    ]);
    expect(items[0]?.kind).toBe("ideas");
  });
});

describe("replayOpenConfirm — §3 reload reconstructs the approval gate", () => {
  const user = (seq: number, text = "make visuals") => ev(seq, "user", { kind: "user", id: `u${seq}`, text, attachments: [], mentions: [], createdAt: "2026-01-01T00:00:00Z" });
  const confirm = (seq: number, turnId = "t1", operationId?: string) =>
    ev(seq, "turn.confirm_required", { type: "turn.confirm_required", turnId, stepId: "s1", kind: "spend", quote: null, publishTargets: [], ...(operationId ? { operationId } : {}) });

  it("an unanswered gate at the end of the log is open, with its operation claim", () => {
    const open = replayOpenConfirm([user(1), confirm(2, "t1", "11111111-1111-4111-8111-111111111111")]);
    expect(open?.turnId).toBe("t1");
    expect(open?.kind).toBe("spend");
    expect(open?.operationId).toBe("11111111-1111-4111-8111-111111111111");
    expect(open?.originalText).toBe("make visuals");
  });

  it("a subsequent turn.received consumes the gate (the answer resumed the turn)", () => {
    const open = replayOpenConfirm([user(1), confirm(2), ev(3, "turn.received", { type: "turn.received", turnId: "t2", deliverableId: "p" })]);
    expect(open).toBeNull();
  });

  it("a later user message supersedes an earlier open gate", () => {
    const open = replayOpenConfirm([user(1), confirm(2), user(3, "never mind")]);
    expect(open).toBeNull();
  });

  it("the LAST gate wins when several exist, and a closed log yields null", () => {
    const open = replayOpenConfirm([user(1), confirm(2, "t1"), user(3), confirm(4, "t2")]);
    expect(open?.turnId).toBe("t2");
    expect(replayOpenConfirm([user(1)])).toBeNull();
    expect(replayOpenConfirm([])).toBeNull();
  });
});

describe("artifactsFromEvents — the reload path rebuilds the stage (plan §3)", () => {
  const art = (id: string, title: string) => ({ id, kind: "script", status: "done", title, sourceRef: { engine: "thinkforge", externalId: `x:${id}`, manualHref: null }, revisions: [], updatedAt: "2026-09-02T10:00:00Z", createdAt: "2026-09-02T10:00:00Z" });

  it("collects in-band artifactPayloads, last write per id wins, first-appearance order", () => {
    const events = [
      ev(1, "user", { kind: "user", id: "u1", text: "write it" }),
      ev(2, "turn.done", { type: "turn.done", turnId: "t1", summary: "one", artifactIds: ["a1"], artifactPayload: art("a1", "v1") }),
      ev(3, "turn.done", { type: "turn.done", turnId: "t2", summary: "two", artifactIds: ["a2"], artifactPayload: art("a2", "first") }),
      ev(4, "turn.done", { type: "turn.done", turnId: "t3", summary: "three", artifactIds: ["a1"], artifactPayload: art("a1", "v2 — revised") }),
    ];
    const artifacts = artifactsFromEvents(events);
    expect(artifacts.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(artifacts[0]?.title).toBe("v2 — revised");
    expect(artifacts[1]?.title).toBe("first");
  });

  it("events without payloads contribute nothing — an empty log is an empty stage, never a phantom", () => {
    expect(artifactsFromEvents([ev(1, "user", { kind: "user", id: "u1", text: "hi" }), ev(2, "turn.plan", { type: "turn.plan", turnId: "t1", planId: "p", summary: "s", steps: [] })])).toEqual([]);
    expect(artifactsFromEvents([])).toEqual([]);
  });
});
