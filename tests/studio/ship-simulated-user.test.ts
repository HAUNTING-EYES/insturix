import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* §13 "ship this now" (simulated user): the approval card → the answer
 * approves through CalOS's decision route (publishNow) → the queue row is
 * the receipt. Only the HTTP bridge is stubbed (it plays the decision
 * route's transactional side-effect: approval + enqueue in one step). */

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_ship";
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
vi.mock("@/lib/studio/orchestrator/storyboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio/orchestrator/storyboard")>()), // storyboardTurnIntent is real routing
  runStoryboardTurn: vi.fn(),
}));

const PROJECT = "proj_ship_sim";
const DELIV = new mongoose.Types.ObjectId();
const CARD_ID = `card_${Date.now()}_sim${crypto.randomUUID().slice(0, 6)}`;
const decisionCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

const postTurn = (body: unknown) =>
  new Request("http://local/api/studio/turns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const parseSse = (raw: string) =>
  raw.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));

describe.skipIf(!canRun)("simulated user — §13 ship this now", () => {
  let POST: typeof import("@/app/api/studio/turns/route").POST;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/studio/turns/route"));
    const { connectSpine, getOrCreateProject, appendTurnEvent } = await import("@/lib/studio/persist/db");
    const CalosDeliverable = (await import("@/schemas/calos-deliverable")).default;
    const CalosScheduledPublish = (await import("@/schemas/calos-scheduled-publish")).default;
    const { shipTurnIntent } = await import("@/lib/studio/orchestrator/ship");

    expect(shipTurnIntent("ship it")).toBe(true);
    expect(shipTurnIntent("ship this now")).toBe(true);
    expect(shipTurnIntent("post it now")).toBe(true);
    expect(shipTurnIntent("plan my week")).toBe(false);

    await connectSpine();
    await getOrCreateProject({ projectId: PROJECT, organizationId: "org_sim_1", brandId: "br_sim", title: "Ship sim" });
    await appendTurnEvent(PROJECT, { actor: "user", kind: "plan.entry", turnId: null, payload: { type: "plan.entry", artifactId: "a", entryId: "e1", action: "accept", deliverablesCreated: 1, deliverableIds: [String(DELIV)] } });
    /* production shape: card.id is its own namespace (card_<ts>_<rand>),
     * NOT the Mongo _id — the audit caught the old seeding masking that */
    await CalosDeliverable.create({ _id: DELIV, ownerUserId: "user_sim_1", orgId: "org_sim_1", brandId: "br_sim", editorialStatus: "in_review", plannedDates: [new Date(Date.now() + 86_400_000)], platform: "instagram", card: { title: "launch post", id: CARD_ID } });

    /* the bridge stub: plays the decision route — records the call and does
     * its transactional side-effect (approve + enqueue publishNow) */
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("/decision")) return new Response("{}", { status: 404 });
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      decisionCalls.push({ url, body });
      await CalosDeliverable.updateOne({ _id: DELIV }, { editorialStatus: "approved" });
      await CalosScheduledPublish.create({
        deliverableId: CARD_ID, ownerUserId: "user_sim_1", orgId: "org_sim_1", brandId: "br_sim",
        platform: "instagram", approvalVersion: 1, idempotencyKey: `${DELIV}:instagram:v1:now`,
        publishAt: new Date(), status: "pending", attempts: 0, maxAttempts: 3,
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
  });

  afterEach(() => {
    decisionCalls.length = 0;
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

  it("gate first: unapproved content presents the publish card, nothing enqueued", async () => {
    const res = await POST(postTurn({ deliverableId: PROJECT, threadId: `th_${PROJECT}`, text: "ship it", mode: "direct", operationId: crypto.randomUUID() }));
    expect(res.status).toBe(200);
    const events = parseSse(await res.text()) as Array<{ type: string; kind?: string; publishTargets?: unknown[] }>;
    const gate = events.find((e) => e.type === "turn.confirm_required");
    expect(gate?.kind).toBe("publish");
    expect(gate?.publishTargets).toHaveLength(1);
    expect(decisionCalls).toHaveLength(0); // nothing shipped without the yes
  });

  it("the yes approves through CalOS's decision route with publishNow — receipt lands in the thread", async () => {
    const res = await POST(postTurn({ deliverableId: PROJECT, threadId: `th_${PROJECT}`, text: "ship it", mode: "direct", operationId: crypto.randomUUID(), confirmAccepted: true }));
    expect(res.status).toBe(200);
    const events = parseSse(await res.text()) as Array<{ type: string; artifactIds?: string[]; summary?: string }>;
    expect(decisionCalls).toHaveLength(1);
    expect(decisionCalls[0]?.url).toContain(`/api/services/calos/deliverables/${CARD_ID}/decision`); // the card.id namespace
    expect(decisionCalls[0]?.body).toMatchObject({ decision: "approved", publishNow: true, brandId: "br_sim" });
    const done = events.find((e) => e.type === "turn.done");
    expect(done?.summary).toContain("Shipped");
    expect(done?.summary).toContain("instagram: queued");
    expect(done?.artifactIds?.length).toBeGreaterThan(0);

    /* the receipt survives reload (§3) — a post artifact rebuilt from the log */
    const { listEvents } = await import("@/lib/studio/persist/db");
    const { artifactsFromEvents } = await import("@/lib/studio/persist/replay");
    const rebuilt = artifactsFromEvents(await listEvents(PROJECT, 0));
    expect(rebuilt.some((a) => a.kind === "post")).toBe(true);
  });

  it("§13 diagnostics: why-failed reads the rows; retry resets CLEAN failures, refuses ambiguous ones", async () => {
    const CalosScheduledPublish = (await import("@/schemas/calos-scheduled-publish")).default;

    /* a clean provider failure */
    await CalosScheduledPublish.updateOne({ deliverableId: CARD_ID }, { $set: { status: "failed", lastError: "instagram container expired", attempts: 1 } });

    const why = await POST(postTurn({ deliverableId: PROJECT, threadId: `th_${PROJECT}`, text: "why did instagram fail?", mode: "direct", operationId: crypto.randomUUID() }));
    expect(why.status).toBe(200);
    const whyEvents = parseSse(await why.text()) as Array<{ type: string; summary?: string; reason?: string; message?: string }>;
    expect(whyEvents.find((e) => e.type === "turn.done")?.summary).toContain("instagram: failed after 1/3");

    /* deliberate retry: clean failure re-queues for now */
    const retry = await POST(postTurn({ deliverableId: PROJECT, threadId: `th_${PROJECT}`, text: "retry instagram", mode: "direct", operationId: crypto.randomUUID() }));
    expect(retry.status).toBe(200);
    const retryEvents = parseSse(await retry.text()) as Array<{ type: string; summary?: string }>;
    expect(retryEvents.find((e) => e.type === "turn.done")?.summary).toContain("Retrying instagram");

    const afterClean = (await CalosScheduledPublish.findOne({ deliverableId: CARD_ID }).lean()) as unknown as { status?: string; lastError?: string | null };
    expect(afterClean.status).toBe("pending");
    expect(afterClean.lastError).toBeNull();

    /* ambiguous failure: the provider may already have posted — refusal, no reset */
    await CalosScheduledPublish.updateOne({ deliverableId: CARD_ID }, { $set: { status: "failed", lastError: "ambiguous outcome — check the platform" } });
    const retryAmbiguous = await POST(postTurn({ deliverableId: PROJECT, threadId: `th_${PROJECT}`, text: "retry instagram", mode: "direct", operationId: crypto.randomUUID() }));
    const ambEvents = parseSse(await retryAmbiguous.text()) as Array<{ type: string; summary?: string }>;
    expect(ambEvents.find((e) => e.type === "turn.done")?.summary).toContain("unclear");
    const afterAmbiguous = (await CalosScheduledPublish.findOne({ deliverableId: CARD_ID }).lean()) as unknown as { status?: string };
    expect(afterAmbiguous.status).toBe("failed"); // untouched — never auto-retried

    /* audit 6b: the STRUCTURED flag alone refuses a retry — no prose needed */
    await CalosScheduledPublish.updateOne({ deliverableId: CARD_ID }, { $set: { status: "failed", lastError: "connection reset", outcomeAmbiguous: true } });
    const retryFlagged = await POST(postTurn({ deliverableId: PROJECT, threadId: `th_${PROJECT}`, text: "retry instagram", mode: "direct", operationId: crypto.randomUUID() }));
    const flagEvents = parseSse(await retryFlagged.text()) as Array<{ type: string; summary?: string }>;
    expect(flagEvents.find((e) => e.type === "turn.done")?.summary).toContain("unclear");
    const afterFlag = (await CalosScheduledPublish.findOne({ deliverableId: CARD_ID }).lean()) as unknown as { status?: string };
    expect(afterFlag.status).toBe("failed"); // flag refuses, even with clean prose
  });
});
