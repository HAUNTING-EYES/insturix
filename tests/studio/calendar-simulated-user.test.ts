import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* §12 calendar projection (simulated user): two honest layers — planned
 * (editorial pipeline, plannedDates on deliverables) and scheduled (the
 * delivery queue). Deleted rows vanish from the projection; other orgs'
 * rows never appear. */

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_cal";
process.env.STUDIO_REAL_TURNS = "1";
const canRun = Boolean(process.env.MONGODB_URI);

const sim = vi.hoisted(() => ({
  auth: { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => sim.auth }));

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

describe.skipIf(!canRun)("simulated user — §12 calendar projection", () => {
  let GET: typeof import("@/app/api/studio/calendar/route").GET;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/studio/calendar/route"));
    const { default: connectToDatabase } = await import("@/schemas/ConnectToDatabase");
    await connectToDatabase(); // models buffer until a connection opens — connect BEFORE seeding
    const CalosDeliverable = (await import("@/schemas/calos-deliverable")).default;
    const CalosScheduledPublish = (await import("@/schemas/calos-scheduled-publish")).default;
    await CalosDeliverable.create([
      {
        ownerUserId: "user_sim_1",
        orgId: "org_sim_1",
        brandId: "br_sim",
        editorialStatus: "idea",
        plannedDates: [inDays(3)],
        platform: "instagram",
        card: { title: "launch post" },
      },
      {
        ownerUserId: "user_sim_1",
        orgId: "org_sim_1",
        brandId: "br_sim",
        editorialStatus: "drafting",
        plannedDates: [inDays(5)],
        platform: "linkedin",
        card: { title: "deleted note" },
        deletedAt: new Date(), // deleted — out of every projection
      },
      {
        ownerUserId: "user_other",
        orgId: "org_OTHER",
        brandId: "br_sim",
        editorialStatus: "idea",
        plannedDates: [inDays(4)],
        platform: "tiktok",
        card: { title: "someone else's" },
      },
    ]);
    await CalosScheduledPublish.create({
      deliverableId: "del_sim_1",
      ownerUserId: "user_sim_1",
      orgId: "org_sim_1",
      brandId: "br_sim",
      platform: "instagram",
      approvalVersion: 1,
      idempotencyKey: "del_sim_1:instagram:v1",
      publishAt: inDays(2),
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
    });
  }, 30000); // first schema-model compile + connect in this file runs long

  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      for (const name of Object.keys(mongoose.connection.collections)) {
        await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
      }
      await mongoose.disconnect();
    }
  });

  it("returns both layers: planned pipeline + scheduled queue, nothing else", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scheduled: Array<{ platform: string; status: string }>;
      planned: Array<{ title: string; editorialStatus: string }>;
    };
    expect(body.scheduled).toHaveLength(1);
    expect(body.scheduled[0]).toMatchObject({ platform: "instagram", status: "pending" });
    expect(body.planned.map((p) => p.title)).toEqual(["launch post"]); // deleted + other-org rows absent
    expect(body.planned[0]?.editorialStatus).toBe("idea");
  });
});
