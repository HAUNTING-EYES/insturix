import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* §12 proposal review (simulated user): accept writes EXACTLY that entry as
 * an idea-stage CalOS deliverable via CalOS's single draft write path;
 * remove writes nothing; both are idempotent per entry; org-scoped. */

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_plan";
process.env.STUDIO_REAL_TURNS = "1";
const canRun = Boolean(process.env.MONGODB_URI);

const sim = vi.hoisted(() => ({
  auth: { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => sim.auth }));

const PROJECT = "proj_plan_sim";
const ART = "art_plan_sim";

const postEntry = (body: unknown) =>
  new Request(`http://local/api/studio/artifacts/${ART}/plan-entry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe.skipIf(!canRun)("simulated user — §12 plan entry review", () => {
  let POST: typeof import("@/app/api/studio/artifacts/[artifactId]/plan-entry/route").POST;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/studio/artifacts/[artifactId]/plan-entry/route"));
    const { connectSpine, getOrCreateProject, appendTurnEvent } = await import("@/lib/studio/persist/db");
    await connectSpine();
    await getOrCreateProject({ projectId: PROJECT, organizationId: "org_sim_1", brandId: "br_sim", title: "Plan sim" });
    const now = new Date().toISOString();
    await appendTurnEvent(PROJECT, {
      actor: "system",
      kind: "turn.done",
      turnId: "t1",
      payload: {
        type: "turn.done",
        turnId: "t1",
        summary: "planned",
        artifactIds: [ART],
        artifactPayload: {
          id: ART,
          kind: "plan",
          status: "done",
          title: "Week plan",
          sourceRef: { engine: "calos", externalId: "t1", manualHref: null },
          planEntries: [
            { id: "pe_1", platform: "instagram", scheduledAt: "2026-09-07T09:00:00.000Z", title: "launch post" },
            { id: "pe_2", platform: "linkedin", scheduledAt: "2026-09-09T12:00:00.000Z", title: "founder note" },
          ],
          revisions: [],
          updatedAt: now,
          createdAt: now,
        },
      },
    });
  });

  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      for (const name of Object.keys(mongoose.connection.collections)) {
        await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
      }
      await mongoose.disconnect();
    }
  });

  it("accepting one entry writes EXACTLY one idea-stage CalOS deliverable", async () => {
    const CalosDeliverable = (await import("@/schemas/calos-deliverable")).default;
    const res = await POST(postEntry({ projectId: PROJECT, entryId: "pe_1", action: "accept" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deliverablesCreated: number })).toMatchObject({ deliverablesCreated: 1 });
    const docs = await CalosDeliverable.find({ brandId: "br_sim" }) as Array<{ editorialStatus?: string; plannedDates?: string[] }>;
    expect(docs).toHaveLength(1);
    expect(docs[0]?.editorialStatus).toBe("idea"); // a content item, NOT a scheduled publish
    expect(String(docs[0]?.plannedDates?.[0])).toContain("2026-09-07");
  });

  it("re-acting on a decided entry is a no-op — never a second deliverable", async () => {
    const CalosDeliverable = (await import("@/schemas/calos-deliverable")).default;
    const res = await POST(postEntry({ projectId: PROJECT, entryId: "pe_1", action: "remove" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { alreadyDecided: boolean })).toMatchObject({ alreadyDecided: true });
    expect(await CalosDeliverable.countDocuments({ brandId: "br_sim" })).toBe(1); // accept stands
  });

  it("removing the other entry writes NOTHING to CalOS", async () => {
    const CalosDeliverable = (await import("@/schemas/calos-deliverable")).default;
    const res = await POST(postEntry({ projectId: PROJECT, entryId: "pe_2", action: "remove" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deliverablesCreated: number; state: string })).toMatchObject({ deliverablesCreated: 0, state: "remove" });
    expect(await CalosDeliverable.countDocuments({ brandId: "br_sim" })).toBe(1); // still only the accepted one
    /* reload shows the decisions (§3) */
    const { listEvents } = await import("@/lib/studio/persist/db");
    const { artifactsFromEvents } = await import("@/lib/studio/persist/replay");
    const entries = artifactsFromEvents(await listEvents(PROJECT, 0)).find((a) => a.id === ART)?.planEntries ?? [];
    expect(entries[0]).toMatchObject({ id: "pe_1", accepted: true });
    expect(entries[1]).toMatchObject({ id: "pe_2", removed: true });
  });

  it("another organization cannot act on this plan (403)", async () => {
    sim.auth = { userId: "user_sim_2", orgId: "org_OTHER", has: async () => false };
    const res = await POST(postEntry({ projectId: PROJECT, entryId: "pe_2", action: "accept" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(403);
    sim.auth = { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false };
  });

  it("an entry that is not on the plan is refused (404)", async () => {
    const res = await POST(postEntry({ projectId: PROJECT, entryId: "pe_ghost", action: "accept" }), { params: Promise.resolve({ artifactId: ART }) });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("entry_not_in_plan");
  });
});
