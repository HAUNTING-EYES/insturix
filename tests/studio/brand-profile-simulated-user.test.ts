import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* §17 Phase 9 (simulated user): a brand-scoped public profile — create via
 * the vault-scope-authorized route, read back, update idempotently; username
 * collisions refused; brands outside the caller's scope denied. Persistence
 * is the REAL Socialize collection; only auth + the brand vault are mocked. */

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_bp";
process.env.STUDIO_REAL_TURNS = "1";
const canRun = Boolean(process.env.MONGODB_URI);

const sim = vi.hoisted(() => ({
  auth: { userId: "user_sim_1", orgId: "org_sim_1", has: async () => false },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => sim.auth }));
/* the brand vault is an external service — the route's AUTHORITY is the
 * scope list it returns; persistence stays real */
vi.mock("@/lib/shared/brand-scope", () => ({
  listAuthorizedBrandScopes: async () => [{ brandId: "br_sim", brandName: "Sim Brand", acceptedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
}));

const BRAND = "br_sim";

const call = (method: "GET" | "PUT", body?: unknown) =>
  new Request(`http://local/api/studio/brands/${BRAND}/profile`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe.skipIf(!canRun)("simulated user — §17 Phase 9 brand public profile", () => {
  let GET: typeof import("@/app/api/studio/brands/[brandId]/profile/route").GET;
  let PUT: typeof import("@/app/api/studio/brands/[brandId]/profile/route").PUT;

  beforeAll(async () => {
    ({ GET, PUT } = await import("@/app/api/studio/brands/[brandId]/profile/route"));
    const { default: connectToDatabase } = await import("@/schemas/ConnectToDatabase");
    await connectToDatabase(); // models buffer until a connection opens — connect BEFORE seeding
    const Socialize = (await import("@/schemas/Socialize")).default;
    /* a username already owned by another profile */
    await Socialize.create({ clerkUserId: "user_other", brandId: "br_other", username: "taken-name", bio: "", status: "", accentColor: "gold", links: [], notifications: [] });
  }, 30000);

  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      for (const name of Object.keys(mongoose.connection.collections)) {
        await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
      }
      await mongoose.disconnect();
    }
  });

  it("starts empty, then create → read-back is exact (one doc, brand-owned)", async () => {
    const empty = await GET(call("GET"), { params: Promise.resolve({ brandId: BRAND }) });
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { profile: unknown }).profile).toBeNull();

    const created = await PUT(call("PUT", { username: "sim-brand", bio: "we ship launch content", status: "shipping", accentColor: "cyan" }), { params: Promise.resolve({ brandId: BRAND }) });
    expect(created.status).toBe(200);
    expect(((await created.json()) as { profile: { username: string } }).profile.username).toBe("sim-brand");

    const read = await GET(call("GET"), { params: Promise.resolve({ brandId: BRAND }) });
    const { profile } = (await read.json()) as { profile: { username: string; bio: string; accentColor: string } };
    expect(profile).toMatchObject({ username: "sim-brand", bio: "we ship launch content", accentColor: "cyan" });

    const Socialize = (await import("@/schemas/Socialize")).default;
    expect(await Socialize.countDocuments({ brandId: BRAND })).toBe(1);
  });

  it("update is an idempotent upsert on the SAME doc — no duplicates", async () => {
    const Socialize = (await import("@/schemas/Socialize")).default;
    const before = await Socialize.findOne({ brandId: BRAND });
    const res = await PUT(call("PUT", { bio: "updated bio" }), { params: Promise.resolve({ brandId: BRAND }) });
    expect(res.status).toBe(200);
    const after = await Socialize.findOne({ brandId: BRAND });
    expect(String(after?._id)).toBe(String(before?._id));
    expect(after?.bio).toBe("updated bio");
    expect(after?.username).toBe("sim-brand"); // omitted fields untouched
  });

  it("a username owned by another profile is refused (409, nothing clobbered)", async () => {
    const res = await PUT(call("PUT", { username: "taken-name" }), { params: Promise.resolve({ brandId: BRAND }) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("username_taken");
    const Socialize = (await import("@/schemas/Socialize")).default;
    expect((await Socialize.findOne({ username: "taken-name" }))?.brandId).toBe("br_other"); // owner unchanged
  });

  it("a brand outside the caller's vault scope is denied (403)", async () => {
    const res = await PUT(call("PUT", { username: "sneaky" }), { params: Promise.resolve({ brandId: "br_not_granted" }) });
    expect(res.status).toBe(403);
    const read = await GET(call("GET"), { params: Promise.resolve({ brandId: "br_not_granted" }) });
    expect(read.status).toBe(403);
  });

  it("an invalid username is refused with the rule (400)", async () => {
    const res = await PUT(call("PUT", { username: "Bad Name!" }), { params: Promise.resolve({ brandId: BRAND }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_username");
  });
});
