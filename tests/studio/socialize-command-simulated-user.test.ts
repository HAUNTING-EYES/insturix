import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* §17 Phase 9 low-risk command (simulated user): "set my status to …" from
 * the project conversation lands on the brand's public profile. Auth is the
 * brand vault scope; a brand without a public page gets the honest
 * claim-a-username answer instead of a half-profile. */

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_soc";
process.env.STUDIO_REAL_TURNS = "1";
const canRun = Boolean(process.env.MONGODB_URI);

const sim = vi.hoisted(() => ({
  auth: { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => sim.auth }));
vi.mock("@/lib/shared/brand-scope", () => ({
  listAuthorizedBrandScopes: async () => [{ brandId: "br_sim", brandName: "Sim Brand", acceptedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
}));

const PROJECT = "proj_soc_sim";

const postTurn = (text: string, brandId?: string) =>
  new Request("http://local/api/studio/turns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deliverableId: PROJECT, threadId: `th_${PROJECT}`, text, mode: "direct", operationId: crypto.randomUUID(), ...(brandId ? { brandId } : {}) }),
  });
const parseSse = (raw: string) =>
  raw.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));

describe.skipIf(!canRun)("simulated user — §17 Phase 9 status command", () => {
  let POST: typeof import("@/app/api/studio/turns/route").POST;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/studio/turns/route"));
    const { connectSpine, getOrCreateProject } = await import("@/lib/studio/persist/db");
    const { default: connectToDatabase } = await import("@/schemas/ConnectToDatabase");
    const Socialize = (await import("@/schemas/Socialize")).default;
    const { socializeCommandIntent } = await import("@/lib/studio/orchestrator/socialize");

    expect(socializeCommandIntent("set my status to shipping")).toBe(true);
    expect(socializeCommandIntent("update the bio to launch content weekly")).toBe(true);
    expect(socializeCommandIntent("write a launch email")).toBe(false);

    await connectSpine();
    await connectToDatabase(); // socialize models buffer until a connection opens
    await getOrCreateProject({ projectId: PROJECT, organizationId: "org_sim_1", brandId: "br_sim", title: "Socialize sim" });
    await Socialize.create({ clerkUserId: "user_sim_1", brandId: "br_sim", username: "sim-brand", bio: "", status: "", accentColor: "gold", links: [], notifications: [] });
  }, 30000);

  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      for (const name of Object.keys(mongoose.connection.collections)) {
        await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
      }
      await mongoose.disconnect();
    }
  });

  it('"set my status to …" lands on the brand profile and says where it lives', async () => {
    const res = await POST(postTurn("set my status to shipping"));
    expect(res.status).toBe(200);
    const events = parseSse(await res.text()) as Array<{ type: string; summary?: string }>;
    const done = events.find((e) => e.type === "turn.done");
    expect(done?.summary).toContain("Status live on /profile/sim-brand");

    const Socialize = (await import("@/schemas/Socialize")).default;
    const doc = (await Socialize.findOne({ brandId: "br_sim" }).lean()) as unknown as { status?: string };
    expect(doc.status).toBe("shipping");
  });

  it("bio updates truncate to the field limit and persist", async () => {
    const long = "x".repeat(300);
    const res = await POST(postTurn(`update the bio to ${long}`));
    expect(res.status).toBe(200);
    const events = parseSse(await res.text()) as Array<{ type: string; summary?: string }>;
    expect(events.find((e) => e.type === "turn.done")?.summary).toContain("Bio live on /profile/sim-brand");
    const Socialize = (await import("@/schemas/Socialize")).default;
    const doc = (await Socialize.findOne({ brandId: "br_sim" }).lean()) as unknown as { bio?: string };
    expect(doc.bio).toHaveLength(256);
  });

  it("a value-less ask explains the shape instead of writing", async () => {
    const res = await POST(postTurn("set my status"));
    expect(res.status).toBe(200);
    const events = parseSse(await res.text()) as Array<{ type: string; summary?: string }>;
    expect(events.find((e) => e.type === "turn.done")?.summary).toContain('et my status to shipping');
    const Socialize = (await import("@/schemas/Socialize")).default;
    const doc = (await Socialize.findOne({ brandId: "br_sim" }).lean()) as unknown as { status?: string };
    expect(doc.status).toBe("shipping"); // unchanged
  });
});
