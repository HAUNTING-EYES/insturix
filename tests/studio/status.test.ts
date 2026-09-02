import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import mongoose from "mongoose";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
process.env.MONGODB_DB_NAME = "vibe_spine_test_status";

const canRun = Boolean(process.env.MONGODB_URI);
const run = crypto.randomUUID().slice(0, 8);

describe.skipIf(!canRun)("status — labels computed from real operation records (plan §6)", () => {
  afterAll(async () => {
    if (canRun && mongoose.connection.readyState === 1) {
      for (const name of Object.keys(mongoose.connection.collections)) {
        await mongoose.connection.collections[name]?.deleteMany({}).catch(() => undefined);
      }
      await mongoose.disconnect();
    }
  });

  it("priority: open decision > failure > running > done > planning", { timeout: 30000 }, async () => {
    const { getOrCreateProject, claimOperation, markOperation } = await import("@/lib/studio/persist/db");
    const { computeProjectStatus } = await import("@/lib/studio/persist/status");

    const id = `proj_st_${run}_prio`;
    await getOrCreateProject({ projectId: id, organizationId: "org_st", brandId: null, title: "priority project" });
    expect((await computeProjectStatus(id)).label).toBe("Planning"); // no records yet — honest default

    const opDone = crypto.randomUUID();
    await claimOperation(id, opDone, "write it", false);
    await markOperation(opDone, "done");
    expect((await computeProjectStatus(id)).label).toBe("Creating"); // finished work exists

    const opRun = crypto.randomUUID();
    await claimOperation(id, opRun, "design it", false);
    expect((await computeProjectStatus(id)).label).toBe("Creating · working"); // running outranks done

    const opErr = crypto.randomUUID();
    await claimOperation(id, opErr, "analyze it", false);
    await markOperation(opErr, "error", { error: "engine exploded mid-render" });
    expect((await computeProjectStatus(id))).toMatchObject({ attention: "failed", label: "Failed · engine exploded mid-render" }); // failure outranks running

    const opGate = crypto.randomUUID();
    await claimOperation(id, opGate, "ship it", false);
    await markOperation(opGate, "awaiting_confirmation", { turnId: "t9" });
    const gated = await computeProjectStatus(id);
    expect(gated).toMatchObject({ attention: "needs_you", phase: "reviewing" }); // the user outranks everything
    expect(gated.label).toContain("Needs you");
  });

  it("the Needs-you index lists only this org's gated projects", { timeout: 30000 }, async () => {
    const { getOrCreateProject, claimOperation, markOperation } = await import("@/lib/studio/persist/db");
    const { listNeedsYouProjects } = await import("@/lib/studio/persist/status");

    const mine = `proj_st_${run}_mine`;
    const other = `proj_st_${run}_other`;
    await getOrCreateProject({ projectId: mine, organizationId: "org_st", brandId: null, title: "gated — mine" });
    await getOrCreateProject({ projectId: other, organizationId: "org_OTHER", brandId: null, title: "gated — other org" });
    for (const id of [mine, other]) {
      const op = crypto.randomUUID();
      await claimOperation(id, op, "ship it", false);
      await markOperation(op, "awaiting_confirmation");
    }
    const quiet = `proj_st_${run}_quiet`;
    await getOrCreateProject({ projectId: quiet, organizationId: "org_st", brandId: null, title: "no gates" });

    const list = await listNeedsYouProjects("org_st");
    const ids = list.map((p) => p.projectId);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(other); // cross-org denial by construction
    expect(ids).not.toContain(quiet); // only open decisions enter the index
  });
});
