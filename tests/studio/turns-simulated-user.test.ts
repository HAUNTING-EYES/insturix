import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* THE SIMULATED USER (plan §20): a full turn → SSE stream → persisted log →
 * reload replay → duplicate-refusal cycle, driven through the real route
 * handlers with only auth and the engine orchestrators mocked. Throwaway db
 * (vibe_spine_test) on the project cluster, dropped afterwards. */

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_sim"; // per-file throwaway db — parallel test files never purge each other
process.env.STUDIO_REAL_TURNS = "1";
const canRun = Boolean(process.env.MONGODB_URI);

const sim = vi.hoisted(() => ({
  auth: { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => sim.auth }));

/* engines are mocked — this test proves the SPINE, not ThinkForge */
vi.mock("@/lib/studio/orchestrator/write", () => ({ runWriteTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/edit", () => ({ runEditTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/auto-edit", () => ({ runAutoEditTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/distribute", () => ({ runDistributeTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/design", () => ({ runDesignTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/analyze", () => ({ runAnalyzeTurn: vi.fn() }));

const parseSse = (raw: string): unknown[] =>
  raw.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));

const postTurn = (body: unknown) =>
  new Request("http://local/api/studio/turns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!canRun)("simulated user — one full turn, then reload, then a rejected retry", () => {
  let POST: typeof import("@/app/api/studio/turns/route").POST;
  let GET: typeof import("@/app/api/studio/threads/[threadId]/events/route").GET;
  let runWriteTurn: typeof import("@/lib/studio/orchestrator/write").runWriteTurn;
  const operationId = crypto.randomUUID();
  let projectId = "";

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/studio/turns/route"));
    ({ GET } = await import("@/app/api/studio/threads/[threadId]/events/route"));
    ({ runWriteTurn } = await import("@/lib/studio/orchestrator/write"));
    vi.mocked(runWriteTurn).mockImplementation(
      (async function* () {
        yield { type: "turn.received", turnId: "t_sim", deliverableId: "del_live" };
        yield { type: "turn.plan", turnId: "t_sim", planId: "p_sim", summary: "writing it", steps: [{ stepId: "s_sim", capability: "write", toolName: "thinkforge", label: "write script", riskLevel: "low" }] };
        yield { type: "step.start", turnId: "t_sim", stepId: "s_sim", toolName: "thinkforge" };
        yield { type: "step.done", turnId: "t_sim", stepId: "s_sim", receipt: { label: "script drafted", creditsConsumed: 5, artifactIds: [] } };
        yield { type: "turn.done", turnId: "t_sim", summary: "script ready", creditsConsumedTotal: 5, artifactIds: [] };
      }) as unknown as typeof runWriteTurn,
    );
  });

  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      for (const name of Object.keys(mongoose.connection.collections)) {
        await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined); // Atlas test users may not dropDatabase
      }
      await mongoose.disconnect();
    }
  });

  it("the turn streams AND lands in the persisted log with a minted project id", async () => {
    const res = await POST(postTurn({ deliverableId: "del_live", threadId: "th_live", text: "make a launch reel", mode: "direct", operationId }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSse(await res.text()) as { type: string; deliverableId?: string }[];
    const received = events.find((e) => e.type === "turn.received");
    expect(received?.deliverableId).toMatch(/^proj_/); // the client adopts the minted identity
    projectId = received!.deliverableId!;
    expect(events.map((e) => e.type)).toEqual(["turn.received", "turn.plan", "step.start", "step.done", "turn.done"]);
  });

  it("a reload (GET events + replay) reconstructs the identical conversation", async () => {
    const { replayEventsToItems } = await import("@/lib/studio/persist/replay");
    const res = await GET(new Request(`http://local/api/studio/threads/${projectId}/events`), { params: Promise.resolve({ threadId: projectId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projectId: string; title?: string; brandId?: string | null; events: { seq: number; kind: string }[]; cursor: number };
    expect(body.projectId).toBe(projectId);
    expect(typeof body.title).toBe("string"); // feeds the crumb + workspace banner
    expect(body.brandId === null || typeof body.brandId === "string").toBe(true);
    expect(body.events.map((e) => e.kind)).toEqual(["user", "turn.received", "turn.plan", "step.start", "step.done", "turn.done"]); // user message persisted FIRST
    expect(body.cursor).toBe(6);
    const items = replayEventsToItems((body as unknown as { events: Parameters<typeof replayEventsToItems>[0] }).events);
    expect(items.map((i) => i.kind)).toEqual(["user", "plan", "receipt", "prose", "quick_replies"]);
    const user = items[0];
    if (user.kind !== "user") throw new Error("expected user item");
    expect(user.text).toBe("make a launch reel");
  });

  it("the SAME operationId can never run twice (409 already_done)", async () => {
    const res = await POST(postTurn({ deliverableId: projectId, threadId: `th_${projectId}`, text: "make a launch reel", mode: "direct", operationId }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("operation_already_done");
  });

  it("another organization cannot read the project (403)", async () => {
    sim.auth = { userId: "user_sim_2", orgId: "org_OTHER", has: async () => false };
    const res = await GET(new Request(`http://local/api/studio/threads/${projectId}/events`), { params: Promise.resolve({ threadId: projectId }) });
    expect(res.status).toBe(403);
  });

  it("real turns stay gated when the flag is off (503)", async () => {
    const flag = process.env.STUDIO_REAL_TURNS;
    process.env.STUDIO_REAL_TURNS = "";
    try {
      const res = await POST(postTurn({ deliverableId: "del_live", threadId: "th_live", text: "x", mode: "direct", operationId: crypto.randomUUID() }));
      expect(res.status).toBe(503);
    } finally {
      process.env.STUDIO_REAL_TURNS = flag;
    }
  });
});
