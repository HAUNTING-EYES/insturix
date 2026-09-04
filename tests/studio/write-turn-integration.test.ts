import { describe, expect, it, vi } from "vitest";

/* THE MISSING TEST CLASS (reality check 2026-09-04): runWriteTurn driven
 * FOR REAL — only the ENGINE stream and its DB are stubbed. Every prior
 * test mocked the orchestrator itself, which is how a write path that
 * discarded the engine's answer, charged for it, and reported success
 * shipped behind a "Phase 4 exit met" claim. Never again. */

vi.mock("@/lib/thinkforge/services/chat-service", () => ({ processChat: vi.fn() }));
vi.mock("@/lib/thinkforge/services/db", () => ({
  getOrCreateSession: vi.fn(async () => ({ _id: "session_wt", projectMeta: {} })),
  setActiveGeneration: vi.fn(async () => true),
  getScript: vi.fn(async () => null),
  listScripts: vi.fn(async () => []),
}));
vi.mock("@/lib/thinkforge/context/brand-authoring-context", () => ({ createThinkForgeSessionBrandBinding: vi.fn() }));
vi.mock("@/lib/services/creditsMigrationService", () => ({ CreditsMigrationService: { ensureMigrated: vi.fn(async () => undefined) } }));
vi.mock("@/lib/editron/services/project-ownership", () => ({ resolveContextBillingOwner: vi.fn(() => null) }));
vi.mock("@/lib/services/org-wallet-flag", () => ({ isOrgWalletBillingEnabled: vi.fn(() => false) }));
vi.mock("@/lib/shared/brand-scope", () => ({
  listAuthorizedBrandScopes: vi.fn(async () => [{ brandId: "br_wt", brandName: "WT", acceptedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]),
  authorizeBrandScope: vi.fn(async () => ({ brandId: "br_wt", brandName: "WT" })),
}));

const refund = vi.fn(async () => undefined);

vi.mock("@/lib/services/creditsMiddleware", () => ({
  checkCredits: vi.fn(async () => ({
    allowed: true,
    deduct: async () => ({ transactionId: "tx_wt" }),
    refund,
  })),
}));

const sse = (frames: Array<{ event: string; data?: unknown }>) =>
  new Response(
    frames.map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data ?? {})}\n\n`).join(""),
    { status: 200 },
  ).body as ReadableStream<Uint8Array>;

const ctx = {
  userId: "user_wt",
  orgId: null,
  isOrgAdmin: false,
  deliverableTitle: "Reality check",
  brandId: "br_wt",
  thinkforgeSessionId: "session_wt",
} as Parameters<typeof import("@/lib/studio/orchestrator/write").runWriteTurn>[0];

async function collect(text: string) {
  const { runWriteTurn } = await import("@/lib/studio/orchestrator/write");
  const events: Array<Record<string, unknown>> = [];
  for await (const ev of runWriteTurn(ctx, text)) events.push(ev as unknown as Record<string, unknown>);
  return events;
}

describe("runWriteTurn — the REAL orchestrator against a stubbed engine", () => {
  it("the founder's bug: engine streams a doc, store lags — the in-band document still lands", async () => {
    const { processChat } = await import("@/lib/thinkforge/services/chat-service");
    vi.mocked(processChat).mockResolvedValueOnce(
      sse([
        { event: "token", data: { content: "A moat is " } },
        { event: "token", data: { content: "what compounding advantage defends." } },
        { event: "script_update", data: { script: { scriptId: "scr_real", title: "MOAT explainer", content: "A moat is what compounding advantage defends.", version: 2 } } },
        { event: "done", data: {} },
      ]),
    );
    const events = await collect("a video about what's MOAT in startups");
    const done = events.find((e) => e.type === "turn.done") as { summary?: string; artifactPayload?: { contentMarkdown?: string; title?: string } } | undefined;
    expect(done?.artifactPayload?.contentMarkdown).toContain("compounding advantage");
    expect(done?.artifactPayload?.title).toBe("MOAT explainer");
    expect(done?.summary).toContain("words");
    expect(refund).not.toHaveBeenCalled();
  });

  it("the engine ANSWERS but persists no doc — the real prose is delivered, never a fake draft", async () => {
    const { processChat } = await import("@/lib/thinkforge/services/chat-service");
    vi.mocked(processChat).mockResolvedValueOnce(
      sse([
        { event: "token", data: { content: "A moat in startups is durable competitive advantage — network effects, switching costs, or cost scale." } },
        { event: "done", data: {} },
      ]),
    );
    const events = await collect("what is a moat");
    const done = events.find((e) => e.type === "turn.done") as { summary?: string; artifactPayload?: unknown } | undefined;
    expect(done?.summary).toContain("durable competitive advantage");
    expect(done?.artifactPayload).toBeNull();
  });

  it("the 0-words turn: engine produces NOTHING — loud error, refund, no success", async () => {
    const { processChat } = await import("@/lib/thinkforge/services/chat-service");
    vi.mocked(processChat).mockResolvedValueOnce(sse([{ event: "done", data: {} }]));
    const events = await collect("a video about what's MOAT in startups");
    expect(events.some((e) => e.type === "turn.done")).toBe(false);
    const error = events.find((e) => e.type === "turn.error") as { message?: string; refundIssued?: boolean } | undefined;
    expect(error?.message).toContain("without producing anything");
    expect(error?.refundIssued).toBe(true);
    expect(refund).toHaveBeenCalled();
  });

  it("engine error frames carry .error — surfaced, not collapsed", async () => {
    const { processChat } = await import("@/lib/thinkforge/services/chat-service");
    vi.mocked(processChat).mockResolvedValueOnce(sse([{ event: "error", data: { error: "provider timeout mid-render" } }]));
    const events = await collect("write it");
    const error = events.find((e) => e.type === "turn.error") as { message?: string } | undefined;
    expect(error?.message).toContain("provider timeout mid-render");
  });

  it("asserts draft intent on a fresh ask — no unseeded classifier coin flip", async () => {
    const { processChat } = await import("@/lib/thinkforge/services/chat-service");
    vi.mocked(processChat).mockResolvedValueOnce(sse([{ event: "done", data: {} }]));
    await collect("a video about what's MOAT in startups");
    const call = vi.mocked(processChat).mock.calls[0]?.[0] as { intentContext?: { lastUserAction?: string; workspaceMode?: string } } | undefined;
    expect(call?.intentContext).toMatchObject({ workspaceMode: "script", lastUserAction: "initial_draft_claim" });
  });
});
