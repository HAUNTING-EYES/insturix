import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

/* spine integration tests run on a THROWAWAY logical db (vibe_spine_test) on
 * the project's own cluster, dropped afterwards — never the app database. */
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_db"; // per-file throwaway db — parallel test files never purge each other

const canRun = Boolean(process.env.MONGODB_URI);
const testRun = crypto.randomUUID().slice(0, 8);

/* Atlas test users may not hold dropDatabase — best-effort purge instead */
const purge = async () => {
  for (const name of Object.keys(mongoose.connection.collections)) {
    await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
  }
};

describe.skipIf(!canRun)("spine db — projects, events, operations, claims", () => {
  it("stamps the accepted Brand Vault revision on create and refreshes it on re-verify", { timeout: 30000 }, async () => {
    const { getOrCreateProject, getProject } = await import("@/lib/studio/persist/db");
    const id = `proj_rev_${crypto.randomUUID().slice(0, 8)}`;
    const created = await getOrCreateProject({ projectId: id, organizationId: null, brandId: "br_x", title: "T", acceptedBrandRevision: "rec_1" });
    expect(created.acceptedBrandRevision).toBe("rec_1");
    /* a later turn re-verified against a newer vault record -> stamp refreshes */
    await getOrCreateProject({ projectId: id, organizationId: null, brandId: "br_x", title: "T", acceptedBrandRevision: "rec_2" });
    const reread = await getProject(id);
    expect(reread?.acceptedBrandRevision).toBe("rec_2");
    /* creation WITHOUT a revision leaves the field null, never a guess */
    const bare = await getOrCreateProject({ projectId: `proj_rev_${crypto.randomUUID().slice(0, 8)}`, organizationId: null, brandId: null, title: "T" });
    expect(bare.acceptedBrandRevision).toBeNull();
  });

  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      await purge();
      await mongoose.disconnect();
    }
  });

  it("getOrCreateProject creates once and never renames an existing project", async () => {
    const { connectSpine, getOrCreateProject, getProject } = await import("@/lib/studio/persist/db");
    await connectSpine();
    const id = `proj_test_${testRun}_1`;
    const a = await getOrCreateProject({ projectId: id, organizationId: "org_test", brandId: null, title: "First title" });
    expect(a.projectId).toBe(id);
    const b = await getOrCreateProject({ projectId: id, organizationId: "org_test", brandId: null, title: "DIFFERENT" });
    expect(b.title).toBe("First title"); // $setOnInsert — an existing project keeps its identity
    const got = await getProject(id);
    expect(got?.organizationId).toBe("org_test");
  });

  it("appendTurnEvent: concurrent appends get unique, gap-free sequence numbers", async () => {
    const { appendTurnEvent } = await import("@/lib/studio/persist/db");
    const id = `proj_test_${testRun}_2`;
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => appendTurnEvent(id, { turnId: "t", actor: "user", kind: "user", payload: { i } })));
    expect(results.every(Boolean)).toBe(true);
    const seqs = results.map((r) => r?.seq).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // serverless instances can never interleave
    const { listEvents } = await import("@/lib/studio/persist/db");
    const tail = await listEvents(id, 8);
    expect(tail.map((e) => e.seq)).toEqual([9, 10]);
  });

  it("claimOperation: the idempotency state machine refuses doubles, resumes confirms", async () => {
    const { claimOperation, markOperation } = await import("@/lib/studio/persist/db");
    const id = `proj_test_${testRun}_3`;
    const op = `op_test_${testRun}_3`;
    expect(await claimOperation(id, op, "make a reel", false)).toEqual({ ok: true, resumed: false });
    expect(await claimOperation(id, op, "make a reel", false)).toEqual({ ok: false, reason: "in_flight", state: "running" }); // the double-charge refusal
    expect(await claimOperation(`proj_test_${testRun}_OTHER`, op, "make a reel", false)).toMatchObject({ ok: false }); // cross-project reuse refused
    await markOperation(op, "awaiting_confirmation", { turnId: "t1" });
    expect(await claimOperation(id, op, "make a reel", true)).toEqual({ ok: true, resumed: true }); // confirm answer resumes its own claim
    await markOperation(op, "done");
    expect(await claimOperation(id, op, "make a reel", true)).toEqual({ ok: false, reason: "already_done", state: "done" }); // completed work never re-runs
    await markOperation(op, "error", { error: "boom" });
    expect(await claimOperation(id, op, "make a reel", false)).toEqual({ ok: true, resumed: true }); // failed work may retry on the same id
  });

  it("claimTfImport: exactly-once even under a race, releasable for retry", async () => {
    const { claimTfImport, releaseTfImportClaim, getOrCreateProject } = await import("@/lib/studio/persist/db");
    const id = `proj_test_${testRun}_4`;
    await getOrCreateProject({ projectId: id, organizationId: "org_test", brandId: null, title: "t" }); // production always creates the project before claiming
    const raced = await Promise.all([claimTfImport(id), claimTfImport(id), claimTfImport(id)]);
    expect(raced.filter(Boolean)).toHaveLength(1); // one winner, two refusals
    await releaseTfImportClaim(id);
    expect(await claimTfImport(id)).toBe(true); // released → a later pass may retry
  });
});
