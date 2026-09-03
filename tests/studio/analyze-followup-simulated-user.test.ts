import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* §14 same-conversation report questions (simulated user): the answer comes
 * from the report-bound chat endpoint (grounded in its transcription +
 * results), only for a COMPLETED task; action asks never misroute here. */

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_azchat";
process.env.STUDIO_REAL_TURNS = "1";
const canRun = Boolean(process.env.MONGODB_URI);

const sim = vi.hoisted(() => ({
  auth: { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => sim.auth }));
vi.mock("@/lib/studio/orchestrator/write", () => ({ runWriteTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/distribute", () => ({ runDistributeTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/design", () => ({ runDesignTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/analyze", () => ({ runAnalyzeTurn: vi.fn() }));
vi.mock("@/lib/studio/orchestrator/ship", () => ({ runShipTurn: vi.fn(), shipTurnIntent: vi.fn(() => false) }));
vi.mock("@/lib/studio/orchestrator/delivery-status", () => ({ runDeliveryStatusTurn: vi.fn(), deliveryStatusIntent: vi.fn(() => false) }));
vi.mock("@/lib/studio/orchestrator/storyboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio/orchestrator/storyboard")>()),
  runStoryboardTurn: vi.fn(),
}));

const PROJECT = "proj_az_sim";
const TASK = "az_task_1";
const chatCalls: Array<Record<string, unknown>> = [];

const postTurn = (text: string) =>
  new Request("http://local/api/studio/turns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deliverableId: PROJECT, threadId: `th_${PROJECT}`, text, mode: "direct", operationId: crypto.randomUUID() }),
  });
const parseSse = (raw: string) =>
  raw.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));

describe.skipIf(!canRun)("simulated user — §14 report follow-up questions", () => {
  let POST: typeof import("@/app/api/studio/turns/route").POST;
  let runWriteTurn: typeof import("@/lib/studio/orchestrator/write").runWriteTurn;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/studio/turns/route"));
    ({ runWriteTurn } = await import("@/lib/studio/orchestrator/write"));
    const { connectSpine, getOrCreateProject, appendTurnEvent } = await import("@/lib/studio/persist/db");
    const { analysisFollowupIntent } = await import("@/lib/studio/orchestrator/analyze-followup");

    /* intent: questions yes, action asks never */
    expect(analysisFollowupIntent("why is the hook weak?")).toBe(true);
    expect(analysisFollowupIntent("what does it say about pacing?")).toBe(true);
    expect(analysisFollowupIntent("can you write me a script?")).toBe(false);
    expect(analysisFollowupIntent("make a thumbnail please")).toBe(false);

    await connectSpine();
    await getOrCreateProject({ projectId: PROJECT, organizationId: "org_sim_1", brandId: "br_sim", title: "AZ sim" });
    const now = new Date().toISOString();
    await appendTurnEvent(PROJECT, {
      actor: "system",
      kind: "turn.done",
      turnId: "t_az",
      payload: {
        type: "turn.done",
        turnId: "t_az",
        summary: "teardown queued",
        artifactIds: [`art_az_${TASK}`],
        artifactPayload: {
          id: `art_az_${TASK}`,
          kind: "analysis",
          status: "running",
          title: "Analysis",
          sourceRef: { engine: "alyzitron", externalId: TASK, manualHref: `/dashboard/alyzitron/report/${TASK}` },
          revisions: [],
          updatedAt: now,
          createdAt: now,
        },
      },
    });

    const sse = (frames: Array<Record<string, unknown>>) =>
      new Response(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`/analyses/${TASK}`)) return new Response(JSON.stringify({ status: "completed", id: TASK, results: { overall: 87 }, videoTitle: "competitor reel" }), { status: 200 });
      if (url.includes("/alyzitron/chat")) {
        chatCalls.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return sse([
          { type: "chunk", text: "The hook loses 40% in the first " },
          { type: "chunk", text: "two seconds because the claim arrives after the visual." },
          { type: "done" },
        ]);
      }
      return new Response("{}", { status: 404 });
    }));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (canRun && mongoose.connection.readyState === 1) {
      for (const name of Object.keys(mongoose.connection.collections)) {
        await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
      }
      await mongoose.disconnect();
    }
  });

  it("a question routes to the report chat and the answer lands in the thread", async () => {
    const res = await POST(postTurn("why is the hook weak?"));
    expect(res.status).toBe(200);
    const events = parseSse(await res.text()) as Array<{ type: string; summary?: string }>;
    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0]).toMatchObject({ taskId: TASK, message: "why is the hook weak?", videoAnalysis: { overall: 87 }, videoTitle: "competitor reel" }); // grounded in the full report
    const done = events.find((e) => e.type === "turn.done");
    expect(done?.summary).toContain("hook loses 40%");
  });

  it("an action ask still routes to WRITE even in a project with an analysis", async () => {
    await POST(postTurn("can you write me a script?"));
    expect(vi.mocked(runWriteTurn)).toHaveBeenCalled();
  });
});
